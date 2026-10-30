import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { db } from '../db/db';
import { GallaService } from '../services/gallaService';
import { ReportsService } from '../services/reportsService';
import { BillingService } from '../services/billingService';
import { InventoryService } from '../services/inventoryService';
import { ShopProfile, WALK_IN_CUSTOMER_ID } from '../types';
import { GallaView } from '../components/galla/GallaView';

describe('Phase 5 Verification Gate - Daily Galla Drawer & Expense Math (REQ-13 & REQ-22)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-13 Verification: Opening ₹1,000 + Cash Sales ₹2,400 + Cash Jama ₹500 - Cash Expense ₹150 = Expected Closing Cash ₹3,750', async () => {
    const todayDate = new Date().toISOString().split('T')[0];

    // 1. Initialize today's session with Opening Cash ₹1,000
    await GallaService.setOpeningCash(todayDate, 1000.00);

    // 2. Simulate Cash Sales of ₹2,400 (e.g. from POS walk-in)
    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: (await db.products.get('prod-001'))!,
          qty: 1,
          unit_selling_price: 2400.00,
          unit_purchase_cost: 2000.00,
          line_total: 2400.00,
        },
      ],
      subtotalAmount: 2400.00,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 2400.00,
      udhariAdded: 0,
    });

    // 3. Simulate Cash Udhari Jama recovered of ₹500
    // Customer pays ₹500 in CASH
    const cust = (await db.customers.get('cust-002'))!; // Suresh owes 1850
    await db.customers.update(cust.id, { current_udhari_balance: cust.current_udhari_balance - 500 });
    const sessionAfterJama = await db.daily_galla_sessions.where({ session_date: todayDate }).first();
    await db.daily_galla_sessions.update(sessionAfterJama!.id, {
      cash_udhari_recovered: sessionAfterJama!.cash_udhari_recovered + 500.00,
      expected_closing_cash: sessionAfterJama!.expected_closing_cash + 500.00,
    });

    // 4. Record a Cash Expense of ₹150 (Polybags & Tea)
    await GallaService.recordExpense({
      category: 'SHOP_EXPENSE_TRANSPORT_BAGS',
      amount: 150.00,
      paidVia: 'CASH_GALLA',
      description: 'Polybags & counter tea',
    });

    // 5. Verify Galla formula: Opening(1000) + Sales(2400) + Jama(500) - Expense(150) = 3750
    const finalSession = (await db.daily_galla_sessions.where({ session_date: todayDate }).first())!;
    expect(finalSession.opening_cash).toBe(1000.00);
    expect(finalSession.cash_sales_total).toBe(2400.00);
    expect(finalSession.cash_udhari_recovered).toBe(500.00);
    expect(finalSession.cash_expenses_out).toBe(150.00);
    expect(finalSession.expected_closing_cash).toBe(3750.00);

    // 6. Test Evening Cash Reconciliation: Counted ₹3,750 -> 0 discrepancy
    const reconciled = await GallaService.recordEveningCashCount(todayDate, 3750.00);
    expect(reconciled.actual_counted_cash).toBe(3750.00);
    expect(reconciled.discrepancy).toBe(0.00);

    // Test Shortage: Counted ₹3,700 -> -₹50 discrepancy
    const shortage = await GallaService.recordEveningCashCount(todayDate, 3700.00);
    expect(shortage.discrepancy).toBe(-50.00);
  });
});

describe('Phase 5 Verification Gate - 5 Comprehensive Reports Generation (REQ-14 & AT-10)', () => {
  const mockShopProfile: ShopProfile = {
    id: 'current_shop',
    shop_name: 'Shree Ganesh Kirana',
    owner_name: 'Ramesh Patel',
    phone: '9876543210',
    upi_vpa: 'kirana@upi',
    address: 'Shop No. 4, Market',
    gst_footer_note: 'Thank you!',
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-14.1 & AT-10: Generates Profit & Loss Statement PDF and Excel buffers with zero runtime exceptions', async () => {
    const { pdfBuffer, xlsxBuffer } = await ReportsService.generateProfitAndLossReport(mockShopProfile);

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.byteLength).toBeGreaterThan(100);
    expect(xlsxBuffer).toBeDefined();
    expect(xlsxBuffer.length).toBeGreaterThan(100);
  });

  it('REQ-14.2 & AT-10: Generates Product-Wise Sales & Margin Report PDF and Excel buffers', async () => {
    const { pdfBuffer, xlsxBuffer } = await ReportsService.generateProductWiseReport(mockShopProfile);

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.byteLength).toBeGreaterThan(100);
    expect(xlsxBuffer).toBeDefined();
    expect(xlsxBuffer.length).toBeGreaterThan(100);
  });

  it('REQ-14.3 & AT-10: Generates Customer-Wise Udhari Summary Report PDF and Excel buffers', async () => {
    const { pdfBuffer, xlsxBuffer } = await ReportsService.generateCustomerUdhariReport(mockShopProfile);

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.byteLength).toBeGreaterThan(100);
    expect(xlsxBuffer).toBeDefined();
    expect(xlsxBuffer.length).toBeGreaterThan(100);
  });

  it('REQ-14.4 & AT-10: Generates Daily Bill Register Report PDF and Excel buffers', async () => {
    const { pdfBuffer, xlsxBuffer } = await ReportsService.generateBillRegisterReport(mockShopProfile);

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.byteLength).toBeGreaterThan(100);
    expect(xlsxBuffer).toBeDefined();
    expect(xlsxBuffer.length).toBeGreaterThan(100);
  });

  it('REQ-14.5 & AT-10: Generates Inventory Valuation Report PDF and Excel buffers with total locked capital', async () => {
    const { pdfBuffer, xlsxBuffer } = await ReportsService.generateInventoryValuationReport(mockShopProfile);

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.byteLength).toBeGreaterThan(100);
    expect(xlsxBuffer).toBeDefined();
    expect(xlsxBuffer.length).toBeGreaterThan(100);

    const valData = await ReportsService.getInventoryValuationData();
    expect(valData.totalLockedCapital).toBeGreaterThan(0);
    expect(valData.items.length).toBe(25);
  });
});

describe('Phase 5 Verification Gate - Master Acceptance Scenarios AT-05 & AT-09', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('AT-05: Home/Self-Use Isolation: Oil stock decreases by 1; HOME_SELF_USE_GOODS logs ₹135; Sales revenue unchanged', async () => {
    const oil = (await db.products.get('prod-002'))!; // Fortune Oil 1L: purchase 135, selling 155, stock 30
    const initialStock = oil.current_stock;

    // Owner takes 1L Fortune Oil for home kitchen
    const res = await InventoryService.stockOut({
      productId: oil.id,
      qty: 1,
      reasonType: 'SELF_USE_OUT',
      notes: 'Kitchen oil consumption',
    });

    // 1. Stock decreases by 1
    expect(res.product.current_stock).toBe(initialStock - 1);
    const updatedOil = await db.products.get('prod-002');
    expect(updatedOil?.current_stock).toBe(initialStock - 1);

    // 2. HOME_SELF_USE_GOODS logs ₹135
    expect(res.expense).toBeDefined();
    expect(res.expense?.category).toBe('HOME_SELF_USE_GOODS');
    expect(res.expense?.amount).toBe(135.00);

    // 3. Shop Sales Revenue remains completely unchanged
    const pnl = await ReportsService.getProfitAndLossData();
    expect(pnl.salesRevenue).toBe(0.00); // 0 sales revenue
    expect(pnl.homeSelfUseValuation).toBe(135.00); // properly isolated!
  });

  it('AT-09: Void / Cancel Bill Rollback: Restores stock via RETURN_IN and reverses Udhari balance atomically', async () => {
    const cust = (await db.customers.get('cust-001'))!;
    const initialCustBal = cust.current_udhari_balance; // 400
    const salt = (await db.products.get('prod-001'))!;
    const initialSaltStock = salt.current_stock; // 50

    // 1. Create an invoice with 2 items and ₹200 added to Udhari
    const checkoutRes = await BillingService.executeCheckout({
      customerId: cust.id,
      items: [
        {
          product: salt,
          qty: 2,
          unit_selling_price: 100.00,
          unit_purchase_cost: 80.00,
          line_total: 200.00,
        },
      ],
      subtotalAmount: 200.00,
      discountRoundoff: 0,
      paymentMode: 'UDHARI_FULL',
      amountPaidNow: 0,
      udhariAdded: 200.00,
    });

    // Verify stock was deducted by 2
    const saltAfterSale = await db.products.get('prod-001');
    expect(saltAfterSale?.current_stock).toBe(initialSaltStock - 2);

    // Verify customer balance increased by ₹200
    const custAfterSale = await db.customers.get('cust-001');
    expect(custAfterSale?.current_udhari_balance).toBe(initialCustBal + 200.00);

    // 2. Execute Void / Rollback on the invoice
    await GallaService.voidInvoice(checkoutRes.invoice.id);

    // 3. Verify stock restored by +2
    const saltAfterVoid = await db.products.get('prod-001');
    expect(saltAfterVoid?.current_stock).toBe(initialSaltStock);

    // Verify RETURN_IN inventory log
    const returnLog = await db.inventory_logs
      .where({ product_id: 'prod-001' })
      .filter((l) => l.reason_type === 'RETURN_IN')
      .last();
    expect(returnLog).toBeDefined();
    expect(returnLog?.change_qty).toBe(2);

    // 4. Verify customer Udhari balance reversed by ₹200
    const custAfterVoid = await db.customers.get('cust-001');
    expect(custAfterVoid?.current_udhari_balance).toBe(initialCustBal);

    // 5. Verify invoice status is VOIDED
    const voidedInv = await db.sales_invoices.get(checkoutRes.invoice.id);
    expect(voidedInv?.status).toBe('VOIDED');
  });
});

