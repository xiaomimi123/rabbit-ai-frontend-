import { ethers } from 'ethers';
import { EthereumProvider } from '@walletconnect/ethereum-provider';
import { WalletConnectModal } from '@walletconnect/modal';
import { ABIS, CONTRACTS, CHAIN_ID, CHAIN_HEX, CHAIN_NAME, RPC_URL, WALLETCONNECT_PROJECT_ID } from '../constants';
import { WalletType } from '../types';

// Declare global ethereum on window
declare global {
  interface Window {
    ethereum?: any;
    okxwallet?: any;
    BinanceChain?: any;
  }
}

// 存储当前使用的 provider
let currentProvider: ethers.providers.Web3Provider | null = null;
let walletConnectProvider: EthereumProvider | null = null;
let walletConnectModal: WalletConnectModal | null = null;
let currentWalletType: WalletType | null = null;

export const getProvider = () => {
  return currentProvider;
};

export const getWalletType = () => {
  return currentWalletType;
};

// 获取不同钱包的 provider
const getWalletProvider = (walletType: WalletType): any => {
  switch (walletType) {
    case 'metamask':
      return window.ethereum?.isMetaMask ? window.ethereum : null;
    case 'okx':
      return window.okxwallet || null;
    case 'binance':
      return window.BinanceChain || null;
    case 'trust':
      return window.ethereum?.isTrust ? window.ethereum : null;
    case 'walletconnect':
      return walletConnectProvider;
    default:
      return window.ethereum;
  }
};

function getWalletConnectModal(): WalletConnectModal {
  if (walletConnectModal) return walletConnectModal;
  if (!WALLETCONNECT_PROJECT_ID || WALLETCONNECT_PROJECT_ID === 'YOUR_PROJECT_ID') {
    throw new Error('请先配置 WalletConnect 项目 ID');
  }
  walletConnectModal = new WalletConnectModal({
    projectId: WALLETCONNECT_PROJECT_ID,
    standaloneChains: [`eip155:${CHAIN_ID}`],
  });
  return walletConnectModal;
}

async function initWalletConnectProvider(): Promise<EthereumProvider> {
  if (walletConnectProvider) return walletConnectProvider;
  if (!WALLETCONNECT_PROJECT_ID || WALLETCONNECT_PROJECT_ID === 'YOUR_PROJECT_ID') {
    throw new Error('请先配置 WalletConnect 项目 ID');
  }

  const modal = getWalletConnectModal();

  const provider = await EthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [CHAIN_ID],
    rpcMap: { [CHAIN_ID]: RPC_URL },
    showQrModal: false, // IMPORTANT: use WalletConnectModal for mobile deep link + desktop QR
    metadata: {
      name: 'Rabbit AI',
      description: 'Rabbit AI DApp',
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
  });

  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  // When WalletConnect emits a URI, open the modal (mobile will deep link to wallet)
  provider.on('display_uri', (uri: string) => {
    // Some mobile browsers / in-app browsers may treat certain wallet schemes as "invalid URL".
    // Use WalletConnect universal link as a safe fallback to open the wallet.
    if (isMobile) {
      try {
        const universal = `https://walletconnect.com/wc?uri=${encodeURIComponent(uri)}`;
        // best-effort navigation (wallet apps can intercept universal links)
        window.location.href = universal;
      } catch {
        // ignore
      }
    }
    modal.openModal({ uri });
  });

  provider.on('connect', () => {
    modal.closeModal();
  });

  provider.on('disconnect', () => {
    modal.closeModal();
  });

  walletConnectProvider = provider;
  return provider;
}

// 连接钱包
export const connectWallet = async (walletType: WalletType): Promise<ethers.providers.Web3Provider> => {
  try {
    if (walletType === 'walletconnect') {
      // 使用 WalletConnect
      const wc = await initWalletConnectProvider();
      await wc.enable();
      // close modal if still open
      try {
        getWalletConnectModal().closeModal();
      } catch {
        // ignore
      }
      
      // 验证 WalletConnect 已连接
      if (!wc.accounts || wc.accounts.length === 0) {
        throw new Error('WalletConnect connection failed: No accounts');
      }
      
      // 将 WalletConnect provider 转换为 ethers provider
      const provider = new ethers.providers.Web3Provider(wc as any);
      currentProvider = provider;
      currentWalletType = walletType;
      
      return provider;
    } else {
      // 使用浏览器扩展钱包
      const walletProvider = getWalletProvider(walletType);
      
      if (!walletProvider) {
        throw new Error(`${walletType} 钱包未安装`);
      }

      // 请求连接
      if (walletProvider.request) {
        await walletProvider.request({ method: 'eth_requestAccounts' });
      } else if (walletProvider.enable) {
        // Binance Chain 使用 enable
        await walletProvider.enable();
      }

      const provider = new ethers.providers.Web3Provider(walletProvider);
      currentProvider = provider;
      currentWalletType = walletType;
      
      return provider;
    }
  } catch (error: any) {
    console.error('Wallet connection error:', error);
    throw error;
  }
};

// 断开连接
export const disconnectWallet = async () => {
  if (walletConnectProvider) {
    await walletConnectProvider.disconnect();
    walletConnectProvider = null;
  }
  if (walletConnectModal) {
    try {
      walletConnectModal.closeModal();
    } catch {
      // ignore
    }
    walletConnectModal = null;
  }
  currentProvider = null;
  currentWalletType = null;
};

export const switchNetwork = async () => {
  const provider = getProvider();
  if (!provider) {
    throw new Error('No provider available');
  }

  const walletType = getWalletType();
  const walletProvider = walletType === 'walletconnect' 
    ? walletConnectProvider 
    : getWalletProvider(walletType || 'metamask');

  if (!walletProvider) {
    throw new Error('Wallet provider not available');
  }

  try {
    // WalletConnect 使用不同的方法
    if (walletType === 'walletconnect' && walletConnectProvider) {
      await walletConnectProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_HEX }],
      });
    } else if (walletProvider.request) {
      await walletProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_HEX }],
      });
    } else {
      throw new Error('Network switching not supported');
    }
  } catch (switchError: any) {
    // This error code indicates that the chain has not been added to MetaMask.
    if (switchError.code === 4902 || switchError.message?.includes('not added')) {
      try {
        const addParams = {
          chainId: CHAIN_HEX,
          chainName: CHAIN_NAME,
          nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB', // BNB Mainnet
            decimals: 18,
          },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: ['https://bscscan.com'], // BNB主网浏览器
        };

        if (walletType === 'walletconnect' && walletConnectProvider) {
          await walletConnectProvider.request({
            method: 'wallet_addEthereumChain',
            params: [addParams],
          });
        } else if (walletProvider.request) {
          await walletProvider.request({
            method: 'wallet_addEthereumChain',
            params: [addParams],
          });
        }
      } catch (addError) {
        console.error('Failed to add network', addError);
        throw addError;
      }
    } else {
      console.error('Failed to switch network', switchError);
      throw switchError;
    }
  }
};

export const getContract = async (address: string, abi: any[], signer?: ethers.Signer) => {
  if (!signer) {
    const provider = getProvider();
    if (!provider) throw new Error("No provider");
    return new ethers.Contract(address, abi, provider);
  }
  return new ethers.Contract(address, abi, signer);
};

export const getSigner = async () => {
  const provider = getProvider();
  if (!provider) return null;
  return provider.getSigner();
};

export const formatError = (error: any): string => {
  const msg = error?.reason || error?.message || 'Unknown error';
  if (msg.includes('insufficient funds')) return 'Insufficient funds for gas';
  if (msg.includes('Insufficient balance')) return '余额不足 (Insufficient balance)';
  if (msg.includes('user rejected')) return 'User rejected transaction';
  if (msg.includes('cooldown')) return 'Cooldown active';
  return msg;
};

// Utils for formatting
export const shortenAddress = (address: string) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

