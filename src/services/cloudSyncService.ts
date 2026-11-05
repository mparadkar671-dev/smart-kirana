import { supabase } from '../lib/supabase';
import { db, requestStoragePersistence } from '../db/db';
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
} from '../types';

export interface CloudSyncStatus {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  message: string;
}

type SyncStatusListener = (status: CloudSyncStatus) => void;

class CloudSyncService {
  private status: CloudSyncStatus = {
    isSyncing: false,
    lastSyncedAt: localStorage.getItem('kirana_last_cloud_sync'),
    status: 'idle',
    message: 'Ready to sync',
  };

  private listeners: Set<SyncStatusListener> = new Set();

  constructor() {
    this.initOnlineListener();
  }

  private initOnlineListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.setStatus({ status: 'syncing', message: 'Network restored. Flushing sync outbox...' });
        this.flushOutbox();
      });
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

  /**
   * Helper to get active Supabase Auth user ID if signed in
   */
  private async getUserId(): Promise<string | null> {
    if (!supabase) return null;
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
   * Atomic Danger Vault Store Reset: Cleans records from Supabase PostgreSQL and local Dexie
   * Uses execute_store_vault_reset RPC with transactional snapshot archiving, with direct child-to-parent deletion fallback.
   */
  async executeStoreVaultReset(
    resetMode: 'WIPE_ALL_FRESH_STORE' | 'CLEAR_TRANSACTIONS_KEEP_PRODUCTS',
    saveCloudArchive = true
  ): Promise<{ success: boolean; error?: string; resetEpoch?: number }> {
    const shopId = await this.getActiveShopId();
    let resetEpoch = Date.now();

    if (supabase) {
      try {
        // 1. Try atomic PostgreSQL RPC first
        const { data, error } = await supabase.rpc('execute_store_vault_reset', {
          p_shop_id: shopId,
          p_reset_mode: resetMode,
          p_save_cloud_archive: saveCloudArchive,
        });

        if (error) {
          console.warn('RPC execute_store_vault_reset failed, attempting direct scoped deletion fallback:', error.message);
          // 2. Fallback: Direct scoped delete from child tables to parent tables
          await supabase.from('sale_items').delete().eq('shop_id', shopId);
          await supabase.from('khata_transactions').delete().eq('shop_id', shopId);
          await supabase.from('inventory_logs').delete().eq('shop_id', shopId);
          await supabase.from('sales_invoices').delete().eq('shop_id', shopId);
          await supabase.from('daily_galla_sessions').delete().eq('shop_id', shopId);
          await supabase.from('expenses_and_drawings').delete().eq('shop_id', shopId);

          if (resetMode === 'WIPE_ALL_FRESH_STORE') {
            await supabase.from('customers').delete().eq('shop_id', shopId).neq('id', '0000-WALK-IN');
            await supabase.from('products').delete().eq('shop_id', shopId);
            await supabase.from('wholesalers').delete().eq('shop_id', shopId);
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
        } else if (data && typeof data === 'object' && 'reset_epoch' in data) {
          resetEpoch = Number((data as { reset_epoch: number }).reset_epoch) || resetEpoch;
        }
      } catch (err) {
        console.warn('Remote Supabase deletion failed (offline or network):', err);
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
   * Syncs a single product to Supabase cloud
   */
  async syncProduct(product: Product): Promise<void> {
    if (!supabase) return;
    try {
      const userId = await this.getUserId();
      const payload: Record<string, unknown> = {
        id: product.id,
        shop_id: product.shop_id || 'current_shop',
        name: product.name,
        marathi_name: product.marathi_name || null,
        search_keywords: product.search_keywords || null,
        short_code: product.short_code,
        barcode: product.barcode,
        category: product.category,
        unit_type: product.unit_type,
        purchase_price: product.purchase_price,
        selling_price: product.selling_price,
        mrp: product.mrp,
        current_stock: product.current_stock,
        low_stock_threshold: product.low_stock_threshold,
        last_supplier_name: product.last_supplier_name,
        supplier_phone: product.supplier_phone || null,
        wholesaler_id: product.wholesaler_id || null,
        image_url: product.image_url || null,
        expiry_date: product.expiry_date || null,
        is_quick_tap: product.is_quick_tap,
        updated_at: product.updated_at || new Date().toISOString(),
      };
      if (userId) payload.user_id = userId;

      const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });
      if (error) {
        if (error.message.includes('marathi_name') || error.message.includes('search_keywords') || error.message.includes('image_url') || error.message.includes('wholesaler_id')) {
          const fallbackPayload = { ...payload };
          delete fallbackPayload.marathi_name;
          delete fallbackPayload.search_keywords;
          await supabase.from('products').upsert(fallbackPayload, { onConflict: 'id' });
        } else {
          console.warn('Sync product to Supabase returned error:', error.message);
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
    if (!supabase) return;
    try {
      const userId = await this.getUserId();
      const payload: Record<string, unknown> = {
        id: wholesaler.id,
        shop_id: wholesaler.shop_id || 'current_shop',
        name: wholesaler.name,
        agency_or_brand: wholesaler.agency_or_brand || null,
        phone: wholesaler.phone,
        gstin: wholesaler.gstin || wholesaler.gst_number || null,
        address: wholesaler.address || wholesaler.address_city || null,
        visit_day: wholesaler.visit_day || null,
        is_active: wholesaler.is_active !== false,
        created_at: wholesaler.created_at || new Date().toISOString(),
        updated_at: wholesaler.updated_at || new Date().toISOString(),
      };
      if (userId) payload.user_id = userId;

      const { error } = await supabase.from('wholesalers').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Sync wholesaler to Supabase returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background sync wholesaler to Supabase failed (offline mode):', err);
    }
  }

  /**
   * Deletes a single wholesaler from Supabase cloud
   */
  async deleteWholesaler(wholesalerId: string): Promise<void> {
    if (!supabase) return;
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
    if (!supabase) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) {
        console.warn('Delete product from Supabase returned error:', error.message);
      }
    } catch (err) {
      console.warn('Background delete product from Supabase failed:', err);
    }
  }

  /**
   * Syncs a single customer to Supabase cloud
   */
  async syncCustomer(customer: Customer): Promise<void> {
    if (!supabase) return;
    try {
      const userId = await this.getUserId();
      const payload: Record<string, unknown> = {
        id: customer.id,
        shop_id: customer.shop_id || 'current_shop',
        name: customer.name,
        phone: customer.phone,
        address_landmark: customer.address_landmark || null,
        credit_limit: customer.credit_limit,
        current_udhari_balance: customer.current_udhari_balance,
        oldest_unpaid_date: customer.oldest_unpaid_date || null,
        last_reminder_sent_at: customer.last_reminder_sent_at || null,
        created_at: customer.created_at || new Date().toISOString(),
      };
      if (userId) payload.user_id = userId;

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
    if (!supabase) return;
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
   * Syncs completed sales invoice and associated items to Supabase cloud
   */
  async syncInvoice(invoice: SalesInvoice, items: SaleItem[]): Promise<void> {
    if (!supabase) return;
    try {
      const userId = await this.getUserId();

      const invoicePayload: Record<string, unknown> = {
        id: invoice.id,
        shop_id: invoice.shop_id || 'current_shop',
        invoice_number: invoice.invoice_number,
        customer_id: invoice.customer_id,
        subtotal_amount: invoice.subtotal_amount,
        discount_roundoff: invoice.discount_roundoff,
        grand_total: invoice.grand_total,
        total_cogs: invoice.total_cogs,
        payment_mode: invoice.payment_mode,
        amount_paid_now: invoice.amount_paid_now,
        udhari_added: invoice.udhari_added,
        status: invoice.status,
        created_at: invoice.created_at,
      };
      if (userId) invoicePayload.user_id = userId;

      const { error: invErr } = await supabase.from('sales_invoices').upsert(invoicePayload, { onConflict: 'id' });
      if (invErr) {
        console.warn('Sync sales_invoice returned error:', invErr.message);
      }

      if (items && items.length > 0) {
        const itemsPayload = items.map((item) => {
          const itemRow: Record<string, unknown> = {
            id: item.id,
            shop_id: item.shop_id || 'current_shop',
            invoice_id: item.invoice_id,
            product_id: item.product_id,
            product_name_snapshot: item.product_name_snapshot,
            qty: item.qty,
            unit_purchase_cost: item.unit_purchase_cost,
            unit_selling_price: item.unit_selling_price,
            line_total: item.line_total,
          };
          if (userId) itemRow.user_id = userId;
          return itemRow;
        });

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
    if (!supabase) return;
    try {
      const userId = await this.getUserId();
      const payload: Record<string, unknown> = {
        id: tx.id,
        shop_id: tx.shop_id || 'current_shop',
        customer_id: tx.customer_id,
        entry_type: tx.entry_type,
        amount: tx.amount,
        payment_channel: tx.payment_channel,
        invoice_id: tx.invoice_id || null,
        running_balance_after: tx.running_balance_after,
        notes: tx.notes || null,
        created_at: tx.created_at,
      };
      if (userId) payload.user_id = userId;

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
    if (!supabase) return;
    try {
      const userId = await this.getUserId();
      const payload: Record<string, unknown> = {
        id: session.id,
        shop_id: session.shop_id || 'current_shop',
        session_date: session.session_date,
        opening_cash: session.opening_cash,
        cash_sales_total: session.cash_sales_total,
        cash_udhari_recovered: session.cash_udhari_recovered,
        cash_expenses_out: session.cash_expenses_out,
        expected_closing_cash: session.expected_closing_cash,
        actual_counted_cash: session.actual_counted_cash || null,
        discrepancy: session.discrepancy || null,
      };
      if (userId) payload.user_id = userId;

      const { error } = await supabase.from('daily_galla_sessions').upsert(payload, { onConflict: 'session_date' });
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
    if (!supabase) return;
    try {
      const userId = await this.getUserId();
      const payload: Record<string, unknown> = {
        id: expense.id,
        shop_id: expense.shop_id || 'current_shop',
        category: expense.category,
        amount: expense.amount,
        paid_via: expense.paid_via,
        description: expense.description || null,
        created_at: expense.created_at,
      };
      if (userId) payload.user_id = userId;

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
    if (!supabase) return;
    try {
      const userId = await this.getUserId();
      const payload: Record<string, unknown> = {
        id: 'current_shop',
        shop_id: profile.shop_id || profile.id || 'current_shop',
        invite_code: profile.invite_code || 'KRN-4829',
        shop_name: profile.shop_name,
        owner_name: profile.owner_name,
        phone: profile.phone,
        upi_vpa: profile.upi_vpa,
        address: profile.address || '',
        gst_footer_note: profile.gst_footer_note || '',
        updated_at: new Date().toISOString(),
      };
      if (userId) payload.user_id = userId;

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
    if (!supabase) return;
    try {
      const payload: Record<string, unknown> = {
        id: storeUser.id,
        user_id: storeUser.user_id || null,
        email: storeUser.email,
        full_name: storeUser.full_name,
        phone: storeUser.phone || null,
        role: storeUser.role,
        shop_id: storeUser.shop_id || 'current_shop',
        is_active: storeUser.is_active,
        created_at: storeUser.created_at,
        updated_at: storeUser.updated_at || new Date().toISOString(),
      };

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
    if (!supabase) {
      return { success: false, pushedCount: 0, errors: ['Supabase client not configured'] };
    }

    this.setStatus({ isSyncing: true, status: 'syncing', message: 'Syncing all records to Supabase...' });

    const errors: string[] = [];
    let pushedCount = 0;

    try {
      const userId = await this.getUserId();
      const shopId = await this.getActiveShopId();
      const localProfile = await db.getShopProfile();
      const localResetEpoch = localProfile.reset_epoch || 1;

      // Multi-device watermark check: Check if a remote wipe was executed from another device
      try {
        const { data: remoteProfile } = await supabase
          .from('shop_profile')
          .select('reset_epoch')
          .eq('id', shopId)
          .maybeSingle();

        if (remoteProfile?.reset_epoch && remoteProfile.reset_epoch > localResetEpoch) {
          console.warn('Remote store wipe/reset detected from another device! Aborting local push and synchronizing fresh state.');
          await db.clearAllRecordsToEmpty();
          await db.sync_outbox.clear();
          await db.updateShopProfile({ reset_epoch: remoteProfile.reset_epoch });
          await this.pullAllFromCloud();
          this.setStatus({
            isSyncing: false,
            lastSyncedAt: new Date().toISOString(),
            status: 'synced',
            message: 'Store was reset on another device. Local cache cleared and synchronized.',
          });
          return { success: true, pushedCount: 0, errors: ['Remote reset detected; local store synchronized.'] };
        }
      } catch (checkErr) {
        console.warn('Could not check remote reset_epoch:', checkErr);
      }

      // 1. Sync Shop Profile
      try {
        const profile = await db.getShopProfile();
        if (profile) {
          const payload: Record<string, unknown> = {
            id: shopId,
            shop_name: profile.shop_name,
            owner_name: profile.owner_name,
            phone: profile.phone,
            upi_vpa: profile.upi_vpa,
            address: profile.address || '',
            gst_footer_note: profile.gst_footer_note || '',
            invite_code: profile.invite_code,
            reset_epoch: profile.reset_epoch || 1,
            last_wiped_at: profile.last_wiped_at,
            updated_at: new Date().toISOString(),
          };
          if (userId) payload.user_id = userId;
          const { error } = await supabase.from('shop_profile').upsert(payload, { onConflict: 'id' });
          if (error) throw new Error(error.message);
          pushedCount++;
        }
      } catch (e: unknown) {
        errors.push(`Shop Profile: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 2. Sync Store Users
      try {
        const users = await db.getStoreUsers();
        if (users.length > 0) {
          for (const u of users) {
            await this.syncStoreUser({ ...u, shop_id: u.shop_id || shopId });
            pushedCount++;
          }
        }
      } catch (e: unknown) {
        errors.push(`Store Users: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 3. Sync Products
      try {
        const prods = await db.products.toArray();
        if (prods.length > 0) {
          const rows = prods.map((p) => {
            const r: Record<string, unknown> = {
              id: p.id,
              shop_id: p.shop_id || shopId,
              name: p.name,
              marathi_name: p.marathi_name || null,
              search_keywords: p.search_keywords || null,
              short_code: p.short_code,
              barcode: p.barcode,
              category: p.category,
              unit_type: p.unit_type,
              purchase_price: p.purchase_price,
              selling_price: p.selling_price,
              mrp: p.mrp,
              current_stock: p.current_stock,
              low_stock_threshold: p.low_stock_threshold,
              last_supplier_name: p.last_supplier_name,
              supplier_phone: p.supplier_phone || null,
              wholesaler_id: p.wholesaler_id || null,
              image_url: p.image_url || null,
              expiry_date: p.expiry_date || null,
              is_quick_tap: p.is_quick_tap,
              updated_at: p.updated_at,
            };
            if (userId) r.user_id = userId;
            return r;
          });
          // Upsert in chunks of 50
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'id' });
            if (error) {
              if (error.message.includes('marathi_name') || error.message.includes('search_keywords')) {
                const fallbackChunk = chunk.map((row) => {
                  const copy = { ...row };
                  delete copy.marathi_name;
                  delete copy.search_keywords;
                  return copy;
                });
                const { error: retryErr } = await supabase.from('products').upsert(fallbackChunk, { onConflict: 'id' });
                if (retryErr) throw new Error(retryErr.message);
              } else {
                throw new Error(error.message);
              }
            }
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Products: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 3b. Sync Wholesalers
      try {
        const wholesalers = await db.wholesalers.toArray();
        if (wholesalers.length > 0) {
          const rows = wholesalers.map((w) => {
            const r: Record<string, unknown> = {
              id: w.id,
              shop_id: w.shop_id || shopId,
              name: w.name,
              agency_or_brand: w.agency_or_brand || null,
              phone: w.phone,
              gstin: w.gstin || w.gst_number || null,
              address: w.address || w.address_city || null,
              visit_day: w.visit_day || null,
              is_active: w.is_active !== false,
              created_at: w.created_at || new Date().toISOString(),
              updated_at: w.updated_at || new Date().toISOString(),
            };
            if (userId) r.user_id = userId;
            return r;
          });
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            const { error } = await supabase.from('wholesalers').upsert(chunk, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        console.warn('Wholesalers sync notice:', e);
      }

      // 4. Sync Customers
      try {
        const custs = await db.customers.toArray();
        if (custs.length > 0) {
          const rows = custs.map((c) => {
            const r: Record<string, unknown> = {
              id: c.id,
              shop_id: c.shop_id || shopId,
              name: c.name,
              phone: c.phone,
              address_landmark: c.address_landmark || null,
              credit_limit: c.credit_limit,
              current_udhari_balance: c.current_udhari_balance,
              oldest_unpaid_date: c.oldest_unpaid_date || null,
              last_reminder_sent_at: c.last_reminder_sent_at || null,
              created_at: c.created_at,
            };
            if (userId) r.user_id = userId;
            return r;
          });
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

      // 5. Sync Sales Invoices
      try {
        const invoices = await db.sales_invoices.toArray();
        if (invoices.length > 0) {
          const rows = invoices.map((inv) => {
            const r: Record<string, unknown> = {
              id: inv.id,
              shop_id: inv.shop_id || shopId,
              invoice_number: inv.invoice_number,
              customer_id: inv.customer_id,
              subtotal_amount: inv.subtotal_amount,
              discount_roundoff: inv.discount_roundoff,
              grand_total: inv.grand_total,
              total_cogs: inv.total_cogs,
              payment_mode: inv.payment_mode,
              amount_paid_now: inv.amount_paid_now,
              udhari_added: inv.udhari_added,
              status: inv.status,
              created_at: inv.created_at,
            };
            if (userId) r.user_id = userId;
            return r;
          });
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

      // 6. Sync Khata Transactions
      try {
        const txs = await db.khata_transactions.toArray();
        if (txs.length > 0) {
          const rows = txs.map((t) => {
            const r: Record<string, unknown> = {
              id: t.id,
              shop_id: t.shop_id || shopId,
              customer_id: t.customer_id,
              entry_type: t.entry_type,
              amount: t.amount,
              payment_channel: t.payment_channel,
              invoice_id: t.invoice_id || null,
              running_balance_after: t.running_balance_after,
              notes: t.notes || null,
              created_at: t.created_at,
            };
            if (userId) r.user_id = userId;
            return r;
          });
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

      // 7. Sync Galla Sessions
      try {
        const sessions = await db.daily_galla_sessions.toArray();
        if (sessions.length > 0) {
          for (const s of sessions) {
            await this.syncGallaSession({ ...s, shop_id: s.shop_id || shopId });
            pushedCount++;
          }
        }
      } catch (e: unknown) {
        errors.push(`Galla Sessions: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 8. Sync Expenses
      try {
        const expenses = await db.expenses_and_drawings.toArray();
        if (expenses.length > 0) {
          for (const exp of expenses) {
            await this.syncExpense({ ...exp, shop_id: exp.shop_id || shopId });
            pushedCount++;
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
    if (!supabase) {
      return { success: false, pulledCount: 0, errors: ['Supabase client not configured'] };
    }

    this.setStatus({ isSyncing: true, status: 'syncing', message: 'Pulling cloud data from Supabase...' });

    let pulledCount = 0;
    const errors: string[] = [];

    try {
      const shopId = await this.getActiveShopId();
      const localProfile = await db.getShopProfile();
      const localResetEpoch = localProfile.reset_epoch || 1;

      // 1. Pull Shop Profile strictly for active shop_id
      try {
        const { data: profile, error } = await supabase
          .from('shop_profile')
          .select('*')
          .eq('id', shopId)
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (profile) {
          // Check remote reset_epoch
          if (profile.reset_epoch && profile.reset_epoch > localResetEpoch) {
            console.log('Remote store wipe detected in pull. Purging local stale operational data.');
            await db.clearAllRecordsToEmpty();
            await db.sync_outbox.clear();
          }

          await db.updateShopProfile({
            id: profile.id,
            shop_id: profile.id,
            shop_name: profile.shop_name,
            owner_name: profile.owner_name,
            phone: profile.phone,
            upi_vpa: profile.upi_vpa || 'kirana@upi',
            address: profile.address || '',
            gst_footer_note: profile.gst_footer_note || '',
            invite_code: profile.invite_code,
            reset_epoch: profile.reset_epoch || 1,
            last_wiped_at: profile.last_wiped_at,
          });
          pulledCount++;
        }
      } catch (e) {
        console.warn('Pull shop_profile failed:', e);
      }

      // 2. Pull Products strictly scoped by shop_id
      try {
        const { data: prods, error } = await supabase
          .from('products')
          .select('*')
          .eq('shop_id', shopId);

        if (error) throw new Error(error.message);
        if (prods && prods.length > 0) {
          for (const p of prods) {
            const productRecord: Product = {
              id: p.id,
              shop_id: p.shop_id || shopId,
              name: p.name,
              short_code: p.short_code,
              barcode: p.barcode || '',
              category: p.category || 'General',
              unit_type: p.unit_type,
              purchase_price: Number(p.purchase_price) || 0,
              selling_price: Number(p.selling_price) || 0,
              mrp: Number(p.mrp) || Number(p.selling_price) || 0,
              current_stock: Number(p.current_stock) || 0,
              low_stock_threshold: Number(p.low_stock_threshold) || 5,
              last_supplier_name: p.last_supplier_name || 'General Wholesaler',
              supplier_phone: p.supplier_phone || undefined,
              wholesaler_id: p.wholesaler_id || null,
              image_url: p.image_url || null,
              expiry_date: p.expiry_date || null,
              is_quick_tap: Boolean(p.is_quick_tap),
              updated_at: p.updated_at || new Date().toISOString(),
            };
            await db.products.put(productRecord);
            pulledCount++;
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
          .eq('shop_id', shopId);

        if (!error && wholesalers && wholesalers.length > 0) {
          for (const w of wholesalers) {
            const wsRecord: Wholesaler = {
              id: w.id,
              shop_id: w.shop_id || shopId,
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
            await db.wholesalers.put(wsRecord);
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
          .eq('shop_id', shopId);

        if (error) throw new Error(error.message);
        if (custs && custs.length > 0) {
          for (const c of custs) {
            const customerRecord: Customer = {
              id: c.id,
              shop_id: c.shop_id || shopId,
              name: c.name,
              phone: c.phone,
              address_landmark: c.address_landmark || null,
              credit_limit: Number(c.credit_limit) || 2000,
              current_udhari_balance: Number(c.current_udhari_balance) || 0,
              oldest_unpaid_date: c.oldest_unpaid_date || null,
              last_reminder_sent_at: c.last_reminder_sent_at || null,
              created_at: c.created_at || new Date().toISOString(),
            };
            await db.customers.put(customerRecord);
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
          .eq('shop_id', shopId);

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
          .eq('shop_id', shopId);

        if (error) throw new Error(error.message);
        if (logs && logs.length > 0) {
          for (const l of logs) {
            await db.inventory_logs.put({
              id: l.id,
              shop_id: l.shop_id || shopId,
              product_id: l.product_id,
              change_qty: Number(l.change_qty) || 0,
              reason_type: l.reason_type,
              unit_cost_at_time: Number(l.unit_cost_at_time) || 0,
              reference_id: l.reference_id || null,
              notes: l.notes || '',
              created_at: l.created_at || new Date().toISOString(),
            });
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
          .eq('shop_id', shopId);

        if (error) throw new Error(error.message);
        if (txs && txs.length > 0) {
          for (const t of txs) {
            await db.khata_transactions.put({
              id: t.id,
              shop_id: t.shop_id || shopId,
              customer_id: t.customer_id,
              entry_type: t.entry_type,
              amount: Number(t.amount) || 0,
              payment_channel: t.payment_channel,
              invoice_id: t.invoice_id || null,
              running_balance_after: Number(t.running_balance_after) || 0,
              notes: t.notes || '',
              created_at: t.created_at || new Date().toISOString(),
            });
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
          .eq('shop_id', shopId);

        if (error) throw new Error(error.message);
        if (invoices && invoices.length > 0) {
          for (const inv of invoices) {
            await db.sales_invoices.put({
              id: inv.id,
              shop_id: inv.shop_id || shopId,
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
              created_at: inv.created_at || new Date().toISOString(),
            });
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
          .eq('shop_id', shopId);

        if (error) throw new Error(error.message);
        if (saleItems && saleItems.length > 0) {
          for (const item of saleItems) {
            await db.sale_items.put({
              id: item.id,
              shop_id: item.shop_id || shopId,
              invoice_id: item.invoice_id,
              product_id: item.product_id,
              product_name_snapshot: item.product_name_snapshot,
              qty: Number(item.qty) || 0,
              unit_selling_price: Number(item.unit_selling_price) || 0,
              unit_purchase_cost: Number(item.unit_purchase_cost || (item as any).unit_cost_price) || 0,
              line_total: Number(item.line_total) || 0,
            });
            pulledCount++;
          }
        }
      } catch (e) {
        console.warn('Pull sale items failed:', e);
      }

      // 9. ACID Reconciliation: Recompute stock & udhari deterministically from deltas
      await db.reconcileAllStockAndBalances();

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
   * Outbox Processor: Sequentially flushes pending local mutations to Supabase cloud
   */
  async flushOutbox(): Promise<{ processedCount: number; errors: string[] }> {
    if (!supabase) {
      return { processedCount: 0, errors: ['Supabase client not configured'] };
    }

    const pendingItems = await db.sync_outbox
      .where('status')
      .equals('PENDING')
      .sortBy('created_at');

    if (pendingItems.length === 0) {
      return { processedCount: 0, errors: [] };
    }

    let processedCount = 0;
    const errors: string[] = [];

    for (const item of pendingItems) {
      try {
        if (item.operation === 'INSERT' || item.operation === 'UPDATE') {
          const { error } = await supabase.from(item.table_name).upsert(item.payload, { onConflict: 'id' });
          if (error) throw new Error(error.message);
        } else if (item.operation === 'DELETE') {
          const targetId = item.payload.id as string;
          if (targetId) {
            const { error } = await supabase.from(item.table_name).delete().eq('id', targetId);
            if (error) throw new Error(error.message);
          }
        }

        // Mark as SYNCED
        await db.sync_outbox.update(item.id, {
          status: 'SYNCED',
          error_message: null,
        });
        processedCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Table ${item.table_name} (${item.id}): ${msg}`);
        const nextRetries = (item.retry_count || 0) + 1;
        await db.sync_outbox.update(item.id, {
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
