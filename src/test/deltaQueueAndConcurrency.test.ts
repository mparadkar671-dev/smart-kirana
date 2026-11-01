import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, requestStoragePersistence } from '../db/db';
import { BillingService } from '../services/billingService';
import { cloudSyncService } from '../services/cloudSyncService';
import { Product, Customer, SalesInvoice, SaleItem } from '../types';

describe('Iteration 2: Delta-Queue Cloud Sync & ACID Conflict Resolution', () => {
  const testProductId = 'prod-rice-atomic-test';
  const testCustomerId = 'cust-ramesh-atomic-test';
  const testShopId = 'shop-atomic-test';

  beforeEach(async () => {
    // Clear relevant test tables
    await db.sales_invoices.clear();
    await db.sale_items.clear();
    await db.inventory_logs.clear();
    await db.products.clear();
    await db.customers.clear();
    await db.khata_transactions.clear();
    await db.sync_outbox.clear();
    await db.daily_galla_sessions.clear();

    // Seed test product with initial 100 kg stock
    const testProduct: Product = {
      id: testProductId,
      shop_id: testShopId,
      barcode: '8901234567890',
      short_code: 'RICE',
      name: 'Basmati Rice Premium',
      category: 'Grains & Pulses',
      unit_type: 'KG_LOOSE',
      purchase_price: 60,
      selling_price: 80,
      mrp: 90,
      current_stock: 100,
      low_stock_threshold: 15,
      last_supplier_name: 'Shree Krishna Traders',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    await db.products.put(testProduct);

    // Initial stock-in log for 100 kg
    await db.inventory_logs.put({
      id: 'log-initial-100kg',
      shop_id: testShopId,
      product_id: testProductId,
      change_qty: 100,
      reason_type: 'PURCHASE_IN',
      unit_cost_at_time: 60,
      reference_id: null,
      notes: 'Initial opening stock',
      created_at: new Date().toISOString(),
    });

    // Seed test customer with 0 initial udhari
    const testCustomer: Customer = {
      id: testCustomerId,
      shop_id: testShopId,
      name: 'Ramesh Patel',
      phone: '9876543210',
      address_landmark: 'Shop 14, Main Road',
      credit_limit: 5000,
      current_udhari_balance: 0,
      oldest_unpaid_date: null,
      created_at: new Date().toISOString(),
    };
    await db.customers.put(testCustomer);
  });

  it('atomically executes concurrent offline sales of the same product with 0 lost stock', async () => {
    // Simulate two concurrent counter sales on the same product:
    // Sale A: 15 kg
    // Sale B: 25 kg
    // Expected final stock: 100 - 15 - 25 = 60 kg

    const saleAInvoice: SalesInvoice = {
      id: 'inv-conc-001',
      shop_id: testShopId,
      invoice_number: 'INV-A-101',
      customer_id: '0000-WALK-IN',
      subtotal_amount: 15 * 80,
      discount_roundoff: 0,
      grand_total: 1200,
      total_cogs: 15 * 60,
      payment_mode: 'CASH',
      amount_paid_now: 1200,
      udhari_added: 0,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    };

    const saleAItems: SaleItem[] = [
      {
        id: 'item-conc-001',
        shop_id: testShopId,
        invoice_id: 'inv-conc-001',
        product_id: testProductId,
        product_name_snapshot: 'Basmati Rice Premium',
        qty: 15,
        unit_purchase_cost: 60,
        unit_selling_price: 80,
        line_total: 1200,
      },
    ];

    const saleBInvoice: SalesInvoice = {
      id: 'inv-conc-002',
      shop_id: testShopId,
      invoice_number: 'INV-B-102',
      customer_id: '0000-WALK-IN',
      subtotal_amount: 25 * 80,
      discount_roundoff: 0,
      grand_total: 2000,
      total_cogs: 25 * 60,
      payment_mode: 'CASH',
      amount_paid_now: 2000,
      udhari_added: 0,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    };

    const saleBItems: SaleItem[] = [
      {
        id: 'item-conc-002',
        shop_id: testShopId,
        invoice_id: 'inv-conc-002',
        product_id: testProductId,
        product_name_snapshot: 'Basmati Rice Premium',
        qty: 25,
        unit_purchase_cost: 60,
        unit_selling_price: 80,
        line_total: 2000,
      },
    ];

    // Execute concurrently using Promise.all
    await Promise.all([
      db.executeAtomicSale({ invoice: saleAInvoice, items: saleAItems }),
      db.executeAtomicSale({ invoice: saleBInvoice, items: saleBItems }),
    ]);

    // Check final product stock
    const updatedProd = await db.products.get(testProductId);
    expect(updatedProd).toBeDefined();
    expect(updatedProd!.current_stock).toBe(60);

    // Verify both SALE_OUT inventory logs exist
    const logs = await db.inventory_logs.where('product_id').equals(testProductId).toArray();
    expect(logs.length).toBe(3); // 1 initial + 2 sales
    const saleDeltas = logs.filter((l) => l.reason_type === 'SALE_OUT').map((l) => l.change_qty);
    expect(saleDeltas).toContain(-15);
    expect(saleDeltas).toContain(-25);

    // Verify deterministic ledger computation matches exact physical stock
    const computedStock = await db.recomputeProductStockFromLogs(testProductId);
    expect(computedStock).toBe(60);
    expect(computedStock).toBe(updatedProd!.current_stock);
  });

  it('guarantees atomic outbox queueing for every offline sale transaction', async () => {
    const saleInvoice: SalesInvoice = {
      id: 'inv-outbox-001',
      shop_id: testShopId,
      invoice_number: 'INV-OB-201',
      customer_id: testCustomerId,
      subtotal_amount: 10 * 80,
      discount_roundoff: 0,
      grand_total: 800,
      total_cogs: 600,
      payment_mode: 'SPLIT_PARTIAL',
      amount_paid_now: 300,
      udhari_added: 500,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    };

    const saleItems: SaleItem[] = [
      {
        id: 'item-ob-001',
        shop_id: testShopId,
        invoice_id: 'inv-outbox-001',
        product_id: testProductId,
        product_name_snapshot: 'Basmati Rice Premium',
        qty: 10,
        unit_purchase_cost: 60,
        unit_selling_price: 80,
        line_total: 800,
      },
    ];

    const customer = await db.customers.get(testCustomerId);

    await db.executeAtomicSale({
      invoice: saleInvoice,
      items: saleItems,
      customer,
    });

    // Check sync_outbox entries
    const outboxItems = await db.sync_outbox.where('status').equals('PENDING').toArray();
    expect(outboxItems.length).toBeGreaterThanOrEqual(4);

    const tablesInQueue = outboxItems.map((o) => o.table_name);
    expect(tablesInQueue).toContain('sales_invoices');
    expect(tablesInQueue).toContain('sale_items');
    expect(tablesInQueue).toContain('inventory_logs');
    expect(tablesInQueue).toContain('khata_transactions');
    expect(tablesInQueue).toContain('customers');
    expect(tablesInQueue).toContain('products');

    // Customer balance updated to 500
    const updatedCust = await db.customers.get(testCustomerId);
    expect(updatedCust!.current_udhari_balance).toBe(500);

    // Computed customer balance from append-only ledger
    const computedKhata = await db.recomputeCustomerUdhariFromTransactions(testCustomerId);
    expect(computedKhata).toBe(500);
  });

  it('reconciles all stock and udhari deterministically preventing cloud overwrite drift', async () => {
    // Artificially drift the snapshot fields to simulate a stale client or bad sync overwrite
    await db.products.update(testProductId, { current_stock: 999 }); // incorrect!
    await db.customers.update(testCustomerId, { current_udhari_balance: 8888 }); // incorrect!

    // Add explicit khata ledger entries
    await db.khata_transactions.put({
      id: 'tx-ledger-1',
      shop_id: testShopId,
      customer_id: testCustomerId,
      entry_type: 'DEBIT_UDHARI_GIVEN',
      amount: 450,
      payment_channel: 'BILL_CREDIT',
      invoice_id: 'inv-test-drift',
      running_balance_after: 450,
      notes: 'Test credit',
      created_at: new Date().toISOString(),
    });

    await db.khata_transactions.put({
      id: 'tx-ledger-2',
      shop_id: testShopId,
      customer_id: testCustomerId,
      entry_type: 'CREDIT_JAMA_RECEIVED',
      amount: 150,
      payment_channel: 'CASH',
      invoice_id: null,
      running_balance_after: 300,
      notes: 'Partial cash payment',
      created_at: new Date().toISOString(),
    });

    // Run deterministic ledger reconciliation
    const result = await db.reconcileAllStockAndBalances();
    expect(result.productsReconciled).toBeGreaterThanOrEqual(1);
    expect(result.customersReconciled).toBeGreaterThanOrEqual(1);

    // Verify stock is recovered to 100 (from 100 kg initial log)
    const fixedProduct = await db.products.get(testProductId);
    expect(fixedProduct!.current_stock).toBe(100);

    // Verify customer udhari is recovered to 450 - 150 = 300
    const fixedCustomer = await db.customers.get(testCustomerId);
    expect(fixedCustomer!.current_udhari_balance).toBe(300);
  });

  it('verifies BillingService.executeCheckout atomically writes mutations to sync_outbox', async () => {
    const prod = await db.products.get(testProductId);
    expect(prod).toBeDefined();

    const saleResult = await BillingService.executeCheckout({
      items: [
        {
          product: prod!,
          qty: 5,
          unit_purchase_cost: 60,
          unit_selling_price: 80,
          line_total: 400,
        },
      ],
      subtotalAmount: 400,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 400,
      udhariAdded: 0,
      customerId: '0000-WALK-IN',
    });

    expect(saleResult.invoice).toBeDefined();
    expect(saleResult.invoice.status).toBe('COMPLETED');

    // Verify product stock deducted: 100 - 5 = 95
    const updatedProd = await db.products.get(testProductId);
    expect(updatedProd!.current_stock).toBe(95);

    // Verify outbox queued
    const outboxItems = await db.sync_outbox.where('table_name').equals('sales_invoices').toArray();
    expect(outboxItems.length).toBeGreaterThanOrEqual(1);
    expect(outboxItems.some((item) => (item.payload as any).invoice_number === saleResult.invoice.invoice_number)).toBe(true);
  });

  it('requests and verifies storage persistence on initialization', async () => {
    const persistResult = await requestStoragePersistence();
    expect(persistResult).toBeDefined();
    expect(typeof persistResult.persisted).toBe('boolean');
  });
});
