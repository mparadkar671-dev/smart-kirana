// Core Type Definitions for Smart Kirana POS, Inventory & Udhari System
// Conforming strictly to SRS-KIRANA-POS-V1

export type BusinessType = 'KIRANA_RETAIL' | 'HOMEMADE_FOOD';

export const KIRANA_CATEGORIES = [
  'All Categories',
  'Groceries',
  'Dals & Pulses',
  'Grains & Flours',
  'Spices & Masala',
  'Edible Oil & Ghee',
  'Packaged Food & Snacks',
  'Beverages & Tea/Coffee',
  'Personal Care',
  'Cleaning & Household',
  'Puja Needs',
  'General & Hardware',
  'Vegetables',
  'Paan & Tobacco',
];

export const HOMEMADE_FOOD_CATEGORIES = [
  'All Homemade Items',
  'Traditional Laddus (लाडू)',
  'Homemade Laddus & Vadi (लाडू, खोबऱ्याची वडी / कापा)',
  'Modak & Festive Specials (मोदक / पुरणपोळी)',
  'Modak & Festive Specials (उकडीचे मोदक, तळणीचे मोदक)',
  'Konkani Breakfast (घावणे / आंबोळी)',
  'Konkani Breakfast & Tiffin (घावणे, आंबोळी, पोहे, उपमा)',
  'Fresh Bhakri & Chapati (भाकरी, चपाती, पुरणपोळी)',
  'Homemade Pickles, Chutney & Papad (लोणचे, चटणी, पापड)',
];

export type UnitType = 'PCS' | 'KG_LOOSE' | 'LTR' | 'PACK' | 'PLATE' | 'DOZEN';

export interface Product {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
  business_type?: BusinessType; // 'KIRANA_RETAIL' | 'HOMEMADE_FOOD' (indexed)
  name: string; // Text (English or Bilingual display name)
  marathi_name?: string; // Marathi product name (e.g. "तूर डाळ", "पारले-जी")
  search_keywords?: string; // Hidden background POS search keywords (e.g. "toor dal, arhar dal, turdal, तुरीची डाळ, dal")
  short_code: string; // Text, e.g., "PG5", "TS1"
  barcode: string; // Text
  category: string; // Text
  unit_type: UnitType;
  purchase_price: number; // Numeric 10,2 (Making cost in Homemade Food; Wholesale cost in Kirana)
  selling_price: number; // Numeric 10,2 (Direct customer retail price)
  mrp: number; // Numeric 10,2 (Printed MRP / Box price)
  current_stock: number; // Numeric 10,3 (supports e.g. 5.250 kg, 3.500 kg, 0.500 kg)
  low_stock_threshold: number; // Numeric 10,3 (supports e.g. 0.500 kg, 0.250 kg)
  last_supplier_name: string;
  supplier_phone?: string; // Contact phone for direct WhatsApp / SMS purchase orders
  wholesaler_id?: string | null; // FK to Wholesaler entity (Kirana only)
  loan_account_id?: string | null; // FK to LoanAccount if stock was purchased using loan capital
  is_loan_funded?: boolean; // Boolean (True if purchased/funded from loan)
  image_url?: string | null; // Compressed 160x160px WebP DataURL (<15KB) or remote URL
  expiry_date?: string | null; // Date (YYYY-MM-DD, nullable)
  is_quick_tap: boolean; // Boolean (Top-24 Fast-Tap Pareto items)

  // Dedicated Homemade Food (Gruh Udyog) costing & dual pricing fields
  raw_material_cost?: number; // Numeric 12,2 (Flour, Coconut, Jaggery, Sugar, Oil/Ghee)
  equipment_fuel_cost?: number; // Numeric 12,2 (LPG Gas, Electricity, Packaging boxes)
  labour_cost?: number; // Numeric 12,2 (Cooking/Making labour effort)
  wholesale_price?: number; // Numeric 12,2 (Rate for Retailers / Bulk B2B sales)
  shelf_life_days?: number; // Shelf life / freshness duration in days
  batch_notes?: string; // Optional batch notes
  recipe_bom?: RecipeIngredient[]; // v4.0.0 Recipe Bill of Materials

  updated_at: string; // ISO Timestamp
}

export interface LoanAccount {
  id: string; // UUID PK (e.g. "loan-1730000000-xyz")
  shop_id?: string; // Multi-tenant Shop ID (indexed)
  business_type?: BusinessType;
  name: string; // e.g. "Mudra Loan ₹50,000", "Bajaj Finserv OD", "Wholesaler Credit Line"
  lender_name: string; // e.g. "State Bank of India", "Rameshwar Trader Credit"
  principal_amount: number; // Numeric 10,2 (Total sanctioned loan amount)
  interest_rate_pct?: number; // Annual or monthly interest % (optional)
  emi_or_daily_target?: number; // Daily or monthly repayment target (optional)
  amount_repaid: number; // Cumulative principal/amount already set aside or repaid to lender
  is_active: boolean;
  status?: 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
  notes?: string;
  created_at: string; // ISO Timestamp
  updated_at?: string;
}

export interface Wholesaler {
  id: string; // UUID PK (e.g. "ws-1730000000-xyz")
  shop_id?: string; // Multi-tenant Shop ID (indexed)
  business_type?: BusinessType;
  name: string; // e.g. "Rameshwar Bhai" or "APMC Mandi Sugar Mill"
  agency_or_brand?: string; // e.g. "HUL Distributor", "APMC Grain Merchant", "Amul Dairy"
  phone: string; // 10-digit Indian mobile number for direct WhatsApp / SMS orders
  gstin?: string;
  address?: string;
  visit_day?: string; // e.g. "Monday & Thursday"
  is_active: boolean;
  contact_person?: string;
  address_city?: string;
  gst_number?: string;
  notes?: string;
  created_at: string; // ISO Timestamp
  updated_at?: string;
}

export type InventoryReason = 
  | 'PURCHASE_IN' 
  | 'BATCH_MADE_IN'
  | 'SALE_OUT' 
  | 'RETURN_IN' 
  | 'SELF_USE_OUT' 
  | 'DAMAGE_EXPIRED_OUT' 
  | 'AUDIT_ADJUST';

export interface InventoryLog {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
  business_type?: BusinessType;
  product_id: string; // UUID FK
  change_qty: number; // Numeric 10,3 (signed: + or -)
  reason_type: InventoryReason;
  unit_cost_at_time: number; // Numeric 10,2
  reference_id?: string | null; // UUID FK (e.g. invoice_id or expense_id)
  loan_account_id?: string | null; // UUID FK if purchased using a specific Loan Account
  notes: string;
  created_at: string; // ISO Timestamp
}

export interface Customer {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
  business_type?: BusinessType;
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
  business_type?: BusinessType;
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
  business_type?: BusinessType;
  invoice_id: string; // UUID FK
  product_id: string; // UUID FK
  product_name_snapshot: string;
  qty: number; // Numeric 10,3
  unit_purchase_cost: number; // Numeric 10,2
  unit_selling_price: number; // Numeric 10,2
  line_total: number; // Numeric 10,2
  loan_account_id?: string | null; // Snapshot of product's loan_account_id at time of sale
  is_loan_funded?: boolean; // Snapshot of whether item was loan-funded
  sale_rate_type?: 'RETAIL_CUSTOMER' | 'WHOLESALE_RETAILER'; // Direct Customer MRP vs Retailer Bulk
}

export type KhataEntryType = 'DEBIT_UDHARI_GIVEN' | 'CREDIT_JAMA_RECEIVED';
export type KhataPaymentChannel = 'BILL_CREDIT' | 'CASH' | 'UPI' | 'DISCOUNT_SETTLEMENT';

export interface KhataTransaction {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
  business_type?: BusinessType;
  customer_id: string; // UUID FK
  entry_type: KhataEntryType;
  amount: number; // Numeric 10,2
  payment_channel: KhataPaymentChannel;
  invoice_id?: string | null; // UUID FK
  running_balance_after: number; // Numeric 10,2
  notes: string;
  created_at: string; // ISO Timestamp
}

export type ExpenseEntryType =
  | 'INITIAL_INVESTMENT'
  | 'RAW_MATERIAL_EXPENSE'
  | 'BUSINESS_EXPENSE'
  | 'HOME_FAMILY_EXPENSE';

export type ExpenseCategory = 
  | 'SHOP_EXPENSE_RENT_ELEC' 
  | 'SHOP_EXPENSE_TRANSPORT_BAGS' 
  | 'HOME_SELF_USE_GOODS' 
  | 'OWNER_CASH_DRAWING'
  | 'INITIAL_INVESTMENT_SETUP'
  | 'RAW_MATERIAL_INGREDIENTS'
  | 'HOME_FAMILY_EXPENSE';

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
  business_type?: BusinessType;
  entry_type?: ExpenseEntryType; // 'INITIAL_INVESTMENT' | 'RAW_MATERIAL_EXPENSE' | 'BUSINESS_EXPENSE' | 'HOME_FAMILY_EXPENSE'
  category: ExpenseCategory;
  amount: number; // Numeric 10,2
  paid_via: ExpensePaidVia;
  description: string;
  created_at: string; // ISO Timestamp
}

export interface DailyGallaSession {
  id: string; // UUID PK
  shop_id?: string; // Multi-tenant Shop ID (indexed)
  business_type?: BusinessType;
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
  id: string; // 'current_shop' or 'homemade_food_shop'
  shop_id?: string;
  owner_user_id?: string;
  business_type?: BusinessType; // 'KIRANA_RETAIL' | 'HOMEMADE_FOOD'
  invoice_prefix?: string; // 'KRN' for Kirana, 'HMF' for Homemade Food, 'INV' default
  invite_code?: string; // 6-digit Store Invite Code, e.g. "KRN-4829"
  reset_epoch?: number; // Multi-device watermark check to detect remote wipes
  last_wiped_at?: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  upi_vpa: string; // e.g., 'kirana@upi' or phone@oksbi
  address: string;
  gst_footer_note: string;
  // v4.0.0 Manager PIN Security & Rate Limiting
  pin_hash?: string;
  pin_salt?: string;
  pin_failed_attempts?: number;
  pin_locked_until?: string;
  updated_at: string;
}

export type AdvanceOrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED_BILLED' | 'CANCELLED';

export interface AdvanceOrderItem {
  product_id: string;
  name?: string;
  product_name?: string;
  qty: number;
  unit?: UnitType;
  unit_type?: UnitType;
  price?: number;
  unit_selling_price?: number;
  cost?: number;
  unit_purchase_cost?: number;
  line_total: number;
}

export interface AdvanceOrder {
  id: string;
  shop_id?: string;
  business_type?: BusinessType;
  order_number: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_date: string;
  delivery_date_time: string;
  items_json: AdvanceOrderItem[];
  items: AdvanceOrderItem[];
  total_amount: number;
  advance_paid: number;
  advance_token_paid: number;
  balance_due: number;
  payment_mode: PaymentMode;
  order_notes?: string;
  special_instructions?: string;
  status: AdvanceOrderStatus;
  converted_invoice_id?: string | null;
  created_at: string;
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

export interface BusinessWorkspaceRecord {
  business_type: BusinessType;
  shop_profile: ShopProfile;
  products: Product[];
  inventory_logs: InventoryLog[];
  customers: Customer[];
  sales_invoices: SalesInvoice[];
  sale_items: SaleItem[];
  khata_transactions: KhataTransaction[];
  expenses_and_drawings: ExpenseAndDrawing[];
  daily_galla_sessions: DailyGallaSession[];
  advance_orders: AdvanceOrder[];
  loan_accounts: LoanAccount[];
  wholesalers: Wholesaler[];
  updated_at: string;
}

// ==========================================
// v4.0.0 Enterprise Module Types & Interfaces
// ==========================================

export interface RecipeIngredient {
  raw_material_product_id?: string;
  name: string; // e.g. "Gram Flour (Besan)" or "Pure Cow Ghee"
  qty_required: number; // e.g. 0.500
  unit: UnitType; // e.g. "KG_LOOSE"
  cost_estimate?: number;
}

export interface ProductionBatch {
  id: string; // UUID PK
  shop_id?: string;
  business_type?: BusinessType;
  product_id: string; // FK to Product
  batch_code: string; // e.g. "BATCH-20261107-001"
  initial_qty: number;
  remaining_qty: number;
  unit_type: UnitType;
  unit_production_cost: number;
  produced_at: string; // ISO string
  shelf_life_days: number;
  expires_at: string; // ISO string (produced_at + shelf_life_days)
  status: 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'SPOILED';
  notes?: string;
  created_at: string;
}

export interface PurchaseInvoiceItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_type: UnitType;
  purchase_price: number;
  selling_price?: number;
  mrp?: number;
  line_total: number;
  batch_code?: string;
  expiry_date?: string;
}

export interface PurchaseInvoice {
  id: string;
  shop_id?: string;
  business_type?: BusinessType;
  invoice_number: string; // e.g. "PUR-20261107-001"
  wholesaler_id: string;
  wholesaler_name: string;
  invoice_date: string;
  items: PurchaseInvoiceItem[];
  subtotal: number;
  tax_amount?: number;
  grand_total: number;
  payment_mode: 'CASH' | 'BANK_UPI' | 'CREDIT_UDHARI' | 'SPLIT';
  amount_paid: number;
  balance_due: number;
  status: 'RECEIVED' | 'CANCELLED';
  notes?: string;
  created_at: string;
}

export interface WholesalerKhataTransaction {
  id: string;
  shop_id?: string;
  business_type?: BusinessType;
  wholesaler_id: string;
  entry_type: 'PURCHASE_CREDIT_DUE' | 'PAYMENT_MADE_SETTLED';
  amount: number;
  payment_channel?: 'CASH' | 'UPI_BANK' | 'CHEQUE';
  purchase_invoice_id?: string | null;
  running_balance_after: number;
  notes?: string;
  created_at: string;
}

export interface SecurityAuditLog {
  id: string;
  shop_id?: string;
  business_type?: BusinessType;
  event_type:
    | 'PIN_FAILED_ATTEMPT'
    | 'LOCKOUT_TRIGGERED'
    | 'CREDIT_LIMIT_OVERRIDE'
    | 'NEGATIVE_STOCK_OVERRIDE'
    | 'BILL_DISCOUNT_OVERRIDE'
    | 'PIN_CHANGED'
    | 'SPOILED_BATCH_LOGGED'
    | 'STOCK_TRANSFER_AUDIT';
  cashier_id?: string;
  cashier_name?: string;
  action_summary: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}




