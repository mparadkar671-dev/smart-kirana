import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db/db';
import { BillingService } from '../services/billingService';
import { ReportsService } from '../services/reportsService';
import { GallaService } from '../services/gallaService';
import { cloudSyncService } from '../services/cloudSyncService';
import {
  getBaseKiranaShopId,
  getHomemadeShopId,
  getActiveShopId,
  STANDARD_8_HOMEMADE_FOOD_CATALOG,
} from '../services/tenantManager';
import { Product, ShopProfile, SalesInvoice, SaleItem, ExpenseAndDrawing } from '../types';

describe('Dual-Business Calculation Isolation & Parallel Live Sync Suite', () => {
  const kiranaShopId = 'c7b9195a-49e0-4a88-8254-2035ef580001';
  const hmfShopId = getHomemadeShopId(kiranaShopId);

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('kirana_base_shop_id', kiranaShopId);
    localStorage.setItem('kirana_primary_shop_id', kiranaShopId);

    await db.sales_invoices.clear();
    await db.sale_items.clear();
    await db.products.clear();
    await db.inventory_logs.clear();
    await db.customers.clear();
    await db.khata_transactions.clear();
    await db.expenses_and_drawings.clear();
    await db.daily_galla_sessions.clear();
    await db.sync_outbox.clear();

    // Setup initial profiles
    await db.shop_profile.put({
      id: kiranaShopId,
      shop_name: 'Shree Ganesh Kirana',
      owner_name: 'Laxminivas',
      phone: '9876543210',
      upi_vpa: 'kirana@upi',
      business_type: 'KIRANA_RETAIL',
      invoice_prefix: 'KRN',
      address: 'Main Bazaar, Chiplun',
      gst_footer_note: 'Thank you!',
      updated_at: new Date().toISOString(),
    });

    await db.shop_profile.put({
      id: hmfShopId,
      shop_name: 'Shree Ganesh Gruh Udyog',
      owner_name: 'Laxminivas',
      phone: '9876543210',
      upi_vpa: 'kirana@upi',
      business_type: 'HOMEMADE_FOOD',
      invoice_prefix: 'HMF',
      address: 'Main Bazaar, Chiplun',
      gst_footer_note: 'Fresh Homemade Food!',
      updated_at: new Date().toISOString(),
    });
  });

  it('1. Strict P&L Isolation: Kirana ₹500 sale / ₹30 exp -> ₹70 net; HMF ₹300 sale / ₹50 exp -> ₹100 net', async () => {
    // Kirana Products & Sale (Sale: ₹500, COGS: ₹400, Gross: ₹100)
    const kiranaInvoiceId = 'inv-kirana-test-1';
    await db.sales_invoices.add({
      id: kiranaInvoiceId,
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      invoice_number: 'KRN-20261107-001',
      customer_id: '0000-WALK-IN',
      subtotal_amount: 500,
      discount_roundoff: 0,
      grand_total: 500,
      total_cogs: 400,
      payment_mode: 'CASH',
      amount_paid_now: 500,
      udhari_added: 0,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    });

    await db.sale_items.add({
      id: 'si-kirana-1',
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      invoice_id: kiranaInvoiceId,
      product_id: 'p-kirana-rice',
      product_name_snapshot: 'Kolam Rice',
      qty: 10,
      unit_purchase_cost: 40,
      unit_selling_price: 50,
      line_total: 500,
      loan_account_id: null,
    });

    // Kirana Operating Expense (₹30)
    await db.expenses_and_drawings.add({
      id: 'exp-kirana-1',
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      entry_type: 'BUSINESS_EXPENSE',
      category: 'SHOP_EXPENSE_TRANSPORT_BAGS',
      amount: 30,
      paid_via: 'CASH_GALLA',
      description: 'Kirana packing bags',
      created_at: new Date().toISOString(),
    });

    // Homemade Food Sale (Sale: ₹300, COGS: ₹150, Gross: ₹150)
    const hmfInvoiceId = 'inv-hmf-test-1';
    await db.sales_invoices.add({
      id: hmfInvoiceId,
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      invoice_number: 'HMF-20261107-001',
      customer_id: '0000-WALK-IN',
      subtotal_amount: 300,
      discount_roundoff: 0,
      grand_total: 300,
      total_cogs: 150,
      payment_mode: 'CASH',
      amount_paid_now: 300,
      udhari_added: 0,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    });

    await db.sale_items.add({
      id: 'si-hmf-1',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      invoice_id: hmfInvoiceId,
      product_id: 'p-hmf-ghavane',
      product_name_snapshot: 'घावणे (Ghavane)',
      qty: 10,
      unit_purchase_cost: 15,
      unit_selling_price: 30,
      line_total: 300,
      loan_account_id: null,
    });

    // Homemade Food Operating Expense (₹50)
    await db.expenses_and_drawings.add({
      id: 'exp-hmf-1',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      entry_type: 'BUSINESS_EXPENSE',
      category: 'SHOP_EXPENSE_TRANSPORT_BAGS',
      amount: 50,
      paid_via: 'CASH_GALLA',
      description: 'LPG cylinder refill fraction',
      created_at: new Date().toISOString(),
    });

    // 1. Verify Kirana P&L
    const kiranaPnl = await ReportsService.getProfitAndLossData(undefined, kiranaShopId);
    expect(kiranaPnl.salesRevenue).toBe(500);
    expect(kiranaPnl.cogs).toBe(400);
    expect(kiranaPnl.grossProfit).toBe(100);
    expect(kiranaPnl.shopOperatingExpenses).toBe(30);
    expect(kiranaPnl.trueNetProfit).toBe(70); // 100 - 30 = 70
    expect(kiranaPnl.invoiceCount).toBe(1);

    // 2. Verify Homemade Food P&L
    const hmfPnl = await ReportsService.getProfitAndLossData(undefined, hmfShopId);
    expect(hmfPnl.salesRevenue).toBe(300);
    expect(hmfPnl.cogs).toBe(150);
    expect(hmfPnl.grossProfit).toBe(150);
    expect(hmfPnl.shopOperatingExpenses).toBe(50);
    expect(hmfPnl.trueNetProfit).toBe(100); // 150 - 50 = 100
    expect(hmfPnl.invoiceCount).toBe(1);

    // 3. Verify zero cross-business leakage
    expect(kiranaPnl.itemWise.some((item) => item.name.includes('घावणे'))).toBe(false);
    expect(hmfPnl.itemWise.some((item) => item.name.includes('Rice'))).toBe(false);
  });

  it('2. BillingService assigns the exact shop_id and business_type to sale_items, invoices, and logs', async () => {
    // Add product to Homemade store
    const hmfProduct: Product = {
      id: 'p-test-modak',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      name: 'उकडीचे मोदक (Homemade Modak)',
      short_code: 'MDK1',
      barcode: '2009000000049',
      category: 'Modak & Festive Specials',
      unit_type: 'PCS',
      purchase_price: 14,
      selling_price: 25,
      mrp: 30,
      current_stock: 40,
      low_stock_threshold: 5,
      last_supplier_name: 'Self Produced',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    await db.products.add(hmfProduct);

    // Checkout via BillingService with explicit shopId and businessType
    const checkoutRes = await BillingService.executeCheckout({
      customerId: '0000-WALK-IN',
      items: [
        {
          product: hmfProduct,
          qty: 4,
          unit_selling_price: 25,
          unit_purchase_cost: 14,
          line_total: 100,
        },
      ],
      subtotalAmount: 100,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 100,
      udhariAdded: 0,
      shopId: hmfShopId,
      businessType: 'HOMEMADE_FOOD',
    });

    expect(checkoutRes.invoice.shop_id).toBe(hmfShopId);
    expect(checkoutRes.invoice.business_type).toBe('HOMEMADE_FOOD');
    expect(checkoutRes.invoice.invoice_number.startsWith('HMF-')).toBe(true);
    expect(checkoutRes.saleItems[0].shop_id).toBe(hmfShopId);
    expect(checkoutRes.saleItems[0].business_type).toBe('HOMEMADE_FOOD');

    // Verify stock deducted
    const updatedProd = await db.products.get('p-test-modak');
    expect(updatedProd?.current_stock).toBe(36);

    // Verify inventory log scoped by hmfShopId
    const logs = await db.inventory_logs.where('product_id').equals('p-test-modak').toArray();
    expect(logs.length).toBe(1);
    expect(logs[0].shop_id).toBe(hmfShopId);
    expect(logs[0].business_type).toBe('HOMEMADE_FOOD');
  });

  it('3. Dual Galla Sessions on the same date run in parallel without ConstraintError', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Initialize Kirana session
    const kiranaSession = await GallaService.getOrCreateTodaySession(kiranaShopId);
    expect(kiranaSession.shop_id).toBe(kiranaShopId);
    expect(kiranaSession.business_type).toBe('KIRANA_RETAIL');

    await GallaService.setOpeningCash(today, 1000, kiranaShopId);

    // Initialize Homemade Food session on the exact same calendar day
    const hmfSession = await GallaService.getOrCreateTodaySession(hmfShopId);
    expect(hmfSession.shop_id).toBe(hmfShopId);
    expect(hmfSession.business_type).toBe('HOMEMADE_FOOD');

    await GallaService.setOpeningCash(today, 500, hmfShopId);

    // Verify both exist independently in db.daily_galla_sessions
    const allSessions = await db.daily_galla_sessions.toArray();
    expect(allSessions.length).toBe(2);

    const kiranaGalla = allSessions.find((s) => s.shop_id === kiranaShopId);
    const hmfGalla = allSessions.find((s) => s.shop_id === hmfShopId);

    expect(kiranaGalla?.opening_cash).toBe(1000);
    expect(hmfGalla?.opening_cash).toBe(500);
  });

  it('4. Parallel Live Sync helper initializes cleanly and cleans up on unmount', () => {
    const cleanup = cloudSyncService.startParallelLiveSync(kiranaShopId);
    expect(typeof cleanup).toBe('function');
    // Ensure cleanup executes without throwing
    expect(() => cleanup()).not.toThrow();
  });
});
