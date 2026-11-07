import { db, getActiveDb } from '../db/db';
import {
  Product,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  Wholesaler,
  WholesalerKhataTransaction,
  InventoryLog,
  ExpenseAndDrawing,
  DailyGallaSession,
  UnitType,
} from '../types';
import { roundCurrency, roundQty, toPaise, toRupees } from '../utils/math';
import { getActiveShopId, getActiveBusinessType } from '../utils/businessFirewall';

export interface PurchaseInwardItemInput {
  productId: string;
  qty: number;
  purchasePrice: number;
  sellingPrice?: number;
  mrp?: number;
  batchCode?: string;
  expiryDate?: string;
}

export interface PurchaseInwardParams {
  wholesalerId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  items: PurchaseInwardItemInput[];
  paymentMode: 'CASH' | 'BANK_UPI' | 'CREDIT_UDHARI' | 'SPLIT';
  amountPaid: number;
  notes?: string;
}

export interface PurchaseInwardResult {
  invoice: PurchaseInvoice;
  updatedProducts: Product[];
  khataTransaction?: WholesalerKhataTransaction;
  gallaSessionUpdated?: boolean;
}

export class WholesalerPurchaseService {
  /**
   * Computes exact Weighted-Average Cost in integer paise:
   * C_avg = round(( (S_old * C_old_paise) + (S_new * C_new_paise) ) / (S_old + S_new)) / 100
   */
  static computeWeightedAverageCost(
    currentStock: number,
    currentCost: number,
    newQty: number,
    newCost: number
  ): number {
    const sOld = Math.max(0, roundQty(currentStock));
    const sNew = roundQty(newQty);
    const cNew = roundCurrency(newCost);
    const cOld = roundCurrency(currentCost);

    if (sOld <= 0) {
      return cNew;
    }
    const totalQty = roundQty(sOld + sNew);
    if (totalQty <= 0) {
      return cNew;
    }

    const oldValuePaise = Math.round(sOld * toPaise(cOld));
    const newValuePaise = Math.round(sNew * toPaise(cNew));
    const avgPaise = Math.round((oldValuePaise + newValuePaise) / totalQty);

    return toRupees(avgPaise);
  }

  /**
   * Generates next purchase invoice sequence: PUR-YYYYMMDD-001
   */
  static async generatePurchaseInvoiceNumber(): Promise<string> {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const prefix = `PUR-${yyyy}${mm}${dd}-`;

    const activeDb = getActiveDb();
    const count = await activeDb.purchase_invoices.count();
    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}${seq}`;
  }

  /**
   * Executes complete atomic Goods Received Note (GRN) inward:
   * 1. Updates each product's stock & weighted-average cost
   * 2. Logs PURCHASE_IN inventory logs
   * 3. Saves PurchaseInvoice record
   * 4. Updates Wholesaler Khata if credit is due
   * 5. Deducts from Daily Galla session if cash was paid out
   */
  static async processPurchaseInward(params: PurchaseInwardParams): Promise<PurchaseInwardResult> {
    if (!params.items || params.items.length === 0) {
      throw new Error('Purchase invoice must contain at least one item');
    }

    const activeDb = getActiveDb();
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];

    // 1. Fetch Wholesaler
    const wholesaler = await activeDb.wholesalers.get(params.wholesalerId);
    if (!wholesaler) {
      throw new Error(`Wholesaler not found: ${params.wholesalerId}`);
    }

    const invoiceNumber = params.invoiceNumber || (await this.generatePurchaseInvoiceNumber());
    const invoiceId = `pur-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const shopId = wholesaler.shop_id || getActiveShopId();
    const bizType = wholesaler.business_type || getActiveBusinessType();

    let grandTotalPaise = 0;
    const processedItems: PurchaseInvoiceItem[] = [];
    const updatedProducts: Product[] = [];
    const inventoryLogs: InventoryLog[] = [];

    // 2. Process line items & weighted-average costs
    for (const itemInput of params.items) {
      const prod = await activeDb.products.get(itemInput.productId);
      if (!prod) {
        throw new Error(`Product not found: ${itemInput.productId}`);
      }

      const inQty = roundQty(itemInput.qty);
      const inPrice = roundCurrency(itemInput.purchasePrice);
      const lineTotal = toRupees(Math.round(inQty * toPaise(inPrice)));
      grandTotalPaise += toPaise(lineTotal);

      // Compute new weighted average cost
      const weightedCost = this.computeWeightedAverageCost(
        prod.current_stock,
        prod.purchase_price,
        inQty,
        inPrice
      );
      const newStock = roundQty(prod.current_stock + inQty);

      const updatedProd: Product = {
        ...prod,
        current_stock: newStock,
        purchase_price: weightedCost,
        selling_price: itemInput.sellingPrice ?? prod.selling_price,
        mrp: itemInput.mrp ?? prod.mrp,
        wholesaler_id: wholesaler.id,
        last_supplier_name: wholesaler.name,
        updated_at: nowIso,
      };
      updatedProducts.push(updatedProd);

      processedItems.push({
        product_id: prod.id,
        product_name: prod.name,
        qty: inQty,
        unit_type: prod.unit_type,
        purchase_price: inPrice,
        selling_price: updatedProd.selling_price,
        mrp: updatedProd.mrp,
        line_total: lineTotal,
        batch_code: itemInput.batchCode,
        expiry_date: itemInput.expiryDate,
      });

      inventoryLogs.push({
        id: `log-pur-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        shop_id: shopId,
        business_type: bizType,
        product_id: prod.id,
        change_qty: inQty,
        reason_type: 'PURCHASE_IN',
        unit_cost_at_time: inPrice,
        reference_id: invoiceNumber,
        notes: `Wholesaler GRN: ${wholesaler.name} (Invoice ${invoiceNumber}) @ ₹${inPrice}/unit (New Avg: ₹${weightedCost})`,
        created_at: nowIso,
      });
    }

    const grandTotal = toRupees(grandTotalPaise);
    const amountPaid = roundCurrency(params.amountPaid);
    const balanceDue = roundCurrency(Math.max(0, grandTotal - amountPaid));

    const purchaseInvoice: PurchaseInvoice = {
      id: invoiceId,
      shop_id: shopId,
      business_type: bizType,
      invoice_number: invoiceNumber,
      wholesaler_id: wholesaler.id,
      wholesaler_name: wholesaler.name,
      invoice_date: params.invoiceDate || todayDate,
      items: processedItems,
      subtotal: grandTotal,
      grand_total: grandTotal,
      payment_mode: params.paymentMode,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      status: 'RECEIVED',
      notes: params.notes,
      created_at: nowIso,
    };

    let khataTx: WholesalerKhataTransaction | undefined;
    let gallaSessionUpdated = false;

    // 3. Atomic Dexie transaction
    await activeDb.transaction(
      'rw',
      [
        activeDb.purchase_invoices,
        activeDb.products,
        activeDb.inventory_logs,
        activeDb.wholesaler_khata_transactions,
        activeDb.daily_galla_sessions,
        activeDb.expenses_and_drawings,
      ],
      async () => {
        // Save Purchase Invoice
        await activeDb.purchase_invoices.add(purchaseInvoice);

        // Update Products
        for (const p of updatedProducts) {
          await activeDb.products.put(p);
        }

        // Add Inventory Logs
        await activeDb.inventory_logs.bulkAdd(inventoryLogs);

        // Record Wholesaler Khata Transaction if balance is due
        if (balanceDue > 0) {
          // Calculate previous running balance
          const previousTx = await activeDb.wholesaler_khata_transactions
            .where('wholesaler_id')
            .equals(wholesaler.id)
            .reverse()
            .sortBy('created_at');
          const lastBal = previousTx.length > 0 ? previousTx[0].running_balance_after : 0;
          const newRunningBal = roundCurrency(lastBal + balanceDue);

          khataTx = {
            id: `wtx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            shop_id: shopId,
            business_type: bizType,
            wholesaler_id: wholesaler.id,
            entry_type: 'PURCHASE_CREDIT_DUE',
            amount: balanceDue,
            purchase_invoice_id: invoiceId,
            running_balance_after: newRunningBal,
            notes: `Purchase Bill ${invoiceNumber} credit balance due`,
            created_at: nowIso,
          };
          await activeDb.wholesaler_khata_transactions.add(khataTx);
        }

        // Handle Cash payment deduction from Daily Galla session
        if (amountPaid > 0 && (params.paymentMode === 'CASH' || params.paymentMode === 'SPLIT')) {
          const session = await activeDb.daily_galla_sessions
            .filter((s) => s.session_date === todayDate)
            .first();

          if (session) {
            const newExpenses = roundCurrency(session.cash_expenses_out + amountPaid);
            const newExpected = roundCurrency(session.expected_closing_cash - amountPaid);
            await activeDb.daily_galla_sessions.update(session.id, {
              cash_expenses_out: newExpenses,
              expected_closing_cash: newExpected,
            });
            gallaSessionUpdated = true;
          } else {
            const newSession: DailyGallaSession = {
              id: `galla-${shopId.slice(0, 8)}-${todayDate}-${Math.random().toString(36).slice(2, 6)}`,
              shop_id: shopId,
              business_type: bizType,
              session_date: todayDate,
              opening_cash: 0,
              cash_sales_total: 0,
              cash_udhari_recovered: 0,
              cash_expenses_out: amountPaid,
              expected_closing_cash: roundCurrency(-amountPaid),
              actual_counted_cash: null,
              discrepancy: null,
            };
            await activeDb.daily_galla_sessions.add(newSession);
            gallaSessionUpdated = true;
          }

          // Also record an Expense entry for tracking
          const exp: ExpenseAndDrawing = {
            id: `exp-pur-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            shop_id: shopId,
            business_type: bizType,
            entry_type: 'BUSINESS_EXPENSE',
            category: 'SHOP_EXPENSE_RENT_ELEC',
            amount: amountPaid,
            paid_via: 'CASH_GALLA',
            description: `Wholesaler Inward Cash Payment: ${wholesaler.name} (Invoice ${invoiceNumber})`,
            created_at: nowIso,
          };
          await activeDb.expenses_and_drawings.add(exp);
        }
      }
    );

    return {
      invoice: purchaseInvoice,
      updatedProducts,
      khataTransaction: khataTx,
      gallaSessionUpdated,
    };
  }

  /**
   * Records a subsequent payment made to a Wholesaler to settle pending Khata dues
   */
  static async recordWholesalerPayment(params: {
    wholesalerId: string;
    amount: number;
    paymentChannel: 'CASH' | 'UPI_BANK' | 'CHEQUE';
    notes?: string;
  }): Promise<WholesalerKhataTransaction> {
    const activeDb = getActiveDb();
    const amount = roundCurrency(params.amount);
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const wholesaler = await activeDb.wholesalers.get(params.wholesalerId);
    if (!wholesaler) {
      throw new Error(`Wholesaler not found: ${params.wholesalerId}`);
    }

    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];
    const shopId = wholesaler.shop_id || getActiveShopId();
    const bizType = wholesaler.business_type || getActiveBusinessType();

    const previousTx = await activeDb.wholesaler_khata_transactions
      .where('wholesaler_id')
      .equals(wholesaler.id)
      .reverse()
      .sortBy('created_at');
    const lastBal = previousTx.length > 0 ? previousTx[0].running_balance_after : 0;
    const newRunningBal = roundCurrency(Math.max(0, lastBal - amount));

    const paymentTx: WholesalerKhataTransaction = {
      id: `wtx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: shopId,
      business_type: bizType,
      wholesaler_id: wholesaler.id,
      entry_type: 'PAYMENT_MADE_SETTLED',
      amount,
      payment_channel: params.paymentChannel,
      running_balance_after: newRunningBal,
      notes: params.notes || `Paid to ${wholesaler.name} via ${params.paymentChannel}`,
      created_at: nowIso,
    };

    await activeDb.transaction(
      'rw',
      [activeDb.wholesaler_khata_transactions, activeDb.daily_galla_sessions, activeDb.expenses_and_drawings],
      async () => {
        await activeDb.wholesaler_khata_transactions.add(paymentTx);

        // If paid in cash, deduct from active Daily Galla
        if (params.paymentChannel === 'CASH') {
          const session = await activeDb.daily_galla_sessions
            .filter((s) => s.session_date === todayDate)
            .first();

          if (session) {
            const newExpenses = roundCurrency(session.cash_expenses_out + amount);
            const newExpected = roundCurrency(session.expected_closing_cash - amount);
            await activeDb.daily_galla_sessions.update(session.id, {
              cash_expenses_out: newExpenses,
              expected_closing_cash: newExpected,
            });
          } else {
            const newSession: DailyGallaSession = {
              id: `galla-${shopId.slice(0, 8)}-${todayDate}-${Math.random().toString(36).slice(2, 6)}`,
              shop_id: shopId,
              business_type: bizType,
              session_date: todayDate,
              opening_cash: 0,
              cash_sales_total: 0,
              cash_udhari_recovered: 0,
              cash_expenses_out: amount,
              expected_closing_cash: roundCurrency(-amount),
              actual_counted_cash: null,
              discrepancy: null,
            };
            await activeDb.daily_galla_sessions.add(newSession);
          }

          const exp: ExpenseAndDrawing = {
            id: `exp-wpay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            shop_id: shopId,
            business_type: bizType,
            entry_type: 'BUSINESS_EXPENSE',
            category: 'SHOP_EXPENSE_RENT_ELEC',
            amount,
            paid_via: 'CASH_GALLA',
            description: `Khata Settlement to Wholesaler ${wholesaler.name}`,
            created_at: nowIso,
          };
          await activeDb.expenses_and_drawings.add(exp);
        }
      }
    );

    return paymentTx;
  }
}

