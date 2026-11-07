# Database Schemas & Accounting Invariants
## Smart Kirana & Gruh Udyog POS Platform

**Version:** 4.0.0  
**Storage Engines:** IndexedDB via Dexie.js (Client) & PostgreSQL via Supabase (Cloud)  

---

## 1. Dexie IndexedDB Schema Definition

The client maintains two physical databases (`SmartKiranaDB_Retail_v3` and `SmartKiranaDB_Homemade_v3`). Both databases adhere to the exact same Dexie v4.0.0 schema:

```typescript
this.version(4).stores({
  // Products & Inventory Catalog
  products: 'id, shop_id, business_type, barcode, short_code, category, wholesaler_id, loan_account_id, is_quick_tap, updated_at',
  inventory_logs: 'id, shop_id, business_type, product_id, reason_type, loan_account_id, reference_id, created_at',
  
  // Sales & Order Line Items
  sales_invoices: 'id, shop_id, business_type, invoice_number, customer_id, payment_mode, status, created_at',
  sale_items: 'id, shop_id, business_type, invoice_id, product_id, loan_account_id',
  
  // Customers & Khata Credit Ledger
  customers: 'id, shop_id, business_type, phone, name, current_udhari_balance, created_at',
  khata_transactions: 'id, shop_id, business_type, customer_id, entry_type, invoice_id, created_at',
  credit_notes: 'id, shop_id, credit_note_number, original_invoice_id, customer_id, created_at',
  
  // Cash Drawer & Financial Operations
  daily_galla_sessions: 'id, shop_id, business_type, session_date',
  expenses_and_drawings: 'id, shop_id, business_type, category, paid_via, created_at',
  loan_accounts: 'id, shop_id, business_type, status, created_at',
  wholesalers: 'id, shop_id, business_type, phone, name, is_active',
  
  // Gruh Udyog Advance Bookings & Perishable Batches
  advance_orders: 'id, shop_id, business_type, customer_id, delivery_date, status, created_at',
  production_batches: 'id, shop_id, product_id, batch_code, status, expires_at, created_at',
  
  // Wholesaler Inward (GRN) & Security
  purchase_invoices: 'id, shop_id, invoice_number, wholesaler_id, payment_status, created_at',
  wholesaler_khata_transactions: 'id, shop_id, wholesaler_id, entry_type, created_at',
  security_audit_logs: 'id, shop_id, action_type, user_role, created_at',
  
  // Store Profile, Staff & Offline Sync Outbox
  store_users: 'id, shop_id, email, phone, role, is_active, approval_status, created_at',
  shop_profile: 'id, shop_id, owner_user_id',
  sync_outbox: '++id, table_name, operation, shop_id, created_at'
});
```

---

## 2. Supabase PostgreSQL Schema & RLS Policies

All tables in Supabase mirror the Dexie schema with strict Multi-Tenant Row Level Security (RLS):

```sql
-- Core Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    business_type VARCHAR(32) NOT NULL DEFAULT 'KIRANA_RETAIL',
    name TEXT NOT NULL,
    marathi_name TEXT,
    search_keywords TEXT,
    short_code VARCHAR(16) NOT NULL,
    barcode VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    unit_type VARCHAR(16) NOT NULL,
    purchase_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    mrp NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    low_stock_threshold NUMERIC(10, 3) NOT NULL DEFAULT 5.000,
    last_supplier_name TEXT,
    supplier_phone VARCHAR(20),
    wholesaler_id UUID,
    loan_account_id UUID,
    is_loan_funded BOOLEAN DEFAULT FALSE,
    image_url TEXT,
    expiry_date DATE,
    is_quick_tap BOOLEAN DEFAULT FALSE,
    raw_material_cost NUMERIC(10, 2) DEFAULT 0.00,
    equipment_fuel_cost NUMERIC(10, 2) DEFAULT 0.00,
    labour_cost NUMERIC(10, 2) DEFAULT 0.00,
    wholesale_price NUMERIC(10, 2) DEFAULT 0.00,
    shelf_life_days INT,
    batch_notes TEXT,
    recipe_bom JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Master Sales Invoices Table
CREATE TABLE IF NOT EXISTS public.sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    business_type VARCHAR(32) NOT NULL DEFAULT 'KIRANA_RETAIL',
    invoice_number VARCHAR(64) NOT NULL UNIQUE,
    customer_id UUID NOT NULL,
    subtotal_amount NUMERIC(10, 2) NOT NULL,
    discount_roundoff NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(10, 2) NOT NULL,
    total_cogs NUMERIC(10, 2) NOT NULL,
    payment_mode VARCHAR(32) NOT NULL,
    amount_paid_now NUMERIC(10, 2) NOT NULL,
    udhari_added NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED',
    return_reason TEXT,
    credit_note_number VARCHAR(64),
    returned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS) Policy Example
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for products" ON public.products
    FOR ALL
    USING (
        auth.uid() IS NOT NULL AND (
            shop_id IN (
                SELECT sp.id FROM public.shop_profiles sp WHERE sp.owner_user_id = auth.uid()
            ) OR
            shop_id IN (
                SELECT su.shop_id FROM public.store_users su WHERE su.user_id = auth.uid() AND su.is_active = TRUE
            )
        )
    );
```

---

## 3. Strict Mathematical Accounting Invariants

Every financial module in the application must strictly adhere to the following equations:

### 3.1 The Integer-Paisa Rule
Native JavaScript IEEE-754 floats introduce representation errors:
```javascript
0.1 + 0.2 = 0.30000000000000004
```
All money fields are stored and computed in integer paise:
$$\text{paise} = \text{Math.round}(\text{amount} \times 100)$$
$$\text{rupees} = \frac{\text{paise}}{100}$$

### 3.2 Master Invoice Settlement Invariant
For any `sales_invoice`, the grand total must exactly equal the sum of immediate payments and credit additions:
$$\text{toPaise}(\text{grand\_total}) \equiv \text{toPaise}(\text{amount\_paid\_now}) + \text{toPaise}(\text{udhari\_added})$$

### 3.3 Cart Line Item Summation Invariant
The subtotal of an invoice must strictly match the sum of its item line totals:
$$\text{line\_total}_i \equiv \text{round}(\text{selling\_price}_i \times \text{qty}_i)$$
$$\text{subtotal} \equiv \sum_{i=1}^{n} \text{line\_total}_i$$
$$\text{grand\_total} \equiv \text{subtotal} - \text{discount\_roundoff}$$

### 3.4 Cost of Goods Sold (COGS) & Gross Profit Invariant
$$\text{item\_cogs}_i \equiv \text{round}(\text{unit\_purchase\_cost}_i \times \text{qty}_i)$$
$$\text{total\_cogs} \equiv \sum_{i=1}^{n} \text{item\_cogs}_i$$
$$\text{gross\_profit} \equiv \text{grand\_total} - \text{total\_cogs}$$

### 3.5 Daily Galla (Cash Drawer) Balancing Invariant
At shift close, the expected cash drawer balance must precisely match:
$$\text{ExpectedClosingCash} \equiv \text{OpeningCash} + \text{CashSales} + \text{CashUdhariRecovered} - \text{CashExpensesOut}$$
$$\text{Discrepancy} \equiv \text{ActualCountedCash} - \text{ExpectedClosingCash}$$

### 3.6 Customer Khata Running Balance Invariant
For every credit transaction added to a customer ledger:
$$\text{RunningBalance}_{\text{new}} \equiv \text{RunningBalance}_{\text{old}} + \Delta_{\text{debit}} - \Delta_{\text{credit}}$$
Where:
- $\Delta_{\text{debit}} = \text{udhari\_added}$
- $\Delta_{\text{credit}} = \text{jama\_received}$

### 3.7 Wholesaler Inward Weighted-Average Costing Invariant (GRN)
When new stock is received at a different purchase price:
$$\text{NewPurchaseCost} \equiv \frac{(\text{OldStock} \times \text{OldCost}) + (\text{NewQty} \times \text{NewCost})}{\text{OldStock} + \text{NewQty}}$$

### 3.8 FIFO Batch Deduction Invariant (Perishable Food)
For perishable items with active production batches:
$$\text{BatchQtyRemaining}_{\text{oldest}} = \max(0, \text{BatchQtyRemaining}_{\text{oldest}} - \text{SaleQty})$$
If $\text{SaleQty} > \text{BatchQtyRemaining}_{\text{oldest}}$, cascade remaining demand to the next chronological batch.
$$\sum \text{BatchRemaining} \equiv \text{Product.current\_stock}$$

