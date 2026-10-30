import React, { useState, useEffect, useRef } from 'react';
import { Product, Customer, ShopProfile, SalesInvoice, SaleItem, WALK_IN_CUSTOMER_ID } from '../../types';
import { LooseItemModal } from './LooseItemModal';
import { UpiCheckoutModal } from './UpiCheckoutModal';
import { UdhariCheckoutModal } from './UdhariCheckoutModal';
import { ReceiptModal } from './ReceiptModal';
import { BillingService, CartItemInput } from '../../services/billingService';
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
} from 'lucide-react';

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
}

interface CartTab {
  id: number;
  name: string;
  items: CartItem[];
  discountRoundoff: number;
}

export const POSView: React.FC<POSViewProps> = ({
  products,
  customers = [],
  shopProfile,
  onCheckoutComplete,
}) => {
  // Multi-Cart State: Cart 1, Cart 2, Cart 3 (REQ-07 / AT-06)
  const [carts, setCarts] = useState<CartTab[]>([
    { id: 1, name: 'Bill 1', items: [], discountRoundoff: 0 },
    { id: 2, name: 'Bill 2', items: [], discountRoundoff: 0 },
    { id: 3, name: 'Bill 3', items: [], discountRoundoff: 0 },
  ]);
  const [activeCartId, setActiveCartId] = useState<number>(1);

  // Search query & selection
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modals state
  const [looseModalProduct, setLooseModalProduct] = useState<Product | null>(null);
  const [isLooseModalOpen, setIsLooseModalOpen] = useState(false);

  const [isUpiModalOpen, setIsUpiModalOpen] = useState(false);
  const [isUdhariModalOpen, setIsUdhariModalOpen] = useState(false);

  // Receipt Modal state
  const [completedInvoice, setCompletedInvoice] = useState<SalesInvoice | null>(null);
  const [completedInvoiceItems, setCompletedInvoiceItems] = useState<SaleItem[]>([]);
  const [receiptCustomer, setReceiptCustomer] = useState<Customer | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Feedback notifications
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const activeCart = carts.find((c) => c.id === activeCartId) || carts[0];

  // Top-24 Fast-Tap Items (REQ-07 / Section 5.1)
  const fastTapProducts = products.filter((p) => p.is_quick_tap).slice(0, 24);

  // 3-Way Instant Search (Barcode, Short Code, Fuzzy Name)
  const searchResults = searchQuery.trim()
    ? products
        .filter((p) => {
          const q = searchQuery.toLowerCase().trim();
          return (
            p.barcode === q ||
            p.short_code.toLowerCase() === q ||
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
          );
        })
        .slice(0, 8)
    : [];

  // Desktop Keyboard Matrix Handler (REQ-25)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'F2' || (e.key === '/' && !isInput)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        // Switch to next cart
        setActiveCartId((prev) => (prev >= 3 ? 1 : prev + 1));
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (activeCart.items.length > 0) {
          handleWalkInCashCheckout();
        }
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (activeCart.items.length > 0) {
          setIsUdhariModalOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCart]);

  // Cart Calculations
  const subtotal = activeCart.items.reduce(
    (sum, item) => sum + toPaise(item.line_total),
    0
  );
  const subtotalRupees = toRupees(subtotal);
  const roundoffRupees = activeCart.discountRoundoff;
  const grandTotalRupees = Math.max(0, roundCurrency(subtotalRupees - roundoffRupees));

  // Round-off Bargain Options (e.g. ₹504 -> round to ₹500, saves ₹4 discount)
  const suggestedRoundoff =
    subtotalRupees > 10 && subtotalRupees % 10 !== 0
      ? roundCurrency(subtotalRupees % 10)
      : subtotalRupees > 100 && subtotalRupees % 50 !== 0
      ? roundCurrency(subtotalRupees % 50)
      : 0;

  // Add Item to Active Cart
  const addItemToCart = (
    product: Product,
    qtyToAdd: number = 1,
    explicitLineTotal?: number
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
            ? explicitLineTotal
            : toRupees(Math.round(newQty * toPaise(product.selling_price)));

          const updatedItems = [...cart.items];
          updatedItems[existingIndex] = {
            ...existing,
            qty: newQty,
            line_total: newLineTotal,
          };
          return { ...cart, items: updatedItems };
        } else {
          const itemQty = roundQty(qtyToAdd);
          const lineTotal = explicitLineTotal
            ? explicitLineTotal
            : toRupees(Math.round(itemQty * toPaise(product.selling_price)));

          const newItem: CartItem = {
            id: `ci-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            product,
            qty: itemQty,
            unit_selling_price: product.selling_price,
            unit_purchase_cost: product.purchase_price,
            line_total: lineTotal,
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

            const newLineTotal = toRupees(
              Math.round(newQty * toPaise(item.product.selling_price))
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

  // Clear current active cart
  const clearCurrentCart = () => {
    setCarts((prevCarts) =>
      prevCarts.map((cart) =>
        cart.id === activeCartId
          ? { ...cart, items: [], discountRoundoff: 0 }
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

  // (1) Walk-In Cash Checkout (F8)
  const handleWalkInCashCheckout = async () => {
    if (activeCart.items.length === 0) return;

    try {
      const itemsPayload: CartItemInput[] = activeCart.items.map((i) => ({
        product: i.product,
        qty: i.qty,
        unit_selling_price: i.unit_selling_price,
        unit_purchase_cost: i.unit_purchase_cost,
        line_total: i.line_total,
      }));

      const res = await BillingService.executeCheckout({
        customerId: WALK_IN_CUSTOMER_ID,
        items: itemsPayload,
        subtotalAmount: subtotalRupees,
        discountRoundoff: roundoffRupees,
        paymentMode: 'CASH',
        amountPaidNow: grandTotalRupees,
        udhariAdded: 0,
      });

      clearCurrentCart();
      playPaymentSuccessChime();
      setCompletedInvoice(res.invoice);
      setCompletedInvoiceItems(res.saleItems);
      setReceiptCustomer(null);
      setIsReceiptModalOpen(true);
      setSuccessBanner(
        `Invoice ${res.invoice.invoice_number} saved! Cash received ${formatINR(grandTotalRupees)}`
      );
      setTimeout(() => setSuccessBanner(null), 4000);
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
      }));

      const res = await BillingService.executeCheckout({
        customerId: WALK_IN_CUSTOMER_ID,
        items: itemsPayload,
        subtotalAmount: subtotalRupees,
        discountRoundoff: roundoffRupees,
        paymentMode: 'UPI',
        amountPaidNow: grandTotalRupees,
        udhariAdded: 0,
      });

      clearCurrentCart();
      playPaymentSuccessChime();
      setCompletedInvoice(res.invoice);
      setCompletedInvoiceItems(res.saleItems);
      setReceiptCustomer(null);
      setIsReceiptModalOpen(true);
      setIsUpiModalOpen(false);
      setSuccessBanner(
        `Invoice ${res.invoice.invoice_number} saved! UPI Payment received ${formatINR(grandTotalRupees)}`
      );
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

        {/* 3-Way Instant Search Bar (REQ-07 / REQ-24) */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              data-testid="pos-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  addItemToCart(searchResults[0]);
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
              {searchResults.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => addItemToCart(prod)}
                  className="w-full p-3 text-left hover:bg-blue-50/60 dark:hover:bg-slate-800/80 flex items-center justify-between transition"
                >
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">
                      {prod.name}
                    </span>
                    <span className="ml-2 font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                      {prod.short_code}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {formatINR(prod.selling_price)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Stk: {prod.current_stock}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Top-24 Fast-Tap Visual Grid (REQ-07 / Section 5.1 Pareto Principle) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>Top-24 Fast-Tap Counter Grid (1-Tap Billing)</span>
            </h2>
            <span className="text-[11px] text-slate-400">80/20 Daily Velocity</span>
          </div>

          <div
            data-testid="fast-tap-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"
          >
            {fastTapProducts.map((prod) => (
              <button
                key={prod.id}
                type="button"
                data-testid={`fast-tap-${prod.short_code}`}
                onClick={() => addItemToCart(prod)}
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-500 dark:hover:border-orange-500 rounded-xl shadow-2xs hover:shadow-xs transition text-left flex flex-col justify-between group active:scale-[0.98]"
              >
                <div>
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded group-hover:bg-orange-100 dark:group-hover:bg-orange-950 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition">
                      {prod.short_code}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {prod.unit_type}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                    {prod.name}
                  </h3>
                </div>

                <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-blue-900 dark:text-emerald-400">
                    {formatINR(prod.selling_price)}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    {prod.current_stock}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANE: Multi-Cart Tabs, Active Cart, Bargain Chip & Checkout */}
      <div className="w-full lg:w-[420px] xl:w-[460px] bg-white dark:bg-slate-900 flex flex-col h-full border-t lg:border-t-0 border-slate-200 dark:border-slate-800 shadow-md">
        {/* Multi-Cart Tabs (Hold Bill: Cart 1, Cart 2, Cart 3 - REQ-07) */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {carts.map((cart) => {
              const isActive = cart.id === activeCartId;
              const itemCount = cart.items.length;
              return (
                <button
                  key={cart.id}
                  type="button"
                  data-testid={`cart-tab-${cart.id}`}
                  onClick={() => setActiveCartId(cart.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-blue-800 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{cart.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      isActive
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {itemCount}
                  </span>
                </button>
              );
            })}
          </div>

          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
            F4: Switch Cart
          </span>
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

            {/* Dynamic UPI QR Modal Button */}
            <button
              type="button"
              disabled={activeCart.items.length === 0}
              data-testid="upi-checkout-btn"
              onClick={() => setIsUpiModalOpen(true)}
              className="col-span-2 py-2.5 bg-blue-800 hover:bg-blue-900 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4 text-orange-400" />
              <span>UPI Dynamic QR Code Checkout</span>
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
    </div>
  );
};
