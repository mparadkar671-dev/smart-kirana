import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BillingService } from '../../services/billingService';
import { formatINR } from '../../utils/math';
import { X, QrCode, CheckCircle, Smartphone } from 'lucide-react';

interface UpiCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  shopName: string;
  shopVpa: string;
  onPaymentConfirmed: () => void;
}

export const UpiCheckoutModal: React.FC<UpiCheckoutModalProps> = ({
  isOpen,
  onClose,
  amount,
  shopName,
  shopVpa,
  onPaymentConfirmed,
}) => {
  if (!isOpen) return null;

  const upiIntentUrl = BillingService.generateUpiIntentUrl(shopVpa, shopName, amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-blue-50/80 dark:bg-blue-950/40">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Dynamic Counter UPI QR</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Exact Payable Amount</span>
            <div className="text-3xl font-extrabold text-blue-900 dark:text-blue-300" data-testid="upi-exact-amount">
              {formatINR(amount)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{shopVpa}</p>
          </div>

          {/* Dynamic QR Code (Locked to exact amount) */}
          <div className="p-3 bg-white border-2 border-slate-900 rounded-2xl shadow-sm inline-block">
            <QRCodeSVG
              value={upiIntentUrl}
              size={180}
              level="H"
              includeMargin={true}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>Scan using GPay / PhonePe / Paytm</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Amount is locked to {formatINR(amount)} to prevent short-payment mistakes.
            </p>
          </div>

          {/* Confirmation Button */}
          <button
            type="button"
            data-testid="confirm-upi-payment-btn"
            onClick={onPaymentConfirmed}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            <span>Payment Received via UPI</span>
          </button>
        </div>
      </div>
    </div>
  );
};

