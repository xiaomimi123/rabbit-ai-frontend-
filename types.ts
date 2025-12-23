
export type TabType = 'mining' | 'asset' | 'profile' | 'notifications';

export type HistoryItemType = 'airdrop' | 'invite' | 'withdraw';

export interface HistoryItem {
  id: string;
  type: HistoryItemType;
  amount: string;
  currency: 'RAT' | 'USDT';
  energyChange: number;
  timestamp: number;
}

export interface UserStats {
  ratBalance: number;
  bnbBalance: number;
  energy: number;
  pendingUsdt: number;
  teamSize: number;
  teamRewards: number;
  address: string;
}

export type NotificationType = 'SYSTEM' | 'REWARD' | 'NETWORK';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  timestamp: number;
  read: boolean;
}

export type WalletType = 'metamask' | 'okx' | 'binance' | 'trust' | 'walletconnect';

export interface WalletState {
  address: string | null;
  chainId: number | null;
  balance: string; // BNB Balance
  isConnected: boolean;
}

export enum TransactionStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export type Language = 'en' | 'zh' | 'jp' | 'kr' | 'fr' | 'ru';
