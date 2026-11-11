import React, { useState } from 'react';
import { SalesInvoice, SaleItem, Customer } from '../../types';
import { SalesReturnService, ReturnItemInput } from '../../services/salesReturnService';
import { formatINR, roundCurrency } from '../../utils/math';
import { X, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';

interface PartialReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice;
  items: SaleItem[];
  customer?: Customer | null;
  onSuccess?: () => void;
}

export const PartialReturnModal: React.FC<PartialReturnModalProps> = ({
  isOpen,
  onClose,
  invoice,
  items,
  customer,
  onSuccess,
}) => {
  // Track return quantity per sale item
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const it of items) {
      init[it.id] = '0';
    }
    return init;
  });

  const [refundMode, setRefundMode] = useState<'CASH' | 'UDHARI_CREDIT' | 'UPI' | 'STORE_CREDIT'>('CASH');
  const [reason, setReason] = useState<string>('CUSTOMER_RETURN');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQtyChange = (itemId: string, maxQty: number, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > maxQty) {
      setReturnQtys((prev) => ({ ...prev, [itemId]: String(maxQty) }));
      return;
    }
    setReturnQtys((prev) => ({ ...prev, [itemId]: val }));
  };

  // Compute total refund amount
  const refundTotal = items.reduce((acc, it) => {
    const q = parseFloat(returnQtys[it.id]) || 0;
    return roundCurrency(acc + q * it.unit_selling_price);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const itemsToReturn: ReturnItemInput[] = [];
    for (const it of items) {
      const q = parseFloat(returnQtys[it.id]) || 0;
      if (q > 0) {
        itemsToReturn.push({
          saleItemId: it.id,
          returnQty: q,
        });
      }
    }

    if (itemsToReturn.length === 0) {
      setError('Please specify a return quantity greater than 0 for at least one item');
      return;
    }

    try {
      setIsLoading(true);
      const res = await SalesReturnService.executePartialReturn({
        invoiceId: invoice.id,
        itemsToReturn,
        refundMode,
        reason,
        notes: notes.trim() || undefined,
        cashierName: 'Counter Cashier',
      });

      setSuccessMsg(
        `Credit Note ${res.creditNote.credit_note_number} issued! Refunded ${formatINR(res.refundTotal)} via ${res.creditNote.refund_mode}.`
      );
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to process return');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        data-testid="partial-return-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Partial Sales Return &amp; Credit Note</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Invoice #{invoice.invoice_number} | Billed Total: {formatINR(invoice.grand_total)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              data-testid="return-success-banner"
              className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Itemized Selection Table */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              Select Line Items &amp; Return Quantities
            </label>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="p-2 font-bold">Item</th>
                    <th className="p-2 font-bold w-20 text-center">Billed</th>
                    <th className="p-2 font-bold w-20 text-right">Rate</th>
                    <th className="p-2 font-bold w-24 text-center">Return Qty</th>
                    <th className="p-2 font-bold w-24 text-right">Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-750">
                  {items.map((it) => {
                    const q = parseFloat(returnQtys[it.id]) || 0;
                    const lineRefund = roundCurrency(q * it.unit_selling_price);

                    return (
                      <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-2 font-medium text-slate-900 dark:text-white">
                          {it.product_name_snapshot}
                        </td>
                        <td className="p-2 text-center text-slate-600 dark:text-slate-300">
                          {it.qty}
                        </td>
                        <td className="p-2 text-right text-slate-600 dark:text-slate-300">
                          ₹{it.unit_selling_price}
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={it.qty}
                            data-testid={`return-qty-input-${it.id}`}
                            value={returnQtys[it.id]}
                            onChange={(e) => handleQtyChange(it.id, it.qty, e.target.value)}
                            className="w-full p-1 text-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="p-2 text-right font-bold text-slate-900 dark:text-white">
                          {formatINR(lineRefund)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Refund Mode & Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Refund Method
              </label>
              <select
                data-testid="refund-mode-select"
                value={refundMode}
                onChange={(e) => setRefundMode(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              >
                <option value="CASH">CASH (Deduct from Daily Galla)</option>
                {invoice.customer_id !== '0000-WALK-IN' && (
                  <option value="UDHARI_CREDIT">UDHARI CREDIT (Deduct from Customer Khata)</option>
                )}
                <option value="UPI">UPI / BANK TRANSFER</option>
                <option value="STORE_CREDIT">STORE CREDIT NOTE</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Reason for Return
              </label>
              <select
                data-testid="return-reason-select"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              >
                <option value="CUSTOMER_RETURN">Customer Changed Mind / Returned</option>
                <option value="DEFECTIVE_DAMAGED">Damaged / Defective Quality</option>
                <option value="RATE_ADJUSTMENT">Rate Adjustment / Price Difference</option>
                <option value="BILLING_MISTAKE">Operator Billing Mistake</option>
              </select>
            </div>
          </div>

          {/* Refund Summary Banner */}
          <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                Total Refund to Customer:
              </span>
              <p className="text-[11px] text-rose-700 dark:text-rose-300">
                Generates immutable Credit Note &amp; restores product stock
              </p>
            </div>
            <div className="text-right">
              <span
                data-testid="partial-return-refund-total"
                className="text-lg font-black text-rose-700 dark:text-rose-400"
              >
                {formatINR(refundTotal)}
              </span>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || refundTotal <= 0}
              data-testid="confirm-partial-return-btn"
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition disabled:opacity-50"
            >
              <span>Issue Credit Note &amp; Refund</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
