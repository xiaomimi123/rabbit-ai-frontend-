import React from 'react';
import { motion } from 'framer-motion';

// 单个数字的滚动列
const Digit = ({ value }: { value: number }) => {
  return (
    <div 
      className="relative h-[1em] min-w-[0.6em] overflow-hidden flex justify-center tabular-nums"
    >
      <motion.div
        initial={false}
        // 🟢 修复核心 Bug: 把原来的 `-${value * 10}0%` 改为 `-${value * 10}%`
        // 解释: 共有10个数字，每个占10%高度。显示数字5就要上移50%。
        animate={{ y: `-${value * 10}%` }} 
        transition={{ 
          // 🟢 优化动画参数: 
          // 原来的 stiffness: 60 太软了，跟不上 100ms 的刷新速度
          // 改为 120 让它反应更快，更有"机械计数器"的干脆感
          type: "spring", 
          stiffness: 120,  
          damping: 20,    
          mass: 0.8       
        }}
        className="absolute top-0 left-0 w-full flex flex-col items-center"
      >
        {/* 渲染 0-9 这一列数字 */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div key={i} className="h-[1em] flex items-center justify-center leading-none">
            {i}
          </div>
        ))}
      </motion.div>
    </div>
  );
};

// 主组件
interface RollingNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  className?: string;
}

export const RollingNumber: React.FC<RollingNumberProps> = ({ 
  value, 
  decimals = 4, 
  prefix = "",
  className = "" 
}) => {
  // 🔒 增强：更严格的数值验证
  let safeValue = 0;
  if (typeof value === 'number' && isFinite(value) && !isNaN(value)) {
    safeValue = Math.max(0, value); // 确保非负数
  } else {
    // 如果值无效，记录警告并返回默认值
    console.warn('[RollingNumber] Invalid value:', value, 'using default 0');
    safeValue = 0;
  }
  
  // 🔒 增强：限制最大显示值，避免过大数字导致显示异常
  const MAX_DISPLAY_VALUE = 999999999.999999; // 9亿多，足够显示任何合理的收益
  safeValue = Math.min(safeValue, MAX_DISPLAY_VALUE);
  
  // 🔒 增强：确保 decimals 在合理范围内
  const safeDecimals = Math.max(0, Math.min(decimals, 10)); // 最多10位小数
  
  const formatted = safeValue.toFixed(safeDecimals);
  const chars = formatted.split('');

  return (
    <div className={`flex items-baseline ${className}`}>
      {prefix && <span className="mr-1 opacity-80">{prefix}</span>}
      
      {chars.map((char, index) => {
        // 🔒 增强：更严格的数字验证
        const numValue = parseInt(char, 10);
        const isNumber = !isNaN(numValue) && numValue >= 0 && numValue <= 9;
        
        if (isNumber) {
          // key={index} 确保了 React 不会销毁重建组件，只是更新 value
          // 从而触发上面 motion.div 的 animate 动画
          return <Digit key={index} value={numValue} />;
        }
        
        // 非数字字符（如小数点、负号等）
        return (
          <span key={index} className="inline-block mx-[1px] leading-none">
            {char}
          </span>
        );
      })}
    </div>
  );
};
