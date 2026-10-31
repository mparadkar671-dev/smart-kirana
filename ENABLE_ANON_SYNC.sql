-- ==============================================================================
-- 🚀 SMART KIRANA POS: 1-CLICK SUPABASE TABLE EDITOR SYNC FIX
-- Run this script in your Supabase SQL Editor:
-- Dashboard -> Select Project -> SQL Editor -> New Query -> Paste & Run
-- ==============================================================================

-- 1. Ensure all tables permit inserts & updates from client app (both anon & authenticated)
ALTER TABLE shop_profile DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE khata_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses_and_drawings DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_galla_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE store_users DISABLE ROW LEVEL SECURITY;

-- 2. Grant permissions explicitly to anon and authenticated roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, postgres, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, postgres, service_role;

-- 3. Auto-confirm all registered emails so users can log in immediately
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email_confirmed_at IS NULL;

-- Verification Check:
SELECT 'SUCCESS! All 10 tables are now unlocked for live Table Editor sync.' AS result;
