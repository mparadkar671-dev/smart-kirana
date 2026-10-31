import React, { useState, useEffect } from 'react';
import { Product, UnitType } from '../../types';
import { CreateProductInput, InventoryService } from '../../services/inventoryService';
import { calculateProfitMarginPercent, roundCurrency, roundQty } from '../../utils/math';
import { X, Sparkles, Check, AlertCircle } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  onSaved: () => void;
}

const CATEGORIES = [
  'Groceries',
  'Loose Staples',
  'Dairy',
  'Bakery & Dairy',
  'Oils',
  'Spices',
  'Snacks & Biscuits',
  'Instant Food',
  'Flours',
  'Grains & Rice',
  'Beverages',
  'Personal Care',
  'Cleaning & Household',
  'General',
];

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  onSaved,
}) => {
  const [formData, setFormData] = useState<CreateProductInput>({
    name: '',
    short_code: '',
    barcode: '',
    category: 'Groceries',
    unit_type: 'PCS',
    purchase_price: 0,
    selling_price: 0,
    mrp: 0,
    current_stock: 0,
    low_stock_threshold: 5,
    last_supplier_name: '',
    expiry_date: null,
    is_quick_tap: false,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (productToEdit) {
      setFormData({
        name: productToEdit.name,
        short_code: productToEdit.short_code,
        barcode: productToEdit.barcode,
        category: productToEdit.category,
        unit_type: productToEdit.unit_type,
        purchase_price: productToEdit.purchase_price,
        selling_price: productToEdit.selling_price,
        mrp: productToEdit.mrp,
        current_stock: productToEdit.current_stock,
        low_stock_threshold: productToEdit.low_stock_threshold,
        last_supplier_name: productToEdit.last_supplier_name || '',
        expiry_date: productToEdit.expiry_date || null,
        is_quick_tap: productToEdit.is_quick_tap,
      });
    } else {
      setFormData({
        name: '',
        short_code: '',
        barcode: '',
        category: 'Groceries',
        unit_type: 'PCS',
        purchase_price: 0,
        selling_price: 0,
        mrp: 0,
        current_stock: 0,
        low_stock_threshold: 5,
        last_supplier_name: '',
        expiry_date: null,
        is_quick_tap: false,
      });
    }
    setErrorMsg(null);
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  const margin = calculateProfitMarginPercent(formData.purchase_price, formData.selling_price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMsg('Product name is required');
      return;
    }
    if (!formData.short_code.trim()) {
      setErrorMsg('Short code is required (e.g. PG5, TS1)');
      return;
    }
    if (formData.selling_price < 0 || formData.purchase_price < 0) {
      setErrorMsg('Prices cannot be negative');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      if (productToEdit) {
        await InventoryService.updateProduct(productToEdit.id, formData);
      } else {
        await InventoryService.createProduct(formData);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save product';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-8 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {productToEdit ? 'Edit Product' : 'Add New Kirana Product'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure inventory item, unit parameters, and profit margins
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Product Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Product Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Tata Salt Vacuum Evaporated 1kg"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Short Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Short Code (F2 Instant Search) *
              </label>
              <input
                type="text"
                required
                value={formData.short_code}
                onChange={(e) => setFormData({ ...formData, short_code: e.target.value.toUpperCase() })}
                placeholder="e.g. TS1, PG5, SUG"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-mono uppercase text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Barcode */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Barcode / EAN (Optional)
              </label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="Scan or enter barcode"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Unit Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Unit Type *
              </label>
              <select
                value={formData.unit_type}
                onChange={(e) => setFormData({ ...formData, unit_type: e.target.value as UnitType })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
              >
                <option value="PCS">PCS (Standard Items / Soap / Biscuits)</option>
                <option value="KG_LOOSE">KG_LOOSE (Sugar, Atta, Dal, Rice)</option>
                <option value="LTR">LTR (Loose Oil, Milk, Liquids)</option>
                <option value="PACK">PACK (Pre-packaged Multi-pack / Boxes)</option>
              </select>
            </div>

            {/* Purchase Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Purchase Price (₹ Wholesale Cost) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 dark:text-slate-500 font-semibold text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  data-testid="purchase-price-input"
                  value={formData.purchase_price || ''}
                  onChange={(e) => setFormData({ ...formData, purchase_price: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Selling Price & Margin Display */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  Selling Price (₹ Retail) *
                </label>
                {/* Margin Badge (REQ-04) */}
                <span
                  data-testid="margin-badge"
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    margin >= 15
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : margin >= 5
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                  }`}
                >
                  {margin.toFixed(1)}% Margin
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 dark:text-slate-500 font-semibold text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  data-testid="selling-price-input"
                  value={formData.selling_price || ''}
                  onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* MRP */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                MRP (Printed Max Price)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 dark:text-slate-500 font-semibold text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.mrp || ''}
                  onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Current Stock */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Current Stock ({formData.unit_type === 'KG_LOOSE' ? 'kg' : formData.unit_type === 'LTR' ? 'L' : 'units'}) *
              </label>
              <input
                type="number"
                step={formData.unit_type === 'KG_LOOSE' || formData.unit_type === 'LTR' ? '0.001' : '1'}
                value={formData.current_stock}
                onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-bold text-blue-900 dark:text-blue-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Low Stock Alert Threshold */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Low Stock Threshold (Alert Limit) *
              </label>
              <input
                type="number"
                step={formData.unit_type === 'KG_LOOSE' || formData.unit_type === 'LTR' ? '0.001' : '1'}
                value={formData.low_stock_threshold}
                onChange={(e) => setFormData({ ...formData, low_stock_threshold: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Expiry Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={formData.expiry_date || ''}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value || null })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Last Supplier Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Wholesaler / Supplier Name
              </label>
              <input
                type="text"
                value={formData.last_supplier_name || ''}
                onChange={(e) => setFormData({ ...formData, last_supplier_name: e.target.value })}
                placeholder="e.g. Tata Consumer Wholesale, APMC Mandi"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Top-24 Fast-Tap Toggle (REQ-04 & REQ-23) */}
            <div className="sm:col-span-2 p-3 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-xl flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-xs text-orange-900 dark:text-orange-200">
                  <Sparkles className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  <span>Pin to Top-24 "Fast-Tap" POS Billing Grid</span>
                </div>
                <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-0.5">
                  High-velocity daily items (Milk, Bread, Sugar, Biscuits) allow 1-tap billing without typing.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_quick_tap}
                  onChange={(e) => setFormData({ ...formData, is_quick_tap: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md transition flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{productToEdit ? 'Update Product' : 'Add to Inventory'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
