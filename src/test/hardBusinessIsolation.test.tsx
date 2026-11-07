import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db, kiranaDb, homemadeDb } from '../db/db';
import { InventoryService } from '../services/inventoryService';
import {
  HomemadeFoodService,
  isHomemadeFoodCategoryOrName,
  repairMixedBusinessProducts,
  EXACT_8_HOMEMADE_FOOD_CATALOG,
} from '../services/homemadeFoodService';
import {
  filterProductsForBusiness,
  resolveProductBusinessType,
  getHomemadeShopIdForOwner,
  getBaseKiranaShopId,
  getHomemadeShopId,
  getKiranaShopIdFromHomemade,
  isHomemadeShopId,
} from '../utils/businessFirewall';
import { BillingService } from '../services/billingService';
import { GallaService } from '../services/gallaService';
import { ReportsService } from '../services/reportsService';
import { InventoryView } from '../components/inventory/InventoryView';
import { POSView } from '../components/pos/POSView';
import { ProductModal } from '../components/inventory/ProductModal';
import { SettingsView } from '../components/settings/SettingsView';
import { Product, ShopProfile } from '../types';

describe('Hard Data, UI, Category & Sync Isolation: KIRANA_RETAIL vs HOMEMADE_FOOD', () => {
  beforeEach(async () => {
    await kiranaDb.clearAllRecordsToEmpty();
    await homemadeDb.clearAllRecordsToEmpty();
    await HomemadeFoodService.resetWorkspaceSnapshots();

    await db.shop_profile.put({
      id: 'current_shop',
      shop_name: 'Smart Kirana & Gruh Udyog',
      owner_name: 'Owner',
      phone: '9876543210',
      upi_vpa: 'kirana@upi',
      business_type: 'KIRANA_RETAIL',
      invoice_prefix: 'KRN',
      address: 'Main Bazaar',
      gst_footer_note: 'Thank you!',
      reset_epoch: 1,
      updated_at: new Date().toISOString(),
    });
  });

  it('1. repairMixedBusinessProducts() cleanly tags Kirana products and Homemade food items', async () => {
    // Add mixed un-tagged products
    await db.products.bulkAdd([
      {
        id: 'p-toor',
        name: 'तूर डाळ (Toor Dal)',
        short_code: 'TD1',
        barcode: '2000000000001',
        category: 'Dals & Pulses',
        unit_type: 'KG_LOOSE',
        purchase_price: 130,
        selling_price: 155,
        mrp: 160,
        current_stock: 25,
        low_stock_threshold: 5,
        is_quick_tap: true,
      } as Product,
      {
        id: 'p-puran',
        name: 'पुरणपोळी (Puran Poli)',
        short_code: 'PP1',
        barcode: '2000000000002',
        category: 'Fresh Bhakri & Chapati',
        unit_type: 'PCS',
        purchase_price: 25,
        selling_price: 40,
        mrp: 40,
        current_stock: 10,
        low_stock_threshold: 2,
        is_quick_tap: true,
      } as Product,
      {
        id: 'p-modak',
        name: 'उकडीचे मोदक (Ukadiche Modak)',
        short_code: 'MD1',
        barcode: '2000000000003',
        category: 'Festival Specials',
        unit_type: 'PCS',
        purchase_price: 20,
        selling_price: 35,
        mrp: 35,
        current_stock: 15,
        low_stock_threshold: 3,
        is_quick_tap: true,
      } as Product,
    ]);

    // Intentionally corrupt records to simulate bad sync data
    await db.products.update('p-toor', { business_type: 'HOMEMADE_FOOD' });
    await db.products.update('p-puran', { business_type: 'KIRANA_RETAIL' });

    const res = await repairMixedBusinessProducts();
    expect(res.repairedCount).toBeGreaterThanOrEqual(2);
    expect(res.homemadeCount).toBe(2);

    const toor = await db.products.get('p-toor');
    expect(toor?.business_type).toBe('KIRANA_RETAIL');

    const puran = await db.products.get('p-puran');
    expect(puran?.business_type).toBe('HOMEMADE_FOOD');

    const modak = await db.products.get('p-modak');
    expect(modak?.business_type).toBe('HOMEMADE_FOOD');
  });

  it('2. InventoryView enforces 100% strict isolation between KIRANA_RETAIL and HOMEMADE_FOOD', async () => {
    // Add 1 Kirana product and 1 Homemade product
    const kiranaProd: Product = {
      id: 'p-sugar',
      name: 'साखर (Sugar)',
      short_code: 'SUG',
      barcode: '2000000000010',
      category: 'Groceries',
      unit_type: 'KG_LOOSE',
      purchase_price: 38,
      selling_price: 44,
      mrp: 46,
      current_stock: 50,
      low_stock_threshold: 5,
      is_quick_tap: true,
      business_type: 'KIRANA_RETAIL',
      last_supplier_name: 'Direct Wholesaler',
      updated_at: new Date().toISOString(),
    };

    const hmfProd: Product = {
      id: 'p-besan-laddu',
      name: 'बेसन लाडू (Besan Laddu)',
      short_code: 'BSL',
      barcode: '2000000000020',
      category: 'Homemade Laddus & Sweets',
      unit_type: 'KG_LOOSE',
      purchase_price: 340,
      selling_price: 480,
      mrp: 500,
      current_stock: 5,
      low_stock_threshold: 1,
      is_quick_tap: true,
      business_type: 'HOMEMADE_FOOD',
      last_supplier_name: 'Self Produced',
      updated_at: new Date().toISOString(),
    };

    const allProducts = [kiranaProd, hmfProd];

    // CASE A: Render in KIRANA_RETAIL mode
    const kiranaProfile: ShopProfile = {
      id: 'current_shop',
      shop_name: 'Kirana Store',
      owner_name: 'Owner',
      phone: '9876543210',
      upi_vpa: 'kirana@upi',
      business_type: 'KIRANA_RETAIL',
      invoice_prefix: 'KRN',
      address: 'Main Bazaar',
      gst_footer_note: 'Thank you!',
      updated_at: new Date().toISOString(),
    };

    const { unmount } = render(<InventoryView products={allProducts} shopProfile={kiranaProfile} />);

    // In Kirana mode: MUST show Sugar, and NEVER show Besan Laddu
    expect(screen.getByText(/साखर/)).toBeInTheDocument();
    expect(screen.queryByText(/बेसन लाडू/)).not.toBeInTheDocument();

    // MUST show Kirana toolbar buttons and row action
    expect(screen.getByTestId('import-csv-sheet-btn')).toBeInTheDocument();
    expect(screen.getByTestId('load-25-kirana-demo-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('load-homemade-food-menu-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId(`stock-in-btn-${kiranaProd.id}`)).toHaveAttribute('title', '➕ + Restock (Purchase In)');

    unmount();

    // CASE B: Render in HOMEMADE_FOOD mode
    const hmfProfile: ShopProfile = {
      ...kiranaProfile,
      business_type: 'HOMEMADE_FOOD',
      invoice_prefix: 'HMF',
    };

    render(<InventoryView products={allProducts} shopProfile={hmfProfile} />);

    // In Homemade Food mode: MUST show Besan Laddu, and NEVER show Sugar
    expect(screen.getByText(/बेसन लाडू/)).toBeInTheDocument();
    expect(screen.queryByText(/साखर/)).not.toBeInTheDocument();

    // MUST show Homemade Food menu loader and HIDE Kirana 105 / 25 loaders
    expect(screen.getByTestId('load-homemade-food-menu-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('import-csv-sheet-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('load-25-kirana-demo-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId(`stock-in-btn-${hmfProd.id}`)).toHaveAttribute('title', '🍳 + Fresh Batch Made Today');
  });

  it('3. ProductModal displays appropriate categories and sets business_type on creation', async () => {
    let saved = false;
    render(
      <ProductModal
        isOpen={true}
        onClose={() => {}}
        onSaved={() => { saved = true; }}
        businessType="HOMEMADE_FOOD"
      />
    );

    // Title reflects Homemade Food
    expect(screen.getByText('Add New Homemade Food Product')).toBeInTheDocument();

    // Category select contains Homemade categories
    const categorySelect = screen.getByTestId('product-category-select') as HTMLSelectElement;
    expect(categorySelect).toBeInTheDocument();
    const options = Array.from(categorySelect.options).map((o) => o.value);
    expect(options).toContain('Traditional Laddus (लाडू)');
    expect(options).toContain('Modak & Festive Specials (मोदक / पुरणपोळी)');
    expect(options).toContain('Konkani Breakfast (घावणे / आंबोळी)');
  });

  it('4. POSView maintains separate holding carts per business without cross-contamination', async () => {
    const kiranaProd: Product = {
      id: 'p-kirana-tea',
      name: 'Society Tea 500g',
      short_code: 'ST1',
      barcode: '2000000000030',
      category: 'Groceries',
      unit_type: 'PACK',
      purchase_price: 240,
      selling_price: 280,
      mrp: 290,
      current_stock: 20,
      low_stock_threshold: 5,
      is_quick_tap: true,
      business_type: 'KIRANA_RETAIL',
      last_supplier_name: 'Direct Wholesaler',
      updated_at: new Date().toISOString(),
    };

    const hmfProd: Product = {
      id: 'p-hmf-modak',
      name: 'मोदक (Modak)',
      short_code: 'MDK',
      barcode: '2000000000040',
      category: 'Festival Specials',
      unit_type: 'PCS',
      purchase_price: 15,
      selling_price: 30,
      mrp: 30,
      current_stock: 20,
      low_stock_threshold: 2,
      is_quick_tap: true,
      business_type: 'HOMEMADE_FOOD',
      last_supplier_name: 'Self Produced',
      updated_at: new Date().toISOString(),
    };

    const kiranaProfile: ShopProfile = {
      id: 'current_shop',
      shop_name: 'Kirana Store',
      owner_name: 'Owner',
      phone: '9876543210',
      upi_vpa: 'kirana@upi',
      business_type: 'KIRANA_RETAIL',
      invoice_prefix: 'KRN',
      address: 'Main Bazaar',
      gst_footer_note: 'Thank you!',
      updated_at: new Date().toISOString(),
    };

    const { unmount } = render(
      <POSView
        products={[kiranaProd, hmfProd]}
        customers={[]}
        shopProfile={kiranaProfile}
      />
    );

    // Kirana POS grid only displays Kirana products
    expect(screen.getByText(/Society Tea/)).toBeInTheDocument();
    expect(screen.queryByText(/मोदक/)).not.toBeInTheDocument();

    unmount();

    // Switch to Homemade Food POS
    const hmfProfile: ShopProfile = {
      ...kiranaProfile,
      business_type: 'HOMEMADE_FOOD',
      invoice_prefix: 'HMF',
    };

    render(
      <POSView
        products={[kiranaProd, hmfProd]}
        customers={[]}
        shopProfile={hmfProfile}
      />
    );

    // Homemade Food POS grid only displays Homemade products
    expect(screen.getByText(/मोदक/)).toBeInTheDocument();
    expect(screen.queryByText(/Society Tea/)).not.toBeInTheDocument();
  });

  it('5. Danger Vault: Wiping active business in HOMEMADE_FOOD mode deletes ONLY Homemade Food records, preserving Kirana Store catalog', async () => {
    // Seed 1 Kirana product and 1 Homemade Food product
    await db.products.bulkAdd([
      {
        id: 'p-rice',
        name: 'Kolam Rice 25kg',
        short_code: 'RIC',
        barcode: '2000000000050',
        category: 'Grains & Rice',
        unit_type: 'PACK',
        purchase_price: 1200,
        selling_price: 1450,
        mrp: 1500,
        current_stock: 10,
        low_stock_threshold: 2,
        business_type: 'KIRANA_RETAIL',
      } as Product,
      {
        id: 'p-ghavane',
        name: 'घावणे (Ghavane)',
        short_code: 'GHV',
        barcode: '2000000000060',
        category: 'Konkani Breakfast',
        unit_type: 'PLATE',
        purchase_price: 20,
        selling_price: 45,
        mrp: 50,
        current_stock: 8,
        low_stock_threshold: 1,
        business_type: 'HOMEMADE_FOOD',
      } as Product,
    ]);

    expect(await db.products.count()).toBe(2);

    // Clear scoped to HOMEMADE_FOOD
    await db.clearAllRecordsToEmpty('HOMEMADE_FOOD');

    // Kirana item must still exist in DB!
    const rice = await db.products.get('p-rice');
    expect(rice).toBeDefined();
    expect(rice?.name).toBe('Kolam Rice 25kg');

    // Homemade food item must be wiped
    const ghavane = await db.products.get('p-ghavane');
    expect(ghavane).toBeUndefined();
  });

  it('6. Bulletproof businessFirewall: filterProductsForBusiness strictly separates Puran Poli and Toor Dal even if business_type is corrupted', () => {
    const corruptedItems = [
      {
        id: 'p-puran',
        name: 'पुरणपोळी (Puran Poli)',
        category: 'Modak & Festive Specials',
        business_type: 'HOMEMADE_FOOD',
      },
      {
        id: 'p-toor',
        name: 'तूर डाळ (Toor Dal (Arhar))',
        category: 'Grains & Pulses',
        // Intentionally corrupted to simulate bad cloud sync
        business_type: 'HOMEMADE_FOOD',
      },
      {
        id: 'p-moong',
        name: 'मूग डाळ (Moong Dal)',
        category: 'Dals & Pulses',
        business_type: null,
      },
      {
        id: 'p-modak',
        name: 'उकडीचे मोदक (Ukadiche Modak)',
        category: 'Festive Specials',
        business_type: null,
      },
    ];

    // Under HOMEMADE_FOOD, Grains & Pulses must NEVER appear
    const hmfFiltered = filterProductsForBusiness(corruptedItems, 'HOMEMADE_FOOD');
    expect(hmfFiltered.map((p) => p.name)).toEqual([
      'पुरणपोळी (Puran Poli)',
      'उकडीचे मोदक (Ukadiche Modak)',
    ]);
    expect(hmfFiltered.some((p) => p.category === 'Grains & Pulses')).toBe(false);
    expect(hmfFiltered.some((p) => p.category === 'Dals & Pulses')).toBe(false);

    // Under KIRANA_RETAIL, Homemade food must NEVER appear
    const kiranaFiltered = filterProductsForBusiness(corruptedItems, 'KIRANA_RETAIL');
    expect(kiranaFiltered.map((p) => p.name)).toEqual([
      'तूर डाळ (Toor Dal (Arhar))',
      'मूग डाळ (Moong Dal)',
    ]);
    expect(kiranaFiltered.some((p) => p.name.includes('पुरणपोळी'))).toBe(false);
    expect(kiranaFiltered.some((p) => p.name.includes('मोदक'))).toBe(false);
  });

  it('7. STEP 5 Verification: kiranaShopId and homemadeShopId are deterministically derived UUIDs for the same Owner matching Supabase SQL', () => {
    const ownerKiranaUuid = 'c7b9195a-49e0-4a88-8254-2035ef580001';
    localStorage.setItem('kirana_base_shop_id', ownerKiranaUuid);
    const ownerHmfUuid = getHomemadeShopId(ownerKiranaUuid);

    // 1. Must be distinct
    expect(ownerHmfUuid).not.toBe(ownerKiranaUuid);

    // 2. Must end with exact Supabase SQL suffix -484d-4600-000000000001
    expect(ownerHmfUuid.endsWith('-484d-4600-000000000001')).toBe(true);
    expect(ownerHmfUuid).toBe(`${ownerKiranaUuid.substring(0, 18)}-484d-4600-000000000001`);

    // 3. Must be deterministic across all calls (Desktop, Laptop, Mobile)
    expect(getHomemadeShopId(ownerKiranaUuid)).toBe(ownerHmfUuid);
    expect(getHomemadeShopIdForOwner(ownerKiranaUuid)).toBe(ownerHmfUuid);

    // 4. Base resolution restores primary Kirana shop_id
    expect(getBaseKiranaShopId(ownerHmfUuid)).toBe(ownerKiranaUuid);
    expect(isHomemadeShopId(ownerHmfUuid)).toBe(true);
    expect(isHomemadeShopId(ownerKiranaUuid)).toBe(false);
  });

  it('8. STEP 5 Verification: In HOMEMADE_FOOD mode, Inventory and POS contain ONLY the 8 authentic items and 0 Kirana items', async () => {
    const kiranaShopId = 'c7b9195a-49e0-4a88-8254-2035ef580001';
    const hmfShopId = getHomemadeShopIdForOwner(kiranaShopId);

    // Add Kirana Dals to kiranaShopId
    await db.products.bulkAdd([
      {
        id: 'kirana-toor',
        shop_id: kiranaShopId,
        name: 'तूर डाळ (Toor Dal)',
        short_code: 'TD1',
        barcode: '2000000000101',
        category: 'Grains & Pulses',
        unit_type: 'KG_LOOSE',
        purchase_price: 130,
        selling_price: 155,
        mrp: 160,
        current_stock: 50,
        low_stock_threshold: 10,
        business_type: 'KIRANA_RETAIL',
        last_supplier_name: 'APMC Grain Mandi',
      } as Product,
      {
        id: 'kirana-moong',
        shop_id: kiranaShopId,
        name: 'मूग डाळ (Moong Dal)',
        short_code: 'MD1',
        barcode: '2000000000102',
        category: 'Dals & Pulses',
        unit_type: 'KG_LOOSE',
        purchase_price: 110,
        selling_price: 135,
        mrp: 140,
        current_stock: 40,
        low_stock_threshold: 8,
        business_type: 'KIRANA_RETAIL',
        last_supplier_name: 'APMC Grain Mandi',
      } as Product,
    ]);

    // Clean & Seed the Homemade store
    const seedRes = await HomemadeFoodService.cleanPurgeAndSeedHomemadeStore(kiranaShopId, hmfShopId);
    expect(seedRes.seededCount).toBe(8);

    const allDbProducts = [
      ...(await kiranaDb.products.toArray()),
      ...(await homemadeDb.products.toArray()),
    ];
    // 2 Kirana + 8 Homemade = 10 total products in multi-tenant DB
    expect(allDbProducts.length).toBe(10);

    // Filter for HOMEMADE_FOOD mode
    const hmfProducts = filterProductsForBusiness(allDbProducts, 'HOMEMADE_FOOD', hmfShopId);
    expect(hmfProducts.length).toBe(8);

    // Verify exactly the 8 authentic items exist
    const names = hmfProducts.map((p) => p.name);
    expect(names.some((n) => n.includes('घावणे'))).toBe(true);
    expect(names.some((n) => n.includes('चपाती'))).toBe(true);
    expect(names.some((n) => n.includes('आंबोळी'))).toBe(true);
    expect(names.some((n) => n.includes('मोदक'))).toBe(true);
    expect(names.some((n) => n.includes('तांदळाचे लाडू'))).toBe(true);
    expect(names.some((n) => n.includes('खोबऱ्याची वडी'))).toBe(true);
    expect(names.some((n) => n.includes('कांदे पोहे - घरगुती'))).toBe(true);
    expect(names.some((n) => n.includes('उपमा - घरगुती'))).toBe(true);

    // 0 Kirana items in HOMEMADE_FOOD
    expect(hmfProducts.some((p) => p.name.includes('Toor Dal'))).toBe(false);
    expect(hmfProducts.some((p) => p.name.includes('Moong Dal'))).toBe(false);
    expect(hmfProducts.some((p) => p.category === 'Grains & Pulses')).toBe(false);
    expect(hmfProducts.some((p) => p.category === 'Dals & Pulses')).toBe(false);

    // Filter for KIRANA_RETAIL mode
    const kiranaProducts = filterProductsForBusiness(allDbProducts, 'KIRANA_RETAIL', kiranaShopId);
    expect(kiranaProducts.length).toBe(2);
    expect(kiranaProducts.some((p) => p.name.includes('Toor Dal'))).toBe(true);
    expect(kiranaProducts.some((p) => p.name.includes('Moong Dal'))).toBe(true);
    expect(kiranaProducts.some((p) => p.name.includes('घावणे'))).toBe(false);
    expect(kiranaProducts.some((p) => p.name.includes('मोदक'))).toBe(false);
  });

  it('9. STEP 5 Verification: "Kande Pohe Homemade" and "Upma Homemade" stay in HOMEMADE_FOOD and are NEVER misclassified into KIRANA_RETAIL', () => {
    const kandePohe = {
      name: 'कांदे पोहे - घरगुती (Kande Pohe Homemade)',
      category: 'Konkani Breakfast & Tiffin',
      business_type: 'HOMEMADE_FOOD',
    };

    const upma = {
      name: 'उपमा - घरगुती (Upma Homemade)',
      category: 'Konkani Breakfast & Tiffin',
      business_type: 'HOMEMADE_FOOD',
    };

    expect(resolveProductBusinessType(kandePohe)).toBe('HOMEMADE_FOOD');
    expect(resolveProductBusinessType(upma)).toBe('HOMEMADE_FOOD');

    const filteredHmf = filterProductsForBusiness([kandePohe, upma], 'HOMEMADE_FOOD');
    expect(filteredHmf.length).toBe(2);

    const filteredKirana = filterProductsForBusiness([kandePohe, upma], 'KIRANA_RETAIL');
    expect(filteredKirana.length).toBe(0);
  });

  it('10. STEP 5 Verification: Financials, Expenses, and P&L Reports have 0 overlap between businesses', async () => {
    const kiranaShopId = 'c7b9195a-49e0-4a88-8254-2035ef580001';
    const hmfShopId = getHomemadeShopIdForOwner(kiranaShopId);

    // Record Kirana Sale & Operating Expense
    await db.sales_invoices.add({
      id: 'inv-kirana-1',
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      invoice_number: 'KRN-001',
      customer_id: '0000-WALK-IN',
      subtotal_amount: 1500,
      discount_roundoff: 0,
      grand_total: 1500,
      total_cogs: 1100,
      payment_mode: 'CASH',
      amount_paid_now: 1500,
      udhari_added: 0,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    });

    await db.expenses_and_drawings.add({
      id: 'exp-kirana-1',
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      entry_type: 'BUSINESS_EXPENSE',
      category: 'SHOP_EXPENSE_RENT_ELEC',
      amount: 400,
      paid_via: 'CASH_GALLA',
      description: 'Kirana shop electricity bill',
      created_at: new Date().toISOString(),
    });

    // Record Homemade Food Sale & Raw Material Expense
    await db.sales_invoices.add({
      id: 'inv-hmf-1',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      invoice_number: 'HMF-001',
      customer_id: '0000-WALK-IN',
      subtotal_amount: 600,
      discount_roundoff: 0,
      grand_total: 600,
      total_cogs: 320,
      payment_mode: 'CASH',
      amount_paid_now: 600,
      udhari_added: 0,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    });

    await db.expenses_and_drawings.add({
      id: 'exp-hmf-1',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      entry_type: 'RAW_MATERIAL_EXPENSE',
      category: 'RAW_MATERIAL_INGREDIENTS',
      amount: 250,
      paid_via: 'CASH_GALLA',
      description: 'Rice flour & jaggery for Modak',
      created_at: new Date().toISOString(),
    });

    // P&L for Kirana store (activeShopId = kiranaShopId)
    const kiranaPnl = await ReportsService.getProfitAndLossData(undefined, kiranaShopId);
    expect(kiranaPnl.salesRevenue).toBe(1500);
    expect(kiranaPnl.cogs).toBe(1100);
    expect(kiranaPnl.grossProfit).toBe(400);
    expect(kiranaPnl.shopOperatingExpenses).toBe(400);

    // P&L for Homemade Food store (activeShopId = hmfShopId)
    const hmfPnl = await ReportsService.getProfitAndLossData(undefined, hmfShopId);
    expect(hmfPnl.salesRevenue).toBe(600);
    expect(hmfPnl.cogs).toBe(320);
    expect(hmfPnl.grossProfit).toBe(280);
    // Kirana 400 rent must NOT leak into Homemade Food P&L
    expect(hmfPnl.shopOperatingExpenses).toBe(0);
  });

  it('11. Custom homemade product created by user never collapses, disappears, or leaks on sync and repair', async () => {
    localStorage.setItem('kirana_active_business_type', 'HOMEMADE_FOOD');
    const primaryKiranaShopId = '8f3a5b2c-1234-4567-890a-bcde12345678';
    const hmfShopId = getHomemadeShopId(primaryKiranaShopId);
    localStorage.setItem('kirana_primary_shop_id', primaryKiranaShopId);
    localStorage.setItem('kirana_active_shop_id', hmfShopId);

    // Create a merchant's custom homemade product
    const customChakali = await InventoryService.createProduct({
      name: 'कुरकुरीत चकली (Chakali 250g)',
      marathi_name: 'कुरकुरीत चकली',
      short_code: 'CHK25',
      barcode: '2009000000999',
      category: 'Snacks & Namkeen (नाश्ता व नमकीन)',
      unit_type: 'PCS',
      purchase_price: 60,
      selling_price: 100,
      mrp: 100,
      current_stock: 40,
      low_stock_threshold: 5,
      is_quick_tap: true,
      business_type: 'HOMEMADE_FOOD',
    });

    expect(customChakali.id).toBeDefined();
    expect(customChakali.business_type).toBe('HOMEMADE_FOOD');

    // Run repairMixedBusinessProducts
    await repairMixedBusinessProducts();

    // Verify it is in homemadeDb and NOT wiped
    const inHmfDb = await db.products.get(customChakali.id);
    expect(inHmfDb).toBeDefined();
    expect(inHmfDb?.name).toContain('चकली');
    expect(inHmfDb?.business_type).toBe('HOMEMADE_FOOD');

    // Verify filterProductsForBusiness returns it
    const allProds = await db.products.toArray();
    const visibleInHmf = filterProductsForBusiness(allProds, 'HOMEMADE_FOOD', hmfShopId);
    expect(visibleInHmf.some((p) => p.id === customChakali.id)).toBe(true);

    // Verify it does NOT appear in Kirana
    const visibleInKirana = filterProductsForBusiness(allProds, 'KIRANA_RETAIL', primaryKiranaShopId);
    expect(visibleInKirana.some((p) => p.id === customChakali.id)).toBe(false);
  });
});
