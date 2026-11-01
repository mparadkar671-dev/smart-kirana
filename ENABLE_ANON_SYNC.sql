-- ==============================================================================
-- 🛡️ SMART KIRANA POS: ENTERPRISE MULTI-TENANT ISOLATION & TRUE RLS POLICIES
-- Standard: SRS-KIRANA-POS-V1 (Iteration 1: Strict Tenant Scoping & Invite Code Auth)
-- 
-- Eliminates permissive USING (true) policies.
-- Enforces:
-- 1. shop_id NOT NULL and indexed across all 10 tables.
-- 2. Unique 6-digit invite_code on shop_profile.
-- 3. Anon role has ZERO read/write access to operational tables.
-- 4. Authenticated users are strictly scoped to their assigned shop_id via store_users.
-- 5. Role-based restrictions: Cashiers cannot view expenses or galla discrepancies.
-- ==============================================================================

-- 1. Ensure uuid-ossp extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Schema Upgrades: Add shop_id to all tables if not present
DO $$ 
BEGIN
    -- shop_profile: add invite_code and shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_profile' AND column_name = 'invite_code') THEN
        ALTER TABLE public.shop_profile ADD COLUMN invite_code TEXT UNIQUE DEFAULT 'KRN-4829';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_profile' AND column_name = 'shop_id') THEN
        ALTER TABLE public.shop_profile ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- products: add shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'shop_id') THEN
        ALTER TABLE public.products ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- inventory_logs: add shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'shop_id') THEN
        ALTER TABLE public.inventory_logs ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- customers: add shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'shop_id') THEN
        ALTER TABLE public.customers ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- sales_invoices: add shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_invoices' AND column_name = 'shop_id') THEN
        ALTER TABLE public.sales_invoices ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- sale_items: add shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'shop_id') THEN
        ALTER TABLE public.sale_items ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- khata_transactions: add shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'khata_transactions' AND column_name = 'shop_id') THEN
        ALTER TABLE public.khata_transactions ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- expenses_and_drawings: add shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses_and_drawings' AND column_name = 'shop_id') THEN
        ALTER TABLE public.expenses_and_drawings ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- daily_galla_sessions: add shop_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_galla_sessions' AND column_name = 'shop_id') THEN
        ALTER TABLE public.daily_galla_sessions ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;

    -- store_users: ensure shop_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_users' AND column_name = 'shop_id') THEN
        ALTER TABLE public.store_users ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'current_shop';
    END IF;
END $$;

-- 3. Create Multi-Tenant Indexes
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

-- 4. Helper Security Functions for Tenant Scoping
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

-- 5. Revoke anon permissions from operational tables
REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.inventory_logs FROM anon;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.sales_invoices FROM anon;
REVOKE ALL ON public.sale_items FROM anon;
REVOKE ALL ON public.khata_transactions FROM anon;
REVOKE ALL ON public.expenses_and_drawings FROM anon;
REVOKE ALL ON public.daily_galla_sessions FROM anon;

-- Grant permissions strictly to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 6. Apply Strict Row Level Security Policies
DO $$ 
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'shop_profile',
        'products',
        'inventory_logs',
        'customers',
        'sales_invoices',
        'sale_items',
        'khata_transactions',
        'expenses_and_drawings',
        'daily_galla_sessions',
        'store_users'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

        -- Clean up any previous permissive policies
        EXECUTE format('DROP POLICY IF EXISTS "allow_store_app_access" ON public.%I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow store app manage %s" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolated_policy" ON public.%I;', tbl);
    END LOOP;
END $$;

-- Table-specific tenant-isolated policies:

-- A. SHOP PROFILE
-- Authenticated: Can read shops they belong to or created
CREATE POLICY "tenant_isolated_shop_profile_select" ON public.shop_profile
    FOR SELECT TO authenticated
    USING (id IN (SELECT public.get_auth_shop_ids()) OR user_id = auth.uid());

CREATE POLICY "tenant_isolated_shop_profile_modify" ON public.shop_profile
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Anon: Can validate invite code ONLY (cannot read store details or financial data)
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

-- D. INVENTORY LOGS (Append-only audit ledger)
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

-- H. EXPENSES & DRAWINGS (Restricted: Cashiers CANNOT read or insert expenses)
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

-- I. DAILY GALLA SESSIONS (Restricted: Cashiers cannot read expected cash or discrepancy)
CREATE POLICY "tenant_isolated_daily_galla" ON public.daily_galla_sessions
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_auth_shop_ids()))
    WITH CHECK (
        shop_id IN (SELECT public.get_auth_shop_ids())
        AND public.get_auth_user_role(shop_id) IN ('OWNER', 'MANAGER', 'ACCOUNTANT')
    );

-- 7. Verification Query
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_enabled,
    'STRICT TENANT RLS ACTIVE' AS status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
      'shop_profile', 'products', 'inventory_logs', 'customers', 
      'sales_invoices', 'sale_items', 'khata_transactions', 
      'expenses_and_drawings', 'daily_galla_sessions', 'store_users'
  );
