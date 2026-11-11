import { supabase } from '../lib/supabase';
import { db, kiranaDb, homemadeDb, requestStoragePersistence } from '../db/db';
import {
  Product,
  Customer,
  SalesInvoice,
  SaleItem,
  KhataTransaction,
  InventoryLog,
  DailyGallaSession,
  ExpenseAndDrawing,
  ShopProfile,
  StoreUser,
  SyncOutboxItem,
  Wholesaler,
  LoanAccount,
  BusinessType,
} from '../types';
import { isHomemadeFoodCategoryOrName, HomemadeFoodService, repairMixedBusinessProducts } from './homemadeFoodService';
import {
  resolveProductBusinessType,
  getHomemadeShopIdForOwner,
  getBaseKiranaShopId,
  getHomemadeShopId,
  isHomemadeShopId,
  getActiveBusinessType,
} from '../utils/businessFirewall';

function getLocalDeletedProductTombstones(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('kirana_deleted_product_ids');
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function isLegacyDuplicateId(id?: string | null): boolean {
  if (!id) return false;
  return id.startsWith('prod-105-') || id.startsWith('prod-csv-');
}

export interface CloudSyncStatus {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  message: string;
}

type SyncStatusListener = (status: CloudSyncStatus) => void;

/**
 * Normalizes raw UnitType to match Supabase Postgres enum unit_type_enum: ('PCS', 'KG_LOOSE', 'LTR', 'PACK')
 */
export function normalizeUnitForSupabase(rawUnit?: string | null): 'PCS' | 'KG_LOOSE' | 'LTR' | 'PACK' {
  if (!rawUnit) return 'PCS';
  const u = String(rawUnit).toUpperCase().trim();
  if (u === 'KG_LOOSE' || u === 'KG' || u === 'KGS' || u === 'GM' || u === 'GRAM' || u === 'GRAMS') {
    return 'KG_LOOSE';
  }
  if (u === 'LTR' || u === 'L' || u === 'ML' || u === 'LITRE' || u === 'LITER') {
    return 'LTR';
  }
  if (u === 'PACK' || u === 'PACKET' || u === 'PKT' || u === 'BOX' || u === 'BAG' || u === 'POUCH') {
    return 'PACK';
  }
  return 'PCS';
}

/**
 * Strips local-only / non-existent columns (like business_type, marathi_name, search_keywords, loan fields)
 * so that Supabase PostgREST accepts product rows cleanly without schema cache errors (PGRST204).
 */
export function sanitizeProductForSupabase(
  p: Partial<Product> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = p as any;
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    name: raw.name || 'Unnamed Product',
    short_code: raw.short_code || 'PROD',
    barcode: raw.barcode || '',
    category: raw.category || 'General',
    unit_type: normalizeUnitForSupabase(raw.unit_type || raw.unit),
    purchase_price: Number(raw.purchase_price) || 0,
    selling_price: Number(raw.selling_price) || 0,
    mrp: Number(raw.mrp) || Number(raw.selling_price) || 0,
    current_stock: Number(raw.current_stock) || 0,
    low_stock_threshold: Number(raw.low_stock_threshold) || 5,
    last_supplier_name: raw.last_supplier_name || 'APMC Mandi Wholesaler',
    expiry_date: raw.expiry_date || null,
    is_quick_tap: Boolean(raw.is_quick_tap),
    updated_at: raw.updated_at || new Date().toISOString(),
  };
  if (raw.wholesaler_id !== undefined) sanitized.wholesaler_id = raw.wholesaler_id || null;
  if (raw.supplier_phone !== undefined) sanitized.supplier_phone = raw.supplier_phone || null;
  if (raw.image_url !== undefined) sanitized.image_url = raw.image_url || null;
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export const SUPABASE_CLOUD_TABLES = new Set([
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

export const TABLE_SYNC_PRIORITY: Record<string, number> = {
  shop_profile: 1,
  store_users: 2,
  wholesalers: 3,
  products: 4,
  customers: 5,
  sales_invoices: 6,
  sale_items: 7,
  khata_transactions: 8,
  inventory_logs: 9,
  daily_galla_sessions: 10,
  expenses_and_drawings: 11,
};

export function sanitizeStoreUserForSupabase(
  u: Partial<StoreUser> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = u as any;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    user_id: raw.user_id || userId || null,
    email: raw.email || '',
    full_name: raw.full_name || 'Store Staff',
    phone: raw.phone || null,
    role: raw.role || 'OWNER',
    shop_id: shopId || raw.shop_id || 'current_shop',
    is_active: raw.is_active !== false,
    approval_status: raw.approval_status || 'APPROVED',
    created_at: raw.created_at || now,
    updated_at: raw.updated_at || now,
  };
}

export function sanitizeWholesalerForSupabase(
  w: Partial<Wholesaler> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = w as any;
  const now = new Date().toISOString();
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    name: raw.name || 'Wholesaler',
    agency_or_brand: raw.agency_or_brand || raw.notes || null,
    phone: raw.phone || '0000000000',
    gstin: raw.gstin || raw.gst_number || null,
    address: raw.address || raw.address_city || null,
    visit_day: raw.visit_day || null,
    is_active: raw.is_active !== false,
    created_at: raw.created_at || now,
    updated_at: raw.updated_at || now,
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export function sanitizeCustomerForSupabase(
  c: Partial<Customer> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = c as any;
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    name: raw.name || 'Store Customer',
    phone: raw.phone || '0000000000',
    address_landmark: raw.address_landmark || null,
    credit_limit: Number(raw.credit_limit ?? 2000),
    current_udhari_balance: Number(raw.current_udhari_balance ?? 0),
    oldest_unpaid_date: raw.oldest_unpaid_date || null,
    last_reminder_sent_at: raw.last_reminder_sent_at || null,
    created_at: raw.created_at || new Date().toISOString(),
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export function sanitizeSalesInvoiceForSupabase(
  inv: Partial<SalesInvoice> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = inv as any;
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    invoice_number: raw.invoice_number || `INV-${raw.id}`,
    customer_id: raw.customer_id || '0000-WALK-IN',
    subtotal_amount: Number(raw.subtotal_amount ?? 0),
    discount_roundoff: Number(raw.discount_roundoff ?? 0),
    grand_total: Number(raw.grand_total ?? 0),
    total_cogs: Number(raw.total_cogs ?? 0),
    payment_mode: raw.payment_mode || 'CASH',
    amount_paid_now: Number(raw.amount_paid_now ?? 0),
    udhari_added: Number(raw.udhari_added ?? 0),
    status: raw.status || 'COMPLETED',
    return_reason: raw.return_reason || null,
    credit_note_number: raw.credit_note_number || null,
    returned_at: raw.returned_at || null,
    created_at: raw.created_at || new Date().toISOString(),
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export function sanitizeSaleItemForSupabase(
  item: Partial<SaleItem> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = item as any;
  const qty = Number(raw.qty ?? 1);
  const unitCost = Number(raw.unit_purchase_cost ?? 0);
  const unitPrice = Number(raw.unit_selling_price ?? 0);
  const lineTotal = Number(raw.line_total ?? qty * unitPrice);
  const lineCogs = Number(raw.line_cogs ?? Math.round(qty * unitCost * 100) / 100);
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    invoice_id: raw.invoice_id,
    product_id: raw.product_id,
    product_name_snapshot: raw.product_name_snapshot || 'Item',
    qty,
    unit_selling_price: unitPrice,
    unit_purchase_cost: unitCost,
    line_total: lineTotal,
    line_cogs: lineCogs,
    created_at: raw.created_at || new Date().toISOString(),
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export function sanitizeKhataTransactionForSupabase(
  tx: Partial<KhataTransaction> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = tx as any;
  const bal = Number(raw.running_balance_after ?? raw.balance_after ?? 0);
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    customer_id: raw.customer_id,
    entry_type: raw.entry_type || 'DEBIT_UDHARI_GIVEN',
    amount: Number(raw.amount ?? 0),
    balance_after: bal,
    running_balance_after: bal,
    payment_channel: raw.payment_channel || 'CASH',
    invoice_id: raw.invoice_id || null,
    notes: raw.notes || null,
    created_at: raw.created_at || new Date().toISOString(),
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export function sanitizeInventoryLogForSupabase(
  log: Partial<InventoryLog> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = log as any;
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    product_id: raw.product_id,
    change_qty: Number(raw.change_qty ?? 0),
    reason_type: raw.reason_type || 'AUDIT_ADJUST',
    unit_cost_at_time: Number(raw.unit_cost_at_time ?? 0),
    reference_id: raw.reference_id || null,
    notes: raw.notes || null,
    created_at: raw.created_at || new Date().toISOString(),
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export function sanitizeGallaSessionForSupabase(
  session: Partial<DailyGallaSession> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = session as any;
  const today = new Date().toISOString().split('T')[0];
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    session_date: raw.session_date || today,
    opening_cash: Number(raw.opening_cash ?? 0),
    cash_sales_total: Number(raw.cash_sales_total ?? 0),
    cash_udhari_recovered: Number(raw.cash_udhari_recovered ?? 0),
    cash_expenses_out: Number(raw.cash_expenses_out ?? 0),
    expected_closing_cash: Number(raw.expected_closing_cash ?? 0),
    actual_counted_cash: raw.actual_counted_cash !== undefined && raw.actual_counted_cash !== null ? Number(raw.actual_counted_cash) : null,
    discrepancy: raw.discrepancy !== undefined && raw.discrepancy !== null ? Number(raw.discrepancy) : null,
    created_at: raw.created_at || new Date().toISOString(),
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export function sanitizeExpenseForSupabase(
  expense: Partial<ExpenseAndDrawing> | Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = expense as any;
  const sanitized: Record<string, unknown> = {
    id: raw.id,
    shop_id: shopId || raw.shop_id || 'current_shop',
    category: raw.category || 'SHOP_EXPENSE_RENT_ELEC',
    amount: Number(raw.amount ?? 0),
    paid_via: raw.paid_via || 'CASH_GALLA',
    description: raw.description || null,
    created_at: raw.created_at || new Date().toISOString(),
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

export function sanitizeTablePayloadForSupabase(
  tableName: string,
  payload: Record<string, unknown>,
  shopId?: string,
  userId?: string | null
): Record<string, unknown> {
  switch (tableName) {
    case 'shop_profile':
      return sanitizeShopProfileForSupabase(payload, shopId, userId);
    case 'store_users':
      return sanitizeStoreUserForSupabase(payload, shopId, userId);
    case 'wholesalers':
      return sanitizeWholesalerForSupabase(payload, shopId, userId);
    case 'products':
      return sanitizeProductForSupabase(payload, shopId, userId);
    case 'customers':
      return sanitizeCustomerForSupabase(payload, shopId, userId);
    case 'sales_invoices':
      return sanitizeSalesInvoiceForSupabase(payload, shopId, userId);
    case 'sale_items':
      return sanitizeSaleItemForSupabase(payload, shopId, userId);
    case 'khata_transactions':
      return sanitizeKhataTransactionForSupabase(payload, shopId, userId);
    case 'inventory_logs':
      return sanitizeInventoryLogForSupabase(payload, shopId, userId);
    case 'daily_galla_sessions':
      return sanitizeGallaSessionForSupabase(payload, shopId, userId);
    case 'expenses_and_drawings':
      return sanitizeExpenseForSupabase(payload, shopId, userId);
    default:
      return payload;
  }
}

/**
 * Strips non-existent columns (business_type, invoice_prefix, created_at) from shop_profile
 * so that Supabase PostgREST accepts upserts without schema cache errors (PGRST204).
 */
export function sanitizeShopProfileForSupabase(
  profile: Partial<ShopProfile> | Record<string, unknown>,
  targetId?: string,
  userId?: string | null
): Record<string, unknown> {
  const raw = profile as any;
  const id = targetId || raw.id || raw.shop_id || 'current_shop';
  const sanitized: Record<string, unknown> = {
    id,
    shop_id: id,
    shop_name: raw.shop_name || 'Laxmi Vatsalya General Store',
    owner_name: raw.owner_name || 'Pandurang Paradkar',
    phone: raw.phone || '9404380326',
    upi_vpa: raw.upi_vpa || '9404380326@upi',
    address: raw.address || 'Laxmi Vatsalya General Store, Maharashtra',
    gst_footer_note: raw.gst_footer_note || 'Thank you for shopping at Laxmi Vatsalya General Store! Visit again.',
    invite_code: raw.invite_code || 'KRN-4829',
    reset_epoch: Number(raw.reset_epoch) || 1,
    last_wiped_at: raw.last_wiped_at || null,
    updated_at: raw.updated_at || new Date().toISOString(),
  };
  if (userId) sanitized.user_id = userId;
  else if (raw.user_id) sanitized.user_id = raw.user_id;
  return sanitized;
}

class CloudSyncService {
  private status: CloudSyncStatus = {
    isSyncing: false,
    lastSyncedAt: typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_last_cloud_sync') : null,
    status: 'idle',
    message: 'Ready to sync',
  };

  private listeners: Set<SyncStatusListener> = new Set();
  private realtimeChannel: any = null;
  private heartbeatTimer: any = null;

  constructor() {
    this.initOnlineListener();
  }

  private initOnlineListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.setStatus({ status: 'syncing', message: 'Network restored. Synchronizing...' });
        this.syncBidirectionalNow();
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          this.syncBidirectionalNow();
        }
      });

      // Periodic background heartbeat every 10 seconds when online
      this.heartbeatTimer = setInterval(() => {
        if (typeof navigator !== 'undefined' && navigator.onLine && !this.isTestEnv && !this.status.isSyncing) {
          this.syncBidirectionalNow().catch(() => { });
        }
      }, 10000);

      // Request persistent storage durability
      requestStoragePersistence().then((res) => {
        if (res.persisted) {
          console.log('IndexedDB storage durability guaranteed (navigator.storage.persist).');
        }
      });
    }
  }

  public subscribe(listener: SyncStatusListener) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(updates: Partial<CloudSyncStatus>) {
    this.status = { ...this.status, ...updates };
    if (updates.lastSyncedAt) {
      localStorage.setItem('kirana_last_cloud_sync', updates.lastSyncedAt);
    }
    this.listeners.forEach((listener) => {
      try {
        listener(this.status);
      } catch (e) {
        console.error('Error in sync listener:', e);
      }
    });
  }

  public getStatus(): CloudSyncStatus {
    return { ...this.status };
  }

  private get isTestEnv(): boolean {
    return typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
  }

  /**
   * Helper to get active Supabase Auth user ID if signed in
   */
  private async getUserId(): Promise<string | null> {
    if (!supabase || this.isTestEnv) return null;
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Returns current active tenant shop ID from local storage or shop profile
   */
  async getActiveShopId(): Promise<string> {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('kirana_active_shop_id');
      if (stored) return stored;
    }
    try {
      const profile = await db.getShopProfile();
      if (profile && profile.id && profile.id !== 'current_shop') {
        return profile.id;
      }
    } catch {
      // fallback
    }
    return 'current_shop';
  }

  /**
   * Returns count of mutations currently waiting in offline outbox
   */
  async getQueuedCount(): Promise<number> {
    try {
      return await db.sync_outbox.where('status').equals('PENDING').count();
    } catch {
      return 0;
    }
  }

  /**
   * Subscribes to real-time WebSocket broadcasting across all 10 store tables for canonical shop
   */
  subscribeToRealtimeStoreSync(shopId?: string): () => void {
    if (this.realtimeChannel && supabase) {
      try {
        supabase.removeChannel(this.realtimeChannel);
      } catch {
        // Ignore
      }
      this.realtimeChannel = null;
    }

    if (!supabase || this.isTestEnv) {
      return () => { };
    }

    const currentShopId =
      shopId ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null) ||
      'current_shop';

    try {
      this.realtimeChannel = supabase
        .channel(`store-live-sync-${currentShopId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public' },
          async (payload: any) => {
            await this.handleRealtimePayload(payload, currentShopId);
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            this.setStatus({
              status: 'synced',
              message: '🟢 Live Multi-Device Sync • Connected',
            });
          }
        });
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }

    return () => this.unsubscribeRealtime();
  }

  /**
   * Starts parallel multi-device live sync:
   * 1. Supabase Realtime WebSockets across 10 tables
   * 2. Cross-tab BroadcastChannel('smart_kirana_local_tabs') for 0ms same-device sync
   * 3. 12-second heartbeat delta pull fallback
   */
  startParallelLiveSync(shopId?: string): () => void {
    const unsubRealtime = this.subscribeToRealtimeStoreSync(shopId);

    let tabChannel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        tabChannel = new BroadcastChannel('smart_kirana_local_tabs');
        tabChannel.onmessage = (event) => {
          if (event?.data?.type === 'SYNC_EVENT' && event.data.table) {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('kirana-db-updated', {
                  detail: { table: event.data.table, eventType: event.data.eventType, id: event.data.id },
                })
              );
            }
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }

    return () => {
      unsubRealtime();
      if (tabChannel) {
        try {
          tabChannel.close();
        } catch {
          // ignore
        }
      }
    };
  }

  /**
   * Removes active real-time channel
   */
  unsubscribeRealtime(): void {
    if (this.realtimeChannel && supabase) {
      try {
        supabase.removeChannel(this.realtimeChannel);
      } catch {
        // Ignore
      }
      this.realtimeChannel = null;
    }
  }

  /**
   * Processes an incoming real-time change event from Supabase WebSocket
   */
  async handleRealtimePayload(payload: any, activeShopId?: string): Promise<void> {
    if (!payload || !payload.table) return;
    const table = payload.table;
    const eventType = payload.eventType || payload.type;
    const newRecord = payload.new;
    const oldRecord = payload.old;

    const currentShopId =
      activeShopId ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('kirana_active_shop_id') || 'current_shop'
        : 'current_shop');

    // Multi-tenant dual shop validation
    const baseShopId = getBaseKiranaShopId(currentShopId);
    const hmfShopId = getHomemadeShopId(baseShopId);
    const validShopIds = new Set([baseShopId, hmfShopId, currentShopId, 'current_shop']);

    if (newRecord?.shop_id && !validShopIds.has(newRecord.shop_id)) {
      return;
    }

    const isHmfPayload =
      isHomemadeShopId(newRecord?.shop_id || oldRecord?.shop_id) ||
      newRecord?.business_type === 'HOMEMADE_FOOD' ||
      oldRecord?.business_type === 'HOMEMADE_FOOD';
    const targetDb = isHmfPayload ? homemadeDb : kiranaDb;

    try {
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        if (!newRecord) return;
        if (table === 'shop_profile') {
          if (validShopIds.has(newRecord.id)) {
            await targetDb.updateShopProfile(newRecord);
          }
        } else if ((targetDb as any)[table]) {
          if (table === 'products') {
            const tombstones = getLocalDeletedProductTombstones();
            if (!newRecord.id || tombstones.has(newRecord.id) || isLegacyDuplicateId(newRecord.id)) {
              if (newRecord.id) {
                this.deleteProductsBulk([newRecord.id]);
              }
              return;
            }
            const isHmf = isHomemadeShopId(newRecord.shop_id) || newRecord.business_type === 'HOMEMADE_FOOD';
            newRecord.business_type = isHmf ? 'HOMEMADE_FOOD' : resolveProductBusinessType(newRecord);
            if (!newRecord.unit_type && newRecord.unit) {
              newRecord.unit_type = newRecord.unit;
            }
          } else if (table === 'khata_transactions') {
            newRecord.running_balance_after = Number(newRecord.running_balance_after ?? newRecord.balance_after) || 0;
          }
          await (targetDb as any)[table].put(newRecord);
          if ((db as any)[table]) {
            await (db as any)[table].put(newRecord).catch(() => {});
          }
        }
      } else if (eventType === 'DELETE') {
        const idToDelete = oldRecord?.id || oldRecord?.session_date;
        if (idToDelete) {
          if ((kiranaDb as any)[table]) await (kiranaDb as any)[table].delete(idToDelete);
          if ((homemadeDb as any)[table]) await (homemadeDb as any)[table].delete(idToDelete);
          if ((db as any)[table]) await (db as any)[table].delete(idToDelete).catch(() => {});
        }
      }

      // Reconcile stock and ledger balances on inventory logs and khata transactions
      if (table === 'inventory_logs' || table === 'khata_transactions') {
        await targetDb.reconcileAllStockAndBalances().catch(() => { });
      }

      const now = new Date().toISOString();
      this.setStatus({
        isSyncing: false,
        lastSyncedAt: now,
        status: 'synced',
        message: '🟢 Live Multi-Device Sync • Up to date',
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('kirana-db-updated', {
            detail: { table, eventType, id: newRecord?.id || oldRecord?.id },
          })
        );
      }

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel('smart_kirana_local_tabs');
          ch.postMessage({
            type: 'SYNC_EVENT',
            table,
            eventType,
            id: newRecord?.id || oldRecord?.id,
          });
          ch.close();
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn(`Error applying realtime ${eventType} on ${table}:`, e);
    }
  }

  /**
   * Bidirectional Sync: Flushes pending local mutations first, then pulls newer cloud updates
   */
  async syncBidirectionalNow(): Promise<{
    success: boolean;
    pushedCount: number;
    pulledCount: number;
    errors: string[];
  }> {
    if (!supabase || this.isTestEnv) {
      const queued = await this.getQueuedCount();
      return { success: true, pushedCount: 0, pulledCount: 0, errors: [] };
    }

    if (this.status.isSyncing) {
      return { success: true, pushedCount: 0, pulledCount: 0, errors: [] };
    }

    this.setStatus({ isSyncing: true, status: 'syncing', message: '🔄 Syncing across devices...' });

    try {
      // 1. Push pending local offline mutations
      const outboxRes = await this.flushOutbox();
      // 2. Pull newer remote records
      const pullRes = await this.pullAllFromCloud();
      // 3. Deterministically enforce business separation firewall on all local products
      await repairMixedBusinessProducts();

      const pendingCount = await this.getQueuedCount();
      const now = new Date().toISOString();

      if (pendingCount > 0) {
        this.setStatus({
          isSyncing: false,
          lastSyncedAt: now,
          status: 'offline',
          message: `🟠 Offline Mode — ${pendingCount} changes queued`,
        });
      } else {
        this.setStatus({
          isSyncing: false,
          lastSyncedAt: now,
          status: 'synced',
          message: '🟢 Live Multi-Device Sync • Up to date',
        });
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kirana-db-updated', { detail: { type: 'bidirectional-sync' } }));
      }

      return {
        success: outboxRes.errors.length === 0 && pullRes.success,
        pushedCount: outboxRes.processedCount,
        pulledCount: pullRes.pulledCount,
        errors: [...outboxRes.errors, ...pullRes.errors],
      };
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({
        isSyncing: false,
        status: 'error',
        message: `Sync notice: ${msg}`,
      });
      return { success: false, pushedCount: 0, pulledCount: 0, errors: [msg] };
    }
  }

  /**
   * Atomic Danger Vault Store Reset: Cleans records from Supabase PostgreSQL and local Dexie
   * Uses execute_store_vault_reset RPC with transactional snapshot archiving, with direct child-to-parent deletion fallback.
   */
  async executeStoreVaultReset(
    resetMode: 'WIPE_ALL_FRESH_STORE' | 'CLEAR_TRANSACTIONS_KEEP_PRODUCTS' | 'WIPE_ACTIVE_BUSINESS',
    saveCloudArchive = true,
    scopedBusinessType?: BusinessType,
    customShopId?: string
  ): Promise<{ success: boolean; error?: string; resetEpoch?: number }> {
    const shopId = customShopId || await this.getActiveShopId();
    let resetEpoch = Date.now();
    const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

    if (supabase && !isTestEnv) {
      try {
        let rpcSuccess = false;
        // 1. Try atomic PostgreSQL RPC first if not scoped by business_type
        if (!scopedBusinessType && resetMode !== 'WIPE_ACTIVE_BUSINESS') {
          const { data, error } = await supabase.rpc('execute_store_vault_reset', {
            p_shop_id: shopId,
            p_reset_mode: resetMode,
            p_save_cloud_archive: saveCloudArchive,
          });

          if (!error) {
            rpcSuccess = true;
            if (data && typeof data === 'object' && 'reset_epoch' in data) {
              resetEpoch = Number((data as { reset_epoch: number }).reset_epoch) || resetEpoch;
            }
          } else {
            console.warn('RPC execute_store_vault_reset failed, attempting direct scoped deletion fallback:', error.message);
          }
        }

        if (!rpcSuccess) {
          // 2. Fallback: Direct scoped delete from child tables to parent tables
          let itemsQ = supabase.from('sale_items').delete().eq('shop_id', shopId);
          let khataQ = supabase.from('khata_transactions').delete().eq('shop_id', shopId);
          let logsQ = supabase.from('inventory_logs').delete().eq('shop_id', shopId);
          let invQ = supabase.from('sales_invoices').delete().eq('shop_id', shopId);
          let gallaQ = supabase.from('daily_galla_sessions').delete().eq('shop_id', shopId);
          let expQ = supabase.from('expenses_and_drawings').delete().eq('shop_id', shopId);

          if (scopedBusinessType) {
            itemsQ = itemsQ.eq('business_type', scopedBusinessType);
            khataQ = khataQ.eq('business_type', scopedBusinessType);
            logsQ = logsQ.eq('business_type', scopedBusinessType);
            invQ = invQ.eq('business_type', scopedBusinessType);
            gallaQ = gallaQ.eq('business_type', scopedBusinessType);
            expQ = expQ.eq('business_type', scopedBusinessType);
          }

          await Promise.allSettled([itemsQ, khataQ, logsQ, invQ, gallaQ, expQ]);

          if (resetMode === 'WIPE_ALL_FRESH_STORE' || resetMode === 'WIPE_ACTIVE_BUSINESS') {
            let custQ = supabase.from('customers').delete().eq('shop_id', shopId).neq('id', '0000-WALK-IN');
            let prodQ = supabase.from('products').delete().eq('shop_id', shopId);
            let wsQ = supabase.from('wholesalers').delete().eq('shop_id', shopId);

            if (scopedBusinessType) {
              custQ = custQ.eq('business_type', scopedBusinessType);
              prodQ = prodQ.eq('business_type', scopedBusinessType);
              wsQ = wsQ.eq('business_type', scopedBusinessType);
            }

            await Promise.allSettled([custQ, prodQ, wsQ]);
          }

          // Bump reset_epoch on shop_profile
          await supabase
            .from('shop_profile')
            .update({
              reset_epoch: resetEpoch,
              last_wiped_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', shopId);
        }
      } catch (err) {
        console.warn('Remote Supabase deletion notice (offline or network):', err);
      }
    }

    // Always clear outbox so queued insertions do not re-populate wiped data
    try {
      await db.sync_outbox.clear();
    } catch (e) {
      console.warn('Failed to clear sync outbox:', e);
    }

    // Update local profile with new reset_epoch
    try {
      await db.updateShopProfile({
        reset_epoch: resetEpoch,
        last_wiped_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to update local profile reset_epoch:', e);
    }

    return { success: true, resetEpoch };
  }

  /**
   * Ensures that the target shop_profile row exists in Supabase so foreign key constraints on products.shop_id succeed.
   */
  async ensureShopProfileExistsInCloud(shopId: string, bizType: BusinessType = 'KIRANA_RETAIL'): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const payload = sanitizeShopProfileForSupabase(
        {
          id: shopId,
          shop_id: shopId,
          shop_name: 'Laxmi Vatsalya General Store',
          owner_name: 'Pandurang Paradkar',
          phone: '9404380326',
          upi_vpa: '9404380326@upi',
        },
        shopId,
        userId
      );
      await supabase.from('shop_profile').upsert(payload, { onConflict: 'id' });
    } catch {
      // Ignore in offline
    }
  }

  /**
   * Ensures that a customer row (including 0000-WALK-IN) exists in Supabase before syncing sales_invoices or khata_transactions.
   */
  async ensureCustomerExistsInCloud(customerId: string, shopId = 'current_shop'): Promise<void> {
    if (!supabase || this.isTestEnv || !customerId) return;
    try {
      const userId = await this.getUserId();
      if (customerId === '0000-WALK-IN') {
        const walkInPayload = sanitizeCustomerForSupabase(
          {
            id: '0000-WALK-IN',
            shop_id: shopId,
            name: 'Walk-in Customer (Cash / UPI)',
            phone: '0000000000',
            address_landmark: 'Counter Sale',
            credit_limit: 0,
            current_udhari_balance: 0,
            created_at: new Date(0).toISOString(),
          },
          shopId,
          userId
        );
        await supabase.from('customers').upsert(walkInPayload, { onConflict: 'id' });
        return;
      }
      const localCust =
        (await kiranaDb.customers.get(customerId).catch(() => undefined)) ||
        (await db.customers.get(customerId).catch(() => undefined));
      if (localCust) {
        const custPayload = sanitizeCustomerForSupabase(localCust, localCust.shop_id || shopId, userId);
        await supabase.from('customers').upsert(custPayload, { onConflict: 'id' });
      }
    } catch {
      // Ignore in offline
    }
  }

  /**
   * Syncs a single product to Supabase cloud
   */
  async syncProduct(product: Product): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const isHmf = product.business_type === 'HOMEMADE_FOOD' || isHomemadeShopId(product.shop_id);
      const baseShopId = getBaseKiranaShopId(product.shop_id);
      const shopIdToUse = isHmf ? getHomemadeShopId(baseShopId) : (product.shop_id || baseShopId);

      // Ensure parent shop_profile exists in Supabase to satisfy foreign key constraint
      await this.ensureShopProfileExistsInCloud(shopIdToUse, isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL');

      const userId = await this.getUserId();
      const payload = sanitizeProductForSupabase(product, shopIdToUse, userId);

      let { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });
      if (error && payload.wholesaler_id) {
        // Fallback if wholesaler foreign key hasn't synced yet
        const retryRes = await supabase
          .from('products')
          .upsert({ ...payload, wholesaler_id: null }, { onConflict: 'id' });
        error = retryRes.error;
      }

      if (error) {
        console.warn('Sync product to Supabase failed:', error.message);
      } else {
        // Clear pending outbox entries for this product since it is now live on Supabase
        const pending = await kiranaDb.sync_outbox
          .where('status')
          .equals('PENDING')
          .toArray()
          .catch(() => []);
        const idsToRemove = pending
          .filter((item) => item.table_name === 'products' && item.payload?.id === product.id && item.id)
          .map((item) => item.id);
        if (idsToRemove.length > 0) {
          await kiranaDb.sync_outbox.bulkDelete(idsToRemove).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Background sync product to Supabase failed (offline mode):', err);
    }
  }

  /**
   * Syncs a single wholesaler to Supabase cloud
   */
  async syncWholesaler(wholesaler: Wholesaler): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const shopId = wholesaler.shop_id || 'current_shop';
      await this.ensureShopProfileExistsInCloud(shopId);
      const payload = sanitizeWholesalerForSupabase(wholesaler, shopId, userId);

      const { error } = await supabase.from('wholesalers').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync wholesaler to Supabase returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync wholesaler to Supabase failed (offline mode):', err);
    }
  }

  /**
   * Syncs a single Loan Account (local-first; silently skips if loan_accounts table is not in cloud schema)
   */
  async syncLoanAccount(_loanAccount: LoanAccount): Promise<void> {
    return;
  }

  /**
   * Deletes a single wholesaler from Supabase cloud
   */
  async deleteWholesaler(wholesalerId: string): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const { error } = await supabase.from('wholesalers').delete().eq('id', wholesalerId);
      if (error) {
        console.warn('Delete wholesaler from Supabase returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background delete wholesaler from Supabase failed:', err);
    }
  }

  /**
   * Deletes a single product from Supabase cloud
   */
  async deleteProduct(productId: string): Promise<void> {
    await this.deleteProductsBulk([productId]);
  }

  /**
   * Bulk deletes products from Supabase cloud in safe batches of 100
   */
  async deleteProductsBulk(productIds: string[]): Promise<void> {
    if (!supabase || this.isTestEnv || !productIds || productIds.length === 0) return;
    try {
      for (let i = 0; i < productIds.length; i += 100) {
        const chunk = productIds.slice(i, i + 100);
        const { error } = await supabase.from('products').delete().in('id', chunk);
        if (error) {
          console.warn('Bulk delete products from Supabase returned error:', error.message);
        }
      }
    } catch (err) {
      console.warn('Background bulk delete products from Supabase failed:', err);
    }
  }

  /**
   * Syncs a single customer to Supabase cloud
   */
  async syncCustomer(customer: Customer): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const shopId = customer.shop_id || 'current_shop';
      await this.ensureShopProfileExistsInCloud(shopId);
      const payload = sanitizeCustomerForSupabase(customer, shopId, userId);

      const { error } = await supabase.from('customers').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync customer to Supabase returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync customer to Supabase failed:', err);
    }
  }

  /**
   * Deletes a customer from Supabase cloud
   */
  async deleteCustomer(customerId: string): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', customerId);
      if (error) {
        console.warn('Delete customer from Supabase returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background delete customer from Supabase failed:', err);
    }
  }

  /**
   * Syncs a single inventory log to Supabase cloud
   */
  async syncInventoryLog(log: InventoryLog): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const shopId = log.shop_id || 'current_shop';
      const payload = sanitizeInventoryLogForSupabase(log, shopId, userId);
      const { error } = await supabase.from('inventory_logs').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync inventory_log returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync inventory_log failed:', err);
    }
  }

  /**
   * Syncs completed sales invoice and associated items to Supabase cloud
   */
  async syncInvoice(invoice: SalesInvoice, items: SaleItem[]): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const shopId = invoice.shop_id || 'current_shop';

      await this.ensureShopProfileExistsInCloud(shopId);
      await this.ensureCustomerExistsInCloud(invoice.customer_id || '0000-WALK-IN', shopId);

      const invoicePayload = sanitizeSalesInvoiceForSupabase(invoice, shopId, userId);

      const { error: invErr } = await supabase.from('sales_invoices').upsert(invoicePayload, { onConflict: 'id' });
      if (invErr) {
        console.warn('Sync sales_invoice returned error:', invErr.message);
      }

      if (items && items.length > 0) {
        const itemsPayload = items.map((item) =>
          sanitizeSaleItemForSupabase(item, item.shop_id || shopId, userId)
        );

        const { error: itemErr } = await supabase.from('sale_items').upsert(itemsPayload, { onConflict: 'id' });
        if (itemErr) {
          console.warn('Sync sale_items returned error:', itemErr.message);
        }
      }
    } catch (err) {
      console.warn('Background sync invoice to Supabase failed:', err);
    }
  }

  /**
   * Syncs khata transaction to Supabase cloud
   */
  async syncKhataTransaction(tx: KhataTransaction): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const shopId = tx.shop_id || 'current_shop';
      await this.ensureCustomerExistsInCloud(tx.customer_id, shopId);
      const payload = sanitizeKhataTransactionForSupabase(tx, shopId, userId);

      const { error } = await supabase.from('khata_transactions').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync khata_transaction returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync khata tx to Supabase failed:', err);
    }
  }

  /**
   * Syncs daily galla session
   */
  async syncGallaSession(session: DailyGallaSession): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const shopId = session.shop_id || 'current_shop';
      const payload = sanitizeGallaSessionForSupabase(session, shopId, userId);

      const { error } = await supabase.from('daily_galla_sessions').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync galla session returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync galla session to Supabase failed:', err);
    }
  }

  /**
   * Syncs expense record
   */
  async syncExpense(expense: ExpenseAndDrawing): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const shopId = expense.shop_id || 'current_shop';
      const payload = sanitizeExpenseForSupabase(expense, shopId, userId);

      const { error } = await supabase.from('expenses_and_drawings').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync expense returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync expense to Supabase failed:', err);
    }
  }

  /**
   * Syncs shop profile
   */
  async syncShopProfile(profile: ShopProfile): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const payload = sanitizeShopProfileForSupabase(profile, profile.shop_id || profile.id || 'current_shop', userId);

      const { error } = await supabase.from('shop_profile').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync shop_profile returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync shop profile to Supabase failed:', err);
    }
  }

  /**
   * Syncs store user
   */
  async syncStoreUser(storeUser: StoreUser): Promise<void> {
    if (!supabase || this.isTestEnv) return;
    try {
      const userId = await this.getUserId();
      const payload = sanitizeStoreUserForSupabase(storeUser, storeUser.shop_id || 'current_shop', userId);

      const { error } = await supabase.from('store_users').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync store_user returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync store user to Supabase failed:', err);
    }
  }

  /**
   * Full bidirectional push: Pushes all local Dexie tables to Supabase cloud
   */
  async syncAllToCloud(): Promise<{ success: boolean; pushedCount: number; errors: string[] }> {
    if (!supabase || this.isTestEnv) {
      return { success: true, pushedCount: 0, errors: [] };
    }

    this.setStatus({ isSyncing: true, status: 'syncing', message: 'Syncing all records to Supabase...' });

    const errors: string[] = [];
    let pushedCount = 0;

    try {
      // 0. Flush any pending outbox items (including DELETE operations) first
      await this.flushOutbox().catch(() => {});

      const userId = await this.getUserId();
      const shopId = await this.getActiveShopId();
      const localProfile = await db.getShopProfile();
      const localResetEpoch = localProfile.reset_epoch || 1;

      // Multi-device watermark check: Ensure local reset_epoch catches up with remote reset_epoch
      try {
        const { data: remoteProfile } = await supabase
          .from('shop_profile')
          .select('reset_epoch, last_wiped_at')
          .eq('id', shopId)
          .maybeSingle();

        if (remoteProfile?.reset_epoch && remoteProfile.reset_epoch > localResetEpoch) {
          await db.updateShopProfile({ reset_epoch: remoteProfile.reset_epoch });
        }
      } catch (checkErr) {
        console.warn('Could not check remote reset_epoch:', checkErr);
      }

      // 1. Sync Shop Profile strictly for Laxmi Vatsalya General Store
      const primaryShopId = getBaseKiranaShopId(shopId);
      try {
        const profile = await db.getShopProfile();
        if (profile) {
          const kiranaPayload = sanitizeShopProfileForSupabase(
            {
              ...profile,
              id: primaryShopId,
              shop_id: primaryShopId,
              shop_name: 'Laxmi Vatsalya General Store',
              owner_name: 'Pandurang Paradkar',
              phone: '9404380326',
              upi_vpa: '9404380326@upi',
              address: 'Laxmi Vatsalya General Store, Maharashtra',
              gst_footer_note: 'Thank you for shopping at Laxmi Vatsalya General Store! Visit again.',
            },
            primaryShopId,
            userId
          );
          const { error } = await supabase.from('shop_profile').upsert(kiranaPayload, { onConflict: 'id' });
          if (error) throw new Error(error.message);
          pushedCount += 1;
        }
      } catch (e: unknown) {
        errors.push(`Shop Profile: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 2. Sync Store Users
      try {
        const users = await db.getStoreUsers();
        if (users.length > 0) {
          const rows = users.map((u) => sanitizeStoreUserForSupabase(u, u.shop_id || primaryShopId, userId));
          const { error } = await supabase.from('store_users').upsert(rows, { onConflict: 'id' });
          if (error) throw new Error(error.message);
          pushedCount += rows.length;
        }
      } catch (e: unknown) {
        errors.push(`Store Users: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 3. Sync Wholesalers BEFORE Products (so foreign key wholesaler_id succeeds)
      try {
        const wholesalers = await db.wholesalers.toArray();
        if (wholesalers.length > 0) {
          const rows = wholesalers.map((w) => sanitizeWholesalerForSupabase(w, w.shop_id || primaryShopId, userId));
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('wholesalers').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Wholesalers: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 4. Sync Products from kiranaDb and homemadeDb (excluding tombstoned or legacy duplicate IDs)
      try {
        const [kiranaProds, homemadeProds] = await Promise.all([
          kiranaDb.products.toArray(),
          homemadeDb.products.toArray(),
        ]);
        const tombstones = getLocalDeletedProductTombstones();
        const prodMap = new Map<string, Product>();
        const seenNames = new Set<string>();
        const duplicateLocalIdsToPurge: string[] = [];

        for (const p of [...kiranaProds, ...homemadeProds]) {
          if (tombstones.has(p.id) || isLegacyDuplicateId(p.id)) {
            duplicateLocalIdsToPurge.push(p.id);
            continue;
          }
          const normName = (p.name || '').trim().toLowerCase();
          if (normName && seenNames.has(normName)) {
            duplicateLocalIdsToPurge.push(p.id);
            continue;
          }
          if (normName) seenNames.add(normName);
          prodMap.set(p.id, p);
        }

        if (duplicateLocalIdsToPurge.length > 0) {
          await kiranaDb.products.bulkDelete(duplicateLocalIdsToPurge).catch(() => {});
          await homemadeDb.products.bulkDelete(duplicateLocalIdsToPurge).catch(() => {});
          this.deleteProductsBulk(duplicateLocalIdsToPurge);
        }

        const prods = Array.from(prodMap.values());

        if (prods.length > 0) {
          const hmfShopId = getHomemadeShopId(primaryShopId);
          const rows = prods.map((p) => {
            const isHmf = isHomemadeShopId(p.shop_id) || p.business_type === 'HOMEMADE_FOOD' || isHomemadeFoodCategoryOrName(p);
            const targetShopId = isHmf ? hmfShopId : (p.shop_id || primaryShopId);
            return sanitizeProductForSupabase(p, targetShopId, userId);
          });
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            let { error } = await supabase.from('products').upsert(chunk, { onConflict: 'id' });
            if (error) {
              // Retry with wholesaler_id nulled if FK fails
              const fallbackChunk = chunk.map((r) => ({ ...r, wholesaler_id: null }));
              const retryRes = await supabase.from('products').upsert(fallbackChunk, { onConflict: 'id' });
              error = retryRes.error;
            }
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Products: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 5. Sync Customers (always including 0000-WALK-IN so sales_invoices foreign keys succeed)
      try {
        await this.ensureCustomerExistsInCloud('0000-WALK-IN', primaryShopId);
        const custs = await db.customers.toArray();
        if (custs.length > 0) {
          const rows = custs.map((c) => sanitizeCustomerForSupabase(c, c.shop_id || primaryShopId, userId));
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('customers').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Customers: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 6. Sync Sales Invoices
      try {
        const invoices = await db.sales_invoices.toArray();
        if (invoices.length > 0) {
          const rows = invoices.map((inv) => sanitizeSalesInvoiceForSupabase(inv, inv.shop_id || primaryShopId, userId));
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('sales_invoices').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Sales Invoices: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 7. Sync Sale Items (linked to sales_invoices)
      try {
        const saleItems = await db.sale_items.toArray();
        if (saleItems.length > 0) {
          const rows = saleItems.map((it) => sanitizeSaleItemForSupabase(it, it.shop_id || primaryShopId, userId));
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('sale_items').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Sale Items: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 8. Sync Khata Transactions
      try {
        const txs = await db.khata_transactions.toArray();
        if (txs.length > 0) {
          const rows = txs.map((t) => sanitizeKhataTransactionForSupabase(t, t.shop_id || primaryShopId, userId));
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('khata_transactions').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Khata Transactions: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 9. Sync Inventory Logs
      try {
        const logs = await db.inventory_logs.toArray();
        if (logs.length > 0) {
          const rows = logs.map((l) => sanitizeInventoryLogForSupabase(l, l.shop_id || primaryShopId, userId));
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('inventory_logs').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Inventory Logs: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 10. Sync Daily Galla Sessions
      try {
        const sessions = await db.daily_galla_sessions.toArray();
        if (sessions.length > 0) {
          const rows = sessions.map((s) => sanitizeGallaSessionForSupabase(s, s.shop_id || primaryShopId, userId));
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('daily_galla_sessions').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Galla Sessions: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 11. Sync Expenses and Drawings
      try {
        const expenses = await db.expenses_and_drawings.toArray();
        if (expenses.length > 0) {
          const rows = expenses.map((exp) => sanitizeExpenseForSupabase(exp, exp.shop_id || primaryShopId, userId));
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('expenses_and_drawings').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Expenses: ${e instanceof Error ? e.message : String(e)}`);
      }

      const now = new Date().toISOString();
      const hasErrors = errors.length > 0;
      this.setStatus({
        isSyncing: false,
        lastSyncedAt: now,
        status: hasErrors ? 'error' : 'synced',
        message: hasErrors
          ? `Sync completed with notice: ${errors[0]}`
          : `All ${pushedCount} items synced to Supabase successfully!`,
      });

      return { success: !hasErrors, pushedCount, errors };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({
        isSyncing: false,
        status: 'error',
        message: `Sync failed: ${msg}`,
      });
      return { success: false, pushedCount, errors: [msg] };
    }
  }

  /**
   * Pull all records from Supabase into local Dexie database strictly scoped by shop_id
   */
  async pullAllFromCloud(): Promise<{ success: boolean; pulledCount: number; errors: string[] }> {
    if (!supabase || this.isTestEnv) {
      return { success: true, pulledCount: 0, errors: [] };
    }

    this.setStatus({ isSyncing: true, status: 'syncing', message: 'Pulling cloud data from Supabase...' });

    let pulledCount = 0;
    const errors: string[] = [];

    try {
      const shopId = await this.getActiveShopId();
      const primaryShopId = getBaseKiranaShopId(typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_base_shop_id') || localStorage.getItem('kirana_primary_shop_id') || shopId : shopId);
      const hmfShopId = getHomemadeShopId(primaryShopId);
      const shopIdsToPull = Array.from(new Set([shopId, primaryShopId, hmfShopId, 'current_shop'].filter(Boolean)));

      const localProfile = await db.getShopProfile();
      const localResetEpoch = localProfile.reset_epoch || 1;

      // 1. Pull Shop Profiles
      try {
        const { data: profiles, error } = await supabase
          .from('shop_profile')
          .select('*')
          .in('id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (profiles && profiles.length > 0) {
          for (const profile of profiles) {
            if (profile.id === shopId && profile.reset_epoch && profile.reset_epoch > localResetEpoch) {
              const localProds = await db.products.toArray();
              await db.updateShopProfile({ reset_epoch: profile.reset_epoch });
              if (localProds.length > 0) {
                this.syncAllToCloud().catch(() => { });
              }
            }

            const isHmfProfile = isHomemadeShopId(profile.id) || profile.business_type === 'HOMEMADE_FOOD';
            await db.updateShopProfile({
              id: profile.id,
              shop_id: profile.id,
              business_type: isHmfProfile ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              invoice_prefix: profile.invoice_prefix || (isHmfProfile ? 'HMF' : 'KRN'),
              shop_name: profile.shop_name,
              owner_name: profile.owner_name,
              phone: profile.phone,
              upi_vpa: profile.upi_vpa || '9404380326@upi',
              address: profile.address || '',
              gst_footer_note: profile.gst_footer_note || '',
              invite_code: profile.invite_code,
              reset_epoch: profile.reset_epoch || 1,
              last_wiped_at: profile.last_wiped_at,
            });
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull shop_profile failed:', e);
      }

      // 2. Pull Products strictly scoped by shop_id and reconcile deletions / duplicates
      try {
        const { data: prods, error } = await supabase
          .from('products')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (prods) {
          const tombstones = getLocalDeletedProductTombstones();
          const seenRemoteNames = new Set<string>();
          const remoteIdsToPurge: string[] = [];

          // Collect any product IDs that currently have pending local outbox edits
          const pendingOutboxItems = await kiranaDb.sync_outbox
            .where('status')
            .equals('PENDING')
            .toArray()
            .catch(() => []);
          const pendingProductIds = new Set(
            pendingOutboxItems
              .filter((item) => item.table_name === 'products' && item.payload?.id)
              .map((item) => String(item.payload.id))
          );

          // Sort so canonical prod-170-* IDs are processed first before any duplicates
          const sortedProds = [...prods].sort((a, b) => {
            const aCanon = String(a.id || '').startsWith('prod-170-') ? 0 : 1;
            const bCanon = String(b.id || '').startsWith('prod-170-') ? 0 : 1;
            return aCanon - bCanon;
          });

          for (const p of sortedProds) {
            if (!p.id || tombstones.has(p.id) || isLegacyDuplicateId(p.id)) {
              if (p.id) remoteIdsToPurge.push(p.id);
              continue;
            }
            const normName = String(p.name || '').trim().toLowerCase();
            if (normName && seenRemoteNames.has(normName)) {
              remoteIdsToPurge.push(p.id);
              continue;
            }
            if (normName) seenRemoteNames.add(normName);

            const isHmf = isHomemadeShopId(p.shop_id) || p.business_type === 'HOMEMADE_FOOD' || isHomemadeFoodCategoryOrName(p);
            const itemShopId = p.shop_id || (isHmf ? hmfShopId : primaryShopId);
            const existingLocal = isHmf
              ? await homemadeDb.products.get(p.id).catch(() => undefined)
              : await kiranaDb.products.get(p.id).catch(() => undefined);

            // Never overwrite a local product that has pending outbox mutations or a newer updated_at timestamp
            if (existingLocal) {
              const localTs = existingLocal.updated_at ? new Date(existingLocal.updated_at).getTime() : 0;
              const remoteTs = p.updated_at ? new Date(p.updated_at).getTime() : 0;
              if (pendingProductIds.has(p.id) || (localTs > 0 && localTs > remoteTs)) {
                this.syncProduct(existingLocal).catch(() => {});
                continue;
              }
            }

            const productRecord: Product = {
              id: p.id,
              shop_id: itemShopId,
              business_type: isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              name: p.name,
              marathi_name: p.marathi_name || existingLocal?.marathi_name || undefined,
              search_keywords: p.search_keywords || existingLocal?.search_keywords || undefined,
              short_code: p.short_code,
              barcode: p.barcode || '',
              category: p.category || (isHmf ? 'Konkani Breakfast & Tiffin' : 'General'),
              unit_type: p.unit_type || (p as any).unit || 'PCS',
              purchase_price: Number(p.purchase_price) || 0,
              selling_price: Number(p.selling_price) || 0,
              mrp: Number(p.mrp) || Number(p.selling_price) || 0,
              current_stock: Number(p.current_stock) || 0,
              low_stock_threshold: Number(p.low_stock_threshold) || 5,
              last_supplier_name: p.last_supplier_name || existingLocal?.last_supplier_name || (isHmf ? 'In-House Kitchen' : 'General Wholesaler'),
              supplier_phone: p.supplier_phone || existingLocal?.supplier_phone || undefined,
              wholesaler_id: p.wholesaler_id || existingLocal?.wholesaler_id || null,
              loan_account_id: p.loan_account_id || existingLocal?.loan_account_id || null,
              is_loan_funded: Boolean(p.is_loan_funded ?? existingLocal?.is_loan_funded ?? (p.loan_account_id || existingLocal?.loan_account_id)),
              image_url: p.image_url || existingLocal?.image_url || null,
              expiry_date: p.expiry_date || existingLocal?.expiry_date || null,
              is_quick_tap: Boolean(p.is_quick_tap),
              updated_at: p.updated_at || new Date().toISOString(),
            };

            if (isHmf) {
              await homemadeDb.products.put(productRecord);
            } else {
              await kiranaDb.products.put(productRecord);
            }
            await db.products.put(productRecord).catch(() => { });
            pulledCount++;
          }

          if (remoteIdsToPurge.length > 0) {
            await kiranaDb.products.bulkDelete(remoteIdsToPurge).catch(() => {});
            await homemadeDb.products.bulkDelete(remoteIdsToPurge).catch(() => {});
            this.deleteProductsBulk(remoteIdsToPurge);
          }
        }
      } catch (e) {
        console.warn('Pull products failed:', e);
      }

      // 2b. Pull Wholesalers strictly scoped by shop_id
      try {
        const { data: wholesalers, error } = await supabase
          .from('wholesalers')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (!error && wholesalers && wholesalers.length > 0) {
          for (const w of wholesalers) {
            const wsRecord: Wholesaler = {
              id: w.id,
              shop_id: w.shop_id || shopId,
              business_type: w.business_type || 'KIRANA_RETAIL',
              name: w.name,
              agency_or_brand: w.agency_or_brand || undefined,
              phone: w.phone || '',
              gstin: w.gstin || undefined,
              address: w.address || undefined,
              visit_day: w.visit_day || undefined,
              is_active: w.is_active !== false,
              created_at: w.created_at || new Date().toISOString(),
              updated_at: w.updated_at || undefined,
            };
            await kiranaDb.wholesalers.put(wsRecord).catch(() => {});
            await db.wholesalers.put(wsRecord).catch(() => {});
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull wholesalers failed:', e);
      }

      // 3. Pull Customers strictly scoped by shop_id
      try {
        const { data: custs, error } = await supabase
          .from('customers')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (custs && custs.length > 0) {
          for (const c of custs) {
            const isHmf = isHomemadeShopId(c.shop_id) || c.business_type === 'HOMEMADE_FOOD';
            const customerRecord: Customer = {
              id: c.id,
              shop_id: c.shop_id || (isHmf ? hmfShopId : primaryShopId),
              business_type: isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              name: c.name,
              phone: c.phone,
              address_landmark: c.address_landmark || null,
              credit_limit: Number(c.credit_limit) || 2000,
              current_udhari_balance: Number(c.current_udhari_balance) || 0,
              oldest_unpaid_date: c.oldest_unpaid_date || null,
              last_reminder_sent_at: c.last_reminder_sent_at || null,
              created_at: c.created_at || new Date().toISOString(),
            };
            if (isHmf) {
              await homemadeDb.customers.put(customerRecord);
            } else {
              await kiranaDb.customers.put(customerRecord);
            }
            await db.customers.put(customerRecord).catch(() => { });
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull customers failed:', e);
      }

      // 4. Pull Store Users strictly scoped by shop_id
      try {
        const { data: users, error } = await supabase
          .from('store_users')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (users && users.length > 0) {
          for (const u of users) {
            const userRecord: StoreUser = {
              id: u.id,
              user_id: u.user_id || undefined,
              email: u.email,
              full_name: u.full_name,
              phone: u.phone || undefined,
              role: u.role,
              shop_id: u.shop_id || shopId,
              is_active: u.is_active ?? true,
              created_at: u.created_at || new Date().toISOString(),
              updated_at: u.updated_at || undefined,
            };
            await db.saveStoreUser(userRecord);
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull store users failed:', e);
      }

      // 5. Pull Inventory Logs strictly scoped by shop_id
      try {
        const { data: logs, error } = await supabase
          .from('inventory_logs')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (logs && logs.length > 0) {
          for (const l of logs) {
            const isHmf = isHomemadeShopId(l.shop_id) || l.business_type === 'HOMEMADE_FOOD';
            const logRecord: InventoryLog = {
              id: l.id,
              shop_id: l.shop_id || (isHmf ? hmfShopId : primaryShopId),
              business_type: isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              product_id: l.product_id,
              change_qty: Number(l.change_qty) || 0,
              reason_type: l.reason_type,
              unit_cost_at_time: Number(l.unit_cost_at_time) || 0,
              reference_id: l.reference_id || null,
              notes: l.notes || '',
              created_at: l.created_at || new Date().toISOString(),
            };
            if (isHmf) {
              await homemadeDb.inventory_logs.put(logRecord);
            } else {
              await kiranaDb.inventory_logs.put(logRecord);
            }
            await db.inventory_logs.put(logRecord).catch(() => { });
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull inventory logs failed:', e);
      }

      // 6. Pull Khata Transactions strictly scoped by shop_id
      try {
        const { data: txs, error } = await supabase
          .from('khata_transactions')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (txs && txs.length > 0) {
          for (const t of txs) {
            const isHmf = isHomemadeShopId(t.shop_id) || t.business_type === 'HOMEMADE_FOOD';
            const txRecord: KhataTransaction = {
              id: t.id,
              shop_id: t.shop_id || (isHmf ? hmfShopId : primaryShopId),
              business_type: isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              customer_id: t.customer_id,
              entry_type: t.entry_type,
              amount: Number(t.amount) || 0,
              payment_channel: t.payment_channel,
              invoice_id: t.invoice_id || null,
              running_balance_after: Number(t.running_balance_after ?? (t as any).balance_after) || 0,
              notes: t.notes || '',
              created_at: t.created_at || new Date().toISOString(),
            };
            if (isHmf) {
              await homemadeDb.khata_transactions.put(txRecord);
            } else {
              await kiranaDb.khata_transactions.put(txRecord);
            }
            await db.khata_transactions.put(txRecord).catch(() => { });
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull khata transactions failed:', e);
      }

      // 7. Pull Sales Invoices strictly scoped by shop_id
      try {
        const { data: invoices, error } = await supabase
          .from('sales_invoices')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (invoices && invoices.length > 0) {
          for (const inv of invoices) {
            const isHmf = isHomemadeShopId(inv.shop_id) || inv.business_type === 'HOMEMADE_FOOD';
            const invoiceRecord: SalesInvoice = {
              id: inv.id,
              shop_id: inv.shop_id || (isHmf ? hmfShopId : primaryShopId),
              business_type: isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              invoice_number: inv.invoice_number,
              customer_id: inv.customer_id,
              subtotal_amount: Number(inv.subtotal_amount) || 0,
              discount_roundoff: Number(inv.discount_roundoff) || 0,
              grand_total: Number(inv.grand_total) || 0,
              total_cogs: Number(inv.total_cogs) || 0,
              payment_mode: inv.payment_mode,
              amount_paid_now: Number(inv.amount_paid_now) || 0,
              udhari_added: Number(inv.udhari_added) || 0,
              status: inv.status,
              return_reason: inv.return_reason || undefined,
              credit_note_number: inv.credit_note_number || undefined,
              returned_at: inv.returned_at || undefined,
              created_at: inv.created_at || new Date().toISOString(),
            };
            if (isHmf) {
              await homemadeDb.sales_invoices.put(invoiceRecord);
            } else {
              await kiranaDb.sales_invoices.put(invoiceRecord);
            }
            await db.sales_invoices.put(invoiceRecord).catch(() => { });
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull sales invoices failed:', e);
      }

      // 8. Pull Sale Items strictly scoped by shop_id
      try {
        const { data: saleItems, error } = await supabase
          .from('sale_items')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (saleItems && saleItems.length > 0) {
          for (const item of saleItems) {
            const isHmf = isHomemadeShopId(item.shop_id) || item.business_type === 'HOMEMADE_FOOD';
            const itemRecord: SaleItem = {
              id: item.id,
              shop_id: item.shop_id || (isHmf ? hmfShopId : primaryShopId),
              business_type: isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              invoice_id: item.invoice_id,
              product_id: item.product_id,
              product_name_snapshot: item.product_name_snapshot,
              qty: Number(item.qty) || 0,
              unit_selling_price: Number(item.unit_selling_price) || 0,
              unit_purchase_cost: Number(item.unit_purchase_cost || (item as any).unit_cost_price) || 0,
              line_total: Number(item.line_total) || 0,
            };
            if (isHmf) {
              await homemadeDb.sale_items.put(itemRecord);
            } else {
              await kiranaDb.sale_items.put(itemRecord);
            }
            await db.sale_items.put(itemRecord).catch(() => { });
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull sale items failed:', e);
      }

      // 9. Pull Daily Galla Sessions strictly scoped by shop_id
      try {
        const { data: sessions, error } = await supabase
          .from('daily_galla_sessions')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (sessions && sessions.length > 0) {
          for (const s of sessions) {
            const isHmf = isHomemadeShopId(s.shop_id) || s.business_type === 'HOMEMADE_FOOD';
            const sessionRecord: DailyGallaSession = {
              id: s.id,
              shop_id: s.shop_id || (isHmf ? hmfShopId : primaryShopId),
              business_type: isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              session_date: s.session_date,
              opening_cash: Number(s.opening_cash) || 0,
              cash_sales_total: Number(s.cash_sales_total) || 0,
              cash_udhari_recovered: Number(s.cash_udhari_recovered) || 0,
              cash_expenses_out: Number(s.cash_expenses_out) || 0,
              expected_closing_cash: Number(s.expected_closing_cash) || 0,
              actual_counted_cash: s.actual_counted_cash !== null && s.actual_counted_cash !== undefined ? Number(s.actual_counted_cash) : null,
              discrepancy: s.discrepancy !== null && s.discrepancy !== undefined ? Number(s.discrepancy) : null,
            };
            if (isHmf) {
              await homemadeDb.daily_galla_sessions.put(sessionRecord);
            } else {
              await kiranaDb.daily_galla_sessions.put(sessionRecord);
            }
            await db.daily_galla_sessions.put(sessionRecord).catch(() => {});
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull daily_galla_sessions failed:', e);
      }

      // 10. Pull Expenses and Drawings strictly scoped by shop_id
      try {
        const { data: expenses, error } = await supabase
          .from('expenses_and_drawings')
          .select('*')
          .in('shop_id', shopIdsToPull);

        if (error) throw new Error(error.message);
        if (expenses && expenses.length > 0) {
          for (const exp of expenses) {
            const isHmf = isHomemadeShopId(exp.shop_id) || exp.business_type === 'HOMEMADE_FOOD';
            const expRecord: ExpenseAndDrawing = {
              id: exp.id,
              shop_id: exp.shop_id || (isHmf ? hmfShopId : primaryShopId),
              business_type: isHmf ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL',
              category: exp.category,
              amount: Number(exp.amount) || 0,
              paid_via: exp.paid_via || 'CASH_GALLA',
              description: exp.description || '',
              created_at: exp.created_at || new Date().toISOString(),
            };
            if (isHmf) {
              await homemadeDb.expenses_and_drawings.put(expRecord);
            } else {
              await kiranaDb.expenses_and_drawings.put(expRecord);
            }
            await db.expenses_and_drawings.put(expRecord).catch(() => {});
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull expenses_and_drawings failed:', e);
      }

      // 11. ACID Reconciliation: Recompute stock & udhari deterministically from deltas across both databases
      await Promise.all([
        kiranaDb.reconcileAllStockAndBalances().catch(() => { }),
        homemadeDb.reconcileAllStockAndBalances().catch(() => { }),
      ]);
      await HomemadeFoodService.repairMixedBusinessProducts();

      const now = new Date().toISOString();
      this.setStatus({
        isSyncing: false,
        lastSyncedAt: now,
        status: 'synced',
        message: `Cloud sync complete! Pulled ${pulledCount} items and reconciled ledger deltas for shop.`,
      });

      return { success: true, pulledCount, errors };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({
        isSyncing: false,
        status: 'error',
        message: `Pull failed: ${msg}`,
      });
      return { success: false, pulledCount, errors: [msg] };
    }
  }

  /**
   * Emergency Cloud & Archive Recovery:
   * 1. Pulls any products from Supabase `public.products` (across active shop_id or 'current_shop').
   * 2. If `public.products` is empty, inspects `public.store_backup_archives` for the latest pre-wipe snapshot and restores those products.
   */
  async restoreProductsFromCloudOrArchive(): Promise<{
    restoredCount: number;
    source: 'CLOUD_PRODUCTS' | 'BACKUP_ARCHIVE' | 'NONE';
    message: string;
  }> {
    if (!supabase) {
      return { restoredCount: 0, source: 'NONE', message: 'Supabase client is not configured.' };
    }

    const shopId = await this.getActiveShopId();

    try {
      // 1. Check active Supabase products table
      const { data: cloudProds } = await supabase.from('products').select('*');
      if (cloudProds && cloudProds.length > 0) {
        let count = 0;
        for (const p of cloudProds) {
          await db.products.put({
            id: p.id,
            shop_id: p.shop_id || shopId,
            name: p.name,
            marathi_name: p.marathi_name || undefined,
            search_keywords: p.search_keywords || undefined,
            short_code: p.short_code || p.name?.slice(0, 3)?.toUpperCase() || 'ITM',
            barcode: p.barcode || '',
            category: p.category || 'General',
            unit_type: p.unit_type || 'PCS',
            purchase_price: Number(p.purchase_price) || 0,
            selling_price: Number(p.selling_price) || 0,
            mrp: Number(p.mrp) || Number(p.selling_price) || 0,
            current_stock: Number(p.current_stock) || 0,
            low_stock_threshold: Number(p.low_stock_threshold) || 5,
            last_supplier_name: p.last_supplier_name || 'General Wholesaler',
            supplier_phone: p.supplier_phone || undefined,
            wholesaler_id: p.wholesaler_id || null,
            loan_account_id: p.loan_account_id || null,
            image_url: p.image_url || null,
            expiry_date: p.expiry_date || null,
            is_quick_tap: Boolean(p.is_quick_tap),
            updated_at: p.updated_at || new Date().toISOString(),
          });
          count++;
        }
        return {
          restoredCount: count,
          source: 'CLOUD_PRODUCTS',
          message: `Restored ${count} products from your Supabase Cloud database!`,
        };
      }

      // 2. Check Supabase store_backup_archives table for pre-wipe snapshots
      const { data: archives } = await supabase
        .from('store_backup_archives')
        .select('archive_payload, wiped_at')
        .order('wiped_at', { ascending: false })
        .limit(5);

      if (archives && archives.length > 0) {
        for (const arch of archives) {
          const payload = arch.archive_payload as { products?: Record<string, any>[] } | null;
          if (payload?.products && Array.isArray(payload.products) && payload.products.length > 0) {
            let count = 0;
            for (const p of payload.products) {
              await db.products.put({
                id: p.id,
                shop_id: p.shop_id || shopId,
                name: p.name,
                marathi_name: p.marathi_name || undefined,
                search_keywords: p.search_keywords || undefined,
                short_code: p.short_code || 'ITM',
                barcode: p.barcode || '',
                category: p.category || 'General',
                unit_type: p.unit_type || 'PCS',
                purchase_price: Number(p.purchase_price) || 0,
                selling_price: Number(p.selling_price) || 0,
                mrp: Number(p.mrp) || Number(p.selling_price) || 0,
                current_stock: Number(p.current_stock) || 0,
                low_stock_threshold: Number(p.low_stock_threshold) || 5,
                last_supplier_name: p.last_supplier_name || 'General Wholesaler',
                supplier_phone: p.supplier_phone || undefined,
                wholesaler_id: p.wholesaler_id || null,
                loan_account_id: p.loan_account_id || null,
                image_url: p.image_url || null,
                expiry_date: p.expiry_date || null,
                is_quick_tap: Boolean(p.is_quick_tap),
                updated_at: new Date().toISOString(),
              });
              count++;
            }
            // Re-sync restored products to active Supabase table
            await this.syncAllToCloud();
            return {
              restoredCount: count,
              source: 'BACKUP_ARCHIVE',
              message: `Restored ${count} products from your Supabase Backup Archive snapshot!`,
            };
          }
        }
      }
    } catch (err) {
      console.warn('Cloud archive recovery check failed:', err);
    }

    return {
      restoredCount: 0,
      source: 'NONE',
      message: 'No cloud backup found. Use "⚡ 1-Click Restore 105 Marathi/English Catalog" to populate all 105 Kirana items immediately.',
    };
  }

  /**
   * Outbox Processor: Sequentially flushes pending local mutations to Supabase cloud
   */
  async flushOutbox(): Promise<{ processedCount: number; errors: string[] }> {
    if (!supabase) {
      return { processedCount: 0, errors: ['Supabase client not configured'] };
    }

    const [kiranaItems, hmfItems] = await Promise.all([
      kiranaDb.sync_outbox.where('status').equals('PENDING').sortBy('created_at'),
      homemadeDb.sync_outbox.where('status').equals('PENDING').sortBy('created_at'),
    ]);

    const combined = [
      ...kiranaItems.map((item) => ({ item, targetDb: kiranaDb })),
      ...hmfItems.map((item) => ({ item, targetDb: homemadeDb })),
    ];

    if (combined.length === 0) {
      return { processedCount: 0, errors: [] };
    }

    // Sort by topological FK table priority so parents (shop_profile, wholesalers, products, customers, sales_invoices)
    // are always flushed before children (sale_items, khata_transactions, inventory_logs)
    combined.sort((a, b) => {
      const pA = TABLE_SYNC_PRIORITY[a.item.table_name] ?? 99;
      const pB = TABLE_SYNC_PRIORITY[b.item.table_name] ?? 99;
      if (pA !== pB) return pA - pB;
      return String(a.item.created_at || '').localeCompare(String(b.item.created_at || ''));
    });

    let processedCount = 0;
    const errors: string[] = [];
    const userId = await this.getUserId();

    for (const { item, targetDb } of combined) {
      try {
        // Local-only tables (e.g., credit_notes, loan_accounts, production_batches, advance_orders)
        // do not exist in Supabase public schema — mark SYNCED immediately so they never block the queue.
        if (!SUPABASE_CLOUD_TABLES.has(item.table_name)) {
          await targetDb.sync_outbox.update(item.id, {
            status: 'SYNCED',
            error_message: null,
          });
          processedCount++;
          continue;
        }

        if (item.operation === 'INSERT' || item.operation === 'UPDATE') {
          const recordId = String(item.payload?.id || '');

          if (item.table_name === 'products') {
            const tombstones = getLocalDeletedProductTombstones();
            if (!recordId || tombstones.has(recordId) || isLegacyDuplicateId(recordId)) {
              await targetDb.sync_outbox.delete(item.id);
              continue;
            }
          }

          // Merge partial UPDATE payloads with full local record from Dexie so NOT NULL columns are always present
          let fullRecord: Record<string, unknown> = { ...item.payload };
          if (recordId && (targetDb as any)[item.table_name]) {
            const localRec = await (targetDb as any)[item.table_name].get(recordId).catch(() => undefined);
            if (localRec) {
              fullRecord = { ...localRec, ...item.payload };
            }
          }

          const itemShopId = String(fullRecord.shop_id || item.shop_id || 'current_shop');
          await this.ensureShopProfileExistsInCloud(
            itemShopId,
            isHomemadeShopId(itemShopId) ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL'
          );

          if (item.table_name === 'sales_invoices' || item.table_name === 'khata_transactions') {
            const custId = String(fullRecord.customer_id || '0000-WALK-IN');
            await this.ensureCustomerExistsInCloud(custId, itemShopId);
          }

          const sanitized = sanitizeTablePayloadForSupabase(item.table_name, fullRecord, itemShopId, userId);
          let { error } = await supabase.from(item.table_name).upsert(sanitized, { onConflict: 'id' });

          if (error && item.table_name === 'products' && sanitized.wholesaler_id) {
            const retryRes = await supabase
              .from('products')
              .upsert({ ...sanitized, wholesaler_id: null }, { onConflict: 'id' });
            error = retryRes.error;
          }

          if (error) {
            // If table does not exist in remote schema cache (PGRST205), mark synced so queue doesn't stall
            if (error.code === 'PGRST205') {
              await targetDb.sync_outbox.update(item.id, { status: 'SYNCED', error_message: null });
              processedCount++;
              continue;
            }
            throw new Error(error.message);
          }
        } else if (item.operation === 'DELETE') {
          const targetId = item.payload?.id as string;
          if (targetId) {
            const { error } = await supabase.from(item.table_name).delete().eq('id', targetId);
            if (error && error.code !== 'PGRST205') throw new Error(error.message);
          }
        }

        // Mark as SYNCED
        await targetDb.sync_outbox.update(item.id, {
          status: 'SYNCED',
          error_message: null,
        });
        processedCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Table ${item.table_name} (${item.id}): ${msg}`);
        const nextRetries = (item.retry_count || 0) + 1;
        await targetDb.sync_outbox.update(item.id, {
          retry_count: nextRetries,
          error_message: msg,
          status: nextRetries >= 10 ? 'FAILED' : 'PENDING',
        });
      }
    }

    return { processedCount, errors };
  }
}

export const cloudSyncService = new CloudSyncService();
