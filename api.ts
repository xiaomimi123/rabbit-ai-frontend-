import axios from 'axios';

const api = axios.create({
  baseURL: '/api/',
  timeout: 20000,
});

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
      console.error('请求超时，请检查网络连接');
      throw new Error('请求超时，请检查网络连接');
    }
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      console.error('网络错误，请检查后端服务是否运行');
      throw new Error('网络错误，请检查后端服务是否运行');
    }
    if (error.response) {
      // 服务器返回了错误状态码
      const status = error.response.status;
      const message = error.response.data?.message || error.message;
      // 404 错误不记录到控制台（这些是可选的 API），直接返回错误对象供调用方处理
      if (status === 404) {
        // 静默处理 404 错误，不记录日志
        return Promise.reject(error);
      }
      // 其他错误才记录日志
      console.error(`API 错误 ${status}: ${message}`);
      throw new Error(message || `服务器错误 (${status})`);
    }
    // 其他错误
    console.error('请求失败:', error.message);
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
  const { data } = await api.post('/mining/verify-claim', { address, txHash, referrer });
  return data;
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

