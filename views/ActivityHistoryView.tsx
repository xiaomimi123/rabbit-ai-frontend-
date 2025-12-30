import React, { useState, useEffect } from 'react';
import { ArrowLeft, Gift, Handshake, CreditCard, Clock, CheckCircle2, X, ArrowUpRight } from 'lucide-react';
import { UserStats } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { getWithdrawHistory, getClaimsHistory, getReferralHistory } from '../api';
import { shortenAddress } from '../services/web3Service';
import { ENERGY_PER_USDT_WITHDRAW } from '../constants';

interface ActivityHistoryViewProps {
  stats: UserStats;
  onBack: () => void;
}

type ActivityType = 'all' | 'airdrop' | 'invite' | 'withdraw';

const ActivityHistoryView: React.FC<ActivityHistoryViewProps> = ({ stats, onBack }) => {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<ActivityType>('all');
  const [timelineHistory, setTimelineHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTimelineHistory();
  }, [stats.address]);

  const loadTimelineHistory = async () => {
    try {
      if (!stats.address || !stats.address.startsWith('0x')) {
        setTimelineHistory([]);
        return;
      }

      setIsLoading(true);

      // 并行获取所有历史记录
      const [withdrawals, claims, referrals] = await Promise.all([
        getWithdrawHistory(stats.address).catch((err) => {
          console.warn('[ActivityHistoryView] Failed to load withdraw history:', err);
          return [];
        }),
        getClaimsHistory(stats.address).catch((err) => {
          console.warn('[ActivityHistoryView] Failed to load claims history:', err);
          return [];
        }),
        getReferralHistory(stats.address).catch((err) => {
          console.warn('[ActivityHistoryView] Failed to load referral history:', err);
          return [];
        }),
      ]);

      // 合并并格式化记录
      const timeline: any[] = [];

      // 1. 空投领取记录
      if (Array.isArray(claims) && claims.length > 0) {
        claims.forEach((claim: any) => {
          const amount = parseFloat(claim.amount || '0');
          const energy = Number(claim.energy || 1);
          const createdAt = claim.createdAt || claim.time || new Date().toISOString();
          
          timeline.push({
            type: 'airdrop',
            icon: '✅',
            title: t('profile.airdropClaim') || '空投领取',
            description: `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} RAT`,
            energy: `+${energy} ${t('profile.energy') || '能量'}`,
            time: createdAt,
            timestamp: new Date(createdAt).getTime(),
            txHash: claim.txHash || claim.tx_hash,
            amount: amount.toLocaleString(undefined, { maximumFractionDigits: 2 }),
            currency: 'RAT',
            energyChange: energy,
          });
        });
      }

      // 2. 邀请记录（包括每次下级领取的能量奖励）
      if (Array.isArray(referrals) && referrals.length > 0) {
        referrals.forEach((ref: any) => {
          const energy = Number(ref.energy || 1);
          const createdAt = ref.createdAt || ref.time || new Date().toISOString();
          const rewardAmount = parseFloat(ref.rewardAmount || '0');
          const isFirstClaim = ref.isFirstClaim !== false;
          
          timeline.push({
            type: 'invite',
            icon: '🤝',
            title: t('profile.networkReward') || '网络奖励',
            description: isFirstClaim 
              ? `${shortenAddress(ref.address || '')} ${t('profile.firstClaim') || '首次领取'}`
              : `${shortenAddress(ref.address || '')} ${t('profile.downstreamClaim') || '下级领取'}`,
            energy: `+${energy} ${t('profile.energy') || '能量'}`,
            time: createdAt,
            timestamp: new Date(createdAt).getTime(),
            address: ref.address,
            amount: rewardAmount.toFixed(2),
            currency: 'RAT',
            energyChange: energy,
          });
        });
      }

      // 3. 提现记录
      if (Array.isArray(withdrawals) && withdrawals.length > 0) {
        withdrawals.forEach((withdraw: any) => {
          const amount = parseFloat(withdraw.amount || '0');
          const energyCost = Math.ceil(amount * ENERGY_PER_USDT_WITHDRAW);
          const createdAt = withdraw.time || withdraw.createdAt || new Date().toISOString();
          
          const isCompleted = withdraw.status === 'Completed' || withdraw.status === 'Approved';
          timeline.push({
            type: 'withdraw',
            icon: '💸',
            title: isCompleted 
              ? (t('profile.withdrawSuccess') || '提现到账') 
              : (t('profile.liquidityWithdraw') || '提取收益'),
            description: `${amount.toFixed(2)} USDT`,
            energy: `${energyCost} ${t('profile.energy') || '能量'}`,
            time: createdAt,
            timestamp: new Date(createdAt).getTime(),
            status: withdraw.status || 'Pending',
            id: withdraw.id,
            amount: amount.toFixed(2),
            currency: 'USDT',
            energyChange: -energyCost,
            isCompleted,
          });
        });
      }

      // 按时间倒序排序（最新的在前）
      timeline.sort((a, b) => b.timestamp - a.timestamp);

      setTimelineHistory(timeline);
    } catch (e) {
      console.error('Error loading timeline history:', e);
      setTimelineHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 根据筛选条件过滤记录
  const filteredHistory = activeFilter === 'all' 
    ? timelineHistory 
    : timelineHistory.filter(item => item.type === activeFilter);

  // 统计各类型数量
  const counts = {
    all: timelineHistory.length,
    airdrop: timelineHistory.filter(item => item.type === 'airdrop').length,
    invite: timelineHistory.filter(item => item.type === 'invite').length,
    withdraw: timelineHistory.filter(item => item.type === 'withdraw').length,
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Header */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={onBack}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h2 className="text-lg font-black uppercase tracking-widest text-white">
          {t('profile.activityLedger') || '活动记录'}
        </h2>
      </div>

      {/* Filter Tabs */}
      <div className="bg-[#1e2329]/40 border border-white/5 rounded-2xl p-1 flex gap-1">
        <button
          onClick={() => setActiveFilter('all')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeFilter === 'all'
              ? 'bg-[#FCD535] text-[#0b0e11]'
              : 'text-[#848E9C] hover:text-white'
          }`}
        >
          全部 ({counts.all})
        </button>
        <button
          onClick={() => setActiveFilter('airdrop')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeFilter === 'airdrop'
              ? 'bg-[#FCD535] text-[#0b0e11]'
              : 'text-[#848E9C] hover:text-white'
          }`}
        >
          {t('profile.airdropClaim') || '空投领取'} ({counts.airdrop})
        </button>
        <button
          onClick={() => setActiveFilter('invite')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeFilter === 'invite'
              ? 'bg-[#FCD535] text-[#0b0e11]'
              : 'text-[#848E9C] hover:text-white'
          }`}
        >
          {t('profile.networkReward') || '网络奖励'} ({counts.invite})
        </button>
        <button
          onClick={() => setActiveFilter('withdraw')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeFilter === 'withdraw'
              ? 'bg-[#FCD535] text-[#0b0e11]'
              : 'text-[#848E9C] hover:text-white'
          }`}
        >
          {t('profile.liquidityWithdraw') || '提现'} ({counts.withdraw})
        </button>
      </div>

      {/* Activity List */}
      <div className="bg-[#1e2329]/40 border border-white/5 rounded-[2rem] overflow-hidden">
        <div className="divide-y divide-white/5 max-h-[calc(100vh-280px)] overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-10 text-xs text-[#848E9C] italic">
              {t('common.loading') || '加载中...'}
            </div>
          ) : filteredHistory.length > 0 ? (
            filteredHistory.map((item: any, index: number) => {
              const isWithdrawCompleted = item.type === 'withdraw' && (item.isCompleted || item.status === 'Completed' || item.status === 'Approved');
              const isWithdrawRejected = item.type === 'withdraw' && item.status === 'Rejected';
              
              return (
                <div key={`${item.type}-${item.timestamp}-${index}`} className="p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all group">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Icon */}
                    <div className={`p-3 rounded-xl border transition-colors flex-shrink-0 ${
                      item.type === 'airdrop' 
                        ? 'bg-[#0b0e11] border-white/5 group-hover:border-[#FCD535]/30' 
                        : item.type === 'invite'
                        ? 'bg-[#0b0e11] border-white/5 group-hover:border-[#0ECB81]/30'
                        : isWithdrawCompleted
                        ? 'bg-[#0ECB81]/10 border-[#0ECB81]/30 group-hover:border-[#0ECB81]/50'
                        : isWithdrawRejected
                        ? 'bg-red-500/10 border-red-500/30 group-hover:border-red-500/50'
                        : 'bg-[#0b0e11] border-white/5 group-hover:border-[#848E9C]/30'
                    }`}>
                      {item.type === 'airdrop' ? <Gift className="w-4 h-4 text-[#FCD535]" /> : 
                       item.type === 'invite' ? <Handshake className="w-4 h-4 text-[#0ECB81]" /> : 
                       isWithdrawCompleted ? <CheckCircle2 className="w-4 h-4 text-[#0ECB81]" /> :
                       isWithdrawRejected ? <X className="w-4 h-4 text-red-400" /> :
                       <CreditCard className="w-4 h-4 text-[#848E9C]" />}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-white uppercase tracking-tight truncate">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-[9px] text-[#848E9C] font-bold flex items-center gap-1.5 uppercase">
                          <Clock className="w-2.5 h-2.5 flex-shrink-0" /> {new Date(item.time).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })} • {t('profile.verified') || '已验证'}
                        </p>
                        {/* Energy Value */}
                        {item.type === 'airdrop' || item.type === 'invite' ? (
                          item.energyChange > 0 && (
                            <span className="text-[8px] text-[#FCD535]/80 font-medium">
                              获得 {item.energyChange} 点能量值
                            </span>
                          )
                        ) : item.type === 'withdraw' && (
                          <span className="text-[8px] text-[#848E9C]/60 font-medium">
                            消耗 {item.energy.replace('-', '')}
                          </span>
                        )}
                      </div>
                      {item.status && (
                        <span className={`inline-block mt-1 text-[8px] px-2 py-0.5 rounded-full font-bold ${
                          item.status === 'Approved' || item.status === 'Completed'
                            ? 'bg-[#0ECB81]/20 text-[#0ECB81]' 
                            : item.status === 'Rejected'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {item.status === 'Approved' ? '已通过' : item.status === 'Completed' ? '已完成' : item.status === 'Rejected' ? '已拒绝' : '待审核'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Amount */}
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className={`text-sm font-black mono ${
                      item.type === 'withdraw' 
                        ? isWithdrawCompleted 
                          ? 'text-[#FCD535]'
                          : isWithdrawRejected
                          ? 'text-red-400'
                          : 'text-white'
                        : 'text-[#0ECB81]'
                    }`}>
                      {item.type === 'withdraw' 
                        ? isWithdrawCompleted 
                          ? <span className="flex items-center gap-1 justify-end">
                              {item.amount} <ArrowUpRight className="w-3 h-3" />
                            </span>
                          : isWithdrawRejected
                          ? `-${item.amount}`
                          : item.amount
                        : `+${item.amount}`
                      } <span className="text-[10px] font-medium opacity-70">{item.currency}</span>
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-xs text-[#848E9C] italic">
              {activeFilter === 'all' 
                ? (t('profile.noHistory') || '暂无记录')
                : `暂无${activeFilter === 'airdrop' ? '空投领取' : activeFilter === 'invite' ? '网络奖励' : '提现'}记录`
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityHistoryView;

