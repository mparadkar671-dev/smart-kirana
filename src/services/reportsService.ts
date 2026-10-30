import { db } from '../db/db';
import {
  SalesInvoice,
  SaleItem,
  Product,
  Customer,
  ExpenseAndDrawing,
  InventoryLog,
  ShopProfile,
} from '../types';
import { formatINR, roundCurrency, toPaise, toRupees } from '../utils/math';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface DateFilterRange {
  startDate: string; // ISO or YYYY-MM-DD
  endDate: string; // ISO or YYYY-MM-DD
}

export class ReportsService {
  /**
   * Helper to filter records by created_at date range
   */
  static isDateInRange(dateStr: string, range?: DateFilterRange): boolean {
    if (!range) return true;
    const d = new Date(dateStr).getTime();
    const start = new Date(range.startDate).setHours(0, 0, 0, 0);
    const end = new Date(range.endDate).setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }

  // ==========================================
  // 1. PROFIT & LOSS STATEMENT (REQ-14.1 & REQ-21)
  // ==========================================
  static async getProfitAndLossData(range?: DateFilterRange) {
    const allInvoices = await db.sales_invoices.toArray();
    const activeInvoices = allInvoices.filter(
      (inv) => inv.status === 'COMPLETED' && this.isDateInRange(inv.created_at, range)
    );

    const allExpenses = await db.expenses_and_drawings.toArray();
    const filteredExpenses = allExpenses.filter((e) =>
      this.isDateInRange(e.created_at, range)
    );

    const allLogs = await db.inventory_logs.toArray();
    const damageLogs = allLogs.filter(
      (l) => l.reason_type === 'DAMAGE_EXPIRED_OUT' && this.isDateInRange(l.created_at, range)
    );

    // Sales Revenue & COGS
    const salesRevenue = activeInvoices.reduce((sum, inv) => sum + inv.grand_total, 0);
    const cogs = activeInvoices.reduce((sum, inv) => sum + inv.total_cogs, 0);
    const grossProfit = roundCurrency(salesRevenue - cogs);

    // Shop Expenses (Excludes personal home use and drawings)
    const shopOperatingExpenses = filteredExpenses
      .filter(
        (e) =>
          e.category === 'SHOP_EXPENSE_RENT_ELEC' ||
          e.category === 'SHOP_EXPENSE_TRANSPORT_BAGS'
      )
      .reduce((sum, e) => sum + e.amount, 0);

    // Damage & Expired Loss
    const damageLoss = damageLogs.reduce(
      (sum, l) => sum + Math.abs(l.change_qty) * l.unit_cost_at_time,
      0
    );

    // True Net Profit (Formula in Section 4.2):
    // True Net Profit = Gross Profit - Shop Expenses - Damage Loss
    const trueNetProfit = roundCurrency(grossProfit - shopOperatingExpenses - damageLoss);

    // Home Self-Use Goods Valuation (Isolated from P&L revenue / COGS)
    const homeSelfUseValuation = filteredExpenses
      .filter((e) => e.category === 'HOME_SELF_USE_GOODS')
      .reduce((sum, e) => sum + e.amount, 0);

    // Owner Cash Drawings
    const ownerDrawings = filteredExpenses
      .filter((e) => e.category === 'OWNER_CASH_DRAWING')
      .reduce((sum, e) => sum + e.amount, 0);

    return {
      salesRevenue: roundCurrency(salesRevenue),
      cogs: roundCurrency(cogs),
      grossProfit,
      shopOperatingExpenses: roundCurrency(shopOperatingExpenses),
      damageLoss: roundCurrency(damageLoss),
      trueNetProfit,
      homeSelfUseValuation: roundCurrency(homeSelfUseValuation),
      ownerDrawings: roundCurrency(ownerDrawings),
      invoiceCount: activeInvoices.length,
    };
  }

  static async generateProfitAndLossReport(
    shopProfile: ShopProfile,
    range?: DateFilterRange
  ): Promise<{ pdfBuffer: ArrayBuffer; xlsxBuffer: Uint8Array }> {
    const data = await this.getProfitAndLossData(range);

    // 1. Generate PDF
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(shopProfile.shop_name, 14, 15);
    doc.setFontSize(11);
    doc.text('Profit & Loss Accounting Statement', 14, 22);
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);

    const rows = [
      ['Sales Revenue (Gross Sales - Roundoff)', `Rs. ${data.salesRevenue.toFixed(2)}`],
      ['Cost of Goods Sold (COGS)', `Rs. ${data.cogs.toFixed(2)}`],
      ['Gross Profit Margin', `Rs. ${data.grossProfit.toFixed(2)}`],
      ['Shop Operating Expenses (Rent, Elec, Bags)', `Rs. ${data.shopOperatingExpenses.toFixed(2)}`],
      ['Damage & Expired Stock Loss', `Rs. ${data.damageLoss.toFixed(2)}`],
      ['TRUE NET PROFIT', `Rs. ${data.trueNetProfit.toFixed(2)}`],
      ['Personal Home Self-Use Goods (Isolated)', `Rs. ${data.homeSelfUseValuation.toFixed(2)}`],
      ['Owner Cash Drawings (Isolated)', `Rs. ${data.ownerDrawings.toFixed(2)}`],
    ];

    autoTable(doc, {
      startY: 34,
      head: [['Accounting Metric', 'Amount (INR)']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [30, 58, 138] },
    });

    const pdfBuffer = doc.output('arraybuffer');

    // 2. Generate Excel (.xlsx)
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [shopProfile.shop_name],
      ['Profit & Loss Statement'],
      ['Metric', 'Amount (INR)'],
      ...rows,
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Profit_Loss');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return { pdfBuffer, xlsxBuffer };
  }

  // ==========================================
  // 2. PRODUCT-WISE SALES & MARGIN REPORT (REQ-14.2)
  // ==========================================
  static async getProductWiseSalesData(range?: DateFilterRange) {
    const allInvoices = await db.sales_invoices.toArray();
    const validInvoices = allInvoices.filter(
      (inv) => inv.status === 'COMPLETED' && this.isDateInRange(inv.created_at, range)
    );
    const validInvoiceIds = new Set(validInvoices.map((inv) => inv.id));

    const saleItems = (await db.sale_items.toArray()).filter((item) =>
      validInvoiceIds.has(item.invoice_id)
    );

    const products = await db.products.toArray();
    const productMap = new Map(products.map((p) => [p.id, p]));

    const aggregation = new Map<
      string,
      {
        name: string;
        qtySold: number;
        revenue: number;
        cogs: number;
        currentStock: number;
        unitType: string;
      }
    >();

    for (const item of saleItems) {
      const prod = productMap.get(item.product_id);
      const existing = aggregation.get(item.product_id) || {
        name: item.product_name_snapshot,
        qtySold: 0,
        revenue: 0,
        cogs: 0,
        currentStock: prod ? prod.current_stock : 0,
        unitType: prod ? prod.unit_type : 'PCS',
      };

      existing.qtySold += item.qty;
      existing.revenue += item.line_total;
      existing.cogs += item.qty * item.unit_purchase_cost;
      aggregation.set(item.product_id, existing);
    }

    return Array.from(aggregation.values()).map((row) => {
      const profit = roundCurrency(row.revenue - row.cogs);
      const marginPct = row.revenue > 0 ? (profit / row.revenue) * 100 : 0;
      return {
        ...row,
        profit,
        marginPct: Math.round(marginPct * 10) / 10,
      };
    });
  }

  static async generateProductWiseReport(
    shopProfile: ShopProfile,
    range?: DateFilterRange
  ): Promise<{ pdfBuffer: ArrayBuffer; xlsxBuffer: Uint8Array }> {
    const data = await this.getProductWiseSalesData(range);

    // 1. PDF
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text(shopProfile.shop_name, 14, 15);
    doc.setFontSize(11);
    doc.text('Product-Wise Sales & Margin Performance Report', 14, 22);

    const rows = data.map((d, i) => [
      (i + 1).toString(),
      d.name,
      `${d.qtySold} ${d.unitType}`,
      `Rs. ${d.revenue.toFixed(2)}`,
      `Rs. ${d.profit.toFixed(2)}`,
      `${d.marginPct}%`,
      `${d.currentStock} ${d.unitType}`,
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['#', 'Product', 'Units Sold', 'Revenue', 'Profit', 'Margin %', 'Stock Left']],
      body: rows.length > 0 ? rows : [['-', 'No sales recorded in period', '-', '-', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
    });

    const pdfBuffer = doc.output('arraybuffer');

    // 2. Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [shopProfile.shop_name],
      ['Product-Wise Sales & Margin Report'],
      ['#', 'Product', 'Units Sold', 'Revenue (INR)', 'Profit (INR)', 'Margin %', 'Stock Left'],
      ...rows,
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Product_Sales');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return { pdfBuffer, xlsxBuffer };
  }

  // ==========================================
  // 3. CUSTOMER-WISE UDHARI SUMMARY REPORT (REQ-14.3)
  // ==========================================
  static async getCustomerUdhariSummaryData() {
    const customers = await db.customers.toArray();
    return customers
      .filter((c) => c.id !== '0000-WALK-IN')
      .map((c) => {
        const agingDays = c.oldest_unpaid_date
          ? Math.max(
              0,
              Math.floor((Date.now() - new Date(c.oldest_unpaid_date).getTime()) / (1000 * 60 * 60 * 24))
            )
          : 0;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          creditLimit: c.credit_limit,
          balance: c.current_udhari_balance,
          agingDays,
        };
      })
      .sort((a, b) => b.balance - a.balance);
  }

  static async generateCustomerUdhariReport(
    shopProfile: ShopProfile
  ): Promise<{ pdfBuffer: ArrayBuffer; xlsxBuffer: Uint8Array }> {
    const data = await this.getCustomerUdhariSummaryData();

    // 1. PDF
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text(shopProfile.shop_name, 14, 15);
    doc.setFontSize(11);
    doc.text('Customer Udhari & Khata Balance Summary', 14, 22);

    const rows = data.map((c, i) => [
      (i + 1).toString(),
      c.name,
      c.phone,
      `Rs. ${c.creditLimit.toFixed(2)}`,
      `Rs. ${c.balance.toFixed(2)}`,
      c.balance > 0 ? `${c.agingDays} days` : '-',
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['#', 'Customer Name', 'WhatsApp Phone', 'Credit Limit', 'Pending Balance', 'Aging']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [180, 30, 30] }, // Red for Udhari
    });

    const pdfBuffer = doc.output('arraybuffer');

    // 2. Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [shopProfile.shop_name],
      ['Customer Udhari Master Summary'],
      ['#', 'Customer Name', 'Phone', 'Credit Limit', 'Pending Udhari (INR)', 'Aging Days'],
      ...rows,
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Khata_Summary');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return { pdfBuffer, xlsxBuffer };
  }

  // ==========================================
  // 4. DAILY BILL REGISTER (REQ-14.4)
  // ==========================================
  static async getBillRegisterData(range?: DateFilterRange) {
    const invoices = await db.sales_invoices.toArray();
    return invoices
      .filter((inv) => this.isDateInRange(inv.created_at, range))
      .sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }

  static async generateBillRegisterReport(
    shopProfile: ShopProfile,
    range?: DateFilterRange
  ): Promise<{ pdfBuffer: ArrayBuffer; xlsxBuffer: Uint8Array }> {
    const invoices = await this.getBillRegisterData(range);
    const customers = await db.customers.toArray();
    const custMap = new Map(customers.map((c) => [c.id, c.name]));

    // 1. PDF
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text(shopProfile.shop_name, 14, 15);
    doc.setFontSize(11);
    doc.text('Daily Sales Invoices & Bill Register', 14, 22);

    const rows = invoices.map((inv) => {
      const dt = new Date(inv.created_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      const custName = custMap.get(inv.customer_id) || 'Walk-in';

      return [
        inv.invoice_number,
        dt,
        custName,
        `Rs. ${inv.grand_total.toFixed(2)}`,
        inv.payment_mode,
        `Rs. ${inv.amount_paid_now.toFixed(2)}`,
        `Rs. ${inv.udhari_added.toFixed(2)}`,
        inv.status,
      ];
    });

    autoTable(doc, {
      startY: 28,
      head: [['Invoice #', 'Date & Time', 'Customer', 'Total', 'Mode', 'Paid', 'Udhari', 'Status']],
      body: rows.length > 0 ? rows : [['-', '-', '-', '-', '-', '-', '-', 'No invoices']],
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
    });

    const pdfBuffer = doc.output('arraybuffer');

    // 2. Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [shopProfile.shop_name],
      ['Daily Bill Register Audit Log'],
      ['Invoice #', 'Date & Time', 'Customer', 'Grand Total', 'Payment Mode', 'Paid Now', 'Udhari Added', 'Status'],
      ...rows,
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Bill_Register');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return { pdfBuffer, xlsxBuffer };
  }

  // ==========================================
  // 5. INVENTORY VALUATION & LOW-STOCK REPORT (REQ-14.5)
  // ==========================================
  static async getInventoryValuationData() {
    const products = await db.products.toArray();
    let totalLockedCapital = 0;
    let totalSellingValue = 0;

    const items = products.map((p) => {
      const stockCost = roundCurrency(p.current_stock * p.purchase_price);
      const stockSelling = roundCurrency(p.current_stock * p.selling_price);
      totalLockedCapital += toPaise(stockCost);
      totalSellingValue += toPaise(stockSelling);

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        currentStock: p.current_stock,
        unitType: p.unit_type,
        purchasePrice: p.purchase_price,
        sellingPrice: p.selling_price,
        stockCost,
        stockSelling,
        isLowStock: p.current_stock <= p.low_stock_threshold,
      };
    });

    return {
      totalLockedCapital: toRupees(totalLockedCapital),
      totalSellingValue: toRupees(totalSellingValue),
      potentialGrossMargin: toRupees(totalSellingValue - totalLockedCapital),
      items,
    };
  }

  static async generateInventoryValuationReport(
    shopProfile: ShopProfile
  ): Promise<{ pdfBuffer: ArrayBuffer; xlsxBuffer: Uint8Array }> {
    const data = await this.getInventoryValuationData();

    // 1. PDF
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text(shopProfile.shop_name, 14, 15);
    doc.setFontSize(11);
    doc.text(`Inventory Valuation & Locked Capital Report (Total: Rs. ${data.totalLockedCapital.toFixed(2)})`, 14, 22);

    const rows = data.items.map((it, idx) => [
      (idx + 1).toString(),
      it.name,
      `${it.currentStock} ${it.unitType}`,
      `Rs. ${it.purchasePrice.toFixed(2)}`,
      `Rs. ${it.sellingPrice.toFixed(2)}`,
      `Rs. ${it.stockCost.toFixed(2)}`,
      it.isLowStock ? 'LOW STOCK' : 'OK',
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['#', 'Product', 'Current Stock', 'Wholesale Cost', 'Retail Price', 'Valuation Cost', 'Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
    });

    const pdfBuffer = doc.output('arraybuffer');

    // 2. Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [shopProfile.shop_name],
      ['Inventory Valuation & Working Capital Report'],
      [`Total Locked Working Capital: Rs. ${data.totalLockedCapital.toFixed(2)}`],
      ['#', 'Product Name', 'Current Stock', 'Cost Price', 'Selling Price', 'Valuation Cost (INR)', 'Status'],
      ...rows,
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory_Valuation');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return { pdfBuffer, xlsxBuffer };
  }
}

