import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { StoreUser, UserRole } from '../types';
import { validatePasswordStrength, authService } from '../services/authService';
import { cloudSyncService } from '../services/cloudSyncService';
import { BackupService } from '../services/backupService';

describe('Role-Based Access Control & Cloud Sync Verification', () => {
  beforeEach(async () => {
    await db.store_users.clear();
    await db.products.clear();
    await db.customers.clear();
  });

  it('stores and retrieves store users with respective roles (OWNER, MANAGER, ACCOUNTANT, CASHIER)', async () => {
    const owner: StoreUser = {
      id: 'usr-1',
      email: 'owner@kirana.com',
      full_name: 'Rajesh Patel',
      role: 'OWNER',
      shop_id: 'current_shop',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const manager: StoreUser = {
      id: 'usr-2',
      email: 'manager@kirana.com',
      full_name: 'Amit Sharma',
      role: 'MANAGER',
      shop_id: 'current_shop',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const accountant: StoreUser = {
      id: 'usr-3',
      email: 'ca@kirana.com',
      full_name: 'CA Sunil Verma',
      role: 'ACCOUNTANT',
      shop_id: 'current_shop',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const cashier: StoreUser = {
      id: 'usr-4',
      email: 'counter@kirana.com',
      full_name: 'Rohan Gupta',
      role: 'CASHIER',
      shop_id: 'current_shop',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    await db.saveStoreUser(owner);
    await db.saveStoreUser(manager);
    await db.saveStoreUser(accountant);
    await db.saveStoreUser(cashier);

    const allUsers = await db.getStoreUsers();
    expect(allUsers.length).toBe(4);

    const foundOwner = await db.getStoreUserByEmail('owner@kirana.com');
    expect(foundOwner).toBeDefined();
    expect(foundOwner?.role).toBe('OWNER');

    const foundCashier = await db.getStoreUserByEmail('counter@kirana.com');
    expect(foundCashier).toBeDefined();
    expect(foundCashier?.role).toBe('CASHIER');

    const role = await authService.getUserRole(undefined, 'ca@kirana.com');
    expect(role).toBe('ACCOUNTANT');
  });

  it('validates password strength rules according to enterprise retail standards', () => {
    // Too weak
    const weak = validatePasswordStrength('12345');
    expect(weak.isValid).toBe(false);
    expect(weak.label).toBe('Too Weak');

    // Missing uppercase and symbol
    const medium = validatePasswordStrength('password123');
    expect(medium.isValid).toBe(false);
    expect(medium.hasUppercase).toBe(false);

    // Strong compliant password
    const strong = validatePasswordStrength('Kirana@2026!');
    expect(strong.isValid).toBe(true);
    expect(strong.score).toBe(100);
    expect(strong.label).toBe('Strong');
  });

  it('includes store_users in full JSON backup and restore operations', async () => {
    const user: StoreUser = {
      id: 'usr-backup',
      email: 'munim@kirana.com',
      full_name: 'Munimji',
      role: 'ACCOUNTANT',
      shop_id: 'current_shop',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    await db.saveStoreUser(user);

    const snapshot = await BackupService.exportFullDatabase();
    expect(snapshot.store_users).toBeDefined();
    expect(snapshot.store_users?.some((u) => u.email === 'munim@kirana.com')).toBe(true);

    // Clear and restore
    await db.store_users.clear();
    expect(await db.store_users.count()).toBe(0);

    await BackupService.restoreFromSnapshot(snapshot);
    const restoredUser = await db.getStoreUserByEmail('munim@kirana.com');
    expect(restoredUser).toBeDefined();
    expect(restoredUser?.role).toBe('ACCOUNTANT');
  });

  it('cloudSyncService executes gracefully and tracks status', async () => {
    const status = cloudSyncService.getStatus();
    expect(status).toBeDefined();
    expect(typeof status.isSyncing).toBe('boolean');

    // Single item syncs should run safely without throwing unhandled exceptions
    await expect(
      cloudSyncService.syncProduct({
        id: 'test-p',
        name: 'Test Product',
        short_code: 'TP1',
        barcode: '123456789012',
        category: 'General',
        unit_type: 'PCS',
        purchase_price: 10,
        selling_price: 15,
        mrp: 15,
        current_stock: 5,
        low_stock_threshold: 2,
        last_supplier_name: 'Wholesaler',
        is_quick_tap: false,
        updated_at: new Date().toISOString(),
      })
    ).resolves.not.toThrow();

    await expect(
      cloudSyncService.syncCustomer({
        id: 'test-c',
        name: 'Test Customer',
        phone: '9876543210',
        credit_limit: 2000,
        current_udhari_balance: 0,
        created_at: new Date().toISOString(),
      })
    ).resolves.not.toThrow();
  });
});
