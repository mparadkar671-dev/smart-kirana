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
  Calendar,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Users,
  Package,
  Layers,
  RotateCcw,
  AlertTriangle,
  Eye,
  Trash2,
  X,
  Clock,
  Truck,
  Receipt,
  FileText,
  Send,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';

interface ReportsViewProps {
  shopProfile?: ShopProfile | null;
  onDataChanged?: () => void;
}

export type ReportTab =
  | 'pnl'
  | 'products'
  | 'udhari'
  | 'inventory'
  | 'reorder'
  | 'galla'
  | 'returns'
  | 'tax'
  | 'invoices';

export type DatePreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL';

function downloadFileBlob(buffer: ArrayBuffer | Uint8Array, filename: string, mimeType: string) {
  const blob = new Blob([buffer as any], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const ReportsView: React.FC<ReportsViewProps> = ({ shopProfile, onDataChanged }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('pnl');
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [isLoading, setIsLoading] = useState(false);

  // 7 Standardized Reports Data States
  const [pnlData, setPnlData] = useState<any>(null);
  const [productsData, setProductsData] = useState<any[]>([]);
  const [udhariData, setUdhariData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [reorderData, setReorderData] = useState<any>(null);
  const [gallaData, setGallaData] = useState<any>(null);
  const [returnsData, setReturnsData] = useState<any>(null);
  const [taxData, setTaxData] = useState<any>(null);
  const [invoicesData, setInvoicesData] = useState<SalesInvoice[]>([]);

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
    owner_name: 'Store Owner',
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
      if (activeTab === 'pnl' || activeTab === 'products') {
        const pnl = await ReportsService.getProfitAndLossData(range);
        setPnlData(pnl);
        setProductsData(pnl.itemWise || []);
      } else if (activeTab === 'udhari') {
        const udh = await ReportsService.getCustomerKhataAgingData();
        setUdhariData(udh);
      } else if (activeTab === 'inventory') {
        const invVal = await ReportsService.getStockValuationAndDeadStockData();
        setInventoryData(invVal);
      } else if (activeTab === 'reorder') {
        const reord = await ReportsService.getSmartWholesalerReorderData();
        setReorderData(reord);
      } else if (activeTab === 'galla') {
        const gal = await ReportsService.getDailyGallaShiftAuditData(range);
        setGallaData(gal);
      } else if (activeTab === 'returns') {
        const ret = await ReportsService.getSalesReturnAndStockAdjustmentData(range);
        setReturnsData(ret);
      } else if (activeTab === 'tax') {
        const tx = await ReportsService.getHsnTaxSummaryData(range);
        setTaxData(tx);
      } else if (activeTab === 'invoices') {
        const invs = await ReportsService.getBillRegisterData(range);
        setInvoicesData(invs);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Download Master 7-Sheet Vyapar Excel Workbook
  const handleDownloadMasterExcel = async () => {
    try {
      const range = getDateRange();
      const xlsxBuffer = await ReportsService.generateVyaparMasterExcelPack(defaultProfile, range);
      const dateStr = new Date().toISOString().split('T')[0];
      downloadFileBlob(
        xlsxBuffer,
        `Vyapar_Master_Pack_7_Sheets_${dateStr}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    } catch (err: any) {
      alert(`Master Excel generation failed: ${err.message}`);
    }
  };

  // Download Tab-Specific Formatted Excel (.xlsx)
  const handleExportCurrentExcel = async () => {
    const range = getDateRange();
    const dateStr = new Date().toISOString().split('T')[0];
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    try {
      if (activeTab === 'pnl' || activeTab === 'products') {
        const res = await ReportsService.generateProfitAndLossReport(defaultProfile, range);
        downloadFileBlob(res.xlsxBuffer, `Profit_Loss_Report_${dateStr}.xlsx`, mime);
      } else if (activeTab === 'udhari') {
        const res = await ReportsService.generateCustomerKhataAgingReport(defaultProfile);
        downloadFileBlob(res.xlsxBuffer, `Khata_Aging_Recovery_${dateStr}.xlsx`, mime);
      } else if (activeTab === 'inventory') {
        const res = await ReportsService.generateStockValuationReport(defaultProfile);
        downloadFileBlob(res.xlsxBuffer, `Stock_Valuation_DeadStock_${dateStr}.xlsx`, mime);
      } else if (activeTab === 'reorder') {
        const res = await ReportsService.generateWholesalerReorderReport(defaultProfile);
        downloadFileBlob(res.xlsxBuffer, `Wholesaler_Reorder_Sheet_${dateStr}.xlsx`, mime);
      } else if (activeTab === 'galla') {
        const res = await ReportsService.generateGallaAuditReport(defaultProfile, range);
        downloadFileBlob(res.xlsxBuffer, `Galla_CashFlow_Audit_${dateStr}.xlsx`, mime);
      } else if (activeTab === 'returns') {
        const res = await ReportsService.generateSalesReturnAuditReport(defaultProfile, range);
        downloadFileBlob(res.xlsxBuffer, `Returns_Adjustments_Audit_${dateStr}.xlsx`, mime);
      } else if (activeTab === 'tax') {
        const res = await ReportsService.generateHsnTaxSummaryReport(defaultProfile, range);
        downloadFileBlob(res.xlsxBuffer, `HSN_GST_Tax_Summary_${dateStr}.xlsx`, mime);
      } else if (activeTab === 'invoices') {
        const res = await ReportsService.generateBillRegisterReport(defaultProfile, range);
        downloadFileBlob(res.xlsxBuffer, `Daily_Bill_Register_${dateStr}.xlsx`, mime);
      }
    } catch (err: any) {
      alert(`Excel export failed: ${err.message}`);
    }
  };

  // Export PDF Trigger
  const handleExportPdf = async () => {
    const range = getDateRange();
    const dateStr = new Date().toISOString().split('T')[0];
    const mime = 'application/pdf';

    try {
      let res: { pdfBuffer: ArrayBuffer };
      if (activeTab === 'pnl' || activeTab === 'products') {
        res = await ReportsService.generateProfitAndLossReport(defaultProfile, range);
        downloadFileBlob(res.pdfBuffer, `Profit_Loss_${dateStr}.pdf`, mime);
      } else if (activeTab === 'udhari') {
        res = await ReportsService.generateCustomerKhataAgingReport(defaultProfile);
        downloadFileBlob(res.pdfBuffer, `Khata_Aging_${dateStr}.pdf`, mime);
      } else if (activeTab === 'inventory') {
        res = await ReportsService.generateStockValuationReport(defaultProfile);
        downloadFileBlob(res.pdfBuffer, `Stock_Valuation_${dateStr}.pdf`, mime);
      } else if (activeTab === 'reorder') {
        res = await ReportsService.generateWholesalerReorderReport(defaultProfile);
        downloadFileBlob(res.pdfBuffer, `Wholesaler_Reorder_${dateStr}.pdf`, mime);
      } else if (activeTab === 'galla') {
        res = await ReportsService.generateGallaAuditReport(defaultProfile, range);
        downloadFileBlob(res.pdfBuffer, `Galla_Audit_${dateStr}.pdf`, mime);
      } else if (activeTab === 'returns') {
        res = await ReportsService.generateSalesReturnAuditReport(defaultProfile, range);
        downloadFileBlob(res.pdfBuffer, `Returns_Audit_${dateStr}.pdf`, mime);
      } else if (activeTab === 'tax') {
        res = await ReportsService.generateHsnTaxSummaryReport(defaultProfile, range);
        downloadFileBlob(res.pdfBuffer, `HSN_Tax_Summary_${dateStr}.pdf`, mime);
      } else if (activeTab === 'invoices') {
        res = await ReportsService.generateBillRegisterReport(defaultProfile, range);
        downloadFileBlob(res.pdfBuffer, `Bill_Register_${dateStr}.pdf`, mime);
      }
    } catch (err: any) {
      alert(`PDF export failed: ${err.message}`);
    }
  };

  // Void Invoice Action
  const handleVoidInvoice = async (inv: SalesInvoice) => {
    if (
      window.confirm(
        `Are you sure you want to VOID invoice ${inv.invoice_number}? This will restore product stock and reverse any added Udhari.`
      )
    ) {
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
    if (
      !window.confirm(
        `Are you sure you want to VOID ${selectedInvoiceIds.size} selected invoices? This will restore product stock and reverse any added Udhari.`
      )
    ) {
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

  // 1-Click WhatsApp payment reminder generator
  const sendWhatsAppReminder = (customer: any) => {
    const text = encodeURIComponent(
      `Namaste ${customer.name} ji, this is a friendly reminder from ${defaultProfile.shop_name}. Your outstanding Khata balance is ${formatINR(customer.balance)}. Kindly pay via UPI to ${defaultProfile.upi_vpa}. Thank you!`
    );
    window.open(`https://wa.me/91${customer.phone}?text=${text}`, '_blank');
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Top Header & Master Vyapar Excel Download */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Vyapar Accounting &amp; Business Intelligence Suite
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            7 Standardized Reports: True Net Profit, Khata Aging, Dead-Stock, 14-Day Velocity, Galla Drawer &amp; HSN GST
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Master 7-Sheet Excel Workbook Button */}
          <button
            type="button"
            onClick={handleDownloadMasterExcel}
            className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
            title="Download all 7 Vyapar reports in a single multi-sheet .xlsx file"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Master 7-Sheet Excel</span>
          </button>

          {/* Current Tab Formatted Excel (.xlsx) */}
          <button
            type="button"
            onClick={handleExportCurrentExcel}
            className="flex-1 sm:flex-initial px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
            title="Download active report in formatted Excel with store header & totals"
          >
            <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Export Excel</span>
          </button>

          {/* Current Tab Formatted PDF */}
          <button
            type="button"
            data-testid="export-pdf-btn"
            onClick={handleExportPdf}
            className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <FileText className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Date Range Presets & Report Tabs Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        {/* All 8 Report Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0" data-testid="report-tabs">
          {[
            { id: 'pnl' as ReportTab, label: '1. P&L & Margins', icon: TrendingUp },
            { id: 'products' as ReportTab, label: '2. Product Performance', icon: ShoppingBag },
            { id: 'udhari' as ReportTab, label: '3. Khata Aging', icon: Users },
            { id: 'inventory' as ReportTab, label: '4. Stock & Dead Stock', icon: Package },
            { id: 'reorder' as ReportTab, label: '5. Wholesaler Reorder', icon: Truck },
            { id: 'galla' as ReportTab, label: '6. Galla & Cash Flow', icon: DollarSign },
            { id: 'returns' as ReportTab, label: '7. Returns & Audit', icon: RotateCcw },
            { id: 'tax' as ReportTab, label: '8. HSN & GST Tax', icon: Receipt },
            { id: 'invoices' as ReportTab, label: '9. Bill Register', icon: Layers },
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

      {/* =========================================================================
          TAB 1: PROFIT & LOSS STATEMENT (REQ-14.1 & REQ-21)
          ========================================================================= */}
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
                <div className="flex justify-between py-1 pt-2 font-bold text-slate-900 dark:text-white">
                  <span>Net P&amp;L Formula:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    Gross ({formatINR(pnlData.grossProfit)}) - Deductions ({formatINR(pnlData.shopOperatingExpenses + pnlData.damageLoss)})
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

      {/* =========================================================================
          TAB 2: PRODUCT-WISE MARGIN REPORT (REQ-14.2)
          ========================================================================= */}
      {activeTab === 'products' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden" data-testid="products-report-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3 text-right">Units Sold</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-right">COGS</th>
                  <th className="p-3 text-right">Profit Generated</th>
                  <th className="p-3 text-center">Margin %</th>
                  <th className="p-3 text-right">Remaining Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {productsData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400 dark:text-slate-500">
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
                      <td className="p-3 text-right font-mono text-slate-500 dark:text-slate-400">
                        {formatINR(p.cogs)}
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

      {/* =========================================================================
          TAB 3: CUSTOMER KHATA AGING & RECOVERY (0-15d, 16-30d, >30d) (REQ-14.3)
          ========================================================================= */}
      {activeTab === 'udhari' && udhariData && (
        <div className="space-y-4" data-testid="udhari-report-container">
          {/* Risk Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Total Outstanding</span>
              <p className="text-xl font-extrabold text-red-600 dark:text-red-400 mt-1">
                {formatINR(udhariData.totalOutstanding)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{udhariData.customers.length} Accounts</p>
            </div>
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase">0-15 Days (Safe)</span>
              <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                {formatINR(udhariData.totalIn0to15)}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Current billing cycle</p>
            </div>
            <div className="bg-amber-50/70 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400 uppercase">16-30 Days (Follow-up)</span>
              <p className="text-xl font-extrabold text-amber-700 dark:text-amber-300 mt-1">
                {formatINR(udhariData.totalIn16to30)}
              </p>
              <p className="text-[10px] text-amber-600 dark:text-amber-500">Moderate risk</p>
            </div>
            <div className="bg-red-50/70 dark:bg-red-950/30 p-4 rounded-2xl border border-red-200 dark:border-red-800 shadow-2xs">
              <span className="text-[11px] font-bold text-red-800 dark:text-red-400 uppercase">&gt; 30 Days (Critical)</span>
              <p className="text-xl font-extrabold text-red-700 dark:text-red-300 mt-1">
                {formatINR(udhariData.totalInAbove30)}
              </p>
              <p className="text-[10px] text-red-600 dark:text-red-400">{udhariData.highRiskCount} High-risk accounts</p>
            </div>
          </div>

          {/* Aging Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Customer</th>
                    <th className="p-3">WhatsApp Phone</th>
                    <th className="p-3 text-right">Credit Limit</th>
                    <th className="p-3 text-right">Pending Udhari</th>
                    <th className="p-3 text-center">Aging</th>
                    <th className="p-3 text-center">Risk Bracket</th>
                    <th className="p-3 text-center">Recovery Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {udhariData.customers.map((c: any, idx: number) => {
                    const isHigh = c.recoveryStatus === 'CRITICAL_OVERDUE';
                    const isMed = c.recoveryStatus === 'FOLLOW_UP';
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{c.name}</td>
                        <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{c.phone}</td>
                        <td className="p-3 text-right text-slate-500 dark:text-slate-400">{formatINR(c.creditLimit)}</td>
                        <td className="p-3 text-right font-extrabold text-red-600 dark:text-red-400">
                          {formatINR(c.balance)}
                        </td>
                        <td className="p-3 text-center text-slate-700 dark:text-slate-300 font-bold">
                          {c.agingDays}d
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isHigh
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                : isMed
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {c.riskBucket}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => sendWhatsAppReminder(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition shadow-2xs"
                          >
                            <Send className="w-3 h-3" />
                            <span>Remind</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: STOCK VALUATION & DEAD-STOCK (45+ DAYS) (REQ-14.5)
          ========================================================================= */}
      {activeTab === 'inventory' && inventoryData && (
        <div className="space-y-4" data-testid="inventory-report-container">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Locked Capital</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {formatINR(inventoryData.totalLockedCapital)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">At wholesale cost price</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Shelf Retail Value</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {formatINR(inventoryData.totalRetailValue)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Estimated selling value</p>
            </div>
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase">Potential Margin</span>
              <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                {formatINR(inventoryData.potentialGrossMargin)}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Total unrealized profit</p>
            </div>
            <div className="bg-red-50/70 dark:bg-red-950/30 p-4 rounded-2xl border border-red-200 dark:border-red-800 shadow-2xs">
              <span className="text-[11px] font-bold text-red-800 dark:text-red-400 uppercase">Dead Stock Locked</span>
              <p className="text-xl font-extrabold text-red-700 dark:text-red-300 mt-1">
                {formatINR(inventoryData.totalDeadStockValuation)}
              </p>
              <p className="text-[10px] text-red-600 dark:text-red-400">{inventoryData.deadStockCount} items (0 sales in 45+ days)</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Current Stock</th>
                    <th className="p-3 text-right">Cost Price</th>
                    <th className="p-3 text-right">Selling Price</th>
                    <th className="p-3 text-right">Locked Capital</th>
                    <th className="p-3 text-center">Last Sale</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inventoryData.items.map((it: any, idx: number) => (
                    <tr key={idx} className={it.isDeadStock ? 'bg-red-50/40 dark:bg-red-950/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'}>
                      <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{it.name}</td>
                      <td className="p-3 text-slate-500 dark:text-slate-400">{it.category}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {it.currentStock} {it.unitType}
                      </td>
                      <td className="p-3 text-right text-slate-500 dark:text-slate-400">{formatINR(it.purchasePrice)}</td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300">{formatINR(it.sellingPrice)}</td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatINR(it.stockCost)}
                      </td>
                      <td className="p-3 text-center text-slate-600 dark:text-slate-400">
                        {it.lastSoldDate ? `${it.daysSinceLastSale}d ago` : 'Never'}
                      </td>
                      <td className="p-3 text-center">
                        {it.isDeadStock ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-600" />
                            <span>Dead Stock</span>
                          </span>
                        ) : it.movementStatus === 'SLOW_MOVING' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Slow Moving
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: SMART WHOLESALER REORDER SHEET (14-Day Velocity)
          ========================================================================= */}
      {activeTab === 'reorder' && reorderData && (
        <div className="space-y-4" data-testid="reorder-report-container">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            <div className="bg-amber-50/70 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400 uppercase">Items to Reorder</span>
              <p className="text-xl font-extrabold text-amber-800 dark:text-amber-300 mt-1">
                {reorderData.totalItemsNeedingReorder}
              </p>
              <p className="text-[10px] text-amber-700 dark:text-amber-500">Under threshold or &lt; 7d runway</p>
            </div>
            <div className="bg-blue-50/70 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-800 dark:text-blue-400 uppercase">Estimated Restock Budget</span>
              <p className="text-xl font-extrabold text-blue-800 dark:text-blue-300 mt-1">
                {formatINR(reorderData.totalEstimatedBudget)}
              </p>
              <p className="text-[10px] text-blue-700 dark:text-blue-400">At wholesale purchase prices</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Algorithm</span>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1 leading-snug">
                14-Day Velocity × 14-Day Safety Buffer + Low Stock Margin
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">Supplier / Mandi</th>
                    <th className="p-3 text-right">Stock</th>
                    <th className="p-3 text-right">Velocity</th>
                    <th className="p-3 text-center">Runway</th>
                    <th className="p-3 text-right font-bold text-blue-600">Suggested Reorder</th>
                    <th className="p-3 text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reorderData.items.map((it: any, idx: number) => (
                    <tr key={idx} className={it.needsReorder ? 'bg-amber-50/30 dark:bg-amber-950/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'}>
                      <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{it.name}</td>
                      <td className="p-3 text-slate-500 dark:text-slate-400">{it.supplierName}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {it.currentStock} {it.unitType}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {it.velocityPerDay}/d
                      </td>
                      <td className="p-3 text-center font-bold">
                        {it.daysOfStockLeft === 999 ? (
                          <span className="text-slate-400">Adequate</span>
                        ) : it.daysOfStockLeft <= 7 ? (
                          <span className="text-red-600 dark:text-red-400">{it.daysOfStockLeft}d left</span>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">{it.daysOfStockLeft}d left</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-700 dark:text-blue-400">
                        {it.needsReorder ? `${it.suggestedReorderQty} ${it.unitType}` : '-'}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {it.needsReorder ? formatINR(it.estimatedCost) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: DAILY GALLA SHIFT & CASH RECONCILIATION
          ========================================================================= */}
      {activeTab === 'galla' && gallaData && (
        <div className="space-y-4" data-testid="galla-report-container">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Cash Sales In</span>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                +{formatINR(gallaData.totalCashSales)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Counter cash billing</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Khata Cash Recovered</span>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                +{formatINR(gallaData.totalUdhariRecovered)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Customer repayments</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Cash Expenses Out</span>
              <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">
                -{formatINR(gallaData.totalExpensesOut)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Galla cash paid</p>
            </div>
            <div className="bg-blue-50/70 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-800 dark:text-blue-400 uppercase">Net Discrepancy</span>
              <p className="text-xl font-extrabold text-blue-900 dark:text-blue-300 mt-1">
                {formatINR(gallaData.totalDiscrepancy)}
              </p>
              <p className="text-[10px] text-blue-700 dark:text-blue-400">Total tally variance</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Shift Date</th>
                    <th className="p-3 text-right">Opening Float</th>
                    <th className="p-3 text-right">Cash Sales</th>
                    <th className="p-3 text-right">Udhari In</th>
                    <th className="p-3 text-right">Expenses Out</th>
                    <th className="p-3 text-right">Expected Drawer</th>
                    <th className="p-3 text-right">Actual Counted</th>
                    <th className="p-3 text-center">Tally Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {gallaData.sessions.map((s: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{s.sessionDate}</td>
                      <td className="p-3 text-right text-slate-600 dark:text-slate-400">{formatINR(s.openingCash)}</td>
                      <td className="p-3 text-right text-emerald-600 font-bold">{formatINR(s.cashSales)}</td>
                      <td className="p-3 text-right text-emerald-600 font-bold">{formatINR(s.cashRecovered)}</td>
                      <td className="p-3 text-right text-red-600 font-bold">{formatINR(s.expensesOut)}</td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatINR(s.expectedClosing)}</td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {s.actualCounted !== null ? formatINR(s.actualCounted) : 'OPEN'}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.tallyStatus.includes('TALLY')
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : s.tallyStatus.includes('SHORTAGE')
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          }`}
                        >
                          {s.tallyStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 7: SALES RETURN & STOCK ADJUSTMENT AUDIT LOG
          ========================================================================= */}
      {activeTab === 'returns' && returnsData && (
        <div className="space-y-4" data-testid="returns-report-container">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            <div className="bg-red-50/70 dark:bg-red-950/30 p-4 rounded-2xl border border-red-200 dark:border-red-800 shadow-2xs">
              <span className="text-[11px] font-bold text-red-800 dark:text-red-400 uppercase">Credit Notes Issued</span>
              <p className="text-xl font-extrabold text-red-700 dark:text-red-300 mt-1">
                {returnsData.totalReturnsCount} Bills
              </p>
              <p className="text-[10px] text-red-600 dark:text-red-400">Total refunded: {formatINR(returnsData.totalReturnsAmount)}</p>
            </div>
            <div className="bg-amber-50/70 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400 uppercase">Damage &amp; Expired Loss</span>
              <p className="text-xl font-extrabold text-amber-800 dark:text-amber-300 mt-1">
                {formatINR(returnsData.totalDamageLoss)}
              </p>
              <p className="text-[10px] text-amber-700 dark:text-amber-500">Unsalable inventory written off</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Stock Integrity</span>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1 leading-snug">
                All returns automatically write RETURN_IN logs to restore item counts.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Type</th>
                    <th className="p-3">CN # / Product</th>
                    <th className="p-3">Bill Ref / Notes</th>
                    <th className="p-3">Customer / Reason</th>
                    <th className="p-3 text-right">Adjustment Qty</th>
                    <th className="p-3 text-right">Impact Amount</th>
                    <th className="p-3 text-center">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {returnsData.returns.length === 0 && returnsData.adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400 dark:text-slate-500">
                        No returns or stock adjustments recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {returnsData.returns.map((r: any, idx: number) => (
                        <tr key={`ret-${idx}`} className="bg-red-50/20 dark:bg-red-950/10">
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                              Credit Note
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{r.creditNoteNumber}</td>
                          <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{r.invoiceNumber}</td>
                          <td className="p-3 text-slate-700 dark:text-slate-300">
                            {r.customerName} ({r.returnReason})
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400">-</td>
                          <td className="p-3 text-right font-bold text-red-600 dark:text-red-400">
                            -{formatINR(r.amount)}
                          </td>
                          <td className="p-3 text-center text-slate-500">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                      {returnsData.adjustments.map((a: any, idx: number) => (
                        <tr key={`adj-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              {a.reasonType}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{a.productName}</td>
                          <td className="p-3 text-slate-500 dark:text-slate-400">{a.notes || '-'}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">{a.reasonType}</td>
                          <td className="p-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">{a.changeQty}</td>
                          <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                            {formatINR(a.impactCost)}
                          </td>
                          <td className="p-3 text-center text-slate-500">{new Date(a.createdAt).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 8: HSN & GST TAX SUMMARY SHEET
          ========================================================================= */}
      {activeTab === 'tax' && taxData && (
        <div className="space-y-4" data-testid="tax-report-container">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Taxable Sales</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {formatINR(taxData.totalTaxableTurnover)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Excluding tax</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">CGST (Central)</span>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {formatINR(taxData.totalCgst)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">50% central tax</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">SGST (State)</span>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {formatINR(taxData.totalSgst)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">50% state tax</p>
            </div>
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase">Total GST Liability</span>
              <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                {formatINR(taxData.totalGstAmount)}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Total tax collected</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">HSN Code</th>
                    <th className="p-3">Product Category</th>
                    <th className="p-3 text-center">GST Slab</th>
                    <th className="p-3 text-right">Taxable Turnover</th>
                    <th className="p-3 text-right">CGST</th>
                    <th className="p-3 text-right">SGST</th>
                    <th className="p-3 text-right font-bold text-blue-600">Total GST</th>
                    <th className="p-3 text-right font-bold">Gross Invoiced Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {taxData.hsnCategories.map((c: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">{c.hsn}</td>
                      <td className="p-3 font-medium text-slate-700 dark:text-slate-300">{c.category}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {c.gstRate}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-900 dark:text-slate-100">{formatINR(c.taxableSales)}</td>
                      <td className="p-3 text-right text-slate-600 dark:text-slate-400">{formatINR(c.cgst)}</td>
                      <td className="p-3 text-right text-slate-600 dark:text-slate-400">{formatINR(c.sgst)}</td>
                      <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">{formatINR(c.totalGst)}</td>
                      <td className="p-3 text-right font-extrabold text-slate-900 dark:text-slate-100">{formatINR(c.grossTurnover)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 9: DAILY BILL REGISTER & VOID / RETURN ACTION (REQ-14.4 & REQ-34 / AT-09)
          ========================================================================= */}
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
                        className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="p-3">Invoice Number</th>
                    <th className="p-3">Date &amp; Time</th>
                    <th className="p-3">Payment Mode</th>
                    <th className="p-3 text-right">Grand Total</th>
                    <th className="p-3 text-right">Paid Now</th>
                    <th className="p-3 text-right">Udhari Added</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoicesData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400 dark:text-slate-500">
                        No sales invoices found for this date preset.
                      </td>
                    </tr>
                  ) : (
                    invoicesData.map((inv) => {
                      const isSelected = selectedInvoiceIds.has(inv.id);
                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 ${
                            isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectInvoice(inv.id)}
                              className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {inv.invoice_number}
                          </td>
                          <td className="p-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {new Date(inv.created_at).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">
                            {inv.payment_mode}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                            {formatINR(inv.grand_total)}
                          </td>
                          <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                            {formatINR(inv.amount_paid_now)}
                          </td>
                          <td className="p-3 text-right font-medium text-red-600 dark:text-red-400">
                            {inv.udhari_added > 0 ? formatINR(inv.udhari_added) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                inv.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : inv.status === 'RETURNED'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              }`}
                            >
                              {inv.status === 'RETURNED'
                                ? `RETURNED (${inv.credit_note_number || 'CN'})`
                                : inv.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* View Receipt */}
                              <button
                                type="button"
                                onClick={() => handleViewSlip(inv)}
                                className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition"
                                title="View Receipt Slip"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Return / Revise Bill (Iteration 3) */}
                              {inv.status === 'COMPLETED' && (
                                <button
                                  type="button"
                                  onClick={() => setReturnInvoice(inv)}
                                  className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-md text-[10px] font-bold transition flex items-center gap-1"
                                  title="Return Items or Revise Bill via Credit Note"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Return / Revise</span>
                                </button>
                              )}

                              {/* Void Invoice (REQ-34) */}
                              {inv.status === 'COMPLETED' && (
                                <button
                                  type="button"
                                  onClick={() => handleVoidInvoice(inv)}
                                  className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition"
                                  title="Void Invoice"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
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
      )}

      {/* View Receipt Slip Modal */}
      {viewReceiptInvoice && (
        <ReceiptModal
          isOpen={!!viewReceiptInvoice}
          invoice={viewReceiptInvoice}
          items={viewReceiptItems}
          customer={viewReceiptCustomer}
          profile={defaultProfile}
          onClose={() => setViewReceiptInvoice(null)}
        />
      )}

      {/* Sales Return / Credit Note & Re-Bill Modal (Iteration 3) */}
      {returnInvoice && (
        <SalesReturnModal
          isOpen={!!returnInvoice}
          invoice={returnInvoice}
          onClose={() => setReturnInvoice(null)}
          onSuccess={handleReturnCompleted}
        />
      )}
    </div>
  );
};
