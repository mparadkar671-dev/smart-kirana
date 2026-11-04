import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { Shell, ActiveTab } from './components/layout/Shell';
import { POSView } from './components/pos/POSView';
import { InventoryView } from './components/inventory/InventoryView';
import { KhataView } from './components/khata/KhataView';
import { GallaView } from './components/galla/GallaView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Sparkles, PlusCircle } from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, isOfflineGuest, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [isDbReady, setIsDbReady] = useState(false);

  // Initialize DB on mount
  useEffect(() => {
    let mounted = true;
    db.initializeDatabase().then(() => {
      if (mounted) setIsDbReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Keyboard navigation listener (Desktop Matrix)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing inside an input or textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'F1') {
        e.preventDefault();
        setActiveTab('pos');
      } else if (e.key === 'F9' && !isInput) {
        e.preventDefault();
        setActiveTab('khata');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Live queries from Dexie IndexedDB
  const products = useLiveQuery(() => db.products.toArray(), [], []);
  const customers = useLiveQuery(() => db.customers.toArray(), [], []);
  const shopProfile = useLiveQuery(() => db.getShopProfile(), []);

  if (!isDbReady || authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-lg font-bold">Initializing Smart Kirana POS...</h2>
        <p className="text-sm text-slate-400">Loading offline IndexedDB database &amp; inventory master</p>
      </div>
    );
  }

  // Standard Gateway: Start with Login & Registration Page unless already authenticated or in offline guest mode
  if (!user && !isOfflineGuest) {
    return <AuthPage />;
  }

  const isStoreFreshEmpty = products && products.length === 0;

  return (
    <Shell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      shopProfile={shopProfile}
    >
      {/* Onboarding Welcome Banner for brand new empty store */}
      {isStoreFreshEmpty && (activeTab === 'pos' || activeTab === 'inventory') && (
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 text-white p-3 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border-b border-blue-700 select-none">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500 rounded-lg text-white shrink-0">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">Welcome! Your Kirana Store is fresh and ready.</div>
              <div className="text-xs text-blue-200">
                Your inventory is currently empty. Tap &quot;+ Add Product&quot; to begin adding your store items.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('inventory')}
              className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" /> + Add Product
            </button>
          </div>
        </div>
      )}

      {activeTab === 'pos' && (
        <POSView
          products={products || []}
          customers={customers || []}
          shopProfile={shopProfile}
        />
      )}
      {activeTab === 'inventory' && (
        <InventoryView products={products || []} shopProfile={shopProfile} />
      )}
      {activeTab === 'khata' && (
        <KhataView customers={customers || []} shopProfile={shopProfile} />
      )}
      {activeTab === 'galla' && <GallaView />}
      {activeTab === 'reports' && <ReportsView shopProfile={shopProfile} />}
      {activeTab === 'settings' && <SettingsView />}
    </Shell>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <MainApp />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
