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
  const { data } = await api.get(`/asset/withdraw/history?address=${address}`);
  return data; // [{ id: string, amount: string, status: string, time: string }]
};

export const getClaimsHistory = async (address: string) => {
  const { data } = await api.get(`/user/claims?address=${address}`);
  return data; // [{ txHash: string, amount: string, energy: number, createdAt: string }]
};

export const getReferralHistory = async (address: string) => {
  const { data } = await api.get(`/user/referrals?address=${address}`);
  return data; // [{ address: string, energy: number, createdAt: string }]
};

// 持币生息相关 API
export const fetchRatBalance = async (address: string) => {
  const { data } = await api.get(`/asset/rat-balance?address=${address}`);
  return data; // { balance: string } - 用户钱包中的 RAT 余额
};

export const fetchEarnings = async (address: string) => {
  const { data } = await api.get(`/asset/earnings?address=${address}`);
  return data; // { pendingUsdt: string, dailyRate: number, currentTier: number, holdingDays: number }
};

// 获取系统配置链接（白皮书、审计报告、客服链接等）
export const fetchSystemLinks = async () => {
  const { data } = await api.get('/system/links');
  return data; // { whitepaper: string, audits: string, support: string }
};

// 获取用户站内信通知
export const fetchUserNotifications = async (address: string) => {
  const { data } = await api.get(`/user/notifications?address=${address}`);
  return data; // [{ id: string, type: string, title: string, content: string, timestamp: number, read: boolean }]
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
  const { data } = await api.get('/system/announcement');
  return data; // { content: string, updatedAt: string } 或 null
};

export default api;

