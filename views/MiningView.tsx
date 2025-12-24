
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { Gift, Copy, Check, Users, Zap, Sparkles, X, Trophy, ShieldCheck, DollarSign } from 'lucide-react';
import { UserStats } from '../types';
import { PARTNERS, AUDIT_LOGOS, CONTRACTS, ABIS, AIRDROP_FEE, CHAIN_ID } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { getProvider, getContract, formatError, switchNetwork, connectWallet } from '../services/web3Service';
import { verifyClaim } from '../api';
import { getPartnerIcon } from '../components/PartnerIcons';
import { WalletType } from '../types';

interface MiningViewProps {
  stats: UserStats;
  setStats: React.Dispatch<React.SetStateAction<UserStats>>;
}

const MiningView: React.FC<MiningViewProps> = ({ stats, setStats }) => {
  const { t } = useLanguage();
  const DEFAULT_COOLDOWN = 4 * 3600; // 4 小时占位，用于未领取前静态显示
  const [countdown, setCountdown] = useState(DEFAULT_COOLDOWN); 
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardAmount, setRewardAmount] = useState('0');
  const [nextClaimTime, setNextClaimTime] = useState<number>(0);
  const [isCooldown, setIsCooldown] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
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

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // 领取成功后需要把 txHash 同步到后端写库（claims/users/energy）。
  // 这里做自动重试：每 2 秒重试 1 次，共 5 次；只有全部失败才提示用户把 txHash 发给管理员。
  const syncClaimWithRetry = async (params: { address: string; txHash: string; referrer: string }) => {
    const maxAttempts = 5;
    const delayMs = 2000;
    let lastErr: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await verifyClaim(params.address, params.txHash, params.referrer);
        return { ok: true as const, attempt };
      } catch (e: any) {
        lastErr = e;
        if (attempt < maxAttempts) {
          await sleep(delayMs);
          continue;
        }
      }
    }

    const msg = lastErr?.response?.data?.message || lastErr?.message || 'verify-claim failed';
    const code = lastErr?.response?.data?.code || 'UNKNOWN';
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
    try {
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
      
      const contract = await getContract(CONTRACTS.AIRDROP, ABIS.AIRDROP, undefined);
      const lastClaim = await contract.lastClaimTime(stats.address);
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
    } catch (err) {
      console.error('Error fetching cooldown:', err);
      setIsCooldown(false);
      setNextClaimTime(0);
    }
  }, [stats.address]);

  useEffect(() => {
    if (stats.address && stats.address.startsWith('0x')) {
      fetchCooldown();
    }
  }, [stats.address, fetchCooldown]);

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
    if (!provider || !stats.address || !stats.address.startsWith('0x')) {
      try {
        const walletType = pickWalletType();
        await connectWallet(walletType);
        // 等待一下让钱包状态更新
        await sleep(800);
        provider = getProvider();
        // 重新检查地址（需要从钱包获取）
        if (!provider) {
          alert(t('common.connectWallet') || '请先连接钱包');
          return;
        }
        // 获取当前连接的地址
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        if (!address || !address.startsWith('0x')) {
          alert(t('common.connectWallet') || '请先连接钱包');
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
      } catch (error: any) {
        console.error('Failed to connect wallet:', error);
        alert('连接钱包失败，请重试');
        return;
      }
    }

    // 检查冷却时间
    if (isCooldown) {
      alert(t('mining.cooldown') || '冷却中，请稍候');
      return;
    }
    
    setClaiming(true);
    try {
      // 检查网络是否匹配
      try {
        const network = await provider.getNetwork();
        const currentChainId = Number(network.chainId);
        if (currentChainId !== CHAIN_ID) {
          try {
            await switchNetwork();
            // 等待网络切换
            await sleep(1500);
            // 重新获取 provider 以确保网络已切换
            provider = getProvider() || provider;
            // 再次检查网络
            const newNetwork = await provider.getNetwork();
            const newChainId = Number(newNetwork.chainId);
            if (newChainId !== CHAIN_ID) {
              alert(`请切换到 BNB Smart Chain (Chain ID: ${CHAIN_ID})`);
              setClaiming(false);
              return;
            }
          } catch (switchErr) {
            alert(`请先切换到 BNB Smart Chain Mainnet (Chain ID: ${CHAIN_ID})`);
            setClaiming(false);
            return;
          }
        }
      } catch (networkError: any) {
        if (networkError.code === 'NETWORK_ERROR' || networkError.message?.includes('network changed')) {
          alert(`检测到网络不匹配，请切换到 BNB Smart Chain Mainnet (Chain ID: ${CHAIN_ID})`);
          setClaiming(false);
          return;
        }
        console.error('Network check error:', networkError);
      }
      
      const signer = provider.getSigner();
      if (!signer) throw new Error("No signer");
      
      // 获取当前地址（确保使用最新地址）
      const currentAddress = await signer.getAddress();
      if (!currentAddress || !currentAddress.startsWith('0x')) {
        alert(t('common.connectWallet') || '请先连接钱包');
        setClaiming(false);
        return;
      }
      
      // 检查用户 BNB 余额（使用当前地址）
      const balance = await provider.getBalance(currentAddress);
      const feeAmount = ethers.utils.parseEther(AIRDROP_FEE);
      const estimatedGas = ethers.utils.parseEther('0.0001'); // 优化后的预估 Gas 费用（0.0001 BNB）
      const requiredBalance = feeAmount.add(estimatedGas);
      
      // 更新stats中的BNB余额
      const bnbBalance = parseFloat(ethers.utils.formatEther(balance));
      setStats(prev => ({ ...prev, bnbBalance }));
      
      if (balance.lt(requiredBalance)) {
        const balanceFormatted = ethers.utils.formatEther(balance);
        const requiredFormatted = ethers.utils.formatEther(requiredBalance);
        alert(`${t('mining.insufficientBnbBalance') || 'BNB余额不足无法领取空投奖励'}\n当前余额: ${parseFloat(balanceFormatted).toFixed(6)} BNB\n需要: ${parseFloat(requiredFormatted).toFixed(6)} BNB`);
        setClaiming(false);
        return;
      }
      
      const contract = await getContract(CONTRACTS.AIRDROP, ABIS.AIRDROP, signer);
      const refAddr = getReferrerFromUrl();
      
      // 估算 gas limit
      let gasLimit;
      try {
        const estimatedGas = await contract.estimateGas.claim(refAddr, { value: feeAmount });
        gasLimit = estimatedGas.mul(130).div(100);
      } catch (estimateError: any) {
        const errorMsg = estimateError?.message || estimateError?.toString() || '';
        if (errorMsg.includes('Cooldown') || errorMsg.includes('cooldown')) {
          alert(t('mining.cooldown') || '冷却中，请稍候');
          setClaiming(false);
          fetchCooldown();
          return;
        }
        if (errorMsg.includes('Insufficient') || errorMsg.includes('balance')) {
          alert(t('mining.insufficientBnbBalance') || 'BNB余额不足无法领取空投奖励');
          setClaiming(false);
          return;
        }
        gasLimit = ethers.BigNumber.from('500000');
      }
      
      // 发送交易
      const tx = await contract.claim(refAddr, { 
        value: feeAmount,
        gasLimit: gasLimit
      });
      const receipt = await tx.wait();

      // 解析 Claimed 事件
      const iface = new ethers.utils.Interface(ABIS.AIRDROP);
      let wonAmount = '0';
      receipt.logs.forEach((log: any) => {
          try {
              const parsed = iface.parseLog(log);
              if(parsed?.name === 'Claimed') wonAmount = ethers.utils.formatEther(parsed.args.amount);
          } catch(e) {}
      });

      // 显示奖励弹窗
      setRewardAmount(wonAmount);
      setShowRewardModal(true);
      
      // API 同步
      const syncRes = await syncClaimWithRetry({ 
        address: stats.address, 
        txHash: receipt.hash, 
        referrer: refAddr 
      });
      if (!syncRes.ok) {
        enqueuePendingClaim({ 
          address: stats.address, 
          txHash: receipt.hash, 
          referrer: refAddr 
        });
        console.warn('后端同步失败，已加入待同步队列:', syncRes.message);
      }
      
      // 触发能量值刷新事件
      try {
        localStorage.setItem('rabbit_needs_userinfo_refresh_at', String(Date.now()));
      } catch {}
      window.dispatchEvent(new CustomEvent('refreshEnergy'));
      
      // 刷新冷却时间
      fetchCooldown();
      
      // 更新本地状态（临时，实际应该从后端获取）
      setStats(p => ({ 
        ...p, 
        ratBalance: p.ratBalance + parseFloat(wonAmount),
        energy: p.energy + 1 
      }));
      
    } catch (err: any) {
      console.error('Claim error details:', err);
      
      if (err?.code === 'NETWORK_ERROR' || err?.message?.includes('network changed')) {
        alert(`检测到网络不匹配，请切换到 BNB Smart Chain Mainnet (Chain ID: ${CHAIN_ID})`);
      } else if (err?.code === -32603 || err?.code === 'SERVER_ERROR' || err?.code === 'UNPREDICTABLE_GAS_LIMIT') {
        const errorData = err?.data || err?.error || {};
        const errorMessage = errorData?.message || err?.message || err?.reason || 'Internal RPC error';
        
        if (errorMessage.includes('Contract empty') || errorMessage.includes('contract empty')) {
          alert(t('mining.contractEmpty') || '合约代币余额不足，请联系管理员充值');
        } else if (errorMessage.includes('Cooldown') || errorMessage.includes('cooldown')) {
          alert(t('mining.cooldown') || '冷却中，请稍候');
          fetchCooldown();
        } else if (errorMessage.includes('Insufficient') || errorMessage.includes('balance')) {
          alert(t('mining.insufficientBnbBalance') || 'BNB余额不足无法领取空投奖励');
        } else {
          alert(`交易失败: ${errorMessage}`);
        }
      } else {
        const errorMsg = err?.message || err?.reason || formatError(err);
        if (errorMsg.includes('Contract empty') || errorMsg.includes('contract empty')) {
          alert(t('mining.contractEmpty') || '合约代币余额不足，请联系管理员充值');
        } else {
          alert(formatError(err));
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
                disabled={claiming}
                className="w-full relative group/btn overflow-hidden bg-gradient-to-r from-[#FCD535] to-[#f3ba2f] text-[#0B0E11] font-black py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-[#FCD535]/10"
              >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                <span className="relative z-10 text-lg uppercase tracking-tight">
                  {claiming ? (t('mining.blockchainSyncing') || '区块链同步中...') : (t('mining.claimButton') || '领取 10.00 RAT')}
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
              +5
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-white">{t('mining.referralBonus') || '推荐奖励'}</p>
              <p className="text-[10px] text-[#848E9C]">{t('mining.referralDesc') || '每邀请一个节点获得 5 能量单位'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Institutional Audit & Partners */}
      <div className="pt-2 pb-4 px-2">
        <div className="flex items-center gap-4 mb-8 overflow-x-auto no-scrollbar py-2">
          {AUDIT_LOGOS.map((audit, i) => (
             <div key={i} className="flex-shrink-0 flex items-center gap-2 bg-white/[0.03] border border-white/5 px-4 py-2 rounded-xl">
               <ShieldCheck className="w-4 h-4 text-[#0ECB81]" />
               <span className="text-[10px] font-black text-white/70 uppercase tracking-tighter whitespace-nowrap">{audit.name}</span>
             </div>
          ))}
        </div>

        <p className="text-[9px] text-center text-[#848E9C] font-black uppercase tracking-[0.3em] mb-6">{t('mining.institutionalEcosystem') || '机构生态'}</p>
        <div className="grid grid-cols-2 gap-3 px-2">
          {PARTNERS.map((p, i) => (
            <div key={i} className="flex items-center justify-center gap-2 py-3 grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all duration-500 border-b border-white/5">
              <div className="text-[#848E9C] hover:text-white transition-colors">
                {getPartnerIcon(p.name, "w-4 h-4")}
              </div>
              <span className="text-[10px] font-bold text-[#848E9C] tracking-tighter uppercase">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* REWARD ANIMATION MODAL - UPGRADED WITH BIG DOLLAR ICON */}
      {showRewardModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-6 bg-[#0b0e11]/95 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
             {/* Dynamic Light Rays */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#FCD535]/15 rounded-full blur-[120px] animate-pulse" />
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-orange-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
          </div>

          <div className="relative w-full max-w-sm glass rounded-[3rem] p-10 border border-white/10 shadow-[0_0_100px_rgba(252,213,53,0.2)] text-center animate-in zoom-in-75 slide-in-from-bottom-20 duration-500 flex flex-col items-center">
            
            {/* Massive Dollar Icon Interaction */}
            <div className="relative mb-10 group">
              <div className="absolute inset-0 bg-[#FCD535] blur-3xl opacity-30 group-hover:opacity-50 transition-opacity animate-pulse" />
              
              {/* Outer Spinning Ring */}
              <div className="absolute -inset-6 border-2 border-dashed border-[#FCD535]/20 rounded-full animate-[spin_10s_linear_infinite]" />
              <div className="absolute -inset-3 border border-[#FCD535]/40 rounded-full animate-[spin_6s_linear_infinite_reverse]" />

              <div className="w-28 h-28 bg-gradient-to-br from-[#FCD535] via-[#f3ba2f] to-orange-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(252,213,53,0.4)] relative animate-bounce hover:scale-110 transition-transform cursor-pointer">
                <DollarSign className="w-16 h-16 text-[#0B0E11] stroke-[3px]" />
                
                {/* Floating mini sparks */}
                <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-white animate-pulse" />
                <Sparkles className="absolute -bottom-1 -left-3 w-5 h-5 text-white/50 animate-pulse" style={{ animationDelay: '0.5s' }} />
              </div>

              {/* Success Badge */}
              <div className="absolute -top-6 right-0 bg-white text-[#0B0E11] px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-tighter rotate-12 shadow-xl">
                {t('mining.luckyDrop') || '幸运掉落！'}
              </div>
            </div>

            <div className="space-y-2 mb-8">
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">{t('mining.nodeRewardUnlocked') || '节点奖励已解锁'}</h2>
              <p className="text-[#848E9C] text-[10px] font-black uppercase tracking-[0.3em]">{t('mining.blockConfirmed') || '区块已确认 • 资产已到账'}</p>
            </div>

            <div className="w-full space-y-3 mb-10">
              <div className="bg-white/[0.03] p-5 rounded-[1.5rem] border border-white/5 flex items-center justify-between group hover:bg-white/5 transition-colors">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#FCD535]/10 rounded-2xl flex items-center justify-center border border-[#FCD535]/20">
                      <DollarSign className="w-6 h-6 text-[#FCD535]" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black text-white uppercase">{t('mining.ratTokens') || 'RAT 代币'}</p>
                      <p className="text-[9px] text-[#848E9C] font-bold">{t('mining.networkIncentive') || '网络激励'}</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <span className="text-2xl font-black mono text-[#0ECB81]">+{parseFloat(rewardAmount).toFixed(2)}</span>
                 </div>
              </div>

              <div className="bg-white/[0.03] p-5 rounded-[1.5rem] border border-white/5 flex items-center justify-between group hover:bg-white/5 transition-colors">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                      <Zap className="w-6 h-6 text-blue-400 fill-blue-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black text-white uppercase">{t('mining.gridEnergy') || '网格能量'}</p>
                      <p className="text-[9px] text-[#848E9C] font-bold">{t('mining.protocolCharge') || '协议费用'}</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <span className="text-2xl font-black mono text-blue-400">+1.0</span>
                 </div>
              </div>
            </div>

            <button 
              onClick={() => setShowRewardModal(false)} 
              className="w-full relative overflow-hidden group/btn bg-[#FCD535] text-[#0B0E11] font-black py-5 rounded-[1.5rem] shadow-[0_15px_30px_rgba(252,213,53,0.2)] hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-[0.2em] text-sm"
            >
              <div className="absolute inset-0 bg-white/30 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000" />
              <span className="relative z-10">{t('mining.backToMining') || '返回挖矿'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiningView;
