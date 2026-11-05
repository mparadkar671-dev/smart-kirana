import { db } from '../db/db';
import { LoanAccount, Product, InventoryLog, SaleItem, SalesInvoice } from '../types';
import { roundCurrency, roundQty } from '../utils/math';
import { cloudSyncService } from './cloudSyncService';

export interface CreateLoanAccountInput {
  name: string;
  lender_name: string;
  principal_amount: number;
  interest_rate_pct?: number;
  emi_or_daily_target?: number;
  amount_repaid?: number;
  notes?: string;
}

export interface LoanProductPerformanceRow {
  productId: string;
  productName: string;
  category: string;
  unitType: string;
  loanAccountId: string;
  loanAccountName: string;
  lenderName: string;
  // Purchases from Loan Capital
  purchasedQtyFromLoan: number;
  totalPurchaseCostFromLoan: number;
  // Current Remaining Stock
  currentStock: number;
  currentStockCostValuation: number;
  currentStockRetailValuation: number;
  // Sales & Profit
  totalQtySold: number;
  totalSalesRevenue: number;
  totalSalesCogs: number;
  totalNetProfit: number;
  profitMarginPct: number;
  // Today's Separate Collection Box (Daily Set-Aside)
  todayQtySold: number;
  todaySalesRevenue: number;
  todayPrincipalCogsToSeparate: number;
  todayNetProfit: number;
}

export interface LoanAccountSummaryRow {
  loanAccount: LoanAccount;
  linkedProductsCount: number;
  totalPurchasedFromLoan: number;
  unallocatedLoanBalance: number;
  currentStockValuationAtCost: number;
  currentStockValuationAtRetail: number;
  totalSalesRevenue: number;
  totalPrincipalRecoveredViaSales: number;
  totalNetProfitGenerated: number;
  // Today's Daily Separation Box
  todaySalesRevenue: number;
  todayPrincipalToSetAside: number;
  todayProfitEarned: number;
  remainingLoanToRepay: number;
}

export interface LoanInventoryReportData {
  loanAccounts: LoanAccountSummaryRow[];
  productRows: LoanProductPerformanceRow[];
  categorySummary: {
    category: string;
    productsCount: number;
    purchasedCostFromLoan: number;
    currentStockCost: number;
    salesRevenue: number;
    cogsRecovered: number;
    netProfit: number;
    todayRevenueToSetAside: number;
    todayPrincipalToSetAside: number;
  }[];
  totals: {
    totalLoanSanctioned: number;
    totalLoanAllocatedToStock: number;
    totalStockRemainingAtCost: number;
    totalSalesRevenue: number;
    totalPrincipalRecoveredFromSales: number;
    totalNetProfit: number;
    todayTotalRevenueFromLoanStock: number;
    todayTotalPrincipalToSeparate: number;
    todayTotalProfitFromLoanStock: number;
  };
}

export class LoanAccountService {
  static getActiveShopId(): string {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('smart_kirana_shop_id') || 'current_shop';
    }
    return 'current_shop';
  }

  /**
   * Returns all active loan accounts for the current shop
   */
  static async getAll(shopId?: string): Promise<LoanAccount[]> {
    const targetShopId = shopId || this.getActiveShopId();
    const all = await db.loan_accounts.toArray();
    return all
      .filter(
        (l) =>
          (!l.shop_id || l.shop_id === targetShopId || l.shop_id === 'current_shop') &&
          l.is_active !== false
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Creates a new Loan Account in local Dexie and syncs to cloud outbox
   */
  static async create(input: CreateLoanAccountInput): Promise<LoanAccount> {
    if (!input.name.trim()) {
      throw new Error('Loan Name / Title is required (e.g., Mudra Loan ₹50,000)');
    }
    if (input.principal_amount <= 0) {
      throw new Error('Loan Principal Amount must be greater than ₹0');
    }

    const shopId = this.getActiveShopId();
    const now = new Date().toISOString();
    const loan: LoanAccount = {
      id: `loan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: shopId,
      name: input.name.trim(),
      lender_name: input.lender_name?.trim() || 'Bank / Microfinance Lender',
      principal_amount: roundCurrency(input.principal_amount),
      interest_rate_pct: input.interest_rate_pct ? Number(input.interest_rate_pct) : 0,
      emi_or_daily_target: input.emi_or_daily_target ? roundCurrency(input.emi_or_daily_target) : 0,
      amount_repaid: roundCurrency(input.amount_repaid || 0),
      is_active: true,
      notes: input.notes?.trim() || '',
      created_at: now,
      updated_at: now,
    };

    await db.transaction('rw', [db.loan_accounts, db.sync_outbox], async () => {
      await db.loan_accounts.add(loan);
      await db.queueSync(
        {
          table_name: 'loan_accounts',
          operation: 'INSERT',
          payload: loan as unknown as Record<string, unknown>,
          shop_id: shopId,
        },
        db.sync_outbox
      );
    });

    cloudSyncService.syncLoanAccount?.(loan);
    return loan;
  }

  /**
   * Updates an existing Loan Account (including recording loan repayment)
   */
  static async update(id: string, updates: Partial<CreateLoanAccountInput & { is_active?: boolean }>): Promise<void> {
    const existing = await db.loan_accounts.get(id);
    if (!existing) throw new Error(`Loan account not found: ${id}`);

    const patched: Partial<LoanAccount> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    if (updates.principal_amount !== undefined) {
      patched.principal_amount = roundCurrency(updates.principal_amount);
    }
    if (updates.amount_repaid !== undefined) {
      patched.amount_repaid = roundCurrency(updates.amount_repaid);
    }

    await db.transaction('rw', [db.loan_accounts, db.sync_outbox], async () => {
      await db.loan_accounts.update(id, patched);
      await db.queueSync(
        {
          table_name: 'loan_accounts',
          operation: 'UPDATE',
          payload: { id, ...patched },
          shop_id: existing.shop_id || 'current_shop',
        },
        db.sync_outbox
      );
    });

    const updated = await db.loan_accounts.get(id);
    if (updated) cloudSyncService.syncLoanAccount?.(updated);
  }

  /**
   * Records a daily or periodic repayment toward a Loan Account
   */
  static async recordRepayment(loanId: string, repaymentAmount: number): Promise<LoanAccount> {
    if (repaymentAmount <= 0) throw new Error('Repayment amount must be positive');
    const existing = await db.loan_accounts.get(loanId);
    if (!existing) throw new Error('Loan account not found');

    const nextRepaid = roundCurrency((existing.amount_repaid || 0) + repaymentAmount);
    await this.update(loanId, { amount_repaid: nextRepaid });
    return (await db.loan_accounts.get(loanId))!;
  }

  /**
   * Deletes a Loan Account
   */
  static async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.loan_accounts, db.sync_outbox], async () => {
      await db.loan_accounts.delete(id);
      await db.queueSync(
        {
          table_name: 'loan_accounts',
          operation: 'DELETE',
          payload: { id },
        },
        db.sync_outbox
      );
    });
  }

  /**
   * Generates comprehensive Vyapar-style Loan-Funded Inventory, Purchase, Sales, Profit & Daily Set-Aside Report
   */
  static async getLoanFundedInventoryReport(params?: {
    loanAccountId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<LoanInventoryReportData> {
    const [allLoans, allProducts, allLogs, allInvoices, allSaleItems] = await Promise.all([
      this.getAll(),
      db.products.toArray(),
      db.inventory_logs.toArray(),
      db.sales_invoices.toArray(),
      db.sale_items.toArray(),
    ]);

    const loanMap = new Map<string, LoanAccount>(allLoans.map((l) => [l.id, l]));
    const todayPrefix = new Date().toISOString().split('T')[0];

    const isDateInRange = (isoDate: string): boolean => {
      if (!params?.startDate && !params?.endDate) return true;
      const t = new Date(isoDate).getTime();
      const start = params.startDate ? new Date(params.startDate).setHours(0, 0, 0, 0) : 0;
      const end = params.endDate ? new Date(params.endDate).setHours(23, 59, 59, 999) : Infinity;
      return t >= start && t <= end;
    };

    const completedInvoices = allInvoices.filter((inv) => inv.status === 'COMPLETED');
    const completedInvoiceMap = new Map<string, SalesInvoice>(
      completedInvoices.map((inv) => [inv.id, inv])
    );

    // Determine which products are loan-funded (either via product.loan_account_id OR via PURCHASE_IN inventory_logs with loan_account_id)
    const productLoanMap = new Map<string, string>();
    for (const p of allProducts) {
      if (p.loan_account_id) {
        productLoanMap.set(p.id, p.loan_account_id);
      }
    }
    for (const log of allLogs) {
      if (log.loan_account_id && log.reason_type === 'PURCHASE_IN') {
        productLoanMap.set(log.product_id, log.loan_account_id);
      }
    }

    // Filter by selected loanAccountId if requested
    const targetLoanFilter =
      params?.loanAccountId && params.loanAccountId !== 'ALL' ? params.loanAccountId : null;

    // Aggregate Purchases from Loan Capital per Product
    const purchaseAggByProduct = new Map<string, { qty: number; totalCost: number; loanId: string }>();
    for (const log of allLogs) {
      if (log.reason_type !== 'PURCHASE_IN' || log.change_qty <= 0) continue;
      if (!isDateInRange(log.created_at)) continue;

      const prod = allProducts.find((p) => p.id === log.product_id);
      const effectiveLoanId = log.loan_account_id || prod?.loan_account_id || null;
      if (!effectiveLoanId) continue;
      if (targetLoanFilter && effectiveLoanId !== targetLoanFilter) continue;

      const prev = purchaseAggByProduct.get(log.product_id) || {
        qty: 0,
        totalCost: 0,
        loanId: effectiveLoanId,
      };
      const qty = roundQty(log.change_qty);
      const cost = roundCurrency(qty * log.unit_cost_at_time);
      prev.qty = roundQty(prev.qty + qty);
      prev.totalCost = roundCurrency(prev.totalCost + cost);
      purchaseAggByProduct.set(log.product_id, prev);
    }

    // Aggregate Sales (Period + Today's Daily Separation Box) per Product
    const salesAggByProduct = new Map<
      string,
      {
        qtySold: number;
        revenue: number;
        cogs: number;
        todayQty: number;
        todayRevenue: number;
        todayCogs: number;
      }
    >();

    for (const item of allSaleItems) {
      const inv = completedInvoiceMap.get(item.invoice_id);
      if (!inv) continue;

      const prod = allProducts.find((p) => p.id === item.product_id);
      const effectiveLoanId =
        item.loan_account_id || prod?.loan_account_id || productLoanMap.get(item.product_id) || null;
      if (!effectiveLoanId) continue;
      if (targetLoanFilter && effectiveLoanId !== targetLoanFilter) continue;

      const isToday = inv.created_at.startsWith(todayPrefix);
      const inRange = isDateInRange(inv.created_at);
      if (!inRange && !isToday) continue;

      const prev = salesAggByProduct.get(item.product_id) || {
        qtySold: 0,
        revenue: 0,
        cogs: 0,
        todayQty: 0,
        todayRevenue: 0,
        todayCogs: 0,
      };

      const itemCogs = roundCurrency(item.qty * item.unit_purchase_cost);
      if (inRange) {
        prev.qtySold = roundQty(prev.qtySold + item.qty);
        prev.revenue = roundCurrency(prev.revenue + item.line_total);
        prev.cogs = roundCurrency(prev.cogs + itemCogs);
      }
      if (isToday) {
        prev.todayQty = roundQty(prev.todayQty + item.qty);
        prev.todayRevenue = roundCurrency(prev.todayRevenue + item.line_total);
        prev.todayCogs = roundCurrency(prev.todayCogs + itemCogs);
      }

      salesAggByProduct.set(item.product_id, prev);
    }

    // Build Product Performance Rows
    const productRows: LoanProductPerformanceRow[] = [];
    for (const prod of allProducts) {
      const loanId = prod.loan_account_id || productLoanMap.get(prod.id);
      if (!loanId) continue;
      if (targetLoanFilter && loanId !== targetLoanFilter) continue;

      const loanAcc = loanMap.get(loanId);
      const purch = purchaseAggByProduct.get(prod.id) || {
        qty: 0,
        totalCost: 0,
        loanId,
      };
      const sales = salesAggByProduct.get(prod.id) || {
        qtySold: 0,
        revenue: 0,
        cogs: 0,
        todayQty: 0,
        todayRevenue: 0,
        todayCogs: 0,
      };

      const netProfit = roundCurrency(sales.revenue - sales.cogs);
      const marginPct = sales.revenue > 0 ? Math.round((netProfit / sales.revenue) * 1000) / 10 : 0;
      const todayProfit = roundCurrency(sales.todayRevenue - sales.todayCogs);

      productRows.push({
        productId: prod.id,
        productName: prod.name,
        category: prod.category || 'General',
        unitType: prod.unit_type,
        loanAccountId: loanId,
        loanAccountName: loanAcc?.name || 'Loan Account',
        lenderName: loanAcc?.lender_name || 'Lender',
        purchasedQtyFromLoan: purch.qty,
        totalPurchaseCostFromLoan: purch.totalCost,
        currentStock: prod.current_stock,
        currentStockCostValuation: roundCurrency(prod.current_stock * prod.purchase_price),
        currentStockRetailValuation: roundCurrency(prod.current_stock * prod.selling_price),
        totalQtySold: sales.qtySold,
        totalSalesRevenue: sales.revenue,
        totalSalesCogs: sales.cogs,
        totalNetProfit: netProfit,
        profitMarginPct: marginPct,
        todayQtySold: sales.todayQty,
        todaySalesRevenue: sales.todayRevenue,
        todayPrincipalCogsToSeparate: sales.todayCogs,
        todayNetProfit: todayProfit,
      });
    }

    // Build Loan Account Summary Rows
    const filteredLoans = targetLoanFilter
      ? allLoans.filter((l) => l.id === targetLoanFilter)
      : allLoans;

    const loanAccounts: LoanAccountSummaryRow[] = filteredLoans.map((loan) => {
      const rowsForLoan = productRows.filter((r) => r.loanAccountId === loan.id);
      const totalPurchasedFromLoan = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.totalPurchaseCostFromLoan, 0)
      );
      const currentStockValuationAtCost = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.currentStockCostValuation, 0)
      );
      const currentStockValuationAtRetail = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.currentStockRetailValuation, 0)
      );
      const totalSalesRevenue = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.totalSalesRevenue, 0)
      );
      const totalPrincipalRecoveredViaSales = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.totalSalesCogs, 0)
      );
      const totalNetProfitGenerated = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.totalNetProfit, 0)
      );
      const todaySalesRevenue = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.todaySalesRevenue, 0)
      );
      const todayPrincipalToSetAside = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.todayPrincipalCogsToSeparate, 0)
      );
      const todayProfitEarned = roundCurrency(
        rowsForLoan.reduce((s, r) => s + r.todayNetProfit, 0)
      );

      return {
        loanAccount: loan,
        linkedProductsCount: rowsForLoan.length,
        totalPurchasedFromLoan,
        unallocatedLoanBalance: roundCurrency(
          Math.max(0, loan.principal_amount - totalPurchasedFromLoan)
        ),
        currentStockValuationAtCost,
        currentStockValuationAtRetail,
        totalSalesRevenue,
        totalPrincipalRecoveredViaSales,
        totalNetProfitGenerated,
        todaySalesRevenue,
        todayPrincipalToSetAside,
        todayProfitEarned,
        remainingLoanToRepay: roundCurrency(
          Math.max(0, loan.principal_amount - (loan.amount_repaid || 0))
        ),
      };
    });

    // Build Categorical Breakdown of Loan-Funded Products
    const catMap = new Map<
      string,
      {
        category: string;
        productsCount: number;
        purchasedCostFromLoan: number;
        currentStockCost: number;
        salesRevenue: number;
        cogsRecovered: number;
        netProfit: number;
        todayRevenueToSetAside: number;
        todayPrincipalToSetAside: number;
      }
    >();

    for (const r of productRows) {
      const existing = catMap.get(r.category) || {
        category: r.category,
        productsCount: 0,
        purchasedCostFromLoan: 0,
        currentStockCost: 0,
        salesRevenue: 0,
        cogsRecovered: 0,
        netProfit: 0,
        todayRevenueToSetAside: 0,
        todayPrincipalToSetAside: 0,
      };
      existing.productsCount += 1;
      existing.purchasedCostFromLoan = roundCurrency(
        existing.purchasedCostFromLoan + r.totalPurchaseCostFromLoan
      );
      existing.currentStockCost = roundCurrency(
        existing.currentStockCost + r.currentStockCostValuation
      );
      existing.salesRevenue = roundCurrency(existing.salesRevenue + r.totalSalesRevenue);
      existing.cogsRecovered = roundCurrency(existing.cogsRecovered + r.totalSalesCogs);
      existing.netProfit = roundCurrency(existing.netProfit + r.totalNetProfit);
      existing.todayRevenueToSetAside = roundCurrency(
        existing.todayRevenueToSetAside + r.todaySalesRevenue
      );
      existing.todayPrincipalToSetAside = roundCurrency(
        existing.todayPrincipalToSetAside + r.todayPrincipalCogsToSeparate
      );
      catMap.set(r.category, existing);
    }

    const categorySummary = Array.from(catMap.values()).sort(
      (a, b) => b.salesRevenue - a.salesRevenue
    );

    const totals = {
      totalLoanSanctioned: roundCurrency(
        filteredLoans.reduce((s, l) => s + l.principal_amount, 0)
      ),
      totalLoanAllocatedToStock: roundCurrency(
        productRows.reduce((s, r) => s + r.totalPurchaseCostFromLoan, 0)
      ),
      totalStockRemainingAtCost: roundCurrency(
        productRows.reduce((s, r) => s + r.currentStockCostValuation, 0)
      ),
      totalSalesRevenue: roundCurrency(productRows.reduce((s, r) => s + r.totalSalesRevenue, 0)),
      totalPrincipalRecoveredFromSales: roundCurrency(
        productRows.reduce((s, r) => s + r.totalSalesCogs, 0)
      ),
      totalNetProfit: roundCurrency(productRows.reduce((s, r) => s + r.totalNetProfit, 0)),
      todayTotalRevenueFromLoanStock: roundCurrency(
        productRows.reduce((s, r) => s + r.todaySalesRevenue, 0)
      ),
      todayTotalPrincipalToSeparate: roundCurrency(
        productRows.reduce((s, r) => s + r.todayPrincipalCogsToSeparate, 0)
      ),
      todayTotalProfitFromLoanStock: roundCurrency(
        productRows.reduce((s, r) => s + r.todayNetProfit, 0)
      ),
    };

    return {
      loanAccounts,
      productRows,
      categorySummary,
      totals,
    };
  }
}

