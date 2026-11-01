import React, { useRef, useState } from 'react';
import { SalesInvoice, SaleItem, ShopProfile, Customer } from '../../types';
import { formatRupees } from '../../utils/math';
import {
  Printer,
  X,
  CheckCircle,
  Share2,
  Download,
  Copy,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { generateReceiptCanvas } from '../../utils/receiptCanvas';

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
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  if (!isOpen || !invoice) return null;

  const safeItems = items || [];

  // Calculate Previous Balance & Total Balance
  const currentKhataBalance = Number(customer?.current_udhari_balance) || 0;
  const udhariAddedThisBill = Number(invoice.udhari_added) || 0;
  const previousBalance = Math.max(0, currentKhataBalance - udhariAddedThisBill);

  const handlePrint = () => {
    window.print();
  };

  /**
   * Generates a high-res 2D canvas of the receipt using Native HTML5 Canvas
   * 100% immune to Tailwind v4 oklch CSS color bugs or DOM clipping
   */
  const captureReceiptCanvas = (): HTMLCanvasElement | null => {
    try {
      const qrEl = document.getElementById('receipt-upi-qr-canvas') as HTMLCanvasElement | null;
      return generateReceiptCanvas({
        invoice,
        items: safeItems,
        profile,
        customer,
        previousBalance,
        currentKhataBalance,
        udhariAddedThisBill,
        qrCanvasElement: qrEl,
      });
    } catch (err) {
      console.warn('Fallback: generating receipt canvas without QR element:', err);
      try {
        return generateReceiptCanvas({
          invoice,
          items: safeItems,
          profile,
          customer,
          previousBalance,
          currentKhataBalance,
          udhariAddedThisBill,
          qrCanvasElement: null,
        });
      } catch (e) {
        console.error('Failed to generate receipt canvas:', e);
        return null;
      }
    }
  };

  /**
   * Downloads the receipt as high-res PNG image
   */
  const handleDownloadImage = async () => {
    setIsExporting(true);
    try {
      const canvas = await captureReceiptCanvas();
      if (!canvas) return;

      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `Bill_${invoice.invoice_number}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setCopyFeedback('✓ Bill Image Downloaded!');
      setTimeout(() => setCopyFeedback(null), 3000);
    } catch (e) {
      console.error('Failed to export bill image:', e);
      setCopyFeedback('Could not generate bill image'); setTimeout(() => setCopyFeedback(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Copies the bill image to clipboard for direct Ctrl+V pasting into WhatsApp Web
   */
  const handleCopyImage = async () => {
    setIsExporting(true);
    try {
      const canvas = await captureReceiptCanvas();
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          if (navigator.clipboard && 'write' in navigator.clipboard) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            setCopyFeedback('✓ Copied Image! Paste (Ctrl+V) in WhatsApp');
          } else {
            // Fallback to downloading
            await handleDownloadImage();
          }
        } catch {
          await handleDownloadImage();
        }
        setTimeout(() => setCopyFeedback(null), 3500);
      }, 'image/png');
    } catch (e) {
      console.error('Copy image failed:', e);
      await handleDownloadImage();
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Shares the bill image and text message to WhatsApp with previous balance & welcome note
   */
  const handleWhatsAppShare = async () => {
    const isWalkIn = !customer?.phone || customer.phone === '0000000000';
    const cleanPhone = isWalkIn ? '' : customer.phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const lines = safeItems
      .map((i) => `• ${i.product_name_snapshot} (${i.qty} x ₹${i.unit_selling_price}) = ₹${i.line_total}`)
      .join('\n');

    let msg = `🧾 *${profile?.shop_name || 'Smart Kirana & General Store'}*\n`;
    msg += `📍 ${profile?.address || 'Main Market'}\n`;
    msg += `📞 Contact: ${profile?.phone || ''}\n\n`;
    msg += `📄 *Tax Invoice / Bill: #${invoice.invoice_number}*\n`;
    msg += `📅 Date: ${new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date(invoice.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}\n`;
    msg += `👤 Customer: ${customer?.name || 'Walk-in Customer'}\n\n`;
    msg += `🛒 *Bill Items:*\n${lines}\n\n`;
    msg += `💰 *Bill Net Total: ₹${formatRupees(invoice.grand_total)}*\n`;
    msg += `💵 Paid: ₹${formatRupees(invoice.amount_paid_now)} (${invoice.payment_mode})\n`;

    if (customer && !isWalkIn) {
      msg += `\n📊 *Customer Khata Account Ledger:*\n`;
      msg += `• Previous Balance: ₹${formatRupees(previousBalance)}\n`;
      if (udhariAddedThisBill > 0) {
        msg += `• Added From This Bill: ₹${formatRupees(udhariAddedThisBill)}\n`;
      }
      msg += `• *Total Outstanding Balance: ₹${formatRupees(currentKhataBalance)}*\n`;
    }

    if (profile?.upi_vpa && (invoice.udhari_added > 0 || invoice.amount_paid_now === 0)) {
      const upiUrl = `upi://pay?pa=${encodeURIComponent(profile.upi_vpa)}&pn=${encodeURIComponent(
        profile.shop_name
      )}&am=${encodeURIComponent(invoice.grand_total.toFixed(2))}&cu=INR`;
      msg += `\n📲 *Pay Instantly via UPI:*\n${upiUrl}\n`;
    }

    msg += `\n🙏 *Thank you for shopping with us! Please visit again.*\n`;
    msg += `_${profile?.gst_footer_note || 'Powered by Smart Kirana POS'}_`;

    // Try Web Share API with image file if supported (Mobile phones / tablets)
    try {
      const canvas = await captureReceiptCanvas();
      if (canvas && navigator.share && navigator.canShare) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const file = new File([blob], `Bill_${invoice.invoice_number}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `Bill #${invoice.invoice_number}`,
              text: msg,
              files: [file],
            });
            return;
          }
        }
      }
    } catch (shareErr) {
      console.warn('Native share failed, falling back to WhatsApp Web URL:', shareErr);
    }

    // Desktop WhatsApp Web combo: Copy 560px thermal PNG to clipboard and open WhatsApp Web
    handleCopyImage();
    const encoded = encodeURIComponent(msg);
    const waUrl = phoneWithCountry
      ? `https://web.whatsapp.com/send?phone=${phoneWithCountry}&text=${encoded}`
      : `https://web.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, '_blank');
    setCopyFeedback('✓ Bill image copied! Paste (Ctrl+V) in WhatsApp Web');
  };

  const upiLink = profile?.upi_vpa
    ? `upi://pay?pa=${encodeURIComponent(profile.upi_vpa)}&pn=${encodeURIComponent(
        profile.shop_name
      )}&am=${encodeURIComponent(invoice.grand_total.toFixed(2))}&cu=INR`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Controls (Hidden during print) */}
        <div className="no-print bg-slate-100 dark:bg-slate-800 p-3.5 flex flex-col gap-2.5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
              <CheckCircle className="w-4 h-4" /> Bill #{invoice.invoice_number}
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={handlePrint}
              className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition shadow-xs"
              title="Print Thermal Slip"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>

            <button
              onClick={handleDownloadImage}
              disabled={isExporting}
              className="py-1.5 px-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition shadow-xs disabled:opacity-50"
              title="Save Bill as Image"
            >
              <ImageIcon className="w-3.5 h-3.5" /> Bill Image
            </button>

            <button
              onClick={handleWhatsAppShare}
              disabled={isExporting}
              className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition shadow-xs disabled:opacity-50"
              title="Share on WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" /> WhatsApp
            </button>
          </div>

          {copyFeedback && (
            <div className="p-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold text-center rounded-lg animate-in fade-in">
              {copyFeedback}
            </div>
          )}
        </div>

        {/* Printable Receipt Paper Container (Rendered to PNG by html2canvas) */}
        <div
          ref={receiptRef}
          className="p-5 font-mono text-xs text-slate-900 bg-white printable-receipt select-text"
          style={{ width: '100%', maxWidth: '360px', margin: '0 auto', color: '#0f172a', backgroundColor: '#ffffff' }}
        >
          {/* Header */}
          <div className="text-center border-b border-dashed border-slate-300 pb-3">
            <h1 className="font-extrabold text-sm uppercase tracking-wide text-slate-950">
              {profile?.shop_name || 'Smart Kirana & General Store'}
            </h1>
            <p className="text-[11px] text-slate-600">{profile?.address}</p>
            <p className="text-[11px] text-slate-600">Ph: {profile?.phone}</p>
          </div>

          {/* Invoice Meta */}
          <div className="py-2.5 border-b border-dashed border-slate-300 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span className="font-bold">Invoice: #{invoice.invoice_number}</span>
              <span>{new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Customer: {customer?.name || 'Walk-in Customer'}</span>
              <span>{new Date(invoice.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {customer?.phone && customer.phone !== '0000000000' && (
              <div className="text-slate-600">WhatsApp: +91 {customer.phone}</div>
            )}
          </div>

          {/* Itemized Table */}
          <div className="py-2 border-b border-dashed border-slate-300">
            <div className="grid grid-cols-12 font-bold text-[10px] text-slate-600 uppercase pb-1 border-b border-slate-200">
              <span className="col-span-6">Item</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate</span>
              <span className="col-span-2 text-right">Amt</span>
            </div>
            <div className="divide-y divide-slate-100 text-[11px]">
              {safeItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 py-1 items-center">
                  <span className="col-span-6 truncate font-sans text-xs font-medium text-slate-900">
                    {item.product_name_snapshot}
                  </span>
                  <span className="col-span-2 text-right">{item.qty}</span>
                  <span className="col-span-2 text-right">₹{item.unit_selling_price}</span>
                  <span className="col-span-2 text-right font-semibold">₹{formatRupees(item.line_total)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="py-2 space-y-1 text-xs border-b border-dashed border-slate-300">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>₹{formatRupees(invoice.subtotal_amount)}</span>
            </div>
            {invoice.discount_roundoff > 0 && (
              <div className="flex justify-between text-amber-700 font-medium">
                <span>Bargain Round-off:</span>
                <span>-₹{formatRupees(invoice.discount_roundoff)}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-sm text-slate-950 pt-1 border-t border-slate-200">
              <span>BILL NET TOTAL:</span>
              <span>₹{formatRupees(invoice.grand_total)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-700 pt-0.5">
              <span>Paid ({invoice.payment_mode}):</span>
              <span className="font-bold text-emerald-700">₹{formatRupees(invoice.amount_paid_now)}</span>
            </div>
            {invoice.udhari_added > 0 && (
              <div className="flex justify-between text-[11px] text-rose-700 font-bold">
                <span>Added to Udhari:</span>
                <span>+₹{formatRupees(invoice.udhari_added)}</span>
              </div>
            )}
          </div>

          {/* Customer Khata Ledger Snapshot with Previous Balance */}
          {customer && customer.id !== '0000-WALK-IN' && (
            <div className="py-2 border-b border-dashed border-slate-300 space-y-1 text-[11px] bg-slate-50 p-2.5 rounded-sm">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer Khata Statement</div>
              <div className="flex justify-between text-slate-600">
                <span>Previous Khata Balance:</span>
                <span>₹{formatRupees(previousBalance)}</span>
              </div>
              {udhariAddedThisBill > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>This Bill Udhari:</span>
                  <span>+₹{formatRupees(udhariAddedThisBill)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-slate-900 pt-1 border-t border-slate-200">
                <span>Total Outstanding Balance:</span>
                <span className={currentKhataBalance > 0 ? 'text-rose-700 font-extrabold' : 'text-emerald-700'}>
                  ₹{formatRupees(currentKhataBalance)}
                </span>
              </div>
            </div>
          )}

          {/* Dynamic UPI QR for instant payment */}
          {upiLink && (
            <div className="py-3 flex flex-col items-center border-b border-dashed border-slate-300">
              <div className="p-2 bg-white rounded-lg shadow-2xs border border-slate-200">
                <QRCodeCanvas id="receipt-upi-qr-canvas" value={upiLink} size={92} />
              </div>
              <p className="text-[10px] text-slate-600 font-medium mt-1">Scan &amp; Pay via PhonePe / GPay / Paytm / BHIM</p>
            </div>
          )}

          {/* Standard Welcome & Thank You Message */}
          <div className="text-center pt-3 text-[10px] text-slate-600 space-y-0.5">
            <p className="font-bold text-slate-800 text-[11px]">
              🙏 Thank you for shopping with us! Please visit again.
            </p>
            <p className="text-slate-500">
              {profile?.gst_footer_note || 'We appreciate your business & trust.'}
            </p>
            <p className="text-[9px] text-slate-400 mt-1">Smart Kirana POS • Digital Verified Receipt</p>
          </div>
        </div>

        {/* Modal Bottom Close */}
        <div className="no-print p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <button
            onClick={handleCopyImage}
            disabled={isExporting}
            className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
          >
            <Copy className="w-3.5 h-3.5" /> Copy Image for WhatsApp Web
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl text-xs font-semibold transition"
          >
            Done (ESC)
          </button>
        </div>
      </div>
    </div>
  );
};
