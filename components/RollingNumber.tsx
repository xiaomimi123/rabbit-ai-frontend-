import React from 'react';
import { motion } from 'framer-motion';

// 单个数字的滚动列
const Digit = ({ value }: { value: number }) => {
  return (
    <div 
      // 🟢 修复 1: 移除 w-[0.6em]，改用 min-w 配合 flex 布局，防止数字重叠或间距过大
      // 添加 tabular-nums 确保等宽显示，避免数字跳动时宽度忽大忽小
      className="relative h-[1em] min-w-[0.6em] overflow-hidden flex justify-center tabular-nums"
    >
      <motion.div
        initial={false}
        animate={{ y: `-${value * 10}0%` }} // 移动到目标数字的位置
        transition={{ 
          type: "spring", 
          stiffness: 60,  // 🟢 调低刚度，让滚动更柔和，减少鬼畜感
          damping: 15,    // 🟢 调整阻尼，防止回弹过猛
          mass: 0.5       // 🟢 减轻质量，反应更灵敏
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
  // 确保 value 是有效数字
  const safeValue = isNaN(value) ? 0 : value;
  
  // 格式化数字 (保持小数位固定)
  const formatted = safeValue.toFixed(decimals);
  
  // 拆分成字符数组
  const chars = formatted.split('');

  return (
    <div className={`flex items-baseline ${className}`}>
      {prefix && <span className="mr-1 opacity-80">{prefix}</span>}
      
      {chars.map((char, index) => {
        const isNumber = !isNaN(parseInt(char));
        
        // 🟢 修复 2: key 仅绑定 index。
        // 这样当数字变化时，React 认为是同一个组件在更新 props，从而触发 smooth 动画
        if (isNumber) {
          return <Digit key={index} value={parseInt(char)} />;
        }
        
        // 如果是小数点，直接显示
        return (
          <span key={index} className="inline-block mx-[1px] leading-none">
            {char}
          </span>
        );
      })}
    </div>
  );
};
