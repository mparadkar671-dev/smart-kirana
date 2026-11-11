import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { POSView } from '../components/pos/POSView';
import { BillingService, getLocalTodayDateString } from '../services/billingService';
import { ReportsService } from '../services/reportsService';
import { db, kiranaDb } from '../db/db';
import { Product, Customer, WALK_IN_CUSTOMER_ID } from '../types';

const mockProducts: Product[] = [
  {
    id: 'prod-toor-dal',
    shop_id: 'current_shop',
    business_type: 'KIRANA_RETAIL',
    name: 'Toor Dal (Arhar)',
    marathi_name: 'तूर डाळ',
    short_code: 'TD1',
    barcode: '890100000001',
    category: 'Grains & Pulses',
    unit_type: 'PCS',
    purchase_price: 120,
    selling_price: 160,
    mrp: 170,
    current_stock: 50,
    low_stock_threshold: 5,
    last_supplier_name: 'Laxmi Traders',
    is_quick_tap: true,
    updated_at: new Date().toISOString(),
  },
];

const mockCustomers: Customer[] = [
  {
    id: WALK_IN_CUSTOMER_ID,
    shop_id: 'current_shop',
    business_type: 'KIRANA_RETAIL',
    name: 'Walk-in Customer (Cash / UPI)',
    phone: '0000000000',
    credit_limit: 0,
    current_udhari_balance: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'cust-backdate-01',
    shop_id: 'current_shop',
    business_type: 'KIRANA_RETAIL',
    name: 'Suresh Deshmukh',
    phone: '9822112233',
    credit_limit: 5000,
    current_udhari_balance: 0,
    created_at: new Date().toISOString(),
  },
];

describe('POS Backdated Billing & Multi-Tab Date Independence', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('kirana_active_shop_id', 'current_shop');
    localStorage.setItem('kirana_active_business_type', 'KIRANA_RETAIL');
    await kiranaDb.clearAllRecordsToEmpty();
    await kiranaDb.initializeDatabase();
    await db.products.bulkPut(mockProducts);
    await db.customers.bulkPut(mockCustomers);
  });

  it('1. Renders Bill Date selector defaulting to Today, highlights Backdated badge when past date chosen, and keeps Bill 1 / Bill 2 / Bill 3 dates independent', async () => {
    const todayStr = getLocalTodayDateString();

    render(<POSView products={mockProducts} customers={mockCustomers} />);

    const dateInput = screen.getByTestId('pos-bill-date-input') as HTMLInputElement;
    expect(dateInput.value).toBe(todayStr);
    expect(screen.getByTestId('today-bill-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('backdated-bill-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reset-bill-date-btn')).not.toBeInTheDocument();

    // Select a backdated date on Bill 1
    fireEvent.change(dateInput, { target: { value: '2026-10-15' } });
    expect(dateInput.value).toBe('2026-10-15');
    expect(screen.getByTestId('backdated-bill-badge')).toHaveTextContent('Backdated / Previous Bill');
    expect(screen.getByTestId('reset-bill-date-btn')).toBeInTheDocument();
    expect(screen.getByTestId('cart-tab-backdated-1')).toBeInTheDocument();

    // Switch to Bill 2 -> should still be Today
    fireEvent.click(screen.getByTestId('cart-tab-2'));
    expect((screen.getByTestId('pos-bill-date-input') as HTMLInputElement).value).toBe(todayStr);
    expect(screen.getByTestId('today-bill-badge')).toBeInTheDocument();

    // Set Bill 2 to a different historical date
    fireEvent.change(screen.getByTestId('pos-bill-date-input'), { target: { value: '2026-10-20' } });
    expect((screen.getByTestId('pos-bill-date-input') as HTMLInputElement).value).toBe('2026-10-20');

    // Switch to Bill 3 -> should be Today
    fireEvent.click(screen.getByTestId('cart-tab-3'));
    expect((screen.getByTestId('pos-bill-date-input') as HTMLInputElement).value).toBe(todayStr);

    // Switch back to Bill 1 -> should preserve '2026-10-15'
    fireEvent.click(screen.getByTestId('cart-tab-1'));
    expect((screen.getByTestId('pos-bill-date-input') as HTMLInputElement).value).toBe('2026-10-15');

    // Click "Reset to Today" on Bill 1 -> resets Bill 1 to Today while Bill 2 stays '2026-10-20'
    fireEvent.click(screen.getByTestId('reset-bill-date-btn'));
    expect((screen.getByTestId('pos-bill-date-input') as HTMLInputElement).value).toBe(todayStr);
    expect(screen.queryByTestId('backdated-bill-badge')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cart-tab-2'));
    expect((screen.getByTestId('pos-bill-date-input') as HTMLInputElement).value).toBe('2026-10-20');
  });

  it('2. Saves backdated Cash & Udhari bills under the selected historical date across Invoices, Khata Ledger, Galla Sessions, Inventory Logs, and P&L Reports', async () => {
    const historicalDate = '2026-10-15';

    // 1. Execute backdated Split (Cash + Udhari) checkout via BillingService
    const result = await BillingService.executeCheckout({
      customerId: 'cust-backdate-01',
      items: [
        {
          product: mockProducts[0],
          qty: 2,
          unit_selling_price: 160,
          unit_purchase_cost: 120,
          line_total: 320,
        },
      ],
      subtotalAmount: 320,
      discountRoundoff: 0,
      paymentMode: 'SPLIT_PARTIAL',
      amountPaidNow: 120,
      udhariAdded: 200,
      notes: 'CASH',
      shopId: 'current_shop',
      businessType: 'KIRANA_RETAIL',
      billDate: historicalDate,
    });

    // Invoice timestamp & invoice number reflect the historical date
    expect(result.invoice.created_at.startsWith(historicalDate)).toBe(true);
    expect(result.invoice.invoice_number).toContain('20261015');

    // Khata transaction & customer oldest_unpaid_date reflect the historical date
    const khataTxs = await db.khata_transactions.where('invoice_id').equals(result.invoice.id).toArray();
    expect(khataTxs.length).toBe(1);
    expect(khataTxs[0].created_at.startsWith(historicalDate)).toBe(true);
    expect(khataTxs[0].amount).toBe(200);

    const updatedCust = await db.customers.get('cust-backdate-01');
    expect(updatedCust?.current_udhari_balance).toBe(200);
    expect(updatedCust?.oldest_unpaid_date?.startsWith(historicalDate)).toBe(true);

    // Daily Galla Session is recorded under historicalDate ('2026-10-15')
    const gallaSessions = await db.daily_galla_sessions
      .filter((s) => s.session_date === historicalDate)
      .toArray();
    expect(gallaSessions.length).toBe(1);
    expect(gallaSessions[0].cash_sales_total).toBe(120);

    // Inventory log reflects the historical date
    const invLogs = await db.inventory_logs.where('reference_id').equals(result.invoice.id).toArray();
    expect(invLogs.length).toBe(1);
    expect(invLogs[0].created_at.startsWith(historicalDate)).toBe(true);

    // Reports P&L query for 2026-10-15 includes the backdated sale
    const pnl = await ReportsService.getProfitAndLossData({
      startDate: historicalDate,
      endDate: historicalDate,
    });
    expect(pnl.salesRevenue).toBe(320);
    expect(pnl.cogs).toBe(240);
    expect(pnl.grossProfit).toBe(80);
  });

  it('3. End-to-end UI checkout from POSView passes selected billDate and resets cart date to Today after checkout', async () => {
    const todayStr = getLocalTodayDateString();
    const pastDate = '2026-10-12';

    render(<POSView products={mockProducts} customers={mockCustomers} />);

    // Set Bill 1 date to 2026-10-12
    const dateInput = screen.getByTestId('pos-bill-date-input') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: pastDate } });
    expect(dateInput.value).toBe(pastDate);

    // Tap product to add to cart
    fireEvent.click(screen.getByTestId('fast-tap-TD1'));

    // Click Cash Paid (F8)
    fireEvent.click(screen.getByTestId('cash-checkout-btn'));

    await waitFor(async () => {
      const allInvoices = await db.sales_invoices.toArray();
      expect(allInvoices.length).toBe(1);
      expect(allInvoices[0].created_at.startsWith(pastDate)).toBe(true);
    });

    // After checkout, active cart's billDate resets to Today
    expect((screen.getByTestId('pos-bill-date-input') as HTMLInputElement).value).toBe(todayStr);
  });
});
