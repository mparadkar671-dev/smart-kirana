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
  UserRole,
  CreditNote,
  SalesReturnReason,
  BusinessType,
} from '../types';
import { roundCurrency, roundQty, toPaise, toRupees } from '../utils/math';
import { getActiveShopId, getActiveBusinessType } from './tenantManager';

export interface CartItemInput {
  product: Product;
  qty: number;
  unit_selling_price: number;
  unit_purchase_cost: number;
  line_total: number;
  sale_rate_type?: 'RETAIL_CUSTOMER' | 'WHOLESALE_RETAILER';
  is_loan_funded?: boolean;
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
  shopId?: string;
  businessType?: BusinessType;
}

export class BillingService {
  /**
   * Generates next invoice number for today: INV-YYYYMMDD-001 (or HMF-YYYYMMDD-001 for Homemade Food)
   */
  static async generateInvoiceNumber(bizType?: BusinessType): Promise<string> {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const profile = await db.getShopProfile();
    const effectiveBizType = bizType || profile?.business_type || getActiveBusinessType();
    const customPrefix = profile?.invoice_prefix
      ? profile.invoice_prefix.replace(/-+$/, '')
      : effectiveBizType === 'HOMEMADE_FOOD'
      ? 'HMF'
      : 'INV';
    const deviceId = typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_device_id') : null;
    const devicePart = deviceId ? `${deviceId}-` : '';
    const prefix = `${customPrefix}-${yyyy}${mm}${dd}-${devicePart}`;

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

    const shopProfile = await db.getShopProfile();
    const activeBizType: BusinessType = params.businessType || shopProfile?.business_type || getActiveBusinessType();
    const activeShopId: string = params.shopId || shopProfile?.id || getActiveShopId(activeBizType);

    const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const invoiceNumber = await this.generateInvoiceNumber(activeBizType);
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
        shop_id: activeShopId,
        business_type: item.product.business_type || activeBizType,
        invoice_id: invoiceId,
        product_id: item.product.id,
        product_name_snapshot: item.product.name,
        qty: itemQty,
        unit_purchase_cost: itemCost,
        unit_selling_price: itemPrice,
        line_total: lineTotal,
        loan_account_id: item.product.loan_account_id || null,
        is_loan_funded: item.is_loan_funded ?? item.product.is_loan_funded ?? false,
        sale_rate_type: item.sale_rate_type || 'RETAIL_CUSTOMER',
      };
      saleItems.push(saleItem);

      const log: InventoryLog = {
        id: `log-sale-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        shop_id: activeShopId,
        business_type: item.product.business_type || activeBizType,
        product_id: item.product.id,
        change_qty: -itemQty,
        reason_type: 'SALE_OUT',
        unit_cost_at_time: itemCost,
        reference_id: invoiceId,
        loan_account_id: item.product.loan_account_id || null,
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
      shop_id: activeShopId,
      business_type: activeBizType,
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
        db.sync_outbox,
        db.production_batches,
      ],
      async () => {
        // 1. Insert Sales Invoice
        await db.sales_invoices.add(invoice);
        await db.queueSync(
          { table_name: 'sales_invoices', operation: 'INSERT', payload: invoice as unknown as Record<string, unknown>, shop_id: invoice.shop_id },
          db.sync_outbox
        );

        // 2. Insert Sale Items
        await db.sale_items.bulkAdd(saleItems);
        for (const it of saleItems) {
          await db.queueSync(
            { table_name: 'sale_items', operation: 'INSERT', payload: it as unknown as Record<string, unknown>, shop_id: it.shop_id },
            db.sync_outbox
          );
        }

        // 3. Update Product Stocks & FIFO Production Batches
        for (const update of stockUpdates) {
          await db.products.update(update.id, {
            current_stock: update.newStock,
            updated_at: nowIso,
          });
          await db.queueSync(
            { table_name: 'products', operation: 'UPDATE', payload: { id: update.id, current_stock: update.newStock, updated_at: nowIso }, shop_id: invoice.shop_id },
            db.sync_outbox
          );

          // Deduct FIFO batches if active batches exist
          const activeBatches = await db.production_batches
            .where('product_id')
            .equals(update.id)
            .filter((b) => b.status === 'ACTIVE' && b.remaining_qty > 0)
            .sortBy('produced_at');

          if (activeBatches.length > 0) {
            const soldItem = params.items.find(it => it.product.id === update.id);
            let needed = soldItem ? roundQty(soldItem.qty) : 0;
            for (const b of activeBatches) {
              if (needed <= 0) break;
              const dec = Math.min(b.remaining_qty, needed);
              const newRem = roundQty(b.remaining_qty - dec);
              needed = roundQty(needed - dec);
              await db.production_batches.update(b.id, {
                remaining_qty: newRem,
                status: newRem <= 0 ? 'EXHAUSTED' : 'ACTIVE',
              });
            }
          }
        }

        // 4. Append to Inventory Logs
        await db.inventory_logs.bulkAdd(inventoryLogs);
        for (const l of inventoryLogs) {
          await db.queueSync(
            { table_name: 'inventory_logs', operation: 'INSERT', payload: l as unknown as Record<string, unknown>, shop_id: l.shop_id },
            db.sync_outbox
          );
        }

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
          await db.queueSync(
            { table_name: 'customers', operation: 'UPDATE', payload: { id: params.customerId, current_udhari_balance: newBalance, oldest_unpaid_date: oldestDate }, shop_id: invoice.shop_id },
            db.sync_outbox
          );

          const khataTx: KhataTransaction = {
            id: `khata-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            shop_id: invoice.shop_id,
            business_type: activeBizType,
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
          await db.queueSync(
            { table_name: 'khata_transactions', operation: 'INSERT', payload: khataTx as unknown as Record<string, unknown>, shop_id: khataTx.shop_id },
            db.sync_outbox
          );

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
            .filter(
              (s) =>
                s.session_date === todayDate &&
                (s.shop_id === activeShopId ||
                  s.shop_id === 'current_shop' ||
                  activeShopId === 'current_shop' ||
                  (!s.shop_id && s.business_type === activeBizType))
            )
            .first();

          if (gallaSession) {
            const newCashSales = roundCurrency(gallaSession.cash_sales_total + paidNow);
            const newExpected = roundCurrency(gallaSession.expected_closing_cash + paidNow);
            await db.daily_galla_sessions.update(gallaSession.id, {
              cash_sales_total: newCashSales,
              expected_closing_cash: newExpected,
            });
            await db.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: gallaSession.id, cash_sales_total: newCashSales, expected_closing_cash: newExpected }, shop_id: invoice.shop_id },
              db.sync_outbox
            );
          } else {
            // Auto-create initial session if not opened yet
            const newSession: DailyGallaSession = {
              id: `galla-${Date.now()}`,
              shop_id: activeShopId,
              business_type: activeBizType,
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
            await db.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'INSERT', payload: newSession as unknown as Record<string, unknown>, shop_id: invoice.shop_id },
              db.sync_outbox
            );
          }
        }
      }
    );

    return { invoice, saleItems, customer: updatedCustomer };
  }

  /**
   * Enterprise Sales Return & Credit Note Workflow (Iteration 3)
   * Prohibits inline modification of completed bills.
   * Atomically:
   * 1. Validates Owner/Manager authorization.
   * 2. Marks invoice as RETURNED and creates linked Credit Note (CN-XXXX).
   * 3. Writes RETURN_IN entries in inventory_logs to restore stock.
   * 4. Adjusts customer udhari or daily galla cash flow.
   * 5. Atomically writes all operations to sync_outbox.
   * 6. Optionally stages items for 1-click re-billing in active cart.
   */
  static async processSalesReturn(params: {
    invoiceId: string;
    reason: SalesReturnReason;
    notes?: string;
    userRole: UserRole;
    cloneToActiveCart?: boolean;
  }): Promise<{ creditNote: CreditNote; invoice: SalesInvoice; restoredItems: SaleItem[] }> {
    if (params.userRole !== 'OWNER' && params.userRole !== 'MANAGER') {
      throw new Error('Unauthorized: Only Store Owner or Manager can authorize a sales return or credit note');
    }

    if (!params.reason) {
      throw new Error('Mandatory Return Reason must be provided (CUSTOMER_RETURN, BILLING_MISTAKE, or RATE_ADJUSTMENT)');
    }

    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];

    let creditNote!: CreditNote;
    let updatedInvoice!: SalesInvoice;
    let itemsToRestore: SaleItem[] = [];

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
        db.credit_notes,
        db.sync_outbox,
      ],
      async () => {
        const inv = await db.sales_invoices.get(params.invoiceId);
        if (!inv) throw new Error(`Invoice not found: ${params.invoiceId}`);
        if (inv.status === 'RETURNED') throw new Error(`Invoice ${inv.invoice_number} is already returned with Credit Note ${inv.credit_note_number}`);
        if (inv.status === 'VOIDED') throw new Error(`Invoice ${inv.invoice_number} is voided`);

        const shopId = inv.shop_id || 'current_shop';
        const cnCount = await db.credit_notes.count();
        const creditNoteNum = `CN-${(cnCount + 1).toString().padStart(4, '0')}`;

        itemsToRestore = await db.sale_items.where('invoice_id').equals(inv.id).toArray();

        // 1. Restore product stock and insert RETURN_IN logs
        for (const item of itemsToRestore) {
          const product = await db.products.get(item.product_id);
          if (product) {
            const restoredStock = Math.round((product.current_stock + item.qty) * 1000) / 1000;
            await db.products.update(item.product_id, {
              current_stock: restoredStock,
              updated_at: nowIso,
            });
            await db.queueSync(
              { table_name: 'products', operation: 'UPDATE', payload: { id: item.product_id, current_stock: restoredStock, updated_at: nowIso }, shop_id: shopId },
              db.sync_outbox
            );

            const returnLog: InventoryLog = {
              id: `log-ret-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              shop_id: shopId,
              product_id: item.product_id,
              change_qty: item.qty,
              reason_type: 'RETURN_IN',
              unit_cost_at_time: item.unit_purchase_cost,
              reference_id: creditNoteNum,
              notes: `Sales Return (${params.reason}): Bill #${inv.invoice_number}${params.notes ? ' - ' + params.notes : ''}`,
              created_at: nowIso,
            };
            await db.inventory_logs.add(returnLog);
            await db.queueSync(
              { table_name: 'inventory_logs', operation: 'INSERT', payload: returnLog as unknown as Record<string, unknown>, shop_id: shopId },
              db.sync_outbox
            );
          }
        }

        // 2. Reverse Customer Udhari if credit was extended
        if (inv.udhari_added > 0 && inv.customer_id !== WALK_IN_CUSTOMER_ID) {
          const customer = await db.customers.get(inv.customer_id);
          if (customer) {
            const newBalance = roundCurrency(Math.max(0, customer.current_udhari_balance - inv.udhari_added));
            await db.customers.update(customer.id, {
              current_udhari_balance: newBalance,
            });
            await db.queueSync(
              { table_name: 'customers', operation: 'UPDATE', payload: { id: customer.id, current_udhari_balance: newBalance }, shop_id: shopId },
              db.sync_outbox
            );

            const khataTx: KhataTransaction = {
              id: `khata-cn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              shop_id: shopId,
              customer_id: customer.id,
              entry_type: 'CREDIT_JAMA_RECEIVED',
              amount: inv.udhari_added,
              payment_channel: 'DISCOUNT_SETTLEMENT',
              invoice_id: inv.id,
              running_balance_after: newBalance,
              notes: `Credit Note ${creditNoteNum} for returned bill #${inv.invoice_number} (${params.reason})`,
              created_at: nowIso,
            };
            await db.khata_transactions.add(khataTx);
            await db.queueSync(
              { table_name: 'khata_transactions', operation: 'INSERT', payload: khataTx as unknown as Record<string, unknown>, shop_id: shopId },
              db.sync_outbox
            );
          }
        }

        // 3. Adjust Daily Galla if cash was received
        if (inv.amount_paid_now > 0 && inv.payment_mode === 'CASH') {
          const session = await db.daily_galla_sessions
            .filter(s => s.session_date === todayDate && (s.shop_id === shopId || (!s.shop_id && s.business_type === inv.business_type)))
            .first();

          if (session) {
            const newCashSales = roundCurrency(Math.max(0, session.cash_sales_total - inv.amount_paid_now));
            const newExpected = roundCurrency(Math.max(0, session.expected_closing_cash - inv.amount_paid_now));
            await db.daily_galla_sessions.update(session.id, {
              cash_sales_total: newCashSales,
              expected_closing_cash: newExpected,
            });
            await db.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: session.id, cash_sales_total: newCashSales, expected_closing_cash: newExpected }, shop_id: shopId },
              db.sync_outbox
            );
          }
        }

        // 4. Create Credit Note Record
        creditNote = {
          id: `cn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          shop_id: shopId,
          credit_note_number: creditNoteNum,
          original_invoice_id: inv.id,
          original_invoice_number: inv.invoice_number,
          customer_id: inv.customer_id,
          return_reason: params.reason,
          total_amount: inv.grand_total,
          refund_mode: inv.udhari_added > 0 ? 'UDHARI_CREDIT' : 'CASH',
          created_at: nowIso,
        };
        await db.credit_notes.add(creditNote);
        await db.queueSync(
          { table_name: 'credit_notes', operation: 'INSERT', payload: creditNote as unknown as Record<string, unknown>, shop_id: shopId },
          db.sync_outbox
        );

        // 5. Update original invoice
        await db.sales_invoices.update(inv.id, {
          status: 'RETURNED',
          return_reason: params.reason,
          credit_note_number: creditNoteNum,
          returned_at: nowIso,
        });
        await db.queueSync(
          { table_name: 'sales_invoices', operation: 'UPDATE', payload: { id: inv.id, status: 'RETURNED', return_reason: params.reason, credit_note_number: creditNoteNum, returned_at: nowIso }, shop_id: shopId },
          db.sync_outbox
        );

        updatedInvoice = {
          ...inv,
          status: 'RETURNED',
          return_reason: params.reason,
          credit_note_number: creditNoteNum,
          returned_at: nowIso,
        };
      }
    );

    // 6. 1-Click Clone to Active Cart for Re-billing
    if (params.cloneToActiveCart && typeof window !== 'undefined') {
      try {
        const cartCloneData = {
          customerId: updatedInvoice.customer_id,
          items: itemsToRestore.map((it) => ({
            productId: it.product_id,
            productName: it.product_name_snapshot,
            qty: it.qty,
            sellingPrice: it.unit_selling_price,
            purchaseCost: it.unit_purchase_cost,
            lineTotal: it.line_total,
          })),
        };
        localStorage.setItem('smart_kirana_reloaded_cart', JSON.stringify(cartCloneData));
        window.dispatchEvent(new CustomEvent('smart_kirana_cart_cloned', { detail: cartCloneData }));
      } catch (e) {
        console.warn('Failed to clone items to local storage:', e);
      }
    }

    return { creditNote, invoice: updatedInvoice, restoredItems: itemsToRestore };
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

