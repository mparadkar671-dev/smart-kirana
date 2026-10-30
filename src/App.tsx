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

export const App: React.FC = () => {
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

  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-lg font-bold">Initializing Smart Kirana POS...</h2>
        <p className="text-sm text-slate-400">Loading offline IndexedDB database & inventory master</p>
      </div>
    );
  }

  return (
    <Shell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      shopProfile={shopProfile}
    >
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

export default App;

