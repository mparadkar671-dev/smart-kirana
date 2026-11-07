import React, { useState } from 'react';
import { Product } from '../../types';
import { InterBusinessTransferService } from '../../services/interBusinessTransferService';
import { formatINR, roundCurrency, roundQty } from '../../utils/math';
import { X, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface InterBusinessTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  preSelectedProduct?: Product | null;
  onSuccess?: () => void;
}

export const InterBusinessTransferModal: React.FC<InterBusinessTransferModalProps> = ({
  isOpen,
  onClose,
  products,
  preSelectedProduct,
  onSuccess,
}) => {
  if (!isOpen) return null;

  const [selectedProductId, setSelectedProductId] = useState<string>(
    preSelectedProduct?.id || products[0]?.id || ''
  );
  const [transferQty, setTransferQty] = useState<string>('5');
  const [targetName, setTargetName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const unitCost = selectedProduct ? roundCurrency(selectedProduct.purchase_price) : 0;
  const numQty = parseFloat(transferQty) || 0;
  const totalCost = roundCurrency(numQty * unitCost);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedProduct) {
      setError('Please select a Kirana ingredient product');
      return;
    }
    if (numQty <= 0) {
      setError('Transfer quantity must be greater than zero');
      return;
    }

    try {
      setIsLoading(true);
      const res = await InterBusinessTransferService.transferKiranaToHomemade({
        kiranaProductId: selectedProduct.id,
        transferQty: numQty,
        targetProductName: targetName.trim() || undefined,
        notes: notes.trim() || undefined,
        transferredBy: 'Store Operator',
      });

      setSuccessMsg(
        `Successfully transferred ${res.transferredQty} ${selectedProduct.unit_type} of ${selectedProduct.name} to Gruh Udyog kitchen @ ₹${unitCost}/unit (Total: ${formatINR(res.transferCost)}).`
      );
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Transfer failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        data-testid="inter-business-transfer-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-50 to-amber-50 dark:from-slate-800 dark:to-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              🚚
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Kirana ➡️ Gruh Udyog Stock Transfer</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Transfers stock at raw wholesale cost (0% markup) for kitchen production
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleTransfer} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              data-testid="transfer-success-banner"
              className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Product Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Select Kirana Item (Source Stock)
            </label>
            <select
              data-testid="transfer-product-select"
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setTargetName('');
              }}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.marathi_name ? `(${p.marathi_name})` : ''} — Stock: {p.current_stock} {p.unit_type} | Buy: ₹{p.purchase_price}
                </option>
              ))}
            </select>
          </div>

          {/* Current Info Card */}
          {selectedProduct && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Available in Kirana:</span>
                <span className="ml-1.5 font-bold text-slate-900 dark:text-white">
                  {selectedProduct.current_stock} {selectedProduct.unit_type}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Wholesale Unit Cost:</span>
                <span className="ml-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                  {formatINR(unitCost)} / {selectedProduct.unit_type}
                </span>
              </div>
            </div>
          )}

          {/* Quantity to Transfer */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Transfer Quantity ({selectedProduct?.unit_type || 'Units'})
            </label>
            <input
              type="number"
              step="any"
              min="0.001"
              data-testid="transfer-qty-input"
              value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              placeholder="e.g. 5"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Target Name in Gruh Udyog */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Ingredient Label in Gruh Udyog Kitchen (Optional)
            </label>
            <input
              type="text"
              data-testid="transfer-target-name-input"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder={selectedProduct?.name || 'e.g. Gram Flour / Besan'}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Transfer Reason / Notes (Optional)
            </label>
            <input
              type="text"
              data-testid="transfer-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Diwali Laddu Batch #1 preparation"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Pricing Summary */}
          <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl flex items-center justify-between">
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Gruh Udyog Expense (Cost Price):</span>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                0% markup applied. Paid via INVENTORY_DEDUCTION
              </p>
            </div>
            <div className="text-right">
              <span
                data-testid="transfer-total-cost"
                className="text-base font-black text-amber-800 dark:text-amber-300"
              >
                {formatINR(totalCost)}
              </span>
            </div>
          </div>

          {/* Submit Button */}
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
              disabled={isLoading || numQty <= 0}
              data-testid="confirm-transfer-btn"
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition disabled:opacity-50"
            >
              <span>🚀 Transfer to Gruh Udyog Kitchen</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

