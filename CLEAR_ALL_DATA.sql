-- ==============================================================================
-- 🗑️ SMART KIRANA POS: COMPLETE DATABASE CLEANUP & RESET QUERIES
-- Run in Supabase Dashboard -> SQL Editor (Database: smart-kirana-db)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- OPTION 1: 100% COMPLETE BLANK WIPE (ALL 11 TABLES COMPLETELY EMPTY)
-- ------------------------------------------------------------------------------
-- Use this to delete EVERYTHING from Supabase (all products, sales, customers, khata, logs)

TRUNCATE TABLE 
    public.sale_items,
    public.khata_transactions,
    public.inventory_logs,
    public.sales_invoices,
    public.daily_galla_sessions,
    public.expenses_and_drawings,
    public.customers,
    public.products,
    public.store_backup_archives,
    public.store_users,
    public.shop_profile
CASCADE;

-- Re-insert the default Shop Profile and Walk-in Cash Customer
-- (Required so POS billing and Cloud Sync work immediately without errors)
INSERT INTO public.shop_profile (
    id,
    shop_id,
    invite_code,
    reset_epoch,
    shop_name,
    owner_name,
    phone,
    upi_vpa,
    address,
    gst_footer_note
) VALUES (
    'current_shop',
    'current_shop',
    'KRN-4829',
    1,
    'Shree Ganesh Kirana & General Store',
    'Ramesh Patel',
    '9876543210',
    'kirana@upi',
    'Shop No. 4, Main Market, Station Road',
    'Thank you for shopping with us! Visit again.'
) ON CONFLICT (id) DO UPDATE SET
    reset_epoch = public.shop_profile.reset_epoch + 1,
    last_wiped_at = NOW();

INSERT INTO public.customers (
    id,
    shop_id,
    name,
    phone,
    address_landmark,
    credit_limit,
    current_udhari_balance
) VALUES (
    '0000-WALK-IN',
    'current_shop',
    'Walk-in Customer (Cash / UPI)',
    '0000000000',
    'Counter Sale',
    0.00,
    0.00
) ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- OPTION 2: CLEAR TRANSACTIONS & KHATA ONLY (KEEP PRODUCTS & INVENTORY)
-- ------------------------------------------------------------------------------
-- If you want to keep your product catalog and only wipe test bills, invoices, and khata:
/*
TRUNCATE TABLE 
    public.sale_items,
    public.khata_transactions,
    public.inventory_logs,
    public.sales_invoices,
    public.daily_galla_sessions,
    public.expenses_and_drawings
CASCADE;

-- Reset customer udhari balances to 0
UPDATE public.customers SET current_udhari_balance = 0.00, oldest_unpaid_date = NULL;
*/
