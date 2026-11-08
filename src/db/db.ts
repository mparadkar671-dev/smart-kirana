import Dexie, { type EntityTable } from 'dexie';
import {
  Product,
  InventoryLog,
  Customer,
  SalesInvoice,
  SaleItem,
  KhataTransaction,
  ExpenseAndDrawing,
  DailyGallaSession,
  ShopProfile,
  StoreUser,
  SyncOutboxItem,
  SyncOperation,
  CreditNote,
  SalesReturnReason,
  Wholesaler,
  LoanAccount,
  AdvanceOrder,
  BusinessType,
  BusinessWorkspaceRecord,
  WALK_IN_CUSTOMER_RECORD,
  WALK_IN_CUSTOMER_ID,
  ProductionBatch,
  PurchaseInvoice,
  WholesalerKhataTransaction,
  SecurityAuditLog,
} from '../types';
import { INITIAL_PRODUCTS, DEFAULT_SHOP_PROFILE, INITIAL_CUSTOMERS, INITIAL_WHOLESALERS } from './seed';
import {
  resolveProductBusinessType,
  getHomemadeShopIdForOwner,
  getActiveShopId,
  getActiveBusinessType,
  isHomemadeShopId,
} from '../utils/businessFirewall';

export function generateInviteCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `KRN-${num}`;
}

export async function requestStoragePersistence(): Promise<{ persisted: boolean; quota?: number; usage?: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      let quotaInfo: { quota?: number; usage?: number } = {};
      if (navigator.storage.estimate) {
        quotaInfo = await navigator.storage.estimate();
      }
      return { persisted: isPersisted, ...quotaInfo };
    } catch (e) {
      console.warn('Storage persistence request failed:', e);
      return { persisted: false };
    }
  }
  return { persisted: false };
}

export class KiranaDatabase extends Dexie {
  products!: EntityTable<Product, 'id'>;
  inventory_logs!: EntityTable<InventoryLog, 'id'>;
  customers!: EntityTable<Customer, 'id'>;
  sales_invoices!: EntityTable<SalesInvoice, 'id'>;
  sale_items!: EntityTable<SaleItem, 'id'>;
  khata_transactions!: EntityTable<KhataTransaction, 'id'>;
  expenses_and_drawings!: EntityTable<ExpenseAndDrawing, 'id'>;
  daily_galla_sessions!: EntityTable<DailyGallaSession, 'id'>;
  shop_profile!: EntityTable<ShopProfile, 'id'>;
  store_users!: EntityTable<StoreUser, 'id'>;
  sync_outbox!: EntityTable<SyncOutboxItem, 'id'>;
  credit_notes!: EntityTable<CreditNote, 'id'>;
  wholesalers!: EntityTable<Wholesaler, 'id'>;
  loan_accounts!: EntityTable<LoanAccount, 'id'>;
  advance_orders!: EntityTable<AdvanceOrder, 'id'>;
  business_workspaces!: EntityTable<BusinessWorkspaceRecord, 'business_type'>;
  production_batches!: EntityTable<ProductionBatch, 'id'>;
  purchase_invoices!: EntityTable<PurchaseInvoice, 'id'>;
  wholesaler_khata_transactions!: EntityTable<WholesalerKhataTransaction, 'id'>;
  security_audit_logs!: EntityTable<SecurityAuditLog, 'id'>;

  constructor(dbName = 'SmartKiranaDB') {
    super(dbName);

    this.version(1).stores({
      products: 'id, barcode, short_code, name, category, is_quick_tap, updated_at',
      inventory_logs: 'id, product_id, reason_type, reference_id, created_at',
      customers: 'id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, invoice_number, customer_id, payment_mode, status, created_at',
      sale_items: 'id, invoice_id, product_id',
      khata_transactions: 'id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, category, paid_via, created_at',
      daily_galla_sessions: 'id, &session_date, created_at',
      shop_profile: 'id',
    });

    this.version(2).stores({
      store_users: 'id, user_id, email, role, shop_id, created_at',
    });

    this.version(3).stores({
      products: 'id, shop_id, barcode, short_code, name, category, is_quick_tap, updated_at',
      inventory_logs: 'id, shop_id, product_id, reason_type, reference_id, created_at',
      customers: 'id, shop_id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, invoice_number, customer_id, payment_mode, status, created_at',
      sale_items: 'id, shop_id, invoice_id, product_id',
      khata_transactions: 'id, shop_id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code',
      store_users: 'id, user_id, email, role, shop_id, created_at',
    });

    this.version(4).stores({
      products: 'id, shop_id, barcode, short_code, name, category, is_quick_tap, updated_at',
      inventory_logs: 'id, shop_id, product_id, reason_type, reference_id, created_at',
      customers: 'id, shop_id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, invoice_number, customer_id, payment_mode, status, created_at',
      sale_items: 'id, shop_id, invoice_id, product_id',
      khata_transactions: 'id, shop_id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
    });

    this.version(5).stores({
      products: 'id, shop_id, barcode, short_code, name, category, is_quick_tap, updated_at',
      inventory_logs: 'id, shop_id, product_id, reason_type, reference_id, created_at',
      customers: 'id, shop_id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, invoice_id, product_id',
      khata_transactions: 'id, shop_id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
    });

    this.version(6).stores({
      products: 'id, shop_id, barcode, short_code, name, category, is_quick_tap, wholesaler_id, updated_at',
      inventory_logs: 'id, shop_id, product_id, reason_type, reference_id, created_at',
      customers: 'id, shop_id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, invoice_id, product_id',
      khata_transactions: 'id, shop_id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
      wholesalers: 'id, shop_id, name, phone, agency_or_brand, is_active, created_at',
    });

    this.version(7).stores({
      products: 'id, shop_id, barcode, short_code, name, marathi_name, search_keywords, category, is_quick_tap, wholesaler_id, updated_at',
      inventory_logs: 'id, shop_id, product_id, reason_type, reference_id, created_at',
      customers: 'id, shop_id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, invoice_id, product_id',
      khata_transactions: 'id, shop_id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
      wholesalers: 'id, shop_id, name, phone, agency_or_brand, is_active, created_at',
    });

    this.version(8).stores({
      products: 'id, shop_id, barcode, short_code, name, marathi_name, search_keywords, category, is_quick_tap, wholesaler_id, loan_account_id, updated_at',
      inventory_logs: 'id, shop_id, product_id, reason_type, reference_id, loan_account_id, created_at',
      customers: 'id, shop_id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, invoice_id, product_id, loan_account_id',
      khata_transactions: 'id, shop_id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
      wholesalers: 'id, shop_id, name, phone, agency_or_brand, is_active, created_at',
      loan_accounts: 'id, shop_id, name, lender_name, is_active, created_at',
    });

    this.version(9).stores({
      products: 'id, shop_id, barcode, short_code, name, marathi_name, search_keywords, category, is_quick_tap, wholesaler_id, loan_account_id, updated_at',
      inventory_logs: 'id, shop_id, product_id, reason_type, reference_id, loan_account_id, created_at',
      customers: 'id, shop_id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, invoice_id, product_id, loan_account_id',
      khata_transactions: 'id, shop_id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, entry_type, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code, business_type',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
      wholesalers: 'id, shop_id, name, phone, agency_or_brand, is_active, created_at',
      loan_accounts: 'id, shop_id, name, lender_name, is_active, created_at',
      advance_orders: 'id, shop_id, customer_id, delivery_date, status, created_at',
    });

    this.version(10).stores({
      products: 'id, shop_id, barcode, short_code, name, marathi_name, search_keywords, category, is_quick_tap, wholesaler_id, loan_account_id, updated_at',
      inventory_logs: 'id, shop_id, product_id, reason_type, reference_id, loan_account_id, created_at',
      customers: 'id, shop_id, phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, invoice_id, product_id, loan_account_id',
      khata_transactions: 'id, shop_id, customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, entry_type, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code, business_type',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
      wholesalers: 'id, shop_id, name, phone, agency_or_brand, is_active, created_at',
      loan_accounts: 'id, shop_id, name, lender_name, is_active, created_at',
      advance_orders: 'id, shop_id, customer_id, delivery_date, status, created_at',
      business_workspaces: 'business_type, updated_at',
    });

    this.version(11).stores({
      products: 'id, shop_id, business_type, [shop_id+business_type], barcode, short_code, name, marathi_name, search_keywords, category, is_quick_tap, wholesaler_id, loan_account_id, updated_at',
      inventory_logs: 'id, shop_id, business_type, [shop_id+business_type], product_id, reason_type, reference_id, loan_account_id, created_at',
      customers: 'id, shop_id, business_type, [shop_id+business_type], phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, business_type, [shop_id+business_type], invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, business_type, [shop_id+business_type], invoice_id, product_id, loan_account_id',
      khata_transactions: 'id, shop_id, business_type, [shop_id+business_type], customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, business_type, [shop_id+business_type], entry_type, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, business_type, [shop_id+business_type], &session_date, created_at',
      shop_profile: 'id, shop_id, invite_code, business_type',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
      wholesalers: 'id, shop_id, business_type, [shop_id+business_type], name, phone, agency_or_brand, is_active, created_at',
      loan_accounts: 'id, shop_id, name, lender_name, is_active, created_at',
      advance_orders: 'id, shop_id, business_type, [shop_id+business_type], customer_id, delivery_date, status, created_at',
      business_workspaces: 'business_type, updated_at',
    });

    this.version(12).stores({
      products: 'id, shop_id, business_type, [shop_id+business_type], barcode, short_code, name, marathi_name, search_keywords, category, is_quick_tap, wholesaler_id, loan_account_id, updated_at',
      inventory_logs: 'id, shop_id, business_type, [shop_id+business_type], product_id, reason_type, reference_id, loan_account_id, created_at',
      customers: 'id, shop_id, business_type, [shop_id+business_type], phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, business_type, [shop_id+business_type], invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, business_type, [shop_id+business_type], invoice_id, product_id, loan_account_id',
      khata_transactions: 'id, shop_id, business_type, [shop_id+business_type], customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, business_type, [shop_id+business_type], entry_type, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, business_type, [shop_id+business_type], [shop_id+session_date], session_date, created_at',
      shop_profile: 'id, shop_id, invite_code, business_type',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
      wholesalers: 'id, shop_id, business_type, [shop_id+business_type], name, phone, agency_or_brand, is_active, created_at',
      loan_accounts: 'id, shop_id, name, lender_name, is_active, created_at',
      advance_orders: 'id, shop_id, business_type, [shop_id+business_type], customer_id, delivery_date, status, created_at',
      business_workspaces: 'business_type, updated_at',
    });

    this.version(13).stores({
      products: 'id, shop_id, business_type, [shop_id+business_type], barcode, short_code, name, marathi_name, search_keywords, category, is_quick_tap, wholesaler_id, loan_account_id, updated_at',
      inventory_logs: 'id, shop_id, business_type, [shop_id+business_type], product_id, reason_type, reference_id, loan_account_id, created_at',
      customers: 'id, shop_id, business_type, [shop_id+business_type], phone, name, current_udhari_balance, created_at',
      sales_invoices: 'id, shop_id, business_type, [shop_id+business_type], invoice_number, customer_id, payment_mode, status, credit_note_number, created_at',
      sale_items: 'id, shop_id, business_type, [shop_id+business_type], invoice_id, product_id, loan_account_id',
      khata_transactions: 'id, shop_id, business_type, [shop_id+business_type], customer_id, entry_type, invoice_id, payment_channel, created_at',
      expenses_and_drawings: 'id, shop_id, business_type, [shop_id+business_type], entry_type, category, paid_via, created_at',
      daily_galla_sessions: 'id, shop_id, business_type, [shop_id+business_type], [shop_id+session_date], session_date, created_at',
      shop_profile: 'id, shop_id, invite_code, business_type',
      store_users: 'id, user_id, email, role, shop_id, created_at',
      sync_outbox: 'id, table_name, shop_id, status, created_at, retry_count',
      credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
      wholesalers: 'id, shop_id, business_type, [shop_id+business_type], name, phone, agency_or_brand, is_active, created_at',
      loan_accounts: 'id, shop_id, name, lender_name, is_active, created_at',
      advance_orders: 'id, shop_id, business_type, [shop_id+business_type], customer_id, delivery_date, status, created_at',
      business_workspaces: 'business_type, updated_at',
      production_batches: 'id, shop_id, business_type, [shop_id+business_type], product_id, batch_code, status, expires_at, produced_at',
      purchase_invoices: 'id, shop_id, business_type, [shop_id+business_type], invoice_number, wholesaler_id, invoice_date, created_at',
      wholesaler_khata_transactions: 'id, shop_id, business_type, [shop_id+business_type], wholesaler_id, entry_type, created_at',
      security_audit_logs: 'id, shop_id, business_type, [shop_id+business_type], event_type, timestamp',
    });

    // Multi-tenant Hook: Ensure all records are always tagged with shop_id and invite code
    const tenantTables = [
      this.products,
      this.inventory_logs,
      this.customers,
      this.sales_invoices,
      this.sale_items,
      this.khata_transactions,
      this.expenses_and_drawings,
      this.daily_galla_sessions,
      this.sync_outbox,
      this.credit_notes,
      this.wholesalers,
      this.loan_accounts,
      this.advance_orders,
      this.production_batches,
      this.purchase_invoices,
      this.wholesaler_khata_transactions,
      this.security_audit_logs,
    ];

    tenantTables.forEach((table) => {
      (table as any).hook('creating', (_primKey: unknown, obj: Record<string, unknown>) => {
        if (!obj.shop_id) {
          const activeShopId = typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null;
          obj.shop_id = activeShopId || 'current_shop';
        }
        if (table === this.products || obj.category) {
          obj.business_type = resolveProductBusinessType(obj as any);
        } else if (!obj.business_type) {
          const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_business_type') : null;
          obj.business_type = stored === 'HOMEMADE_FOOD' ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL';
        }
      });
    });

    (this.shop_profile as any).hook('creating', (_primKey: unknown, obj: Record<string, unknown>) => {
      if (!obj.shop_id) {
        const activeShopId = typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null;
        obj.shop_id = activeShopId || 'current_shop';
      }
      if (!obj.invite_code) {
        obj.invite_code = generateInviteCode();
      }
    });
  }

  /**
   * Initializes the database for a new user with mandatory system records:
   * Walk-in customer ('0000-WALK-IN') and default shop profile.
   * By default, leaves all product and customer records EMPTY for new users.
   * If options.seedDemo is explicitly true, seeds 25 sample products and demo customers.
   */
  async initializeDatabase(options: { seedDemo?: boolean } = {}): Promise<void> {
    await this.transaction(
      'rw',
      [this.products, this.customers, this.shop_profile, this.inventory_logs, this.wholesalers],
      async () => {
        // 1. Ensure WALK_IN_CUSTOMER exists
        const walkIn = await this.customers.get(WALK_IN_CUSTOMER_ID);
        if (!walkIn) {
          await this.customers.add(WALK_IN_CUSTOMER_RECORD);
        }

        // 2. Ensure Shop Profile exists
        const profile = await this.shop_profile.get(DEFAULT_SHOP_PROFILE.id);
        if (!profile) {
          await this.shop_profile.add(DEFAULT_SHOP_PROFILE);
        }

        // 3. Only seed products if explicitly requested
        if (options.seedDemo) {
          await this.seedDemoProducts();
        }
      }
    );
  }

  /**
   * Seeds 25 realistic Indian Kirana products and sample customers
   */
  async seedDemoProducts(): Promise<void> {
    const rawShopId =
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('kirana_active_shop_id') ||
          localStorage.getItem('kirana_base_shop_id') ||
          localStorage.getItem('smart_kirana_shop_id')
        : null) || 'current_shop';

    const items = INITIAL_PRODUCTS.map((prod) => ({
      ...prod,
      shop_id: rawShopId,
      business_type: 'KIRANA_RETAIL' as const,
      updated_at: new Date().toISOString(),
    }));

    await this.products.bulkPut(items);

    // Add initial stock logs for audit trail
    const initialLogs: InventoryLog[] = items.map((prod) => ({
      id: `init-log-${prod.id}`,
      shop_id: rawShopId,
      business_type: 'KIRANA_RETAIL' as const,
      product_id: prod.id,
      change_qty: prod.current_stock,
      reason_type: 'PURCHASE_IN',
      unit_cost_at_time: prod.purchase_price,
      reference_id: null,
      notes: 'Initial inventory stock opening balance',
      created_at: new Date().toISOString(),
    }));
    await this.inventory_logs.bulkPut(initialLogs);

    // Queue sync in outbox so sample products sync across all devices & Supabase
    for (const p of items) {
      await this.queueSync(
        {
          table_name: 'products',
          operation: 'INSERT',
          payload: p as unknown as Record<string, unknown>,
          shop_id: rawShopId,
        },
        this.sync_outbox
      ).catch(() => {});
    }

    // Seed initial demo customers if not already present
    for (const cust of INITIAL_CUSTOMERS) {
      if (cust.id !== WALK_IN_CUSTOMER_ID) {
        const existing = await this.customers.get(cust.id);
        if (!existing) {
          await this.customers.put({
            ...cust,
            shop_id: rawShopId,
          });
        }
      }
    }

    // Seed initial demo wholesalers if empty
    const wsCount = await this.wholesalers.count();
    if (wsCount === 0) {
      await this.wholesalers.bulkPut(
        INITIAL_WHOLESALERS.map((w) => ({
          ...w,
          shop_id: rawShopId,
        }))
      );
    }
  }

  /**
   * Completely wipes all products, customers, and transactions to start 100% clean.
   * If scopedBusinessType is provided, wipes ONLY records belonging to that business type,
   * leaving the other business's records 100% untouched!
   */
  async clearAllRecordsToEmpty(scopedBusinessType?: BusinessType, scopedShopId?: string): Promise<void> {
    const targetShopId =
      scopedShopId ||
      (scopedBusinessType
        ? scopedBusinessType === 'HOMEMADE_FOOD'
          ? getHomemadeShopIdForOwner(getActiveShopId())
          : getActiveShopId()
        : (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null));

    if (scopedBusinessType || targetShopId) {
      await this.transaction(
        'rw',
        [
          this.products,
          this.customers,
          this.sales_invoices,
          this.sale_items,
          this.khata_transactions,
          this.expenses_and_drawings,
          this.daily_galla_sessions,
          this.inventory_logs,
          this.wholesalers,
          this.advance_orders,
          this.production_batches,
          this.purchase_invoices,
          this.wholesaler_khata_transactions,
          this.security_audit_logs,
        ],
        async () => {
          const matchesScope = (item: any) => {
            if (targetShopId && item.shop_id && item.shop_id === targetShopId) return true;
            if (scopedBusinessType && (item.business_type || 'KIRANA_RETAIL') === scopedBusinessType) return true;
            return false;
          };

          await this.products.filter(matchesScope).delete();
          await this.inventory_logs.filter(matchesScope).delete();
          await this.sales_invoices.filter(matchesScope).delete();
          await this.sale_items.filter(matchesScope).delete();
          await this.khata_transactions.filter(matchesScope).delete();
          await this.expenses_and_drawings.filter(matchesScope).delete();
          await this.daily_galla_sessions.filter(matchesScope).delete();
          await this.advance_orders.filter(matchesScope).delete();
          await this.wholesalers.filter(matchesScope).delete();
          await this.production_batches.filter(matchesScope).delete();
          await this.purchase_invoices.filter(matchesScope).delete();
          await this.wholesaler_khata_transactions.filter(matchesScope).delete();
          await this.security_audit_logs.filter(matchesScope).delete();
          await this.customers.filter((c) => matchesScope(c) && c.id !== WALK_IN_CUSTOMER_ID).delete();
        }
      );
      return;
    }

    await this.transaction(
      'rw',
      [
        this.products,
        this.customers,
        this.sales_invoices,
        this.sale_items,
        this.khata_transactions,
        this.expenses_and_drawings,
        this.daily_galla_sessions,
        this.inventory_logs,
        this.wholesalers,
        this.loan_accounts,
        this.advance_orders,
        this.business_workspaces,
        this.production_batches,
        this.purchase_invoices,
        this.wholesaler_khata_transactions,
        this.security_audit_logs,
      ],
      async () => {
        await this.products.clear();
        await this.customers.clear();
        await this.sales_invoices.clear();
        await this.sale_items.clear();
        await this.khata_transactions.clear();
        await this.expenses_and_drawings.clear();
        await this.daily_galla_sessions.clear();
        await this.inventory_logs.clear();
        await this.wholesalers.clear();
        await this.loan_accounts.clear();
        await this.advance_orders.clear();
        await this.business_workspaces.clear();
        await this.production_batches.clear();
        await this.purchase_invoices.clear();
        await this.wholesaler_khata_transactions.clear();
        await this.security_audit_logs.clear();

        // Re-insert mandatory WALK_IN_CUSTOMER
        await this.customers.add(WALK_IN_CUSTOMER_RECORD);
      }
    );
  }

  /**
   * Cleanly wipes transactional tables while keeping products and schema intact
   * As specified in REQ-03 Acceptance Gate.
   * If scopedBusinessType is provided, wipes ONLY transactional data for that business!
   */
  async clearTransactionalData(scopedBusinessType?: BusinessType, scopedShopId?: string): Promise<void> {
    const targetShopId =
      scopedShopId ||
      (scopedBusinessType
        ? scopedBusinessType === 'HOMEMADE_FOOD'
          ? getHomemadeShopIdForOwner(getActiveShopId())
          : getActiveShopId()
        : (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null));

    if (scopedBusinessType || targetShopId) {
      await this.transaction(
        'rw',
        [
          this.sales_invoices,
          this.sale_items,
          this.khata_transactions,
          this.expenses_and_drawings,
          this.daily_galla_sessions,
          this.inventory_logs,
          this.advance_orders,
          this.production_batches,
          this.purchase_invoices,
          this.wholesaler_khata_transactions,
          this.security_audit_logs,
        ],
        async () => {
          const matchesScope = (item: any) => {
            if (targetShopId && item.shop_id && item.shop_id === targetShopId) return true;
            if (scopedBusinessType && (item.business_type || 'KIRANA_RETAIL') === scopedBusinessType) return true;
            return false;
          };

          await this.sales_invoices.filter(matchesScope).delete();
          await this.sale_items.filter(matchesScope).delete();
          await this.khata_transactions.filter(matchesScope).delete();
          await this.expenses_and_drawings.filter(matchesScope).delete();
          await this.daily_galla_sessions.filter(matchesScope).delete();
          await this.inventory_logs.filter(matchesScope).delete();
          await this.advance_orders.filter(matchesScope).delete();
          await this.production_batches.filter(matchesScope).delete();
          await this.purchase_invoices.filter(matchesScope).delete();
          await this.wholesaler_khata_transactions.filter(matchesScope).delete();
          await this.security_audit_logs.filter(matchesScope).delete();
        }
      );
      return;
    }

    await this.transaction(
      'rw',
      [
        this.sales_invoices,
        this.sale_items,
        this.khata_transactions,
        this.expenses_and_drawings,
        this.daily_galla_sessions,
        this.inventory_logs,
        this.customers,
        this.advance_orders,
        this.production_batches,
        this.purchase_invoices,
        this.wholesaler_khata_transactions,
        this.security_audit_logs,
      ],
      async () => {
        await this.sales_invoices.clear();
        await this.sale_items.clear();
        await this.khata_transactions.clear();
        await this.expenses_and_drawings.clear();
        await this.daily_galla_sessions.clear();
        await this.inventory_logs.clear();
        await this.advance_orders.clear();
        await this.production_batches.clear();
        await this.purchase_invoices.clear();
        await this.wholesaler_khata_transactions.clear();
        await this.security_audit_logs.clear();

        // Reset non-walkin customer balances to 0
        const allCustomers = await this.customers.toArray();
        for (const cust of allCustomers) {
          if (cust.id !== WALK_IN_CUSTOMER_ID) {
            await this.customers.update(cust.id, {
              current_udhari_balance: 0,
              oldest_unpaid_date: null,
              last_reminder_sent_at: null,
            });
          }
        }
      }
    );
  }

  /**
   * Resets entire database to default initial state (products, demo customers, profile)
   */
  async resetToDemoState(): Promise<void> {
    await this.transaction(
      'rw',
      [
        this.products,
        this.inventory_logs,
        this.customers,
        this.sales_invoices,
        this.sale_items,
        this.khata_transactions,
        this.expenses_and_drawings,
        this.daily_galla_sessions,
        this.shop_profile,
        this.wholesalers,
        this.advance_orders,
      ],
      async () => {
        const existingProfile = await this.shop_profile.get(DEFAULT_SHOP_PROFILE.id);
        await this.products.clear();
        await this.inventory_logs.clear();
        await this.customers.clear();
        await this.sales_invoices.clear();
        await this.sale_items.clear();
        await this.khata_transactions.clear();
        await this.expenses_and_drawings.clear();
        await this.daily_galla_sessions.clear();
        await this.shop_profile.clear();
        await this.wholesalers.clear();
        await this.advance_orders.clear();

        await this.shop_profile.put({
          ...DEFAULT_SHOP_PROFILE,
          business_type: 'KIRANA_RETAIL',
          reset_epoch: existingProfile?.reset_epoch || DEFAULT_SHOP_PROFILE.reset_epoch || 1,
        });
        await this.customers.bulkPut(INITIAL_CUSTOMERS.map((c) => ({ ...c, business_type: 'KIRANA_RETAIL' as const, shop_id: 'current_shop' })));
        const demoItems = INITIAL_PRODUCTS.map((prod) => ({
          ...prod,
          shop_id: 'current_shop',
          business_type: 'KIRANA_RETAIL' as const,
          updated_at: new Date().toISOString(),
        }));
        await this.products.bulkPut(demoItems);
        await this.wholesalers.bulkPut(INITIAL_WHOLESALERS.map((w) => ({ ...w, shop_id: 'current_shop' })));

        const initialLogs: InventoryLog[] = INITIAL_PRODUCTS.map((prod) => ({
          id: `demo-init-log-${prod.id}`,
          product_id: prod.id,
          change_qty: prod.current_stock,
          reason_type: 'PURCHASE_IN',
          unit_cost_at_time: prod.purchase_price,
          reference_id: null,
          notes: 'Demo opening inventory stock balance',
          created_at: new Date().toISOString(),
        }));
        await this.inventory_logs.bulkAdd(initialLogs);
      }
    );
  }

  /**
   * Fetch current shop profile (pure read-only for liveQuery)
   */
  async getShopProfile(targetShopId?: string): Promise<ShopProfile> {
    const activeShopId =
      targetShopId ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null) ||
      DEFAULT_SHOP_PROFILE.id;

    let profile = await this.shop_profile.get(activeShopId);
    if (!profile) {
      profile = await this.shop_profile.where('shop_id').equals(activeShopId).first();
    }
    if (!profile) {
      const activeBizType =
        typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_business_type') : null;
      if (activeBizType) {
        profile = await this.shop_profile.where('business_type').equals(activeBizType).first();
      }
    }
    if (!profile) {
      const first = await this.shop_profile.toCollection().first();
      profile = first || DEFAULT_SHOP_PROFILE;
    }
    return profile;
  }

  /**
   * Update shop profile
   */
  async updateShopProfile(profile: Partial<ShopProfile>): Promise<void> {
    const targetId =
      profile.id ||
      profile.shop_id ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null) ||
      DEFAULT_SHOP_PROFILE.id;

    let current = await this.shop_profile.get(targetId);
    if (!current) {
      current = await this.shop_profile.where('shop_id').equals(targetId).first();
    }
    if (!current) {
      current = {
        ...DEFAULT_SHOP_PROFILE,
        id: targetId,
        shop_id: targetId,
      };
    }
    await this.shop_profile.put({
      ...current,
      ...profile,
      id: targetId,
      shop_id: targetId,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Store user helper methods
   */
  async getStoreUsers(): Promise<StoreUser[]> {
    return await this.store_users.toArray();
  }

  async saveStoreUser(user: StoreUser): Promise<void> {
    await this.store_users.put(user);
  }

  async getStoreUserByEmail(email: string): Promise<StoreUser | undefined> {
    return await this.store_users.where('email').equalsIgnoreCase(email).first();
  }

  async getStoreUserByUserId(userId: string): Promise<StoreUser | undefined> {
    return await this.store_users.where('user_id').equals(userId).first();
  }

  /**
   * Lookup shop profile by unique 6-digit store invite code (e.g. 'KRN-4829')
   */
  async getShopByInviteCode(inviteCode: string): Promise<ShopProfile | undefined> {
    const normalized = inviteCode.trim().toUpperCase();
    return await this.shop_profile.where('invite_code').equalsIgnoreCase(normalized).first();
  }

  /**
   * Count total completed sales invoices (used to hide demo products button if real transactions exist)
   */
  async getRealSalesCount(): Promise<number> {
    return await this.sales_invoices.count();
  }

  /**
   * Outbox Queue Architecture: Enqueues a sync operation atomically into sync_outbox
   */
  async queueSync(
    item: {
      table_name: string;
      operation: SyncOperation;
      payload: Record<string, unknown>;
      shop_id?: string;
    },
    txOutbox?: EntityTable<SyncOutboxItem, 'id'>
  ): Promise<SyncOutboxItem> {
    const outboxItem: SyncOutboxItem = {
      id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      table_name: item.table_name,
      operation: item.operation,
      payload: item.payload,
      shop_id: item.shop_id || 'current_shop',
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'PENDING',
    };
    if (txOutbox) {
      await txOutbox.add(outboxItem);
    } else {
      await this.sync_outbox.add(outboxItem);
    }
    return outboxItem;
  }

  /**
   * Deterministic Ledger Calculation:
   * Computes stock strictly from append-only inventory_logs deltas
   * Invariant: current_stock = sum(inventory_logs.change_qty)
   */
  async recomputeProductStockFromLogs(productId: string): Promise<number> {
    const logs = await this.inventory_logs.where('product_id').equals(productId).toArray();
    const totalDelta = logs.reduce((acc, log) => acc + (Number(log.change_qty) || 0), 0);
    const rounded = Math.round(totalDelta * 1000) / 1000;
    return rounded;
  }

  /**
   * Deterministic Ledger Calculation:
   * Computes customer udhari balance strictly from append-only khata_transactions
   * Invariant: udhari_balance = sum(DEBIT) - sum(CREDIT)
   */
  async recomputeCustomerUdhariFromTransactions(customerId: string): Promise<number> {
    const txs = await this.khata_transactions.where('customer_id').equals(customerId).toArray();
    let balance = 0;
    for (const tx of txs) {
      if (tx.entry_type === 'DEBIT_UDHARI_GIVEN') {
        balance += Number(tx.amount) || 0;
      } else if (tx.entry_type === 'CREDIT_JAMA_RECEIVED') {
        balance -= Number(tx.amount) || 0;
      }
    }
    return Math.round(balance * 100) / 100;
  }

  /**
   * Reconciles all local products and customer records to their deterministic ledger sums
   */
  async reconcileAllStockAndBalances(): Promise<{ productsReconciled: number; customersReconciled: number }> {
    return await this.transaction('rw', [this.products, this.inventory_logs, this.customers, this.khata_transactions], async () => {
      let productsReconciled = 0;
      let customersReconciled = 0;

      const allProducts = await this.products.toArray();
      for (const prod of allProducts) {
        const trueStock = await this.recomputeProductStockFromLogs(prod.id);
        if (Math.abs(prod.current_stock - trueStock) > 0.0001) {
          await this.products.update(prod.id, {
            current_stock: trueStock,
            updated_at: new Date().toISOString(),
          });
          productsReconciled++;
        }
      }

      const allCustomers = await this.customers.toArray();
      for (const cust of allCustomers) {
        if (cust.id === WALK_IN_CUSTOMER_ID) continue;
        const trueBalance = await this.recomputeCustomerUdhariFromTransactions(cust.id);
        if (Math.abs(cust.current_udhari_balance - trueBalance) > 0.001) {
          await this.customers.update(cust.id, {
            current_udhari_balance: trueBalance,
          });
          customersReconciled++;
        }
      }

      return { productsReconciled, customersReconciled };
    });
  }

  /**
   * ACID Atomic Sale Execution:
   * Executes a complete sale with product deduction, inventory logs, invoice, sale items,
   * khata debit (if udhari), galla update, and atomic outbox enqueue inside ONE single transaction.
   */
  async executeAtomicSale(params: {
    invoice: SalesInvoice;
    items: SaleItem[];
    customer?: Customer;
  }): Promise<{ invoice: SalesInvoice; outboxCount: number }> {
    return await this.transaction(
      'rw',
      [
        this.products,
        this.inventory_logs,
        this.sales_invoices,
        this.sale_items,
        this.customers,
        this.khata_transactions,
        this.daily_galla_sessions,
        this.sync_outbox,
      ],
      async () => {
        let outboxCount = 0;
        const shopId = params.invoice.shop_id || 'current_shop';

        // 1. Deduct Product Stock & Append Inventory Logs
        for (const item of params.items) {
          const product = await this.products.get(item.product_id);
          if (product) {
            const nextStock = Math.round((product.current_stock - item.qty) * 1000) / 1000;
            await this.products.update(product.id, {
              current_stock: nextStock,
              updated_at: new Date().toISOString(),
            });

            // Append Inventory Log
            const log: InventoryLog = {
              id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              shop_id: shopId,
              product_id: product.id,
              change_qty: -item.qty,
              reason_type: 'SALE_OUT',
              unit_cost_at_time: item.unit_purchase_cost,
              reference_id: params.invoice.id,
              notes: `Sale: ${params.invoice.invoice_number}`,
              created_at: params.invoice.created_at,
            };
            await this.inventory_logs.add(log);

            // Queue outbox for log and product
            await this.queueSync(
              { table_name: 'inventory_logs', operation: 'INSERT', payload: log as unknown as Record<string, unknown>, shop_id: shopId },
              this.sync_outbox
            );
            await this.queueSync(
              { table_name: 'products', operation: 'UPDATE', payload: { id: product.id, current_stock: nextStock }, shop_id: shopId },
              this.sync_outbox
            );
            outboxCount += 2;
          }
        }

        // 2. Insert Invoice and Sale Items
        await this.sales_invoices.add(params.invoice);
        await this.queueSync(
          { table_name: 'sales_invoices', operation: 'INSERT', payload: params.invoice as unknown as Record<string, unknown>, shop_id: shopId },
          this.sync_outbox
        );
        outboxCount++;

        for (const it of params.items) {
          await this.sale_items.add(it);
          await this.queueSync(
            { table_name: 'sale_items', operation: 'INSERT', payload: it as unknown as Record<string, unknown>, shop_id: shopId },
            this.sync_outbox
          );
          outboxCount++;
        }

        // 3. Handle Udhari / Khata if credit is extended
        if (params.invoice.udhari_added > 0 && params.customer && params.customer.id !== WALK_IN_CUSTOMER_ID) {
          const nextBalance = Math.round((params.customer.current_udhari_balance + params.invoice.udhari_added) * 100) / 100;
          await this.customers.update(params.customer.id, {
            current_udhari_balance: nextBalance,
            oldest_unpaid_date: params.customer.oldest_unpaid_date || params.invoice.created_at,
          });

          const khataTx: KhataTransaction = {
            id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            shop_id: shopId,
            customer_id: params.customer.id,
            entry_type: 'DEBIT_UDHARI_GIVEN',
            amount: params.invoice.udhari_added,
            payment_channel: 'BILL_CREDIT',
            invoice_id: params.invoice.id,
            running_balance_after: nextBalance,
            notes: `Bill credit for ${params.invoice.invoice_number}`,
            created_at: params.invoice.created_at,
          };
          await this.khata_transactions.add(khataTx);

          await this.queueSync(
            { table_name: 'khata_transactions', operation: 'INSERT', payload: khataTx as unknown as Record<string, unknown>, shop_id: shopId },
            this.sync_outbox
          );
          await this.queueSync(
            { table_name: 'customers', operation: 'UPDATE', payload: { id: params.customer.id, current_udhari_balance: nextBalance }, shop_id: shopId },
            this.sync_outbox
          );
          outboxCount += 2;
        }

        // 4. Update Daily Galla Session for Cash Payments
        if (params.invoice.payment_mode === 'CASH' || (params.invoice.payment_mode === 'SPLIT_PARTIAL' && params.invoice.amount_paid_now > 0)) {
          const today = params.invoice.created_at.slice(0, 10);
          const galla = await this.daily_galla_sessions.where('session_date').equals(today).first();
          const cashAmount = params.invoice.payment_mode === 'CASH' ? params.invoice.grand_total : params.invoice.amount_paid_now;

          if (galla) {
            const nextCashSales = Math.round((galla.cash_sales_total + cashAmount) * 100) / 100;
            const nextExpected = Math.round((galla.expected_closing_cash + cashAmount) * 100) / 100;
            await this.daily_galla_sessions.update(galla.id, {
              cash_sales_total: nextCashSales,
              expected_closing_cash: nextExpected,
            });
            await this.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: galla.id, cash_sales_total: nextCashSales, expected_closing_cash: nextExpected }, shop_id: shopId },
              this.sync_outbox
            );
            outboxCount++;
          }
        }

        return { invoice: params.invoice, outboxCount };
      }
    );
  }
}

export const SmartKiranaDB = KiranaDatabase;
export type SmartKiranaDB = KiranaDatabase;

// Physical Standalone Production Database for Pure Kirana Retail POS
export const kiranaDb = new KiranaDatabase('SmartKirana_Retail_Production_DB');
export const homemadeDb = new KiranaDatabase('SmartKirana_Isolated_Scratch_DB');

/**
 * Returns the physically isolated database according to the active business type
 */
export function getActiveDb(activeBusinessType?: BusinessType): KiranaDatabase {
  const biz = activeBusinessType || getActiveBusinessType();
  return biz === 'HOMEMADE_FOOD' ? homemadeDb : kiranaDb;
}

/**
 * Clean delegation to the active isolated database with safe product fallback
 */
export const db = new Proxy(kiranaDb, {
  get(_target, prop, receiver) {
    const active = getActiveDb();
    if (prop === 'products') {
      const activeProducts = active.products;
      return new Proxy(activeProducts, {
        get(pTarget, pProp, pReceiver) {
          if (pProp === 'get') {
            return async (key: string | number) => {
              const res = await activeProducts.get(key as any);
              if (res) return res;
              const otherDb = active === kiranaDb ? homemadeDb : kiranaDb;
              return await otherDb.products.get(key as any);
            };
          }
          const val = Reflect.get(pTarget, pProp, pReceiver);
          return typeof val === 'function' ? val.bind(pTarget) : val;
        },
      });
    }
    const val = Reflect.get(active, prop, receiver);
    if (typeof val === 'function') {
      return val.bind(active);
    }
    return val;
  },
  set(_target, prop, value, receiver) {
    const active = getActiveDb();
    return Reflect.set(active, prop, value, receiver);
  },
}) as KiranaDatabase;

/**
 * One-time clean slate purge to eliminate legacy mixed tables and start pristine
 */
export async function performCleanSlateV3IfNeeded(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem('clean_slate_kirana_pure_done') === 'true') return;

  try {
    if (await Dexie.exists('SmartKiranaDB')) {
      const legacy = new Dexie('SmartKiranaDB');
      await legacy.delete().catch(() => {});
    }

    await kiranaDb.clearAllRecordsToEmpty().catch(() => {});
    await kiranaDb.initializeDatabase({ seedDemo: true }).catch(() => {});

    localStorage.setItem('clean_slate_kirana_pure_done', 'true');
    console.log('Clean Slate: Standalone Pure Kirana Retail Database initialized.');
  } catch (err) {
    console.warn('Clean slate initialization error:', err);
    localStorage.setItem('clean_slate_kirana_pure_done', 'true');
  }
}

