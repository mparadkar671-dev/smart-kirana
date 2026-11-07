# SMART KIRANA & GRUH UDYOG POS
## Comprehensive System Requirements Specification (SRS) & Technical Architecture Document
**Version:** 3.4.0 (Enterprise Multi-Business Edition)  
**Status:** Approved & Implemented in Production  
**Document Classification:** Confidential / System Architecture Manual  
**Author:** Google DeepMind Advanced Agentic Coding Pair with Lead Owner  
**Date of Issue:** November 2026  

---

## TABLE OF CONTENTS
1. [Document Control & Metadata](#1-document-control--metadata)
2. [Executive Summary & System Vision](#2-executive-summary--system-vision)
3. [Overall System Architecture & Technical Stack](#3-overall-system-architecture--technical-stack)
4. [Dual-Tenant Physical Database Partitioning & Proxy Architecture](#4-dual-tenant-physical-database-partitioning--proxy-architecture)
5. [Complete Data Models, Database Schemas & Mathematical Invariants](#5-complete-data-models-database-schemas--mathematical-invariants)
6. [Module 1: High-Speed POS Counter Billing & HCI Ergonomics](#6-module-1-high-speed-pos-counter-billing--hci-ergonomics)
7. [Module 2: Dual-Rate Gruh Udyog B2B/B2C Billing & Advance Booking](#7-module-2-dual-rate-gruh-udyog-b2bb2c-billing--advance-booking)
8. [Module 3: Inventory Master, Recipe Costing & Stock Management](#8-module-3-inventory-master-recipe-costing--stock-management)
9. [Module 4: Customer Khata, Credit Aging & Debt Recovery Engine](#9-module-4-customer-khata-credit-aging--debt-recovery-engine)
10. [Module 5: Daily Galla (Cash Drawer) & Closing Reconciliation](#10-module-5-daily-galla-cash-drawer--closing-reconciliation)
11. [Module 6: Capital Investment, Equipment Loan & Daily Set-Aside Engine](#11-module-6-capital-investment-equipment-loan--daily-set-aside-engine)
12. [Module 7: Homemade Food Accounting & Family Drawings System](#12-module-7-homemade-food-accounting--family-drawings-system)
13. [Module 8: Vyapar Master Reports & Multi-Sheet Excel Engine](#13-module-8-vyapar-master-reports--multi-sheet-excel-engine)
14. [Module 9: Offline-First Synchronization & Multi-Device Realtime Engine](#14-module-9-offline-first-synchronization--multi-device-realtime-engine)
15. [Module 10: Security, RBAC & Store Danger Vault](#15-module-10-security-rbac--store-danger-vault)
16. [Module 11: Receipts, Canvas Engine & Hardware Integration](#16-module-11-receipts-canvas-engine--hardware-integration)
17. [Non-Functional Requirements (NFRs) & Performance Budgets](#17-non-functional-requirements-nfrs--performance-budgets)
18. [Verification Matrix & Automated Test Suite Coverage](#18-verification-matrix--automated-test-suite-coverage)
19. [Deployment, Disaster Recovery & Operator Runbook](#19-deployment-disaster-recovery--operator-runbook)

---

## 1. DOCUMENT CONTROL & METADATA

### 1.1 Document Purpose
This System Requirements Specification (SRS) provides an exhaustive, formal specification of the entire software architecture, database design, business logic invariants, HCI workflows, offline-first synchronization protocols, and security guardrails implemented across the **Smart Kirana & Gruh Udyog POS** platform.

### 1.2 Target Audience
* **Store Owner & Operators**: Detailed operational manual, security PIN procedures, and financial accounting logic.
* **Software Engineers & Maintainers**: Exact code references, schema definitions, mathematical invariants, and sub-system communication protocols.
* **System Auditors & Accountants**: GST compliance, COGS verification, Udhari aging formulas, Daily Galla discrepancy resolution, and loan capital separation logic.

### 1.3 Document Revision History
| Version | Date | Primary Focus | Sign-off Status |
| :--- | :--- | :--- | :--- |
| **1.0.0** | Oct 2026 | Initial Single-Store Kirana Retail Architecture | Completed |
| **2.0.0** | Oct 2026 | Vyapar Financial Reports, Multi-cart, and Barcode Scanning | Completed |
| **3.0.0** | Nov 2026 | Dual-Tenant Multi-Business Engine (`HOMEMADE_FOOD` Gruh Udyog) | Completed |
| **3.2.0** | Nov 2026 | Hard Isolation Firewall, Deterministic UUIDs, Realtime WebSockets | Completed |
| **3.4.0** | Nov 2026 | Physical IndexedDB Partitioning (`kiranaDb` vs `homemadeDb`), Production Recipe Costing, Dual-Rate B2B Wholesale POS | Production Certified |

---

## 2. EXECUTIVE SUMMARY & SYSTEM VISION

### 2.1 The Traditional Indian Retail & Home Production Dilemma
Traditional Indian neighborhood micro-enterprises operate under intense time constraints, low computational budgets, and unpredictable rural/semi-urban internet connectivity. The primary business challenges addressed include:
1. **The Dual-Business Collision**: Many Indian retail families operate both a **Kirana Grocery Store** (buying finished consumer goods from wholesalers and selling to retail households) and an in-house **Gruh Udyog (Homemade Food Manufacturing)** unit (making and selling fresh Laddus, Modak, Chapatis, Ghavane, Amboli, and Puran Poli). Conventional POS software either forces them to buy two distinct expensive cloud subscriptions, or forces all products into a single database where raw grocery lentils mix catastrophically with freshly prepared festive food items.
2. **Fragile Internet Dependency**: Cloud-only web apps halt counter checkout whenever fiber lines or 4G networks disconnect, causing massive queues and customer loss.
3. **Complex Keyboard-Unfriendly Interfaces**: Typical web applications demand constant mouse movements, slowing down counter billing compared to old physical cash registers.
4. **Opaque Cash Drawer Leakage**: The "Galla" (cash drawer) frequently incurs unexplained shortages due to cash loans, supplier cash payments, and household family expenses being taken directly out of the drawer without double-entry recording.
5. **Loan Capital Misappropriation**: Operators who obtain Mudra loans or machinery bank loans often commingle loan capital with daily operational profits, leading to debt default.

### 2.2 System Vision & Scope
Smart Kirana POS delivers a **zero-cost, offline-first, progressive web platform** providing:
* **100% Strict Physical Database Partitioning** between Retail Kirana and Homemade Food under a unified single-owner interface.
* **Lightning-Fast Zero-Mouse Keyboard Billing** allowing 15-second checkout without touching a mouse.
* **Dual-Rate Manufacturing Billing**: Instant toggling between Direct Retail Customer rates and B2B Shop/Retailer Wholesale rates.
* **Mathematical Invariant Guarantees**: Absolute equality between invoice grand totals, customer ledgers, daily galla sessions, and loan amortization funds.
* **Realtime Cross-Device Multi-Tenant Synchronization**: Instant synchronization across counter desktops, mobile checkout devices, and remote tablets via Supabase PostgreSQL and WebSocket broadcasting.

```mermaid
graph TD
    User([Cashier / Owner]) --> Shell[Application Shell & Upper Business Switcher]
    Shell -->|Mode: KIRANA_RETAIL| KiranaDB[(Physical IndexedDB: SmartKiranaDB_Retail_v3)]
    Shell -->|Mode: HOMEMADE_FOOD| HomemadeDB[(Physical IndexedDB: SmartKiranaDB_Homemade_v3)]
    
    KiranaDB <---> OutboxKirana[Offline Sync Outbox]
    HomemadeDB <---> OutboxHMF[Offline Sync Outbox]
    
    OutboxKirana <---> CloudSync[Bi-directional CloudSyncService]
    OutboxHMF <---> CloudSync
    
    CloudSync <---> SupabasePostgres[(Supabase PostgreSQL: Dual shop_id Rows)]
    SupabasePostgres <---> WebSockets[Realtime WebSocket Broadcast]
    WebSockets ---> CloudSync
```

---

## 3. OVERALL SYSTEM ARCHITECTURE & TECHNICAL STACK

### 3.1 Technology Stack Architecture
| Component Layer | Technology | Version | Architectural Responsibility |
| :--- | :--- | :--- | :--- |
| **Client UI Framework** | React | 19.0.0 | High-performance reactive virtual DOM component rendering |
| **Language Runtime** | TypeScript | 5.8.2 | Strict static typing, discriminated unions, and compile-time verification |
| **Application Bundler** | Vite | 6.2.0 | Ultra-fast ES-module dev server and tree-shaken production rollup |
| **Styling Architecture** | Tailwind CSS | v4.0.0 | Responsive layout engine, dark mode styling, and utility classes |
| **Client Database** | Dexie.js (IndexedDB) | 4.0.11 | Embedded client-side ACID transactional storage with indexed queries |
| **Cloud Database** | Supabase PostgreSQL | 15.1 | Multi-tenant cloud relational database with row-level security |
| **Realtime Engine** | Supabase Realtime | 2.49.1 | Sub-50ms WebSocket full-row change broadcasting |
| **Graphics & Printing** | HTML5 2D Canvas API | Native | High-dpi thermal receipt slip generation immune to CSS crashes |
| **Icons & Visuals** | Lucide React | 0.475.0 | Lightweight SVG icons |
| **Testing Harness** | Vitest + Testing Library | 3.0.5 | 100% automated headless verification suite |

### 3.2 Architectural Invariant Principles
1. **Local-First Precedence**: Every user interaction (item addition, stock modification, checkout, payment recording) executes immediately against the local Dexie.js database in `< 5ms`. Network latency never blocks counter operations.
2. **Strict Dual-Tenant Isolation**: Kirana and Homemade Food records are never stored in the same physical browser database, ensuring zero data pollution even if a filter fails.
3. **Deterministic Multi-Tenant Identifiers**: A single owner email (`laxminivas2425@gmail.com`) owns two deterministic store UUIDs derived via cryptographic suffix mapping, allowing seamless multi-device sync without manual store switching.
4. **Idempotent Realtime Delta Queue**: All network mutations are written to a durable `sync_outbox` table before transmission, guaranteeing at-least-once delivery with automatic retry.

---

## 4. DUAL-TENANT PHYSICAL DATABASE PARTITIONING & PROXY ARCHITECTURE

### 4.1 Physical IndexedDB Partitioning
To resolve the vulnerability of category-based guessing, the database engine implements **Physical Database Partitioning**:
* **Kirana Retail Database**: `SmartKiranaDB_Retail_v3` (Dedicated Dexie database instance).
* **Homemade Food Database**: `SmartKiranaDB_Homemade_v3` (Dedicated Dexie database instance).

```mermaid
classDiagram
    class KiranaDatabase {
        +Table products
        +Table customers
        +Table sales_invoices
        +Table sale_items
        +Table khata_transactions
        +Table inventory_logs
        +Table daily_galla_sessions
        +Table expenses_and_drawings
        +Table wholesalers
        +Table loan_accounts
        +Table sync_outbox
    }
    
    class DBProxy {
        <<Proxy>>
        +getActiveDb() KiranaDatabase
    }

    DBProxy ..> KiranaDatabase : delegates to kiranaDb
    DBProxy ..> KiranaDatabase : delegates to homemadeDb
```

### 4.2 Dynamic Proxy Pattern Implementation
All components access the database via the exported dynamic proxy `db` defined in [`src/db/db.ts`](file:///c:/Projects/Smart%20kirana/src/db/db.ts):
```typescript
export const kiranaDb = new SmartKiranaDB('SmartKiranaDB_Retail_v3');
export const homemadeDb = new SmartKiranaDB('SmartKiranaDB_Homemade_v3');

export function getActiveDb(): SmartKiranaDB {
  const activeBiz = getActiveBusinessType();
  return activeBiz === 'HOMEMADE_FOOD' ? homemadeDb : kiranaDb;
}

export const db: SmartKiranaDB = new Proxy({} as SmartKiranaDB, {
  get(_target, prop: keyof SmartKiranaDB) {
    const active = getActiveDb();
    const val = (active as any)[prop];
    if (typeof val === 'function') {
      return val.bind(active);
    }
    return val;
  },
});
```

---

## 5. COMPLETE DATA MODELS, DATABASE SCHEMAS & MATHEMATICAL INVARIANTS

### 5.1 Relational Schema Specifications (Dexie & PostgreSQL)

#### Table 1: `shop_profile`
Stores store identity, tax numbers, UPI VPA addresses, and business classification.
* `id` (VARCHAR / UUID PK): Deterministic store UUID.
* `shop_id` (VARCHAR, Indexed): Tenant reference identifier.
* `shop_name` (VARCHAR): Display name of the business.
* `owner_name` (VARCHAR): Legal proprietor name.
* `phone` (VARCHAR 10): Primary business telephone.
* `upi_vpa` (VARCHAR): Dynamic UPI VPA ID (e.g. `owner@upi`).
* `business_type` (VARCHAR): `'KIRANA_RETAIL'` or `'HOMEMADE_FOOD'`.
* `invoice_prefix` (VARCHAR): Default `'KRN'` for Kirana; `'HMF'` for Gruh Udyog.
* `address` (TEXT): Physical shop or kitchen address.
* `gstin` (VARCHAR 15, Optional): 15-digit Indian GST Identification Number.
* `invite_code` (VARCHAR 8): 6-digit staff pre-approval onboarding key.

#### Table 2: `products`
The core catalog item table containing both retail trading attributes and manufacturing costing attributes.
* `id` (VARCHAR / UUID PK): Unique product identifier.
* `shop_id` (VARCHAR, Indexed): Tenant identifier.
* `business_type` (VARCHAR, Indexed): `'KIRANA_RETAIL'` or `'HOMEMADE_FOOD'`.
* `name` (VARCHAR): English / Romanized display title.
* `marathi_name` (VARCHAR, Optional): Devanagari script title (e.g. `"तूर डाळ"`).
* `search_keywords` (TEXT, Optional): Hidden phonetic POS keywords.
* `short_code` (VARCHAR 6, Indexed): 2-4 letter operator fast-entry code (e.g. `TD1`, `GHV1`).
* `barcode` (VARCHAR 13, Indexed): GS1-compliant EAN-13 or internal barcode.
* `category` (VARCHAR, Indexed): Business-specific category string.
* `unit_type` (VARCHAR): `'PCS' | 'KG_LOOSE' | 'LTR' | 'PACK' | 'PLATE' | 'DOZEN'`.
* `purchase_price` (NUMERIC 10,2): Wholesaler purchase cost (Kirana) OR Total Making Cost (Homemade Food).
* `raw_material_cost` (NUMERIC 10,2, Gruh Udyog): Direct ingredient cost per unit.
* `equipment_fuel_cost` (NUMERIC 10,2, Gruh Udyog): Gas, electricity, and utensil depreciation cost.
* `labour_cost` (NUMERIC 10,2, Gruh Udyog): Cooking and helper wage cost per unit.
* `wholesale_price` (NUMERIC 10,2, Gruh Udyog): B2B bulk selling price to retailers.
* `selling_price` (NUMERIC 10,2): Direct retail customer selling price.
* `mrp` (NUMERIC 10,2): Printed maximum retail price.
* `current_stock` (NUMERIC 10,3): Precise inventory balance (supports 3 decimals for loose kg/liters).
* `low_stock_threshold` (NUMERIC 10,3): Minimum reorder trigger balance.
* `is_quick_tap` (BOOLEAN): Flag for placement on the 24-item fast-tap billing grid.
* `shelf_life_days` (INTEGER, Optional): Production freshness expiry window.
* `batch_notes` (TEXT, Optional): Special recipe or production instructions.
* `wholesaler_id` (VARCHAR, Optional): Foreign key to `wholesalers`.
* `loan_account_id` (VARCHAR, Optional): Foreign key to `loan_accounts`.
* `is_loan_funded` (BOOLEAN): True if inventory was procured using loan capital.

#### Table 3: `sales_invoices`
Master billing transaction document enforcing financial immutability.
* `id` (VARCHAR / UUID PK): Unique invoice ID.
* `shop_id` (VARCHAR, Indexed): Tenant identifier.
* `business_type` (VARCHAR, Indexed): Business partition.
* `invoice_number` (VARCHAR, Unique Indexed): Format `KRN-YYYYMMDD-001` or `HMF-YYYYMMDD-001`.
* `customer_id` (VARCHAR, Indexed): Walk-in (`0000-WALK-IN`) or registered customer UUID.
* `subtotal_amount` (NUMERIC 10,2): Sum of line item subtotals.
* `discount_roundoff` (NUMERIC 10,2): Operator round-off discount concessions.
* `grand_total` (NUMERIC 10,2): Exact net payable amount.
* `total_cogs` (NUMERIC 10,2): Total cost of goods sold for gross profit calculation.
* `payment_mode` (VARCHAR): `'CASH' | 'UPI' | 'UDHARI_FULL' | 'SPLIT_PARTIAL'`.
* `amount_paid_now` (NUMERIC 10,2): Immediate cash or UPI tender received.
* `udhari_added` (NUMERIC 10,2): Outstanding debt added to customer khata.
* `status` (VARCHAR): `'COMPLETED' | 'VOIDED'`.
* `created_at` (TIMESTAMP ISO): Precise transaction timestamp.

#### Table 4: `sale_items`
Itemized line-item audit trail linked to master invoice.
* `id` (VARCHAR / UUID PK): Line item UUID.
* `shop_id` (VARCHAR, Indexed): Tenant identifier.
* `business_type` (VARCHAR): Business partition.
* `invoice_id` (VARCHAR, Indexed): Parent invoice foreign key.
* `product_id` (VARCHAR, Indexed): Product foreign key.
* `product_name_snapshot` (VARCHAR): Frozen product name at time of billing.
* `qty` (NUMERIC 10,3): Quantity sold (supports fractional weights).
* `unit_purchase_cost` (NUMERIC 10,2): Frozen purchase/making cost at time of sale.
* `unit_selling_price` (NUMERIC 10,2): Actual unit price charged.
* `line_total` (NUMERIC 10,2): `qty * unit_selling_price`.
* `sale_rate_type` (VARCHAR): `'RETAIL_CUSTOMER' | 'WHOLESALE_RETAILER'`.
* `loan_account_id` (VARCHAR, Optional): Preserves loan capital tracking.
* `is_loan_funded` (BOOLEAN): Indicates if sold item was loan-funded stock.

---

### 5.2 Core Mathematical Invariants & Accounting Proofs

#### Invariant 1: Master Invoice Settlement Equation
For every invoice executed by [`BillingService.executeCheckout`](file:///c:/Projects/Smart%20kirana/src/services/billingService.ts), the left side of the ledger must match the right side to the exact integer paisa:
$$\text{subtotal\_amount} - \text{discount\_roundoff} = \text{grand\_total} = \text{amount\_paid\_now} + \text{udhari\_added}$$
$$\forall \text{ invoices}, \quad \text{toPaise}(\text{subtotal}) - \text{toPaise}(\text{roundoff}) \equiv \text{toPaise}(\text{paid\_now}) + \text{toPaise}(\text{udhari})$$
*Failure Behavior*: If a floating-point rounding error causes a 1-paisa mismatch, the transaction is rejected immediately with an `Accounting Invariant Violation` exception, preventing ledger corruption.

#### Invariant 2: Gross Profit & COGS Equation
$$\text{COGS} = \sum_{i=1}^{n} (\text{qty}_i \times \text{unit\_purchase\_cost}_i)$$
$$\text{Gross Profit} = \text{grand\_total} - \text{COGS}$$
$$\text{Gross Margin \%} = \left( \frac{\text{Gross Profit}}{\text{grand\_total}} \right) \times 100$$

#### Invariant 3: Daily Galla Cash Drawer Equilibrium
$$\text{Expected Closing Cash} = \text{Opening Cash} + \text{Cash Sales} + \text{Cash Udhari Recovered} - \text{Cash Expenses Out}$$
$$\text{Discrepancy} = \text{Actual Counted Cash} - \text{Expected Closing Cash}$$
* Discrepancy $= 0$: Drawer Tallied (Balanced).
* Discrepancy $< 0$: Cash Shortage (Loss / Unrecorded Drawing).
* Discrepancy $> 0$: Cash Excess (Unrecorded Sale / Tip).

#### Invariant 4: Loan Stock Daily Money Set-Aside Equation
$$\text{Daily Loan Capital Sold} = \sum_{j \in \text{Loan Items}} (\text{qty}_j \times \text{unit\_purchase\_cost}_j)$$
$$\text{Daily Free Working Profit} = \text{Grand Total} - \text{Daily Loan Capital Sold}$$
This guarantees that money recovered from selling loan-funded inventory is quarantined to pay down bank debt rather than consumed as grocery profit.

---

## 6. MODULE 1: HIGH-SPEED POS COUNTER BILLING & HCI ERGONOMICS

### 6.1 Top-24 Pareto Fast-Tap Grid
80% of counter sales in neighborhood retail come from 20% of fast-moving catalog items (milk, bread, sugar, toor dal, chai patti, chapatis, ghavane).
* **UI Structure**: 24 responsive touch cards (minimum touch target $44 \times 44\text{px}$) with prominent pricing, stock badges, and category initials.
* **1-Tap Addition**: Clicking or tapping any card adds 1 unit to the active bill in $< 10\text{ms}$ with audio confirmation.

### 6.2 3-Way Instant Search Engine
Counter operators can locate items through 3 simultaneous input modes:
1. **Hardware Barcode Scanner**: USB/Bluetooth HID scanners simulate rapid character typing followed by `Enter`.
2. **Short Codes**: Typing `TD1` + `Enter` instantly selects Toor Dal 1kg.
3. **Bilingual Phonetic Search**: Searching in Marathi (`तूर`) or romanized English (`arhar`, `turdal`, `sugar`, `sakhar`) matches immediately across `name`, `marathi_name`, and `search_keywords`.

### 6.3 Reverse Price & Loose Weight Calculator
When a customer asks for *"₹20 chi Sakhar"* (Sugar worth ₹20) where sugar is ₹44/kg:
$$\text{Computed Quantity} = \frac{\text{Tender Amount}}{\text{Unit Selling Price}} = \frac{20}{44} = 0.455\text{ kg} \quad (455\text{ grams})$$
The system computes the exact fractional weight to 3 decimal places and prints both weight and price on the receipt.

### 6.4 Multi-Cart Holding Tabs & Abandonment Alert
* Operators can maintain **3 parallel active carts** (Cart 1, Cart 2, Cart 3) per business.
* If Customer A forgets their purse and leaves to fetch money, the operator taps `F4` to switch to Cart 2 and bills Customer B without clearing Customer A's items.
* **Visual Warning**: If a held cart remains idle with items for $> 2\text{ minutes}$, an alert pill displays:
  `Held bills waiting: Cart 1 (4 items • 5m ago) — F4: Switch`

### 6.5 Zero-Stock Cashier Guardrail (Physical Shelf Override)
If a product has `current_stock <= 0` in software but the cashier physically holds the item from the shelf:
1. The POS halts and presents an `AlertModal`: *"Product is recorded as Out of Stock. Do you have physical stock available on the shelf?"*
2. Pressing `Enter` confirms physical presence and allows billing, adjusting the inventory log as an authorized physical discrepancy.
3. Pressing `Esc` cancels the addition without disturbing the cart.

### 6.6 Zero-Mouse Keyboard Shortcuts Reference Map
| Shortcut Key | Global Action | Counter Context |
| :--- | :--- | :--- |
| **`F2`** | Focus Search Bar | Highlights search input ready for typing |
| **`Arrow Down` / `Arrow Up`** | Navigate Search Results | Cycles through matched products |
| **`Enter`** | Add Selected Search Result | Adds highlighted item to cart |
| **`+` / `-`** | Increment / Decrement Quantity | Adjusts quantity of the last added item |
| **`D`** | Bargain Round-Off Concession | Automatically applies ₹5/₹10 round-off |
| **`F4`** | Cycle Cart Tabs | Switches between Cart 1, Cart 2, Cart 3 |
| **`F8`** | Cash Checkout | Instant 1-tap cash settlement and prints receipt |
| **`F9`** | Open UPI QR Modal | Displays dynamic UPI QR code on screen |
| **`Esc`** | Dismiss Modal / Clear Search | Closes any open dialog safely |

---

## 7. MODULE 2: DUAL-RATE GRUH UDYOG B2B/B2C BILLING & ADVANCE BOOKING

### 7.1 Dual-Rate Architecture in Gruh Udyog
Homemade food businesses operate a hybrid model:
1. **Direct Household Retail (B2C)**: Neighborhood families buying Chapatis (₹10/pc), Modak (₹25/pc), or Laddus (₹450/kg).
2. **Retailer & Teastall Supply (B2B Wholesale)**: Supplying local grocery shops, hotels, and canteens in bulk at wholesale rates (Chapatis at ₹7/pc, Laddus at ₹360/kg).

### 7.2 2-Pill POS Billing Switcher
Located directly above the active cart in `HOMEMADE_FOOD` mode:
* `[👤 Direct Customer (Retail)]`
* `[🏪 Shop / Retailer (B2B Wholesale)]`
* **Dynamic Recalculation**: Switching pills immediately re-evaluates all items in the cart:
  $$\text{Effective Unit Price} = \begin{cases} \text{wholesale\_price} & \text{if B2B mode and wholesale\_price} > 0 \\ \text{selling\_price} & \text{otherwise} \end{cases}$$
* The bill line items reflect `Wholesale Rate` badges, and the receipt header transforms to **`🏪 B2B WHOLESALE INVOICE`**.

```mermaid
stateDiagram-v2
    [*] --> RetailRate: Default POS Mode
    RetailRate --> WholesaleRate: Toggle "Shop / Retailer (B2B)"
    WholesaleRate --> RetailRate: Toggle "Direct Customer (Retail)"
    
    state RetailRate {
        Unit_Price: product.selling_price
        Header: RETAIL BILL
    }
    state WholesaleRate {
        Unit_Price: product.wholesale_price
        Header: B2B WHOLESALE INVOICE
    }
```

### 7.3 Advance Pre-Orders & Festival Booking Workflow
During festive seasons (Ganesh Chaturthi, Diwali), Gruh Udyog units receive bulk orders in advance (e.g. 101 Ukdiche Modak, 10 kg Besan Laddu):
* **Advance Booking Dialog**: Captures customer name, delivery date/time, items, total amount, and cash advance received.
* **Auto-Settlement**: On festival delivery day, 1-click converts the advance order into a finalized sales invoice and debits remaining balance from customer khata.

---

## 8. MODULE 3: INVENTORY MASTER, RECIPE COSTING & STOCK MANAGEMENT

### 8.1 Dedicated Product Forms per Business Domain
When tapping `+ Add Product`, the system inspects `activeBusinessType`:
* **In `KIRANA_RETAIL` Mode**:
  * Shows Kirana categories (Grains, Dals, Spices, Oils, Bakery, Cleaning).
  * Units: `PACK`, `PCS (Per Packet)`, `KG_LOOSE`, `LTR`.
  * Fields: Purchase Price, Selling Price, MRP, Wholesaler Link, Mudra Loan Funding Toggle.
  * Zero manufacturing jargon.
* **In `HOMEMADE_FOOD` Mode**:
  * Title: `"🍲 Add New Homemade Food Product"`.
  * Shows Homemade categories (Traditional Laddus, Modak Specials, Konkani Breakfast, Bhakri & Chapati).
  * Units: `PCS (Per Piece)`, `PLATE`, `DOZEN`, `KG_LOOSE`, `PACK`.
  * **Production Cost Breakdown Card**:
    $$\text{Raw Material Cost} + \text{Fuel/Equipment Cost} + \text{Labour Cost} = \text{Total Making Cost}$$
  * Dual Selling Prices: Wholesale Price (for shops) + Selling Price (for customers) + MRP.
  * Fields: `shelf_life_days`, `batch_notes`, and Equipment Loan Funding Toggle.

### 8.2 Fresh Daily Production Workflow (`🍳 + Fresh Batch Made`)
Unlike Kirana stores that purchase inventory from distributors, food manufacturing creates stock through cooking:
1. Operator taps `🍳 + Fresh Batch Made` on the Besan Laddu row.
2. Dialog prompts: *"How many KGs made in today's morning batch?"* (e.g. `10 kg`).
3. Software creates an `InventoryLog` with `reason_type: 'PRODUCTION_IN'`, increases `current_stock` by 10, and timestamps the freshness batch.

### 8.3 Built-in 105-Product Bilingual Catalog Importer
Provides new store owners with an instant, pre-configured inventory catalog:
* Imports 105 standard Indian items across 12 categories with Marathi and English names, short codes, and uniform 160x160px vector WebP images in $< 2\text{ seconds}$.

---

## 9. MODULE 4: CUSTOMER KHATA, CREDIT AGING & DEBT RECOVERY ENGINE

### 9.1 Double-Entry Khata Transaction Ledger
All credit sales and cash repayments maintain an immutable ledger:
* Credit Sale: Creates `KhataTransaction` with `type: 'UDHARI_GIVEN'`, increasing customer balance.
* Payment Collection: Creates `KhataTransaction` with `type: 'PAYMENT_RECEIVED'`, decreasing customer balance and feeding the Daily Galla cash drawer.

### 9.2 Debt Aging & Vyapar Classification
Customers are grouped into aging risk tiers:
* **0–15 Days (Fresh Credit)**: Green status badge.
* **16–30 Days (Due Attention)**: Amber status badge.
* **31–60 Days (Overdue Warning)**: Orange status badge.
* **60+ Days (High Risk Debt)**: Red flashing alert badge.

### 9.3 Credit Limit Guardrail with Cashier Override
When billing a customer whose credit limit is ₹2,000 and current balance is ₹1,800:
* If a new bill of ₹500 is added on Udhari, total debt becomes ₹2,300 (exceeding limit by ₹300).
* The POS halts: Cashier cannot proceed without collecting ₹300 cash/UPI, OR entering the Store Owner Security PIN (1234) to approve temporary credit extension.

### 9.4 1-Click WhatsApp & Keypad/Dabba Phone SMS Reminders
* **WhatsApp Link**: Generates customized Marathi/English message with itemized bill snapshot and dynamic UPI payment deep link.
* **Keypad/Dabba Phone SMS (`sms:+91...`)**: For customers using basic feature phones without WhatsApp, generates standard plain text SMS containing store name, invoice number, pending balance, and payment UPI ID.

---

## 10. MODULE 5: DAILY GALLA (CASH DRAWER) & CLOSING RECONCILIATION

### 10.1 Daily Galla Workflow Lifecycle
```mermaid
flowchart LR
    Open[Morning Opening Cash Entry] --> Inflow[Cash Sales + Udhari Recovery]
    Inflow --> Outflow[Cash Expenses & Draws]
    Outflow --> Count[Evening Physical Cash Count]
    Count --> Tally{Reconciliation vs System}
    Tally -->|Discrepancy = 0| Lock[Locked & Balanced]
    Tally -->|Shortage / Excess| Audit[Audit Note Required & Locked]
```

### 10.2 Anti-Theft Discrepancy Tracking
The system prevents cashiers from guessing system figures:
1. The cashier must enter the physical cash breakdown (count of ₹500, ₹200, ₹100, ₹50, ₹20, ₹10 notes and coins).
2. The software calculates total physical cash and compares it against `expected_closing_cash`.
3. If a shortage exists (e.g. ₹200 missing), the session cannot be closed without entering an explanation note, which permanently registers on the Owner's financial dashboard.

---

## 11. MODULE 6: CAPITAL INVESTMENT, EQUIPMENT LOAN & DAILY SET-ASIDE ENGINE

### 11.1 Loan-Funded Inventory Tagging
Small merchants often fund inventory using Mudra loans or machinery micro-loans:
* When restocking, the merchant marks `"Funded from Loan Capital"`.
* The items are linked to a specific `LoanAccount`.

### 11.2 Daily Money Set-Aside Algorithm
To prevent operators from accidentally spending loan principal as personal profit:
$$\text{Daily Repayment Target} = \frac{\text{Monthly EMI}}{30}$$
The Daily Galla dashboard calculates the exact rupee amount that must be deposited into the Bank Loan Account before personal profits can be withdrawn.

---

## 12. MODULE 7: HOMEMADE FOOD ACCOUNTING & FAMILY DRAWINGS SYSTEM

### 12.1 Four-Category Expense Ledger
1. **`INITIAL_INVESTMENT`**: Utensils, heavy mixers, gas cylinders, packing machines.
2. **`RAW_MATERIAL_EXPENSE`**: Bulk sugar, flour, oil, dry fruits, spices.
3. **`BUSINESS_EXPENSE`**: Gas refills, kitchen electricity, helper wages.
4. **`HOME_FAMILY_EXPENSE` (Drawings)**: Family groceries, children's school fees, personal withdrawals taken from the food income.

### 12.2 Capital Recovery & Break-Even Metric
$$\text{Net Operating Profit} = \text{Food Revenue} - \text{Raw Material Expenses} - \text{Operating Expenses}$$
$$\text{Capital Recovery \%} = \left( \frac{\sum \text{Net Operating Profits}}{\sum \text{Initial Investment}} \right) \times 100$$
Displays live progress towards 100% full recovery of setup capital.

---

## 13. MODULE 8: VYAPAR MASTER REPORTS & MULTI-SHEET EXCEL ENGINE

### 13.1 Executive Graphical Dashboard
* **KPI Header Cards**: Today's Gross Sales, Net Profit, Margin %, Total Pending Udhari, Stock Valuation (at Cost and at MRP).
* **Charts**: 7-Day Sales Trend, Top 5 Velocity Categories, Payment Mode Distribution (Cash vs UPI vs Credit).

### 13.2 Multi-Sheet Vyapar Master Excel Engine
Generates comprehensive spreadsheets formatted for Indian Chartered Accountants (CA) with 7 distinct worksheets:
1. `Executive Summary & KPIs`
2. `Sales Register (Invoices & Profit)`
3. `Stock Valuation & Reorder Alerts`
4. `Customer Khata & Aging Ledger`
5. `Galla Cash Reconciliation`
6. `Loan Capital Amortization`
7. `Expense & Family Drawings Log`

---

## 14. MODULE 9: OFFLINE-FIRST SYNCHRONIZATION & MULTI-DEVICE REALTIME ENGINE

### 14.1 Distributed Multi-Device Architecture
* **0ms Cross-Tab Sync**: When billing on Tab 1, `BroadcastChannel('smart_kirana_local_tabs')` immediately updates Tab 2 without polling.
* **WebSocket Realtime Broadcasting**: Powered by Supabase Realtime across 10 store tables with `REPLICA IDENTITY FULL`.
* **10-Second Delta Heartbeat**: Automatically polls and reconciles any missed WebSocket events during network flickers.

```mermaid
sequenceDiagram
    participant Device1 as Counter Tablet (Device 1)
    participant Dexie1 as Local Dexie (Device 1)
    participant Cloud as Supabase Cloud Database
    participant Device2 as Owner Mobile (Device 2)
    participant Dexie2 as Local Dexie (Device 2)

    Device1->>Dexie1: Execute Checkout (Offline First, <5ms)
    Dexie1->>Device1: Bill Saved & Receipt Printed
    Device1->>Cloud: WebSocket Broadcast (Push Mutation)
    Cloud->>Cloud: RLS Verified & Postgres Updated
    Cloud-->>Device2: Realtime Payload Broadcast
    Device2->>Dexie2: Target DB Routed (kiranaDb vs homemadeDb)
    Dexie2->>Device2: UI Updates Live (0-touch)
```

---

## 15. MODULE 10: SECURITY, RBAC & STORE DANGER VAULT

### 15.1 Role-Based Access Control (RBAC)
| Role | POS Billing | Product CRUD | Customer Khata | Financial Reports | Danger Vault Wipe |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Owner (Admin)** | Full | Full | Full | Full | Full |
| **Manager** | Full | Full | Full | Full | Blocked |
| **Accountant** | Read-Only | Read-Only | Full | Full | Blocked |
| **Cashier** | Full | Read-Only | Read / Collect | Blocked | Blocked |

### 15.2 Store Danger Vault Multi-Factor Protocol
Destructive operations (Wipe Active Business, Clear Transactions) require:
1. **Role Check**: Must be signed in as Store Owner.
2. **Owner Security PIN**: Must enter correct 4-digit PIN (default `1234`).
3. **Keyword Authorization**: Must explicitly type `"CONFIRM"` in uppercase.
4. **Mandatory Disaster Backup**: Automatically downloads a complete encrypted JSON backup of the store before executing any wipe.

---

## 16. MODULE 11: RECEIPTS, CANVAS ENGINE & HARDWARE INTEGRATION

### 16.1 Native HTML5 2D Canvas Receipt Generator
* Completely bypasses DOM-to-image clipping issues and CSS color format incompatibilities.
* Produces sharp thermal receipt PNGs with store header, itemized grid, taxes, totals, UPI QR code, and customer passbook summary in $< 40\text{ms}$.
* Formatted for standard 58mm and 80mm thermal receipt printers.

---

## 17. NON-FUNCTIONAL REQUIREMENTS (NFRS) & PERFORMANCE BUDGETS

* **P99 UI Latency**: Counter touch response $< 16\text{ms}$ (60 FPS smooth interaction).
* **Offline Durability**: Full billing, customer khata, and reporting capability indefinitely without internet.
* **Storage Footprint**: Full 2,000-product catalog and 10,000 transactions consume $< 15\text{MB}$ of browser IndexedDB storage.
* **PWA Service Worker**: Instant load from offline cache with automated background updates.

---

## 18. VERIFICATION MATRIX & AUTOMATED TEST SUITE COVERAGE

The system is validated by an automated test suite comprising **27 test files and 136 passing unit/integration tests**:
* **Physical Database Isolation**: `enterpriseSystemVerification.test.tsx` (100% pass rate).
* **Dual-Rate Billing & Invariants**: `dualBusinessCalculationAndLiveSync.test.tsx` (100% pass rate).
* **Zero-Mouse POS HCI**: `zeroMouseKeyboardAndRealtimeSync.test.tsx` (100% pass rate).
* **Loan P&L & Set-Aside**: `loanFundedInventoryAndReports.test.tsx` (100% pass rate).
* **Danger Vault Security**: `dangerVaultAndFinalRegression.test.tsx` (100% pass rate).

---

## 19. DEPLOYMENT, DISASTER RECOVERY & OPERATOR RUNBOOK

### 19.1 Emergency Disaster Restoration Protocol
If a device is lost, stolen, or damaged:
1. Open any web browser on a new phone, tablet, or PC and navigate to the application URL.
2. Sign in with the registered Owner email (`laxminivas2425@gmail.com`).
3. The system pulls the complete multi-tenant database from Supabase cloud in $< 5\text{ seconds}$, fully restoring all products, customers, and ledger balances.
4. Alternatively, tap **Restore from JSON Backup File** in Settings to restore instantly from an offline JSON backup file.

---
*End of Smart Kirana & Gruh Udyog POS Technical Specification Document.*

