import React, { useState, useEffect } from 'react';
import { DailyGallaSession, ExpenseAndDrawing, ExpenseCategory, ExpensePaidVia } from '../../types';
import { db } from '../../db/db';
import { GallaService } from '../../services/gallaService';
import { formatINR, roundCurrency } from '../../utils/math';
import {
  Wallet,
  PlusCircle,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  ArrowDownCircle,
  Clock,
  Home,
  Plus,
} from 'lucide-react';

export const GallaView: React.FC = () => {
  const [session, setSession] = useState<DailyGallaSession | null>(null);
  const [expenses, setExpenses] = useState<ExpenseAndDrawing[]>([]);

  // Input states
  const [openingCashInput, setOpeningCashInput] = useState<string>('');
  const [countedCashInput, setCountedCashInput] = useState<string>('');

  // Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('SHOP_EXPENSE_TRANSPORT_BAGS');
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expPaidVia, setExpPaidVia] = useState<ExpensePaidVia>('CASH_GALLA');
  const [expDesc, setExpDesc] = useState('');

  useEffect(() => {
    loadGallaData();
  }, []);

  const loadGallaData = async () => {
    const todaySession = await GallaService.getOrCreateTodaySession();
    setSession(todaySession);
    setOpeningCashInput(todaySession.opening_cash.toString());
    if (todaySession.actual_counted_cash !== null && todaySession.actual_counted_cash !== undefined) {
      setCountedCashInput(todaySession.actual_counted_cash.toString());
    }

    const todayDate = new Date().toISOString().split('T')[0];
    const expList = await db.expenses_and_drawings
      .filter((e) => e.created_at.startsWith(todayDate))
      .reverse()
      .sortBy('created_at');
    setExpenses(expList);
  };

  const handleUpdateOpeningCash = async () => {
    if (!session) return;
    const val = parseFloat(openingCashInput) || 0;
    const updated = await GallaService.setOpeningCash(session.session_date, val);
    setSession(updated);
  };

  const handleReconcileEvening = async () => {
    if (!session) return;
    const val = parseFloat(countedCashInput);
    if (isNaN(val)) return;

    const updated = await GallaService.recordEveningCashCount(session.session_date, val);
    setSession(updated);
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expAmount <= 0 || !expDesc.trim()) return;

    await GallaService.recordExpense({
      category: expCategory,
      amount: expAmount,
      paidVia: expPaidVia,
      description: expDesc,
    });

    setIsExpenseModalOpen(false);
    setExpAmount(0);
    setExpDesc('');
    await loadGallaData();
  };

  if (!session) {
    return <div className="p-6 text-slate-500">Loading Cash Drawer (Galla)...</div>;
  }

  const discrepancy = session.discrepancy;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-700" />
            Daily Galla (Physical Cash Drawer) & Expenses
          </h1>
          <p className="text-xs text-slate-500">
            Reconcile morning cash, cash sales, Udhari Jama, and evening physical count
          </p>
        </div>

        <button
          type="button"
          data-testid="open-expense-modal-btn"
          onClick={() => setIsExpenseModalOpen(true)}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Record Shop Expense / Drawing</span>
        </button>
      </div>

      {/* Cash Drawer Flow Cards (REQ-13 & REQ-22) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5" data-testid="galla-flow-grid">
        {/* 1. Opening Cash */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">1. Opening Cash</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-800" data-testid="galla-opening-cash">
            {formatINR(session.opening_cash)}
          </div>
          <div className="flex gap-1 pt-1">
            <input
              type="number"
              step="10"
              data-testid="opening-cash-input"
              value={openingCashInput}
              onChange={(e) => setOpeningCashInput(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
              placeholder="Opening ₹"
            />
            <button
              type="button"
              data-testid="save-opening-cash-btn"
              onClick={handleUpdateOpeningCash}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold rounded-lg"
            >
              Set
            </button>
          </div>
        </div>

        {/* 2. Cash Sales Today */}
        <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase">+ 2. Cash Sales</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-[#16a34a]" data-testid="galla-cash-sales">
            {formatINR(session.cash_sales_total)}
          </div>
          <p className="text-[10px] text-emerald-700">From counter POS cash bills</p>
        </div>

        {/* 3. Cash Udhari Recovered */}
        <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase">+ 3. Cash Jama</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-[#16a34a]" data-testid="galla-cash-recovered">
            {formatINR(session.cash_udhari_recovered)}
          </div>
          <p className="text-[10px] text-emerald-700">Khata customer cash settlements</p>
        </div>

        {/* 4. Cash Expenses Out */}
        <div className="bg-red-50/70 p-4 rounded-2xl border border-red-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-red-800 uppercase">- 4. Cash Expenses</span>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-xl font-extrabold text-[#dc2626]" data-testid="galla-cash-expenses">
            {formatINR(session.cash_expenses_out)}
          </div>
          <p className="text-[10px] text-red-700">Paid directly from drawer cash</p>
        </div>
      </div>

      {/* Reconciliation Card (Expected vs Counted vs Discrepancy) */}
      <div className="bg-white rounded-2xl border-2 border-blue-900/10 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Evening Drawer Reconciliation (Surplus / Shortage Audit)
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              Expected = Opening ({session.opening_cash}) + Cash Sales ({session.cash_sales_total}) + Jama ({session.cash_udhari_recovered}) - Expenses ({session.cash_expenses_out})
            </p>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-right">
            <span className="text-[11px] font-bold text-blue-800 uppercase">Expected in Drawer</span>
            <div className="text-2xl font-extrabold text-blue-950" data-testid="expected-closing-cash">
              {formatINR(session.expected_closing_cash)}
            </div>
          </div>
        </div>

        {/* Counted Cash Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Actual Physical Cash Counted in Drawer (Evening)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  data-testid="counted-cash-input"
                  value={countedCashInput}
                  onChange={(e) => setCountedCashInput(e.target.value)}
                  placeholder="Enter counted physical cash..."
                  className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                data-testid="reconcile-btn"
                onClick={handleReconcileEvening}
                className="px-4 py-2.5 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Reconcile
              </button>
            </div>
          </div>

          {/* Result Badge */}
          {discrepancy !== null && discrepancy !== undefined && (
            <div
              data-testid="galla-discrepancy-card"
              className={`p-4 rounded-xl border flex items-center justify-between ${
                discrepancy === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : discrepancy > 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block">
                  {discrepancy === 0
                    ? 'Perfect Balance (0 Discrepancy)'
                    : discrepancy > 0
                    ? 'Cash Drawer Surplus (Extra Cash)'
                    : 'Cash Drawer Shortage (Missing Cash)'}
                </span>
                <p className="text-[11px] opacity-80">
                  Counted: {formatINR(session.actual_counted_cash || 0)} vs Expected: {formatINR(session.expected_closing_cash)}
                </p>
              </div>
              <div
                data-testid="discrepancy-amount"
                className={`text-xl font-extrabold ${
                  discrepancy >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                }`}
              >
                {discrepancy > 0 ? `+${formatINR(discrepancy)}` : formatINR(discrepancy)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Today's Recorded Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-600" />
            Today&apos;s Expenses &amp; Drawings Log ({expenses.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="expenses-table">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Description</th>
                <th className="p-3">Category</th>
                <th className="p-3">Paid Via</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    No expenses recorded today yet.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-mono text-slate-500">
                      {new Date(e.created_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 font-medium text-slate-800">{e.description}</td>
                    <td className="p-3 text-slate-600 font-mono text-[10px]">
                      {e.category.replace(/_/g, ' ')}
                    </td>
                    <td className="p-3 text-slate-600">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          e.paid_via === 'CASH_GALLA'
                            ? 'bg-amber-100 text-amber-800'
                            : e.paid_via === 'UPI_BANK'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {e.paid_via.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold text-red-600">
                      -{formatINR(e.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-red-50/80">
              <h2 className="text-base font-bold text-slate-900">Record Shop Expense / Drawing</h2>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Category *
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                >
                  <option value="SHOP_EXPENSE_TRANSPORT_BAGS">Transport, Polybags & Supplies (Shop Expense)</option>
                  <option value="SHOP_EXPENSE_RENT_ELEC">Electricity, Rent & Tea (Shop Expense)</option>
                  <option value="OWNER_CASH_DRAWING">Owner Cash Drawing (Personal Household Use)</option>
                  <option value="HOME_SELF_USE_GOODS">Home Grocery Consumption</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  data-testid="expense-amount-input"
                  value={expAmount || ''}
                  onChange={(e) => setExpAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Paid Via *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExpPaidVia('CASH_GALLA')}
                    className={`py-2 px-1 rounded-xl border text-xs font-bold transition ${
                      expPaidVia === 'CASH_GALLA'
                        ? 'border-amber-600 bg-amber-50 text-amber-900'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    Cash Drawer (Galla)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpPaidVia('UPI_BANK')}
                    className={`py-2 px-1 rounded-xl border text-xs font-bold transition ${
                      expPaidVia === 'UPI_BANK'
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    Online UPI / Bank
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Description / Remarks *
                </label>
                <input
                  type="text"
                  required
                  data-testid="expense-desc-input"
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="e.g. Polybags bundle purchased, Tea & snacks for counter"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-expense-btn"
                  className="px-5 py-2 bg-red-600 text-white font-bold rounded-xl text-xs"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
