import { describe, it, expect, beforeEach } from 'vitest';
import { db, kiranaDb, homemadeDb } from '../db/db';
import {
  parseKiranaCatalogCsv,
  bulkImportKiranaProducts,
  MAHARASHTRA_105_KIRANA_CATALOG,
} from '../services/csvCatalogImporter';
import {
  sanitizeProductForSupabase,
  normalizeUnitForSupabase,
} from '../services/cloudSyncService';
import { KIRANA_CATEGORIES, resolveProductBusinessType } from '../utils/businessFirewall';

describe('CSV Catalog Import & Supabase Cloud Sync Integrity', () => {
  beforeEach(async () => {
    await kiranaDb.products.clear();
    await homemadeDb.products.clear();
    await db.products.clear();
  });

  it('1. parseKiranaCatalogCsv correctly maps Marathi and English column headers without colliding on "name"', () => {
    const csvContent = [
      'Product Name (Marathi),Product Name (English),Category,Search Keywords (POS),Sell Price,Purchase Price,MRP,Available Stock',
      'तूर डाळ,Toor Dal (Arhar),Grains & Pulses,"toor dal, arhar dal",160,130,160,0.75',
      'मूग डाळ,Moong Dal,Grains & Pulses,"moong dal, mug dal",125,140,160,0',
      'लाईफबॉय साबण,Lifebuoy Total 10 Soap,Soaps & Cleaning,"lifebuoy soap",10,9.25,10,0',
    ].join('\n');

    const parsed = parseKiranaCatalogCsv(csvContent);
    expect(parsed.length).toBe(3);

    // Marathi and English names must be distinctly separated
    expect(parsed[0].marathiName).toBe('तूर डाळ');
    expect(parsed[0].englishName).toBe('Toor Dal (Arhar)');
    expect(parsed[0].category).toBe('Grains & Pulses');
    expect(parsed[0].sellPrice).toBe(160);
    expect(parsed[0].availableStock).toBe(0.75);

    // Row with 0 stock must preserve 0 (not undefined)
    expect(parsed[1].marathiName).toBe('मूग डाळ');
    expect(parsed[1].englishName).toBe('Moong Dal');
    expect(parsed[1].availableStock).toBe(0);

    expect(parsed[2].marathiName).toBe('लाईफबॉय साबण');
    expect(parsed[2].englishName).toBe('Lifebuoy Total 10 Soap');
    expect(parsed[2].category).toBe('Soaps & Cleaning');
    expect(parsed[2].availableStock).toBe(0);
  });

  it('2. Imports full catalog without any collision or dropped rows', async () => {
    const sampleRows = [
      { marathiName: 'तूर डाळ', englishName: 'Toor Dal (Arhar)', category: 'Grains & Pulses', searchKeywords: 'toor', sellPrice: 160, purchasePrice: 130, mrp: 160, availableStock: 0.75 },
      { marathiName: 'मूग डाळ', englishName: 'Moong Dal', category: 'Grains & Pulses', searchKeywords: 'moong', sellPrice: 125, purchasePrice: 140, mrp: 160, availableStock: 0.25 },
      { marathiName: 'हरभरा डाळ', englishName: 'Chana Dal', category: 'Grains & Pulses', searchKeywords: 'chana', sellPrice: 120, purchasePrice: 90, mrp: 120, availableStock: 0.75 },
      { marathiName: 'उडीद डाळ', englishName: 'Urad Dal', category: 'Grains & Pulses', searchKeywords: 'urad', sellPrice: 140, purchasePrice: 110, mrp: 140, availableStock: 0.5 },
      { marathiName: 'मसूर डाळ', englishName: 'Masoor Dal', category: 'Grains & Pulses', searchKeywords: 'masoor', sellPrice: 90, purchasePrice: 70, mrp: 90, availableStock: 1.25 },
      { marathiName: 'वाघ बकरी चहा', englishName: 'Wagh Bakri Premium Tea 250g', category: 'Tea & Beverages', searchKeywords: 'tea, wagh bakri', sellPrice: 130, purchasePrice: 118, mrp: 130, availableStock: 10 },
      { marathiName: 'पारले जी 10', englishName: 'Parle-G Glucose Biscuit 10', category: 'Biscuits & Snacks', searchKeywords: 'parle g', sellPrice: 10, purchasePrice: 9.2, mrp: 10, availableStock: 24 },
      { marathiName: 'लाईफबॉय साबण', englishName: 'Lifebuoy Total 10 Soap', category: 'Soaps & Cleaning', searchKeywords: 'lifebuoy', sellPrice: 10, purchasePrice: 9.25, mrp: 10, availableStock: 0 },
    ];

    const result = await bulkImportKiranaProducts(sampleRows);
    expect(result.importedCount).toBe(8);
    const stored = await db.products.toArray();
    expect(stored.length).toBe(8);
  });

  it('3. sanitizeProductForSupabase strips business_type and invalid columns to prevent PGRST204 errors', () => {
    const localProduct = {
      id: 'prod-test-999',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      name: 'तूर डाळ (Toor Dal)',
      marathi_name: 'तूर डाळ',
      search_keywords: 'toor, dal',
      short_code: 'TD1',
      barcode: '8901234567890',
      category: 'Grains & Pulses',
      unit_type: 'KG_LOOSE' as const,
      purchase_price: 130,
      selling_price: 160,
      mrp: 160,
      current_stock: 50,
      low_stock_threshold: 10,
      last_supplier_name: 'APMC Wholesaler',
      raw_material_cost: 10,
      loan_account_id: 'loan-123',
      is_loan_funded: true,
      updated_at: new Date().toISOString(),
    };

    const sanitized = sanitizeProductForSupabase(localProduct, 'current_shop', 'user-abc');

    // Forbidden columns that do not exist in Supabase products table must be absent
    expect(sanitized).not.toHaveProperty('business_type');
    expect(sanitized).not.toHaveProperty('marathi_name');
    expect(sanitized).not.toHaveProperty('search_keywords');
    expect(sanitized).not.toHaveProperty('raw_material_cost');
    expect(sanitized).not.toHaveProperty('loan_account_id');
    expect(sanitized).not.toHaveProperty('is_loan_funded');

    // Allowed columns must be present and correctly typed
    expect(sanitized.id).toBe('prod-test-999');
    expect(sanitized.shop_id).toBe('current_shop');
    expect(sanitized.name).toBe('तूर डाळ (Toor Dal)');
    expect(sanitized.unit_type).toBe('KG_LOOSE');
    expect(sanitized.user_id).toBe('user-abc');
  });

  it('4. normalizeUnitForSupabase safely maps all unit variations into valid unit_type_enum', () => {
    expect(normalizeUnitForSupabase('KG_LOOSE')).toBe('KG_LOOSE');
    expect(normalizeUnitForSupabase('kg')).toBe('KG_LOOSE');
    expect(normalizeUnitForSupabase('KGS')).toBe('KG_LOOSE');
    expect(normalizeUnitForSupabase('gm')).toBe('KG_LOOSE');
    expect(normalizeUnitForSupabase('LTR')).toBe('LTR');
    expect(normalizeUnitForSupabase('ltr')).toBe('LTR');
    expect(normalizeUnitForSupabase('ml')).toBe('LTR');
    expect(normalizeUnitForSupabase('PACK')).toBe('PACK');
    expect(normalizeUnitForSupabase('packet')).toBe('PACK');
    expect(normalizeUnitForSupabase('box')).toBe('PACK');
    expect(normalizeUnitForSupabase('PCS')).toBe('PCS');
    expect(normalizeUnitForSupabase('PLATE')).toBe('PCS');
    expect(normalizeUnitForSupabase('DOZEN')).toBe('PCS');
  });

  it('5. New CSV categories are recognized as valid KIRANA_CATEGORIES', () => {
    expect(KIRANA_CATEGORIES.has('Tea & Beverages')).toBe(true);
    expect(KIRANA_CATEGORIES.has('Biscuits & Snacks')).toBe(true);
    expect(KIRANA_CATEGORIES.has('Soaps & Cleaning')).toBe(true);
    expect(KIRANA_CATEGORIES.has('Dairy & Bakery')).toBe(true);

    expect(resolveProductBusinessType({ category: 'Tea & Beverages', name: 'Wagh Bakri Tea' })).toBe('KIRANA_RETAIL');
    expect(resolveProductBusinessType({ category: 'Soaps & Cleaning', name: 'Santoor Soap' })).toBe('KIRANA_RETAIL');
  });
});
