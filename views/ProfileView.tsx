
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, Shield, Battery, Users2, Trophy, ChevronRight, Gift, Handshake, CreditCard, Clock, Activity, Zap, X, Sparkles, TrendingUp, Info } from 'lucide-react';
import { UserStats, HistoryItem } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchUserInfo, fetchTeamRewards, getWithdrawHistory, getClaimsHistory, getReferralHistory } from '../api';
import { shortenAddress } from '../services/web3Service';
import { ENERGY_PER_USDT_WITHDRAW } from '../constants';

interface ProfileViewProps {
  stats: UserStats;
}

const ProfileView: React.FC<ProfileViewProps> = ({ stats }) => {
  const { t } = useLanguage();
  const [showEnergyModal, setShowEnergyModal] = useState(false);
  const [energy, setEnergy] = useState(stats.energy);
  const [teamRewards, setTeamRewards] = useState<string>('0');
  const [inviteCount, setInviteCount] = useState(stats.teamSize);
  const [timelineHistory, setTimelineHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 加载用户额外数据
  const loadExtraData = async () => {
    try {
      if (!stats.address || !stats.address.startsWith('0x')) return;
      
      const [info, teamData] = await Promise.all([
        fetchUserInfo(stats.address).catch((err) => {
          console.warn('[ProfileView] Failed to fetch user info:', err);
          return { energy: 0, inviteCount: 0, referrer: '', usdtAvailable: 0, usdtTotal: 0, usdtLocked: 0 };
        }),
        fetchTeamRewards(stats.address).catch((err) => {
          console.warn('[ProfileView] Failed to fetch team rewards:', err);
          return { totalRewards: '0' };
        }),
      ]);
      
      console.log('[ProfileView] Loaded user data:', {
        inviteCount: info?.inviteCount,
        teamRewards: teamData?.totalRewards,
        address: stats.address,
      });
      
      setEnergy(Number(info?.energy || 0));
      setInviteCount(Number(info?.inviteCount || 0));
      setTeamRewards(teamData?.totalRewards || '0');
      
      // 加载时间轴历史记录
      await loadTimelineHistory();
    } catch (e) {
      console.error('Error loading profile data:', e);
      setEnergy(0);
      setInviteCount(0);
      setTeamRewards('0');
      setTimelineHistory([]);
    }
  };

  // 加载时间轴历史记录（空投、邀请、提现）
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
          console.warn('[ProfileView] Failed to load withdraw history:', err);
          return [];
        }),
        getClaimsHistory(stats.address).catch((err) => {
          console.warn('[ProfileView] Failed to load claims history:', err);
          return [];
        }),
        getReferralHistory(stats.address).catch((err) => {
          console.warn('[ProfileView] Failed to load referral history:', err);
          return [];
        }),
      ]);

      // 调试日志：打印获取到的数据
      console.log('[ProfileView] Loaded history data:', {
        withdrawals: withdrawals?.length || 0,
        claims: claims?.length || 0,
        referrals: referrals?.length || 0,
        withdrawalsData: withdrawals,
        claimsData: claims,
        referralsData: referrals,
      });

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
            title: t('profile.airdropClaim') || '领取空投',
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

      // 2. 邀请记录
      if (Array.isArray(referrals) && referrals.length > 0) {
        referrals.forEach((ref: any) => {
          const energy = Number(ref.energy || 5);
          const createdAt = ref.createdAt || ref.time || new Date().toISOString();
          // 使用实际的奖励金额，如果没有则显示 0
          const rewardAmount = parseFloat(ref.rewardAmount || '0');
          
          timeline.push({
            type: 'invite',
            icon: '🤝',
            title: t('profile.networkReward') || '网络奖励',
            description: shortenAddress(ref.address || ''),
            energy: `+${energy} ${t('profile.energy') || '能量'}`,
            time: createdAt,
            timestamp: new Date(createdAt).getTime(),
            address: ref.address,
            amount: rewardAmount.toFixed(2), // 使用实际奖励金额，保留2位小数
            currency: 'RAT',
            energyChange: energy,
          });
        });
      }

      // 3. 提现记录
      if (Array.isArray(withdrawals) && withdrawals.length > 0) {
        withdrawals.forEach((withdraw: any) => {
          // 计算消耗的能量（提现金额 * 10）
          const amount = parseFloat(withdraw.amount || '0');
          const energyCost = Math.ceil(amount * ENERGY_PER_USDT_WITHDRAW);
          const createdAt = withdraw.time || withdraw.createdAt || new Date().toISOString();
          
          timeline.push({
            type: 'withdraw',
            icon: '💸',
            title: t('profile.liquidityWithdraw') || '提取收益',
            description: `${amount.toFixed(2)} USDT`,
            energy: `-${energyCost} ${t('profile.energy') || '能量'}`,
            time: createdAt,
            timestamp: new Date(createdAt).getTime(),
            status: withdraw.status || 'Pending',
            id: withdraw.id,
            amount: amount.toFixed(2),
            currency: 'USDT',
            energyChange: -energyCost,
          });
        });
      }

      // 按时间倒序排序（最新的在前）
      timeline.sort((a, b) => b.timestamp - a.timestamp);

      // 调试日志：打印合并后的时间轴
      console.log('[ProfileView] Merged timeline:', {
        total: timeline.length,
        byType: {
          airdrop: timeline.filter((t) => t.type === 'airdrop').length,
          invite: timeline.filter((t) => t.type === 'invite').length,
          withdraw: timeline.filter((t) => t.type === 'withdraw').length,
        },
        timeline: timeline.slice(0, 10),
      });

      // 只显示最近 10 条记录
      setTimelineHistory(timeline.slice(0, 10));
    } catch (e) {
      console.error('Error loading timeline history:', e);
      setTimelineHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 进入页面时加载数据
  useEffect(() => {
    if (stats.address && stats.address.startsWith('0x')) {
      setIsLoading(true);
      loadExtraData().finally(() => setIsLoading(false));
    } else {
      // 如果没有地址，清空数据
      setEnergy(0);
      setInviteCount(0);
      setTeamRewards('0');
      setTimelineHistory([]);
    }
  }, [stats.address]);

  // 领取成功后可能发生在 Mining 页，导致 refreshEnergy 事件在本页未挂载时被错过。
  // 这里读取本地标记，进入资产页后做一次"立即 + 延迟重试"的补偿刷新，提升体验。
  useEffect(() => {
    if (!stats.address || !stats.address.startsWith('0x')) return;
    let needs = false;
    try {
      const v = localStorage.getItem('rabbit_needs_userinfo_refresh_at');
      if (v) {
        const ts = Number(v);
        if (Number.isFinite(ts) && Date.now() - ts < 2 * 60 * 1000) needs = true;
      }
    } catch {}
    if (!needs) return;

    loadExtraData();
    const t = setTimeout(() => loadExtraData(), 1500);
    // 清理标记（无论是否成功，都避免无限重试）
    try {
      localStorage.removeItem('rabbit_needs_userinfo_refresh_at');
    } catch {}
    return () => clearTimeout(t);
  }, [stats.address]);

  // 监听能量值刷新事件
  useEffect(() => {
    const handleRefresh = () => {
      if (stats.address && stats.address.startsWith('0x')) {
        loadExtraData();
      }
    };
    
    window.addEventListener('refreshEnergy', handleRefresh);
    return () => window.removeEventListener('refreshEnergy', handleRefresh);
  }, [stats.address]);

  // 自动轮询：每30秒刷新一次数据（确保 Indexer 同步的新数据能及时显示）
  useEffect(() => {
    if (!stats.address || !stats.address.startsWith('0x')) return;
    
    // 设置定时器，每30秒刷新一次
    const interval = setInterval(() => {
      console.log('[ProfileView] Auto-refreshing data (30s interval)...');
      loadExtraData();
    }, 30000); // 30秒
    
    return () => clearInterval(interval);
  }, [stats.address]);

  // 页面可见性检测：当用户切换回页面时自动刷新
  useEffect(() => {
    if (!stats.address || !stats.address.startsWith('0x')) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[ProfileView] Page became visible, refreshing data...');
        loadExtraData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stats.address]);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Identity Header */}
      <div className="relative glass p-6 rounded-[2rem] overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
           <Shield className="w-24 h-24 text-white opacity-[0.02]" />
        </div>
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 bg-[#1e2329] rounded-2xl flex items-center justify-center border-2 border-[#FCD535]/20 shadow-xl overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FCD535]/20 via-transparent to-blue-500/20" />
            <User className="w-8 h-8 text-[#FCD535] relative z-10" />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-black text-white text-[10px] mono tracking-tighter break-all flex-1 min-w-0 leading-tight">{stats.address}</h2>
              <div className="p-1 bg-[#FCD535]/10 rounded-md flex-shrink-0">
                 <Shield className="w-3 h-3 text-[#FCD535]" />
              </div>
            </div>
            <p className="text-[10px] text-[#848E9C] font-black uppercase tracking-widest">{t('profile.identityVerified') || '身份已验证 • 等级 1'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
            <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest mb-1">{t('profile.bnbAssets') || 'BNB 资产'}</p>
            <p className="text-sm font-black mono text-white">{stats.bnbBalance.toFixed(5)} <span className="text-[10px] text-[#848E9C] font-normal ml-0.5">BNB</span></p>
          </div>
          {/* Energy Card - Interactive */}
          <button 
            onClick={() => setShowEnergyModal(true)}
            className="bg-black/20 p-4 rounded-2xl border border-white/5 flex justify-between items-center relative overflow-hidden group text-left active:scale-95 transition-all hover:border-[#FCD535]/30"
          >
            <div className="absolute inset-0 bg-[#FCD535]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                {t('profile.energy') || '⚡ 能量值'} <Info className="w-2 h-2" />
              </p>
              <p className="text-sm font-black mono text-[#FCD535]">{energy} ⚡</p>
            </div>
            <Zap className="w-5 h-5 text-[#FCD535] animate-pulse" />
          </button>
        </div>
      </div>

      {/* Network Stats Card */}
      <div className="bg-[#1e2329]/50 border border-white/5 rounded-[1.5rem] flex divide-x divide-white/5 backdrop-blur-sm">
        <div className="flex-1 p-5 text-center group hover:bg-white/[0.02] transition-colors">
          <p className="text-2xl font-black text-white mono mb-1">
            {inviteCount > 0 ? inviteCount.toLocaleString() : (stats.teamSize > 0 ? stats.teamSize.toLocaleString() : '0')}
          </p>
          <div className="flex items-center justify-center gap-1.5">
             <Users2 className="w-3 h-3 text-[#848E9C]" />
             <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest">{t('profile.networkSize') || '网络规模'}</p>
          </div>
        </div>
        <div className="flex-1 p-5 text-center group hover:bg-white/[0.02] transition-colors">
          <p className="text-2xl font-black text-[#0ECB81] mono mb-1">
            {parseFloat(teamRewards) > 0 
              ? parseFloat(teamRewards).toLocaleString(undefined, { maximumFractionDigits: 1 })
              : (stats.teamRewards > 0 ? stats.teamRewards.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '0')
            }
          </p>
          <div className="flex items-center justify-center gap-1.5">
             <Trophy className="w-3 h-3 text-[#0ECB81]" />
             <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest">{t('profile.totalYield') || '总收益'}</p>
          </div>
        </div>
      </div>

      {/* Activity Ledger */}
      <div className="bg-[#1e2329]/40 border border-white/5 rounded-[2rem] overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-3">
             <Activity className="w-4 h-4 text-[#FCD535]" />
             <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">{t('profile.activityLedger') || '活动记录'}</h3>
          </div>
          <button className="text-[10px] text-[#FCD535] font-black uppercase tracking-widest hover:underline decoration-2 underline-offset-4">{t('profile.browseAll') || '查看全部'}</button>
        </div>
        
        <div className="divide-y divide-white/5">
          {isLoading ? (
            <div className="text-center py-6 text-xs text-[#848E9C] italic">{t('common.loading') || '加载中...'}</div>
          ) : timelineHistory.length > 0 ? (
            timelineHistory.map((item: any, index: number) => (
              <div key={`${item.type}-${item.timestamp}-${index}`} className="p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all group">
                <div className="flex items-center gap-4">
                  <div className="bg-[#0b0e11] p-3 rounded-xl border border-white/5 group-hover:border-[#FCD535]/30 transition-colors">
                    {item.type === 'airdrop' ? <Gift className="w-4 h-4 text-[#FCD535]" /> : 
                     item.type === 'invite' ? <Handshake className="w-4 h-4 text-[#0ECB81]" /> : 
                     <CreditCard className="w-4 h-4 text-[#848E9C]" />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-tight">
                      {item.title}
                    </p>
                    <p className="text-[9px] text-[#848E9C] font-bold flex items-center gap-1.5 uppercase mt-0.5">
                      <Clock className="w-2.5 h-2.5" /> {new Date(item.time).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      })} • {t('profile.verified') || '已验证'}
                    </p>
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
                <div className="text-right">
                  <p className={`text-sm font-black mono ${item.type === 'withdraw' ? 'text-[#F6465D]' : 'text-[#0ECB81]'}`}>
                    {item.type === 'withdraw' ? '-' : '+'}{item.amount} <span className="text-[10px] font-medium opacity-70">{item.currency}</span>
                  </p>
                  <p className={`text-[9px] font-black uppercase ${item.energyChange > 0 ? 'text-[#FCD535]' : 'text-red-400'}`}>
                    {item.energy}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-xs text-[#848E9C] italic">{t('profile.noHistory') || '暂无记录'}</div>
          )}
        </div>
      </div>

      {/* ENERGY EXPLANATION MODAL - Using Portal */}
      {showEnergyModal && createPortal(
        <div 
          className="fixed inset-0 z-[50] flex items-end sm:items-center justify-center px-0 sm:px-4 pb-0 sm:pb-4 bg-[#0b0e11]/95 backdrop-blur-2xl animate-in fade-in duration-300"
          onClick={(e) => {
            // 点击背景关闭弹窗
            if (e.target === e.currentTarget) {
              setShowEnergyModal(false);
            }
          }}
        >
          <div 
            className="bg-gradient-to-b from-[#1e2329] to-[#0b0e11] w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] border-t border-l border-r border-white/10 sm:border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 overflow-hidden max-h-[92vh] sm:max-h-[85vh] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background Decoration */}
            <div className="absolute top-[-10%] left-[-10%] w-32 h-32 bg-[#FCD535]/10 blur-3xl rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-32 h-32 bg-blue-500/10 blur-3xl rounded-full" />

            {/* Header */}
            <div className="relative p-3 sm:p-8 pb-2 sm:pb-4 flex-shrink-0 z-10">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-[#FCD535]/20 rounded-b-full" />
              <div className="flex justify-between items-start mb-3 sm:mb-6">
                <div className="space-y-0.5 sm:space-y-1 flex-1 pr-2 min-w-0">
                   <div className="flex items-center gap-1.5 sm:gap-2">
                      <Zap className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[#FCD535] fill-[#FCD535] flex-shrink-0" />
                      <h3 className="font-black uppercase tracking-[0.2em] text-[9px] sm:text-sm text-white truncate">{t('profile.energyExplanation') || '能量值说明'}</h3>
                   </div>
                   <p className="text-[7px] sm:text-[10px] text-[#848E9C] font-bold uppercase tracking-widest truncate">{t('profile.energySystem') || '能量系统 v2.0'}</p>
                </div>
                <button 
                  onClick={() => setShowEnergyModal(false)} 
                  className="p-1.5 sm:p-3 bg-white/5 hover:bg-white/10 rounded-xl sm:rounded-2xl transition-all flex-shrink-0 touch-manipulation active:scale-90"
                >
                   <X className="w-4 h-4 sm:w-5 sm:h-5 text-[#848E9C]" />
                </button>
              </div>

              <p className="text-[8px] sm:text-xs text-[#848E9C] leading-relaxed mb-3 sm:mb-6 font-medium">
                {t('profile.energyDescription') || '能量值 (Grid Energy) 是 Rabbit AI 协议的核心消耗燃料，用于保障流动性提取的安全性与公平性。'}
              </p>
            </div>

            {/* Content List */}
            <div className="px-3 sm:px-8 space-y-3 sm:space-y-4 pb-3 sm:pb-8 relative z-10 overflow-y-auto flex-1 no-scrollbar">
               {/* How to Earn */}
               <div className="space-y-2 sm:space-y-3">
                  <h4 className="text-[9px] sm:text-[10px] font-black text-[#FCD535] uppercase tracking-[0.3em] flex items-center gap-1.5 sm:gap-2">
                    <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('profile.howToEarn') || '如何获取'}
                  </h4>
                  
                  <div className="grid gap-1.5 sm:gap-2">
                     <div className="flex items-center justify-between p-3 sm:p-4 bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                           <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/40 flex-shrink-0" />
                           <span className="text-[10px] sm:text-[11px] font-bold text-white/90 truncate">{t('profile.dailyAirdropClaim') || '每日空投领取'}</span>
                        </div>
                        <span className="text-[10px] sm:text-xs font-black text-[#FCD535] mono flex-shrink-0">+1 ⚡</span>
                     </div>
                     <div className="flex items-center justify-between p-3 sm:p-4 bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                           <Users2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/40 flex-shrink-0" />
                           <span className="text-[10px] sm:text-[11px] font-bold text-white/90 truncate">{t('profile.inviteFriendSuccess') || '邀请好友成功'}</span>
                        </div>
                        <span className="text-[10px] sm:text-xs font-black text-[#FCD535] mono flex-shrink-0">+5 ⚡</span>
                     </div>
                  </div>
               </div>

               {/* How to Use */}
               <div className="space-y-2 sm:space-y-3 pt-1 sm:pt-2">
                  <h4 className="text-[9px] sm:text-[10px] font-black text-[#F6465D] uppercase tracking-[0.3em] flex items-center gap-1.5 sm:gap-2">
                    <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('profile.consumptionRules') || '消耗规则'}
                  </h4>
                  
                  <div className="p-3 sm:p-4 bg-red-500/5 border border-red-500/10 rounded-xl sm:rounded-2xl space-y-2 sm:space-y-3">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] sm:text-[11px] font-bold text-white/90 truncate pr-2">{t('profile.usdtWithdrawRatio') || 'USDT 收益提现'}</span>
                        <span className="text-[10px] sm:text-xs font-black text-[#F6465D] mono flex-shrink-0">{t('profile.ratio1to10') || '1:10 比例'}</span>
                     </div>
                     <p className="text-[8px] sm:text-[9px] text-[#848E9C] leading-normal font-bold uppercase tracking-tight">
                       {t('profile.withdrawRule') || '* 每提现 1 USDT 需消耗 10 单位能量。最低提现水位线为 30 能量。'}
                     </p>
                  </div>
               </div>

               <div className="p-3 sm:p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl sm:rounded-2xl flex items-start gap-2 sm:gap-3">
                  <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-[9px] sm:text-[10px] text-blue-400/80 font-medium leading-relaxed">
                    {t('profile.vip3FuturePrivilege') || 'VIP 3 以上等级用户将在未来的协议更新中获得每日能量恢复特权，敬请期待。'}
                  </p>
               </div>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-8 pt-2 sm:pt-4 flex-shrink-0" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
               <button 
                 onClick={() => setShowEnergyModal(false)}
                 className="w-full bg-[#FCD535] text-[#0B0E11] font-black py-3 sm:py-5 rounded-xl sm:rounded-[1.5rem] text-[9px] sm:text-[11px] uppercase tracking-[0.3em] shadow-xl shadow-[#FCD535]/10 active:scale-95 transition-all touch-manipulation min-h-[44px]"
               >
                 {t('profile.confirmAndReturn') || '确认并返回'}
               </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProfileView;
