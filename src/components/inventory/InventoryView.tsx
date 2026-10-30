import React, { useState } from 'react';
import { Product, ShopProfile } from '../../types';
import { ProductModal } from './ProductModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { RestockAlertsView } from './RestockAlertsView';
import { InventoryService } from '../../services/inventoryService';
import { formatINR, calculateProfitMarginPercent } from '../../utils/math';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  Edit2,
  Trash2,
  Sparkles,
  Layers,
} from 'lucide-react';

interface InventoryViewProps {
  products: Product[];
  shopProfile?: ShopProfile | null;
  onRefresh?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  shopProfile,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'restock'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustmentMode, setAdjustmentMode] = useState<'STOCK_IN' | 'STOCK_OUT'>('STOCK_IN');

  const lowStockCount = InventoryService.filterLowStock(products).length;
  const expiringCount = InventoryService.filterExpiringSoon(products, 15).length;
  const totalAlerts = lowStockCount + expiringCount;

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.short_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCat = categoryFilter === 'ALL' || p.category === categoryFilter;

    return matchesSearch && matchesCat;
  });

  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setIsProductModalOpen(true);
  };

  const handleOpenStockIn = (p: Product) => {
    setSelectedProduct(p);
    setAdjustmentMode('STOCK_IN');
    setIsAdjustmentModalOpen(true);
  };

  const handleOpenStockOut = (p: Product) => {
    setSelectedProduct(p);
    setAdjustmentMode('STOCK_OUT');
    setIsAdjustmentModalOpen(true);
  };

  const handleDelete = async (p: Product) => {
    if (window.confirm(`Are you sure you want to delete ${p.name}? This will remove it from inventory.`)) {
      await InventoryService.deleteProduct(p.id);
      if (onRefresh) onRefresh();
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-700" />
            Inventory Master & Stock Ledger
          </h1>
          <p className="text-xs text-slate-500">
            Total {products.length} Products | Double-check append-only ledger active
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'all'
              ? 'bg-blue-800 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>All Products ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('restock')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'restock'
              ? 'bg-blue-800 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <AlertTriangle className={`w-4 h-4 ${totalAlerts > 0 ? 'text-amber-500' : ''}`} />
          <span>Wholesaler Restock & Alerts</span>
          {totalAlerts > 0 && (
            <span
              data-testid="restock-alert-pill"
              className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-extrabold rounded-full"
            >
              {totalAlerts}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: All Products Table */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products by Name, Short Code (e.g. PG5), Barcode..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
            >
              <option value="ALL">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="products-table">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="p-3">Product Name & Code</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3 text-right">Cost Price</th>
                    <th className="p-3 text-right">Selling Price</th>
                    <th className="p-3 text-center">Margin %</th>
                    <th className="p-3 text-right">Stock</th>
                    <th className="p-3 text-center">Quick Stock</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((p) => {
                    const margin = calculateProfitMarginPercent(p.purchase_price, p.selling_price);
                    const isLow = p.current_stock <= p.low_stock_threshold;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition group">
                        {/* Name + Code */}
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{p.name}</span>
                            {p.is_quick_tap && (
                              <span
                                title="Top-24 Pareto Fast-Tap Grid"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-100 text-orange-800 text-[10px] font-bold rounded-md"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-orange-600" />
                                24
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              {p.short_code}
                            </span>
                            {p.barcode && (
                              <span className="font-mono text-[10px] text-slate-400">
                                {p.barcode}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="p-3 text-xs text-slate-600">{p.category}</td>

                        {/* Unit */}
                        <td className="p-3 text-xs font-medium text-slate-500">{p.unit_type}</td>

                        {/* Cost Price */}
                        <td className="p-3 text-right text-xs text-slate-600">
                          {formatINR(p.purchase_price)}
                        </td>

                        {/* Selling Price */}
                        <td className="p-3 text-right font-bold text-slate-900">
                          {formatINR(p.selling_price)}
                        </td>

                        {/* Margin % (REQ-04) */}
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              margin >= 15
                                ? 'bg-emerald-100 text-emerald-800'
                                : margin >= 5
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {margin.toFixed(1)}%
                          </span>
                        </td>

                        {/* Current Stock */}
                        <td className="p-3 text-right">
                          <span
                            className={`font-bold text-sm ${
                              isLow ? 'text-red-600' : 'text-blue-900'
                            }`}
                          >
                            {p.current_stock}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1">
                            {p.unit_type === 'KG_LOOSE' ? 'kg' : p.unit_type === 'LTR' ? 'L' : ''}
                          </span>
                          {isLow && (
                            <span className="block text-[10px] font-bold text-red-600">
                              Low Stock (&le;{p.low_stock_threshold})
                            </span>
                          )}
                        </td>

                        {/* Quick Stock In / Out Steppers (REQ-05) */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenStockIn(p)}
                              title="Quick Restock (Stock In ++)"
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition"
                            >
                              <PlusCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenStockOut(p)}
                              title="Stock Out (-- Damage / Home Use)"
                              className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition"
                            >
                              <MinusCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenEdit(p)}
                              title="Edit Product"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-slate-100 transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              title="Delete Product"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-700 hover:bg-slate-100 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Wholesaler Restock List & Expiry Alerts (REQ-06) */}
      {activeTab === 'restock' && (
        <RestockAlertsView
          products={products}
          shopProfile={shopProfile}
          onRestockClick={(p) => handleOpenStockIn(p)}
        />
      )}

      {/* Product CRUD Modal */}
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        productToEdit={editingProduct}
        onSaved={() => {
          if (onRefresh) onRefresh();
        }}
      />

      {/* Stock Adjustment Modal (Stock In / Stock Out) */}
      <StockAdjustmentModal
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
        product={selectedProduct}
        mode={adjustmentMode}
        onAdjusted={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
