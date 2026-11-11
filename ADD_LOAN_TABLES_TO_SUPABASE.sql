-- ==============================================================================
-- 🏦 SMART KIRANA: LOAN SYSTEM & LOAN-FUNDED INVENTORY SUPABASE MIGRATION
-- Execute this script in Supabase Studio -> SQL Editor
-- Project: https://supabase.com/dashboard/project/oyolyrptcfbudnwlxyyq/sql
-- ==============================================================================

-- 1. Create public.loan_accounts Table
CREATE TABLE IF NOT EXISTS public.loan_accounts (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL DEFAULT 'current_shop',
    user_id TEXT,
    name TEXT NOT NULL,                                  -- e.g. "Mudra Loan", "Bank of Maharashtra CC"
    lender_name TEXT NOT NULL,                           -- e.g. "State Bank of India", "Private Financier"
    principal_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,-- Sanctioned loan amount
    interest_rate_pct NUMERIC(5,2) DEFAULT 0.00,         -- Annual or monthly interest %
    emi_or_daily_target NUMERIC(10,2) DEFAULT 0.00,      -- Daily set-aside or monthly EMI
    amount_repaid NUMERIC(12,2) NOT NULL DEFAULT 0.00,   -- Cumulative repayments made
    status TEXT NOT NULL DEFAULT 'ACTIVE',               -- 'ACTIVE' | 'CLOSED' | 'DEFAULTED'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add Loan-Tracking Columns to Existing Tables (Idempotent: ADD COLUMN IF NOT EXISTS)

-- A. products: Link product purchase to loan account
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS loan_account_id TEXT REFERENCES public.loan_accounts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_loan_funded BOOLEAN DEFAULT FALSE;

-- B. sale_items: Track loan origin for each sold item line
ALTER TABLE public.sale_items 
ADD COLUMN IF NOT EXISTS loan_account_id TEXT,
ADD COLUMN IF NOT EXISTS is_loan_funded BOOLEAN DEFAULT FALSE;

-- C. inventory_logs: Audit trail of stock in/out funded by loan
ALTER TABLE public.inventory_logs 
ADD COLUMN IF NOT EXISTS loan_account_id TEXT,
ADD COLUMN IF NOT EXISTS is_loan_funded BOOLEAN DEFAULT FALSE;

-- D. expenses_and_drawings: Track expenses or repayments funded by loan
ALTER TABLE public.expenses_and_drawings 
ADD COLUMN IF NOT EXISTS loan_account_id TEXT,
ADD COLUMN IF NOT EXISTS is_loan_funded BOOLEAN DEFAULT FALSE;

-- 3. Enable RLS & Permissive Access for Multi-Device Sync
ALTER TABLE public.loan_accounts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Allow all for authenticated and anon users on loan_accounts" ON public.loan_accounts;
    CREATE POLICY "Allow all for authenticated and anon users on loan_accounts"
    ON public.loan_accounts
    FOR ALL
    TO public, anon, authenticated
    USING (true)
    WITH CHECK (true);
END $$;

-- 4. Enable Supabase Realtime for loan_accounts
ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_accounts;

-- 5. Verification Notice
SELECT 'Loan tables and columns successfully configured in Supabase!' AS status;

