import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { BillingService } from '../services/billingService';
import { Product, Customer } from '../types';

describe('Iteration 3: Immutable Bills, Sales Return / Credit Note Workflow & PIN Guardrails', () => {
  const testProductId = 'prod-oil-ret-test';
  const testCustomerId = 'cust-anand-ret-test';
  const testShopId = 'shop-ret-test';

  beforeEach(async () => {
    // Clear relevant database tables
    await db.sales_invoices.clear();
    await db.sale_items.clear();
    await db.inventory_logs.clear();
    await db.products.clear();
    await db.customers.clear();
    await db.khata_transactions.clear();
    await db.credit_notes.clear();
    await db.sync_outbox.clear();
    await db.daily_galla_sessions.clear();

    // Seed test product with initial 50 Liters
    const testProduct: Product = {
      id: testProductId,
      shop_id: testShopId,
      barcode: '8909876543210',
      short_code: 'OIL',
      name: 'Fortune Sunflower Oil 1L',
      category: 'Edible Oils & Ghee',
      unit_type: 'LTR',
      purchase_price: 120,
      selling_price: 150,
      mrp: 170,
      current_stock: 50,
      low_stock_threshold: 10,
      last_supplier_name: 'Adani Wilmar Wholesaler',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    await db.products.put(testProduct);

    // Initial purchase log for 50 L
    await db.inventory_logs.put({
      id: 'log-initial-50l',
      shop_id: testShopId,
      product_id: testProductId,
      change_qty: 50,
      reason_type: 'PURCHASE_IN',
      unit_cost_at_time: 120,
      reference_id: null,
      notes: 'Initial opening stock',
      created_at: new Date().toISOString(),
    });

    // Seed test customer with ₹1,000 initial udhari
    const testCustomer: Customer = {
      id: testCustomerId,
      shop_id: testShopId,
      name: 'Anand Sharma',
      phone: '9822001122',
      address_landmark: 'House 12, Station Road',
      credit_limit: 5000,
      current_udhari_balance: 1000,
      oldest_unpaid_date: new Date(Date.now() - 10 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };
    await db.customers.put(testCustomer);
  });

  it('Verification Gate 3: returning a ₹300 Udhari bill restores exact item quantities to products and reduces customer udhari by ₹300 while preserving both audit logs', async () => {
    const prod = await db.products.get(testProductId);
    expect(prod).toBeDefined();

    // 1. Execute a ₹300 Udhari bill (2 L @ ₹150 = ₹300)
    const checkoutResult = await BillingService.executeCheckout({
      items: [
        {
          product: prod!,
          qty: 2,
          unit_purchase_cost: 120,
          unit_selling_price: 150,
          line_total: 300,
        },
      ],
      subtotalAmount: 300,
      discountRoundoff: 0,
      paymentMode: 'UDHARI_FULL',
      amountPaidNow: 0,
      udhariAdded: 300,
      customerId: testCustomerId,
    });

    const invoice = checkoutResult.invoice;
    expect(invoice.grand_total).toBe(300);
    expect(invoice.udhari_added).toBe(300);
    expect(invoice.status).toBe('COMPLETED');

    // Verify stock deducted to 48 L
    const stockAfterSale = await db.products.get(testProductId);
    expect(stockAfterSale!.current_stock).toBe(48);

    // Verify customer udhari increased to 1,300
    const custAfterSale = await db.customers.get(testCustomerId);
    expect(custAfterSale!.current_udhari_balance).toBe(1300);

    // 2. Execute Sales Return & Issue Credit Note
    const returnResult = await BillingService.processSalesReturn({
      invoiceId: invoice.id,
      reason: 'CUSTOMER_RETURN',
      notes: 'Customer returned 2 bottles sealed condition',
      userRole: 'OWNER',
      cloneToActiveCart: true,
    });

    // 3. Verify Credit Note was generated and linked to bill
    expect(returnResult.creditNote).toBeDefined();
    expect(returnResult.creditNote.credit_note_number).toMatch(/^CN-\d{4}$/);
    expect(returnResult.creditNote.total_amount).toBe(300);
    expect(returnResult.creditNote.refund_mode).toBe('UDHARI_CREDIT');

    // 4. Verify Original Bill is locked as RETURNED (Immutable)
    const returnedInvoice = await db.sales_invoices.get(invoice.id);
    expect(returnedInvoice!.status).toBe('RETURNED');
    expect(returnedInvoice!.credit_note_number).toBe(returnResult.creditNote.credit_note_number);
    expect(returnedInvoice!.return_reason).toBe('CUSTOMER_RETURN');

    // 5. Verify product stock is restored to exactly 50 L
    const stockAfterReturn = await db.products.get(testProductId);
    expect(stockAfterReturn!.current_stock).toBe(50);

    // 6. Verify customer udhari balance is reduced by ₹300 back to ₹1,000
    const custAfterReturn = await db.customers.get(testCustomerId);
    expect(custAfterReturn!.current_udhari_balance).toBe(1000);

    // 7. Verify both audit logs are preserved (Immutable Ledgers)
    const logs = await db.inventory_logs.where('product_id').equals(testProductId).toArray();
    const saleLog = logs.find((l) => l.reason_type === 'SALE_OUT');
    const returnLog = logs.find((l) => l.reason_type === 'RETURN_IN');
    expect(saleLog).toBeDefined();
    expect(saleLog!.change_qty).toBe(-2);
    expect(returnLog).toBeDefined();
    expect(returnLog!.change_qty).toBe(2);
    expect(returnLog!.reference_id).toBe(returnResult.creditNote.credit_note_number);

    // Verify Khata debit and credit audit entries are both preserved
    const khataTxs = await db.khata_transactions.where('customer_id').equals(testCustomerId).toArray();
    const debitTx = khataTxs.find((t) => t.entry_type === 'DEBIT_UDHARI_GIVEN');
    const creditTx = khataTxs.find((t) => t.entry_type === 'CREDIT_JAMA_RECEIVED');
    expect(debitTx).toBeDefined();
    expect(debitTx!.amount).toBe(300);
    expect(creditTx).toBeDefined();
    expect(creditTx!.amount).toBe(300);
    expect(creditTx!.running_balance_after).toBe(1000);

    // 8. Verify sync_outbox queued mutations for cloud sync
    const outboxCN = await db.sync_outbox.where('table_name').equals('credit_notes').first();
    expect(outboxCN).toBeDefined();
    expect(outboxCN!.status).toBe('PENDING');
  });

  it('rejects unauthorized sales return attempts by Cashiers without Manager authorization', async () => {
    const prod = await db.products.get(testProductId);

    const checkout = await BillingService.executeCheckout({
      items: [
        {
          product: prod!,
          qty: 1,
          unit_purchase_cost: 120,
          unit_selling_price: 150,
          line_total: 150,
        },
      ],
      subtotalAmount: 150,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 150,
      udhariAdded: 0,
      customerId: '0000-WALK-IN',
    });

    // Cashier attempt should be rejected
    await expect(
      BillingService.processSalesReturn({
        invoiceId: checkout.invoice.id,
        reason: 'CUSTOMER_RETURN',
        userRole: 'CASHIER',
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  it('prohibits returning an already returned bill (Idempotency and Immutability)', async () => {
    const prod = await db.products.get(testProductId);

    const checkout = await BillingService.executeCheckout({
      items: [
        {
          product: prod!,
          qty: 1,
          unit_purchase_cost: 120,
          unit_selling_price: 150,
          line_total: 150,
        },
      ],
      subtotalAmount: 150,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 150,
      udhariAdded: 0,
      customerId: '0000-WALK-IN',
    });

    // First return succeeds
    await BillingService.processSalesReturn({
      invoiceId: checkout.invoice.id,
      reason: 'BILLING_MISTAKE',
      userRole: 'MANAGER',
    });

    // Second return on same invoice must be prohibited
    await expect(
      BillingService.processSalesReturn({
        invoiceId: checkout.invoice.id,
        reason: 'BILLING_MISTAKE',
        userRole: 'MANAGER',
      })
    ).rejects.toThrow(/already returned/);
  });
});

