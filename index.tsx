import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';
import { ToastProvider } from './contexts/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import { logger } from './utils/logger';

// 🟢 全局错误处理
window.onerror = (message, source, lineno, colno, error) => {
  const errorInfo = {
    message: String(message),
    source: String(source || 'unknown'),
    lineno: lineno || 0,
    colno: colno || 0,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : null,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  console.error('Global error caught:', errorInfo);
  
  // 记录错误到日志系统
  try {
    logger.error('Global error', errorInfo);
    
    // 可以发送到后端日志系统（异步，不阻塞）
    if (typeof fetch !== 'undefined') {
      fetch('/api/analytics/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorInfo),
        keepalive: true // 确保请求在页面卸载时也能发送
      }).catch(() => {
        // 静默失败，不影响用户体验
      });
    }
  } catch (e) {
    // 静默失败
    console.error('Failed to log global error:', e);
  }

  // 返回 false 以允许默认错误处理
  return false;
};

// 🟢 未捕获的 Promise 拒绝处理
window.onunhandledrejection = (event) => {
  const errorInfo = {
    reason: event.reason ? String(event.reason) : 'Unknown rejection',
    error: event.reason instanceof Error ? {
      name: event.reason.name,
      message: event.reason.message,
      stack: event.reason.stack
    } : null,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  console.error('Unhandled promise rejection:', errorInfo);
  
  // 记录错误到日志系统
  try {
    logger.error('Unhandled promise rejection', errorInfo);
    
    // 可以发送到后端日志系统（异步，不阻塞）
    if (typeof fetch !== 'undefined') {
      fetch('/api/analytics/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorInfo),
        keepalive: true
      }).catch(() => {
        // 静默失败
      });
    }
  } catch (e) {
    // 静默失败
    console.error('Failed to log promise rejection:', e);
  }

  // 阻止默认的错误处理（避免在控制台显示）
  // event.preventDefault();
};

// 🟢 资源加载错误处理
window.addEventListener('error', (event) => {
  // 只处理资源加载错误（如 CSS、JS、图片等）
  if (event.target && event.target !== window) {
    const target = event.target as HTMLElement;
    const tagName = target.tagName;
    
    // 忽略某些不重要的资源加载错误
    if (tagName === 'IMG' || tagName === 'LINK' || tagName === 'SCRIPT') {
      const resourceInfo = {
        tag: tagName,
        src: (target as any).src || (target as any).href || 'unknown',
        error: event.error ? {
          name: event.error.name,
          message: event.error.message
        } : null,
        timestamp: new Date().toISOString(),
        url: window.location.href
      };

      console.warn('Resource load error:', resourceInfo);
      
      // 对于字体加载失败，已经在 index.html 中处理
      // 这里只记录其他资源加载错误
      if (tagName !== 'LINK' || !resourceInfo.src.includes('fonts.googleapis.com')) {
        try {
          logger.warn('Resource load error', resourceInfo);
        } catch (e) {
          // 静默失败
        }
      }
    }
  }
}, true); // 使用捕获阶段

// 🟢 检查根元素
const rootElement = document.getElementById('root');
if (!rootElement) {
  const error = new Error("Could not find root element to mount to");
  console.error(error);
  
  // 显示错误提示
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0B0E11; color: white; padding: 20px; text-align: center;">
      <div>
        <h1 style="font-size: 24px; margin-bottom: 16px;">页面初始化错误</h1>
        <p style="color: #848E9C; margin-bottom: 24px;">无法找到页面根元素，请刷新页面重试。</p>
        <button onclick="window.location.reload()" style="background: #FCD535; color: #0B0E11; padding: 12px 24px; border: none; border-radius: 12px; font-weight: bold; cursor: pointer;">
          刷新页面
        </button>
      </div>
    </div>
  `;
  throw error;
}

// 🟢 渲染应用（使用错误边界包装）
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
