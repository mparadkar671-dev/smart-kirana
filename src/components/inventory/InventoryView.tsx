import React, { useState } from 'react';
import { Product, ShopProfile } from '../../types';
import { ProductModal } from './ProductModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { RestockAlertsView } from './RestockAlertsView';
import { InventoryService } from '../../services/inventoryService';
import {
  MAHARASHTRA_105_KIRANA_CATALOG,
  parseKiranaCatalogCsv,
  bulkImportKiranaProducts,
  export105KiranaCatalogCsvString,
} from '../../services/csvCatalogImporter';
import { normalizeProductImageToSquare, generateSmartProductThumbnail } from '../../utils/productImageEngine';
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
  Upload,
  FileSpreadsheet,
  ImagePlus,
  CheckCircle,
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

  // CSV / 105-Product Sheet Importer state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const lowStockCount = InventoryService.filterLowStock(products).length;
  const expiringCount = InventoryService.filterExpiringSoon(products, 15).length;
  const totalAlerts = lowStockCount + expiringCount;

  // Filter products (includes Marathi Name & Hidden POS Search Keywords)
  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.marathi_name && p.marathi_name.toLowerCase().includes(q)) ||
      (p.search_keywords && p.search_keywords.toLowerCase().includes(q)) ||
      p.short_code.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      p.category.toLowerCase().includes(q);

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

  // Handle 1-Click Upload of Untitled_spreadsheet.csv or any CSV sheet
  const handleCsvFileUpload = async (file: File) => {
    setIsImportingCsv(true);
    setImportFeedback(null);
    try {
      const text = await file.text();
      const parsedRows = parseKiranaCatalogCsv(text);
      if (parsedRows.length === 0) {
        alert('No valid product rows found in the uploaded CSV file.');
        return;
      }
      const res = await bulkImportKiranaProducts(parsedRows);
      setImportFeedback(
        `✅ Imported ${res.importedCount} new products & updated ${res.updatedCount} items with uniform 160x160px images & EAN-13 barcodes!`
      );
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`CSV Import failed: ${err.message}`);
    } finally {
      setIsImportingCsv(false);
    }
  };

  // Handle 1-Click Built-in 105 Maharashtra Kirana Catalog Import
  const handleImport105BuiltInCatalog = async () => {
    setIsImportingCsv(true);
    setImportFeedback(null);
    try {
      const res = await bulkImportKiranaProducts(MAHARASHTRA_105_KIRANA_CATALOG);
      setImportFeedback(
        `✅ Loaded all 105 Maharashtra Kirana products (${res.importedCount} added, ${res.updatedCount} refreshed) with 160x160px images, GS1 barcodes & Marathi/Hinglish search keywords!`
      );
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`105-Product Import failed: ${err.message}`);
    } finally {
      setIsImportingCsv(false);
    }
  };

  // Handle downloading the 105-product sample CSV (Untitled_spreadsheet.csv)
  const handleDownloadSample105Csv = () => {
    const csvContent = export105KiranaCatalogCsvString();
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Untitled_spreadsheet.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Handle 1-Click Drag-and-Drop or Click Image Replacement on any Inventory row
  const handleRowImageReplace = async (product: Product, file: File) => {
    try {
      const normalizedSquareDataUrl = await normalizeProductImageToSquare(file);
      await InventoryService.updateProduct(product.id, {
        image_url: normalizedSquareDataUrl,
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Failed to update image: ${err.message}`);
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

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            data-testid="import-csv-sheet-btn"
            onClick={() => {
              setImportFeedback(null);
              setIsImportModalOpen(true);
            }}
            className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <Upload className="w-4 h-4" />
            <span>📥 Import CSV / Sheet (Auto-Barcode + Auto-Image)</span>
          </button>

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

      {/* 1-Click CSV / 105-Product Sheet Importer Modal */}
      {isImportModalOpen && (
        <div
          data-testid="csv-import-modal"
          className="bg-white dark:bg-slate-900 border-2 border-purple-600 dark:border-purple-500 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span>📥 105-Product Marathi/English CSV Importer &amp; 160x160 Auto-Image Engine</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Automatically assigns KG_LOOSE / PCS units, Maharashtra Kirana rates, unique GS1 200-prefix EAN-13 barcodes, uniform 160x160px square images, and hidden POS search keywords.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {importFeedback && (
            <div
              data-testid="csv-import-success-banner"
              className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{importFeedback}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option A: Upload Untitled_spreadsheet.csv */}
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer?.files?.[0];
                if (f) handleCsvFileUpload(f);
              }}
              className="cursor-pointer border-2 border-dashed border-purple-300 dark:border-purple-700 hover:border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-2 transition"
            >
              <Upload className="w-7 h-7 text-purple-600 dark:text-purple-400" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Click or Drop <code className="text-purple-700 dark:text-purple-300">Untitled_spreadsheet.csv</code> Here
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Columns: Product Name (Marathi), Product Name (English), Category, Search Keywords (POS), Sell Price, Purchase Price, MRP, Available Stock
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                data-testid="csv-file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCsvFileUpload(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>

            {/* Option B: 1-Click Load Built-in 105 Maharashtra Kirana Catalog */}
            <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl p-5 flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <span className="inline-block px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 text-[10px] font-extrabold uppercase">
                  Instant 1-Click Preset
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  105-Product Maharashtra Kirana Bilingual Catalog
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pre-loaded with all 105 Marathi + English items (तूर डाळ, साखर, शेंगदाणे, गगंगिरी मसाला, सोसायटी चहा, संतूर साबण, विम बार, पॅराशूट, इ.) with 160x160px pack illustrations &amp; Hinglish F2 keywords.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isImportingCsv}
                  data-testid="import-105-maharashtra-btn"
                  onClick={handleImport105BuiltInCatalog}
                  className="flex-1 py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isImportingCsv ? 'Importing 105 Items...' : '⚡ Load 105 Marathi/English Products'}</span>
                </button>

                <button
                  type="button"
                  data-testid="download-105-csv-template-btn"
                  onClick={handleDownloadSample105Csv}
                  className="py-2.5 px-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold transition"
                  title="Download Untitled_spreadsheet.csv template"
                >
                  📄 Download CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

                        {/* Name + Code + 1-Click Drag-and-Drop 160x160 Image Replacement */}
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <label
                              title="Click or Drag & Drop a photo here to replace 160x160px product image"
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const file = e.dataTransfer?.files?.[0];
                                if (file) handleRowImageReplace(p, file);
                              }}
                              className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shrink-0 cursor-pointer group/img"
                            >
                              <img
                                src={
                                  p.image_url ||
                                  generateSmartProductThumbnail({
                                    name: p.name,
                                    marathiName: p.marathi_name,
                                    category: p.category,
                                    unitType: p.unit_type,
                                  })
                                }
                                alt={p.name}
                                data-testid={`inventory-row-img-${p.id}`}
                                className="w-10 h-10 object-contain bg-white"
                              />
                              <span className="absolute inset-0 bg-slate-900/50 text-white opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition">
                                <ImagePlus className="w-3.5 h-3.5" />
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleRowImageReplace(p, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                  {p.marathi_name && !p.name.includes(p.marathi_name)
                                    ? `${p.marathi_name} (${p.name})`
                                    : p.name}
                                </span>
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
