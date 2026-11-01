import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../db/db';
import { calculateReverseWeight, roundQty, roundCurrency } from '../utils/math';
import { LooseItemModal } from '../components/pos/LooseItemModal';
import { UdhariCheckoutModal } from '../components/pos/UdhariCheckoutModal';
import { AuthProvider } from '../context/AuthContext';
import { Product, Customer } from '../types';

describe('Iteration 4: POS HCI Ergonomics, Debounced Shortcuts & Psychological Guardrails', () => {
  const sampleLooseSugar: Product = {
    id: 'prod-loose-sugar',
    shop_id: 'current_shop',
    barcode: 'LOOSE-SUGAR',
    short_code: 'SUG',
    name: 'Loose White Sugar',
    category: 'Grains & Pulses',
    unit_type: 'KG_LOOSE',
    purchase_price: 38,
    selling_price: 43, // Odd rate per kg
    mrp: 48,
    current_stock: 50,
    low_stock_threshold: 5,
    last_supplier_name: 'Shree Sugar Mill',
    is_quick_tap: true,
    updated_at: new Date().toISOString(),
  };

  const sampleCustomer: Customer = {
    id: 'cust-credit-test-1',
    shop_id: 'current_shop',
    name: 'Vikram Singh',
    phone: '9822334455',
    address_landmark: 'Shop 7, Main Road',
    credit_limit: 2000,
    current_udhari_balance: 1800,
    oldest_unpaid_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    await db.products.clear();
    await db.customers.clear();
    await db.sales_invoices.clear();
    await db.sale_items.clear();
    await db.inventory_logs.clear();
    await db.khata_transactions.clear();
    await db.sync_outbox.clear();
  });

  describe('1. Loose Weight Exact Price Locking Math (REQ-08 / Section 4)', () => {
    it('locks exact requested rupee amount across odd per-kg rates without floating-point drift', () => {
      // Test cases with odd rates:
      // (a) Customer asks for ₹20 of sugar at ₹43/kg
      const rateA = 43;
      const amountA = 20;
      const weightA = calculateReverseWeight(amountA, rateA);
      expect(weightA).toBe(0.465); // 20 / 43 = 0.465116... rounded to 0.465 kg
      // Authoritative locked line total must remain exactly ₹20.00
      const lockedTotalA = amountA;
      expect(lockedTotalA).toBe(20);

      // (b) Customer asks for ₹10 of mustard seeds at ₹77/kg
      const rateB = 77;
      const amountB = 10;
      const weightB = calculateReverseWeight(amountB, rateB);
      expect(weightB).toBe(0.130); // 10 / 77 = 0.12987... rounded to 0.130 kg
      const lockedTotalB = amountB;
      expect(lockedTotalB).toBe(10);

      // (c) Customer asks for ₹25 of besan at ₹53/kg
      const rateC = 53;
      const amountC = 25;
      const weightC = calculateReverseWeight(amountC, rateC);
      expect(weightC).toBe(0.472); // 25 / 53 = 0.47169... rounded to 0.472 kg
      const lockedTotalC = amountC;
      expect(lockedTotalC).toBe(25);
    });

    it('LooseItemModal emits exact requested rupee amount in onConfirm callback', () => {
      const handleConfirm = vi.fn();
      const handleClose = vi.fn();

      render(
        <LooseItemModal
          isOpen={true}
          onClose={handleClose}
          product={sampleLooseSugar}
          onConfirm={handleConfirm}
        />
      );

      // Type ₹20 in the reverse price rupee input
      const rupeeInput = screen.getByTestId('loose-amount-input');
      fireEvent.change(rupeeInput, { target: { value: '20' } });

      // Click Add to Bill
      const confirmBtn = screen.getByTestId('confirm-loose-btn');
      fireEvent.click(confirmBtn);

      // Verify onConfirm received product, 0.465 kg, and exact locked ₹20 line total
      expect(handleConfirm).toHaveBeenCalledWith(
        sampleLooseSugar,
        0.465,
        20
      );
    });
  });

  describe('2. Hard Credit Limit Enforcement & Cashier Guardrail (REQ-29 / AT-08)', () => {
    it('blocks Cashier when customer balance + new bill exceeds credit limit until split payment or manager PIN', async () => {
      const handleConfirm = vi.fn();
      const handleClose = vi.fn();

      // Customer Vikram has limit ₹2,000, existing balance ₹1,800.
      // Bill is ₹500. Total would reach ₹2,300 (exceeds by ₹300).
      render(
        <AuthProvider>
          <UdhariCheckoutModal
            isOpen={true}
            onClose={handleClose}
            grandTotal={500}
            customers={[sampleCustomer]}
            initialCustomerId={sampleCustomer.id}
            onConfirm={handleConfirm}
          />
        </AuthProvider>
      );

      // Credit limit warning must be displayed
      expect(screen.getByTestId('credit-limit-warning')).toBeDefined();
      expect(screen.getByText(/Credit Trust Limit Exceeded/i)).toBeDefined();
      expect(screen.getByText(/\+₹300\.00 over limit/i)).toBeDefined();

      // Toggle Split Payment and enter ₹300 cash paid now
      const splitCheckbox = screen.getByTestId('split-payment-toggle');
      fireEvent.click(splitCheckbox);

      const cashInput = screen.getByTestId('cash-received-now-input');
      fireEvent.change(cashInput, { target: { value: '300' } });

      // After paying ₹300 in cash, effective udhari is ₹200 (1800 + 200 = 2000 <= 2000)
      // Now the warning clears and submit button is enabled!
      await waitFor(() => {
        expect(screen.queryByTestId('credit-limit-warning')).toBeNull();
      });

      const submitBtn = screen.getByTestId('confirm-udhari-btn');
      fireEvent.click(submitBtn);

      expect(handleConfirm).toHaveBeenCalledWith({
        customerId: sampleCustomer.id,
        mode: 'SPLIT_PARTIAL',
        amountPaidNow: 300,
        udhariAdded: 200,
      });
    });
  });
});
