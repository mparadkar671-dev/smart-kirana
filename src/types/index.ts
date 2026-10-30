// Core Type Definitions for Smart Kirana POS, Inventory & Udhari System
// Conforming strictly to SRS-KIRANA-POS-V1

export type UnitType = 'PCS' | 'KG_LOOSE' | 'LTR' | 'PACK';

export interface Product {
  id: string; // UUID PK
  name: string; // Text
  short_code: string; // Text, e.g., "PG5", "TS1"
  barcode: string; // Text
  category: string; // Text
  unit_type: UnitType;
  purchase_price: number; // Numeric 10,2
  selling_price: number; // Numeric 10,2
  mrp: number; // Numeric 10,2
  current_stock: number; // Numeric 10,3 (supports e.g. 14.250 kg)
  low_stock_threshold: number; // Numeric 10,3
  last_supplier_name: string;
  expiry_date?: string | null; // Date (YYYY-MM-DD, nullable)
  is_quick_tap: boolean; // Boolean (Top-24 Fast-Tap Pareto items)
  updated_at: string; // ISO Timestamp
}

export type InventoryReason = 
  | 'PURCHASE_IN' 
  | 'SALE_OUT' 
  | 'RETURN_IN' 
  | 'SELF_USE_OUT' 
  | 'DAMAGE_EXPIRED_OUT' 
  | 'AUDIT_ADJUST';

export interface InventoryLog {
  id: string; // UUID PK
  product_id: string; // UUID FK
  change_qty: number; // Numeric 10,3 (signed: + or -)
  reason_type: InventoryReason;
  unit_cost_at_time: number; // Numeric 10,2
  reference_id?: string | null; // UUID FK (e.g. invoice_id or expense_id)
  notes: string;
  created_at: string; // ISO Timestamp
}

export interface Customer {
  id: string; // UUID PK
  name: string; // Text
  phone: string; // Text (10-digit Indian WhatsApp number)
  address_landmark?: string | null; // Text
  credit_limit: number; // Numeric 10,2 (default 2000)
  current_udhari_balance: number; // Numeric 10,2 (default 0)
  oldest_unpaid_date?: string | null; // ISO Timestamp
  last_reminder_sent_at?: string | null; // ISO Timestamp
  created_at: string; // ISO Timestamp
}

export type PaymentMode = 'CASH' | 'UPI' | 'UDHARI_FULL' | 'SPLIT_PARTIAL';
export type InvoiceStatus = 'COMPLETED' | 'VOIDED';

export interface SalesInvoice {
  id: string; // UUID PK
  invoice_number: string; // Text, e.g. INV-20261030-001
  customer_id: string; // UUID FK
  subtotal_amount: number; // Numeric 10,2
  discount_roundoff: number; // Numeric 10,2
  grand_total: number; // Numeric 10,2
  total_cogs: number; // Numeric 10,2
  payment_mode: PaymentMode;
  amount_paid_now: number; // Numeric 10,2
  udhari_added: number; // Numeric 10,2
  status: InvoiceStatus;
  created_at: string; // ISO Timestamp
}

export interface SaleItem {
  id: string; // UUID PK
  invoice_id: string; // UUID FK
  product_id: string; // UUID FK
  product_name_snapshot: string;
  qty: number; // Numeric 10,3
  unit_purchase_cost: number; // Numeric 10,2
  unit_selling_price: number; // Numeric 10,2
  line_total: number; // Numeric 10,2
}

export type KhataEntryType = 'DEBIT_UDHARI_GIVEN' | 'CREDIT_JAMA_RECEIVED';
export type KhataPaymentChannel = 'BILL_CREDIT' | 'CASH' | 'UPI' | 'DISCOUNT_SETTLEMENT';

export interface KhataTransaction {
  id: string; // UUID PK
  customer_id: string; // UUID FK
  entry_type: KhataEntryType;
  amount: number; // Numeric 10,2
  payment_channel: KhataPaymentChannel;
  invoice_id?: string | null; // UUID FK
  running_balance_after: number; // Numeric 10,2
  notes: string;
  created_at: string; // ISO Timestamp
}

export type ExpenseCategory = 
  | 'SHOP_EXPENSE_RENT_ELEC' 
  | 'SHOP_EXPENSE_TRANSPORT_BAGS' 
  | 'HOME_SELF_USE_GOODS' 
  | 'OWNER_CASH_DRAWING';

export type ExpensePaidVia = 'CASH_GALLA' | 'UPI_BANK' | 'INVENTORY_DEDUCTION';

export interface ExpenseAndDrawing {
  id: string; // UUID PK
  category: ExpenseCategory;
  amount: number; // Numeric 10,2
  paid_via: ExpensePaidVia;
  description: string;
  created_at: string; // ISO Timestamp
}

export interface DailyGallaSession {
  id: string; // UUID PK
  session_date: string; // Date Unique: YYYY-MM-DD
  opening_cash: number; // Numeric 10,2
  cash_sales_total: number; // Numeric 10,2
  cash_udhari_recovered: number; // Numeric 10,2
  cash_expenses_out: number; // Numeric 10,2
  expected_closing_cash: number; // Numeric 10,2
  actual_counted_cash?: number | null; // Numeric 10,2
  discrepancy?: number | null; // Numeric 10,2 (actual - expected)
}

export interface ShopProfile {
  id: string; // 'current_shop'
  shop_name: string;
  owner_name: string;
  phone: string;
  upi_vpa: string; // e.g., 'kirana@upi' or phone@oksbi
  address: string;
  gst_footer_note: string;
  updated_at: string;
}

export const WALK_IN_CUSTOMER_ID = '0000-WALK-IN';
export const WALK_IN_CUSTOMER_RECORD: Customer = {
  id: WALK_IN_CUSTOMER_ID,
  name: 'Walk-in Customer (Cash / UPI)',
  phone: '0000000000',
  address_landmark: 'Counter Sale',
  credit_limit: 0,
  current_udhari_balance: 0,
  created_at: new Date(0).toISOString(),
};

