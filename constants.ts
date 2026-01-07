
export const CHAIN_ID = 56; // BNB Smart Chain Mainnet
export const CHAIN_HEX = '0x38';
export const CHAIN_NAME = 'BNB Smart Chain Mainnet';
export const RPC_URL = 'https://bsc-dataseed1.binance.org/'; // Binance 官方 RPC
// 备用 RPC URLs
export const RPC_URLS = [
  'https://bsc-dataseed1.binance.org/', // Binance 官方 RPC (主 RPC)
  'https://bsc-dataseed2.binance.org/',
  'https://bsc-dataseed3.binance.org/',
  'https://bsc-dataseed4.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.nodereal.io/',
  'https://cesi-8be8c7d8.gateway.tatum.io/', // Tatum Gateway (备用，最后使用)
];

// WalletConnect 项目 ID (需要到 https://cloud.walletconnect.com 注册获取)
export const WALLETCONNECT_PROJECT_ID = 'b728d15460bc7a09336f32fbe2331917';

export const CONTRACTS = {
  RAT_TOKEN: '0x03853d1B9a6DEeCE10ADf0EE20D836f06aFca47B', // BNB主网 AToken合约
  AIRDROP: '0x16B7a2e6eD9a0Ace9495b80eF0A5D0e3f72aCD7c', // BNB主网 RandomAirdrop合约
};

// 🟢 已废弃：使用动态获取的费用，不再使用硬编码值
// export const AIRDROP_FEE = '0.000444'; // BNB
// 保留作为默认值/后备值
export const DEFAULT_AIRDROP_FEE = '0.000444'; // BNB

export const ABIS = {
  ERC20: [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ],
  AIRDROP: [
    "function claim(address referrer) payable",
    "function lastClaimTime(address user) view returns (uint256)",
    "function inviteCount(address user) view returns (uint256)",
    "function claimFee() view returns (uint256)", // 🟢 新增：获取当前手续费
    "event Claimed(address indexed user, uint256 amount)", // 随机空投解析事件
    "event CooldownReset(address indexed referrer)" // 冷却时间重置事件
  ]
};

export const RAT_PRICE_USDT = 0.01;
export const ENERGY_WITHDRAW_THRESHOLD = 30;
export const ENERGY_PER_USDT_WITHDRAW = 10;
export const MIN_WITHDRAW_AMOUNT = 0.1; // 最低提现金额：0.1 USDT = 1 点能量

// 持币生息 VIP 等级配置（根据钱包 RAT 余额）
// 🟢 注意：这些是默认值/降级值，优先使用从后端API动态加载的配置
export const VIP_TIERS = [
  { level: 1, name: '🌱 新手', min: 10000, max: 49999, dailyRate: 2 }, // 2% 日利率
  { level: 2, name: '🌿 进阶', min: 50000, max: 99999, dailyRate: 4 }, // 4% 日利率
  { level: 3, name: '🌳 资深', min: 100000, max: 199999, dailyRate: 6 }, // 6% 日利率
  { level: 4, name: '💎 核心', min: 200000, max: Infinity, dailyRate: 10 }, // 10% 日利率
];

export const PARTNERS = [
  { name: 'PancakeSwap' },
  { name: 'Binance' },
  { name: 'CertiK' },
  { name: 'Chainlink' },
];

export const AUDIT_LOGOS = [
  { name: 'CertiK Verified', url: 'https://www.certik.com/' },
  { name: 'SlowMist Audited', url: 'https://www.slowmist.com/' }
];

export const PROTOCOL_STATS = {
  totalPaidOut: 1254800.50,
  daysRunning: 158,
  contractVerified: true,
  liquidityLocked: true
};

// 🟢 总奖励已支付 - 基于时间的确定性增长算法配置
// 使用 UTC 时间确保全球用户数据一致
export const REWARD_GROWTH_CONFIG = {
  // 基准金额（项目启动时的初始值）
  BASE_AMOUNT: 1254800.50,
  // 项目启动时间（UTC 时间戳）
  // 基于 daysRunning: 158 天反推，假设从 2024-01-01 00:00:00 UTC 开始
  START_TIME_UTC: new Date('2024-01-01T00:00:00Z').getTime(),
  // 每秒增长金额（USDT）
  // 0.1 USDT/秒 = 360 USDT/小时 = 8,640 USDT/天
  GROWTH_RATE_PER_SECOND: 0.1,
  // 更新频率（毫秒）- 每秒更新一次，让数字更流畅
  UPDATE_INTERVAL_MS: 1000
};
