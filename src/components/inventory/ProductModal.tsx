import React, { useState, useEffect, useRef } from 'react';
import { Product, UnitType, Wholesaler, LoanAccount, BusinessType, KIRANA_CATEGORIES, HOMEMADE_FOOD_CATEGORIES } from '../../types';
import { CreateProductInput, InventoryService } from '../../services/inventoryService';
import { WholesalerService } from '../../services/wholesalerService';
import { LoanAccountService } from '../../services/loanAccountService';
import { calculateProfitMarginPercent, formatINR } from '../../utils/math';
import { generateUniqueStoreBarcode, getBarcodePatternBars } from '../../utils/barcodeGenerator';
import { compressProductImage } from '../../utils/imageCompressor';
import { generateSmartProductThumbnail, normalizeProductImageToSquare } from '../../utils/productImageEngine';
import { db } from '../../db/db';
import { getActiveBusinessType } from '../../utils/businessFirewall';
import {
  X,
  Sparkles,
  Check,
  AlertCircle,
  RefreshCw,
  Printer,
  ImagePlus,
  Trash2,
  Plus,
  Truck,
  Landmark,
} from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  onSaved: () => void;
  businessType?: BusinessType;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  onSaved,
  businessType,
}) => {
  const effectiveBusinessType: BusinessType =
    productToEdit?.business_type || businessType || getActiveBusinessType();
  const isHomemade = effectiveBusinessType === 'HOMEMADE_FOOD';
  const activeCategories = isHomemade ? HOMEMADE_FOOD_CATEGORIES : KIRANA_CATEGORIES;

  const [formData, setFormData] = useState<CreateProductInput>({
    name: '',
    marathi_name: '',
    search_keywords: '',
    short_code: '',
    barcode: '',
    category: isHomemade ? HOMEMADE_FOOD_CATEGORIES[0] : 'Groceries',
    unit_type: 'PCS',
    purchase_price: 0,
    selling_price: 0,
    mrp: 0,
    current_stock: 0,
    low_stock_threshold: 5,
    last_supplier_name: '',
    supplier_phone: '',
    wholesaler_id: null,
    loan_account_id: null,
    is_loan_funded: false,
    raw_material_cost: 0,
    equipment_fuel_cost: 0,
    labour_cost: 0,
    wholesale_price: 0,
    shelf_life_days: undefined,
    batch_notes: '',
    image_url: null,
    expiry_date: null,
    is_quick_tap: false,
    business_type: effectiveBusinessType,
  });

  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [showInlineWholesaler, setShowInlineWholesaler] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsAgency, setNewWsAgency] = useState('');
  const [newWsPhone, setNewWsPhone] = useState('');
  const [isSavingWs, setIsSavingWs] = useState(false);

  // Loan Account Funding state
  const [loanAccounts, setLoanAccounts] = useState<LoanAccount[]>([]);
  const [isFromLoan, setIsFromLoan] = useState(false);
  const [showInlineLoan, setShowInlineLoan] = useState(false);
  const [newLoanName, setNewLoanName] = useState('');
  const [newLoanLender, setNewLoanLender] = useState('');
  const [newLoanPrincipal, setNewLoanPrincipal] = useState<number>(0);
  const [isSavingLoan, setIsSavingLoan] = useState(false);

  const [isCompressingImg, setIsCompressingImg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        formRef.current?.requestSubmit();
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadWholesalers = async () => {
    try {
      const list = await WholesalerService.getAll();
      setWholesalers(
        list.filter((w) => !w.business_type || w.business_type === effectiveBusinessType)
      );
    } catch {
      setWholesalers([]);
    }
  };

  const loadLoanAccounts = async () => {
    try {
      const list = await LoanAccountService.getAll();
      setLoanAccounts(list);
    } catch {
      setLoanAccounts([]);
    }
  };

  const generateFreshBarcode = async (): Promise<string> => {
    try {
      const allProds = await db.products.toArray();
      const existingBarcodes = new Set(allProds.map((p) => p.barcode).filter(Boolean));
      return generateUniqueStoreBarcode(existingBarcodes);
    } catch {
      return generateUniqueStoreBarcode(new Set());
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadWholesalers();
    loadLoanAccounts();
    setShowInlineWholesaler(false);
    setShowInlineLoan(false);
    setErrorMsg(null);

    if (productToEdit) {
      setIsFromLoan(Boolean(productToEdit.loan_account_id || productToEdit.is_loan_funded));
      setFormData({
        name: productToEdit.name,
        marathi_name: productToEdit.marathi_name || '',
        search_keywords: productToEdit.search_keywords || '',
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
        supplier_phone: productToEdit.supplier_phone || '',
        wholesaler_id: productToEdit.wholesaler_id || null,
        loan_account_id: productToEdit.loan_account_id || null,
        is_loan_funded: Boolean(productToEdit.is_loan_funded || productToEdit.loan_account_id),
        raw_material_cost: productToEdit.raw_material_cost || 0,
        equipment_fuel_cost: productToEdit.equipment_fuel_cost || 0,
        labour_cost: productToEdit.labour_cost || 0,
        wholesale_price: productToEdit.wholesale_price || 0,
        shelf_life_days: productToEdit.shelf_life_days,
        batch_notes: productToEdit.batch_notes || '',
        image_url: productToEdit.image_url || null,
        expiry_date: productToEdit.expiry_date || null,
        is_quick_tap: productToEdit.is_quick_tap,
        business_type: productToEdit.business_type || effectiveBusinessType,
      });
    } else {
      setIsFromLoan(false);
      // Pre-fill initial synchronous barcode immediately, then refine against DB
      const initialBarcode = generateUniqueStoreBarcode(new Set());
      setFormData({
        name: '',
        marathi_name: '',
        search_keywords: '',
        short_code: '',
        barcode: initialBarcode,
        category: isHomemade ? HOMEMADE_FOOD_CATEGORIES[0] : 'Groceries',
        unit_type: 'PCS',
        purchase_price: 0,
        selling_price: 0,
        mrp: 0,
        current_stock: 0,
        low_stock_threshold: 5,
        last_supplier_name: '',
        supplier_phone: '',
        wholesaler_id: null,
        loan_account_id: null,
        is_loan_funded: false,
        raw_material_cost: 0,
        equipment_fuel_cost: 0,
        labour_cost: 0,
        wholesale_price: 0,
        shelf_life_days: undefined,
        batch_notes: '',
        image_url: null,
        expiry_date: null,
        is_quick_tap: false,
        business_type: effectiveBusinessType,
      });
      generateFreshBarcode().then((uniqueCode) => {
        setFormData((prev) => ({
          ...prev,
          barcode: prev.barcode === initialBarcode || !prev.barcode ? uniqueCode : prev.barcode,
        }));
      });
    }
  }, [productToEdit, isOpen, effectiveBusinessType, isHomemade]);

  if (!isOpen) return null;

  const margin = calculateProfitMarginPercent(formData.purchase_price, formData.selling_price);
  const wholesaleMargin = calculateProfitMarginPercent(formData.purchase_price, formData.wholesale_price || 0);
  const wholesaleProfit = (formData.wholesale_price || 0) > formData.purchase_price ? (formData.wholesale_price || 0) - formData.purchase_price : 0;
  const directMargin = calculateProfitMarginPercent(formData.purchase_price, formData.selling_price);
  const directProfit = formData.selling_price > formData.purchase_price ? formData.selling_price - formData.purchase_price : 0;
  const isLoose = formData.unit_type === 'KG_LOOSE' || formData.unit_type === 'LTR';
  const barcodeBars = getBarcodePatternBars(formData.barcode || '2000000000000');

  const handleAutoGenerateBarcode = async () => {
    const code = await generateFreshBarcode();
    setFormData((prev) => ({ ...prev, barcode: code }));
  };

  const handlePrintBarcodeLabel = () => {
    if (typeof window === 'undefined') return;
    const printWin = window.open('', '_blank', 'width=380,height=260');
    if (!printWin) return;
    const title = formData.name || 'Kirana Item';
    const price = formData.selling_price ? `₹${formData.selling_price.toFixed(2)}` : '';
    const code = formData.barcode || '2000000000000';
    printWin.document.write(`
      <html>
        <head><title>Print Label - ${title}</title></head>
        <body style="font-family: monospace; text-align: center; padding: 12px; margin: 0;">
          <div style="border: 1px dashed #333; padding: 10px; display: inline-block; width: 220px;">
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">${title}</div>
            <div style="font-size: 15px; font-weight: 800; margin-bottom: 6px;">${price}</div>
            <div style="letter-spacing: 3px; font-size: 14px; font-weight: bold;">||| || ||| | |||| |||</div>
            <div style="font-size: 12px; margin-top: 2px;">${code}</div>
          </div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressingImg(true);
    try {
      const compressed = await compressProductImage(file);
      setFormData((prev) => ({ ...prev, image_url: compressed }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to compress product image');
    } finally {
      setIsCompressingImg(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleWholesalerSelect = (wsId: string) => {
    if (!wsId) {
      setFormData((prev) => ({
        ...prev,
        wholesaler_id: null,
      }));
      return;
    }
    const found = wholesalers.find((w) => w.id === wsId);
    if (found) {
      setFormData((prev) => ({
        ...prev,
        wholesaler_id: found.id,
        last_supplier_name: found.name,
        supplier_phone: found.phone,
      }));
    }
  };

  const handleSaveInlineWholesaler = async () => {
    if (!newWsName.trim()) {
      setErrorMsg('Wholesaler / Person Name is required');
      return;
    }
    const cleanPhone = newWsPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMsg('Please enter a valid 10-digit WhatsApp Contact No. for the wholesaler');
      return;
    }

    setIsSavingWs(true);
    setErrorMsg(null);
    try {
      const created = await WholesalerService.create({
        name: newWsName.trim(),
        agency_or_brand: newWsAgency.trim(),
        phone: cleanPhone.slice(-10),
      });
      const updatedList = await WholesalerService.getAll();
      setWholesalers(updatedList);
      setFormData((prev) => ({
        ...prev,
        wholesaler_id: created.id,
        last_supplier_name: created.name,
        supplier_phone: created.phone,
      }));
      setNewWsName('');
      setNewWsAgency('');
      setNewWsPhone('');
      setShowInlineWholesaler(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save wholesaler');
    } finally {
      setIsSavingWs(false);
    }
  };

  const handleSaveInlineLoan = async () => {
    if (!newLoanName.trim()) {
      setErrorMsg('Loan Account Name is required (e.g., Mudra Loan ₹50,000)');
      return;
    }
    if (!newLoanPrincipal || newLoanPrincipal <= 0) {
      setErrorMsg('Please enter a valid sanctioned Loan Amount (> ₹0)');
      return;
    }

    setIsSavingLoan(true);
    setErrorMsg(null);
    try {
      const created = await LoanAccountService.create({
        name: newLoanName.trim(),
        lender_name: newLoanLender.trim() || 'Bank / Lender',
        principal_amount: newLoanPrincipal,
      });
      const updatedLoans = await LoanAccountService.getAll();
      setLoanAccounts(updatedLoans);
      setIsFromLoan(true);
      setFormData((prev) => ({
        ...prev,
        loan_account_id: created.id,
      }));
      setNewLoanName('');
      setNewLoanLender('');
      setNewLoanPrincipal(0);
      setShowInlineLoan(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save loan account');
    } finally {
      setIsSavingLoan(false);
    }
  };

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
        await InventoryService.updateProduct(productToEdit.id, {
          ...formData,
          business_type: productToEdit.business_type || effectiveBusinessType,
        });
      } else {
        await InventoryService.createProduct({
          ...formData,
          business_type: effectiveBusinessType,
        });
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
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              {isHomemade && <span>🍲</span>}
              <span>
                {productToEdit
                  ? (isHomemade ? 'Edit Homemade Food Product' : 'Edit Kirana Product')
                  : (isHomemade ? 'Add New Homemade Food Product' : 'Add New Kirana Product')}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isHomemade
                ? 'Configure production cost breakdown, retailer wholesale rate, customer MRP, and batch stock'
                : 'Configure inventory item, GS1 barcode, wholesaler link, and image'}
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
        <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Product Name (English / Display) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Product Name (English / Display) *
              </label>
              <input
                ref={nameInputRef}
                type="text"
                required
                data-testid="product-name-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Toor Dal (Arhar) / Tata Salt 1kg"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Product Name (Marathi) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Product Name (मराठी नाव - Optional)
              </label>
              <input
                type="text"
                data-testid="product-marathi-name-input"
                value={formData.marathi_name || ''}
                onChange={(e) => setFormData({ ...formData, marathi_name: e.target.value })}
                placeholder="उदा. तूर डाळ, साखर, पारले-जी"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Background POS Search Keywords (Hidden on Top-24 card face, active in F2 search) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Background POS Search Keywords (Marathi / Hinglish — Hidden on Card UI)
              </label>
              <input
                type="text"
                data-testid="product-search-keywords-input"
                value={formData.search_keywords || ''}
                onChange={(e) => setFormData({ ...formData, search_keywords: e.target.value })}
                placeholder="e.g. toor dal, arhar dal, turdal, तुरीची डाळ, dal, chaha, saban"
                className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                data-testid="product-shortcode-input"
                value={formData.short_code}
                onChange={(e) => setFormData({ ...formData, short_code: e.target.value.toUpperCase() })}
                placeholder="e.g. TS1, PG5, SUG"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-mono uppercase text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Barcode with Auto-Generate & Visual SVG Preview */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  GS1 / EAN-13 Barcode
                </label>
                <button
                  type="button"
                  data-testid="auto-generate-barcode-btn"
                  onClick={handleAutoGenerateBarcode}
                  className="text-[11px] font-bold text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>🔄 Auto-Generate</span>
                </button>
              </div>
              <input
                type="text"
                data-testid="product-barcode-input"
                value={formData.barcode || ''}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="Scan or auto-generate 13-digit EAN"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {formData.barcode && (
                <div className="mt-1.5 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <svg
                      width="96"
                      height="22"
                      viewBox="0 0 96 22"
                      className="shrink-0 text-slate-900 dark:text-white"
                      aria-label="Barcode preview"
                    >
                      {(() => {
                        let x = 2;
                        return barcodeBars.map((w, idx) => {
                          const isDark = idx % 2 === 0;
                          const rect = isDark ? (
                            <rect key={idx} x={x} y={1} width={w} height={20} fill="currentColor" />
                          ) : null;
                          x += w;
                          return rect;
                        });
                      })()}
                    </svg>
                    <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 truncate">
                      {formData.barcode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrintBarcodeLabel}
                    title="Print Barcode Sticker"
                    className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 flex items-center gap-1 shrink-0"
                  >
                    <Printer className="w-3 h-3" />
                    <span>🖨️ Print Label</span>
                  </button>
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                Category
              </label>
              <select
                data-testid="product-category-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {Array.from(new Set([formData.category, ...activeCategories])).filter(Boolean).map((c) => (
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
                data-testid="unit-type-select"
                value={formData.unit_type}
                onChange={(e) => {
                  const nextUnit = e.target.value as UnitType;
                  const nextIsLoose = nextUnit === 'KG_LOOSE' || nextUnit === 'LTR';
                  setFormData({
                    ...formData,
                    unit_type: nextUnit,
                    low_stock_threshold:
                      nextIsLoose && formData.low_stock_threshold === 5 ? 0.5 : formData.low_stock_threshold,
                  });
                }}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
              >
                {isHomemade ? (
                  <>
                    <option value="PCS">PCS (Per Piece - Chapati, Bhakri, Modak)</option>
                    <option value="PLATE">PLATE (Per Plate - Ghavane, Amboli, Kande Pohe, Upma)</option>
                    <option value="KG_LOOSE">KG_LOOSE (By Weight Kg/Gm - Laddus, Khobryachi Vadi)</option>
                    <option value="DOZEN">DOZEN (Per Dozen / 12 Pcs Box)</option>
                    <option value="PACK">PACK (Fixed Box / Packet)</option>
                  </>
                ) : (
                  <>
                    <option value="PCS">PCS (Per Packet / Piece)</option>
                    <option value="KG_LOOSE">KG_LOOSE (Loose Weight Kg / Grams)</option>
                    <option value="LTR">LTR (Liquid Liter / ml)</option>
                    <option value="PACK">PACK (Box / Multipack)</option>
                  </>
                )}
              </select>
            </div>

            {/* Mode A: Kirana Pricing Fields */}
            {!isHomemade && (
              <>
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
                      data-testid="mrp-input"
                      value={formData.mrp || ''}
                      onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
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
              </>
            )}

            {/* Mode B: Homemade Food Cost Breakdown & Dual Pricing */}
            {isHomemade && (
              <>
                {/* Production Cost Breakdown Card (Full Width) */}
                <div
                  className="sm:col-span-2 p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3"
                  data-testid="making-cost-breakdown-card"
                >
                  <div className="flex items-center justify-between border-b border-amber-200/80 dark:border-amber-800/80 pb-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                      <span>🍳 Making / Production Cost Breakdown (Per Unit / Kg)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">Total Making Cost:</span>
                      <span className="text-sm font-extrabold text-amber-950 dark:text-amber-100 bg-amber-200/80 dark:bg-amber-900/80 px-2.5 py-0.5 rounded-lg font-mono">
                        ₹{(Number(formData.purchase_price) || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-amber-950 dark:text-amber-200 mb-1">
                        1. Raw Material Cost (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid="raw-material-cost-input"
                        value={formData.raw_material_cost || ''}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value) || 0;
                          const equip = formData.equipment_fuel_cost || 0;
                          const labour = formData.labour_cost || 0;
                          const total = Math.round((raw + equip + labour) * 100) / 100;
                          setFormData((prev) => ({
                            ...prev,
                            raw_material_cost: raw,
                            purchase_price: total,
                          }));
                        }}
                        placeholder="Flour, Jaggery, Sugar, Oil"
                        className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-amber-950 dark:text-amber-200 mb-1">
                        2. Equipment / Gas / Packaging (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid="equipment-fuel-cost-input"
                        value={formData.equipment_fuel_cost || ''}
                        onChange={(e) => {
                          const equip = parseFloat(e.target.value) || 0;
                          const raw = formData.raw_material_cost || 0;
                          const labour = formData.labour_cost || 0;
                          const total = Math.round((raw + equip + labour) * 100) / 100;
                          setFormData((prev) => ({
                            ...prev,
                            equipment_fuel_cost: equip,
                            purchase_price: total,
                          }));
                        }}
                        placeholder="LPG, Boxes, Wear &amp; Tear"
                        className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-amber-950 dark:text-amber-200 mb-1">
                        3. Labour / Making Effort (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid="labour-cost-input"
                        value={formData.labour_cost || ''}
                        onChange={(e) => {
                          const labour = parseFloat(e.target.value) || 0;
                          const raw = formData.raw_material_cost || 0;
                          const equip = formData.equipment_fuel_cost || 0;
                          const total = Math.round((raw + equip + labour) * 100) / 100;
                          setFormData((prev) => ({
                            ...prev,
                            labour_cost: labour,
                            purchase_price: total,
                          }));
                        }}
                        placeholder="Cooking labour effort"
                        className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-amber-900 dark:text-amber-300 pt-1 border-t border-amber-200/60 dark:border-amber-800/60 gap-1">
                    <span>Formula: Raw Material (₹{formData.raw_material_cost || 0}) + Gas/Pack (₹{formData.equipment_fuel_cost || 0}) + Labour (₹{formData.labour_cost || 0})</span>
                    <span className="font-bold">Total Making Cost = ₹{(Number(formData.purchase_price) || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Dual Selling Prices for Homemade Food: 1. Wholesale Rate for Retailers */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      🏪 Wholesale Price (₹ For Retailers) *
                    </label>
                    {wholesaleMargin > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        +{formatINR(wholesaleProfit)} ({wholesaleMargin.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-400 dark:text-slate-500 font-semibold text-sm">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      data-testid="wholesale-price-input"
                      value={formData.wholesale_price || ''}
                      onChange={(e) => setFormData({ ...formData, wholesale_price: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-semibold text-blue-900 dark:text-blue-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* 2. Direct Customer Retail Price */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      👤 Direct Customer Price (₹ Retail) *
                    </label>
                    {directMargin > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        +{formatINR(directProfit)} ({directMargin.toFixed(1)}%)
                      </span>
                    )}
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
                      className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-semibold text-emerald-900 dark:text-emerald-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* 3. MRP / Printed Box Price */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    🏷️ MRP / Printed Box Price (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-400 dark:text-slate-500 font-semibold text-sm">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      data-testid="mrp-input"
                      value={formData.mrp || ''}
                      onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Current Stock (Supports 5.250 kg, 3.500 kg, 0.500 kg) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  Current Stock ({formData.unit_type === 'KG_LOOSE' ? 'kg' : formData.unit_type === 'LTR' ? 'L' : 'units'}) *
                </label>
                {isLoose && (
                  <div className="flex gap-1">
                    {[0.5, 1, 3.5, 5.25].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setFormData({ ...formData, current_stock: preset })}
                        className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded text-[10px] font-bold hover:bg-blue-100"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number"
                step={isLoose ? '0.001' : '1'}
                min="0"
                data-testid="current-stock-input"
                value={formData.current_stock}
                onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm font-bold text-blue-900 dark:text-blue-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {isLoose && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Supports exact fractional weights (e.g. 5.250 kg, 3.500 kg, 0.500 kg)
                </p>
              )}
            </div>

            {/* Low Stock Alert Threshold (Supports 1/2 kg = 0.500 kg, 1/4 kg = 0.250 kg) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  Low Stock Limit (Alert) *
                </label>
                {isLoose && (
                  <div className="flex gap-1">
                    {[
                      { label: '¼ kg', val: 0.25 },
                      { label: '½ kg', val: 0.5 },
                      { label: '1 kg', val: 1 },
                      { label: '2 kg', val: 2 },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => setFormData({ ...formData, low_stock_threshold: p.val })}
                        className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded text-[10px] font-bold hover:bg-amber-100"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number"
                step={isLoose ? '0.001' : '1'}
                min="0"
                data-testid="low-stock-threshold-input"
                value={formData.low_stock_threshold}
                onChange={(e) => setFormData({ ...formData, low_stock_threshold: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {isLoose && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Small scale limit supported: 0.5 (½ kg) or 0.25 (¼ kg)
                </p>
              )}
            </div>

            {/* Wholesaler / Distributor Dropdown + Inline Quick-Add (Kirana Mode Only) */}
            {!isHomemade && (
              <div className="sm:col-span-2 p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3" data-testid="wholesaler-section">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Wholesaler / Distributor</span>
                  </label>
                  <button
                    type="button"
                    data-testid="toggle-inline-wholesaler-btn"
                    onClick={() => setShowInlineWholesaler(!showInlineWholesaler)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showInlineWholesaler ? 'Cancel' : '+ New Wholesaler'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    data-testid="wholesaler-select"
                    value={formData.wholesaler_id || ''}
                    onChange={(e) => handleWholesalerSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">-- Select Saved Wholesaler / Distributor --</option>
                    {wholesalers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.agency_or_brand || w.phone})
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={formData.last_supplier_name || ''}
                    onChange={(e) => setFormData({ ...formData, last_supplier_name: e.target.value })}
                    placeholder="Or type supplier name manually"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {/* Inline Mini-Form to Add New Wholesaler */}
                {showInlineWholesaler && (
                  <div
                    data-testid="inline-wholesaler-form"
                    className="p-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-800 rounded-xl space-y-2.5 animate-in fade-in"
                  >
                    <div className="text-xs font-bold text-blue-900 dark:text-blue-300">
                      Quick-Add New Wholesaler / Distributor
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        data-testid="inline-ws-name"
                        value={newWsName}
                        onChange={(e) => setNewWsName(e.target.value)}
                        placeholder="Wholesaler / Person Name *"
                        className="px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        data-testid="inline-ws-agency"
                        value={newWsAgency}
                        onChange={(e) => setNewWsAgency(e.target.value)}
                        placeholder="Agency / Brand (e.g. Parle)"
                        className="px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="tel"
                        data-testid="inline-ws-phone"
                        value={newWsPhone}
                        onChange={(e) => setNewWsPhone(e.target.value)}
                        placeholder="WhatsApp 10-Digit Phone *"
                        maxLength={10}
                        className="px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        data-testid="save-inline-wholesaler-btn"
                        disabled={isSavingWs}
                        onClick={handleSaveInlineWholesaler}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingWs ? 'Saving...' : 'Save Wholesaler'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Homemade Food: Freshness Duration & Batch Recipe Notes (Replaces Wholesaler) */}
            {isHomemade && (
              <div
                className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/60 rounded-xl"
                data-testid="homemade-freshness-section"
              >
                <div>
                  <label className="block text-xs font-bold text-orange-950 dark:text-orange-200 mb-1 uppercase tracking-wide">
                    Shelf Life / Freshness (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    data-testid="shelf-life-days-input"
                    value={formData.shelf_life_days || ''}
                    onChange={(e) => setFormData({ ...formData, shelf_life_days: parseInt(e.target.value) || undefined })}
                    placeholder="e.g. 1 day (Chapati/Amboli), 15 days (Laddus)"
                    className="w-full px-3 py-2 border border-orange-300 dark:border-orange-700 bg-white dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-orange-950 dark:text-orange-200 mb-1 uppercase tracking-wide">
                    Fresh Batch / Recipe Notes
                  </label>
                  <input
                    type="text"
                    data-testid="batch-notes-input"
                    value={formData.batch_notes || ''}
                    onChange={(e) => setFormData({ ...formData, batch_notes: e.target.value })}
                    placeholder="e.g. 100% Pure Ghee, Dry Fruit Filling, Fresh Coconut"
                    className="w-full px-3 py-2 border border-orange-300 dark:border-orange-700 bg-white dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400"
                  />
                </div>
              </div>
            )}

            {/* Loan Amount Capital Tracking Selector + Inline Quick-Add */}
            <div className="sm:col-span-2 p-3.5 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wide">
                  <Landmark className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>
                    {isHomemade
                      ? 'Funded from Loan Amount? (Separate Loan P&L & Daily Set-Aside)'
                      : 'Purchased from Loan Amount? (Separate Loan P&L & Daily Set-Aside)'}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="product-loan-mode-own"
                    onClick={() => {
                      setIsFromLoan(false);
                      setFormData((prev) => ({ ...prev, loan_account_id: null, is_loan_funded: false }));
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      !isFromLoan
                        ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    No ({isHomemade ? 'Own Capital' : 'Own Shop Capital'})
                  </button>
                  <button
                    type="button"
                    data-testid="product-loan-mode-loan"
                    onClick={() => {
                      setIsFromLoan(true);
                      setFormData((prev) => ({ ...prev, is_loan_funded: true }));
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      isFromLoan
                        ? 'bg-purple-700 text-white shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                    }`}
                  >
                    🏦 Yes (From Loan Amount)
                  </button>
                </div>
              </div>

              {isFromLoan && (
                <div className="space-y-2.5 pt-1 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <select
                      data-testid="product-loan-account-select"
                      value={formData.loan_account_id || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          loan_account_id: e.target.value || null,
                        }))
                      }
                      className="flex-1 px-3 py-2 border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      <option value="">-- Select Which Loan Amount / Account --</option>
                      {loanAccounts.map((loan) => (
                        <option key={loan.id} value={loan.id}>
                          {loan.name} — {loan.lender_name} ({formatINR(loan.principal_amount)})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      data-testid="toggle-inline-loan-btn"
                      onClick={() => setShowInlineLoan(!showInlineLoan)}
                      className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-2xs shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showInlineLoan ? 'Cancel' : '+ Add New Loan Amount'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-purple-800 dark:text-purple-300">
                    All purchases, sales, profit &amp; daily repayment set-aside money for this product will be tracked separately under the selected loan account in Reports &amp; P&amp;L.
                  </p>

                  {showInlineLoan && (
                    <div
                      data-testid="inline-loan-form"
                      className="p-3 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-xl space-y-2.5"
                    >
                      <div className="text-xs font-bold text-purple-900 dark:text-purple-300">
                        Quick-Add New Loan Account / Credit Line
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          data-testid="inline-loan-name"
                          value={newLoanName}
                          onChange={(e) => setNewLoanName(e.target.value)}
                          placeholder="Loan Title (e.g. Mudra Loan ₹50k) *"
                          className="px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          data-testid="inline-loan-lender"
                          value={newLoanLender}
                          onChange={(e) => setNewLoanLender(e.target.value)}
                          placeholder="Bank / Lender (e.g. SBI / Finserv)"
                          className="px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                        />
                        <input
                          type="number"
                          min="1"
                          step="1"
                          data-testid="inline-loan-principal"
                          value={newLoanPrincipal || ''}
                          onChange={(e) => setNewLoanPrincipal(parseFloat(e.target.value) || 0)}
                          placeholder="Total Loan Amount (₹) *"
                          className="px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          data-testid="save-inline-loan-btn"
                          disabled={isSavingLoan}
                          onClick={handleSaveInlineLoan}
                          className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSavingLoan ? 'Saving...' : 'Save Loan Account'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Product Image Upload (<15KB 160x160 WebP Compressor - Step 4.2 + Drag & Drop / Paste) */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer?.files?.[0];
                if (droppedFile) {
                  setIsCompressingImg(true);
                  try {
                    const squareUrl = await normalizeProductImageToSquare(droppedFile);
                    setFormData((prev) => ({ ...prev, image_url: squareUrl }));
                  } finally {
                    setIsCompressingImg(false);
                  }
                }
              }}
              onPaste={async (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                      setIsCompressingImg(true);
                      try {
                        const squareUrl = await normalizeProductImageToSquare(blob);
                        setFormData((prev) => ({ ...prev, image_url: squareUrl }));
                      } finally {
                        setIsCompressingImg(false);
                      }
                    }
                    break;
                  }
                }
              }}
              className="sm:col-span-2 p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3.5">
                {formData.image_url ? (
                  <img
                    src={formData.image_url}
                    alt={formData.name || 'Product preview'}
                    data-testid="product-image-preview"
                    className="w-16 h-16 rounded-xl object-contain bg-white border border-slate-300 dark:border-slate-600 shadow-xs shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-200/70 dark:bg-slate-800 border border-dashed border-slate-400 dark:border-slate-600 flex flex-col items-center justify-center text-slate-400 shrink-0">
                    <ImagePlus className="w-6 h-6" />
                    <span className="text-[9px] font-semibold mt-0.5">160x160</span>
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Uniform 160x160px Square Product Image (Drag &amp; Drop, Paste, or Auto-Generate)
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Normalized onto a 160x160px (1:1) white studio canvas (&lt;15KB WebP) for Top-24 POS cards.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  data-testid="product-image-input"
                  onChange={handleImageFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressingImg}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-blue-600" />
                  <span>{isCompressingImg ? 'Normalizing...' : 'Upload Photo'}</span>
                </button>
                <button
                  type="button"
                  data-testid="auto-generate-thumbnail-btn"
                  onClick={() => {
                    const thumb = generateSmartProductThumbnail({
                      name: formData.name || 'Kirana Product',
                      marathiName: formData.marathi_name,
                      category: formData.category,
                      unitType: formData.unit_type,
                    });
                    setFormData((prev) => ({ ...prev, image_url: thumb }));
                  }}
                  className="px-3 py-2 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-blue-100 transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Image</span>
                </button>
                {formData.image_url && (
                  <button
                    type="button"
                    data-testid="remove-product-image-btn"
                    onClick={() => setFormData({ ...formData, image_url: null })}
                    className="px-2.5 py-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold flex items-center gap-1 hover:bg-red-100 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>🗑️ Remove Image</span>
                  </button>
                )}
              </div>
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
              Cancel (Esc)
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="save-product-submit-btn"
              className="px-5 py-2 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md transition flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{productToEdit ? 'Update Product' : 'Add to Inventory'} [Ctrl+Enter]</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
