import React, { useEffect } from 'react';
import { X, Keyboard, Zap, ShoppingBag, CreditCard, Layers } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcutSections = [
    {
      title: 'POS Billing & Fast-Tap',
      icon: ShoppingBag,
      color: 'text-orange-500',
      items: [
        { key: 'F2 or /', label: 'Search Item / Barcode', desc: 'Focus search bar and select text' },
        { key: 'Arrow Up/Down', label: 'Navigate Matches', desc: 'Highlight product in search dropdown' },
        { key: 'Enter', label: 'Add to Cart / Confirm', desc: 'Add item or open loose weight calculator' },
        { key: 'A', label: 'Add Item', desc: 'Quick focus search when not typing' },
        { key: '+ or =', label: 'Increase Quantity (+1)', desc: 'Increment selected or last added cart item' },
        { key: '-', label: 'Decrease Quantity (-1)', desc: 'Decrement selected or last added cart item' },
        { key: 'Del / Backspace', label: 'Remove Item', desc: 'Delete selected or last item from active cart' },
        { key: 'D', label: 'Bargain Discount', desc: 'Toggle 1-click round-off on active bill' },
        { key: 'F4', label: 'Switch Cart Tab', desc: 'Cycle Bill 1 → Bill 2 → Bill 3' },
      ],
    },
    {
      title: 'Checkout & Payments',
      icon: CreditCard,
      color: 'text-emerald-500',
      items: [
        { key: 'F8', label: '1-Tap Cash Checkout', desc: 'Instant cash billing without touching mouse' },
        { key: 'F7', label: 'UPI QR Payment', desc: 'Open dynamic UPI QR modal' },
        { key: 'F9', label: 'Khata / Udhari Modal', desc: 'Open customer credit checkout' },
        { key: 'Enter or P', label: 'Print / Copy Receipt', desc: 'Trigger thermal slip print or WhatsApp copy' },
      ],
    },
    {
      title: 'Navigation & Universal Control',
      icon: Layers,
      color: 'text-blue-500',
      items: [
        { key: 'F1', label: 'Go to POS Billing', desc: 'Jump straight to POS Billing screen' },
        { key: 'N', label: '+ Add New Record', desc: 'Add Product (Inventory), Customer (Khata), Expense (Galla)' },
        { key: 'Esc', label: 'Universal Back / Close', desc: 'Close open modals → Clear search → Return to POS' },
        { key: '?', label: 'Shortcuts Reference', desc: 'Toggle this keyboard cheat sheet' },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      data-testid="keyboard-shortcuts-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 id="shortcuts-title" className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                Counter Hotkeys &amp; Keyboard Shortcuts
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                  Zero-Mouse
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Run the entire store at lightning speed using only your keyboard
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close shortcuts modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {shortcutSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div key={sec.title} className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Icon className={`w-3.5 h-3.5 ${sec.color}`} />
                  <span>{sec.title}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sec.items.map((item) => (
                    <div
                      key={item.key + item.label}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
                    >
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {item.label}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                          {item.desc}
                        </div>
                      </div>
                      <kbd className="px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 shadow-2xs whitespace-nowrap shrink-0">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Pro-tip: Press <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono font-bold">Esc</kbd> anytime to go Back</span>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition hover:opacity-90"
          >
            Got it (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
