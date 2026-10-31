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
  WALK_IN_CUSTOMER_RECORD,
  WALK_IN_CUSTOMER_ID,
} from '../types';
import { INITIAL_PRODUCTS, DEFAULT_SHOP_PROFILE, INITIAL_CUSTOMERS } from './seed';

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

  constructor() {
    super('SmartKiranaDB');

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
      [this.products, this.customers, this.shop_profile, this.inventory_logs],
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
    const count = await this.products.count();
    if (count === 0) {
      await this.products.bulkAdd(INITIAL_PRODUCTS);

      // Add initial stock logs for audit trail
      const initialLogs: InventoryLog[] = INITIAL_PRODUCTS.map((prod) => ({
        id: `init-log-${prod.id}`,
        product_id: prod.id,
        change_qty: prod.current_stock,
        reason_type: 'PURCHASE_IN',
        unit_cost_at_time: prod.purchase_price,
        reference_id: null,
        notes: 'Initial inventory stock opening balance',
        created_at: new Date().toISOString(),
      }));
      await this.inventory_logs.bulkAdd(initialLogs);

      // Seed initial demo customers
      for (const cust of INITIAL_CUSTOMERS) {
        if (cust.id !== WALK_IN_CUSTOMER_ID) {
          const existing = await this.customers.get(cust.id);
          if (!existing) {
            await this.customers.add(cust);
          }
        }
      }
    }
  }

  /**
   * Completely wipes all products, customers, and transactions to start 100% clean
   */
  async clearAllRecordsToEmpty(): Promise<void> {
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

        // Re-insert mandatory WALK_IN_CUSTOMER
        await this.customers.add(WALK_IN_CUSTOMER_RECORD);
      }
    );
  }

  /**
   * Cleanly wipes transactional tables while keeping products and schema intact
   * As specified in REQ-03 Acceptance Gate
   */
  async clearTransactionalData(): Promise<void> {
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
      ],
      async () => {
        await this.sales_invoices.clear();
        await this.sale_items.clear();
        await this.khata_transactions.clear();
        await this.expenses_and_drawings.clear();
        await this.daily_galla_sessions.clear();
        await this.inventory_logs.clear();

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
      ],
      async () => {
        await this.products.clear();
        await this.inventory_logs.clear();
        await this.customers.clear();
        await this.sales_invoices.clear();
        await this.sale_items.clear();
        await this.khata_transactions.clear();
        await this.expenses_and_drawings.clear();
        await this.daily_galla_sessions.clear();
        await this.shop_profile.clear();

        await this.shop_profile.add(DEFAULT_SHOP_PROFILE);
        await this.customers.bulkAdd(INITIAL_CUSTOMERS);
        await this.products.bulkAdd(INITIAL_PRODUCTS);

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
  async getShopProfile(): Promise<ShopProfile> {
    const profile = await this.shop_profile.get(DEFAULT_SHOP_PROFILE.id);
    return profile || DEFAULT_SHOP_PROFILE;
  }

  /**
   * Update shop profile
   */
  async updateShopProfile(profile: Partial<ShopProfile>): Promise<void> {
    await this.shop_profile.update(DEFAULT_SHOP_PROFILE.id, {
      ...profile,
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
}

export const db = new KiranaDatabase();

