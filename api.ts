import axios from 'axios';
import { logger } from './utils/logger';

// 系统配置相关类型
export interface SystemConfigItem {
  key: string;
  value: any;
  updatedAt?: string;
}

export interface SystemConfigResponse {
  ok: boolean;
  items: SystemConfigItem[];
}

// 获取 API Base URL
// 优先使用环境变量 VITE_API_BASE_URL，如果没有配置则使用相对路径（开发环境）
export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim();
  
  // 如果配置了环境变量，使用环境变量
  if (envUrl) {
    // 移除末尾的斜杠（如果有）
    const baseUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
    // 确保以 /api 结尾
    return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
  }
  
  // 如果没有配置环境变量，使用相对路径（开发环境由 Vite 代理）
  return '/api/';
}

// 延迟初始化 apiBaseUrl，避免在模块加载时立即调用函数
const apiBaseUrl = getApiBaseUrl();
const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

// ⚠️ 环境检查：检测错误的 API Base URL 配置
if (typeof window !== 'undefined') {
  const isPointingToFrontend = apiBaseUrl.startsWith(currentOrigin);
  const isPointingToAdmin = apiBaseUrl.includes('rabbit-ai-admin') || apiBaseUrl.includes('admin');
  const isPointingToWrongService = isPointingToFrontend || isPointingToAdmin;
  
  if (isPointingToWrongService) {
    // 只在开发环境显示详细错误信息
    if (import.meta.env.DEV) {
      logger.error('🚨 严重错误：API Base URL 配置错误！');
      logger.error('API Base URL 指向了错误的服务！');
      logger.error('请检查 VITE_API_BASE_URL 环境变量配置');
    } else {
      // 生产环境只记录简化错误
      logger.error('API Base URL 配置错误');
    }
  }
}

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 20000,
});

// 导出 apiBaseUrl 供其他模块使用（用于日志等）
export { apiBaseUrl };

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // ⚠️ 运行时检查：如果 API Base URL 配置错误，在控制台显示警告
    if (typeof window !== 'undefined') {
      const fullUrl = (config.baseURL || '') + (config.url || '');
      const isPointingToAdmin = fullUrl.includes('rabbit-ai-admin') || fullUrl.includes('/admin');
      const isPointingToFrontend = fullUrl.startsWith(currentOrigin);
      
      if (isPointingToAdmin || isPointingToFrontend) {
        logger.error('🚨 API 请求配置错误！请检查 VITE_API_BASE_URL 环境变量');
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一处理网络错误
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 处理网络错误
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      logger.error('[API Interceptor] Request timeout');
      throw new Error('Request timeout, please check your network connection');
    }
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      logger.error('[API Interceptor] Network error');
      throw new Error('Network error, please check if the backend service is running');
    }
    if (error.response) {
      // 服务器返回了错误状态码
      const status = error.response.status;
      const message = error.response.data?.message || error.message;
      const url = error.config?.url || 'unknown';
      
      // 404 错误不记录到控制台（这些是可选的 API），直接返回错误对象供调用方处理
      if (status === 404) {
        // 可选 API 列表（这些 API 的 404 是正常行为，不需要记录错误）
        const optionalApis = [
          '/system/announcement',
          '/system/links',
          '/user/notifications',
          '/user/claims',
          '/user/referrals',
          '/asset/withdraw/history',
        ];
        
        const isOptionalApi = optionalApis.some(apiPath => url.includes(apiPath));
        
        if (isOptionalApi) {
          // 可选 API 的 404 是正常行为，完全静默处理（不记录日志，不显示错误）
          return Promise.reject(error);
        }
        
        // 其他 API 的 404 仍然静默处理，但可以在这里添加特殊处理
        return Promise.reject(error);
      }
      
      // 记录错误（不泄露敏感信息）
      logger.error(`[API Interceptor] API 错误 ${status}: ${message}`);
      
      throw new Error(message || `服务器错误 (${status})`);
    }
    // 其他错误
    logger.error('[API Interceptor] 请求失败', error);
    throw error;
  }
);

export const fetchUserInfo = async (address: string) => {
  // 确保地址格式正确（后端会自动转换为小写，但前端也统一处理）
  const normalizedAddress = address?.toLowerCase() || address;
  logger.debug('[fetchUserInfo] 请求用户信息');
  try {
    const response = await api.get(`/user/info?address=${normalizedAddress}`);
    logger.debug('[fetchUserInfo] 请求成功');
    return response.data; // { energy: number, inviteCount: number, referrer: string, teamRewards?: string }
  } catch (error: any) {
    logger.error('[fetchUserInfo] API 调用失败', error);
    throw error;
  }
};

export const fetchTeamRewards = async (address: string) => {
  // 确保地址格式正确
  const normalizedAddress = address?.toLowerCase() || address;
  logger.debug('[fetchTeamRewards] 请求团队奖励');
  try {
    const response = await api.get(`/user/team-rewards?address=${normalizedAddress}`);
    logger.debug('[fetchTeamRewards] 请求成功');
    return response.data; // { totalRewards: string } - 团队代币奖励总额（RAT）
  } catch (error: any) {
    logger.error('[fetchTeamRewards] API 调用失败', error);
    throw error;
  }
};

export const verifyClaim = async (address: string, txHash: string, referrer: string) => {
  // ⚠️ 参数验证：确保 txHash 不为空
  if (!txHash || txHash === 'undefined' || txHash.trim() === '') {
    const errorMsg = `[verifyClaim] 错误：txHash 参数无效`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  // ✅ 修复：确保 referrer 总是有效值（处理 null/undefined）
  // 如果 referrer 无效，使用默认的零地址
  let validReferrer = '0x0000000000000000000000000000000000000000';
  if (referrer && typeof referrer === 'string' && referrer.trim() !== '') {
    // 验证是否为有效的以太坊地址
    try {
      const { ethers } = await import('ethers');
      if (ethers.utils.isAddress(referrer)) {
        validReferrer = referrer.toLowerCase();
      } else {
        logger.warn(`[verifyClaim] 无效的 referrer 地址: ${referrer}，使用默认值`);
      }
    } catch (e) {
      logger.warn(`[verifyClaim] 验证 referrer 地址失败: ${e}，使用默认值`);
    }
  } else {
    logger.debug(`[verifyClaim] referrer 为空或无效，使用默认值`);
  }
  
  // 构建请求 payload
  const payload = { address, txHash, referrer: validReferrer };
  
  try {
    logger.debug('[verifyClaim] 调用后端 API');
    const { data } = await api.post('/mining/verify-claim', payload);
    logger.debug('[verifyClaim] API 调用成功');
    return data;
  } catch (error: any) {
    logger.error('[verifyClaim] API 调用失败', error);
    throw error;
  }
};

export const applyWithdraw = async (address: string, amount: string) => {
  const { data } = await api.post('/asset/withdraw/apply', { address, amount });
  return data;
};

export const getWithdrawHistory = async (address: string) => {
  try {
    const normalizedAddress = address?.toLowerCase() || address;
    logger.debug('[getWithdrawHistory] 请求提现历史');
    const { data } = await api.get(`/asset/withdraw/history?address=${normalizedAddress}`);
    logger.debug('[getWithdrawHistory] 请求成功');
    return data || []; // [{ id: string, amount: string, status: string, time: string }]
  } catch (error: any) {
    // 404 错误表示没有数据，返回空数组
    if (error.response?.status === 404) {
      logger.debug('[getWithdrawHistory] 没有提现历史');
      return [];
    }
    logger.error('[getWithdrawHistory] 请求失败', error);
    return [];
  }
};

export const getClaimsHistory = async (address: string) => {
  try {
    const normalizedAddress = address?.toLowerCase() || address;
    logger.debug('[getClaimsHistory] 请求空投历史');
    const { data } = await api.get(`/user/claims?address=${normalizedAddress}`);
    logger.debug('[getClaimsHistory] 请求成功');
    return data || []; // [{ txHash: string, amount: string, energy: number, createdAt: string }]
  } catch (error: any) {
    // 404 错误表示没有数据，返回空数组
    if (error.response?.status === 404) {
      logger.debug('[getClaimsHistory] 没有空投历史');
      return [];
    }
    logger.error('[getClaimsHistory] 请求失败', error);
    return [];
  }
};

export const getReferralHistory = async (address: string) => {
  try {
    const normalizedAddress = address?.toLowerCase() || address;
    logger.debug('[getReferralHistory] 请求邀请历史');
    const { data } = await api.get(`/user/referrals?address=${normalizedAddress}`);
    logger.debug('[getReferralHistory] 请求成功');
    return data || []; // [{ address: string, energy: number, createdAt: string }]
  } catch (error: any) {
    // 404 错误表示没有数据，返回空数组
    if (error.response?.status === 404) {
      logger.debug('[getReferralHistory] 没有邀请历史');
      return [];
    }
    logger.error('[getReferralHistory] 请求失败', error);
    return [];
  }
};

// 持币生息相关 API
export const fetchRatBalance = async (address: string) => {
  try {
    const { data } = await api.get(`/asset/rat-balance?address=${address}`);
    return data; // { balance: string } - 用户钱包中的 RAT 余额
  } catch (error: any) {
    // 任何错误都返回默认值，不抛出错误
    const status = error.response?.status;
    if (status === 404 || status === 400 || status === 503) {
      logger.warn('Failed to fetch RAT balance from API, returning 0');
      return { balance: '0' };
    }
    // 其他错误也返回默认值
    logger.error('Unexpected error fetching RAT balance', error);
    return { balance: '0' };
  }
};

export const fetchEarnings = async (address: string) => {
  try {
    const { data } = await api.get(`/asset/earnings?address=${address}`);
    return data; // { pendingUsdt: string, dailyRate: number, currentTier: number, holdingDays: number }
  } catch (error: any) {
    // 404 错误表示没有数据，返回默认值
    if (error.response?.status === 404) {
      return {
        pendingUsdt: '0',
        dailyRate: 0,
        currentTier: 0,
        holdingDays: 0,
      };
    }
    throw error;
  }
};

// 获取系统配置链接（白皮书、审计报告、客服链接等）
export const fetchSystemLinks = async () => {
  try {
    const { data } = await api.get('/system/links');
    return data; // { whitepaper: string, audits: string, support: string }
  } catch (error: any) {
    // 404 错误表示没有配置，返回空对象
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

// 获取用户站内信通知
export const fetchUserNotifications = async (address: string) => {
  try {
    const { data } = await api.get(`/user/notifications?address=${address}`);
    return data; // [{ id: string, type: string, title: string, content: string, timestamp: number, read: boolean }]
  } catch (error: any) {
    // 404 错误表示没有通知，返回空数组
    if (error.response?.status === 404) {
      return [];
    }
    throw error;
  }
};

// 标记通知为已读
export const markNotificationAsRead = async (address: string, notificationId: string) => {
  const { data } = await api.post(`/user/notifications/read`, { address, notificationId });
  return data;
};

// 标记所有通知为已读
export const markAllNotificationsAsRead = async (address: string) => {
  const { data } = await api.post(`/user/notifications/read-all`, { address });
  return data;
};

// 删除通知
export const deleteNotification = async (address: string, notificationId: string) => {
  // ✅ 使用 POST 方法，因为 Fastify 的 DELETE 请求 body 处理可能有问题
  const { data } = await api.post(`/user/notifications/delete`, { address, notificationId });
  return data;
};

// 获取系统公告
export const fetchSystemAnnouncement = async () => {
  try {
    const { data } = await api.get('/system/announcement');
    return data; // { content: string, updatedAt: string } 或 null
  } catch (error: any) {
    // 404 错误表示没有公告，返回 null（不抛出错误）
    if (error.response?.status === 404) {
      return null;
    }
    // 其他错误才抛出
    throw error;
  }
};

// 获取倒计时配置（公开 API，无需认证）
export const fetchCountdownConfig = async () => {
  try {
    const { data } = await api.get('/system/countdown-config');
    return {
      targetDate: data.targetDate || '2026-01-15T12:00:00',
      exchangeName: data.exchangeName || 'Binance',
      bgImageUrl: data.bgImageUrl || '',
    };
  } catch (error: any) {
    // 如果 API 不存在或出错，返回默认值
    logger.warn('Failed to fetch countdown config, using defaults');
    return {
      targetDate: '2026-01-15T12:00:00',
      exchangeName: 'Binance',
      bgImageUrl: '',
    };
  }
};

export default api;

