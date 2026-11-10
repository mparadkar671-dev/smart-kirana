import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, kiranaDb, getActiveDb } from './db/db';
import { BusinessType } from './types';
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
import { Sparkles, PlusCircle, CloudDownload } from 'lucide-react';
import {
  MAHARASHTRA_105_KIRANA_CATALOG,
  MAHARASHTRA_170_KIRANA_CATALOG,
  bulkImportKiranaProducts,
} from './services/csvCatalogImporter';
import { cloudSyncService } from './services/cloudSyncService';
import { filterProductsForBusiness, getBaseKiranaShopId } from './utils/businessFirewall';
import { getActiveShopId, getActiveBusinessType } from './services/tenantManager';

const MainApp: React.FC = () => {
  const { user, isOfflineGuest, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [isDbReady, setIsDbReady] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  // Initialize DB on mount and auto-populate the 170 Marathi/English catalog if empty in browser
  useEffect(() => {
    let mounted = true;
    const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

    db.initializeDatabase().then(async () => {
      if (!isTestEnv) {
        // Automatically pull from cloud on startup so products added directly in Supabase or across devices are visible immediately
        await cloudSyncService.pullAllFromCloud().catch((err) => {
          console.warn('Initial cloud pull failed (offline or network):', err);
        });

        const allProds = await db.products.toArray();
        if (allProds.length < 169) {
          await bulkImportKiranaProducts(MAHARASHTRA_170_KIRANA_CATALOG);
        }
      }
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
        return;
      }

      if (e.key === 'F9' && !isInput && activeTab !== 'pos') {
        e.preventDefault();
        setActiveTab('khata');
        return;
      }

      // Universal Esc Hierarchy navigation:
      // If on another screen with no modal open, Esc returns to POS Billing
      if (e.key === 'Escape' && activeTab !== 'pos') {
        const hasOpenModal = document.querySelector('[role="dialog"], [aria-modal="true"]');
        if (!hasOpenModal) {
          e.preventDefault();
          setActiveTab('pos');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  const shopProfile = useLiveQuery(() => db.getShopProfile(), []);
  const activeBusinessType: BusinessType =
    (shopProfile?.business_type === 'HOMEMADE_FOOD' && typeof localStorage !== 'undefined' && localStorage.getItem('kirana_active_business_type') === 'HOMEMADE_FOOD')
      ? 'HOMEMADE_FOOD'
      : 'KIRANA_RETAIL';
  const activeShopId: string =
    (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null) ||
    shopProfile?.shop_id ||
    shopProfile?.id ||
    'current_shop';

  // Start parallel multi-device live synchronization (Realtime WebSockets + Cross-tab + Heartbeat)
  useEffect(() => {
    if (!isDbReady || !activeShopId) return;
    const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
    if (isTestEnv) return;

    const stopLiveSync = cloudSyncService.startParallelLiveSync(activeShopId);
    return () => {
      stopLiveSync();
    };
  }, [isDbReady, activeShopId]);

  // Live queries directly tracking active database for 100% instant reactivity
  const products = useLiveQuery(
    async () => {
      const active = getActiveDb(activeBusinessType);
      const all = await active.products.toArray();
      const filtered = filterProductsForBusiness(all, activeBusinessType, activeShopId);
      if (filtered.length === 0 && all.length > 0 && activeBusinessType === 'KIRANA_RETAIL') {
        return all;
      }
      return filtered;
    },
    [activeBusinessType, activeShopId],
    []
  );

  const customers = useLiveQuery(
    async () => {
      const active = getActiveDb(activeBusinessType);
      const all = await active.customers.toArray();
      return all.filter((c) => {
        if (c.id === '0000-WALK-IN') return true;
        if (c.shop_id && activeShopId) {
          return (
            c.shop_id === activeShopId ||
            c.shop_id === 'current_shop' ||
            activeShopId === 'current_shop' ||
            getBaseKiranaShopId(c.shop_id) === getBaseKiranaShopId(activeShopId)
          );
        }
        return true;
      });
    },
    [activeBusinessType, activeShopId],
    []
  );

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
            <div className="p-2 rounded-lg text-white shrink-0 bg-orange-500">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">
                Welcome! Your Kirana Store is fresh and ready.
              </div>
              <div className="text-xs text-blue-200">
                Your inventory is currently empty. Tap "+ Add Product" to begin adding your store items.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                setIsRecovering(true);
                try {
                  await bulkImportKiranaProducts(MAHARASHTRA_170_KIRANA_CATALOG);
                } finally {
                  setIsRecovering(false);
                }
              }}
              disabled={isRecovering}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isRecovering ? 'Restoring...' : '⚡ 1-Click Load 170 Marathi/English Products'}
            </button>
            <button
              onClick={async () => {
                setIsRecovering(true);
                try {
                  const res = await cloudSyncService.restoreProductsFromCloudOrArchive();
                  if (res.restoredCount === 0) {
                    await bulkImportKiranaProducts(MAHARASHTRA_170_KIRANA_CATALOG);
                  }
                } finally {
                  setIsRecovering(false);
                }
              }}
              disabled={isRecovering}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              {isRecovering ? 'Restoring...' : '☁️ Cloud Restore'}
            </button>
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
      {activeTab === 'galla' && <GallaView shopProfile={shopProfile} />}
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
