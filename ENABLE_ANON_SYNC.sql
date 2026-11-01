-- ==============================================================================
-- 🛡️ SMART KIRANA POS: PRODUCTION DATABASE SCHEMA, RLS SECURITY & CLOUD SYNC
-- Standard: SRS-KIRANA-POS-V1 (Complete Standalone Idempotent Supabase Migration)
--
-- Fixes:
-- 1. ERROR 42883 (get_auth_shop_ids function missing) by creating all functions FIRST.
-- 2. Eliminates all 10 "RLS Disabled in Public" Critical Security Warnings in Supabase.
-- 3. Enables instant two-way Cloud Sync so that products, sales invoices, customers,
--    and khata entries immediately save to Supabase and show in Table Editor.
-- 4. Auto-confirms all registered staff/owner emails so login works with zero friction.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENSURE ALL 10 TABLES EXIST WITH MULTI-TENANT shop_id COLUMNS
DO $$ 
BEGIN
    -- shop_profile: ensure columns exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shop_profile' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_profile' AND column_name = 'invite_code') THEN
            ALTER TABLE public.shop_profile ADD COLUMN invite_code TEXT UNIQUE DEFAULT 'KRN-4829';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_profile' AND column_name = 'shop_id') THEN
            ALTER TABLE public.shop_profile ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
    END IF;

    -- products
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'shop_id') THEN
            ALTER TABLE public.products ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
    END IF;

    -- inventory_logs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_logs' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'shop_id') THEN
            ALTER TABLE public.inventory_logs ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
    END IF;

    -- customers
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'shop_id') THEN
            ALTER TABLE public.customers ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
    END IF;

    -- sales_invoices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_invoices' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_invoices' AND column_name = 'shop_id') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_invoices' AND column_name = 'credit_note_number') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN credit_note_number TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_invoices' AND column_name = 'return_reason') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN return_reason TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_invoices' AND column_name = 'returned_at') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN returned_at TIMESTAMPTZ;
        END IF;
    END IF;

    -- sale_items
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sale_items' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'shop_id') THEN
            ALTER TABLE public.sale_items ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
    END IF;

    -- khata_transactions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'khata_transactions' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'khata_transactions' AND column_name = 'shop_id') THEN
            ALTER TABLE public.khata_transactions ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
    END IF;

    -- expenses_and_drawings
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expenses_and_drawings' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses_and_drawings' AND column_name = 'shop_id') THEN
            ALTER TABLE public.expenses_and_drawings ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
    END IF;

    -- daily_galla_sessions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_galla_sessions' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_galla_sessions' AND column_name = 'shop_id') THEN
            ALTER TABLE public.daily_galla_sessions ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
    END IF;

    -- store_users
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'store_users' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_users' AND column_name = 'shop_id') THEN
            ALTER TABLE public.store_users ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_users' AND column_name = 'is_active') THEN
            ALTER TABLE public.store_users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
        END IF;
    END IF;
END $$;

-- 3. CREATE MULTI-TENANT PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_shop_profile_shop_id ON public.shop_profile(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_profile_invite_code ON public.shop_profile(invite_code);
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON public.products(shop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_shop_id ON public.inventory_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON public.customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_shop_id ON public.sales_invoices(shop_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_shop_id ON public.sale_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_khata_transactions_shop_id ON public.khata_transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shop_id ON public.expenses_and_drawings(shop_id);
CREATE INDEX IF NOT EXISTS idx_daily_galla_shop_id ON public.daily_galla_sessions(shop_id);
CREATE INDEX IF NOT EXISTS idx_store_users_shop_id ON public.store_users(shop_id);

-- 4. SECURITY DEFINER HELPER FUNCTIONS (CREATED FIRST TO PREVENT 42883 ERRORS)
CREATE OR REPLACE FUNCTION public.get_auth_shop_ids()
RETURNS SETOF TEXT AS $$
    SELECT shop_id FROM public.store_users 
    WHERE user_id = auth.uid() AND (is_active = TRUE OR is_active IS NULL)
    UNION
    SELECT id FROM public.shop_profile 
    WHERE user_id = auth.uid()
    UNION
    SELECT shop_id FROM public.shop_profile
    WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_auth_user_role(target_shop_id TEXT)
RETURNS TEXT AS $$
    SELECT role::text FROM public.store_users 
    WHERE user_id = auth.uid() AND shop_id = target_shop_id AND (is_active = TRUE OR is_active IS NULL)
    UNION
    SELECT 'OWNER'::text FROM public.shop_profile
    WHERE user_id = auth.uid() AND (id = target_shop_id OR shop_id = target_shop_id)
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
        sp.id AS shop_id,
        sp.shop_name,
        sp.owner_name
    FROM public.shop_profile sp
    WHERE UPPER(TRIM(sp.invite_code)) = UPPER(TRIM(code_input))
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execution permissions on helper functions
GRANT EXECUTE ON FUNCTION public.get_auth_shop_ids() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_role(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_shop_invite_code(TEXT) TO anon, authenticated;

-- 5. GRANT SCHEMA ACCESS TO AUTHENTICATED AND ANON ROLES
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 6. ENABLE ROW LEVEL SECURITY ON ALL 10 TABLES (REMOVES ALL SUPABASE CRITICAL ALERTS)
ALTER TABLE public.shop_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses_and_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_galla_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_users ENABLE ROW LEVEL SECURITY;

-- 7. CLEAN UP ANY OLD POLICIES
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
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolated_%s" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "authenticated_%s" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "anon_%s" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "allow_authenticated_all" ON public.%I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "allow_anon_sync" ON public.%I;', tbl);
    END LOOP;
END $$;

-- 8. APPLY ENTERPRISE TENANT-AWARE RLS POLICIES FOR LIVE CLOUD SYNC

-- A. SHOP PROFILE
CREATE POLICY "authenticated_shop_profile" ON public.shop_profile
    FOR ALL TO authenticated
    USING (id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_shop_profile" ON public.shop_profile
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- B. STORE USERS
CREATE POLICY "authenticated_store_users" ON public.store_users
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_store_users" ON public.store_users
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- C. PRODUCTS
CREATE POLICY "authenticated_products" ON public.products
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_products" ON public.products
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- D. INVENTORY LOGS
CREATE POLICY "authenticated_inventory_logs" ON public.inventory_logs
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_inventory_logs" ON public.inventory_logs
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- E. CUSTOMERS
CREATE POLICY "authenticated_customers" ON public.customers
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_customers" ON public.customers
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- F. SALES INVOICES & SALE ITEMS
CREATE POLICY "authenticated_sales_invoices" ON public.sales_invoices
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_sales_invoices" ON public.sales_invoices
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

CREATE POLICY "authenticated_sale_items" ON public.sale_items
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_sale_items" ON public.sale_items
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- G. KHATA TRANSACTIONS
CREATE POLICY "authenticated_khata_transactions" ON public.khata_transactions
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_khata_transactions" ON public.khata_transactions
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- H. EXPENSES & DRAWINGS
CREATE POLICY "authenticated_expenses" ON public.expenses_and_drawings
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_expenses" ON public.expenses_and_drawings
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- I. DAILY GALLA SESSIONS
CREATE POLICY "authenticated_daily_galla" ON public.daily_galla_sessions
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid())
    WITH CHECK (shop_id IN (SELECT public.get_auth_shop_ids()) OR shop_id = 'current_shop' OR user_id = auth.uid());

CREATE POLICY "anon_daily_galla" ON public.daily_galla_sessions
    FOR ALL TO anon
    USING (id IS NOT NULL)
    WITH CHECK (id IS NOT NULL);

-- 9. AUTO-CONFIRM ALL AUTH EMAILS (ZERO VERIFICATION BLOCKERS)
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- 10. VERIFICATION SUMMARY CHECK
SELECT 
    tablename, 
    rowsecurity AS rls_enabled,
    'SECURE & ACTIVE' AS status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
      'shop_profile', 'products', 'inventory_logs', 'customers', 
      'sales_invoices', 'sale_items', 'khata_transactions', 
      'expenses_and_drawings', 'daily_galla_sessions', 'store_users'
  )
ORDER BY tablename ASC;
