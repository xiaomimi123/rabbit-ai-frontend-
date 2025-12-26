
import React, { useState, useMemo, useEffect } from 'react';
import { ethers } from 'ethers';
import { TrendingUp, ArrowUpRight, ShieldCheck, Info, X, ChevronRight, Activity, Wallet2, Lock, ShieldEllipsis, Star, Sparkles, Gem, Target, Zap, Crown, CheckCircle2 } from 'lucide-react';
import { UserStats } from '../types';
import { RAT_PRICE_USDT, VIP_TIERS, ENERGY_WITHDRAW_THRESHOLD, ENERGY_PER_USDT_WITHDRAW, PROTOCOL_STATS, CONTRACTS, ABIS } from '../constants';
import { fetchRatBalance, fetchEarnings, applyWithdraw } from '../api';
import { useLanguage } from '../contexts/LanguageContext';
import { getProvider, getContract } from '../services/web3Service';

interface AssetViewProps {
  stats: UserStats;
  setStats: React.Dispatch<React.SetStateAction<UserStats>>;
  onNavigateToProfile?: () => void;
}

const AssetView: React.FC<AssetViewProps> = ({ stats, setStats, onNavigateToProfile }) => {
  const { t } = useLanguage();
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  // 区分 null（加载中/失败）和 0（实际为0）
  const [ratBalance, setRatBalance] = useState<number | null>(stats.ratBalance || null);
  const [earnings, setEarnings] = useState<{
    pendingUsdt: number;
    dailyRate: number;
    currentTier: number;
    holdingDays: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [ratBalanceError, setRatBalanceError] = useState(false);
  const [earningsError, setEarningsError] = useState(false);

  // 加载持币余额和收益信息
  useEffect(() => {
    const loadEarningsData = async () => {
      if (!stats.address || !stats.address.startsWith('0x')) return;
      try {
        setLoading(true);
        
        // 直接从链上读取RAT代币余额
        let ratBalanceFromChain: number | null = null;
        setRatBalanceError(false);
        try {
          const provider = getProvider();
          if (provider) {
            const ratContract = await getContract(CONTRACTS.RAT_TOKEN, ABIS.ERC20);
            const balanceWei = await ratContract.balanceOf(stats.address);
            const decimals = await ratContract.decimals().catch(() => 18); // 默认18位小数
            // 使用 formatUnits 保持精度，只在最后转换为 number
            const balanceFormatted = ethers.utils.formatUnits(balanceWei, decimals);
            ratBalanceFromChain = parseFloat(balanceFormatted);
            setRatBalance(ratBalanceFromChain);
            // 更新 stats 中的 ratBalance
            setStats(prev => ({ ...prev, ratBalance: ratBalanceFromChain || 0 }));
          }
        } catch (chainError: any) {
          console.warn('Failed to fetch RAT balance from chain:', chainError);
          // 如果链上读取失败，尝试从API获取
          try {
            const balanceData = await fetchRatBalance(stats.address);
            ratBalanceFromChain = parseFloat(balanceData.balance || '0');
            setRatBalance(ratBalanceFromChain);
            setStats(prev => ({ ...prev, ratBalance: ratBalanceFromChain || 0 }));
          } catch (apiError) {
            console.error('Failed to fetch RAT balance from API:', apiError);
            setRatBalanceError(true);
            // 保持 null，不设置为 0
          }
        }
        
        // 获取收益信息（从后端API）
        setEarningsError(false);
        try {
          const earningsData = await fetchEarnings(stats.address);
          setEarnings({
            pendingUsdt: parseFloat(earningsData.pendingUsdt || '0'),
            dailyRate: earningsData.dailyRate || 0,
            currentTier: earningsData.currentTier || 0,
            holdingDays: earningsData.holdingDays || 0,
          });
          // 更新 stats 中的 pendingUsdt
          setStats(prev => ({ ...prev, pendingUsdt: parseFloat(earningsData.pendingUsdt || '0') }));
        } catch (earningsError: any) {
          // 404 错误是正常的（没有数据），设置为 0
          const status = earningsError?.response?.status || earningsError?.status;
          if (status === 404 || earningsError?.message?.includes('404')) {
            // 404 表示没有数据，设置为 0（这是正常的）
            setEarnings({
              pendingUsdt: 0,
              dailyRate: 0,
              currentTier: 0,
              holdingDays: 0,
            });
          } else {
            // 其他错误，保持 null，不设置为 0
            console.error('Failed to load earnings data:', earningsError);
            setEarningsError(true);
          }
        }
      } catch (error: any) {
        console.error('Failed to load data:', error);
        setRatBalanceError(true);
        setEarningsError(true);
        // 不设置默认值，保持 null
      } finally {
        setLoading(false);
      }
    };
    loadEarningsData();
    // 每30秒刷新一次
    const interval = setInterval(loadEarningsData, 30000);
    
    // 监听 refreshEnergy 事件，当能量更新时也刷新收益数据
    const handleRefresh = () => {
      loadEarningsData();
    };
    window.addEventListener('refreshEnergy', handleRefresh);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('refreshEnergy', handleRefresh);
    };
  }, [stats.address, setStats]);

  const usdtValuation = useMemo(() => {
    if (ratBalance === null) return null;
    // 使用更精确的计算方式，避免精度丢失
    // 将 RAT_PRICE_USDT (0.01) 转换为 BigNumber 进行计算
    const priceWei = ethers.utils.parseEther(RAT_PRICE_USDT.toString());
    const balanceWei = ethers.utils.parseEther(ratBalance.toString());
    // 计算：balanceWei * priceWei / 1e18，然后格式化为 USDT（2位小数）
    const resultWei = balanceWei.mul(priceWei).div(ethers.utils.parseEther('1'));
    return parseFloat(ethers.utils.formatEther(resultWei)).toFixed(2);
  }, [ratBalance]);
  
  // 根据持币余额确定当前 VIP 等级
  const currentTier = useMemo(() => {
    if (ratBalance < VIP_TIERS[0].min) return null; // 未达到最低等级
    return VIP_TIERS.find(t => ratBalance >= t.min && ratBalance <= t.max) || VIP_TIERS[VIP_TIERS.length - 1];
  }, [ratBalance]);

  // 计算距离下一个等级的进度百分比
  const progress = useMemo(() => {
    // 如果数据加载中，返回 null
    if (ratBalance === null) return null;
    
    // 如果未达到VIP1，计算距离VIP1的进度
    if (!currentTier) {
      const vip1Min = VIP_TIERS[0].min; // 10000
      if (ratBalance <= 0) return 0;
      const progressToVip1 = Math.min(Math.round((ratBalance / vip1Min) * 100), 99); // 最多显示99%，达到后显示100%
      return progressToVip1;
    }
    
    // 如果已达到某个等级，计算距离下一个等级的进度
    const currentIdx = VIP_TIERS.findIndex(t => t.level === currentTier.level);
    const nextTier = VIP_TIERS[currentIdx + 1];
    
    // ⚠️ 重要：检查是否有下一级，防止除以 0 或逻辑报错
    // 如果已经是最高等级（VIP4），显示 100%
    if (!nextTier) {
      return 100;
    }
    
    // 计算当前等级到下一个等级的进度
    const currentMin = currentTier.min;
    const nextMin = nextTier.min;
    
    // 防止除以 0（虽然理论上不会发生，但为了安全）
    if (nextMin <= currentMin) {
      return 100;
    }
    
    const progressToNext = Math.min(Math.round(((ratBalance - currentMin) / (nextMin - currentMin)) * 100), 100);
    return progressToNext;
  }, [ratBalance, currentTier]);

  // 计算预计每日收益（使用 BigInt 避免精度丢失）
  const estimatedDailyEarnings = useMemo(() => {
    if (!currentTier || !earnings || ratBalance === null) return null;
    
    // 使用 BigNumber 进行精确计算
    // 公式：ratBalance * RAT_PRICE_USDT * (dailyRate / 100)
    try {
      const balanceWei = ethers.utils.parseEther(ratBalance.toString());
      const priceWei = ethers.utils.parseEther(RAT_PRICE_USDT.toString());
      const ratePercent = currentTier.dailyRate; // 例如：2 表示 2%
      
      // 计算：balanceWei * priceWei * ratePercent / (1e18 * 100)
      const resultWei = balanceWei
        .mul(priceWei)
        .mul(ethers.BigNumber.from(ratePercent))
        .div(ethers.utils.parseEther('100'));
      
      // 格式化为 USDT（2位小数）
      return parseFloat(ethers.utils.formatEther(resultWei));
    } catch (error) {
      // 如果 BigNumber 计算失败，降级到普通计算
      console.warn('BigNumber calculation failed, using fallback:', error);
      return ratBalance * RAT_PRICE_USDT * (currentTier.dailyRate / 100);
    }
  }, [ratBalance, currentTier, earnings]);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Portfolio Overview */}
      <div className="relative glass rounded-[2rem] p-7 overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-[0.03]">
           <Wallet2 className="w-40 h-40" />
        </div>
        <div className="flex justify-between items-start mb-6">
           <div className="bg-[#FCD535]/10 border border-[#FCD535]/20 text-[#FCD535] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
             {t('asset.estimatedBalance') || '预估余额'}
           </div>
           <div className="flex items-center gap-1.5 text-[#0ECB81] bg-[#0ECB81]/10 px-2.5 py-1 rounded-full border border-[#0ECB81]/20">
             <div className="w-1.5 h-1.5 rounded-full bg-[#0ECB81] animate-pulse" />
             <span className="text-[9px] font-black uppercase tracking-widest">{t('asset.onChainLive') || '链上实时'}</span>
           </div>
        </div>
        <div className="space-y-1">
          <div className="text-5xl font-black text-white tracking-tighter mono">
            <span className="text-[#FCD535] text-3xl mr-1 font-medium">$</span>
            {usdtValuation === null ? (
              <span className="inline-block w-32 h-12 bg-white/5 rounded animate-pulse" />
            ) : ratBalanceError ? (
              <span className="text-[#848E9C]">--</span>
            ) : (
              usdtValuation
            )}
          </div>
          <p className="text-xs text-[#848E9C] font-bold mono">
            ≈ {ratBalance === null ? (
              <span className="inline-block w-24 h-4 bg-white/5 rounded animate-pulse" />
            ) : ratBalanceError ? (
              '--'
            ) : (
              ratBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })
            )} RAT
          </p>
          {earnings && earnings.currentTier > 0 && (
            <p className="text-[10px] text-[#0ECB81] font-bold mt-1">
              {t('asset.earningStatus') || '持币生息中'} • {currentTier?.dailyRate}% {t('asset.dailyInterestRate') || '日利率'}
            </p>
          )}
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4">
          <div className="flex items-center gap-2">
             <ShieldCheck className="w-3.5 h-3.5 text-[#0ECB81]" />
             <span className="text-[10px] font-bold text-[#848E9C]">{t('asset.securedAssets') || 'Secured Assets Protected'}</span>
          </div>
          <button className="text-[#FCD535] text-[10px] font-black uppercase flex items-center gap-1">
             {t('asset.explorer') || 'Explorer'} <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Trust Metrics Card */}
      <div className="bg-[#1e2329]/30 border border-white/5 rounded-2xl p-5 flex items-center justify-between backdrop-blur-sm">
        <div className="space-y-1">
          <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest">{t('asset.totalRewardPaid') || 'Total Reward Paid'}</p>
          <p className="text-lg font-black text-white mono">${PROTOCOL_STATS.totalPaidOut.toLocaleString()}<span className="text-[10px] text-[#0ECB81] ml-1">USDT</span></p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
           <div className="flex gap-1">
              <div className="w-6 h-6 bg-white/5 rounded flex items-center justify-center border border-white/5 grayscale opacity-50"><ShieldEllipsis className="w-3.5 h-3.5" /></div>
              <div className="w-6 h-6 bg-white/5 rounded flex items-center justify-center border border-white/5 grayscale opacity-50"><Lock className="w-3.5 h-3.5" /></div>
           </div>
           <span className="text-[8px] text-[#848E9C] font-black uppercase underline underline-offset-2">{t('asset.auditReports') || '审计报告'}</span>
        </div>
      </div>

      {/* VIP Tiering Protocol - Interactive Card */}
      <button 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowTierModal(true);
        }}
        className="w-full text-left bg-gradient-to-br from-[#1e2329]/60 to-[#0b0e11] border border-white/5 rounded-[2.5rem] overflow-hidden active:scale-[0.98] transition-all hover:border-[#FCD535]/30 group relative cursor-pointer"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#FCD535]/5 blur-2xl rounded-full" />
        
        <div className="px-7 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02] relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-[#FCD535] to-orange-400 rounded-2xl flex items-center justify-center shadow-lg shadow-[#FCD535]/20 group-hover:shadow-[#FCD535]/40 transition-all transform group-hover:rotate-6">
               <Crown className="text-[#0B0E11] w-5 h-5 fill-current" />
            </div>
            <div>
              <p className="text-[10px] text-[#FCD535] font-black uppercase tracking-widest mb-0.5">{t('asset.holdToEarn') || '持币生息状态'}</p>
              {currentTier ? (
                <p className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                  {currentTier.name}
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0ECB81]" />
                </p>
              ) : (
                <p className="text-sm font-black text-[#848E9C] uppercase tracking-tight">
                  {t('asset.tierNotReached') || '未达到等级 (需 ≥10k RAT)'}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
             {currentTier ? (
               <>
                 <p className="text-[#FCD535] text-2xl font-black mono leading-none tracking-tighter">{currentTier.dailyRate}%</p>
                 <p className="text-[9px] text-[#848E9C] font-bold uppercase tracking-widest mt-1">{t('asset.dailyRate') || '日利率'}</p>
               </>
             ) : (
               <>
                 <p className="text-[#848E9C] text-xl font-black mono leading-none tracking-tighter">0%</p>
                 <p className="text-[9px] text-[#848E9C] font-bold uppercase tracking-widest mt-1">{t('asset.dailyRate') || '日利率'}</p>
               </>
             )}
          </div>
        </div>
        
        <div className="p-7 relative z-10">
          <div className="flex justify-between items-end mb-3">
             <div className="flex items-center gap-2">
                <Target className="w-3 h-3 text-[#848E9C]" />
                <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest">{t('asset.protocolEvolution') || '协议进化'}</p>
             </div>
             <p className="text-[10px] text-white font-black mono">
               {progress === null ? (
                 <span className="inline-block w-8 h-4 bg-white/5 rounded animate-pulse" />
               ) : (
                 `${progress}%`
               )}
             </p>
          </div>
          <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden mb-4 p-[1px] border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-[#FCD535] via-orange-400 to-[#FCD535] rounded-full transition-all duration-1000 ease-out" 
              style={{ width: progress === null ? '0%' : `${progress}%`, backgroundSize: '200% 100%' }} 
            />
          </div>
          <div className="flex justify-center items-center gap-2 text-[#848E9C] group-hover:text-[#FCD535] transition-colors">
            <Sparkles className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">{t('asset.unlockTierBenefits') || '解锁等级权益'}</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      </button>

      {/* Withdrawal Card */}
      <div className="bg-[#1e2329] border border-white/10 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full" />
        <div className="flex items-center gap-2 mb-4">
           <div className="w-2 h-2 rounded-full bg-[#FCD535]" />
           <span className="text-[10px] font-black text-[#848E9C] uppercase tracking-[0.25em]">{t('asset.liquidHarvestPool') || '流动性收益池'}</span>
        </div>
        
        <div className="space-y-4 mb-6">
          <div className="text-5xl font-black text-white mono tracking-tighter flex items-baseline">
            <span className="text-xl font-normal text-[#848E9C] mr-3">$</span>
            {earnings === null ? (
              <span className="inline-block w-32 h-12 bg-white/5 rounded animate-pulse" />
            ) : earningsError ? (
              <span className="text-[#848E9C]">--</span>
            ) : (
              earnings.pendingUsdt.toFixed(4)
            )}
          </div>
          {earnings && earnings.currentTier > 0 && (
            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-[#848E9C] font-bold uppercase">{t('asset.estimatedDailyEarnings') || '预计每日收益'}</span>
                <span className="text-sm font-black text-[#0ECB81] mono">
                  {estimatedDailyEarnings === null ? (
                    <span className="inline-block w-20 h-4 bg-white/5 rounded animate-pulse" />
                  ) : (
                    `$${estimatedDailyEarnings.toFixed(2)} USDT`
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-[#848E9C] font-bold uppercase">{t('asset.holdingDays') || '持币天数'}</span>
                <span className="text-sm font-black text-white mono">{earnings.holdingDays} {t('common.days') || '天'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => {
              // 允许打开弹窗，即使能量不足也可以查看能量信息
              setShowWithdrawModal(true);
            }}
            className="group relative font-black py-4 rounded-[1.25rem] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl overflow-hidden bg-[#FCD535] text-[#0B0E11] shadow-[#FCD535]/10"
          >
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <span className="relative z-10 text-[11px] uppercase tracking-widest">{t('asset.withdrawal') || '提现'}</span>
            <ArrowUpRight className="w-4 h-4 relative z-10" />
          </button>
          <button 
            onClick={() => {
              if (onNavigateToProfile) {
                onNavigateToProfile();
              }
            }}
            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black py-4 rounded-[1.25rem] text-[11px] uppercase tracking-widest transition-all active:scale-95"
          >
            {t('asset.history') || '历史'}
          </button>
        </div>
      </div>

      {/* VIP TIER EXPLANATION MODAL - REDESIGNED */}
      {showTierModal && (
        <div 
          className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center px-2 sm:px-4 bg-[#0b0e11]/95 backdrop-blur-2xl animate-in fade-in duration-300"
          onClick={(e) => {
            // 点击背景关闭弹窗
            if (e.target === e.currentTarget) {
              setShowTierModal(false);
            }
          }}
        >
          <div 
            className="bg-gradient-to-b from-[#1e2329] to-[#0b0e11] w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 overflow-hidden max-h-[90vh] sm:max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Section */}
            <div className="relative p-4 sm:p-5 pb-3 flex-shrink-0">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-[#FCD535]/20 rounded-b-full" />
              <div className="flex justify-between items-start mb-3 sm:mb-4">
                <div className="space-y-0.5 flex-1 pr-2">
                   <div className="flex items-center gap-2">
                      <Gem className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FCD535]" />
                      <h3 className="font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs text-white">{t('asset.vipPrivilege') || 'VIP 特权'}</h3>
                   </div>
                   <p className="text-[8px] sm:text-[9px] text-[#848E9C] font-bold uppercase tracking-widest">{t('asset.holdToEarnRoadmap') || '持币生息路线图 v2.0'}</p>
                </div>
                <button 
                  onClick={() => setShowTierModal(false)} 
                  className="p-1.5 sm:p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all hover:rotate-90 flex-shrink-0 touch-manipulation"
                >
                   <X className="w-4 h-4 sm:w-5 sm:h-5 text-[#848E9C]" />
                </button>
              </div>

              {/* Highlight Card */}
              <div className="bg-gradient-to-r from-[#FCD535]/10 to-transparent p-2.5 sm:p-3 rounded-xl border border-[#FCD535]/20 flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#FCD535] rounded-xl flex items-center justify-center shadow-lg shadow-[#FCD535]/20 flex-shrink-0">
                   <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-[#0B0E11] fill-current" />
                </div>
                <div className="min-w-0 flex-1">
                   <p className="text-[9px] sm:text-[10px] font-black text-white uppercase tracking-tight truncate">{t('asset.holdToEarnMode') || '持币生息模式'}</p>
                   <p className="text-[7px] sm:text-[8px] text-[#848E9C] font-bold uppercase tracking-tighter mt-0.5 line-clamp-2">{t('asset.walletHoldAutoInterest') || '钱包持币 • 自动计息 • 无需质押'}</p>
                </div>
              </div>
            </div>
            
            {/* Tiers List Section */}
            <div className="px-3 sm:px-5 space-y-2 sm:space-y-2.5 overflow-y-auto flex-1 pb-3 sm:pb-4 no-scrollbar">
              {VIP_TIERS.map((tier) => {
                const isActive = currentTier?.level === tier.level;
                return (
                <div 
                  key={tier.level} 
                  className={`relative p-3 sm:p-4 rounded-xl border transition-all group ${isActive ? 'bg-white/5 border-[#FCD535]/50 shadow-[0_0_20px_rgba(252,213,53,0.05)]' : 'bg-[#1e2329]/40 border-white/5 opacity-60 grayscale-[0.5]'}`}
                >
                  {isActive && (
                    <div className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 bg-[#0ECB81] text-[#0B0E11] px-1.5 sm:px-2 py-0.5 rounded-full text-[6px] sm:text-[7px] font-black uppercase tracking-widest shadow-lg flex items-center gap-0.5 sm:gap-1">
                      <CheckCircle2 className="w-1.5 h-1.5 sm:w-2 sm:h-2" /> Active
                    </div>
                  )}

                  <div className="flex justify-between items-center mb-2 sm:mb-3 gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                       <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-sm sm:text-base flex-shrink-0 ${isActive ? 'bg-gradient-to-br from-[#FCD535] to-orange-400 text-[#0B0E11]' : 'bg-white/5 text-white/40'}`}>
                         V{tier.level}
                       </div>
                       <div className="min-w-0 flex-1">
                         <p className="text-[10px] sm:text-xs font-black text-white uppercase tracking-tight truncate">
                           {tier.level === 1 ? (t('asset.tier1Name') || '🌱 新手') :
                            tier.level === 2 ? (t('asset.tier2Name') || '🌿 进阶') :
                            tier.level === 3 ? (t('asset.tier3Name') || '🌳 资深') :
                            tier.level === 4 ? (t('asset.tier4Name') || '💎 核心') : tier.name}
                         </p>
                         <p className="text-[7px] sm:text-[8px] text-[#848E9C] font-bold uppercase tracking-[0.1em]">{t('asset.protocolNode') || '协议节点'}</p>
                       </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                       <p className={`text-lg sm:text-xl font-black mono leading-none tracking-tighter ${currentTier?.level === tier.level ? 'text-[#FCD535]' : 'text-white/20'}`}>{tier.dailyRate}%</p>
                       <p className="text-[6px] sm:text-[7px] text-[#848E9C] font-bold uppercase tracking-widest mt-0.5">{t('asset.dailyRate') || '日利率'}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-black/20 px-3 py-2 rounded-lg border border-white/5">
                      <span className="text-[8px] text-[#848E9C] font-black uppercase tracking-widest">{t('asset.requirement') || '要求:'}</span>
                      <span className="text-[9px] text-white font-black mono">
                        {tier.min.toLocaleString()} <span className="text-[7px] text-[#848E9C] font-medium">-</span> {tier.max === Infinity ? (t('asset.max') || 'MAX') : tier.max.toLocaleString()} <span className="text-[#848E9C]">RAT</span>
                      </span>
                    </div>
                    
                    {/* 收益说明 - 简化版 */}
                    <div className="bg-gradient-to-r from-[#0ECB81]/5 to-transparent p-2.5 rounded-lg border border-[#0ECB81]/10">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[8px] text-[#848E9C] font-black uppercase tracking-widest">{t('asset.exampleEarnings') || '示例收益'}</span>
                          <TrendingUp className="w-2.5 h-2.5 text-[#0ECB81]" />
                        </div>
                        <div className="space-y-1">
                          {/* 最低持币量收益 */}
                          <div className="flex items-center justify-between text-[9px]">
                            <span className="text-[#848E9C] font-bold">{tier.min.toLocaleString()} RAT:</span>
                            <span className="text-[#0ECB81] font-black mono">
                              ${((tier.min * RAT_PRICE_USDT * tier.dailyRate) / 100).toFixed(2)}<span className="text-[7px] text-[#848E9C]">{t('asset.perDay') || '/天'}</span>
                            </span>
                          </div>
                          {/* 最高持币量收益（如果不是无限） */}
                          {tier.max !== Infinity && (
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="text-[#848E9C] font-bold">{tier.max.toLocaleString()} RAT:</span>
                              <span className="text-[#0ECB81] font-black mono">
                                ${((tier.max * RAT_PRICE_USDT * tier.dailyRate) / 100).toFixed(2)}<span className="text-[7px] text-[#848E9C]">{t('asset.perDay') || '/天'}</span>
                              </span>
                            </div>
                          )}
                          {/* 中间值收益（用于展示） */}
                          {tier.max !== Infinity && (
                            <div className="flex items-center justify-between text-[9px] pt-1 border-t border-white/5">
                              <span className="text-[#848E9C] font-bold">{Math.floor((tier.min + tier.max) / 2).toLocaleString()} RAT:</span>
                              <span className="text-[#FCD535] font-black mono">
                                ${((Math.floor((tier.min + tier.max) / 2) * RAT_PRICE_USDT * tier.dailyRate) / 100).toFixed(2)}<span className="text-[7px] text-[#848E9C]">{t('asset.perDay') || '/天'}</span>
                              </span>
                            </div>
                          )}
                          {/* 无限等级的特殊处理 */}
                          {tier.max === Infinity && (
                            <div className="flex items-center justify-between text-[9px] pt-1 border-t border-white/5">
                              <span className="text-[#848E9C] font-bold">500,000 RAT:</span>
                              <span className="text-[#FCD535] font-black mono">
                                ${((500000 * RAT_PRICE_USDT * tier.dailyRate) / 100).toFixed(2)}<span className="text-[7px] text-[#848E9C]">{t('asset.perDay') || '/天'}</span>
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="pt-1 mt-1 border-t border-white/5">
                          <p className="text-[7px] text-[#848E9C] font-bold leading-relaxed">
                            {t('asset.formula') || '公式: 持币量 × $0.01 × 日利率'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            {/* Footer Section */}
            <div className="p-4 sm:p-5 bg-black/40 border-t border-white/5 flex-shrink-0">
               <button 
                 onClick={() => setShowTierModal(false)}
                 className="w-full bg-[#1e2329] border border-white/10 hover:bg-white/5 text-white font-black py-3 sm:py-4 rounded-xl text-[9px] sm:text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-2 touch-manipulation"
               >
                 {t('asset.acknowledgePrivileges') || '确认特权'}
                 <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
               </button>
               <p className="text-[6px] sm:text-[7px] text-center text-[#848E9C] font-bold uppercase tracking-widest mt-2 sm:mt-3 opacity-50">{t('asset.protocolLayer') || 'Rabbit AI 去中心化协议层 2'}</p>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW MODAL - AS PREVIOUSLY IMPLEMENTED */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center px-2 sm:px-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#1e2329] w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-200 max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/5 flex justify-between items-center flex-shrink-0">
              <h3 className="font-black uppercase tracking-widest text-xs sm:text-sm">Withdrawal Node</h3>
              <button onClick={() => setShowWithdrawModal(false)} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-full transition-colors touch-manipulation flex-shrink-0">
                 <X className="w-4 h-4 sm:w-5 sm:h-5 text-[#848E9C]" />
              </button>
            </div>
            
            <div className="p-4 sm:p-7 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
              {/* Energy Info Card - Always Visible */}
              <div className="bg-gradient-to-r from-[#FCD535]/10 to-transparent p-3 sm:p-5 rounded-2xl border border-[#FCD535]/20 space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FCD535]" />
                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#848E9C]">{t('asset.energySystem') || '能量系统'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="bg-black/20 p-2 sm:p-3 rounded-xl border border-white/5">
                    <p className="text-[7px] sm:text-[8px] text-[#848E9C] font-bold uppercase tracking-widest mb-1">当前能量</p>
                    <p className={`text-base sm:text-lg font-black mono ${stats.energy >= ENERGY_WITHDRAW_THRESHOLD ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
                      {stats.energy}
                    </p>
                  </div>
                  <div className="bg-black/20 p-2 sm:p-3 rounded-xl border border-white/5">
                    <p className="text-[7px] sm:text-[8px] text-[#848E9C] font-bold uppercase tracking-widest mb-1">能量阈值</p>
                    <p className="text-base sm:text-lg font-black mono text-[#FCD535]">{ENERGY_WITHDRAW_THRESHOLD}</p>
                  </div>
                  <div className="bg-black/20 p-2 sm:p-3 rounded-xl border border-white/5">
                    <p className="text-[7px] sm:text-[8px] text-[#848E9C] font-bold uppercase tracking-widest mb-1">所需能量</p>
                    <p className="text-base sm:text-lg font-black mono text-[#F6465D]">
                      {Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW) || '0'}
                    </p>
                  </div>
                </div>
                {stats.energy < ENERGY_WITHDRAW_THRESHOLD && (
                  <div className="mt-2 p-2.5 sm:p-3 bg-red-500/10 rounded-xl border border-red-500/20 flex items-start gap-2">
                    <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[8px] sm:text-[9px] text-red-400 font-bold uppercase tracking-tight leading-relaxed">
                      {t('asset.energyInsufficient') || '能量值不足：最低需要'} {ENERGY_WITHDRAW_THRESHOLD} {t('asset.energyRequired') || '能量才能提现。请先领取空投或邀请好友获取能量。'}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#848E9C]">
                  <span>{t('asset.availableLiquidity') || 'Available Liquidity'}</span>
                  <span className="text-white text-[8px] sm:text-[10px]">${earnings ? earnings.pendingUsdt.toFixed(4) : stats.pendingUsdt.toFixed(4)} USDT</span>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    max={earnings ? earnings.pendingUsdt : stats.pendingUsdt}
                    value={withdrawAmount}
                    onChange={e => {
                      const val = e.target.value;
                      const numVal = parseFloat(val);
                      const maxVal = earnings ? earnings.pendingUsdt : stats.pendingUsdt;
                      // 限制输入不超过可提现余额
                      if (val === '' || (!isNaN(numVal) && numVal >= 0 && numVal <= maxVal)) {
                        setWithdrawAmount(val);
                      }
                    }}
                    disabled={stats.energy < ENERGY_WITHDRAW_THRESHOLD}
                    className={`w-full bg-[#0b0e11] border rounded-2xl py-4 sm:py-5 px-4 sm:px-5 text-xl sm:text-2xl font-black mono text-white outline-none transition-colors touch-manipulation ${
                      stats.energy < ENERGY_WITHDRAW_THRESHOLD 
                        ? 'border-red-500/20 opacity-50 cursor-not-allowed' 
                        : 'border-white/5 focus:border-[#FCD535]'
                    }`}
                    placeholder="0.00"
                  />
                  <button 
                    onClick={() => {
                      if (stats.energy < ENERGY_WITHDRAW_THRESHOLD) {
                        alert(`${t('asset.energyInsufficient') || '能量值不足：最低需要'} ${ENERGY_WITHDRAW_THRESHOLD} ${t('asset.energyRequired') || '能量才能提现。请先领取空投或邀请好友获取能量。'}`);
                        return;
                      }
                      const maxVal = earnings ? earnings.pendingUsdt : stats.pendingUsdt;
                      setWithdrawAmount(maxVal.toFixed(2));
                    }} 
                    disabled={stats.energy < ENERGY_WITHDRAW_THRESHOLD}
                    className={`absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 text-[9px] sm:text-[10px] font-black px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border transition-colors touch-manipulation ${
                      stats.energy < ENERGY_WITHDRAW_THRESHOLD
                        ? 'text-[#848E9C] bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                        : 'text-[#FCD535] bg-[#FCD535]/10 border-[#FCD535]/20 hover:bg-[#FCD535]/20 active:bg-[#FCD535]/30'
                    }`}
                  >
                    {t('common.max') || 'MAX'}
                  </button>
                </div>
              </div>

              <div className="bg-black/20 p-3 sm:p-5 rounded-2xl border border-white/5 space-y-2 sm:space-y-3">
                 <div className="flex justify-between text-[9px] sm:text-[10px] font-bold uppercase">
                    <span className="text-[#848E9C]">{t('asset.networkFee') || 'Network Fee'}</span>
                    <span className="text-[#0ECB81]">{t('asset.free') || 'Free'}</span>
                 </div>
                 <div className="flex justify-between text-[9px] sm:text-[10px] font-bold uppercase">
                    <span className="text-[#848E9C]">{t('asset.energyBurn') || 'Energy Burn'}</span>
                    <span className="text-[#F6465D] mono">-{Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW)} {t('asset.units') || 'Units'}</span>
                 </div>
                 <div className="flex justify-between text-[9px] sm:text-[10px] font-bold uppercase pt-2 border-t border-white/5">
                    <span className="text-[#848E9C]">{t('asset.remainingEnergy') || 'Remaining Energy'}</span>
                    <span className={`mono ${stats.energy - Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW) >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
                      {stats.energy - Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW)} {t('asset.units') || 'Units'}
                    </span>
                 </div>
              </div>

              <button 
                onClick={async () => {
                  // 首先检查能量启动门槛 - 如果能量不足，直接阻止提交
                  if (stats.energy < ENERGY_WITHDRAW_THRESHOLD) {
                    alert(`${t('asset.energyInsufficient') || '能量值不足：最低需要'} ${ENERGY_WITHDRAW_THRESHOLD} ${t('asset.energyRequired') || '能量才能提现。请先领取空投或邀请好友获取能量。'}`);
                    return;
                  }

                  const amount = parseFloat(withdrawAmount || '0');
                  
                  // 验证输入
                  if (!withdrawAmount || amount <= 0) {
                    alert('请输入有效的提现金额');
                    return;
                  }
                  
                  const availableUsdt = earnings ? earnings.pendingUsdt : stats.pendingUsdt;
                  if (amount > availableUsdt) {
                    alert('提现金额不能超过可提现余额');
                    return;
                  }
                  
                  // 计算所需能量：Amount * 10
                  const requiredEnergy = Math.ceil(amount * ENERGY_PER_USDT_WITHDRAW);
                  
                  // 检查能量是否足够支付本次提现
                  if (stats.energy < requiredEnergy) {
                    alert(`能量不足，提现 ${amount.toFixed(2)} USDT 需要 ${requiredEnergy} 能量，当前能量：${stats.energy}`);
                    return;
                  }

                  try {
                    setLoading(true);
                    await applyWithdraw(stats.address, withdrawAmount);
                    setShowWithdrawModal(false);
                    setWithdrawAmount('');
                    // 刷新数据
                    const earningsData = await fetchEarnings(stats.address);
                    setStats(prev => ({ 
                      ...prev, 
                      pendingUsdt: parseFloat(earningsData.pendingUsdt || '0'),
                      energy: prev.energy - requiredEnergy
                    }));
                    // 触发能量刷新事件
                    window.dispatchEvent(new CustomEvent('refreshEnergy'));
                  } catch (error: any) {
                    console.error('Withdraw failed:', error);
                    const errorMsg = error?.response?.data?.message || error?.message || (t('asset.withdrawFailed') || '提现失败');
                    alert(errorMsg);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={
                  stats.energy < ENERGY_WITHDRAW_THRESHOLD || 
                  !withdrawAmount || 
                  parseFloat(withdrawAmount) <= 0 || 
                  parseFloat(withdrawAmount) > (earnings ? earnings.pendingUsdt : stats.pendingUsdt) ||
                  stats.energy < Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW) || 
                  loading
                }
                className="w-full bg-[#FCD535] text-[#0B0E11] font-black py-4 sm:py-5 rounded-2xl disabled:opacity-20 disabled:cursor-not-allowed text-xs sm:text-sm uppercase tracking-[0.2em] shadow-lg shadow-[#FCD535]/10 active:scale-95 transition-all touch-manipulation flex-shrink-0"
              >
                {loading ? (t('asset.processing') || '处理中...') : (t('asset.executeTransaction') || '执行交易')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetView;
