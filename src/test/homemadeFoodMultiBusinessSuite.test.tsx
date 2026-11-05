import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import {
  HomemadeFoodService,
  HOMEMADE_FOOD_STARTER_CATALOG,
} from '../services/homemadeFoodService';
import { BillingService } from '../services/billingService';
import { InventoryService } from '../services/inventoryService';
import { GallaService } from '../services/gallaService';
import { ReportsService } from '../services/reportsService';
import { WALK_IN_CUSTOMER_ID } from '../types';

describe('Multi-Business Engine: Homemade Food (Gruh Udyog) + Separate Workspace & Financial Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    HomemadeFoodService.resetWorkspaceSnapshots();
    await db.clearAllRecordsToEmpty();
  });

  it('Step 1 & 2: Switches between Kirana Retail and Homemade Food workspaces with 100% data isolation, seeds 12 Konkani/Maharashtrian items, and bills with HMF- invoice prefix', async () => {
    // 1. Seed a Kirana product in KIRANA_RETAIL workspace
    await db.updateShopProfile({
      shop_name: 'Shree Ganesh Kirana',
      business_type: 'KIRANA_RETAIL',
      invoice_prefix: 'KRN',
    });
    const kiranaItem = await InventoryService.createProduct({
      name: 'Tata Salt 1kg',
      short_code: 'TS1',
      category: 'Groceries',
      unit_type: 'PCS',
      purchase_price: 22,
      selling_price: 28,
      mrp: 28,
      current_stock: 40,
      low_stock_threshold: 5,
      is_quick_tap: true,
    });
    expect(kiranaItem.name).toBe('Tata Salt 1kg');

    const kiranaInvNo = await BillingService.generateInvoiceNumber();
    expect(kiranaInvNo.startsWith('KRN-')).toBe(true);

    // 2. Switch to HOMEMADE_FOOD workspace with auto-seed of 12 Homemade Food items
    const switchToHmf = await HomemadeFoodService.switchBusinessWorkspace('HOMEMADE_FOOD', {
      seedCatalogIfEmpty: true,
    });

    expect(switchToHmf.businessType).toBe('HOMEMADE_FOOD');
    expect(switchToHmf.activeProfile.business_type).toBe('HOMEMADE_FOOD');
    expect(switchToHmf.activeProfile.invoice_prefix).toBe('HMF');
    expect(switchToHmf.productCount).toBe(12);
    expect(HOMEMADE_FOOD_STARTER_CATALOG.length).toBe(12);

    // Verify Kirana product is NOT mixed into Homemade Food workspace
    const hmfProducts = await db.products.toArray();
    expect(hmfProducts.length).toBe(12);
    expect(hmfProducts.some((p) => p.short_code === 'TS1')).toBe(false);

    // Verify custom units (KG_LOOSE, PCS, PLATE, DOZEN, PACK) and 160x160 thumbnails + 200-prefix barcodes
    const ghavane = hmfProducts.find((p) => p.short_code === 'GHV');
    const ukadicheModak = hmfProducts.find((p) => p.short_code === 'UMD');
    const besanLaddu = hmfProducts.find((p) => p.short_code === 'BSL');
    expect(ghavane?.unit_type).toBe('PLATE');
    expect(ukadicheModak?.unit_type).toBe('PCS');
    expect(besanLaddu?.unit_type).toBe('KG_LOOSE');
    expect(besanLaddu?.barcode.startsWith('200')).toBe(true);
    expect(besanLaddu?.image_url?.startsWith('data:image/svg+xml')).toBe(true);

    // 3. Test Fresh Batch Production ("🍳 + Fresh Batch Made" -> BATCH_MADE_IN)
    const restockRes = await InventoryService.restock({
      productId: ghavane!.id,
      qty: 15,
      unitCost: 22,
      reasonType: 'BATCH_MADE_IN',
      notes: 'Morning Fresh Ghavane Batch',
    });
    expect(restockRes.log.reason_type).toBe('BATCH_MADE_IN');
    expect(restockRes.product.current_stock).toBe(ghavane!.current_stock + 15);

    // 4. Verify HMF- invoice prefix on Homemade Food checkout
    const hmfCheckout = await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: besanLaddu!,
          qty: 1.5,
          unit_selling_price: besanLaddu!.selling_price,
          unit_purchase_cost: besanLaddu!.purchase_price,
          line_total: 1.5 * besanLaddu!.selling_price,
        },
      ],
      subtotalAmount: 1.5 * besanLaddu!.selling_price,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 1.5 * besanLaddu!.selling_price,
      udhariAdded: 0,
    });
    expect(hmfCheckout.invoice.invoice_number.startsWith('HMF-')).toBe(true);

    // 5. Switch back to KIRANA_RETAIL and verify Kirana data is intact & isolated
    const switchBackToKirana = await HomemadeFoodService.switchBusinessWorkspace('KIRANA_RETAIL');
    expect(switchBackToKirana.businessType).toBe('KIRANA_RETAIL');
    const restoredKiranaProducts = await db.products.toArray();
    expect(restoredKiranaProducts.length).toBe(1);
    expect(restoredKiranaProducts[0].short_code).toBe('TS1');
    const restoredKiranaInvoices = await db.sales_invoices.toArray();
    expect(restoredKiranaInvoices.length).toBe(0);
  });

  it('Step 3: Books an Advance Festival Pre-Order, generates WhatsApp Confirmation Slip, and converts to Final HMF- Bill with stock deduction', async () => {
    await HomemadeFoodService.switchBusinessWorkspace('HOMEMADE_FOOD', {
      seedCatalogIfEmpty: true,
    });

    const products = await db.products.toArray();
    const modak = products.find((p) => p.short_code === 'UMD')!;
    const kapa = products.find((p) => p.short_code === 'KHK')!;
    const initialModakStock = modak.current_stock;
    const initialKapaStock = kapa.current_stock;

    // 1. Book Advance Order (e.g. 21 Ukadiche Modak + 1 kg Khobryachi Kapa for Ganesh Chaturthi)
    const order = await HomemadeFoodService.createAdvanceOrder({
      customerName: 'Sau. Sunita Sawant',
      customerPhone: '9822112233',
      deliveryDateTime: '2026-09-14 08:30 AM (Ganesh Chaturthi)',
      items: [
        {
          product_id: modak.id,
          product_name: modak.name,
          unit_type: modak.unit_type,
          qty: 21,
          unit_selling_price: modak.selling_price, // 30
          unit_purchase_cost: modak.purchase_price, // 14
          line_total: 21 * modak.selling_price, // 630
        },
        {
          product_id: kapa.id,
          product_name: kapa.name,
          unit_type: kapa.unit_type,
          qty: 1,
          unit_selling_price: kapa.selling_price, // 440
          unit_purchase_cost: kapa.purchase_price, // 250
          line_total: 1 * kapa.selling_price, // 440
        },
      ],
      specialInstructions: 'Less sugar in Kapa, pack Modak in banana leaf box',
      advanceTokenPaid: 300,
      paymentMode: 'UPI',
    });

    expect(order.order_number.startsWith('ORD-')).toBe(true);
    expect(order.total_amount).toBe(1070);
    expect(order.advance_token_paid).toBe(300);
    expect(order.balance_due).toBe(770);
    expect(order.status).toBe('PENDING');

    // 2. Generate WhatsApp Confirmation Slip URL
    const profile = await db.getShopProfile();
    const waUrl = HomemadeFoodService.generateAdvanceOrderWhatsAppUrl(order, profile);
    expect(waUrl).toContain('https://wa.me/919822112233?text=');
    expect(decodeURIComponent(waUrl)).toContain(order.order_number);
    expect(decodeURIComponent(waUrl)).toContain('770');

    // 3. Complete Advance Order & Generate Final HMF- Bill
    const billed = await HomemadeFoodService.completeAdvanceOrderAndBill(order.id, 'UPI');
    expect(billed.order.status).toBe('DELIVERED_BILLED');
    expect(billed.invoice.invoice_number.startsWith('HMF-')).toBe(true);
    expect(billed.invoice.grand_total).toBe(1070);
    expect(billed.saleItems.length).toBe(2);

    // Verify stock deducted
    const updatedModak = await db.products.get(modak.id);
    const updatedKapa = await db.products.get(kapa.id);
    expect(updatedModak?.current_stock).toBe(initialModakStock - 21);
    expect(updatedKapa?.current_stock).toBe(initialKapaStock - 1);
  });

  it('Step 4 & 5: Tracks Initial Investment, Raw Material, Operating & Home Family Expenses, computes Capital Recovery %, and exports Monthly/Yearly Excel & PDF reports', async () => {
    await HomemadeFoodService.switchBusinessWorkspace('HOMEMADE_FOOD', {
      seedCatalogIfEmpty: true,
    });

    const products = await db.products.toArray();
    const besanLaddu = products.find((p) => p.short_code === 'BSL')!; // sell: 480, cost: 280

    // 1. Record Initial Setup Investment (₹10,000 for Commercial Gas Bhatti, Cast-Iron Bhirda, Modak Steamer)
    await GallaService.recordExpense({
      category: 'INITIAL_INVESTMENT_SETUP',
      entryType: 'INITIAL_INVESTMENT',
      amount: 10000,
      paidVia: 'UPI_BANK',
      description: 'Commercial Gas Bhatti, Cast-Iron Bhirda/Tava & Modak Steamer Setup',
    });

    // 2. Record Raw Material Expense (₹2,000 for Besan, Pure Ghee, Coconut, Jaggery, LPG Gas)
    await GallaService.recordExpense({
      category: 'RAW_MATERIAL_INGREDIENTS',
      entryType: 'RAW_MATERIAL_EXPENSE',
      amount: 2000,
      paidVia: 'CASH_GALLA',
      description: 'Besan, Pure Ghee, Fresh Coconut, Jaggery & LPG Cylinder',
    });

    // 3. Record Operating Expense (₹500 for Delivery & Packaging Helper)
    await GallaService.recordExpense({
      category: 'SHOP_EXPENSE_TRANSPORT_BAGS',
      entryType: 'BUSINESS_EXPENSE',
      amount: 500,
      paidVia: 'CASH_GALLA',
      description: 'Delivery auto fare & helper',
    });

    // 4. Record Home & Family Expense Paid from Business (₹1,500 for Household Grocery & School Fees)
    await GallaService.recordExpense({
      category: 'HOME_FAMILY_EXPENSE',
      entryType: 'HOME_FAMILY_EXPENSE',
      amount: 1500,
      paidVia: 'CASH_GALLA',
      description: 'Home grocery bill & school fees paid from business',
    });

    // 5. Execute Sales of ₹7,500 (15.625 kg Besan Laddu @ ₹480/kg = ₹7,500)
    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: besanLaddu,
          qty: 15.625,
          unit_selling_price: 480,
          unit_purchase_cost: 280,
          line_total: 7500,
        },
      ],
      subtotalAmount: 7500,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 7500,
      udhariAdded: 0,
    });

    // 6. Verify Capital Investment Recovery & Financial Statement formulas:
    // Sales Revenue = 7500
    // Raw Material Expense = 2000
    // Operating Expense = 500
    // True Business Net Profit = 7500 - (2000 + 500) = 5000
    // Home & Family Expense Supported = 1500
    // Net Retained Cash Savings = 5000 - 1500 = 3500
    // Initial Investment = 10000
    // Capital Recovered % = (5000 / 10000) * 100 = 50%
    // Remaining to Break Even = 10000 - 5000 = 5000
    const summary = await HomemadeFoodService.getCapitalAndExpenseSummary();
    expect(summary.periodSalesRevenue).toBe(7500);
    expect(summary.periodRawMaterialExpenses).toBe(2000);
    expect(summary.periodOperatingExpenses).toBe(500);
    expect(summary.trueBusinessNetProfit).toBe(5000);
    expect(summary.periodHomeFamilyExpenses).toBe(1500);
    expect(summary.netRetainedCashSavings).toBe(3500);
    expect(summary.totalInitialInvestmentAllTime).toBe(10000);
    expect(summary.capitalRecoveredPct).toBe(50);
    expect(summary.remainingToBreakEven).toBe(5000);
    expect(summary.itemWiseProfitability.length).toBe(1);
    expect(summary.itemWiseProfitability[0].totalRevenue).toBe(7500);

    // 7. Verify Excel (.xlsx) & PDF report generation
    const profile = await db.getShopProfile();
    const reportOut = await ReportsService.generateHomemadeBusinessReport(profile);
    expect(reportOut.xlsxBuffer.byteLength).toBeGreaterThan(1000);
    expect(reportOut.pdfBuffer.byteLength).toBeGreaterThan(1000);
  });
});
