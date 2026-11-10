import React, { useState } from 'react';
import { Product, LoanAccount } from '../../types';
import { InventoryService } from '../../services/inventoryService';
import { LoanAccountService } from '../../services/loanAccountService';
import { X, PlusCircle, MinusCircle, Home, AlertOctagon, HelpCircle, Check, Landmark, Plus } from 'lucide-react';
import { roundCurrency, roundQty, formatINR } from '../../utils/math';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  mode: 'STOCK_IN' | 'STOCK_OUT';
  onAdjusted: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  product,
  mode,
  onAdjusted,
}) => {
  const [qty, setQty] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(product?.purchase_price || 0);
  const [supplierName, setSupplierName] = useState<string>(product?.last_supplier_name || '');
  const [stockInReason, setStockInReason] = useState<'PURCHASE_IN' | 'BATCH_MADE_IN'>('PURCHASE_IN');
  const [stockOutReason, setStockOutReason] = useState<'SELF_USE_OUT' | 'DAMAGE_EXPIRED_OUT' | 'AUDIT_ADJUST'>('SELF_USE_OUT');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Loan Funding State (for STOCK_IN)
  const [loanAccounts, setLoanAccounts] = useState<LoanAccount[]>([]);
  const [isFromLoan, setIsFromLoan] = useState<boolean>(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string>('');
  const [showInlineLoan, setShowInlineLoan] = useState<boolean>(false);
  const [newLoanName, setNewLoanName] = useState<string>('');
  const [newLoanLender, setNewLoanLender] = useState<string>('');
  const [newLoanPrincipal, setNewLoanPrincipal] = useState<number>(0);
  const [isSavingLoan, setIsSavingLoan] = useState<boolean>(false);

  const loadLoanAccounts = async () => {
    try {
      const list = await LoanAccountService.getAll();
      setLoanAccounts(list);
    } catch {
      setLoanAccounts([]);
    }
  };

  // Sync state when product changes
  React.useEffect(() => {
    if (product) {
      loadLoanAccounts();
      setUnitCost(product.purchase_price);
      setSupplierName(product.last_supplier_name || '');
      setQty(product.unit_type === 'KG_LOOSE' || product.unit_type === 'LTR' ? 1.0 : 1);
      setStockInReason(
        product.id.startsWith('hmf-')
          ? 'BATCH_MADE_IN'
          : 'PURCHASE_IN'
      );
      setIsFromLoan(Boolean(product.loan_account_id));
      setSelectedLoanId(product.loan_account_id || '');
      setShowInlineLoan(false);
      setNotes('');
      setErrorMsg(null);
    }
  }, [product?.id, mode, isOpen]);

  const handleSaveInlineLoan = async () => {
    if (!newLoanName.trim()) {
      setErrorMsg('Loan Account Name is required (e.g., Mudra Loan ₹50,000)');
      return;
    }
    if (!newLoanPrincipal || newLoanPrincipal <= 0) {
      setErrorMsg('Please enter a valid sanctioned Loan Amount (> ₹0)');
      return;
    }
    setIsSavingLoan(true);
    setErrorMsg(null);
    try {
      const created = await LoanAccountService.create({
        name: newLoanName.trim(),
        lender_name: newLoanLender.trim() || 'Bank / Lender',
        principal_amount: newLoanPrincipal,
      });
      const updated = await LoanAccountService.getAll();
      setLoanAccounts(updated);
      setIsFromLoan(true);
      setSelectedLoanId(created.id);
      setNewLoanName('');
      setNewLoanLender('');
      setNewLoanPrincipal(0);
      setShowInlineLoan(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create loan account');
    } finally {
      setIsSavingLoan(false);
    }
  };

  if (!isOpen || !product) return null;

  const isLoose = product.unit_type === 'KG_LOOSE' || product.unit_type === 'LTR';

  const handleQuickQty = (amount: number) => {
    setQty((prev) => roundQty(Math.max(isLoose ? 0.25 : 1, prev + amount)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0) {
      setErrorMsg('Quantity must be greater than zero');
      return;
    }

    if (mode === 'STOCK_OUT' && qty > product.current_stock) {
      const confirmNegative = window.confirm(
        `Quantity (${qty}) is greater than current stock (${product.current_stock}). Do you still want to proceed?`
      );
      if (!confirmNegative) return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      if (mode === 'STOCK_IN') {
        if (isFromLoan && !selectedLoanId) {
          setErrorMsg('Please select which Loan Account this stock is purchased from, or add a new Loan Account.');
          setIsSubmitting(false);
          return;
        }
        await InventoryService.restock({
          productId: product.id,
          qty,
          unitCost,
          supplierName,
          loanAccountId: isFromLoan ? selectedLoanId : null,
          reasonType: stockInReason,
          notes,
        });
      } else {
        await InventoryService.stockOut({
          productId: product.id,
          qty,
          reasonType: stockOutReason,
          notes,
        });
      }
      onAdjusted();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Stock adjustment failed';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedHomeValuation = roundCurrency(qty * product.purchase_price);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 transition-colors">
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 ${
            mode === 'STOCK_IN'
              ? 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {mode === 'STOCK_IN' ? (
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <PlusCircle className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                <MinusCircle className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {mode === 'STOCK_IN' ? 'Quick Restock (Stock In ++)' : 'Stock Out (-- Self-Use / Damage)'}
              </h2>
              <p className="text-xs opacity-80">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Current Stock Banner */}
        <div className="px-6 pt-4 flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/60 py-2.5 border-b border-slate-100 dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Current Shelf Stock:</span>
          <span className="font-bold text-slate-900 dark:text-white text-sm">
            {product.current_stock} {product.unit_type}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Reason selector if Stock In */}
          {mode === 'STOCK_IN' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Stock Addition Type
              </label>
              <div
                data-testid="stock-in-reason-purchase"
                className="p-2.5 rounded-xl border border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20 font-bold flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold">📦 Supplier Purchase In</div>
                  <div className="text-[10px] text-slate-500">Wholesaler / Distributor Inward</div>
                </div>
                <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">
                  Restock
                </span>
              </div>
            </div>
          )}

          {/* Reason selector if Stock Out */}
          {mode === 'STOCK_OUT' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Stock Out Reason
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStockOutReason('SELF_USE_OUT')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition ${
                    stockOutReason === 'SELF_USE_OUT'
                      ? 'border-blue-600 bg-blue-50/80 text-blue-900 ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Home className="w-4 h-4 mb-1 text-blue-700" />
                  <span className="text-xs font-bold leading-tight">Home Use (Self)</span>
                  <span className="text-[10px] text-slate-500">Drawings</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStockOutReason('DAMAGE_EXPIRED_OUT')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition ${
                    stockOutReason === 'DAMAGE_EXPIRED_OUT'
                      ? 'border-red-600 bg-red-50/80 text-red-900 ring-2 ring-red-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <AlertOctagon className="w-4 h-4 mb-1 text-red-600" />
                  <span className="text-xs font-bold leading-tight">Damage / Expired</span>
                  <span className="text-[10px] text-slate-500">Loss</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStockOutReason('AUDIT_ADJUST')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition ${
                    stockOutReason === 'AUDIT_ADJUST'
                      ? 'border-slate-600 bg-slate-100 text-slate-900 ring-2 ring-slate-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <HelpCircle className="w-4 h-4 mb-1 text-slate-600" />
                  <span className="text-xs font-bold leading-tight">Audit / Count</span>
                  <span className="text-[10px] text-slate-500">Adjustment</span>
                </button>
              </div>

              {stockOutReason === 'SELF_USE_OUT' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Home className="w-3.5 h-3.5 text-blue-700" />
                    <span>Home Consumption Accounting Isolation (REQ-05 / REQ-20)</span>
                  </div>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Deducts stock at wholesale cost (<strong className="font-semibold">₹{product.purchase_price.toFixed(2)}</strong> each = <strong className="font-semibold">₹{calculatedHomeValuation.toFixed(2)}</strong> total).
                    Logs to <code className="font-mono text-[10px] bg-blue-100 px-1 py-0.5 rounded">HOME_SELF_USE_GOODS</code> without distorting shop sales revenue or COGS.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quantity Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Quantity ({product.unit_type === 'KG_LOOSE' ? 'Kg' : product.unit_type === 'LTR' ? 'Ltr' : 'Units'}) *
              </label>
              {/* Quick Stepper Presets */}
              <div className="flex items-center gap-1">
                {(isLoose ? [0.5, 1, 2, 5] : [1, 5, 10, 25]).map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => handleQuickQty(step)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium"
                  >
                    +{step}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              step={isLoose ? '0.001' : '1'}
              min={isLoose ? '0.001' : '1'}
              required
              value={qty || ''}
              onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
              className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-base font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Wholesale Rate (Stock In only) */}
          {mode === 'STOCK_IN' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Wholesale Cost / Unit (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitCost || ''}
                  onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Supplier Name
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. Mandi Wholesaler"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Loan Funding Selector (Stock In only) */}
          {mode === 'STOCK_IN' && (
            <div className="p-3.5 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wide">
                  <Landmark className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Purchased from Loan Amount?</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="restock-loan-mode-own"
                    onClick={() => {
                      setIsFromLoan(false);
                      setSelectedLoanId('');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      !isFromLoan
                        ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    No (Own Cash)
                  </button>
                  <button
                    type="button"
                    data-testid="restock-loan-mode-loan"
                    onClick={() => setIsFromLoan(true)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      isFromLoan
                        ? 'bg-purple-700 text-white'
                        : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                    }`}
                  >
                    🏦 Yes (From Loan Amount)
                  </button>
                </div>
              </div>

              {isFromLoan && (
                <div className="space-y-2 pt-1 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <select
                      data-testid="restock-loan-account-select"
                      value={selectedLoanId}
                      onChange={(e) => setSelectedLoanId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-xs font-semibold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      <option value="">-- Select Which Loan Amount --</option>
                      {loanAccounts.map((loan) => (
                        <option key={loan.id} value={loan.id}>
                          {loan.name} — {loan.lender_name} ({formatINR(loan.principal_amount)})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      data-testid="restock-toggle-inline-loan-btn"
                      onClick={() => setShowInlineLoan(!showInlineLoan)}
                      className="px-2.5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showInlineLoan ? 'Cancel' : '+ New Loan'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-purple-900 dark:text-purple-200 bg-purple-100/70 dark:bg-purple-900/40 px-2.5 py-1.5 rounded-lg">
                    <span>Batch Loan Purchase Value:</span>
                    <span className="font-extrabold">
                      {formatINR(roundCurrency(qty * unitCost))}
                    </span>
                  </div>

                  {showInlineLoan && (
                    <div
                      data-testid="restock-inline-loan-form"
                      className="p-2.5 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-xl space-y-2"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          data-testid="restock-inline-loan-name"
                          value={newLoanName}
                          onChange={(e) => setNewLoanName(e.target.value)}
                          placeholder="Loan Title (e.g. Mudra ₹50k) *"
                          className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          data-testid="restock-inline-loan-lender"
                          value={newLoanLender}
                          onChange={(e) => setNewLoanLender(e.target.value)}
                          placeholder="Bank / Lender Name"
                          className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                        />
                        <input
                          type="number"
                          min="1"
                          data-testid="restock-inline-loan-principal"
                          value={newLoanPrincipal || ''}
                          onChange={(e) => setNewLoanPrincipal(parseFloat(e.target.value) || 0)}
                          placeholder="Total Loan (₹) *"
                          className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          data-testid="restock-save-inline-loan-btn"
                          disabled={isSavingLoan}
                          onClick={handleSaveInlineLoan}
                          className="px-3 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Loan</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
              Remarks / Invoice Reference
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Purchased from local market, Mandi bill #104"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-white rounded-xl text-sm font-semibold shadow-md transition flex items-center gap-2 ${
                mode === 'STOCK_IN'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>
                {mode === 'STOCK_IN'
                  ? `Confirm Stock In (+${qty})`
                  : `Confirm Stock Out (-${qty})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

