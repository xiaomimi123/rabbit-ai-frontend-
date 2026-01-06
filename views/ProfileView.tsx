
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ethers } from 'ethers';
import { User, Shield, Battery, Users2, Trophy, ChevronRight, Gift, Handshake, CreditCard, Clock, Activity, Zap, X, TrendingUp, Info, Copy, Check, LogOut, ArrowUpRight, CheckCircle2, Wallet } from 'lucide-react';
import { UserStats, HistoryItem } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { fetchUserInfo, fetchTeamRewards, getWithdrawHistory, getClaimsHistory, getReferralHistory, getPublicEnergyConfig } from '../api';
import { shortenAddress, disconnectWallet } from '../services/web3Service';
// 🟢 已移除：不再使用硬编码的 ENERGY_PER_USDT_WITHDRAW，改用动态配置 energyConfig.withdraw_energy_ratio
import ActivityHistoryView from './ActivityHistoryView';

interface ProfileViewProps {
  stats: UserStats;
}

const ProfileView: React.FC<ProfileViewProps> = ({ stats }) => {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [showEnergyModal, setShowEnergyModal] = useState(false);
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [energy, setEnergy] = useState(stats.energy);
  const [teamRewards, setTeamRewards] = useState<string>('0');
  const [inviteCount, setInviteCount] = useState(stats.teamSize);
  const [timelineHistory, setTimelineHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  
  // 🟢 新增：能量配置状态（动态从后端加载）
  const [energyConfig, setEnergyConfig] = useState({
    withdraw_energy_ratio: 10,      // 提现能量消耗比例（默认值）
    claim_self_reward: 1,            // 用户自己领取空投获得的能量（默认值）
    claim_referrer_first: 3,         // 推荐人首次邀请获得的能量（默认值）
    claim_referrer_repeat: 1,        // 推荐人非首次邀请获得的能量（默认值）
  });

  // ✅ 自动修复缺失数据：检查链上状态，如果链上有数据但数据库没有，自动同步
  const autoFixMissingData = async (address: string) => {
    try {
      console.log('[ProfileView] [autoFixMissingData] 开始检查链上状态...');
      
      // 从链上读取 lastClaimTime
      const { getProvider, getContract } = await import('../services/web3Service');
      const { CONTRACTS, ABIS } = await import('../constants');
      const { callWithRetry } = await import('../services/web3Service');
      
      const provider = getProvider();
      if (!provider) {
        console.warn('[ProfileView] [autoFixMissingData] 无法获取 provider，跳过自动修复');
        return;
      }
      
      const contract = await getContract(CONTRACTS.AIRDROP, ABIS.AIRDROP, undefined);
      
      // 读取链上的 lastClaimTime
      const lastClaim = await callWithRetry(
        () => contract.lastClaimTime(address),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt, error) => {
            console.warn(`[ProfileView] [autoFixMissingData] RPC 重试 ${attempt}/3...`);
          }
        }
      );
      
      const lastClaimNum = Number(lastClaim);
      console.log('[ProfileView] [autoFixMissingData] 链上 lastClaimTime:', lastClaimNum);
      
      // 如果链上有 lastClaimTime > 0，说明用户已经领取过，但数据库没有记录
      if (lastClaimNum > 0) {
        console.log('[ProfileView] [autoFixMissingData] ⚠️ 检测到链上有数据但数据库没有，开始自动修复...');
        
        // 查找最近的 Claimed 事件来获取交易哈希
        try {
          const iface = new ethers.utils.Interface(ABIS.AIRDROP);
          const currentBlock = await provider.getBlockNumber();
          const fromBlock = Math.max(0, currentBlock - 10000); // 最近 10000 个区块
          
          console.log('[ProfileView] [autoFixMissingData] 搜索 Claimed 事件，区块范围:', fromBlock, 'to', currentBlock);
          
          const logs = await callWithRetry(
            () => provider.getLogs({
              address: CONTRACTS.AIRDROP,
              fromBlock: fromBlock,
              toBlock: currentBlock,
              topics: [iface.getEventTopic('Claimed')],
            }),
            {
              maxRetries: 3,
              baseDelay: 1000,
            }
          );
          
          // 查找该用户的 Claimed 事件
          let userTxHash: string | null = null;
          for (const log of logs) {
            try {
              const parsed = iface.parseLog(log);
              if (parsed.name === 'Claimed') {
                const user = String(parsed.args.user).toLowerCase();
                if (user === address.toLowerCase()) {
                  userTxHash = log.transactionHash;
                  console.log('[ProfileView] [autoFixMissingData] 找到用户的 Claimed 事件，交易哈希:', userTxHash);
                  break;
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
          
          if (userTxHash) {
            // 调用 verifyClaim API 自动修复
            console.log('[ProfileView] [autoFixMissingData] 调用 verifyClaim API 修复数据...');
            const { verifyClaim } = await import('../api');
            
            // 尝试从 localStorage 获取推荐人
            let referrer = '0x0000000000000000000000000000000000000000';
            try {
              const stored = localStorage.getItem('rabbit_referrer');
              if (stored && ethers.utils.isAddress(stored)) {
                referrer = stored;
              }
            } catch (e) {
              // 忽略
            }
            
            const result = await verifyClaim(address, userTxHash, referrer);
            
            if (result?.ok) {
              console.log('[ProfileView] [autoFixMissingData] ✅ 自动修复成功！', result);
              
              // 重新加载数据
              setTimeout(() => {
                loadExtraData();
              }, 1000);
            } else {
              console.warn('[ProfileView] [autoFixMissingData] ⚠️ 自动修复失败:', result);
            }
          } else {
            console.warn('[ProfileView] [autoFixMissingData] ⚠️ 未找到用户的 Claimed 事件，无法自动修复');
          }
        } catch (error) {
          console.error('[ProfileView] [autoFixMissingData] 查找交易失败:', error);
        }
      } else {
        console.log('[ProfileView] [autoFixMissingData] 链上也没有数据，用户确实未领取过');
      }
    } catch (error) {
      console.error('[ProfileView] [autoFixMissingData] 自动修复检查失败:', error);
      // 不抛出错误，避免影响正常流程
    }
  };

  // 加载用户额外数据
  const loadExtraData = async () => {
    try {
      if (!stats.address || !stats.address.startsWith('0x')) {
        console.warn('[ProfileView] 无效的地址:', stats.address);
        return;
      }
      
      console.log('[ProfileView] 开始加载用户数据，地址:', stats.address);
      
      const [info, teamData] = await Promise.all([
        fetchUserInfo(stats.address).catch((err) => {
          console.error('[ProfileView] Failed to fetch user info:', err);
          console.error('[ProfileView] 错误详情:', {
            message: err?.message,
            response: err?.response?.data,
            status: err?.response?.status,
            address: stats.address,
          });
          return { energy: 0, inviteCount: 0, referrer: '', usdtAvailable: 0, usdtTotal: 0, usdtLocked: 0 };
        }),
        fetchTeamRewards(stats.address).catch((err) => {
          console.error('[ProfileView] Failed to fetch team rewards:', err);
          console.error('[ProfileView] 错误详情:', {
            message: err?.message,
            response: err?.response?.data,
            status: err?.response?.status,
            address: stats.address,
          });
          return { totalRewards: '0' };
        }),
      ]);
      
      // 详细打印返回的数据，使用 JSON.stringify 确保能看到所有字段
      console.log('[ProfileView] Loaded user data - fullInfo:', JSON.stringify(info, null, 2));
      console.log('[ProfileView] Loaded user data - fullTeamData:', JSON.stringify(teamData, null, 2));
      console.log('[ProfileView] Loaded user data - summary:', {
        inviteCount: info?.inviteCount,
        energy: info?.energy,
        energyTotal: info?.energyTotal,
        energyLocked: info?.energyLocked,
        usdtAvailable: info?.usdtAvailable,
        usdtTotal: info?.usdtTotal,
        usdtLocked: info?.usdtLocked,
        teamRewards: teamData?.totalRewards,
        address: stats.address,
        normalizedAddress: stats.address?.toLowerCase(),
        infoKeys: info ? Object.keys(info) : [],
        teamDataKeys: teamData ? Object.keys(teamData) : [],
      });
      
      setEnergy(Number(info?.energy || 0));
      setInviteCount(Number(info?.inviteCount || 0));
      setTeamRewards(teamData?.totalRewards || '0');
      
      // 加载时间轴历史记录
      await loadTimelineHistory();
      
      // ✅ 自动修复：如果数据为 0，检查链上状态并自动同步（在加载历史记录后）
      // 只在能量和邀请数都为 0 时触发，避免频繁检查
      if (Number(info?.energy || 0) === 0 && Number(info?.inviteCount || 0) === 0) {
        console.log('[ProfileView] 检测到数据为 0，开始自动修复检查...');
        // 异步执行，不阻塞 UI
        autoFixMissingData(stats.address).catch(err => {
          console.error('[ProfileView] 自动修复失败:', err);
        });
      }
    } catch (e) {
      console.error('[ProfileView] Error loading profile data:', e);
      console.error('[ProfileView] 错误堆栈:', e instanceof Error ? e.stack : 'N/A');
      setEnergy(0);
      setInviteCount(0);
      setTeamRewards('0');
      setTimelineHistory([]);
    }
  };

  // 加载时间轴历史记录（空投、邀请、提现）
  const loadTimelineHistory = async () => {
    // ✅ 优化：延迟设置加载状态，避免快速加载时的闪烁
    let loadingTimeout: NodeJS.Timeout | null = null;
    
    try {
      if (!stats.address || !stats.address.startsWith('0x')) {
        setTimelineHistory([]);
        setIsLoading(false);
        return;
      }

      loadingTimeout = setTimeout(() => {
        setIsLoading(true);
      }, 300); // 300ms 后才显示加载状态

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

      // 2. 邀请记录（包括每次下级领取的能量奖励）
      if (Array.isArray(referrals) && referrals.length > 0) {
        referrals.forEach((ref: any) => {
          // ✅ 使用后端返回的动态能量值（第一次3点，之后1点）
          const energy = Number(ref.energy || 1);
          const createdAt = ref.createdAt || ref.time || new Date().toISOString();
          // 使用实际的奖励金额，如果没有则显示 0
          const rewardAmount = parseFloat(ref.rewardAmount || '0');
          // 判断是否是第一次领取，用于显示不同的描述
          const isFirstClaim = ref.isFirstClaim !== false; // 默认为 true（兼容旧数据）
          
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
            amount: rewardAmount.toFixed(2), // 使用实际奖励金额，保留2位小数
            currency: 'RAT',
            energyChange: energy,
          });
        });
      }

      // 3. 提现记录
      if (Array.isArray(withdrawals) && withdrawals.length > 0) {
        withdrawals.forEach((withdraw: any) => {
          // 🟢 优先使用后端返回的实际能量消耗值（历史记录的真实值）
          // 如果后端没有返回（旧数据），则降级使用当前配置计算
          const amount = parseFloat(withdraw.amount || '0');
          const energyCost = withdraw.energyCost !== null && withdraw.energyCost !== undefined
            ? Number(withdraw.energyCost) // 使用数据库存储的实际值
            : Math.ceil(amount * energyConfig.withdraw_energy_ratio); // 降级：使用当前配置计算
          const createdAt = withdraw.time || withdraw.createdAt || new Date().toISOString();
          
          // ✅ 优化：根据状态决定标题和显示方式
          const isCompleted = withdraw.status === 'Completed' || withdraw.status === 'Approved';
          timeline.push({
            type: 'withdraw',
            icon: '💸',
            title: isCompleted 
              ? (t('profile.withdrawSuccess') || '提现到账') 
              : (t('profile.liquidityWithdraw') || '提取收益'),
            description: `${amount.toFixed(2)} USDT`,
            energy: `${energyCost} ${t('profile.energy') || '能量'}`, // ✅ 移除负号，稍后在显示时弱化
            time: createdAt,
            timestamp: new Date(createdAt).getTime(),
            status: withdraw.status || 'Pending',
            id: withdraw.id,
            amount: amount.toFixed(2),
            currency: 'USDT',
            energyChange: -energyCost,
            isCompleted, // ✅ 新增：标记是否已完成
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
      // ✅ 优化：直接更新数据，不清空旧数据，避免闪烁
      setTimelineHistory(timeline.slice(0, 10));
      if (loadingTimeout) clearTimeout(loadingTimeout);
      setIsLoading(false);
    } catch (e) {
      console.error('Error loading timeline history:', e);
      // ✅ 优化：错误时不清空数据，保留旧数据
      // setTimelineHistory([]);
      if (loadingTimeout) clearTimeout(loadingTimeout);
      setIsLoading(false);
    }
  };

  // 🟢 新增：加载能量配置（从后端动态获取）
  useEffect(() => {
    const loadEnergyConfig = async () => {
      try {
        const response = await getPublicEnergyConfig();
        if (response.ok && response.config) {
          setEnergyConfig(response.config);
          console.log('[ProfileView] ✅ 已加载能量配置:', response.config);
        } else {
          console.warn('[ProfileView] ⚠️ 能量配置加载失败，使用默认值');
        }
      } catch (error) {
        console.error('[ProfileView] ⚠️ 加载能量配置出错:', error);
      }
    };
    
    loadEnergyConfig();
    
    // 每5分钟刷新一次配置（与缓存时间一致）
    const interval = setInterval(loadEnergyConfig, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // 只在组件挂载时执行一次

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

  // 自动轮询：每120秒刷新一次数据（降低请求频率，避免 RPC 速率限制）
  useEffect(() => {
    if (!stats.address || !stats.address.startsWith('0x')) return;
    
    let retryCount = 0;
    let currentInterval = 120000; // 初始 120 秒
    
    const scheduleRefresh = () => {
      const timeoutId = setTimeout(async () => {
        try {
          console.log(`[ProfileView] Auto-refreshing data (${currentInterval / 1000}s interval)...`);
          await loadExtraData();
          // 成功时重置
          retryCount = 0;
          currentInterval = 120000;
        } catch (error: any) {
          retryCount++;
          const status = error?.response?.status;
          // 检测 429 错误（Too Many Requests）
          if (status === 429) {
            console.warn('[ProfileView] RPC 速率限制，增加刷新间隔');
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
    
    return () => clearTimeout(timeoutId);
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

  // 如果显示活动记录页面，直接返回该页面
  if (showActivityHistory) {
    return <ActivityHistoryView stats={stats} onBack={() => setShowActivityHistory(false)} />;
  }

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
            <div className="flex items-center gap-2 mb-1 relative">
              <h2 className="font-black text-white text-[10px] mono tracking-tighter flex-1 min-w-0 leading-tight">
                {stats.address ? shortenAddress(stats.address) : '--'}
              </h2>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!stats.address) return;
                  try {
                    await navigator.clipboard.writeText(stats.address);
                    setAddressCopied(true);
                    showSuccess(t('common.copied') || '已复制');
                    setTimeout(() => setAddressCopied(false), 2000);
                  } catch (error) {
                    // 降级方案：使用传统方法
                    const textArea = document.createElement('textarea');
                    textArea.value = stats.address;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                      document.execCommand('copy');
                      setAddressCopied(true);
                      showSuccess(t('common.copied') || '已复制');
                      setTimeout(() => setAddressCopied(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy address:', err);
                      showError(t('common.error') || '复制失败');
                    }
                    document.body.removeChild(textArea);
                  }
                }}
                className="p-1 bg-[#FCD535]/10 hover:bg-[#FCD535]/20 rounded-md flex-shrink-0 transition-colors active:scale-95 relative z-10 cursor-pointer"
                title={t('common.copy') || '复制地址'}
              >
                {addressCopied ? (
                  <Check className="w-3 h-3 text-[#0ECB81]" />
                ) : (
                  <Copy className="w-3 h-3 text-[#FCD535]" />
                )}
              </button>
              {stats.address && stats.address.startsWith('0x') && (
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      await disconnectWallet();
                      // 清理 localStorage 中的 WalletConnect 相关数据
                      const keysToRemove: string[] = [];
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (key.startsWith('wc@2:') || key.startsWith('walletconnect'))) {
                          keysToRemove.push(key);
                        }
                      }
                      keysToRemove.forEach(key => localStorage.removeItem(key));
                      showSuccess(t('profile.disconnected') || '已断开连接');
                      setTimeout(() => window.location.reload(), 300);
                    } catch (error) {
                      console.error('[ProfileView] 断开连接失败:', error);
                      showError(t('profile.disconnectFailed') || '断开连接失败');
                    }
                  }}
                  className="p-1 bg-red-500/10 hover:bg-red-500/20 rounded-md flex-shrink-0 transition-colors active:scale-95 relative z-10 cursor-pointer"
                  title={t('profile.disconnect') || '断开连接'}
                >
                  <LogOut className="w-3 h-3 text-red-400" />
                </button>
              )}
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
              <p className="text-sm font-black mono text-[#FCD535]">{Math.floor(energy)} ⚡</p>
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
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowActivityHistory(true);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            className="text-[10px] text-[#FCD535] font-black uppercase tracking-widest hover:underline decoration-2 underline-offset-4 cursor-pointer active:opacity-80 transition-opacity relative z-10 px-2 py-1 -mx-2 -my-1 touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {t('profile.browseAll') || '查看全部'}
          </button>
        </div>
        
        <div className="divide-y divide-white/5 relative">
          {/* ✅ 优化：叠加加载指示器，而不是替换整个列表 */}
          {isLoading && timelineHistory.length > 0 && (
            <div className="absolute top-0 left-0 right-0 bg-[#1e2329]/80 backdrop-blur-sm z-10 flex items-center justify-center py-2">
              <div className="text-[10px] text-[#848E9C] font-medium flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-[#FCD535]/30 border-t-[#FCD535] rounded-full animate-spin"></div>
                {t('common.loading') || '刷新中...'}
              </div>
            </div>
          )}
          
          {/* ✅ 优化：保留旧数据，只在首次加载或真正无数据时显示加载/空状态 */}
          {isLoading && timelineHistory.length === 0 ? (
            <div className="text-center py-6 text-xs text-[#848E9C] italic">{t('common.loading') || '加载中...'}</div>
          ) : timelineHistory.length > 0 ? (
            <div className="transition-opacity duration-300">
              {timelineHistory.map((item: any, index: number) => {
              // ✅ 优化：判断提现是否成功
              const isWithdrawCompleted = item.type === 'withdraw' && (item.isCompleted || item.status === 'Completed' || item.status === 'Approved');
              const isWithdrawRejected = item.type === 'withdraw' && item.status === 'Rejected';
              
              return (
              <div key={`${item.type}-${item.timestamp}-${index}`} className="p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all group">
                <div className="flex items-center gap-4">
                  {/* ✅ 优化：成功的提现使用绿色背景和成功图标 */}
                  <div className={`p-3 rounded-xl border transition-colors ${
                    item.type === 'airdrop' 
                      ? 'bg-[#0b0e11] border-white/5 group-hover:border-[#FCD535]/30' 
                      : item.type === 'invite'
                      ? 'bg-[#0b0e11] border-white/5 group-hover:border-[#0ECB81]/30'
                      : isWithdrawCompleted
                      ? 'bg-[#0ECB81]/10 border-[#0ECB81]/30 group-hover:border-[#0ECB81]/50' // ✅ 成功提现：绿色背景
                      : isWithdrawRejected
                      ? 'bg-red-500/10 border-red-500/30 group-hover:border-red-500/50' // 拒绝：红色背景
                      : 'bg-[#0b0e11] border-white/5 group-hover:border-[#848E9C]/30'
                  }`}>
                    {item.type === 'airdrop' ? <Gift className="w-4 h-4 text-[#FCD535]" /> : 
                     item.type === 'invite' ? <Handshake className="w-4 h-4 text-[#0ECB81]" /> : 
                     isWithdrawCompleted ? <CheckCircle2 className="w-4 h-4 text-[#0ECB81]" /> : // ✅ 成功：打勾图标
                     isWithdrawRejected ? <X className="w-4 h-4 text-red-400" /> : // 拒绝：X图标
                     <CreditCard className="w-4 h-4 text-[#848E9C]" />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-tight">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[9px] text-[#848E9C] font-bold flex items-center gap-1.5 uppercase">
                        <Clock className="w-2.5 h-2.5" /> {new Date(item.time).toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })} • {t('profile.verified') || '已验证'}
                      </p>
                      {/* ✅ 优化：显示能量值 - 领取奖励显示"获得"，提现显示"消耗" */}
                      {item.type === 'airdrop' || item.type === 'invite' ? (
                        item.energyChange > 0 && (
                            <span className="text-[8px] text-[#FCD535]/80 font-medium">
                              {(t('profile.earnedEnergy') || '获得 {amount} 点能量值').replace('{amount}', String(item.energyChange))}
                            </span>
                        )
                      ) : item.type === 'withdraw' && (
                          <span className="text-[8px] text-[#848E9C]/60 font-medium">
                            {(t('profile.consumedEnergy') || '消耗 {amount}').replace('{amount}', item.energy.replace('-', ''))}
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
                <div className="text-right">
                  {/* ✅ 优化：成功的提现使用白色或金色，用箭头代替负号 */}
                  <p className={`text-sm font-black mono ${
                    item.type === 'withdraw' 
                      ? isWithdrawCompleted 
                        ? 'text-[#FCD535]' // ✅ 成功：金色（丰收金）
                        : isWithdrawRejected
                        ? 'text-red-400' // 拒绝：红色
                        : 'text-white' // 待处理：白色
                      : 'text-[#0ECB81]'
                  }`}>
                    {item.type === 'withdraw' 
                      ? isWithdrawCompleted 
                        ? <span className="flex items-center gap-1 justify-end">
                            {item.amount} <ArrowUpRight className="w-3 h-3" /> {/* ✅ 用箭头代替负号 */}
                          </span>
                        : isWithdrawRejected
                        ? `-${item.amount}` // 拒绝：保留负号
                        : item.amount // 待处理：无符号
                      : `+${item.amount}`
                    } <span className="text-[10px] font-medium opacity-70">{item.currency}</span>
                  </p>
                  {/* ✅ 优化：移除右侧的能量值显示（已移到左侧弱化显示） */}
                </div>
              </div>
              );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-[#848E9C] italic">{t('profile.noHistory') || '暂无记录'}</div>
          )}
        </div>
      </div>

      {/* ENERGY EXPLANATION MODAL - Using Portal */}
      {showEnergyModal && createPortal(
        <div 
          className="fixed inset-0 z-[50] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#0b0e11]/95 backdrop-blur-2xl animate-in fade-in duration-300"
          onClick={(e) => {
            // 点击背景关闭弹窗
            if (e.target === e.currentTarget) {
              setShowEnergyModal(false);
            }
          }}
        >
          <div 
            className="bg-gradient-to-b from-[#1e2329] to-[#0b0e11] w-full sm:max-w-sm rounded-t-[2rem] rounded-b-none sm:rounded-b-[2rem] border-t border-l border-r border-white/10 sm:border border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] sm:shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 overflow-hidden max-h-[92vh] sm:max-h-[85vh] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
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
                     <div className="flex items-center justify-between p-3 sm:p-4 bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl group hover:border-[#FCD535]/30 transition-all">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                           <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/40 flex-shrink-0" />
                           <span className="text-[10px] sm:text-[11px] font-bold text-white/90 truncate">{t('profile.dailyAirdropClaim') || '每日空投领取'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] sm:text-xs font-black text-[#FCD535] mono flex-shrink-0">+{energyConfig.claim_self_reward} ⚡</span>
                           <button
                              onClick={() => {
                                setShowEnergyModal(false);
                                window.dispatchEvent(new CustomEvent('switchToMining'));
                              }}
                              className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#FCD535]/10 hover:bg-[#FCD535]/20 text-[#FCD535] text-[8px] sm:text-[9px] font-black uppercase rounded-lg border border-[#FCD535]/30 transition-all active:scale-95"
                           >
                              {t('profile.goComplete') || 'Go Complete'}
                           </button>
                        </div>
                     </div>
                     <div className="flex items-center justify-between p-3 sm:p-4 bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl group hover:border-[#FCD535]/30 transition-all">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                           <Users2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/40 flex-shrink-0" />
                           <span className="text-[10px] sm:text-[11px] font-bold text-white/90 truncate">{t('profile.inviteFriendSuccess') || `邀请好友获得${energyConfig.claim_referrer_first}点能量值`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] sm:text-xs font-black text-[#FCD535] mono flex-shrink-0">+{energyConfig.claim_referrer_first} ⚡</span>
                           <button
                              onClick={async () => {
                                if (stats.address && stats.address.startsWith('0x')) {
                                  const link = `${window.location.origin}${window.location.pathname}?ref=${stats.address}`;
                                  try {
                                    await navigator.clipboard.writeText(link);
                                    setShowEnergyModal(false);
                                    showSuccess(t('profile.inviteLinkCopiedSuccess') || 'Invitation link copied! Share with friends to get +2 energy.');
                                  } catch (error) {
                                    const textArea = document.createElement('textarea');
                                    textArea.value = link;
                                    textArea.style.position = 'fixed';
                                    textArea.style.opacity = '0';
                                    document.body.appendChild(textArea);
                                    textArea.select();
                                    try {
                                      document.execCommand('copy');
                                      setShowEnergyModal(false);
                                      showSuccess(t('profile.inviteLinkCopiedSuccess') || 'Invitation link copied! Share with friends to get +2 energy.');
                                    } catch (err) {
                                      console.error('Failed to copy:', err);
                                      showError(t('profile.copyFailed') || 'Copy failed, please copy the link manually');
                                    }
                                    document.body.removeChild(textArea);
                                  }
                                } else {
                                  showError(t('profile.connectWalletFirst') || 'Please connect wallet first');
                                }
                              }}
                              className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#FCD535]/10 hover:bg-[#FCD535]/20 text-[#FCD535] text-[8px] sm:text-[9px] font-black uppercase rounded-lg border border-[#FCD535]/30 transition-all active:scale-95"
                           >
                              {t('profile.goComplete') || 'Go Complete'}
                           </button>
                        </div>
                     </div>
                  </div>
               </div>

               {/* How to Use */}
               <div className="space-y-2 sm:space-y-3 pt-1 sm:pt-2">
                  <h4 className="text-[9px] sm:text-[10px] font-black text-[#848E9C] uppercase tracking-[0.3em] flex items-center gap-1.5 sm:gap-2">
                    <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('profile.consumptionRules') || '消耗规则'}
                  </h4>
                  
                  <div className="p-3 sm:p-4 bg-[#1e2329]/60 border border-white/10 rounded-xl sm:rounded-2xl space-y-2 sm:space-y-3">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] sm:text-[11px] font-bold text-white/90 truncate pr-2">{t('profile.usdtWithdrawRatio') || 'USDT 收益提现'}</span>
                        <span className="text-[10px] sm:text-xs font-black text-[#848E9C] mono flex-shrink-0">{t('profile.ratio1to10') || `1:${energyConfig.withdraw_energy_ratio} 比例`}</span>
                     </div>
                     <p className="text-[8px] sm:text-[9px] text-[#848E9C] leading-normal font-bold uppercase tracking-tight">
                       {t('profile.withdrawRule') || `* 每提现 1 USDT 需消耗 ${energyConfig.withdraw_energy_ratio} 单位能量。`}
                     </p>
                  </div>
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
