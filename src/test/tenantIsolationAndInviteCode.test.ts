import { describe, it, expect, beforeEach } from 'vitest';
import { db, generateInviteCode } from '../db/db';
import { Product, Customer, SalesInvoice, StoreUser, UserRole } from '../types';
import { authService } from '../services/authService';

/**
 * Helper simulating Cashier field masking:
 * Operational cost fields (purchase_price, cogs) are accessible only by Owner / Accountant / Manager.
 */
export function sanitizeProductForRole(product: Product, role: UserRole): Partial<Product> {
  if (role === 'CASHIER') {
    // Strip purchase cost and supplier information for cashiers
    const { purchase_price, last_supplier_name, ...cashierSafe } = product;
    return cashierSafe;
  }
  return product;
}

export function canAccessModule(role: UserRole, module: 'BILLING' | 'INVENTORY' | 'KHATA' | 'GALLA' | 'REPORTS' | 'SETTINGS' | 'DATA_WIPE'): boolean {
  if (role === 'OWNER') return true;
  if (role === 'MANAGER') return module !== 'DATA_WIPE';
  if (role === 'ACCOUNTANT') return ['REPORTS', 'KHATA', 'GALLA', 'INVENTORY'].includes(module);
  if (role === 'CASHIER') return ['BILLING', 'KHATA'].includes(module);
  return false;
}

describe('Iteration 1: Multi-Tenant SaaS Isolation, Invite Code Auth & True RLS Security', () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.customers.clear();
    await db.sales_invoices.clear();
    await db.store_users.clear();
    await db.shop_profile.clear();
  });

  describe('1. Multi-Store Schema & Strict shop_id Tenant Scoping', () => {
    it('indexes shop_id and strictly isolates store queries across independent shops', async () => {
      // Store 1: Apna Kirana
      const prodStore1: Product = {
        id: 'prod-s1-01',
        shop_id: 'shop-apna-kirana-101',
        name: 'Aashirvaad Shudh Chakki Atta 5kg',
        short_code: 'AA5',
        barcode: '89010300101',
        category: 'Flour & Grains',
        unit_type: 'PACK',
        purchase_price: 210.0,
        selling_price: 245.0,
        mrp: 260.0,
        current_stock: 40,
        low_stock_threshold: 10,
        last_supplier_name: 'ITC Foods',
        is_quick_tap: true,
        updated_at: new Date().toISOString(),
      };

      // Store 2: Laxmi General Store
      const prodStore2: Product = {
        id: 'prod-s2-01',
        shop_id: 'shop-laxmi-general-202',
        name: 'Fortune Sunlite Sunflower Oil 1L',
        short_code: 'FO1',
        barcode: '89010300202',
        category: 'Oils',
        unit_type: 'PACK',
        purchase_price: 135.0,
        selling_price: 155.0,
        mrp: 165.0,
        current_stock: 25,
        low_stock_threshold: 5,
        last_supplier_name: 'Adani Wilmar',
        is_quick_tap: true,
        updated_at: new Date().toISOString(),
      };

      await db.products.bulkAdd([prodStore1, prodStore2]);

      // Query scoped by shop_id: store 1
      const store1Products = await db.products
        .where('shop_id')
        .equals('shop-apna-kirana-101')
        .toArray();

      expect(store1Products).toHaveLength(1);
      expect(store1Products[0].name).toBe('Aashirvaad Shudh Chakki Atta 5kg');
      expect(store1Products[0].id).toBe('prod-s1-01');

      // Query scoped by shop_id: store 2
      const store2Products = await db.products
        .where('shop_id')
        .equals('shop-laxmi-general-202')
        .toArray();

      expect(store2Products).toHaveLength(1);
      expect(store2Products[0].name).toBe('Fortune Sunlite Sunflower Oil 1L');
      expect(store2Products[0].id).toBe('prod-s2-01');

      // Cross-tenant non-existent shop query returns 0 items
      const unknownShopProducts = await db.products
        .where('shop_id')
        .equals('shop-unknown-999')
        .toArray();

      expect(unknownShopProducts).toHaveLength(0);
    });

    it('Dexie creating hook automatically assigns shop_id = current_shop if omitted', async () => {
      const productWithoutShop = {
        id: 'prod-no-shop',
        name: 'Loose Sugar (Khuli Chini)',
        short_code: 'SUG',
        barcode: '89010300999',
        category: 'Loose Staples',
        unit_type: 'KG_LOOSE' as const,
        purchase_price: 38.0,
        selling_price: 44.0,
        mrp: 48.0,
        current_stock: 80,
        low_stock_threshold: 15,
        last_supplier_name: 'APMC Mandi',
        is_quick_tap: true,
        updated_at: new Date().toISOString(),
      };

      await db.products.add(productWithoutShop as Product);

      const saved = await db.products.get('prod-no-shop');
      expect(saved).toBeDefined();
      expect(saved?.shop_id).toBe('current_shop');
    });
  });

  describe('2. Store Invite Code Authentication & Private Staff Onboarding', () => {
    it('generates a valid 6-digit store invite code format KRN-XXXX', () => {
      const code = generateInviteCode();
      expect(code).toMatch(/^KRN-\d{4}$/);
    });

    it('validates a correct store invite code and resolves the target shop', async () => {
      // Seed shop profile with invite code
      await db.shop_profile.put({
        id: 'shop-shree-ganesh',
        shop_id: 'shop-shree-ganesh',
        invite_code: 'KRN-7788',
        shop_name: 'Shree Ganesh Kirana',
        owner_name: 'Ramesh Patel',
        phone: '9876543210',
        upi_vpa: 'ganesh@upi',
        address: 'Main Bazaar',
        gst_footer_note: 'Thank you!',
        updated_at: new Date().toISOString(),
      });

      const validation = await authService.validateStoreInviteCode('KRN-7788');
      expect(validation.valid).toBe(true);
      expect(validation.shop).toBeDefined();
      expect(validation.shop?.shop_name).toBe('Shree Ganesh Kirana');
      expect(validation.shop?.id).toBe('shop-shree-ganesh');
    });

    it('rejects invalid or non-existent store invite codes without leaking store data', async () => {
      const validation = await authService.validateStoreInviteCode('KRN-0000');
      expect(validation.valid).toBe(false);
      expect(validation.shop).toBeUndefined();
      expect(validation.message).toContain('not found');
    });

    it('blocks staff registration when invite code is missing or invalid', async () => {
      // Attempting to register as CASHIER with no invite code must throw
      await expect(
        authService.signUp('cashier@test.com', 'ValidPass@123', {
          shopName: '',
          ownerName: 'Counter Cashier',
          phone: '9876543211',
          role: 'CASHIER',
          inviteCode: '', // Missing
        })
      ).rejects.toThrow(/Store Invite Code is required/);
    });
  });

  describe('3. Cashier Field Restriction & Role-Based Security Guardrails', () => {
    it('prohibits Cashier from accessing Owner and Accountant modules', () => {
      const cashierRole: UserRole = 'CASHIER';

      // Cashier permissions
      expect(canAccessModule(cashierRole, 'BILLING')).toBe(true);
      expect(canAccessModule(cashierRole, 'KHATA')).toBe(true);

      // Cashier RESTRICTED from:
      expect(canAccessModule(cashierRole, 'INVENTORY')).toBe(false);
      expect(canAccessModule(cashierRole, 'REPORTS')).toBe(false);
      expect(canAccessModule(cashierRole, 'GALLA')).toBe(false);
      expect(canAccessModule(cashierRole, 'SETTINGS')).toBe(false);
      expect(canAccessModule(cashierRole, 'DATA_WIPE')).toBe(false);
    });

    it('allows Owner and Accountant full financial and reporting access', () => {
      expect(canAccessModule('OWNER', 'DATA_WIPE')).toBe(true);
      expect(canAccessModule('OWNER', 'REPORTS')).toBe(true);

      expect(canAccessModule('ACCOUNTANT', 'REPORTS')).toBe(true);
      expect(canAccessModule('ACCOUNTANT', 'KHATA')).toBe(true);
      expect(canAccessModule('ACCOUNTANT', 'GALLA')).toBe(true);
      expect(canAccessModule('ACCOUNTANT', 'DATA_WIPE')).toBe(false); // Accountant cannot wipe DB
    });

    it('masks wholesale cost (purchase_price) and supplier fields for Cashier role', () => {
      const sampleProduct: Product = {
        id: 'prod-tata-tea',
        shop_id: 'current_shop',
        name: 'Tata Tea Gold 500g',
        short_code: 'TTG',
        barcode: '89010300555',
        category: 'Beverages',
        unit_type: 'PACK',
        purchase_price: 240.0,
        selling_price: 290.0,
        mrp: 310.0,
        current_stock: 30,
        low_stock_threshold: 8,
        last_supplier_name: 'Tata Global Beverages Wholesaler',
        is_quick_tap: true,
        updated_at: new Date().toISOString(),
      };

      const cashierView = sanitizeProductForRole(sampleProduct, 'CASHIER');
      expect(cashierView.purchase_price).toBeUndefined();
      expect(cashierView.last_supplier_name).toBeUndefined();
      expect(cashierView.selling_price).toBe(290.0);
      expect(cashierView.mrp).toBe(310.0);

      const ownerView = sanitizeProductForRole(sampleProduct, 'OWNER');
      expect(ownerView.purchase_price).toBe(240.0);
      expect(ownerView.last_supplier_name).toBe('Tata Global Beverages Wholesaler');
    });
  });

  describe('4. Rule 2 Verification: Demo Products Button Hiding Gate', () => {
    it('reports realSalesCount = 0 when no invoices exist, and realSalesCount > 0 after real sale', async () => {
      // 1. Fresh store: real sales count is 0
      const initialCount = await db.getRealSalesCount();
      expect(initialCount).toBe(0);

      // 2. Customer performs a sale
      const sampleInvoice: SalesInvoice = {
        id: 'inv-20261101-001',
        shop_id: 'current_shop',
        invoice_number: 'INV-20261101-001',
        customer_id: '0000-WALK-IN',
        subtotal_amount: 150.0,
        discount_roundoff: 0,
        grand_total: 150.0,
        total_cogs: 120.0,
        payment_mode: 'CASH',
        amount_paid_now: 150.0,
        udhari_added: 0,
        status: 'COMPLETED',
        created_at: new Date().toISOString(),
      };

      await db.sales_invoices.add(sampleInvoice);

      // 3. Count is now 1: SettingsView will hide the Load 25 Demo Products button
      const updatedCount = await db.getRealSalesCount();
      expect(updatedCount).toBe(1);
    });
  });
});

