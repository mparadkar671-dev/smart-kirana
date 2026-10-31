import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/db';
import { notificationService } from '../services/notificationService';
import { authService } from '../services/authService';
import { StoreUser, Product, Customer } from '../types';

describe('Store Staff Approval & Notification Center Suite', () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.customers.clear();
    await db.store_users.clear();
    notificationService.clearAll();
  });

  it('fetches registered shops including local shop profile', async () => {
    await db.updateShopProfile({
      shop_name: 'Laxi Vatsalaya store',
      owner_name: 'Mayuresh paradkar',
      phone: '9405048317',
    });

    const shops = await authService.getAvailableShops();
    expect(shops.length).toBeGreaterThan(0);
    const found = shops.find((s) => s.shop_name === 'Laxi Vatsalaya store');
    expect(found).toBeDefined();
    expect(found?.owner_name).toBe('Mayuresh paradkar');
  });

  it('generates a notification when product stock reaches or falls below threshold', async () => {
    const testProduct: Product = {
      id: 'prod-test-sugar',
      name: 'Madhur Pure Sugar Loose',
      short_code: 'SUG',
      barcode: '890123450001',
      category: 'Grains & Staples',
      unit_type: 'KG_LOOSE',
      purchase_price: 38.0,
      selling_price: 44.0,
      mrp: 48.0,
      current_stock: 2.0, // <= threshold 5.0
      low_stock_threshold: 5.0,
      last_supplier_name: 'APMC Market',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    await db.products.add(testProduct);

    const notifs = await notificationService.refreshNotifications();
    const lowStockAlert = notifs.find((n) => n.type === 'LOW_STOCK');
    expect(lowStockAlert).toBeDefined();
    expect(lowStockAlert?.title).toContain('Madhur Pure Sugar Loose');
    expect(lowStockAlert?.category).toBe('inventory');
    expect(lowStockAlert?.priority).toBe('high');
  });

  it('generates an overdue alert when customer credit is older than 30 days', async () => {
    const overdueCustomer: Customer = {
      id: 'cust-overdue-test',
      name: 'Ramesh Gupta',
      phone: '9820011223',
      credit_limit: 2000,
      current_udhari_balance: 1500,
      oldest_unpaid_date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago
      created_at: new Date().toISOString(),
    };
    await db.customers.add(overdueCustomer);

    const notifs = await notificationService.refreshNotifications();
    const overdueAlert = notifs.find((n) => n.type === 'KHATA_OVERDUE');
    expect(overdueAlert).toBeDefined();
    expect(overdueAlert?.title).toContain('Ramesh Gupta');
    expect(overdueAlert?.priority).toBe('critical');
  });

  it('generates staff access request alert and allows one-click approval', async () => {
    const pendingStaff: StoreUser = {
      id: 'usr-pending-amit',
      email: 'amit.cashier@kirana.com',
      full_name: 'Amit Verma',
      phone: '9811223344',
      role: 'CASHIER',
      shop_id: 'current_shop',
      is_active: false,
      approval_status: 'PENDING',
      created_at: new Date().toISOString(),
    };
    await db.saveStoreUser(pendingStaff);

    const notifs = await notificationService.refreshNotifications();
    const staffRequest = notifs.find((n) => n.type === 'STAFF_REQUEST');
    expect(staffRequest).toBeDefined();
    expect(staffRequest?.title).toContain('Amit Verma');

    // Test One-Click Approval
    const approveResult = await notificationService.approveStaffMember('usr-pending-amit');
    expect(approveResult.success).toBe(true);

    const updatedUser = await db.store_users.get('usr-pending-amit');
    expect(updatedUser?.is_active).toBe(true);
    expect(updatedUser?.approval_status).toBe('APPROVED');
  });
});
