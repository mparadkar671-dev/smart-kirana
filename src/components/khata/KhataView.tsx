import React, { useState, useEffect } from 'react';
import { Customer, ShopProfile, KhataTransaction } from '../../types';
import { db } from '../../db/db';
import { KhataService } from '../../services/khataService';
import { CustomerPassbookDrawer } from './CustomerPassbookDrawer';
import { ReceiveJamaModal } from './ReceiveJamaModal';
import { formatINR } from '../../utils/math';
import {
  BookOpen,
  Search,
  UserPlus,
  AlertCircle,
  Clock,
  CheckCircle,
  MessageSquare,
  TrendingDown,
  User,
  Filter,
} from 'lucide-react';

interface KhataViewProps {
  customers: Customer[];
  shopProfile?: ShopProfile | null;
  onRefresh?: () => void;
}

type AgingFilter = 'ALL' | 'HIGH_BALANCE' | '0-7d' | '8-15d' | '15-30d' | '30+d';

export const KhataView: React.FC<KhataViewProps> = ({
  customers,
  shopProfile,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [agingFilter, setAgingFilter] = useState<AgingFilter>('ALL');

  // Selected customer for passbook drawer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isPassbookOpen, setIsPassbookOpen] = useState(false);

  // Quick Jama Modal from table
  const [jamaCustomer, setJamaCustomer] = useState<Customer | null>(null);
  const [isJamaModalOpen, setIsJamaModalOpen] = useState(false);

  // Today's recovered Jama calculation
  const [todayJamaRecovered, setTodayJamaRecovered] = useState<number>(0);

  useEffect(() => {
    loadTodayJama();
  }, [customers]);

  const loadTodayJama = async () => {
    const todayDate = new Date().toISOString().split('T')[0];
    const session = await db.daily_galla_sessions
      .where({ session_date: todayDate })
      .first();

    const transactions = await db.khata_transactions
      .filter((t) => t.created_at.startsWith(todayDate) && t.entry_type === 'CREDIT_JAMA_RECEIVED')
      .toArray();

    const sum = transactions.reduce((total, t) => total + t.amount, 0);
    setTodayJamaRecovered(sum);
  };

  // Exclude system walk-in customer from Khata register
  const validCustomers = customers.filter((c) => c.id !== '0000-WALK-IN');

  // Top KPI Metrics (REQ-10)
  const totalMarketUdhari = validCustomers.reduce(
    (sum, c) => sum + (c.current_udhari_balance || 0),
    0
  );

  const overdueCustomers = validCustomers.filter((c) => {
    if (c.current_udhari_balance <= 0) return false;
    const days = KhataService.getAgingDays(c.oldest_unpaid_date);
    return days > 15;
  });

  const overdueCount = overdueCustomers.length;

  // Filter & Sort: MUST sort by highest pending Udhari (REQ-10)
  const filteredAndSortedCustomers = validCustomers
    .filter((c) => {
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery);

      if (!matchesSearch) return false;

      const days = KhataService.getAgingDays(c.oldest_unpaid_date);
      const bucket = KhataService.getAgingBucket(days);

      if (agingFilter === 'HIGH_BALANCE') {
        return c.current_udhari_balance >= 1000;
      }
      if (agingFilter === '0-7d') {
        return c.current_udhari_balance > 0 && bucket === '0-7d';
      }
      if (agingFilter === '8-15d') {
        return c.current_udhari_balance > 0 && bucket === '8-15d';
      }
      if (agingFilter === '15-30d') {
        return c.current_udhari_balance > 0 && bucket === '15-30d';
      }
      if (agingFilter === '30+d') {
        return c.current_udhari_balance > 0 && bucket === '30+d';
      }

      return true;
    })
    .sort((a, b) => b.current_udhari_balance - a.current_udhari_balance);

  const handleOpenPassbook = (c: Customer) => {
    setSelectedCustomer(c);
    setIsPassbookOpen(true);
  };

  const handleOpenJama = (c: Customer) => {
    setJamaCustomer(c);
    setIsJamaModalOpen(true);
  };

  const handleDirectWhatsApp = (c: Customer) => {
    const defaultProf: ShopProfile = shopProfile || {
      id: 'current_shop',
      shop_name: 'Smart Kirana',
      owner_name: 'Owner',
      phone: '9876543210',
      upi_vpa: 'kirana@upi',
      address: 'Shop Market',
      gst_footer_note: '',
      updated_at: new Date().toISOString(),
    };

    const days = KhataService.getAgingDays(c.oldest_unpaid_date);
    const url = KhataService.generateWhatsAppLink({
      customer: c,
      shopProfile: defaultProf,
      tier: days > 15 ? 2 : 1,
    });
    KhataService.logReminderSent(c.id);
    window.open(url, '_blank');
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Customer Khata &amp; Udhari Register
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Automated WhatsApp statements &amp; passbook reconciliation | Zero accounting discrepancy
          </p>
        </div>
      </div>

      {/* Top KPI Bar (REQ-10) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="khata-kpi-bar">
        {/* Total Market Udhari to Collect (Crimson Red #dc2626) */}
        <div className="bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-2xl p-5 flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <span className="text-xs font-bold text-red-800 dark:text-red-400 uppercase tracking-wide">
              Total Market Udhari to Collect
            </span>
            <p className="text-2xl font-extrabold text-[#dc2626] dark:text-red-400" data-testid="total-market-udhari">
              {formatINR(totalMarketUdhari)}
            </p>
            <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">Pending from customers</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>

        {/* Overdue > 15 Days Count */}
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-5 flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wide">
              Overdue &gt; 15 Days
            </span>
            <p className="text-2xl font-extrabold text-amber-900 dark:text-amber-200" data-testid="overdue-count">
              {overdueCount} Customers
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">Actionable WhatsApp reminders needed</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Today's Jama Recovered (Emerald Green #16a34a) */}
        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-5 flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wide">
              Today&apos;s Jama Recovered
            </span>
            <p className="text-2xl font-extrabold text-[#16a34a] dark:text-emerald-400" data-testid="today-jama-recovered">
              {formatINR(todayJamaRecovered)}
            </p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Cash &amp; UPI settled today</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Aging Filters & Search Toolbar (REQ-10) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              data-testid="khata-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer by Name or 10-digit Mobile..."
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
            />
          </div>

          {/* Aging Buckets Segmented Switcher */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" data-testid="aging-filter-container">
            {[
              { id: 'ALL' as AgingFilter, label: 'All Customers' },
              { id: 'HIGH_BALANCE' as AgingFilter, label: 'High (>₹1k)' },
              { id: '0-7d' as AgingFilter, label: '0–7 Days' },
              { id: '8-15d' as AgingFilter, label: '8–15 Days' },
              { id: '15-30d' as AgingFilter, label: '15–30 Days' },
              { id: '30+d' as AgingFilter, label: '30+ Days' },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                data-testid={`filter-${btn.id}`}
                onClick={() => setAgingFilter(btn.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  agingFilter === btn.id
                    ? 'bg-blue-700 dark:bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Customer Khata Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="customers-table">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">
                <tr>
                  <th className="p-3">Customer Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3 text-right">Credit Limit</th>
                  <th className="p-3 text-right">Pending Udhari</th>
                  <th className="p-3 text-center">Aging Days</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAndSortedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                      No customers match your search or filter.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedCustomers.map((cust) => {
                    const aging = KhataService.getAgingDays(cust.oldest_unpaid_date);
                    const isExceeded = cust.current_udhari_balance > cust.credit_limit;

                    return (
                      <tr
                        key={cust.id}
                        data-testid={`customer-row-${cust.id}`}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group"
                      >
                        {/* Name */}
                        <td className="p-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <span>{cust.name}</span>
                            {isExceeded && (
                              <span
                                title="Credit Limit Exceeded"
                                className="px-1.5 py-0.2 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-[10px] font-bold rounded"
                              >
                                Over Limit
                              </span>
                            )}
                          </div>
                          {cust.address_landmark && (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
                              {cust.address_landmark}
                            </span>
                          )}
                        </td>

                        {/* Phone */}
                        <td className="p-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {cust.phone}
                        </td>

                        {/* Credit Limit */}
                        <td className="p-3 text-right text-xs text-slate-500 dark:text-slate-400">
                          {formatINR(cust.credit_limit)}
                        </td>

                        {/* Pending Udhari (Crimson Red #dc2626) */}
                        <td className="p-3 text-right">
                          <span
                            className={`font-extrabold text-sm ${
                              cust.current_udhari_balance > 0
                                ? 'text-[#dc2626] dark:text-red-400'
                                : 'text-[#16a34a] dark:text-emerald-400'
                            }`}
                          >
                            {formatINR(cust.current_udhari_balance)}
                          </span>
                        </td>

                        {/* Aging Days (REQ-10) */}
                        <td className="p-3 text-center">
                          {cust.current_udhari_balance > 0 ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                aging > 15
                                  ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
                                  : aging > 7
                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              }`}
                            >
                              {aging}d
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">-</span>
                          )}
                        </td>

                        {/* Actions: Passbook, WhatsApp, Receive Jama */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Passbook Drawer Trigger */}
                            <button
                              type="button"
                              onClick={() => handleOpenPassbook(cust)}
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-semibold transition"
                            >
                              Passbook
                            </button>

                            {/* Direct WhatsApp Nudge */}
                            <button
                              type="button"
                              data-testid={`whatsapp-btn-${cust.id}`}
                              disabled={cust.current_udhari_balance <= 0}
                              onClick={() => handleDirectWhatsApp(cust)}
                              title="Send 1-Click WhatsApp Reminder"
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 disabled:opacity-30 transition"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>

                            {/* Receive Jama */}
                            <button
                              type="button"
                              data-testid={`jama-btn-${cust.id}`}
                              disabled={cust.current_udhari_balance <= 0}
                              onClick={() => handleOpenJama(cust)}
                              title="Receive Jama Settlement"
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-30 transition"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Customer Passbook Drawer (REQ-11) */}
      <CustomerPassbookDrawer
        isOpen={isPassbookOpen}
        onClose={() => setIsPassbookOpen(false)}
        customer={selectedCustomer}
        shopProfile={shopProfile}
        onDataChanged={() => {
          loadTodayJama();
          if (onRefresh) onRefresh();
        }}
      />

      {/* Receive Jama Modal */}
      <ReceiveJamaModal
        isOpen={isJamaModalOpen}
        onClose={() => setIsJamaModalOpen(false)}
        customer={jamaCustomer}
        shopProfile={shopProfile}
        onPaymentRecorded={() => {
          loadTodayJama();
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
