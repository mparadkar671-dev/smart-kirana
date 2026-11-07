import React, { useState, useEffect } from 'react';
import {
  Store,
  ShoppingCart,
  Package,
  BookOpen,
  Wallet,
  BarChart3,
  Settings,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Keyboard,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Users,
  Bell,
} from 'lucide-react';
import { ShopProfile, UserRole, BusinessType } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { AuthModal } from '../auth/AuthModal';
import { NotificationDrawer } from '../notifications/NotificationDrawer';
import { notificationService } from '../../services/notificationService';
import { cloudSyncService, CloudSyncStatus } from '../../services/cloudSyncService';
import { HomemadeFoodService, repairMixedBusinessProducts } from '../../services/homemadeFoodService';
import { KeyboardShortcutsModal } from '../common/KeyboardShortcutsModal';

export type ActiveTab = 'pos' | 'inventory' | 'khata' | 'galla' | 'reports' | 'settings';

interface ShellProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  shopProfile?: ShopProfile | null;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  activeTab,
  onTabChange,
  shopProfile,
  children,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user, userRole, isAuthenticated, isOfflineGuest, signOut } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(() => notificationService.getUnreadCount());
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() => cloudSyncService.getStatus());
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [isSwitchingBusiness, setIsSwitchingBusiness] = useState(false);

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);
      if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !isInput) {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  const currentBusinessType: BusinessType = shopProfile?.business_type || 'KIRANA_RETAIL';
  const isHomemadeFood = currentBusinessType === 'HOMEMADE_FOOD';

  const handleSwitchBusiness = async (targetType: BusinessType) => {
    if (targetType === currentBusinessType || isSwitchingBusiness) return;
    setIsSwitchingBusiness(true);
    try {
      await HomemadeFoodService.switchBusinessWorkspace(targetType, {
        seedCatalogIfEmpty: targetType === 'HOMEMADE_FOOD',
      });
      await repairMixedBusinessProducts();
      setSyncToast(
        targetType === 'HOMEMADE_FOOD'
          ? '🍲 Switched to Homemade Food / Gruh Udyog!'
          : '🏪 Switched to Kirana Retail Store!'
      );
      setTimeout(() => setSyncToast(null), 3000);
    } catch (e) {
      setSyncToast('Error switching business: ' + (e instanceof Error ? e.message : String(e)));
      setTimeout(() => setSyncToast(null), 3000);
    } finally {
      setIsSwitchingBusiness(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = cloudSyncService.subscribe((s) => {
      setSyncStatus(s);
    });

    const unsubscribeNotifs = notificationService.subscribe((list) => {
      setUnreadNotifsCount(list.filter((n) => !n.isRead).length);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      unsubscribeNotifs();
    };
  }, []);

  const handleManualSync = async () => {
    if (syncStatus.isSyncing) return;
    setSyncToast('Syncing with Supabase...');
    const res = await cloudSyncService.syncAllToCloud();
    if (res.success) {
      setSyncToast(`Synced ${res.pushedCount} records to cloud!`);
    } else {
      setSyncToast(`Sync completed with notice: ${res.errors[0] || 'Check logs'}`);
    }
    setTimeout(() => setSyncToast(null), 3000);
  };

  const shopName = shopProfile?.shop_name || 'Smart Kirana POS';

  const roleBadgeMap: Record<UserRole, { label: string; color: string }> = {
    OWNER: { label: '👑 Owner', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    MANAGER: { label: '👔 Manager', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
    ACCOUNTANT: { label: '📊 Munim', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
    CASHIER: { label: '⚡ Cashier', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  };

  const navItems = [
    { id: 'pos' as ActiveTab, label: 'POS Billing', icon: ShoppingCart, shortcut: 'F1' },
    { id: 'inventory' as ActiveTab, label: 'Inventory Master', icon: Package, shortcut: '' },
    { id: 'khata' as ActiveTab, label: 'Khata / Udhari', icon: BookOpen, shortcut: 'F9' },
    { id: 'galla' as ActiveTab, label: 'Galla & Expenses', icon: Wallet, shortcut: '' },
    { id: 'reports' as ActiveTab, label: 'Reports & P&L', icon: BarChart3, shortcut: '' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Desktop Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-slate-900 dark:bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0 z-30 select-none">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 overflow-hidden">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0 ${
                  isHomemadeFood
                    ? 'bg-gradient-to-br from-amber-500 to-orange-600 ring-2 ring-amber-400/40'
                    : 'bg-orange-600'
                }`}
              >
                {isHomemadeFood ? <span className="text-lg">🍲</span> : <Store className="w-6 h-6" />}
              </div>
              <div className="overflow-hidden">
                <h1 className="font-bold text-sm tracking-wide text-white truncate" title={shopName}>
                  {shopName}
                </h1>
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {syncStatus.isSyncing ? (
                    <button
                      onClick={handleManualSync}
                      title="Syncing across devices..."
                      className="flex items-center gap-1 text-blue-400 hover:underline"
                    >
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>Syncing...</span>
                    </button>
                  ) : isOnline ? (
                    <button
                      onClick={handleManualSync}
                      title="Click to sync bidirectional now"
                      className="flex items-center gap-1 text-emerald-400 hover:underline cursor-pointer"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Live Multi-Device Sync</span>
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>Offline Mode</span>
                    </span>
                  )}
                  <span
                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${
                      isHomemadeFood
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    }`}
                  >
                    {isHomemadeFood ? 'HMF' : 'KRN'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Header Buttons: Notifications & Theme */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsNotificationOpen(true)}
                aria-label="Store Notifications"
                title="Store Notifications"
                className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <Bell className="w-4 h-4 text-slate-300" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse ring-2 ring-slate-900" />
                )}
              </button>

              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-300" />}
              </button>
            </div>
          </div>

          {/* 1-Click Multi-Business Workspace Switcher */}
          <div className="pt-1">
            <label htmlFor="sidebar-business-switcher" className="sr-only">
              Switch Active Business Workspace
            </label>
            <select
              id="sidebar-business-switcher"
              data-testid="sidebar-business-switcher"
              value={currentBusinessType}
              disabled={isSwitchingBusiness}
              onChange={(e) => handleSwitchBusiness(e.target.value as BusinessType)}
              className={`w-full px-2.5 py-1.5 rounded-lg text-[11px] font-bold border outline-none cursor-pointer transition ${
                isHomemadeFood
                  ? 'bg-amber-950/60 border-amber-500/50 text-amber-200 hover:bg-amber-900/60'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
              }`}
            >
              <option value="KIRANA_RETAIL" className="bg-slate-900 text-white">
                🏪 Kirana Retail Store (INV / KRN)
              </option>
              <option value="HOMEMADE_FOOD" className="bg-slate-900 text-amber-300">
                🍲 Homemade Food / Gruh Udyog (HMF)
              </option>
            </select>
          </div>
        </div>

        {/* User Account & Role Pill */}
        <div className="px-3 pt-3 space-y-2">
          {isAuthenticated && user ? (
            <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-[11px] font-semibold text-white truncate">{user.email}</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${roleBadgeMap[userRole]?.color || 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                        {roleBadgeMap[userRole]?.label || userRole}
                      </span>
                      <span className="text-[9px] text-emerald-400 font-medium">Supabase</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => signOut()}
                  title="Sign Out"
                  className="p-1 text-slate-400 hover:text-red-400 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Cloud Sync Quick Button */}
              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncStatus.isSyncing}
                className="w-full py-1 px-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 text-[10px] text-slate-300 hover:text-white border border-slate-700/50 flex items-center justify-between transition disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5">
                  <RefreshCw className={`w-3 h-3 ${syncStatus.isSyncing ? 'animate-spin text-blue-400' : 'text-emerald-400'}`} />
                  <span>{syncStatus.isSyncing ? 'Syncing...' : 'Sync to Supabase'}</span>
                </div>
                <span className="text-[9px] text-slate-400 font-mono">
                  {syncStatus.lastSyncedAt
                    ? new Date(syncStatus.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '1-click'}
                </span>
              </button>
            </div>
          ) : isOfflineGuest ? (
            <div className="p-2.5 bg-slate-800/80 rounded-xl border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-7 h-7 rounded-lg bg-amber-600/30 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
                  <UserIcon className="w-4 h-4 text-amber-400" />
                </div>
                <div className="overflow-hidden">
                  <div className="text-[11px] font-semibold text-white truncate">Offline Counter</div>
                  <div className="text-[9px] text-amber-400 font-medium">Local Database Mode</div>
                </div>
              </div>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                title="Connect Cloud Account"
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-[10px] font-bold text-slate-200 rounded-lg transition"
              >
                Sign In
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full py-2 px-3 bg-blue-900/60 hover:bg-blue-900 border border-blue-700/60 text-blue-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Sign In / Cloud Account</span>
            </button>
          )}

          {/* Toast Notification */}
          {syncToast && (
            <div className="p-1.5 rounded-lg bg-blue-950/80 border border-blue-700/60 text-[10px] text-blue-200 flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate">{syncToast}</span>
            </div>
          )}
        </div>

        {/* Main Navigation Links */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-800 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-orange-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.shortcut && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-blue-900/80 text-orange-200' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Keyboard Shortcuts Hint & Settings */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="p-2.5 bg-slate-800/50 rounded-lg text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1 text-slate-300 font-semibold mb-1">
              <Keyboard className="w-3.5 h-3.5 text-orange-400" />
              <span>Counter Hotkeys</span>
            </div>
            <div className="flex justify-between"><span>Search Item:</span> <kbd className="text-orange-300 font-mono">F2 / /</kbd></div>
            <div className="flex justify-between"><span>Cash Checkout:</span> <kbd className="text-emerald-400 font-mono">F8</kbd></div>
            <div className="flex justify-between"><span>Udhari Modal:</span> <kbd className="text-amber-400 font-mono">F9</kbd></div>
            <div className="flex justify-between"><span>Switch Cart:</span> <kbd className="text-blue-300 font-mono">F4</kbd></div>
            <button
              type="button"
              onClick={() => setIsShortcutsModalOpen(true)}
              data-testid="view-all-shortcuts-btn"
              className="w-full mt-2 py-1 px-2 rounded-md bg-slate-700/60 hover:bg-slate-700 text-orange-300 hover:text-white text-[10px] font-bold flex items-center justify-center gap-1 transition"
            >
              <span>View All Shortcuts [?]</span>
            </button>
          </div>

          <button
            onClick={() => onTabChange('settings')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              activeTab === 'settings'
                ? 'bg-blue-800 text-white shadow-md'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5 text-slate-400" />
            <span>Settings &amp; Store</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header (< 1024px) */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shrink-0">
            <Store className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <h1 className="font-bold text-xs truncate max-w-[150px] sm:max-w-xs">{shopName}</h1>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
              {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5 text-amber-400" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
              {isAuthenticated && (
                <span className={`text-[8px] px-1 rounded border ${roleBadgeMap[userRole]?.color || ''}`}>
                  {userRole}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mobile Notifications Bell */}
          <button
            onClick={() => setIsNotificationOpen(true)}
            aria-label="Store Notifications"
            title="Store Notifications"
            className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ring-2 ring-slate-900" />
            )}
          </button>

          {/* Quick sync button */}
          <button
            onClick={handleManualSync}
            disabled={syncStatus.isSyncing}
            title="Sync Cloud"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-4 h-4 ${syncStatus.isSyncing ? 'animate-spin text-blue-400' : 'text-emerald-400'}`} />
          </button>

          {/* Mobile Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-300" />}
          </button>

          {/* Mobile Auth Button */}
          <button
            onClick={() => setIsAuthModalOpen(true)}
            aria-label="User Account"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <UserIcon className="w-4 h-4" />
          </button>

          <button
            onClick={() => onTabChange('settings')}
            aria-label="Settings"
            className={`p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition ${
              activeTab === 'settings' ? 'bg-blue-800 text-white' : ''
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main View Port Container */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-20 lg:pb-0 h-[calc(100vh-56px)] lg:h-screen bg-slate-100 dark:bg-slate-950 transition-colors">
        {children}
      </main>

      {/* Mobile Sticky Bottom Navigation Bar (< 1024px) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-around px-1 py-1 shadow-lg select-none"
        style={{ minHeight: '56px' }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-colors touch-target-stepper ${
                isActive ? 'text-blue-800 dark:text-orange-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <div
                className={`p-1 rounded-lg ${
                  isActive ? 'bg-blue-50 dark:bg-slate-800 text-blue-800 dark:text-orange-400' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] tracking-tight truncate max-w-[62px]">
                {item.id === 'pos' ? 'POS' : item.id === 'inventory' ? 'Stock' : item.id === 'khata' ? 'Khata' : item.id === 'galla' ? 'Galla' : 'Reports'}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* Store Notifications Drawer */}
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        onNavigateTab={(tab) => onTabChange(tab)}
      />

      {/* Keyboard Shortcuts Cheat Sheet */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
};
