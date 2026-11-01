// Core Type Definitions for Smart Kirana POS, Inventory & Udhari System
// Conforming strictly to SRS-KIRANA-POS-V1

export type UnitType = 'PCS' | 'KG_LOOSE' | 'LTR' | 'PACK';

export interface Product {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
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
  shop_id?: string; // Multi-tenant Shop ID (indexed)
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
  shop_id?: string; // Multi-tenant Shop ID (indexed)
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
export type InvoiceStatus = 'COMPLETED' | 'VOIDED' | 'RETURNED';
export type SalesReturnReason = 'CUSTOMER_RETURN' | 'BILLING_MISTAKE' | 'RATE_ADJUSTMENT' | string;

export interface CreditNote {
  id: string; // UUID PK
  shop_id: string;
  credit_note_number: string; // CN-XXXX
  original_invoice_id: string;
  original_invoice_number: string;
  customer_id: string;
  return_reason: SalesReturnReason;
  total_amount: number;
  refund_mode: 'CASH' | 'UDHARI_CREDIT' | 'UPI' | 'STORE_CREDIT';
  created_at: string;
}

export interface SalesInvoice {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
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
  return_reason?: SalesReturnReason;
  credit_note_number?: string;
  returned_at?: string;
  created_at: string; // ISO Timestamp
}

export interface SaleItem {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
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
  shop_id?: string; // Multi-tenant Shop ID (indexed)
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

export type UserRole = 'OWNER' | 'MANAGER' | 'ACCOUNTANT' | 'CASHIER';

export interface StoreUser {
  id: string; // UUID PK
  user_id?: string; // Supabase Auth user ID
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  shop_id: string;
  is_active: boolean;
  approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  updated_at?: string;
}

export interface ExpenseAndDrawing {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
  category: ExpenseCategory;
  amount: number; // Numeric 10,2
  paid_via: ExpensePaidVia;
  description: string;
  created_at: string; // ISO Timestamp
}

export interface DailyGallaSession {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
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
  shop_id?: string;
  invite_code?: string; // 6-digit Store Invite Code, e.g. "KRN-4829"
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
  shop_id: 'current_shop',
  name: 'Walk-in Customer (Cash / UPI)',
  phone: '0000000000',
  address_landmark: 'Counter Sale',
  credit_limit: 0,
  current_udhari_balance: 0,
  created_at: new Date(0).toISOString(),
};

export interface RegisteredShop {
  id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  address?: string;
}

export type NotificationCategory = 'inventory' | 'khata' | 'staff' | 'galla' | 'system';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';
export type NotificationType =
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'EXPIRY_ALERT'
  | 'KHATA_OVERDUE'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'STAFF_REQUEST'
  | 'STAFF_APPROVED'
  | 'GALLA_DISCREPANCY'
  | 'CLOUD_SYNC'
  | 'BACKUP_REMINDER';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO String
  isRead: boolean;
  priority: NotificationPriority;
  category: NotificationCategory;
  actionLabel?: string;
  actionType?: 'GO_TO_INVENTORY' | 'GO_TO_KHATA' | 'APPROVE_STAFF' | 'GO_TO_GALLA' | 'GO_TO_SETTINGS';
  actionData?: Record<string, unknown>;
}

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type SyncOutboxStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export interface SyncOutboxItem {
  id: string; // UUID PK
  table_name: string; // e.g. 'products', 'customers', 'sales_invoices', 'inventory_logs', etc.
  operation: SyncOperation;
  payload: Record<string, unknown>;
  shop_id: string;
  created_at: string; // ISO Timestamp
  retry_count: number;
  status: SyncOutboxStatus;
  error_message?: string | null;
}



