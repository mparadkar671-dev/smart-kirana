import { db } from '../db/db';
import {
  Customer,
  KhataTransaction,
  DailyGallaSession,
  ShopProfile,
  KhataPaymentChannel,
} from '../types';
import { roundCurrency, formatINR } from '../utils/math';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface JamaPaymentInput {
  customerId: string;
  amount: number;
  paymentChannel: KhataPaymentChannel;
  notes?: string;
}

export class KhataService {
  /**
   * Calculates aging days from customer's oldest unpaid purchase date
   */
  static getAgingDays(oldestUnpaidDate?: string | null): number {
    if (!oldestUnpaidDate) return 0;
    const diffMs = Date.now() - new Date(oldestUnpaidDate).getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  /**
   * Categorizes aging days into risk buckets (0-7d, 8-15d, 15-30d, 30+d)
   */
  static getAgingBucket(days: number): '0-7d' | '8-15d' | '15-30d' | '30+d' {
    if (days <= 7) return '0-7d';
    if (days <= 15) return '8-15d';
    if (days <= 30) return '15-30d';
    return '30+d';
  }

  /**
   * Records a Jama / Settlement Payment received from customer.
   * Atomically updates customers.current_udhari_balance, appends to khata_transactions,
   * and increments cash in daily_galla_sessions if paid in CASH (REQ-11).
   */
  static async recordJamaPayment(input: JamaPaymentInput): Promise<{
    customer: Customer;
    transaction: KhataTransaction;
  }> {
    if (input.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const payAmount = roundCurrency(input.amount);
    let updatedCustomer!: Customer;
    let newTx!: KhataTransaction;
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];

    await db.transaction(
      'rw',
      [db.customers, db.khata_transactions, db.daily_galla_sessions, db.sync_outbox],
      async () => {
        const customer = await db.customers.get(input.customerId);
        if (!customer) throw new Error(`Customer not found: ${input.customerId}`);

        const newBalance = roundCurrency(
          Math.max(0, customer.current_udhari_balance - payAmount)
        );

        // If balance fully paid off, reset oldest_unpaid_date
        const updatedOldestDate = newBalance <= 0 ? null : customer.oldest_unpaid_date;

        await db.customers.update(input.customerId, {
          current_udhari_balance: newBalance,
          oldest_unpaid_date: updatedOldestDate,
        });
        await db.queueSync(
          { table_name: 'customers', operation: 'UPDATE', payload: { id: input.customerId, current_udhari_balance: newBalance, oldest_unpaid_date: updatedOldestDate }, shop_id: customer.shop_id },
          db.sync_outbox
        );

        newTx = {
          id: `khata-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          shop_id: customer.shop_id || 'current_shop',
          customer_id: input.customerId,
          entry_type: 'CREDIT_JAMA_RECEIVED',
          amount: payAmount,
          payment_channel: input.paymentChannel,
          invoice_id: null,
          running_balance_after: newBalance,
          notes:
            input.notes?.trim() ||
            `Jama received via ${input.paymentChannel.replace(/_/g, ' ')}`,
          created_at: nowIso,
        };
        await db.khata_transactions.add(newTx);
        await db.queueSync(
          { table_name: 'khata_transactions', operation: 'INSERT', payload: newTx as unknown as Record<string, unknown>, shop_id: newTx.shop_id },
          db.sync_outbox
        );

        // If Cash, atomically increment Cash Udhari Recovered in daily galla drawer
        if (input.paymentChannel === 'CASH') {
          const session = await db.daily_galla_sessions
            .where({ session_date: todayDate })
            .first();

          if (session) {
            const newRecovered = roundCurrency(session.cash_udhari_recovered + payAmount);
            const newExpected = roundCurrency(session.expected_closing_cash + payAmount);
            await db.daily_galla_sessions.update(session.id, {
              cash_udhari_recovered: newRecovered,
              expected_closing_cash: newExpected,
            });
            await db.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'UPDATE', payload: { id: session.id, cash_udhari_recovered: newRecovered, expected_closing_cash: newExpected }, shop_id: customer.shop_id },
              db.sync_outbox
            );
          } else {
            const newSession: DailyGallaSession = {
              id: `galla-${Date.now()}`,
              shop_id: customer.shop_id || 'current_shop',
              session_date: todayDate,
              opening_cash: 0,
              cash_sales_total: 0,
              cash_udhari_recovered: payAmount,
              cash_expenses_out: 0,
              expected_closing_cash: payAmount,
              actual_counted_cash: null,
              discrepancy: null,
            };
            await db.daily_galla_sessions.add(newSession);
            await db.queueSync(
              { table_name: 'daily_galla_sessions', operation: 'INSERT', payload: newSession as unknown as Record<string, unknown>, shop_id: customer.shop_id },
              db.sync_outbox
            );
          }
        }

        updatedCustomer = {
          ...customer,
          current_udhari_balance: newBalance,
          oldest_unpaid_date: updatedOldestDate,
        };
      }
    );

    return { customer: updatedCustomer, transaction: newTx };
  }

  /**
   * Sanitizes Indian 10-digit mobile number, removing +91, 91, spaces, dashes
   */
  static cleanIndianPhone(phone: string): string {
    let clean = phone.replace(/\D/g, '');
    if (clean.length === 12 && clean.startsWith('91')) {
      clean = clean.substring(2);
    } else if (clean.length === 11 && clean.startsWith('0')) {
      clean = clean.substring(1);
    }
    return clean;
  }

  /**
   * Free WhatsApp Reminder & Receipt Link Generator (REQ-12 & REQ-27)
   * Uses Neutral System Authority Framing to preserve customer relationships.
   */
  static generateWhatsAppLink(params: {
    customer: Customer;
    shopProfile: ShopProfile;
    tier?: 0 | 1 | 2; // Tier 0 = Instant receipt, Tier 1 = Gentle Nudge, Tier 2 = Overdue
    itemSummary?: string;
  }): string {
    const { customer, shopProfile, tier = 1 } = params;
    const cleanPhone = this.cleanIndianPhone(customer.phone);
    const balanceStr = customer.current_udhari_balance.toFixed(2);
    const shopName = shopProfile.shop_name;
    const upiLink = `upi://pay?pa=${encodeURIComponent(shopProfile.upi_vpa)}&pn=${encodeURIComponent(
      shopName
    )}&am=${balanceStr}&cu=INR`;

    let msg = '';

    if (tier === 0) {
      // Tier 0: Instant Bill Receipt on Udhari Sale
      msg = `🧾 *Automated Ledger Update from ${shopName} Billing System*\n\n`;
      msg += `Namaste *${customer.name}* ji,\n`;
      msg += `A new bill has been added to your store Khata account.\n\n`;
      if (params.itemSummary) {
        msg += `📦 *Bill Details:*\n${params.itemSummary}\n\n`;
      }
      msg += `💰 *Total Pending Khata Balance: ₹${balanceStr}*\n\n`;
      msg += `📲 *Pay instantly via 1-tap UPI:*\n${upiLink}\n\n`;
      msg += `Or pay at counter anytime. Thank you for shopping with us! 🙏`;
    } else if (tier === 2) {
      // Tier 2: Overdue Escalation (15–30+ Days)
      const agingDays = this.getAgingDays(customer.oldest_unpaid_date);
      msg = `📢 *Account Statement Notice - ${shopName}*\n\n`;
      msg += `Dear *${customer.name}* ji,\n`;
      msg += `This is a friendly reminder that your store Khata balance of *₹${balanceStr}* has been pending for *${agingDays} days*.\n\n`;
      msg += `Please clear this balance at your earliest convenience to keep your credit limit active.\n\n`;
      msg += `📲 *1-Tap Instant UPI Payment Link:*\n${upiLink}\n\n`;
      msg += `UPI VPA: *${shopProfile.upi_vpa}*\n`;
      msg += `For any discrepancies, please contact shop owner at ${shopProfile.phone}.`;
    } else {
      // Tier 1: Gentle Nudge (7–14 Days Pending)
      msg = `🙏 *Automated Ledger Update from ${shopName} Billing System*\n\n`;
      msg += `Namaste *${customer.name}* ji,\n`;
      msg += `This is an automated balance update for your store Khata account.\n\n`;
      msg += `💰 *Current Pending Balance: ₹${balanceStr}*\n\n`;
      msg += `📲 *Tap to Pay via UPI (GPay / PhonePe / Paytm):*\n${upiLink}\n\n`;
      msg += `UPI ID: *${shopProfile.upi_vpa}*\n`;
      msg += `Thank you for your continued trust and patronage! 😊`;
    }

    const encodedText = encodeURIComponent(msg);
    return `https://wa.me/91${cleanPhone}?text=${encodedText}`;
  }

  /**
   * Log that a reminder was sent
   */
  static async logReminderSent(customerId: string): Promise<void> {
    await db.customers.update(customerId, {
      last_reminder_sent_at: new Date().toISOString(),
    });
  }

  /**
   * Generates a 1-click Downloadable Itemized PDF Khata Statement (Tier 2 / REQ-14)
   */
  static async generateKhataStatementPdf(
    customer: Customer,
    shopProfile: ShopProfile
  ): Promise<void> {
    const transactions = await db.khata_transactions
      .where({ customer_id: customer.id })
      .sortBy('created_at');

    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    // Shop Header
    doc.setFontSize(16);
    doc.text(shopProfile.shop_name, 14, 15);
    doc.setFontSize(10);
    doc.text(`${shopProfile.address} | Phone: ${shopProfile.phone}`, 14, 21);
    doc.text(`UPI VPA: ${shopProfile.upi_vpa}`, 14, 26);

    // Customer Detail Box
    doc.setFontSize(12);
    doc.text('CUSTOMER KHATA ACCOUNT PASSBOOK', 14, 34);
    doc.setFontSize(9);
    doc.text(`Customer Name: ${customer.name}`, 14, 40);
    doc.text(`Phone: +91 ${customer.phone}`, 14, 45);
    doc.text(`Statement Date: ${dateStr}`, 140, 40);
    doc.text(`Total Outstanding Udhari: Rs. ${customer.current_udhari_balance.toFixed(2)}`, 140, 45);

    const rows = transactions.map((tx, idx) => {
      const dt = new Date(tx.created_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const isDebit = tx.entry_type === 'DEBIT_UDHARI_GIVEN';
      const debitStr = isDebit ? `Rs. ${tx.amount.toFixed(2)}` : '-';
      const creditStr = !isDebit ? `Rs. ${tx.amount.toFixed(2)}` : '-';
      const balanceStr = `Rs. ${tx.running_balance_after.toFixed(2)}`;

      return [
        (idx + 1).toString(),
        dt,
        tx.notes || (isDebit ? 'Bill Credit' : 'Payment Received'),
        tx.payment_channel.replace(/_/g, ' '),
        debitStr,
        creditStr,
        balanceStr,
      ];
    });

    autoTable(doc, {
      startY: 50,
      head: [['#', 'Date', 'Description / Note', 'Channel', 'Udhari Given (+)', 'Jama Received (-)', 'Balance']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] }, // Navy
      styles: { fontSize: 8.5 },
      columnStyles: {
        4: { textColor: [220, 38, 38] }, // Red for Udhari
        5: { textColor: [22, 163, 74] }, // Green for Jama
      },
    });

    doc.save(`Khata_Statement_${customer.name.replace(/\s+/g, '_')}_${dateStr}.pdf`);
  }

  /**
   * Deletes a customer and associated khata transactions
   */
  static async deleteCustomer(customerId: string): Promise<void> {
    if (customerId === '0000-WALK-IN') {
      throw new Error('Cannot delete system Walk-in Customer.');
    }
    await db.transaction('rw', [db.customers, db.khata_transactions], async () => {
      await db.customers.delete(customerId);
      await db.khata_transactions.where({ customer_id: customerId }).delete();
    });
  }

  /**
   * Bulk deletes multiple customers
   */
  static async bulkDeleteCustomers(customerIds: string[]): Promise<void> {
    const validIds = customerIds.filter((id) => id !== '0000-WALK-IN');
    if (validIds.length === 0) return;
    await db.transaction('rw', [db.customers, db.khata_transactions], async () => {
      await db.customers.bulkDelete(validIds);
      for (const id of validIds) {
        await db.khata_transactions.where({ customer_id: id }).delete();
      }
    });
  }
}

