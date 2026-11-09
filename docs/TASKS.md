# Tasks, Verification Checklist & Roadmap
## Smart Kirana & Gruh Udyog POS Platform

**Current Stable Release:** v3.4.0 (Enterprise Multi-Business Edition)  
**Target Release:** v4.0.0 (Enterprise Production Upgrade)  

---

## 1. Current v3.4.0 Completed & Verified Checklist

All items below are 100% implemented, passing tests, and deployed to production:

- [x] **Core Multi-Business Partitioning**
  - [x] Physical IndexedDB partition (`SmartKiranaDB_Retail_v3` vs `SmartKiranaDB_Homemade_v3`).
  - [x] Dynamic ES6 Proxy in `src/db/db.ts` routing calls transparently.
  - [x] Deterministic tenant shop ID derivation (`getHomemadeShopId`).
  - [x] Zero contamination firewall (`src/utils/businessFirewall.ts`).
  - [x] Support for default `current_shop` fallback ensuring no local items disappear.

- [x] **Module 1: High-Speed POS Counter Billing**
  - [x] Zero-mouse keyboard shortcuts (`F2`, `Enter`, `+`, `-`, `D`, `F4`, `F8`, `F9`, `Esc`).
  - [x] Universal Esc hierarchy (Modal $\rightarrow$ Search $\rightarrow$ POS View).
  - [x] Loose item reverse price calculator (`REQ-08` / `AT-04`).
  - [x] Top-24 Fast-Tap Pareto grid with 160×160 WebP image thumbnails.
  - [x] 3-cart multi-bill cycling (`F4` hotkey).
  - [x] EAN-13 store barcode generator with modulo-10 checksums.

- [x] **Module 2: Gruh Udyog B2B/B2C Billing & Advance Booking**
  - [x] Dual-rate toggle: Direct Customer MRP vs Retailer Bulk Wholesale Rate.
  - [x] Invoice prefix switching (`KRN-` vs `HMF-`).
  - [x] Advance festival booking with token deposit and pickup dates.
  - [x] 1-Click "Convert to Final Bill" with automated stock deductions.

- [x] **Module 3: Inventory Master & Catalog Engine**
  - [x] 105-product authentic Maharashtra Kirana catalog with Marathi/English search keywords.
  - [x] 1-Click CSV / sheet import and export.
  - [x] Resolved header collision bug in CSV parser (`findColIdx` with `excludeIndices`) preventing English column from overriding with Marathi column.
  - [x] Preserved 0 stock products on CSV import (`availableStock >= 0`).
  - [x] Added missing grocery categories (`Tea & Beverages`, `Biscuits & Snacks`, `Soaps & Cleaning`, `Dairy & Bakery`) to `KIRANA_CATEGORIES`.
  - [x] Implemented `sanitizeProductForSupabase` to strip local-only columns (`business_type`, `marathi_name`, etc.) resolving PostgREST `PGRST204` schema cache errors.
  - [x] Implemented `normalizeUnitForSupabase` mapping to Supabase's enum `unit_type_enum: ('PCS', 'KG_LOOSE', 'LTR', 'PACK')`.
  - [x] Dynamic gross margin badges (Green $\ge 15\%$, Amber $5-14.9\%$, Red $< 5\%$).
  - [x] Wholesaler inline registration and product linking.

- [x] **Module 4: Customer Khata & Credit Aging**
  - [x] Itemized passbook drawer with customer transaction ledger.
  - [x] Real-time aging classification ($< 30$ days, $30-60$ days, $> 60$ days).
  - [x] 1-Click WhatsApp reminder slips with UPI payment QR codes.
  - [x] Hard credit limit guardrail (`REQ-29` / `AT-08`) with Manager PIN override.

- [x] **Module 5: Daily Galla (Cash Drawer)**
  - [x] Opening cash, daily cash transactions, and closing physical count reconciliation.
  - [x] Automated discrepancy tracking ($\text{Discrepancy} = \text{Actual} - \text{Expected}$).
  - [x] Cash vendor payouts and owner drawings recording.

- [x] **Module 6: Capital Loan Funding & Set-Aside**
  - [x] Loan account creation and inventory restock linking.
  - [x] Daily money set-aside formula isolating loan-funded COGS from operational profits.
  - [x] Dedicated loan P&L tab and set-aside box.

- [x] **Module 7: Homemade Food Accounting & Family Drawings**
  - [x] Raw material, fuel/electricity, packaging, and labor cost breakdown.
  - [x] Family self-use goods isolation (`AT-05`) preventing false retail sales.

- [x] **Module 8: Vyapar Reports & Multi-Sheet Excel Engine**
  - [x] 7-sheet Vyapar master Excel workbook generation.
  - [x] Print-ready PDF report export.
  - [x] Interactive SVG charts for sales and profit trends.

- [x] **Module 9: Offline-First Synchronization**
  - [x] Dexie transactional `sync_outbox`.
  - [x] Supabase PostgreSQL bidirectional synchronization.
  - [x] BroadcastChannel cross-tab live synchronization.
  - [x] Supabase Realtime WebSocket broadcast.

- [x] **Module 10: Security & Danger Vault**
  - [x] Collapsed Danger Vault container.
  - [x] Automatic emergency encrypted JSON database backup download.
  - [x] Manager PIN guardrails on destructive actions.

- [x] **Module 11: High-DPI Canvas Receipts**
  - [x] HTML5 2D Canvas receipt engine generating sharp 2x monospace slips.
  - [x] Direct WhatsApp receipt image sharing and Bluetooth thermal printing support.

---

## 2. Upcoming v4.0.0 Enterprise Production Upgrade Backlog

### Phase 1: Controlled Inter-Business Stock Transfer Bridge (`Kirana ➡️ Gruh Udyog`)
- [ ] Build `InterBusinessTransferService` coordinating transactions across `kiranaDb` and `homemadeDb`.
- [ ] Deduct `current_stock` in `kiranaDb.products` and log `InventoryLog` (`INTERNAL_KITCHEN_TRANSFER`) valued at `purchase_price` (0 markup).
- [ ] Automatically insert `RAW_MATERIAL_EXPENSE` record in `homemadeDb` linked by `transfer_ref_id`.
- [ ] Queue mutations to respective `sync_outbox` tables.
- [ ] Add **"🍲 Send to Home Kitchen"** modal in Kirana Inventory screen.

### Phase 2: Batch-Level FIFO Expiry, Shelf-Life Alerts & Spoilage Engine
- [ ] Add `production_batches` Dexie & Supabase table (`id`, `shop_id`, `product_id`, `batch_code`, `qty_produced`, `qty_remaining`, `unit_making_cost`, `produced_at`, `expires_at`, `status`).
- [ ] Update `🍳 + Fresh Batch Made` flow to create `production_batches` with `expires_at = produced_at + shelf_life_days`.
- [ ] Implement FIFO batch deduction in `BillingService.executeCheckout` for perishable food items.
- [ ] Add Amber/Red expiry alert banner for batches expiring within 24 hours.
- [ ] Add 1-click **"Record Spoilage / Wastage"** action logging spoilage loss in P&L.

### Phase 3: Recipe Bill of Materials (BOM) & Festival Advance Order Prep Calculator
- [ ] Add `recipe_bom` schema on `HOMEMADE_FOOD` products (`[{ ingredient_name, qty_required, unit, est_cost }]`).
- [ ] Add **"📋 Kitchen Production & Raw Material Sheet"** tab in Advance Orders module.
- [ ] Aggregate pending festival orders for a delivery date, subtract fresh stock, and output net quantities to cook with total raw ingredients.

### Phase 4: Wholesaler Purchase Inward (GRN) & Weighted-Average Costing
- [ ] Add `purchase_invoices` and `wholesaler_khata_transactions` tables.
- [ ] Build **Stock Inward / Purchase Entry** workflow (Wholesaler selection, items received, purchase rates, MRP, payment mode).
- [ ] Compute weighted-average purchase cost:
  $$\text{New Cost} = \frac{(\text{Old Stock} \times \text{Old Cost}) + (\text{New Qty} \times \text{New Cost})}{\text{Old Stock} + \text{New Qty}}$$
- [ ] Automatically deduct from active `DailyGallaSession` if paid via `CASH_FROM_GALLA`.

### Phase 5: Partial Sales Returns, Exchanges & Conflict-Free Offline Sync
- [ ] Implement Partial Return Engine allowing return of specific line items (`RETURN_TO_SHELF` or `DAMAGED_WRITE_OFF`).
- [ ] Recalculate COGS and reverse exact paise on `KhataTransaction` or `DailyGalla`.
- [ ] Append 2-character device identifier to offline invoice numbers (`KRN-YYYYMMDD-D1-001`).
- [ ] Transmit signed stock deltas (`delta_qty`) in `sync_outbox`.

### Phase 6: Security Hardening & Immutable Cashier Override Audit Log
- [ ] Replace hardcoded PIN check with salted SHA-256 PIN verifier stored in `shop_profile` + 5-attempt rate limiter.
- [ ] Create `security_audit_logs` table permanently recording Zero-Stock Overrides, Credit Limit Overrides, Bargain Round-Offs $> ₹20$, and Invoice Voids.
- [ ] Display audit logs on Owner Dashboard.

---

## 3. Verification Protocol

Run the automated verification suite before submitting any upgrade:
```bash
# 1. Run full test suite (must pass 100%)
npx vitest run

# 2. Run TypeScript and production build (zero errors)
npm run build

# 3. Deploy to production
npx vercel --prod --yes
```

