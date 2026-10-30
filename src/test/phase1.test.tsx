import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { db } from '../db/db';
import { WALK_IN_CUSTOMER_ID } from '../types';
import {
  toPaise,
  toRupees,
  calculateReverseWeight,
  calculateProfitMarginPercent,
  formatINR,
  roundQty,
} from '../utils/math';
import App from '../App';
import { Shell } from '../components/layout/Shell';

describe('Phase 1 Verification Gate - DB Initialization & Seeding (REQ-02 & REQ-03)', () => {
  beforeEach(async () => {
    // Reset database state before each test
    await db.resetToDemoState();
  });

  it('REQ-02: Initializes DB, seeds WALK_IN_CUSTOMER, and persists Shop UPI ID', async () => {
    await db.initializeDatabase();

    // Verify WALK_IN_CUSTOMER exists and is seeded with correct invariants
    const walkIn = await db.customers.get(WALK_IN_CUSTOMER_ID);
    expect(walkIn).toBeDefined();
    expect(walkIn?.id).toBe('0000-WALK-IN');
    expect(walkIn?.name).toContain('Walk-in Customer');
    expect(walkIn?.current_udhari_balance).toBe(0);

    // Verify Shop Profile exists with UPI ID
    const initialProfile = await db.getShopProfile();
    expect(initialProfile).toBeDefined();
    expect(initialProfile.upi_vpa).toBe('kirana@upi');
    expect(initialProfile.shop_name).toContain('Kirana');

    // Test persistence across updates / page reloads
    const updatedVpa = 'patelkirana@okaxis';
    await db.updateShopProfile({ upi_vpa: updatedVpa, phone: '9898989898' });

    const reloadedProfile = await db.getShopProfile();
    expect(reloadedProfile.upi_vpa).toBe(updatedVpa);
    expect(reloadedProfile.phone).toBe('9898989898');
  });

  it('REQ-03: Seeds 25 realistic Indian General Store products and loads rapidly', async () => {
    const startTime = performance.now();
    const products = await db.products.toArray();
    const loadDuration = performance.now() - startTime;

    // Check count
    expect(products.length).toBe(25);

    // Check load performance (< 100ms in test environment, typically < 10ms)
    expect(loadDuration).toBeLessThan(100);

    // Verify key iconic Indian Kirana items are present
    const names = products.map((p) => p.name);
    expect(names.some((n) => n.includes('Tata Salt'))).toBe(true);
    expect(names.some((n) => n.includes('Fortune'))).toBe(true);
    expect(names.some((n) => n.includes('Sugar') || n.includes('Chini'))).toBe(true);
    expect(names.some((n) => n.includes('Parle-G'))).toBe(true);
    expect(names.some((n) => n.includes('Amul'))).toBe(true);
    expect(names.some((n) => n.includes('Maggi'))).toBe(true);
    expect(names.some((n) => n.includes('Tur Dal'))).toBe(true);

    // Verify Top-24 Fast-Tap Pareto grid configuration (Section 5.1)
    const quickTapItems = products.filter((p) => p.is_quick_tap);
    expect(quickTapItems.length).toBe(24);
  });

  it('REQ-03: "Clear Demo Data" cleanly wipes transactional tables while keeping products and schema intact', async () => {
    // Insert mock transactional rows
    await db.sales_invoices.add({
      id: 'inv-test-01',
      invoice_number: 'INV-20261030-001',
      customer_id: WALK_IN_CUSTOMER_ID,
      subtotal_amount: 500,
      discount_roundoff: 0,
      grand_total: 500,
      total_cogs: 400,
      payment_mode: 'CASH',
      amount_paid_now: 500,
      udhari_added: 0,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    });

    await db.sale_items.add({
      id: 'item-test-01',
      invoice_id: 'inv-test-01',
      product_id: 'prod-001',
      product_name_snapshot: 'Tata Salt',
      qty: 2,
      unit_purchase_cost: 24,
      unit_selling_price: 28,
      line_total: 56,
    });

    await db.khata_transactions.add({
      id: 'khata-test-01',
      customer_id: 'cust-001',
      entry_type: 'DEBIT_UDHARI_GIVEN',
      amount: 200,
      payment_channel: 'BILL_CREDIT',
      running_balance_after: 600,
      notes: 'Test credit',
      created_at: new Date().toISOString(),
    });

    // Execute Clear Demo Data
    await db.clearTransactionalData();

    // Verify transactional tables are completely emptied
    const invoiceCount = await db.sales_invoices.count();
    const itemCount = await db.sale_items.count();
    const khataCount = await db.khata_transactions.count();
    const expenseCount = await db.expenses_and_drawings.count();
    const gallaCount = await db.daily_galla_sessions.count();

    expect(invoiceCount).toBe(0);
    expect(itemCount).toBe(0);
    expect(khataCount).toBe(0);
    expect(expenseCount).toBe(0);
    expect(gallaCount).toBe(0);

    // Verify master product catalog remains intact (25 items)
    const productCount = await db.products.count();
    expect(productCount).toBe(25);

    // Verify WALK_IN_CUSTOMER remains intact
    const walkIn = await db.customers.get(WALK_IN_CUSTOMER_ID);
    expect(walkIn).toBeDefined();
  });
});

describe('Phase 1 Verification Gate - Math Precision & Accounting Invariants (REQ-19)', () => {
  it('Eliminates IEEE 754 floating point issues via integer paise math', () => {
    // In IEEE 754, 0.1 + 0.2 === 0.30000000000000004
    const p1 = toPaise(0.1);
    const p2 = toPaise(0.2);
    expect(toRupees(p1 + p2)).toBe(0.3);

    // Test standard Indian currency formatting
    expect(formatINR(123456.75)).toBe('₹1,23,456.75');
    expect(formatINR(500)).toBe('₹500.00');
  });

  it('Calculates Reverse Price-to-Weight correctly: W = X / R', () => {
    // Example from SRS Section 4.2: ₹30 of peanuts at ₹120/kg -> 0.250 kg
    const w1 = calculateReverseWeight(30, 120);
    expect(w1).toBe(0.25);

    // Example from SRS AT-02: Loose Sugar at ₹44/kg, customer asks for ₹22 -> 0.500 kg
    const w2 = calculateReverseWeight(22, 44);
    expect(w2).toBe(0.5);

    // REQ-08 test case: ₹11 of Loose Sugar at ₹44/kg -> 0.250 kg
    const w3 = calculateReverseWeight(11, 44);
    expect(w3).toBe(0.25);
  });

  it('Calculates Profit Margin %: ((selling - purchase) / selling) * 100', () => {
    // Selling 5.00, Purchase 4.20 -> ((5 - 4.20) / 5) * 100 = 16%
    const margin = calculateProfitMarginPercent(4.2, 5.0);
    expect(margin).toBe(16.0);

    // Selling 155, Purchase 135 -> ((155 - 135) / 155) * 100 = 12.9%
    const marginOil = calculateProfitMarginPercent(135, 155);
    expect(marginOil).toBe(12.9);
  });
});

describe('Phase 1 Verification Gate - Layout Shell & Viewport Responsiveness (REQ-01)', () => {
  beforeEach(() => {
    localStorage.setItem('kirana_guest_mode', 'true');
  });

  it('Renders desktop sidebar (1440x900) and mobile navigation bar (390x844)', async () => {
    const { container } = render(<App />);

    // Wait for DB initialization
    await waitFor(() => {
      expect(screen.queryByText(/Initializing Smart Kirana POS/i)).not.toBeInTheDocument();
    });

    // Check Desktop Sidebar structure (with lg:flex responsive utility class)
    const desktopAside = container.querySelector('aside');
    expect(desktopAside).toBeInTheDocument();
    expect(desktopAside?.className).toContain('hidden lg:flex');
    expect(desktopAside?.className).toContain('w-64');

    // Check Mobile Bottom Nav structure (with lg:hidden responsive utility class)
    const mobileNav = container.querySelector('nav.lg\\:hidden');
    expect(mobileNav).toBeInTheDocument();
    expect(mobileNav?.className).toContain('fixed bottom-0');

    // Verify all 5 primary views exist in navigation
    expect(screen.getAllByText(/POS/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Inventory|Stock/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Khata/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Galla/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reports/i).length).toBeGreaterThan(0);
  });

  it('Allows switching tabs smoothly between modules and Settings', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/Initializing Smart Kirana POS/i)).not.toBeInTheDocument();
    });

    // Find Settings button in sidebar
    const settingsBtns = screen.getAllByRole('button', { name: /Settings/i });
    expect(settingsBtns.length).toBeGreaterThan(0);

    // Click Settings
    fireEvent.click(settingsBtns[0]);

    // Verify Settings view is rendered
    await waitFor(() => {
      expect(screen.getByText(/Shop Profile &/i)).toBeInTheDocument();
      expect(screen.getByText(/Clear Sales & Transactions/i)).toBeInTheDocument();
    });
  });
});
