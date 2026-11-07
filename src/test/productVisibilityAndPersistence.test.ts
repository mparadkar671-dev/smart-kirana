import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { InventoryService } from '../services/inventoryService';
import {
  bulkImportKiranaProducts,
  MAHARASHTRA_105_KIRANA_CATALOG,
} from '../services/csvCatalogImporter';
import {
  filterProductsForBusiness,
  resolveProductBusinessType,
  isHomemadeShopId,
} from '../utils/businessFirewall';

describe('Product Addition, Sample Seeding & Visibility Persistence Suite', () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.inventory_logs.clear();
    await db.sync_outbox.clear();
    await db.shop_profile.clear();
    localStorage.clear();
  });

  it('1. Shop UUIDs ending in random hex like "ba7c" or "ceef" are NOT misclassified as homemade food', () => {
    const kiranaShopId1 = 'd7ba7c1e-6272-4d2b-ba7c-6eef922cba7c';
    const kiranaShopId2 = 'a1b2c3d4-e5f6-7890-abcd-12345678ceef';

    expect(isHomemadeShopId(kiranaShopId1)).toBe(false);
    expect(isHomemadeShopId(kiranaShopId2)).toBe(false);

    // Only deterministic HMF tenant identifiers should return true
    expect(isHomemadeShopId('d7ba7c1e-6272-4d2b-484d-4600-000000000001')).toBe(true);
    expect(isHomemadeShopId('store_123_hmf')).toBe(true);
    expect(isHomemadeShopId('homemade_food_shop')).toBe(true);
  });

  it('2. Creating a product with Groceries category and name with "vadi", "pohe", or "papad" remains visible as KIRANA_RETAIL', async () => {
    const activeShopId = 'c7b9195a-49e0-4a88-8254-2035ef58ba7c';
    localStorage.setItem('kirana_active_shop_id', activeShopId);

    const product1 = await InventoryService.createProduct({
      name: 'Soyabean Vadi 200g (सोयाबीन वडी)',
      category: 'Groceries',
      unit_type: 'PACK',
      purchase_price: 35,
      selling_price: 45,
      mrp: 50,
      current_stock: 20,
      low_stock_threshold: 5,
      short_code: 'SV2',
      is_quick_tap: true,
      shop_id: activeShopId,
    });

    const product2 = await InventoryService.createProduct({
      name: 'Lijjat Udad Papad 200g (लिज्जत पापड)',
      category: 'Groceries',
      unit_type: 'PACK',
      purchase_price: 60,
      selling_price: 75,
      mrp: 80,
      current_stock: 15,
      low_stock_threshold: 3,
      short_code: 'LP2',
      is_quick_tap: false,
      shop_id: activeShopId,
    });

    // Check classification
    expect(resolveProductBusinessType(product1)).toBe('KIRANA_RETAIL');
    expect(resolveProductBusinessType(product2)).toBe('KIRANA_RETAIL');

    // Check visibility via filterProductsForBusiness
    const allProducts = await db.products.toArray();
    const visibleProducts = filterProductsForBusiness(allProducts, 'KIRANA_RETAIL', activeShopId);

    expect(visibleProducts.length).toBe(2);
    expect(visibleProducts.map((p) => p.id)).toContain(product1.id);
    expect(visibleProducts.map((p) => p.id)).toContain(product2.id);
  });

  it('3. Products with shop_id "current_shop" remain visible when activeShopId is set to a user UUID', () => {
    const activeShopId = 'user-store-uuid-9999';

    const localProducts = [
      {
        id: 'p-sugar',
        shop_id: 'current_shop',
        name: 'Sugar M-30 (साखर)',
        category: 'Grains & Pulses',
        business_type: 'KIRANA_RETAIL' as const,
      },
      {
        id: 'p-salt',
        shop_id: 'current_shop',
        name: 'Tata Salt 1kg (टाटा मीठ)',
        category: 'Groceries',
        business_type: 'KIRANA_RETAIL' as const,
      },
    ];

    const visible = filterProductsForBusiness(localProducts, 'KIRANA_RETAIL', activeShopId);
    expect(visible.length).toBe(2);
    expect(visible.map((p) => p.name)).toEqual(['Sugar M-30 (साखर)', 'Tata Salt 1kg (टाटा मीठ)']);
  });

  it('4. Bulk import of 105 Maharashtra Kirana Catalog items imports all products and all 105 remain visible', async () => {
    const activeShopId = 'store-uuid-abc-123';
    localStorage.setItem('kirana_active_shop_id', activeShopId);

    const result = await bulkImportKiranaProducts(MAHARASHTRA_105_KIRANA_CATALOG);
    expect(result.importedCount).toBe(105);

    const allInDb = await db.products.toArray();
    expect(allInDb.length).toBe(105);

    const visibleInInventory = filterProductsForBusiness(allInDb, 'KIRANA_RETAIL', activeShopId);
    expect(visibleInInventory.length).toBe(105);

    // Verify previously disappearing items are 100% visible
    const soyabeanVadi = visibleInInventory.find((p) => p.name.includes('सोयाबीन वडी'));
    expect(soyabeanVadi).toBeDefined();
    expect(soyabeanVadi?.business_type).toBe('KIRANA_RETAIL');

    const kandePohe = visibleInInventory.find((p) => p.name.includes('कांदे पोहे'));
    expect(kandePohe).toBeDefined();
    expect(kandePohe?.business_type).toBe('KIRANA_RETAIL');

    const rava = visibleInInventory.find((p) => p.name.includes('रवा'));
    expect(rava).toBeDefined();
    expect(rava?.business_type).toBe('KIRANA_RETAIL');
  });

  it('5. seedDemoProducts() always persists sample products and queues them for cloud sync', async () => {
    const activeShopId = 'store-test-pune-001';
    localStorage.setItem('kirana_active_shop_id', activeShopId);

    // Seed 25 products
    await db.seedDemoProducts();
    const count = await db.products.count();
    expect(count).toBe(25);

    const allInDb = await db.products.toArray();
    const visible = filterProductsForBusiness(allInDb, 'KIRANA_RETAIL', activeShopId);
    expect(visible.length).toBe(25);

    // Verify sync outbox has items queued
    const outboxCount = await db.sync_outbox.count();
    expect(outboxCount).toBe(25);

    // Verify subsequent click succeeds cleanly without throwing constraint errors
    await db.seedDemoProducts();
    expect(await db.products.count()).toBe(25);
  });

  it('6. Products created with user shop_id remain 100% visible across base shop_id variants', () => {
    const baseShopId = 'shop-pune-market-001';
    const activeShopId = 'shop-pune-market-001';

    const testProducts = [
      {
        id: 'p-1',
        shop_id: 'shop-pune-market-001',
        name: 'Tur Dal 1kg',
        category: 'Dals & Pulses',
        business_type: 'KIRANA_RETAIL' as const,
      },
      {
        id: 'p-2',
        shop_id: 'current_shop',
        name: 'Chana Dal 1kg',
        category: 'Dals & Pulses',
        business_type: 'KIRANA_RETAIL' as const,
      },
      {
        id: 'p-3',
        shop_id: undefined,
        name: 'Moong Dal 1kg',
        category: 'Dals & Pulses',
        business_type: 'KIRANA_RETAIL' as const,
      },
    ];

    const visible = filterProductsForBusiness(testProducts, 'KIRANA_RETAIL', activeShopId);
    expect(visible.length).toBe(3);
  });
});
