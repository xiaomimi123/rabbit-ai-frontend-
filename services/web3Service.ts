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
let walletConnectProvider: any = null;
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
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error('请先配置 WalletConnect 项目 ID');
  }
  walletConnectModal = new WalletConnectModal({
    projectId: WALLETCONNECT_PROJECT_ID,
  });
  return walletConnectModal;
}

async function initWalletConnectProvider(): Promise<any> {
  if (walletConnectProvider) return walletConnectProvider;
  if (!WALLETCONNECT_PROJECT_ID) {
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

// 检测可用的浏览器扩展钱包（按优先级）
const detectAvailableWallets = (): WalletType[] => {
  const available: WalletType[] = [];
  
  // 优先检测：币安、OKX、信任钱包
  if (window.BinanceChain) {
    available.push('binance');
  }
  if (window.okxwallet) {
    available.push('okx');
  }
  if (window.ethereum?.isTrust) {
    available.push('trust');
  }
  // MetaMask 作为备选
  if (window.ethereum?.isMetaMask && !window.ethereum?.isTrust) {
    available.push('metamask');
  }
  
  return available;
};

// 连接钱包（智能选择）
export const connectWallet = async (walletType?: WalletType): Promise<ethers.providers.Web3Provider> => {
  try {
    // 如果没有指定钱包类型，智能选择
    if (!walletType || walletType === 'walletconnect') {
      // 先检测浏览器扩展钱包（优先：币安、OKX、信任钱包）
      const availableWallets = detectAvailableWallets();
      
      if (availableWallets.length > 0) {
        // 优先使用第一个检测到的钱包
        walletType = availableWallets[0];
      } else {
        // 没有检测到扩展钱包，使用 WalletConnect
        walletType = 'walletconnect';
      }
    }
    
    let provider: ethers.providers.Web3Provider;
    
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
      provider = new ethers.providers.Web3Provider(wc as any);
      currentProvider = provider;
      currentWalletType = walletType;
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

      provider = new ethers.providers.Web3Provider(walletProvider);
      currentProvider = provider;
      currentWalletType = walletType;
    }
    
    // 连接成功后，检查并切换网络
    try {
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      if (currentChainId !== CHAIN_ID) {
        console.log(`当前网络 Chain ID: ${currentChainId}, 需要切换到 Chain ID: ${CHAIN_ID}`);
        await switchNetwork();
        // 等待网络切换完成
        await new Promise(resolve => setTimeout(resolve, 1500));
        // 重新创建 provider 实例以确保使用正确的网络
        if (walletType === 'walletconnect' && walletConnectProvider) {
          provider = new ethers.providers.Web3Provider(walletConnectProvider as any);
        } else {
          const walletProvider = getWalletProvider(walletType);
          if (walletProvider) {
            provider = new ethers.providers.Web3Provider(walletProvider);
          }
        }
        currentProvider = provider;
        // 再次验证网络
        const newNetwork = await provider.getNetwork();
        const newChainId = Number(newNetwork.chainId);
        if (newChainId !== CHAIN_ID) {
          console.warn(`网络切换后仍不匹配: ${newChainId} !== ${CHAIN_ID}`);
        }
      }
    } catch (networkError: any) {
      console.warn('网络检查或切换失败:', networkError);
      // 网络切换失败不影响连接，继续执行
    }
    
    return provider;
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

