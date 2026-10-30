import React from 'react';
import {
  ShoppingCart,
  Package,
  BookOpen,
  Wallet,
  BarChart3,
  Settings,
  Store,
  Wifi,
  Keyboard,
} from 'lucide-react';
import { ShopProfile } from '../../types';

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
  const shopName = shopProfile?.shop_name || 'Smart Kirana POS';

  const navItems = [
    { id: 'pos' as ActiveTab, label: 'POS Billing', icon: ShoppingCart, shortcut: 'F1' },
    { id: 'inventory' as ActiveTab, label: 'Inventory Master', icon: Package, shortcut: '' },
    { id: 'khata' as ActiveTab, label: 'Khata / Udhari', icon: BookOpen, shortcut: 'F9' },
    { id: 'galla' as ActiveTab, label: 'Galla & Expenses', icon: Wallet, shortcut: '' },
    { id: 'reports' as ActiveTab, label: 'Reports & P&L', icon: BarChart3, shortcut: '' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-100 text-slate-900">
      {/* Desktop Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-slate-900 text-slate-100 border-r border-slate-800 shrink-0 z-30 select-none">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md">
            <Store className="w-6 h-6" />
          </div>
          <div className="overflow-hidden">
            <h1 className="font-bold text-sm tracking-wide text-white truncate" title={shopName}>
              {shopName}
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Local Offline Ready</span>
            </div>
          </div>
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
            <span>Settings & Store</span>
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
            <h1 className="font-bold text-xs truncate max-w-[190px] sm:max-w-xs">{shopName}</h1>
            <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <Wifi className="w-2.5 h-2.5" />
              <span>Offline Ready</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => onTabChange('settings')}
          aria-label="Settings"
          className={`p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition ${
            activeTab === 'settings' ? 'bg-blue-800 text-white' : ''
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* Main View Port Container */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-20 lg:pb-0 h-[calc(100vh-56px)] lg:h-screen">
        {children}
      </main>

      {/* Mobile Sticky Bottom Navigation Bar (< 1024px) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 flex items-center justify-around px-1 py-1 shadow-lg select-none"
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
                isActive ? 'text-blue-800 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`p-1 rounded-lg ${
                  isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-500'
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
    </div>
  );
};

