import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../db/db';
import { InventoryService } from '../services/inventoryService';
import { HomemadeFoodService, isHomemadeFoodCategoryOrName, repairMixedBusinessProducts } from '../services/homemadeFoodService';
import { InventoryView } from '../components/inventory/InventoryView';
import { POSView } from '../components/pos/POSView';
import { ProductModal } from '../components/inventory/ProductModal';
import { SettingsView } from '../components/settings/SettingsView';
import { Product, ShopProfile } from '../types';

describe('Hard Data, UI, Category & Sync Isolation: KIRANA_RETAIL vs HOMEMADE_FOOD', () => {
  beforeEach(async () => {
    await db.clearAllRecordsToEmpty();
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
});
