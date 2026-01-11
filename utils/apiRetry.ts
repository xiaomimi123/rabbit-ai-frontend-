/**
 * 🔥 API 重试工具
 * 
 * 目的：增强前端 API 调用的可靠性，特别是对于关键操作
 * 
 * 核心功能：
 * 1. 指数退避算法：重试间隔逐渐增加（1s, 2s, 4s, 8s, ...）
 * 2. 可配置的重试次数
 * 3. 智能错误识别：区分临时错误（可重试）和永久错误（不可重试）
 * 4. 进度回调：让用户知道正在重试
 */

export interface RetryOptions {
  /** 最大重试次数（默认 20） */
  maxRetries?: number;
  
  /** 基础延迟时间（毫秒，默认 1000ms = 1秒） */
  baseDelay?: number;
  
  /** 最大延迟时间（毫秒，默认 10000ms = 10秒） */
  maxDelay?: number;
  
  /** 重试回调函数 */
  onRetry?: (attempt: number, error: any, nextDelay: number) => void;
  
  /** 最终失败回调函数 */
  onFinalError?: (error: any, totalAttempts: number) => void;
  
  /** 判断错误是否可重试（默认所有错误都重试） */
  shouldRetry?: (error: any) => boolean;
}

/**
 * 默认的错误可重试判断
 * 
 * 可重试的错误类型：
 * - 网络错误（timeout, network failure）
 * - 服务器临时错误（5xx）
 * - 速率限制（429）
 * 
 * 不可重试的错误类型：
 * - 客户端错误（4xx，除了 408 Timeout 和 429 Rate Limit）
 * - 业务逻辑错误（如"已经领取过"）
 */
function defaultShouldRetry(error: any): boolean {
  // 如果没有响应（网络错误），可重试
  if (!error.response) {
    return true;
  }
  
  const status = error.response?.status;
  
  // 408 Timeout、429 Rate Limit、5xx 服务器错误 -> 可重试
  if (status === 408 || status === 429 || (status >= 500 && status < 600)) {
    return true;
  }
  
  // 其他 4xx 客户端错误 -> 不可重试
  if (status >= 400 && status < 500) {
    return false;
  }
  
  // 默认可重试
  return true;
}

/**
 * 计算指数退避延迟
 */
function calculateExponentialBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  // 指数退避：baseDelay * (2 ^ attempt)
  // 例如：1000ms, 2000ms, 4000ms, 8000ms, ...
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  
  // 添加随机抖动（±10%），避免多个客户端同时重试
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  
  return Math.floor(delay + jitter);
}

/**
 * 带重试的 API 调用包装函数
 * 
 * @param fn 要执行的异步函数
 * @param options 重试选项
 * @returns Promise<T> 函数的返回值
 * 
 * @example
 * ```typescript
 * const result = await callApiWithRetry(
 *   () => api.post('/mining/verify-claim', { address, txHash }),
 *   {
 *     maxRetries: 20,
 *     baseDelay: 1000,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`重试 ${attempt}/20，${delay}ms 后重试...`);
 *     }
 *   }
 * );
 * ```
 */
export async function callApiWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 20,
    baseDelay = 1000,
    maxDelay = 10000,
    onRetry,
    onFinalError,
    shouldRetry = defaultShouldRetry,
  } = options;
  
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 尝试执行函数
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        if (onFinalError) {
          onFinalError(error, attempt + 1);
        }
        throw error;
      }
      
      // 判断是否应该重试
      if (!shouldRetry(error)) {
        console.log('[callApiWithRetry] 错误不可重试，直接抛出:', error);
        throw error;
      }
      
      // 计算下次重试的延迟
      const nextDelay = calculateExponentialBackoff(attempt, baseDelay, maxDelay);
      
      // 调用重试回调
      if (onRetry) {
        onRetry(attempt + 1, error, nextDelay);
      } else {
        console.warn(
          `[callApiWithRetry] API 调用失败，${nextDelay}ms 后重试 (尝试 ${attempt + 1}/${maxRetries})`,
          error
        );
      }
      
      // 等待指定时间后重试
      await new Promise(resolve => setTimeout(resolve, nextDelay));
    }
  }
  
  // 理论上不会到达这里，但为了类型安全
  throw lastError;
}

/**
 * 预设配置：关键操作（如空投领取验证）
 * 
 * 特点：
 * - 最多重试 20 次
 * - 总时长约 120 秒（2 分钟）
 * - 适用于必须成功的操作
 */
export function createCriticalApiRetry<T>(
  fn: () => Promise<T>,
  onProgress?: (attempt: number, total: number, delay: number) => void
): Promise<T> {
  return callApiWithRetry(fn, {
    maxRetries: 20,
    baseDelay: 1000,
    maxDelay: 10000,
    onRetry: (attempt, error, delay) => {
      console.log(`[关键操作重试] 尝试 ${attempt}/20，${delay}ms 后重试...`);
      if (onProgress) {
        onProgress(attempt, 20, delay);
      }
    },
    onFinalError: (error, totalAttempts) => {
      console.error(`[关键操作失败] 经过 ${totalAttempts} 次尝试后仍然失败:`, error);
    },
  });
}

/**
 * 预设配置：普通操作
 * 
 * 特点：
 * - 最多重试 5 次
 * - 总时长约 30 秒
 * - 适用于一般的 API 调用
 */
export function createNormalApiRetry<T>(
  fn: () => Promise<T>,
  onProgress?: (attempt: number, total: number, delay: number) => void
): Promise<T> {
  return callApiWithRetry(fn, {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 5000,
    onRetry: (attempt, error, delay) => {
      if (onProgress) {
        onProgress(attempt, 5, delay);
      }
    },
  });
}

