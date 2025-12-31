
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ethers } from 'ethers';
import { TrendingUp, ArrowUpRight, ShieldCheck, Info, X, ChevronRight, Activity, Wallet2, Lock, ShieldEllipsis, Star, Sparkles, Gem, Target, Zap, Crown, CheckCircle2 } from 'lucide-react';
import { UserStats } from '../types';
import { RAT_PRICE_USDT, VIP_TIERS, ENERGY_PER_USDT_WITHDRAW, PROTOCOL_STATS, CONTRACTS, ABIS } from '../constants';
import { fetchRatBalance, fetchEarnings, applyWithdraw, fetchUserInfo, getWithdrawHistory } from '../api';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { getProvider, getContract } from '../services/web3Service';
import WithdrawalSuccessModal from '../components/WithdrawalSuccessModal';
import { RollingNumber } from '../components/RollingNumber';

interface AssetViewProps {
  stats: UserStats;
  setStats: React.Dispatch<React.SetStateAction<UserStats>>;
}

const AssetView: React.FC<AssetViewProps> = ({ stats, setStats }) => {
  const { t } = useLanguage();
  const { showError, showWarning, showInfo, showSuccess } = useToast();
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
  // 提现弹窗中的能量值（实时从API获取，响应更快）
  const [modalEnergy, setModalEnergy] = useState<number | null>(null);
  // 总奖励动态增长值（每小时随机增加3位数字）
  const [totalRewardGrowth, setTotalRewardGrowth] = useState(0);
  // 提现到账庆祝弹窗
  const [newSuccessWithdrawal, setNewSuccessWithdrawal] = useState<{amount: string, id: string} | null>(null);
  // 实时累计收益相关状态
  const [realTimeEarnings, setRealTimeEarnings] = useState<number | null>(null);
  const [earningsBaseTime, setEarningsBaseTime] = useState<number | null>(null); // 记录上次获取收益的时间戳
  const [earningsBaseValue, setEarningsBaseValue] = useState<number>(0); // 记录上次获取的收益值（仅持币计算的收益，不含赠送）
  const [calculatedEarningsBase, setCalculatedEarningsBase] = useState<number>(0); // 记录持币计算的收益基准值（不含赠送）

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
            const { callWithRetry } = await import('../services/web3Service');
            const ratContract = await getContract(CONTRACTS.RAT_TOKEN, ABIS.ERC20);
            
            // 使用 callWithRetry 包装 RPC 调用，自动处理 429 错误
            const balanceWei = await callWithRetry(
              () => ratContract.balanceOf(stats.address),
              {
                maxRetries: 3,
                baseDelay: 1000,
                onRetry: (attempt) => {
                  console.warn(`[AssetView] RPC 速率限制，重试余额查询 ${attempt}/3...`);
                }
              }
            );
            
            let decimals: number = 18; // 默认18位小数
            try {
              const decimalsResult = await callWithRetry(
                () => ratContract.decimals(),
                {
                  maxRetries: 2,
                  baseDelay: 500
                }
              );
              decimals = typeof decimalsResult === 'number' ? decimalsResult : Number(decimalsResult);
            } catch {
              // 使用默认值
            }
            
            // 使用 formatUnits 保持精度，只在最后转换为 number
            const balanceFormatted = ethers.utils.formatUnits(balanceWei as any, decimals);
            ratBalanceFromChain = parseFloat(balanceFormatted);
            setRatBalance(ratBalanceFromChain);
            // 更新 stats 中的 ratBalance
            setStats(prev => ({ ...prev, ratBalance: ratBalanceFromChain || 0 }));
          }
        } catch (chainError: any) {
          const errorMessage = chainError?.message || chainError?.toString() || '';
          const errorCode = chainError?.code;
          
          // 检测 429 错误（Too Many Requests）
          const isRateLimitError = errorCode === -16429 ||
                                   errorMessage.includes('429') || 
                                   errorMessage.includes('Too Many Requests') ||
                                   errorMessage.includes('Too many requests');
          
          if (isRateLimitError) {
            console.warn('[AssetView] RPC 速率限制，所有重试均失败，跳过本次链上余额查询');
            // 429 错误时，不尝试从 API 获取，直接跳过（避免增加服务器负担）
            setRatBalanceError(true);
          } else {
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
        }
        
        // 获取收益信息（从后端API）
        setEarningsError(false);
        try {
          const earningsData = await fetchEarnings(stats.address);
          const pendingUsdtValue = parseFloat(earningsData.pendingUsdt || '0');
          setEarnings({
            pendingUsdt: pendingUsdtValue,
            dailyRate: earningsData.dailyRate || 0,
            currentTier: earningsData.currentTier || 0,
            holdingDays: earningsData.holdingDays || 0,
          });
          
          // 计算持币产生的收益基准值（不含赠送）
          // 如果用户达到持币标准，计算持币收益 = 预计每日收益 * 持币天数
          let calculatedBase = 0;
          if (earningsData.currentTier > 0 && ratBalanceFromChain !== null) {
            const dailyRate = earningsData.dailyRate || 0;
            const holdingDays = earningsData.holdingDays || 0;
            // 计算持币收益：持币量 × $0.01 × 日利率 × 持币天数
            calculatedBase = ratBalanceFromChain * 0.01 * (dailyRate / 100) * holdingDays;
          }
          
          // === 🟢 修复开始：智能锚定时间戳逻辑 ===
          // 更新实时收益的基准值和基准时间
          // earningsBaseValue 用于显示（包含赠送的USDT）
          // calculatedEarningsBase 用于计算增量（仅持币收益，不含赠送）
          setEarningsBaseValue(pendingUsdtValue);
          setCalculatedEarningsBase(calculatedBase);

          // 读取本地缓存，智能锚定时间戳
          const STORE_KEY = `rabbit_earnings_anchor_${stats.address.toLowerCase()}`;
          let anchorTime = Date.now();

          try {
            const stored = localStorage.getItem(STORE_KEY);
            if (stored) {
              const { baseValue, timestamp } = JSON.parse(stored);
              
              // 逻辑核心：
              // 如果 API 返回的金额(pendingUsdtValue) 和缓存里的基准值(baseValue) 一样
              // 说明后台还没结算新利息，我们应该"沿用"旧的时间戳，让前端动画继续累加
              // 允许微小的浮动误差 (0.0001)
              if (Math.abs(pendingUsdtValue - baseValue) < 0.0001) {
                anchorTime = timestamp; // 保持旧时间，让收益曲线连续！
              } else {
                // 如果金额变了（后台发钱了或结算了），就重置时间戳为现在，并更新缓存
                anchorTime = Date.now();
                localStorage.setItem(STORE_KEY, JSON.stringify({
                  baseValue: pendingUsdtValue,
                  timestamp: anchorTime
                }));
              }
            } else {
              // 第一次存，初始化
              anchorTime = Date.now();
              localStorage.setItem(STORE_KEY, JSON.stringify({
                baseValue: pendingUsdtValue,
                timestamp: anchorTime
              }));
            }
          } catch (e) {
            console.warn('[AssetView] Failed to parse earnings anchor', e);
            // 如果解析失败，使用当前时间
            anchorTime = Date.now();
            try {
              localStorage.setItem(STORE_KEY, JSON.stringify({
                baseValue: pendingUsdtValue,
                timestamp: anchorTime
              }));
            } catch (storageError) {
              console.warn('[AssetView] Failed to save earnings anchor', storageError);
            }
          }

          setEarningsBaseTime(anchorTime); // 使用计算出的锚定时间
          // === 🔴 修复结束 ===

          // 计算初始实时收益值（如果已经有时间差，立即计算增量）
          // 这样可以避免闪烁，让数字从刷新前的值平滑过渡
          let initialRealTimeEarnings = pendingUsdtValue;
          if (earningsData.currentTier > 0 && ratBalanceFromChain !== null) {
            // 直接计算预计每日收益（不依赖 useMemo，因为此时 state 可能还没更新）
            const dailyRate = earningsData.dailyRate || 0;
            const estimatedDaily = ratBalanceFromChain * 0.01 * (dailyRate / 100);
            
            const timeElapsed = (Date.now() - anchorTime) / (1000 * 60); // 已经跑了多少分钟
            const minutesPerDay = 24 * 60;
            const incrementalEarnings = estimatedDaily * (timeElapsed / minutesPerDay);
            const giftedUsdt = pendingUsdtValue - calculatedBase;
            initialRealTimeEarnings = calculatedBase + incrementalEarnings + giftedUsdt;
          }
          
          setRealTimeEarnings(initialRealTimeEarnings);
          // 更新 stats 中的 pendingUsdt
          setStats(prev => ({ ...prev, pendingUsdt: pendingUsdtValue }));
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
    
    let retryCount = 0;
    let currentInterval = 120000; // 初始 120 秒
    
    const scheduleRefresh = () => {
      const timeoutId = setTimeout(async () => {
        try {
          await loadEarningsData();
          // 成功时重置
          retryCount = 0;
          currentInterval = 120000;
        } catch (error: any) {
          retryCount++;
          const status = error?.response?.status;
          // 检测 429 错误（Too Many Requests）
          if (status === 429) {
            console.warn('[AssetView] RPC 速率限制，增加刷新间隔');
            // 指数退避：429 错误时增加间隔
            currentInterval = Math.min(currentInterval * 2, 600000); // 最多 10 分钟
          }
        } finally {
          scheduleRefresh(); // 递归调用，使用动态间隔
        }
      }, currentInterval);
      return timeoutId;
    };
    
    const timeoutId = scheduleRefresh();
    
    // 监听 refreshEnergy 事件，当能量更新时也刷新收益数据
    const handleRefresh = () => {
      loadEarningsData();
    };
    window.addEventListener('refreshEnergy', handleRefresh);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('refreshEnergy', handleRefresh);
    };
  }, [stats.address, setStats]);

  // 总奖励动态增长效果：每小时随机增加3位数字（100-999）
  useEffect(() => {
    // 初始化：从 localStorage 读取上次的增长值，如果没有则从当前时间计算
    const getStoredGrowth = () => {
      try {
        const stored = localStorage.getItem('rabbit_total_reward_growth');
        const storedTime = localStorage.getItem('rabbit_total_reward_growth_time');
        if (stored && storedTime) {
          const lastUpdate = parseInt(storedTime, 10);
          const now = Date.now();
          const hoursPassed = Math.floor((now - lastUpdate) / (1000 * 60 * 60));
          
          // 计算应该增长的值（每小时增加100-999）
          let growth = parseFloat(stored);
          for (let i = 0; i < hoursPassed; i++) {
            growth += Math.floor(Math.random() * 900) + 100; // 100-999
          }
          
          // 更新存储
          localStorage.setItem('rabbit_total_reward_growth', growth.toString());
          localStorage.setItem('rabbit_total_reward_growth_time', now.toString());
          
          return growth;
        }
      } catch (error) {
        console.warn('Failed to read stored growth:', error);
      }
      return 0;
    };

    setTotalRewardGrowth(getStoredGrowth());

    // 每小时更新一次
    const growthInterval = setInterval(() => {
      setTotalRewardGrowth(prev => {
        const newGrowth = prev + Math.floor(Math.random() * 900) + 100; // 100-999
        localStorage.setItem('rabbit_total_reward_growth', newGrowth.toString());
        localStorage.setItem('rabbit_total_reward_growth_time', Date.now().toString());
        return newGrowth;
      });
    }, 60 * 60 * 1000); // 1小时

    return () => clearInterval(growthInterval);
  }, []);

  // 检测新的提现到账（轮询检测 Completed 状态的提现）
  useEffect(() => {
    if (!stats.address || !stats.address.startsWith('0x')) return;

    const checkNewWithdrawals = async () => {
      try {
        // 获取提现记录
        const history = await getWithdrawHistory(stats.address);
        
        // 筛选出状态为 "Completed" 的记录
        const completed = history.filter((item: any) => item.status === 'Completed' || item.status === 'completed');
        
        if (completed.length === 0) return;

        // 从本地缓存读取"已展示过"的ID列表
        const seenIds = JSON.parse(localStorage.getItem('seen_withdrawal_ids') || '[]');

        // 找到最新的一个、且从未展示过的提现记录
        // 按时间倒序排列，找到第一个不在 seenIds 里的记录
        const sortedCompleted = completed.sort((a: any, b: any) => {
          const timeA = new Date(a.time || a.created_at || 0).getTime();
          const timeB = new Date(b.time || b.created_at || 0).getTime();
          return timeB - timeA;
        });

        const newRecord = sortedCompleted.find((item: any) => !seenIds.includes(item.id));

        if (newRecord) {
          // 触发弹窗
          setNewSuccessWithdrawal({
            amount: newRecord.amount || '0',
            id: newRecord.id
          });

          // 立刻将这个ID加入缓存，防止重复弹窗
          seenIds.push(newRecord.id);
          localStorage.setItem('seen_withdrawal_ids', JSON.stringify(seenIds));
        }
      } catch (error) {
        // 静默失败，不影响主流程
        console.warn('[AssetView] Check withdrawal status failed', error);
      }
    };

    // 页面加载时查一次
    checkNewWithdrawals();

    // 之后每 10 秒查一次 (轮询)
    const intervalId = setInterval(checkNewWithdrawals, 10000);

    return () => clearInterval(intervalId);
  }, [stats.address]);

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

  // 实时累计收益计算 - 每100ms更新一次（实现滚动效果）
  useEffect(() => {
    if (!earnings || earnings.currentTier === 0 || estimatedDailyEarnings === null || earningsBaseTime === null) {
      return;
    }

    // 计算实时收益的更新函数
    const updateRealTimeEarnings = () => {
      const now = Date.now();
      const timeElapsed = (now - earningsBaseTime) / (1000 * 60); // 经过的分钟数
      const minutesPerDay = 24 * 60; // 一天有多少分钟
      
      // 计算增量收益：预计每日收益 * (经过的分钟数 / 一天的分钟数)
      // 注意：增量收益只基于持币计算，不包含赠送的USDT
      const incrementalEarnings = estimatedDailyEarnings * (timeElapsed / minutesPerDay);
      
      // 实时收益 = 持币计算的基准收益 + 增量收益 + 赠送的USDT
      // 赠送的USDT = 总基准收益 - 持币计算的基准收益
      const giftedUsdt = earningsBaseValue - calculatedEarningsBase;
      const newRealTimeEarnings = calculatedEarningsBase + incrementalEarnings + giftedUsdt;
      
      setRealTimeEarnings(newRealTimeEarnings);
    };

    // 立即更新一次
    updateRealTimeEarnings();

    // 🚀 优化点：改为 100ms (0.1秒) 刷新一次
    // 这样数字的最后一位小数会疯狂滚动，产生极强的"赚钱感"
    const intervalId = setInterval(updateRealTimeEarnings, 100);

    return () => clearInterval(intervalId);
  }, [earnings, estimatedDailyEarnings, earningsBaseTime, earningsBaseValue, calculatedEarningsBase]);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Portfolio Overview */}
      <div className="relative glass rounded-[2rem] p-7 overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-[0.05]">
          {/* 3D 金币装饰元素 */}
          <div className="relative w-40 h-40">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FCD535]/20 via-[#FCD535]/10 to-[#FCD535]/5 rounded-full blur-xl" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-32 h-32">
                {/* 外圈光晕 */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#FCD535]/30 via-[#FCD535]/15 to-transparent rounded-full blur-2xl" />
                {/* 金币主体 */}
                <div className="absolute inset-2 bg-gradient-to-br from-[#FCD535]/40 via-[#FCD535]/20 to-[#FCD535]/10 rounded-full shadow-[0_8px_32px_rgba(252,213,53,0.15)]" />
                {/* 金币内部纹理 */}
                <div className="absolute inset-4 bg-gradient-to-br from-[#FCD535]/20 via-transparent to-[#FCD535]/10 rounded-full" />
                <div className="absolute inset-6 bg-gradient-to-t from-black/20 via-transparent to-transparent rounded-full" />
                {/* 高光效果 */}
                <div className="absolute top-4 left-4 w-8 h-8 bg-white/10 rounded-full blur-sm" />
                {/* 中心符号 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#FCD535]/30 to-[#FCD535]/10 rounded-full flex items-center justify-center">
                    <span className="text-[#FCD535]/40 text-2xl font-black">$</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
            {!stats.address || !stats.address.startsWith('0x') ? (
              '0.00'
            ) : usdtValuation === null ? (
              <span className="inline-block w-32 h-12 bg-white/5 rounded animate-pulse" />
            ) : ratBalanceError ? (
              <span className="text-[#848E9C]">--</span>
            ) : (
              usdtValuation
            )}
          </div>
          <p className="text-xs text-[#848E9C] font-bold mono">
            ≈ {!stats.address || !stats.address.startsWith('0x') ? (
              '0'
            ) : ratBalance === null ? (
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
        <div className="mt-8 flex items-center border-t border-white/5 pt-4">
          <div className="flex items-center gap-2">
             <ShieldCheck className="w-3.5 h-3.5 text-[#0ECB81]" />
             <span className="text-[10px] font-bold text-[#848E9C]">{t('asset.securedAssets') || 'Secured Assets Protected'}</span>
          </div>
        </div>
      </div>

      {/* Trust Metrics Card */}
      <div className="bg-[#1e2329]/30 border border-white/5 rounded-2xl p-5 flex items-center justify-between backdrop-blur-sm">
        <div className="space-y-1">
          <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest">{t('asset.totalRewardPaid') || 'Total Reward Paid'}</p>
          <p className="text-lg font-black text-white mono">
            ${(() => {
              const totalValue = PROTOCOL_STATS.totalPaidOut + totalRewardGrowth;
              // 如果是整数，不显示小数；否则显示两位小数
              const formatted = totalValue % 1 === 0 
                ? totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return formatted;
            })()}
            <span className="text-[10px] text-[#0ECB81] ml-1">USDT</span>
          </p>
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
                <p className="text-[9px] text-[#848E9C] font-black uppercase tracking-widest">{t('asset.vipUpgradeProgress') || 'VIP 升级进度'}</p>
             </div>
             <p className="text-[10px] text-white font-black mono">
               {!stats.address || !stats.address.startsWith('0x') ? (
                 '0%'
               ) : progress === null ? (
                 <span className="inline-block w-8 h-4 bg-white/5 rounded animate-pulse" />
               ) : (
                 `${progress}%`
               )}
             </p>
          </div>
          <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden mb-4 p-[1px] border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-[#FCD535] via-orange-400 to-[#FCD535] rounded-full transition-all duration-1000 ease-out" 
              style={{ width: (!stats.address || !stats.address.startsWith('0x')) ? '0%' : (progress === null ? '0%' : `${progress}%`), backgroundSize: '200% 100%' }} 
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
            {!stats.address || !stats.address.startsWith('0x') ? (
              <span className="flex items-baseline">
                <span className="text-xl font-normal text-[#848E9C] mr-3">$</span>
                0.0000
              </span>
            ) : earnings === null ? (
              <span className="inline-block w-32 h-12 bg-white/5 rounded animate-pulse" />
            ) : earningsError ? (
              <span className="text-[#848E9C]">--</span>
            ) : earnings.currentTier > 0 && realTimeEarnings !== null ? (
              /* ✨ 使用滚动组件 ✨ */
              /* 🟢 修复：直接显示实时计算的收益，让数字持续跳动（提现时会验证实际可提现金额） */
              <RollingNumber 
                value={realTimeEarnings} 
                decimals={6} // 6 位小数，让滚动更疯狂
                prefix="$"
                className="text-5xl font-black text-white font-mono tracking-tighter"
              />
            ) : (
              /* 未达到标准时，显示静态数字 */
              <span className="flex items-baseline">
                <span className="text-xl font-normal text-[#848E9C] mr-3">$</span>
                {earnings.pendingUsdt.toFixed(4)}
              </span>
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

        <button 
          onClick={async () => {
            // 打开弹窗前，实时获取最新的能量值
            if (stats.address && stats.address.startsWith('0x')) {
              try {
                const userInfo = await fetchUserInfo(stats.address);
                setModalEnergy(Number(userInfo?.energy || 0));
              } catch (error) {
                console.warn('Failed to fetch energy for modal:', error);
                // 如果获取失败，使用 stats.energy 作为后备
                setModalEnergy(stats.energy);
              }
            } else {
              setModalEnergy(stats.energy);
            }
            // 允许打开弹窗，即使能量不足也可以查看能量信息
            setShowWithdrawModal(true);
          }}
          className="w-full group relative font-black py-4 rounded-[1.25rem] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl overflow-hidden bg-[#FCD535] text-[#0B0E11] shadow-[#FCD535]/10"
        >
          <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <span className="relative z-10 text-[11px] uppercase tracking-widest">{t('asset.withdrawal') || '提现'}</span>
          <ArrowUpRight className="w-4 h-4 relative z-10" />
        </button>
      </div>

      {/* VIP TIER EXPLANATION MODAL - REDESIGNED - Using Portal */}
      {showTierModal && createPortal(
        <div 
          className="fixed inset-0 z-[50] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#0b0e11]/95 backdrop-blur-2xl animate-in fade-in duration-300"
          onClick={(e) => {
            // 点击背景关闭弹窗
            if (e.target === e.currentTarget) {
              setShowTierModal(false);
            }
          }}
        >
          <div 
            className="bg-gradient-to-b from-[#1e2329] to-[#0b0e11] w-full sm:max-w-sm rounded-t-[2rem] rounded-b-none sm:rounded-b-[2rem] border-t border-l border-r border-white/10 sm:border border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] sm:shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 overflow-hidden max-h-[92vh] sm:max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Header Section */}
            <div className="relative p-3 sm:p-5 pb-2 sm:pb-3 flex-shrink-0">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-[#FCD535]/20 rounded-b-full" />
              <div className="flex justify-between items-start mb-2 sm:mb-4">
                <div className="space-y-0.5 flex-1 pr-2 min-w-0">
                   <div className="flex items-center gap-1.5 sm:gap-2">
                      <Gem className="w-3 h-3 sm:w-4 sm:h-4 text-[#FCD535] flex-shrink-0" />
                      <h3 className="font-black uppercase tracking-[0.2em] text-[9px] sm:text-xs text-white truncate">{t('asset.vipPrivilege') || 'VIP 特权'}</h3>
                   </div>
                   <p className="text-[7px] sm:text-[9px] text-[#848E9C] font-bold uppercase tracking-widest truncate">{t('asset.holdToEarnRoadmap') || '持币生息路线图 v2.0'}</p>
                </div>
                <button 
                  onClick={() => setShowTierModal(false)} 
                  className="p-1.5 sm:p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all hover:rotate-90 flex-shrink-0 touch-manipulation active:scale-90"
                >
                   <X className="w-4 h-4 sm:w-5 sm:h-5 text-[#848E9C]" />
                </button>
              </div>

              {/* Highlight Card */}
              <div className="bg-gradient-to-r from-[#FCD535]/10 to-transparent p-2 sm:p-3 rounded-xl border border-[#FCD535]/20 flex items-center gap-2 sm:gap-3">
                <div className="w-7 h-7 sm:w-10 sm:h-10 bg-[#FCD535] rounded-xl flex items-center justify-center shadow-lg shadow-[#FCD535]/20 flex-shrink-0">
                   <Zap className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[#0B0E11] fill-current" />
                </div>
                <div className="min-w-0 flex-1">
                   <p className="text-[8px] sm:text-[10px] font-black text-white uppercase tracking-tight truncate">{t('asset.holdToEarnMode') || '持币生息模式'}</p>
                   <p className="text-[6px] sm:text-[8px] text-[#848E9C] font-bold uppercase tracking-tighter mt-0.5 line-clamp-2">{t('asset.walletHoldAutoInterest') || '钱包持币 • 自动计息 • 无需质押'}</p>
                </div>
              </div>
            </div>
            
            {/* Tiers List Section */}
            <div className="px-2 sm:px-5 space-y-1.5 sm:space-y-2.5 overflow-y-auto flex-1 pb-2 sm:pb-4 no-scrollbar">
              {VIP_TIERS.map((tier) => {
                const isActive = currentTier?.level === tier.level;
                const isReached = ratBalance !== null && ratBalance >= tier.min;
                const isNextTarget = !currentTier && tier.level === 1 || (currentTier && tier.level === currentTier.level + 1);
                
                // 计算距离此等级还差多少RAT
                let distanceToTier = 0;
                let progressToTier = 0;
                if (ratBalance !== null) {
                  if (ratBalance < tier.min) {
                    distanceToTier = tier.min - ratBalance;
                    const prevTier = tier.level > 1 ? VIP_TIERS.find(t => t.level === tier.level - 1) : null;
                    const rangeStart = prevTier ? prevTier.max + 1 : 0;
                    const rangeEnd = tier.min;
                    const range = rangeEnd - rangeStart;
                    if (range > 0) {
                      progressToTier = Math.min(Math.max(((ratBalance - rangeStart) / range) * 100, 0), 100);
                    }
                  } else if (ratBalance >= tier.min && ratBalance <= tier.max) {
                    progressToTier = 100;
                  } else {
                    progressToTier = 100;
                  }
                }
                
                return (
                <div 
                  key={tier.level} 
                  className={`relative p-2.5 sm:p-4 rounded-xl border transition-all group ${
                    isActive 
                      ? 'bg-gradient-to-br from-[#FCD535]/20 to-[#FCD535]/5 border-[#FCD535]/50 shadow-[0_0_30px_rgba(252,213,53,0.15)] opacity-100' 
                      : isReached
                      ? 'bg-white/5 border-white/10 opacity-80'
                      : isNextTarget
                      ? 'bg-[#1e2329]/60 border-[#FCD535]/30 opacity-100'
                      : 'bg-[#1e2329]/30 border-white/5 opacity-40 grayscale-[0.3]'
                  }`}
                >
                  {isActive && (
                    <div className="absolute -top-0.5 -right-0.5 sm:-top-1.5 sm:-right-1.5 bg-[#0ECB81] text-[#0B0E11] px-1 sm:px-2 py-0.5 rounded-full text-[5px] sm:text-[7px] font-black uppercase tracking-widest shadow-lg flex items-center gap-0.5 sm:gap-1 z-10">
                      <CheckCircle2 className="w-1 h-1 sm:w-2 sm:h-2" /> {t('asset.active') || 'Active'}
                    </div>
                  )}

                  {/* 进度条 - 显示距离此等级还差多少 */}
                  {!isReached && ratBalance !== null && (
                    <div className="mb-2 sm:mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[7px] sm:text-[8px] text-[#848E9C] font-bold">
                          {t('asset.distanceToTier') || 'Distance to this tier'}
                        </span>
                        <span className={`text-[8px] sm:text-[9px] font-black mono ${isNextTarget ? 'text-[#FCD535]' : 'text-[#848E9C]'}`}>
                          {distanceToTier.toLocaleString()} RAT
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            isNextTarget 
                              ? 'bg-gradient-to-r from-[#FCD535] to-orange-400' 
                              : 'bg-white/10'
                          }`}
                          style={{ width: `${progressToTier}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center mb-1.5 sm:mb-3 gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                       <div className={`w-7 h-7 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-xs sm:text-base flex-shrink-0 transition-all ${
                         isActive 
                           ? 'bg-gradient-to-br from-[#FCD535] to-orange-400 text-[#0B0E11] shadow-lg shadow-[#FCD535]/30' 
                           : isNextTarget
                           ? 'bg-gradient-to-br from-[#FCD535]/30 to-[#FCD535]/10 text-[#FCD535] border border-[#FCD535]/30'
                           : isReached
                           ? 'bg-white/10 text-white/60'
                           : 'bg-white/5 text-white/30'
                       }`}>
                         V{tier.level}
                       </div>
                       <div className="min-w-0 flex-1">
                         <p className={`text-[9px] sm:text-xs font-black uppercase tracking-tight truncate ${
                           isActive ? 'text-white' : isNextTarget ? 'text-[#FCD535]' : isReached ? 'text-white/80' : 'text-white/40'
                         }`}>
                           {tier.level === 1 ? (t('asset.tier1Name') || '🌱 新手') :
                            tier.level === 2 ? (t('asset.tier2Name') || '🌿 进阶') :
                            tier.level === 3 ? (t('asset.tier3Name') || '🌳 资深') :
                            tier.level === 4 ? (t('asset.tier4Name') || '💎 核心') : tier.name}
                         </p>
                         <p className="text-[6px] sm:text-[8px] text-[#848E9C] font-bold uppercase tracking-[0.1em]">{t('asset.protocolNode') || '协议节点'}</p>
                       </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                       <p className={`text-base sm:text-xl font-black mono leading-none tracking-tighter ${
                         isActive ? 'text-[#FCD535]' : isNextTarget ? 'text-[#FCD535]/80' : isReached ? 'text-white/60' : 'text-white/20'
                       }`}>{tier.dailyRate}%</p>
                       <p className="text-[5px] sm:text-[7px] text-[#848E9C] font-bold uppercase tracking-widest mt-0.5">{t('asset.dailyRate') || '日利率'}</p>
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
            <div className="p-3 sm:p-5 bg-black/40 border-t border-white/5 flex-shrink-0" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
               <button 
                 onClick={() => setShowTierModal(false)}
                 className="w-full bg-[#1e2329] border border-white/10 hover:bg-white/5 text-white font-black py-2.5 sm:py-4 rounded-xl text-[8px] sm:text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-2 touch-manipulation min-h-[44px]"
               >
                 {t('asset.acknowledgePrivileges') || '确认特权'}
                 <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
               </button>
               <p className="text-[5px] sm:text-[7px] text-center text-[#848E9C] font-bold uppercase tracking-widest mt-1.5 sm:mt-3 opacity-50">{t('asset.protocolLayer') || 'Rabbit AI 去中心化协议层 2'}</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* WITHDRAW MODAL - Using Portal */}
      {showWithdrawModal && createPortal(
        <div 
          className="fixed inset-0 z-[50] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
          onClick={(e) => {
            // 点击背景关闭弹窗
            if (e.target === e.currentTarget) {
              setShowWithdrawModal(false);
              setModalEnergy(null);
            }
          }}
        >
          <div 
            className="bg-[#1e2329] w-full sm:max-w-sm rounded-t-[2rem] rounded-b-none sm:rounded-b-[2rem] border-t border-l border-r border-white/10 sm:border border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] sm:shadow-[0_0_50px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-200 max-h-[93vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="p-3 sm:p-6 border-b border-white/5 flex justify-between items-center flex-shrink-0">
              <h3 className="font-black uppercase tracking-widest text-[10px] sm:text-sm">{t('asset.withdrawalNode') || 'Withdrawal Node'}</h3>
              <button onClick={() => setShowWithdrawModal(false)} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-full transition-colors touch-manipulation flex-shrink-0 active:scale-90">
                 <X className="w-4 h-4 sm:w-5 sm:h-5 text-[#848E9C]" />
              </button>
            </div>
            
            <div className="p-3 sm:p-7 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
              {/* 收银台风格：超大输入框 */}
              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-center text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-[#848E9C]">
                  <span>{t('asset.availableLiquidity') || 'Available Liquidity'}</span>
                  <span className="text-white">${earnings ? earnings.pendingUsdt.toFixed(4) : stats.pendingUsdt.toFixed(4)} USDT</span>
                </div>
                <div className="relative">
                  <div className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 text-2xl sm:text-4xl font-black text-[#848E9C] pointer-events-none">$</div>
                  <input 
                    type="number" 
                    step="0.01" // 🟢 精度控制：2位小数
                    min="0"
                    max={earnings ? earnings.pendingUsdt : stats.pendingUsdt}
                    value={withdrawAmount}
                    onChange={e => {
                      const val = e.target.value;
                      const numVal = parseFloat(val);
                      const maxVal = earnings ? earnings.pendingUsdt : stats.pendingUsdt;
                      // 🟢 精度控制：限制输入不超过可提现余额，并保留2位小数
                      if (val === '' || (!isNaN(numVal) && numVal >= 0 && numVal <= maxVal)) {
                        // 如果输入了超过2位小数，自动截断
                        if (val.includes('.')) {
                          const parts = val.split('.');
                          if (parts[1] && parts[1].length > 2) {
                            setWithdrawAmount(parts[0] + '.' + parts[1].substring(0, 2));
                            return;
                          }
                        }
                        setWithdrawAmount(val);
                      }
                    }}
                    onBlur={e => {
                      // 🟢 精度控制：失焦时自动格式化为2位小数
                      const val = e.target.value;
                      if (val && !isNaN(parseFloat(val))) {
                        const formatted = parseFloat(val).toFixed(2);
                        setWithdrawAmount(formatted);
                      }
                    }}
                    className="w-full bg-[#0b0e11] border-2 border-white/10 rounded-3xl py-6 sm:py-8 px-12 sm:px-16 text-3xl sm:text-5xl font-black mono text-white outline-none transition-all touch-manipulation min-h-[80px] sm:min-h-[100px] focus:border-[#FCD535] focus:bg-[#0b0e11]/80 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0.00"
                    autoFocus
                  />
                  <button 
                    onClick={() => {
                      const maxVal = earnings ? earnings.pendingUsdt : stats.pendingUsdt;
                      setWithdrawAmount(maxVal.toFixed(2));
                    }} 
                    className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 text-[9px] sm:text-[11px] font-black px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border-2 transition-all touch-manipulation min-h-[36px] text-[#FCD535] bg-[#FCD535]/10 border-[#FCD535]/30 hover:bg-[#FCD535]/20 hover:border-[#FCD535]/50 active:scale-95"
                  >
                    {t('common.max') || 'MAX'}
                  </button>
                </div>
              </div>

              {/* 能量信息：只在用户输入金额后显示 */}
              {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                <div className="bg-black/30 p-3 sm:p-4 rounded-2xl border border-white/5 space-y-2 sm:space-y-2.5">
                  <div className="flex justify-between items-center text-[9px] sm:text-[11px] font-bold uppercase">
                    <span className="text-[#848E9C] flex items-center gap-1.5">
                      <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-[#FCD535]" />
                      {t('asset.energyBurn') || 'Energy Burn'}
                    </span>
                    <span className={`mono font-black ${
                      (modalEnergy !== null ? modalEnergy : stats.energy) >= Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW)
                        ? 'text-[#0ECB81]'
                        : 'text-[#F6465D]'
                    }`}>
                      -{Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW)} {t('asset.units') || 'Units'}
                    </span>
                  </div>
                  {/* === 🔴 能量不足时的强引导 (Growth Hack) === */}
                  {(modalEnergy !== null ? modalEnergy : stats.energy) < Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW) && (
                    <div className="pt-2 border-t border-white/5 space-y-3 animate-in slide-in-from-bottom-2 fade-in">
                      {/* 提示文案 */}
                      <div className="flex items-start gap-2 p-2.5 sm:p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                        <Info className="w-3 h-3 sm:w-4 sm:h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[9px] sm:text-[11px] text-red-400 font-bold leading-relaxed">
                          {(t('asset.energyShortageDesc') || '还差 {amount} 能量。完成下方任务立即获取：').replace('{amount}', String(Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW) - (modalEnergy !== null ? modalEnergy : stats.energy)))}
                        </p>
                      </div>

                      {/* 👇 新增：两个裂变按钮 👇 */}
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <button
                          onClick={async () => {
                            // 复制邀请链接
                            if (stats.address && stats.address.startsWith('0x')) {
                              const link = `${window.location.origin}${window.location.pathname}?ref=${stats.address}`;
                              try {
                                await navigator.clipboard.writeText(link);
                                showInfo(t('asset.inviteLinkCopied') || 'Invitation link copied! Send it to your friends.');
                              } catch (error) {
                                // 降级方案：使用传统方法
                                const textArea = document.createElement('textarea');
                                textArea.value = link;
                                textArea.style.position = 'fixed';
                                textArea.style.opacity = '0';
                                document.body.appendChild(textArea);
                                textArea.select();
                                try {
                                  document.execCommand('copy');
                                  showInfo(t('asset.inviteLinkCopied') || 'Invitation link copied! Send it to your friends.');
                                } catch (err) {
                                  showError(t('asset.copyFailed') || 'Copy failed, please copy the link manually');
                                }
                                document.body.removeChild(textArea);
                              }
                            } else {
                              showError(t('asset.connectWalletFirst') || 'Please connect wallet first');
                            }
                          }}
                          className="bg-[#FCD535] text-[#0B0E11] p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center gap-1.5 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#FCD535]/20"
                        >
                          <span className="text-[10px] sm:text-[11px] font-black uppercase">{t('asset.inviteFriend') || 'Invite Friend'}</span>
                          <span className="text-[8px] sm:text-[9px] font-bold opacity-80">{t('asset.energyPerPerson') || '+2 Energy/person'}</span>
                        </button>

                        <button
                          onClick={() => {
                            // 关闭弹窗去领空投
                            setShowWithdrawModal(false);
                            // 触发切换到挖矿页面的事件
                            window.dispatchEvent(new CustomEvent('switchToMining'));
                            showInfo(t('asset.goToClaimAirdrop') || 'Go to homepage to claim airdrop, get +1 energy each time!');
                          }}
                          className="bg-white/10 text-white p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center gap-1.5 hover:bg-white/20 active:scale-95 transition-all border border-white/20"
                        >
                          <span className="text-[10px] sm:text-[11px] font-black uppercase">{t('asset.claimAirdrop') || 'Claim Airdrop'}</span>
                          <span className="text-[8px] sm:text-[9px] font-bold opacity-60">{t('asset.energyPer4Hours') || '+1 Energy/4h'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 费用信息：简化显示 */}
              {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                <div className="bg-black/20 p-2.5 sm:p-3 rounded-xl border border-white/5">
                  <div className="flex justify-between text-[8px] sm:text-[9px] font-bold uppercase">
                    <span className="text-[#848E9C]">{t('asset.networkFee') || 'Network Fee'}</span>
                    <span className="text-[#0ECB81]">{t('asset.free') || 'Free'}</span>
                  </div>
                </div>
              )}

              <button 
                onClick={async () => {
                  // 使用弹窗中的实时能量值（如果已获取），否则使用 stats.energy
                  const currentEnergy = modalEnergy !== null ? modalEnergy : stats.energy;
                  
                  const amount = parseFloat(withdrawAmount || '0');
                  
                  // 验证输入
                  if (!withdrawAmount || amount <= 0) {
                    showError(t('asset.invalidWithdrawAmount') || 'Please enter a valid withdrawal amount');
                    return;
                  }
                  
                  const availableUsdt = earnings ? earnings.pendingUsdt : stats.pendingUsdt;
                  if (amount > availableUsdt) {
                    showError(t('asset.withdrawAmountExceeded') || 'Withdrawal amount cannot exceed available balance');
                    return;
                  }
                  
                  // 计算所需能量：Amount * 10
                  const requiredEnergy = Math.ceil(amount * ENERGY_PER_USDT_WITHDRAW);
                  
                  // 检查能量是否足够支付本次提现
                  if (currentEnergy < requiredEnergy) {
                    // 狼性优化：点击报错按钮，直接触发复制邀请链接
                    if (stats.address && stats.address.startsWith('0x')) {
                      const link = `${window.location.origin}${window.location.pathname}?ref=${stats.address}`;
                      try {
                        await navigator.clipboard.writeText(link);
                        showWarning((t('asset.energyShortageWithLink') || 'Energy shortage! Invitation link copied, go invite friends to replenish energy! (Need {amount} more)').replace('{amount}', String(requiredEnergy - currentEnergy)));
                      } catch (error) {
                        // 降级方案：使用传统方法
                        const textArea = document.createElement('textarea');
                        textArea.value = link;
                        textArea.style.position = 'fixed';
                        textArea.style.opacity = '0';
                        document.body.appendChild(textArea);
                        textArea.select();
                        try {
                          document.execCommand('copy');
                          showWarning((t('asset.energyShortageWithLink') || 'Energy shortage! Invitation link copied, go invite friends to replenish energy! (Need {amount} more)').replace('{amount}', String(requiredEnergy - currentEnergy)));
                        } catch (err) {
                          showWarning((t('asset.energyShortageWithAmount') || 'Energy shortage, withdrawing {usdt} USDT requires {energy} energy. Invite friends or claim airdrop to get energy!').replace('{usdt}', amount.toFixed(2)).replace('{energy}', String(requiredEnergy)));
                        }
                        document.body.removeChild(textArea);
                      }
                    } else {
                      showWarning((t('asset.energyShortageWithWallet') || 'Energy shortage, withdrawing {usdt} USDT requires {energy} energy. Please connect wallet first, then invite friends or claim airdrop to get energy!').replace('{usdt}', amount.toFixed(2)).replace('{energy}', String(requiredEnergy)));
                    }
                    return;
                  }

                  try {
                    setLoading(true);
                    await applyWithdraw(stats.address, withdrawAmount);
                    setShowWithdrawModal(false);
                    setWithdrawAmount('');
                    // 🟢 错误处理：自动刷新数据（处理多端不同步问题）
                    try {
                      const earningsData = await fetchEarnings(stats.address);
                      const userInfo = await fetchUserInfo(stats.address);
                      const updatedEnergy = Number(userInfo?.energy || 0);
                      setModalEnergy(updatedEnergy);
                      setStats(prev => ({ 
                        ...prev, 
                        pendingUsdt: parseFloat(earningsData.pendingUsdt || '0'),
                        energy: updatedEnergy
                      }));
                      // 刷新收益数据
                      setEarnings({
                        pendingUsdt: parseFloat(earningsData.pendingUsdt || '0'),
                        dailyRate: earningsData.dailyRate || 0,
                        currentTier: earningsData.currentTier || 0,
                        holdingDays: earningsData.holdingDays || 0,
                      });
                      // 触发能量刷新事件
                      window.dispatchEvent(new CustomEvent('refreshEnergy'));
                      showSuccess(t('asset.withdrawSuccess') || '提现申请已提交，等待审核');
                    } catch (refreshError) {
                      console.warn('[AssetView] Failed to refresh data after withdraw:', refreshError);
                      showSuccess(t('asset.withdrawSuccess') || '提现申请已提交，等待审核');
                    }
                  } catch (error: any) {
                    console.error('Withdraw failed:', error);
                    const errorMsg = error?.response?.data?.message || error?.message || (t('asset.withdrawFailed') || '提现失败');
                    
                    // 🟢 错误处理：检测多端不同步或余额不足，自动刷新数据
                    if (errorMsg.includes('USDT_NOT_ENOUGH') || 
                        errorMsg.includes('not enough') || 
                        errorMsg.includes('concurrent') ||
                        errorMsg.includes('余额不足')) {
                      // 自动刷新数据
                      try {
                        const earningsData = await fetchEarnings(stats.address);
                        const userInfo = await fetchUserInfo(stats.address);
                        setStats(prev => ({
                          ...prev,
                          pendingUsdt: parseFloat(earningsData.pendingUsdt || '0'),
                          energy: userInfo.energy,
                        }));
                        setEarnings({
                          pendingUsdt: parseFloat(earningsData.pendingUsdt || '0'),
                          dailyRate: earningsData.dailyRate || 0,
                          currentTier: earningsData.currentTier || 0,
                          holdingDays: earningsData.holdingDays || 0,
                        });
                        showError((t('asset.dataRefreshed') || '数据已更新，请重新尝试提现') + ` (${errorMsg})`);
                      } catch (refreshError) {
                        showError(errorMsg);
                      }
                    } else {
                      showError(errorMsg);
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={
                  !withdrawAmount || 
                  parseFloat(withdrawAmount) <= 0 || 
                  parseFloat(withdrawAmount) > (earnings ? earnings.pendingUsdt : stats.pendingUsdt) ||
                  loading
                }
                className={`w-full font-black py-4 sm:py-6 rounded-2xl disabled:opacity-30 disabled:cursor-not-allowed text-sm sm:text-base uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all touch-manipulation flex-shrink-0 min-h-[56px] ${
                  withdrawAmount && parseFloat(withdrawAmount) > 0 && (modalEnergy !== null ? modalEnergy : stats.energy) >= Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW)
                    ? 'bg-[#FCD535] text-[#0B0E11] shadow-[#FCD535]/20'
                    : withdrawAmount && parseFloat(withdrawAmount) > 0
                    ? 'bg-red-500/20 text-red-400 border-2 border-red-500/50 shadow-red-500/10'
                    : 'bg-[#FCD535] text-[#0B0E11] shadow-[#FCD535]/20'
                }`}
              >
                {loading ? (
                  t('asset.processing') || '处理中...'
                ) : !withdrawAmount || parseFloat(withdrawAmount) <= 0 ? (
                  t('asset.enterAmount') || '请输入提现金额'
                ) : (modalEnergy !== null ? modalEnergy : stats.energy) >= Math.ceil(parseFloat(withdrawAmount || '0') * ENERGY_PER_USDT_WITHDRAW) ? (
                  t('asset.confirmWithdraw') || '确认提现'
                ) : (
                  t('asset.insufficientEnergy') || '能量不足'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 提现到账庆祝弹窗 */}
      {newSuccessWithdrawal && stats.address && (
        <WithdrawalSuccessModal 
          amount={newSuccessWithdrawal.amount}
          userAddress={stats.address}
          onClose={() => setNewSuccessWithdrawal(null)}
        />
      )}
    </div>
  );
};

export default AssetView;
