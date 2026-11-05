import React, { useState, useEffect } from 'react';
import {
  AdvanceOrder,
  AdvanceOrderItem,
  AdvanceOrderStatus,
  Product,
  ShopProfile,
  SalesInvoice,
  SaleItem,
} from '../../types';
import { HomemadeFoodService } from '../../services/homemadeFoodService';
import { formatINR, roundCurrency, roundQty } from '../../utils/math';
import {
  X,
  Calendar,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  MessageCircle,
  Clock,
  Sparkles,
  User,
  Phone,
  FileText,
} from 'lucide-react';

interface AdvanceOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  shopProfile?: ShopProfile | null;
  onOrderCreated?: (order: AdvanceOrder) => void;
  onOrderCompletedAndBilled?: (res: {
    order: AdvanceOrder;
    invoice: SalesInvoice;
    saleItems: SaleItem[];
  }) => void;
}

export const AdvanceOrdersModal: React.FC<AdvanceOrdersModalProps> = ({
  isOpen,
  onClose,
  products,
  shopProfile,
  onOrderCreated,
  onOrderCompletedAndBilled,
}) => {
  const [activeTab, setActiveTab] = useState<'new' | 'queue'>('new');
  const [orders, setOrders] = useState<AdvanceOrder[]>([]);

  // New Booking Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryDateTime, setDeliveryDateTime] = useState(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return `${tomorrow.toISOString().slice(0, 10)} 10:00 AM`;
  });
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [advanceTokenPaid, setAdvanceTokenPaid] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI'>('CASH');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedQty, setSelectedQty] = useState<number>(1);
  const [orderItems, setOrderItems] = useState<AdvanceOrderItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

  const loadOrders = async () => {
    const list = await HomemadeFoodService.getAllAdvanceOrders();
    setOrders(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadOrders();
      if (products.length > 0 && !selectedProductId) {
        setSelectedProductId(products[0].id);
      }
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, products]);

  if (!isOpen) return null;

  const totalBillAmount = roundCurrency(
    orderItems.reduce((acc, item) => acc + item.line_total, 0)
  );
  const balanceDue = roundCurrency(Math.max(0, totalBillAmount - (advanceTokenPaid || 0)));

  const handleAddItemToOrder = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;
    if (selectedQty <= 0) return;

    setOrderItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.product_id === prod.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const nextQty = roundQty(updated[existingIdx].qty + selectedQty);
        updated[existingIdx] = {
          ...updated[existingIdx],
          qty: nextQty,
          line_total: roundCurrency(nextQty * (updated[existingIdx].unit_selling_price ?? 0)),
        };
        return updated;
      }
      return [
        ...prev,
        {
          product_id: prod.id,
          product_name:
            prod.marathi_name && !prod.name.includes(prod.marathi_name)
              ? `${prod.marathi_name} (${prod.name})`
              : prod.name,
          unit_type: prod.unit_type,
          qty: roundQty(selectedQty),
          unit_selling_price: prod.selling_price,
          unit_purchase_cost: prod.purchase_price,
          line_total: roundCurrency(selectedQty * prod.selling_price),
        },
      ];
    });
    setSelectedQty(1);
  };

  const handleUpdateItemQty = (productId: string, delta: number) => {
    setOrderItems((prev) =>
      prev
        .map((item) => {
          if (item.product_id !== productId) return item;
          const step = item.unit_type === 'KG_LOOSE' || item.unit_type === 'LTR' ? 0.25 : 1;
          const nextQty = roundQty(item.qty + delta * step);
          if (nextQty <= 0) return null;
          return {
            ...item,
            qty: nextQty,
            line_total: roundCurrency(nextQty * (item.unit_selling_price ?? 0)),
          };
        })
        .filter((x): x is AdvanceOrderItem => x !== null)
    );
  };

  const handleRemoveItem = (productId: string) => {
    setOrderItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const handleCreateAdvanceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!customerName.trim()) {
      setErrorMsg('Customer Name is required');
      return;
    }
    if (orderItems.length === 0) {
      setErrorMsg('Please add at least one item to the Advance Order');
      return;
    }

    setIsSaving(true);
    try {
      const created = await HomemadeFoodService.createAdvanceOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryDateTime: deliveryDateTime.trim() || new Date().toISOString().slice(0, 10),
        items: orderItems,
        specialInstructions: specialInstructions.trim(),
        advanceTokenPaid: advanceTokenPaid || 0,
        paymentMode,
      });

      await loadOrders();
      setCustomerName('');
      setCustomerPhone('');
      setSpecialInstructions('');
      setAdvanceTokenPaid(0);
      setOrderItems([]);
      setSuccessMsg(
        `✅ Advance Order ${created.order_number} booked! Balance Due on Delivery: ${formatINR(created.balance_due)}`
      );
      setActiveTab('queue');
      if (onOrderCreated) onOrderCreated(created);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save Advance Order');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (orderId: string, status: AdvanceOrderStatus) => {
    await HomemadeFoodService.updateAdvanceOrderStatus(orderId, status);
    await loadOrders();
  };

  const handleCompleteAndBill = async (order: AdvanceOrder) => {
    setProcessingOrderId(order.id);
    setErrorMsg(null);
    try {
      const res = await HomemadeFoodService.completeAdvanceOrderAndBill(
        order.id,
        order.payment_mode || 'CASH'
      );
      await loadOrders();
      setSuccessMsg(
        `🎉 Order ${order.order_number} marked DELIVERED & billed as Invoice ${res.invoice.invoice_number} (${formatINR(res.invoice.grand_total)})!`
      );
      if (onOrderCompletedAndBilled) {
        onOrderCompletedAndBilled(res);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate final bill');
    } finally {
      setProcessingOrderId(null);
    }
  };

  const pendingOrdersCount = orders.filter(
    (o) => o.status !== 'DELIVERED_BILLED' && o.status !== 'CANCELLED'
  ).length;

  return (
    <div
      data-testid="advance-orders-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2">
                <span>📅 Advance Orders &amp; Festival Pre-Booking</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-bold uppercase tracking-wider">
                  Gruh Udyog / POS
                </span>
              </h2>
              <p className="text-xs text-amber-100">
                Book Ganesh Chaturthi Modak, Diwali Faral / Laddu boxes &amp; morning Ghavane/Bhakri batches with Advance Token &amp; WhatsApp slips
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="px-6 pt-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="advance-tab-new"
              onClick={() => setActiveTab('new')}
              className={`px-4 py-2 rounded-t-xl text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'new'
                  ? 'border-amber-600 text-amber-700 dark:text-amber-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Book New Advance Order</span>
            </button>

            <button
              type="button"
              data-testid="advance-tab-queue"
              onClick={() => setActiveTab('queue')}
              className={`px-4 py-2 rounded-t-xl text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'queue'
                  ? 'border-amber-600 text-amber-700 dark:text-amber-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Active Orders Queue ({orders.length})</span>
              {pendingOrdersCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
                  {pendingOrdersCount} Pending
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {errorMsg && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div
            data-testid="advance-order-success-banner"
            className="mx-6 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'new' ? (
            <form onSubmit={handleCreateAdvanceOrder} className="space-y-4">
              {/* Customer & Delivery Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-amber-600" />
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="adv-customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Sau. Sunita Sawant"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-amber-600" />
                    WhatsApp Phone (10 Digits) *
                  </label>
                  <input
                    type="tel"
                    required
                    data-testid="adv-customer-phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    Delivery Date &amp; Time *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="adv-delivery-datetime"
                    value={deliveryDateTime}
                    onChange={(e) => setDeliveryDateTime(e.target.value)}
                    placeholder="2026-09-14 08:30 AM (Ganesh Chaturthi)"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Add Item Selector */}
              <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-slate-800/60 border border-amber-200 dark:border-slate-700 space-y-3">
                <div className="text-xs font-bold uppercase text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Select Items &amp; Quantities for Pre-Order</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    data-testid="adv-product-select"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.marathi_name ? `${p.marathi_name} (${p.name})` : p.name} — {formatINR(p.selling_price)}/{p.unit_type}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      data-testid="adv-product-qty"
                      value={selectedQty}
                      onChange={(e) => setSelectedQty(parseFloat(e.target.value) || 1)}
                      className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-center bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      data-testid="adv-add-item-btn"
                      onClick={handleAddItemToOrder}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>

                {/* Order Items Table */}
                {orderItems.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase font-bold">
                        <tr>
                          <th className="p-2.5">Item</th>
                          <th className="p-2.5 text-center">Qty</th>
                          <th className="p-2.5 text-right">Rate</th>
                          <th className="p-2.5 text-right">Total</th>
                          <th className="p-2.5 text-center">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {orderItems.map((item) => (
                          <tr key={item.product_id}>
                            <td className="p-2.5 font-semibold text-slate-900 dark:text-white">
                              {item.product_name}
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQty(item.product_id, -1)}
                                  className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="font-bold min-w-[44px]">
                                  {item.qty} {item.unit_type}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQty(item.product_id, 1)}
                                  className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            <td className="p-2.5 text-right">{formatINR(item.unit_selling_price ?? 0)}</td>
                            <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white">
                              {formatINR(item.line_total)}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.product_id)}
                                className="p-1 text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Special Instructions & Advance Token Paid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-amber-600" />
                    Special Instructions
                  </label>
                  <input
                    type="text"
                    data-testid="adv-special-instructions"
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder='e.g. "Less sugar in Besan Laddu", "Pack in 250g boxes"'
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Advance Token Paid (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    data-testid="adv-token-paid-input"
                    value={advanceTokenPaid || ''}
                    onChange={(e) => setAdvanceTokenPaid(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as 'CASH' | 'UPI')}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="CASH">💵 Cash Advance / Delivery</option>
                    <option value="UPI">📱 UPI QR Advance / Delivery</option>
                  </select>
                </div>
              </div>

              {/* Summary Footer */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <div className="text-[10px] uppercase text-slate-400 font-bold">Total Order Bill</div>
                    <div className="text-lg font-extrabold text-white" data-testid="adv-total-bill">
                      {formatINR(totalBillAmount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-emerald-400 font-bold">Advance Token Paid</div>
                    <div className="text-lg font-extrabold text-emerald-400">
                      {formatINR(advanceTokenPaid || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-amber-400 font-bold">Balance Due on Delivery</div>
                    <div className="text-lg font-extrabold text-amber-300" data-testid="adv-balance-due">
                      {formatINR(balanceDue)}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  data-testid="adv-submit-booking-btn"
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-lg transition active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? 'Saving Booking...' : '📅 Confirm & Book Advance Order'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3" data-testid="advance-orders-queue-list">
              {orders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl text-xs">
                  No Advance Orders booked yet. Click "+ Book New Advance Order" to schedule a festival or fresh batch order.
                </div>
              ) : (
                orders.map((order) => {
                  const whatsappUrl = HomemadeFoodService.generateAdvanceOrderWhatsAppUrl(
                    order,
                    shopProfile
                  );
                  const isBilled = order.status === 'DELIVERED_BILLED';

                  return (
                    <div
                      key={order.id}
                      data-testid={`advance-order-card-${order.id}`}
                      className={`p-4 rounded-2xl border transition space-y-3 ${
                        isBilled
                          ? 'bg-emerald-50/30 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-900/60'
                          : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/80 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                              {order.order_number}
                            </span>
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {order.customer_name}
                            </span>
                            <span className="text-xs text-slate-500">📞 {order.customer_phone}</span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                                isBilled
                                  ? 'bg-emerald-600 text-white'
                                  : order.status === 'READY'
                                  ? 'bg-blue-600 text-white'
                                  : order.status === 'PREPARING'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            🗓️ Delivery: <strong>{order.delivery_date_time}</strong>
                            {order.special_instructions && (
                              <span className="ml-3 text-amber-700 dark:text-amber-300 font-semibold">
                                • 📝 "{order.special_instructions}"
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-slate-500">
                            Total: <strong className="text-slate-900 dark:text-white">{formatINR(order.total_amount)}</strong>
                            {' • '}Token Paid: <strong className="text-emerald-600">{formatINR(order.advance_token_paid)}</strong>
                          </div>
                          <div className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                            Balance Due: {formatINR(order.balance_due)}
                          </div>
                        </div>
                      </div>

                      {/* Items summary */}
                      <div className="flex flex-wrap gap-1.5">
                        {order.items.map((item, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                          >
                            {item.product_name}: <strong>{item.qty} {item.unit_type}</strong> ({formatINR(item.line_total)})
                          </span>
                        ))}
                      </div>

                      {/* Actions Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`adv-whatsapp-btn-${order.id}`}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>📲 WhatsApp Order Confirmation Slip</span>
                          </a>

                          {!isBilled && (
                            <select
                              value={order.status}
                              onChange={(e) =>
                                handleStatusChange(order.id, e.target.value as AdvanceOrderStatus)
                              }
                              className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                            >
                              <option value="PENDING">⏳ Pending</option>
                              <option value="PREPARING">🍳 Preparing Batch</option>
                              <option value="READY">📦 Ready for Pickup</option>
                              <option value="CANCELLED">❌ Cancelled</option>
                            </select>
                          )}
                        </div>

                        {!isBilled && order.status !== 'CANCELLED' ? (
                          <button
                            type="button"
                            disabled={processingOrderId === order.id}
                            data-testid={`adv-complete-bill-btn-${order.id}`}
                            onClick={() => handleCompleteAndBill(order)}
                            className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {processingOrderId === order.id
                                ? 'Generating Bill...'
                                : '✅ Mark Delivered & Generate Final Bill'}
                            </span>
                          </button>
                        ) : (
                          order.converted_invoice_id && (
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Final Bill Generated &amp; Stock Deducted</span>
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
