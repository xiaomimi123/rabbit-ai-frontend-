import { ethers } from 'ethers';
import { EthereumProvider } from '@walletconnect/ethereum-provider';
import { WalletConnectModal } from '@walletconnect/modal';
import { ABIS, CONTRACTS, CHAIN_ID, CHAIN_HEX, CHAIN_NAME, RPC_URL, RPC_URLS, WALLETCONNECT_PROJECT_ID, DEFAULT_AIRDROP_FEE } from '../constants';
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

// RPC 管理器：自动切换备用 RPC
class RpcManager {
  private currentRpcIndex = 0;
  private rpcUrls: string[];
  private failedRpcs = new Set<number>(); // 记录失败的 RPC 索引
  private lastSwitchTime = 0;
  private readonly SWITCH_COOLDOWN = 60000; // 1 分钟内不重复切换

  constructor(rpcUrls: string[]) {
    this.rpcUrls = [...new Set(rpcUrls)]; // 去重
  }

  getCurrentRpc(): string {
    return this.rpcUrls[this.currentRpcIndex];
  }

  getAllRpcs(): string[] {
    return this.rpcUrls;
  }

  // 检测到 429 错误时切换到下一个可用的 RPC
  switchToNextRpc(): string | null {
    const now = Date.now();
    // 如果距离上次切换不到 1 分钟，不切换（避免频繁切换）
    if (now - this.lastSwitchTime < this.SWITCH_COOLDOWN) {
      console.log('[RpcManager] 切换冷却中，跳过本次切换');
      return this.getCurrentRpc();
    }

    // 尝试切换到下一个 RPC
    const startIndex = this.currentRpcIndex;
    let attempts = 0;
    
    while (attempts < this.rpcUrls.length) {
      this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
      attempts++;
      
      // 如果这个 RPC 之前失败过，跳过
      if (this.failedRpcs.has(this.currentRpcIndex)) {
        continue;
      }
      
      // 找到可用的 RPC
      this.lastSwitchTime = now;
      const newRpc = this.getCurrentRpc();
      console.log(`[RpcManager] 切换到备用 RPC: ${newRpc} (索引: ${this.currentRpcIndex})`);
      return newRpc;
    }
    
    // 所有 RPC 都失败过，重置失败记录并返回第一个
    console.warn('[RpcManager] 所有 RPC 都失败过，重置失败记录');
    this.failedRpcs.clear();
    this.currentRpcIndex = 0;
    this.lastSwitchTime = now;
    return this.getCurrentRpc();
  }

  // 标记某个 RPC 为失败
  markRpcAsFailed(index?: number): void {
    const idx = index !== undefined ? index : this.currentRpcIndex;
    this.failedRpcs.add(idx);
    console.log(`[RpcManager] 标记 RPC 为失败: ${this.rpcUrls[idx]} (索引: ${idx})`);
  }

  // 重置失败记录（成功时调用）
  resetFailedRpc(index?: number): void {
    const idx = index !== undefined ? index : this.currentRpcIndex;
    this.failedRpcs.delete(idx);
  }
}

// 创建全局 RPC 管理器
const rpcManager = new RpcManager(RPC_URLS);

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

// 导出 RPC 管理器函数，供其他模块使用
export const getCurrentRpc = () => {
  return rpcManager.getCurrentRpc();
};

// 检测并处理 429 错误，自动切换到备用 RPC
export const handleRpcError = (error: any): boolean => {
  const errorMessage = error?.message || error?.toString() || '';
  const status = error?.response?.status || error?.status;
  const errorCode = error?.code;
  
  // 检测 429 错误（多种形式）
  const isRateLimitError = status === 429 || 
                           errorCode === -16429 ||
                           errorMessage.includes('429') || 
                           errorMessage.includes('Too Many Requests') ||
                           errorMessage.includes('Too many requests');
  
  if (isRateLimitError) {
    console.warn('[RpcManager] 检测到 429 错误，切换到备用 RPC');
    const nextRpc = rpcManager.switchToNextRpc();
    if (nextRpc) {
      console.log(`[RpcManager] 已切换到: ${nextRpc}`);
      return true; // 表示已切换
    }
  }
  return false; // 未切换
};

// 通用的 RPC 调用包装函数，自动处理 429 错误和重试
export const callWithRetry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> => {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || '';
      const errorCode = error?.code;
      const isRateLimitError = errorCode === -16429 ||
                               errorMessage.includes('429') || 
                               errorMessage.includes('Too Many Requests') ||
                               errorMessage.includes('Too many requests');
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        throw error;
      }
      
      // 如果是 429 错误，使用指数退避重试
      if (isRateLimitError) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), 10000); // 最多 10 秒
        if (onRetry) {
          onRetry(attempt + 1, error);
        } else {
          console.warn(`[callWithRetry] RPC 速率限制，${delay}ms 后重试 (尝试 ${attempt + 1}/${maxRetries})...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // 其他错误，直接抛出
      throw error;
    }
  }
  
  // 理论上不会到达这里
  throw new Error('Unexpected error in callWithRetry');
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

  // 【修改点 1】不要在每次 init 时都暴力清理 session，这会导致重连失败
  // 只在明确失败的 catch 块或用户点击断开时清理
  // clearWalletConnectSessions(); 

  const modal = getWalletConnectModal();

  // 使用 RPC 管理器获取当前 RPC（支持自动切换）
  const currentRpc = rpcManager.getCurrentRpc();
  
  try {
    const rpcMap: Record<number, string> = {
      [CHAIN_ID]: currentRpc
    };

    console.log('[WalletConnect] 初始化，使用 RPC:', rpcMap[CHAIN_ID]);

    const provider = await EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [CHAIN_ID], // 必选链
      rpcMap: rpcMap,
      showQrModal: false, // IMPORTANT: use WalletConnectModal for mobile deep link + desktop QR
      metadata: {
        name: 'Rabbit AI',
        description: 'Rabbit AI Quantitative Trading',
        url: window.location.origin,
        // 【修改点 3】建议使用绝对路径的 HTTPS 图片
        icons: [`${window.location.origin}/favicon.ico`],
      },
      // 启用所有常用方法，提高兼容性
      optionalMethods: [
        'eth_sendTransaction',
        'eth_signTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
        'eth_signTypedData_v4'
      ],
    });

    // When WalletConnect emits a URI, open the modal (不再跳转到 walletconnect 网站)
    provider.on('display_uri', (uri: string) => {
      console.log('[WalletConnect] 显示二维码 URI');
      // 只打开 modal，不跳转页面，避免影响用户体验
      modal.openModal({ uri });
    });

    provider.on('connect', () => {
      console.log('[WalletConnect] 连接成功');
      modal.closeModal();
    });

    provider.on('disconnect', () => {
      console.log('[WalletConnect] 断开连接');
      modal.closeModal();
    });

    // 添加错误事件监听
    provider.on('session_event', (event: any) => {
      console.log('[WalletConnect] Session event:', event);
    });

    provider.on('session_delete', () => {
      console.log('[WalletConnect] Session deleted');
      walletConnectProvider = null;
    });

    walletConnectProvider = provider;
    return provider;
  } catch (initError: any) {
    console.error('[WalletConnect] 初始化失败:', initError);
    const errorMessage = initError?.message || initError?.toString() || '未知错误';
    
    // 检测 429 错误，自动切换到备用 RPC
    if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
      console.warn('[WalletConnect] 检测到 429 错误，尝试切换到备用 RPC...');
      const nextRpc = rpcManager.switchToNextRpc();
      if (nextRpc && nextRpc !== currentRpc) {
        // 标记当前 RPC 为失败
        rpcManager.markRpcAsFailed();
        // 递归重试，使用新的 RPC
        return await initWalletConnectProvider();
      }
    }
    
    // 提供更详细的错误信息
    if (errorMessage.includes('network') || errorMessage.includes('Network') || errorMessage.includes('网络')) {
      throw new Error(`网络连接异常，请检查网络设置后重试`);
    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      throw new Error(`连接超时，请检查网络后重试`);
    } else if (errorMessage.includes('RPC') || errorMessage.includes('rpc')) {
      throw new Error(`服务连接异常，请稍后重试`);
    } else {
      throw new Error(`钱包连接失败，请重试`);
    }
  }
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
        console.log('[WalletConnect] 开始连接...');
        await wc.enable();
        console.log('[WalletConnect] enable() 成功');
      } catch (enableError: any) {
        console.error('[WalletConnect] enable() 失败:', enableError);
        
        // 如果 enable 失败，可能是已有连接但状态不一致
        // 先尝试断开，然后重新连接
        const errorMessage = enableError?.message || enableError?.toString() || '';
        const errorCode = enableError?.code || enableError?.error?.code;
        
        // 检查是否是 429 错误（RPC 速率限制）
        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          console.warn('[WalletConnect] 检测到 429 错误，切换到备用 RPC 并重试...');
          try {
            // 切换到备用 RPC
            const nextRpc = rpcManager.switchToNextRpc();
            if (nextRpc) {
              // 标记当前 RPC 为失败
              rpcManager.markRpcAsFailed();
              // 断开当前连接
              try {
                await wc.disconnect();
              } catch {}
              walletConnectProvider = null;
              clearWalletConnectSessions();
              await new Promise(resolve => setTimeout(resolve, 1000));
              // 使用新的 RPC 重新初始化
              const newWc = await initWalletConnectProvider();
              await newWc.enable();
              walletConnectProvider = newWc;
              console.log('[WalletConnect] 使用备用 RPC 重新连接成功');
            } else {
              throw new Error('所有 RPC 都不可用，请稍后重试');
            }
          } catch (retryError: any) {
            console.error('[WalletConnect] 切换 RPC 后重试失败:', retryError);
            throw new Error(`RPC 速率限制，已尝试切换备用 RPC 但仍失败。请稍后重试。`);
          }
        } else if (errorMessage.includes('network') || errorMessage.includes('Network') || 
            errorMessage.includes('网络') || errorMessage.includes('connection') ||
            errorMessage.includes('Connection') || errorMessage.includes('连接')) {
          console.error('[WalletConnect] 网络连接错误:', errorMessage);
          // 尝试重新初始化一次
          try {
            walletConnectProvider = null;
            clearWalletConnectSessions();
            await new Promise(resolve => setTimeout(resolve, 1000));
            const newWc = await initWalletConnectProvider();
            await newWc.enable();
            walletConnectProvider = newWc;
            console.log('[WalletConnect] 重新连接成功');
          } catch (retryError: any) {
            console.error('[WalletConnect] 重试连接失败:', retryError);
            throw new Error(`网络连接异常，请检查网络设置后重试`);
          }
        } else if (errorMessage.includes('Session already exists') || 
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
            
            // 提供更详细的错误信息
            if (retryErrorMessage.includes('network') || retryErrorMessage.includes('Network')) {
              throw new Error(`网络连接失败：${retryErrorMessage}。请检查网络连接或稍后重试。`);
            } else {
              throw new Error(`连接失败：${retryErrorMessage}。请刷新页面后重试。`);
            }
          }
        } else {
          // 其他错误，直接抛出
          console.error('[WalletConnect] 未知错误:', enableError);
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

// 🟢 新增：动态获取空投手续费（带缓存机制）
let cachedClaimFee: string | null = null;
let cachedClaimFeeTime: number = 0;
const CLAIM_FEE_CACHE_DURATION = 5 * 60 * 1000; // 缓存 5 分钟

export const getAirdropClaimFee = async (): Promise<string> => {
  const now = Date.now();
  
  // 如果缓存有效，直接返回
  if (cachedClaimFee && (now - cachedClaimFeeTime) < CLAIM_FEE_CACHE_DURATION) {
    return cachedClaimFee;
  }
  
  try {
    const provider = getProvider();
    if (!provider) {
      // 如果没有 provider，返回默认值
      return DEFAULT_AIRDROP_FEE;
    }
    
    const { CONTRACTS, ABIS } = await import('../constants');
    const contract = new ethers.Contract(CONTRACTS.AIRDROP, ABIS.AIRDROP, provider);
    
    // 使用 callWithRetry 包装，处理 RPC 错误
    const feeWei = await callWithRetry(
      () => contract.claimFee(),
      {
        maxRetries: 3,
        baseDelay: 1000,
        onRetry: (attempt) => {
          console.warn(`[getAirdropClaimFee] RPC 错误，重试获取手续费 ${attempt}/3...`);
        }
      }
    ) as ethers.BigNumber;
    
    // 转换为 BNB 格式（字符串）
    const feeInBNB = ethers.utils.formatEther(feeWei as ethers.BigNumberish);
    
    // 更新缓存
    cachedClaimFee = feeInBNB;
    cachedClaimFeeTime = now;
    
    console.log(`[getAirdropClaimFee] ✅ 从合约获取手续费: ${feeInBNB} BNB`);
    return feeInBNB;
  } catch (error: any) {
    console.error('[getAirdropClaimFee] ⚠️ 获取手续费失败，使用默认值:', error);
    
    // 如果获取失败，使用缓存值（即使过期）或默认值
    if (cachedClaimFee) {
      console.log(`[getAirdropClaimFee] 使用过期缓存值: ${cachedClaimFee} BNB`);
      return cachedClaimFee;
    }
    
    // 导入默认值
    const { DEFAULT_AIRDROP_FEE } = await import('../constants');
    return DEFAULT_AIRDROP_FEE;
  }
};

// 🟢 新增：清除手续费缓存（当管理员修改费用后可以调用）
export const clearClaimFeeCache = () => {
  cachedClaimFee = null;
  cachedClaimFeeTime = 0;
  console.log('[clearClaimFeeCache] ✅ 手续费缓存已清除');
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

