import React, { useState, useEffect } from 'react';
import { db } from '../../db/db';
import { ShopProfile } from '../../types';
import { BackupService } from '../../services/backupService';
import { createCustomSupabaseClient } from '../../lib/supabase';
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
} from 'lucide-react';

interface SettingsViewProps {
  onDataReset?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onDataReset }) => {
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Supabase Settings (REQ-16)
  const [supabaseUrl, setSupabaseUrl] = useState(
    () => localStorage.getItem('kirana_supabase_url') || import.meta.env.VITE_SUPABASE_URL || ''
  );
  const [supabaseKey, setSupabaseKey] = useState(
    () =>
      localStorage.getItem('kirana_supabase_key') ||
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      ''
  );
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'CONFIGURED' | 'TESTING'>('IDLE');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const prof = await db.getShopProfile();
    setProfile(prof);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSaving(true);
    try {
      await db.updateShopProfile(profile);
      setSaveSuccess(true);
      setStatusMsg({ type: 'success', text: 'Shop settings and UPI configuration updated successfully!' });
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setStatusMsg({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  // 1-Click JSON Backup Export (REQ-16)
  const handleExportJson = async () => {
    try {
      await BackupService.downloadJsonBackup();
      setStatusMsg({ type: 'success', text: 'JSON database snapshot downloaded successfully!' });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Export failed' });
    }
  };

  // 1-Click JSON Backup Restore (REQ-16)
  const handleRestoreJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await BackupService.restoreDatabaseFromJson(content);
        await loadProfile();
        setStatusMsg({ type: 'success', text: 'Database successfully restored from JSON backup with 100% parity!' });
        if (onDataReset) onDataReset();
      } catch (err: unknown) {
        setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Restore failed' });
      }
    };
    reader.readAsText(file);
  };

  const handleSaveSupabaseConfig = () => {
    localStorage.setItem('kirana_supabase_url', supabaseUrl.trim());
    localStorage.setItem('kirana_supabase_key', supabaseKey.trim());
    setSyncStatus('CONFIGURED');
    setStatusMsg({ type: 'success', text: 'Supabase configuration saved! Background sync connector active.' });
  };

  const handleTestSupabaseConnection = async () => {
    const url = supabaseUrl.trim();
    const key = supabaseKey.trim();
    if (!url || !key) {
      setStatusMsg({ type: 'error', text: 'Please enter both Supabase URL and Anon/Publishable Key.' });
      return;
    }
    setSyncStatus('TESTING');
    setStatusMsg({ type: 'info', text: 'Testing connection to Supabase...' });
    try {
      const client = createCustomSupabaseClient(url, key);
      if (!client) {
        throw new Error('Could not initialize Supabase client.');
      }
      const { error } = await client.from('shop_profile').select('*').limit(1);
      if (error) {
        // If table doesn't exist yet, we still know the API connected!
        if (error.code === '42P01') {
          setStatusMsg({
            type: 'info',
            text: 'Connected to Supabase successfully, but "shop_profile" table is not found yet. Make sure to run supabase_schema.sql in the Supabase SQL Editor!',
          });
        } else {
          throw new Error(error.message);
        }
      } else {
        setStatusMsg({ type: 'success', text: '✅ Successfully connected to Supabase PostgreSQL database!' });
      }
      setSyncStatus('CONFIGURED');
    } catch (err: unknown) {
      setSyncStatus('IDLE');
      setStatusMsg({
        type: 'error',
        text: `Supabase connection failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleClearTransactions = async () => {
    if (window.confirm('Are you sure you want to clear all sales, transactions, and galla logs? Products and shop settings will be preserved.')) {
      await db.clearTransactionalData();
      setStatusMsg({ type: 'info', text: 'All transactional records cleared successfully. Products kept intact.' });
      if (onDataReset) onDataReset();
    }
  };

  const handleResetToDemo = async () => {
    if (window.confirm('Reset everything to the default 25 Indian Kirana products and demo customers?')) {
      await db.resetToDemoState();
      await loadProfile();
      setStatusMsg({ type: 'success', text: 'Database reset to default demo master records!' });
      if (onDataReset) onDataReset();
    }
  };

  if (!profile) {
    return <div className="p-6 text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-blue-800" />
            Shop Profile &amp; Cloud Sync Configuration
          </h1>
          <p className="text-sm text-slate-500">Manage store details, UPI QR VPA, JSON disaster backups, and Supabase cloud sync</p>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : statusMsg.type === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Shop Profile Form */}
      <form onSubmit={handleSave} className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
          <Store className="w-5 h-5 text-blue-700" />
          Shop Identity &amp; Contact
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Shop Name (Appears on Bills &amp; WhatsApp)
            </label>
            <input
              type="text"
              required
              value={profile.shop_name}
              onChange={(e) => setProfile({ ...profile, shop_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g. Shree Ganesh Kirana Store"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Owner Name
            </label>
            <input
              type="text"
              required
              value={profile.owner_name}
              onChange={(e) => setProfile({ ...profile, owner_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g. Ramesh Patel"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              Owner Phone Number (10 digits)
            </label>
            <input
              type="tel"
              required
              pattern="[0-9]{10}"
              maxLength={10}
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/\D/g, '') })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g. 9876543210"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1 flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5 text-slate-400" />
              Shop UPI ID / VPA (For Dynamic QR Codes)
            </label>
            <input
              type="text"
              required
              value={profile.upi_vpa}
              onChange={(e) => setProfile({ ...profile, upi_vpa: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              placeholder="e.g. kirana@upi or 9876543210@paytm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Shop Address &amp; Landmark
            </label>
            <input
              type="text"
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g. Shop No. 4, Main Market, Station Road"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Invoice &amp; PDF Footer Note / GST (Optional)
            </label>
            <textarea
              rows={2}
              value={profile.gst_footer_note}
              onChange={(e) => setProfile({ ...profile, gst_footer_note: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g. Goods once sold will not be taken back without bill. Visit again!"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-blue-800 hover:bg-blue-900 text-white font-medium rounded-lg text-sm shadow-xs transition flex items-center gap-2"
          >
            {saveSuccess ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" /> Saved!
              </>
            ) : (
              'Save Shop Settings'
            )}
          </button>
        </div>
      </form>

      {/* 1-Click JSON Snapshot Backup & Disaster Recovery (REQ-16) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
          <Database className="w-5 h-5 text-blue-700" />
          Local Database JSON Backup &amp; Restore (REQ-16)
        </h2>
        <p className="text-sm text-slate-600">
          Export your entire shop data (all 8 tables) into a single encrypted JSON file for safekeeping on Google Drive or your computer.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            data-testid="export-json-btn"
            onClick={handleExportJson}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition"
          >
            <Download className="w-4 h-4" />
            <span>Download JSON Snapshot Backup</span>
          </button>

          <label className="px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition">
            <Upload className="w-4 h-4 text-slate-600" />
            <span>Restore from JSON File</span>
            <input
              type="file"
              accept=".json"
              data-testid="restore-json-input"
              onChange={handleRestoreJson}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      {/* Supabase Cloud Sync Connector (REQ-16) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-700" />
            Supabase Cloud Sync (Optional Multi-Device Sync)
          </h2>
          <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-full">
            100% Free Tier (500MB Postgres)
          </span>
        </div>
        <p className="text-xs text-slate-600">
          Sync your counter PC with mobile phones. Run <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">supabase_schema.sql</code> in your Supabase SQL Editor and enter credentials below:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xyz.supabase.co"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Supabase Anon / Public API Key
            </label>
            <input
              type="password"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsIn..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleTestSupabaseConnection}
            disabled={syncStatus === 'TESTING'}
            className="px-4 py-2 border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition disabled:opacity-50"
          >
            {syncStatus === 'TESTING' ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            type="button"
            onClick={handleSaveSupabaseConfig}
            className="px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold transition"
          >
            Save Cloud Sync Credentials
          </button>
        </div>
      </div>

      {/* Database Management & Demo Data Reset (REQ-03) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
          <Trash2 className="w-5 h-5 text-slate-600" />
          Database Management &amp; Demo State (REQ-03)
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={handleClearTransactions}
            className="px-4 py-2.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition"
          >
            <Trash2 className="w-4 h-4 text-amber-700" />
            Clear Sales &amp; Transactions (Keep Products)
          </button>

          <button
            type="button"
            onClick={handleResetToDemo}
            className="px-4 py-2.5 border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4 text-slate-600" />
            Reset All to 25 Default Products &amp; Seed Customers
          </button>
        </div>
      </div>
    </div>
  );
};
