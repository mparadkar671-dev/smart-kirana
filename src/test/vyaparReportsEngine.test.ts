import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { ReportsService, buildFormattedExcelSheet } from '../services/reportsService';
import { BillingService } from '../services/billingService';
import { GallaService } from '../services/gallaService';
import { ShopProfile, WALK_IN_CUSTOMER_ID } from '../types';
import * as XLSX from 'xlsx';

describe('Iteration 5: Vyapar Premium Reports & Multi-Sheet Excel Engine', () => {
  const mockShopProfile: ShopProfile = {
    id: 'current_shop',
    shop_id: 'shop_test_1',
    shop_name: 'Mayuresh Kirana Superstore',
    owner_name: 'Mayuresh Paradkar',
    phone: '9876543210',
    upi_vpa: 'mayuresh@upi',
    address: 'Main Market, Station Road',
    gst_footer_note: 'Thank you for shopping with us!',
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    await db.resetToDemoState();
  });

  // =========================================================================
  // 1. P&L TRUE PROFIT & COGS MARGIN MATHEMATICAL VERIFICATION GATE
  // =========================================================================
  it('Verification Gate 5: Net Profit strictly equals SUM(sale_items.selling_total - sale_items.cogs_total) - SUM(operating_expenses)', async () => {
    // 1. Clear invoices and expenses for controlled accounting test
    await db.sales_invoices.clear();
    await db.sale_items.clear();
    await db.expenses_and_drawings.clear();
    await db.inventory_logs.clear();

    const prod1 = (await db.products.get('prod-001'))!; // purchase 24, selling 28
    const prod2 = (await db.products.get('prod-002'))!; // purchase 135, selling 155

    // Sale 1: 5 units of prod1 (selling 5*28 = 140, cogs 5*24 = 120, profit = 20)
    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: prod1,
          qty: 5,
          unit_selling_price: prod1.selling_price,
          unit_purchase_cost: prod1.purchase_price,
          line_total: 5 * prod1.selling_price,
        },
      ],
      subtotalAmount: 5 * prod1.selling_price,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 5 * prod1.selling_price,
      udhariAdded: 0,
    });

    // Sale 2: 2 units of prod2 (selling 2*155 = 310, cogs 2*135 = 270, profit = 40)
    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: prod2,
          qty: 2,
          unit_selling_price: prod2.selling_price,
          unit_purchase_cost: prod2.purchase_price,
          line_total: 2 * prod2.selling_price,
        },
      ],
      subtotalAmount: 2 * prod2.selling_price,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 2 * prod2.selling_price,
      udhariAdded: 0,
    });

    // Total Selling Total = 140 + 310 = 450
    // Total COGS Total = 120 + 270 = 390
    // Gross Profit = 450 - 390 = 60

    // Record Shop Operating Expenses (Rent & Polybags) = ₹25.00
    await GallaService.recordExpense({
      category: 'SHOP_EXPENSE_TRANSPORT_BAGS',
      amount: 25.00,
      paidVia: 'CASH_GALLA',
      description: 'Polybags',
    });

    // Record Owner Personal Cash Drawing = ₹100.00 (MUST BE ISOLATED from operating expenses)
    await GallaService.recordExpense({
      category: 'OWNER_CASH_DRAWING',
      amount: 100.00,
      paidVia: 'CASH_GALLA',
      description: 'Owner family cash withdrawal',
    });

    // Record Home Consumption = ₹50.00 (MUST BE ISOLATED from shop COGS & expenses)
    await GallaService.recordExpense({
      category: 'HOME_SELF_USE_GOODS',
      amount: 50.00,
      paidVia: 'INVENTORY_DEDUCTION',
      description: 'Home cooking oil & sugar',
    });

    const pnl = await ReportsService.getProfitAndLossData();

    // Verify mathematical identities:
    const expectedSalesRevenue = 450.00;
    const expectedCogs = 390.00;
    const expectedGrossProfit = 60.00; // 450 - 390
    const expectedOperatingExpenses = 25.00; // Only polybags
    const expectedNetProfit = 35.00; // 60 - 25

    expect(pnl.salesRevenue).toBe(expectedSalesRevenue);
    expect(pnl.cogs).toBe(expectedCogs);
    expect(pnl.grossProfit).toBe(expectedGrossProfit);
    expect(pnl.shopOperatingExpenses).toBe(expectedOperatingExpenses);
    expect(pnl.ownerDrawings).toBe(100.00);
    expect(pnl.homeSelfUseValuation).toBe(50.00);

    // Strict formula verification:
    // Net Profit == SUM(sale_items.selling_total - sale_items.cogs_total) - SUM(operating_expenses)
    expect(pnl.trueNetProfit).toBe(expectedNetProfit);

    // Verify sum of item-wise profits matches gross profit
    const sumItemProfits = pnl.itemWise.reduce((sum, item) => sum + item.profit, 0);
    expect(sumItemProfits).toBe(expectedGrossProfit);
  });

  // =========================================================================
  // 2. CUSTOMER KHATA AGING & RECOVERY SHEET (0-15d, 16-30d, >30d)
  // =========================================================================
  it('categorizes customer debts accurately into 0-15d, 16-30d, and >30d risk brackets', async () => {
    await db.customers.clear();

    const now = Date.now();
    const day = 86400000;

    // Customer 1: 5 days old (0-15d, Safe)
    await db.customers.add({
      id: 'cust-safe',
      shop_id: 'shop_test_1',
      name: 'Ramesh Recent',
      phone: '9876500001',
      credit_limit: 5000,
      current_udhari_balance: 1200,
      oldest_unpaid_date: new Date(now - 5 * day).toISOString(),
      created_at: new Date().toISOString(),
    });

    // Customer 2: 20 days old (16-30d, Moderate Risk)
    await db.customers.add({
      id: 'cust-mod',
      shop_id: 'shop_test_1',
      name: 'Sunil Medium',
      phone: '9876500002',
      credit_limit: 3000,
      current_udhari_balance: 1800,
      oldest_unpaid_date: new Date(now - 20 * day).toISOString(),
      created_at: new Date().toISOString(),
    });

    // Customer 3: 45 days old (>30d, High Risk / Critical)
    await db.customers.add({
      id: 'cust-critical',
      shop_id: 'shop_test_1',
      name: 'Anil Overdue',
      phone: '9876500003',
      credit_limit: 2000,
      current_udhari_balance: 2500, // Exceeds credit limit too
      oldest_unpaid_date: new Date(now - 45 * day).toISOString(),
      created_at: new Date().toISOString(),
    });

    const aging = await ReportsService.getCustomerKhataAgingData();

    expect(aging.totalOutstanding).toBe(1200 + 1800 + 2500);
    expect(aging.totalIn0to15).toBe(1200);
    expect(aging.totalIn16to30).toBe(1800);
    expect(aging.totalInAbove30).toBe(2500);
    expect(aging.highRiskCount).toBeGreaterThanOrEqual(1);

    const safeCust = aging.customers.find((c) => c.id === 'cust-safe');
    expect(safeCust?.riskBucket).toBe('0-15 Days');

    const modCust = aging.customers.find((c) => c.id === 'cust-mod');
    expect(modCust?.riskBucket).toBe('16-30 Days');

    const critCust = aging.customers.find((c) => c.id === 'cust-critical');
    expect(critCust?.riskBucket).toBe('> 30 Days');
    expect(critCust?.recoveryStatus).toBe('CRITICAL_OVERDUE');
  });

  // =========================================================================
  // 3. STOCK VALUATION & DEAD-STOCK AUDIT (0 sales in 45+ days)
  // =========================================================================
  it('identifies dead stock with zero sales in 45+ days and computes locked working capital', async () => {
    const valuation = await ReportsService.getStockValuationAndDeadStockData();

    expect(valuation.totalLockedCapital).toBeGreaterThan(0);
    expect(valuation.totalRetailValue).toBeGreaterThan(valuation.totalLockedCapital);
    expect(valuation.potentialGrossMargin).toBe(valuation.totalRetailValue - valuation.totalLockedCapital);

    // Verify all items have movement status assigned
    for (const item of valuation.items) {
      expect(['DEAD_STOCK', 'SLOW_MOVING', 'ACTIVE']).toContain(item.movementStatus);
      if (item.isDeadStock) {
        expect(item.daysSinceLastSale).toBeGreaterThanOrEqual(45);
        expect(item.currentStock).toBeGreaterThan(0);
      }
    }
  });

  // =========================================================================
  // 4. SMART WHOLESALER REORDER & 14-DAY VELOCITY
  // =========================================================================
  it('computes 14-day sales velocity and suggested wholesaler reorder quantities', async () => {
    const prod = (await db.products.get('prod-001'))!;

    // Perform sale of 14 units today (velocity = 14 / 14 = 1.0 unit/day)
    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: prod,
          qty: 14,
          unit_selling_price: prod.selling_price,
          unit_purchase_cost: prod.purchase_price,
          line_total: 14 * prod.selling_price,
        },
      ],
      subtotalAmount: 14 * prod.selling_price,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 14 * prod.selling_price,
      udhariAdded: 0,
    });

    const reorder = await ReportsService.getSmartWholesalerReorderData();
    const item = reorder.items.find((i) => i.id === 'prod-001');

    expect(item).toBeDefined();
    expect(item!.sold14d).toBeGreaterThanOrEqual(14);
    expect(item!.velocityPerDay).toBeGreaterThanOrEqual(1.0);
    expect(reorder.totalEstimatedBudget).toBeGreaterThanOrEqual(0);
  });

  // =========================================================================
  // 5. DAILY GALLA SHIFT & CASH RECONCILIATION
  // =========================================================================
  it('tracks daily drawer float, counter cash flow, and discrepancies accurately', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Opening ₹1,000
    await GallaService.setOpeningCash(today, 1000.00);

    // Counted ₹950 (shortage of ₹50)
    await GallaService.recordEveningCashCount(today, 950.00);

    const audit = await ReportsService.getDailyGallaShiftAuditData();
    const session = audit.sessions.find((s) => s.sessionDate === today);

    expect(session).toBeDefined();
    expect(session!.openingCash).toBe(1000.00);
    expect(session!.actualCounted).toBe(950.00);
    expect(session!.discrepancy).toBe(-50.00);
    expect(session!.tallyStatus).toContain('SHORTAGE');
  });

  // =========================================================================
  // 6. SALES RETURN & STOCK ADJUSTMENT AUDIT
  // =========================================================================
  it('logs sales returns, credit notes, and damage adjustments in unified audit log', async () => {
    // Perform a sale first
    const prod = (await db.products.get('prod-001'))!;
    const { invoice } = await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: prod,
          qty: 2,
          unit_selling_price: 100.00,
          unit_purchase_cost: 80.00,
          line_total: 200.00,
        },
      ],
      subtotalAmount: 200.00,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 200.00,
      udhariAdded: 0,
    });

    // Execute sales return
    await BillingService.processSalesReturn({
      invoiceId: invoice.id,
      reason: 'CUSTOMER_RETURN',
      userRole: 'OWNER',
    });

    const audit = await ReportsService.getSalesReturnAndStockAdjustmentData();
    expect(audit.totalReturnsCount).toBeGreaterThanOrEqual(1);
    expect(audit.totalReturnsAmount).toBeGreaterThanOrEqual(200.00);

    const retItem = audit.returns.find((r) => r.invoiceNumber === invoice.invoice_number);
    expect(retItem).toBeDefined();
    expect(retItem?.amount).toBe(200.00);
  });

  // =========================================================================
  // 7. HSN / GST TAX SUMMARY REGISTER
  // =========================================================================
  it('computes HSN categories with 50/50 CGST and SGST splits', async () => {
    const taxSummary = await ReportsService.getHsnTaxSummaryData();

    expect(taxSummary.totalGrossSales).toBeGreaterThanOrEqual(0);
    // CGST and SGST must match exactly (50/50 split of GST)
    expect(taxSummary.totalCgst).toBe(taxSummary.totalSgst);
    expect(taxSummary.totalGstAmount).toBe(taxSummary.totalCgst + taxSummary.totalSgst);

    for (const cat of taxSummary.hsnCategories) {
      expect(cat.cgst).toBe(cat.sgst);
      expect(cat.totalGst).toBe(cat.cgst + cat.sgst);
    }
  });

  // =========================================================================
  // 8. MASTER 7-SHEET EXCEL WORKBOOK GENERATION & PARSING GATE
  // =========================================================================
  it('generates multi-sheet Vyapar master Excel workbook containing all 7 sheets with Store Header and Totals rows', async () => {
    // 1. Verify buildFormattedExcelSheet produces !cols auto-sizing
    const testWs = buildFormattedExcelSheet({
      sheetName: 'TestSheet',
      shopName: mockShopProfile.shop_name,
      reportTitle: 'Test Report Title',
      headers: ['Col A', 'Col B', 'Amount (₹)'],
      rows: [['Val 1', 'Val 2', 500]],
      totalsRow: ['TOTAL', '', 500],
    });
    expect(testWs['!cols']).toBeDefined();
    expect(testWs['!cols']!.length).toBe(3);

    // 2. Generate Master 7-Sheet Workbook
    const xlsxBuffer = await ReportsService.generateVyaparMasterExcelPack(mockShopProfile);

    expect(xlsxBuffer).toBeDefined();
    expect(xlsxBuffer.length).toBeGreaterThan(1000);

    // Parse the generated workbook back using SheetJS
    const wb = XLSX.read(xlsxBuffer, { type: 'array' });

    // Verify all 7 required sheets exist
    expect(wb.SheetNames.length).toBe(7);
    expect(wb.SheetNames).toContain('1_PnL_Profit_Margin');
    expect(wb.SheetNames).toContain('2_Khata_Aging_Recovery');
    expect(wb.SheetNames).toContain('3_Stock_Valuation_DeadStock');
    expect(wb.SheetNames).toContain('4_Wholesaler_Reorder');
    expect(wb.SheetNames).toContain('5_Galla_CashFlow_Audit');
    expect(wb.SheetNames).toContain('6_Returns_Adjustments_Audit');
    expect(wb.SheetNames).toContain('7_HSN_Tax_Summary');

    // Inspect Sheet 1: P&L
    const sheet1 = wb.Sheets['1_PnL_Profit_Margin'];
    expect(sheet1).toBeDefined();
    const sheet1Data = XLSX.utils.sheet_to_json(sheet1, { header: 1 }) as any[][];

    // Row 0: Store Name Header
    expect(sheet1Data[0][0]).toBe(mockShopProfile.shop_name);
    // Row 1: Report Title
    expect(sheet1Data[1][0]).toContain('Profit');
    // Row 2: Metadata (Date Range & Generated By)
    expect(sheet1Data[2][0]).toContain(mockShopProfile.owner_name);

    // Bottom Totals Row must exist
    const lastRow = sheet1Data[sheet1Data.length - 1];
    expect(lastRow[0]).toContain('TOTAL');
  });
});
