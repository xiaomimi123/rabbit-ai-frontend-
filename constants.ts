
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

export const AIRDROP_FEE = '0.000444'; // BNB

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
    "event Claimed(address indexed user, uint256 amount)", // 随机空投解析事件
    "event CooldownReset(address indexed referrer)" // 冷却时间重置事件
  ]
};

export const RAT_PRICE_USDT = 0.01;
export const ENERGY_WITHDRAW_THRESHOLD = 30;
export const ENERGY_PER_USDT_WITHDRAW = 10;
export const MIN_WITHDRAW_AMOUNT = 0.1; // 最低提现金额：0.1 USDT = 1 点能量

// 持币生息 VIP 等级配置（根据钱包 RAT 余额）
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
