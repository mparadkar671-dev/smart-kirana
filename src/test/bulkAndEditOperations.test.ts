import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { InventoryService } from '../services/inventoryService';
import { KhataService } from '../services/khataService';
import { GallaService } from '../services/gallaService';
import { Product, Customer, SalesInvoice, SaleItem } from '../types';

describe('Bulk & Edit Operations Verification', () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.customers.clear();
    await db.sales_invoices.clear();
    await db.sale_items.clear();
    await db.khata_transactions.clear();
    await db.daily_galla_sessions.clear();

    // Ensure walk-in customer exists
    await db.customers.add({
      id: '0000-WALK-IN',
      name: 'Walk-in Customer',
      phone: '0000000000',
      credit_limit: 0,
      current_udhari_balance: 0,
      oldest_unpaid_date: null,
      created_at: new Date().toISOString(),
    });
  });

  it('verifies bulk product deletion, category update, and fast-tap toggle', async () => {
    const p1: Product = {
      id: 'prod-1',
      name: 'Basmati Rice',
      short_code: 'BR1',
      barcode: '8901111111111',
      category: 'Grains',
      unit_type: 'KG_LOOSE',
      purchase_price: 60,
      selling_price: 80,
      mrp: 85,
      current_stock: 100,
      low_stock_threshold: 10,
      last_supplier_name: 'Local Mandi',
      is_quick_tap: false,
      updated_at: new Date().toISOString(),
    };

    const p2: Product = {
      id: 'prod-2',
      name: 'Toor Dal',
      short_code: 'TD1',
      barcode: '8902222222222',
      category: 'Pulses',
      unit_type: 'KG_LOOSE',
      purchase_price: 120,
      selling_price: 150,
      mrp: 160,
      current_stock: 50,
      low_stock_threshold: 5,
      last_supplier_name: 'Local Mandi',
      is_quick_tap: false,
      updated_at: new Date().toISOString(),
    };

    await db.products.bulkAdd([p1, p2]);

    // Bulk toggle quick tap
    await InventoryService.bulkToggleQuickTap(['prod-1', 'prod-2'], true);
    const updatedP1 = await db.products.get('prod-1');
    const updatedP2 = await db.products.get('prod-2');
    expect(updatedP1?.is_quick_tap).toBe(true);
    expect(updatedP2?.is_quick_tap).toBe(true);

    // Bulk update category
    await InventoryService.bulkUpdateCategory(['prod-1', 'prod-2'], 'Staples');
    const catP1 = await db.products.get('prod-1');
    const catP2 = await db.products.get('prod-2');
    expect(catP1?.category).toBe('Staples');
    expect(catP2?.category).toBe('Staples');

    // Bulk delete
    await InventoryService.bulkDeleteProducts(['prod-1']);
    const afterDeleteP1 = await db.products.get('prod-1');
    const afterDeleteP2 = await db.products.get('prod-2');
    expect(afterDeleteP1).toBeUndefined();
    expect(afterDeleteP2).toBeDefined();
  });

  it('verifies customer single and bulk deletion with walk-in protection', async () => {
    const c1: Customer = {
      id: 'cust-1',
      name: 'Ramesh Sharma',
      phone: '9876543210',
      credit_limit: 5000,
      current_udhari_balance: 500,
      oldest_unpaid_date: '2026-10-01',
      created_at: new Date().toISOString(),
    };

    const c2: Customer = {
      id: 'cust-2',
      name: 'Suresh Verma',
      phone: '9876543211',
      credit_limit: 3000,
      current_udhari_balance: 0,
      oldest_unpaid_date: null,
      created_at: new Date().toISOString(),
    };

    await db.customers.bulkAdd([c1, c2]);

    // Deleting single customer
    await KhataService.deleteCustomer('cust-2');
    expect(await db.customers.get('cust-2')).toBeUndefined();

    // Walk-in protection
    await KhataService.bulkDeleteCustomers(['0000-WALK-IN', 'cust-1']);
    expect(await db.customers.get('0000-WALK-IN')).toBeDefined();
    expect(await db.customers.get('cust-1')).toBeUndefined();
  });

  it('verifies updating invoice details and bulk voiding with stock and khata synchronization', async () => {
    // Setup a product
    const p: Product = {
      id: 'prod-oil',
      name: 'Mustard Oil 1L',
      short_code: 'MO1',
      barcode: '8903333333333',
      category: 'Edible Oils',
      unit_type: 'LTR',
      purchase_price: 130,
      selling_price: 160,
      mrp: 170,
      current_stock: 40,
      low_stock_threshold: 5,
      last_supplier_name: 'Oil Depot',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    await db.products.add(p);

    const c: Customer = {
      id: 'cust-acc',
      name: 'Anil Gupta',
      phone: '9876543212',
      credit_limit: 5000,
      current_udhari_balance: 0,
      oldest_unpaid_date: null,
      created_at: new Date().toISOString(),
    };
    await db.customers.add(c);

    const nowIso = new Date().toISOString();
    const inv: SalesInvoice = {
      id: 'inv-101',
      invoice_number: 'INV-101',
      customer_id: '0000-WALK-IN',
      subtotal_amount: 320,
      discount_roundoff: 0,
      grand_total: 320,
      total_cogs: 260,
      payment_mode: 'CASH',
      amount_paid_now: 320,
      udhari_added: 0,
      status: 'COMPLETED',
      created_at: nowIso,
    };
    await db.sales_invoices.add(inv);

    const item: SaleItem = {
      id: 'item-101',
      invoice_id: 'inv-101',
      product_id: 'prod-oil',
      product_name_snapshot: 'Mustard Oil 1L',
      qty: 2,
      unit_purchase_cost: 130,
      unit_selling_price: 160,
      line_total: 320,
    };
    await db.sale_items.add(item);

    // Update invoice payment mode to UDHARI_FULL and assign customer
    await GallaService.updateInvoiceDetails('inv-101', {
      paymentMode: 'UDHARI_FULL',
      customerId: 'cust-acc',
    });

    const updatedInv = await db.sales_invoices.get('inv-101');
    expect(updatedInv?.payment_mode).toBe('UDHARI_FULL');
    expect(updatedInv?.customer_id).toBe('cust-acc');
    expect(updatedInv?.amount_paid_now).toBe(0);
    expect(updatedInv?.udhari_added).toBe(320);

    const updatedCust = await db.customers.get('cust-acc');
    expect(updatedCust?.current_udhari_balance).toBe(320);

    // Now test bulk voiding
    await GallaService.bulkVoidInvoices(['inv-101']);
    const voidedInv = await db.sales_invoices.get('inv-101');
    expect(voidedInv?.status).toBe('VOIDED');

    // Stock should be restored (40 + 2 = 42)
    const restoredProd = await db.products.get('prod-oil');
    expect(restoredProd?.current_stock).toBe(42);

    // Customer Udhari should be reversed (320 - 320 = 0)
    const reversedCust = await db.customers.get('cust-acc');
    expect(reversedCust?.current_udhari_balance).toBe(0);
  });
});
