import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { X, CheckCircle2, Copy, Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface WithdrawalSuccessModalProps {
  amount: string;
  txHash?: string;
  userAddress: string;
  onClose: () => void;
}

const WithdrawalSuccessModal: React.FC<WithdrawalSuccessModalProps> = ({ amount, txHash, userAddress, onClose }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  // 特效：彩带 (保留，增加爽感)
  useEffect(() => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  // 生成分享文案 (作为备用，用户复制发给朋友)
  const getShareText = () => {
    const link = `${window.location.origin}${window.location.pathname}?ref=${userAddress}`;
    const template = t('profile.shareTextTemplate') || '💰 I just withdrew {amount} USDT from Rabbit AI! \n🚀 Daily passive income. \n👇 Check it out:\n{link}';
    return template.replace('{amount}', amount).replace('{link}', link);
  };

  // 复制功能
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  return (
    <AnimatePresence>
      {/* 全屏背景 - 玻璃拟态效果 */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
          className="relative w-full max-w-sm overflow-hidden"
        >
          {/* 多层环境光效果 - 营造宝箱开启的感觉 */}
          <div className="absolute -inset-20 bg-gradient-to-br from-[#FCD535]/30 via-[#FCD535]/10 to-transparent blur-3xl rounded-full animate-pulse" />
          <div className="absolute -inset-10 bg-gradient-to-tr from-[#FCD535]/20 to-transparent blur-2xl rounded-full" />
          
          {/* 玻璃拟态卡片主体 */}
          <div className="relative bg-gradient-to-b from-[#1e2329]/95 via-[#1a1f25]/95 to-[#161920]/95 backdrop-blur-xl border border-[#FCD535]/40 rounded-[2.5rem] p-8 shadow-[0_0_80px_rgba(252,213,53,0.4),0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* 内部光效装饰 */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#FCD535]/10 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-[#FCD535]/5 blur-[80px] rounded-full pointer-events-none" />

            {/* 关闭按钮 */}
            <button 
              onClick={onClose} 
              className="absolute top-5 right-5 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-[#848E9C] hover:text-white transition-all z-20 backdrop-blur-sm"
            >
              <X className="w-5 h-5" />
            </button>

            {/* 成功图标 - 增强光效 */}
            <div className="relative z-10 mb-6 flex justify-center">
              <div className="relative">
                {/* 图标光晕 */}
                <div className="absolute inset-0 bg-[#FCD535]/30 blur-2xl rounded-full animate-pulse" />
                <div className="relative w-24 h-24 bg-gradient-to-br from-[#FCD535] via-[#FFD700] to-[#FFA500] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(252,213,53,0.6),inset_0_2px_10px_rgba(255,255,255,0.3)] animate-bounce">
                  <CheckCircle2 className="w-12 h-12 text-[#0B0E11] drop-shadow-lg" />
                </div>
              </div>
            </div>

            {/* 标题区域 */}
            <h2 className="relative z-10 text-2xl font-black text-white italic tracking-wide mb-2 text-center">
              {t('profile.withdrawalSuccessTitle') || 'PAYMENT RECEIVED!'}
            </h2>
            <p className="relative z-10 text-xs text-[#848E9C] font-bold uppercase tracking-widest mb-8 text-center">
              {t('profile.withdrawalSuccessSubtitle') || 'Funds Received'}
            </p>

            {/* 金额展示 - 全息投影效果 */}
            <div className="relative z-10 mb-8">
              {/* 金额光晕背景 */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#FCD535]/20 via-[#FFD700]/10 to-transparent blur-3xl rounded-full" />
              
              {/* 金额主体 - 悬浮全息投影效果 */}
              <div className="relative">
                <p className="text-[#FCD535] text-6xl sm:text-7xl font-black mono tracking-tighter flex items-baseline justify-center gap-2 drop-shadow-[0_0_30px_rgba(252,213,53,0.8)]">
                  <span className="text-3xl sm:text-4xl opacity-70 font-extrabold">$</span>
                  <span className="relative">
                    {amount}
                    {/* 数字光效 */}
                    <span className="absolute inset-0 text-[#FFD700] blur-xl opacity-50 animate-pulse">{amount}</span>
                  </span>
                </p>
                <p className="text-sm font-bold text-[#848E9C]/80 mt-2 tracking-widest uppercase">USDT</p>
              </div>
            </div>

            {/* 分享按钮 - 重点突出 */}
            <div className="relative z-10 space-y-3">
              <button 
                onClick={handleCopy}
                className={`w-full p-4 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 relative overflow-hidden group ${
                  copied 
                    ? 'bg-gradient-to-r from-[#0ECB81] to-[#10B981] border-2 border-[#0ECB81] shadow-[0_0_30px_rgba(16,185,129,0.5)]' 
                    : 'bg-gradient-to-r from-[#FCD535] via-[#FFD700] to-[#FCD535] border-2 border-[#FCD535]/50 shadow-[0_0_30px_rgba(252,213,53,0.4)] hover:shadow-[0_0_40px_rgba(252,213,53,0.6)] hover:scale-[1.02]'
                }`}
              >
                {/* 按钮内部光效 */}
                {!copied && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                )}
                
                <div className={`relative z-10 flex items-center gap-3 ${copied ? 'text-white' : 'text-[#0B0E11]'}`}>
                  {copied ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                  <span className="text-sm font-black uppercase tracking-wider">
                    {copied ? (t('profile.referralLinkCopied') || 'Referral Link Copied') : (t('profile.copyReferralLink') || 'Copy Referral Link')}
                  </span>
                </div>
              </button>
              
              {/* 提示文字 */}
              <p className="text-[10px] text-[#848E9C]/70 mt-3 font-medium text-center">
                {t('profile.shareLinkHint') || '*Share link to earn energy points'}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default WithdrawalSuccessModal;
