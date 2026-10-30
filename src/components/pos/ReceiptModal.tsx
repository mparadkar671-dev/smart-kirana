import React from 'react';
import { SalesInvoice, SaleItem, ShopProfile, Customer } from '../../types';
import { formatRupees } from '../../utils/math';
import { Printer, X, CheckCircle, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  items: SaleItem[];
  profile: ShopProfile | null;
  customer?: Customer | null;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  invoice,
  items = [],
  profile,
  customer,
}) => {
  if (!isOpen || !invoice) return null;

  const safeItems = items || [];

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    if (!customer?.phone || customer.phone === '0000000000') {
      alert('Walk-in customer has no mobile number for WhatsApp receipt.');
      return;
    }
    const lines = safeItems
      .map((i) => `• ${i.product_name_snapshot} (${i.qty} x ₹${i.unit_selling_price}) = ₹${i.line_total}`)
      .join('\n');
    const msg = `*${profile?.shop_name || 'Smart Kirana'}*\n` +
      `Bill No: ${invoice.invoice_number}\n` +
      `Date: ${new Date(invoice.created_at).toLocaleDateString('en-IN')}\n\n` +
      `*Items:*\n${lines}\n\n` +
      `*Grand Total: ₹${formatRupees(invoice.grand_total)}*\n` +
      `Paid: ₹${formatRupees(invoice.amount_paid_now)} (${invoice.payment_mode})\n` +
      (invoice.udhari_added > 0 ? `Udhari Added: ₹${formatRupees(invoice.udhari_added)}\nTotal Pending: ₹${formatRupees(customer.current_udhari_balance)}\n` : '') +
      `\nThank you for shopping with us!`;

    const encoded = encodeURIComponent(msg);
    const cleanPhone = customer.phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    window.open(`https://wa.me/${phoneWithCountry}?text=${encoded}`, '_blank');
  };

  const upiLink = profile?.upi_vpa
    ? `upi://pay?pa=${encodeURIComponent(profile.upi_vpa)}&pn=${encodeURIComponent(
        profile.shop_name
      )}&am=${encodeURIComponent(invoice.grand_total.toFixed(2))}&cu=INR`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden my-8">
        {/* Modal Controls (Hidden during print) */}
        <div className="no-print bg-slate-100 dark:bg-slate-800 p-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-green-600 font-bold text-sm">
            <CheckCircle className="w-4 h-4" /> Bill Generated
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleWhatsAppShare}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-green-600 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition"
              title="Share via WhatsApp"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" /> Print Thermal Slip
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Container (80mm width standard) */}
        <div className="p-5 font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 printable-receipt">
          {/* Header */}
          <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
            <h1 className="font-bold text-sm uppercase tracking-wide text-slate-900 dark:text-white">
              {profile?.shop_name || 'Smart Kirana & General Store'}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{profile?.address}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Ph: {profile?.phone}</p>
          </div>

          {/* Invoice Meta */}
          <div className="py-2.5 border-b border-dashed border-slate-300 dark:border-slate-700 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>Invoice: #{invoice.invoice_number}</span>
              <span>{new Date(invoice.created_at).toLocaleDateString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Customer: {customer?.name || 'Walk-in Customer'}</span>
              <span>{new Date(invoice.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {customer?.phone && customer.phone !== '0000000000' && (
              <div className="text-slate-500">Phone: {customer.phone}</div>
            )}
          </div>

          {/* Itemized Table */}
          <div className="py-2 border-b border-dashed border-slate-300 dark:border-slate-700">
            <div className="grid grid-cols-12 font-bold text-[10px] text-slate-500 uppercase pb-1 border-b border-slate-200 dark:border-slate-700">
              <span className="col-span-6">Item</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate</span>
              <span className="col-span-2 text-right">Amt</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
              {safeItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 py-1 items-center">
                  <span className="col-span-6 truncate font-sans text-xs">{item.product_name_snapshot}</span>
                  <span className="col-span-2 text-right">{item.qty}</span>
                  <span className="col-span-2 text-right">₹{item.unit_selling_price}</span>
                  <span className="col-span-2 text-right font-semibold">₹{formatRupees(item.line_total)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="py-2 space-y-1 text-xs border-b border-dashed border-slate-300 dark:border-slate-700">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal:</span>
              <span>₹{formatRupees(invoice.subtotal_amount)}</span>
            </div>
            {invoice.discount_roundoff > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>Bargain Round-off:</span>
                <span>-₹{formatRupees(invoice.discount_roundoff)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
              <span>NET TOTAL:</span>
              <span>₹{formatRupees(invoice.grand_total)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400 pt-1">
              <span>Paid ({invoice.payment_mode}):</span>
              <span className="font-semibold text-green-600">₹{formatRupees(invoice.amount_paid_now)}</span>
            </div>
            {invoice.udhari_added > 0 && (
              <div className="flex justify-between text-[11px] text-red-600 font-semibold">
                <span>Added to Udhari:</span>
                <span>₹{formatRupees(invoice.udhari_added)}</span>
              </div>
            )}
          </div>

          {/* Pending Balance / Khata Snapshot if applicable */}
          {customer && customer.id !== '0000-WALK-IN' && customer.current_udhari_balance > 0 && (
            <div className="py-2 border-b border-dashed border-slate-300 dark:border-slate-700 text-center bg-red-50 dark:bg-red-950/30 p-2 rounded-sm text-[11px] text-red-700 dark:text-red-300">
              <span>Total Outstanding Udhari: </span>
              <span className="font-bold">₹{formatRupees(customer.current_udhari_balance)}</span>
            </div>
          )}

          {/* Dynamic UPI QR for instant payment if balance pending */}
          {upiLink && (
            <div className="py-3 flex flex-col items-center border-b border-dashed border-slate-300 dark:border-slate-700">
              <div className="p-2 bg-white rounded-lg shadow-2xs">
                <QRCodeSVG value={upiLink} size={84} />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Scan &amp; Pay via PhonePe / GPay / Paytm</p>
            </div>
          )}

          {/* Footer Note */}
          <div className="text-center pt-3 text-[10px] text-slate-500 dark:text-slate-400">
            <p className="font-semibold text-slate-700 dark:text-slate-300">{profile?.gst_footer_note || 'Dhanyawad! Visit again.'}</p>
            <p className="text-[9px] mt-0.5">Powered by Smart Kirana POS</p>
          </div>
        </div>

        {/* Modal Bottom Close */}
        <div className="no-print p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-lg text-xs font-semibold transition"
          >
            Done (ESC)
          </button>
        </div>
      </div>
    </div>
  );
};
