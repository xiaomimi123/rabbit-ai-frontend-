import React from 'react';
import { motion } from 'framer-motion';

// 单个数字的滚动列
const Digit = ({ value }: { value: number }) => {
  return (
    <div className="relative h-[1em] w-[0.6em] overflow-hidden inline-block align-top">
      <motion.div
        initial={false}
        animate={{ y: -1 * value * 100 + "%" }} // 核心：通过 Y 轴位移来实现滚动
        transition={{ 
          type: "spring", 
          stiffness: 100, 
          damping: 20,
          mass: 1 // 质量越小，滚动越轻快
        }}
        className="absolute top-0 left-0 flex flex-col items-center w-full"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div key={i} className="h-[1em] flex items-center justify-center">
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
  // 格式化数字，确保小数位固定
  const formatted = value.toFixed(decimals);
  // 拆分成字符数组
  const chars = formatted.split('');

  return (
    <div className={`flex items-baseline ${className}`}>
      {prefix && <span className="mr-1 opacity-50 text-[0.6em]">{prefix}</span>}
      {chars.map((char, index) => {
        // 如果是数字，使用滚动组件
        if (!isNaN(parseInt(char))) {
          return <Digit key={`${index}-${char}`} value={parseInt(char)} />;
        }
        // 如果是小数点或逗号，直接显示
        return (
          <span key={index} className="inline-block">
            {char}
          </span>
        );
      })}
    </div>
  );
};

