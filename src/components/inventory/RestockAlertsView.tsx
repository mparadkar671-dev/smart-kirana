import React from 'react';
import { Product, ShopProfile } from '../../types';
import { InventoryService } from '../../services/inventoryService';
import { formatINR } from '../../utils/math';
import { AlertTriangle, Clock, ShoppingCart, MessageSquare, Download, CheckCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface RestockAlertsViewProps {
  products: Product[];
  shopProfile?: ShopProfile | null;
  onRestockClick: (product: Product) => void;
}

export const RestockAlertsView: React.FC<RestockAlertsViewProps> = ({
  products,
  shopProfile,
  onRestockClick,
}) => {
  const lowStockItems = InventoryService.filterLowStock(products);
  const expiringItems = InventoryService.filterExpiringSoon(products, 15);

  const shopName = shopProfile?.shop_name || 'Smart Kirana Store';

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

    // Shop Header
    doc.setFontSize(16);
    doc.text(shopName, 14, 15);
    doc.setFontSize(11);
    doc.text('Wholesaler Market Purchase & Restock Order', 14, 22);
    doc.setFontSize(9);
    doc.text(`Generated on: ${dateStr} | Total Items to Procure: ${lowStockItems.length}`, 14, 28);

    const tableRows = lowStockItems.map((item, index) => {
      const suggestedOrder = Math.max(1, Math.ceil(item.low_stock_threshold * 2 - item.current_stock));
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
      headStyles: { fillColor: [30, 58, 138] }, // Navy blue
      styles: { fontSize: 8.5 },
    });

    doc.save(`Wholesaler_Restock_Order_${dateStr.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Wholesaler Purchase Restock Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Wholesaler Market Purchase List (Low Stock Items)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generated automatically when items fall to or below their alert threshold
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
                  const suggestedOrder = Math.max(1, Math.ceil(item.low_stock_threshold * 2 - item.current_stock));
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                      <td className="p-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</div>
                        <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                          {item.short_code}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-amber-700 dark:text-amber-400">
                        {item.current_stock} {item.unit_type}
                      </td>
                      <td className="p-3 text-right text-slate-500 dark:text-slate-400 text-xs">
                        {item.low_stock_threshold} {item.unit_type}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-900 dark:text-blue-300 text-sm">
                        +{suggestedOrder} {item.unit_type}
                      </td>
                      <td className="p-3 text-right font-medium text-slate-700 dark:text-slate-300">
                        {formatINR(item.purchase_price)}
                      </td>
                      <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                        {item.last_supplier_name || 'General Wholesaler'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => onRestockClick(item)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-bold transition"
                        >
                          ++ Restock
                        </button>
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
                        {item.current_stock} {item.unit_type}
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

