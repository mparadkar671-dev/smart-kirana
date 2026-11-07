import { useEffect } from 'react';

export interface UsePosKeyboardShortcutsOptions {
  onFocusSearch?: () => void;
  onClearSearch?: () => void;
  hasSearchQuery?: boolean;
  onSelectNextProduct?: () => void;
  onSelectPrevProduct?: () => void;
  onConfirmProductSearch?: () => void;
  onIncrementQty?: () => void;
  onDecrementQty?: () => void;
  onRemoveCartItem?: () => void;
  onToggleDiscount?: () => void;
  onSwitchCart?: () => void;
  onCashCheckout?: () => void;
  onUpiCheckout?: () => void;
  onUdhariCheckout?: () => void;
  onOpenNewModal?: () => void;
  onToggleShortcutsModal?: () => void;
  onCloseActiveModal?: () => boolean; // Return true if handled
  isAnyModalOpen?: boolean;
  activeTab?: string;
  onNavigateTab?: (tab: string) => void;
  enabled?: boolean;
}

/**
 * Checks whether the current active element is an interactive text input
 */
export function isEditableElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  const tag = element.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return element.isContentEditable;
}

export function usePosKeyboardShortcuts(options: UsePosKeyboardShortcutsOptions): void {
  const {
    onFocusSearch,
    onClearSearch,
    hasSearchQuery = false,
    onSelectNextProduct,
    onSelectPrevProduct,
    onConfirmProductSearch,
    onIncrementQty,
    onDecrementQty,
    onRemoveCartItem,
    onToggleDiscount,
    onSwitchCart,
    onCashCheckout,
    onUpiCheckout,
    onUdhariCheckout,
    onOpenNewModal,
    onToggleShortcutsModal,
    onCloseActiveModal,
    isAnyModalOpen = false,
    activeTab = 'pos',
    onNavigateTab,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = isEditableElement(activeEl);

      // 1. Universal ESC (Back / Close / Clear) Hierarchy
      if (e.key === 'Escape') {
        e.preventDefault();

        // 1.1 If any modal is open, close modal
        if (onCloseActiveModal && onCloseActiveModal()) {
          return;
        }

        // 1.2 If on POS and search bar has text, clear search text and keep search focused
        if (activeTab === 'pos' && hasSearchQuery && onClearSearch) {
          onClearSearch();
          onFocusSearch?.();
          return;
        }

        // 1.3 If on another tab with no modal open, navigate back to POS Billing (F1)
        if (activeTab !== 'pos' && onNavigateTab) {
          onNavigateTab('pos');
          return;
        }

        // 1.4 If on POS with empty search, ensure search is focused
        if (activeTab === 'pos' && onFocusSearch) {
          onFocusSearch();
          return;
        }

        return;
      }

      // 2. Tab Navigation Function Keys (F1: POS)
      if (e.key === 'F1') {
        e.preventDefault();
        onNavigateTab?.('pos');
        return;
      }

      // 3. Modals Cheat Sheet (?)
      if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !isInputFocused) {
        e.preventDefault();
        onToggleShortcutsModal?.();
        return;
      }

      // 4. Modal is Open Guard: Don't trigger main screen single-key hotkeys if a modal is open
      if (isAnyModalOpen) {
        return;
      }

      // 5. Arrow Navigation inside search dropdown (when search input is focused)
      if (isInputFocused) {
        if (e.key === 'ArrowDown') {
          if (onSelectNextProduct) {
            e.preventDefault();
            onSelectNextProduct();
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          if (onSelectPrevProduct) {
            e.preventDefault();
            onSelectPrevProduct();
          }
          return;
        }
        if (e.key === 'Enter') {
          if (onConfirmProductSearch) {
            e.preventDefault();
            onConfirmProductSearch();
          }
          return;
        }
        // When typing in an input, don't trigger single-letter shortcuts
        return;
      }

      // 6. Global Function Keys (F2, F4, F7, F8, F9)
      if (e.key === 'F2' || e.key === '/') {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      if (e.key === 'F4') {
        e.preventDefault();
        onSwitchCart?.();
        return;
      }

      if (e.key === 'F7') {
        e.preventDefault();
        onUpiCheckout?.();
        return;
      }

      if (e.key === 'F8') {
        e.preventDefault();
        onCashCheckout?.();
        return;
      }

      if (e.key === 'F9') {
        e.preventDefault();
        onUdhariCheckout?.();
        return;
      }

      // 7. Non-Input Single Letter / Key Shortcuts (A, N, D, +, -, Delete/Backspace)
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onOpenNewModal?.();
        return;
      }

      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        onToggleDiscount?.();
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onIncrementQty?.();
        return;
      }

      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        onDecrementQty?.();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRemoveCartItem?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onFocusSearch,
    onClearSearch,
    hasSearchQuery,
    onSelectNextProduct,
    onSelectPrevProduct,
    onConfirmProductSearch,
    onIncrementQty,
    onDecrementQty,
    onRemoveCartItem,
    onToggleDiscount,
    onSwitchCart,
    onCashCheckout,
    onUpiCheckout,
    onUdhariCheckout,
    onOpenNewModal,
    onToggleShortcutsModal,
    onCloseActiveModal,
    isAnyModalOpen,
    activeTab,
    onNavigateTab,
    enabled,
  ]);
}

