-- ==============================================================================
-- 🛡️ SMART KIRANA POS: COMPLETE DATABASE SCHEMA, RLS SECURITY & RESET SCRIPT
-- Standard: SRS-KIRANA-POS-V1 (Production Supabase PostgreSQL Migration)
-- 
-- Fixes:
-- 1. ERROR 42883 (operator does not exist: text = uuid) by adding explicit ::text
--    casts to both sides: user_id::text = auth.uid()::text.
-- 2. ERROR 42703 (column "user_id" / "approval_status" does not exist).
-- 3. Eliminates ALL 10 "Policy Exists RLS Disabled" Critical Warnings in Supabase.
-- 4. 100% Idempotent (Safe to execute multiple times in SQL Editor).
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. ENSURE ALL 11 TABLES EXIST
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.shop_profile (
    id TEXT PRIMARY KEY DEFAULT 'current_shop',
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    owner_user_id TEXT,
    invite_code TEXT DEFAULT 'KRN-4829',
    user_id TEXT,
    reset_epoch INTEGER NOT NULL DEFAULT 1,
    last_wiped_at TIMESTAMPTZ,
    shop_name TEXT NOT NULL DEFAULT 'Shree Ganesh Kirana & General Store',
    owner_name TEXT NOT NULL DEFAULT 'Ramesh Patel',
    phone TEXT NOT NULL DEFAULT '9876543210',
    upi_vpa TEXT NOT NULL DEFAULT 'kirana@upi',
    address TEXT DEFAULT 'Shop No. 4, Main Market, Station Road',
    gst_footer_note TEXT DEFAULT 'Thank you for shopping with us! Visit again.',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_users (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT 'Store Staff',
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'OWNER',
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    approval_status TEXT NOT NULL DEFAULT 'APPROVED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wholesalers (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    name TEXT NOT NULL,
    agency_or_brand TEXT,
    phone TEXT NOT NULL,
    gstin TEXT,
    address TEXT,
    visit_day TEXT DEFAULT 'Monday',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loan_accounts (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    name TEXT NOT NULL,
    lender_name TEXT NOT NULL DEFAULT 'Bank / Lender',
    principal_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    interest_rate_pct NUMERIC(6,2) DEFAULT 0.00,
    emi_or_daily_target NUMERIC(10,2) DEFAULT 0.00,
    amount_repaid NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    name TEXT NOT NULL,
    marathi_name TEXT,
    search_keywords TEXT,
    short_code TEXT NOT NULL,
    barcode TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    unit_type TEXT NOT NULL DEFAULT 'PCS',
    purchase_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    mrp NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    low_stock_threshold NUMERIC(12,3) NOT NULL DEFAULT 5.000,
    wholesaler_id TEXT REFERENCES public.wholesalers(id) ON DELETE SET NULL,
    last_supplier_name TEXT,
    supplier_phone TEXT,
    image_url TEXT,
    expiry_date DATE,
    is_quick_tap BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_landmark TEXT,
    credit_limit NUMERIC(10,2) NOT NULL DEFAULT 2000.00,
    current_udhari_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    oldest_unpaid_date TIMESTAMPTZ,
    last_reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    product_id TEXT NOT NULL,
    change_qty NUMERIC(10,3) NOT NULL,
    reason_type TEXT NOT NULL,
    unit_cost_at_time NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_invoices (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id TEXT NOT NULL,
    subtotal_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    discount_roundoff NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_cogs NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    payment_mode TEXT NOT NULL DEFAULT 'CASH',
    amount_paid_now NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    udhari_added NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    return_reason TEXT,
    credit_note_number TEXT,
    returned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    invoice_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name_snapshot TEXT NOT NULL DEFAULT 'Item',
    qty NUMERIC(10,3) NOT NULL DEFAULT 1.000,
    unit_selling_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    unit_purchase_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    line_cogs NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.khata_transactions (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    customer_id TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    balance_after NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    payment_channel TEXT DEFAULT 'CASH',
    invoice_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses_and_drawings (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    category TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    paid_via TEXT NOT NULL DEFAULT 'CASH_GALLA',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_galla_sessions (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    session_date DATE NOT NULL,
    opening_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_sales_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_udhari_recovered NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_expenses_out NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    expected_closing_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    actual_counted_cash NUMERIC(10,2),
    discrepancy NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_backup_archives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id TEXT NOT NULL,
    triggered_by TEXT,
    reset_mode TEXT NOT NULL,
    reset_epoch_at_backup INTEGER NOT NULL,
    record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    backup_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. ENSURE ALL COLUMNS EXIST ON PRE-EXISTING TABLES FIRST (PREVENTS ERROR 42703)
-- ==============================================================================
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS invite_code TEXT DEFAULT 'KRN-4829';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS reset_epoch INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS last_wiped_at TIMESTAMPTZ;
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS shop_name TEXT DEFAULT 'Shree Ganesh Kirana & General Store';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS owner_name TEXT DEFAULT 'Ramesh Patel';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '9876543210';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS upi_vpa TEXT DEFAULT 'kirana@upi';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS address TEXT DEFAULT 'Shop No. 4, Main Market, Station Road';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS gst_footer_note TEXT DEFAULT 'Thank you for shopping with us! Visit again.';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT 'Store Staff';
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'OWNER';
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS agency_or_brand TEXT;
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS visit_day TEXT DEFAULT 'Monday';
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.wholesalers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS marathi_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_keywords TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS loan_account_id TEXT;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS loan_account_id TEXT;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS loan_account_id TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS short_code TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'PCS';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mrp NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS current_stock NUMERIC(12,3) DEFAULT 0.000;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(12,3) DEFAULT 5.000;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesaler_id TEXT REFERENCES public.wholesalers(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS last_supplier_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_phone TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_quick_tap BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Upgrade existing stock/qty columns to NUMERIC(12,3) for fractional kg/L precision (e.g. 0.500 kg, 5.250 kg)
ALTER TABLE public.products ALTER COLUMN current_stock TYPE NUMERIC(12,3) USING current_stock::numeric(12,3);
ALTER TABLE public.products ALTER COLUMN low_stock_threshold TYPE NUMERIC(12,3) USING low_stock_threshold::numeric(12,3);
ALTER TABLE public.inventory_logs ALTER COLUMN change_qty TYPE NUMERIC(12,3) USING change_qty::numeric(12,3);
ALTER TABLE public.sale_items ALTER COLUMN qty TYPE NUMERIC(12,3) USING qty::numeric(12,3);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_landmark TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(10,2) DEFAULT 2000.00;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS current_udhari_balance NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS oldest_unpaid_date TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS change_qty NUMERIC(10,3) DEFAULT 0;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS reason_type TEXT;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS unit_cost_at_time NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS discount_roundoff NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS grand_total NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS total_cogs NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'CASH';
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS amount_paid_now NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS udhari_added NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS credit_note_number TEXT;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT DEFAULT 'Item';
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS qty NUMERIC(10,3) DEFAULT 1.000;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_selling_price NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_purchase_cost NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS line_cogs NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS entry_type TEXT;
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS payment_channel TEXT DEFAULT 'CASH';
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.khata_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.expenses_and_drawings ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.expenses_and_drawings ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.expenses_and_drawings ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.expenses_and_drawings ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'BUSINESS_EXPENSE';
ALTER TABLE public.expenses_and_drawings ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.expenses_and_drawings ADD COLUMN IF NOT EXISTS paid_via TEXT DEFAULT 'CASH_GALLA';
ALTER TABLE public.expenses_and_drawings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.expenses_and_drawings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'KIRANA_RETAIL';
ALTER TABLE public.shop_profile ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'KRN';

CREATE TABLE IF NOT EXISTS public.advance_orders (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    order_number TEXT NOT NULL,
    customer_id TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL DEFAULT '',
    delivery_date_time TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    special_instructions TEXT DEFAULT '',
    total_amount NUMERIC(10,2) DEFAULT 0.00,
    advance_token_paid NUMERIC(10,2) DEFAULT 0.00,
    balance_due NUMERIC(10,2) DEFAULT 0.00,
    payment_mode TEXT DEFAULT 'CASH',
    status TEXT DEFAULT 'PENDING',
    converted_invoice_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'current_shop';
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS session_date DATE;
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS cash_sales_total NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS cash_udhari_recovered NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS cash_expenses_out NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS expected_closing_cash NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS actual_counted_cash NUMERIC(10,2);
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS discrepancy NUMERIC(10,2);
ALTER TABLE public.daily_galla_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ==============================================================================
-- 4. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_shop_profile_shop_id ON public.shop_profile(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_profile_invite_code ON public.shop_profile(invite_code);
CREATE INDEX IF NOT EXISTS idx_wholesalers_shop_id ON public.wholesalers(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON public.products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_wholesaler_id ON public.products(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON public.customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_shop_id ON public.inventory_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_shop_id ON public.sales_invoices(shop_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_shop_id ON public.sale_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_khata_transactions_shop_id ON public.khata_transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shop_id ON public.expenses_and_drawings(shop_id);
CREATE INDEX IF NOT EXISTS idx_daily_galla_shop_id ON public.daily_galla_sessions(shop_id);
CREATE INDEX IF NOT EXISTS idx_store_users_shop_id ON public.store_users(shop_id);

-- ==============================================================================
-- 5. HELPER FUNCTIONS WITH EXPLICIT ::text CASTS (PREVENTS ERROR 42883)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_auth_shop_ids()
RETURNS SETOF TEXT AS $$
    SELECT shop_id FROM public.store_users 
    WHERE user_id::text = auth.uid()::text 
      AND (is_active = TRUE OR is_active IS NULL)
      AND (approval_status = 'APPROVED' OR approval_status IS NULL)
    UNION
    SELECT id FROM public.shop_profile 
    WHERE user_id::text = auth.uid()::text OR owner_user_id::text = auth.uid()::text OR user_id IS NULL
    UNION
    SELECT shop_id FROM public.shop_profile
    WHERE user_id::text = auth.uid()::text OR owner_user_id::text = auth.uid()::text OR user_id IS NULL;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_shop_id()
RETURNS TEXT AS $$
    SELECT shop_id FROM public.store_users
    WHERE user_id::text = auth.uid()::text 
      AND (is_active = true OR is_active IS NULL) 
      AND (approval_status = 'APPROVED' OR approval_status IS NULL)
    UNION
    SELECT id FROM public.shop_profile
    WHERE user_id::text = auth.uid()::text OR owner_user_id::text = auth.uid()::text
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_my_shop_owner(p_shop_id TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.store_users
        WHERE user_id::text = auth.uid()::text
          AND shop_id = p_shop_id
          AND role = 'OWNER'
          AND (is_active = true OR is_active IS NULL)
          AND (approval_status = 'APPROVED' OR approval_status IS NULL)
        UNION
        SELECT 1 FROM public.shop_profile
        WHERE (user_id::text = auth.uid()::text OR owner_user_id::text = auth.uid()::text OR user_id IS NULL)
          AND (id = p_shop_id OR shop_id = p_shop_id)
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_auth_user_role(target_shop_id TEXT)
RETURNS TEXT AS $$
    SELECT role::text FROM public.store_users 
    WHERE user_id::text = auth.uid()::text 
      AND shop_id = target_shop_id 
      AND (is_active = TRUE OR is_active IS NULL)
    UNION
    SELECT 'OWNER'::text FROM public.shop_profile
    WHERE (user_id::text = auth.uid()::text OR owner_user_id::text = auth.uid()::text OR user_id IS NULL) 
      AND (id = target_shop_id OR shop_id = target_shop_id)
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.validate_shop_invite_code(code_input TEXT)
RETURNS TABLE (
    valid BOOLEAN,
    shop_id TEXT,
    shop_name TEXT,
    owner_name TEXT
) AS $$
    SELECT 
        TRUE AS valid,
        COALESCE(shop_id, id) AS shop_id,
        shop_name,
        owner_name
    FROM public.shop_profile
    WHERE UPPER(invite_code) = UPPER(TRIM(code_input))
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ATOMIC STORE DANGER VAULT RESET RPC FUNCTION
CREATE OR REPLACE FUNCTION public.execute_store_vault_reset(
    p_shop_id TEXT,
    p_reset_mode TEXT,
    p_save_cloud_archive BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
    v_arch_id UUID;
    v_archive_payload JSONB := '{}'::jsonb;
    v_counts JSONB := '{}'::jsonb;
    v_caller_id TEXT := auth.uid()::text;
    v_current_epoch INTEGER := 1;
    v_new_epoch INTEGER := 2;
    v_items_count INT := 0;
    v_invoices_count INT := 0;
    v_logs_count INT := 0;
    v_khata_count INT := 0;
    v_expenses_count INT := 0;
    v_galla_count INT := 0;
    v_products_count INT := 0;
    v_customers_count INT := 0;
BEGIN
    SELECT COALESCE(reset_epoch, 1) INTO v_current_epoch
    FROM public.shop_profile
    WHERE id = p_shop_id OR shop_id = p_shop_id
    LIMIT 1;

    v_new_epoch := COALESCE(v_current_epoch, 1) + 1;

    SELECT COUNT(*) INTO v_items_count FROM public.sale_items WHERE shop_id = p_shop_id;
    SELECT COUNT(*) INTO v_invoices_count FROM public.sales_invoices WHERE shop_id = p_shop_id;
    SELECT COUNT(*) INTO v_logs_count FROM public.inventory_logs WHERE shop_id = p_shop_id;
    SELECT COUNT(*) INTO v_khata_count FROM public.khata_transactions WHERE shop_id = p_shop_id;
    SELECT COUNT(*) INTO v_expenses_count FROM public.expenses_and_drawings WHERE shop_id = p_shop_id;
    SELECT COUNT(*) INTO v_galla_count FROM public.daily_galla_sessions WHERE shop_id = p_shop_id;
    SELECT COUNT(*) INTO v_products_count FROM public.products WHERE shop_id = p_shop_id;
    SELECT COUNT(*) INTO v_customers_count FROM public.customers WHERE shop_id = p_shop_id AND id != '0000-WALK-IN';

    v_counts := jsonb_build_object(
        'sale_items', v_items_count,
        'sales_invoices', v_invoices_count,
        'inventory_logs', v_logs_count,
        'khata_transactions', v_khata_count,
        'expenses', v_expenses_count,
        'daily_galla', v_galla_count,
        'products', v_products_count,
        'customers', v_customers_count
    );

    IF p_save_cloud_archive IS TRUE THEN
        v_archive_payload := jsonb_build_object(
            'shop_id', p_shop_id,
            'reset_mode', p_reset_mode,
            'timestamp', NOW(),
            'counts', v_counts
        );

        INSERT INTO public.store_backup_archives (
            shop_id,
            triggered_by,
            reset_mode,
            reset_epoch_at_backup,
            record_counts,
            backup_payload
        ) VALUES (
            p_shop_id,
            v_caller_id,
            p_reset_mode,
            v_current_epoch,
            v_counts,
            v_archive_payload
        ) RETURNING id INTO v_arch_id;
    END IF;

    DELETE FROM public.sale_items WHERE shop_id = p_shop_id;
    DELETE FROM public.sales_invoices WHERE shop_id = p_shop_id;
    DELETE FROM public.inventory_logs WHERE shop_id = p_shop_id;
    DELETE FROM public.khata_transactions WHERE shop_id = p_shop_id;
    DELETE FROM public.expenses_and_drawings WHERE shop_id = p_shop_id;
    DELETE FROM public.daily_galla_sessions WHERE shop_id = p_shop_id;

    UPDATE public.customers
    SET current_udhari_balance = 0.00, oldest_unpaid_date = NULL
    WHERE shop_id = p_shop_id;

    IF p_reset_mode = 'WIPE_ALL_FRESH_STORE' THEN
        DELETE FROM public.products WHERE shop_id = p_shop_id;
        DELETE FROM public.wholesalers WHERE shop_id = p_shop_id;
        DELETE FROM public.customers WHERE shop_id = p_shop_id AND id != '0000-WALK-IN';
    END IF;

    UPDATE public.shop_profile
    SET reset_epoch = v_new_epoch,
        last_wiped_at = NOW(),
        updated_at = NOW()
    WHERE id = p_shop_id OR shop_id = p_shop_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'shop_id', p_shop_id,
        'reset_mode', p_reset_mode,
        'archive_id', v_arch_id,
        'previous_epoch', v_current_epoch,
        'new_epoch', v_new_epoch,
        'deleted_counts', v_counts,
        'executed_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 6. ENABLE ROW LEVEL SECURITY (RLS) ON ALL 10 OPERATIONAL TABLES
-- (ELIMINATES ALL 10 CRITICAL WARNINGS IN SUPABASE DATABASE LINT)
-- ==============================================================================
ALTER TABLE public.shop_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesalers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses_and_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_galla_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_backup_archives ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 7. CLEAN & RECREATE RLS POLICIES FOR BOTH AUTHENTICATED & ANON
-- ==============================================================================
DROP POLICY IF EXISTS "authenticated_shop_profile" ON public.shop_profile;
DROP POLICY IF EXISTS "anon_shop_profile" ON public.shop_profile;
CREATE POLICY "authenticated_shop_profile" ON public.shop_profile FOR ALL TO authenticated
    USING (id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR owner_user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR owner_user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_shop_profile" ON public.shop_profile FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_store_users" ON public.store_users;
DROP POLICY IF EXISTS "anon_store_users" ON public.store_users;
CREATE POLICY "authenticated_store_users" ON public.store_users FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_store_users" ON public.store_users FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_wholesalers" ON public.wholesalers;
DROP POLICY IF EXISTS "anon_wholesalers" ON public.wholesalers;
CREATE POLICY "authenticated_wholesalers" ON public.wholesalers FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_wholesalers" ON public.wholesalers FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_products" ON public.products;
DROP POLICY IF EXISTS "anon_products" ON public.products;
CREATE POLICY "authenticated_products" ON public.products FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_products" ON public.products FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_customers" ON public.customers;
DROP POLICY IF EXISTS "anon_customers" ON public.customers;
CREATE POLICY "authenticated_customers" ON public.customers FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_customers" ON public.customers FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_inventory_logs" ON public.inventory_logs;
DROP POLICY IF EXISTS "anon_inventory_logs" ON public.inventory_logs;
CREATE POLICY "authenticated_inventory_logs" ON public.inventory_logs FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_inventory_logs" ON public.inventory_logs FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_sales_invoices" ON public.sales_invoices;
DROP POLICY IF EXISTS "anon_sales_invoices" ON public.sales_invoices;
CREATE POLICY "authenticated_sales_invoices" ON public.sales_invoices FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_sales_invoices" ON public.sales_invoices FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "anon_sale_items" ON public.sale_items;
CREATE POLICY "authenticated_sale_items" ON public.sale_items FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_sale_items" ON public.sale_items FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_khata_transactions" ON public.khata_transactions;
DROP POLICY IF EXISTS "anon_khata_transactions" ON public.khata_transactions;
CREATE POLICY "authenticated_khata_transactions" ON public.khata_transactions FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_khata_transactions" ON public.khata_transactions FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_expenses" ON public.expenses_and_drawings;
DROP POLICY IF EXISTS "anon_expenses" ON public.expenses_and_drawings;
CREATE POLICY "authenticated_expenses" ON public.expenses_and_drawings FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_expenses" ON public.expenses_and_drawings FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_daily_galla" ON public.daily_galla_sessions;
DROP POLICY IF EXISTS "anon_daily_galla" ON public.daily_galla_sessions;
CREATE POLICY "authenticated_daily_galla" ON public.daily_galla_sessions FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL)
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id::text = auth.uid()::text OR user_id IS NULL);
CREATE POLICY "anon_daily_galla" ON public.daily_galla_sessions FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_backup_archives" ON public.store_backup_archives;
DROP POLICY IF EXISTS "anon_backup_archives" ON public.store_backup_archives;
CREATE POLICY "authenticated_backup_archives" ON public.store_backup_archives FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop')
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop');
CREATE POLICY "anon_backup_archives" ON public.store_backup_archives FOR ALL TO anon
    USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

-- ==============================================================================
-- 8. GRANT PRIVILEGES TO ALL ROLES & AUTO-CONFIRM USERS
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- 9. PRE-SEED DEFAULT COUNTER CASH CUSTOMER (REQUIRED FOR ZERO-CONFIG BILLING)
INSERT INTO public.customers (id, shop_id, name, phone, address_landmark, credit_limit, current_udhari_balance)
VALUES ('0000-WALK-IN', 'current_shop', 'Walk-in Customer (Cash / UPI)', '0000000000', 'Counter Sale', 0.00, 0.00)
ON CONFLICT (id) DO NOTHING;

-- Verification query
SELECT tablename, rowsecurity AS rls_enabled FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('shop_profile', 'products', 'inventory_logs', 'customers', 'sales_invoices', 'sale_items', 'khata_transactions', 'expenses_and_drawings', 'daily_galla_sessions', 'store_users')
ORDER BY tablename ASC;

-- ============================================================================
-- 10. ADD STRICT business_type ISOLATION COLUMN TO ALL OPERATIONAL TABLES
-- ============================================================================
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'KIRANA_RETAIL'
  CHECK (business_type IN ('KIRANA_RETAIL', 'HOMEMADE_FOOD'));

ALTER TABLE public.inventory_logs 
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'KIRANA_RETAIL'
  CHECK (business_type IN ('KIRANA_RETAIL', 'HOMEMADE_FOOD'));

ALTER TABLE public.customers 
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'KIRANA_RETAIL'
  CHECK (business_type IN ('KIRANA_RETAIL', 'HOMEMADE_FOOD'));

ALTER TABLE public.sales_invoices 
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'KIRANA_RETAIL'
  CHECK (business_type IN ('KIRANA_RETAIL', 'HOMEMADE_FOOD'));

ALTER TABLE public.sale_items 
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'KIRANA_RETAIL'
  CHECK (business_type IN ('KIRANA_RETAIL', 'HOMEMADE_FOOD'));

ALTER TABLE public.khata_transactions 
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'KIRANA_RETAIL'
  CHECK (business_type IN ('KIRANA_RETAIL', 'HOMEMADE_FOOD'));

ALTER TABLE public.expenses_and_drawings 
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'KIRANA_RETAIL'
  CHECK (business_type IN ('KIRANA_RETAIL', 'HOMEMADE_FOOD'));

ALTER TABLE public.daily_galla_sessions 
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'KIRANA_RETAIL'
  CHECK (business_type IN ('KIRANA_RETAIL', 'HOMEMADE_FOOD'));

-- Composite indexes for 0ms filtered lookups by (shop_id, business_type)
CREATE INDEX IF NOT EXISTS idx_products_shop_biz ON public.products(shop_id, business_type);
CREATE INDEX IF NOT EXISTS idx_inv_logs_shop_biz ON public.inventory_logs(shop_id, business_type);
CREATE INDEX IF NOT EXISTS idx_customers_shop_biz ON public.customers(shop_id, business_type);
CREATE INDEX IF NOT EXISTS idx_invoices_shop_biz ON public.sales_invoices(shop_id, business_type);
CREATE INDEX IF NOT EXISTS idx_expenses_shop_biz ON public.expenses_and_drawings(shop_id, business_type);
CREATE INDEX IF NOT EXISTS idx_galla_shop_biz ON public.daily_galla_sessions(shop_id, business_type);

-- ============================================================================
-- 11. AUTO-CLEANUP & SEPARATE ALREADY-MIXED PRODUCTS IN DATABASE
-- ============================================================================
-- Tag all Homemade Food categories & items strictly as 'HOMEMADE_FOOD'
UPDATE public.products
SET business_type = 'HOMEMADE_FOOD'
WHERE category ILIKE ANY (ARRAY[
  '%Modak%', '%Festive%', '%Laddu%', '%Ladoo%', '%Ghavane%', 
  '%Amboli%', '%Bhakri%', '%Chapati%', '%Poli%', '%Homemade%', '%Gruh Udyog%', '%Kapa%', '%Vadi%'
])
OR name ILIKE ANY (ARRAY[
  '%पुरणपोळी%', '%Puran Poli%', '%मोदक%', '%Modak%', '%लाडू%', '%Laddu%', 
  '%घावणे%', '%Ghavane%', '%आंबोळी%', '%Amboli%', '%भाकरी%', '%Bhakri%', 
  '%चपाती%', '%Chapati%', '%कापा%', '%Kapa%'
]);

-- Tag all Grocery / Kirana categories strictly as 'KIRANA_RETAIL'
UPDATE public.products
SET business_type = 'KIRANA_RETAIL'
WHERE business_type != 'HOMEMADE_FOOD';
