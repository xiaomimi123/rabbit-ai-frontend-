
import React, { useState, useRef, useEffect } from 'react';
import { ethers } from 'ethers';
import { logger } from './utils/logger';
import { Gift, Wallet, User, ShieldCheck, Bell, Menu, X, Globe, FileText, ExternalLink, ChevronRight, Twitter, Send, Headset, MessageSquareQuote, Check } from 'lucide-react';
import MiningView from './views/MiningView';
import AssetView from './views/AssetView';
import ProfileView from './views/ProfileView';
import NotificationsView from './views/NotificationsView';
import { TabType, UserStats, Notification } from './types';
import { PROTOCOL_STATS } from './constants';
import { useLanguage } from './contexts/LanguageContext';
import { Language } from './translations';
import { fetchSystemLinks, fetchUserNotifications, markAllNotificationsAsRead } from './api';
import { shortenAddress } from './services/web3Service';

interface SystemLinks {
  whitepaper?: string;
  audits?: string;
  support?: string;
}

const App: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('mining');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [systemLinks, setSystemLinks] = useState<SystemLinks>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<UserStats>({
    ratBalance: 0,
    bnbBalance: 0,
    energy: 0,
    pendingUsdt: 0,
    teamSize: 0,
    teamRewards: 0,
    address: ''
  });

  // 🟢 新增：生成会话ID（用于去重）
  const getSessionId = (): string => {
    try {
      let sessionId = sessionStorage.getItem('rabbit_session_id');
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('rabbit_session_id', sessionId);
      }
      return sessionId;
    } catch {
      // 如果 sessionStorage 不可用，使用临时 ID
      return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  };

  // 🟢 修复3: 记录页面访问（支持钱包连接后更新）
  const recordVisit = async (walletAddress: string | null = null) => {
    try {
      // 获取推荐人地址（从 URL 或 localStorage）
      const urlParams = new URLSearchParams(window.location.search);
      const refFromUrl = urlParams.get('ref');
      let referrer = refFromUrl || null;
      
      // 如果没有 URL 参数，尝试从 localStorage 获取
      if (!referrer) {
        try {
          const storedRef = localStorage.getItem('rabbit_referrer');
          if (storedRef && ethers.utils.isAddress(storedRef)) {
            referrer = storedRef;
          }
        } catch {
          // 忽略错误
        }
      }

      // 检测是否移动设备
      const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

      // 使用当前钱包地址（如果传入）或 stats.address
      const currentWalletAddress = walletAddress || (stats.address && stats.address.startsWith('0x') ? stats.address : null);

      // 发送访问记录
      // 使用统一的 API base URL（与 api.ts 中的逻辑一致）
      const { getApiBaseUrl } = await import('./api');
      const apiBase = getApiBaseUrl();
      // 确保路径正确拼接（apiBase 已经以 /api/ 结尾）
      const visitUrl = apiBase.endsWith('/') 
        ? `${apiBase}analytics/visit` 
        : `${apiBase}/analytics/visit`;
      
      const response = await fetch(visitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pagePath: window.location.pathname,
          walletAddress: currentWalletAddress,
          referrer: referrer,
          language: language,
          isMobile: isMobile,
          sessionId: getSessionId(),
        }),
      });

      if (response.ok) {
        logger.debug('[App] Page visit recorded', { walletAddress: currentWalletAddress });
        return true;
      }
      return false;
    } catch (error) {
      // 静默失败，不影响用户体验
      logger.warn('[App] Failed to record page visit:', error);
      return false;
    }
  };

  // 🟢 修复3: 首次访问记录（页面加载时）
  useEffect(() => {
    const visitRecorded = sessionStorage.getItem('rabbit_visit_recorded');
    if (visitRecorded) {
      return; // 已经记录过，跳过
    }

    // 延迟 1 秒后记录，确保页面已加载
    const timer = setTimeout(async () => {
      const success = await recordVisit();
      if (success) {
        // 标记已记录初始访问
        sessionStorage.setItem('rabbit_visit_recorded', 'true');
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []); // 只在组件挂载时执行一次

  // 🟢 修复3: 监听钱包连接事件，当钱包地址从 null 变为有值时，再次上报
  useEffect(() => {
    // 如果钱包地址从无到有，说明用户刚刚连接了钱包
    if (stats.address && stats.address.startsWith('0x')) {
      // 检查是否已经记录过钱包连接事件
      const walletRecorded = sessionStorage.getItem('rabbit_wallet_recorded');
      const currentWallet = stats.address.toLowerCase();
      
      // 如果之前记录的钱包地址不同，或者还没有记录过，则上报
      if (!walletRecorded || walletRecorded !== currentWallet) {
        // 延迟 500ms 后记录，确保钱包连接完成
        const timer = setTimeout(async () => {
          const success = await recordVisit(stats.address);
          if (success) {
            // 标记已记录当前钱包地址
            sessionStorage.setItem('rabbit_wallet_recorded', currentWallet);
            logger.debug('[App] Wallet connection visit recorded', { walletAddress: stats.address });
          }
        }, 500);
        
        return () => clearTimeout(timer);
      }
    }
  }, [stats.address]); // 监听钱包地址变化

  // 页面加载时尝试恢复钱包连接
  useEffect(() => {
    const restoreConnection = async () => {
      try {
        const { restoreWalletConnection } = await import('./services/web3Service');
        const provider = await restoreWalletConnection();
        if (provider) {
          const signer = provider.getSigner();
          const address = await signer.getAddress();
          setStats(prev => ({ ...prev, address }));
        }
      } catch (error) {
        logger.warn('Failed to restore wallet connection');
      }
    };
    
    restoreConnection();
  }, []);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const hasUnread = notifications.some(n => !n.read);

  // Load user notifications
  const loadNotifications = async () => {
    // ✅ 修复：如果没有地址，清空通知列表
    if (!stats.address || !stats.address.startsWith('0x')) {
      setNotifications([]);
      return;
    }
    try {
      const data = await fetchUserNotifications(stats.address);
      if (Array.isArray(data)) {
        // Convert backend data format to frontend format
        const formatted = data.map((item: any) => ({
          id: item.id || item._id || String(Math.random()),
          type: item.type || 'SYSTEM',
          title: item.title || '',
          content: item.content || item.message || '',
          timestamp: item.timestamp || (item.createdAt ? new Date(item.createdAt).getTime() : Date.now()),
          read: item.read || false,
        }));
        setNotifications(formatted);
      } else {
        setNotifications([]);
      }
    } catch (error: any) {
      // 404 错误是正常的（没有通知），不显示错误
      const status = error?.response?.status || error?.status;
      if (status !== 404 && !error?.message?.includes('404')) {
        logger.error('Failed to load notifications', error);
      }
      setNotifications([]);
    }
  };


  // 标记所有通知为已读
  const handleMarkAllAsRead = async () => {
    if (!stats.address || !stats.address.startsWith('0x')) return;
    try {
      await markAllNotificationsAsRead(stats.address);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      logger.error('Failed to mark all as read', error);
      // 即使 API 失败，也更新本地状态
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  // Load system configuration links
  useEffect(() => {
    const loadSystemLinks = async () => {
      try {
        const links = await fetchSystemLinks();
        logger.debug('[App] 加载系统链接配置');
        setSystemLinks(links || {});
      } catch (error: any) {
        // 404 错误是正常的（没有配置），不显示错误
        const status = error?.response?.status || error?.status;
        if (status !== 404 && !error?.message?.includes('404')) {
          logger.error('Failed to load system links', error);
        }
        // 设置默认值（可选）
        setSystemLinks({
          whitepaper: '',
          audits: '',
          support: '',
        });
      }
    };
    loadSystemLinks();
    
    // 每 5 分钟刷新一次系统链接配置（确保管理后台更新后能及时生效）
    const interval = setInterval(() => {
      loadSystemLinks();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Load user notifications
  useEffect(() => {
    loadNotifications();
    
    // Refresh notifications every 60 seconds (降低请求频率，避免 RPC 速率限制)
    const interval = setInterval(() => {
      loadNotifications();
    }, 60000);
    
    return () => clearInterval(interval);
  }, [stats.address]);

  // 更新BNB余额
  useEffect(() => {
    const updateBnbBalance = async () => {
      if (!stats.address || !stats.address.startsWith('0x')) {
        setStats(prev => ({ ...prev, bnbBalance: 0 }));
        return;
      }
      
      try {
        const { getProvider } = await import('./services/web3Service');
        const provider = getProvider();
        if (!provider) return;
        
        const balance = await provider.getBalance(stats.address);
        const bnbBalance = parseFloat(ethers.utils.formatEther(balance));
        setStats(prev => ({ ...prev, bnbBalance }));
      } catch (error: any) {
        // 检测 429 错误（Too Many Requests）
        const errorMessage = error?.message || error?.toString() || '';
        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          logger.warn('[App] RPC 速率限制，跳过本次 BNB 余额更新');
        } else {
          logger.error('Failed to update BNB balance', error);
        }
      }
    };
    
    updateBnbBalance();
    // 每30秒更新一次BNB余额（降低请求频率，避免 RPC 速率限制）
    const interval = setInterval(updateBnbBalance, 30000);
    return () => clearInterval(interval);
  }, [stats.address]);

  // Listen to notification refresh event
  useEffect(() => {
    const handleRefresh = () => {
      loadNotifications();
    };
    window.addEventListener('refreshNotifications', handleRefresh);
    return () => window.removeEventListener('refreshNotifications', handleRefresh);
  }, [stats.address]);

  // 监听能量值刷新事件，刷新用户信息（包括团队奖励）
  useEffect(() => {
    const handleRefreshEnergy = async () => {
      if (!stats.address || !stats.address.startsWith('0x')) return;
      
      try {
        const { fetchUserInfo, fetchTeamRewards } = await import('./api');
        const [userInfo, teamData] = await Promise.all([
          fetchUserInfo(stats.address).catch(() => null),
          fetchTeamRewards(stats.address).catch(() => ({ totalRewards: '0' })),
        ]);
        
        if (userInfo) {
          setStats(prev => ({
            ...prev,
            energy: Number(userInfo.energy || 0),
            teamSize: Number(userInfo.inviteCount || 0),
            teamRewards: parseFloat(teamData?.totalRewards || '0'),
          }));
        }
      } catch (error) {
        logger.warn('Failed to refresh user info on refreshEnergy event');
      }
    };
    
    window.addEventListener('refreshEnergy', handleRefreshEnergy);
    return () => window.removeEventListener('refreshEnergy', handleRefreshEnergy);
  }, [stats.address]);

  // 自动轮询：每120秒刷新一次用户信息（降低请求频率，避免 RPC 速率限制）
  useEffect(() => {
    if (!stats.address || !stats.address.startsWith('0x')) return;
    
    let retryCount = 0;
    let currentInterval = 120000; // 初始 120 秒
    
    const refreshUserInfo = async () => {
      try {
        const { fetchUserInfo, fetchTeamRewards } = await import('./api');
        const [userInfo, teamData] = await Promise.all([
          fetchUserInfo(stats.address).catch(() => null),
          fetchTeamRewards(stats.address).catch(() => ({ totalRewards: '0' })),
        ]);
        
        if (userInfo) {
          setStats(prev => ({
            ...prev,
            energy: Number(userInfo.energy || 0),
            teamSize: Number(userInfo.inviteCount || 0),
            teamRewards: parseFloat(teamData?.totalRewards || '0'),
          }));
        }
        // 成功时重置重试计数和间隔
        retryCount = 0;
        currentInterval = 120000;
      } catch (error: any) {
        retryCount++;
        const status = error?.response?.status;
        // 检测 429 错误（Too Many Requests）
        if (status === 429) {
          logger.warn('[App] RPC 速率限制，增加刷新间隔');
          // 指数退避：429 错误时增加间隔
          currentInterval = Math.min(currentInterval * 2, 600000); // 最多 10 分钟
        } else {
          logger.warn('[App] Auto-refresh failed');
        }
      }
    };
    
    // 使用动态间隔
    const scheduleRefresh = () => {
      const timeoutId = setTimeout(() => {
        logger.debug(`[App] Auto-refreshing user info (${currentInterval / 1000}s interval)`);
        refreshUserInfo().finally(() => {
          scheduleRefresh(); // 递归调用，使用动态间隔
        });
      }, currentInterval);
      return timeoutId;
    };
    
    const timeoutId = scheduleRefresh();
    
    return () => clearTimeout(timeoutId);
  }, [stats.address]);

  // 页面可见性检测：当用户切换回页面时自动刷新
  useEffect(() => {
    if (!stats.address || !stats.address.startsWith('0x')) return;
    
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        logger.debug('[App] Page became visible, refreshing user info');
        try {
          const { fetchUserInfo, fetchTeamRewards } = await import('./api');
          const [userInfo, teamData] = await Promise.all([
            fetchUserInfo(stats.address).catch(() => null),
            fetchTeamRewards(stats.address).catch(() => ({ totalRewards: '0' })),
          ]);
          
          if (userInfo) {
            setStats(prev => ({
              ...prev,
              energy: Number(userInfo.energy || 0),
              teamSize: Number(userInfo.inviteCount || 0),
              teamRewards: parseFloat(teamData?.totalRewards || '0'),
            }));
          }
        } catch (error) {
          logger.warn('[App] Visibility refresh failed');
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stats.address]);

  // 页面加载时，如果有地址，加载用户信息（包括团队奖励）
  useEffect(() => {
    const loadUserInfo = async () => {
      if (!stats.address || !stats.address.startsWith('0x')) return;
      
      try {
        const { fetchUserInfo, fetchTeamRewards } = await import('./api');
        const [userInfo, teamData] = await Promise.all([
          fetchUserInfo(stats.address).catch(() => null),
          fetchTeamRewards(stats.address).catch(() => ({ totalRewards: '0' })),
        ]);
        
        if (userInfo) {
          setStats(prev => ({
            ...prev,
            energy: Number(userInfo.energy || 0),
            teamSize: Number(userInfo.inviteCount || 0),
            teamRewards: parseFloat(teamData?.totalRewards || '0'),
          }));
        }
      } catch (error) {
        logger.warn('Failed to load user info on mount');
      }
    };
    
    loadUserInfo();
  }, [stats.address]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setShowLanguageMenu(false);
      }
    };
    if (isMenuOpen || showLanguageMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, showLanguageMenu]);

  // 监听切换到挖矿页面的事件（用于能量不足时的引导）
  useEffect(() => {
    const handleSwitchToMining = () => {
      setActiveTab('mining');
    };
    window.addEventListener('switchToMining', handleSwitchToMining);
    return () => window.removeEventListener('switchToMining', handleSwitchToMining);
  }, []);

  // Handle link navigation
  const handleLinkClick = (url: string | undefined, type: 'whitepaper' | 'audits' | 'support') => {
    if (!url || url.trim() === '') {
      logger.warn(`[App] ${type} link is not configured`);
      return;
    }
    logger.debug(`[App] 打开链接 (${type})`);
    // 在新标签页打开链接
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const languages: { code: Language; name: string; native: string }[] = [
    { code: 'zh', name: 'Chinese', native: '中文' },
    { code: 'en', name: 'English', native: 'English' },
    { code: 'jp', name: 'Japanese', native: '日本語' },
    { code: 'kr', name: 'Korean', native: '한국어' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'ru', name: 'Russian', native: 'Русский' },
  ];

  const renderView = () => {
    switch (activeTab) {
      case 'mining': return <MiningView stats={stats} setStats={setStats} />;
      case 'asset': return <AssetView stats={stats} setStats={setStats} />;
      case 'profile': return <ProfileView stats={stats} />;
      case 'notifications': return <NotificationsView notifications={notifications} setNotifications={setNotifications} onBack={() => setActiveTab('mining')} address={stats.address} onMarkAllAsRead={handleMarkAllAsRead} />;
      default: return <AssetView stats={stats} setStats={setStats} />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto relative overflow-hidden bg-[#0b0e11]">
      {/* Ambient Decorative Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#FCD535]/5 rounded-full blur-[100px] animate-pulse-slow" />
        <div className="absolute bottom-[20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '2s' }} />
      </div>

      {/* Top Status Bar */}
      <header className="px-6 pt-6 pb-2 flex justify-between items-center z-[60]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#FCD535] rounded-full flex items-center justify-center glow-yellow cursor-pointer overflow-hidden" onClick={() => setActiveTab('mining')}>
             <img src="/logo.svg" alt="Rabbit AI Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="font-black text-lg tracking-tighter uppercase italic block leading-none">Rabbit AI</span>
            {stats.address && stats.address.startsWith('0x') ? (
              <div className="flex items-center gap-1 mt-1 max-w-[140px]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#0ECB81] animate-pulse flex-shrink-0" />
                <span className="text-[7px] font-black text-[#0ECB81] uppercase tracking-tighter mono truncate">
                  {shortenAddress(stats.address)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#848E9C] opacity-50" />
                <span className="text-[8px] font-black text-[#848E9C] uppercase tracking-tighter">
                  {t('common.notConnected') || '未连接'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveTab('notifications')}
            className={`relative p-2.5 rounded-xl transition-all ${activeTab === 'notifications' ? 'bg-[#FCD535] text-[#0B0E11]' : 'bg-white/5 text-[#848E9C] hover:bg-white/10'}`}
          >
            <Bell className="w-5 h-5" />
            {hasUnread && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-[#F6465D] rounded-full border-2 border-[#0b0e11] animate-pulse" />
            )}
          </button>
          
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`relative p-2.5 rounded-xl transition-all duration-300 ${isMenuOpen ? 'bg-[#FCD535] text-[#0B0E11]' : 'bg-white/5 text-[#848E9C] hover:bg-white/10'}`}
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Menu Panel */}
        {isMenuOpen && (
          <div ref={menuRef} className="absolute top-20 right-6 w-60 glass rounded-3xl border border-white/10 z-[70] animate-in fade-in zoom-in-95 origin-top-right shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="p-2.5 space-y-1.5">
              <div className="relative">
                <button 
                  onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-white/5 group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-xl group-hover:bg-[#FCD535]/10 group-hover:text-[#FCD535] transition-colors">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] font-black text-white/90 leading-none mb-1 uppercase tracking-tight">语言切换</p>
                      <p className="text-[8px] text-[#848E9C] font-bold uppercase tracking-tighter">
                        {languages.find(l => l.code === language)?.native || '中文'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-3 h-3 text-white/10 group-hover:text-[#FCD535] transition-all ${showLanguageMenu ? 'rotate-90' : ''}`} />
                </button>
                
                {/* Language Dropdown */}
                {showLanguageMenu && (
                  <div ref={langMenuRef} className="mt-1 bg-[#1e2329] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setLanguage(lang.code);
                          setShowLanguageMenu(false);
                        }}
                        className={`w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors ${
                          language === lang.code ? 'bg-[#FCD535]/10' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-black text-white/90">{lang.native}</span>
                          <span className="text-[9px] text-[#848E9C] font-bold">({lang.name})</span>
                        </div>
                        {language === lang.code && (
                          <Check className="w-4 h-4 text-[#FCD535]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <MenuLink 
                icon={<FileText className="w-4 h-4" />} 
                label="项目白皮书" 
                subLabel="Whitepaper"
                onClick={() => handleLinkClick(systemLinks.whitepaper, 'whitepaper')}
                disabled={!systemLinks.whitepaper || systemLinks.whitepaper.trim() === ''}
              />
              <MenuLink 
                icon={<ShieldCheck className="w-4 h-4" />} 
                label="安全审计报告" 
                subLabel="Audits"
                onClick={() => handleLinkClick(systemLinks.audits, 'audits')}
                disabled={!systemLinks.audits || systemLinks.audits.trim() === ''}
              />
              
              <div className="pt-2 mt-2 border-t border-white/5">
                <button 
                  onClick={() => handleLinkClick(systemLinks.support, 'support')}
                  disabled={!systemLinks.support || systemLinks.support.trim() === ''}
                  className="w-full bg-[#FCD535] text-[#0B0E11] p-4 rounded-2xl flex items-center justify-between group active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-black/10 rounded-xl">
                      <Headset className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] font-black uppercase tracking-tight">联系在线客服</p>
                      <p className="text-[8px] font-bold opacity-60 uppercase tracking-widest">Support Center</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-40 group-hover:translate-x-1 transition-transform" />
                </button>
                <p className="text-[8px] text-center text-[#848E9C] font-bold uppercase tracking-widest mt-3 opacity-50 px-4 leading-tight">
                  7x24 智能节点客服为您服务
                </p>
              </div>
            </div>
          </div>
        )}
      </header>


      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-2 relative z-10">
        {renderView()}
      </main>

      {/* Bottom Nav */}
      <div className="fixed bottom-6 left-0 right-0 px-6 z-50">
        <nav className="max-w-[340px] mx-auto glass rounded-2xl p-2 flex justify-between items-center shadow-2xl border border-white/10">
          <NavButton active={activeTab === 'mining'} onClick={() => setActiveTab('mining')} icon={<Gift className="w-5 h-5" />} label={t('nav.mining') || 'Airdrop'} />
          <NavButton active={activeTab === 'asset'} onClick={() => setActiveTab('asset')} icon={<Wallet className="w-5 h-5" />} label={t('nav.asset') || 'Assets'} />
          <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<User className="w-5 h-5" />} label={t('nav.profile') || 'Me'} />
        </nav>
      </div>
    </div>
  );
};

const MenuLink = ({ icon, label, subLabel, onClick, disabled }: any) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-white/5 group transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <div className="flex items-center gap-3">
      <div className="p-2 bg-white/5 rounded-xl group-hover:bg-[#FCD535]/10 group-hover:text-[#FCD535] transition-colors">{icon}</div>
      <div className="text-left">
        <p className="text-[11px] font-black text-white/90 leading-none mb-1 uppercase tracking-tight">{label}</p>
        <p className="text-[8px] text-[#848E9C] font-bold uppercase tracking-tighter">{subLabel}</p>
      </div>
    </div>
    <ChevronRight className="w-3 h-3 text-white/10 group-hover:text-[#FCD535] transition-colors" />
  </button>
);

const NavButton = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all duration-300 ${active ? 'bg-[#FCD535] text-[#0B0E11] scale-105 shadow-xl shadow-[#FCD535]/20' : 'text-[#848E9C] hover:bg-white/5'}`}>
    {icon}
    <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default App;

