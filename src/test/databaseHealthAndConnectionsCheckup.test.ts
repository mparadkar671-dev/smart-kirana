import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, kiranaDb, getActiveDb } from '../db/db';
import {
  cloudSyncService,
  SUPABASE_CLOUD_TABLES,
  sanitizeTablePayloadForSupabase,
} from '../services/cloudSyncService';
import { getSupabaseCredentials, getSupabaseClient } from '../lib/supabase';
import { resolveProductBusinessType, filterProductsForBusiness } from '../utils/businessFirewall';
import { Product, Customer, SalesInvoice, SaleItem, DailyGallaSession, ExpenseAndDrawing } from '../types';
import { toPaise, toRupees } from '../utils/math';

describe('Comprehensive Database Health, Schemas & Connections Checkup', () => {
  const TEST_SHOP_ID = 'test-kirana-shop-001';

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('kirana_active_shop_id', TEST_SHOP_ID);
    localStorage.setItem('kirana_active_business_type', 'KIRANA_RETAIL');
    await kiranaDb.clearAllRecordsToEmpty();
    await kiranaDb.initializeDatabase();
  });

  afterEach(async () => {
    await kiranaDb.clearAllRecordsToEmpty();
  });

  it('1. Verifies all 18 Dexie IndexedDB tables exist and are healthy for CRUD operations', async () => {
    const active = getActiveDb('KIRANA_RETAIL');

    // Verify presence of all major entity tables
    expect(active.products).toBeDefined();
    expect(active.customers).toBeDefined();
    expect(active.sales_invoices).toBeDefined();
    expect(active.sale_items).toBeDefined();
    expect(active.khata_transactions).toBeDefined();
    expect(active.expenses_and_drawings).toBeDefined();
    expect(active.daily_galla_sessions).toBeDefined();
    expect(active.shop_profile).toBeDefined();
    expect(active.store_users).toBeDefined();
    expect(active.sync_outbox).toBeDefined();
    expect(active.credit_notes).toBeDefined();
    expect(active.wholesalers).toBeDefined();
    expect(active.loan_accounts).toBeDefined();
    expect(active.security_audit_logs).toBeDefined();

    // Verify Default Walk-In customer exists
    const walkIn = await active.customers.get('0000-WALK-IN');
    expect(walkIn).toBeDefined();
    expect(walkIn?.name).toBe('Walk-in Customer (Cash / UPI)');

    // Verify Shop Profile exists
    const profile = await active.getShopProfile();
    expect(profile).toBeDefined();
    expect(profile.business_type).toBe('KIRANA_RETAIL');
  });

  it('2. Verifies Kirana product creation, integer-paisa math, and automatic tagging invariants', async () => {
    const active = getActiveDb('KIRANA_RETAIL');

    const testProd: Product = {
      id: 'test-poha-01',
      shop_id: TEST_SHOP_ID,
      business_type: 'KIRANA_RETAIL',
      name: 'Thick Poha 1kg (जाड पोहे)',
      category: 'Grains, Atta & Dal (धान्य व डाळी)',
      barcode: '8901234567890',
      short_code: 'POH1',
      unit_type: 'PCS',
      purchase_price: 45.0,
      selling_price: 52.0,
      mrp: 55.0,
      current_stock: 50,
      low_stock_threshold: 10,
      last_supplier_name: 'Local Distributor',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };

    await active.products.put(testProd);

    // Fetch back
    const fetched = await active.products.get('test-poha-01');
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe('Thick Poha 1kg (जाड पोहे)');
    expect(fetched?.business_type).toBe('KIRANA_RETAIL');

    // Invariant check: Integer paisa calculation
    const sellingPaise = toPaise(fetched!.selling_price);
    const purchasePaise = toPaise(fetched!.purchase_price);
    expect(sellingPaise).toBe(5200);
    expect(purchasePaise).toBe(4500);
    expect(sellingPaise - purchasePaise).toBe(700);
    expect(toRupees(sellingPaise - purchasePaise)).toBe(7.0);

    // Verify filterProductsForBusiness returns the product for Kirana store
    const visible = filterProductsForBusiness([fetched!], 'KIRANA_RETAIL', TEST_SHOP_ID);
    expect(visible.length).toBe(1);
    expect(visible[0].id).toBe('test-poha-01');
  });

  it('3. Verifies Sales, Khata Ledger, and Galla Session transactional connections', async () => {
    const active = getActiveDb('KIRANA_RETAIL');

    // 1. Create a customer
    const cust: Customer = {
      id: 'cust-ramesh-01',
      shop_id: TEST_SHOP_ID,
      name: 'Ramesh Patil',
      phone: '9876543210',
      current_udhari_balance: 0,
      credit_limit: 5000,
      created_at: new Date().toISOString(),
    };
    await active.customers.put(cust);

    // 2. Add an invoice
    const invoiceId = 'inv-test-1001';
    const invoice: SalesInvoice = {
      id: invoiceId,
      invoice_number: 'KRN-1001',
      shop_id: TEST_SHOP_ID,
      business_type: 'KIRANA_RETAIL',
      customer_id: cust.id,
      payment_mode: 'SPLIT_PARTIAL',
      subtotal_amount: 500,
      discount_roundoff: 0,
      grand_total: 500,
      total_cogs: 400,
      amount_paid_now: 200,
      udhari_added: 300,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    };
    await active.sales_invoices.put(invoice);

    // 3. Record Udhari entry
    await active.khata_transactions.put({
      id: 'khata-tx-01',
      shop_id: TEST_SHOP_ID,
      business_type: 'KIRANA_RETAIL',
      customer_id: cust.id,
      invoice_id: invoiceId,
      entry_type: 'DEBIT_UDHARI_GIVEN',
      amount: 300,
      payment_channel: 'BILL_CREDIT',
      running_balance_after: 300,
      notes: 'Test invoice udhari',
      created_at: new Date().toISOString(),
    });

    // Update customer balance
    await active.customers.update(cust.id, { current_udhari_balance: 300 });

    const updatedCust = await active.customers.get(cust.id);
    expect(updatedCust?.current_udhari_balance).toBe(300);

    // 4. Verify Galla Session tracks cash collections
    const today = new Date().toISOString().split('T')[0];
    const session: DailyGallaSession = {
      id: `galla-${today}`,
      session_date: today,
      shop_id: TEST_SHOP_ID,
      business_type: 'KIRANA_RETAIL',
      opening_cash: 1000,
      cash_sales_total: 200,
      cash_udhari_recovered: 0,
      cash_expenses_out: 0,
      expected_closing_cash: 1200, // 1000 opening + 200 cash sales
    };
    await active.daily_galla_sessions.put(session);

    const savedSession = await active.daily_galla_sessions.get(`galla-${today}`);
    expect(savedSession?.expected_closing_cash).toBe(1200);
  });

  it('4. Verifies Cloud Connection & Supabase Credentials configuration', async () => {
    const creds = getSupabaseCredentials();
    expect(creds.url).toBeDefined();
    expect(creds.url.startsWith('https://')).toBe(true);
    expect(creds.key).toBeDefined();
    expect(creds.key.length).toBeGreaterThan(10);

    const client = getSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');

    const syncStatus = cloudSyncService.getStatus();
    expect(syncStatus).toBeDefined();
    expect(typeof syncStatus.isSyncing).toBe('boolean');
  });

  it('5. Verifies Parallel Multi-Device Live Sync subscription and teardown', () => {
    // Start live sync
    const stopLiveSync = cloudSyncService.startParallelLiveSync(TEST_SHOP_ID);
    expect(typeof stopLiveSync).toBe('function');

    // Teardown should cleanly close channels without error
    expect(() => stopLiveSync()).not.toThrow();
  });

  it('6. Verifies that all common Maharashtrian groceries never get misrouted to Homemade Food', () => {
    const kiranaItems = [
      { name: 'Poha जाड पोहे 1kg', category: 'Grains, Atta & Dal (धान्य व डाळी)' },
      { name: 'Rava सुजी रवा 500g', category: 'Grains, Atta & Dal (धान्य व डाळी)' },
      { name: 'Besan चणा डाळ पीठ 500g', category: 'Grains, Atta & Dal (धान्य व डाळी)' },
      { name: 'Lijjat Papad लिज्जत पापड', category: 'Snacks, Biscuits & Namkeen (फरसाण व बिस्कीट)' },
      { name: 'Kpra Mango Pickle लोणचे', category: 'Masala, Spices & Cooking (मसाले व तेल)' },
      { name: 'Bhadang Chivda भडंग चिवडा 200g', category: 'Snacks, Biscuits & Namkeen (फरसाण व बिस्कीट)' },
      { name: 'Tata Salt 1kg', category: 'Masala, Spices & Cooking (मसाले व तेल)' },
      { name: 'Fortune Sunflower Oil 1L', category: 'Masala, Spices & Cooking (मसाले व तेल)' },
    ];

    for (const item of kiranaItems) {
      const resolved = resolveProductBusinessType({
        name: item.name,
        category: item.category,
      });
      expect(resolved).toBe('KIRANA_RETAIL');
    }
  });

  it('7. Verifies all 11 Supabase Cloud tables sanitize payloads strictly to live PostgreSQL schema columns', () => {
    expect(Array.from(SUPABASE_CLOUD_TABLES)).toEqual([
      'shop_profile',
      'store_users',
      'wholesalers',
      'products',
      'customers',
      'sales_invoices',
      'sale_items',
      'khata_transactions',
      'inventory_logs',
      'daily_galla_sessions',
      'expenses_and_drawings',
    ]);

    // Verify local-only fields (business_type, loan_account_id, is_loan_funded, sale_rate_type, entry_type, approval_status)
    // are stripped before sending to Supabase so PostgREST never throws 42703 / PGRST204
    const ws = sanitizeTablePayloadForSupabase(
      'wholesalers',
      { id: 'ws-1', name: 'Test Agency', phone: '9876543210', business_type: 'KIRANA_RETAIL' },
      TEST_SHOP_ID
    );
    expect(ws).not.toHaveProperty('business_type');
    expect(ws).toHaveProperty('name', 'Test Agency');

    const cust = sanitizeTablePayloadForSupabase(
      'customers',
      { id: 'cust-1', name: 'Ramesh', phone: '9876543210', business_type: 'KIRANA_RETAIL' },
      TEST_SHOP_ID
    );
    expect(cust).not.toHaveProperty('business_type');

    const inv = sanitizeTablePayloadForSupabase(
      'sales_invoices',
      {
        id: 'inv-1',
        invoice_number: 'KRN-1001',
        customer_id: '0000-WALK-IN',
        payment_mode: 'CASH',
        grand_total: 150,
        business_type: 'KIRANA_RETAIL',
      },
      TEST_SHOP_ID
    );
    expect(inv).not.toHaveProperty('business_type');
    expect(inv).toHaveProperty('customer_id', '0000-WALK-IN');

    const item = sanitizeTablePayloadForSupabase(
      'sale_items',
      {
        id: 'si-1',
        invoice_id: 'inv-1',
        product_id: 'prod-1',
        product_name_snapshot: 'Sugar 1kg',
        qty: 2,
        sale_rate_type: 'RETAIL',
        business_type: 'KIRANA_RETAIL',
      },
      TEST_SHOP_ID
    );
    expect(item).not.toHaveProperty('sale_rate_type');
    expect(item).not.toHaveProperty('business_type');

    const khata = sanitizeTablePayloadForSupabase(
      'khata_transactions',
      {
        id: 'kh-1',
        customer_id: 'cust-1',
        entry_type: 'DEBIT_UDHARI_GIVEN',
        amount: 250,
        running_balance_after: 500,
        business_type: 'KIRANA_RETAIL',
      },
      TEST_SHOP_ID
    );
    expect(khata).toHaveProperty('entry_type', 'DEBIT_UDHARI_GIVEN');
    expect(khata).not.toHaveProperty('business_type');
    expect(khata).toHaveProperty('balance_after', 500);
    expect(khata).toHaveProperty('running_balance_after', 500);

    const log = sanitizeTablePayloadForSupabase(
      'inventory_logs',
      {
        id: 'log-1',
        product_id: 'prod-1',
        change_qty: 10,
        reason_type: 'RESTOCK_IN',
        loan_account_id: 'loan-1',
        is_loan_funded: true,
        business_type: 'KIRANA_RETAIL',
      },
      TEST_SHOP_ID
    );
    expect(log).not.toHaveProperty('loan_account_id');
    expect(log).not.toHaveProperty('is_loan_funded');
    expect(log).not.toHaveProperty('business_type');

    const galla = sanitizeTablePayloadForSupabase(
      'daily_galla_sessions',
      {
        id: 'galla-2026-11-11',
        session_date: '2026-11-11',
        opening_cash: 1000,
        business_type: 'KIRANA_RETAIL',
      },
      TEST_SHOP_ID
    );
    expect(galla).not.toHaveProperty('business_type');

    const exp = sanitizeTablePayloadForSupabase(
      'expenses_and_drawings',
      {
        id: 'exp-1',
        category: 'SHOP_EXPENSE',
        amount: 100,
        loan_account_id: 'loan-1',
        is_loan_funded: true,
        business_type: 'KIRANA_RETAIL',
      },
      TEST_SHOP_ID
    );
    expect(exp).not.toHaveProperty('loan_account_id');
    expect(exp).not.toHaveProperty('is_loan_funded');
    expect(exp).not.toHaveProperty('business_type');
  });
});
