import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface CountdownProps {
  targetDate: string;   // 格式: "2026-01-01T12:00:00"
  exchangeName: string; // 交易所名称，如 "Binance"
  bgImageUrl?: string;  // 背景图片 URL（可选）
}

export const InlineListingCountdown: React.FC<CountdownProps> = ({ targetDate, exchangeName, bgImageUrl = '' }) => {
  const { t } = useLanguage();
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(targetDate) - +new Date();
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };
    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] shadow-2xl group">
      
      {/* ============================================================
          🌟 背景层：BNB 主题
          ============================================================ */}
      
      {/* 方案 A: 使用在线图片 URL (从配置中读取) */}
      {bgImageUrl && (
        <div 
          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat opacity-60"
          style={{
            backgroundImage: `url(${bgImageUrl})`,
          }}
        />
      )}

      {/* 方案 B: CSS 纯代码绘制的 BNB 金色流光背景 (作为备用层) */}
      <div className="absolute inset-0 bg-[#0b0e11]">
        {/* 左上角金色光晕 */}
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-[#FCD535]/20 blur-[60px] rounded-full" />
        {/* 右下角金色光晕 */}
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-[#FCD535]/10 blur-[60px] rounded-full" />
        {/* 中心 BNB Logo 隐约水印 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-[20px] border-[#FCD535]/5 rounded-full rotate-12" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-[20px] border-[#FCD535]/5 rotate-45" />
      </div>
      
      {/* 黑色遮罩：确保文字清晰 */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/80 backdrop-blur-[1px]" />

      {/* ============================================================
          🌟 内容层：悬浮在背景之上
          ============================================================ */}
      <div className="relative z-10 p-5">
        
        {/* 标题栏 */}
        <div className="flex items-center mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FCD535] flex items-center justify-center shadow-lg shadow-[#FCD535]/20">
               {/* BNB Logo SVG */}
               <svg className="w-6 h-6 text-black fill-current" viewBox="0 0 32 32">
                 <path d="M16 32C7.163 32 0 24.837 0 16S7.163 0 16 0s16 7.163 16 16-7.163 16-16 16zm-3.884-17.595L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26 2.26L10.52 16l-2.26-2.26L6 16zm6.116 1.595l3.884 3.886 3.886-3.886 2.26 2.259L16 26l-6.144-6.144 2.26-2.26zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16z"/>
               </svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider leading-tight">
                {t('mining.listingCountdown') || 'Listing Countdown'}
              </h3>
              <p className="text-[10px] text-[#FCD535] font-bold mt-0.5">
                {t('mining.comingSoon') || 'Coming Soon'} <span className="text-[#FCD535]">{exchangeName}</span>
              </p>
            </div>
          </div>
        </div>

        {/* 倒计时数字主体 */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 relative z-10">
          <TimeBlock value={timeLeft.days} label={t('mining.days') || 'DAYS'} />
          <div className="flex flex-col justify-center items-center pb-5 text-white/20 font-black text-xl">:</div>
          <TimeBlock value={timeLeft.hours} label={t('mining.hours') || 'HRS'} />
          <div className="flex flex-col justify-center items-center pb-5 text-white/20 font-black text-xl">:</div>
          <TimeBlock value={timeLeft.minutes} label={t('mining.minutes') || 'MIN'} />
          <div className="flex flex-col justify-center items-center pb-5 text-white/20 font-black text-xl">:</div>
          <TimeBlock value={timeLeft.seconds} label={t('mining.seconds') || 'SEC'} isActive={true} />
        </div>
        
        {/* 底部装饰文字 */}
        <div className="mt-5 text-center">
           <p className="text-[8px] text-[#848E9C] font-bold uppercase tracking-[0.3em] opacity-60">{t('mining.officialLaunch') || 'Official Launch'}</p>
        </div>

      </div>
    </div>
  );
};

// 子组件：时间块
const TimeBlock = ({ value, label, isActive = false }: { value: number; label: string; isActive?: boolean }) => (
  <div className="flex flex-col items-center gap-2">
    {/* 数字框：加了半透明磨砂效果 */}
    <div className={`w-full aspect-square flex items-center justify-center rounded-2xl border backdrop-blur-md shadow-xl relative overflow-hidden ${isActive ? 'bg-[#FCD535]/20 border-[#FCD535]/50' : 'bg-black/30 border-white/10'}`}>
      <span className={`text-2xl sm:text-3xl font-black mono tracking-tighter relative z-10 ${isActive ? 'text-[#FCD535]' : 'text-white'}`}>
        {String(value).padStart(2, '0')}
      </span>
      {/* 扫光特效 */}
      {isActive && <div className="absolute inset-0 bg-white/10 animate-pulse" />}
    </div>
    <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">{label}</span>
  </div>
);

