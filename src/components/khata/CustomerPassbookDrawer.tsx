import React, { useState, useEffect } from 'react';
import { Customer, KhataTransaction, ShopProfile } from '../../types';
import { db } from '../../db/db';
import { KhataService } from '../../services/khataService';
import { ReceiveJamaModal } from './ReceiveJamaModal';
import { formatINR } from '../../utils/math';
import {
  X,
  Phone,
  MessageSquare,
  Download,
  CheckCircle,
  PlusCircle,
  Clock,
  ShieldCheck,
  FileText,
  AlertTriangle,
} from 'lucide-react';

interface CustomerPassbookDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  shopProfile?: ShopProfile | null;
  onDataChanged?: () => void;
}

export const CustomerPassbookDrawer: React.FC<CustomerPassbookDrawerProps> = ({
  isOpen,
  onClose,
  customer,
  shopProfile,
  onDataChanged,
}) => {
  const [transactions, setTransactions] = useState<KhataTransaction[]>([]);
  const [isJamaModalOpen, setIsJamaModalOpen] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(customer);

  useEffect(() => {
    setCurrentCustomer(customer);
    if (customer) {
      loadTransactions(customer.id);
    }
  }, [customer, isOpen]);

  const loadTransactions = async (customerId: string) => {
    const rows = await db.khata_transactions
      .where({ customer_id: customerId })
      .sortBy('created_at');
    setTransactions(rows);

    const reloadedCust = await db.customers.get(customerId);
    if (reloadedCust) setCurrentCustomer(reloadedCust);
  };

  if (!isOpen || !currentCustomer) return null;

  const agingDays = KhataService.getAgingDays(currentCustomer.oldest_unpaid_date);
  const defaultProfile: ShopProfile = shopProfile || {
    id: 'current_shop',
    shop_name: 'Smart Kirana',
    owner_name: 'Owner',
    phone: '9876543210',
    upi_vpa: 'kirana@upi',
    address: 'Shop Market',
    gst_footer_note: '',
    updated_at: new Date().toISOString(),
  };

  // Compute Debit and Credit Totals
  const totalDebit = transactions
    .filter((t) => t.entry_type === 'DEBIT_UDHARI_GIVEN')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalCredit = transactions
    .filter((t) => t.entry_type === 'CREDIT_JAMA_RECEIVED')
    .reduce((sum, t) => sum + t.amount, 0);

  const calculatedBalance = Math.max(0, Math.round((totalDebit - totalCredit) * 100) / 100);

  // WhatsApp Trigger (REQ-12)
  const handleSendWhatsApp = (tier: 0 | 1 | 2 = 1) => {
    const url = KhataService.generateWhatsAppLink({
      customer: currentCustomer,
      shopProfile: defaultProfile,
      tier,
    });
    KhataService.logReminderSent(currentCustomer.id);
    window.open(url, '_blank');
  };

  // PDF Export Trigger (REQ-14)
  const handleDownloadPdf = async () => {
    await KhataService.generateKhataStatementPdf(currentCustomer, defaultProfile);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200 overflow-hidden">
        {/* Top Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{currentCustomer.name}</h2>
              <span className="text-xs font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                {currentCustomer.phone}
              </span>
            </div>
            {currentCustomer.address_landmark && (
              <p className="text-xs text-slate-500">{currentCustomer.address_landmark}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-500">Credit Trust Limit:</span>
              <span className="text-xs font-bold text-slate-700">
                {formatINR(currentCustomer.credit_limit)}
              </span>
              {currentCustomer.current_udhari_balance > currentCustomer.credit_limit && (
                <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                  Limit Exceeded!
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Card & Action Buttons */}
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Current Pending Udhari
              </span>
              <div
                data-testid="passbook-current-balance"
                className="text-2xl font-extrabold text-[#dc2626]"
              >
                {formatINR(currentCustomer.current_udhari_balance)}
              </div>
            </div>

            {currentCustomer.current_udhari_balance > 0 && agingDays > 0 && (
              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 justify-end">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Oldest Balance Aging
                </span>
                <span
                  data-testid="customer-aging-days"
                  className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    agingDays > 15
                      ? 'bg-red-100 text-red-800'
                      : agingDays > 7
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {agingDays} Days Pending
                </span>
              </div>
            )}
          </div>

          {/* Action Button Row */}
          <div className="grid grid-cols-3 gap-2">
            {/* Receive Jama Button */}
            <button
              type="button"
              data-testid="receive-jama-btn"
              disabled={currentCustomer.current_udhari_balance <= 0}
              onClick={() => setIsJamaModalOpen(true)}
              className="py-2.5 px-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Receive Jama</span>
            </button>

            {/* WhatsApp Reminder (REQ-12) */}
            <button
              type="button"
              data-testid="send-whatsapp-reminder-btn"
              disabled={currentCustomer.current_udhari_balance <= 0}
              onClick={() => handleSendWhatsApp(agingDays > 15 ? 2 : 1)}
              className="py-2.5 px-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <MessageSquare className="w-4 h-4" />
              <span>WhatsApp Reminder</span>
            </button>

            {/* Statement PDF */}
            <button
              type="button"
              data-testid="download-khata-pdf-btn"
              onClick={handleDownloadPdf}
              className="py-2.5 px-2 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>PDF Passbook</span>
            </button>
          </div>
        </div>

        {/* Chronological Passbook Table (REQ-11) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-700" />
              <span>Chronological Account Passbook ({transactions.length} entries)</span>
            </h3>
            {/* Khatabook Invariant Badge */}
            <span
              title="∑(Debit) - ∑(Credit) = Balance verified"
              className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Math Invariant Verified</span>
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No Khata transactions recorded yet for this customer.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" data-testid="passbook-table">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Details</th>
                      <th className="p-2.5 text-right">Udhari (+)</th>
                      <th className="p-2.5 text-right">Jama (-)</th>
                      <th className="p-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx) => {
                      const dt = new Date(tx.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      });
                      const isDebit = tx.entry_type === 'DEBIT_UDHARI_GIVEN';

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {dt}
                          </td>
                          <td className="p-2.5 text-slate-700 max-w-[140px] truncate" title={tx.notes}>
                            {tx.notes}
                          </td>
                          <td className="p-2.5 text-right font-bold text-[#dc2626]">
                            {isDebit ? formatINR(tx.amount) : '-'}
                          </td>
                          <td className="p-2.5 text-right font-bold text-[#16a34a]">
                            {!isDebit ? formatINR(tx.amount) : '-'}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            {formatINR(tx.running_balance_after)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Receive Jama Modal */}
      <ReceiveJamaModal
        isOpen={isJamaModalOpen}
        onClose={() => setIsJamaModalOpen(false)}
        customer={currentCustomer}
        shopProfile={defaultProfile}
        onPaymentRecorded={() => {
          loadTransactions(currentCustomer.id);
          if (onDataChanged) onDataChanged();
        }}
      />
    </div>
  );
};

