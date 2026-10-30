import React, { useState, useEffect } from 'react';
import { Customer, ShopProfile, KhataPaymentChannel } from '../../types';
import { KhataService } from '../../services/khataService';
import { BillingService } from '../../services/billingService';
import { formatINR, roundCurrency } from '../../utils/math';
import { QRCodeSVG } from 'qrcode.react';
import { X, CheckCircle, Smartphone, DollarSign, Percent, AlertCircle } from 'lucide-react';

interface ReceiveJamaModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  shopProfile?: ShopProfile | null;
  onPaymentRecorded: () => void;
}

export const ReceiveJamaModal: React.FC<ReceiveJamaModalProps> = ({
  isOpen,
  onClose,
  customer,
  shopProfile,
  onPaymentRecorded,
}) => {
  const [amount, setAmount] = useState<number>(0);
  const [channel, setChannel] = useState<KhataPaymentChannel>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setAmount(customer.current_udhari_balance);
      setChannel('CASH');
      setNotes('');
      setErrorMsg(null);
    }
  }, [customer, isOpen]);

  if (!isOpen || !customer) return null;

  const handlePercentageQuickChip = (percent: number) => {
    const calculated = roundCurrency((customer.current_udhari_balance * percent) / 100);
    setAmount(calculated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setErrorMsg('Payment amount must be greater than zero');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await KhataService.recordJamaPayment({
        customerId: customer.id,
        amount,
        paymentChannel: channel,
        notes,
      });

      onPaymentRecorded();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record Jama');
    } finally {
      setIsSubmitting(false);
    }
  };

  const shopName = shopProfile?.shop_name || 'Smart Kirana';
  const shopVpa = shopProfile?.upi_vpa || 'kirana@upi';
  const upiIntentUrl = BillingService.generateUpiIntentUrl(shopVpa, shopName, amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-100 bg-emerald-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Receive Jama (Payment)</h2>
              <p className="text-xs text-emerald-800 font-semibold">{customer.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Current Pending Balance Banner */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-500 uppercase font-semibold">Total Pending Udhari</span>
              <div className="text-xl font-extrabold text-[#dc2626]" data-testid="customer-current-balance">
                {formatINR(customer.current_udhari_balance)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {[25, 50, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentageQuickChip(pct)}
                  className="px-2 py-1 bg-white border border-slate-300 hover:border-emerald-500 text-slate-700 text-xs font-bold rounded-lg transition"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Amount Received (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">₹</span>
              <input
                type="number"
                step="1"
                min="1"
                max={customer.current_udhari_balance}
                required
                data-testid="jama-amount-input"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Payment Channel Radio / Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="channel-cash"
                onClick={() => setChannel('CASH')}
                className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition ${
                  channel === 'CASH'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>Cash Galla</span>
              </button>

              <button
                type="button"
                data-testid="channel-upi"
                onClick={() => setChannel('UPI')}
                className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition ${
                  channel === 'UPI'
                    ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-4 h-4 text-blue-600" />
                <span>UPI Scan</span>
              </button>

              <button
                type="button"
                data-testid="channel-discount"
                onClick={() => setChannel('DISCOUNT_SETTLEMENT')}
                className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition ${
                  channel === 'DISCOUNT_SETTLEMENT'
                    ? 'border-purple-600 bg-purple-50 text-purple-800 ring-2 ring-purple-500/20'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Percent className="w-4 h-4 text-purple-600" />
                <span>Discount / Settlement</span>
              </button>
            </div>
          </div>

          {/* Dynamic UPI QR Code if UPI Selected (AT-07 / REQ-30) */}
          {channel === 'UPI' && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center space-y-2 text-center" data-testid="jama-upi-container">
              <span className="text-[11px] font-bold text-slate-600 uppercase">
                Scan to Pay Exact Amount: {formatINR(amount)}
              </span>
              <div className="p-2.5 bg-white border border-slate-300 rounded-xl shadow-2xs">
                <QRCodeSVG value={upiIntentUrl} size={130} level="M" />
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {shopVpa} (am={amount.toFixed(2)})
              </span>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Remarks (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cleared Diwali grocery bill"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Remaining Balance Preview */}
          <div className="flex items-center justify-between text-xs font-semibold pt-1 border-t border-slate-100">
            <span className="text-slate-500">Remaining Balance After:</span>
            <span className="font-extrabold text-slate-800" data-testid="remaining-balance-preview">
              {formatINR(Math.max(0, customer.current_udhari_balance - amount))}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-medium hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="submit-jama-btn"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Confirm Jama ({formatINR(amount)})</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

