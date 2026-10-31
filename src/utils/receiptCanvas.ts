import { SalesInvoice, SaleItem, ShopProfile, Customer } from '../types';
import { formatRupees } from './math';

export interface GenerateReceiptCanvasOptions {
  invoice: SalesInvoice;
  items: SaleItem[];
  profile: ShopProfile | null;
  customer?: Customer | null;
  previousBalance: number;
  currentKhataBalance: number;
  udhariAddedThisBill: number;
  qrCanvasElement?: HTMLCanvasElement | null;
}

/**
 * Enterprise Native HTML5 2D Canvas Receipt Generator for Smart Kirana POS.
 * 100% immune to Tailwind v4 oklch CSS color crashes, DOM clipping, and font issues.
 * Generates ultra crisp, high-res thermal receipt PNG images.
 */
export const generateReceiptCanvas = (options: GenerateReceiptCanvasOptions): HTMLCanvasElement => {
  const {
    invoice,
    items,
    profile,
    customer,
    previousBalance,
    currentKhataBalance,
    udhariAddedThisBill,
    qrCanvasElement,
  } = options;

  const width = 560; // 560px width is ideal for WhatsApp image preview & mobile screens
  const padding = 28;
  const contentWidth = width - padding * 2;

  // Calculate dynamic canvas height based on items and sections
  let estimatedHeight = 50; // top padding
  estimatedHeight += 120; // store header
  estimatedHeight += 90; // invoice & customer details
  estimatedHeight += 35; // table header
  estimatedHeight += Math.max(1, items.length) * 28 + 15; // items rows
  estimatedHeight += 135; // subtotal, roundoff, net total, paid
  if (invoice.udhari_added > 0) {
    estimatedHeight += 25;
  }
  if (customer && customer.id !== '0000-WALK-IN') {
    estimatedHeight += 115; // customer khata ledger box
  }
  if (qrCanvasElement && profile?.upi_vpa) {
    estimatedHeight += 175; // dynamic upi qr code
  }
  estimatedHeight += 110; // thank you note & footer
  estimatedHeight += padding; // bottom padding

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = estimatedHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1. Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, estimatedHeight);

  // Outer border with subtle neat padding
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(8, 8, width - 16, estimatedHeight - 16);

  let y = padding + 15;

  const drawDashedLine = (currentY: number) => {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padding, currentY);
    ctx.lineTo(width - padding, currentY);
    ctx.stroke();
    ctx.restore();
  };

  // 2. STORE HEADER
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  const shopTitle = (profile?.shop_name || 'SMART KIRANA & GENERAL STORE').toUpperCase();
  ctx.fillText(shopTitle, width / 2, y);
  y += 24;

  ctx.fillStyle = '#475569';
  ctx.font = '13px system-ui, -apple-system, sans-serif';
  if (profile?.address) {
    ctx.fillText(profile.address, width / 2, y);
    y += 18;
  }
  if (profile?.phone) {
    ctx.fillText(`Phone: +91 ${profile.phone}`, width / 2, y);
    y += 20;
  }

  y += 8;
  drawDashedLine(y);
  y += 22;

  // 3. INVOICE META
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px "Courier New", monospace';
  ctx.fillText(`Invoice: #${invoice.invoice_number}`, padding, y);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.font = '13px "Courier New", monospace';
  const billDate = new Date(invoice.created_at);
  const dateStr = billDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = billDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  ctx.fillText(`${dateStr} ${timeStr}`, width - padding, y);
  y += 20;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#1e293b';
  ctx.font = '13px "Courier New", monospace';
  ctx.fillText(`Customer: ${customer?.name || 'Walk-in Customer'}`, padding, y);
  if (customer?.phone && customer.phone !== '0000000000') {
    ctx.textAlign = 'right';
    ctx.fillText(`WhatsApp: +91 ${customer.phone}`, width - padding, y);
  }
  y += 22;

  drawDashedLine(y);
  y += 20;

  // 4. ITEM TABLE HEADER
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ITEM', padding, y);
  ctx.textAlign = 'right';
  ctx.fillText('QTY', padding + 260, y);
  ctx.fillText('RATE', padding + 370, y);
  ctx.fillText('AMOUNT', width - padding, y);
  y += 10;

  // Solid line below header
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  y += 18;

  // 5. ITEM ROWS
  ctx.font = '13px "Courier New", monospace';
  for (const item of items) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    const name =
      item.product_name_snapshot.length > 22
        ? item.product_name_snapshot.slice(0, 20) + '..'
        : item.product_name_snapshot;
    ctx.fillText(name, padding, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.fillText(String(item.qty), padding + 260, y);
    ctx.fillText(`₹${item.unit_selling_price}`, padding + 370, y);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillText(`₹${formatRupees(item.line_total)}`, width - padding, y);
    ctx.font = '13px "Courier New", monospace';
    y += 26;
  }

  y += 6;
  drawDashedLine(y);
  y += 22;

  // 6. TOTALS
  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = '13px "Courier New", monospace';
  ctx.fillText('Subtotal:', padding, y);
  ctx.textAlign = 'right';
  ctx.fillText(`₹${formatRupees(invoice.subtotal_amount)}`, width - padding, y);
  y += 20;

  if (invoice.discount_roundoff > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b45309';
    ctx.fillText('Bargain Round-off:', padding, y);
    ctx.textAlign = 'right';
    ctx.fillText(`-₹${formatRupees(invoice.discount_roundoff)}`, width - padding, y);
    y += 20;
  }

  // NET TOTAL
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('BILL NET TOTAL:', padding, y);
  ctx.textAlign = 'right';
  ctx.fillText(`₹${formatRupees(invoice.grand_total)}`, width - padding, y);
  y += 24;

  ctx.font = '13px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Paid (${invoice.payment_mode}):`, padding, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#15803d';
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillText(`₹${formatRupees(invoice.amount_paid_now)}`, width - padding, y);
  y += 20;

  if (invoice.udhari_added > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#be123c';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillText('Added to Udhari:', padding, y);
    ctx.textAlign = 'right';
    ctx.fillText(`+₹${formatRupees(invoice.udhari_added)}`, width - padding, y);
    y += 22;
  }

  // 7. CUSTOMER KHATA STATEMENT BOX
  if (customer && customer.id !== '0000-WALK-IN') {
    y += 4;
    drawDashedLine(y);
    y += 18;

    const boxHeight = udhariAddedThisBill > 0 ? 94 : 76;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(padding - 4, y - 4, contentWidth + 8, boxHeight);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padding - 4, y - 4, contentWidth + 8, boxHeight);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillText('CUSTOMER KHATA STATEMENT', padding + 8, y + 12);

    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = '#475569';
    ctx.fillText('Previous Khata Balance:', padding + 8, y + 32);
    ctx.textAlign = 'right';
    ctx.fillText(`₹${formatRupees(previousBalance)}`, width - padding - 8, y + 32);

    if (udhariAddedThisBill > 0) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e11d48';
      ctx.fillText('This Bill Udhari:', padding + 8, y + 50);
      ctx.textAlign = 'right';
      ctx.fillText(`+₹${formatRupees(udhariAddedThisBill)}`, width - padding - 8, y + 50);
      y += 18;
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('Total Outstanding Balance:', padding + 8, y + 52);
    ctx.textAlign = 'right';
    ctx.fillStyle = currentKhataBalance > 0 ? '#b91c1c' : '#15803d';
    ctx.fillText(`₹${formatRupees(currentKhataBalance)}`, width - padding - 8, y + 52);

    y += 76;
  }

  // 8. DYNAMIC UPI QR CODE
  if (qrCanvasElement && profile?.upi_vpa) {
    drawDashedLine(y);
    y += 18;

    const qrSize = 105;
    const qrX = (width - qrSize) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 6, y - 6, qrSize + 12, qrSize + 12);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(qrX - 6, y - 6, qrSize + 12, qrSize + 12);

    try {
      ctx.drawImage(qrCanvasElement, qrX, y, qrSize, qrSize);
    } catch (qrErr) {
      console.warn('Could not render QR canvas to receipt:', qrErr);
    }
    y += qrSize + 16;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText('Scan & Pay via PhonePe / GPay / Paytm / BHIM', width / 2, y);
    y += 20;
  }

  // 9. THANK YOU NOTE & FOOTER
  drawDashedLine(y);
  y += 24;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('🙏 Thank you for shopping with us! Please visit again.', width / 2, y);
  y += 18;

  ctx.fillStyle = '#64748b';
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillText(profile?.gst_footer_note || 'We appreciate your business & trust.', width / 2, y);
  y += 16;

  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillText('Smart Kirana POS • Digital Verified Receipt', width / 2, y);

  return canvas;
};
