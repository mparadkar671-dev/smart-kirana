import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { db } from '../db/db';
import { BillingService } from '../services/billingService';
import { InventoryService } from '../services/inventoryService';
import { WALK_IN_CUSTOMER_ID, Product } from '../types';
import { POSView } from '../components/pos/POSView';

describe('Phase 3 Verification Gate - Split-View & Multi-Cart Isolation (REQ-07)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-07 Verification: 1-click Fast-Tap adds to active cart; switching Bill 1 and Bill 2 preserves state', async () => {
    const products = await db.products.toArray();
    const customers = await db.customers.toArray();

    render(
      <POSView
        products={products}
        customers={customers}
        shopProfile={{
          id: 'current_shop',
          shop_name: 'Test Kirana',
          owner_name: 'Tester',
          phone: '9876543210',
          upi_vpa: 'test@upi',
          address: 'Market',
          gst_footer_note: 'Footer',
          updated_at: new Date().toISOString(),
        }}
      />
    );

    // 1. Verify Fast-Tap grid exists and click Parle-G (PG5)
    const parleBtn = screen.getByTestId('fast-tap-PG5');
    expect(parleBtn).toBeInTheDocument();

    // Click once to add 1 Parle-G to Bill 1
    fireEvent.click(parleBtn);

    // Bill 1 should show 1 item in tab and in cart
    const bill1Tab = screen.getByTestId('cart-tab-1');
    expect(bill1Tab.textContent).toContain('1');

    // Verify row rendered in Bill 1
    expect(screen.getByTestId('cart-row-prod-004')).toBeInTheDocument();

    // 2. Switch to Bill 2 tab
    const bill2Tab = screen.getByTestId('cart-tab-2');
    fireEvent.click(bill2Tab);

    // Bill 2 must be empty initially
    expect(bill2Tab.textContent).toContain('0');
    expect(screen.queryByTestId('cart-row-prod-004')).not.toBeInTheDocument();

    // Add Maggi (MAG) to Bill 2
    const maggiBtn = screen.getByTestId('fast-tap-MAG');
    fireEvent.click(maggiBtn);
    expect(bill2Tab.textContent).toContain('1');
    expect(screen.getByTestId('cart-row-prod-006')).toBeInTheDocument();

    // 3. Switch back to Bill 1
    fireEvent.click(bill1Tab);

    // Bill 1 must still have Parle-G and not have Maggi
    expect(screen.getByTestId('cart-row-prod-004')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-row-prod-006')).not.toBeInTheDocument();
  });
});

describe('Phase 3 Verification Gate - Loose Weight & Reverse Price Calculator (REQ-08)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-08 Verification: Add Loose Sugar (₹44/kg) with ₹11 -> 0.250 kg, line total ₹11.00, stock deducts by 0.250 on checkout', async () => {
    // 1. Get initial Loose Sugar (prod-003) stock
    const sugarBefore = await db.products.get('prod-003');
    expect(sugarBefore).toBeDefined();
    const initialStock = sugarBefore!.current_stock; // e.g. 100.000 kg

    const products = await db.products.toArray();
    const customers = await db.customers.toArray();

    render(
      <POSView
        products={products}
        customers={customers}
      />
    );

    // 2. Click Loose Sugar (SUG) in Fast-Tap grid -> opens LooseItemModal
    const sugarBtn = screen.getByTestId('fast-tap-SUG');
    fireEvent.click(sugarBtn);

    // 3. In LooseItemModal, enter ₹11 in the reverse price box
    const amountInput = screen.getByTestId('loose-amount-input');
    fireEvent.change(amountInput, { target: { value: '11' } });

    // Verify calculated weight display is 0.250 kg (11 / 44 = 0.25)
    const weightDisplay = screen.getByTestId('calculated-weight-display');
    expect(weightDisplay.textContent).toContain('0.250');

    // 4. Confirm adding to bill
    const confirmBtn = screen.getByTestId('confirm-loose-btn');
    fireEvent.click(confirmBtn);

    // 5. Verify cart row in POS
    await waitFor(() => {
      const cartRow = screen.getByTestId('cart-row-prod-003');
      expect(cartRow.textContent).toContain('0.25');
      expect(cartRow.textContent).toContain('11.00');
    });

    // Verify grand total is ₹11.00
    const grandTotal = screen.getByTestId('pos-grand-total');
    expect(grandTotal.textContent).toBe('₹11.00');

    // 6. Click Cash Paid (F8) to checkout
    const cashBtn = screen.getByTestId('cash-checkout-btn');
    fireEvent.click(cashBtn);

    // 7. Verify stock in database deducted by exactly 0.250 kg
    await waitFor(async () => {
      const sugarAfter = await db.products.get('prod-003');
      expect(sugarAfter?.current_stock).toBe(initialStock - 0.25);
    });

    // Verify inventory log recorded SALE_OUT of -0.250
    const log = await db.inventory_logs
      .where({ product_id: 'prod-003' })
      .filter((l) => l.reason_type === 'SALE_OUT')
      .last();
    expect(log).toBeDefined();
    expect(log?.change_qty).toBe(-0.25);
  });
});

describe('Phase 3 Verification Gate - Complete Checkout Engine (REQ-09)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('Mode 1: 1-Click Walk-In Cash Checkout (F8) atomic updates', async () => {
    const salt = (await db.products.get('prod-001'))!;
    const initialStock = salt.current_stock;

    const res = await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: salt,
          qty: 2,
          unit_selling_price: 28,
          unit_purchase_cost: 24,
          line_total: 56,
        },
      ],
      subtotalAmount: 56,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 56,
      udhariAdded: 0,
    });

    // Invariant check
    expect(res.invoice.grand_total).toBe(56);
    expect(res.invoice.payment_mode).toBe('CASH');
    expect(res.invoice.amount_paid_now).toBe(56);
    expect(res.invoice.udhari_added).toBe(0);

    // Stock deduction
    const updatedSalt = await db.products.get('prod-001');
    expect(updatedSalt?.current_stock).toBe(initialStock - 2);

    // Daily galla cash updated
    const todayDate = new Date().toISOString().split('T')[0];
    const session = await db.daily_galla_sessions.where({ session_date: todayDate }).first();
    expect(session).toBeDefined();
    expect(session?.cash_sales_total).toBe(56);
  });

  it('Mode 2: UPI Checkout with exact amount', async () => {
    const oil = (await db.products.get('prod-002'))!;
    const res = await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: oil,
          qty: 1,
          unit_selling_price: 155,
          unit_purchase_cost: 135,
          line_total: 155,
        },
      ],
      subtotalAmount: 155,
      discountRoundoff: 0,
      paymentMode: 'UPI',
      amountPaidNow: 155,
      udhariAdded: 0,
    });

    expect(res.invoice.payment_mode).toBe('UPI');
    expect(res.invoice.grand_total).toBe(155);

    // Check dynamic UPI URL generation
    const url = BillingService.generateUpiIntentUrl('shop@upi', 'My Store', 155);
    expect(url).toContain('am=155.00');
    expect(url).toContain('pa=shop%40upi');
  });

  it('Mode 3: Full Udhari Checkout (F9) updates khata atomically', async () => {
    const customer = (await db.customers.get('cust-001'))!; // initial balance ₹400
    const biscuit = (await db.products.get('prod-004'))!; // ₹5 each

    const res = await BillingService.executeCheckout({
      customerId: customer.id,
      items: [
        {
          product: biscuit,
          qty: 10,
          unit_selling_price: 5,
          unit_purchase_cost: 4.2,
          line_total: 50,
        },
      ],
      subtotalAmount: 50,
      discountRoundoff: 0,
      paymentMode: 'UDHARI_FULL',
      amountPaidNow: 0,
      udhariAdded: 50,
    });

    expect(res.invoice.payment_mode).toBe('UDHARI_FULL');
    expect(res.invoice.udhari_added).toBe(50);

    // Verify customer balance increased by ₹50 (400 -> 450)
    const updatedCust = await db.customers.get('cust-001');
    expect(updatedCust?.current_udhari_balance).toBe(450.00);

    // Verify khata_transactions row
    const khataRow = await db.khata_transactions
      .where({ customer_id: 'cust-001' })
      .last();
    expect(khataRow).toBeDefined();
    expect(khataRow?.amount).toBe(50);
    expect(khataRow?.entry_type).toBe('DEBIT_UDHARI_GIVEN');
    expect(khataRow?.running_balance_after).toBe(450.00);
  });

  it('Mode 4: Split Payment (Bill ₹350 -> ₹200 Cash paid now + ₹150 Udhari) + Bargain Round-Off', async () => {
    const customer = (await db.customers.get('cust-001'))!;
    const initialBal = customer.current_udhari_balance; // 400

    // Bill subtotal: ₹354, with ₹4 bargain roundoff -> grand_total = ₹350
    const res = await BillingService.executeCheckout({
      customerId: customer.id,
      items: [
        {
          product: (await db.products.get('prod-001'))!,
          qty: 1,
          unit_selling_price: 354,
          unit_purchase_cost: 300,
          line_total: 354,
        },
      ],
      subtotalAmount: 354,
      discountRoundoff: 4, // 1-Click Bargain Round-Off
      paymentMode: 'SPLIT_PARTIAL',
      amountPaidNow: 200, // ₹200 Cash paid now
      udhariAdded: 150, // ₹150 added to Udhari
      notes: 'CASH',
    });

    // Invariant check: subtotal - discount = grand_total = paid + udhari
    expect(res.invoice.subtotal_amount).toBe(354);
    expect(res.invoice.discount_roundoff).toBe(4);
    expect(res.invoice.grand_total).toBe(350);
    expect(res.invoice.amount_paid_now).toBe(200);
    expect(res.invoice.udhari_added).toBe(150);

    // Verify customer balance increased by exactly ₹150 (initialBal + 150)
    const updatedCust = await db.customers.get('cust-001');
    expect(updatedCust?.current_udhari_balance).toBe(initialBal + 150);

    // Verify daily galla cash increased by ₹200
    const todayDate = new Date().toISOString().split('T')[0];
    const session = await db.daily_galla_sessions.where({ session_date: todayDate }).first();
    expect(session?.cash_sales_total).toBe(200);
  });
});

