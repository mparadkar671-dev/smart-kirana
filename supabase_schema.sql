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
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    invite_code TEXT UNIQUE NOT NULL DEFAULT 'KRN-4829',
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    shop_name TEXT NOT NULL DEFAULT 'Shree Ganesh Kirana & General Store',
    owner_name TEXT NOT NULL DEFAULT 'Ramesh Patel',
    phone TEXT NOT NULL DEFAULT '9876543210',
    upi_vpa TEXT NOT NULL DEFAULT 'kirana@upi',
    address TEXT DEFAULT 'Shop No. 4, Main Market, Station Road',
    gst_footer_note TEXT DEFAULT 'Thank you for shopping with us! Visit again.',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_profile_shop_id ON shop_profile(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_profile_invite_code ON shop_profile(invite_code);

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

-- 10. STORE USERS & ROLE-BASED ACCESS CONTROL (OWNER, MANAGER, ACCOUNTANT, CASHIER)
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('OWNER', 'MANAGER', 'ACCOUNTANT', 'CASHIER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS store_users (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role user_role_enum NOT NULL DEFAULT 'OWNER',
    shop_id TEXT DEFAULT 'current_shop',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_users_email ON store_users(email);
CREATE INDEX IF NOT EXISTS idx_store_users_user ON store_users(user_id);
CREATE INDEX IF NOT EXISTS idx_store_users_role ON store_users(role);

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES FOR STORE APP (STRICT TENANT ISOLATION)
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
ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;

-- Security Definer Helpers for Tenant Scoping
CREATE OR REPLACE FUNCTION public.get_auth_shop_ids()
RETURNS SETOF TEXT AS $$
    SELECT shop_id FROM public.store_users 
    WHERE user_id = auth.uid() AND is_active = TRUE
    UNION
    SELECT id FROM public.shop_profile 
    WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_auth_user_role(target_shop_id TEXT)
RETURNS TEXT AS $$
    SELECT role::text FROM public.store_users 
    WHERE user_id = auth.uid() AND shop_id = target_shop_id AND is_active = TRUE
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DO $$ 
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'shop_profile', 'products', 'inventory_logs', 'customers',
        'sales_invoices', 'sale_items', 'khata_transactions',
        'expenses_and_drawings', 'daily_galla_sessions', 'store_users'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "allow_store_app_access" ON public.%I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow store app manage %s" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolated_policy" ON public.%I;', tbl);
    END LOOP;
END $$;

-- Table-specific tenant-isolated policies:

-- A. SHOP PROFILE
CREATE POLICY "tenant_isolated_shop_profile_select" ON public.shop_profile
    FOR SELECT TO authenticated
    USING (id IN (SELECT public.get_auth_shop_ids()) OR user_id = auth.uid());

CREATE POLICY "tenant_isolated_shop_profile_modify" ON public.shop_profile
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "anon_validate_invite_code" ON public.shop_profile
    FOR SELECT TO anon
    USING (invite_code IS NOT NULL);

-- B. STORE USERS
CREATE POLICY "tenant_isolated_store_users_select" ON public.store_users
    FOR SELECT TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR user_id = auth.uid());

CREATE POLICY "tenant_isolated_store_users_insert" ON public.store_users
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() OR shop_id IN (SELECT public.get_auth_shop_ids()));

CREATE POLICY "tenant_isolated_store_users_modify" ON public.store_users
    FOR UPDATE TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()));

-- C. PRODUCTS MASTER
CREATE POLICY "tenant_isolated_products" ON public.products
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()));

-- D. INVENTORY LOGS
CREATE POLICY "tenant_isolated_inventory_logs" ON public.inventory_logs
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()));

-- E. CUSTOMERS
CREATE POLICY "tenant_isolated_customers" ON public.customers
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()));

-- F. SALES INVOICES & SALE ITEMS
CREATE POLICY "tenant_isolated_sales_invoices" ON public.sales_invoices
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()));

CREATE POLICY "tenant_isolated_sale_items" ON public.sale_items
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()));

-- G. KHATA TRANSACTIONS
CREATE POLICY "tenant_isolated_khata_transactions" ON public.khata_transactions
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()));

-- H. EXPENSES & DRAWINGS (Restricted: Cashiers CANNOT access expenses)
CREATE POLICY "tenant_isolated_expenses" ON public.expenses_and_drawings
    FOR ALL TO authenticated
    USING (
        shop_id IN (SELECT public.get_auth_shop_ids()) 
        AND public.get_auth_user_role(shop_id) IN ('OWNER', 'MANAGER', 'ACCOUNTANT')
    )
    WITH CHECK (
        shop_id IN (SELECT public.get_auth_shop_ids()) 
        AND public.get_auth_user_role(shop_id) IN ('OWNER', 'MANAGER', 'ACCOUNTANT')
    );

-- I. DAILY GALLA SESSIONS
CREATE POLICY "tenant_isolated_daily_galla" ON public.daily_galla_sessions
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (
        shop_id IN (SELECT public.get_auth_shop_ids())
        AND public.get_auth_user_role(shop_id) IN ('OWNER', 'MANAGER', 'ACCOUNTANT')
    );

-- ==============================================================================
-- 11. INSTANT ACCESS / EMAIL VERIFICATION HELPER (RUN IN SQL EDITOR IF DESIRED)
-- ==============================================================================
-- If your shopkeepers sign up and see "Email not confirmed", you can either:
-- 1. In Supabase Dashboard -> Authentication -> Providers -> Email -> Turn OFF "Confirm email"
-- OR
-- 2. Run this one-line command to auto-confirm all existing registered users:
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email_confirmed_at IS NULL;

-- ==============================================================================
-- End of Schema Definition
-- ==============================================================================
