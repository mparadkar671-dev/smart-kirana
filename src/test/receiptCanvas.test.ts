import { describe, it, expect } from 'vitest';
import { generateReceiptCanvas } from '../utils/receiptCanvas';
import { SalesInvoice, SaleItem, ShopProfile, Customer } from '../types';

describe('Native Receipt Canvas Generator Suite', () => {
  const dummyInvoice: SalesInvoice = {
    id: 'inv-test-canvas-01',
    invoice_number: 'INV-20261031-001',
    customer_id: 'cust-01',
    subtotal_amount: 390.0,
    discount_roundoff: 0.0,
    grand_total: 390.0,
    total_cogs: 300.0,
    payment_mode: 'SPLIT_PARTIAL',
    amount_paid_now: 300.0,
    udhari_added: 90.0,
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
  };

  const dummyItems: SaleItem[] = [
    {
      id: 'item-1',
      invoice_id: dummyInvoice.id,
      product_id: 'prod-oil',
      product_name_snapshot: 'sunflower oil',
      qty: 2,
      unit_purchase_cost: 140,
      unit_selling_price: 170,
      line_total: 340,
    },
    {
      id: 'item-2',
      invoice_id: dummyInvoice.id,
      product_id: 'prod-sakhar',
      product_name_snapshot: 'sakhar',
      qty: 1,
      unit_purchase_cost: 38,
      unit_selling_price: 50,
      line_total: 50,
    },
  ];

  const dummyProfile: ShopProfile = {
    id: 'current_shop',
    shop_name: 'Laxi Vatsalaya store',
    owner_name: 'Mayuresh paradkar',
    phone: '9405048317',
    upi_vpa: '9405048317@upi',
    address: 'Shop No. 4, Main Market',
    gst_footer_note: 'Thank you for shopping with us! Please visit again.',
    updated_at: new Date().toISOString(),
  };

  const dummyCustomer: Customer = {
    id: 'cust-sagirdara',
    name: 'Sagirdara',
    phone: '8329563057',
    credit_limit: 2000,
    current_udhari_balance: 90,
    created_at: new Date().toISOString(),
  };

  it('generates an HTMLCanvasElement with non-zero dimensions without any errors', () => {
    const canvas = generateReceiptCanvas({
      invoice: dummyInvoice,
      items: dummyItems,
      profile: dummyProfile,
      customer: dummyCustomer,
      previousBalance: 0,
      currentKhataBalance: 90,
      udhariAddedThisBill: 90,
      qrCanvasElement: null,
    });

    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(560);
    expect(canvas.height).toBeGreaterThan(400);
  });
});
