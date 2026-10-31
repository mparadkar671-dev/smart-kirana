import { supabase } from '../lib/supabase';
import { db } from '../db/db';
import {
  Product,
  Customer,
  SalesInvoice,
  SaleItem,
  KhataTransaction,
  DailyGallaSession,
  ExpenseAndDrawing,
  ShopProfile,
  StoreUser,
} from '../types';
import { DEFAULT_SHOP_PROFILE } from '../db/seed';

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
   * Syncs a single product to Supabase cloud
   */
  async syncProduct(product: Product): Promise<void> {
    if (!supabase) return;
    try {
      const userId = await this.getUserId();
      const payload: Record<string, unknown> = {
        id: product.id,
        name: product.name,
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
        expiry_date: product.expiry_date || null,
        is_quick_tap: product.is_quick_tap,
        updated_at: product.updated_at || new Date().toISOString(),
      };
      if (userId) payload.user_id = userId;

      await supabase.from('products').upsert(payload, { onConflict: 'id' });
    } catch (err) {
      console.warn('Background sync product to Supabase failed (offline mode):', err);
    }
  }

  /**
   * Deletes a single product from Supabase cloud
   */
  async deleteProduct(productId: string): Promise<void> {
    if (!supabase) return;
    try {
      await supabase.from('products').delete().eq('id', productId);
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

      await supabase.from('customers').upsert(payload, { onConflict: 'id' });
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
      await supabase.from('customers').delete().eq('id', customerId);
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

      await supabase.from('sales_invoices').upsert(invoicePayload, { onConflict: 'id' });

      if (items && items.length > 0) {
        const itemsPayload = items.map((item) => {
          const itemRow: Record<string, unknown> = {
            id: item.id,
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

        await supabase.from('sale_items').upsert(itemsPayload, { onConflict: 'id' });
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

      await supabase.from('khata_transactions').upsert(payload, { onConflict: 'id' });
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

      await supabase.from('daily_galla_sessions').upsert(payload, { onConflict: 'session_date' });
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
        category: expense.category,
        amount: expense.amount,
        paid_via: expense.paid_via,
        description: expense.description || null,
        created_at: expense.created_at,
      };
      if (userId) payload.user_id = userId;

      await supabase.from('expenses_and_drawings').upsert(payload, { onConflict: 'id' });
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
        shop_name: profile.shop_name,
        owner_name: profile.owner_name,
        phone: profile.phone,
        upi_vpa: profile.upi_vpa,
        address: profile.address || '',
        gst_footer_note: profile.gst_footer_note || '',
        updated_at: new Date().toISOString(),
      };
      if (userId) payload.user_id = userId;

      await supabase.from('shop_profile').upsert(payload, { onConflict: 'id' });
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

      await supabase.from('store_users').upsert(payload, { onConflict: 'id' });
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

      // 1. Sync Shop Profile
      try {
        const profile = await db.getShopProfile();
        if (profile) {
          const payload: Record<string, unknown> = {
            id: 'current_shop',
            shop_name: profile.shop_name,
            owner_name: profile.owner_name,
            phone: profile.phone,
            upi_vpa: profile.upi_vpa,
            address: profile.address || '',
            gst_footer_note: profile.gst_footer_note || '',
            updated_at: new Date().toISOString(),
          };
          if (userId) payload.user_id = userId;
          await supabase.from('shop_profile').upsert(payload, { onConflict: 'id' });
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
            await this.syncStoreUser(u);
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
              name: p.name,
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
            await supabase.from('products').upsert(chunk, { onConflict: 'id' });
            pushedCount += chunk.length;
          }
        }
      } catch (e: unknown) {
        errors.push(`Products: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 4. Sync Customers
      try {
        const custs = await db.customers.toArray();
        if (custs.length > 0) {
          const rows = custs.map((c) => {
            const r: Record<string, unknown> = {
              id: c.id,
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
            await supabase.from('customers').upsert(chunk, { onConflict: 'id' });
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
            await supabase.from('sales_invoices').upsert(chunk, { onConflict: 'id' });
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
            await supabase.from('khata_transactions').upsert(chunk, { onConflict: 'id' });
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
            await this.syncGallaSession(s);
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
            await this.syncExpense(exp);
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
          ? `Synced ${pushedCount} items with warnings: ${errors[0]}`
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
   * Pull all records from Supabase into local Dexie database
   */
  async pullAllFromCloud(): Promise<{ success: boolean; pulledCount: number; errors: string[] }> {
    if (!supabase) {
      return { success: false, pulledCount: 0, errors: ['Supabase client not configured'] };
    }

    this.setStatus({ isSyncing: true, status: 'syncing', message: 'Pulling cloud data from Supabase...' });

    let pulledCount = 0;
    const errors: string[] = [];

    try {
      // 1. Pull Shop Profile
      try {
        const { data: profile } = await supabase.from('shop_profile').select('*').maybeSingle();
        if (profile) {
          await db.updateShopProfile({
            shop_name: profile.shop_name,
            owner_name: profile.owner_name,
            phone: profile.phone,
            upi_vpa: profile.upi_vpa || 'kirana@upi',
            address: profile.address || '',
            gst_footer_note: profile.gst_footer_note || '',
          });
          pulledCount++;
        }
      } catch (e) {
        console.warn('Pull shop_profile failed:', e);
      }

      // 2. Pull Products
      try {
        const { data: prods } = await supabase.from('products').select('*');
        if (prods && prods.length > 0) {
          for (const p of prods) {
            const productRecord: Product = {
              id: p.id,
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

      // 3. Pull Customers
      try {
        const { data: custs } = await supabase.from('customers').select('*');
        if (custs && custs.length > 0) {
          for (const c of custs) {
            const customerRecord: Customer = {
              id: c.id,
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

      // 4. Pull Store Users
      try {
        const { data: users } = await supabase.from('store_users').select('*');
        if (users && users.length > 0) {
          for (const u of users) {
            const userRecord: StoreUser = {
              id: u.id,
              user_id: u.user_id || undefined,
              email: u.email,
              full_name: u.full_name,
              phone: u.phone || undefined,
              role: u.role,
              shop_id: u.shop_id || 'current_shop',
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

      const now = new Date().toISOString();
      this.setStatus({
        isSyncing: false,
        lastSyncedAt: now,
        status: 'synced',
        message: `Cloud sync complete! Pulled ${pulledCount} items from Supabase.`,
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
}

export const cloudSyncService = new CloudSyncService();
