import { db } from '../db/db';
import {
  DailyGallaSession,
  ExpenseAndDrawing,
  ExpenseCategory,
  ExpenseEntryType,
  ExpensePaidVia,
  SalesInvoice,
  PaymentMode,
  InventoryLog,
  KhataTransaction,
} from '../types';
import { roundCurrency, toPaise, toRupees } from '../utils/math';
import { getActiveShopId, getActiveBusinessType } from '../utils/businessFirewall';
import { isHomemadeShopId } from './tenantManager';
import { cloudSyncService } from './cloudSyncService';

export class GallaService {
  /**
   * Fetch or auto-create today's Daily Galla session strictly scoped by shop_id
   */
  static async getOrCreateTodaySession(customShopId?: string): Promise<DailyGallaSession> {
    const todayDate = new Date().toISOString().split('T')[0];
    const activeShopId = customShopId || getActiveShopId();
    const activeBiz = isHomemadeShopId(activeShopId) ? 'HOMEMADE_FOOD' : getActiveBusinessType();

    let session = await db.daily_galla_sessions
      .filter(
        (s) =>
          s.session_date === todayDate &&
          (s.shop_id === activeShopId ||
            s.shop_id === 'current_shop' ||
            activeShopId === 'current_shop' ||
            (!s.shop_id && s.business_type === activeBiz))
      )
      .first();

    if (!session) {
      session = {
        id: `galla-${activeShopId.slice(0, 8)}-${todayDate}-${Math.random().toString(36).slice(2, 6)}`,
        shop_id: activeShopId,
        business_type: activeBiz,
        session_date: todayDate,
        opening_cash: 0,
        cash_sales_total: 0,
        cash_udhari_recovered: 0,
        cash_expenses_out: 0,
        expected_closing_cash: 0,
        actual_counted_cash: null,
        discrepancy: null,
      };
      await db.daily_galla_sessions.add(session);
      await db.queueSync(
        {
          table_name: 'daily_galla_sessions',
          operation: 'INSERT',
          payload: session as unknown as Record<string, unknown>,
          shop_id: activeShopId,
        },
        db.sync_outbox
      ).catch(() => {});
      cloudSyncService.syncGallaSession(session).catch(() => {});
    }

    return session;
  }

  /**
   * Sets morning opening cash in drawer and recalculates expected closing cash strictly for active shop_id
   */
  static async setOpeningCash(sessionDate: string, openingCash: number, customShopId?: string): Promise<DailyGallaSession> {
    const activeShopId = customShopId || getActiveShopId();
    const activeBiz = isHomemadeShopId(activeShopId) ? 'HOMEMADE_FOOD' : getActiveBusinessType();
    let updated!: DailyGallaSession;

    await db.transaction('rw', [db.daily_galla_sessions, db.sync_outbox], async () => {
      let session = await db.daily_galla_sessions
        .filter(
          (s) =>
            s.session_date === sessionDate &&
            (s.shop_id === activeShopId ||
              s.shop_id === 'current_shop' ||
              activeShopId === 'current_shop' ||
              (!s.shop_id && s.business_type === activeBiz))
        )
        .first();

      if (!session) {
        session = {
          id: `galla-${activeShopId.slice(0, 8)}-${sessionDate}-${Math.random().toString(36).slice(2, 6)}`,
          shop_id: activeShopId,
          business_type: activeBiz,
          session_date: sessionDate,
          opening_cash: roundCurrency(openingCash),
          cash_sales_total: 0,
          cash_udhari_recovered: 0,
          cash_expenses_out: 0,
          expected_closing_cash: roundCurrency(openingCash),
          actual_counted_cash: null,
          discrepancy: null,
        };
        await db.daily_galla_sessions.add(session);
        updated = session;
        await db.queueSync(
          {
            table_name: 'daily_galla_sessions',
            operation: 'INSERT',
            payload: updated as unknown as Record<string, unknown>,
            shop_id: activeShopId,
          },
          db.sync_outbox
        );
      } else {
        const opening = roundCurrency(openingCash);
        const expected = roundCurrency(
          opening + session.cash_sales_total + session.cash_udhari_recovered - session.cash_expenses_out
        );
        const discrepancy = session.actual_counted_cash !== null && session.actual_counted_cash !== undefined
          ? roundCurrency(session.actual_counted_cash - expected)
          : null;

        await db.daily_galla_sessions.update(session.id, {
          opening_cash: opening,
          expected_closing_cash: expected,
          discrepancy,
        });

        updated = { ...session, opening_cash: opening, expected_closing_cash: expected, discrepancy };
        await db.queueSync(
          {
            table_name: 'daily_galla_sessions',
            operation: 'UPDATE',
            payload: updated as unknown as Record<string, unknown>,
            shop_id: activeShopId,
          },
          db.sync_outbox
        );
      }
    });

    cloudSyncService.syncGallaSession(updated).catch(() => {});
    cloudSyncService.flushOutbox().catch(() => {});
    return updated;
  }

  /**
   * Records a shop expense or owner drawing (REQ-13)
   * If paid via CASH_GALLA, atomically deducts from daily galla session
   */
  static async recordExpense(params: {
    category: ExpenseCategory;
    entryType?: ExpenseEntryType;
    amount: number;
    paidVia: ExpensePaidVia;
    description: string;
    shop_id?: string;
    business_type?: string;
  }): Promise<{ expense: ExpenseAndDrawing; session?: DailyGallaSession }> {
    if (params.amount <= 0) throw new Error('Expense amount must be greater than zero');

    const expAmount = roundCurrency(params.amount);
    const todayDate = new Date().toISOString().split('T')[0];
    const activeShopId = params.shop_id || getActiveShopId();
    const activeBiz = (params.business_type as any) || getActiveBusinessType();

    const resolvedEntryType: ExpenseEntryType =
      params.entryType ||
      (params.category === 'INITIAL_INVESTMENT_SETUP'
        ? 'INITIAL_INVESTMENT'
        : params.category === 'RAW_MATERIAL_INGREDIENTS'
        ? 'RAW_MATERIAL_EXPENSE'
        : params.category === 'HOME_FAMILY_EXPENSE' ||
          params.category === 'OWNER_CASH_DRAWING' ||
          params.category === 'HOME_SELF_USE_GOODS'
        ? 'HOME_FAMILY_EXPENSE'
        : 'BUSINESS_EXPENSE');

    const expense: ExpenseAndDrawing = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: activeShopId,
      business_type: activeBiz,
      category: params.category,
      entry_type: resolvedEntryType,
      amount: expAmount,
      paid_via: params.paidVia,
      description: params.description.trim(),
      created_at: new Date().toISOString(),
    };

    let session: DailyGallaSession | undefined;

    await db.transaction('rw', [db.expenses_and_drawings, db.daily_galla_sessions, db.sync_outbox], async () => {
      await db.expenses_and_drawings.add(expense);
      await db.queueSync(
        { table_name: 'expenses_and_drawings', operation: 'INSERT', payload: expense as unknown as Record<string, unknown>, shop_id: expense.shop_id },
        db.sync_outbox
      );

      if (params.paidVia === 'CASH_GALLA') {
        const currentSession = await db.daily_galla_sessions
          .filter(
            (s) =>
              s.session_date === todayDate &&
              (s.shop_id === activeShopId ||
                s.shop_id === 'current_shop' ||
                activeShopId === 'current_shop' ||
                (!s.shop_id && s.business_type === activeBiz))
          )
          .first();

        if (currentSession) {
          const newExpenses = roundCurrency(currentSession.cash_expenses_out + expAmount);
          const newExpected = roundCurrency(
            currentSession.opening_cash +
              currentSession.cash_sales_total +
              currentSession.cash_udhari_recovered -
              newExpenses
          );
          const discrepancy =
            currentSession.actual_counted_cash !== null && currentSession.actual_counted_cash !== undefined
              ? roundCurrency(currentSession.actual_counted_cash - newExpected)
              : null;

          await db.daily_galla_sessions.update(currentSession.id, {
            cash_expenses_out: newExpenses,
            expected_closing_cash: newExpected,
            discrepancy,
          });
          await db.queueSync(
            { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: currentSession.id, cash_expenses_out: newExpenses, expected_closing_cash: newExpected, discrepancy }, shop_id: expense.shop_id },
            db.sync_outbox
          );

          session = {
            ...currentSession,
            cash_expenses_out: newExpenses,
            expected_closing_cash: newExpected,
            discrepancy,
          };
        } else {
          const newSession: DailyGallaSession = {
            id: `galla-${activeShopId.slice(0, 8)}-${todayDate}-${Math.random().toString(36).slice(2, 6)}`,
            shop_id: activeShopId,
            business_type: activeBiz,
            session_date: todayDate,
            opening_cash: 0,
            cash_sales_total: 0,
            cash_udhari_recovered: 0,
            cash_expenses_out: expAmount,
            expected_closing_cash: roundCurrency(-expAmount),
            actual_counted_cash: null,
            discrepancy: null,
          };
          await db.daily_galla_sessions.add(newSession);
          await db.queueSync(
            { table_name: 'daily_galla_sessions', operation: 'INSERT', payload: newSession as unknown as Record<string, unknown>, shop_id: expense.shop_id },
            db.sync_outbox
          );
          session = newSession;
        }
      }
    });

    cloudSyncService.flushOutbox().catch(() => {});
    return { expense, session };
  }

  /**
   * Evening physical cash count reconciliation
   * Calculates discrepancy = actual_counted_cash - expected_closing_cash
   */
  static async recordEveningCashCount(
    sessionDate: string,
    actualCountedCash: number,
    customShopId?: string
  ): Promise<DailyGallaSession> {
    const activeShopId = customShopId || getActiveShopId();
    const activeBiz = isHomemadeShopId(activeShopId) ? 'HOMEMADE_FOOD' : getActiveBusinessType();
    let updated!: DailyGallaSession;

    await db.transaction('rw', [db.daily_galla_sessions, db.sync_outbox], async () => {
      const session = await db.daily_galla_sessions
        .filter(
          (s) =>
            s.session_date === sessionDate &&
            (s.shop_id === activeShopId ||
              s.shop_id === 'current_shop' ||
              activeShopId === 'current_shop' ||
              (!s.shop_id && s.business_type === activeBiz))
        )
        .first();
      if (!session) throw new Error(`No galla session found for date: ${sessionDate}`);

      const actual = roundCurrency(actualCountedCash);
      const discrepancy = roundCurrency(actual - session.expected_closing_cash);

      await db.daily_galla_sessions.update(session.id, {
        actual_counted_cash: actual,
        discrepancy,
      });
      await db.queueSync(
        { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: session.id, actual_counted_cash: actual, discrepancy }, shop_id: session.shop_id },
        db.sync_outbox
      );

      updated = { ...session, actual_counted_cash: actual, discrepancy };
    });

    cloudSyncService.flushOutbox().catch(() => {});
    return updated;
  }

  /**
   * Void / Rollback Bill (REQ-34 / AT-09)
   * Restores product stock with RETURN_IN logs and reverses customer udhari balance atomically.
   */
  static async voidInvoice(invoiceId: string): Promise<SalesInvoice> {
    let voidedInvoice!: SalesInvoice;

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
      ],
      async () => {
        const invoice = await db.sales_invoices.get(invoiceId);
        if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);
        if (invoice.status === 'VOIDED') throw new Error('Invoice is already voided');

        // 1. Mark status VOIDED
        await db.sales_invoices.update(invoiceId, { status: 'VOIDED' });
        await db.queueSync(
          { table_name: 'sales_invoices', operation: 'UPDATE', payload: { id: invoiceId, status: 'VOIDED' }, shop_id: invoice.shop_id },
          db.sync_outbox
        );
        voidedInvoice = { ...invoice, status: 'VOIDED' };

        // 2. Fetch sale items and restore stock (RETURN_IN)
        const items = await db.sale_items.where({ invoice_id: invoiceId }).toArray();
        const nowIso = new Date().toISOString();

        for (const item of items) {
          const product = await db.products.get(item.product_id);
          if (product) {
            const restoredStock = roundCurrency(product.current_stock + item.qty);
            await db.products.update(item.product_id, {
              current_stock: restoredStock,
              updated_at: nowIso,
            });
            await db.queueSync(
              { table_name: 'products', operation: 'UPDATE', payload: { id: item.product_id, current_stock: restoredStock, updated_at: nowIso }, shop_id: invoice.shop_id },
              db.sync_outbox
            );

            const returnLog: InventoryLog = {
              id: `log-return-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              shop_id: invoice.shop_id || 'current_shop',
              product_id: item.product_id,
              change_qty: item.qty,
              reason_type: 'RETURN_IN',
              unit_cost_at_time: item.unit_purchase_cost,
              reference_id: invoiceId,
              notes: `Void rollback for invoice ${invoice.invoice_number}`,
              created_at: nowIso,
            };
            await db.inventory_logs.add(returnLog);
            await db.queueSync(
              { table_name: 'inventory_logs', operation: 'INSERT', payload: returnLog as unknown as Record<string, unknown>, shop_id: returnLog.shop_id },
              db.sync_outbox
            );
          }
        }

        // 3. If Udhari was added, reverse customer balance
        if (invoice.udhari_added > 0 && invoice.customer_id !== '0000-WALK-IN') {
          const cust = await db.customers.get(invoice.customer_id);
          if (cust) {
            const reversedBalance = roundCurrency(
              Math.max(0, cust.current_udhari_balance - invoice.udhari_added)
            );
            await db.customers.update(invoice.customer_id, {
              current_udhari_balance: reversedBalance,
            });
            await db.queueSync(
              { table_name: 'customers', operation: 'UPDATE', payload: { id: invoice.customer_id, current_udhari_balance: reversedBalance }, shop_id: invoice.shop_id },
              db.sync_outbox
            );

            const voidKhataTx: KhataTransaction = {
              id: `khata-void-${Date.now()}`,
              shop_id: invoice.shop_id || 'current_shop',
              customer_id: invoice.customer_id,
              entry_type: 'CREDIT_JAMA_RECEIVED',
              amount: invoice.udhari_added,
              payment_channel: 'DISCOUNT_SETTLEMENT',
              invoice_id: invoiceId,
              running_balance_after: reversedBalance,
              notes: `Void reversal for invoice ${invoice.invoice_number}`,
              created_at: nowIso,
            };
            await db.khata_transactions.add(voidKhataTx);
            await db.queueSync(
              { table_name: 'khata_transactions', operation: 'INSERT', payload: voidKhataTx as unknown as Record<string, unknown>, shop_id: voidKhataTx.shop_id },
              db.sync_outbox
            );
          }
        }

        // 4. If cash was paid now, adjust daily galla
        if (invoice.amount_paid_now > 0 && invoice.payment_mode === 'CASH') {
          const invoiceDate = invoice.created_at.split('T')[0];
          const session = await db.daily_galla_sessions
            .where({ session_date: invoiceDate })
            .first();

          if (session) {
            const newSales = roundCurrency(
              Math.max(0, session.cash_sales_total - invoice.amount_paid_now)
            );
            const newExpected = roundCurrency(
              Math.max(0, session.expected_closing_cash - invoice.amount_paid_now)
            );
            await db.daily_galla_sessions.update(session.id, {
              cash_sales_total: newSales,
              expected_closing_cash: newExpected,
            });
            await db.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: session.id, cash_sales_total: newSales, expected_closing_cash: newExpected }, shop_id: invoice.shop_id },
              db.sync_outbox
            );
          }
        }
      }
    );

    cloudSyncService.flushOutbox().catch(() => {});
    return voidedInvoice;
  }

  /**
   * Bulk voids multiple invoices
   */
  static async bulkVoidInvoices(invoiceIds: string[]): Promise<void> {
    for (const id of invoiceIds) {
      await this.voidInvoice(id);
    }
  }

  /**
   * Updates an invoice payment mode or customer (e.g. from Cash to UPI or Udhari)
   */
  static async updateInvoiceDetails(
    invoiceId: string,
    updates: {
      customerId?: string;
      paymentMode?: PaymentMode;
    }
  ): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.sales_invoices,
        db.customers,
        db.khata_transactions,
        db.daily_galla_sessions,
        db.sync_outbox,
      ],
      async () => {
        const inv = await db.sales_invoices.get(invoiceId);
        if (!inv) throw new Error(`Invoice not found: ${invoiceId}`);
        if (inv.status === 'VOIDED') throw new Error('Cannot edit a voided invoice');

        const nowIso = new Date().toISOString();
        const oldMode = inv.payment_mode;
        const newMode = updates.paymentMode || oldMode;
        const newCustomerId = updates.customerId || inv.customer_id;

        const invoiceDate = inv.created_at.split('T')[0];
        const session = await db.daily_galla_sessions.where({ session_date: invoiceDate }).first();

        if (session) {
          if (oldMode === 'CASH' && newMode !== 'CASH') {
            const newSales = roundCurrency(Math.max(0, session.cash_sales_total - inv.amount_paid_now));
            const newExpected = roundCurrency(Math.max(0, session.expected_closing_cash - inv.amount_paid_now));
            await db.daily_galla_sessions.update(session.id, {
              cash_sales_total: newSales,
              expected_closing_cash: newExpected,
            });
            await db.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: session.id, cash_sales_total: newSales, expected_closing_cash: newExpected }, shop_id: inv.shop_id },
              db.sync_outbox
            );
          } else if (oldMode !== 'CASH' && newMode === 'CASH') {
            const newSales = roundCurrency(session.cash_sales_total + inv.amount_paid_now);
            const newExpected = roundCurrency(session.expected_closing_cash + inv.amount_paid_now);
            await db.daily_galla_sessions.update(session.id, {
              cash_sales_total: newSales,
              expected_closing_cash: newExpected,
            });
            await db.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: session.id, cash_sales_total: newSales, expected_closing_cash: newExpected }, shop_id: inv.shop_id },
              db.sync_outbox
            );
          }
        }

        let amountPaidNow = inv.amount_paid_now;
        let udhariAdded = inv.udhari_added;

        // Handle Udhari adjustment if switched to/from Udhari
        if (oldMode === 'UDHARI_FULL' && newMode !== 'UDHARI_FULL') {
          if (inv.customer_id !== '0000-WALK-IN') {
            const cust = await db.customers.get(inv.customer_id);
            if (cust) {
              const rev = roundCurrency(Math.max(0, cust.current_udhari_balance - inv.udhari_added));
              await db.customers.update(inv.customer_id, { current_udhari_balance: rev });
              await db.queueSync(
                { table_name: 'customers', operation: 'UPDATE', payload: { id: inv.customer_id, current_udhari_balance: rev }, shop_id: inv.shop_id },
                db.sync_outbox
              );
            }
          }
          amountPaidNow = inv.grand_total;
          udhariAdded = 0;
        } else if (oldMode !== 'UDHARI_FULL' && newMode === 'UDHARI_FULL') {
          if (newCustomerId !== '0000-WALK-IN') {
            const cust = await db.customers.get(newCustomerId);
            if (cust) {
              const newBal = roundCurrency(cust.current_udhari_balance + inv.grand_total);
              await db.customers.update(newCustomerId, { current_udhari_balance: newBal });
              await db.queueSync(
                { table_name: 'customers', operation: 'UPDATE', payload: { id: newCustomerId, current_udhari_balance: newBal }, shop_id: inv.shop_id },
                db.sync_outbox
              );
              const khataEditTx: KhataTransaction = {
                id: `khata-edit-${Date.now()}`,
                shop_id: inv.shop_id || 'current_shop',
                customer_id: newCustomerId,
                entry_type: 'DEBIT_UDHARI_GIVEN',
                amount: inv.grand_total,
                payment_channel: 'BILL_CREDIT',
                invoice_id: invoiceId,
                running_balance_after: newBal,
                notes: `Transferred to Udhari from invoice ${inv.invoice_number}`,
                created_at: nowIso,
              };
              await db.khata_transactions.add(khataEditTx);
              await db.queueSync(
                { table_name: 'khata_transactions', operation: 'INSERT', payload: khataEditTx as unknown as Record<string, unknown>, shop_id: khataEditTx.shop_id },
                db.sync_outbox
              );
            }
          }
          amountPaidNow = 0;
          udhariAdded = inv.grand_total;
        }

        await db.sales_invoices.update(invoiceId, {
          payment_mode: newMode,
          customer_id: newCustomerId,
          amount_paid_now: amountPaidNow,
          udhari_added: udhariAdded,
        });
        await db.queueSync(
          {
            table_name: 'sales_invoices',
            operation: 'UPDATE',
            payload: {
              id: invoiceId,
              payment_mode: newMode,
              customer_id: newCustomerId,
              amount_paid_now: amountPaidNow,
              udhari_added: udhariAdded,
            },
            shop_id: inv.shop_id,
          },
          db.sync_outbox
        );
      }
    );

    cloudSyncService.flushOutbox().catch(() => {});
  }
}

