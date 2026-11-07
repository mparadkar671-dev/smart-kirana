# System Architecture & Technical Design
## Smart Kirana & Gruh Udyog POS Platform

**Version:** 4.0.0 (Enterprise Architecture)  
**Status:** Approved & Implemented in Production  

---

## 1. C4 System Context Diagram

```mermaid
graph TD
    Cashier([Store Cashier / Operator]) -->|Zero-mouse billing, barcode scans| PWA[Smart Kirana PWA]
    Owner([Store Owner / Manager]) -->|P&L reports, Galla audits, PIN overrides| PWA
    Customer([Neighborhood Customer]) <--|WhatsApp receipt slips, SMS reminders| PWA
    
    subgraph Client Device Local Sandbox
        PWA <--> IDB[(Physical IndexedDB Partitioning)]
        PWA <--> BC[BroadcastChannel Multi-Tab Sync]
    end
    
    subgraph Cloud Infrastructure Supabase
        PWA <-->|Bi-directional Sync / Outbox Queue| SupaDB[(Supabase PostgreSQL)]
        PWA <-->|Realtime WebSocket Broadcast| SupaRT[Supabase Realtime Engine]
    end
    
    subgraph External Interfaces
        PWA -->|wa.me deep links| WhatsAppAPI[WhatsApp Web / Mobile]
        PWA -->|Direct sms: URI| TelcoSMS[Carrier SMS Keypad Phones]
    end
```

---

## 2. C4 Container & Component Architecture

```mermaid
graph TD
    subgraph Application Shell React 19 + TypeScript
        UI[React UI Components]
        Hotkeys[Keyboard Ergonomics Engine F2, F4, F8, F9, D, Esc]
        Router[Module Switcher POS, Inventory, Khata, Galla, Reports]
        
        UI --> Hotkeys
        UI --> Router
    end
    
    subgraph Business Logic Layer
        BillingSvc[BillingService]
        InventorySvc[InventoryService]
        KhataSvc[KhataService]
        GallaSvc[GallaService]
        ReportSvc[VyaparReportService]
        LoanSvc[LoanAccountService]
        CanvasSvc[ReceiptCanvasEngine]
    end
    
    Router --> BillingSvc
    Router --> InventorySvc
    Router --> KhataSvc
    Router --> GallaSvc
    Router --> ReportSvc
    Router --> LoanSvc
    Router --> CanvasSvc
    
    subgraph Data Access Layer
        Proxy[Dynamic DB Proxy src/db/db.ts]
        Firewall[Business Firewall & Tenant Resolver]
        
        BillingSvc --> Proxy
        InventorySvc --> Proxy
        KhataSvc --> Proxy
        GallaSvc --> Proxy
        LoanSvc --> Proxy
        
        Proxy --> Firewall
    end
    
    subgraph Physical Storage Partitioning IndexedDB via Dexie
        KiranaDB[(SmartKiranaDB_Retail_v3)]
        HomemadeDB[(SmartKiranaDB_Homemade_v3)]
        
        Firewall -->|Mode: KIRANA_RETAIL| KiranaDB
        Firewall -->|Mode: HOMEMADE_FOOD| HomemadeDB
    end
    
    subgraph Offline Sync Engine
        OutboxKirana[sync_outbox Kirana]
        OutboxHMF[sync_outbox Gruh Udyog]
        SyncWorker[CloudSyncService]
        
        KiranaDB --> OutboxKirana
        HomemadeDB --> OutboxHMF
        OutboxKirana --> SyncWorker
        OutboxHMF --> SyncWorker
    end
    
    subgraph Cloud Storage Supabase
        SyncWorker <--> CloudDB[(Supabase PostgreSQL)]
        CloudDB <--> CloudRealtime[Supabase Realtime WebSockets]
        CloudRealtime --> SyncWorker
    end
```

---

## 3. High-Speed POS Checkout & Real-Time Sync Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Cashier
    participant UI as POS Billing UI
    participant Billing as BillingService
    participant Proxy as Dynamic DB Proxy
    participant IDB as Physical IndexedDB
    participant Outbox as sync_outbox Table
    participant BC as BroadcastChannel
    participant Sync as CloudSyncService
    participant Supabase as Supabase PostgreSQL
    participant WebSocket as Supabase Realtime
    actor RemoteDevice as Secondary Mobile / Counter

    Cashier->>UI: Press F8 (Instant Cash Checkout)
    UI->>Billing: executeCheckout(cart, cashPayment, customer)
    
    Note over Billing,IDB: Single Atomic Dexie Transaction (<5ms)
    Billing->>Proxy: Deduct stock from products table
    Proxy->>IDB: Decrement current_stock (signed delta)
    Billing->>Proxy: Insert sales_invoices record
    Proxy->>IDB: Put sales_invoice (KRN-YYYYMMDD-001)
    Billing->>Proxy: Bulk insert sale_items records
    Proxy->>IDB: Bulk put sale_items
    Billing->>Proxy: Update active daily_galla_session (+cash_sales)
    Proxy->>IDB: Update cash_sales_total, expected_closing_cash
    Billing->>Outbox: Queue INSERT/UPDATE payloads into sync_outbox
    IDB-->>Billing: Transaction Committed (0ms delay)
    
    Billing->>BC: Broadcast('BILL_COMPLETED', invoice_id)
    BC-->>UI: Other open tabs update live query state
    Billing-->>UI: Checkout Completed Successfully
    UI-->>Cashier: Print / WhatsApp Receipt Modal Displayed
    
    Note over Sync,Supabase: Asynchronous Background Sync
    Sync->>Outbox: Read pending un-synced outbox rows
    Sync->>Supabase: Upsert batches via REST API
    Supabase-->>Sync: 200 OK / Timestamps updated
    Sync->>Outbox: Clear processed outbox records
    
    Supabase->>WebSocket: Broadcast Postgres Change Notification
    WebSocket->>RemoteDevice: Receive remote INSERT / UPDATE
    RemoteDevice->>RemoteDevice: Apply mutation locally (0ms conflict)
```

---

## 4. Entity-Relationship (ER) Schema Diagram

```mermaid
erDiagram
    SHOP_PROFILE ||--o{ PRODUCT : owns
    SHOP_PROFILE ||--o{ CUSTOMER : serves
    SHOP_PROFILE ||--o{ WHOLESALER : registers
    SHOP_PROFILE ||--o{ LOAN_ACCOUNT : tracks
    SHOP_PROFILE ||--o{ DAILY_GALLA_SESSION : balances
    
    PRODUCT ||--o{ SALE_ITEM : billed_in
    PRODUCT ||--o{ INVENTORY_LOG : logs
    PRODUCT }o--|| WHOLESALER : supplied_by
    PRODUCT }o--o| LOAN_ACCOUNT : funded_by
    
    CUSTOMER ||--o{ SALES_INVOICE : purchases
    CUSTOMER ||--o{ KHATA_TRANSACTION : records_udhari
    CUSTOMER ||--o{ ADVANCE_ORDER : books
    
    SALES_INVOICE ||--|{ SALE_ITEM : contains
    SALES_INVOICE ||--o| KHATA_TRANSACTION : generates_credit
    SALES_INVOICE ||--o| CREDIT_NOTE : returned_in
    
    DAILY_GALLA_SESSION ||--o{ EXPENSE_AND_DRAWING : records_cash_out
    LOAN_ACCOUNT ||--o{ INVENTORY_LOG : funds_restock
    
    PRODUCT {
        string id PK
        string shop_id FK
        string business_type
        string name
        string marathi_name
        string barcode
        string short_code
        string category
        string unit_type
        number purchase_price
        number selling_price
        number mrp
        number current_stock
        number low_stock_threshold
        string wholesaler_id FK
        string loan_account_id FK
        boolean is_quick_tap
        string updated_at
    }
    
    SALES_INVOICE {
        string id PK
        string shop_id FK
        string business_type
        string invoice_number UK
        string customer_id FK
        number subtotal_amount
        number discount_roundoff
        number grand_total
        number total_cogs
        string payment_mode
        number amount_paid_now
        number udhari_added
        string status
        string created_at
    }
    
    SALE_ITEM {
        string id PK
        string shop_id FK
        string business_type
        string invoice_id FK
        string product_id FK
        string product_name_snapshot
        number qty
        number unit_purchase_cost
        number unit_selling_price
        number line_total
    }
    
    CUSTOMER {
        string id PK
        string shop_id FK
        string business_type
        string name
        string phone
        number credit_limit
        number current_udhari_balance
        string created_at
    }
    
    KHATA_TRANSACTION {
        string id PK
        string shop_id FK
        string business_type
        string customer_id FK
        string entry_type
        number amount
        string payment_channel
        string invoice_id FK
        number running_balance_after
        string created_at
    }
    
    DAILY_GALLA_SESSION {
        string id PK
        string shop_id FK
        string business_type
        string session_date UK
        number opening_cash
        number cash_sales_total
        number cash_udhari_recovered
        number cash_expenses_out
        number expected_closing_cash
        number actual_counted_cash
        number discrepancy
    }
    
    EXPENSE_AND_DRAWING {
        string id PK
        string shop_id FK
        string business_type
        string category
        number amount
        string paid_via
        string description
        string created_at
    }
    
    LOAN_ACCOUNT {
        string id PK
        string shop_id FK
        string business_type
        string name
        string lender_name
        number principal_amount
        number total_repaid_amount
        number outstanding_balance
        string status
        string created_at
    }
```

---

## 5. Physical Database Partitioning & Dynamic Proxy Pattern

To ensure complete physical data isolation between `KIRANA_RETAIL` and `HOMEMADE_FOOD`:

```typescript
// Physical Database Instantiations
export const kiranaDb = new KiranaDexie('SmartKiranaDB_Retail_v3');
export const homemadeDb = new KiranaDexie('SmartKiranaDB_Homemade_v3');

// Dynamic Proxy Router
export const db = new Proxy({} as KiranaDexie, {
  get(_target, prop: keyof KiranaDexie) {
    const activeBiz = getActiveBusinessType(); // reads localStorage or default
    const activeDatabase = activeBiz === 'HOMEMADE_FOOD' ? homemadeDb : kiranaDb;
    const value = activeDatabase[prop];
    return typeof value === 'function' ? value.bind(activeDatabase) : value;
  }
});
```

### Key Architectural Benefits:
1. **Zero Contamination**: Kirana products, sales, customers, and expenses physically exist in a separate SQLite/IndexedDB file from Gruh Udyog.
2. **Transparent Codebase**: All services and React hooks continue to interact with a single `db` interface without repetitive if-else switching logic.
3. **Coordinated Inter-Business Transfers**: Inter-business inventory movements (e.g., Kirana sugar transferred to the Gruh Udyog kitchen) are coordinated across `kiranaDb` and `homemadeDb` in an atomic sequence with audit logging.
