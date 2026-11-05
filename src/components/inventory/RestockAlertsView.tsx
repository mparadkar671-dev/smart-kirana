import React, { useState, useEffect } from 'react';
import { Product, ShopProfile, Wholesaler } from '../../types';
import { InventoryService } from '../../services/inventoryService';
import { WholesalerService } from '../../services/wholesalerService';
import { formatINR, roundQty } from '../../utils/math';
import {
  AlertTriangle,
  Clock,
  ShoppingCart,
  MessageSquare,
  Download,
  CheckCircle,
  Truck,
  Plus,
  Edit2,
  Trash2,
  Phone,
  Send,
  CheckSquare,
  Square,
  X,
  Building2,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface RestockAlertsViewProps {
  products: Product[];
  shopProfile?: ShopProfile | null;
  onRestockClick?: (product: Product) => void;
  onRefresh?: () => void;
}

export const formatStockQty = (qty: number, unitType: Product['unit_type']): string => {
  const num = Number(qty || 0);
  if (unitType === 'KG_LOOSE' || unitType === 'LTR') {
    const unitLabel = unitType === 'KG_LOOSE' ? 'kg' : 'L';
    // Show up to 3 decimal places for fractional weights like 0.500 kg, 5.250 kg, 3.500 kg
    const hasFraction = Math.abs(num - Math.round(num)) > 0.0001;
    return `${hasFraction ? num.toFixed(3) : num} ${unitLabel}`;
  }
  const unitMap: Record<string, string> = {
    PACKET: 'pkt',
    PIECE: 'pc',
    BOX: 'box',
  };
  return `${roundQty(num)} ${unitMap[unitType] || unitType}`;
};

export const RestockAlertsView: React.FC<RestockAlertsViewProps> = ({
  products,
  shopProfile,
  onRestockClick,
  onRefresh,
}) => {
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingWholesaler, setEditingWholesaler] = useState<Wholesaler | null>(null);

  // Wholesaler form state
  const [wsName, setWsName] = useState('');
  const [wsAgency, setWsAgency] = useState('');
  const [wsPhone, setWsPhone] = useState('');
  const [wsVisitDay, setWsVisitDay] = useState('Monday');
  const [wsGstin, setWsGstin] = useState('');
  const [wsError, setWsError] = useState<string | null>(null);

  // Custom / Specific Product Order Modal State
  const [customOrderWholesaler, setCustomOrderWholesaler] = useState<Wholesaler | null>(null);
  const [selectedOrderProductIds, setSelectedOrderProductIds] = useState<Set<string>>(new Set());
  const [customOrderQtys, setCustomOrderQtys] = useState<Record<string, number>>({});
  const [customManualNote, setCustomManualNote] = useState('');

  const lowStockItems = InventoryService.filterLowStock(products);
  const expiringItems = InventoryService.filterExpiringSoon(products, 15);
  const shopName = shopProfile?.shop_name || 'Smart Kirana Store';

  const loadWholesalers = async () => {
    const list = await WholesalerService.getAllWholesalers();
    setWholesalers(list);
  };

  useEffect(() => {
    loadWholesalers();
  }, [products]);

  const handleOpenAddWholesaler = () => {
    setEditingWholesaler(null);
    setWsName('');
    setWsAgency('');
    setWsPhone('');
    setWsVisitDay('Monday');
    setWsGstin('');
    setWsError(null);
    setIsAddEditOpen(true);
  };

  const handleOpenEditWholesaler = (ws: Wholesaler) => {
    setEditingWholesaler(ws);
    setWsName(ws.name);
    setWsAgency(ws.agency_or_brand || '');
    setWsPhone(ws.phone);
    setWsVisitDay(ws.visit_day || 'Monday');
    setWsGstin(ws.gstin || '');
    setWsError(null);
    setIsAddEditOpen(true);
  };

  const handleSaveWholesaler = async (e: React.FormEvent) => {
    e.preventDefault();
    setWsError(null);
    try {
      if (editingWholesaler) {
        await WholesalerService.updateWholesaler(editingWholesaler.id, {
          name: wsName,
          agency_or_brand: wsAgency,
          phone: wsPhone,
          visit_day: wsVisitDay,
          gstin: wsGstin,
        });
      } else {
        await WholesalerService.createWholesaler({
          name: wsName,
          agency_or_brand: wsAgency,
          phone: wsPhone,
          visit_day: wsVisitDay,
          gstin: wsGstin,
        });
      }
      setIsAddEditOpen(false);
      await loadWholesalers();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setWsError(err.message || 'Failed to save wholesaler');
    }
  };

  const handleDeleteWholesaler = async (ws: Wholesaler) => {
    if (!window.confirm(`Delete wholesaler "${ws.name}"? Assigned products will become unassigned.`)) {
      return;
    }
    await WholesalerService.deleteWholesaler(ws.id);
    await loadWholesalers();
    if (onRefresh) onRefresh();
  };

  // Send direct WhatsApp Order for a Wholesaler's low-stock items (or all assigned items if none are low stock)
  const handleSendWholesalerWhatsAppOrder = (ws: Wholesaler, itemsToOrder: Product[]) => {
    const targetItems =
      itemsToOrder.length > 0
        ? itemsToOrder
        : products.filter(
            (p) =>
              p.wholesaler_id === ws.id ||
              (p.last_supplier_name && p.last_supplier_name.toLowerCase() === ws.name.toLowerCase())
          );

    const url = WholesalerService.getWhatsAppShareUrl(ws, targetItems, shopName);
    window.open(url, '_blank');
  };

  // Open Custom Order / Product Selector Modal for a Wholesaler
  const handleOpenCustomOrderModal = (ws: Wholesaler) => {
    const wsProducts = products.filter(
      (p) =>
        p.wholesaler_id === ws.id ||
        (p.last_supplier_name && p.last_supplier_name.toLowerCase() === ws.name.toLowerCase())
    );
    const lowIds = new Set(
      wsProducts.filter((p) => p.current_stock <= p.low_stock_threshold).map((p) => p.id)
    );
    // If no low stock items, pre-select all assigned products
    const initialSet = lowIds.size > 0 ? lowIds : new Set(wsProducts.map((p) => p.id));
    const initialQtys: Record<string, number> = {};
    wsProducts.forEach((p) => {
      initialQtys[p.id] = WholesalerService.getRecommendedOrderQty(p);
    });
    setSelectedOrderProductIds(initialSet);
    setCustomOrderQtys(initialQtys);
    setCustomManualNote('');
    setCustomOrderWholesaler(ws);
  };

  const handleSendCustomOrderWhatsApp = () => {
    if (!customOrderWholesaler) return;
    const chosenProducts = products.filter((p) => selectedOrderProductIds.has(p.id));
    if (chosenProducts.length === 0 && customManualNote.trim()) {
      const url = WholesalerService.getCustomWhatsAppUrl(
        customOrderWholesaler,
        `Namaste *${customOrderWholesaler.name}* ji, 🙏\n*Purchase Order from ${shopName}*\n${customManualNote.trim()}`
      );
      window.open(url, '_blank');
      setCustomOrderWholesaler(null);
      return;
    }

    let orderText = WholesalerService.formatPurchaseOrderText(
      customOrderWholesaler,
      chosenProducts,
      shopName,
      customOrderQtys
    );
    if (customManualNote.trim()) {
      orderText += `\nNote: ${customManualNote.trim()}`;
    }
    const url = WholesalerService.getCustomWhatsAppUrl(customOrderWholesaler, orderText);
    window.open(url, '_blank');
    setCustomOrderWholesaler(null);
  };

  const handleAssignProductWholesaler = async (product: Product, wholesalerId: string) => {
    const ws = wholesalers.find((w) => w.id === wholesalerId) || null;
    await InventoryService.updateProduct(product.id, {
      wholesaler_id: ws ? ws.id : null,
      last_supplier_name: ws ? ws.name : '',
      supplier_phone: ws ? ws.phone : '',
    });
    if (onRefresh) onRefresh();
  };

  const handleWhatsAppExport = () => {
    if (lowStockItems.length === 0) return;
    const encoded = InventoryService.generateWholesalerWhatsAppText(lowStockItems, shopName);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const handlePdfExport = () => {
    if (lowStockItems.length === 0) return;

    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    doc.setFontSize(16);
    doc.text(shopName, 14, 15);
    doc.setFontSize(11);
    doc.text('Wholesaler Market Purchase & Restock Order', 14, 22);
    doc.setFontSize(9);
    doc.text(`Generated on: ${dateStr} | Total Items to Procure: ${lowStockItems.length}`, 14, 28);

    const tableRows = lowStockItems.map((item, index) => {
      const suggestedOrder = WholesalerService.getRecommendedOrderQty(item);
      return [
        (index + 1).toString(),
        item.name,
        `${item.current_stock} ${item.unit_type}`,
        `${suggestedOrder} ${item.unit_type}`,
        `Rs. ${item.purchase_price.toFixed(2)}`,
        item.last_supplier_name || 'Mandi Wholesaler',
      ];
    });

    autoTable(doc, {
      startY: 33,
      head: [['#', 'Item Name', 'Current Stock', 'Suggested Order', 'Last Wholesale Rate', 'Supplier']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
      styles: { fontSize: 8.5 },
    });

    doc.save(`Wholesaler_Restock_Order_${dateStr.replace(/\s+/g, '_')}.pdf`);
  };

  // Group low-stock products by wholesaler
  const unassignedLowStockItems = lowStockItems.filter((item) => {
    if (item.wholesaler_id && wholesalers.some((w) => w.id === item.wholesaler_id)) {
      return false;
    }
    if (
      item.last_supplier_name &&
      wholesalers.some((w) => w.name.toLowerCase() === item.last_supplier_name.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6" data-testid="wholesalers-and-reorder-view">
      {/* Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Registered Wholesalers Card */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-5 flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-blue-800 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
              <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>🚛 Wholesalers &amp; Distributors</span>
            </div>
            <p className="text-2xl font-extrabold text-blue-900 dark:text-blue-200" data-testid="wholesaler-count">
              {wholesalers.length} Suppliers
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400">1-Click Direct WhatsApp PO Ready</p>
          </div>
          <button
            type="button"
            data-testid="open-add-wholesaler-btn"
            onClick={handleOpenAddWholesaler}
            className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Wholesaler</span>
          </button>
        </div>

        {/* Low Stock Alert Card */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-5 flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Low Stock Restock Alerts</span>
            </div>
            <p className="text-2xl font-extrabold text-amber-900 dark:text-amber-200" data-testid="low-stock-count">
              {lowStockItems.length} Products
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Stock &le; alert threshold, reorder needed</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>

        {/* Expiry Warning Card (< 15 days) */}
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-2xl p-5 flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-red-800 dark:text-red-400 text-xs font-bold uppercase tracking-wider">
              <Clock className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span>Expiry Risk (&lt; 15 Days)</span>
            </div>
            <p className="text-2xl font-extrabold text-red-900 dark:text-red-200" data-testid="expiring-count">
              {expiringItems.length} Products
            </p>
            <p className="text-xs text-red-700 dark:text-red-400">Near-expiry items requiring urgent clearance</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Add / Edit Wholesaler Inline Modal */}
      {isAddEditOpen && (
        <div className="bg-white dark:bg-slate-900 border-2 border-blue-500 dark:border-blue-700 rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{editingWholesaler ? `Edit Wholesaler: ${editingWholesaler.name}` : 'Add New Wholesaler / Distributor'}</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsAddEditOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {wsError && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-600 dark:text-red-300">
              {wsError}
            </div>
          )}

          <form onSubmit={handleSaveWholesaler} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Wholesaler / Person Name *
              </label>
              <input
                type="text"
                required
                data-testid="ws-form-name"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="e.g. Gupta Traders"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Agency / Brand Supplied
              </label>
              <input
                type="text"
                data-testid="ws-form-agency"
                value={wsAgency}
                onChange={(e) => setWsAgency(e.target.value)}
                placeholder="e.g. Parle / Britannia / Grains"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                WhatsApp Contact No. (10-digit) *
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                data-testid="ws-form-phone"
                value={wsPhone}
                onChange={(e) => setWsPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9820112233"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-xs font-mono"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                data-testid="ws-form-submit"
                className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
              >
                {editingWholesaler ? 'Update Wholesaler' : 'Save Wholesaler'}
              </button>
              <button
                type="button"
                onClick={() => setIsAddEditOpen(false)}
                className="py-2 px-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          SMART SUPPLIER-WISE WHOLESALER DIRECTORY & DIRECT WHATSAPP ORDER CARDS
          ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>🚛 Wholesalers &amp; Supplier-Wise Direct WhatsApp Purchase Orders</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Low-stock items are automatically grouped by their assigned wholesaler for 1-click WhatsApp ordering
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenAddWholesaler}
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New Wholesaler</span>
          </button>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="wholesaler-cards-grid">
          {wholesalers.map((ws) => {
            const assignedProducts = products.filter(
              (p) =>
                p.wholesaler_id === ws.id ||
                (p.last_supplier_name && p.last_supplier_name.toLowerCase() === ws.name.toLowerCase())
            );
            const wsLowStock = assignedProducts.filter((p) => p.current_stock <= p.low_stock_threshold);

            return (
              <div
                key={ws.id}
                data-testid={`wholesaler-card-${ws.id}`}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-4 flex flex-col justify-between space-y-3 hover:border-emerald-400 dark:hover:border-emerald-700 transition"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                        <span>{ws.name}</span>
                      </h4>
                      {ws.agency_or_brand && (
                        <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" />
                          <span>{ws.agency_or_brand}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditWholesaler(ws)}
                        title="Edit Wholesaler"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-800 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWholesaler(ws)}
                        title="Delete Wholesaler"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white dark:hover:bg-slate-800 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <span className="font-mono flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      +91 {ws.phone}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        wsLowStock.length > 0
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {wsLowStock.length} Low Stock / {assignedProducts.length} Items
                    </span>
                  </div>

                  {/* Low stock item preview list */}
                  {wsLowStock.length > 0 ? (
                    <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                      {wsLowStock.map((item) => {
                        const recQty = WholesalerService.getRecommendedOrderQty(item);
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-[11px] bg-amber-50/70 dark:bg-amber-950/30 px-2.5 py-1 rounded-lg border border-amber-200/60 dark:border-amber-800/50"
                          >
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                              {item.name}
                            </span>
                            <span className="font-bold text-amber-800 dark:text-amber-300">
                              Order: {recQty} { WholesalerService.formatUnitLabel(item.unit_type) }
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 italic py-1">
                      {assignedProducts.length > 0
                        ? 'All assigned items are currently above threshold.'
                        : 'No products assigned yet. Assign in Add/Edit Product.'}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-col gap-1.5">
                  <button
                    type="button"
                    data-testid={`send-whatsapp-order-${ws.id}`}
                    onClick={() => handleSendWholesalerWhatsAppOrder(ws, wsLowStock)}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>📲 Send Order List on WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    data-testid={`custom-order-btn-${ws.id}`}
                    onClick={() => handleOpenCustomOrderModal(ws)}
                    className="w-full py-1.5 px-3 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-semibold transition"
                  >
                    Select Specific Items / Custom Order
                  </button>
                </div>
              </div>
            );
          })}

          {/* Unassigned Wholesaler Card */}
          {unassignedLowStockItems.length > 0 && (
            <div
              data-testid="wholesaler-card-unassigned"
              className="rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20 p-4 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-amber-900 dark:text-amber-300 text-sm">
                    Unassigned Wholesaler
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                    {unassignedLowStockItems.length} Low Stock
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-400">
                  These low-stock products don&apos;t have a specific wholesaler linked yet. Assign them in the table below or export a general WhatsApp list.
                </p>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {unassignedLowStockItems.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-[11px] bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-amber-200/60 dark:border-amber-800/50"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                        {item.name}
                      </span>
                      <span className="font-mono text-amber-700 dark:text-amber-400">
                        Stk: {formatStockQty(item.current_stock, item.unit_type)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleWhatsAppExport}
                className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
              >
                <MessageSquare className="w-4 h-4" />
                <span>📲 Share Unassigned List on WhatsApp</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Custom Order / Product Selector Modal */}
      {customOrderWholesaler && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-4 bg-emerald-700 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">
                  📲 Custom Purchase Order — {customOrderWholesaler.name}
                </h3>
                <p className="text-[11px] text-emerald-100">
                  WhatsApp: +91 {customOrderWholesaler.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomOrderWholesaler(null)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Select products &amp; customize order quantities:
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2">
                {products
                  .filter(
                    (p) =>
                      p.wholesaler_id === customOrderWholesaler.id ||
                      (p.last_supplier_name &&
                        p.last_supplier_name.toLowerCase() === customOrderWholesaler.name.toLowerCase())
                  )
                  .map((item) => {
                    const isChecked = selectedOrderProductIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs"
                      >
                        <label className="flex items-center gap-2 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = new Set(selectedOrderProductIds);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              setSelectedOrderProductIds(next);
                            }}
                            className="rounded text-emerald-600"
                          />
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {item.name}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              Stock: {formatStockQty(item.current_stock, item.unit_type)} (Alert &le;{' '}
                              {item.low_stock_threshold})
                            </span>
                          </div>
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0.25"
                            step="any"
                            value={customOrderQtys[item.id] ?? WholesalerService.getRecommendedOrderQty(item)}
                            onChange={(e) =>
                              setCustomOrderQtys({
                                ...customOrderQtys,
                                [item.id]: Number(e.target.value),
                              })
                            }
                            className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-right font-bold text-xs"
                          />
                          <span className="text-[10px] text-slate-500 w-7">
                            {WholesalerService.formatUnitLabel(item.unit_type)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Additional Custom Note / Manual Items (Optional)
                </label>
                <textarea
                  rows={2}
                  value={customManualNote}
                  onChange={(e) => setCustomManualNote(e.target.value)}
                  placeholder="e.g. Also send 2 bags of new harvest Basmati Rice..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCustomOrderWholesaler(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendCustomOrderWhatsApp}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>📲 Send Purchase Order on WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wholesaler Purchase Restock Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Wholesaler Market Purchase List (Low Stock Items)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generated automatically when items fall to or below their alert threshold (supports fractional kg like 0.500 kg)
            </p>
          </div>

          {lowStockItems.length > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleWhatsAppExport}
                className="flex-1 sm:flex-initial px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
              >
                <MessageSquare className="w-4 h-4" />
                <span>WhatsApp Order List</span>
              </button>
              <button
                onClick={handlePdfExport}
                className="flex-1 sm:flex-initial px-3.5 py-2 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
              >
                <Download className="w-4 h-4" />
                <span>Export PDF</span>
              </button>
            </div>
          )}
        </div>

        {lowStockItems.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">All Inventory Well Stocked!</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              No products are currently below their low stock threshold.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="restock-table">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3 text-right">Current Stock</th>
                  <th className="p-3 text-right">Min Threshold</th>
                  <th className="p-3 text-right">Suggested Order</th>
                  <th className="p-3 text-right">Last Cost (₹)</th>
                  <th className="p-3">Wholesaler / Supplier</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lowStockItems.map((item) => {
                  const suggestedOrder = WholesalerService.getRecommendedOrderQty(item);
                  const assignedWs = wholesalers.find(
                    (w) =>
                      w.id === item.wholesaler_id ||
                      (item.last_supplier_name && w.name.toLowerCase() === item.last_supplier_name.toLowerCase())
                  );

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                      <td className="p-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</div>
                        <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                          {item.short_code}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-amber-700 dark:text-amber-400">
                        {formatStockQty(item.current_stock, item.unit_type)}
                      </td>
                      <td className="p-3 text-right text-slate-500 dark:text-slate-400 text-xs">
                        {formatStockQty(item.low_stock_threshold, item.unit_type)}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-900 dark:text-blue-300 text-sm">
                        +{suggestedOrder} {item.unit_type}
                      </td>
                      <td className="p-3 text-right font-medium text-slate-700 dark:text-slate-300">
                        {formatINR(item.purchase_price)}
                      </td>
                      <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                        <select
                          value={assignedWs?.id || ''}
                          onChange={(e) => handleAssignProductWholesaler(item, e.target.value)}
                          className="px-2 py-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-xs"
                        >
                          <option value="">{item.last_supplier_name || 'Unassigned Wholesaler'}</option>
                          {wholesalers.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} ({w.agency_or_brand || w.phone})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {onRestockClick && (
                            <button
                              onClick={() => onRestockClick(item)}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-bold transition"
                            >
                              ++ Restock
                            </button>
                          )}
                          {assignedWs && (
                            <button
                              type="button"
                              onClick={() => handleSendWholesalerWhatsAppOrder(assignedWs, [item])}
                              title={`WhatsApp PO to ${assignedWs.name}`}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition"
                            >
                              📲 PO
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Near Expiry Items Section */}
      {expiringItems.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900/60 shadow-sm overflow-hidden" data-testid="expiry-container">
          <div className="p-4 sm:p-5 border-b border-red-100 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/30">
            <h3 className="text-base font-bold text-red-900 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              Expiring Soon Alert (Next 15 Days)
            </h3>
            <p className="text-xs text-red-700 dark:text-red-400">
              Immediate action recommended: discount, clear or return to distributor
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Expiry Date</th>
                  <th className="p-3 text-right">Days Remaining</th>
                  <th className="p-3 text-right">Current Stock</th>
                  <th className="p-3 text-right">Wholesale Loss Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {expiringItems.map((item) => {
                  const expiry = new Date(item.expiry_date!);
                  const diffTime = expiry.getTime() - Date.now();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  const lossRisk = item.current_stock * item.purchase_price;

                  return (
                    <tr key={item.id} className="hover:bg-red-50/20 dark:hover:bg-red-950/20">
                      <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{item.name}</td>
                      <td className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300 font-medium">
                        {item.expiry_date}
                      </td>
                      <td className="p-3 text-right font-bold text-red-600 dark:text-red-400 text-xs">
                        {diffDays <= 0 ? 'EXPIRED' : `${diffDays} days`}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatStockQty(item.current_stock, item.unit_type)}
                      </td>
                      <td className="p-3 text-right font-bold text-red-700 dark:text-red-400">
                        {formatINR(lossRisk)}
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
  );
};
