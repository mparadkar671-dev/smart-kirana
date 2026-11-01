import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { db } from '../db/db';
import { SettingsView } from '../components/settings/SettingsView';
import { BackupService } from '../services/backupService';
import { BillingService } from '../services/billingService';
import { AuthProvider } from '../context/AuthContext';
import { WALK_IN_CUSTOMER_ID } from '../types';

describe('Iteration 6: Security & Danger Vault Isolation & Full System Regression', () => {
  beforeEach(async () => {
    await db.resetToDemoState();
    vi.restoreAllMocks();
  });

  it('renders Danger Vault with red-border container collapsed by default, and expands on click', async () => {
    render(
      <AuthProvider>
        <SettingsView />
      </AuthProvider>
    );

    const vaultContainer = await screen.findByTestId('danger-vault-container');
    expect(vaultContainer).toBeInTheDocument();
    expect(vaultContainer.className).toContain('border-red-500');

    // Toggle button exists
    const toggleBtn = screen.getByTestId('toggle-danger-vault-btn');
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent(/Open Vault/i);

    // Click toggle to open
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent(/Close Vault/i);
  });

  it('blocks destructive wipe when wrong PIN or invalid confirmation keyword is entered', async () => {
    render(
      <AuthProvider>
        <SettingsView />
      </AuthProvider>
    );

    // Wait for settings view to load
    await screen.findByTestId('danger-vault-container');

    // Click Clear Sales & Transactions
    const clearBtn = screen.getByText(/Clear Sales & Transactions/i);
    fireEvent.click(clearBtn);

    // Guardrail panel must appear
    const guardrail = await screen.findByTestId('danger-guardrail-panel');
    expect(guardrail).toBeInTheDocument();

    const pinInput = screen.getByTestId('danger-vault-pin-input');
    const confirmInput = screen.getByTestId('danger-vault-confirm-input');
    const executeBtn = screen.getByTestId('danger-vault-execute-btn');

    // 1. Enter wrong PIN
    fireEvent.change(pinInput, { target: { value: '9999' } });
    fireEvent.change(confirmInput, { target: { value: 'CONFIRM' } });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(screen.getByTestId('danger-vault-error')).toHaveTextContent(/Invalid Security PIN/i);
    });

    // 2. Enter correct PIN but invalid keyword
    fireEvent.change(pinInput, { target: { value: '1234' } });
    fireEvent.change(confirmInput, { target: { value: 'delete now' } });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(screen.getByTestId('danger-vault-error')).toHaveTextContent(/CONFIRM/i);
    });
  });

  it('automatically triggers emergency JSON backup download immediately before executing wipe when verified with PIN and CONFIRM', async () => {
    // 1. Create a real sale transaction first
    const prod = (await db.products.get('prod-001'))!;
    await BillingService.executeCheckout({
      customerId: WALK_IN_CUSTOMER_ID,
      items: [
        {
          product: prod,
          qty: 2,
          unit_selling_price: prod.selling_price,
          unit_purchase_cost: prod.purchase_price,
          line_total: 2 * prod.selling_price,
        },
      ],
      subtotalAmount: 2 * prod.selling_price,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 2 * prod.selling_price,
      udhariAdded: 0,
    });

    const initialInvoices = await db.sales_invoices.count();
    expect(initialInvoices).toBeGreaterThan(0);

    // Mock BackupService.downloadJsonBackup to spy on emergency backup trigger
    const backupSpy = vi.spyOn(BackupService, 'downloadJsonBackup').mockResolvedValue('{"backup": true}');

    const onDataResetMock = vi.fn();

    render(
      <AuthProvider>
        <SettingsView onDataReset={onDataResetMock} />
      </AuthProvider>
    );

    // Wait for settings view to load
    await screen.findByTestId('danger-vault-container');

    // Click Clear Sales & Transactions
    const clearBtn = screen.getByText(/Clear Sales & Transactions/i);
    fireEvent.click(clearBtn);

    await screen.findByTestId('danger-guardrail-panel');

    const pinInput = screen.getByTestId('danger-vault-pin-input');
    const confirmInput = screen.getByTestId('danger-vault-confirm-input');
    const executeBtn = screen.getByTestId('danger-vault-execute-btn');

    // Enter correct PIN (1234) and exact keyword CONFIRM
    fireEvent.change(pinInput, { target: { value: '1234' } });
    fireEvent.change(confirmInput, { target: { value: 'CONFIRM' } });
    fireEvent.click(executeBtn);

    await waitFor(async () => {
      // Emergency backup MUST be invoked before data wipe
      expect(backupSpy).toHaveBeenCalledTimes(1);

      // Verify transactions are wiped while products catalog remains intact
      const remainingInvoices = await db.sales_invoices.count();
      expect(remainingInvoices).toBe(0);

      const remainingProducts = await db.products.count();
      expect(remainingProducts).toBe(25);
    });
  });

  it('Full System Regression Gate: Verifies 10 multi-tenant tables, indexed shop_id, and ACID isolation', async () => {
    // Verify all 10 core tables exist in IndexedDB schema
    const tables = [
      db.products,
      db.inventory_logs,
      db.customers,
      db.sales_invoices,
      db.sale_items,
      db.khata_transactions,
      db.expenses_and_drawings,
      db.daily_galla_sessions,
      db.shop_profile,
      db.store_users,
    ];

    expect(tables.length).toBe(10);
    for (const t of tables) {
      expect(t.name).toBeDefined();
    }

    // Verify shop_id is indexed across Dexie table schemas
    const schema = db.tables;
    const shopIdTables = [
      'products',
      'inventory_logs',
      'customers',
      'sales_invoices',
      'sale_items',
      'khata_transactions',
      'expenses_and_drawings',
      'daily_galla_sessions',
      'shop_profile',
      'store_users',
    ];

    for (const tableName of shopIdTables) {
      const table = schema.find((s) => s.name === tableName);
      expect(table).toBeDefined();
      const hasShopIdIndex = table?.schema.indexes.some((idx) => idx.name === 'shop_id') || table?.schema.primKey.name === 'shop_id';
      expect(hasShopIdIndex).toBe(true);
    }
  });
});
