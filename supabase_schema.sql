-- ==============================================================================
-- Smart Kirana POS, Inventory & Customer Udhari (Khata) Database Schema
-- Standard: SRS-KIRANA-POS-V1 (Production Supabase PostgreSQL Migration)
-- Multi-Tenant Row Level Security (RLS) & Standard Supabase Authentication
-- 100% Idempotent (Safe to execute multiple times in SQL Editor)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SHOP PROFILE & SETTINGS
CREATE TABLE IF NOT EXISTS shop_profile (
    id TEXT PRIMARY KEY DEFAULT 'current_shop',
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    shop_name TEXT NOT NULL DEFAULT 'Shree Ganesh Kirana & General Store',
    owner_name TEXT NOT NULL DEFAULT 'Ramesh Patel',
    phone TEXT NOT NULL DEFAULT '9876543210',
    upi_vpa TEXT NOT NULL DEFAULT 'kirana@upi',
    address TEXT DEFAULT 'Shop No. 4, Main Market, Station Road',
    gst_footer_note TEXT DEFAULT 'Thank you for shopping with us! Visit again.',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRODUCTS MASTER
DO $$ BEGIN
    CREATE TYPE unit_type_enum AS ENUM ('PCS', 'KG_LOOSE', 'LTR', 'PACK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
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
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

-- 3. APPEND-ONLY INVENTORY LOGS (LEDGER INVARIANT)
DO $$ BEGIN
    CREATE TYPE inventory_reason_enum AS ENUM (
        'PURCHASE_IN', 
        'SALE_OUT', 
        'RETURN_IN', 
        'SELF_USE_OUT', 
        'DAMAGE_EXPIRED_OUT', 
        'AUDIT_ADJUST'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS inventory_logs (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
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
CREATE INDEX IF NOT EXISTS idx_inventory_logs_user ON inventory_logs(user_id);

-- 4. CUSTOMERS & KHATA LEDGER
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
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
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);

-- Pre-seed anonymous system walk-in customer
INSERT INTO customers (id, name, phone, address_landmark, credit_limit, current_udhari_balance)
VALUES ('0000-WALK-IN', 'Walk-in Customer (Cash / UPI)', '0000000000', 'Counter Sale', 0.00, 0.00)
ON CONFLICT (id) DO NOTHING;

-- 5. SALES INVOICES
DO $$ BEGIN
    CREATE TYPE payment_mode_enum AS ENUM ('CASH', 'UPI', 'UDHARI_FULL', 'SPLIT_PARTIAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE invoice_status_enum AS ENUM ('COMPLETED', 'VOIDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS sales_invoices (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
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
CREATE INDEX IF NOT EXISTS idx_sales_invoices_user ON sales_invoices(user_id);

-- 6. SALE ITEMS
CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_name_snapshot TEXT NOT NULL,
    qty NUMERIC(10,3) NOT NULL,
    unit_purchase_cost NUMERIC(10,2) NOT NULL,
    unit_selling_price NUMERIC(10,2) NOT NULL,
    line_total NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_invoice ON sale_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_user ON sale_items(user_id);

-- 7. KHATA TRANSACTIONS
DO $$ BEGIN
    CREATE TYPE khata_entry_enum AS ENUM ('DEBIT_UDHARI_GIVEN', 'CREDIT_JAMA_RECEIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE khata_channel_enum AS ENUM ('BILL_CREDIT', 'CASH', 'UPI', 'DISCOUNT_SETTLEMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS khata_transactions (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
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
CREATE INDEX IF NOT EXISTS idx_khata_user ON khata_transactions(user_id);

-- 8. EXPENSES AND OWNER DRAWINGS
DO $$ BEGIN
    CREATE TYPE expense_category_enum AS ENUM (
        'SHOP_EXPENSE_RENT_ELEC',
        'SHOP_EXPENSE_TRANSPORT_BAGS',
        'HOME_SELF_USE_GOODS',
        'OWNER_CASH_DRAWING'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expense_paid_via_enum AS ENUM ('CASH_GALLA', 'UPI_BANK', 'INVENTORY_DEDUCTION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS expenses_and_drawings (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    category expense_category_enum NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    paid_via expense_paid_via_enum NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses_and_drawings(user_id);

-- 9. DAILY GALLA CASH SESSIONS
CREATE TABLE IF NOT EXISTS daily_galla_sessions (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    session_date DATE NOT NULL UNIQUE,
    opening_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_sales_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_udhari_recovered NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_expenses_out NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    expected_closing_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    actual_counted_cash NUMERIC(10,2),
    discrepancy NUMERIC(10,2)
);

CREATE INDEX IF NOT EXISTS idx_galla_user ON daily_galla_sessions(user_id);

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES FOR AUTHENTICATED STORE TENANTS
-- ==============================================================================
ALTER TABLE shop_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE khata_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses_and_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_galla_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    -- Shop Profile Policies
    CREATE POLICY "Users can manage their own shop profile" ON shop_profile
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
        WITH CHECK (auth.uid() = user_id);

    -- Products Master Policies
    CREATE POLICY "Users can manage their own products" ON products
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
        WITH CHECK (auth.uid() = user_id);

    -- Inventory Logs Policies
    CREATE POLICY "Users can manage their own inventory logs" ON inventory_logs
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
        WITH CHECK (auth.uid() = user_id);

    -- Customers & Khata Policies
    CREATE POLICY "Users can manage their own customers" ON customers
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR id = '0000-WALK-IN')
        WITH CHECK (auth.uid() = user_id OR id = '0000-WALK-IN');

    -- Sales Invoices Policies
    CREATE POLICY "Users can manage their own sales invoices" ON sales_invoices
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
        WITH CHECK (auth.uid() = user_id);

    -- Sale Items Policies
    CREATE POLICY "Users can manage their own sale items" ON sale_items
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
        WITH CHECK (auth.uid() = user_id);

    -- Khata Transactions Policies
    CREATE POLICY "Users can manage their own khata entries" ON khata_transactions
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
        WITH CHECK (auth.uid() = user_id);

    -- Expenses Policies
    CREATE POLICY "Users can manage their own expenses" ON expenses_and_drawings
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
        WITH CHECK (auth.uid() = user_id);

    -- Daily Galla Policies
    CREATE POLICY "Users can manage their own daily galla sessions" ON daily_galla_sessions
        FOR ALL TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
        WITH CHECK (auth.uid() = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- End of Schema Definition
-- ==============================================================================
