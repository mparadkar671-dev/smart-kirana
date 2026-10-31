import React, { useState, useEffect } from 'react';
import { db } from '../../db/db';
import { ShopProfile, StoreUser, UserRole } from '../../types';
import { BackupService } from '../../services/backupService';
import { cloudSyncService, CloudSyncStatus } from '../../services/cloudSyncService';
import { useAuth } from '../../context/AuthContext';
import {
  supabase,
  createCustomSupabaseClient,
  getSupabaseCredentials,
  setSupabaseCredentials,
  normalizeSupabaseUrl,
  normalizeSupabaseKey,
} from '../../lib/supabase';
import { isSoundEnabled, setSoundEnabled } from '../../utils/sound';
import {
  Store,
  QrCode,
  Phone,
  MapPin,
  FileText,
  Trash2,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Download,
  Upload,
  Cloud,
  Database,
  Wifi,
  Volume2,
  VolumeX,
  Sparkles,
  RefreshCw,
  Users,
  ShieldCheck,
  Lock,
} from 'lucide-react';

interface SettingsViewProps {
  onDataReset?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onDataReset }) => {
  const { user, userRole, hasPermission } = useAuth();
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Supabase Settings (REQ-16) - Preloaded with environment or saved credentials
  const [supabaseUrl, setSupabaseUrl] = useState(() => getSupabaseCredentials().url);
  const [supabaseKey, setSupabaseKey] = useState(() => getSupabaseCredentials().key);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'CONFIGURED' | 'TESTING'>('IDLE');
  const [soundActive, setSoundActive] = useState(() => isSoundEnabled());

  // Cloud Sync live status
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>(() => cloudSyncService.getStatus());
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
    setStatusMsg({
      type: 'info',
      text: next ? 'POS Scanner audio beeps enabled.' : 'POS Scanner audio beeps muted.',
    });
  };

  useEffect(() => {
    db.getShopProfile().then((p) => setProfile(p));
    db.getStoreUsers().then((users) => setStoreUsers(users));

    const unsubscribe = cloudSyncService.subscribe((s) => {
      setCloudStatus(s);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await db.updateShopProfile(profile);
      await cloudSyncService.syncShopProfile(profile);

      setSaveSuccess(true);
      setStatusMsg({
        type: 'success',
        text: 'Shop profile & QR settings saved successfully to local and Supabase cloud!',
      });
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      console.error('Failed to save shop profile:', err);
      setStatusMsg({
        type: 'error',
        text: 'Error saving profile: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePushAllToCloud = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await cloudSyncService.syncAllToCloud();
      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: `All ${res.pushedCount} records (products, customers, bills, khata) uploaded to Supabase successfully!`,
        });
      } else {
        setStatusMsg({
          type: 'info',
          text: `Cloud sync finished with status: ${res.errors[0] || 'Check logs'}`,
        });
      }
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: 'Cloud sync failed: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handlePullAllFromCloud = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await cloudSyncService.pullAllFromCloud();
      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: `Pulled ${res.pulledCount} records from Supabase into local device!`,
        });
        db.getShopProfile().then((p) => setProfile(p));
        db.getStoreUsers().then((u) => setStoreUsers(u));
        if (onDataReset) onDataReset();
      } else {
        setStatusMsg({
          type: 'error',
          text: `Pull failed: ${res.errors[0] || 'Unknown error'}`,
        });
      }
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: 'Pull failed: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleTestSupabaseConnection = async () => {
    setSyncStatus('TESTING');
    setStatusMsg(null);

    const normUrl = normalizeSupabaseUrl(supabaseUrl);
    const normKey = normalizeSupabaseKey(supabaseKey);

    if (!normUrl || !normKey) {
      setSyncStatus('IDLE');
      setStatusMsg({
        type: 'error',
        text: 'Please enter a valid Supabase URL (e.g. https://xyz.supabase.co) and API key.',
      });
      return;
    }

    try {
      const client = createCustomSupabaseClient(normUrl, normKey);
      if (!client) {
        throw new Error('Could not create Supabase client with provided URL.');
      }

      const { error } = await client.from('shop_profile').select('id').limit(1);

      if (error && error.code !== 'PGRST116') {
        throw new Error(error.message);
      }

      setSyncStatus('CONFIGURED');
      setStatusMsg({
        type: 'success',
        text: 'Supabase connection verified successfully! Schema tables are online.',
      });
    } catch (err: unknown) {
      setSyncStatus('IDLE');
      setStatusMsg({
        type: 'error',
        text: 'Supabase connection failed: ' + (err instanceof Error ? err.message : String(err)),
      });
    }
  };

  const handleSaveSupabaseConfig = () => {
    const normUrl = normalizeSupabaseUrl(supabaseUrl);
    const normKey = normalizeSupabaseKey(supabaseKey);

    setSupabaseCredentials(normUrl, normKey);
    setStatusMsg({
      type: 'success',
      text: 'Supabase credentials saved! Browser is configured for auto cloud sync.',
    });
  };

  const handleSeedDemoProducts = async () => {
    if (confirm('Load 25 standard Indian Kirana demo products into your database?')) {
      try {
        await db.seedDemoProducts();
        await cloudSyncService.syncAllToCloud();
        setStatusMsg({
          type: 'success',
          text: '25 sample Kirana products loaded and synced with Supabase!',
        });
        if (onDataReset) onDataReset();
      } catch (e: unknown) {
        setStatusMsg({
          type: 'error',
          text: 'Failed to seed demo products: ' + (e instanceof Error ? e.message : String(e)),
        });
      }
    }
  };

  const handleClearTransactions = async () => {
    if (
      confirm(
        'Are you sure you want to clear all sales invoices, khata transactions, and daily galla records? Products and inventory master will remain intact.'
      )
    ) {
      try {
        await db.clearTransactionalData();
        setStatusMsg({
          type: 'info',
          text: 'Sales and khata transactions cleared. Inventory catalog preserved.',
        });
        if (onDataReset) onDataReset();
      } catch (e: unknown) {
        setStatusMsg({
          type: 'error',
          text: 'Failed to clear transactions: ' + (e instanceof Error ? e.message : String(e)),
        });
      }
    }
  };

  const handleClearAllToEmpty = async () => {
    if (
      confirm(
        '⚠️ DANGER: Completely wipe ALL products, customers, and transactions to start with a 100% EMPTY database? This cannot be undone.'
      )
    ) {
      try {
        await db.clearAllRecordsToEmpty();
        setStatusMsg({
          type: 'info',
          text: 'All products and records wiped! Store is now 100% clean and empty.',
        });
        if (onDataReset) onDataReset();
      } catch (e: unknown) {
        setStatusMsg({
          type: 'error',
          text: 'Failed to wipe database: ' + (e instanceof Error ? e.message : String(e)),
        });
      }
    }
  };

  const handleResetToDemo = async () => {
    if (confirm('Reset entire database to default initial state (25 products + initial demo customers)?')) {
      try {
        await db.resetToDemoState();
        const p = await db.getShopProfile();
        setProfile(p);
        setStatusMsg({
          type: 'success',
          text: 'Database successfully reset to demo state.',
        });
        if (onDataReset) onDataReset();
      } catch (e: unknown) {
        setStatusMsg({
          type: 'error',
          text: 'Failed to reset demo state: ' + (e instanceof Error ? e.message : String(e)),
        });
      }
    }
  };

  const handleExportBackup = async () => {
    try {
      await BackupService.exportToFile();
      setStatusMsg({
        type: 'success',
        text: 'Encrypted JSON backup file downloaded successfully.',
      });
    } catch (e: unknown) {
      setStatusMsg({
        type: 'error',
        text: 'Backup export failed: ' + (e instanceof Error ? e.message : String(e)),
      });
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (confirm(`Restore database from file "${file.name}"? This will replace your current data.`)) {
      try {
        const res = await BackupService.importFromFile(file);
        setStatusMsg({
          type: 'success',
          text: `Database restored successfully! Imported ${res.recordCounts.products} products, ${res.recordCounts.customers} customers.`,
        });
        const p = await db.getShopProfile();
        setProfile(p);
        await cloudSyncService.syncAllToCloud();
        if (onDataReset) onDataReset();
      } catch (err: unknown) {
        setStatusMsg({
          type: 'error',
          text: 'Restore failed: ' + (err instanceof Error ? err.message : String(err)),
        });
      }
    }
    e.target.value = '';
  };

  if (!profile) {
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

  const roleBadgeMap: Record<UserRole, { label: string; desc: string }> = {
    OWNER: { label: '👑 Store Owner (Admin)', desc: 'Full administrative access: billing, inventory, khata, financials & factory wipe.' },
    MANAGER: { label: '👔 Store Manager', desc: 'Daily store operations: counter billing, inventory restock & customer khata.' },
    ACCOUNTANT: { label: '📊 Store Accountant / Munim', desc: 'Financial reports, P&L, balance sheets, customer ledger & galla audit.' },
    CASHIER: { label: '⚡ Fast Counter Cashier', desc: 'POS billing, barcode scanning, holding carts & receipt generation.' },
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Store className="w-6 h-6 text-orange-600" />
          Shop Profile &amp; Cloud Sync Configuration
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage store details, UPI QR VPA, staff roles, JSON disaster backups, and Supabase cloud sync
        </p>
      </div>

      {/* Notifications */}
      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2 font-medium transition-all ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
              : statusMsg.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
          }`}
        >
          {statusMsg.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
          {statusMsg.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />}
          {statusMsg.type === 'info' && <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Role & Staff Account Overview Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Active User &amp; Store Role
          </h2>
          <span className="text-xs bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold px-2.5 py-0.5 rounded-full">
            {roleBadgeMap[userRole]?.label || userRole}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Signed-In Account</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
              {user?.email || 'Counter Guest (Local Mode)'}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {roleBadgeMap[userRole]?.desc}
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Registered Store Staff</div>
            <div className="text-xs text-slate-700 dark:text-slate-300">
              {storeUsers.length > 0 ? (
                <div className="space-y-1 mt-1">
                  {storeUsers.map((u) => (
                    <div key={u.id} className="flex justify-between items-center text-[11px]">
                      <span className="font-medium truncate max-w-[150px]">{u.full_name || u.email}</span>
                      <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[9px] font-bold">{u.role}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="italic text-slate-400">1 account active (You)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 1. Shop Identity Form */}
      <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 space-y-4 transition-colors">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <Store className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Shop Identity &amp; Contact
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
              Shop Name (Appears on Bills &amp; WhatsApp)
            </label>
            <input
              type="text"
              required
              value={profile.shop_name}
              onChange={(e) => setProfile({ ...profile, shop_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
              Owner Name
            </label>
            <input
              type="text"
              required
              value={profile.owner_name}
              onChange={(e) => setProfile({ ...profile, owner_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" />
              Owner Phone Number (10 Digits)
            </label>
            <input
              type="tel"
              required
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5" />
              Shop UPI ID / VPA (For Dynamic QR Codes)
            </label>
            <input
              type="text"
              required
              value={profile.upi_vpa}
              onChange={(e) => setProfile({ ...profile, upi_vpa: e.target.value })}
              placeholder="e.g. 9876543210@upi or store@oksbi"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            Shop Address &amp; Landmark
          </label>
          <input
            type="text"
            value={profile.address}
            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            Invoice &amp; PDF Footer Note / GST (Optional)
          </label>
          <textarea
            rows={2}
            value={profile.gst_footer_note}
            onChange={(e) => setProfile({ ...profile, gst_footer_note: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md transition active:scale-98 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : saveSuccess ? '✓ Saved!' : 'Save Shop Settings'}
          </button>
        </div>
      </form>

      {/* Supabase Cloud Live Bi-Directional Sync Operations */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Supabase Live Database Synchronization
          </h2>
          <span className="text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold px-2 py-0.5 rounded-full">
            Realtime Mirroring
          </span>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Ensure all changes (products, customers, invoices, khata ledger, galla cash drawers, store users) reflect directly in your Supabase PostgreSQL cloud tables.
        </p>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${cloudStatus.status === 'synced' ? 'bg-emerald-500' : cloudStatus.isSyncing ? 'bg-blue-500 animate-spin' : 'bg-amber-500'}`}></span>
              <span>Sync State: {cloudStatus.message}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Last synced: {cloudStatus.lastSyncedAt ? new Date(cloudStatus.lastSyncedAt).toLocaleString() : 'Never'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={handlePushAllToCloud}
            disabled={isSyncingCloud}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isSyncingCloud ? 'Syncing...' : 'Push All Tables to Supabase Cloud'}
          </button>

          <button
            type="button"
            onClick={handlePullAllFromCloud}
            disabled={isSyncingCloud}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isSyncingCloud ? 'Pulling...' : 'Pull Cloud Records into Device'}
          </button>
        </div>
      </div>

      {/* Supabase Connection Credentials */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Supabase Connection Credentials
          </h2>
          <span className="text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold px-2 py-0.5 rounded-full">
            Free PostgreSQL Tier
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xyz.supabase.co"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
              Supabase Anon / Public API Key
            </label>
            <input
              type="password"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsIn..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleTestSupabaseConnection}
            disabled={syncStatus === 'TESTING'}
            className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition disabled:opacity-50"
          >
            {syncStatus === 'TESTING' ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            type="button"
            onClick={handleSaveSupabaseConfig}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition"
          >
            Save Cloud Sync Credentials
          </button>
        </div>
      </div>

      {/* Local JSON Backup & Restore */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 space-y-4 transition-colors">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Local Database JSON Backup &amp; Restore (REQ-16)
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Export your entire shop data (all 9 tables) into a single encrypted JSON file for safekeeping on Google Drive or your computer.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={handleExportBackup}
            className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition"
          >
            <Download className="w-4 h-4" />
            Download Full Store Backup (JSON)
          </button>

          <label className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition">
            <Upload className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            Restore From JSON Backup File
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Counter Audio & Hardware Beeps */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 space-y-3 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {soundActive ? (
              <Volume2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            ) : (
              <VolumeX className="w-5 h-5 text-slate-400" />
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">POS Scanner Audio &amp; Chime Beeps</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Play an instant audio confirmation beep on barcode scans and bill checkouts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleSound}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              soundActive
                ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {soundActive ? 'Sound: ON' : 'Sound: MUTED'}
          </button>
        </div>
      </div>

      {/* Database Management & Store Reset */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            Database Management &amp; Store Reset
          </h2>
          {!hasPermission('DATA_WIPE') && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold">
              <Lock className="w-3.5 h-3.5" /> Restricted (Owner Only)
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={handleSeedDemoProducts}
            className="px-4 py-2.5 border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-900 dark:text-blue-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Load 25 Sample Kirana Demo Products
          </button>

          <button
            type="button"
            onClick={handleClearTransactions}
            disabled={!hasPermission('DATA_WIPE')}
            className="px-4 py-2.5 border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-900 dark:text-amber-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            Clear Sales &amp; Transactions (Keep Products)
          </button>

          <button
            type="button"
            onClick={handleClearAllToEmpty}
            disabled={!hasPermission('DATA_WIPE')}
            className="px-4 py-2.5 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-900 dark:text-red-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
            ⚠️ Wipe All Records (100% Empty Fresh Store)
          </button>

          <button
            type="button"
            onClick={handleResetToDemo}
            disabled={!hasPermission('DATA_WIPE')}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            Full Demo Reset (25 Products + Demo Customers)
          </button>
        </div>
      </div>
    </div>
  );
};
