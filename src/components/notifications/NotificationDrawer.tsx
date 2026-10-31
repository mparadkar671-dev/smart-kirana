import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Package,
  BookOpen,
  Users,
  Wallet,
  Sparkles,
  ExternalLink,
  Check,
  Trash2,
} from 'lucide-react';
import { AppNotification, NotificationCategory } from '../../types';
import { notificationService } from '../../services/notificationService';
import { ActiveTab } from '../layout/Shell';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    notificationService.getNotifications()
  );
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | 'all'>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = notificationService.subscribe((list) => {
      setNotifications([...list]);
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const filtered = notifications.filter((n) => {
    if (selectedCategory === 'all') return true;
    return n.category === selectedCategory;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleApproveStaff = async (notif: AppNotification) => {
    const userId = notif.actionData?.userId as string;
    const email = notif.actionData?.email as string;
    if (!userId) return;

    setApprovingId(notif.id);
    const res = await notificationService.approveStaffMember(userId, email);
    setApprovingId(null);
    if (res.success) {
      setToastMsg(res.message);
      setTimeout(() => setToastMsg(null), 3500);
    }
  };

  const handleRejectStaff = async (notif: AppNotification) => {
    const userId = notif.actionData?.userId as string;
    if (!userId) return;

    if (confirm('Reject this staff member join request?')) {
      const res = await notificationService.rejectStaffMember(userId);
      if (res.success) {
        setToastMsg('Staff request rejected.');
        setTimeout(() => setToastMsg(null), 3000);
      }
    }
  };

  const handleActionClick = (notif: AppNotification) => {
    notificationService.markAsRead(notif.id);
    if (!notif.actionType) return;

    switch (notif.actionType) {
      case 'GO_TO_INVENTORY':
        onNavigateTab('inventory');
        onClose();
        break;
      case 'GO_TO_KHATA':
        onNavigateTab('khata');
        onClose();
        break;
      case 'GO_TO_GALLA':
        onNavigateTab('galla');
        onClose();
        break;
      case 'GO_TO_SETTINGS':
        onNavigateTab('settings');
        onClose();
        break;
      case 'APPROVE_STAFF':
        handleApproveStaff(notif);
        break;
    }
  };

  const getCategoryIcon = (category: NotificationCategory) => {
    switch (category) {
      case 'inventory':
        return <Package className="w-4 h-4 text-amber-500" />;
      case 'khata':
        return <BookOpen className="w-4 h-4 text-rose-500" />;
      case 'staff':
        return <Users className="w-4 h-4 text-blue-500" />;
      case 'galla':
        return <Wallet className="w-4 h-4 text-emerald-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-purple-500" />;
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const categoryCounts = {
    all: notifications.length,
    inventory: notifications.filter((n) => n.category === 'inventory').length,
    khata: notifications.filter((n) => n.category === 'khata').length,
    staff: notifications.filter((n) => n.category === 'staff').length,
    galla: notifications.filter((n) => n.category === 'galla').length,
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col z-10 transition-transform">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Store Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-500 text-white animate-pulse">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Live alerts for stock, udhar, staff approvals &amp; galla
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Action Bar */}
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <button
            onClick={() => notificationService.markAllAsRead()}
            disabled={unreadCount === 0}
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold disabled:opacity-40 disabled:no-underline"
          >
            ✓ Mark all as read
          </button>
          <button
            onClick={() => {
              if (confirm('Clear all store notifications?')) {
                notificationService.clearAll();
              }
            }}
            disabled={notifications.length === 0}
            className="text-slate-400 hover:text-rose-500 transition disabled:opacity-40 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear all
          </button>
        </div>

        {/* Filter Pills */}
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All', count: categoryCounts.all },
            { id: 'inventory', label: 'Stock', count: categoryCounts.inventory },
            { id: 'khata', label: 'Khata', count: categoryCounts.khata },
            { id: 'staff', label: 'Staff', count: categoryCounts.staff },
            { id: 'galla', label: 'Galla', count: categoryCounts.galla },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>{cat.label}</span>
              {cat.count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    selectedCategory === cat.id ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {cat.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Toast alert banner */}
        {toastMsg && (
          <div className="m-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center px-4 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800 dark:text-white">All Clear &amp; Up to Date!</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mt-1">
                  No active alerts for your store right now. Low stock, overdue khata, and staff requests will appear here automatically.
                </p>
              </div>
            </div>
          ) : (
            filtered.map((n) => {
              const isStaffApproval = n.type === 'STAFF_REQUEST';
              return (
                <div
                  key={n.id}
                  onClick={() => notificationService.markAsRead(n.id)}
                  className={`p-3.5 rounded-2xl border transition relative ${
                    n.isRead
                      ? 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800/60 opacity-85'
                      : 'bg-white dark:bg-slate-800 border-blue-500/30 dark:border-blue-500/40 shadow-xs'
                  }`}
                >
                  {/* Unread indicator dot */}
                  {!n.isRead && (
                    <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-blue-500" />
                  )}

                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700/60 shrink-0 mt-0.5">
                      {getCategoryIcon(n.category)}
                    </div>

                    <div className="flex-1 pr-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                          {n.title}
                        </h4>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {n.message}
                      </p>

                      <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400 font-medium">
                        <Clock className="w-3 h-3" />
                        <span>{formatRelativeTime(n.timestamp)}</span>
                        <span>•</span>
                        <span className="uppercase tracking-wider font-semibold text-[9px]">
                          {n.category}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="pt-2 flex flex-wrap gap-2">
                        {isStaffApproval ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApproveStaff(n);
                              }}
                              disabled={approvingId === n.id}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{approvingId === n.id ? 'Granting...' : 'Approve Access'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRejectStaff(n);
                              }}
                              className="px-2.5 py-1.5 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 text-xs font-semibold transition"
                            >
                              Reject
                            </button>
                          </>
                        ) : n.actionLabel ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActionClick(n);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95"
                          >
                            <span>{n.actionLabel}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            notificationService.dismiss(n.id);
                          }}
                          className="px-2 py-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs transition"
                          title="Dismiss"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

