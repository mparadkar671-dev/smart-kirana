import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { db } from '../db/db';
import {
  generateUniqueStoreBarcode,
  isValidEan13,
  calculateEan13CheckDigit,
} from '../utils/barcodeGenerator';
import { compressProductImage } from '../utils/imageCompressor';
import { WholesalerService } from '../services/wholesalerService';
import { InventoryService } from '../services/inventoryService';
import { ProductModal } from '../components/inventory/ProductModal';
import { RestockAlertsView } from '../components/inventory/RestockAlertsView';
import { POSView } from '../components/pos/POSView';

describe('Wholesaler Management, Auto-Barcode & Top-24 Product Image Upgrade Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.clearAllRecordsToEmpty();
    await db.initializeDatabase();
  });

  it('1. generateUniqueStoreBarcode() outputs valid 13-digit EAN-13 starting with 200 and never duplicates existing barcodes', () => {
    const existing = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const code = generateUniqueStoreBarcode(existing);
      expect(code).toMatch(/^200\d{10}$/);
      expect(code.length).toBe(13);
      expect(isValidEan13(code)).toBe(true);

      const expectedCheck = calculateEan13CheckDigit(code.slice(0, 12));
      expect(Number(code[12])).toBe(expectedCheck);

      // Must never duplicate an existing barcode
      expect(existing.has(code)).toBe(false);
      existing.add(code);
    }
  });

  it('2. Adding a new Wholesaler inline inside ProductModal persists to db.wholesalers and links product.wholesaler_id + supports fractional 0.5kg threshold & 5.250kg stock', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <ProductModal
        isOpen={true}
        onClose={onClose}
        productToEdit={null}
        onSaved={onSaved}
      />
    );

    // Wait for auto-generated barcode to populate
    const barcodeInput = (await screen.findByTestId('product-barcode-input')) as HTMLInputElement;
    await waitFor(() => {
      expect(barcodeInput.value).toMatch(/^200\d{10}$/);
    });

    // Click "+ New Wholesaler" quick-toggle button
    const toggleBtn = screen.getByTestId('toggle-inline-wholesaler-btn');
    fireEvent.click(toggleBtn);

    // Fill inline wholesaler mini-form
    fireEvent.change(screen.getByTestId('inline-ws-name'), {
      target: { value: 'Laxmi Grain Agency' },
    });
    fireEvent.change(screen.getByTestId('inline-ws-agency'), {
      target: { value: 'Loose Grains & Pulses' },
    });
    fireEvent.change(screen.getByTestId('inline-ws-phone'), {
      target: { value: '9820556677' },
    });

    // Click "Save Wholesaler"
    fireEvent.click(screen.getByTestId('save-inline-wholesaler-btn'));

    // Verify wholesaler was persisted in db.wholesalers and auto-selected in dropdown
    const selectEl = screen.getByTestId('wholesaler-select') as HTMLSelectElement;
    await waitFor(async () => {
      const allWs = await db.wholesalers.toArray();
      const created = allWs.find((w) => w.name === 'Laxmi Grain Agency');
      expect(created).toBeDefined();
      expect(selectEl.value).toBe(created!.id);
    });

    // Now fill product details with fractional stock (5.250 kg) and fractional low-stock limit (0.500 kg)
    const nameInput = screen.getByTestId('product-name-input');
    fireEvent.change(nameInput, { target: { value: 'Loose Moong Dal Premium' } });

    const shortCodeInput = screen.getByTestId('product-shortcode-input');
    fireEvent.change(shortCodeInput, { target: { value: 'MD5' } });

    const unitSelect = screen.getByTestId('unit-type-select');
    fireEvent.change(unitSelect, { target: { value: 'KG_LOOSE' } });

    const purchaseInput = screen.getByTestId('purchase-price-input');
    fireEvent.change(purchaseInput, { target: { value: '95' } });

    const sellingInput = screen.getByTestId('selling-price-input');
    fireEvent.change(sellingInput, { target: { value: '115' } });

    const stockInput = screen.getByTestId('current-stock-input');
    fireEvent.change(stockInput, { target: { value: '5.25' } });

    const thresholdInput = screen.getByTestId('low-stock-threshold-input');
    fireEvent.change(thresholdInput, { target: { value: '0.5' } });

    // Submit form
    const saveProductBtn = screen.getByTestId('save-product-submit-btn');
    fireEvent.click(saveProductBtn);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const savedProd = await db.products.where('short_code').equals('MD5').first();
    expect(savedProd).toBeDefined();
    expect(savedProd!.current_stock).toBe(5.25);
    expect(savedProd!.low_stock_threshold).toBe(0.5);
    expect(savedProd!.barcode).toMatch(/^200\d{10}$/);

    const savedWholesaler = await db.wholesalers.get(savedProd!.wholesaler_id!);
    expect(savedWholesaler).toBeDefined();
    expect(savedWholesaler!.name).toBe('Laxmi Grain Agency');
    expect(savedWholesaler!.phone).toBe('9820556677');
  });

  it('3. Clicking "📲 Send Order List on WhatsApp" for a wholesaler generates a wa.me URL containing only that wholesaler\'s products', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const ws1 = await WholesalerService.createWholesaler({
      name: 'Parle & Britannia Agency',
      agency_or_brand: 'Biscuits',
      phone: '9811122233',
    });

    const ws2 = await WholesalerService.createWholesaler({
      name: 'Shree Oil Depot',
      agency_or_brand: 'Edible Oils',
      phone: '9844455566',
    });

    const p1 = await InventoryService.createProduct({
      name: 'Good Day Butter 100g',
      short_code: 'GDB100',
      category: 'Biscuits',
      unit_type: 'PACK',
      purchase_price: 16,
      selling_price: 20,
      mrp: 20,
      current_stock: 2,
      low_stock_threshold: 10,
      wholesaler_id: ws1.id,
      last_supplier_name: ws1.name,
      supplier_phone: ws1.phone,
      is_quick_tap: false,
    });

    const p2 = await InventoryService.createProduct({
      name: 'Fortune Sunlite Oil 1L',
      short_code: 'FSO1L',
      category: 'Oil & Ghee',
      unit_type: 'PACK',
      purchase_price: 130,
      selling_price: 145,
      mrp: 155,
      current_stock: 1,
      low_stock_threshold: 5,
      wholesaler_id: ws2.id,
      last_supplier_name: ws2.name,
      supplier_phone: ws2.phone,
      is_quick_tap: false,
    });

    const allProducts = [p1, p2];

    render(
      <RestockAlertsView
        products={allProducts}
        shopProfile={{
          id: 'current_shop',
          shop_name: 'Shree Ganesh Kirana',
          owner_name: 'Owner',
          phone: '9876543210',
          upi_vpa: 'store@upi',
          address: 'Main Market',
          gst_footer_note: '',
          updated_at: new Date().toISOString(),
        }}
      />
    );

    const ws1Btn = await screen.findByTestId(`send-whatsapp-order-${ws1.id}`);
    fireEvent.click(ws1Btn);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const openedUrl = openSpy.mock.calls[0][0] as string;
    expect(openedUrl).toContain('https://wa.me/919811122233?text=');

    const decodedText = decodeURIComponent(openedUrl.split('?text=')[1]);
    expect(decodedText).toContain('Namaste *Parle & Britannia Agency* ji');
    expect(decodedText).toContain('Purchase Order from Shree Ganesh Kirana');
    expect(decodedText).toContain('Good Day Butter 100g');
    // Must NOT include ws2's product
    expect(decodedText).not.toContain('Fortune Sunlite Oil 1L');

    openSpy.mockRestore();
  });

  it('4. Top-24 Fast-Tap Grid in POSView renders product.image_url, name, and selling_price, and does NOT render short_code visibly on card face while still finding item via F2 short_code search', async () => {
    const sampleImageDataUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

    const testProd = await InventoryService.createProduct({
      name: 'Tata Sampann Toor Dal 1kg',
      short_code: 'TSTD99',
      category: 'Grains & Pulses',
      unit_type: 'PACK',
      purchase_price: 140,
      selling_price: 165,
      mrp: 180,
      current_stock: 12,
      low_stock_threshold: 4,
      is_quick_tap: true,
      image_url: sampleImageDataUrl,
    });

    render(<POSView products={[testProd]} customers={[]} />);

    const fastTapGrid = screen.getByTestId('fast-tap-grid');
    const cardBtn = within(fastTapGrid).getByTestId('fast-tap-TSTD99');

    // Renders product image
    const imgEl = within(cardBtn).getByTestId(`fast-tap-img-${testProd.id}`) as HTMLImageElement;
    expect(imgEl.src).toBe(sampleImageDataUrl);

    // Renders product name and selling price
    expect(within(cardBtn).getByText('Tata Sampann Toor Dal 1kg')).toBeInTheDocument();
    expect(cardBtn.textContent).toContain('₹165');

    // Does NOT render short_code visibly on the card face
    expect(cardBtn.textContent).not.toContain('TSTD99');

    // Searching short_code in F2 search input still finds the product immediately
    const searchInput = screen.getByTestId('pos-search-input');
    fireEvent.change(searchInput, { target: { value: 'TSTD99' } });

    const dropdown = await screen.findByTestId('search-results-dropdown');
    expect(within(dropdown).getByText('Tata Sampann Toor Dal 1kg')).toBeInTheDocument();
  });

  it('5. compressProductImage() returns a valid compact DataURL (< 15KB)', async () => {
    const fakeFile = new File(['dummy-image-bytes'], 'biscuit.png', { type: 'image/png' });
    const dataUrl = await compressProductImage(fakeFile);
    expect(dataUrl.startsWith('data:image/')).toBe(true);
    expect(dataUrl.length).toBeLessThan(15 * 1024 * 1.37);
  });
});
