import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { db } from '../db/db';
import { InventoryService } from '../services/inventoryService';
import { calculateProfitMarginPercent } from '../utils/math';
import { ProductModal } from '../components/inventory/ProductModal';
import { InventoryView } from '../components/inventory/InventoryView';

describe('Phase 2 Verification Gate - Product CRUD & Margin Badges (REQ-04)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('Creates packaged item (PCS) and verifies profit margin formula', async () => {
    const newPackaged = await InventoryService.createProduct({
      name: 'Haldiram Soan Papdi 250g',
      short_code: 'SP2',
      barcode: '890103009991',
      category: 'Snacks & Biscuits',
      unit_type: 'PCS',
      purchase_price: 70.00,
      selling_price: 100.00,
      mrp: 100.00,
      current_stock: 20,
      low_stock_threshold: 5,
      last_supplier_name: 'Haldiram Distributor',
      expiry_date: '2027-10-01',
      is_quick_tap: true,
    });

    expect(newPackaged.id).toBeDefined();
    expect(newPackaged.unit_type).toBe('PCS');

    // Confirm margin formula: ((100 - 70) / 100) * 100 = 30%
    const margin = calculateProfitMarginPercent(newPackaged.purchase_price, newPackaged.selling_price);
    expect(margin).toBe(30.0);

    // Verify stored in Dexie DB
    const saved = await db.products.get(newPackaged.id);
    expect(saved).toBeDefined();
    expect(saved?.name).toBe('Haldiram Soan Papdi 250g');
    expect(saved?.current_stock).toBe(20);

    // Verify initial stock was logged into inventory_logs
    const initialLog = await db.inventory_logs.where({ product_id: newPackaged.id }).first();
    expect(initialLog).toBeDefined();
    expect(initialLog?.change_qty).toBe(20);
    expect(initialLog?.reason_type).toBe('PURCHASE_IN');
  });

  it('Creates loose item (KG_LOOSE) and verifies 3 decimal places', async () => {
    const newLoose = await InventoryService.createProduct({
      name: 'Roasted Chana Loose / Kg',
      short_code: 'RC1',
      category: 'Loose Staples',
      unit_type: 'KG_LOOSE',
      purchase_price: 90.00,
      selling_price: 120.00,
      mrp: 130.00,
      current_stock: 45.750,
      low_stock_threshold: 10.000,
      last_supplier_name: 'APMC Grain Merchant',
      is_quick_tap: true,
    });

    expect(newLoose.unit_type).toBe('KG_LOOSE');
    expect(newLoose.current_stock).toBe(45.75);

    // Margin: ((120 - 90) / 120) * 100 = 25%
    const margin = calculateProfitMarginPercent(newLoose.purchase_price, newLoose.selling_price);
    expect(margin).toBe(25.0);

    const saved = await db.products.get(newLoose.id);
    expect(saved?.current_stock).toBe(45.75);
  });

  it('Renders ProductModal and verifies dynamic margin badge UI', async () => {
    render(
      <ProductModal
        isOpen={true}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    const purchaseInput = screen.getByTestId('purchase-price-input');
    const sellingInput = screen.getByTestId('selling-price-input');
    fireEvent.change(purchaseInput, { target: { value: '80' } });
    fireEvent.change(sellingInput, { target: { value: '100' } });

    // Margin = ((100 - 80) / 100) * 100 = 20%
    const marginBadge = screen.getByTestId('margin-badge');
    expect(marginBadge.textContent).toContain('20.0% Margin');
  });
});

describe('Phase 2 Verification Gate - Stock Ledger Invariant (++ / --) & Home Use (REQ-05)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-05 Verification: Start with 20, +10 purchase, -2 SELF_USE_OUT -> current_stock === 28 and inventory_logs sum === 28', async () => {
    // 1. Create a product starting with exactly 20 units
    const testProd = await InventoryService.createProduct({
      name: 'Verif Parle Biscuit Pack',
      short_code: 'VPB',
      category: 'Snacks & Biscuits',
      unit_type: 'PCS',
      purchase_price: 10.00,
      selling_price: 15.00,
      mrp: 15.00,
      current_stock: 20, // starts with 20
      low_stock_threshold: 5,
      is_quick_tap: false,
    });

    expect(testProd.current_stock).toBe(20);

    // 2. Add +10 purchase via restock (++ Stock In)
    const restockRes = await InventoryService.restock({
      productId: testProd.id,
      qty: 10,
      unitCost: 10.00,
      supplierName: 'Parle Depot',
      notes: 'Wholesale batch delivery',
    });
    expect(restockRes.product.current_stock).toBe(30);

    // 3. Deduct -2 for SELF_USE_OUT (-- Home Use)
    const stockOutRes = await InventoryService.stockOut({
      productId: testProd.id,
      qty: 2,
      reasonType: 'SELF_USE_OUT',
      notes: 'Taken for evening family tea',
    });

    // 4. Verify current_stock === 28
    expect(stockOutRes.product.current_stock).toBe(28);

    const reloaded = await db.products.get(testProd.id);
    expect(reloaded?.current_stock).toBe(28);

    // 5. Verify inventory_logs sum equals +28 (+20 initial, +10 restock, -2 self use)
    const logs = await db.inventory_logs.where({ product_id: testProd.id }).toArray();
    expect(logs.length).toBe(3);

    const sumQty = logs.reduce((sum, log) => sum + log.change_qty, 0);
    expect(sumQty).toBe(28);

    // 6. Verify linked HOME_SELF_USE_GOODS record created at purchase_price * qty
    // 2 units * ₹10.00 = ₹20.00
    expect(stockOutRes.expense).toBeDefined();
    expect(stockOutRes.expense?.category).toBe('HOME_SELF_USE_GOODS');
    expect(stockOutRes.expense?.amount).toBe(20.00);
    expect(stockOutRes.expense?.paid_via).toBe('INVENTORY_DEDUCTION');

    const dbExpense = await db.expenses_and_drawings.get(stockOutRes.expense!.id);
    expect(dbExpense).toBeDefined();
    expect(dbExpense?.amount).toBe(20.00);
  });
});

describe('Phase 2 Verification Gate - Wholesaler Restock & Expiry Alert System (REQ-06)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-06 Verification: Item with stock <= threshold and expiry today + 7 days appears immediately in alert badges and Restock tab', async () => {
    // Calculate date for today + 7 days
    const todayPlus7 = new Date();
    todayPlus7.setDate(todayPlus7.getDate() + 7);
    const expiryStr = todayPlus7.toISOString().split('T')[0];

    // Create item with current_stock = 3, threshold = 10 (low stock), expiry today + 7 days
    const alertItem = await InventoryService.createProduct({
      name: 'Amul Fresh Paneer 200g',
      short_code: 'PAN',
      barcode: '890103009999',
      category: 'Dairy',
      unit_type: 'PACK',
      purchase_price: 75.00,
      selling_price: 90.00,
      mrp: 90.00,
      current_stock: 3, // <= 10 (triggers low stock)
      low_stock_threshold: 10,
      last_supplier_name: 'Amul Milk Agency',
      expiry_date: expiryStr, // <= 15 days (triggers expiry alert)
      is_quick_tap: true,
    });

    const products = await db.products.toArray();

    // Verify filter functions
    const lowStock = InventoryService.filterLowStock(products);
    expect(lowStock.some((p) => p.id === alertItem.id)).toBe(true);

    const expiring = InventoryService.filterExpiringSoon(products, 15);
    expect(expiring.some((p) => p.id === alertItem.id)).toBe(true);

    // Render InventoryView and verify alert badges and Restock tab
    render(
      <InventoryView
        products={products}
        shopProfile={{
          id: 'current_shop',
          shop_name: 'Test Kirana',
          owner_name: 'Tester',
          phone: '9876543210',
          upi_vpa: 'test@upi',
          address: 'Market',
          gst_footer_note: 'Footer',
          updated_at: new Date().toISOString(),
        }}
      />
    );

    // Verify alert pill is displayed on Wholesaler tab
    const alertPill = screen.getByTestId('restock-alert-pill');
    expect(alertPill).toBeInTheDocument();
    expect(parseInt(alertPill.textContent || '0')).toBeGreaterThan(0);

    // Switch to Wholesaler Restock tab
    const restockTabBtn = screen.getByRole('button', { name: /Wholesaler Restock & Alerts/i });
    fireEvent.click(restockTabBtn);

    // Verify restock table and expiry section render the alert item in both tables
    await waitFor(() => {
      const matches = screen.getAllByText('Amul Fresh Paneer 200g');
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('low-stock-count')).toBeInTheDocument();
      expect(screen.getByTestId('expiring-count')).toBeInTheDocument();
    });
  });
});
