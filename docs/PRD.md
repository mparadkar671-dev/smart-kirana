# Product Requirements Document (PRD)
## Smart Kirana & Gruh Udyog POS Platform

**Version:** 4.0.0 (Enterprise Production Edition)  
**Status:** Approved & Living Baseline  
**Target Platform:** Progressive Web App (Offline-First / Desktop / Mobile)

---

## 1. Executive Summary & Problem Statement

Neighborhood Indian retail micro-enterprises operate under tight margins, fierce local competition, and erratic internet connectivity. Many families operate two businesses concurrently:
1. A **Kirana Store** (retailing FMCG and loose dry commodities like rice, dal, and oil).
2. A **Gruh Udyog Unit** (producing fresh culinary products like Laddus, Modaks, Chapatis, and Bhakris).

Existing POS systems fail because they:
- Force businesses to choose between paying for two separate subscriptions or commingling commercial groceries with perishable homemade food.
- Require mouse interaction, which reduces counter throughput.
- Rely on constant internet connectivity, leaving cashiers unable to bill when lines drop.
- Fail to account for cash leaks from the *Galla* (cash drawer) for family drawings or direct vendor cash payouts.
- Fail to separate borrowed loan capital (e.g., Mudra loans) from daily operational profit.

**Smart Kirana POS** solves this by providing a unified, physical-partitioned, local-first POS with sub-5ms latency, full zero-mouse keyboard controls, integer-paisa accounting, and automated cross-device sync.

---

## 2. User Personas & Roles

| Persona | Primary Goal | Key Workflows & Frustrations |
| :--- | :--- | :--- |
| **Store Owner (Ramesh)** | Total financial visibility, profit accuracy, zero cash leakage. | Needs to know exact daily net profit, cash drawer discrepancy, loan repayment obligations, and credit (udhari) health. |
| **Counter Cashier (Suresh)** | Maximum checkout speed, minimum cognitive load. | High rush hours (7–10 AM, 6–9 PM). Needs 100% keyboard billing, instant barcode scans, and loose commodity reverse calculation. |
| **Kitchen Cook / Manager (Sunita)** | Fresh batch tracking, ingredient requirements, festival advance bookings. | Needs to know today's advance orders, required raw materials, shelf-life expiry, and B2B wholesale pricing. |
| **Neighborhood Customer (Mrs. Joshi)** | Transparent billing, accurate credit ledger, instant WhatsApp bills. | Wants immediate WhatsApp receipt slips with itemized breakdowns and running balance. |

---

## 3. Functional Specifications by Module

### Module 1: High-Speed POS Counter Billing & HCI Ergonomics
- **Zero-Mouse Flow**:
  - `F2` focuses search bar; typing short code (e.g., `TS1`) or barcode immediately filters items.
  - `Enter` adds top item; `+`/`-` adjusts quantity; `D` sets discount/round-off.
  - `F8` completes Cash checkout; `F4` cycles between Bill 1, Bill 2, and Bill 3 carts without state loss.
- **Loose Item Reverse Price Calculator (`REQ-08`)**:
  - Supports odd rupee requests (e.g., customer asks for "₹10 worth of loose sugar at ₹44/kg").
  - Automatically locks the price to ₹10.00 and calculates quantity as `10 / 44 = 0.227 kg` without floating-point penny drift.
- **Top-24 Fast-Tap Pareto Grid**:
  - Visual cards with uniform 160×160 WebP image thumbnails, bilingual Marathi/English labels, and retail prices.
- **Multi-Cart Stash (`REQ-07`)**:
  - Up to 3 simultaneous active carts allowing the cashier to hold a bill while a customer grabs another item.

### Module 2: Gruh Udyog B2B/B2C Billing & Advance Festival Booking
- **Dual-Rate POS Switcher**:
  - Instant toggle between **Direct Customer MRP** (B2C) and **Retailer Bulk Wholesale Rate** (B2B).
  - Invoices automatically receive the `HMF-` prefix instead of `KRN-`.
- **Advance Orders & Festival Booking (`REQ-11`)**:
  - Capture customer advance bookings (e.g., 200 Modaks, 15 kg Besan Laddu) for a future festival date.
  - Generates instant WhatsApp Booking Confirmation Slip with advance token deposit.
  - 1-Click "Convert to Final Bill" upon pickup, deducting fresh batch stock and booking final settlement.

### Module 3: Inventory Master, Barcoding & Auto-Calculated Margins
- **Unified Master Catalog**:
  - Pre-seeded with 105 authentic Maharashtra Kirana products with standard categories, search keywords, and barcodes.
- **GS1-Compliant Store Barcode Generator**:
  - Generates unique 13-digit EAN-13 barcodes starting with the store prefix `200` with standard modulo-10 checksums.
- **Smart Image Engine**:
  - Compresses camera or file uploads into square 160×160 WebP data URLs under 15 KB.
- **Dynamic Margin Badges**:
  - Real-time gross margin calculation:
    $$\text{Margin \%} = \frac{\text{Selling Price} - \text{Purchase Price}}{\text{Selling Price}} \times 100$$
  - Color-coded badges: Green ($\ge 15\%$), Amber ($5\% - 14.9\%$), Red ($< 5\%$).

### Module 4: Customer Khata, Credit Aging & Debt Recovery Engine
- **Customer Ledger (`REQ-10`)**:
  - Full debit/credit transaction ledger with immutable running balances.
  - Real-time aging analysis: Current ($< 30$ days), Overdue ($30 - 60$ days), Critical ($> 60$ days).
- **1-Click WhatsApp & SMS Payment Reminders**:
  - Sends bilingual Marathi/English payment reminder slips with UPI QR code and itemized bill history.
  - Generates standard `sms:+91...` URIs for feature/keypad phones.
- **Hard Credit Limit Guardrail (`REQ-29`)**:
  - Blocks cashier checkout if bill pushes customer balance past `credit_limit` unless overridden with a Manager PIN.

### Module 5: Daily Galla (Cash Drawer) Reconciliation
- **Session-Based Accounting (`REQ-13`)**:
  - Opening cash input at shift start.
  - Automatic double-entry capture:
    - $+$ Cash Sales
    - $+$ Cash Khata Jama Received
    - $-$ Cash Expenses Out (Vendor payouts, tea/transport, family drawings)
  - End-of-day physical count entry with automated discrepancy calculation:
    $$\text{Discrepancy} = \text{Actual Cash} - \text{Expected Cash}$$

### Module 6: Capital Loan Funding & Daily Money Set-Aside
- **Loan-Funded Stock Tracking**:
  - Link inventory restocking to specific loan accounts (e.g., Mudra Loan, Bank Machinery Loan).
- **Daily Loan Set-Aside Formula**:
  - When a loan-funded product is sold, the system isolates its purchase cost:
    $$\text{Daily Set-Aside} = \sum (\text{Qty Sold} \times \text{Loan Item Unit Cost})$$
  - Instructs owner to physically deposit this money into a separate bank account, preventing loan default.

### Module 7: Homemade Food Accounting & Family Drawings
- **Cost Allocation**:
  - Tracks raw material expenses, equipment fuel/gas, packaging, and cook labor.
- **Family Self-Use Goods Isolation (`AT-05`)**:
  - When the owner's family takes groceries for personal home use, stock is deducted at cost without polluting customer sales or inflating retail revenue.

### Module 8: Vyapar Financial Master Reports & Multi-Sheet Excel Engine
- **7-Sheet Vyapar Master Excel Workbook**:
  1. Executive Summary & KPIs
  2. Profit & Loss Statement (Operating Revenue vs COGS vs Expenses)
  3. Product-Wise Sales & Margin Performance
  4. Customer-Wise Khata Udhari Summary
  5. Daily Bill Register
  6. Inventory Valuation & Locked Working Capital
  7. Loan Stock & Capital Amortization
- **PDF Export Engine**:
  - Generates downloadable, print-ready PDF reports with formal accounting headers and grand totals.

### Module 9: Offline-First Synchronization & Realtime WebSockets
- **Zero-Latency Local Operation**:
  - Dexie IndexedDB serves as the primary source of truth.
- **Outbox Queue**:
  - All offline mutations queued into `sync_outbox`.
- **Supabase Cloud Sync**:
  - Bidirectional sync to cloud PostgreSQL with signed delta stock changes (`delta_qty`).
- **Cross-Device WebSockets**:
  - Supabase Realtime channels broadcast changes across all devices logged into the store in under 1 second.

### Module 10: Security, PIN Guardrails & Danger Vault
- **Manager PIN Authentication**:
  - Required for zero-stock sales, credit limit overrides, bill voiding, and data wipes.
- **Danger Vault (`REQ-15`)**:
  - Collapsed red-border container requiring Manager PIN + typing `"CONFIRM"`.
  - Automatically downloads an emergency encrypted JSON database backup before executing any reset.

### Module 11: High-DPI Canvas Receipts & WhatsApp Integration
- **HTML5 2D Canvas Slip Engine**:
  - Renders pixel-perfect receipts with bilingual headers, UPI QR codes, line items, and store notes.
  - Zero heavy external layout libraries; exports lightweight PNG images for direct WhatsApp sharing.

---

## 4. Non-Functional Requirements & Performance Budgets

| Metric | Target Requirement | Verification Method |
| :--- | :--- | :--- |
| **Product Lookup Latency** | $< 5\text{ ms}$ | Dexie local indexed query benchmark |
| **Barcode Scan-to-Cart** | $< 50\text{ ms}$ | Hardware input test |
| **Memory Footprint** | $< 50\text{ MB}$ Heap | Chrome DevTools Memory Profiler |
| **Offline Reliability** | 100% functions offline | Full offline network throttling suite |
| **Sync Latency (Online)** | $< 1000\text{ ms}$ | Realtime WebSocket test suite |
| **Test Suite Coverage** | 100% pass (29/29 files) | Vitest automated runner |
