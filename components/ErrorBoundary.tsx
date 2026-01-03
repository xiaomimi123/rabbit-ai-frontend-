import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误到控制台
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // 更新状态以包含错误信息
    this.setState({
      error,
      errorInfo
    });

    // 可以在这里发送错误到日志系统
    // 例如：发送到 Sentry、LogRocket 等
    try {
      // 记录错误信息（不包含敏感信息）
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      // 可以发送到后端日志系统
      if (typeof window !== 'undefined' && window.fetch) {
        // 异步发送，不阻塞 UI
        fetch('/api/analytics/error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorData)
        }).catch(() => {
          // 静默失败，不影响用户体验
        });
      }
    } catch (e) {
      // 静默失败
      console.error('Failed to log error:', e);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误 UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0E11] text-white p-4">
          <div className="text-center max-w-md w-full">
            <div className="mb-6 flex justify-center">
              <div className="p-4 bg-red-500/10 rounded-full">
                <AlertTriangle className="w-12 h-12 text-red-500" />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold mb-3 text-white">
              页面加载错误
            </h1>
            
            <p className="text-gray-400 mb-2 text-sm">
              抱歉，页面加载时出现了问题。
            </p>
            
            <p className="text-gray-500 mb-6 text-xs">
              请尝试刷新页面或返回首页。
            </p>

            {/* 开发环境显示详细错误信息 */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-6 p-4 bg-red-500/10 rounded-lg text-left">
                <p className="text-red-400 text-xs font-mono mb-2">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer mb-2">查看错误堆栈</summary>
                    <pre className="overflow-auto max-h-40 text-[10px]">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="bg-[#FCD535] text-[#0B0E11] px-6 py-3 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                刷新页面
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/20 active:scale-95 transition-all flex items-center gap-2 border border-white/10"
              >
                <Home className="w-4 h-4" />
                返回首页
              </button>
            </div>

            <p className="text-gray-600 text-xs mt-6">
              如果问题持续存在，请联系客服支持
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

