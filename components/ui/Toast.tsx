import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 触发进入动画
    setTimeout(() => setIsVisible(true), 10);

    // 自动关闭
    if (toast.duration !== 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose(toast.id), 300); // 等待动画完成
      }, toast.duration || 4000);

      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-[#0ECB81]" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-[#F6465D]" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-[#FCD535]" />;
      case 'info':
        return <Info className="w-5 h-5 text-[#3B82F6]" />;
      default:
        return <Info className="w-5 h-5 text-[#848E9C]" />;
    }
  };

  const getBgColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-[#0ECB81]/10 border-[#0ECB81]/30';
      case 'error':
        return 'bg-[#F6465D]/10 border-[#F6465D]/30';
      case 'warning':
        return 'bg-[#FCD535]/10 border-[#FCD535]/30';
      case 'info':
        return 'bg-[#3B82F6]/10 border-[#3B82F6]/30';
      default:
        return 'bg-white/5 border-white/10';
    }
  };

  return (
    <div
      className={`transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
    >
      <div
        className={`${getBgColor()} border rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in slide-in-from-top-5 fade-in duration-300`}
      >
        <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white break-words whitespace-pre-line">
            {toast.message}
          </p>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onClose(toast.id), 300);
          }}
          className="flex-shrink-0 text-[#848E9C] hover:text-white transition-colors p-1 -mt-1 -mr-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Toast;

