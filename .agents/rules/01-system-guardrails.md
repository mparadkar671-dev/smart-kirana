# System Guardrails & Invariant Rules: Smart Kirana & Gruh Udyog POS

> **CRITICAL ARCHITECTURAL DIRECTIVE FOR ALL AGENTS & DEVELOPERS**
> These rules are permanently binding. No code modifications, refactorings, or feature implementations may bypass, weaken, or violate these system guardrails under any circumstance.

---

## 1. Physical IndexedDB Database Partitioning & Dynamic DB Proxy

### 1.1 The Dual-Tenant Partitioning Rule
The application operates two distinct business tenants under one roof:
1. **Kirana Retail Store (`KIRANA_RETAIL`)**: High-velocity packaged and loose grocery items.
2. **Gruh Udyog / Homemade Food (`HOMEMADE_FOOD`)**: In-house food manufacturing (Laddus, Modak, Bhakri, Chapati, etc.).

These businesses MUST NEVER share an IndexedDB database:
- Kirana database name: `SmartKiranaDB_Retail_v3` (instance: `kiranaDb`)
- Homemade database name: `SmartKiranaDB_Homemade_v3` (instance: `homemadeDb`)

### 1.2 The Dynamic DB Proxy Pattern
All business services, components, and hooks must import `db` from `src/db/db.ts`:
```typescript
import { db, kiranaDb, homemadeDb } from '../db/db';
```
`db` is an ES6 dynamic `Proxy` that routes every table access (`db.products`, `db.sales_invoices`, `db.customers`, `db.daily_galla_sessions`, etc.) to the currently active tenant database based on `getActiveBusinessType()` (`localStorage.getItem('kirana_active_business_type')`).

**Mandatory Rules:**
- NEVER perform direct SQL queries or Dexie calls that mix data across the two databases without explicit coordination.
- Inter-business interactions (such as transferring sugar from Kirana to Gruh Udyog) MUST use explicit coordination (`kiranaDb.products` and `homemadeDb.expenses`) with dedicated audit logs and matching reference IDs.
- Deterministic Tenant Suffix: The Homemade Food tenant ID is deterministically derived from the Kirana store ID via `getHomemadeShopId(kiranaShopId)` (`${cleanBase.substring(0, 18)}-484d-4600-000000000001` or suffix `_hmf`). Arbitrary hex strings ending in `ba7c` or `ceef` must NEVER be treated as Homemade Food.
- Default `current_shop` fallback must ALWAYS be permitted in filters so local/offline data is never dropped.

---

## 2. Integer-Paisa Accounting & Mathematical Invariants

Floating-point arithmetic in JavaScript (`0.1 + 0.2 !== 0.3`) causes penny-rounding discrepancies that destroy financial trust. All financial calculations must strictly preserve integer-paisa mathematical invariants.

### 2.1 The Integer-Paisa Invariants
- `toPaise(amount: number): number`: Converts rupees to integer paise (`Math.round(amount * 100)`).
- `toRupees(paise: number): number`: Converts integer paise back to rupees (`paise / 100`).

### 2.2 Core Accounting Equations (Strict Equality)
Every transaction must satisfy the following invariants with zero deviation:

1. **Master Invoice Settlement Invariant**:
   $$\text{GrandTotal} \equiv \text{AmountPaidNow} + \text{UdhariAdded}$$
   $$\text{toPaise}(\text{grand\_total}) \equiv \text{toPaise}(\text{amount\_paid\_now}) + \text{toPaise}(\text{udhari\_added})$$

2. **Line Item Summation Invariant**:
   $$\text{Subtotal} \equiv \sum_{i=1}^{n} \text{line\_total}_i$$
   $$\text{line\_total}_i \equiv \text{round}(\text{selling\_price}_i \times \text{qty}_i)$$

3. **Cost of Goods Sold (COGS) Invariant**:
   $$\text{TotalCOGS} \equiv \sum_{i=1}^{n} \text{round}(\text{purchase\_cost}_i \times \text{qty}_i)$$
   $$\text{GrossProfit} \equiv \text{GrandTotal} - \text{TotalCOGS}$$

4. **Daily Galla (Cash Drawer) Invariant**:
   $$\text{ExpectedClosingCash} \equiv \text{OpeningCash} + \text{CashSales} + \text{CashUdhariRecovered} - \text{CashExpensesOut}$$
   $$\text{Discrepancy} \equiv \text{ActualCountedCash} - \text{ExpectedClosingCash}$$

5. **Customer Khata Balance Invariant**:
   $$\text{NewBalance} \equiv \text{OldBalance} + \text{UdhariAdded} - \text{JamaCashReceived} - \text{JamaUPIReceived}$$

6. **Weighted Average Costing Invariant (GRN)**:
   $$\text{NewPurchaseCost} \equiv \frac{(\text{OldStock} \times \text{OldCost}) + (\text{NewQty} \times \text{NewCost})}{\text{OldStock} + \text{NewQty}}$$

---

## 3. Zero-Mouse Keyboard Ergonomics & HCI Standards

The Kirana counter is an intense, high-velocity environment where cashiers bill 1 item every 2–3 seconds. Requiring a mouse destroys checkout throughput.

### 3.1 Mandatory Global Hotkeys
The system must preserve and honor all of the following keyboard shortcuts across all views:
- **`F2`**: Focus Search Bar instantly. Selects all existing text.
- **`Enter`**: Add top search match / focused item to active bill.
- **`+` / `-`**: Increment / Decrement quantity of the selected line item.
- **`D`**: Open Quick Discount / Round-off Modal.
- **`F4`**: Cycle active cart (Bill 1 $\rightarrow$ Bill 2 $\rightarrow$ Bill 3 $\rightarrow$ Bill 1).
- **`F8`**: Quick Cash Checkout (1-click completion).
- **`F9`**: Navigate directly to Khata (Customer Credit Ledger).
- **`N`**: Open "Add New Product" modal (when not focused on a text input).
- **`Esc` (Universal Escape Hierarchy)**:
  1. Level 1: Close active modal or dropdown.
  2. Level 2: Clear search query / blur input.
  3. Level 3: Navigate from any view back to the POS Billing counter.

---

## 4. Local-First & Offline-First Guarantees

1. **Sub-5ms Execution Time**: Every product lookup, barcode scan, cart mutation, and checkout operation must execute against local Dexie IndexedDB in under 5ms. Network requests must NEVER be on the critical path of checkout.
2. **Outbox Pattern**: All mutations (`products`, `sales_invoices`, `sale_items`, `customers`, `khata_transactions`, `daily_galla_sessions`, `expenses_and_drawings`, `wholesalers`) must write an entry to `db.sync_outbox` in the same Dexie transaction.
3. **Signed Deltas & Concurrency**: Inventory updates must record signed deltas (`delta_qty`) alongside snapshots to eliminate race conditions across multiple offline billing counters.
4. **Offline Invoice Prefixing**: Offline invoices must use device-tagged numbers (`KRN-YYYYMMDD-D1-001`) to prevent unique key collisions upon reconnection.
5. **Multi-Tab Sync**: Every local change must broadcast immediately via `BroadcastChannel('smart_kirana_sync')` to update all open browser tabs in 0ms without polling.

---

## 5. Mandatory Verification Protocol Before Marking Any Task Complete

Before declaring any feature, bug fix, or refactoring complete:
1. **Zero TypeScript Errors**: `npm run build` must compile cleanly without type warnings.
2. **100% Vitest Suite Pass**: Execute `npx vitest run`. All test files (currently 29 files, 147+ tests) must pass with zero failures.
3. **Preserve Documentation**: Never delete comments, ADRs, or test coverage. Any schema change must update both Dexie in `src/db/db.ts` and `docs/SCHEMA_AND_INVARIANTS.md`.
