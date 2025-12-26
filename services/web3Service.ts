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

// localStorage 键名
const STORAGE_KEYS = {
  WALLET_TYPE: 'rabbit_wallet_type',
  WALLET_ADDRESS: 'rabbit_wallet_address',
};

// 保存钱包连接信息到 localStorage
const saveWalletInfo = (walletType: WalletType, address: string) => {
  try {
    localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, walletType);
    localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, address);
  } catch (error) {
    console.warn('Failed to save wallet info to localStorage:', error);
  }
};

// 从 localStorage 读取钱包连接信息
const getSavedWalletInfo = (): { walletType: WalletType | null; address: string | null } => {
  try {
    const walletType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE) as WalletType | null;
    const address = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESS);
    return { walletType, address };
  } catch (error) {
    console.warn('Failed to read wallet info from localStorage:', error);
    return { walletType: null, address: null };
  }
};

// 清除保存的钱包连接信息
const clearWalletInfo = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
  } catch (error) {
    console.warn('Failed to clear wallet info from localStorage:', error);
  }
};

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
  
  // 自定义钱包列表：在 Modal 打开后重新排序和隐藏钱包
  const originalOpenModal = walletConnectModal.openModal.bind(walletConnectModal);
  walletConnectModal.openModal = async function(options?: any) {
    await originalOpenModal(options);
    
    // 延迟执行，等待 DOM 渲染完成
    const customizeWalletList = () => {
      try {
        // 优先显示的钱包名称（按顺序，支持部分匹配）
        const preferredWallets = ['binance', 'okx', 'trust', 'safepal', 'uniswap'];
        // 要排除的钱包名称（支持部分匹配）
        const excludeWallets = ['ledger', 'fireblocks'];
        
        // 查找 Modal 元素（WalletConnect Modal 使用 Shadow DOM）
        const modalElement = document.querySelector('wcm-modal');
        if (!modalElement) return false;
        
        // 查找钱包列表容器
        const walletList = modalElement.shadowRoot?.querySelector('wcm-wallet-list');
        if (!walletList) return false;
        
        const walletListShadow = walletList.shadowRoot;
        if (!walletListShadow) return false;
        
        // 获取所有钱包按钮
        const walletButtons = Array.from(walletListShadow.querySelectorAll('wcm-wallet-button') || []);
        if (walletButtons.length === 0) return false;
        
        // 分离优先钱包、其他钱包和需要隐藏的钱包
        const preferredItems: Array<{ element: Element; index: number }> = [];
        const otherItems: Element[] = [];
        
        walletButtons.forEach((button) => {
          // 获取钱包名称（从按钮的文本内容或属性中）
          const buttonText = (button as HTMLElement).textContent || '';
          const buttonLabel = button.getAttribute('name') || buttonText || '';
          const labelLower = buttonLabel.toLowerCase();
          
          // 检查是否需要隐藏
          const shouldExclude = excludeWallets.some(w => labelLower.includes(w));
          
          if (shouldExclude) {
            // 隐藏不需要的钱包
            (button as HTMLElement).style.display = 'none';
            return;
          }
          
          // 检查是否是优先钱包
          const preferredIndex = preferredWallets.findIndex(w => labelLower.includes(w));
          
          if (preferredIndex !== -1) {
            preferredItems.push({ element: button, index: preferredIndex });
          } else {
            otherItems.push(button);
          }
        });
        
        // 按优先级排序
        preferredItems.sort((a, b) => a.index - b.index);
        
        // 重新排列：优先钱包在前，其他钱包在后
        const sortedItems = [...preferredItems.map(item => item.element), ...otherItems];
        
        // 重新插入到 DOM
        sortedItems.forEach((item) => {
          if (item.parentNode) {
            walletListShadow.appendChild(item);
          }
        });
        
        return true;
      } catch (error) {
        console.warn('Failed to customize wallet list:', error);
        return false;
      }
    };
    
    // 多次尝试，确保 DOM 已渲染
    let attempts = 0;
    const maxAttempts = 10;
    const tryCustomize = () => {
      attempts++;
      if (customizeWalletList() || attempts >= maxAttempts) {
        return;
      }
      setTimeout(tryCustomize, 200);
    };
    
    setTimeout(tryCustomize, 300);
  };
  
  return walletConnectModal;
}

// 彻底清理 WalletConnect session 数据
export function clearWalletConnectSessions(): void {
  try {
    const keysToRemove: string[] = [];
    // 遍历所有 localStorage 键
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('wc@2:') || 
        key.startsWith('walletconnect') ||
        key.includes('walletconnect') ||
        key.includes('wc@')
      )) {
        keysToRemove.push(key);
      }
    }
    // 批量删除
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log('[WalletConnect] 已清理 session:', key);
      } catch (e) {
        console.warn('[WalletConnect] 清理 session 失败:', key, e);
      }
    });
    
    // 同时清理 sessionStorage（某些 WalletConnect 实现可能使用 sessionStorage）
    try {
      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (
          key.startsWith('wc@2:') || 
          key.startsWith('walletconnect') ||
          key.includes('walletconnect') ||
          key.includes('wc@')
        )) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => {
        try {
          sessionStorage.removeItem(key);
          console.log('[WalletConnect] 已清理 sessionStorage:', key);
        } catch (e) {
          console.warn('[WalletConnect] 清理 sessionStorage 失败:', key, e);
        }
      });
    } catch (e) {
      console.warn('[WalletConnect] 清理 sessionStorage 时出错:', e);
    }
    
    console.log('[WalletConnect] 已彻底清理所有 WalletConnect session 数据');
  } catch (e) {
    console.warn('[WalletConnect] 清理时出错:', e);
  }
}

async function initWalletConnectProvider(): Promise<any> {
  // 如果已有 provider，先检查连接状态
  if (walletConnectProvider) {
    try {
      // 检查是否已连接
      if (walletConnectProvider.accounts && walletConnectProvider.accounts.length > 0) {
        return walletConnectProvider;
      }
      // 如果未连接但有旧状态，先断开清理
      try {
        await walletConnectProvider.disconnect();
      } catch {
        // 忽略断开错误
      }
      walletConnectProvider = null;
    } catch {
      // 如果检查失败，重置 provider
      walletConnectProvider = null;
    }
  }
  
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error('请先配置 WalletConnect 项目 ID');
  }

  // 在初始化前，彻底清理所有 WalletConnect session 数据
  clearWalletConnectSessions();
  
  // 等待清理完成，确保数据已清除
  await new Promise(resolve => setTimeout(resolve, 200));

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

  // When WalletConnect emits a URI, open the modal (不再跳转到 walletconnect 网站)
  provider.on('display_uri', (uri: string) => {
    // 只打开 modal，不跳转页面，避免影响用户体验
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
      // 在连接前，先彻底清理所有可能的旧 session 数据
      clearWalletConnectSessions();
      walletConnectProvider = null;
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const wc = await initWalletConnectProvider();
      
      try {
        await wc.enable();
      } catch (enableError: any) {
        // 如果 enable 失败，可能是已有连接但状态不一致
        // 先尝试断开，然后重新连接
        const errorMessage = enableError?.message || enableError?.toString() || '';
        const errorCode = enableError?.code || enableError?.error?.code;
        
        if (errorMessage.includes('Session already exists') || 
            errorMessage.includes('already connected') ||
            errorCode === -32002) {
          console.log('[WalletConnect] 检测到 session 冲突，彻底清理并重新连接...');
          try {
            // 先断开当前 provider
            try {
              await wc.disconnect();
            } catch (disconnectError) {
              console.warn('[WalletConnect] 断开连接时出错:', disconnectError);
            }
            
            // 重置 provider 变量
            walletConnectProvider = null;
            
            // 彻底清理所有 WalletConnect session 数据
            clearWalletConnectSessions();
            
            // 等待清理完成（增加等待时间，确保数据已清除）
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 重新初始化
            const newWc = await initWalletConnectProvider();
            await newWc.enable();
            walletConnectProvider = newWc;
            console.log('[WalletConnect] 重新连接成功');
          } catch (retryError: any) {
            console.error('[WalletConnect] 重试连接失败:', retryError);
            const retryErrorMessage = retryError?.message || retryError?.toString() || '';
            
            // 如果重试仍然失败，再次彻底清理并抛出错误
            clearWalletConnectSessions();
            walletConnectProvider = null;
            
            // 不抛出 "请先断开 DApp" 的错误，而是抛出通用错误，让调用方处理
            throw new Error('连接失败，请刷新页面后重试');
          }
        } else {
          throw enableError;
        }
      }
      
      // close modal if still open
      try {
        getWalletConnectModal().closeModal();
      } catch {
        // ignore
      }
      
      // 验证 WalletConnect 已连接
      const finalWc = walletConnectProvider || wc;
      if (!finalWc.accounts || finalWc.accounts.length === 0) {
        throw new Error('WalletConnect connection failed: No accounts');
      }
      
      // 将 WalletConnect provider 转换为 ethers provider
      provider = new ethers.providers.Web3Provider(finalWc as any);
      currentProvider = provider;
      currentWalletType = walletType;
      
      // 保存连接信息
      const signer = provider.getSigner();
      signer.getAddress().then(address => {
        saveWalletInfo(walletType, address);
      }).catch(() => {
        // 如果获取地址失败，稍后重试
      });
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
      
      // 保存连接信息
      const signer = provider.getSigner();
      signer.getAddress().then(address => {
        saveWalletInfo(walletType, address);
      }).catch(() => {
        // 如果获取地址失败，稍后重试
      });
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
  // 清除保存的连接信息
  clearWalletInfo();
};

// 尝试恢复之前的钱包连接
export const restoreWalletConnection = async (): Promise<ethers.providers.Web3Provider | null> => {
  try {
    const { walletType, address } = getSavedWalletInfo();
    
    if (!walletType || !address) {
      return null;
    }
    
    // 验证地址格式
    if (!ethers.utils.isAddress(address)) {
      clearWalletInfo();
      return null;
    }
    
    // 如果是浏览器扩展钱包，尝试恢复连接
    if (walletType !== 'walletconnect') {
      const walletProvider = getWalletProvider(walletType);
      if (!walletProvider) {
        // 钱包未安装，清除保存的信息
        clearWalletInfo();
        return null;
      }
      
      // 检查是否已连接
      let accounts: string[] = [];
      if (walletProvider.request) {
        accounts = await walletProvider.request({ method: 'eth_accounts' });
      } else if (walletProvider.accounts) {
        accounts = walletProvider.accounts;
      }
      
      // 检查保存的地址是否在已连接的账户中
      const isConnected = accounts.some(acc => acc.toLowerCase() === address.toLowerCase());
      
      if (isConnected) {
        const provider = new ethers.providers.Web3Provider(walletProvider);
        currentProvider = provider;
        currentWalletType = walletType;
        return provider;
      } else {
        // 地址不匹配，清除保存的信息
        clearWalletInfo();
        return null;
      }
    } else {
      // WalletConnect: 尝试恢复 session
      try {
        const wc = await initWalletConnectProvider();
        if (wc.accounts && wc.accounts.length > 0) {
          const connectedAddress = wc.accounts[0].toLowerCase();
          if (connectedAddress === address.toLowerCase()) {
            const provider = new ethers.providers.Web3Provider(wc as any);
            currentProvider = provider;
            currentWalletType = walletType;
            return provider;
          } else {
            // 地址不匹配，断开连接
            await wc.disconnect();
            clearWalletInfo();
            return null;
          }
        } else {
          // 未连接，清除保存的信息
          clearWalletInfo();
          return null;
        }
      } catch {
        // 恢复失败，清除保存的信息
        clearWalletInfo();
        return null;
      }
    }
  } catch (error) {
    console.warn('Failed to restore wallet connection:', error);
    clearWalletInfo();
    return null;
  }
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

