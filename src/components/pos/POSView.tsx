import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Product, Customer, ShopProfile, SalesInvoice, SaleItem, BusinessType, WALK_IN_CUSTOMER_ID } from '../../types';
import { LooseItemModal } from './LooseItemModal';
import { UpiCheckoutModal } from './UpiCheckoutModal';
import { UdhariCheckoutModal } from './UdhariCheckoutModal';
import { ReceiptModal } from './ReceiptModal';
import { usePosKeyboardShortcuts } from '../../hooks/usePosKeyboardShortcuts';
import { KeyboardShortcutsModal } from '../common/KeyboardShortcutsModal';
import { BillingService, CartItemInput, getLocalTodayDateString } from '../../services/billingService';
import { GallaService } from '../../services/gallaService';
import { BatchFifoService, ExpiryAlertItem } from '../../services/batchFifoService';
import { getActiveShopId } from '../../services/tenantManager';
import { filterProductsForBusiness } from '../../utils/businessFirewall';
import { kiranaDb, getActiveDb } from '../../db/db';
import { formatINR, roundCurrency, roundQty, toPaise, toRupees } from '../../utils/math';
import { playBarcodeBeep, playPaymentSuccessChime } from '../../utils/sound';
import {
  Search,
  ShoppingCart,
  QrCode,
  DollarSign,
  BookOpen,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Layers,
  ArrowRight,
  CheckCircle,
  Keyboard,
  Barcode,
  User,
  UserCheck,
  AlertTriangle,
  Tag,
  Clock,
  Calendar,
  RotateCcw,
  ChevronDown,
  Check,
  CheckCircle2,
  X,
  Undo2,
} from 'lucide-react';

interface StockWarningInfo {
  product: Product;
  qtyToAdd: number;
  explicitLineTotal?: number;
  currentStock: number;
  requestedQty: number;
}

interface POSViewProps {
  products: Product[];
  customers?: Customer[];
  shopProfile?: ShopProfile | null;
  onCheckoutComplete?: () => void;
}

interface CartItem {
  id: string;
  product: Product;
  qty: number;
  unit_selling_price: number;
  unit_purchase_cost: number;
  line_total: number;
  sale_rate_type?: 'RETAIL_CUSTOMER' | 'WHOLESALE_RETAILER';
}

interface CartTab {
  id: number;
  name: string;
  items: CartItem[];
  discountRoundoff: number;
  billDate: string; // YYYY-MM-DD (independent per tab, defaults to today)
  customerId?: string;
  createdAt?: number;
}

export const POSView: React.FC<POSViewProps> = ({
  products,
  customers = [],
  shopProfile,
  onCheckoutComplete,
}) => {
  const activeBusinessType: BusinessType = shopProfile?.business_type || 'KIRANA_RETAIL';
  const activeShopId = shopProfile?.id || getActiveShopId(activeBusinessType);
  const todayDateStr = getLocalTodayDateString();

  // Live direct fallback to active database for 100% reactive counter grid
  const liveDbProducts = useLiveQuery(() => getActiveDb(activeBusinessType).products.toArray(), [activeBusinessType], []);
  const effectiveProducts = (products && products.length > 0) ? products : (liveDbProducts || []);

  // Multi-Cart State (Bill 1, Bill 2, Bill 3) with independent billDate per tab
  const [carts, setCarts] = useState<CartTab[]>(() => {
    const today = getLocalTodayDateString();
    return [
      { id: 1, name: 'Bill 1', items: [], discountRoundoff: 0, billDate: today, createdAt: Date.now() },
      { id: 2, name: 'Bill 2', items: [], discountRoundoff: 0, billDate: today, createdAt: Date.now() },
      { id: 3, name: 'Bill 3', items: [], discountRoundoff: 0, billDate: today, createdAt: Date.now() },
    ];
  });

  const [activeCartId, setActiveCartId] = useState<number>(1);

  // Search query & selection
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modals state
  const [looseModalProduct, setLooseModalProduct] = useState<Product | null>(null);
  const [isLooseModalOpen, setIsLooseModalOpen] = useState(false);

  const [isUpiModalOpen, setIsUpiModalOpen] = useState(false);
  const [isUdhariModalOpen, setIsUdhariModalOpen] = useState(false);
  const [stockWarningProduct, setStockWarningProduct] = useState<StockWarningInfo | null>(null);
  const [isStockWarningOpen, setIsStockWarningOpen] = useState(false);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState<number>(0);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Receipt Modal state
  const [completedInvoice, setCompletedInvoice] = useState<SalesInvoice | null>(null);
  const [completedInvoiceItems, setCompletedInvoiceItems] = useState<SaleItem[]>([]);
  const [receiptCustomer, setReceiptCustomer] = useState<Customer | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // v4.0.0 Batch Shelf-life alerts
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlertItem[]>([]);

  useEffect(() => {
    BatchFifoService.getExpiryAlerts().then(setExpiryAlerts).catch(() => {});
  }, [products]);

  // Customer Selection on Bill (Walk-In or Registered Khata Customer)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(WALK_IN_CUSTOMER_ID);
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;
  const isWalkIn = !selectedCustomer || selectedCustomer.id === WALK_IN_CUSTOMER_ID;

  const filteredCustomers = customerSearchQuery.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
          c.phone.includes(customerSearchQuery)
      )
    : customers.filter((c) => c.id !== WALK_IN_CUSTOMER_ID).slice(0, 8);

  // Feedback notifications
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // 4-Second Undo Cash Checkout State (Iteration 4)
  const [undoCheckout, setUndoCheckout] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    items: CartItem[];
    customerId: string;
    billDate: string;
    secondsLeft: number;
  } | null>(null);

  useEffect(() => {
    if (!undoCheckout) return;
    if (undoCheckout.secondsLeft <= 0) {
      setUndoCheckout(null);
      return;
    }
    const timer = setTimeout(() => {
      setUndoCheckout((prev) => (prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [undoCheckout]);

  const handleUndoCashCheckout = async () => {
    if (!undoCheckout) return;
    const { invoiceId, items, customerId, billDate, invoiceNumber } = undoCheckout;
    setUndoCheckout(null);
    try {
      await GallaService.voidInvoice(invoiceId);
      setCarts((prev) =>
        prev.map((c) =>
          c.id === activeCartId
            ? { ...c, items, customerId, billDate }
            : c
        )
      );
      setIsReceiptModalOpen(false);
      setCompletedInvoice(null);
      setSuccessBanner(`↩️ Checkout for Bill #${invoiceNumber} undone! Items restored to active cart.`);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (e) {
      console.error('Failed to undo checkout:', e);
    }
  };

  const activeCart = carts.find((c) => c.id === activeCartId) || carts[0];
  const activeBillDate = activeCart.billDate || todayDateStr;
  const isBackdated = activeBillDate !== todayDateStr;

  const setActiveCartBillDate = (newDate: string) => {
    const cleanDate = newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate) ? newDate : todayDateStr;
    setCarts((prevCarts) =>
      prevCarts.map((cart) =>
        cart.id === activeCartId ? { ...cart, billDate: cleanDate } : cart
      )
    );
  };

  // Strictly filter products to the active business type via bulletproof business firewall
  const businessProducts = useMemo(
    () => filterProductsForBusiness(effectiveProducts, activeBusinessType),
    [effectiveProducts, activeBusinessType]
  );

  // Top-24 Fast-Tap Items (REQ-07 / Section 5.1): strictly from businessProducts
  const fastTapProducts = businessProducts.filter((p) => p.is_quick_tap).slice(0, 24);

  // 3-Way Instant Search (Barcode, Short Code, Bilingual Marathi/English Name & Hidden POS Search Keywords)
  const searchResults = searchQuery.trim()
    ? businessProducts
        .filter((p) => {
          const q = searchQuery.toLowerCase().trim();
          return (
            p.barcode === q ||
            p.short_code.toLowerCase() === q ||
            p.name.toLowerCase().includes(q) ||
            (p.marathi_name && p.marathi_name.toLowerCase().includes(q)) ||
            (p.search_keywords && p.search_keywords.toLowerCase().includes(q)) ||
            p.category.toLowerCase().includes(q)
          );
        })
        .slice(0, 8)
    : [];

  // 1-Click Re-Bill Listener: Loads cloned items from Sales Return into Active Cart
  useEffect(() => {
    const handleCartCloned = () => {
      const stored = localStorage.getItem('smart_kirana_reloaded_cart');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          localStorage.removeItem('smart_kirana_reloaded_cart');
          if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
            // Reconstruct cart items
            const newCartItems: CartItem[] = [];
            for (const item of parsed.items) {
              const matchedProd = products.find((p) => p.id === item.productId);
              if (matchedProd) {
                newCartItems.push({
                  id: `item-clone-${item.productId}-${Date.now()}`,
                  product: matchedProd,
                  qty: item.qty,
                  unit_purchase_cost: item.purchaseCost,
                  unit_selling_price: item.sellingPrice,
                  line_total: item.lineTotal,
                });
              }
            }

            if (newCartItems.length > 0) {
              setCarts((prev) =>
                prev.map((c) =>
                  c.id === activeCartId
                    ? {
                        ...c,
                        items: newCartItems,
                        customerId: parsed.customerId || WALK_IN_CUSTOMER_ID,
                      }
                    : c
                )
              );
              setSuccessBanner(`↩️ Loaded ${newCartItems.length} items from returned bill ready for re-billing!`);
              setTimeout(() => setSuccessBanner(null), 5000);
            }
          }
        } catch (e) {
          console.warn('Error reading reloaded cart:', e);
        }
      }
    };

    window.addEventListener('smart_kirana_cart_cloned', handleCartCloned);
    handleCartCloned();

    return () => {
      window.removeEventListener('smart_kirana_cart_cloned', handleCartCloned);
    };
  }, [products, activeCartId]);

  // Stock Warning Dialog Keyboard Listener (Enter to add, Escape to cancel)
  useEffect(() => {
    if (!isStockWarningOpen || !stockWarningProduct) return;
    const handleStockWarningKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const { product, qtyToAdd, explicitLineTotal } = stockWarningProduct;
        setIsStockWarningOpen(false);
        setStockWarningProduct(null);
        addItemToCart(product, qtyToAdd, explicitLineTotal, true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsStockWarningOpen(false);
        setStockWarningProduct(null);
      }
    };
    window.addEventListener('keydown', handleStockWarningKey);
    return () => window.removeEventListener('keydown', handleStockWarningKey);
  }, [isStockWarningOpen, stockWarningProduct]);

  // Cart Calculations
  const subtotal = activeCart.items.reduce(
    (sum, item) => sum + toPaise(item.line_total),
    0
  );
  const subtotalRupees = toRupees(subtotal);
  const roundoffRupees = activeCart.discountRoundoff;
  const grandTotalRupees = Math.max(0, roundCurrency(subtotalRupees - roundoffRupees));

  // Total Customer Savings against MRP (Vyapar standard loyalty feature)
  const totalMrpSavingsRupees = roundCurrency(
    activeCart.items.reduce((sum, item) => {
      const mrp = item.product.mrp || 0;
      if (mrp > item.unit_selling_price) {
        return sum + (mrp - item.unit_selling_price) * item.qty;
      }
      return sum;
    }, 0)
  );

  // Round-off Bargain Options (e.g. ₹504 -> round to ₹500, saves ₹4 discount)
  const suggestedRoundoff =
    subtotalRupees > 10 && subtotalRupees % 10 !== 0
      ? roundCurrency(subtotalRupees % 10)
      : subtotalRupees > 100 && subtotalRupees % 50 !== 0
      ? roundCurrency(subtotalRupees % 50)
      : 0;

  // Add Item to Active Cart (with Zero / Low Stock Warning & Offline Physical Permission)
  const addItemToCart = (
    product: Product,
    qtyToAdd: number = 1,
    explicitLineTotal?: number,
    bypassStockCheck: boolean = false
  ) => {
    // If loose item and no explicit qty/line total, open LooseItemModal
    if (
      (product.unit_type === 'KG_LOOSE' || product.unit_type === 'LTR') &&
      !explicitLineTotal
    ) {
      setLooseModalProduct(product);
      setIsLooseModalOpen(true);
      return;
    }

    const currentStock = product.current_stock ?? 0;
    const existingIndex = activeCart.items.findIndex(
      (i) => i.product.id === product.id
    );
    const existingQty = existingIndex >= 0 ? activeCart.items[existingIndex].qty : 0;
    const requestedTotal = roundQty(existingQty + qtyToAdd);

    // If product is out of stock (currentStock <= 0) or requested qty exceeds available stock,
    // prompt for cashier confirmation if physical stock is available offline on the shelf
    if (!bypassStockCheck && (currentStock <= 0 || requestedTotal > currentStock)) {
      setStockWarningProduct({
        product,
        qtyToAdd,
        explicitLineTotal,
        currentStock,
        requestedQty: requestedTotal,
      });
      setIsStockWarningOpen(true);
      return;
    }

    const effectivePrice = product.selling_price;

    setCarts((prevCarts) =>
      prevCarts.map((cart) => {
        if (cart.id !== activeCartId) return cart;

        const existingIndex = cart.items.findIndex(
          (i) => i.product.id === product.id
        );

        if (existingIndex >= 0) {
          const existing = cart.items[existingIndex];
          const newQty = roundQty(existing.qty + qtyToAdd);
          const newLineTotal = explicitLineTotal
            ? roundCurrency(existing.line_total + explicitLineTotal)
            : toRupees(Math.round(newQty * toPaise(effectivePrice)));

          const updatedItems = [...cart.items];
          updatedItems[existingIndex] = {
            ...existing,
            qty: newQty,
            unit_selling_price: effectivePrice,
            line_total: newLineTotal,
            sale_rate_type: 'RETAIL_CUSTOMER',
          };
          return { ...cart, items: updatedItems };
        } else {
          const itemQty = roundQty(qtyToAdd);
          const lineTotal = explicitLineTotal
            ? explicitLineTotal
            : toRupees(Math.round(itemQty * toPaise(effectivePrice)));

          const newItem: CartItem = {
            id: `ci-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            product,
            qty: itemQty,
            unit_selling_price: effectivePrice,
            unit_purchase_cost: product.purchase_price,
            line_total: lineTotal,
            sale_rate_type: 'RETAIL_CUSTOMER',
          };
          return { ...cart, items: [...cart.items, newItem] };
        }
      })
    );

    setSearchQuery('');
    playBarcodeBeep();
  };

  // Adjust item quantity in cart
  const adjustItemQty = (itemId: string, delta: number) => {
    setCarts((prevCarts) =>
      prevCarts.map((cart) => {
        if (cart.id !== activeCartId) return cart;

        const updated = cart.items
          .map((item) => {
            if (item.id !== itemId) return item;
            const step =
              item.product.unit_type === 'KG_LOOSE' ||
              item.product.unit_type === 'LTR'
                ? 0.25
                : 1;
            const newQty = roundQty(item.qty + delta * step);
            if (newQty <= 0) return null;

            const unitPrice = item.unit_selling_price || item.product.selling_price;
            const newLineTotal = toRupees(
              Math.round(newQty * toPaise(unitPrice))
            );
            return { ...item, qty: newQty, line_total: newLineTotal };
          })
          .filter(Boolean) as CartItem[];

        return { ...cart, items: updated };
      })
    );
  };

  // Remove item from cart
  const removeItemFromCart = (itemId: string) => {
    setCarts((prevCarts) =>
      prevCarts.map((cart) => {
        if (cart.id !== activeCartId) return cart;
        return {
          ...cart,
          items: cart.items.filter((i) => i.id !== itemId),
        };
      })
    );
  };

  // Clear current active cart (resets items, discount, and billDate back to Today)
  const clearCurrentCart = () => {
    const today = getLocalTodayDateString();
    setCarts((prevCarts) =>
      prevCarts.map((cart) =>
        cart.id === activeCartId
          ? { ...cart, items: [], discountRoundoff: 0, billDate: today }
          : cart
      )
    );
  };

  // 1-Click Bargain Round-Off (REQ-09 / AT-04)
  const applyRoundoff = (amount: number) => {
    setCarts((prevCarts) =>
      prevCarts.map((cart) =>
        cart.id === activeCartId
          ? { ...cart, discountRoundoff: roundCurrency(amount) }
          : cart
      )
    );
  };

  // (1) Cash Checkout (F8) - Walk-in or Selected Customer
  const handleWalkInCashCheckout = async () => {
    if (activeCart.items.length === 0) return;

    try {
      const itemsPayload: CartItemInput[] = activeCart.items.map((i) => ({
        product: i.product,
        qty: i.qty,
        unit_selling_price: i.unit_selling_price,
        unit_purchase_cost: i.unit_purchase_cost,
        line_total: i.line_total,
        sale_rate_type: 'RETAIL_CUSTOMER',
        is_loan_funded: i.product.is_loan_funded,
      }));

      const billDateToUse = activeBillDate;

      const res = await BillingService.executeCheckout({
        customerId: selectedCustomerId,
        items: itemsPayload,
        subtotalAmount: subtotalRupees,
        discountRoundoff: roundoffRupees,
        paymentMode: 'CASH',
        amountPaidNow: grandTotalRupees,
        udhariAdded: 0,
        shopId: activeShopId,
        businessType: activeBusinessType,
        billDate: billDateToUse,
      });

      const cartItemsToPreserve = [...activeCart.items];
      const customerToPreserve = selectedCustomerId;

      clearCurrentCart();
      playPaymentSuccessChime();
      setCompletedInvoice(res.invoice);
      setCompletedInvoiceItems(res.saleItems);
      setReceiptCustomer(selectedCustomer);
      setIsReceiptModalOpen(true);
      setSelectedCustomerId(WALK_IN_CUSTOMER_ID);

      // Trigger 4-Second Mistake-Proofing Undo Toast Bar (Iteration 4)
      setUndoCheckout({
        invoiceId: res.invoice.id,
        invoiceNumber: res.invoice.invoice_number,
        amount: grandTotalRupees,
        items: cartItemsToPreserve,
        customerId: customerToPreserve,
        billDate: billDateToUse,
        secondsLeft: 4,
      });

      if (onCheckoutComplete) onCheckoutComplete();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Cash Checkout failed');
    }
  };

  // (2) UPI Payment Confirmation
  const handleUpiConfirmed = async () => {
    if (activeCart.items.length === 0) return;

    try {
      const itemsPayload: CartItemInput[] = activeCart.items.map((i) => ({
        product: i.product,
        qty: i.qty,
        unit_selling_price: i.unit_selling_price,
        unit_purchase_cost: i.unit_purchase_cost,
        line_total: i.line_total,
        sale_rate_type: 'RETAIL_CUSTOMER',
        is_loan_funded: i.product.is_loan_funded,
      }));

      const res = await BillingService.executeCheckout({
        customerId: selectedCustomerId,
        items: itemsPayload,
        subtotalAmount: subtotalRupees,
        discountRoundoff: roundoffRupees,
        paymentMode: 'UPI',
        amountPaidNow: grandTotalRupees,
        udhariAdded: 0,
        shopId: activeShopId,
        businessType: activeBusinessType,
        billDate: activeBillDate,
      });

      clearCurrentCart();
      playPaymentSuccessChime();
      setCompletedInvoice(res.invoice);
      setCompletedInvoiceItems(res.saleItems);
      setReceiptCustomer(selectedCustomer);
      setIsReceiptModalOpen(true);
      setIsUpiModalOpen(false);
      setSuccessBanner(
        `Invoice ${res.invoice.invoice_number} saved! UPI Payment received ${formatINR(grandTotalRupees)}`
      );
      setSelectedCustomerId(WALK_IN_CUSTOMER_ID);
      setTimeout(() => setSuccessBanner(null), 4000);
      if (onCheckoutComplete) onCheckoutComplete();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'UPI Checkout failed');
    }
  };

  // (3) Udhari / Split Payment Confirmation
  const handleUdhariConfirmed = async (params: {
    customerId: string;
    mode: 'UDHARI_FULL' | 'SPLIT_PARTIAL';
    amountPaidNow: number;
    udhariAdded: number;
  }) => {
    if (activeCart.items.length === 0) return;

    try {
      const itemsPayload: CartItemInput[] = activeCart.items.map((i) => ({
        product: i.product,
        qty: i.qty,
        unit_selling_price: i.unit_selling_price,
        unit_purchase_cost: i.unit_purchase_cost,
        line_total: i.line_total,
        sale_rate_type: 'RETAIL_CUSTOMER',
        is_loan_funded: i.product.is_loan_funded,
      }));

      const res = await BillingService.executeCheckout({
        customerId: params.customerId,
        items: itemsPayload,
        subtotalAmount: subtotalRupees,
        discountRoundoff: roundoffRupees,
        paymentMode: params.mode,
        amountPaidNow: params.amountPaidNow,
        udhariAdded: params.udhariAdded,
        notes: params.amountPaidNow > 0 ? 'CASH' : undefined,
        shopId: activeShopId,
        businessType: activeBusinessType,
        billDate: activeBillDate,
      });

      clearCurrentCart();
      playPaymentSuccessChime();
      const matchedCust = customers.find((c) => c.id === params.customerId) || null;
      setCompletedInvoice(res.invoice);
      setCompletedInvoiceItems(res.saleItems);
      setReceiptCustomer(matchedCust);
      setIsReceiptModalOpen(true);
      setIsUdhariModalOpen(false);
      setSuccessBanner(
        `Invoice ${res.invoice.invoice_number} saved! ${
          params.udhariAdded > 0
            ? `Added ${formatINR(params.udhariAdded)} to Udhari`
            : `Paid ${formatINR(params.amountPaidNow)}`
        }`
      );
      setTimeout(() => setSuccessBanner(null), 4000);
      if (onCheckoutComplete) onCheckoutComplete();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Udhari Checkout failed');
    }
  };

  // Zero-Mouse Keyboard Shortcuts Engine
  usePosKeyboardShortcuts({
    onFocusSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onClearSearch: () => {
      setSearchQuery('');
      setSearchHighlightIndex(0);
    },
    onSelectNextProduct: () => {
      if (searchResults.length > 0) {
        setSearchHighlightIndex((prev) => (prev + 1) % searchResults.length);
      }
    },
    onSelectPrevProduct: () => {
      if (searchResults.length > 0) {
        setSearchHighlightIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
      }
    },
    onConfirmProductSearch: () => {
      if (searchResults.length > 0) {
        const target = searchResults[searchHighlightIndex] || searchResults[0];
        if (target) addItemToCart(target);
      }
    },
    onIncrementQty: () => {
      if (activeCart.items.length > 0) {
        const last = activeCart.items[activeCart.items.length - 1];
        adjustItemQty(last.id, 1);
      }
    },
    onDecrementQty: () => {
      if (activeCart.items.length > 0) {
        const last = activeCart.items[activeCart.items.length - 1];
        adjustItemQty(last.id, -1);
      }
    },
    onRemoveCartItem: () => {
      if (activeCart.items.length > 0) {
        const last = activeCart.items[activeCart.items.length - 1];
        removeItemFromCart(last.id);
      }
    },
    onToggleDiscount: () => {
      if (activeCart.discountRoundoff > 0) {
        applyRoundoff(0);
      } else {
        applyRoundoff(suggestedRoundoff || (subtotalRupees % 10) || 5);
      }
    },
    onSwitchCart: () => {
      setActiveCartId((prev) => (prev % 3) + 1);
    },
    onCashCheckout: () => {
      if (activeCart.items.length > 0) {
        handleWalkInCashCheckout();
      }
    },
    onUpiCheckout: () => {
      if (activeCart.items.length > 0) {
        setIsUpiModalOpen(true);
      }
    },
    onUdhariCheckout: () => {
      if (activeCart.items.length > 0) {
        setIsUdhariModalOpen(true);
      }
    },
    onToggleShortcutsModal: () => {
      setIsShortcutsModalOpen((prev) => !prev);
    },
    onCloseActiveModal: () => {
      if (isReceiptModalOpen) {
        setIsReceiptModalOpen(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return true;
      }
      if (isLooseModalOpen) {
        setIsLooseModalOpen(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return true;
      }
      if (isUpiModalOpen) {
        setIsUpiModalOpen(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return true;
      }
      if (isUdhariModalOpen) {
        setIsUdhariModalOpen(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return true;
      }
      if (isStockWarningOpen) {
        setIsStockWarningOpen(false);
        setStockWarningProduct(null);
        return true;
      }
      if (isCustomerSelectorOpen) {
        setIsCustomerSelectorOpen(false);
        return true;
      }
      if (isShortcutsModalOpen) {
        setIsShortcutsModalOpen(false);
        return true;
      }
      return false;
    },
  });

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* LEFT PANE: Search Bar & Fast-Tap 24 Grid */}
      <div className="flex-1 flex flex-col p-3 sm:p-5 overflow-y-auto space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
        {/* Success Banner */}
        {successBanner && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{successBanner}</span>
          </div>
        )}

        {/* v4.0.0 Shelf-Life & Expiry Alert Banner */}
        {expiryAlerts.length > 0 && (
          <div
            data-testid="pos-expiry-alert-banner"
            className="p-3 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 rounded-xl text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 animate-bounce" />
              <span>
                ⚠️ Shelf-Life Notice: {expiryAlerts[0].product.name} ({expiryAlerts[0].batch.batch_code}) has{' '}
                {expiryAlerts[0].batch.remaining_qty} {expiryAlerts[0].batch.unit_type}{' '}
                {expiryAlerts[0].isExpired
                  ? 'EXPIRED! Write off via Spoilage.'
                  : `expiring in ${expiryAlerts[0].hoursRemaining}h! Prioritize sales.`}
                {expiryAlerts.length > 1 && ` (+${expiryAlerts.length - 1} more batch alerts)`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => addItemToCart(expiryAlerts[0].product)}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-extrabold shrink-0"
            >
              + Sell Batch Item
            </button>
          </div>
        )}

        {/* 3-Way Instant Search Bar (REQ-07 / REQ-24) */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              data-testid="pos-search-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchHighlightIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (searchResults.length > 0) {
                    setSearchHighlightIndex((prev) => (prev + 1) % searchResults.length);
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (searchResults.length > 0) {
                    setSearchHighlightIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
                  }
                } else if (e.key === 'Enter' && searchResults.length > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  const target = searchResults[searchHighlightIndex] || searchResults[0];
                  if (target) addItemToCart(target);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setSearchQuery('');
                  setSearchHighlightIndex(0);
                }
              }}
              placeholder="Search by Barcode, Short Code (e.g. PG5, TS1), or Name... [F2 / /]"
              className="w-full pl-10 pr-20 py-3 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-700 dark:focus:border-emerald-500 rounded-xl text-sm font-medium focus:outline-hidden shadow-xs transition"
            />
            <div className="absolute right-3 flex items-center gap-1.5 text-xs text-slate-400">
              <kbd className="hidden sm:inline px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-mono">
                F2
              </kbd>
              <Barcode className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Instant Search Dropdown Popover */}
          {searchResults.length > 0 && (
            <div
              data-testid="search-results-dropdown"
              className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 z-30 overflow-hidden"
            >
              {searchResults.map((prod, idx) => {
                const isSelected = idx === searchHighlightIndex;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => addItemToCart(prod)}
                    className={`w-full p-3 text-left flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-blue-100/90 dark:bg-slate-800 ring-2 ring-blue-500 font-bold'
                        : 'hover:bg-blue-50/60 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white text-sm">
                        {prod.name}
                      </span>
                      <span className="ml-2 font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                        {prod.short_code}
                      </span>
                      {isSelected && (
                        <kbd className="ml-2 text-[10px] bg-blue-200 dark:bg-slate-700 text-blue-900 dark:text-slate-200 px-1.5 py-0.5 rounded font-mono">
                          Enter ↵
                        </kbd>
                      )}
                      {prod.mrp > prod.selling_price && (
                        <span className="ml-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                          Save ₹{(prod.mrp - prod.selling_price).toFixed(0)}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline gap-1 justify-end">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {formatINR(prod.selling_price)}
                        </span>
                        {prod.mrp > prod.selling_price && (
                          <span className="text-[11px] text-slate-400 line-through">
                            ₹{prod.mrp}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        {prod.current_stock <= 0 ? (
                          <span className="text-rose-500 font-bold">Out of stock</span>
                        ) : prod.current_stock <= prod.low_stock_threshold ? (
                          <span className="text-amber-500 font-bold">Low: {prod.current_stock}</span>
                        ) : (
                          `Stk: ${prod.current_stock}`
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Top-24 Fast-Tap Visual Grid (REQ-07 / Section 5.1 Pareto Principle) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>Top-24 Fast-Tap Counter Grid (1-Tap Billing)</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 hidden sm:inline">80/20 Daily Velocity • Fast Retail</span>
            </div>
          </div>

          <div
            data-testid="fast-tap-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"
          >
            {fastTapProducts.map((prod) => {
              const unitShort =
                prod.unit_type === 'KG_LOOSE'
                  ? 'kg'
                  : prod.unit_type === 'LTR'
                  ? 'L'
                  : prod.unit_type === 'PACK'
                  ? 'pack'
                  : prod.unit_type === 'PLATE'
                  ? 'plate'
                  : prod.unit_type === 'DOZEN'
                  ? 'doz'
                  : 'pc';

              const catInitial = (prod.category || prod.name || 'K').trim().charAt(0).toUpperCase();

              const displayName =
                prod.marathi_name && !prod.name.includes(prod.marathi_name)
                  ? `${prod.marathi_name} (${prod.name})`
                  : prod.name;

              return (
                <button
                  key={prod.id}
                  type="button"
                  data-testid={`fast-tap-${prod.short_code}`}
                  onClick={() => addItemToCart(prod)}
                  className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-500 dark:hover:border-orange-500 rounded-xl shadow-2xs hover:shadow-xs transition text-left flex flex-col justify-between group active:scale-[0.98]"
                >
                  {/* Top & Center: Uniform 160x160px Square Thumbnail Image + Bilingual Marathi/English Name */}
                  <div className="flex items-center gap-2.5">
                    {prod.image_url ? (
                      <img
                        src={prod.image_url}
                        alt={displayName}
                        data-testid={`fast-tap-img-${prod.id}`}
                        className="w-11 h-11 aspect-square rounded-lg object-contain border border-slate-200 dark:border-slate-700 shrink-0 bg-white"
                      />
                    ) : (
                      <div
                        data-testid={`fast-tap-avatar-${prod.id}`}
                        className="w-11 h-11 aspect-square rounded-lg bg-gradient-to-br from-blue-50 to-orange-50 dark:from-slate-800 dark:to-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0 group-hover:border-orange-300 transition"
                      >
                        <span className="text-xs font-black text-blue-800 dark:text-orange-400">
                          {catInitial}
                        </span>
                        <span className="text-[8px] font-semibold uppercase text-slate-400">
                          {unitShort}
                        </span>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                        {displayName}
                      </h3>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate mt-0.5">
                        {prod.category}
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Prominent Selling Price Badge + Stock / Low-Stock Indicator Pill */}
                  <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-extrabold text-blue-900 dark:text-emerald-400">
                        {formatINR(prod.selling_price)}
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                          /{unitShort}
                        </span>
                      </span>
                      {prod.mrp > prod.selling_price && (
                        <span className="text-[10px] text-slate-400 line-through">
                          ₹{prod.mrp}
                        </span>
                      )}
                    </div>
                    <div>
                      {prod.current_stock <= 0 ? (
                        <span className="text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded-md">
                          Out
                        </span>
                      ) : prod.current_stock <= prod.low_stock_threshold ? (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded-md">
                          Low: {prod.current_stock}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400 bg-slate-50 dark:bg-slate-800/70 px-1.5 py-0.5 rounded-md">
                          {prod.current_stock} {unitShort}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANE: Multi-Cart Tabs, Active Cart, Bargain Chip & Checkout */}
      <div className="w-full lg:w-[420px] xl:w-[460px] bg-white dark:bg-slate-900 flex flex-col h-full border-t lg:border-t-0 border-slate-200 dark:border-slate-800 shadow-md">
        {/* Multi-Cart Tabs (Hold Bill: Cart 1, Cart 2, Cart 3 - REQ-07 / Iteration 4 Abandonment Tracking) */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {carts.map((cart) => {
              const isActive = cart.id === activeCartId;
              const itemCount = cart.items.length;
              const elapsedMinutes = Math.floor(
                (Date.now() - (cart.createdAt || Date.now())) / 60000
              );
              const isHeldWithItems = !isActive && itemCount > 0;
              const isTabBackdated = Boolean(cart.billDate && cart.billDate !== todayDateStr);

              return (
                <button
                  key={cart.id}
                  type="button"
                  data-testid={`cart-tab-${cart.id}`}
                  onClick={() => setActiveCartId(cart.id)}
                  title={
                    itemCount > 0
                      ? `${cart.name}: ${itemCount} items, held ${elapsedMinutes}m ago${isTabBackdated ? ` (Bill Date: ${cart.billDate})` : ''}`
                      : `${cart.name}${isTabBackdated ? ` (Bill Date: ${cart.billDate})` : ''}`
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-blue-800 text-white shadow-xs'
                      : isHeldWithItems
                      ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{cart.name}</span>
                  {isTabBackdated && (
                    <Calendar
                      data-testid={`cart-tab-backdated-${cart.id}`}
                      className={`w-3 h-3 shrink-0 ${isActive ? 'text-amber-300' : 'text-amber-500'}`}
                    />
                  )}
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      isActive
                        ? 'bg-orange-500 text-white'
                        : isHeldWithItems
                        ? 'bg-amber-500 text-white animate-pulse'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {itemCount}
                    {isHeldWithItems && elapsedMinutes > 0 ? ` • ${elapsedMinutes}m` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
            F4: Switch Cart
          </span>
        </div>

        {/* Held Cart Abandonment Alert (Iteration 4) */}
        {carts.some((c) => c.id !== activeCartId && c.items.length > 0) && (
          <div
            data-testid="held-cart-alert"
            className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between font-semibold"
          >
            <div className="flex items-center gap-1.5 truncate">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                Held bills waiting:{' '}
                {carts
                  .filter((c) => c.id !== activeCartId && c.items.length > 0)
                  .map((c) => `${c.name} (${c.items.length} items)`)
                  .join(', ')}
              </span>
            </div>
            <span className="text-[10px] opacity-75 shrink-0 ml-1">F4: Switch</span>
          </div>
        )}

        {/* Customer Selector on Active Bill (Vyapar Standard: Walk-In or Named Customer) */}
        <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 relative">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={`p-1.5 rounded-lg shrink-0 ${
                isWalkIn
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
              }`}
            >
              {isWalkIn ? <User className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {selectedCustomer?.name || 'Walk-in Customer'}
                </span>
                {selectedCustomer && selectedCustomer.current_udhari_balance > 0 && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                    Khata: ₹{selectedCustomer.current_udhari_balance}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {isWalkIn
                  ? 'Counter Sale (Cash / UPI)'
                  : `Ph: ${selectedCustomer.phone} • Limit: ₹${selectedCustomer.credit_limit}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsCustomerSelectorOpen(!isCustomerSelectorOpen)}
              className="px-2 py-1 bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition shadow-2xs"
            >
              <span>{isWalkIn ? 'Select Customer' : 'Change'}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {!isWalkIn && (
              <button
                type="button"
                onClick={() => setSelectedCustomerId(WALK_IN_CUSTOMER_ID)}
                className="text-[10px] text-slate-400 hover:text-red-500 px-1 py-0.5 rounded"
                title="Switch back to Walk-In"
              >
                Clear
              </button>
            )}
          </div>

          {/* Dropdown Customer Picker */}
          {isCustomerSelectorOpen && (
            <div className="absolute top-full left-0 right-0 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-b-xl p-2 animate-in fade-in zoom-in-95 duration-100">
              <input
                type="text"
                autoFocus
                placeholder="Search customer by name or phone..."
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none mb-2"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(WALK_IN_CUSTOMER_ID);
                    setIsCustomerSelectorOpen(false);
                    setCustomerSearchQuery('');
                  }}
                  className={`w-full p-2 text-left rounded-lg text-xs flex items-center justify-between ${
                    isWalkIn
                      ? 'bg-blue-50 dark:bg-blue-950/60 font-bold text-blue-700 dark:text-blue-300'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>Walk-in Customer (Standard)</span>
                  {isWalkIn && <Check className="w-3.5 h-3.5" />}
                </button>
                {filteredCustomers.map((cust) => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(cust.id);
                      setIsCustomerSelectorOpen(false);
                      setCustomerSearchQuery('');
                    }}
                    className={`w-full p-2 text-left rounded-lg text-xs flex items-center justify-between ${
                      selectedCustomerId === cust.id
                        ? 'bg-blue-50 dark:bg-blue-950/60 font-bold text-blue-700 dark:text-blue-300'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{cust.name}</div>
                      <div className="text-[10px] text-slate-400">Ph: {cust.phone}</div>
                    </div>
                    {cust.current_udhari_balance > 0 && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                        ₹{cust.current_udhari_balance} Udhari
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Compact Bill Date / Backdated Billing Selector Row */}
        <div
          data-testid="pos-bill-date-row"
          className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 transition-colors ${
            isBackdated
              ? 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-300 dark:border-amber-800/80'
              : 'bg-slate-50/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar
              className={`w-3.5 h-3.5 shrink-0 ${
                isBackdated
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
              Bill Date:
            </span>
            {isBackdated ? (
              <span
                data-testid="backdated-bill-badge"
                className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 truncate"
              >
                Backdated / Previous Bill
              </span>
            ) : (
              <span
                data-testid="today-bill-badge"
                className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
              >
                Today
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="date"
              aria-label="Bill Date"
              data-testid="pos-bill-date-input"
              value={activeBillDate}
              max={todayDateStr}
              onChange={(e) => setActiveCartBillDate(e.target.value || todayDateStr)}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border focus:outline-hidden cursor-pointer transition ${
                isBackdated
                  ? 'bg-amber-100/80 dark:bg-amber-950/70 border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-200 focus:border-amber-500'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:border-blue-600 dark:focus:border-emerald-500'
              }`}
            />
            {isBackdated && (
              <button
                type="button"
                data-testid="reset-bill-date-btn"
                onClick={() => setActiveCartBillDate(todayDateStr)}
                title="Reset Bill Date to Today"
                className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white transition flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset to Today</span>
              </button>
            )}
          </div>
        </div>

        {/* Cart Items List */}
        <div
          data-testid="cart-items-container"
          className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[220px]"
        >
          {activeCart.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500 space-y-2">
              <ShoppingCart className="w-10 h-10 text-slate-300 dark:text-slate-600 stroke-1" />
              <p className="text-xs font-semibold">Active Cart is Empty</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-[200px]">
                Tap any Fast-Tap item or search above to begin billing
              </p>
            </div>
          ) : (
            activeCart.items.map((item) => (
              <div
                key={item.id}
                data-testid={`cart-row-${item.product.id}`}
                className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {item.product.name}
                  </h4>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span>{formatINR(item.unit_selling_price)}</span>
                    <span>&times;</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {item.qty}{' '}
                      {item.product.unit_type === 'KG_LOOSE'
                        ? 'kg'
                        : item.product.unit_type === 'LTR'
                        ? 'L'
                        : ''}
                    </span>
                  </div>
                </div>

                {/* Touch Stepper [-] & [+] (44px target - REQ-26) */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adjustItemQty(item.id, -1)}
                    className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-sm transition"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-9 text-center text-xs font-bold text-slate-900 dark:text-white">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustItemQty(item.id, 1)}
                    className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-sm transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-right min-w-[65px]">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-emerald-400">
                    {formatINR(item.line_total)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItemFromCart(item.id)}
                    className="block ml-auto text-slate-400 hover:text-red-600 p-0.5 mt-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bill Summary, Bargain Chip & Checkout Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          {/* Total MRP Savings Loyalty Banner (Vyapar Standard) */}
          {totalMrpSavingsRupees > 0 && (
            <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-2 rounded-xl text-xs">
              <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold">
                <Tag className="w-3.5 h-3.5" />
                <span>Customer Savings on MRP:</span>
              </div>
              <span className="font-extrabold text-emerald-700 dark:text-emerald-300">
                {formatINR(totalMrpSavingsRupees)} SAVED
              </span>
            </div>
          )}

          {/* Bargain Round-Off Chip (REQ-09 / AT-04 / Section 5.1) */}
          {suggestedRoundoff > 0 && roundoffRupees === 0 && (
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-2 rounded-xl text-xs">
              <span className="text-amber-800 dark:text-amber-300 font-semibold">1-Click Bargain Round-Off:</span>
              <button
                type="button"
                data-testid="bargain-roundoff-btn"
                onClick={() => applyRoundoff(suggestedRoundoff)}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition"
              >
                Round to {formatINR(subtotalRupees - suggestedRoundoff)} (-{formatINR(suggestedRoundoff)})
              </button>
            </div>
          )}

          {/* Subtotal, Roundoff, Grand Total */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{formatINR(subtotalRupees)}</span>
            </div>

            {roundoffRupees > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                <span>Bargain Discount:</span>
                <span>-{formatINR(roundoffRupees)}</span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Grand Total:</span>
              <span
                data-testid="pos-grand-total"
                className="text-2xl font-extrabold text-blue-900 dark:text-emerald-400"
              >
                {formatINR(grandTotalRupees)}
              </span>
            </div>
          </div>

          {/* Checkout Action Buttons (REQ-09) */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {/* Cash Checkout (F8) */}
            <button
              type="button"
              disabled={activeCart.items.length === 0}
              data-testid="cash-checkout-btn"
              onClick={handleWalkInCashCheckout}
              className="py-3 px-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-md transition flex flex-col items-center justify-center gap-0.5 active:scale-95"
            >
              <div className="flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                <span>CASH PAID (F8)</span>
              </div>
              <span className="text-[10px] opacity-80">Instant Walk-In</span>
            </button>

            {/* Udhari Checkout (F9) */}
            <button
              type="button"
              disabled={activeCart.items.length === 0}
              data-testid="udhari-checkout-btn"
              onClick={() => setIsUdhariModalOpen(true)}
              className="py-3 px-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-md transition flex flex-col items-center justify-center gap-0.5 active:scale-95"
            >
              <div className="flex items-center gap-1">
                <BookOpen className="w-4 h-4" />
                <span>ADD UDHARI (F9)</span>
              </div>
              <span className="text-[10px] opacity-80">Khata / Split</span>
            </button>

            {/* Dynamic UPI QR Modal Button (F7) */}
            <button
              type="button"
              disabled={activeCart.items.length === 0}
              data-testid="upi-checkout-btn"
              onClick={() => setIsUpiModalOpen(true)}
              className="col-span-2 py-2.5 bg-blue-800 hover:bg-blue-900 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4 text-orange-400" />
              <span>UPI Dynamic QR Code Checkout (F7)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Loose Item Fractional & Reverse Price Calculator Modal (REQ-08) */}
      <LooseItemModal
        isOpen={isLooseModalOpen}
        onClose={() => setIsLooseModalOpen(false)}
        product={looseModalProduct}
        onConfirm={(prod, qty, lineTotal) => {
          addItemToCart(prod, qty, lineTotal);
          setIsLooseModalOpen(false);
        }}
      />

      {/* Dynamic UPI QR Modal (REQ-09 / REQ-30) */}
      <UpiCheckoutModal
        isOpen={isUpiModalOpen}
        onClose={() => setIsUpiModalOpen(false)}
        amount={grandTotalRupees}
        shopName={shopProfile?.shop_name || 'Smart Kirana'}
        shopVpa={shopProfile?.upi_vpa || 'kirana@upi'}
        onPaymentConfirmed={handleUpiConfirmed}
      />

      {/* Udhari & Split Payment Modal (REQ-09 / REQ-29) */}
      <UdhariCheckoutModal
        isOpen={isUdhariModalOpen}
        onClose={() => setIsUdhariModalOpen(false)}
        grandTotal={grandTotalRupees}
        customers={customers}
        initialCustomerId={selectedCustomerId !== WALK_IN_CUSTOMER_ID ? selectedCustomerId : undefined}
        onConfirm={handleUdhariConfirmed}
      />

      {/* Thermal Slip & Digital Receipt Print Modal */}
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        invoice={completedInvoice}
        items={completedInvoiceItems}
        profile={shopProfile ?? null}
        customer={receiptCustomer}
      />



      {/* Low / Zero Stock Warning Modal with Offline Physical Stock Permission */}
      {isStockWarningOpen && stockWarningProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-warning-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          data-testid="stock-warning-modal"
        >
          <div className="bg-white dark:bg-slate-900 border-2 border-amber-500 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl shrink-0 border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 id="stock-warning-title" className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>⚠️ कमी स्टॉक / माल शिल्लक नाही</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Stock Availability Warning &amp; Physical Stock Permission
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsStockWarningOpen(false);
                  setStockWarningProduct(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product & Stock Overview Card */}
            <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {stockWarningProduct.product.marathi_name
                    ? `${stockWarningProduct.product.marathi_name} (${stockWarningProduct.product.name})`
                    : stockWarningProduct.product.name}
                </span>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  {formatINR(stockWarningProduct.product.selling_price)} / {stockWarningProduct.product.unit_type}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-amber-200/60 dark:border-amber-800/40">
                <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span className="text-[11px] text-slate-500 block">सिस्टीम स्टॉक (System Stock):</span>
                  <span className={`font-extrabold text-xs ${stockWarningProduct.currentStock <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {stockWarningProduct.currentStock <= 0
                      ? '0 (Out of Stock / निरंक)'
                      : `${stockWarningProduct.currentStock} ${stockWarningProduct.product.unit_type}`}
                  </span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span className="text-[11px] text-slate-500 block">बिलात जोडायचा (Add to Bill):</span>
                  <span className="font-extrabold text-xs text-blue-600 dark:text-blue-400">
                    +{stockWarningProduct.qtyToAdd} {stockWarningProduct.product.unit_type}
                    {stockWarningProduct.requestedQty > stockWarningProduct.qtyToAdd && ` (Total: ${stockWarningProduct.requestedQty})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Permission explanation in Marathi & English */}
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 leading-relaxed">
              <p className="font-semibold text-slate-900 dark:text-white mb-1">
                🛍️ दुकानात प्रत्यक्ष माल उपलब्ध आहे का?
              </p>
              <p>
                सिस्टीममधील नोंद संपलेली असली, तरी तुमच्या दुकानाच्या शेल्फवर हा माल प्रत्यक्ष उपलब्ध असल्यास आपण बिलामध्ये हा माल जोडून ग्राहकाला बिल देऊ शकता.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                (If you have physical inventory on shelf, confirm to add to bill anyway.)
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                data-testid="cancel-add-zero-stock-btn"
                onClick={() => {
                  setIsStockWarningOpen(false);
                  setStockWarningProduct(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition"
              >
                रद्द करा / Cancel (Esc)
              </button>
              <button
                type="button"
                data-testid="confirm-add-zero-stock-btn"
                onClick={() => {
                  const { product, qtyToAdd, explicitLineTotal } = stockWarningProduct;
                  setIsStockWarningOpen(false);
                  setStockWarningProduct(null);
                  addItemToCart(product, qtyToAdd, explicitLineTotal, true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>होय, बिलात जोडा (Enter)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4-Second Mistake-Proofing Undo Cash Checkout Toast Bar (Iteration 4) */}
      {undoCheckout && (
        <div
          data-testid="undo-checkout-toast"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom duration-200 border border-slate-700 dark:border-slate-300"
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400 dark:text-emerald-600" />
            <div>
              <span className="font-bold text-sm">
                Cash Bill #{undoCheckout.invoiceNumber} Paid ({formatINR(undoCheckout.amount)})
              </span>
              <span className="text-xs opacity-75 ml-2">({undoCheckout.secondsLeft}s left to undo)</span>
            </div>
          </div>
          <button
            type="button"
            data-testid="undo-checkout-btn"
            onClick={handleUndoCashCheckout}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Undo2 className="w-4 h-4" /> Undo Checkout
          </button>
        </div>
      )}

      {/* POS Keyboard Shortcuts Cheat Sheet Modal (?) */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
};
