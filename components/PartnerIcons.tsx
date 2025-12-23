import React from 'react';

interface PartnerIconProps {
  name: string;
  className?: string;
}

// PancakeSwap 图标 - 煎饼/蛋糕样式
export const PancakeSwapIcon: React.FC<PartnerIconProps> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <circle cx="9" cy="9" r="2" fill="currentColor"/>
    <circle cx="15" cy="9" r="2" fill="currentColor"/>
    <circle cx="9" cy="15" r="2" fill="currentColor"/>
    <circle cx="15" cy="15" r="2" fill="currentColor"/>
    <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// Binance 图标 - BNB 标志样式
export const BinanceIcon: React.FC<PartnerIconProps> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    <path d="M12 2v5l8-4M12 7l8 4v5M12 12l8 4M12 12v5l8-4" stroke="currentColor" strokeWidth="0.5" fill="none"/>
  </svg>
);

// CertiK 图标 - 盾牌/安全样式
export const CertiKIcon: React.FC<PartnerIconProps> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z"/>
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

// Chainlink 图标 - 链接/链条样式
export const ChainlinkIcon: React.FC<PartnerIconProps> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <path d="M8 9h8M8 15h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="8" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="16" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="8" cy="15" r="1.5" fill="currentColor"/>
    <circle cx="16" cy="15" r="1.5" fill="currentColor"/>
  </svg>
);

// 根据名称返回对应的图标组件
export const getPartnerIcon = (name: string, className?: string) => {
  const iconProps = { className: className || "w-4 h-4" };
  switch (name.toLowerCase()) {
    case 'pancakeswap':
      return <PancakeSwapIcon {...iconProps} />;
    case 'binance':
      return <BinanceIcon {...iconProps} />;
    case 'certik':
      return <CertiKIcon {...iconProps} />;
    case 'chainlink':
      return <ChainlinkIcon {...iconProps} />;
    default:
      return null;
  }
};

