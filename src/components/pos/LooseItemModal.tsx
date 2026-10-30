import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { calculateReverseWeight, formatINR, roundQty, toPaise, toRupees } from '../../utils/math';
import { X, Scale, IndianRupee, Check } from 'lucide-react';

interface LooseItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onConfirm: (product: Product, qty: number, lineTotal: number) => void;
}

export const LooseItemModal: React.FC<LooseItemModalProps> = ({
  isOpen,
  onClose,
  product,
  onConfirm,
}) => {
  const [mode, setMode] = useState<'WEIGHT' | 'AMOUNT'>('WEIGHT');
  const [weightKg, setWeightKg] = useState<number>(1.0);
  const [rupeeAmount, setRupeeAmount] = useState<number>(0);

  useEffect(() => {
    if (product) {
      setMode('WEIGHT');
      setWeightKg(1.0);
      setRupeeAmount(product.selling_price);
    }
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  const ratePerKg = product.selling_price;

  // Handle pill clicks (100g, 250g, 500g, 1kg, 2kg)
  const handlePillClick = (kgVal: number) => {
    setMode('WEIGHT');
    setWeightKg(kgVal);
    const cost = toRupees(Math.round(kgVal * toPaise(ratePerKg)));
    setRupeeAmount(cost);
  };

  // Handle manual weight change
  const handleWeightChange = (val: number) => {
    setMode('WEIGHT');
    setWeightKg(val);
    const cost = toRupees(Math.round(val * toPaise(ratePerKg)));
    setRupeeAmount(cost);
  };

  // Handle manual rupee amount change (Reverse Price-to-Weight Calculator REQ-08)
  const handleRupeeChange = (val: number) => {
    setMode('AMOUNT');
    setRupeeAmount(val);
    const calculatedW = calculateReverseWeight(val, ratePerKg);
    setWeightKg(calculatedW);
  };

  const handleConfirm = () => {
    if (weightKg <= 0) return;
    const finalQty = roundQty(weightKg);
    // If entered by amount, exact line total is the entered rupees
    const finalLineTotal = mode === 'AMOUNT' && rupeeAmount > 0
      ? rupeeAmount
      : toRupees(Math.round(finalQty * toPaise(ratePerKg)));

    onConfirm(product, finalQty, finalLineTotal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-orange-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{product.name}</h2>
              <p className="text-xs text-orange-900 font-medium">
                Rate: {formatINR(ratePerKg)} per {product.unit_type === 'LTR' ? 'Litre' : 'Kg'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Quick Preset Pills (REQ-08: 100g, 250g, 500g, 1kg, 2kg) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Quick Weight Presets
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { label: '100g', kg: 0.1 },
                { label: '250g', kg: 0.25 },
                { label: '500g', kg: 0.5 },
                { label: '1 Kg', kg: 1.0 },
                { label: '2 Kg', kg: 2.0 },
              ].map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  data-testid={`pill-${pill.label.replace(/\s+/g, '')}`}
                  onClick={() => handlePillClick(pill.kg)}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center ${
                    mode === 'WEIGHT' && Math.abs(weightKg - pill.kg) < 0.001
                      ? 'bg-orange-600 text-white shadow-sm ring-2 ring-orange-400/30'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  <span>{pill.label}</span>
                  <span className="text-[10px] opacity-75 font-normal">
                    {formatINR(toRupees(Math.round(pill.kg * toPaise(ratePerKg))))}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Reverse Price-To-Weight Input Box (REQ-08) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                <span>Sell by ₹ Amount (Reverse Weight Calculator)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  data-testid="loose-amount-input"
                  value={rupeeAmount || ''}
                  onChange={(e) => handleRupeeChange(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 10, 20, 50"
                  className="w-full pl-8 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Customer says &quot;Give ₹X worth&quot; &rarr; auto-calculates exact weight W = Amount &divide; Rate
              </p>
            </div>

            {/* Calculated Weight Result */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Calculated Weight:</span>
              <span className="font-extrabold text-blue-900 text-base" data-testid="calculated-weight-display">
                {roundQty(weightKg).toFixed(3)} {product.unit_type === 'LTR' ? 'L' : 'kg'}
              </span>
            </div>
          </div>

          {/* Action Confirmation Button */}
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="confirm-loose-btn"
              onClick={handleConfirm}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Add to Bill ({formatINR(rupeeAmount)})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

