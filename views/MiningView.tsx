
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ethers } from 'ethers';
import { Gift, Copy, Check, Users, Zap, Sparkles, X, Trophy, ShieldCheck, DollarSign, AlertCircle, RefreshCw } from 'lucide-react';
import { UserStats } from '../types';
import { PARTNERS, CONTRACTS, ABIS, DEFAULT_AIRDROP_FEE, CHAIN_ID } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { getProvider, getContract, formatError, switchNetwork, connectWallet, disconnectWallet, getAirdropClaimFee, getCurrentChainId } from '../services/web3Service';
import { verifyClaim } from '../api';
import { getPartnerIcon } from '../components/PartnerIcons';
import { InlineListingCountdown } from '../components/InlineListingCountdown';
import { fetchCountdownConfig } from '../api';
import { WalletType } from '../types';

interface MiningViewProps {
  stats: UserStats;
  setStats: React.Dispatch<React.SetStateAction<UserStats>>;
}

const MiningView: React.FC<MiningViewProps> = ({ stats, setStats }) => {
  const { t } = useLanguage();
  const { showError, showWarning, showInfo, showSuccess } = useToast();
  const DEFAULT_COOLDOWN = 4 * 3600; // 4 小时占位，用于未领取前静态显示
  const [countdown, setCountdown] = useState(DEFAULT_COOLDOWN); 
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardAmount, setRewardAmount] = useState('0');
  const [nextClaimTime, setNextClaimTime] = useState<number>(0);
  const [isCooldown, setIsCooldown] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [countdownConfig, setCountdownConfig] = useState({
    targetDate: '2026-01-15T12:00:00',
    exchangeName: 'Binance',
    bgImageUrl: '',
  });
  // 🟢 新增：动态手续费状态
  const [airdropFee, setAirdropFee] = useState<string>(DEFAULT_AIRDROP_FEE);
  const isMobile = useMemo(() => /android|iphone|ipad|ipod/i.test(navigator.userAgent), []);

  const pickWalletType = (): WalletType => {
    // 桌面优先 WalletConnect；移动端也用 WalletConnect，若需扩展可再兼容扩展钱包
    return 'walletconnect';
  };

  // 从 URL 获取 referrer
  const getReferrerFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ethers.utils.isAddress(ref)) {
      return ref;
    }
    return '0x0000000000000000000000000000000000000000';
  };

  // 从 localStorage 获取持久化的推荐人地址
  const getReferrerFromStorage = (): string => {
    try {
      const stored = localStorage.getItem('rabbit_referrer');
      if (stored && ethers.utils.isAddress(stored)) {
        return stored;
      }
    } catch (error) {
      console.warn('Failed to read referrer from localStorage:', error);
    }
    return '0x0000000000000000000000000000000000000000';
  };

  // 保存推荐人地址到 localStorage
  const saveReferrerToStorage = (address: string) => {
    try {
      if (address && ethers.utils.isAddress(address)) {
        localStorage.setItem('rabbit_referrer', address);
      }
    } catch (error) {
      console.warn('Failed to save referrer to localStorage:', error);
    }
  };

  // 获取推荐人地址（优先级：localStorage > URL > 默认值）
  const getReferrer = (): string => {
    const fromStorage = getReferrerFromStorage();
    if (fromStorage !== '0x0000000000000000000000000000000000000000') {
      return fromStorage;
    }
    const fromUrl = getReferrerFromUrl();
    if (fromUrl !== '0x0000000000000000000000000000000000000000') {
      // 如果 URL 中有 ref，保存到 localStorage
      saveReferrerToStorage(fromUrl);
      return fromUrl;
    }
    return '0x0000000000000000000000000000000000000000';
  };

  // 应用初始化时，如果 URL 有 ref 参数，立即存入 localStorage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref && ethers.utils.isAddress(ref)) {
      saveReferrerToStorage(ref);
    }
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // 领取成功后需要把 txHash 同步到后端写库（claims/users/energy）。
  // 这里做自动重试：每 2 秒重试 1 次，共 5 次；只有全部失败才提示用户把 txHash 发给管理员。
  const syncClaimWithRetry = async (params: { address: string; txHash: string; referrer: string }) => {
    const maxAttempts = 5;
    const delayMs = 2000;
    let lastErr: any = null;

    console.log('[syncClaimWithRetry] 开始同步空投领取:', { address: params.address, txHash: params.txHash, referrer: params.referrer });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[syncClaimWithRetry] 尝试 ${attempt}/${maxAttempts}...`);
        const result = await verifyClaim(params.address, params.txHash, params.referrer);
        console.log('[syncClaimWithRetry] 同步成功:', result);
        return { ok: true as const, attempt };
      } catch (e: any) {
        lastErr = e;
        console.error(`[syncClaimWithRetry] 尝试 ${attempt}/${maxAttempts} 失败:`, e?.response?.data || e?.message || e);
        if (attempt < maxAttempts) {
          console.log(`[syncClaimWithRetry] 等待 ${delayMs}ms 后重试...`);
          await sleep(delayMs);
          continue;
        }
      }
    }

    const msg = lastErr?.response?.data?.message || lastErr?.message || 'verify-claim failed';
    const code = lastErr?.response?.data?.code || 'UNKNOWN';
    console.error('[syncClaimWithRetry] 所有重试均失败:', { code, message: msg, lastErr });
    return { ok: false as const, code, message: msg };
  };

  const enqueuePendingClaim = (item: { address: string; txHash: string; referrer: string }) => {
    try {
      const key = 'rabbit_pending_claims';
      const raw = localStorage.getItem(key);
      const arr = raw ? (JSON.parse(raw) as any[]) : [];
      const next = [
        ...arr.filter((x) => String(x?.txHash || '').toLowerCase() !== item.txHash.toLowerCase()),
        { ...item, createdAt: Date.now() },
      ];
      localStorage.setItem(key, JSON.stringify(next.slice(-50)));
    } catch {}
  };

  const fetchCooldown = useCallback(async () => {
    if (!stats.address || !stats.address.startsWith('0x')) {
      setIsCooldown(false);
      setNextClaimTime(0);
      return;
    }
    
    const provider = getProvider();
    if (!provider) {
      setIsCooldown(false);
      setNextClaimTime(0);
      return;
    }
    
    try {
      // 使用 callWithRetry 包装 RPC 调用，自动处理 429 错误
      const { callWithRetry } = await import('../services/web3Service');
      const contract = await getContract(CONTRACTS.AIRDROP, ABIS.AIRDROP, undefined);
      
      const lastClaim = await callWithRetry(
        () => contract.lastClaimTime(stats.address),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt, error) => {
            console.warn(`[fetchCooldown] RPC 速率限制，重试 ${attempt}/3...`);
          }
        }
      );
      
      const lastClaimNum = Number(lastClaim);
      
      if (lastClaimNum === 0) {
        // 未领取过：保持静态 4:00:00 占位
        setIsCooldown(false);
        setNextClaimTime(0);
        setCountdown(DEFAULT_COOLDOWN);
        return;
      }
      
      const COOLDOWN_SECONDS = 4 * 3600;
      const next = lastClaimNum + COOLDOWN_SECONDS;
      const now = Math.floor(Date.now() / 1000);
      
      if (now < next) {
        setNextClaimTime(next);
        setIsCooldown(true);
      } else {
        setIsCooldown(false);
        setNextClaimTime(0);
      }
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || '';
      const errorCode = err?.code;
      
      // 检测 429 错误（RPC 速率限制）
      const isRateLimitError = errorCode === -16429 || 
                               errorMessage.includes('429') || 
                               errorMessage.includes('Too many requests') ||
                               errorMessage.includes('Too Many Requests');
      
      // 非 429 错误，记录错误
      if (!isRateLimitError) {
        console.error('Error fetching cooldown:', err);
      } else {
        console.warn('[fetchCooldown] RPC 速率限制，所有重试均失败，跳过本次查询');
      }
      
      // 优雅降级：保持当前状态，不重置（避免闪烁）
      // setIsCooldown(false);
      // setNextClaimTime(0);
    }
  }, [stats.address]);

  useEffect(() => {
    if (stats.address && stats.address.startsWith('0x')) {
      fetchCooldown();
    }
  }, [stats.address, fetchCooldown]);

  // ✅ 监听 refreshEnergy 事件，自动刷新冷却时间（当下级领取空投时，上级的冷却时间会被重置）
  useEffect(() => {
    const handleRefreshEnergy = () => {
      if (stats.address && stats.address.startsWith('0x')) {
        console.log('[MiningView] refreshEnergy 事件触发，刷新冷却时间...');
        // 延迟一点时间，确保链上状态已更新
        setTimeout(() => {
          fetchCooldown();
        }, 2000);
      }
    };
    
    window.addEventListener('refreshEnergy', handleRefreshEnergy);
    return () => window.removeEventListener('refreshEnergy', handleRefreshEnergy);
  }, [stats.address, fetchCooldown]);

  // ✅ 定期刷新冷却时间（每 30 秒），确保能及时检测到下级领取后的冷却时间重置
  useEffect(() => {
    if (!stats.address || !stats.address.startsWith('0x')) return;
    
    // 初始加载
    fetchCooldown();
    
    // 每 30 秒刷新一次（避免 RPC 速率限制）
    const interval = setInterval(() => {
      fetchCooldown();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [stats.address, fetchCooldown]);

  // 获取倒计时配置
  useEffect(() => {
    const loadCountdownConfig = async () => {
      try {
        const config = await fetchCountdownConfig();
        setCountdownConfig(config);
      } catch (error) {
        console.warn('Failed to load countdown config:', error);
        // 使用默认值，不抛出错误
      }
    };
    loadCountdownConfig();
  }, []);

  // 🟢 新增：加载动态手续费
  useEffect(() => {
    const loadClaimFee = async () => {
      try {
        const fee = await getAirdropClaimFee();
        setAirdropFee(fee);
        console.log(`[MiningView] ✅ 已加载动态手续费: ${fee} BNB`);
      } catch (error) {
        console.error('[MiningView] ⚠️ 加载手续费失败，使用默认值:', error);
        setAirdropFee(DEFAULT_AIRDROP_FEE);
      }
    };

    loadClaimFee();
    // 每 5 分钟刷新一次手续费（与缓存时间一致）
    const interval = setInterval(loadClaimFee, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (nextClaimTime > 0) {
        const now = Math.floor(Date.now() / 1000);
        const diff = nextClaimTime - now;
        if (diff <= 0) {
          setIsCooldown(false);
          setTimeLeft('');
          setNextClaimTime(0);
          setCountdown(DEFAULT_COOLDOWN); // 冷却结束后回到占位时间
        } else {
          setIsCooldown(true);
          setCountdown(diff);
          const h = Math.floor(diff / 3600).toString().padStart(2, '0');
          const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
          const s = (diff % 60).toString().padStart(2, '0');
          setTimeLeft(`${h}:${m}:${s}`);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [nextClaimTime]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sc.toString().padStart(2, '0')}`;
  };

  const handleClaim = async () => {
    if (claiming) return;
    
    // 检查钱包连接，如果未连接则自动连接（移动端优先 WalletConnect）
    let provider = getProvider();
    let needsConnection = false;
    
    // 验证 provider 是否真的有效（可以获取地址）
    if (provider) {
      try {
        const signer = provider.getSigner();
        const currentAddress = await signer.getAddress();
        // 如果 provider 存在但地址不匹配或无效，需要重新连接
        if (!currentAddress || !currentAddress.startsWith('0x') || 
            (stats.address && stats.address !== currentAddress)) {
          needsConnection = true;
        }
      } catch (error) {
        // provider 无效，需要重新连接
        console.warn('[MiningView] Provider 验证失败，需要重新连接:', error);
        needsConnection = true;
        provider = null;
      }
    } else {
      needsConnection = true;
    }
    
    // 如果 stats.address 存在但 provider 无效，清除 stats.address
    if (needsConnection && stats.address && stats.address.startsWith('0x')) {
      console.log('[MiningView] 检测到钱包已断开，清除地址状态');
      setStats(prev => ({ ...prev, address: '', bnbBalance: 0 }));
    }
    
    if (needsConnection) {
      try {
        console.log('[MiningView] 开始连接钱包...');
        const walletType = pickWalletType();
        await connectWallet(walletType);
        // 等待一下让钱包状态更新
        await sleep(800);
        provider = getProvider();
        // 重新检查地址（需要从钱包获取）
        if (!provider) {
          showError(t('common.connectWallet') || '请先连接钱包');
          return;
        }
        // 获取当前连接的地址
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        if (!address || !address.startsWith('0x')) {
          showError(t('common.connectWallet') || '请先连接钱包');
          return;
        }
        // 获取BNB余额
        let bnbBalance = 0;
        try {
          const balance = await provider.getBalance(address);
          bnbBalance = parseFloat(ethers.utils.formatEther(balance));
        } catch (error) {
          console.error('Failed to get BNB balance:', error);
        }
        // 更新 stats 中的地址和BNB余额
        setStats(prev => ({ ...prev, address, bnbBalance }));
        console.log('[MiningView] 钱包连接成功，地址:', address);
      } catch (error: any) {
        console.error('Failed to connect wallet:', error);
        // 检查是否是连接状态异常的错误（更精确的判断）
        const errorMessage = error?.message || error?.toString() || '';
        const errorCode = error?.code || error?.error?.code;
        
        // 检测是否是 session 冲突错误
        const isSessionConflict = 
          errorMessage.includes('Session already exists') ||
          errorMessage.includes('already connected') ||
          errorMessage.includes('请尝试在钱包中断开') ||
          errorMessage.includes('请先断开 DApp') ||
          errorCode === -32002;
        
        // 用户拒绝连接的情况，不显示断开重连提示
        const isUserRejected = 
          error?.code === 'USER_REJECTED' || 
          error?.code === 4001 ||
          errorMessage.includes('User rejected') ||
          errorMessage.includes('user rejected');
        
        if (isUserRejected) {
          // 用户拒绝，不显示任何提示（钱包已处理）
          return;
        }
        
        // 如果是 session 冲突或包含"请先断开 DApp"的错误，先尝试自动清理并重试
        if (isSessionConflict) {
          console.log('[MiningView] 检测到 session 冲突或断开提示，尝试自动清理并重试...');
          try {
            // 1. 先断开当前连接
            const { disconnectWallet, clearWalletConnectSessions } = await import('../services/web3Service');
            await disconnectWallet();
            
            // 2. 彻底清理所有 WalletConnect session 数据
            clearWalletConnectSessions();
            
            // 3. 等待清理完成
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 4. 尝试重新连接（connectWallet 内部会再次清理）
            try {
              const newProvider = await connectWallet();
              // 等待一下让钱包状态更新
              await sleep(800);
              const signer = newProvider.getSigner();
              const address = await signer.getAddress();
              
              if (!address || !address.startsWith('0x')) {
                throw new Error('获取地址失败');
              }
              
              // 获取BNB余额
              let bnbBalance = 0;
              try {
                const balance = await newProvider.getBalance(address);
                bnbBalance = parseFloat(ethers.utils.formatEther(balance));
              } catch (error) {
                console.error('Failed to get BNB balance:', error);
              }
              
              // 连接成功，更新状态
              setStats(prev => ({ ...prev, address, bnbBalance }));
              console.log('[MiningView] 自动重连成功，继续执行领取操作');
              
              // 更新 provider 变量，继续执行领取逻辑
              provider = newProvider;
            } catch (retryError: any) {
              // 重试失败，可能是用户取消了连接或其他原因
              const retryErrorMessage = retryError?.message || retryError?.toString() || '';
              console.warn('[MiningView] 自动重连失败:', retryErrorMessage);
              
              // 如果是用户取消，不显示错误
              if (retryError?.code === 'USER_REJECTED' || retryError?.code === 4001 || 
                  retryErrorMessage.includes('User rejected') || retryErrorMessage.includes('user rejected')) {
                return;
              }
              
              // 如果仍然包含"请先断开 DApp"，说明清理不彻底，建议刷新页面
              if (retryErrorMessage.includes('请先断开') || retryErrorMessage.includes('断开 DApp')) {
                showWarning('连接异常，请刷新页面后重试');
                return;
              }
              
              // 其他错误，显示通用错误提示
              showError('连接异常，请刷新页面后重试');
              return;
            }
          } catch (cleanError) {
            // 清理失败，显示通用错误提示
            console.error('[MiningView] 自动清理失败:', cleanError);
            showError('连接异常，请刷新页面后重试');
            return;
          }
        } else {
          // 其他错误，可能是连接被取消或其他原因
          // 不显示错误提示，让用户知道连接已取消
          console.warn('[MiningView] 钱包连接失败或取消:', errorMessage);
          return;
        }
      }
    }
    
    // 如果到这里还没有 provider，说明连接失败
    if (!provider) {
      console.error('[MiningView] 钱包连接失败，无法继续');
      return;
    }

    // 检查冷却时间
    if (isCooldown) {
      showWarning(t('mining.cooldown') || '冷却中，请稍候');
      return;
    }
    
    setClaiming(true);
    try {
      // 🟢 修复：使用新的 getCurrentChainId 函数（支持币安钱包）
      try {
        const currentChainId = await getCurrentChainId(provider);
        console.log('[handleClaim] 当前 Chain ID:', currentChainId, '期望 Chain ID:', CHAIN_ID);
        
        if (currentChainId !== CHAIN_ID) {
          console.log('[handleClaim] 网络不匹配，尝试自动切换...');
          try {
            await switchNetwork();
            // 等待网络切换完成（币安钱包可能需要更长时间）
            await sleep(2000);
            // 重新获取 provider 以确保网络已切换
            provider = getProvider() || provider;
            // 再次检查网络（使用新的函数）
            const newChainId = await getCurrentChainId(provider);
            console.log('[handleClaim] 切换后 Chain ID:', newChainId);
            
            if (newChainId !== CHAIN_ID) {
              showError(`网络切换失败，请手动切换到 BNB Smart Chain 主网 (Chain ID: ${CHAIN_ID})`);
              setClaiming(false);
              return;
            } else {
              showSuccess('网络已切换到 BNB Smart Chain');
            }
          } catch (switchErr: any) {
            console.error('[handleClaim] 网络切换失败:', switchErr);
            
            // 🟢 修复：区分不同错误类型，提供针对性提示
            if (switchErr.code === 4001 || switchErr.message?.includes('User rejected') || switchErr.message?.includes('user rejected')) {
              showWarning('您已取消网络切换，请在钱包中手动切换到 BNB Smart Chain 主网');
            } else if (switchErr.code === 4902 || switchErr.message?.includes('not added')) {
              showInfo('正在添加 BNB Smart Chain 网络...');
              // 网络添加会自动触发，等待一下
              await sleep(2000);
              const finalChainId = await getCurrentChainId(provider);
              if (finalChainId !== CHAIN_ID) {
                showError('网络添加失败，请手动切换到 BNB Smart Chain 主网 (Chain ID: 56)');
                setClaiming(false);
                return;
              }
            } else if (switchErr.message?.includes('not supported') || switchErr.message?.includes('不支持')) {
              showError(t('common.walletNotSupport') || 'Your wallet doesn\'t support automatic network switching, please manually switch to BNB Smart Chain Mainnet (Chain ID: 56)');
            } else {
              showError(t('common.networkSwitchFailed')?.replace('{chainId}', CHAIN_ID.toString()) || `Network switch failed, please manually switch to BNB Smart Chain Mainnet (Chain ID: ${CHAIN_ID})`);
            }
            setClaiming(false);
            return;
          }
        }
      } catch (networkError: any) {
        console.error('[handleClaim] 网络检测错误:', networkError);
        if (networkError.code === 'NETWORK_ERROR' || networkError.message?.includes('network changed')) {
          showError(t('common.networkMismatch')?.replace('{chainId}', CHAIN_ID.toString()) || `Network mismatch detected, please switch to BNB Smart Chain Mainnet (Chain ID: ${CHAIN_ID})`);
        } else {
          showError(t('common.networkCheckFailed') || 'Network check failed, please ensure you\'re connected to BNB Smart Chain Mainnet');
        }
        setClaiming(false);
        return;
      }
      
      const signer = provider.getSigner();
      if (!signer) throw new Error("No signer");
      
      // 获取当前地址（确保使用最新地址）
      const currentAddress = await signer.getAddress();
      if (!currentAddress || !currentAddress.startsWith('0x')) {
        showError(t('common.connectWallet') || '请先连接钱包');
        setClaiming(false);
        return;
      }
      
      // 🟢 修复：动态获取当前手续费（而不是使用硬编码值）
      const currentFee = await getAirdropClaimFee();
      console.log(`[handleClaim] 使用动态手续费: ${currentFee} BNB`);
      
      // 检查用户 BNB 余额（使用当前地址）
      const balance = await provider.getBalance(currentAddress);
      const feeAmount = ethers.utils.parseEther(currentFee);
      
      // 🟢 方案B：根据 claimFee 动态调整 Gas 费用估算值
      // 规则：Gas 费用 = max(claimFee × 0.3, 0.0001 BNB)
      // 这样当手续费很低时（如 0.0001 BNB），Gas 费用至少是 0.0001 BNB
      // 当手续费较高时，Gas 费用按比例增加（更准确）
      const feeValue = parseFloat(currentFee);
      const estimatedGasValue = Math.max(feeValue * 0.3, 0.0001); // 至少 0.0001 BNB，或手续费的 30%
      const estimatedGas = ethers.utils.parseEther(estimatedGasValue.toFixed(6));
      const requiredBalance = feeAmount.add(estimatedGas);
      
      console.log(`[handleClaim] 手续费: ${currentFee} BNB, 估算 Gas: ${estimatedGasValue.toFixed(6)} BNB, 总计需要: ${ethers.utils.formatEther(requiredBalance)} BNB`);
      
      // 更新stats中的BNB余额
      const bnbBalance = parseFloat(ethers.utils.formatEther(balance));
      setStats(prev => ({ ...prev, bnbBalance }));
      
      if (balance.lt(requiredBalance)) {
        showError(t('mining.insufficientNetworkFee') || '当前网络费不足，请补充你的BNB余额');
        setClaiming(false);
        return;
      }
      
      const contract = await getContract(CONTRACTS.AIRDROP, ABIS.AIRDROP, signer);
      const refAddr = getReferrer(); // 使用新的 getReferrer 函数，优先从 localStorage 读取
      
      // 估算 gas limit（动态估算，乘以 1.2 缓冲系数）
      let gasLimit;
      try {
        const estimatedGas = await contract.estimateGas.claim(refAddr, { value: feeAmount });
        gasLimit = estimatedGas.mul(120).div(100); // 1.2 缓冲系数（文档建议）
      } catch (estimateError: any) {
        // 合约交互异常代码映射
        const code = estimateError?.code;
        const errorMsg = estimateError?.message || estimateError?.reason || estimateError?.toString() || '';
        
        // ACTION_REJECTED (用户点了拒绝)
        if (code === 'ACTION_REJECTED' || code === 4001 || errorMsg.includes('user rejected')) {
          showInfo('您取消了交易');
          setClaiming(false);
          return;
        }
        
        // INSUFFICIENT_FUNDS (没钱付 Gas)
        if (code === 'INSUFFICIENT_FUNDS' || errorMsg.includes('insufficient funds') || errorMsg.includes('Insufficient')) {
          showError('BNB 余额不足以支付 Gas 费');
          setClaiming(false);
          return;
        }
        
        // CALL_EXCEPTION (合约报错)
        if (code === 'CALL_EXCEPTION' || errorMsg.includes('Cooldown') || errorMsg.includes('cooldown')) {
          showWarning('领取失败，可能处于冷却期或空投池已空');
          setClaiming(false);
          fetchCooldown();
          return;
        }
        
        if (errorMsg.includes('balance')) {
          showError(t('mining.insufficientBnbBalance') || 'BNB余额不足无法领取空投奖励');
          setClaiming(false);
          return;
        }
        
        // 其他错误：使用默认 Gas limit
        console.warn('Gas estimation failed, using default:', estimateError);
        gasLimit = ethers.BigNumber.from('500000');
      }
      
      // 发送交易（带错误处理）
      let tx, receipt;
      try {
        tx = await contract.claim(refAddr, { 
          value: feeAmount,
          gasLimit: gasLimit
        });
        
        // ⚠️ 关键：在等待确认前，先获取交易哈希（tx.hash 在交易发送后立即可用）
        const txHash = tx?.hash;
        if (!txHash) {
          console.error('[handleClaim] 交易发送成功但无法获取交易哈希:', { tx });
          showError('交易发送成功，但无法获取交易哈希。请检查交易状态。');
          setClaiming(false);
          return;
        }
        console.log('[handleClaim] 交易已发送，等待确认:', { txHash, blockNumber: tx.blockNumber });
        
        // 等待交易确认
        receipt = await tx.wait();
        
        // ⚠️ 验证 receipt 和交易状态
        if (!receipt) {
          console.error('[handleClaim] 交易确认失败，receipt 为 undefined:', { txHash });
          showError('交易确认失败，请检查交易状态。交易哈希: ' + txHash);
          setClaiming(false);
          return;
        }
        
        if (receipt.status !== 1) {
          console.error('[handleClaim] 交易失败（状态码不为 1）:', { txHash, status: receipt.status });
          showError('交易失败，请重试。交易哈希: ' + txHash);
          setClaiming(false);
          return;
        }
        
        // ⚠️ 再次验证 receipt.hash（应该与 tx.hash 一致）
        const receiptHash = receipt.hash || txHash;
        if (!receiptHash) {
          console.error('[handleClaim] receipt.hash 和 tx.hash 都为空:', { receipt, tx });
          showError('无法获取交易哈希，请检查交易状态。');
          setClaiming(false);
          return;
        }
        
        console.log('[handleClaim] 交易确认成功:', { 
          txHash: receiptHash, 
          blockNumber: receipt.blockNumber,
          status: receipt.status 
        });
      } catch (txError: any) {
        // 交易发送失败的错误处理
        const code = txError?.code;
        const errorMsg = txError?.message || txError?.reason || txError?.toString() || '';
        
        // ACTION_REJECTED (用户点了拒绝)
        if (code === 'ACTION_REJECTED' || code === 4001 || errorMsg.includes('user rejected')) {
          showInfo('您取消了交易');
          setClaiming(false);
          return;
        }
        
        // INSUFFICIENT_FUNDS (没钱付 Gas)
        if (code === 'INSUFFICIENT_FUNDS' || errorMsg.includes('insufficient funds')) {
          showError('BNB 余额不足以支付 Gas 费');
          setClaiming(false);
          return;
        }
        
        // CALL_EXCEPTION (合约报错)
        if (code === 'CALL_EXCEPTION' || errorMsg.includes('Cooldown') || errorMsg.includes('cooldown')) {
          showWarning('领取失败，请稍后chong');
          setClaiming(false);
          fetchCooldown();
          return;
        }
        
        // NETWORK_ERROR (网络错误)
        if (code === 'NETWORK_ERROR' || errorMsg.includes('network')) {
          showError('网络连接异常，请检查网络设置后重试');
          setClaiming(false);
          return;
        }
        
        // 其他错误
        const friendlyMsg = txError?.reason || errorMsg || '交易失败';
        showError(friendlyMsg);
        setClaiming(false);
        return;
      }

      // ⚠️ 关键：获取交易哈希（优先使用 receipt.hash，如果不存在则使用 tx.hash）
      const finalTxHash = receipt?.hash || tx?.hash;
      
      // ⚠️ 最终验证：确保交易哈希存在
      if (!finalTxHash) {
        console.error('[handleClaim] 致命错误：无法获取交易哈希', { 
          receipt: receipt ? { hash: receipt.hash, status: receipt.status } : null,
          tx: tx ? { hash: tx.hash } : null
        });
        showError('无法获取交易哈希，请检查交易状态或联系管理员。');
        setClaiming(false);
        return;
      }

      // 解析 Claimed 事件
      const iface = new ethers.utils.Interface(ABIS.AIRDROP);
      let wonAmount = '0';
      if (receipt?.logs) {
        receipt.logs.forEach((log: any) => {
            try {
                const parsed = iface.parseLog(log);
                if(parsed?.name === 'Claimed') wonAmount = ethers.utils.formatEther(parsed.args.amount);
            } catch(e) {}
        });
      }

      // 显示奖励弹窗
      setRewardAmount(wonAmount);
      setShowRewardModal(true);
      
      // API 同步（使用当前连接的地址，而不是 stats.address）
      console.log('[handleClaim] 准备同步空投领取到后端:', {
        currentAddress,
        txHash: finalTxHash,
        referrer: refAddr,
        receiptStatus: receipt?.status,
        receiptBlockNumber: receipt?.blockNumber,
        txHashSource: receipt?.hash ? 'receipt.hash' : 'tx.hash'
      });
      
      const syncRes = await syncClaimWithRetry({ 
        address: currentAddress, 
        txHash: finalTxHash, 
        referrer: refAddr 
      });
      
      if (!syncRes.ok) {
        enqueuePendingClaim({ 
          address: currentAddress, 
          txHash: finalTxHash, 
          referrer: refAddr 
        });
        console.error('[handleClaim] 后端同步失败，已加入待同步队列:', {
          code: syncRes.code,
          message: syncRes.message,
          address: currentAddress,
          txHash: finalTxHash
        });
        // 显示更详细的错误信息
        const errorMsg = `领取成功，但后端同步失败！\n\n错误代码: ${syncRes.code}\n错误信息: ${syncRes.message}\n\n交易哈希: ${finalTxHash}\n地址: ${currentAddress}\n\n请稍后刷新页面查看数据，或联系管理员处理。`;
        showWarning(errorMsg, 8000);
      } else {
        console.log('[handleClaim] 后端同步成功，用户数据已更新:', {
          address: currentAddress,
          txHash: finalTxHash,
          attempt: syncRes.attempt
        });
      }
      
      // 更新 stats 中的地址（确保使用当前连接的地址）
      setStats(p => ({ 
        ...p, 
        address: currentAddress,
        ratBalance: p.ratBalance + parseFloat(wonAmount),
        energy: p.energy + 1 
      }));
      
      // 触发能量值刷新事件（在所有页面）
      try {
        localStorage.setItem('rabbit_needs_userinfo_refresh_at', String(Date.now()));
      } catch {}
      window.dispatchEvent(new CustomEvent('refreshEnergy'));
      
      // 延迟刷新用户信息，确保后端数据已写入（多次重试，确保数据同步）
      const refreshUserInfo = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            await new Promise(resolve => setTimeout(resolve, i === 0 ? 2000 : 3000)); // 第一次 2 秒，后续每次 3 秒
            const { fetchUserInfo } = await import('../api');
            const userInfo = await fetchUserInfo(currentAddress);
            if (userInfo && Number(userInfo.energy || 0) > 0) {
              // 如果能量值大于 0，说明数据已同步成功
              setStats(p => ({
                ...p,
                address: currentAddress,
                energy: Number(userInfo.energy || 0),
                teamSize: Number(userInfo.inviteCount || 0),
              }));
              console.log('用户信息刷新成功，能量值:', userInfo.energy);
              return; // 成功则退出
            }
          } catch (error) {
            console.warn(`Failed to refresh user info after claim (attempt ${i + 1}/${retries}):`, error);
            if (i === retries - 1) {
              // 最后一次重试失败，提示用户手动刷新
              console.warn('所有重试均失败，建议用户手动刷新页面');
            }
          }
        }
      };
      
      refreshUserInfo();
      
      // ✅ 增强验证：等待几秒后从链上读取 lastClaimTime 验证，确保数据已同步
      const verifyClaimOnChain = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            // 等待时间：第一次 3 秒，后续每次 2 秒
            const waitTime = i === 0 ? 3000 : 2000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            console.log(`[verifyClaimOnChain] 验证链上数据 (尝试 ${i + 1}/${retries})...`);
            
            // 从链上读取 lastClaimTime
            const { callWithRetry } = await import('../services/web3Service');
            const contract = await getContract(CONTRACTS.AIRDROP, ABIS.AIRDROP, undefined);
            
            const lastClaim = await callWithRetry(
              () => contract.lastClaimTime(currentAddress),
              {
                maxRetries: 3,
                baseDelay: 1000,
                onRetry: (attempt, error) => {
                  console.warn(`[verifyClaimOnChain] RPC 速率限制，重试 ${attempt}/3...`);
                }
              }
            );
            
            const lastClaimNum = Number(lastClaim);
            const receiptBlockTime = receipt?.blockNumber ? await (async () => {
              try {
                const provider = getProvider();
                if (!provider) return null;
                const block = await provider.getBlock(receipt.blockNumber);
                return block ? block.timestamp : null;
              } catch {
                return null;
              }
            })() : null;
            
            // 验证：如果 lastClaimTime 已更新（大于 0），说明数据已同步
            if (lastClaimNum > 0) {
              const timeDiff = receiptBlockTime ? Math.abs(lastClaimNum - receiptBlockTime) : null;
              
              // 如果 lastClaimTime 大于 0，且（如果有区块时间）时间差小于 300 秒（5分钟），认为验证成功
              // 允许 5 分钟的时间差，因为区块时间可能略有不同
              const isValid = timeDiff === null || timeDiff < 300;
              
              if (isValid) {
                console.log(`[verifyClaimOnChain] ✅ 链上验证成功:`, {
                  lastClaimTime: lastClaimNum,
                  receiptBlockTime,
                  timeDiff,
                  attempt: i + 1
                });
                
                // 刷新冷却时间（确保 UI 显示最新状态）
                fetchCooldown();
                
                // 再次刷新用户信息，确保数据已同步
                try {
                  const { fetchUserInfo } = await import('../api');
                  const userInfo = await fetchUserInfo(currentAddress);
                  if (userInfo) {
                    setStats(p => ({
                      ...p,
                      address: currentAddress,
                      energy: Number(userInfo.energy || 0),
                      teamSize: Number(userInfo.inviteCount || 0),
                    }));
                    console.log('[verifyClaimOnChain] ✅ 用户信息已同步，能量值:', userInfo.energy);
                  } else if (Number(userInfo?.energy || 0) === 0) {
                    // ✅ 自动修复：如果链上验证成功但数据库仍为 0，自动调用 verifyClaim
                    console.warn('[verifyClaimOnChain] ⚠️ 链上验证成功但数据库仍为 0，自动调用 verifyClaim 修复...');
                    try {
                      const { verifyClaim } = await import('../api');
                      const result = await verifyClaim(currentAddress, finalTxHash, refAddr);
                      if (result?.ok) {
                        console.log('[verifyClaimOnChain] ✅ 自动修复成功，重新获取用户信息...');
                        // 重新获取用户信息
                        const updatedUserInfo = await fetchUserInfo(currentAddress);
                        if (updatedUserInfo) {
                          setStats(p => ({
                            ...p,
                            address: currentAddress,
                            energy: Number(updatedUserInfo.energy || 0),
                            teamSize: Number(updatedUserInfo.inviteCount || 0),
                          }));
                        }
                      }
                    } catch (fixError) {
                      console.error('[verifyClaimOnChain] 自动修复失败:', fixError);
                    }
                  }
                } catch (error) {
                  console.warn('[verifyClaimOnChain] 刷新用户信息失败:', error);
                }
                
                return true; // 验证成功
              } else {
                console.warn(`[verifyClaimOnChain] lastClaimTime 时间差过大 (${timeDiff}秒)，可能不是本次交易，继续重试...`);
              }
            } else {
              // 如果 lastClaimTime 仍为 0，说明可能还未同步，继续重试
              if (i < retries - 1) {
                console.warn(`[verifyClaimOnChain] lastClaimTime 仍为 0，等待重试... (${i + 1}/${retries})`);
              } else {
                console.warn(`[verifyClaimOnChain] ⚠️ 链上验证失败：lastClaimTime 仍为 0，可能交易尚未完全确认或 RPC 延迟`);
                // 最后一次重试失败，仍然刷新冷却时间（可能只是 RPC 延迟）
                fetchCooldown();
              }
            }
          } catch (error) {
            console.warn(`[verifyClaimOnChain] 验证失败 (尝试 ${i + 1}/${retries}):`, error);
            if (i === retries - 1) {
              // 最后一次重试失败，仍然刷新冷却时间
              fetchCooldown();
              console.warn('[verifyClaimOnChain] 所有验证重试均失败，建议用户手动刷新页面');
            }
          }
        }
        return false;
      };
      
      // 启动链上验证（异步执行，不阻塞 UI）
      verifyClaimOnChain().then((verified) => {
        if (verified) {
          console.log('[handleClaim] ✅ 链上验证完成，数据已同步');
        } else {
          console.warn('[handleClaim] ⚠️ 链上验证未完全成功，但交易已确认，数据应已同步');
        }
      });
      
      // 立即刷新冷却时间（不等待验证）
      fetchCooldown();
      
      // ✅ 修复：刷新用户信息，确保能量和团队规模正确显示
      setTimeout(async () => {
        try {
          const { fetchUserInfo, fetchTeamRewards } = await import('../api');
          const [userInfo, teamData] = await Promise.all([
            fetchUserInfo(currentAddress).catch(() => null),
            fetchTeamRewards(currentAddress).catch(() => ({ totalRewards: '0' })),
          ]);
          
          if (userInfo) {
            setStats(p => ({
              ...p,
              address: currentAddress,
              energy: Number(userInfo.energy || 0),
              teamSize: Number(userInfo.inviteCount || 0),
            }));
            console.log('[handleClaim] ✅ 用户信息已刷新:', {
              energy: userInfo.energy,
              inviteCount: userInfo.inviteCount,
              teamRewards: teamData?.totalRewards
            });
          }
        } catch (error) {
          console.warn('[handleClaim] 刷新用户信息失败:', error);
        }
      }, 3000); // 延迟 3 秒，确保后端数据已写入
      
    } catch (err: any) {
      console.error('Claim error details:', err);
      
      if (err?.code === 'NETWORK_ERROR' || err?.message?.includes('network changed')) {
        showError(`网络不匹配，请在钱包中切换到 BNB Smart Chain 主网 (Chain ID: ${CHAIN_ID})`);
      } else if (err?.code === -32603 || err?.code === 'SERVER_ERROR' || err?.code === 'UNPREDICTABLE_GAS_LIMIT') {
        const errorData = err?.data || err?.error || {};
        const errorMessage = errorData?.message || err?.message || err?.reason || 'Internal RPC error';
        
        if (errorMessage.includes('Contract empty') || errorMessage.includes('contract empty')) {
          showError(t('mining.contractEmpty') || '合约代币余额不足，请联系管理员充值');
        } else if (errorMessage.includes('Cooldown') || errorMessage.includes('cooldown')) {
          showWarning(t('mining.cooldown') || '冷却中，请稍候');
          fetchCooldown();
        } else if (errorMessage.includes('Insufficient') || errorMessage.includes('balance')) {
          showError(t('mining.insufficientBnbBalance') || 'BNB余额不足无法领取空投奖励');
        } else {
          showError(`交易失败: ${errorMessage}`);
        }
      } else {
        const errorMsg = err?.message || err?.reason || formatError(err);
        if (errorMsg.includes('Contract empty') || errorMsg.includes('contract empty')) {
          showError(t('mining.contractEmpty') || '合约代币余额不足，请联系管理员充值');
        } else {
          showError(formatError(err));
        }
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700 relative">
      {/* Hero Claim Card */}
      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-[#FCD535] to-orange-500 rounded-[2rem] blur-xl opacity-10 group-hover:opacity-20 transition-opacity" />
        <div className="relative glass rounded-[2rem] p-8 overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
             <Zap className="w-32 h-32 text-[#FCD535]" />
          </div>
          
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                <Sparkles className="w-3 h-3 text-[#FCD535]" />
                <span className="text-[#848E9C] text-[10px] font-black uppercase tracking-[0.2em]">{t('mining.dailyNodeIncentive') || '每日节点激励'}</span>
              </div>
              <div className="flex items-center gap-1 bg-[#0ECB81]/10 px-2 py-0.5 rounded border border-[#0ECB81]/30">
                 <ShieldCheck className="w-2.5 h-2.5 text-[#0ECB81]" />
                 <span className="text-[8px] font-black text-[#0ECB81] uppercase">{t('mining.audited') || '已审计'}</span>
              </div>
            </div>
            
            <div className="text-5xl font-black text-white mb-8 mono tracking-tighter">
              {isCooldown ? formatTime(countdown) : formatTime(DEFAULT_COOLDOWN)}
            </div>
            
            <div className="w-full space-y-3">
              <button 
                onClick={handleClaim}
                disabled={claiming || isCooldown}
                className={`w-full relative group/btn overflow-hidden font-black py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50 shadow-lg ${
                  isCooldown 
                    ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed shadow-zinc-900/10' 
                    : 'bg-gradient-to-r from-[#FCD535] to-[#f3ba2f] text-[#0B0E11] shadow-[#FCD535]/10'
                }`}
              >
                {!isCooldown && (
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                )}
                <span className="relative z-10 text-lg uppercase tracking-tight">
                  {claiming 
                    ? (t('mining.blockchainSyncing') || '区块链同步中...')
                    : isCooldown 
                      ? (t('mining.cooldownWait') || '冷却中，请稍候')
                      : (t('mining.claimButton') || '领取RAT空投奖励')
                  }
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Referral Hub */}
      <div className="bg-[#1e2329]/40 border border-white/5 rounded-[1.5rem] p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
               <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight">{t('mining.growthNetwork') || '增长网络'}</h3>
              <p className="text-[10px] text-[#848E9C]">{t('mining.expandReach') || '扩展去中心化覆盖范围'}</p>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#0b0e11]/60 p-4 rounded-xl border border-white/5 group transition-colors hover:border-[#FCD535]/30">
            <span className="text-[#848E9C] text-xs mono truncate mr-4">
              {stats.address && stats.address.startsWith('0x') 
                ? `${window.location.origin}${window.location.pathname}?ref=${stats.address}`
                : (() => {
                    // 如果未连接钱包，检查 URL 中是否有 ref 参数
                    const params = new URLSearchParams(window.location.search);
                    const refFromUrl = params.get('ref');
                    if (refFromUrl && ethers.utils.isAddress(refFromUrl)) {
                      // 如果有 ref 参数，显示推荐人的邀请链接
                      return `${window.location.origin}${window.location.pathname}?ref=${refFromUrl}`;
                    }
                    // 否则显示当前页面链接（用户连接钱包后会自动生成自己的邀请链接）
                    return `${window.location.origin}${window.location.pathname}`;
                  })()}
            </span>
            <button 
              onClick={() => {
                let link = '';
                if (stats.address && stats.address.startsWith('0x')) {
                  // 已连接钱包，使用用户的地址
                  link = `${window.location.origin}${window.location.pathname}?ref=${stats.address}`;
                } else {
                  // 未连接钱包，检查 URL 中的 ref 参数
                  const params = new URLSearchParams(window.location.search);
                  const refFromUrl = params.get('ref');
                  if (refFromUrl && ethers.utils.isAddress(refFromUrl)) {
                    link = `${window.location.origin}${window.location.pathname}?ref=${refFromUrl}`;
                  } else {
                    link = `${window.location.origin}${window.location.pathname}`;
                  }
                }
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 bg-[#FCD535]/10 text-[#FCD535] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-[#FCD535]/20 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? (t('common.copied') || '已复制') : (t('common.copy') || '复制')}
            </button>
          </div>
          
          <div className="flex items-center gap-4 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-black italic">
              +2
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-white">{t('mining.referralBonus') || '推荐奖励'}</p>
              <p className="text-[10px] text-[#848E9C]">{t('mining.referralDesc') || '每邀请一个节点获得 2 能量单位，每次下级领取空投额外获得 1 能量'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Listing Countdown */}
      <InlineListingCountdown 
        targetDate={countdownConfig.targetDate}
        exchangeName={countdownConfig.exchangeName}
        bgImageUrl={countdownConfig.bgImageUrl}
      />

      {/* Institutional Partners */}
      <div className="pt-2 pb-4 px-2">
        <p className="text-[9px] text-center text-[#848E9C] font-black uppercase tracking-[0.3em] mb-6">{t('mining.institutionalEcosystem') || '机构生态'}</p>
        <div className="grid grid-cols-2 gap-3 px-2">
          {PARTNERS.map((p, i) => (
            <div key={i} className="flex items-center justify-center gap-2 py-3 opacity-100 transition-all duration-300 border-b border-white/10 hover:border-[#FCD535]/30 group">
              <div className="text-white transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(252,213,53,0.6)]">
                {getPartnerIcon(p.name, "w-4 h-4")}
              </div>
              <span className="text-[10px] font-bold text-white tracking-tighter uppercase transition-all duration-300 group-hover:text-[#FCD535]">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* REWARD ANIMATION MODAL - UPGRADED WITH BIG DOLLAR ICON */}
      {showRewardModal && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center px-4 sm:px-6 bg-[#0b0e11]/95 backdrop-blur-2xl animate-in fade-in duration-500 overflow-y-auto"
          onClick={() => setShowRewardModal(false)}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
             {/* Dynamic Light Rays */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#FCD535]/15 rounded-full blur-[120px] animate-pulse" />
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-orange-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
          </div>

          <div 
            className="relative w-full max-w-sm glass rounded-[3rem] p-6 sm:p-8 md:p-10 border border-white/10 shadow-[0_0_100px_rgba(252,213,53,0.2)] text-center animate-in zoom-in-75 slide-in-from-bottom-20 duration-500 flex flex-col items-center my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Massive Dollar Icon Interaction */}
            <div className="relative mb-6 sm:mb-8 md:mb-10 group">
              <div className="absolute inset-0 bg-[#FCD535] blur-3xl opacity-30 group-hover:opacity-50 transition-opacity animate-pulse" />
              
              {/* Outer Spinning Ring */}
              <div className="absolute -inset-4 sm:-inset-6 border-2 border-dashed border-[#FCD535]/20 rounded-full animate-[spin_10s_linear_infinite]" />
              <div className="absolute -inset-2 sm:-inset-3 border border-[#FCD535]/40 rounded-full animate-[spin_6s_linear_infinite_reverse]" />

              <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 bg-gradient-to-br from-[#FCD535] via-[#f3ba2f] to-orange-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(252,213,53,0.4)] relative animate-bounce hover:scale-110 transition-transform cursor-pointer">
                <DollarSign className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-[#0B0E11] stroke-[3px]" />
                
                {/* Floating mini sparks */}
                <Sparkles className="absolute -top-2 -right-2 w-5 h-5 sm:w-6 sm:h-6 text-white animate-pulse" />
                <Sparkles className="absolute -bottom-1 -left-3 w-4 h-4 sm:w-5 sm:h-5 text-white/50 animate-pulse" style={{ animationDelay: '0.5s' }} />
              </div>

              {/* Success Badge */}
              <div className="absolute -top-4 sm:-top-6 right-0 bg-white text-[#0B0E11] px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[9px] sm:text-[11px] font-black uppercase tracking-tighter rotate-12 shadow-xl">
                {t('mining.luckyDrop') || '幸运掉落！'}
              </div>
            </div>

            <div className="space-y-2 mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter leading-none">{t('mining.nodeRewardUnlocked') || '节点奖励已解锁'}</h2>
              <p className="text-[#848E9C] text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em]">{t('mining.blockConfirmed') || '区块已确认 • 资产已到账'}</p>
            </div>

            <div className="w-full space-y-3 mb-6 sm:mb-8 md:mb-10">
              <div className="bg-white/[0.03] p-4 sm:p-5 rounded-[1.5rem] border border-white/5 flex items-center justify-between group hover:bg-white/5 transition-colors">
                 <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#FCD535]/10 rounded-2xl flex items-center justify-center border border-[#FCD535]/20 flex-shrink-0">
                      <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-[#FCD535]" />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-[10px] sm:text-xs font-black text-white uppercase truncate">{t('mining.ratTokens') || 'RAT 代币'}</p>
                      <p className="text-[8px] sm:text-[9px] text-[#848E9C] font-bold truncate">{t('mining.networkIncentive') || '网络激励'}</p>
                    </div>
                 </div>
                 <div className="text-right flex-shrink-0">
                    <span className="text-xl sm:text-2xl font-black mono text-[#0ECB81]">+{parseFloat(rewardAmount).toFixed(2)}</span>
                 </div>
              </div>

              <div className="bg-white/[0.03] p-4 sm:p-5 rounded-[1.5rem] border border-white/5 flex items-center justify-between group hover:bg-white/5 transition-colors">
                 <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 flex-shrink-0">
                      <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400 fill-blue-400" />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-[10px] sm:text-xs font-black text-white uppercase truncate">{t('mining.gridEnergy') || '网格能量'}</p>
                      <p className="text-[8px] sm:text-[9px] text-[#848E9C] font-bold truncate">{t('mining.protocolCharge') || '协议费用'}</p>
                    </div>
                 </div>
                 <div className="text-right flex-shrink-0">
                    <span className="text-xl sm:text-2xl font-black mono text-blue-400">+1.0</span>
                 </div>
              </div>
            </div>

            <button 
              onClick={() => setShowRewardModal(false)} 
              className="w-full relative overflow-hidden group/btn bg-[#FCD535] text-[#0B0E11] font-black py-4 sm:py-5 rounded-[1.5rem] shadow-[0_15px_30px_rgba(252,213,53,0.2)] hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-[0.2em] text-xs sm:text-sm"
            >
              <div className="absolute inset-0 bg-white/30 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000" />
              <span className="relative z-10">{t('mining.backToMining') || '返回挖矿'}</span>
            </button>

            {/* 邀请引导 - 增长黑客 */}
            <div className="mt-4 sm:mt-6 text-center">
              <p className="text-[9px] sm:text-[10px] text-[#848E9C] font-bold uppercase tracking-widest mb-2">{t('mining.wantMoreEnergy') || '想要更多能量？'}</p>
              <button 
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (stats.address && stats.address.startsWith('0x')) {
                    const link = `${window.location.origin}${window.location.pathname}?ref=${stats.address}`;
                    try {
                      await navigator.clipboard.writeText(link);
                      showSuccess(t('profile.inviteLinkCopiedSuccess') || '邀请链接已复制！分享好友可获得 +2 能量值');
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
                        showSuccess(t('profile.inviteLinkCopiedSuccess') || '邀请链接已复制！分享好友可获得 +2 能量值');
                      } catch (err) {
                        showError(t('profile.copyFailed') || '复制失败，请手动复制链接');
                      }
                      document.body.removeChild(textArea);
                    }
                  } else {
                    showError(t('profile.connectWalletFirst') || '请先连接钱包');
                  }
                }}
                className="text-[#FCD535] text-[10px] sm:text-xs font-black uppercase hover:underline flex items-center justify-center gap-1.5 mx-auto transition-all active:scale-95"
              >
                <span className="bg-[#FCD535]/10 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-[#FCD535]/30 hover:bg-[#FCD535]/20 transition-colors">
                  {t('mining.inviteFriendForEnergy') || '邀请好友 +2 能量'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect DApp Modal - Using Portal */}
      {showDisconnectModal && createPortal(
        <div 
          className="fixed inset-0 z-[50] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#0b0e11]/95 backdrop-blur-2xl animate-in fade-in duration-300"
          onClick={(e) => {
            // 点击背景不关闭，必须点击按钮刷新
            e.stopPropagation();
          }}
        >
          <div 
            className="bg-gradient-to-b from-[#1e2329] to-[#0b0e11] w-full sm:max-w-sm rounded-t-[2rem] rounded-b-none sm:rounded-b-[2rem] border-t border-l border-r border-white/10 sm:border border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] sm:shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 overflow-hidden max-h-[92vh] sm:max-h-[85vh] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Background Decoration */}
            <div className="absolute top-[-10%] left-[-10%] w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-32 h-32 bg-orange-500/10 blur-3xl rounded-full" />

            {/* Header */}
            <div className="relative p-3 sm:p-6 pb-2 sm:pb-4 flex-shrink-0">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-[#FCD535]/20 rounded-b-full" />
              <div className="flex justify-between items-start mb-3 sm:mb-4">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 pr-2 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-500/10 rounded-xl sm:rounded-2xl flex items-center justify-center border border-yellow-500/20 flex-shrink-0">
                    <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-lg font-black text-white uppercase tracking-tight truncate">连接提示</h3>
                    <p className="text-[8px] sm:text-[10px] text-[#848E9C] font-bold uppercase tracking-widest mt-0.5 truncate">Connection Notice</p>
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    // 关闭按钮也执行清理和刷新
                    try {
                      await disconnectWallet();
                      const keysToRemove: string[] = [];
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (key.startsWith('wc@2:') || key.startsWith('walletconnect'))) {
                          keysToRemove.push(key);
                        }
                      }
                      keysToRemove.forEach(key => localStorage.removeItem(key));
                      setShowDisconnectModal(false);
                      setTimeout(() => window.location.reload(), 300);
                    } catch (error) {
                      console.error('[DisconnectModal] 清理失败:', error);
                      setShowDisconnectModal(false);
                      setTimeout(() => window.location.reload(), 300);
                    }
                  }}
                  className="p-1.5 sm:p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all hover:rotate-90 flex-shrink-0 touch-manipulation active:scale-90"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-[#848E9C]" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-3 sm:px-6 pb-3 sm:pb-6 overflow-y-auto flex-1">
              <div className="bg-white/[0.03] border border-white/5 p-3 sm:p-5 rounded-xl mb-4 sm:mb-6">
                <div className="flex items-start gap-2 sm:gap-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0 border border-blue-500/20">
                    <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm text-white/90 font-medium leading-relaxed">
                      检测到连接冲突，将自动刷新页面并清除连接数据
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-[#848E9C] font-bold uppercase tracking-widest mt-1.5 sm:mt-2">
                      Connection conflict detected, will auto-refresh
                    </p>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-[#FCD535]/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-[#FCD535]/20">
                    <span className="text-[9px] sm:text-[10px] font-black text-[#FCD535]">1</span>
                  </div>
                  <div className="flex-1 pt-0.5 min-w-0">
                    <p className="text-[10px] sm:text-xs text-white/80 font-medium">清除所有连接数据和缓存</p>
                    <p className="text-[8px] sm:text-[9px] text-[#848E9C] font-bold uppercase tracking-wider mt-1">Clear all connection data</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-[#FCD535]/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-[#FCD535]/20">
                    <span className="text-[9px] sm:text-[10px] font-black text-[#FCD535]">2</span>
                  </div>
                  <div className="flex-1 pt-0.5 min-w-0">
                    <p className="text-[10px] sm:text-xs text-white/80 font-medium">页面将自动刷新，请重新连接钱包</p>
                    <p className="text-[8px] sm:text-[9px] text-[#848E9C] font-bold uppercase tracking-wider mt-1">Page will auto-refresh, reconnect wallet</p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex-shrink-0" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
                <button 
                  onClick={async () => {
                    try {
                      // 1. 断开当前钱包连接
                      await disconnectWallet();
                      
                      // 2. 清除所有 WalletConnect session 数据
                      try {
                        const keysToRemove: string[] = [];
                        for (let i = 0; i < localStorage.length; i++) {
                          const key = localStorage.key(i);
                          if (key && (key.startsWith('wc@2:') || key.startsWith('walletconnect'))) {
                            keysToRemove.push(key);
                          }
                        }
                        keysToRemove.forEach(key => localStorage.removeItem(key));
                        console.log('[DisconnectModal] 已清除 WalletConnect session 数据');
                      } catch (cleanError) {
                        console.warn('[DisconnectModal] 清除 WalletConnect session 失败:', cleanError);
                      }
                      
                      // 3. 关闭弹窗
                      setShowDisconnectModal(false);
                      
                      // 4. 延迟刷新页面，让用户看到弹窗关闭动画
                      setTimeout(() => {
                        window.location.reload();
                      }, 300);
                    } catch (error) {
                      console.error('[DisconnectModal] 清理连接数据失败:', error);
                      // 即使清理失败，也刷新页面
                      setShowDisconnectModal(false);
                      setTimeout(() => {
                        window.location.reload();
                      }, 300);
                    }
                  }}
                  className="w-full relative overflow-hidden group/btn bg-gradient-to-r from-[#FCD535] to-[#f3ba2f] text-[#0B0E11] font-black py-3 sm:py-4 rounded-xl sm:rounded-2xl shadow-lg shadow-[#FCD535]/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-tight text-[10px] sm:text-sm touch-manipulation min-h-[44px]"
                >
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    刷新并重新连接
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MiningView;
