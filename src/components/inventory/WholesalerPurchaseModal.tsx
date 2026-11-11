import React, { useState } from 'react';
import { Product, Wholesaler } from '../../types';
import { WholesalerPurchaseService, PurchaseInwardItemInput } from '../../services/wholesalerPurchaseService';
import { formatINR, roundCurrency, roundQty } from '../../utils/math';
import { X, Plus, Trash2, CheckCircle2, AlertCircle, ShoppingBag } from 'lucide-react';

interface WholesalerPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  wholesalers: Wholesaler[];
  onSuccess?: () => void;
}

export const WholesalerPurchaseModal: React.FC<WholesalerPurchaseModalProps> = ({
  isOpen,
  onClose,
  products,
  wholesalers,
  onSuccess,
}) => {
  const [selectedWholesalerId, setSelectedWholesalerId] = useState<string>(wholesalers[0]?.id || '');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK_UPI' | 'CREDIT_UDHARI' | 'SPLIT'>('CREDIT_UDHARI');
  const [amountPaid, setAmountPaid] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');

  interface RowItem {
    id: string;
    productId: string;
    qty: string;
    purchasePrice: string;
    sellingPrice: string;
    mrp: string;
  }

  const [rows, setRows] = useState<RowItem[]>([
    {
      id: 'row-1',
      productId: products[0]?.id || '',
      qty: '10',
      purchasePrice: products[0] ? String(products[0].purchase_price) : '0',
      sellingPrice: products[0] ? String(products[0].selling_price) : '0',
      mrp: products[0] ? String(products[0].mrp) : '0',
    },
  ]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddRow = () => {
    const firstProd = products[0];
    setRows([
      ...rows,
      {
        id: `row-${Date.now()}`,
        productId: firstProd?.id || '',
        qty: '10',
        purchasePrice: firstProd ? String(firstProd.purchase_price) : '0',
        sellingPrice: firstProd ? String(firstProd.selling_price) : '0',
        mrp: firstProd ? String(firstProd.mrp) : '0',
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, field: keyof RowItem, val: string) => {
    const updated = [...rows];
    updated[index][field] = val;

    if (field === 'productId') {
      const prod = products.find((p) => p.id === val);
      if (prod) {
        updated[index].purchasePrice = String(prod.purchase_price);
        updated[index].sellingPrice = String(prod.selling_price);
        updated[index].mrp = String(prod.mrp);
      }
    }
    setRows(updated);
  };

  // Grand Total calculation
  const grandTotal = rows.reduce((acc, row) => {
    const q = parseFloat(row.qty) || 0;
    const p = parseFloat(row.purchasePrice) || 0;
    return roundCurrency(acc + q * p);
  }, 0);

  const numPaid = parseFloat(amountPaid) || 0;
  const balanceDue = roundCurrency(Math.max(0, grandTotal - numPaid));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedWholesalerId) {
      setError('Please select a wholesaler');
      return;
    }

    const items: PurchaseInwardItemInput[] = [];
    for (const r of rows) {
      const q = parseFloat(r.qty);
      const p = parseFloat(r.purchasePrice);
      if (!r.productId || isNaN(q) || q <= 0 || isNaN(p) || p < 0) {
        setError('Please enter valid quantities and purchase prices for all items');
        return;
      }
      items.push({
        productId: r.productId,
        qty: q,
        purchasePrice: p,
        sellingPrice: parseFloat(r.sellingPrice) || undefined,
        mrp: parseFloat(r.mrp) || undefined,
      });
    }

    try {
      setIsLoading(true);
      const res = await WholesalerPurchaseService.processPurchaseInward({
        wholesalerId: selectedWholesalerId,
        invoiceNumber: invoiceNumber.trim() || undefined,
        items,
        paymentMode,
        amountPaid: numPaid,
        notes: notes.trim() || undefined,
      });

      setSuccessMsg(
        `Purchase Invoice ${res.invoice.invoice_number} saved! Stock updated with weighted-average cost for ${res.updatedProducts.length} items.`
      );
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to save purchase invoice');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        data-testid="wholesaler-purchase-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              📥
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Wholesaler Purchase Inward (GRN) &amp; Weighted Costing</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inwards stock, updates weighted-average purchase price, logs Khata dues, and manages Galla cash
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              data-testid="purchase-success-banner"
              className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Top Row: Wholesaler & Bill No */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Wholesaler / Distributor *
              </label>
              <select
                data-testid="purchase-wholesaler-select"
                value={selectedWholesalerId}
                onChange={(e) => setSelectedWholesalerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                required
              >
                {wholesalers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.agency_or_brand ? `(${w.agency_or_brand})` : ''} - {w.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Wholesaler Bill / Invoice No. (Optional)
              </label>
              <input
                type="text"
                data-testid="purchase-invoice-number-input"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. BILL-4928"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Payment Mode
              </label>
              <select
                data-testid="purchase-payment-mode-select"
                value={paymentMode}
                onChange={(e) => {
                  const mode = e.target.value as any;
                  setPaymentMode(mode);
                  if (mode === 'CASH' || mode === 'BANK_UPI') {
                    setAmountPaid(String(grandTotal));
                  } else if (mode === 'CREDIT_UDHARI') {
                    setAmountPaid('0');
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              >
                <option value="CREDIT_UDHARI">CREDIT (Wholesaler Khata)</option>
                <option value="CASH">CASH (Deduct from Galla)</option>
                <option value="BANK_UPI">BANK / UPI</option>
                <option value="SPLIT">SPLIT (Partial Cash + Credit)</option>
              </select>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Inward Items ({rows.length})
              </span>
              <button
                type="button"
                onClick={handleAddRow}
                data-testid="purchase-add-row-btn"
                className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg text-xs font-bold flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="p-2 font-bold">Product</th>
                    <th className="p-2 font-bold w-20">Inward Qty</th>
                    <th className="p-2 font-bold w-24">Buy Price (₹)</th>
                    <th className="p-2 font-bold w-28">New Avg Cost (₹)</th>
                    <th className="p-2 font-bold w-24">Sell Price (₹)</th>
                    <th className="p-2 font-bold w-24 text-right">Line Total</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-750">
                  {rows.map((row, idx) => {
                    const prod = products.find((p) => p.id === row.productId);
                    const q = parseFloat(row.qty) || 0;
                    const p = parseFloat(row.purchasePrice) || 0;
                    const line = roundCurrency(q * p);

                    const newAvg = prod
                      ? WholesalerPurchaseService.computeWeightedAverageCost(
                          prod.current_stock,
                          prod.purchase_price,
                          q,
                          p
                        )
                      : p;

                    return (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-2">
                          <select
                            value={row.productId}
                            onChange={(e) => handleRowChange(idx, 'productId', e.target.value)}
                            className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (Stock: {p.current_stock} | Old Buy: ₹{p.purchase_price})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            data-testid={`purchase-row-qty-${idx}`}
                            value={row.qty}
                            onChange={(e) => handleRowChange(idx, 'qty', e.target.value)}
                            className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            data-testid={`purchase-row-price-${idx}`}
                            value={row.purchasePrice}
                            onChange={(e) => handleRowChange(idx, 'purchasePrice', e.target.value)}
                            className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold"
                          />
                        </td>
                        <td className="p-2">
                          <span
                            data-testid={`purchase-row-new-avg-${idx}`}
                            className="font-bold text-blue-600 dark:text-blue-400"
                          >
                            ₹{newAvg.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.sellingPrice}
                            onChange={(e) => handleRowChange(idx, 'sellingPrice', e.target.value)}
                            className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                          />
                        </td>
                        <td className="p-2 text-right font-bold text-slate-800 dark:text-slate-200">
                          {formatINR(line)}
                        </td>
                        <td className="p-2 text-center">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Amount Paid & Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Total Invoice Value:</span>
              <span data-testid="purchase-grand-total" className="text-lg font-black text-slate-900 dark:text-white">
                {formatINR(grandTotal)}
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                Amount Paid Now (₹)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                max={grandTotal}
                data-testid="purchase-amount-paid-input"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold"
              />
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Balance Due to Wholesaler:</span>
              <span
                data-testid="purchase-balance-due"
                className={`text-lg font-black ${
                  balanceDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatINR(balanceDue)}
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
              disabled={isLoading || grandTotal <= 0}
              data-testid="confirm-purchase-inward-btn"
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition disabled:opacity-50"
            >
              <span>📥 Inward Stock &amp; Update Weighted Costs</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

