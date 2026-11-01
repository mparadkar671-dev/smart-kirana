import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../db/db';
import { KhataService } from '../services/khataService';
import { BillingService } from '../services/billingService';
import { CustomerPassbookDrawer } from '../components/khata/CustomerPassbookDrawer';
import { ReportsView } from '../components/reports/ReportsView';
import {
  TimeWiseProfitTrendChart,
  ProductMarginDistributionChart,
  KhataAgingDistributionChart,
  StockCapitalDistributionChart,
  GallaAndTaxOverview,
} from '../components/reports/ReportsDashboardCharts';
import { Customer, Product, ShopProfile } from '../types';

describe('Graphical Dashboard & Customer Detailed Pending Bills Suite', () => {
  const mockShopProfile: ShopProfile = {
    id: 'shop-test-dash',
    shop_name: 'Laxi Vatsalaya Kirana Store',
    owner_name: 'Mayuresh Paradkar',
    phone: '9405048317',
    upi_vpa: '9405048317@upi',
    address: 'Shop No. 4, Main Market Road',
    gst_footer_note: 'Thank you for shopping with us!',
    updated_at: new Date().toISOString(),
  };

  const testCustomer: Customer = {
    id: 'cust-dash-001',
    shop_id: 'shop-test-dash',
    name: 'Sagar Parab',
    phone: '9876543210',
    address_landmark: 'Station Lane',
    credit_limit: 5000,
    current_udhari_balance: 390,
    oldest_unpaid_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const testProd1: Product = {
    id: 'prod-dash-01',
    shop_id: 'shop-test-dash',
    name: 'Sunflower Oil 1L',
    short_code: 'SO1',
    barcode: 'OIL123',
    category: 'Oils & Ghee',
    unit_type: 'PCS',
    purchase_price: 130,
    selling_price: 170,
    mrp: 180,
    current_stock: 50,
    low_stock_threshold: 10,
    last_supplier_name: 'Mandi Trader',
    is_quick_tap: true,
    updated_at: new Date().toISOString(),
  };

  const testProd2: Product = {
    id: 'prod-dash-02',
    shop_id: 'shop-test-dash',
    name: 'Sakhar (Loose Sugar)',
    short_code: 'SUG',
    barcode: 'SUGAR123',
    category: 'Grains & Sugar',
    unit_type: 'KG_LOOSE',
    purchase_price: 40,
    selling_price: 50,
    mrp: 55,
    current_stock: 100,
    low_stock_threshold: 20,
    last_supplier_name: 'Sugar Mill',
    is_quick_tap: true,
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    await db.products.clear();
    await db.customers.clear();
    await db.sales_invoices.clear();
    await db.sale_items.clear();
    await db.khata_transactions.clear();
    await db.daily_galla_sessions.clear();
    await db.expenses_and_drawings.clear();
    await db.shop_profile.clear();

    await db.shop_profile.put(mockShopProfile);
    await db.customers.put(testCustomer);
    await db.products.bulkPut([testProd1, testProd2]);

    // Create a realistic split-payment credit invoice (e.g., ₹390 total: ₹300 cash, ₹90 Udhari)
    await BillingService.executeCheckout({
      customerId: testCustomer.id,
      items: [
        {
          product: testProd1,
          qty: 2,
          unit_selling_price: testProd1.selling_price,
          unit_purchase_cost: testProd1.purchase_price,
          line_total: 340,
        },
        {
          product: testProd2,
          qty: 1,
          unit_selling_price: testProd2.selling_price,
          unit_purchase_cost: testProd2.purchase_price,
          line_total: 50,
        },
      ],
      subtotalAmount: 390,
      discountRoundoff: 0,
      paymentMode: 'SPLIT_PARTIAL',
      amountPaidNow: 300,
      udhariAdded: 90,
    });
  });

  it('1. KhataService.getCustomerPendingBills returns active credit bills with itemized line items', async () => {
    const pendingBills = await KhataService.getCustomerPendingBills(testCustomer.id);

    expect(pendingBills).toHaveLength(1);
    expect(pendingBills[0].udhariAmount).toBe(90);
    expect(pendingBills[0].invoice.grand_total).toBe(390);
    expect(pendingBills[0].items).toHaveLength(2);

    const oilItem = pendingBills[0].items.find((i) => i.product_id === testProd1.id);
    expect(oilItem).toBeDefined();
    expect(oilItem?.qty).toBe(2);
    expect(oilItem?.line_total).toBe(340);

    const sugarItem = pendingBills[0].items.find((i) => i.product_id === testProd2.id);
    expect(sugarItem).toBeDefined();
    expect(sugarItem?.qty).toBe(1);
    expect(sugarItem?.line_total).toBe(50);
  });

  it('2. KhataService generates formatted WhatsApp links for itemized single bill and all pending bills', async () => {
    const pendingBills = await KhataService.getCustomerPendingBills(testCustomer.id);
    expect(pendingBills.length).toBeGreaterThan(0);

    // Single bill link
    const singleBillUrl = KhataService.generateCustomerBillWhatsAppLink({
      customer: testCustomer,
      bill: pendingBills[0],
      shopProfile: mockShopProfile,
    });

    expect(singleBillUrl).toContain('wa.me/919876543210');
    expect(decodeURIComponent(singleBillUrl)).toContain('Sunflower Oil 1L - 2 x ₹170.00 = ₹340.00');
    expect(decodeURIComponent(singleBillUrl)).toContain('*Added to Khata:* ₹90.00');
    expect(decodeURIComponent(singleBillUrl)).toContain('upi://pay?pa=9405048317%40upi');

    // All pending bills link
    const allBillsUrl = KhataService.generateAllPendingBillsWhatsAppLink({
      customer: testCustomer,
      bills: pendingBills,
      shopProfile: mockShopProfile,
    });

    expect(allBillsUrl).toContain('wa.me/919876543210');
    expect(decodeURIComponent(allBillsUrl)).toContain('Detailed Khata Bills Statement');
    expect(decodeURIComponent(allBillsUrl)).toContain('Sunflower Oil 1L (2)');
    expect(decodeURIComponent(allBillsUrl)).toContain('Sakhar (Loose Sugar) (1)');
  });

  it('3. CustomerPassbookDrawer renders tab switcher and displays detailed pending bills with line items', async () => {
    render(
      <CustomerPassbookDrawer
        isOpen={true}
        onClose={() => {}}
        customer={testCustomer}
        shopProfile={mockShopProfile}
        initialTab="bills"
      />
    );

    // Tab switcher should be visible
    expect(await screen.findByTestId('passbook-tabs-switcher')).toBeInTheDocument();

    // Verify bills view is active
    expect(await screen.findByText(/1 Unpaid \/ Credit Bill/i)).toBeInTheDocument();

    // Verify itemized products snapshot is displayed
    expect(await screen.findByText('Sunflower Oil 1L')).toBeInTheDocument();
    expect(await screen.findByText('Sakhar (Loose Sugar)')).toBeInTheDocument();

    // Check financial amounts
    expect(screen.getByText('₹390.00')).toBeInTheDocument(); // Grand total
    expect(screen.getByText('+₹90.00')).toBeInTheDocument(); // Udhari Added
  });

  it('4. ReportsDashboardCharts renders responsive SVG charts with zero errors', () => {
    const { container: trendContainer } = render(
      <TimeWiseProfitTrendChart
        billWiseInvoices={[
          {
            date: '2026-10-30T10:00:00Z',
            grandTotal: 1500,
            totalCogs: 1100,
            profit: 400,
          },
          {
            date: '2026-10-31T12:00:00Z',
            grandTotal: 2200,
            totalCogs: 1600,
            profit: 600,
          },
        ]}
      />
    );
    expect(trendContainer.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText(/Time-Wise Daily Sales & True Profit Trend/i)).toBeInTheDocument();

    const { container: agingContainer } = render(
      <KhataAgingDistributionChart
        totalOutstanding={12500}
        totalIn0to15={6000}
        totalIn16to30={3500}
        totalInAbove30={3000}
        highRiskCount={2}
      />
    );
    expect(agingContainer.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText(/Khata Credit Aging & Recovery Risk/i)).toBeInTheDocument();
  });

  it('5. ReportsView renders Graphical Dashboard with executive KPIs and allows switching to Tabular view', async () => {
    render(<ReportsView shopProfile={mockShopProfile} />);

    // By default, renders graphical dashboard view mode
    expect(await screen.findByTestId('graphical-dashboard-container')).toBeInTheDocument();
    expect(screen.getByTestId('dash-sales-revenue')).toBeInTheDocument();
    expect(screen.getByTestId('dash-net-profit')).toBeInTheDocument();
    expect(screen.getByTestId('dash-market-debt')).toBeInTheDocument();

    // Click Tabular Audit Register button
    const tabularBtn = screen.getByTestId('view-mode-tabular');
    fireEvent.click(tabularBtn);

    // Tab bar should now be visible
    expect(await screen.findByTestId('report-tabs')).toBeInTheDocument();

    // Switch to Tab 3: Khata Aging
    const khataTab = screen.getByTestId('report-tab-udhari');
    fireEvent.click(khataTab);

    // Verify Khata report container with customer row and "View Bills" button
    expect(await screen.findByTestId('udhari-report-container')).toBeInTheDocument();
    const viewBillsBtn = await screen.findByTestId(`view-bills-btn-${testCustomer.id}`);
    expect(viewBillsBtn).toBeInTheDocument();

    // Clicking "View Bills" opens the CustomerPassbookDrawer on the bills tab
    fireEvent.click(viewBillsBtn);
    expect(await screen.findByTestId('passbook-tabs-switcher')).toBeInTheDocument();
    expect(await screen.findByText(/Detailed Pending Bills/i)).toBeInTheDocument();
  });
});
