import { db, getActiveDb } from '../db/db';
import {
  Product,
  SalesInvoice,
  SaleItem,
  CreditNote,
  Customer,
  InventoryLog,
  KhataTransaction,
  DailyGallaSession,
  WALK_IN_CUSTOMER_ID,
  SalesReturnReason,
} from '../types';
import { roundCurrency, roundQty, toPaise, toRupees } from '../utils/math';
import { getActiveShopId, getActiveBusinessType } from '../utils/businessFirewall';

export interface ReturnItemInput {
  saleItemId: string;
  returnQty: number;
  reason?: string;
}

export interface PartialReturnParams {
  invoiceId: string;
  itemsToReturn: ReturnItemInput[];
  refundMode: 'CASH' | 'UDHARI_CREDIT' | 'UPI' | 'STORE_CREDIT';
  reason: SalesReturnReason;
  notes?: string;
  cashierName?: string;
}

export interface PartialReturnResult {
  creditNote: CreditNote;
  refundTotal: number;
  returnedItems: {
    productId: string;
    productName: string;
    qtyReturned: number;
    unitPrice: number;
    refundLineTotal: number;
  }[];
  invoiceUpdated: SalesInvoice;
}

export class SalesReturnService {
  /**
   * Generates next Credit Note number: CN-XXXX
   */
  static async generateCreditNoteNumber(): Promise<string> {
    const activeDb = getActiveDb();
    const count = await activeDb.credit_notes.count();
    return `CN-${(count + 1).toString().padStart(4, '0')}`;
  }

  /**
   * Executes a partial or full itemized sales return with integer-paisa accounting:
   * 1. Validates each returned line item against original sale item qty
   * 2. Restores returned product inventory (+qty) & logs RETURN_IN
   * 3. Reverses customer Udhari or deducts cash from Daily Galla
   * 4. Issues Credit Note record
   * 5. Updates invoice status (RETURNED if 100% returned)
   */
  static async executePartialReturn(params: PartialReturnParams): Promise<PartialReturnResult> {
    if (!params.itemsToReturn || params.itemsToReturn.length === 0) {
      throw new Error('No items selected for return');
    }

    const activeDb = getActiveDb();
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];

    const invoice = await activeDb.sales_invoices.get(params.invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${params.invoiceId}`);
    }
    if (invoice.status === 'VOIDED') {
      throw new Error(`Invoice ${invoice.invoice_number} is voided and cannot be returned`);
    }

    const shopId = invoice.shop_id || getActiveShopId();
    const bizType = invoice.business_type || getActiveBusinessType();
    const allSaleItems = await activeDb.sale_items.where('invoice_id').equals(invoice.id).toArray();
    const saleItemMap = new Map(allSaleItems.map((item) => [item.id, item]));

    let refundTotalPaise = 0;
    const returnedItemsList: PartialReturnResult['returnedItems'] = [];
    const inventoryUpdates: { productId: string; returnQty: number; unitCost: number; productName: string }[] = [];

    // 1. Validate return quantities and compute refund
    for (const req of params.itemsToReturn) {
      const saleItem = saleItemMap.get(req.saleItemId);
      if (!saleItem) {
        throw new Error(`Sale item not found on invoice: ${req.saleItemId}`);
      }

      const returnQty = roundQty(req.returnQty);
      if (returnQty <= 0) continue;
      if (returnQty > saleItem.qty) {
        throw new Error(
          `Return qty (${returnQty}) cannot exceed billed qty (${saleItem.qty}) for ${saleItem.product_name_snapshot}`
        );
      }

      const unitPrice = roundCurrency(saleItem.unit_selling_price);
      const lineRefund = toRupees(Math.round(returnQty * toPaise(unitPrice)));
      refundTotalPaise += toPaise(lineRefund);

      returnedItemsList.push({
        productId: saleItem.product_id,
        productName: saleItem.product_name_snapshot,
        qtyReturned: returnQty,
        unitPrice,
        refundLineTotal: lineRefund,
      });

      inventoryUpdates.push({
        productId: saleItem.product_id,
        returnQty,
        unitCost: saleItem.unit_purchase_cost,
        productName: saleItem.product_name_snapshot,
      });
    }

    if (returnedItemsList.length === 0) {
      throw new Error('All return quantities were zero');
    }

    const refundTotal = toRupees(refundTotalPaise);
    const creditNoteNumber = await this.generateCreditNoteNumber();
    const creditNoteId = `cn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const creditNote: CreditNote = {
      id: creditNoteId,
      shop_id: shopId,
      credit_note_number: creditNoteNumber,
      original_invoice_id: invoice.id,
      original_invoice_number: invoice.invoice_number,
      customer_id: invoice.customer_id,
      return_reason: params.reason,
      total_amount: refundTotal,
      refund_mode: params.refundMode,
      created_at: nowIso,
    };

    // Check if entire invoice is returned
    const totalOriginalBilledQty = allSaleItems.reduce((acc, it) => acc + it.qty, 0);
    const totalReturnedQtyNow = returnedItemsList.reduce((acc, it) => acc + it.qtyReturned, 0);
    const isFullReturn = totalReturnedQtyNow >= totalOriginalBilledQty;

    const updatedInvoice: SalesInvoice = {
      ...invoice,
      status: isFullReturn ? 'RETURNED' : invoice.status,
      return_reason: params.reason,
      credit_note_number: creditNoteNumber,
      returned_at: nowIso,
    };

    // 2. Atomic database execution
    await activeDb.transaction(
      'rw',
      [
        activeDb.credit_notes,
        activeDb.sales_invoices,
        activeDb.products,
        activeDb.inventory_logs,
        activeDb.customers,
        activeDb.khata_transactions,
        activeDb.daily_galla_sessions,
      ],
      async () => {
        // Save Credit Note
        await activeDb.credit_notes.add(creditNote);

        // Update Sales Invoice
        await activeDb.sales_invoices.put(updatedInvoice);

        // Restore inventory & log RETURN_IN
        for (const item of inventoryUpdates) {
          const product = await activeDb.products.get(item.productId);
          if (product) {
            const newStock = roundQty(product.current_stock + item.returnQty);
            await activeDb.products.update(product.id, {
              current_stock: newStock,
              updated_at: nowIso,
            });

            const returnLog: InventoryLog = {
              id: `log-ret-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              shop_id: shopId,
              business_type: bizType,
              product_id: product.id,
              change_qty: item.returnQty,
              reason_type: 'RETURN_IN',
              unit_cost_at_time: item.unitCost,
              reference_id: creditNoteNumber,
              notes: `Partial Return (${creditNoteNumber}): ${item.returnQty} ${product.unit_type} from Bill #${invoice.invoice_number} (${params.reason})`,
              created_at: nowIso,
            };
            await activeDb.inventory_logs.add(returnLog);
          }
        }

        // Handle Customer Udhari Reversal
        if (params.refundMode === 'UDHARI_CREDIT' && invoice.customer_id !== WALK_IN_CUSTOMER_ID) {
          const customer = await activeDb.customers.get(invoice.customer_id);
          if (customer) {
            const newUdhari = roundCurrency(Math.max(0, customer.current_udhari_balance - refundTotal));
            await activeDb.customers.update(customer.id, {
              current_udhari_balance: newUdhari,
            });

            const khataTx: KhataTransaction = {
              id: `khata-cn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              shop_id: shopId,
              business_type: bizType,
              customer_id: customer.id,
              entry_type: 'CREDIT_JAMA_RECEIVED',
              amount: refundTotal,
              payment_channel: 'DISCOUNT_SETTLEMENT',
              invoice_id: invoice.id,
              running_balance_after: newUdhari,
              notes: `Credit Note ${creditNoteNumber} for returned items in Bill #${invoice.invoice_number}`,
              created_at: nowIso,
            };
            await activeDb.khata_transactions.add(khataTx);
          }
        }

        // Handle Cash refund from Daily Galla
        if (params.refundMode === 'CASH') {
          const session = await activeDb.daily_galla_sessions
            .filter((s) => s.session_date === todayDate)
            .first();

          if (session) {
            const newExpenses = roundCurrency(session.cash_expenses_out + refundTotal);
            const newExpected = roundCurrency(session.expected_closing_cash - refundTotal);
            await activeDb.daily_galla_sessions.update(session.id, {
              cash_expenses_out: newExpenses,
              expected_closing_cash: newExpected,
            });
          }
        }
      }
    );

    return {
      creditNote,
      refundTotal,
      returnedItems: returnedItemsList,
      invoiceUpdated: updatedInvoice,
    };
  }

  /**
   * Generates a device-prefixed invoice number for multi-device conflict avoidance:
   * e.g., KRN-20261107-D1-001 or HMF-20261107-D2-001
   */
  static getDevicePrefixedInvoiceNumber(basePrefix: string, seq: number): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const deviceId = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('kirana_device_id') || 'D1')
      : 'D1';

    const cleanPrefix = basePrefix.replace(/-+$/, '');
    const seqStr = String(seq).padStart(3, '0');
    return `${cleanPrefix}-${yyyy}${mm}${dd}-${deviceId}-${seqStr}`;
  }
}

