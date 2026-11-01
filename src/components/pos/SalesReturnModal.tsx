import React, { useState, useEffect } from 'react';
import {
  Undo2,
  FileText,
  AlertTriangle,
  ShieldCheck,
  ShoppingCart,
  X,
  CheckCircle,
  Clock,
  User,
  ArrowRight,
} from 'lucide-react';
import { SalesInvoice, SaleItem, Customer, SalesReturnReason, UserRole } from '../../types';
import { db } from '../../db/db';
import { BillingService } from '../../services/billingService';
import { formatINR } from '../../utils/math';
import { useAuth } from '../../context/AuthContext';

interface SalesReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  onSuccess: (creditNoteNumber: string, reloadedCart: boolean) => void;
  onNavigateToPOS?: () => void;
}

export const SalesReturnModal: React.FC<SalesReturnModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onSuccess,
  onNavigateToPOS,
}) => {
  const { userRole } = useAuth();
  const [items, setItems] = useState<SaleItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [reason, setReason] = useState<SalesReturnReason>('CUSTOMER_RETURN');
  const [notes, setNotes] = useState('');
  const [cloneToActiveCart, setCloneToActiveCart] = useState(true);
  const [managerPin, setManagerPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [returnSuccessData, setReturnSuccessData] = useState<{
    creditNoteNumber: string;
    cloned: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || !invoice) {
      setItems([]);
      setCustomer(null);
      setErrorMsg(null);
      setReturnSuccessData(null);
      setManagerPin('');
      return;
    }

    // Load invoice items & customer
    db.sale_items.where('invoice_id').equals(invoice.id).toArray().then(setItems);
    if (invoice.customer_id && invoice.customer_id !== '0000-WALK-IN') {
      db.customers.get(invoice.customer_id).then((c) => setCustomer(c || null));
    }
  }, [isOpen, invoice]);

  if (!isOpen || !invoice) return null;

  const requiresPin = userRole !== 'OWNER' && userRole !== 'MANAGER';

  const handleExecuteReturn = async () => {
    setErrorMsg(null);

    // If Cashier/Accountant, verify Manager/Owner PIN
    if (requiresPin) {
      if (!managerPin || managerPin.trim().length < 4) {
        setErrorMsg('Please enter a valid 4-digit Store Owner or Manager authorization PIN');
        return;
      }
      // Demo & Standard Default Kirana Manager PIN check
      if (managerPin !== '1234' && managerPin !== '0000' && managerPin !== '9999') {
        setErrorMsg('Invalid Manager PIN. Contact the store owner to authorize this return.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Execute atomic return & credit note creation
      const result = await BillingService.processSalesReturn({
        invoiceId: invoice.id,
        reason,
        notes: notes.trim(),
        userRole: requiresPin ? 'MANAGER' : userRole, // authorized via validated PIN
        cloneToActiveCart,
      });

      setReturnSuccessData({
        creditNoteNumber: result.creditNote.credit_note_number,
        cloned: cloneToActiveCart,
      });

      onSuccess(result.creditNote.credit_note_number, cloneToActiveCart);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      data-testid="sales-return-modal"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border-b border-amber-200/70 dark:border-amber-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 dark:bg-amber-400/20 text-amber-700 dark:text-amber-400 rounded-xl">
              <Undo2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                Return / Revise Bill
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300">
                  #{invoice.invoice_number}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Immutable audit trail &bull; Restores stock &bull; Issues Credit Note
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-white/60 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {returnSuccessData ? (
            /* Success State */
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Credit Note Issued Successfully!
                </h3>
                <p className="text-sm font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                  {returnSuccessData.creditNoteNumber}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Bill #{invoice.invoice_number} is locked as RETURNED. Stock has been restored and ledgers adjusted atomically.
                </p>
              </div>

              {returnSuccessData.cloned && onNavigateToPOS && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl text-blue-900 dark:text-blue-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold">Items cloned into active cart</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToPOS();
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1 transition"
                  >
                    Open POS <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Return Form */
            <>
              {errorMsg && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Bill Details Summary Card */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{new Date(invoice.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} &bull; {new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {invoice.payment_mode}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-1">
                  <div>
                    <span className="text-slate-400 uppercase text-[10px] block font-bold">Customer</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      {customer ? customer.name : 'Walk-In Customer'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 uppercase text-[10px] block font-bold">Total Bill Amount</span>
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {formatINR(invoice.grand_total)}
                    </span>
                  </div>
                </div>

                {items.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                      Items in this bill ({items.length})
                    </span>
                    <div className="max-h-24 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                      {items.map((it) => (
                        <div key={it.id} className="py-1 flex justify-between">
                          <span className="text-slate-700 dark:text-slate-300 truncate max-w-[220px]">
                            {it.product_name_snapshot} &times; {it.qty}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {formatINR(it.line_total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Mandatory Reason Selector */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Mandatory Return Reason *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'CUSTOMER_RETURN' as SalesReturnReason, label: 'Customer Return', desc: 'Goods returned' },
                    { id: 'BILLING_MISTAKE' as SalesReturnReason, label: 'Billing Mistake', desc: 'Wrong item or qty' },
                    { id: 'RATE_ADJUSTMENT' as SalesReturnReason, label: 'Rate Error', desc: 'Pricing adjustment' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setReason(r.id)}
                      className={`p-2.5 rounded-xl text-left border transition ${
                        reason === r.id
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold">{r.label}</div>
                      <div className="text-[10px] opacity-75">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Remarks / Notes */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Notes / Audit Remarks (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Customer brought sealed packet back; replacing with 5kg"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                />
              </div>

              {/* 1-Click Clone to Active Cart */}
              <label className="flex items-center gap-2.5 p-3 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-900/50 rounded-2xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloneToActiveCart}
                  onChange={(e) => setCloneToActiveCart(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    1-Click Clone Items into Active POS Cart
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Re-bill immediately with corrected items without re-typing.
                  </div>
                </div>
              </label>

              {/* Manager PIN Guardrail if Cashier */}
              {requiresPin && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>Manager Authorization Required</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    As Cashier, you must ask the Store Owner or Manager for their 4-digit PIN to authorize this return.
                  </p>
                  <input
                    type="password"
                    maxLength={4}
                    value={managerPin}
                    onChange={(e) => setManagerPin(e.target.value)}
                    placeholder="Enter 4-Digit Manager PIN (default: 1234)"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl font-mono text-center tracking-widest text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* Atomic Safety Notice */}
              <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/40 p-2.5 rounded-xl space-y-1">
                <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Immutable Audit Actions:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                  <li>Invoice #{invoice.invoice_number} will be marked as RETURNED (no hard deletes).</li>
                  <li>All {items.length} items restored to stock with RETURN_IN inventory logs.</li>
                  {invoice.udhari_added > 0 && <li>Customer udhari balance reduced by {formatINR(invoice.udhari_added)}.</li>}
                  {invoice.amount_paid_now > 0 && invoice.payment_mode === 'CASH' && <li>Galla drawer cash adjusted by {formatINR(invoice.amount_paid_now)}.</li>}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-return-bill-btn"
                  onClick={handleExecuteReturn}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-md shadow-amber-600/20 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  <Undo2 className="w-4 h-4" />
                  {isSubmitting ? 'Processing Return...' : 'Confirm Return & Issue CN'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

