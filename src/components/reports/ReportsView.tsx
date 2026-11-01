import React, { useState, useEffect } from 'react';
import { ShopProfile, SalesInvoice, PaymentMode, Customer, SaleItem } from '../../types';
import { db } from '../../db/db';
import { ReportsService, DateFilterRange } from '../../services/reportsService';
import { GallaService } from '../../services/gallaService';
import { ReceiptModal } from '../pos/ReceiptModal';
import { SalesReturnModal } from '../pos/SalesReturnModal';
import { formatINR } from '../../utils/math';
import {
  BarChart3,
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Users,
  Package,
  Layers,
  RotateCcw,
  AlertTriangle,
  Eye,
  Edit2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

interface ReportsViewProps {
  shopProfile?: ShopProfile | null;
  onDataChanged?: () => void;
}

type ReportTab = 'pnl' | 'products' | 'udhari' | 'invoices' | 'inventory';
type DatePreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL';

export const ReportsView: React.FC<ReportsViewProps> = ({ shopProfile, onDataChanged }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('pnl');
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [isLoading, setIsLoading] = useState(false);

  // Report Data States
  const [pnlData, setPnlData] = useState<any>(null);
  const [productsData, setProductsData] = useState<any[]>([]);
  const [udhariData, setUdhariData] = useState<any[]>([]);
  const [invoicesData, setInvoicesData] = useState<SalesInvoice[]>([]);
  const [inventoryData, setInventoryData] = useState<any>(null);

  // Invoices Multi-Select & Actions
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [isBulkVoiding, setIsBulkVoiding] = useState(false);

  // View Receipt Slip Modal State
  const [viewReceiptInvoice, setViewReceiptInvoice] = useState<SalesInvoice | null>(null);
  const [viewReceiptItems, setViewReceiptItems] = useState<SaleItem[]>([]);
  const [viewReceiptCustomer, setViewReceiptCustomer] = useState<Customer | null>(null);

  // Sales Return & Credit Note Modal State (Iteration 3)
  const [returnInvoice, setReturnInvoice] = useState<SalesInvoice | null>(null);

  const defaultProfile: ShopProfile = shopProfile || {
    id: 'current_shop',
    shop_name: 'Smart Kirana & General Store',
    owner_name: 'Owner',
    phone: '9876543210',
    upi_vpa: 'kirana@upi',
    address: 'Main Market Road',
    gst_footer_note: '',
    updated_at: new Date().toISOString(),
  };

  const getDateRange = (): DateFilterRange | undefined => {
    if (datePreset === 'ALL') return undefined;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (datePreset === 'TODAY') {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (datePreset === 'YESTERDAY') {
      const y = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      return { startDate: y, endDate: y };
    }
    if (datePreset === 'THIS_WEEK') {
      const w = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      return { startDate: w, endDate: todayStr };
    }
    if (datePreset === 'THIS_MONTH') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      return { startDate: m, endDate: todayStr };
    }
    return undefined;
  };

  useEffect(() => {
    loadAllReports();
  }, [datePreset, activeTab]);

  const loadAllReports = async () => {
    setIsLoading(true);
    const range = getDateRange();

    try {
      if (activeTab === 'pnl') {
        const pnl = await ReportsService.getProfitAndLossData(range);
        setPnlData(pnl);
      } else if (activeTab === 'products') {
        const prods = await ReportsService.getProductWiseSalesData(range);
        setProductsData(prods);
      } else if (activeTab === 'udhari') {
        const udh = await ReportsService.getCustomerUdhariSummaryData();
        setUdhariData(udh);
      } else if (activeTab === 'invoices') {
        const invs = await ReportsService.getBillRegisterData(range);
        setInvoicesData(invs);
      } else if (activeTab === 'inventory') {
        const invVal = await ReportsService.getInventoryValuationData();
        setInventoryData(invVal);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Void Invoice Action (REQ-34 / AT-09)
  const handleVoidInvoice = async (inv: SalesInvoice) => {
    if (window.confirm(`Are you sure you want to VOID invoice ${inv.invoice_number}? This will restore product stock and reverse any added Udhari.`)) {
      await GallaService.voidInvoice(inv.id);
      await loadAllReports();
      if (onDataChanged) onDataChanged();
    }
  };

  const handleToggleSelectAllInvoices = () => {
    if (selectedInvoiceIds.size === invoicesData.length && invoicesData.length > 0) {
      setSelectedInvoiceIds(new Set());
    } else {
      setSelectedInvoiceIds(new Set(invoicesData.map((inv) => inv.id)));
    }
  };

  const handleToggleSelectInvoice = (invId: string) => {
    const next = new Set(selectedInvoiceIds);
    if (next.has(invId)) {
      next.delete(invId);
    } else {
      next.add(invId);
    }
    setSelectedInvoiceIds(next);
  };

  const handleBulkVoidInvoices = async () => {
    if (selectedInvoiceIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to VOID ${selectedInvoiceIds.size} selected invoices? This will restore product stock and reverse any added Udhari.`)) {
      return;
    }

    setIsBulkVoiding(true);
    try {
      await GallaService.bulkVoidInvoices(Array.from(selectedInvoiceIds));
      setSelectedInvoiceIds(new Set());
      await loadAllReports();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      alert(`Bulk void failed: ${err.message}`);
    } finally {
      setIsBulkVoiding(false);
    }
  };

  const handleViewSlip = async (inv: SalesInvoice) => {
    const items = await db.sale_items.where({ invoice_id: inv.id }).toArray();
    let cust: Customer | null = null;
    if (inv.customer_id) {
      cust = (await db.customers.get(inv.customer_id)) || null;
    }
    setViewReceiptItems(items);
    setViewReceiptCustomer(cust);
    setViewReceiptInvoice(inv);
  };

  const handleReturnCompleted = async () => {
    setReturnInvoice(null);
    await loadAllReports();
    if (onDataChanged) onDataChanged();
  };

  // PDF Export Trigger (REQ-14)
  const handleExportPdf = async () => {
    const range = getDateRange();
    if (activeTab === 'pnl') {
      await ReportsService.generateProfitAndLossReport(defaultProfile, range);
    } else if (activeTab === 'products') {
      await ReportsService.generateProductWiseReport(defaultProfile, range);
    } else if (activeTab === 'udhari') {
      await ReportsService.generateCustomerUdhariReport(defaultProfile);
    } else if (activeTab === 'invoices') {
      await ReportsService.generateBillRegisterReport(defaultProfile, range);
    } else if (activeTab === 'inventory') {
      await ReportsService.generateInventoryValuationReport(defaultProfile);
    }
  };

  // 1-Click Excel / CSV Export
  const handleExportCsv = () => {
    const dateStr = new Date().toISOString().split('T')[0];
    let csvContent = '';
    let filename = `Vyapar_Report_${activeTab}_${dateStr}.csv`;

    if (activeTab === 'pnl' && pnlData) {
      csvContent = `Metric,Amount (INR)\n` +
        `Sales Revenue,${pnlData.salesRevenue}\n` +
        `Invoice Count,${pnlData.invoiceCount}\n` +
        `Wholesale COGS,${pnlData.cogs}\n` +
        `Gross Profit,${pnlData.grossProfit}\n` +
        `Shop Operating Expenses,${pnlData.shopOperatingExpenses}\n` +
        `Damage Loss,${pnlData.damageLoss}\n` +
        `Home Grocery Isolation (Cost),${pnlData.homeSelfUseValuation}\n` +
        `True Net Profit,${pnlData.trueNetProfit}\n`;
    } else if (activeTab === 'products') {
      csvContent = `Product Name,Units Sold,Unit,Revenue,Profit,Margin %,Remaining Stock\n` +
        productsData.map(p => `"${p.name.replace(/"/g, '""')}",${p.qtySold},${p.unitType},${p.revenue},${p.profit},${p.marginPct}%,${p.currentStock}`).join('\n');
    } else if (activeTab === 'udhari') {
      csvContent = `Customer Name,Phone,Credit Limit,Pending Udhari,Aging Days\n` +
        udhariData.map(c => `"${c.name.replace(/"/g, '""')}",${c.phone},${c.creditLimit},${c.balance},${c.agingDays}`).join('\n');
    } else if (activeTab === 'invoices') {
      csvContent = `Invoice Number,Date Time,Payment Mode,Grand Total,Paid Now,Udhari Added,Status\n` +
        invoicesData.map(i => `"${i.invoice_number}","${i.created_at}",${i.payment_mode},${i.grand_total},${i.amount_paid_now},${i.udhari_added},${i.status}`).join('\n');
    } else if (activeTab === 'inventory' && inventoryData) {
      csvContent = `Metric,Amount (INR)\n` +
        `Total Locked Capital (Wholesale Cost),${inventoryData.totalLockedCapital}\n` +
        `Total Shelf Retail Value,${inventoryData.totalSellingValue}\n` +
        `Potential Gross Margin,${inventoryData.potentialGrossMargin}\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Vyapar Accounting &amp; Business Reports
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            P&amp;L Statements, Product Margins, Khata Aging, Invoice Auditing &amp; Stock Capital
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* 1-Click CSV / Excel Export */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Excel / CSV</span>
          </button>

          {/* 1-Click PDF Export */}
          <button
            type="button"
            data-testid="export-pdf-btn"
            onClick={handleExportPdf}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Date Range Presets & Report Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        {/* 5 Report Tabs (REQ-14) */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0" data-testid="report-tabs">
          {[
            { id: 'pnl' as ReportTab, label: '1. Profit & Loss', icon: TrendingUp },
            { id: 'products' as ReportTab, label: '2. Product Margins', icon: ShoppingBag },
            { id: 'udhari' as ReportTab, label: '3. Customer Khata', icon: Users },
            { id: 'invoices' as ReportTab, label: '4. Daily Invoices', icon: Layers },
            { id: 'inventory' as ReportTab, label: '5. Stock Valuation', icon: Package },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`report-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-700 dark:bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Date Filter Segmented Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs" data-testid="date-preset-filter">
          <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5" />
          {[
            { id: 'TODAY' as DatePreset, label: 'Today' },
            { id: 'YESTERDAY' as DatePreset, label: 'Yesterday' },
            { id: 'THIS_WEEK' as DatePreset, label: 'Week' },
            { id: 'THIS_MONTH' as DatePreset, label: 'Month' },
            { id: 'ALL' as DatePreset, label: 'All' },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setDatePreset(btn.id)}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                datePreset === btn.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: PROFIT & LOSS STATEMENT (REQ-14.1 & REQ-21) */}
      {activeTab === 'pnl' && pnlData && (
        <div className="space-y-4" data-testid="pnl-container">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Sales Revenue</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1" data-testid="pnl-sales-revenue">
                {formatINR(pnlData.salesRevenue)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{pnlData.invoiceCount} Invoices</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Wholesale COGS</span>
              <p className="text-xl font-bold text-slate-700 dark:text-slate-300 mt-1" data-testid="pnl-cogs">
                {formatINR(pnlData.cogs)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Inventory purchase cost</p>
            </div>

            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase">Gross Profit</span>
              <p className="text-xl font-extrabold text-[#16a34a] dark:text-emerald-400 mt-1" data-testid="pnl-gross-profit">
                {formatINR(pnlData.grossProfit)}
              </p>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-500">Revenue - COGS</p>
            </div>

            <div className="bg-blue-50/70 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-800 dark:text-blue-400 uppercase">TRUE NET PROFIT</span>
              <p className="text-xl font-extrabold text-blue-900 dark:text-blue-300 mt-1" data-testid="pnl-true-net-profit">
                {formatINR(pnlData.trueNetProfit)}
              </p>
              <p className="text-[10px] text-blue-700 dark:text-blue-400">After shop expenses &amp; damage</p>
            </div>
          </div>

          {/* Breakdown Table & Home-Use Isolation Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                Operational Deductions Breakdown
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-600 dark:text-slate-400">Shop Operating Expenses (Rent, Elec, Bags):</span>
                  <span className="font-bold text-red-600 dark:text-red-400" data-testid="pnl-shop-expenses">
                    -{formatINR(pnlData.shopOperatingExpenses)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-600 dark:text-slate-400">Damage / Expired Stock Loss:</span>
                  <span className="font-bold text-red-600 dark:text-red-400" data-testid="pnl-damage-loss">
                    -{formatINR(pnlData.damageLoss)}
                  </span>
                </div>
              </div>
            </div>

            {/* Home Self-Use Isolation Card (REQ-20) */}
            <div className="bg-orange-50/70 dark:bg-orange-950/30 p-5 rounded-2xl border border-orange-200 dark:border-orange-800 shadow-2xs space-y-2">
              <h3 className="font-bold text-sm text-orange-900 dark:text-orange-300 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                Home / Personal Consumption Isolation (REQ-20)
              </h3>
              <p className="text-xs text-orange-800 dark:text-orange-300/80 leading-relaxed">
                Items taken by shop owner for personal household consumption are valued at wholesale cost and isolated from shop COGS to ensure true retail profit margins are not diluted.
              </p>
              <div className="pt-2 flex justify-between items-center text-xs border-t border-orange-200 dark:border-orange-800/60">
                <span className="font-semibold text-orange-900 dark:text-orange-200">Total Home Groceries Valuated:</span>
                <span className="text-base font-extrabold text-orange-950 dark:text-orange-300" data-testid="pnl-home-use">
                  {formatINR(pnlData.homeSelfUseValuation)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCT-WISE MARGIN REPORT (REQ-14.2) */}
      {activeTab === 'products' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden" data-testid="products-report-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3 text-right">Units Sold</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-right">Profit Generated</th>
                  <th className="p-3 text-center">Margin %</th>
                  <th className="p-3 text-right">Remaining Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {productsData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 dark:text-slate-500">
                      No product sales recorded in this period.
                    </td>
                  </tr>
                ) : (
                  productsData.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{p.name}</td>
                      <td className="p-3 text-right font-bold text-slate-700 dark:text-slate-300">
                        {p.qtySold} {p.unitType}
                      </td>
                      <td className="p-3 text-right font-medium text-slate-900 dark:text-slate-100">
                        {formatINR(p.revenue)}
                      </td>
                      <td className="p-3 text-right font-bold text-[#16a34a] dark:text-emerald-400">
                        {formatINR(p.profit)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {p.marginPct}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {p.currentStock} {p.unitType}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CUSTOMER UDHARI SUMMARY (REQ-14.3) */}
      {activeTab === 'udhari' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden" data-testid="udhari-report-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-3">Customer Name</th>
                  <th className="p-3">WhatsApp Phone</th>
                  <th className="p-3 text-right">Credit Limit</th>
                  <th className="p-3 text-right">Pending Udhari</th>
                  <th className="p-3 text-center">Aging Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {udhariData.map((c, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{c.name}</td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{c.phone}</td>
                    <td className="p-3 text-right text-slate-500 dark:text-slate-400">{formatINR(c.creditLimit)}</td>
                    <td className={`p-3 text-right font-extrabold ${c.balance > 0 ? 'text-[#dc2626] dark:text-red-400' : 'text-[#16a34a] dark:text-emerald-400'}`}>
                      {formatINR(c.balance)}
                    </td>
                    <td className="p-3 text-center text-slate-700 dark:text-slate-300">
                      {c.balance > 0 ? `${c.agingDays}d` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: DAILY BILL REGISTER & VOID ACTION (REQ-14.4 & REQ-34 / AT-09) */}
      {activeTab === 'invoices' && (
        <div className="space-y-3" data-testid="invoices-report-container">
          {/* Bulk Invoices Action Bar */}
          {selectedInvoiceIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-red-50 dark:bg-slate-800 border-2 border-red-500 rounded-2xl shadow-sm">
              <span className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-bold">
                {selectedInvoiceIds.size} Invoices Selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBulkVoiding}
                  onClick={handleBulkVoidInvoices}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Bulk Void Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceIds(new Set())}
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  title="Deselect All"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={invoicesData.length > 0 && selectedInvoiceIds.size === invoicesData.length}
                        onChange={handleToggleSelectAllInvoices}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Select All"
                      />
                    </th>
                    <th className="p-3">Invoice Number</th>
                    <th className="p-3">Time</th>
                    <th className="p-3 text-right">Grand Total</th>
                    <th className="p-3 text-center">Mode</th>
                    <th className="p-3 text-right">Paid Now</th>
                    <th className="p-3 text-right">Udhari</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoicesData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400 dark:text-slate-500">
                        No invoices found for this date range.
                      </td>
                    </tr>
                  ) : (
                    invoicesData.map((inv) => (
                      <tr
                        key={inv.id}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 ${
                          selectedInvoiceIds.has(inv.id) ? 'bg-red-50/30 dark:bg-red-950/20' : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedInvoiceIds.has(inv.id)}
                            onChange={() => handleToggleSelectInvoice(inv.id)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-blue-900 dark:text-blue-300">
                          {inv.invoice_number}
                        </td>
                        <td className="p-3 text-slate-500 dark:text-slate-400 font-mono">
                          {new Date(inv.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="p-3 text-right font-extrabold text-slate-900 dark:text-white">
                          {formatINR(inv.grand_total)}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {inv.payment_mode}
                          </span>
                        </td>
                        <td className="p-3 text-right text-emerald-700 dark:text-emerald-400 font-bold">
                          {formatINR(inv.amount_paid_now)}
                        </td>
                        <td className="p-3 text-right text-red-600 dark:text-red-400 font-bold">
                          {formatINR(inv.udhari_added)}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              inv.status === 'COMPLETED'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                : inv.status === 'RETURNED'
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300'
                                : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
                            }`}
                          >
                            {inv.status === 'RETURNED' && inv.credit_note_number
                              ? `RETURNED (${inv.credit_note_number})`
                              : inv.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* View Slip / Thermal Receipt */}
                            <button
                              type="button"
                              onClick={() => handleViewSlip(inv)}
                              title="View Thermal Slip / WhatsApp Share"
                              className="p-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg text-[10px] font-bold transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Return / Revise Bill (Iteration 3) */}
                            {inv.status === 'COMPLETED' ? (
                              <button
                                type="button"
                                data-testid={`return-bill-btn-${inv.id}`}
                                onClick={() => setReturnInvoice(inv)}
                                title="↩️ Return / Revise Bill (Issues Credit Note & Restores Stock)"
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                              >
                                <Undo2 className="w-3 h-3" /> Return
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 italic">
                                Locked ({inv.status})
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INVENTORY VALUATION REPORT (REQ-14.5) */}
      {activeTab === 'inventory' && inventoryData && (
        <div className="space-y-4" data-testid="inventory-report-container">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-blue-50/70 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-800 dark:text-blue-400 uppercase">
                Total Locked Capital (Wholesale Cost)
              </span>
              <p className="text-2xl font-extrabold text-blue-950 dark:text-blue-200 mt-1" data-testid="locked-capital">
                {formatINR(inventoryData.totalLockedCapital)}
              </p>
              <p className="text-[10px] text-blue-700 dark:text-blue-400">&sum;(current_stock &times; purchase_price)</p>
            </div>

            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase">
                Total Shelf Retail Value
              </span>
              <p className="text-2xl font-extrabold text-emerald-950 dark:text-emerald-200 mt-1">
                {formatINR(inventoryData.totalSellingValue)}
              </p>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-400">If all shelf stock is sold</p>
            </div>

            <div className="bg-purple-50/70 dark:bg-purple-950/30 p-4 rounded-2xl border border-purple-200 dark:border-purple-800 shadow-2xs">
              <span className="text-[11px] font-bold text-purple-800 dark:text-purple-400 uppercase">
                Potential Gross Margin in Stock
              </span>
              <p className="text-2xl font-extrabold text-purple-950 dark:text-purple-200 mt-1">
                {formatINR(inventoryData.potentialGrossMargin)}
              </p>
              <p className="text-[10px] text-purple-700 dark:text-purple-400">Shelf gross margin potential</p>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal for Viewing/Printing/Sharing Thermal Slip */}
      <ReceiptModal
        isOpen={!!viewReceiptInvoice}
        onClose={() => setViewReceiptInvoice(null)}
        invoice={viewReceiptInvoice}
        items={viewReceiptItems}
        profile={defaultProfile}
        customer={viewReceiptCustomer}
      />

      {/* Sales Return & Credit Note Modal (Iteration 3) */}
      <SalesReturnModal
        isOpen={!!returnInvoice}
        onClose={() => setReturnInvoice(null)}
        invoice={returnInvoice}
        onSuccess={handleReturnCompleted}
      />
    </div>
  );
};

