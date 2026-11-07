import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../db/db';
import { POSView } from '../components/pos/POSView';
import { HomemadeFoodService } from '../services/homemadeFoodService';
import { InventoryService } from '../services/inventoryService';
import { BillingService } from '../services/billingService';
import { GallaService } from '../services/gallaService';
import { ReportsService } from '../services/reportsService';
import { Product, WALK_IN_CUSTOMER_ID } from '../types';

describe('Zero / Low Stock Permission Warning & Strict Multi-Business Separation Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    await HomemadeFoodService.resetWorkspaceSnapshots();
    await db.clearAllRecordsToEmpty();
  });

  it('1. POS shows Warning Dialog when product stock is 0, allows canceling, and adds to bill upon confirming physical stock', async () => {
    const zeroStockProduct: Product = {
      id: 'prod-zero-01',
      shop_id: 'current_shop',
      name: 'Everest Turmeric Powder 100g',
      marathi_name: 'हळद पावडर',
      short_code: 'ETP',
      barcode: '2000000000999',
      category: 'Spices & Masalas',
      unit_type: 'PCS',
      purchase_price: 25,
      selling_price: 32,
      mrp: 35,
      current_stock: 0, // ZERO STOCK in system
      low_stock_threshold: 5,
      last_supplier_name: 'Everest Spices Ltd',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };

    render(
      <POSView
        products={[zeroStockProduct]}
        customers={[]}
        shopProfile={{
          id: 'current_shop',
          shop_name: 'Shree Ganesh Kirana',
          owner_name: 'Ramesh Patil',
          phone: '9822001122',
          upi_vpa: 'kirana@upi',
          address: 'Ratnagiri',
          gst_footer_note: 'Thank you',
          business_type: 'KIRANA_RETAIL',
          invoice_prefix: 'KRN',
          updated_at: new Date().toISOString(),
        }}
      />
    );

    // 1. Verify Top-24 Fast-Tap card rendered for zero-stock product
    const fastTapBtn = screen.getByTestId('fast-tap-ETP');
    expect(fastTapBtn).toBeInTheDocument();

    // 2. Click zero-stock product -> must NOT add silently, must open Stock Warning Modal
    fireEvent.click(fastTapBtn);

    const warningModal = screen.getByTestId('stock-warning-modal');
    expect(warningModal).toBeInTheDocument();
    expect(warningModal.textContent).toContain('हळद पावडर');
    expect(warningModal.textContent).toContain('0 (Out of Stock / निरंक)');
    expect(warningModal.textContent).toContain('दुकानात प्रत्यक्ष माल उपलब्ध आहे का');

    // Cart 1 should still have 0 items
    expect(screen.queryByTestId('cart-row-prod-zero-01')).not.toBeInTheDocument();

    // 3. Test Cancel button -> closes modal and does NOT add to bill
    const cancelBtn = screen.getByTestId('cancel-add-zero-stock-btn');
    fireEvent.click(cancelBtn);
    expect(screen.queryByTestId('stock-warning-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-row-prod-zero-01')).not.toBeInTheDocument();

    // 4. Click again, then click Confirm button ("Yes, Physical Stock Available")
    fireEvent.click(fastTapBtn);
    expect(screen.getByTestId('stock-warning-modal')).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('confirm-add-zero-stock-btn');
    fireEvent.click(confirmBtn);

    // Modal closes and item is successfully added to the active bill!
    expect(screen.queryByTestId('stock-warning-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('cart-row-prod-zero-01')).toBeInTheDocument();
    expect(screen.getByTestId('cart-tab-1').textContent).toContain('1');
  });

  it('2. Keeps Kirana Store and Gruh Udyog products, sales, expenses, and reports 100% strictly separate without mixing', async () => {
    // 1. Start in KIRANA_RETAIL
    await db.updateShopProfile({
      shop_name: 'Patil Kirana Store',
      business_type: 'KIRANA_RETAIL',
      invoice_prefix: 'KRN',
    });

    const kiranaProduct = await InventoryService.createProduct({
      name: 'Kolam Rice 25kg Bag',
      short_code: 'KRB',
      category: 'Grains & Dals',
      unit_type: 'PACK',
      purchase_price: 1200,
      selling_price: 1450,
      mrp: 1500,
      current_stock: 10,
      low_stock_threshold: 2,
      is_quick_tap: true,
    });

    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: kiranaProduct,
          qty: 1,
          unit_selling_price: 1450,
          unit_purchase_cost: 1200,
          line_total: 1450,
        },
      ],
      subtotalAmount: 1450,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 1450,
      udhariAdded: 0,
    });

    await GallaService.recordExpense({
      category: 'SHOP_EXPENSE_RENT_ELEC',
      amount: 400,
      paidVia: 'CASH_GALLA',
      description: 'Kirana shop electricity bill',
    });

    // Verify Kirana state before switch
    const kiranaProductsBefore = await db.products.toArray();
    expect(kiranaProductsBefore.length).toBe(1);
    expect(kiranaProductsBefore[0].name).toBe('Kolam Rice 25kg Bag');

    const kiranaInvoicesBefore = await db.sales_invoices.toArray();
    expect(kiranaInvoicesBefore.length).toBe(1);
    expect(kiranaInvoicesBefore[0].invoice_number.startsWith('KRN-')).toBe(true);

    const kiranaPnlBefore = await ReportsService.getProfitAndLossData();
    expect(kiranaPnlBefore.salesRevenue).toBe(1450);
    expect(kiranaPnlBefore.shopOperatingExpenses).toBe(400);

    // 2. Switch to HOMEMADE_FOOD (Gruh Udyog) workspace
    const switchRes = await HomemadeFoodService.switchBusinessWorkspace('HOMEMADE_FOOD', {
      seedCatalogIfEmpty: true,
    });
    expect(switchRes.businessType).toBe('HOMEMADE_FOOD');
    expect(switchRes.activeProfile.invoice_prefix).toBe('HMF');

    // Verify Kirana product & sales are NOT mixed into Homemade Food workspace!
    const hmfProducts = await db.products.toArray();
    expect(hmfProducts.length).toBe(8);
    expect(hmfProducts.some((p) => p.name.includes('Kolam Rice'))).toBe(false);

    // Invoices and expenses in Homemade Food are clean and isolated
    const hmfInvoices = await db.sales_invoices.toArray();
    expect(hmfInvoices.length).toBe(0);

    const hmfExpenses = await db.expenses_and_drawings.toArray();
    expect(hmfExpenses.length).toBe(0);

    // Execute Homemade Food sale (e.g. Ukadiche Modak)
    const modak = hmfProducts.find((p) => p.short_code === 'UMD')!;
    const hmfCheckout = await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: modak,
          qty: 10,
          unit_selling_price: modak.selling_price,
          unit_purchase_cost: modak.purchase_price,
          line_total: 10 * modak.selling_price,
        },
      ],
      subtotalAmount: 10 * modak.selling_price,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 10 * modak.selling_price,
      udhariAdded: 0,
    });
    expect(hmfCheckout.invoice.invoice_number.startsWith('HMF-')).toBe(true);

    await GallaService.recordExpense({
      category: 'RAW_MATERIAL_INGREDIENTS',
      entryType: 'RAW_MATERIAL_EXPENSE',
      amount: 150,
      paidVia: 'CASH_GALLA',
      description: 'Rice flour, fresh coconut & jaggery for Modak',
    });

    const hmfPnl = await HomemadeFoodService.getCapitalAndExpenseSummary();
    expect(hmfPnl.periodSalesRevenue).toBe(10 * modak.selling_price);
    expect(hmfPnl.periodRawMaterialExpenses).toBe(150);

    // 3. Switch back to KIRANA_RETAIL
    const switchBackRes = await HomemadeFoodService.switchBusinessWorkspace('KIRANA_RETAIL');
    expect(switchBackRes.businessType).toBe('KIRANA_RETAIL');

    // Verify 100% Kirana data restored with 0 Homemade Food items leaking in
    const restoredKiranaProducts = await db.products.toArray();
    expect(restoredKiranaProducts.length).toBe(1);
    expect(restoredKiranaProducts[0].name).toBe('Kolam Rice 25kg Bag');
    expect(restoredKiranaProducts.some((p) => p.short_code === 'UMD')).toBe(false);

    const restoredKiranaInvoices = await db.sales_invoices.toArray();
    expect(restoredKiranaInvoices.length).toBe(1);
    expect(restoredKiranaInvoices[0].invoice_number.startsWith('KRN-')).toBe(true);

    const restoredKiranaPnl = await ReportsService.getProfitAndLossData();
    expect(restoredKiranaPnl.salesRevenue).toBe(1450);
    expect(restoredKiranaPnl.shopOperatingExpenses).toBe(400);
  });
});

