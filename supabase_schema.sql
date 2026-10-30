-- ==============================================================================
-- Smart Kirana POS, Inventory & Customer Udhari (Khata) Database Schema
-- Standard: SRS-KIRANA-POS-V1 (Production Supabase PostgreSQL Migration)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SHOP PROFILE & SETTINGS
CREATE TABLE IF NOT EXISTS shop_profile (
    id TEXT PRIMARY KEY DEFAULT 'current_shop',
    shop_name TEXT NOT NULL DEFAULT 'Shree Ganesh Kirana & General Store',
    owner_name TEXT NOT NULL DEFAULT 'Ramesh Patel',
    phone TEXT NOT NULL DEFAULT '9876543210',
    upi_vpa TEXT NOT NULL DEFAULT 'kirana@upi',
    address TEXT DEFAULT 'Shop No. 4, Main Market, Station Road',
    gst_footer_note TEXT DEFAULT 'Thank you for shopping with us! Visit again.',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRODUCTS MASTER
CREATE TYPE unit_type_enum AS ENUM ('PCS', 'KG_LOOSE', 'LTR', 'PACK');

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_code TEXT NOT NULL,
    barcode TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    unit_type unit_type_enum NOT NULL DEFAULT 'PCS',
    purchase_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    mrp NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    low_stock_threshold NUMERIC(10,3) NOT NULL DEFAULT 5.000,
    last_supplier_name TEXT,
    expiry_date DATE,
    is_quick_tap BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_short_code ON products(short_code);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_quick_tap ON products(is_quick_tap);

-- 3. APPEND-ONLY INVENTORY LOGS (LEDGER INVARIANT)
CREATE TYPE inventory_reason_enum AS ENUM (
    'PURCHASE_IN', 
    'SALE_OUT', 
    'RETURN_IN', 
    'SELF_USE_OUT', 
    'DAMAGE_EXPIRED_OUT', 
    'AUDIT_ADJUST'
);

CREATE TABLE IF NOT EXISTS inventory_logs (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    change_qty NUMERIC(10,3) NOT NULL,
    reason_type inventory_reason_enum NOT NULL,
    unit_cost_at_time NUMERIC(10,2) NOT NULL,
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_prod ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reason ON inventory_logs(reason_type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created ON inventory_logs(created_at);

-- 4. CUSTOMERS & KHATA LEDGER
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_landmark TEXT,
    credit_limit NUMERIC(10,2) NOT NULL DEFAULT 2000.00,
    current_udhari_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    oldest_unpaid_date TIMESTAMPTZ,
    last_reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_balance ON customers(current_udhari_balance);

-- Pre-seed anonymous system walk-in customer
INSERT INTO customers (id, name, phone, address_landmark, credit_limit, current_udhari_balance)
VALUES ('0000-WALK-IN', 'Walk-in Customer (Cash / UPI)', '0000000000', 'Counter Sale', 0.00, 0.00)
ON CONFLICT (id) DO NOTHING;

-- 5. SALES INVOICES
CREATE TYPE payment_mode_enum AS ENUM ('CASH', 'UPI', 'UDHARI_FULL', 'SPLIT_PARTIAL');
CREATE TYPE invoice_status_enum AS ENUM ('COMPLETED', 'VOIDED');

CREATE TABLE IF NOT EXISTS sales_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    subtotal_amount NUMERIC(10,2) NOT NULL,
    discount_roundoff NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(10,2) NOT NULL,
    total_cogs NUMERIC(10,2) NOT NULL,
    payment_mode payment_mode_enum NOT NULL,
    amount_paid_now NUMERIC(10,2) NOT NULL,
    udhari_added NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status invoice_status_enum NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT invariant_sales_balance CHECK (
        subtotal_amount - discount_roundoff = grand_total AND
        grand_total = amount_paid_now + udhari_added
    )
);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_number ON sales_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_created ON sales_invoices(created_at);

-- 6. SALE ITEMS
CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_name_snapshot TEXT NOT NULL,
    qty NUMERIC(10,3) NOT NULL,
    unit_purchase_cost NUMERIC(10,2) NOT NULL,
    unit_selling_price NUMERIC(10,2) NOT NULL,
    line_total NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_invoice ON sale_items(invoice_id);

-- 7. KHATA TRANSACTIONS
CREATE TYPE khata_entry_enum AS ENUM ('DEBIT_UDHARI_GIVEN', 'CREDIT_JAMA_RECEIVED');
CREATE TYPE khata_channel_enum AS ENUM ('BILL_CREDIT', 'CASH', 'UPI', 'DISCOUNT_SETTLEMENT');

CREATE TABLE IF NOT EXISTS khata_transactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    entry_type khata_entry_enum NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    payment_channel khata_channel_enum NOT NULL,
    invoice_id TEXT REFERENCES sales_invoices(id),
    running_balance_after NUMERIC(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_khata_customer ON khata_transactions(customer_id);

-- 8. EXPENSES AND OWNER DRAWINGS
CREATE TYPE expense_category_enum AS ENUM (
    'SHOP_EXPENSE_RENT_ELEC',
    'SHOP_EXPENSE_TRANSPORT_BAGS',
    'HOME_SELF_USE_GOODS',
    'OWNER_CASH_DRAWING'
);
CREATE TYPE expense_paid_via_enum AS ENUM ('CASH_GALLA', 'UPI_BANK', 'INVENTORY_DEDUCTION');

CREATE TABLE IF NOT EXISTS expenses_and_drawings (
    id TEXT PRIMARY KEY,
    category expense_category_enum NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    paid_via expense_paid_via_enum NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. DAILY GALLA CASH SESSIONS
CREATE TABLE IF NOT EXISTS daily_galla_sessions (
    id TEXT PRIMARY KEY,
    session_date DATE NOT NULL UNIQUE,
    opening_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_sales_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_udhari_recovered NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_expenses_out NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    expected_closing_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    actual_counted_cash NUMERIC(10,2),
    discrepancy NUMERIC(10,2)
);

-- ==============================================================================
-- End of Schema Definition
-- ==============================================================================

