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
  CheckSquare,
  Square,
  FolderSync,
  X,
  Truck,
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

  // Multi-select state
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState<string>('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

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

  const handleToggleSelectAll = () => {
    if (selectedProductIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const handleToggleSelectProduct = (productId: string) => {
    const next = new Set(selectedProductIds);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    setSelectedProductIds(next);
  };

  const handleBulkDelete = async () => {
    if (selectedProductIds.size === 0) return;
    const confirmMsg = `Are you sure you want to delete ${selectedProductIds.size} selected products? This will remove them from the inventory.`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkProcessing(true);
    try {
      await InventoryService.bulkDeleteProducts(Array.from(selectedProductIds));
      setSelectedProductIds(new Set());
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Bulk delete failed: ${err.message}`);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkToggleQuickTap = async (enable: boolean) => {
    if (selectedProductIds.size === 0) return;
    setIsBulkProcessing(true);
    try {
      await InventoryService.bulkToggleQuickTap(Array.from(selectedProductIds), enable);
      setSelectedProductIds(new Set());
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Bulk update failed: ${err.message}`);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkChangeCategory = async () => {
    if (selectedProductIds.size === 0 || !bulkCategoryTarget.trim()) return;
    setIsBulkProcessing(true);
    try {
      await InventoryService.bulkUpdateCategory(Array.from(selectedProductIds), bulkCategoryTarget.trim());
      setSelectedProductIds(new Set());
      setBulkCategoryTarget('');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Bulk category update failed: ${err.message}`);
    } finally {
      setIsBulkProcessing(false);
    }
  };

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Inventory Master &amp; Stock Ledger
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total {products.length} Products | Double-check append-only ledger active
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            data-testid="open-wholesalers-reorder-btn"
            onClick={() => setActiveTab('restock')}
            className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <Truck className="w-4 h-4" />
            <span>🚛 Wholesalers &amp; Reorder</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'all'
              ? 'bg-blue-700 dark:bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>All Products ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('restock')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'restock'
              ? 'bg-blue-700 dark:bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className={`w-4 h-4 ${totalAlerts > 0 ? 'text-amber-500' : ''}`} />
          <span>Wholesaler Restock &amp; Alerts</span>
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
                className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
            >
              <option value="ALL">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Multi-Select Floating Bulk Action Bar */}
          {selectedProductIds.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 p-3.5 bg-blue-50 dark:bg-slate-800 border-2 border-blue-600 dark:border-blue-500 rounded-2xl shadow-lg transition-all animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-blue-700 text-white rounded-lg text-xs font-bold">
                  {selectedProductIds.size} Selected
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-300 hidden sm:inline">
                  Bulk Operations
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Bulk Category dropdown */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={bulkCategoryTarget}
                    onChange={(e) => setBulkCategoryTarget(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                  >
                    <option value="">Move Category...</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!bulkCategoryTarget || isBulkProcessing}
                    onClick={handleBulkChangeCategory}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold disabled:opacity-40 transition"
                  >
                    Apply
                  </button>
                </div>

                {/* Fast-Tap Quick Grid Bulk actions */}
                <button
                  type="button"
                  disabled={isBulkProcessing}
                  onClick={() => handleBulkToggleQuickTap(true)}
                  className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-bold transition flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  +Fast-Tap
                </button>
                <button
                  type="button"
                  disabled={isBulkProcessing}
                  onClick={() => handleBulkToggleQuickTap(false)}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition"
                >
                  -Fast-Tap
                </button>

                {/* Bulk Delete */}
                <button
                  type="button"
                  disabled={isBulkProcessing}
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete ({selectedProductIds.size})
                </button>

                {/* Deselect All */}
                <button
                  type="button"
                  onClick={() => setSelectedProductIds(new Set())}
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  title="Deselect All"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Products Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="products-table">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredProducts.length > 0 && selectedProductIds.size === filteredProducts.length}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Select All"
                      />
                    </th>
                    <th className="p-3">Product Name &amp; Code</th>
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
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.map((p) => {
                    const margin = calculateProfitMarginPercent(p.purchase_price, p.selling_price);
                    const isLow = p.current_stock <= p.low_stock_threshold;

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group ${selectedProductIds.has(p.id) ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''}`}>
                        {/* Multi-Select Checkbox */}
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.has(p.id)}
                            onChange={() => handleToggleSelectProduct(p.id)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* Name + Code */}
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                            ) : null}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</span>
                                {p.is_quick_tap && (
                                  <span
                                    title="Top-24 Pareto Fast-Tap Grid"
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 text-[10px] font-bold rounded-md"
                                  >
                                    <Sparkles className="w-2.5 h-2.5 text-orange-600 dark:text-orange-400" />
                                    24
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                                  {p.short_code}
                                </span>
                                {p.barcode && (
                                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                                    {p.barcode}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="p-3 text-xs text-slate-600 dark:text-slate-400">{p.category}</td>

                        {/* Unit */}
                        <td className="p-3 text-xs font-medium text-slate-500 dark:text-slate-400">{p.unit_type}</td>

                        {/* Cost Price */}
                        <td className="p-3 text-right text-xs text-slate-600 dark:text-slate-400">
                          {formatINR(p.purchase_price)}
                        </td>

                        {/* Selling Price */}
                        <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                          {formatINR(p.selling_price)}
                        </td>

                        {/* Margin % (REQ-04) */}
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              margin >= 15
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                : margin >= 5
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
                            }`}
                          >
                            {margin.toFixed(1)}%
                          </span>
                        </td>

                        {/* Current Stock */}
                        <td className="p-3 text-right">
                          <span
                            className={`font-bold text-sm ${
                              isLow ? 'text-red-600 dark:text-red-400' : 'text-blue-900 dark:text-blue-300'
                            }`}
                          >
                            {p.current_stock}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">
                            {p.unit_type === 'KG_LOOSE' ? 'kg' : p.unit_type === 'LTR' ? 'L' : ''}
                          </span>
                          {isLow && (
                            <span className="block text-[10px] font-bold text-red-600 dark:text-red-400">
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
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 transition"
                            >
                              <PlusCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenStockOut(p)}
                              title="Stock Out (-- Damage / Home Use)"
                              className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 transition"
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
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              title="Delete Product"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
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
          onRefresh={onRefresh}
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
