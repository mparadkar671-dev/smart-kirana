import React, { useState, useEffect } from 'react';
import { db } from '../../db/db';
import { ShopProfile, StoreUser, UserRole } from '../../types';
import { BackupService } from '../../services/backupService';
import { cloudSyncService, CloudSyncStatus } from '../../services/cloudSyncService';
import { authService } from '../../services/authService';
import { notificationService } from '../../services/notificationService';
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
  UserPlus,
  Check,
  X,
  Clock,
  Building2,
  Copy,
  ShieldAlert,
  ChevronDown,
  KeyRound,
  FlaskConical,
} from 'lucide-react';
import { generateInviteCode } from '../../db/db';

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
  const [copiedCode, setCopiedCode] = useState(false);
  const [realSalesCount, setRealSalesCount] = useState(0);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('CASHIER');
  const [staffActionLoading, setStaffActionLoading] = useState<string | null>(null);

  // Security & Danger Vault State (Iteration 6)
  const [isDangerVaultOpen, setIsDangerVaultOpen] = useState(false);
  const [pendingDangerAction, setPendingDangerAction] = useState<
    'CLEAR_TRANSACTIONS' | 'WIPE_EMPTY' | 'RESET_DEMO' | null
  >(null);
  const [dangerPin, setDangerPin] = useState('');
  const [dangerConfirmText, setDangerConfirmText] = useState('');
  const [isExecutingDangerAction, setIsExecutingDangerAction] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);
  const [showDemoTools, setShowDemoTools] = useState(false);

  const refreshStaffList = async () => {
    try {
      const users = await authService.getAllStaff();
      setStoreUsers(users);
    } catch {
      const local = await db.getStoreUsers();
      setStoreUsers(local);
    }
  };

  const handleApproveStaff = async (id: string) => {
    setStaffActionLoading(id);
    try {
      await authService.setStaffStatus(id, true);
      await notificationService.refreshNotifications();
      await refreshStaffList();
      setStatusMsg({ type: 'success', text: 'Staff access permission approved successfully!' });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Failed to approve staff: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setStaffActionLoading(null);
    }
  };

  const handleToggleStaffActive = async (id: string, currentActive: boolean) => {
    setStaffActionLoading(id);
    try {
      await authService.setStaffStatus(id, !currentActive);
      await refreshStaffList();
      setStatusMsg({
        type: 'info',
        text: !currentActive ? 'Staff account activated.' : 'Staff access suspended.',
      });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Failed updating staff status.' });
    } finally {
      setStaffActionLoading(null);
    }
  };

  const handleRoleChange = async (id: string, newRole: UserRole) => {
    try {
      await authService.updateStaffRole(id, newRole);
      await refreshStaffList();
      setStatusMsg({ type: 'success', text: `Role updated to ${newRole}.` });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Failed to update role.' });
    }
  };

  const handleDeleteStaff = async (id: string, name: string) => {
    if (confirm(`Remove staff member "${name}" from this store?`)) {
      try {
        await authService.deleteStaffMember(id);
        await refreshStaffList();
        setStatusMsg({ type: 'info', text: 'Staff member removed from store.' });
      } catch (err: unknown) {
        setStatusMsg({ type: 'error', text: 'Failed to remove staff.' });
      }
    }
  };

  const handleAddStaffMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail.trim()) return;

    try {
      const newStaff: StoreUser = {
        id: `usr-${Date.now()}`,
        email: newStaffEmail.trim(),
        full_name: newStaffName.trim() || newStaffEmail.split('@')[0],
        phone: newStaffPhone.trim() || undefined,
        role: newStaffRole,
        shop_id: profile?.id || 'current_shop',
        is_active: true, // Owner pre-approved
        approval_status: 'APPROVED',
        created_at: new Date().toISOString(),
      };
      await db.saveStoreUser(newStaff);
      if (supabase) {
        await supabase.from('store_users').upsert(newStaff);
      }
      await refreshStaffList();
      setShowAddStaffModal(false);
      setNewStaffEmail('');
      setNewStaffName('');
      setNewStaffPhone('');
      setStatusMsg({ type: 'success', text: `Pre-approved ${newStaff.full_name} as ${newStaff.role}!` });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Failed to add staff: ' + (err instanceof Error ? err.message : String(err)) });
    }
  };

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
    setStatusMsg({
      type: 'info',
      text: next ? 'POS Scanner audio beeps enabled.' : 'POS Scanner audio beeps muted.',
    });
  };

  const refreshRealSalesCount = async () => {
    try {
      const count = await db.getRealSalesCount();
      setRealSalesCount(count);
    } catch {
      setRealSalesCount(0);
    }
  };

  useEffect(() => {
    db.getShopProfile().then(async (p) => {
      if (p && !p.invite_code) {
        const withCode = { ...p, invite_code: generateInviteCode() };
        await db.updateShopProfile(withCode);
        setProfile(withCode);
      } else {
        setProfile(p);
      }
    });
    refreshStaffList();
    refreshRealSalesCount();

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

  const handleExecuteDangerAction = async () => {
    if (!pendingDangerAction) return;

    if (!hasPermission('DATA_WIPE')) {
      setDangerError('Restricted: Only Store Owner can execute destructive database operations.');
      return;
    }

    if (dangerPin !== '1234' && (!profile?.phone || dangerPin !== profile.phone.slice(-4))) {
      setDangerError('Invalid Security PIN. Please enter correct Owner PIN (default: 1234).');
      return;
    }

    if (dangerConfirmText.trim().toUpperCase() !== 'CONFIRM') {
      setDangerError('You must type exact keyword "CONFIRM" to authorize.');
      return;
    }

    setIsExecutingDangerAction(true);
    setDangerError(null);

    try {
      // 1. Automatic Emergency JSON Backup Download Immediately BEFORE Wipe (REQ: Iteration 6)
      await BackupService.downloadJsonBackup();

      // 2. Perform Selected Destructive Action with atomic remote Supabase wipe & outbox cleanup
      if (pendingDangerAction === 'CLEAR_TRANSACTIONS') {
        await cloudSyncService.executeStoreVaultReset('CLEAR_TRANSACTIONS_KEEP_PRODUCTS', true);
        await db.clearTransactionalData();
        await db.sync_outbox.clear();
        await refreshRealSalesCount();
        setStatusMsg({
          type: 'info',
          text: 'Emergency JSON backup downloaded. Sales & khata transactions permanently cleared in local Dexie & Supabase. Catalog preserved.',
        });
      } else if (pendingDangerAction === 'WIPE_EMPTY') {
        await cloudSyncService.executeStoreVaultReset('WIPE_ALL_FRESH_STORE', true);
        await db.clearAllRecordsToEmpty();
        await db.sync_outbox.clear();
        await refreshRealSalesCount();
        setStatusMsg({
          type: 'info',
          text: 'Emergency JSON backup downloaded. All products, customers & transactions wiped from local Dexie & Supabase! Store is 100% clean and empty.',
        });
      } else if (pendingDangerAction === 'RESET_DEMO') {
        await cloudSyncService.executeStoreVaultReset('WIPE_ALL_FRESH_STORE', true);
        await db.clearAllRecordsToEmpty();
        await db.sync_outbox.clear();
        await db.resetToDemoState();
        await cloudSyncService.syncAllToCloud();
        await refreshRealSalesCount();
        const p = await db.getShopProfile();
        setProfile(p);
        setStatusMsg({
          type: 'success',
          text: 'Emergency JSON backup downloaded. Database successfully reset to 25 demo products and synchronized with Supabase.',
        });
      }

      setPendingDangerAction(null);
      setDangerPin('');
      setDangerConfirmText('');
      if (onDataReset) onDataReset();
    } catch (e: unknown) {
      setDangerError('Wipe operation failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsExecutingDangerAction(false);
    }
  };

  const handleClearTransactions = async () => {
    setIsDangerVaultOpen(true);
    setPendingDangerAction('CLEAR_TRANSACTIONS');
    setDangerError(null);
  };

  const handleClearAllToEmpty = async () => {
    setIsDangerVaultOpen(true);
    setPendingDangerAction('WIPE_EMPTY');
    setDangerError(null);
  };

  const handleResetToDemo = async () => {
    setIsDangerVaultOpen(true);
    setPendingDangerAction('RESET_DEMO');
    setDangerError(null);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span>Store Staff &amp; Role Permissions</span>
                <span className="text-xs bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold px-2 py-0.5 rounded-full">
                  {roleBadgeMap[userRole]?.label || userRole}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grant or revoke access for Managers, Accountants, and Cashiers for your store
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddStaffModal(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 shrink-0 self-start sm:self-auto"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Add / Pre-Approve Staff</span>
          </button>
        </div>

        {/* Current Signed-in User Pill */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Device Session</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {user?.email || 'Counter Guest Mode (Offline)'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {roleBadgeMap[userRole]?.desc}
            </p>
          </div>
          <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Signed In
          </span>
        </div>

        {/* Staff Table / List */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-1">
            <span>REGISTERED STORE TEAM ({storeUsers.length})</span>
            <button
              type="button"
              onClick={refreshStaffList}
              className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 text-[11px]"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {storeUsers.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-400">
              No staff members registered yet. Share your store name <strong>"{profile?.shop_name}"</strong> with your staff to let them register or tap "+ Add / Pre-Approve Staff".
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {storeUsers.map((u) => {
                const isPending = u.is_active === false || u.approval_status === 'PENDING';
                const isCurrent = u.email === user?.email;
                return (
                  <div
                    key={u.id}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                      isPending
                        ? 'bg-amber-500/5 dark:bg-amber-500/10'
                        : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 font-bold shrink-0 mt-0.5">
                        {u.role === 'OWNER' ? '👑' : u.role === 'MANAGER' ? '👔' : u.role === 'ACCOUNTANT' ? '📊' : '⚡'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {u.full_name || 'Staff Member'}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded font-semibold">
                              You
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                              isPending
                                ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                            }`}
                          >
                            {isPending ? '⏳ Awaiting Approval' : '✓ Permitted'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {u.email} {u.phone ? `• 📞 ${u.phone}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Role selector and Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                      {/* Role Switcher */}
                      {u.role !== 'OWNER' && userRole === 'OWNER' ? (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white font-semibold outline-none cursor-pointer"
                        >
                          <option value="MANAGER">👔 Manager</option>
                          <option value="ACCOUNTANT">📊 Accountant</option>
                          <option value="CASHIER">⚡ Cashier</option>
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                          {u.role}
                        </span>
                      )}

                      {/* Approval / Toggle Actions (Owner only) */}
                      {userRole === 'OWNER' && !isCurrent && (
                        <>
                          {isPending ? (
                            <button
                              type="button"
                              onClick={() => handleApproveStaff(u.id)}
                              disabled={staffActionLoading === u.id}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{staffActionLoading === u.id ? 'Approving...' : 'Approve'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleStaffActive(u.id, u.is_active)}
                              disabled={staffActionLoading === u.id}
                              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 transition"
                            >
                              {u.is_active ? 'Suspend' : 'Activate'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteStaff(u.id, u.full_name || u.email)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            title="Remove staff"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Pre-Approve / Add Staff */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Add Store Staff Member</h3>
              </div>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStaffMember} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Staff Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="cashier@example.com"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="Amit Verma"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Phone (WhatsApp)
                </label>
                <input
                  type="tel"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Assigned Store Role *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'MANAGER', label: '👔 Manager', desc: 'Stock & supervisor' },
                    { id: 'ACCOUNTANT', label: '📊 Accountant', desc: 'Audit & books' },
                    { id: 'CASHIER', label: '⚡ Cashier', desc: 'Counter billing' },
                  ].map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setNewStaffRole(r.id as UserRole)}
                      className={`p-2 rounded-xl border text-center transition ${
                        newStaffRole === r.id
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-bold">{r.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span>
                  This staff member will be pre-approved. When they sign up with <strong>{newStaffEmail || 'this email'}</strong> and select "{profile?.shop_name}", they will be automatically granted access.
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition active:scale-95"
                >
                  Confirm &amp; Add Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Private 6-Digit Store Invite Code (REQ: Iteration 1 - Visible only to Store Owner) */}
      {userRole === 'OWNER' && profile && (
        <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 rounded-2xl border border-indigo-500/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Store Invite Code
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-600 text-white">
                Owner Only
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Share this 6-digit code with your staff (Managers, Accountants, Cashiers). They enter it during registration to join your store securely without exposing other stores.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-lg font-mono font-bold tracking-widest text-indigo-700 dark:text-indigo-300 shadow-xs">
              {profile.invite_code || 'KRN-4829'}
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(profile.invite_code || 'KRN-4829');
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2500);
              }}
              className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
            </button>
          </div>
        </div>
      )}

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

      {/* Security & Danger Vault (Owner Protected) (Iteration 6) */}
      <div
        className="rounded-2xl border-2 border-red-500/80 bg-red-50/20 dark:bg-red-950/20 p-5 space-y-4 shadow-sm transition-all"
        data-testid="danger-vault-container"
      >
        <div className="flex items-center justify-between border-b border-red-200 dark:border-red-900/50 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-red-900 dark:text-red-200 flex items-center gap-2">
                Security &amp; Danger Vault (Owner Protected)
              </h2>
              <p className="text-xs text-red-700/80 dark:text-red-400/80">
                Permanent database wipe, transaction reset, and factory restore operations
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="toggle-danger-vault-btn"
            onClick={() => {
              setIsDangerVaultOpen(!isDangerVaultOpen);
              setPendingDangerAction(null);
              setDangerError(null);
            }}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{isDangerVaultOpen ? 'Close Vault' : 'Open Vault'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDangerVaultOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Action Buttons - Always in DOM for accessibility, expanded view gives full details */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 pt-1">
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
          </div>

          {/* Expanded PIN & "CONFIRM" Guardrail (Iteration 6) */}
          {isDangerVaultOpen && pendingDangerAction && (
            <div
              className="p-4 bg-white dark:bg-slate-900 border-2 border-red-500 rounded-xl space-y-3 animate-in fade-in duration-200"
              data-testid="danger-guardrail-panel"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                    Target Destructive Action:
                  </span>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {pendingDangerAction === 'CLEAR_TRANSACTIONS' && 'Clear Sales, Invoices & Khata Transactions (Preserve Products)'}
                    {pendingDangerAction === 'WIPE_EMPTY' && 'Wipe All Records (100% Empty Fresh Store)'}
                    {pendingDangerAction === 'RESET_DEMO' && 'Reset Entire Database to 25 Sample Kirana Products'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingDangerAction(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-lg text-xs text-red-800 dark:text-red-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Mandatory Multi-Factor Guardrail:
                </p>
                <p>
                  1. An automatic emergency JSON disaster backup will be downloaded immediately before wipe runs.
                </p>
                <p>
                  2. Enter Owner Security PIN (Default: <strong>1234</strong>) AND type exact keyword <strong>CONFIRM</strong> to authorize.
                </p>
              </div>

              {dangerError && (
                <div className="p-2.5 bg-red-100 text-red-800 rounded-lg text-xs font-bold" data-testid="danger-vault-error">
                  {dangerError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Owner Security PIN:
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      data-testid="danger-vault-pin-input"
                      placeholder="Enter Owner PIN (1234)"
                      value={dangerPin}
                      onChange={(e) => setDangerPin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Type "CONFIRM" to Authorize:
                  </label>
                  <input
                    type="text"
                    data-testid="danger-vault-confirm-input"
                    placeholder='Type "CONFIRM"'
                    value={dangerConfirmText}
                    onChange={(e) => setDangerConfirmText(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingDangerAction(null)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="danger-vault-execute-btn"
                  disabled={isExecutingDangerAction}
                  onClick={handleExecuteDangerAction}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isExecutingDangerAction ? 'Creating Backup & Wiping...' : 'Authorize & Execute Wipe'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Developer & Testing Sandbox (Demo Products - Hidden & Collapsed by Default) */}
      <div className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <div className="p-2 bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded-xl">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Developer &amp; Testing Sandbox
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Hidden demo product seeding tools (for software evaluation only)
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="toggle-sandbox-btn"
            onClick={() => setShowDemoTools(!showDemoTools)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 transition shadow-2xs"
          >
            {showDemoTools ? 'Hide Sandbox' : 'Show Sandbox'}
          </button>
        </div>

        {showDemoTools && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <span className="font-bold block text-slate-900 dark:text-white">Load 25 Sample Kirana Products</span>
                Seeds 25 realistic Indian Kirana products (sugar, salt, oils, biscuits, grains) to test billing without entering manual catalog items.
              </div>
              <button
                type="button"
                data-testid="load-demo-products-btn"
                onClick={handleSeedDemoProducts}
                className="px-4 py-2 border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-900 dark:text-purple-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shrink-0 shadow-2xs"
              >
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Load 25 Sample Kirana Demo Products</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <span className="font-bold block text-slate-900 dark:text-white">Full Demo Reset (25 Products + Demo Customers)</span>
                Resets the store back to initial developer demonstration state with demo inventory and customers.
              </div>
              <button
                type="button"
                onClick={handleResetToDemo}
                disabled={!hasPermission('DATA_WIPE')}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition shrink-0 shadow-2xs disabled:opacity-40"
              >
                <RotateCcw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span>Full Demo Reset (25 Products + Demo Customers)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
