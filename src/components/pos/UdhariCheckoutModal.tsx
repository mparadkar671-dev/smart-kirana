import React, { useState, useEffect, useRef } from 'react';
import { Customer } from '../../types';
import { db } from '../../db/db';
import { cloudSyncService } from '../../services/cloudSyncService';
import { formatINR, roundCurrency, toPaise, toRupees } from '../../utils/math';
import { X, UserPlus, AlertTriangle, Check, BookOpen, Search, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface UdhariCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  grandTotal: number;
  customers: Customer[];
  initialCustomerId?: string;
  onConfirm: (params: {
    customerId: string;
    mode: 'UDHARI_FULL' | 'SPLIT_PARTIAL';
    amountPaidNow: number;
    udhariAdded: number;
  }) => void;
}

export const UdhariCheckoutModal: React.FC<UdhariCheckoutModalProps> = ({
  isOpen,
  onClose,
  grandTotal,
  customers,
  initialCustomerId,
  onConfirm,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isQuickCreate, setIsQuickCreate] = useState(false);

  // Quick Create Form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCreditLimit, setNewCreditLimit] = useState(2000);

  // Payment Breakdown
  const [isSplit, setIsSplit] = useState(false);
  const [cashPaidNow, setCashPaidNow] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hard Credit Limit Enforcement (Iteration 4)
  const { userRole } = useAuth();
  const [managerOverridePin, setManagerOverridePin] = useState('');
  const [ownerOverrideApproved, setOwnerOverrideApproved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedCustomerId(initialCustomerId || '');
      setSearchQuery('');
      setHighlightedIndex(0);
      setIsQuickCreate(false);
      setIsSplit(false);
      setCashPaidNow(0);
      setManagerOverridePin('');
      setOwnerOverrideApproved(false);
      setErrorMsg(null);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, initialCustomerId]);

  // Filter out system walk-in customer from Udhari list
  const filteredCustomers = customers
    .filter((c) => c.id !== '0000-WALK-IN')
    .filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
    );

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Split calculation
  const effectivePaidNow = isSplit ? roundCurrency(cashPaidNow) : 0;
  const effectiveUdhari = roundCurrency(grandTotal - effectivePaidNow);

  // Hard Credit Limit Guardrail (REQ-29 / AT-08 / Iteration 4)
  const isCreditExceeded =
    selectedCustomer &&
    selectedCustomer.current_udhari_balance + effectiveUdhari > selectedCustomer.credit_limit;

  const excessAmount = selectedCustomer
    ? roundCurrency(selectedCustomer.current_udhari_balance + effectiveUdhari - selectedCustomer.credit_limit)
    : 0;

  const isCashier = userRole === 'CASHIER';
  const isManagerPinValid =
    managerOverridePin === '1234' || managerOverridePin === '0000' || managerOverridePin === '9999';
  const isBlockedByCreditLimit =
    Boolean(isCreditExceeded &&
    (isCashier ? !isManagerPinValid : !ownerOverrideApproved));

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newPhone.trim().length !== 10) {
      setErrorMsg('Please enter a valid customer name and 10-digit mobile number');
      return;
    }

    const profile = await db.getShopProfile();
    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      shop_id: profile?.id || 'current_shop',
      business_type: profile?.business_type || 'KIRANA_RETAIL',
      name: newName.trim(),
      phone: newPhone.trim(),
      credit_limit: newCreditLimit || 2000,
      current_udhari_balance: 0,
      oldest_unpaid_date: null,
      last_reminder_sent_at: null,
      created_at: new Date().toISOString(),
    };

    await db.customers.add(newCustomer);
    await db.queueSync(
      {
        table_name: 'customers',
        operation: 'INSERT',
        payload: newCustomer as unknown as Record<string, unknown>,
        shop_id: newCustomer.shop_id,
      },
      db.sync_outbox
    );
    cloudSyncService.syncCustomer(newCustomer).catch(() => {});
    cloudSyncService.flushOutbox().catch(() => {});
    setSelectedCustomerId(newCustomer.id);
    setIsQuickCreate(false);
    setErrorMsg(null);
  };

  const handleFinalSubmit = () => {
    if (!selectedCustomerId) {
      setErrorMsg('Please select a customer for Khata / Udhari');
      return;
    }
    if (isSplit && (cashPaidNow < 0 || cashPaidNow > grandTotal)) {
      setErrorMsg(`Cash paid now must be between ₹0 and ₹${grandTotal}`);
      return;
    }

    if (isCreditExceeded) {
      if (isCashier && !isManagerPinValid) {
        setErrorMsg(`Credit limit exceeded by ${formatINR(excessAmount)}. Collect at least ${formatINR(excessAmount)} in cash (Split Payment) or enter Manager PIN to override.`);
        return;
      }
      if (!isCashier && !ownerOverrideApproved) {
        setErrorMsg(`Please check the Owner/Manager Override authorization box to approve credit exceeding ${formatINR(selectedCustomer!.credit_limit)}.`);
        return;
      }
    }

    onConfirm({
      customerId: selectedCustomerId,
      mode: isSplit && effectivePaidNow > 0 ? 'SPLIT_PARTIAL' : 'UDHARI_FULL',
      amountPaidNow: effectivePaidNow,
      udhariAdded: effectiveUdhari,
    });
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (isQuickCreate) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(filteredCustomers.length - 1, prev + 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (!selectedCustomerId && filteredCustomers.length > 0) {
          const chosen = filteredCustomers[highlightedIndex] || filteredCustomers[0];
          if (chosen) setSelectedCustomerId(chosen.id);
          return;
        }

        if (selectedCustomer) {
          handleFinalSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    isQuickCreate,
    filteredCustomers,
    highlightedIndex,
    selectedCustomerId,
    selectedCustomer,
    isCreditExceeded,
    isCashier,
    isManagerPinValid,
    ownerOverrideApproved,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-8 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/80 dark:bg-amber-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Udhari (Khata) Checkout</h2>
              <p className="text-xs text-amber-900 dark:text-amber-300">Bill Total: {formatINR(grandTotal)}</p>
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
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-6 space-y-4">
          {/* Quick Create New Customer toggle */}
          {!isQuickCreate ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Select Khata Customer
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickCreate(true)}
                  className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Add New Customer</span>
                </button>
              </div>

              {/* Customer Search Box */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder="Search customer by Name or 10-digit Phone... [Arrow keys + Enter]"
                  className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Customer List */}
              <div className="max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No customers found matching search.
                  </div>
                ) : (
                  filteredCustomers.map((cust, idx) => (
                    <button
                      key={cust.id}
                      type="button"
                      data-testid={`customer-option-${cust.id}`}
                      onClick={() => setSelectedCustomerId(cust.id)}
                      className={`w-full p-2.5 text-left text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                        selectedCustomerId === cust.id
                          ? 'bg-amber-50/80 dark:bg-amber-950/40 font-bold ring-1 ring-amber-500/40'
                          : idx === highlightedIndex
                          ? 'bg-slate-100 dark:bg-slate-800/80'
                          : ''
                      }`}
                    >
                      <div>
                        <span className="text-slate-900 dark:text-slate-100 font-semibold">{cust.name}</span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] ml-2">{cust.phone}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px]">Bal: </span>
                        <span className={`font-bold ${cust.current_udhari_balance > 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                          {formatINR(cust.current_udhari_balance)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Quick Add Customer Subform */
            <form onSubmit={handleQuickCreateCustomer} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-blue-700" />
                  Quick Add New Khata Customer
                </span>
                <button
                  type="button"
                  onClick={() => setIsQuickCreate(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Ramesh Sharma"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    WhatsApp Phone (10 digits) *
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold shadow-xs transition"
              >
                Create & Select Customer
              </button>
            </form>
          )}

          {/* Payment Split Options (REQ-09: Full Udhari vs Split Cash + Udhari) */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Split Payment (Part Cash / Part Udhari)?</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="split-payment-toggle"
                  checked={isSplit}
                  onChange={(e) => {
                    setIsSplit(e.target.checked);
                    if (!e.target.checked) setCashPaidNow(0);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>

            {isSplit && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-700">Cash Received Now:</label>
                  <div className="relative w-32">
                    <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max={grandTotal}
                      data-testid="cash-received-now-input"
                      value={cashPaidNow || ''}
                      onChange={(e) => setCashPaidNow(parseFloat(e.target.value) || 0)}
                      className="w-full pl-6 pr-2 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-bold text-amber-900 bg-amber-100/60 p-2 rounded-lg">
                  <span>Balance Added to Udhari:</span>
                  <span className="text-sm font-extrabold text-[#dc2626]">
                    {formatINR(effectiveUdhari)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Credit Limit Exceeded Guardrail (REQ-29 / AT-08 / Iteration 4) */}
          {isCreditExceeded && (
            <div
              data-testid="credit-limit-warning"
              className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl text-red-900 dark:text-red-300 text-xs space-y-2 animate-in fade-in"
            >
              <div className="flex items-center gap-1.5 font-bold text-red-800 dark:text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Credit Trust Limit Exceeded (+{formatINR(excessAmount)} over limit)</span>
              </div>
              <p className="text-[11px] text-red-700 dark:text-red-400 leading-relaxed">
                Customer limit is {formatINR(selectedCustomer!.credit_limit)}. Existing balance: {formatINR(selectedCustomer!.current_udhari_balance)}.
                New total would reach {formatINR(selectedCustomer!.current_udhari_balance + effectiveUdhari)}.
              </p>

              {isCashier ? (
                <div className="p-2.5 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-lg space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-300">
                    <ShieldCheck className="w-4 h-4 text-red-600" />
                    <span>Cashier Checkout Blocked</span>
                  </div>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400">
                    To proceed: Either collect at least {formatINR(excessAmount)} in cash (Split Payment) to stay within limit, OR enter Owner/Manager 4-digit PIN below:
                  </p>
                  <input
                    type="password"
                    maxLength={4}
                    value={managerOverridePin}
                    onChange={(e) => setManagerOverridePin(e.target.value)}
                    placeholder="Enter Manager PIN to Override (default: 1234)"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-red-300 dark:border-red-700 rounded-lg text-center tracking-widest text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  {isManagerPinValid && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Manager override authorized!
                    </p>
                  )}
                </div>
              ) : (
                <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ownerOverrideApproved}
                    onChange={(e) => setOwnerOverrideApproved(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                    Authorize Owner/Manager Credit Override for this bill
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Actions */}
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
              data-testid="confirm-udhari-btn"
              disabled={!selectedCustomerId || isBlockedByCreditLimit}
              onClick={handleFinalSubmit}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Confirm Udhari Sale ({formatINR(effectiveUdhari)})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

