import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast, { ToastMessage, ToastType } from '../components/ui/Toast';

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // 🟢 增强错误处理：安全地移除 Toast
  const removeToast = useCallback((id: string) => {
    try {
      if (!id || typeof id !== 'string') {
        console.warn('[ToastContext] Invalid toast ID:', id);
        return;
      }
      setToasts(prev => prev.filter(toast => toast.id !== id));
    } catch (error) {
      console.error('[ToastContext] Error removing toast:', error);
      // 不抛出错误，避免导致应用崩溃
    }
  }, []);

  // 🟢 增强错误处理：安全地显示 Toast
  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000) => {
    try {
      // 验证参数
      if (!message || typeof message !== 'string') {
        console.warn('[ToastContext] Invalid toast message:', message);
        return;
      }

      // 限制消息长度，避免过长的消息
      const maxLength = 500;
      const truncatedMessage = message.length > maxLength 
        ? message.substring(0, maxLength) + '...' 
        : message;

      // 验证类型
      const validTypes: ToastType[] = ['info', 'success', 'warning', 'error'];
      const validType = validTypes.includes(type) ? type : 'info';

      // 验证持续时间
      const validDuration = typeof duration === 'number' && duration > 0 
        ? Math.min(duration, 30000) // 最大 30 秒
        : 4000;

      const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newToast: ToastMessage = {
        id,
        message: truncatedMessage,
        type: validType,
        duration: validDuration,
      };
      
      setToasts(prev => {
        // 限制最多显示 10 个 Toast（避免内存泄漏）
        const maxToasts = 10;
        const newToasts = [...prev, newToast];
        return newToasts.slice(-maxToasts);
      });
    } catch (error) {
      console.error('[ToastContext] Error showing toast:', error);
      // 不抛出错误，避免导致应用崩溃
      // 如果 Toast 系统失败，至少尝试在控制台显示消息
      console.log('[Toast]', message);
    }
  }, []);

  const showSuccess = useCallback((message: string, duration?: number) => {
    try {
      showToast(message, 'success', duration);
    } catch (error) {
      console.error('[ToastContext] Error in showSuccess:', error);
      console.log('[Success]', message);
    }
  }, [showToast]);

  const showError = useCallback((message: string, duration?: number) => {
    try {
      showToast(message, 'error', duration || 5000); // 错误消息默认显示 5 秒
    } catch (error) {
      console.error('[ToastContext] Error in showError:', error);
      console.error('[Error]', message);
    }
  }, [showToast]);

  const showWarning = useCallback((message: string, duration?: number) => {
    try {
      showToast(message, 'warning', duration);
    } catch (error) {
      console.error('[ToastContext] Error in showWarning:', error);
      console.warn('[Warning]', message);
    }
  }, [showToast]);

  const showInfo = useCallback((message: string, duration?: number) => {
    try {
      showToast(message, 'info', duration);
    } catch (error) {
      console.error('[ToastContext] Error in showInfo:', error);
      console.info('[Info]', message);
    }
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      {/* 渲染所有 Toast，最多显示 3 个 */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] pointer-events-none" style={{ width: '90%', maxWidth: '400px' }}>
          {toasts.slice(0, 3).map((toast, index) => (
            <div
              key={toast.id}
              className="pointer-events-auto mb-3"
              style={{ transform: `translateY(${index * 90}px)` }}
            >
              <Toast toast={toast} onClose={removeToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

