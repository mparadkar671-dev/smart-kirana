import { db } from '../db/db';
import { supabase } from '../lib/supabase';
import { AppNotification, NotificationCategory, NotificationType, StoreUser } from '../types';
import { playNotificationChime } from '../utils/sound';

type NotificationListener = (notifications: AppNotification[]) => void;

interface StoredNotifState {
  readIds: string[];
  dismissedIds: string[];
  customNotifications: AppNotification[];
}

const STORAGE_KEY = 'smart_kirana_notifications_state';

class NotificationService {
  private listeners: Set<NotificationListener> = new Set();
  private cache: AppNotification[] = [];
  private isScanning = false;
  private scanTimer: any = null;

  constructor() {
    this.init();
  }

  private init() {
    // Initial scan after database opens
    setTimeout(() => {
      this.refreshNotifications();
    }, 1500);

    // Periodic check every 45 seconds
    if (typeof window !== 'undefined') {
      this.scanTimer = setInterval(() => {
        this.refreshNotifications();
      }, 45000);
    }
  }

  private getStoredState(): StoredNotifState {
    if (typeof localStorage === 'undefined') {
      return { readIds: [], dismissedIds: [], customNotifications: [] };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { readIds: [], dismissedIds: [], customNotifications: [] };
      return JSON.parse(raw);
    } catch {
      return { readIds: [], dismissedIds: [], customNotifications: [] };
    }
  }

  private saveStoredState(state: StoredNotifState) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or restricted
    }
  }

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    listener(this.cache);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.cache);
    }
  }

  /**
   * Scans local and cloud database for store-wide alerts
   */
  public async refreshNotifications(): Promise<AppNotification[]> {
    if (this.isScanning) return this.cache;
    this.isScanning = true;

    try {
      const state = this.getStoredState();
      const readSet = new Set(state.readIds);
      const dismissedSet = new Set(state.dismissedIds);

      const generated: AppNotification[] = [];
      const now = new Date();

      // 1. SCAN INVENTORY (Low stock & Out of stock & Expiry)
      try {
        const products = await db.products.toArray();
        for (const p of products) {
          if (p.current_stock <= 0) {
            const notifId = `out-stock-${p.id}`;
            if (!dismissedSet.has(notifId)) {
              generated.push({
                id: notifId,
                type: 'OUT_OF_STOCK',
                title: `🚨 Out of Stock: ${p.name}`,
                message: `Current stock is 0 ${p.unit_type}. Customer bills for this item cannot be fulfilled.`,
                timestamp: p.updated_at || now.toISOString(),
                isRead: readSet.has(notifId),
                priority: 'critical',
                category: 'inventory',
                actionLabel: 'Restock Product',
                actionType: 'GO_TO_INVENTORY',
                actionData: { productId: p.id, productName: p.name },
              });
            }
          } else if (p.current_stock <= p.low_stock_threshold) {
            const notifId = `low-stock-${p.id}`;
            if (!dismissedSet.has(notifId)) {
              generated.push({
                id: notifId,
                type: 'LOW_STOCK',
                title: `⚠️ Low Stock Alert: ${p.name}`,
                message: `Only ${p.current_stock} ${p.unit_type} remaining (Minimum threshold is ${p.low_stock_threshold}).`,
                timestamp: p.updated_at || now.toISOString(),
                isRead: readSet.has(notifId),
                priority: 'high',
                category: 'inventory',
                actionLabel: 'Order Restock',
                actionType: 'GO_TO_INVENTORY',
                actionData: { productId: p.id, productName: p.name },
              });
            }
          }

          // Expiry check (next 7 days)
          if (p.expiry_date) {
            const expDate = new Date(p.expiry_date);
            const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) {
              const notifId = `expiry-${p.id}`;
              if (!dismissedSet.has(notifId)) {
                generated.push({
                  id: notifId,
                  type: 'EXPIRY_ALERT',
                  title: diffDays <= 0 ? `⛔ Expired Item: ${p.name}` : `⏳ Expiring Soon: ${p.name}`,
                  message:
                    diffDays <= 0
                      ? `Expired on ${p.expiry_date}! Remove from shelf immediately to protect customer trust.`
                      : `Expires in ${diffDays} day(s) on ${p.expiry_date}. Put on clearance discount.`,
                  timestamp: now.toISOString(),
                  isRead: readSet.has(notifId),
                  priority: diffDays <= 0 ? 'critical' : 'normal',
                  category: 'inventory',
                  actionLabel: 'Inspect Stock',
                  actionType: 'GO_TO_INVENTORY',
                  actionData: { productId: p.id },
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('Inventory alert scan error:', err);
      }

      // 2. SCAN KHATA / UDHARI (Overdue & Credit limits)
      try {
        const customers = await db.customers.toArray();
        for (const c of customers) {
          if (c.id === '0000-WALK-IN') continue;

          // Credit limit breach
          if (c.credit_limit > 0 && c.current_udhari_balance > c.credit_limit) {
            const notifId = `credit-limit-${c.id}`;
            if (!dismissedSet.has(notifId)) {
              generated.push({
                id: notifId,
                type: 'CREDIT_LIMIT_EXCEEDED',
                title: `⚠️ Credit Limit Exceeded: ${c.name}`,
                message: `Current udhar is ₹${c.current_udhari_balance.toFixed(2)}, which exceeds their agreed limit of ₹${c.credit_limit.toFixed(2)}.`,
                timestamp: now.toISOString(),
                isRead: readSet.has(notifId),
                priority: 'high',
                category: 'khata',
                actionLabel: 'View Khata Ledger',
                actionType: 'GO_TO_KHATA',
                actionData: { customerId: c.id, phone: c.phone },
              });
            }
          }

          // 30+ days overdue
          if (c.oldest_unpaid_date && c.current_udhari_balance > 0) {
            const unpaidDate = new Date(c.oldest_unpaid_date);
            const ageDays = Math.floor((now.getTime() - unpaidDate.getTime()) / (1000 * 60 * 60 * 24));
            if (ageDays >= 30) {
              const notifId = `overdue-${c.id}`;
              if (!dismissedSet.has(notifId)) {
                generated.push({
                  id: notifId,
                  type: 'KHATA_OVERDUE',
                  title: `🚨 Udhar Overdue (${ageDays} Days): ${c.name}`,
                  message: `Unpaid balance of ₹${c.current_udhari_balance.toFixed(2)} has been pending since ${unpaidDate.toLocaleDateString()}. Send WhatsApp payment reminder.`,
                  timestamp: now.toISOString(),
                  isRead: readSet.has(notifId),
                  priority: 'critical',
                  category: 'khata',
                  actionLabel: 'Send WhatsApp Reminder',
                  actionType: 'GO_TO_KHATA',
                  actionData: { customerId: c.id, phone: c.phone, balance: c.current_udhari_balance },
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('Khata alert scan error:', err);
      }

      // 3. SCAN STORE USERS & PENDING STAFF APPROVALS
      try {
        let storeUsers = await db.getStoreUsers();

        // Also check Supabase store_users if connected
        if (supabase) {
          try {
            const { data: cloudUsers } = await supabase.from('store_users').select('*');
            if (cloudUsers && cloudUsers.length > 0) {
              for (const cu of cloudUsers) {
                await db.saveStoreUser({
                  id: cu.id,
                  user_id: cu.user_id,
                  email: cu.email,
                  full_name: cu.full_name,
                  phone: cu.phone,
                  role: cu.role,
                  shop_id: cu.shop_id || 'current_shop',
                  is_active: cu.is_active ?? true,
                  approval_status: cu.is_active ? 'APPROVED' : 'PENDING',
                  created_at: cu.created_at || now.toISOString(),
                  updated_at: cu.updated_at,
                });
              }
              storeUsers = await db.getStoreUsers();
            }
          } catch {
            // Offline fallback
          }
        }

        for (const u of storeUsers) {
          if (u.is_active === false || u.approval_status === 'PENDING') {
            const notifId = `staff-req-${u.id}`;
            if (!dismissedSet.has(notifId)) {
              generated.push({
                id: notifId,
                type: 'STAFF_REQUEST',
                title: `👤 Staff Join Request: ${u.full_name || u.email}`,
                message: `Requested access as ${u.role} (${u.email}${u.phone ? ` • ${u.phone}` : ''}). Please review and approve permissions.`,
                timestamp: u.created_at || now.toISOString(),
                isRead: readSet.has(notifId),
                priority: 'high',
                category: 'staff',
                actionLabel: 'Approve Staff Access',
                actionType: 'APPROVE_STAFF',
                actionData: { userId: u.id, email: u.email, role: u.role, name: u.full_name },
              });
            }
          }
        }
      } catch (err) {
        console.warn('Store user alert scan error:', err);
      }

      // 4. SCAN GALLA SESSIONS (Cash discrepancies)
      try {
        const todayStr = now.toISOString().split('T')[0];
        const todaySession = await db.daily_galla_sessions.where('session_date').equals(todayStr).first();
        if (todaySession && todaySession.discrepancy && Math.abs(todaySession.discrepancy) > 10) {
          const notifId = `galla-disc-${todaySession.id}`;
          if (!dismissedSet.has(notifId)) {
            generated.push({
              id: notifId,
              type: 'GALLA_DISCREPANCY',
              title: `💰 Galla Cash Discrepancy: ₹${Math.abs(todaySession.discrepancy).toFixed(2)}`,
              message:
                todaySession.discrepancy < 0
                  ? `Counter cash is ₹${Math.abs(todaySession.discrepancy).toFixed(2)} SHORT compared to recorded sales & expenses.`
                  : `Counter cash has ₹${todaySession.discrepancy.toFixed(2)} SURPLUS over recorded sales.`,
              timestamp: now.toISOString(),
              isRead: readSet.has(notifId),
              priority: 'high',
              category: 'galla',
              actionLabel: 'Review Galla Sheet',
              actionType: 'GO_TO_GALLA',
              actionData: { sessionId: todaySession.id },
            });
          }
        }
      } catch (err) {
        console.warn('Galla alert scan error:', err);
      }

      // Merge with custom notifications (e.g. cloud sync notices)
      const allNotifs = [...generated, ...state.customNotifications.filter((n) => !dismissedSet.has(n.id))];

      // Sort by priority and timestamp
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      allNotifs.sort((a, b) => {
        const prioDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (prioDiff !== 0) return prioDiff;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      // If new critical alerts appeared, chime
      const prevUnreadCount = this.cache.filter((n) => !n.isRead).length;
      const newUnreadCount = allNotifs.filter((n) => !n.isRead).length;
      if (newUnreadCount > prevUnreadCount && this.cache.length > 0) {
        playNotificationChime();
      }

      this.cache = allNotifs;
      this.notify();
      return allNotifs;
    } finally {
      this.isScanning = false;
    }
  }

  public getNotifications(): AppNotification[] {
    return this.cache;
  }

  public getUnreadCount(): number {
    return this.cache.filter((n) => !n.isRead).length;
  }

  public markAsRead(id: string) {
    const state = this.getStoredState();
    if (!state.readIds.includes(id)) {
      state.readIds.push(id);
      this.saveStoredState(state);
    }
    this.cache = this.cache.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    this.notify();
  }

  public markAllAsRead() {
    const state = this.getStoredState();
    const allIds = this.cache.map((n) => n.id);
    state.readIds = Array.from(new Set([...state.readIds, ...allIds]));
    this.saveStoredState(state);

    this.cache = this.cache.map((n) => ({ ...n, isRead: true }));
    this.notify();
  }

  public dismiss(id: string) {
    const state = this.getStoredState();
    if (!state.dismissedIds.includes(id)) {
      state.dismissedIds.push(id);
    }
    state.customNotifications = state.customNotifications.filter((n) => n.id !== id);
    this.saveStoredState(state);

    this.cache = this.cache.filter((n) => n.id !== id);
    this.notify();
  }

  public clearAll() {
    const state = this.getStoredState();
    const allIds = this.cache.map((n) => n.id);
    state.dismissedIds = Array.from(new Set([...state.dismissedIds, ...allIds]));
    state.customNotifications = [];
    this.saveStoredState(state);

    this.cache = [];
    this.notify();
  }

  /**
   * One-click staff member approval
   */
  public async approveStaffMember(userRecordId: string, email?: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await db.store_users.get(userRecordId);
      if (!user && email) {
        const byEmail = await db.getStoreUserByEmail(email);
        if (byEmail) {
          userRecordId = byEmail.id;
        }
      }

      const existing = await db.store_users.get(userRecordId);
      if (!existing) {
        return { success: false, message: 'Store staff record not found.' };
      }

      existing.is_active = true;
      existing.approval_status = 'APPROVED';
      existing.updated_at = new Date().toISOString();
      await db.saveStoreUser(existing);

      // Sync approval to Supabase
      if (supabase) {
        try {
          await supabase.from('store_users').upsert({
            id: existing.id,
            user_id: existing.user_id,
            email: existing.email,
            full_name: existing.full_name,
            phone: existing.phone,
            role: existing.role,
            shop_id: existing.shop_id,
            is_active: true,
            updated_at: existing.updated_at,
          });
        } catch (err) {
          console.warn('Could not sync staff approval to cloud:', err);
        }
      }

      this.dismiss(`staff-req-${existing.id}`);
      this.pushNotification({
        id: `approved-staff-${existing.id}`,
        type: 'STAFF_APPROVED',
        title: `✅ Staff Access Granted: ${existing.full_name}`,
        message: `${existing.full_name} (${existing.role}) has been activated with full module permissions.`,
        timestamp: new Date().toISOString(),
        isRead: false,
        priority: 'normal',
        category: 'staff',
        actionLabel: 'Manage Staff',
        actionType: 'GO_TO_SETTINGS',
      });

      return { success: true, message: `Access granted! ${existing.full_name} is now active.` };
    } catch (err) {
      return { success: false, message: 'Failed to approve staff: ' + (err instanceof Error ? err.message : String(err)) };
    }
  }

  /**
   * Reject / Remove pending staff request
   */
  public async rejectStaffMember(userRecordId: string): Promise<{ success: boolean; message: string }> {
    try {
      await db.store_users.delete(userRecordId);
      if (supabase) {
        try {
          await supabase.from('store_users').delete().eq('id', userRecordId);
        } catch {
          // Ignore
        }
      }
      this.dismiss(`staff-req-${userRecordId}`);
      return { success: true, message: 'Staff request removed.' };
    } catch (err) {
      return { success: false, message: 'Failed to reject: ' + (err instanceof Error ? err.message : String(err)) };
    }
  }

  /**
   * Push an instant notification from any module
   */
  public pushNotification(notif: AppNotification) {
    const state = this.getStoredState();
    state.customNotifications.unshift(notif);
    if (state.customNotifications.length > 50) {
      state.customNotifications = state.customNotifications.slice(0, 50);
    }
    this.saveStoredState(state);

    this.cache.unshift(notif);
    playNotificationChime();
    this.notify();
  }
}

export const notificationService = new NotificationService();

