import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { X, CheckCircle2, Copy, Check, ArrowUpRight } from 'lucide-react';
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
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div 
          initial={{ opacity: 0, scale: 0.5, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="relative w-full max-w-sm bg-[#1e2329] border-2 border-[#FCD535] rounded-[2rem] p-6 sm:p-8 shadow-[0_0_50px_rgba(252,213,53,0.3)] overflow-hidden text-center"
        >
          {/* 背景光效 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#FCD535]/20 blur-[80px] rounded-full pointer-events-none" />

          {/* 关闭按钮 */}
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-[#848E9C] hover:text-white transition-colors z-20">
            <X className="w-5 h-5" />
          </button>

          {/* 成功图标 */}
          <div className="relative z-10 mb-4 flex justify-center">
             <div className="w-20 h-20 bg-gradient-to-br from-[#FCD535] to-orange-400 rounded-full flex items-center justify-center shadow-lg shadow-[#FCD535]/40 animate-bounce">
                <CheckCircle2 className="w-10 h-10 text-[#0B0E11]" />
             </div>
          </div>

          <h2 className="relative z-10 text-2xl font-black text-white italic tracking-wide mb-1">
            {t('profile.withdrawalSuccessTitle') || 'PAYMENT RECEIVED!'}
          </h2>
          <p className="relative z-10 text-xs text-[#848E9C] font-bold uppercase tracking-widest mb-6">
            {t('profile.withdrawalSuccessSubtitle') || 'Funds Received'}
          </p>

          {/* 金额展示卡片 */}
          <div className="relative z-10 bg-[#0b0e11]/50 border border-[#FCD535]/30 rounded-2xl p-4 mb-6">
            <p className="text-[#FCD535] text-4xl font-black mono tracking-tighter flex items-center justify-center gap-1">
              <span className="text-xl opacity-50">$</span>
              {amount}
              <span className="text-xs font-bold text-[#848E9C] mt-4">USDT</span>
            </p>
          </div>

          {/* --- 分享区域 (仅保留复制按钮) --- */}
          <div className="relative z-10">
            <button 
              onClick={handleCopy}
              className={`w-full p-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 border ${
                copied 
                  ? 'bg-[#0ECB81]/10 border-[#0ECB81] text-[#0ECB81]' 
                  : 'bg-white/5 border-white/10 text-[#848E9C] hover:text-white hover:bg-white/10'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="text-xs font-black uppercase">
                {copied ? (t('profile.referralLinkCopied') || 'Referral Link Copied') : (t('profile.copyReferralLink') || 'Copy Referral Link')}
              </span>
            </button>
            <p className="text-[9px] text-[#848E9C]/60 mt-2 font-medium">
              {t('profile.shareLinkHint') || '*Share link to earn energy points'}
            </p>
          </div>

          {/* 底部确认按钮 */}
          <button 
            onClick={onClose}
            className="relative z-10 w-full mt-5 bg-[#FCD535] hover:bg-[#FCD535]/90 text-[#0B0E11] font-black py-3.5 rounded-xl uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-[#FCD535]/20 flex items-center justify-center gap-2"
          >
            {t('profile.confirmClose') || 'Confirm & Close'} <ArrowUpRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default WithdrawalSuccessModal;
