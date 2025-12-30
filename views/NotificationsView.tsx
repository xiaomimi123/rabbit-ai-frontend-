
import React, { useState } from 'react';
import { Bell, ChevronLeft, CheckCircle2, AlertTriangle, Gift, Clock, X, Inbox, Sparkles, ChevronRight } from 'lucide-react';
import { Notification } from '../types';
import { markNotificationAsRead, deleteNotification } from '../api';
import { useLanguage } from '../contexts/LanguageContext';

interface NotificationsViewProps {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  onBack: () => void;
  address?: string;
  onMarkAllAsRead?: () => void;
}

const NotificationsView: React.FC<NotificationsViewProps> = ({ notifications, setNotifications, onBack, address, onMarkAllAsRead }) => {
  const { t } = useLanguage();
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  
  const markAllAsRead = async () => {
    if (onMarkAllAsRead) {
      await onMarkAllAsRead();
    } else {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  const handleOpenNotif = async (notif: Notification) => {
    setSelectedNotif(notif);
    // 如果通知未读，标记为已读
    if (!notif.read && address) {
      try {
        await markNotificationAsRead(address, notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
        // 即使 API 失败，也更新本地状态
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      }
    }
  };

  const handleDeleteNotif = async (notif: Notification, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止触发点击事件
    if (!address) return;
    
    try {
      await deleteNotification(address, notif.id);
      // 从列表中移除
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
      // 如果删除的是当前打开的通知，关闭详情
      if (selectedNotif?.id === notif.id) {
        setSelectedNotif(null);
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const getTypeIcon = (type: string, size = "w-4 h-4") => {
    switch (type) {
      case 'SYSTEM': return <AlertTriangle className={`${size} text-blue-400`} />;
      case 'REWARD': return <Gift className={`${size} text-[#FCD535]`} />;
      case 'NETWORK': return <Inbox className={`${size} text-[#0ECB81]`} />;
      default: return <Bell className={`${size} text-[#848E9C]`} />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'SYSTEM': return t('notifications.systemNotification') || '系统通知';
      case 'REWARD': return t('notifications.rewardNotification') || '收益奖励';
      case 'NETWORK': return t('notifications.networkNotification') || '团队网络';
      default: return t('notifications.messageCenter') || '消息中心';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 min-h-[60vh]">
      {/* Header Area */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2.5 bg-white/5 rounded-2xl text-[#848E9C] hover:text-white transition-all active:scale-90">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="space-y-0.5">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">{t('notifications.notificationCenter') || '通知中心'}</h2>
            <p className="text-[9px] text-[#848E9C] font-bold uppercase tracking-widest">{t('notifications.inboxManagement') || 'Inbox Management'}</p>
          </div>
        </div>
        <button 
          onClick={markAllAsRead} 
          className="bg-white/5 px-4 py-2 rounded-xl text-[10px] font-black text-[#FCD535] uppercase tracking-widest hover:bg-[#FCD535]/10 transition-colors border border-white/5"
        >
          {t('notifications.markAllAsRead') || '全部已读'}
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-5">
           <div className="relative">
              <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full" />
              <div className="relative w-20 h-20 bg-white/[0.02] rounded-[2rem] flex items-center justify-center border border-white/5">
                <Bell className="w-10 h-10 text-[#848E9C] opacity-10" />
              </div>
           </div>
           <div className="space-y-1">
             <p className="text-xs text-[#848E9C] font-black uppercase tracking-[0.2em]">{t('notifications.noMessages') || '当前暂无消息'}</p>
             <p className="text-[9px] text-[#848E9C]/60 font-medium italic">{t('notifications.cleanInbox') || 'Your digital inbox is clean'}</p>
           </div>
        </div>
      ) : (
        <div className="space-y-3.5 pb-20">
          {notifications.sort((a, b) => b.timestamp - a.timestamp).map(notif => (
            <div 
              key={notif.id}
              onClick={() => handleOpenNotif(notif)}
              className={`relative group bg-[#1e2329]/40 border border-white/5 rounded-[1.75rem] p-5 transition-all active:scale-[0.97] cursor-pointer hover:border-[#FCD535]/20 ${!notif.read ? 'bg-gradient-to-r from-[#FCD535]/5 to-transparent' : 'opacity-60 grayscale-[0.2]'}`}
            >
              {/* Unread Indicator Bar */}
              {!notif.read && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#FCD535] rounded-r-full shadow-[0_0_10px_rgba(252,213,53,0.5)]" />
              )}

              <div className="flex items-start gap-4">
                <div className={`p-3.5 rounded-2xl border transition-all ${!notif.read ? 'bg-[#FCD535]/10 border-[#FCD535]/30 shadow-lg shadow-[#FCD535]/5' : 'bg-white/5 border-white/5'}`}>
                  {getTypeIcon(notif.type, "w-5 h-5")}
                </div>
                
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex justify-between items-start gap-2">
                    <p className={`text-xs font-black uppercase tracking-tight truncate ${!notif.read ? 'text-white' : 'text-[#848E9C]'}`}>
                      {notif.title}
                    </p>
                    <div className="flex items-center gap-1 text-[9px] text-[#848E9C] font-bold mono whitespace-nowrap">
                      {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <p className="text-[10px] text-[#848E9C] leading-relaxed font-medium line-clamp-2">
                    {notif.content}
                  </p>
                </div>
                
                <div className="self-center flex items-center gap-2">
                  <button
                    onClick={(e) => handleDeleteNotif(notif, e)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all opacity-0 group-hover:opacity-100"
                    title="删除通知"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-[#848E9C]/30 group-hover:text-[#FCD535] transition-colors" />
                </div>
              </div>

              {!notif.read && (
                 <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-[#FCD535] rounded-full animate-pulse" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* NOTIFICATION DETAIL MODAL */}
      {selectedNotif && (
        <div className="fixed inset-0 z-[250] flex items-end justify-center px-4 pb-10 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-[#1e2329] w-full max-w-sm rounded-[3rem] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)] animate-in slide-in-from-bottom-20 duration-500 overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="relative p-8 pb-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1.5 bg-white/5 rounded-b-full" />
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                    {getTypeIcon(selectedNotif.type, "w-6 h-6")}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-[#FCD535] font-black uppercase tracking-[0.2em]">{getTypeName(selectedNotif.type)}</p>
                    <div className="flex items-center gap-1.5 text-[9px] text-[#848E9C] font-bold uppercase tracking-widest">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(selectedNotif.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (address && selectedNotif) {
                        try {
                          await deleteNotification(address, selectedNotif.id);
                          setNotifications(prev => prev.filter(n => n.id !== selectedNotif.id));
                          setSelectedNotif(null);
                        } catch (error) {
                          console.error('Failed to delete notification:', error);
                        }
                      }
                    }}
                    className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-2xl transition-all"
                    title="删除通知"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setSelectedNotif(null)}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all"
                  >
                    <X className="w-5 h-5 text-[#848E9C]" />
                  </button>
                </div>
              </div>

              <h3 className="text-xl font-black text-white leading-tight mb-2 uppercase tracking-tight">
                {selectedNotif.title}
              </h3>
              <div className="w-12 h-1 bg-[#FCD535] rounded-full" />
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto px-8 pb-8 no-scrollbar">
              <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[2rem] relative group">
                <div className="absolute top-4 right-4 opacity-5 group-hover:opacity-10 transition-opacity">
                   <Sparkles className="w-12 h-12 text-white" />
                </div>
                <p className="text-[13px] text-white/80 leading-relaxed font-medium whitespace-pre-wrap">
                  {selectedNotif.content}
                </p>
                
                {/* Simulated Extra Info if it's a reward */}
                {selectedNotif.type === 'REWARD' && (
                  <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#0ECB81]" />
                        <span className="text-[10px] font-black text-[#0ECB81] uppercase tracking-widest">{t('notifications.transactionVerified') || 'Transaction Verified'}</span>
                     </div>
                     <button className="text-[10px] text-[#FCD535] font-black uppercase tracking-widest flex items-center gap-1">
                        {t('notifications.viewLog') || 'View Log'} <ChevronRight className="w-3 h-3" />
                     </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-8 bg-black/40 border-t border-white/5">
              <button 
                onClick={() => setSelectedNotif(null)}
                className="w-full bg-[#FCD535] text-[#0B0E11] font-black py-5 rounded-[1.5rem] text-xs uppercase tracking-[0.3em] shadow-xl shadow-[#FCD535]/10 active:scale-95 transition-all"
              >
                {t('notifications.closeMessage') || 'Close Message'}
              </button>
              <p className="text-[8px] text-center text-[#848E9C] font-bold uppercase tracking-[0.2em] mt-4 opacity-40 italic">Rabbit AI Secure Messaging Protocol v2.0</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsView;
