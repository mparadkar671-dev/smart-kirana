import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { db } from '../db/db';
import { KhataService } from '../services/khataService';
import { Customer, ShopProfile } from '../types';
import { KhataView } from '../components/khata/KhataView';
import { CustomerPassbookDrawer } from '../components/khata/CustomerPassbookDrawer';
import { ReceiveJamaModal } from '../components/khata/ReceiveJamaModal';

describe('Phase 4 Verification Gate - Khatabook Dashboard & Aging Sort (REQ-10)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-10: Sorts customer list by highest pending Udhari and accurately computes aging days', async () => {
    const customers = await db.customers.toArray();
    const validCustomers = customers.filter((c) => c.id !== '0000-WALK-IN');

    // In demo seed:
    // Suresh Verma owes 1850.00 (22 days old)
    // Ramesh Sharma owes 400.00 (18 days old)
    // Pooja Tiwari owes 350.00 (6 days old)
    render(
      <KhataView
        customers={customers}
        shopProfile={{
          id: 'current_shop',
          shop_name: 'Test Kirana',
          owner_name: 'Tester',
          phone: '9876543210',
          upi_vpa: 'kirana@upi',
          address: 'Main Bazar',
          gst_footer_note: '',
          updated_at: new Date().toISOString(),
        }}
      />
    );

    // Verify top KPI bar
    const totalUdhariElem = screen.getByTestId('total-market-udhari');
    // Total = 1850 + 400 + 350 = 2600.00
    expect(totalUdhariElem.textContent).toContain('₹2,600.00');

    // Overdue > 15 days count: Suresh (22d) and Ramesh (18d) = 2
    const overdueCountElem = screen.getByTestId('overdue-count');
    expect(overdueCountElem.textContent).toContain('2 Customers');

    // Verify sorting by highest balance:
    // The table rows should list Suresh Verma (1850) first, then Ramesh (400), then Pooja (350)
    const rows = screen.getAllByTestId(/customer-row-/);
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Suresh Verma');
    expect(rows[0].textContent).toContain('₹1,850.00');
    expect(rows[1].textContent).toContain('Ramesh Sharma');
    expect(rows[1].textContent).toContain('₹400.00');
    expect(rows[2].textContent).toContain('Pooja Tiwari');
    expect(rows[2].textContent).toContain('₹350.00');

    // Verify aging days computation
    const agingSuresh = KhataService.getAgingDays(
      validCustomers.find((c) => c.name.includes('Suresh'))?.oldest_unpaid_date
    );
    expect(agingSuresh).toBeGreaterThanOrEqual(21);
  });
});

describe('Phase 4 Verification Gate - Partial Settlement & Daily Galla Cash (REQ-11)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-11 Verification: Customer owes ₹850, pays ₹500 via Cash -> balance becomes ₹350, appends credit row, Galla Cash increases by ₹500', async () => {
    // 1. Create a customer owing exactly ₹850
    const custId = `cust-test-850`;
    await db.customers.add({
      id: custId,
      name: 'Vikas Gupta',
      phone: '9811223344',
      address_landmark: 'Civil Lines',
      credit_limit: 2000,
      current_udhari_balance: 850.00,
      oldest_unpaid_date: new Date(Date.now() - 10 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const initialGalla = await db.daily_galla_sessions
      .where({ session_date: new Date().toISOString().split('T')[0] })
      .first();
    const initialGallaCash = initialGalla?.expected_closing_cash || 0;

    // 2. Execute partial payment settlement: pays ₹500 via CASH
    const res = await KhataService.recordJamaPayment({
      customerId: custId,
      amount: 500.00,
      paymentChannel: 'CASH',
      notes: 'Partial payment against Diwali groceries',
    });

    // 3. Verify customer balance becomes ₹350
    expect(res.customer.current_udhari_balance).toBe(350.00);

    const reloadedCust = await db.customers.get(custId);
    expect(reloadedCust?.current_udhari_balance).toBe(350.00);

    // 4. Verify khata_transactions appends a credit row
    expect(res.transaction.entry_type).toBe('CREDIT_JAMA_RECEIVED');
    expect(res.transaction.amount).toBe(500.00);
    expect(res.transaction.payment_channel).toBe('CASH');
    expect(res.transaction.running_balance_after).toBe(350.00);

    const txInDb = await db.khata_transactions.get(res.transaction.id);
    expect(txInDb).toBeDefined();

    // 5. Verify Daily Galla Cash increases by ₹500
    const todayDate = new Date().toISOString().split('T')[0];
    const updatedGalla = await db.daily_galla_sessions
      .where({ session_date: todayDate })
      .first();
    expect(updatedGalla).toBeDefined();
    expect(updatedGalla?.cash_udhari_recovered).toBeGreaterThanOrEqual(500.00);
    expect(updatedGalla?.expected_closing_cash).toBe(initialGallaCash + 500.00);
  });

  it('AT-07 Scenario: Customer Ramesh (balance ₹400) pays ₹150 via UPI scan', async () => {
    // Ramesh Sharma has initial balance 400.00 in demo state
    const ramesh = (await db.customers.get('cust-001'))!;
    expect(ramesh.current_udhari_balance).toBe(400.00);

    const res = await KhataService.recordJamaPayment({
      customerId: ramesh.id,
      amount: 150.00,
      paymentChannel: 'UPI',
      notes: 'UPI GPay payment',
    });

    // Ramesh's balance drops to ₹250.00
    expect(res.customer.current_udhari_balance).toBe(250.00);
    expect(res.transaction.running_balance_after).toBe(250.00);
    expect(res.transaction.payment_channel).toBe('UPI');

    const updatedRamesh = await db.customers.get('cust-001');
    expect(updatedRamesh?.current_udhari_balance).toBe(250.00);
  });
});

describe('Phase 4 Verification Gate - Free WhatsApp Engine & Deep Link (REQ-12 & REQ-27)', () => {
  it('REQ-12 Verification: URL contains 91 prefix, polite UTF-8 text, and exact am= matching current balance', () => {
    const customer: Customer = {
      id: 'cust-wa-01',
      name: 'Ramesh Sharma',
      phone: '9876543210',
      credit_limit: 2000,
      current_udhari_balance: 400.00,
      oldest_unpaid_date: new Date(Date.now() - 10 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };

    const shopProfile: ShopProfile = {
      id: 'current_shop',
      shop_name: 'Shree Ganesh Kirana',
      owner_name: 'Ramesh Patel',
      phone: '9876543210',
      upi_vpa: 'ganeshkirana@upi',
      address: 'Station Road',
      gst_footer_note: '',
      updated_at: new Date().toISOString(),
    };

    const waUrl = KhataService.generateWhatsAppLink({
      customer,
      shopProfile,
      tier: 1,
    });

    // 1. Verify URL starts with valid wa.me and 10-digit Indian phone with 91 prefix
    expect(waUrl).toContain('https://wa.me/919876543210?text=');

    // 2. Decode the encoded message text
    const urlParts = waUrl.split('?text=');
    const decodedMsg = decodeURIComponent(urlParts[1]);

    // 3. Verify Neutral System Authority framing (REQ-27)
    expect(decodedMsg).toContain('Automated Ledger Update from Shree Ganesh Kirana Billing System');
    expect(decodedMsg).toContain('Namaste *Ramesh Sharma* ji');

    // 4. Verify exact pending balance (400.00)
    expect(decodedMsg).toContain('₹400.00');

    // 5. Verify embedded 1-tap UPI link contains am=400.00 and VPA
    expect(decodedMsg).toContain('am=400.00');
    expect(decodedMsg).toContain('pa=ganeshkirana%40upi');
  });

  it('Correctly cleans numbers with leading 0 or +91', () => {
    expect(KhataService.cleanIndianPhone('+91 98765-43210')).toBe('9876543210');
    expect(KhataService.cleanIndianPhone('09876543210')).toBe('9876543210');
    expect(KhataService.cleanIndianPhone('919876543210')).toBe('9876543210');
  });
});
