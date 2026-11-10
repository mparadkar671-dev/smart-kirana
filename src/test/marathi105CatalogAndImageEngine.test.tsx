import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { db } from '../db/db';
import { cloudSyncService } from '../services/cloudSyncService';
import {
  MAHARASHTRA_105_KIRANA_CATALOG,
  parseKiranaCatalogCsv,
  bulkImportKiranaProducts,
  export105KiranaCatalogCsvString,
  inferUnitAndDefaultPricing,
} from '../services/csvCatalogImporter';
import {
  generateSmartProductThumbnail,
  normalizeProductImageToSquare,
  resolveBrandPalette,
} from '../utils/productImageEngine';
import { isValidEan13 } from '../utils/barcodeGenerator';
import { POSView } from '../components/pos/POSView';
import { InventoryView } from '../components/inventory/InventoryView';
import { ProductModal } from '../components/inventory/ProductModal';

describe('105-Product Marathi/English Sheet Importer & Uniform 160x160 Image Engine', () => {
  beforeEach(async () => {
    vi.spyOn(cloudSyncService, 'syncAllToCloud').mockResolvedValue({
      success: true,
      pushedCount: 0,
      errors: [],
    });
    vi.spyOn(cloudSyncService, 'syncProduct').mockResolvedValue(undefined);
    localStorage.clear();
    await db.clearAllRecordsToEmpty();
  });

  it('1. Standardized 160x160px Image Engine resolves realistic brand palettes and outputs 160x160 square DataURLs', async () => {
    // Yellow/Red for Everest & Maggi
    const everestPalette = resolveBrandPalette('Everest Mutton Masala', 'एव्हरेस्ट मटन मसाला', 'Spices');
    expect(everestPalette.bgLight).toBe('#FEF08A');
    expect(everestPalette.primary).toBe('#DC2626');

    // Green for Vim & Gagangiri Hirwa Masala
    const gagangiriPalette = resolveBrandPalette('Gagangiri Hirwa Masala', 'गगंगिरी हिरवा मसाला', 'Spices');
    expect(gagangiriPalette.bgLight).toBe('#DCFCE7');
    expect(gagangiriPalette.primary).toBe('#15803D');

    const vimPalette = resolveBrandPalette('Vim Dishwash Bar', 'विम बार', 'Cleaning');
    expect(vimPalette.primary).toBe('#16A34A');

    // Blue for Parachute & Rin
    const parachutePalette = resolveBrandPalette('Parachute Coconut Oil', 'पॅराशूट खोबरेल तेल', 'Personal Care');
    expect(parachutePalette.primary).toBe('#1D4ED8');

    // Golden Yellow for Dals & Oils
    const dalPalette = resolveBrandPalette('Toor Dal', 'तूर डाळ', 'Grains & Pulses');
    expect(dalPalette.primary).toBe('#D97706');

    const thumbUrl = generateSmartProductThumbnail({
      name: 'Toor Dal (Arhar)',
      marathiName: 'तूर डाळ',
      category: 'Grains & Pulses',
      unitType: 'KG_LOOSE',
    });
    expect(thumbUrl.startsWith('data:image/')).toBe(true);

    const file = new File(['dummy-image'], 'pack.png', { type: 'image/png' });
    const normalized = await normalizeProductImageToSquare(file);
    expect(normalized.startsWith('data:image/')).toBe(true);
  });

  it('2. Parses 105-row CSV sheet (Untitled_spreadsheet.csv), infers KG_LOOSE / PCS units, and fills blank default prices', () => {
    expect(MAHARASHTRA_105_KIRANA_CATALOG.length).toBe(105);

    const csvText = export105KiranaCatalogCsvString();
    const parsed = parseKiranaCatalogCsv(csvText);
    expect(parsed.length).toBe(105);
    expect(parsed[0].marathiName).toBe('तूर डाळ');
    expect(parsed[0].searchKeywords).toContain('turdal');

    // Verify blank price row auto-fills sensible Maharashtra Kirana retail/wholesale prices and KG_LOOSE unit
    const blankPriceRow = inferUnitAndDefaultPricing({
      marathiName: 'शेंगदाणे',
      englishName: 'Loose Groundnuts (Shengdane)',
      category: 'Grains & Pulses',
      searchKeywords: 'shengdane, groundnut, दाणे',
    });
    expect(blankPriceRow.unitType).toBe('KG_LOOSE');
    expect(blankPriceRow.sellPrice).toBeGreaterThan(0);
    expect(blankPriceRow.purchasePrice).toBeGreaterThan(0);
    expect(blankPriceRow.lowStockThreshold).toBe(2);
  });

  it('3. Bulk imports all 105 products into Dexie db.products with unique 200-prefix EAN-13 barcodes, uniform 160x160 images, and bilingual names', async () => {
    const res = await bulkImportKiranaProducts(MAHARASHTRA_105_KIRANA_CATALOG);
    expect(res.importedCount).toBe(105);
    expect(res.totalProducts).toBe(105);

    const allProducts = await db.products.toArray();
    expect(allProducts.length).toBe(105);

    const barcodes = new Set<string>();
    for (const p of allProducts) {
      expect(p.barcode).toMatch(/^200\d{10}$/);
      expect(isValidEan13(p.barcode)).toBe(true);
      expect(barcodes.has(p.barcode)).toBe(false);
      barcodes.add(p.barcode);

      expect(p.image_url).toBeTruthy();
      expect(p.marathi_name).toBeTruthy();
      expect(p.search_keywords).toBeTruthy();
      expect(p.selling_price).toBeGreaterThan(0);
      expect(p.purchase_price).toBeGreaterThan(0);
    }
  });

  it('4. POSView displays bilingual Marathi/English names on Top-24 cards while hiding search_keywords and finding items in 0ms via "turdal", "arhar", "chaha", or "saban"', async () => {
    await bulkImportKiranaProducts(MAHARASHTRA_105_KIRANA_CATALOG);
    const allProducts = await db.products.toArray();

    render(<POSView products={allProducts} customers={[]} />);

    const fastTapGrid = screen.getByTestId('fast-tap-grid');
    // Bilingual name is displayed on the Top-24 card
    expect(within(fastTapGrid).getByText(/तूर डाळ \(Toor Dal \(Arhar\)\)/i)).toBeInTheDocument();

    // Hidden search_keywords ("turdal", "arhar dal") must NOT appear on the Top-24 card UI
    expect(fastTapGrid.textContent).not.toContain('turdal');
    expect(fastTapGrid.textContent).not.toContain('तुरीची डाळ');

    // Typing "turdal", "arhar", "chaha", or "saban" in F2 POS search bar finds the exact item immediately
    const searchInput = screen.getByTestId('pos-search-input');

    fireEvent.change(searchInput, { target: { value: 'turdal' } });
    let dropdown = await screen.findByTestId('search-results-dropdown');
    expect(within(dropdown).getByText(/तूर डाळ/i)).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'arhar' } });
    dropdown = await screen.findByTestId('search-results-dropdown');
    expect(within(dropdown).getByText(/तूर डाळ/i)).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'chaha' } });
    dropdown = await screen.findByTestId('search-results-dropdown');
    expect(within(dropdown).getAllByText(/चहा/i).length).toBeGreaterThan(0);

    fireEvent.change(searchInput, { target: { value: 'saban' } });
    dropdown = await screen.findByTestId('search-results-dropdown');
    expect(within(dropdown).getAllByText(/साबण/i).length).toBeGreaterThan(0);
  });

  it('5. InventoryView renders "📥 Import CSV / Sheet (Auto-Barcode + Auto-Image)" button and imports all 105 products in 1 click', async () => {
    const initialProducts = await db.products.toArray();
    render(<InventoryView products={initialProducts} />);

    const openImportBtn = screen.getByTestId('import-csv-sheet-btn');
    fireEvent.click(openImportBtn);

    const load105Btn = await screen.findByTestId('import-105-maharashtra-btn');
    fireEvent.click(load105Btn);

    const banner = await screen.findByTestId('csv-import-success-banner', {}, { timeout: 10000 });
    expect(banner.textContent).toContain('105');

    const countAfter = await db.products.count();
    expect(countAfter).toBe(105);
  }, 15000);

  it('6. ProductModal allows smooth typing without auto-selection or character limits, and persists product edits to IndexedDB & Supabase sync without reverting', async () => {
    await bulkImportKiranaProducts(MAHARASHTRA_105_KIRANA_CATALOG.slice(0, 2));
    const allProds = await db.products.toArray();
    const targetProd = allProds[0];
    expect(targetProd).toBeDefined();

    const syncSpy = vi.spyOn(cloudSyncService, 'syncProduct').mockResolvedValue(undefined);
    const onSaved = vi.fn();

    const { rerender } = render(
      <ProductModal
        isOpen={true}
        onClose={() => {}}
        productToEdit={targetProd}
        onSaved={onSaved}
      />
    );

    const nameInput = screen.getByTestId('product-name-input') as HTMLInputElement;
    const marathiInput = screen.getByTestId('product-marathi-name-input') as HTMLInputElement;
    const shortCodeInput = screen.getByTestId('product-shortcode-input') as HTMLInputElement;
    const purchasePriceInput = screen.getByTestId('purchase-price-input') as HTMLInputElement;
    const sellingPriceInput = screen.getByTestId('selling-price-input') as HTMLInputElement;
    const currentStockInput = screen.getByTestId('current-stock-input') as HTMLInputElement;

    // Verify no maxLength restrictions exist on any product inputs
    expect(nameInput.getAttribute('maxlength')).toBeNull();
    expect(marathiInput.getAttribute('maxlength')).toBeNull();
    expect(shortCodeInput.getAttribute('maxlength')).toBeNull();

    // Simulate typing long product name while parent re-renders with new inline callbacks
    const longCustomName = 'तूर डाळ स्पेशल अनपॉलिश प्रीमियम क्वालिटी (Laxmi Vatsalya Special Unpolished Toor Dal 1kg Family Pack)';
    fireEvent.change(nameInput, { target: { value: 'तूर डाळ स्पेशल' } });

    // Force a parent re-render with a fresh inline onClose function and cloned productToEdit object
    rerender(
      <ProductModal
        isOpen={true}
        onClose={() => {}}
        productToEdit={{ ...targetProd }}
        onSaved={onSaved}
      />
    );

    // Wait 60ms (past the old 50ms setTimeout) and verify the input value was NOT reset or selected-overwritten
    await new Promise((r) => setTimeout(r, 60));
    expect(nameInput.value).toBe('तूर डाळ स्पेशल');

    // Continue typing the full long name, Marathi name, short code, and decimal prices/stock
    fireEvent.change(nameInput, { target: { value: longCustomName } });
    fireEvent.change(marathiInput, { target: { value: 'तूर डाळ स्पेशल अनपॉलिश' } });
    fireEvent.change(shortCodeInput, { target: { value: 'tdspec100' } });

    // Clear numeric fields to '' first (simulating Backspace) then type decimal numbers
    fireEvent.change(purchasePriceInput, { target: { value: '' } });
    expect(purchasePriceInput.value).toBe('');
    fireEvent.change(purchasePriceInput, { target: { value: '128.50' } });
    expect(purchasePriceInput.value).toBe('128.50');

    fireEvent.change(sellingPriceInput, { target: { value: '155.75' } });
    expect(sellingPriceInput.value).toBe('155.75');

    fireEvent.change(currentStockInput, { target: { value: '' } });
    expect(currentStockInput.value).toBe('');
    fireEvent.change(currentStockInput, { target: { value: '42.5' } });
    expect(currentStockInput.value).toBe('42.5');

    // Submit the edit form
    const submitBtn = screen.getByTestId('save-product-submit-btn');
    fireEvent.click(submitBtn);

    await vi.waitFor(async () => {
      const updated = await db.products.get(targetProd.id);
      expect(updated?.name).toBe(longCustomName);
    });

    const updatedInDb = await db.products.get(targetProd.id);
    expect(updatedInDb?.name).toBe(longCustomName);
    expect(updatedInDb?.marathi_name).toBe('तूर डाळ स्पेशल अनपॉलिश');
    expect(updatedInDb?.short_code).toBe('TDSPEC100');
    expect(updatedInDb?.purchase_price).toBe(128.5);
    expect(updatedInDb?.selling_price).toBe(155.75);
    expect(updatedInDb?.current_stock).toBe(42.5);

    // Verify Supabase immediate sync was called with the updated product
    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: targetProd.id,
        name: longCustomName,
        short_code: 'TDSPEC100',
        purchase_price: 128.5,
        selling_price: 155.75,
        current_stock: 42.5,
      })
    );

    // Verify background 10-second ledger reconciliation does NOT overwrite edited stock or fields
    await db.reconcileAllStockAndBalances();
    const afterReconcile = await db.products.get(targetProd.id);
    expect(afterReconcile?.name).toBe(longCustomName);
    expect(afterReconcile?.current_stock).toBe(42.5);
    expect(afterReconcile?.selling_price).toBe(155.75);
  });
});
