import React, { useState, useEffect } from 'react';
import { Rocket, Bell, ExternalLink } from 'lucide-react';

interface CountdownProps {
  targetDate: string;   // 格式: "2026-01-01T12:00:00"
  exchangeName: string; // 交易所名称，如 "Binance"
}

export const InlineListingCountdown: React.FC<CountdownProps> = ({ targetDate, exchangeName }) => {
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
    <div className="relative w-full overflow-hidden rounded-[2rem] p-[1px] bg-gradient-to-b from-[#FCD535]/30 to-transparent">
      {/* 内部卡片背景 */}
      <div className="relative bg-[#1e2329] border border-white/5 rounded-[2rem] p-5 overflow-hidden">
        
        {/* 背景装饰：金色光晕 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FCD535]/10 blur-[50px] rounded-full pointer-events-none" />

        {/* 标题行 */}
        <div className="flex justify-between items-center mb-5 relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FCD535]/10 flex items-center justify-center border border-[#FCD535]/20">
               <Rocket className="w-4 h-4 text-[#FCD535] animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Listing Countdown
              </h3>
              <p className="text-[10px] text-[#848E9C] font-bold">
                即将上线 <span className="text-[#FCD535]">{exchangeName}</span>
              </p>
            </div>
          </div>
          
          {/* 通知按钮 */}
          <button className="bg-white/5 hover:bg-white/10 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all border border-white/5">
             <Bell className="w-3 h-3" />
             提醒我
          </button>
        </div>

        {/* 倒计时数字主体 */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 relative z-10">
          <TimeBlock value={timeLeft.days} label="DAYS" />
          <div className="flex flex-col justify-center items-center pb-4 text-[#848E9C]/30 font-black text-xl">:</div>
          <TimeBlock value={timeLeft.hours} label="HRS" />
          <div className="flex flex-col justify-center items-center pb-4 text-[#848E9C]/30 font-black text-xl">:</div>
          <TimeBlock value={timeLeft.minutes} label="MIN" />
          <div className="flex flex-col justify-center items-center pb-4 text-[#848E9C]/30 font-black text-xl">:</div>
          <TimeBlock value={timeLeft.seconds} label="SEC" isActive={true} />
        </div>
        
        {/* 底部装饰条 */}
        <div className="mt-4 flex items-center justify-center gap-2 opacity-40">
           <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/20" />
           <p className="text-[8px] text-[#848E9C] font-bold uppercase tracking-[0.2em]">Official Launch</p>
           <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/20" />
        </div>

      </div>
    </div>
  );
};

// 子组件：时间块
const TimeBlock = ({ value, label, isActive = false }: { value: number; label: string; isActive?: boolean }) => (
  <div className="flex flex-col items-center gap-1.5">
    <div className={`w-full aspect-square flex items-center justify-center rounded-xl border relative overflow-hidden group ${isActive ? 'bg-[#FCD535]/10 border-[#FCD535]/30' : 'bg-[#0b0e11] border-white/10'}`}>
      
      {/* 秒针跳动时的闪光特效 */}
      {isActive && (
        <div className="absolute inset-0 bg-[#FCD535]/20 animate-pulse" />
      )}
      
      <span className={`text-2xl sm:text-3xl font-black mono tracking-tighter relative z-10 ${isActive ? 'text-[#FCD535]' : 'text-white'}`}>
        {String(value).padStart(2, '0')}
      </span>
    </div>
    <span className="text-[9px] font-black text-[#848E9C] uppercase tracking-widest">{label}</span>
  </div>
);

