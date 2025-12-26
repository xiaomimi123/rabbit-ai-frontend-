import axios from 'axios';

// 获取 API Base URL
// 优先使用环境变量 VITE_API_BASE_URL，如果没有配置则使用相对路径（开发环境）
function getApiBaseUrl(): string {
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

const apiBaseUrl = getApiBaseUrl();
const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

// ⚠️ 环境检查：检测错误的 API Base URL 配置
if (typeof window !== 'undefined') {
  const isPointingToFrontend = apiBaseUrl.startsWith(currentOrigin);
  const isPointingToAdmin = apiBaseUrl.includes('rabbit-ai-admin') || apiBaseUrl.includes('admin');
  const isPointingToWrongService = isPointingToFrontend || isPointingToAdmin;
  
  if (isPointingToWrongService) {
    console.error(
      '%c🚨 严重错误：API Base URL 配置错误！',
      'color: white; font-size: 18px; font-weight: bold; background: red; padding: 8px; border-radius: 4px;'
    );
    console.error(
      '%cAPI Base URL 指向了错误的服务！',
      'color: red; font-size: 14px; font-weight: bold;'
    );
    console.error(
      '当前配置:', apiBaseUrl,
      '\n前端域名:', currentOrigin,
      '\n错误类型:', isPointingToFrontend ? '指向前端自身' : isPointingToAdmin ? '指向管理员后台' : '未知错误',
      '\n\n❌ 这会导致所有 API 请求失败（CORS 错误或 404）！',
      '\n\n✅ 解决方案：',
      '\n1. 前往 Vercel Dashboard -> Settings -> Environment Variables',
      '\n2. 找到 VITE_API_BASE_URL 环境变量',
      '\n3. 将其值设置为后端 Render 地址（例如: https://rabbit-ai-backend.onrender.com）',
      '\n4. ⚠️ 注意：不要设置为管理员后台地址（rabbit-ai-admin.vercel.app）',
      '\n5. ⚠️ 注意：不要带末尾的斜杠',
      '\n6. 重新部署前端（Redeploy）使环境变量生效'
    );
    
    // 在页面上显示错误提示（可选，但可能会影响用户体验）
    // 可以考虑在开发环境显示，生产环境只记录日志
    if (import.meta.env.DEV) {
      console.warn(
        '%c💡 提示：在开发环境，如果未配置 VITE_API_BASE_URL，将使用相对路径 /api/（由 Vite 代理）',
        'color: blue; font-size: 12px;'
      );
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
      console.error('[API Interceptor] 请求超时:', error.config?.url);
      throw new Error('请求超时，请检查网络连接');
    }
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      console.error('[API Interceptor] 网络错误:', error.config?.url);
      throw new Error('网络错误，请检查后端服务是否运行');
    }
    if (error.response) {
      // 服务器返回了错误状态码
      const status = error.response.status;
      const message = error.response.data?.message || error.message;
      const url = error.config?.url || 'unknown';
      
      // 404 错误不记录到控制台（这些是可选的 API），直接返回错误对象供调用方处理
      if (status === 404) {
        // 静默处理 404 错误，不记录日志
        return Promise.reject(error);
      }
      
      // 对于 verify-claim API，始终记录详细错误
      if (url.includes('/mining/verify-claim')) {
        console.error(`[API Interceptor] verify-claim API 错误 ${status}:`, {
          url,
          status,
          statusText: error.response.statusText,
          data: error.response.data,
          requestData: error.config?.data
        });
      } else {
        // 其他错误才记录日志
        console.error(`[API Interceptor] API 错误 ${status} (${url}): ${message}`);
      }
      
      throw new Error(message || `服务器错误 (${status})`);
    }
    // 其他错误
    console.error('[API Interceptor] 请求失败:', {
      message: error.message,
      url: error.config?.url,
      error
    });
    throw error;
  }
);

export const fetchUserInfo = async (address: string) => {
  const { data } = await api.get(`/user/info?address=${address}`);
  return data; // { energy: number, inviteCount: number, referrer: string, teamRewards?: string }
};

export const fetchTeamRewards = async (address: string) => {
  const { data } = await api.get(`/user/team-rewards?address=${address}`);
  return data; // { totalRewards: string } - 团队代币奖励总额（RAT）
};

export const verifyClaim = async (address: string, txHash: string, referrer: string) => {
  // ⚠️ 参数验证：确保 txHash 不为空
  if (!txHash || txHash === 'undefined' || txHash.trim() === '') {
    const errorMsg = `[verifyClaim] 错误：txHash 参数无效 (${txHash})`;
    console.error(errorMsg, { address, txHash, referrer });
    throw new Error(errorMsg);
  }
  
  // 构建请求 payload
  const payload = { address, txHash, referrer };
  
  try {
    // ⚠️ 优化日志：在调用前打印完整 payload
    console.log('[verifyClaim] 调用后端 API，完整 payload:', {
      address,
      txHash,
      referrer,
      payload,
      apiBaseUrl: apiBaseUrl,
      fullUrl: `${apiBaseUrl}/mining/verify-claim`
    });
    
    const { data } = await api.post('/mining/verify-claim', payload);
    console.log('[verifyClaim] API 调用成功，返回数据:', data);
    return data;
  } catch (error: any) {
    console.error('[verifyClaim] API 调用失败:', {
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      message: error?.message,
      requestPayload: payload,
      config: {
        url: error?.config?.url,
        method: error?.config?.method,
        data: error?.config?.data,
        baseURL: error?.config?.baseURL,
      }
    });
    throw error;
  }
};

export const applyWithdraw = async (address: string, amount: string) => {
  const { data } = await api.post('/asset/withdraw/apply', { address, amount });
  return data;
};

export const getWithdrawHistory = async (address: string) => {
  try {
    const { data } = await api.get(`/asset/withdraw/history?address=${address}`);
    return data || []; // [{ id: string, amount: string, status: string, time: string }]
  } catch (error: any) {
    // 404 错误表示没有数据，返回空数组
    if (error.response?.status === 404) {
      return [];
    }
    console.error('Failed to fetch withdraw history:', error);
    return [];
  }
};

export const getClaimsHistory = async (address: string) => {
  try {
    const { data } = await api.get(`/user/claims?address=${address}`);
    return data || []; // [{ txHash: string, amount: string, energy: number, createdAt: string }]
  } catch (error: any) {
    // 404 错误表示没有数据，返回空数组
    if (error.response?.status === 404) {
      return [];
    }
    console.error('Failed to fetch claims history:', error);
    return [];
  }
};

export const getReferralHistory = async (address: string) => {
  try {
    const { data } = await api.get(`/user/referrals?address=${address}`);
    return data || []; // [{ address: string, energy: number, createdAt: string }]
  } catch (error: any) {
    // 404 错误表示没有数据，返回空数组
    if (error.response?.status === 404) {
      return [];
    }
    console.error('Failed to fetch referral history:', error);
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
      console.warn('Failed to fetch RAT balance from API, returning 0:', error.message);
      return { balance: '0' };
    }
    // 其他错误也返回默认值
    console.error('Unexpected error fetching RAT balance:', error);
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

export default api;

