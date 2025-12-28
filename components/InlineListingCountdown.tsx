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
               <svg 
                 version="1.1" 
                 id="Layer_1" 
                 xmlns="http://www.w3.org/2000/svg" 
                 xmlnsXlink="http://www.w3.org/1999/xlink" 
                 x="0px" 
                 y="0px"
                 width="100%" 
                 viewBox="0 0 225 225" 
                 enableBackground="new 0 0 225 225" 
                 xmlSpace="preserve"
                 className="w-6 h-6"
               >
                 <path 
                   fill="#333333" 
                   opacity="1.000000" 
                   stroke="none" 
                   d="M110.000000,226.000000 C73.333336,226.000000 37.166672,226.000000 1.000005,226.000000 C1.000003,151.000000 1.000003,76.000015 1.000002,1.000015 C75.999992,1.000010 150.999985,1.000010 225.999969,1.000005 C225.999985,75.999985 225.999985,150.999969 226.000000,225.999969 C187.500000,226.000000 149.000000,226.000000 110.000000,226.000000 M150.011856,94.504463 C153.803253,91.086815 157.594650,87.669167 161.136078,84.476845 C144.603790,67.917755 128.978943,52.267586 113.970604,37.234913 C98.350441,52.785690 82.618073,68.448166 66.971725,84.025009 C72.343971,89.367744 77.988647,94.981422 84.357262,101.315056 C94.040901,91.494659 103.805481,81.592163 113.910713,71.344208 C123.714539,81.313652 133.388123,91.150658 143.808670,101.747238 C145.892059,99.284668 147.703049,97.144058 150.011856,94.504463 M110.666870,188.064362 C111.617996,188.908173 112.569115,189.751984 113.256569,190.361877 C129.117477,174.552505 144.775589,158.945282 160.269409,143.501816 C154.624161,137.906982 148.874405,132.208542 142.326141,125.718742 C132.764526,135.429047 123.014816,145.330353 112.885620,155.617065 C103.145836,145.694351 93.484200,135.851257 84.276871,126.471008 C78.185356,132.418625 72.396706,138.070526 66.351402,143.973007 C80.883766,158.439911 95.506989,172.997269 110.666870,188.064362 M108.970825,100.506897 C104.526680,104.644531 100.082542,108.782166 96.420204,112.191910 C102.784782,118.797585 108.360352,124.584358 113.792160,130.221924 C119.321434,124.750343 124.977402,119.153389 130.521225,113.667412 C124.784927,107.954254 119.045837,102.238319 112.658691,95.876930 C111.703949,97.113876 110.584358,98.564407 108.970825,100.506897 M164.364059,122.135696 C167.126328,125.228386 169.888596,128.321075 172.340393,131.066177 C178.861206,124.678757 184.639053,119.019112 190.067780,113.701439 C184.439514,107.992767 178.772644,102.244934 173.646973,97.046036 C167.973114,102.636574 162.228180,108.297127 156.051743,114.382858 C158.508987,116.663040 161.187576,119.148621 164.364059,122.135696 M37.329369,114.753937 C42.610306,120.198509 47.891243,125.643089 52.522118,130.417450 C58.871929,124.181641 64.607803,118.548744 69.962837,113.289848 C64.615784,107.880646 59.017750,102.217529 53.014854,96.144852 C49.338440,99.957146 45.469883,103.836716 41.765446,107.867119 C39.978493,109.811317 38.500435,112.039421 37.329369,114.753937 z"
                 />
                 <path 
                   fill="#EFB80B" 
                   opacity="1.000000" 
                   stroke="none" 
                   d="M149.762939,94.753960 C147.703049,97.144058 145.892059,99.284668 143.808670,101.747238 C133.388123,91.150658 123.714539,81.313652 113.910713,71.344208 C103.805481,81.592163 94.040901,91.494659 84.357262,101.315056 C77.988647,94.981422 72.343971,89.367744 66.971725,84.025009 C82.618073,68.448166 98.350441,52.785690 113.970604,37.234913 C128.978943,52.267586 144.603790,67.917755 161.136078,84.476845 C157.594650,87.669167 153.803253,91.086815 149.762939,94.753960 z"
                 />
                 <path 
                   fill="#EFB80B" 
                   opacity="1.000000" 
                   stroke="none" 
                   d="M110.398544,187.809494 C95.506989,172.997269 80.883766,158.439911 66.351402,143.973007 C72.396706,138.070526 78.185356,132.418625 84.276871,126.471008 C93.484200,135.851257 103.145836,145.694351 112.885620,155.617065 C123.014816,145.330353 132.764526,135.429047 142.326141,125.718742 C148.874405,132.208542 154.624161,137.906982 160.269409,143.501816 C144.775589,158.945282 129.117477,174.552505 113.256569,190.361877 C112.569115,189.751984 111.617996,188.908173 110.398544,187.809494 z"
                 />
                 <path 
                   fill="#EFB80B" 
                   opacity="1.000000" 
                   stroke="none" 
                   d="M109.217796,100.260910 C110.584358,98.564407 111.703949,97.113876 112.658691,95.876930 C119.045837,102.238319 124.784927,107.954254 130.521225,113.667412 C124.977402,119.153389 119.321434,124.750343 113.792160,130.221924 C108.360352,124.584358 102.784782,118.797585 96.420204,112.191910 C100.082542,108.782166 104.526680,104.644531 109.217796,100.260910 z"
                 />
                 <path 
                   fill="#EFB80B" 
                   opacity="1.000000" 
                   stroke="none" 
                   d="M164.115112,121.884949 C161.187576,119.148621 158.508987,116.663040 156.051743,114.382858 C162.228180,108.297127 167.973114,102.636574 173.646973,97.046036 C178.772644,102.244934 184.439514,107.992767 190.067780,113.701439 C184.639053,119.019112 178.861206,124.678757 172.340393,131.066177 C169.888596,128.321075 167.126328,125.228386 164.115112,121.884949 z"
                 />
                 <path 
                   fill="#EFB80B" 
                   opacity="1.000000" 
                   stroke="none" 
                   d="M37.105942,114.446457 C38.500435,112.039421 39.978493,109.811317 41.765446,107.867119 C45.469883,103.836716 49.338440,99.957146 53.014854,96.144852 C59.017750,102.217529 64.615784,107.880646 69.962837,113.289848 C64.607803,118.548744 58.871929,124.181641 52.522118,130.417450 C47.891243,125.643089 42.610306,120.198509 37.105942,114.446457 z"
                 />
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

