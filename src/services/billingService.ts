import { db } from '../db/db';
import {
  Product,
  SalesInvoice,
  SaleItem,
  InventoryLog,
  KhataTransaction,
  DailyGallaSession,
  Customer,
  WALK_IN_CUSTOMER_ID,
  PaymentMode,
} from '../types';
import { roundCurrency, roundQty, toPaise, toRupees } from '../utils/math';

export interface CartItemInput {
  product: Product;
  qty: number;
  unit_selling_price: number;
  unit_purchase_cost: number;
  line_total: number;
}

export interface CheckoutParams {
  customerId: string;
  items: CartItemInput[];
  subtotalAmount: number;
  discountRoundoff: number;
  paymentMode: PaymentMode;
  amountPaidNow: number;
  udhariAdded: number;
  notes?: string;
}

export class BillingService {
  /**
   * Generates next invoice number for today: INV-YYYYMMDD-001
   */
  static async generateInvoiceNumber(): Promise<string> {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const prefix = `INV-${yyyy}${mm}${dd}-`;

    const count = await db.sales_invoices.count();
    const nextSeq = String(count + 1).padStart(3, '0');
    return `${prefix}${nextSeq}`;
  }

  /**
   * Complete atomic checkout transaction
   * Enforces all mathematical invariants across:
   * sales_invoices, sale_items, products, inventory_logs, customers, khata_transactions, daily_galla_sessions
   */
  static async executeCheckout(params: CheckoutParams): Promise<{
    invoice: SalesInvoice;
    saleItems: SaleItem[];
    customer?: Customer;
  }> {
    if (!params.items || params.items.length === 0) {
      throw new Error('Cannot checkout with an empty cart');
    }

    const subtotal = roundCurrency(params.subtotalAmount);
    const roundoff = roundCurrency(params.discountRoundoff);
    const grandTotal = roundCurrency(subtotal - roundoff);
    const paidNow = roundCurrency(params.amountPaidNow);
    const udhari = roundCurrency(params.udhariAdded);

    // Strict Accounting Invariant Verification (Section 4.1):
    // subtotal_amount - discount_roundoff = grand_total = amount_paid_now + udhari_added
    const leftSidePaise = toPaise(subtotal) - toPaise(roundoff);
    const rightSidePaise = toPaise(paidNow) + toPaise(udhari);

    if (leftSidePaise !== toPaise(grandTotal) || toPaise(grandTotal) !== rightSidePaise) {
      throw new Error(
        `Accounting Invariant Violation: Grand Total (₹${grandTotal}) does not match Paid (₹${paidNow}) + Udhari (₹${udhari})`
      );
    }

    const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const invoiceNumber = await this.generateInvoiceNumber();
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];

    let totalCogs = 0;
    const saleItems: SaleItem[] = [];
    const inventoryLogs: InventoryLog[] = [];
    const stockUpdates: { id: string; newStock: number }[] = [];

    // Pre-calculate line items & stock deductions
    for (const item of params.items) {
      const itemQty = roundQty(item.qty);
      const itemCost = roundCurrency(item.unit_purchase_cost);
      const itemPrice = roundCurrency(item.unit_selling_price);
      const lineTotal = roundCurrency(item.line_total);

      totalCogs += toPaise(itemQty * itemCost);

      const saleItem: SaleItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        invoice_id: invoiceId,
        product_id: item.product.id,
        product_name_snapshot: item.product.name,
        qty: itemQty,
        unit_purchase_cost: itemCost,
        unit_selling_price: itemPrice,
        line_total: lineTotal,
      };
      saleItems.push(saleItem);

      const log: InventoryLog = {
        id: `log-sale-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        product_id: item.product.id,
        change_qty: -itemQty,
        reason_type: 'SALE_OUT',
        unit_cost_at_time: itemCost,
        reference_id: invoiceId,
        notes: `Billed in invoice ${invoiceNumber}`,
        created_at: nowIso,
      };
      inventoryLogs.push(log);

      const updatedStock = roundQty(item.product.current_stock - itemQty);
      stockUpdates.push({ id: item.product.id, newStock: updatedStock });
    }

    const totalCogsRupees = toRupees(totalCogs);

    const invoice: SalesInvoice = {
      id: invoiceId,
      invoice_number: invoiceNumber,
      customer_id: params.customerId,
      subtotal_amount: subtotal,
      discount_roundoff: roundoff,
      grand_total: grandTotal,
      total_cogs: totalCogsRupees,
      payment_mode: params.paymentMode,
      amount_paid_now: paidNow,
      udhari_added: udhari,
      status: 'COMPLETED',
      created_at: nowIso,
    };

    let updatedCustomer: Customer | undefined;

    // Execute atomic transaction
    await db.transaction(
      'rw',
      [
        db.sales_invoices,
        db.sale_items,
        db.products,
        db.inventory_logs,
        db.customers,
        db.khata_transactions,
        db.daily_galla_sessions,
      ],
      async () => {
        // 1. Insert Sales Invoice
        await db.sales_invoices.add(invoice);

        // 2. Insert Sale Items
        await db.sale_items.bulkAdd(saleItems);

        // 3. Update Product Stocks
        for (const update of stockUpdates) {
          await db.products.update(update.id, {
            current_stock: update.newStock,
            updated_at: nowIso,
          });
        }

        // 4. Append to Inventory Logs
        await db.inventory_logs.bulkAdd(inventoryLogs);

        // 5. Update Customer Khata if Udhari was added
        if (udhari > 0 && params.customerId !== WALK_IN_CUSTOMER_ID) {
          const cust = await db.customers.get(params.customerId);
          if (!cust) throw new Error(`Customer not found: ${params.customerId}`);

          const newBalance = roundCurrency(cust.current_udhari_balance + udhari);
          const oldestDate = cust.oldest_unpaid_date || nowIso;

          await db.customers.update(params.customerId, {
            current_udhari_balance: newBalance,
            oldest_unpaid_date: oldestDate,
          });

          const khataTx: KhataTransaction = {
            id: `khata-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            customer_id: params.customerId,
            entry_type: 'DEBIT_UDHARI_GIVEN',
            amount: udhari,
            payment_channel: 'BILL_CREDIT',
            invoice_id: invoiceId,
            running_balance_after: newBalance,
            notes: `Udhari added on invoice ${invoiceNumber}`,
            created_at: nowIso,
          };
          await db.khata_transactions.add(khataTx);

          updatedCustomer = {
            ...cust,
            current_udhari_balance: newBalance,
            oldest_unpaid_date: oldestDate,
          };
        }

        // 6. Update Daily Galla Session if cash received
        const isCashPaid =
          paidNow > 0 &&
          (params.paymentMode === 'CASH' ||
            (params.paymentMode === 'SPLIT_PARTIAL' && params.notes?.includes('CASH')));

        if (isCashPaid) {
          const gallaSession = await db.daily_galla_sessions
            .where({ session_date: todayDate })
            .first();

          if (gallaSession) {
            const newCashSales = roundCurrency(gallaSession.cash_sales_total + paidNow);
            const newExpected = roundCurrency(gallaSession.expected_closing_cash + paidNow);
            await db.daily_galla_sessions.update(gallaSession.id, {
              cash_sales_total: newCashSales,
              expected_closing_cash: newExpected,
            });
          } else {
            // Auto-create initial session if not opened yet
            const newSession: DailyGallaSession = {
              id: `galla-${Date.now()}`,
              session_date: todayDate,
              opening_cash: 0,
              cash_sales_total: paidNow,
              cash_udhari_recovered: 0,
              cash_expenses_out: 0,
              expected_closing_cash: paidNow,
              actual_counted_cash: null,
              discrepancy: null,
            };
            await db.daily_galla_sessions.add(newSession);
          }
        }
      }
    );

    return { invoice, saleItems, customer: updatedCustomer };
  }

  /**
   * Generates dynamic UPI Intent URL locked to exact amount
   */
  static generateUpiIntentUrl(vpa: string, shopName: string, amount: number): string {
    const cleanAmount = roundCurrency(amount).toFixed(2);
    const cleanVpa = encodeURIComponent(vpa.trim());
    const cleanName = encodeURIComponent(shopName.trim());
    return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&am=${cleanAmount}&cu=INR`;
  }
}

