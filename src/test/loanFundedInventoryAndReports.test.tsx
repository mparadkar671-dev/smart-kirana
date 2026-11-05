import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { db } from '../db/db';
import { LoanAccountService } from '../services/loanAccountService';
import { InventoryService } from '../services/inventoryService';
import { BillingService } from '../services/billingService';
import { ReportsService } from '../services/reportsService';
import { cloudSyncService } from '../services/cloudSyncService';
import { WALK_IN_CUSTOMER_ID } from '../types';
import { DEFAULT_SHOP_PROFILE } from '../db/seed';
import { StockAdjustmentModal } from '../components/inventory/StockAdjustmentModal';
import { ReportsView } from '../components/reports/ReportsView';

describe('Loan-Funded Stock Purchase, Sales, P&L & Daily Money Set-Aside Suite', () => {
  beforeEach(async () => {
    vi.spyOn(cloudSyncService, 'syncAllToCloud').mockResolvedValue({
      success: true,
      pushedCount: 0,
      errors: [],
    });
    vi.spyOn(cloudSyncService, 'syncProduct').mockResolvedValue(undefined);
    localStorage.clear();
    await db.clearAllRecordsToEmpty();
  });

  it('1. Creates Loan Accounts, links Product Restock (Stock In ++) to a selected Loan Amount, and tracks separate Purchase, Sale, Profit & Daily Set-Aside Money', async () => {
    // 1. Create two Loan Accounts (e.g., Mudra Loan ₹50,000 & Wholesaler Credit ₹20,000)
    const mudraLoan = await LoanAccountService.create({
      name: 'Mudra Loan ₹50,000',
      lender_name: 'State Bank of India',
      principal_amount: 50000,
    });
    const traderLoan = await LoanAccountService.create({
      name: 'APMC Mandi Credit ₹20,000',
      lender_name: 'Rameshwar Grain Trader',
      principal_amount: 20000,
    });

    const loans = await LoanAccountService.getAll();
    expect(loans.length).toBe(2);

    // 2. Create a product (Toor Dal) initially with 0 stock, then Restock 20 kg @ ₹140/kg using Mudra Loan
    const toorDal = await InventoryService.createProduct({
      name: 'तूर डाळ (Toor Dal)',
      short_code: 'TD1',
      category: 'Grains & Pulses',
      unit_type: 'KG_LOOSE',
      purchase_price: 140,
      selling_price: 165,
      mrp: 175,
      current_stock: 0,
      low_stock_threshold: 2,
      is_quick_tap: true,
    });

    await InventoryService.restock({
      productId: toorDal.id,
      qty: 20, // 20 kg * 140 = ₹2,800 from Mudra Loan
      unitCost: 140,
      supplierName: 'APMC Dal Mill',
      loanAccountId: mudraLoan.id,
      notes: 'Purchased 20kg Toor Dal from Mudra Loan',
    });

    // 3. Create another product (Fortune Oil) directly funded by Trader Loan (10 Packs @ ₹130 = ₹1,300)
    const oil = await InventoryService.createProduct({
      name: 'Fortune Sunlite Oil 1L',
      short_code: 'FO1',
      category: 'Oil & Ghee',
      unit_type: 'PACK',
      purchase_price: 130,
      selling_price: 150,
      mrp: 160,
      current_stock: 10,
      low_stock_threshold: 3,
      loan_account_id: traderLoan.id,
      is_quick_tap: true,
    });

    // 4. Create an Own-Capital product (Parle-G) NOT funded by any loan
    const parleG = await InventoryService.createProduct({
      name: 'Parle-G Biscuit',
      short_code: 'PG5',
      category: 'Biscuits & Snacks',
      unit_type: 'PCS',
      purchase_price: 4,
      selling_price: 5,
      mrp: 5,
      current_stock: 50,
      low_stock_threshold: 10,
      is_quick_tap: true,
    });

    // 5. Execute POS Sale Today:
    // - 5 kg Toor Dal @ ₹165 = ₹825 revenue, COGS (Loan Principal) = 5 * 140 = ₹700, Net Profit = ₹125
    // - 2 Packs Fortune Oil @ ₹150 = ₹300 revenue, COGS (Loan Principal) = 2 * 130 = ₹260, Net Profit = ₹40
    // - 10 pcs Parle-G (Own Capital) @ ₹5 = ₹50 (MUST NOT appear in Loan Report)
    const updatedToorDal = (await db.products.get(toorDal.id))!;
    const updatedOil = (await db.products.get(oil.id))!;

    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: updatedToorDal,
          qty: 5,
          unit_selling_price: 165,
          unit_purchase_cost: 140,
          line_total: 825,
        },
        {
          product: updatedOil,
          qty: 2,
          unit_selling_price: 150,
          unit_purchase_cost: 130,
          line_total: 300,
        },
        {
          product: parleG,
          qty: 10,
          unit_selling_price: 5,
          unit_purchase_cost: 4,
          line_total: 50,
        },
      ],
      subtotalAmount: 1175,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 1175,
      udhariAdded: 0,
    });

    // 6. Query Loan-Funded Inventory & Daily Set-Aside Report (All Loans)
    const reportAll = await LoanAccountService.getLoanFundedInventoryReport();

    // Only the 2 loan-funded products must be included (Parle-G is excluded)
    expect(reportAll.productRows.length).toBe(2);
    expect(reportAll.categorySummary.length).toBe(2);

    // Total Loan Purchased: 2800 (Toor Dal) + 1300 (Oil) = ₹4,100
    expect(reportAll.totals.totalLoanAllocatedToStock).toBe(4100);

    // Total Loan Product Sales Revenue: 825 + 300 = ₹1,125
    expect(reportAll.totals.totalSalesRevenue).toBe(1125);

    // Total Principal to Separate Today (COGS of sold loan items): 700 + 260 = ₹960
    expect(reportAll.totals.todayTotalPrincipalToSeparate).toBe(960);

    // Total Net Profit on Loan Products: 125 + 40 = ₹165
    expect(reportAll.totals.totalNetProfit).toBe(165);
    expect(reportAll.totals.todayTotalProfitFromLoanStock).toBe(165);

    // 7. Filter by Mudra Loan only
    const mudraOnly = await LoanAccountService.getLoanFundedInventoryReport({
      loanAccountId: mudraLoan.id,
    });
    expect(mudraOnly.productRows.length).toBe(1);
    expect(mudraOnly.productRows[0].productName).toContain('Toor Dal');
    expect(mudraOnly.totals.todayTotalPrincipalToSeparate).toBe(700);
    expect(mudraOnly.totals.totalNetProfit).toBe(125);

    // 8. Verify Standard Vyapar Excel & PDF Report Generation for Loan Stock
    const exported = await ReportsService.generateLoanInventoryReport(DEFAULT_SHOP_PROFILE);
    expect(exported.pdfBuffer.byteLength).toBeGreaterThan(500);
    expect(exported.xlsxBuffer.byteLength).toBeGreaterThan(500);
  });

  it('2. StockAdjustmentModal allows selecting "Yes (From Loan Amount)", inline-adding a Loan Account, and restocking under that loan', async () => {
    const prod = await InventoryService.createProduct({
      name: 'कोलम तांदूळ (Kolam Rice)',
      short_code: 'KR1',
      category: 'Grains & Pulses',
      unit_type: 'KG_LOOSE',
      purchase_price: 54,
      selling_price: 64,
      mrp: 70,
      current_stock: 10,
      low_stock_threshold: 2,
      is_quick_tap: true,
    });

    const onAdjusted = vi.fn();
    const onClose = vi.fn();

    render(
      <StockAdjustmentModal
        isOpen={true}
        onClose={onClose}
        product={prod}
        mode="STOCK_IN"
        onAdjusted={onAdjusted}
      />
    );

    // Switch to "🏦 Yes (From Loan Amount)"
    fireEvent.click(screen.getByTestId('restock-loan-mode-loan'));

    // Open inline "+ New Loan" form inside Stock In modal
    fireEvent.click(screen.getByTestId('restock-toggle-inline-loan-btn'));
    fireEvent.change(screen.getByTestId('restock-inline-loan-name'), {
      target: { value: 'SBI CC Loan ₹1 Lakh' },
    });
    fireEvent.change(screen.getByTestId('restock-inline-loan-lender'), {
      target: { value: 'SBI Branch' },
    });
    fireEvent.change(screen.getByTestId('restock-inline-loan-principal'), {
      target: { value: '100000' },
    });
    fireEvent.click(screen.getByTestId('restock-save-inline-loan-btn'));

    // Wait for the newly created loan account to be auto-selected in dropdown
    const selectEl = (await screen.findByTestId('restock-loan-account-select')) as HTMLSelectElement;
    await vi.waitFor(() => {
      expect(selectEl.value).toMatch(/^loan-/);
    });

    // Submit the Stock In form
    const confirmBtn = screen.getByText(/Confirm Stock In/i);
    fireEvent.click(confirmBtn);

    await vi.waitFor(() => {
      expect(onAdjusted).toHaveBeenCalled();
    });

    const updatedProd = await db.products.get(prod.id);
    expect(updatedProd?.loan_account_id).toBe(selectEl.value);
  });

  it('3. ReportsView renders Tab 10 "🏦 Loan Stock & Daily Set-Aside" with Daily Money Separation box, Categorical Report, and Product P&L', async () => {
    const loan = await LoanAccountService.create({
      name: 'Bajaj Business Loan',
      lender_name: 'Bajaj Finserv',
      principal_amount: 30000,
    });

    const prod = await InventoryService.createProduct({
      name: 'शेंगदाणे (Groundnuts)',
      short_code: 'GN1',
      category: 'Grains & Pulses',
      unit_type: 'KG_LOOSE',
      purchase_price: 110,
      selling_price: 130,
      mrp: 140,
      current_stock: 20,
      low_stock_threshold: 2,
      loan_account_id: loan.id,
      is_quick_tap: true,
    });

    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: prod,
          qty: 3, // 3 kg * 130 = ₹390 sales, COGS = 3 * 110 = ₹330, Profit = ₹60
          unit_selling_price: 130,
          unit_purchase_cost: 110,
          line_total: 390,
        },
      ],
      subtotalAmount: 390,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 390,
      udhariAdded: 0,
    });

    render(<ReportsView shopProfile={DEFAULT_SHOP_PROFILE} />);

    // Switch to Tabular Audit Register view
    fireEvent.click(screen.getByTestId('view-mode-tabular'));

    // Click Tab 10: Loan Stock & Daily Set-Aside
    const loanTabBtn = await screen.findByTestId('report-tab-loans');
    fireEvent.click(loanTabBtn);

    const container = await screen.findByTestId('loan-inventory-report-container');
    expect(container).toBeInTheDocument();

    // Verify Today's Principal to Separate (₹330.00), Today's Sales (₹390.00), and Today's Net Profit (₹60.00)
    expect(screen.getByTestId('loan-today-principal-to-separate').textContent).toContain('330.00');
    expect(screen.getByTestId('loan-today-sales-revenue').textContent).toContain('390.00');
    expect(screen.getByTestId('loan-today-net-profit').textContent).toContain('60.00');
  });
});
