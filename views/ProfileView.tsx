
import React, { useState, useEffect } from 'react';
import { User, Shield, Battery, Users2, Trophy, ChevronRight, Gift, Handshake, CreditCard, Clock, Activity, Zap, X, Sparkles, TrendingUp, Info } from 'lucide-react';
import { UserStats, HistoryItem } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchUserInfo, fetchTeamRewards, getWithdrawHistory, getClaimsHistory, getReferralHistory } from '../api';
import { shortenAddress } from '../services/web3Service';
import { ENERGY_WITHDRAW_THRESHOLD, ENERGY_PER_USDT_WITHDRAW } from '../constants';

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
        fetchUserInfo(stats.address).catch(() => ({ energy: 0, inviteCount: 0, referrer: '', usdtAvailable: 0, usdtTotal: 0, usdtLocked: 0 })),
        fetchTeamRewards(stats.address).catch(() => ({ totalRewards: '0' })),
      ]);
      
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
      if (!stats.address || !stats.address.startsWith('0x')) return;

      // 并行获取所有历史记录
      const [withdrawals, claims, referrals] = await Promise.all([
        getWithdrawHistory(stats.address).catch(() => []),
        getClaimsHistory(stats.address).catch(() => []),
        getReferralHistory(stats.address).catch(() => []),
      ]);

      // 合并并格式化记录
      const timeline: any[] = [];

      // 1. 空投领取记录
      if (Array.isArray(claims)) {
        claims.forEach((claim: any) => {
          timeline.push({
            type: 'airdrop',
            icon: '✅',
            title: t('profile.airdropClaim') || '领取空投',
            description: `${parseFloat(claim.amount || '0').toLocaleString()} RAT`,
            energy: `+${claim.energy || 1} ${t('profile.unit') || '单位'}`,
            time: claim.createdAt || claim.time,
            timestamp: new Date(claim.createdAt || claim.time).getTime(),
            txHash: claim.txHash,
            amount: claim.amount || '0',
            currency: 'RAT',
            energyChange: claim.energy || 1,
          });
        });
      }

      // 2. 邀请记录
      if (Array.isArray(referrals)) {
        referrals.forEach((ref: any) => {
          timeline.push({
            type: 'invite',
            icon: '🤝',
            title: t('profile.networkReward') || '邀请好友',
            description: shortenAddress(ref.address || ''),
            energy: `+${ref.energy || 5} ${t('profile.unit') || '单位'}`,
            time: ref.createdAt || ref.time,
            timestamp: new Date(ref.createdAt || ref.time).getTime(),
            address: ref.address,
            amount: '50',
            currency: 'RAT',
            energyChange: ref.energy || 5,
          });
        });
      }

      // 3. 提现记录
      if (Array.isArray(withdrawals)) {
        withdrawals.forEach((withdraw: any) => {
          // 计算消耗的能量（提现金额 * 10）
          const energyCost = Math.ceil(parseFloat(withdraw.amount || '0') * ENERGY_PER_USDT_WITHDRAW);
          timeline.push({
            type: 'withdraw',
            icon: '💸',
            title: t('profile.liquidityWithdraw') || '提取收益',
            description: `${parseFloat(withdraw.amount || '0').toFixed(2)} USDT`,
            energy: `-${energyCost} ${t('profile.unit') || '单位'}`,
            time: withdraw.time || withdraw.createdAt,
            timestamp: new Date(withdraw.time || withdraw.createdAt).getTime(),
            status: withdraw.status,
            id: withdraw.id,
            amount: withdraw.amount || '0',
            currency: 'USDT',
            energyChange: -energyCost,
          });
        });
      }

      // 按时间倒序排序（最新的在前）
      timeline.sort((a, b) => b.timestamp - a.timestamp);

      setTimelineHistory(timeline);
    } catch (e) {
      console.error('Error loading timeline history:', e);
      setTimelineHistory([]);
    }
  };

  // 进入页面时加载数据
  useEffect(() => {
    if (stats.address && stats.address.startsWith('0x')) {
      setIsLoading(true);
      loadExtraData().finally(() => setIsLoading(false));
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
              <h2 className="font-black text-white text-base mono tracking-tighter truncate flex-1 min-w-0">{stats.address}</h2>
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
            <p className="text-sm font-black mono text-white">{stats.bnbBalance} <span className="text-[10px] text-[#848E9C] font-normal ml-0.5">BNB</span></p>
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
          <p className="text-2xl font-black text-white mono mb-1">{inviteCount.toLocaleString()}</p>
          <div className="flex items-center justify-center gap-1.5">
             <Users2 className="w-3 h-3 text-[#848E9C]" />
             <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest">{t('profile.networkSize') || '网络规模'}</p>
          </div>
        </div>
        <div className="flex-1 p-5 text-center group hover:bg-white/[0.02] transition-colors">
          <p className="text-2xl font-black text-[#0ECB81] mono mb-1">{parseFloat(teamRewards).toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
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

      {/* ENERGY EXPLANATION MODAL */}
      {showEnergyModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-[#0b0e11]/95 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="bg-gradient-to-b from-[#1e2329] to-[#0b0e11] w-full max-w-sm rounded-[3rem] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 overflow-hidden relative">
            
            {/* Background Decoration */}
            <div className="absolute top-[-10%] left-[-10%] w-32 h-32 bg-[#FCD535]/10 blur-3xl rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-32 h-32 bg-blue-500/10 blur-3xl rounded-full" />

            {/* Header */}
            <div className="p-8 pb-4 relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className="space-y-1">
                   <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-[#FCD535] fill-[#FCD535]" />
                      <h3 className="font-black uppercase tracking-[0.2em] text-sm text-white">{t('profile.energyExplanation') || '能量值说明'}</h3>
                   </div>
                   <p className="text-[10px] text-[#848E9C] font-bold uppercase tracking-widest">{t('profile.energySystem') || '能量系统 v2.0'}</p>
                </div>
                <button 
                  onClick={() => setShowEnergyModal(false)} 
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all"
                >
                   <X className="w-5 h-5 text-[#848E9C]" />
                </button>
              </div>

              <p className="text-xs text-[#848E9C] leading-relaxed mb-6 font-medium">
                {t('profile.energyDescription') || '能量值 (Grid Energy) 是 Rabbit AI 协议的核心消耗燃料，用于保障流动性提取的安全性与公平性。'}
              </p>
            </div>

            {/* Content List */}
            <div className="px-8 space-y-4 pb-8 relative z-10 max-h-[50vh] overflow-y-auto no-scrollbar">
               {/* How to Earn */}
               <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-[#FCD535] uppercase tracking-[0.3em] flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" /> {t('profile.howToEarn') || '如何获取'}
                  </h4>
                  
                  <div className="grid gap-2">
                     <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                        <div className="flex items-center gap-3">
                           <Gift className="w-4 h-4 text-white/40" />
                           <span className="text-[11px] font-bold text-white/90">{t('profile.dailyAirdropClaim') || '每日空投领取'}</span>
                        </div>
                        <span className="text-xs font-black text-[#FCD535] mono">+1 ⚡</span>
                     </div>
                     <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                        <div className="flex items-center gap-3">
                           <Users2 className="w-4 h-4 text-white/40" />
                           <span className="text-[11px] font-bold text-white/90">{t('profile.inviteFriendSuccess') || '邀请好友成功'}</span>
                        </div>
                        <span className="text-xs font-black text-[#FCD535] mono">+5 ⚡</span>
                     </div>
                  </div>
               </div>

               {/* How to Use */}
               <div className="space-y-3 pt-2">
                  <h4 className="text-[10px] font-black text-[#F6465D] uppercase tracking-[0.3em] flex items-center gap-2">
                    <Activity className="w-3 h-3" /> {t('profile.consumptionRules') || '消耗规则'}
                  </h4>
                  
                  <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl space-y-3">
                     <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-white/90">{t('profile.usdtWithdrawRatio') || 'USDT 收益提现'}</span>
                        <span className="text-xs font-black text-[#F6465D] mono">{t('profile.ratio1to10') || '1:10 比例'}</span>
                     </div>
                     <p className="text-[9px] text-[#848E9C] leading-normal font-bold uppercase tracking-tight">
                       {t('profile.withdrawRule') || '* 每提现 1 USDT 需消耗 10 单位能量。最低提现水位线为 30 能量。'}
                     </p>
                  </div>
               </div>

               <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-blue-400 mt-0.5" />
                  <p className="text-[10px] text-blue-400/80 font-medium leading-relaxed">
                    {t('profile.vip3FuturePrivilege') || 'VIP 3 以上等级用户将在未来的协议更新中获得每日能量恢复特权，敬请期待。'}
                  </p>
               </div>
            </div>

            {/* Footer */}
            <div className="p-8 pt-4">
               <button 
                 onClick={() => setShowEnergyModal(false)}
                 className="w-full bg-[#FCD535] text-[#0B0E11] font-black py-5 rounded-[1.5rem] text-[11px] uppercase tracking-[0.3em] shadow-xl shadow-[#FCD535]/10 active:scale-95 transition-all"
               >
                 {t('profile.confirmAndReturn') || '确认并返回'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileView;
