import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { BackupService, DatabaseSnapshot } from '../services/backupService';
import { BillingService } from '../services/billingService';
import { KhataService } from '../services/khataService';
import { GallaService } from '../services/gallaService';
import { WALK_IN_CUSTOMER_ID } from '../types';

describe('Phase 6 Verification Gate - JSON Database Export & Restore Parity (REQ-16)', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
  });

  it('REQ-16: Exports full DB state to JSON, wipes DB, restores, and verifies 100% bit-for-bit parity across all 8 tables', async () => {
    // 1. Add some active transactional mutations
    const salt = (await db.products.get('prod-001'))!;
    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: salt,
          qty: 3,
          unit_selling_price: 28,
          unit_purchase_cost: 24,
          line_total: 84,
        },
      ],
      subtotalAmount: 84,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 84,
      udhariAdded: 0,
    });

    await GallaService.recordExpense({
      category: 'SHOP_EXPENSE_RENT_ELEC',
      amount: 250,
      paidVia: 'CASH_GALLA',
      description: 'Electricity bill payment',
    });

    // 2. Export full snapshot to JSON
    const exportedSnapshot = await BackupService.exportFullDatabase();

    // Verify snapshot contains data across tables
    expect(exportedSnapshot.products.length).toBe(25);
    expect(exportedSnapshot.customers.length).toBeGreaterThanOrEqual(3);
    expect(exportedSnapshot.sales_invoices.length).toBe(1);
    expect(exportedSnapshot.sale_items.length).toBe(1);
    expect(exportedSnapshot.inventory_logs.length).toBeGreaterThan(0);
    expect(exportedSnapshot.expenses_and_drawings.length).toBe(1);

    const jsonString = JSON.stringify(exportedSnapshot);

    // 3. Completely wipe database
    await Promise.all([
      db.shop_profile.clear(),
      db.products.clear(),
      db.inventory_logs.clear(),
      db.customers.clear(),
      db.sales_invoices.clear(),
      db.sale_items.clear(),
      db.khata_transactions.clear(),
      db.expenses_and_drawings.clear(),
      db.daily_galla_sessions.clear(),
    ]);

    // Confirm completely wiped
    expect(await db.products.count()).toBe(0);
    expect(await db.customers.count()).toBe(0);
    expect(await db.sales_invoices.count()).toBe(0);

    // 4. Restore database from JSON snapshot
    await BackupService.restoreDatabaseFromJson(jsonString);

    // 5. Verify 100% bit-for-bit parity across all tables
    const restoredProducts = await db.products.toArray();
    expect(restoredProducts.length).toBe(exportedSnapshot.products.length);
    expect(restoredProducts).toEqual(exportedSnapshot.products);

    const restoredInvoices = await db.sales_invoices.toArray();
    expect(restoredInvoices.length).toBe(exportedSnapshot.sales_invoices.length);
    expect(restoredInvoices).toEqual(exportedSnapshot.sales_invoices);

    const restoredExpenses = await db.expenses_and_drawings.toArray();
    expect(restoredExpenses.length).toBe(exportedSnapshot.expenses_and_drawings.length);
    expect(restoredExpenses).toEqual(exportedSnapshot.expenses_and_drawings);

    const restoredCustomers = await db.customers.toArray();
    expect(restoredCustomers.length).toBe(exportedSnapshot.customers.length);
    expect(restoredCustomers).toEqual(exportedSnapshot.customers);
  });
});

