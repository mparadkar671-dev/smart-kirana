import React, { useState, useEffect } from 'react';
import { Customer, KhataTransaction, ShopProfile, SalesInvoice, SaleItem } from '../../types';
import { db } from '../../db/db';
import { KhataService } from '../../services/khataService';
import { ReceiveJamaModal } from './ReceiveJamaModal';
import { ReceiptModal } from '../pos/ReceiptModal';
import { formatINR } from '../../utils/math';
import {
  X,
  Phone,
  MessageSquare,
  Download,
  CheckCircle,
  Clock,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Receipt,
  ChevronDown,
  ChevronUp,
  Eye,
  Send,
  ShoppingBag,
  PhoneCall,
} from 'lucide-react';

interface CustomerPassbookDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  shopProfile?: ShopProfile | null;
  initialTab?: 'ledger' | 'bills';
  onDataChanged?: () => void;
}

export const CustomerPassbookDrawer: React.FC<CustomerPassbookDrawerProps> = ({
  isOpen,
  onClose,
  customer,
  shopProfile,
  initialTab = 'ledger',
  onDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'bills'>(initialTab);
  const [transactions, setTransactions] = useState<KhataTransaction[]>([]);
  const [pendingBills, setPendingBills] = useState<
    { invoice: SalesInvoice; items: SaleItem[]; udhariAmount: number }[]
  >([]);
  const [expandedBillIds, setExpandedBillIds] = useState<Set<string>>(new Set());
  const [isJamaModalOpen, setIsJamaModalOpen] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(customer);

  // Receipt Slip Modal State
  const [viewReceiptInvoice, setViewReceiptInvoice] = useState<SalesInvoice | null>(null);
  const [viewReceiptItems, setViewReceiptItems] = useState<SaleItem[]>([]);
  const [smsFeedback, setSmsFeedback] = useState<string | null>(null);

  useEffect(() => {
    setCurrentCustomer(customer);
    setActiveTab(initialTab);
    if (customer) {
      loadCustomerData(customer.id);
    }
  }, [customer, isOpen, initialTab]);

  const loadCustomerData = async (customerId: string) => {
    // 1. Load transactions
    const rows = await db.khata_transactions
      .where({ customer_id: customerId })
      .sortBy('created_at');
    setTransactions(rows);

    // 2. Load pending credit bills with items
    const bills = await KhataService.getCustomerPendingBills(customerId);
    setPendingBills(bills);

    // 3. Auto-expand the first bill if bills exist
    if (bills.length > 0) {
      setExpandedBillIds(new Set([bills[0].invoice.id]));
    }

    const reloadedCust = await db.customers.get(customerId);
    if (reloadedCust) setCurrentCustomer(reloadedCust);
  };

  if (!isOpen || !currentCustomer) return null;

  const agingDays = KhataService.getAgingDays(currentCustomer.oldest_unpaid_date);
  const defaultProfile: ShopProfile = shopProfile || {
    id: 'current_shop',
    shop_name: 'Smart Kirana',
    owner_name: 'Owner',
    phone: '9876543210',
    upi_vpa: 'kirana@upi',
    address: 'Shop Market',
    gst_footer_note: '',
    updated_at: new Date().toISOString(),
  };

  const toggleBillExpanded = (invoiceId: string) => {
    const next = new Set(expandedBillIds);
    if (next.has(invoiceId)) {
      next.delete(invoiceId);
    } else {
      next.add(invoiceId);
    }
    setExpandedBillIds(next);
  };

  // WhatsApp Trigger (REQ-12)
  const handleSendWhatsApp = (tier: 0 | 1 | 2 = 1) => {
    const url = KhataService.generateWhatsAppLink({
      customer: currentCustomer,
      shopProfile: defaultProfile,
      tier,
    });
    KhataService.logReminderSent(currentCustomer.id);
    window.open(url, '_blank');
  };

  // Send single bill on WhatsApp
  const handleSendSingleBillWhatsApp = (bill: {
    invoice: SalesInvoice;
    items: SaleItem[];
    udhariAmount: number;
  }) => {
    const url = KhataService.generateCustomerBillWhatsAppLink({
      customer: currentCustomer,
      bill,
      shopProfile: defaultProfile,
    });
    window.open(url, '_blank');
  };

  // Free SMS Reminder (Keypad / Dabba Phone friendly)
  const handleSendSms = (agingDays?: number) => {
    const text = KhataService.generateSmsText({
      customerName: currentCustomer.name,
      balance: currentCustomer.current_udhari_balance,
      shopName: defaultProfile.shop_name,
      upiVpa: defaultProfile.upi_vpa,
      shopPhone: defaultProfile.phone,
      agingDays,
    });
    const url = KhataService.generateSmsLink({
      customer: currentCustomer,
      shopProfile: defaultProfile,
      agingDays,
    });

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    KhataService.logReminderSent(currentCustomer.id);
    setSmsFeedback('✓ SMS ready & copied to clipboard!');
    setTimeout(() => setSmsFeedback(null), 3000);

    window.location.href = url;
  };

  // Send single bill on SMS (Dabba phone friendly)
  const handleSendSingleBillSms = (bill: {
    invoice: SalesInvoice;
    items: SaleItem[];
    udhariAmount: number;
  }) => {
    const text = KhataService.generateCustomerBillSmsText({
      customerName: currentCustomer.name,
      bill,
      shopProfile: defaultProfile,
    });
    const url = KhataService.generateCustomerBillSmsLink({
      customer: currentCustomer,
      bill,
      shopProfile: defaultProfile,
    });

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    setSmsFeedback('✓ Bill SMS copied & opened!');
    setTimeout(() => setSmsFeedback(null), 3000);

    window.location.href = url;
  };

  // Send all pending bills statement on SMS
  const handleSendAllBillsSms = () => {
    const text = KhataService.generateAllPendingBillsSmsText({
      customer: currentCustomer,
      bills: pendingBills,
      shopProfile: defaultProfile,
    });
    const url = KhataService.generateAllPendingBillsSmsLink({
      customer: currentCustomer,
      bills: pendingBills,
      shopProfile: defaultProfile,
    });

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    setSmsFeedback('✓ All Bills SMS copied & opened!');
    setTimeout(() => setSmsFeedback(null), 3000);

    window.location.href = url;
  };

  // Send all pending bills statement on WhatsApp
  const handleSendAllBillsWhatsApp = () => {
    const url = KhataService.generateAllPendingBillsWhatsAppLink({
      customer: currentCustomer,
      bills: pendingBills,
      shopProfile: defaultProfile,
    });
    window.open(url, '_blank');
  };

  // PDF Export Trigger (REQ-14)
  const handleDownloadPdf = async () => {
    await KhataService.generateKhataStatementPdf(currentCustomer, defaultProfile);
  };

  // View Receipt Slip
  const handleViewReceipt = (inv: SalesInvoice, items: SaleItem[]) => {
    setViewReceiptInvoice(inv);
    setViewReceiptItems(items);
  };

  const totalCreditInvoiced = pendingBills.reduce((sum, b) => sum + b.udhariAmount, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200 overflow-hidden transition-colors">
        {/* Top Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{currentCustomer.name}</h2>
              <span className="text-xs font-mono bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                {currentCustomer.phone}
              </span>
            </div>
            {currentCustomer.address_landmark && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{currentCustomer.address_landmark}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Credit Limit:</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {formatINR(currentCustomer.credit_limit)}
              </span>
              {currentCustomer.current_udhari_balance > currentCustomer.credit_limit && (
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded">
                  Limit Exceeded!
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Card & Action Buttons */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Current Pending Udhari Balance
              </span>
              <div
                data-testid="passbook-current-balance"
                className="text-2xl font-extrabold text-[#dc2626]"
              >
                {formatINR(currentCustomer.current_udhari_balance)}
              </div>
            </div>

            {currentCustomer.current_udhari_balance > 0 && agingDays > 0 && (
              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 justify-end">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Oldest Aging
                </span>
                <span
                  data-testid="customer-aging-days"
                  className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    agingDays > 15
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : agingDays > 7
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                >
                  {agingDays} Days Pending
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              data-testid="receive-jama-btn"
              disabled={currentCustomer.current_udhari_balance <= 0}
              onClick={() => setIsJamaModalOpen(true)}
              className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Receive Jama</span>
            </button>

            <button
              type="button"
              data-testid="send-whatsapp-reminder-btn"
              disabled={currentCustomer.current_udhari_balance <= 0}
              onClick={() => handleSendWhatsApp(agingDays > 15 ? 2 : 1)}
              className="py-2 px-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <MessageSquare className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              data-testid="send-sms-reminder-btn"
              disabled={currentCustomer.current_udhari_balance <= 0}
              onClick={() => handleSendSms(agingDays)}
              className="py-2 px-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
              title="Send SMS text message for basic keypad / dabba phones without WhatsApp"
            >
              <PhoneCall className="w-4 h-4" />
              <span>📱 SMS (Dabba)</span>
            </button>

            <button
              type="button"
              data-testid="download-khata-pdf-btn"
              onClick={handleDownloadPdf}
              className="py-2 px-2 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Passbook PDF</span>
            </button>
          </div>

          {smsFeedback && (
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold text-center rounded-xl animate-in fade-in">
              {smsFeedback}
            </div>
          )}
        </div>

        {/* TAB SWITCHER: 1. Chronological Ledger vs 2. Detailed Pending Bills */}
        <div
          data-testid="passbook-tabs-switcher"
          className="px-4 pt-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2"
        >
          <button
            type="button"
            data-testid="tab-passbook-ledger"
            onClick={() => setActiveTab('ledger')}
            className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'ledger'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Passbook Ledger ({transactions.length})</span>
          </button>

          <button
            type="button"
            data-testid="tab-pending-bills"
            onClick={() => setActiveTab('bills')}
            className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'bills'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Detailed Pending Bills ({pendingBills.length})</span>
          </button>
        </div>

        {/* TAB CONTENT: 1. CHRONOLOGICAL PASSBOOK TABLE */}
        {activeTab === 'ledger' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-700" />
                <span>Account Passbook ({transactions.length} entries)</span>
              </h3>
              <span
                title="∑(Debit) - ∑(Credit) = Balance verified"
                className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>Math Verified</span>
              </span>
            </div>

            {transactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No Khata transactions recorded yet for this customer.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs" data-testid="passbook-table">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Details</th>
                        <th className="p-2.5 text-right">Udhari (+)</th>
                        <th className="p-2.5 text-right">Jama (-)</th>
                        <th className="p-2.5 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {transactions.map((tx) => {
                        const dt = new Date(tx.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        });
                        const isDebit = tx.entry_type === 'DEBIT_UDHARI_GIVEN';

                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="p-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {dt}
                            </td>
                            <td className="p-2.5 text-slate-700 dark:text-slate-300 max-w-[140px] truncate" title={tx.notes}>
                              {tx.notes}
                            </td>
                            <td className="p-2.5 text-right font-bold text-[#dc2626] dark:text-red-400">
                              {isDebit ? formatINR(tx.amount) : '-'}
                            </td>
                            <td className="p-2.5 text-right font-bold text-[#16a34a] dark:text-emerald-400">
                              {!isDebit ? formatINR(tx.amount) : '-'}
                            </td>
                            <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white">
                              {formatINR(tx.running_balance_after)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: 2. DETAILED CUSTOMER PENDING BILLS WITH ITEMS */}
        {activeTab === 'bills' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="pending-bills-container">
            {/* Summary Bar */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-900 dark:text-blue-300 font-bold">
                  {pendingBills.length} Unpaid / Credit Bill(s)
                </p>
                <p className="text-[10px] text-blue-700 dark:text-blue-400">
                  Total credit billed: {formatINR(totalCreditInvoiced)}
                </p>
              </div>

              {pendingBills.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSendAllBillsWhatsApp}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
                    title="Send complete itemized list of all unpaid bills to customer WhatsApp"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>WhatsApp All</span>
                  </button>

                  <button
                    type="button"
                    data-testid="sms-all-bills-btn"
                    onClick={handleSendAllBillsSms}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
                    title="Send all unpaid bills via native SMS text for feature / dabba phones"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>SMS All</span>
                  </button>
                </div>
              )}
            </div>

            {pendingBills.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                <Receipt className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">
                  No unpaid or pending credit bills found.
                </p>
                <p className="text-[11px]">This customer has cleared all past credit purchases!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingBills.map((bill, index) => {
                  const isExpanded = expandedBillIds.has(bill.invoice.id);
                  const billDate = new Date(bill.invoice.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={bill.invoice.id}
                      className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-2xs transition"
                      data-testid={`pending-bill-card-${bill.invoice.invoice_number}`}
                    >
                      {/* Bill Header (Click to toggle item details) */}
                      <div
                        onClick={() => toggleBillExpanded(bill.invoice.id)}
                        className="p-3.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100/60 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                {bill.invoice.invoice_number}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                {bill.invoice.payment_mode}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{billDate}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Udhari Added</span>
                            <span className="font-extrabold text-sm text-red-600 dark:text-red-400">
                              +{formatINR(bill.udhariAmount)}
                            </span>
                          </div>
                          <div className="text-slate-400">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Bill Details & Line Items (When expanded) */}
                      {isExpanded && (
                        <div className="p-3.5 space-y-3 animate-in fade-in duration-150">
                          {/* Financial Summary */}
                          <div className="grid grid-cols-3 gap-2 p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-center text-[11px]">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Grand Total</span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {formatINR(bill.invoice.grand_total)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Paid at Counter</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {formatINR(bill.invoice.amount_paid_now)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Credit Left</span>
                              <span className="font-bold text-red-600 dark:text-red-400">
                                {formatINR(bill.udhariAmount)}
                              </span>
                            </div>
                          </div>

                          {/* Line Items Table */}
                          <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                <tr>
                                  <th className="p-2">Item</th>
                                  <th className="p-2 text-right">Qty</th>
                                  <th className="p-2 text-right">Rate</th>
                                  <th className="p-2 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                                {bill.items.map((it, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                    <td className="p-2 font-medium text-slate-800 dark:text-slate-200">
                                      {it.product_name_snapshot}
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-400">
                                      {it.qty}
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-400">
                                      {formatINR(it.unit_selling_price)}
                                    </td>
                                    <td className="p-2 text-right font-bold text-slate-900 dark:text-white">
                                      {formatINR(it.line_total)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Action Buttons for this specific bill */}
                          <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleViewReceipt(bill.invoice, bill.items)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Receipt</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendSingleBillWhatsApp(bill)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </button>

                            <button
                              type="button"
                              data-testid={`sms-bill-btn-${bill.invoice.invoice_number}`}
                              onClick={() => handleSendSingleBillSms(bill)}
                              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
                              title="Send single bill via SMS (dabba keypad phones)"
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                              <span>SMS</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Receive Jama Modal */}
      <ReceiveJamaModal
        isOpen={isJamaModalOpen}
        onClose={() => setIsJamaModalOpen(false)}
        customer={currentCustomer}
        shopProfile={defaultProfile}
        onPaymentRecorded={() => {
          loadCustomerData(currentCustomer.id);
          if (onDataChanged) onDataChanged();
        }}
      />

      {/* View Full Receipt Modal */}
      {viewReceiptInvoice && (
        <ReceiptModal
          isOpen={!!viewReceiptInvoice}
          invoice={viewReceiptInvoice}
          items={viewReceiptItems}
          customer={currentCustomer}
          profile={defaultProfile}
          onClose={() => setViewReceiptInvoice(null)}
        />
      )}
    </div>
  );
};
