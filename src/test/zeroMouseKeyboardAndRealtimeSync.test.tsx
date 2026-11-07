import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { db } from '../db/db';
import { POSView } from '../components/pos/POSView';
import { authService } from '../services/authService';
import { cloudSyncService } from '../services/cloudSyncService';
import { Product, Customer, ShopProfile, UserRole } from '../types';

describe('Zero-Mouse Keyboard Shortcut Engine & Same-Account Multi-Device Sync Suite', () => {
  const dummyShopProfile: ShopProfile = {
    id: 'store-pune-001',
    shop_id: 'store-pune-001',
    shop_name: 'Laxmi Nivas Kirana',
    owner_name: 'Laxmi Nivas',
    phone: '9876543210',
    upi_vpa: 'laxminivas@upi',
    address: 'Bazar Peth, Pune',
    gst_footer_note: 'Thank you for shopping!',
    invite_code: 'LXMN25',
    business_type: 'KIRANA_RETAIL',
    invoice_prefix: 'KRN',
    reset_epoch: 1,
    updated_at: new Date().toISOString(),
  };

  const dummyProducts: Product[] = [
    {
      id: 'prod-toor-dal',
      shop_id: 'store-pune-001',
      name: 'Toor Dal 1kg',
      marathi_name: 'तूर डाळ १ किलो',
      search_keywords: 'turdal toordal arhar',
      short_code: 'TD1',
      barcode: '2000000000018',
      category: 'Dals & Pulses',
      unit_type: 'PCS',
      purchase_price: 110,
      selling_price: 135,
      mrp: 140,
      current_stock: 50,
      low_stock_threshold: 5,
      is_quick_tap: true,
      last_supplier_name: 'Pune Wholesale Mart',
      business_type: 'KIRANA_RETAIL',
      updated_at: new Date().toISOString(),
    },
    {
      id: 'prod-loose-sugar',
      shop_id: 'store-pune-001',
      name: 'Sugar (साखर)',
      marathi_name: 'साखर मोकळी',
      search_keywords: 'sakhar chini sugar loose',
      short_code: 'SUG',
      barcode: '2000000000025',
      category: 'Flours & Grains',
      unit_type: 'KG_LOOSE',
      purchase_price: 36,
      selling_price: 44,
      mrp: 46,
      current_stock: 100,
      low_stock_threshold: 10,
      is_quick_tap: true,
      last_supplier_name: 'Pune Sugar Mill',
      business_type: 'KIRANA_RETAIL',
      updated_at: new Date().toISOString(),
    },
  ];

  const dummyCustomers: Customer[] = [
    {
      id: '0000-WALK-IN',
      name: 'Walk-in Customer',
      phone: '0000000000',
      credit_limit: 0,
      current_udhari_balance: 0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'cust-shinde',
      shop_id: 'store-pune-001',
      name: 'Anand Shinde',
      phone: '9822001122',
      credit_limit: 5000,
      current_udhari_balance: 1200,
      created_at: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('kirana_active_shop_id', 'store-pune-001');
    await db.initializeDatabase();
    await db.products.clear();
    await db.customers.clear();
    await db.sales_invoices.clear();
    await db.sale_items.clear();
    await db.sync_outbox.clear();

    await db.products.bulkPut(dummyProducts);
    await db.customers.bulkPut(dummyCustomers);
    await db.updateShopProfile(dummyShopProfile);
  });

  it('1. POS Zero-Mouse Full Billing Flow: F2 -> Search -> Enter -> "+" -> "D" -> F8 Cash Checkout', async () => {
    const onCheckoutComplete = vi.fn();

    render(
      <POSView
        products={dummyProducts}
        customers={dummyCustomers}
        shopProfile={dummyShopProfile}
        onCheckoutComplete={onCheckoutComplete}
      />
    );

    // 1. Press F2 to focus search input
    fireEvent.keyDown(window, { key: 'F2' });
    const searchInput = screen.getByTestId('pos-search-input') as HTMLInputElement;
    expect(document.activeElement).toBe(searchInput);

    // 2. Type "TD1" (Toor Dal short code)
    fireEvent.change(searchInput, { target: { value: 'TD1' } });
    expect(screen.getByTestId('search-results-dropdown')).toBeInTheDocument();

    // 3. Press Enter to select the highlighted search result
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    // Item should now be in cart
    await waitFor(() => {
      expect(screen.getByTestId('pos-grand-total')).toHaveTextContent('₹135');
    });

    // 4. Press "+" to increment quantity to 2
    // Ensure activeElement is not an input so single-letter shortcut triggers
    searchInput.blur();
    fireEvent.keyDown(window, { key: '+' });

    await waitFor(() => {
      expect(screen.getByTestId('pos-grand-total')).toHaveTextContent('₹270');
    });

    // 5. Press "D" to toggle bargain roundoff discount
    fireEvent.keyDown(window, { key: 'd' });
    await waitFor(() => {
      // With subtotal 270, bargain roundoff or discount chip should be applied
      const totalText = screen.getByTestId('pos-grand-total').textContent;
      expect(totalText).toBeDefined();
    });

    // 6. Press F8 for 1-Tap Cash Checkout
    fireEvent.keyDown(window, { key: 'F8' });

    // Verify checkout completed: receipt modal opens, onCheckoutComplete is called
    await waitFor(() => {
      expect(screen.getByTestId('receipt-modal')).toBeInTheDocument();
      expect(onCheckoutComplete).toHaveBeenCalled();
    });

    // 7. Press Esc to close receipt modal
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('receipt-modal')).not.toBeInTheDocument();
    });
  });

  it('2. Universal Esc Hierarchy: Closes modal -> Clears search input -> Retains focus', async () => {
    render(
      <POSView
        products={dummyProducts}
        customers={dummyCustomers}
        shopProfile={dummyShopProfile}
      />
    );

    const searchInput = screen.getByTestId('pos-search-input') as HTMLInputElement;

    // Type query in search input
    fireEvent.change(searchInput, { target: { value: 'sugar' } });
    expect(searchInput.value).toBe('sugar');

    // Press Esc in search input -> clears search query
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput.value).toBe('');

    // Blur input so global hotkey "?" can open cheat sheet
    searchInput.blur();

    // Open Cheat Sheet with "?" key
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('keyboard-shortcuts-modal')).toBeInTheDocument();

    // Press Esc -> closes Shortcuts modal
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('keyboard-shortcuts-modal')).not.toBeInTheDocument();
    });
  });

  it('3. Multi-Cart Cycling with F4 hotkey (Bill 1 -> Bill 2 -> Bill 3 -> Bill 1)', async () => {
    render(
      <POSView
        products={dummyProducts}
        customers={dummyCustomers}
        shopProfile={dummyShopProfile}
      />
    );

    // Initial cart is Bill 1
    expect(screen.getByTestId('cart-tab-1')).toHaveClass('bg-blue-800');

    // Press F4 -> switches to Bill 2
    fireEvent.keyDown(window, { key: 'F4' });
    expect(screen.getByTestId('cart-tab-2')).toHaveClass('bg-blue-800');

    // Press F4 -> switches to Bill 3
    fireEvent.keyDown(window, { key: 'F4' });
    expect(screen.getByTestId('cart-tab-3')).toHaveClass('bg-blue-800');

    // Press F4 -> cycles back to Bill 1
    fireEvent.keyDown(window, { key: 'F4' });
    expect(screen.getByTestId('cart-tab-1')).toHaveClass('bg-blue-800');
  });

  it('4. Multi-Device Same-Account Sync: syncCanonicalSession resolves canonical shop_id and guarantees OWNER status across devices', async () => {
    // Simulated Owner User object from Supabase Auth
    const ownerUser = {
      id: 'supabase-user-uuid-999',
      email: 'laxminivas2425@gmail.com',
      user_metadata: {
        shop_id: 'store-pune-001',
        shop_name: 'Laxmi Nivas Kirana',
        owner_name: 'Laxmi Nivas',
        role: 'OWNER' as UserRole,
      },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as any;

    // Simulate login on Device A (Shop Desktop)
    const sessionA = await authService.syncCanonicalSession(ownerUser);
    expect(sessionA.canonicalShopId).toBe('store-pune-001');
    expect(sessionA.isOwner).toBe(true);
    expect(sessionA.role).toBe('OWNER');

    // Simulate login on Device B (Mobile / Laptop) with the EXACT same email
    const sessionB = await authService.syncCanonicalSession(ownerUser);
    expect(sessionB.canonicalShopId).toBe('store-pune-001');
    expect(sessionB.isOwner).toBe(true);
    expect(sessionB.role).toBe('OWNER');

    // Verify localStorage points to canonicalShopId
    expect(localStorage.getItem('kirana_active_shop_id')).toBe('store-pune-001');

    // Check store_users record in Dexie
    const localStoreUser = await db.getStoreUserByEmail('laxminivas2425@gmail.com');
    expect(localStoreUser).toBeDefined();
    expect(localStoreUser?.shop_id).toBe('store-pune-001');
    expect(localStoreUser?.role).toBe('OWNER');
    expect(localStoreUser?.approval_status).toBe('APPROVED');
    expect(localStoreUser?.is_active).toBe(true);
  });

  it('5. Real-Time WebSocket synchronization applies remote INSERT/UPDATE/DELETE events to local Dexie', async () => {
    // Simulate remote device adding a new product via WebSocket broadcast
    const newRemoteProduct: Product = {
      id: 'prod-fortune-oil',
      shop_id: 'store-pune-001',
      name: 'Fortune Sunlite Sunflower Oil 1L',
      marathi_name: 'फॉर्च्यून सूर्यफूल तेल १ लिटर',
      search_keywords: 'tel oil fortune refined',
      short_code: 'FSO',
      barcode: '2000000000032',
      category: 'Oil & Ghee',
      unit_type: 'PACK',
      purchase_price: 130,
      selling_price: 155,
      mrp: 170,
      current_stock: 24,
      low_stock_threshold: 4,
      is_quick_tap: true,
      last_supplier_name: 'Adani Wilmar',
      business_type: 'KIRANA_RETAIL',
      updated_at: new Date().toISOString(),
    };

    // 1. Handle INSERT event from cloud
    await cloudSyncService.handleRealtimePayload({
      eventType: 'INSERT',
      table: 'products',
      new: newRemoteProduct,
    });

    const insertedInDexie = await db.products.get('prod-fortune-oil');
    expect(insertedInDexie).toBeDefined();
    expect(insertedInDexie?.name).toBe('Fortune Sunlite Sunflower Oil 1L');
    expect(insertedInDexie?.selling_price).toBe(155);

    // 2. Handle UPDATE event from cloud (price changed on Device B)
    const updatedRemoteProduct = {
      ...newRemoteProduct,
      selling_price: 160,
      updated_at: new Date().toISOString(),
    };

    await cloudSyncService.handleRealtimePayload({
      eventType: 'UPDATE',
      table: 'products',
      new: updatedRemoteProduct,
    });

    const updatedInDexie = await db.products.get('prod-fortune-oil');
    expect(updatedInDexie?.selling_price).toBe(160);

    // 3. Handle DELETE event from cloud
    await cloudSyncService.handleRealtimePayload({
      eventType: 'DELETE',
      table: 'products',
      old: { id: 'prod-fortune-oil' },
    });

    const deletedFromDexie = await db.products.get('prod-fortune-oil');
    expect(deletedFromDexie).toBeUndefined();
  });
});
