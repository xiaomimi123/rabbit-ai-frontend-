/**
 * 生产环境日志控制工具
 * 在生产环境中禁用所有调试日志，只保留关键错误信息
 */

const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

// 生产环境日志控制：完全禁用调试日志
const ENABLE_DEBUG_LOGS = isDevelopment;

/**
 * 安全的日志输出 - 只在开发环境输出
 */
export const logger = {
  log: (...args: any[]) => {
    if (ENABLE_DEBUG_LOGS) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (ENABLE_DEBUG_LOGS) {
      console.warn(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (ENABLE_DEBUG_LOGS) {
      console.info(...args);
    }
  },
  
  debug: (...args: any[]) => {
    if (ENABLE_DEBUG_LOGS) {
      console.debug(...args);
    }
  },
  
  /**
   * 错误日志 - 生产环境也输出，但简化信息
   */
  error: (message: string, error?: any) => {
    if (isProduction) {
      // 生产环境：只输出简化的错误信息，不泄露敏感数据
      console.error(`[Error] ${message}`);
      if (error && error.message) {
        console.error(`[Error] ${error.message}`);
      }
    } else {
      // 开发环境：输出完整错误信息
      console.error(message, error);
    }
  },
};

/**
 * 移除敏感信息的工具函数
 */
export const sanitizeLogData = (data: any): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sanitized: any = Array.isArray(data) ? [] : {};
  const sensitiveKeys = ['address', 'txHash', 'referrer', 'apiBaseUrl', 'url', 'fullUrl', 'payload', 'requestPayload', 'config', 'response', 'data'];
  
  for (const key in data) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof data[key] === 'object' && data[key] !== null) {
      sanitized[key] = sanitizeLogData(data[key]);
    } else {
      sanitized[key] = data[key];
    }
  }
  
  return sanitized;
};

