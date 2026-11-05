import { db } from '../db/db';
import {
  Product,
  UnitType,
  BusinessType,
  AdvanceOrder,
  AdvanceOrderItem,
  AdvanceOrderStatus,
  PaymentMode,
  ShopProfile,
  SalesInvoice,
  SaleItem,
  ExpenseAndDrawing,
  WALK_IN_CUSTOMER_ID,
  WALK_IN_CUSTOMER_RECORD,
  InventoryLog,
} from '../types';
import { DEFAULT_SHOP_PROFILE } from '../db/seed';
import { generateUniqueStoreBarcode } from '../utils/barcodeGenerator';
import { roundCurrency, roundQty } from '../utils/math';
import { BillingService } from './billingService';
import { cloudSyncService } from './cloudSyncService';

export interface HomemadeStarterItem {
  marathiName: string;
  englishName: string;
  shortCode: string;
  category: string;
  unitType: UnitType;
  sellingPrice: number;
  makingCost: number;
  mrp: number;
  initialBatchQty: number;
  lowStockThreshold: number;
  searchKeywords: string;
  emoji: string;
}

export interface CapitalAndExpenseSummary {
  totalInitialInvestmentAllTime: number;
  cumulativeTrueNetProfit: number;
  capitalRecoveredPct: number;
  remainingToBreakEven: number;
  netProfitAfterCapitalPayback: number;
  periodInitialInvestment: number;
  periodRawMaterialExpenses: number;
  periodOperatingExpenses: number;
  periodHomeFamilyExpenses: number;
  periodSalesRevenue: number;
  periodEstimatedCOGS: number;
  totalSalesRevenue: number;
  totalItemMakingCostCogs: number;
  grossProfitFromSales: number;
  trueBusinessNetProfit: number;
  netRetainedCashSavings: number;
  itemWiseProfitability: {
    productId: string;
    productName: string;
    marathiName?: string;
    category: string;
    unitType: UnitType;
    qtySold: number;
    totalRevenue: number;
    estMakingCost: number;
    estimatedMakingCost: number;
    grossProfit: number;
    profitMarginPct: number;
    marginPct: number;
  }[];
  periodExpenses: ExpenseAndDrawing[];
}

/**
 * 12 Authentic Konkani / Maharashtrian Homemade Food (Gruh Udyog) Starter Catalog
 */
export const HOMEMADE_FOOD_STARTER_CATALOG: HomemadeStarterItem[] = [
  {
    marathiName: 'बेसन लाडू',
    englishName: 'Besan Laddu',
    shortCode: 'BSL',
    category: 'Homemade Laddus & Sweets',
    unitType: 'KG_LOOSE',
    sellingPrice: 480,
    makingCost: 340,
    mrp: 500,
    initialBatchQty: 5,
    lowStockThreshold: 1,
    searchKeywords: 'besan laddu, ladoo, बेसन लाडू, दिवाळी लाडू, साजूक तूप लाडू',
    emoji: '🟡',
  },
  {
    marathiName: 'रवा-नारळ लाडू',
    englishName: 'Rava Coconut Laddu',
    shortCode: 'RCL',
    category: 'Homemade Laddus & Sweets',
    unitType: 'KG_LOOSE',
    sellingPrice: 420,
    makingCost: 290,
    mrp: 450,
    initialBatchQty: 5,
    lowStockThreshold: 1,
    searchKeywords: 'rava laddu, naral laddu, coconut laddu, रवा लाडू, रवा नारळ लाडू',
    emoji: '🥥',
  },
  {
    marathiName: 'डिंक / ड्रायफ्रूट लाडू',
    englishName: 'Dink Dryfruit Laddu',
    shortCode: 'DDL',
    category: 'Homemade Laddus & Sweets',
    unitType: 'KG_LOOSE',
    sellingPrice: 760,
    makingCost: 540,
    mrp: 800,
    initialBatchQty: 4,
    lowStockThreshold: 0.5,
    searchKeywords: 'dink laddu, dryfruit laddu, डिंक लाडू, पौष्टिक लाडू, सुकामेवा लाडू',
    emoji: '🌰',
  },
  {
    marathiName: 'खोबऱ्याच्या वड्या / कापा',
    englishName: 'Khobryachi Kapa (Coconut Barfi)',
    shortCode: 'KHK',
    category: 'Homemade Laddus & Sweets',
    unitType: 'KG_LOOSE',
    sellingPrice: 440,
    makingCost: 250,
    mrp: 480,
    initialBatchQty: 5,
    lowStockThreshold: 1,
    searchKeywords: 'khobryachi kapa, naral vadi, khobra vadi, खोबऱ्याच्या वड्या, कापा, नारळ वडी',
    emoji: '🥥',
  },
  {
    marathiName: 'उकडीचे मोदक',
    englishName: 'Ukadiche Modak',
    shortCode: 'UMD',
    category: 'Modak & Festive Specials',
    unitType: 'PCS',
    sellingPrice: 30,
    makingCost: 14,
    mrp: 30,
    initialBatchQty: 42,
    lowStockThreshold: 11,
    searchKeywords: 'ukadiche modak, steamed modak, उकडीचे मोदक, मोदक, संकष्टी मोदक',
    emoji: '🥟',
  },
  {
    marathiName: 'तळणीचे मोदक',
    englishName: 'Fried Modak',
    shortCode: 'FMD',
    category: 'Modak & Festive Specials',
    unitType: 'PCS',
    sellingPrice: 20,
    makingCost: 11,
    mrp: 20,
    initialBatchQty: 40,
    lowStockThreshold: 10,
    searchKeywords: 'talniche modak, fried modak, तळणीचे मोदक, मोदक',
    emoji: '🥟',
  },
  {
    marathiName: 'घावणे',
    englishName: 'Malvani Ghavane',
    shortCode: 'GHV',
    category: 'Konkani Fresh Tiffin & Poli',
    unitType: 'PLATE',
    sellingPrice: 40,
    makingCost: 22,
    mrp: 40,
    initialBatchQty: 30,
    lowStockThreshold: 5,
    searchKeywords: 'ghavane, malvani ghavane, घावणे, मालवणी घावणे, तांदळाचे घावणे',
    emoji: '🥞',
  },
  {
    marathiName: 'आंबोळी',
    englishName: 'Soft Amboli',
    shortCode: 'AMB',
    category: 'Konkani Fresh Tiffin & Poli',
    unitType: 'PLATE',
    sellingPrice: 40,
    makingCost: 20,
    mrp: 40,
    initialBatchQty: 30,
    lowStockThreshold: 5,
    searchKeywords: 'amboli, konkani amboli, आंबोळी, कोकणी आंबोळी',
    emoji: '🥞',
  },
  {
    marathiName: 'तांदळाची भाकरी',
    englishName: 'Tandlachi Bhakri',
    shortCode: 'TBK',
    category: 'Fresh Bhakri & Chapati',
    unitType: 'PCS',
    sellingPrice: 15,
    makingCost: 8,
    mrp: 15,
    initialBatchQty: 40,
    lowStockThreshold: 10,
    searchKeywords: 'tandlachi bhakri, rice bhakri, तांदळाची भाकरी, भाकरी',
    emoji: '🫓',
  },
  {
    marathiName: 'ज्वारी / बाजरी भाकरी',
    englishName: 'Jowar-Bajra Bhakri',
    shortCode: 'JBK',
    category: 'Fresh Bhakri & Chapati',
    unitType: 'PCS',
    sellingPrice: 18,
    makingCost: 9.5,
    mrp: 18,
    initialBatchQty: 35,
    lowStockThreshold: 8,
    searchKeywords: 'jowar bhakri, bajra bhakri, ज्वारी भाकरी, बाजरी भाकरी, गावरान भाकरी',
    emoji: '🫓',
  },
  {
    marathiName: 'घरगुती चपाती',
    englishName: 'Soft Chapati (Poli)',
    shortCode: 'CHP',
    category: 'Fresh Bhakri & Chapati',
    unitType: 'PCS',
    sellingPrice: 10,
    makingCost: 5.5,
    mrp: 10,
    initialBatchQty: 80,
    lowStockThreshold: 15,
    searchKeywords: 'chapati, poli, fulka, घरगुती चपाती, पोळी, गव्हाची पोळी',
    emoji: '🫓',
  },
  {
    marathiName: 'पुरणपोळी',
    englishName: 'Puran Poli',
    shortCode: 'PPL',
    category: 'Modak & Festive Specials',
    unitType: 'PCS',
    sellingPrice: 30,
    makingCost: 16,
    mrp: 30,
    initialBatchQty: 25,
    lowStockThreshold: 5,
    searchKeywords: 'puran poli, puranpoli, पुरणपोळी, सणाची पुरणपोळी',
    emoji: '🥞',
  },
];

/**
 * Generates a warm Saffron/Amber 160x160px SVG DataURL thumbnail for Homemade Food items
 */
export function generateHomemadeFoodThumbnail(item: {
  marathiName: string;
  englishName: string;
  sellingPrice: number;
  unitType: UnitType;
  emoji?: string;
}): string {
  const safeMar = item.marathiName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 16);
  const safeEng = item.englishName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 18);
  const unitLabel = item.unitType === 'KG_LOOSE' ? '/kg' : item.unitType === 'PLATE' ? '/plt' : item.unitType === 'DOZEN' ? '/doz' : '/pc';
  const emoji = item.emoji || '🍲';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" rx="18" fill="#FFFFFF"/>
    <rect x="6" y="6" width="148" height="148" rx="14" fill="#FFF7ED" stroke="#FDBA74" stroke-width="3"/>
    <rect x="12" y="12" width="136" height="24" rx="6" fill="#EA580C"/>
    <text x="80" y="28" font-family="sans-serif" font-size="11.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${safeMar}</text>
    <text x="80" y="86" font-family="sans-serif" font-size="42" text-anchor="middle">${emoji}</text>
    <text x="80" y="120" font-family="sans-serif" font-size="10" font-weight="bold" fill="#7C2D12" text-anchor="middle">${safeEng}</text>
    <rect x="34" y="128" width="92" height="20" rx="10" fill="#9A3412"/>
    <text x="80" y="142" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FEF08A" text-anchor="middle">₹${item.sellingPrice}${unitLabel}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// In-memory + localStorage workspace snapshots for instantaneous 0ms multi-business switching
const inMemoryWorkspaces: Record<string, any> = {};

function getWorkspaceStorageKey(businessType: BusinessType): string {
  return `kirana_biz_workspace_${businessType}`;
}

export class HomemadeFoodService {
  /**
   * Resets in-memory workspace snapshots (used when wiping records or between isolated tests)
   */
  static resetWorkspaceSnapshots(): void {
    for (const key of Object.keys(inMemoryWorkspaces)) {
      delete inMemoryWorkspaces[key];
    }
  }

  /**
   * Seeds the 12 Homemade Konkani/Maharashtrian Food Menu items into the active store
   */
  static async seedHomemadeFoodCatalog(): Promise<{
    importedCount: number;
    seededCount: number;
    totalProducts: number;
    totalHomemadeCount: number;
  }> {
    const profile = await db.getShopProfile();
    const shopId = profile?.shop_id || profile?.id || 'homemade_food_shop';
    const existingProducts = await db.products.toArray();
    const usedBarcodes = new Set(existingProducts.map((p) => p.barcode).filter(Boolean));
    const nowIso = new Date().toISOString();

    const productsToPut: Product[] = [];
    const logsToPut: InventoryLog[] = [];
    let importedCount = 0;

    HOMEMADE_FOOD_STARTER_CATALOG.forEach((item, idx) => {
      const id = `hmf-prod-${String(idx + 1).padStart(3, '0')}`;
      const existing = existingProducts.find(
        (p) => p.id === id || p.name.toLowerCase().includes(item.englishName.toLowerCase())
      );

      let barcode = existing?.barcode || '';
      if (!barcode) {
        barcode = generateUniqueStoreBarcode(usedBarcodes);
        usedBarcodes.add(barcode);
      }

      const shortCode = existing?.short_code || item.shortCode || `HMF${String(idx + 1).padStart(2, '0')}`;

      const prod: Product = {
        id: existing?.id || id,
        shop_id: shopId,
        name: `${item.marathiName} (${item.englishName})`,
        marathi_name: item.marathiName,
        search_keywords: item.searchKeywords,
        short_code: shortCode,
        barcode,
        category: item.category,
        unit_type: item.unitType,
        purchase_price: item.makingCost,
        selling_price: item.sellingPrice,
        mrp: item.mrp,
        current_stock: existing ? existing.current_stock : item.initialBatchQty,
        low_stock_threshold: item.lowStockThreshold,
        last_supplier_name: 'In-House Fresh Kitchen Batch',
        wholesaler_id: null,
        loan_account_id: null,
        image_url:
          existing?.image_url ||
          generateHomemadeFoodThumbnail({
            marathiName: item.marathiName,
            englishName: item.englishName,
            sellingPrice: item.sellingPrice,
            unitType: item.unitType,
            emoji: item.emoji,
          }),
        expiry_date: null,
        is_quick_tap: true,
        updated_at: nowIso,
      };

      productsToPut.push(prod);
      if (!existing) {
        importedCount++;
        logsToPut.push({
          id: `hmf-init-log-${prod.id}`,
          shop_id: shopId,
          product_id: prod.id,
          change_qty: prod.current_stock,
          reason_type: 'BATCH_MADE_IN',
          unit_cost_at_time: prod.purchase_price,
          reference_id: null,
          notes: 'Initial fresh kitchen batch stock',
          created_at: nowIso,
        });
      }
    });

    await db.transaction('rw', [db.products, db.inventory_logs], async () => {
      await db.products.bulkPut(productsToPut);
      if (logsToPut.length > 0) {
        await db.inventory_logs.bulkPut(logsToPut);
      }
    });

    cloudSyncService.syncAllToCloud().catch(() => {});

    const totalProducts = await db.products.count();
    return {
      importedCount,
      seededCount: importedCount,
      totalProducts,
      totalHomemadeCount: totalProducts,
    };
  }

  /**
   * 1-Click Multi-Business Switcher:
   * Atomically snapshots the current business's tables (`KIRANA_RETAIL` or `HOMEMADE_FOOD`)
   * and swaps in the target business's isolated profile, products, customers, invoices, expenses & advance orders.
   */
  static async switchBusinessWorkspace(
    targetBusinessType: BusinessType,
    options: { autoSeedHomemadeMenu?: boolean; seedCatalogIfEmpty?: boolean } = {
      autoSeedHomemadeMenu: true,
      seedCatalogIfEmpty: true,
    }
  ): Promise<
    ShopProfile & {
      businessType: BusinessType;
      activeProfile: ShopProfile;
      productCount: number;
    }
  > {
    const currentProfile = await db.getShopProfile();
    const currentBusinessType: BusinessType = currentProfile?.business_type || 'KIRANA_RETAIL';

    // 1. Save current business snapshot before switching
    const currentSnapshot = {
      shop_profile: currentProfile,
      products: await db.products.toArray(),
      inventory_logs: await db.inventory_logs.toArray(),
      customers: await db.customers.toArray(),
      sales_invoices: await db.sales_invoices.toArray(),
      sale_items: await db.sale_items.toArray(),
      khata_transactions: await db.khata_transactions.toArray(),
      expenses_and_drawings: await db.expenses_and_drawings.toArray(),
      daily_galla_sessions: await db.daily_galla_sessions.toArray(),
      advance_orders: await db.advance_orders.toArray(),
      loan_accounts: await db.loan_accounts.toArray(),
      wholesalers: await db.wholesalers.toArray(),
    };

    const currentKey = getWorkspaceStorageKey(currentBusinessType);
    inMemoryWorkspaces[currentKey] = currentSnapshot;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(currentKey, JSON.stringify(currentSnapshot));
      }
    } catch {
      // Ignore localStorage quota limits; inMemoryWorkspaces holds full data
    }

    // 2. Load target business snapshot if it exists
    const targetKey = getWorkspaceStorageKey(targetBusinessType);
    let targetSnapshot = inMemoryWorkspaces[targetKey];
    if (!targetSnapshot && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(targetKey);
        if (raw) targetSnapshot = JSON.parse(raw);
      } catch {
        targetSnapshot = null;
      }
    }

    const targetShopId = targetBusinessType === 'HOMEMADE_FOOD' ? 'homemade_food_shop' : 'current_shop';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('kirana_active_shop_id', targetShopId);
      localStorage.setItem('kirana_active_business_type', targetBusinessType);
    }

    await db.transaction(
      'rw',
      [
        db.products,
        db.inventory_logs,
        db.customers,
        db.sales_invoices,
        db.sale_items,
        db.khata_transactions,
        db.expenses_and_drawings,
        db.daily_galla_sessions,
        db.advance_orders,
        db.loan_accounts,
        db.wholesalers,
        db.shop_profile,
      ],
      async () => {
        await db.products.clear();
        await db.inventory_logs.clear();
        await db.customers.clear();
        await db.sales_invoices.clear();
        await db.sale_items.clear();
        await db.khata_transactions.clear();
        await db.expenses_and_drawings.clear();
        await db.daily_galla_sessions.clear();
        await db.advance_orders.clear();
        await db.loan_accounts.clear();
        await db.wholesalers.clear();

        if (targetSnapshot) {
          if (targetSnapshot.products?.length) await db.products.bulkPut(targetSnapshot.products);
          if (targetSnapshot.inventory_logs?.length) await db.inventory_logs.bulkPut(targetSnapshot.inventory_logs);
          if (targetSnapshot.customers?.length) {
            await db.customers.bulkPut(targetSnapshot.customers);
          } else {
            await db.customers.put({ ...WALK_IN_CUSTOMER_RECORD, shop_id: targetShopId });
          }
          if (targetSnapshot.sales_invoices?.length) await db.sales_invoices.bulkPut(targetSnapshot.sales_invoices);
          if (targetSnapshot.sale_items?.length) await db.sale_items.bulkPut(targetSnapshot.sale_items);
          if (targetSnapshot.khata_transactions?.length) await db.khata_transactions.bulkPut(targetSnapshot.khata_transactions);
          if (targetSnapshot.expenses_and_drawings?.length) await db.expenses_and_drawings.bulkPut(targetSnapshot.expenses_and_drawings);
          if (targetSnapshot.daily_galla_sessions?.length) await db.daily_galla_sessions.bulkPut(targetSnapshot.daily_galla_sessions);
          if (targetSnapshot.advance_orders?.length) await db.advance_orders.bulkPut(targetSnapshot.advance_orders);
          if (targetSnapshot.loan_accounts?.length) await db.loan_accounts.bulkPut(targetSnapshot.loan_accounts);
          if (targetSnapshot.wholesalers?.length) await db.wholesalers.bulkPut(targetSnapshot.wholesalers);

          const restoredProfile: ShopProfile = {
            ...(targetSnapshot.shop_profile || DEFAULT_SHOP_PROFILE),
            id: DEFAULT_SHOP_PROFILE.id,
            shop_id: targetShopId,
            business_type: targetBusinessType,
            invoice_prefix: targetBusinessType === 'HOMEMADE_FOOD' ? 'HMF' : 'KRN',
            updated_at: new Date().toISOString(),
          };
          await db.shop_profile.put(restoredProfile);
        } else {
          // Initialize fresh workspace for targetBusinessType
          await db.customers.put({ ...WALK_IN_CUSTOMER_RECORD, shop_id: targetShopId });
          const newProfile: ShopProfile = {
            ...DEFAULT_SHOP_PROFILE,
            id: DEFAULT_SHOP_PROFILE.id,
            shop_id: targetShopId,
            business_type: targetBusinessType,
            invoice_prefix: targetBusinessType === 'HOMEMADE_FOOD' ? 'HMF' : 'KRN',
            shop_name:
              targetBusinessType === 'HOMEMADE_FOOD'
                ? 'Laxmi Vatsalya Gruh Udyog (Homemade Foods)'
                : currentProfile?.shop_name?.includes('Gruh Udyog')
                ? 'Laxmi Vatsalya General Store'
                : currentProfile?.shop_name || DEFAULT_SHOP_PROFILE.shop_name,
            owner_name: currentProfile?.owner_name || DEFAULT_SHOP_PROFILE.owner_name,
            phone: currentProfile?.phone || DEFAULT_SHOP_PROFILE.phone,
            upi_vpa: currentProfile?.upi_vpa || DEFAULT_SHOP_PROFILE.upi_vpa,
            address: currentProfile?.address || DEFAULT_SHOP_PROFILE.address,
            gst_footer_note:
              targetBusinessType === 'HOMEMADE_FOOD'
                ? '100% Pure & Hygienic Homemade Konkani Delicacies! Order in advance for festivals.'
                : DEFAULT_SHOP_PROFILE.gst_footer_note,
            updated_at: new Date().toISOString(),
          };
          await db.shop_profile.put(newProfile);
        }
      }
    );

    const shouldSeed =
      options.seedCatalogIfEmpty !== false && options.autoSeedHomemadeMenu !== false;
    if (targetBusinessType === 'HOMEMADE_FOOD' && shouldSeed) {
      const count = await db.products.count();
      if (count === 0) {
        await this.seedHomemadeFoodCatalog();
      }
    }

    const activeProfile = await db.getShopProfile();
    const productCount = await db.products.count();
    return {
      ...activeProfile,
      businessType: targetBusinessType,
      activeProfile,
      productCount,
    };
  }

  /**
   * Creates an Advance Pre-Order / Festival Booking (Step 3)
   */
  static async createAdvanceOrder(params: {
    customer_id?: string | null;
    customerId?: string | null;
    customer_name?: string;
    customerName?: string;
    customer_phone?: string;
    customerPhone?: string;
    delivery_date?: string;
    deliveryDateTime?: string;
    items_json?: AdvanceOrderItem[];
    items?: AdvanceOrderItem[];
    advance_paid?: number;
    advanceTokenPaid?: number;
    payment_mode?: PaymentMode;
    paymentMode?: PaymentMode;
    order_notes?: string;
    specialInstructions?: string;
  }): Promise<AdvanceOrder> {
    const resolvedName = (params.customerName || params.customer_name || '').trim();
    if (!resolvedName) {
      throw new Error('Customer name is required for advance booking');
    }
    const rawItems = params.items || params.items_json || [];
    if (rawItems.length === 0) {
      throw new Error('At least 1 food item is required for advance booking');
    }

    const normalizedItems: AdvanceOrderItem[] = rawItems.map((it) => {
      const name = it.product_name || it.name || 'Homemade Item';
      const unit = it.unit_type || it.unit || 'PCS';
      const price = it.unit_selling_price ?? it.price ?? 0;
      const cost = it.unit_purchase_cost ?? it.cost ?? roundCurrency(price * 0.65);
      const lineTotal = roundCurrency(it.line_total ?? it.qty * price);
      return {
        product_id: it.product_id,
        name,
        product_name: name,
        qty: roundQty(it.qty),
        unit,
        unit_type: unit,
        price,
        unit_selling_price: price,
        cost,
        unit_purchase_cost: cost,
        line_total: lineTotal,
      };
    });

    const profile = await db.getShopProfile();
    const shopId = profile?.shop_id || profile?.id || 'homemade_food_shop';
    const totalAmount = roundCurrency(
      normalizedItems.reduce((sum, item) => sum + item.line_total, 0)
    );
    const rawAdvance = params.advanceTokenPaid ?? params.advance_paid ?? 0;
    const advancePaid = roundCurrency(Math.max(0, Math.min(totalAmount, rawAdvance)));
    const balanceDue = roundCurrency(Math.max(0, totalAmount - advancePaid));
    const nowIso = new Date().toISOString();
    const existingCount = await db.advance_orders.count();
    const dateDigits = nowIso.slice(0, 10).replace(/-/g, '');
    const orderNumber = `ORD-${dateDigits}-${String(existingCount + 1).padStart(3, '0')}`;
    const deliveryDateStr = params.deliveryDateTime || params.delivery_date || nowIso;
    const notesStr = (params.specialInstructions ?? params.order_notes ?? '').trim();
    const payMode = params.paymentMode || params.payment_mode || 'CASH';

    const order: AdvanceOrder = {
      id: `adv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      shop_id: shopId,
      order_number: orderNumber,
      customer_id: params.customerId || params.customer_id || null,
      customer_name: resolvedName,
      customer_phone: (params.customerPhone || params.customer_phone || '').replace(/\D/g, '').slice(-10),
      delivery_date: deliveryDateStr,
      delivery_date_time: deliveryDateStr,
      items_json: normalizedItems,
      items: normalizedItems,
      total_amount: totalAmount,
      advance_paid: advancePaid,
      advance_token_paid: advancePaid,
      balance_due: balanceDue,
      payment_mode: payMode,
      order_notes: notesStr,
      special_instructions: notesStr,
      status: 'PENDING',
      converted_invoice_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await db.advance_orders.add(order);
    return order;
  }

  static async getAllAdvanceOrders(statusFilter?: AdvanceOrderStatus | 'ALL'): Promise<AdvanceOrder[]> {
    const all = await db.advance_orders.toArray();
    const filtered =
      statusFilter && statusFilter !== 'ALL'
        ? all.filter((o) => o.status === statusFilter)
        : all;
    return filtered.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  static async updateAdvanceOrderStatus(
    orderId: string,
    status: AdvanceOrderStatus
  ): Promise<AdvanceOrder> {
    const existing = await db.advance_orders.get(orderId);
    if (!existing) throw new Error('Advance order not found');
    const updated: AdvanceOrder = {
      ...existing,
      status,
      updated_at: new Date().toISOString(),
    };
    await db.advance_orders.put(updated);
    return updated;
  }

  /**
   * Generates a 1-Click WhatsApp Order Confirmation Slip URL
   */
  static generateAdvanceOrderWhatsAppUrl(order: AdvanceOrder, shopProfile?: ShopProfile | null): string {
    const shopName = shopProfile?.shop_name || 'Gruh Udyog & Homemade Foods';
    const deliveryDateFormatted = order.delivery_date_time || order.delivery_date;
    const orderItems = order.items || order.items_json || [];

    const itemLines = orderItems
      .map((it, idx) => {
        const nm = it.product_name || it.name || 'Item';
        const un = it.unit_type || it.unit || 'PCS';
        const pr = it.unit_selling_price ?? it.price ?? 0;
        return `${idx + 1}. ${nm} — ${it.qty} ${un === 'KG_LOOSE' ? 'kg' : un.toLowerCase()} × ₹${pr} = ₹${it.line_total.toFixed(2)}`;
      })
      .join('\n');

    const advPaid = order.advance_token_paid ?? order.advance_paid ?? 0;
    const specNotes = order.special_instructions || order.order_notes || '';

    const lines = [
      `🙏 *Order Confirmation (${order.order_number}) — ${shopName}*`,
      `Customer: *${order.customer_name}*`,
      `📅 Delivery Date: *${deliveryDateFormatted}*`,
      `--------------------------------`,
      `*Ordered Items:*`,
      itemLines,
      specNotes ? `\n📝 *Special Note:* ${specNotes}` : '',
      `--------------------------------`,
      `💰 *Total Order Amount:* ₹${order.total_amount.toFixed(2)}`,
      `✅ *Advance Paid (${order.payment_mode}):* ₹${advPaid.toFixed(2)}`,
      `⏳ *Balance Due on Delivery:* ₹${order.balance_due.toFixed(2)}`,
      `--------------------------------`,
      `Thank you for your pre-order! Freshly prepared with 100% pure ingredients.`,
    ]
      .filter(Boolean)
      .join('\n');

    const cleanPhone = (order.customer_phone || '').replace(/\D/g, '').slice(-10);
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    return `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(lines)}`;
  }

  /**
   * Marks an Advance Pre-Order as Delivered & Generates Final Bill (`HMF-XXXX`)
   * Atomically deducts stock for all items, collects remaining balance, and links `converted_invoice_id`.
   */
  static async completeAdvanceOrderAndBill(
    orderId: string,
    finalPaymentMode: PaymentMode = 'CASH'
  ): Promise<{ order: AdvanceOrder; invoice: SalesInvoice; saleItems: SaleItem[] }> {
    const order = await db.advance_orders.get(orderId);
    if (!order) throw new Error('Advance order not found');
    if (order.status === 'DELIVERED_BILLED') {
      throw new Error('Advance order has already been delivered and billed');
    }

    const orderItems = order.items || order.items_json || [];
    const cartItems = [];
    for (const item of orderItems) {
      const itemName = item.product_name || item.name || 'Homemade Item';
      const itemUnit = item.unit_type || item.unit || 'PCS';
      const itemPrice = item.unit_selling_price ?? item.price ?? 0;
      const itemCost = item.unit_purchase_cost ?? item.cost;

      let product = await db.products.get(item.product_id);
      if (!product) {
        const allProds = await db.products.toArray();
        product = allProds.find((p) => p.name === itemName);
      }
      if (!product) {
        product = {
          id: item.product_id || `hmf-ondemand-${Date.now()}`,
          shop_id: order.shop_id || 'homemade_food_shop',
          name: itemName,
          short_code: 'HMF',
          barcode: '',
          category: 'Homemade Food',
          unit_type: itemUnit,
          purchase_price: itemCost ?? roundCurrency(itemPrice * 0.65),
          selling_price: itemPrice,
          mrp: itemPrice,
          current_stock: item.qty,
          low_stock_threshold: 2,
          last_supplier_name: 'In-House Fresh Kitchen Batch',
          is_quick_tap: true,
          updated_at: new Date().toISOString(),
        };
        await db.products.put(product);
      }

      cartItems.push({
        product,
        qty: roundQty(item.qty),
        unit_selling_price: roundCurrency(itemPrice),
        unit_purchase_cost: roundCurrency(itemCost ?? product.purchase_price),
        line_total: roundCurrency(item.line_total),
      });
    }

    const totalAmount = roundCurrency(order.total_amount);
    const advPaid = order.advance_token_paid ?? order.advance_paid ?? 0;
    const isUdhari = finalPaymentMode === 'UDHARI_FULL';
    const amountPaidNow = isUdhari ? roundCurrency(advPaid) : totalAmount;
    const udhariAdded = isUdhari ? roundCurrency(totalAmount - advPaid) : 0;

    const checkoutResult = await BillingService.executeCheckout({
      customerId: order.customer_id || WALK_IN_CUSTOMER_ID,
      items: cartItems,
      subtotalAmount: totalAmount,
      discountRoundoff: 0,
      paymentMode: isUdhari && advPaid > 0 ? 'SPLIT_PARTIAL' : finalPaymentMode,
      amountPaidNow,
      udhariAdded,
      notes: `Advance Order Delivery (${order.order_number} - ${order.customer_name})`,
    });

    const updatedOrder: AdvanceOrder = {
      ...order,
      status: 'DELIVERED_BILLED',
      converted_invoice_id: checkoutResult.invoice.id,
      updated_at: new Date().toISOString(),
    };
    await db.advance_orders.put(updatedOrder);

    return {
      order: updatedOrder,
      invoice: checkoutResult.invoice,
      saleItems: checkoutResult.saleItems,
    };
  }

  /**
   * Computes Capital Investment Recovery, Raw Material Costing, Operating Expenses,
   * Home & Family Expenses Paid from Business, and Product-Wise Profitability (Steps 4 & 5)
   */
  static async getCapitalAndExpenseSummary(range?: {
    startDate?: string;
    endDate?: string;
  }): Promise<CapitalAndExpenseSummary> {
    const allExpenses = await db.expenses_and_drawings.toArray();
    const allInvoices = (await db.sales_invoices.toArray()).filter((inv) => inv.status === 'COMPLETED');
    const allSaleItems = await db.sale_items.toArray();
    const allProducts = await db.products.toArray();
    const productMap = new Map<string, Product>(allProducts.map((p) => [p.id, p]));

    const inRange = (isoDate: string) => {
      if (!range) return true;
      const d = isoDate.slice(0, 10);
      if (range.startDate && d < range.startDate) return false;
      if (range.endDate && d > range.endDate) return false;
      return true;
    };

    const classifyExpense = (e: { entry_type?: string; category: string }) => {
      if (e.entry_type) return e.entry_type;
      if (e.category === 'INITIAL_INVESTMENT_SETUP') return 'INITIAL_INVESTMENT';
      if (e.category === 'RAW_MATERIAL_INGREDIENTS') return 'RAW_MATERIAL_EXPENSE';
      if (
        e.category === 'HOME_FAMILY_EXPENSE' ||
        e.category === 'HOME_SELF_USE_GOODS' ||
        e.category === 'OWNER_CASH_DRAWING'
      ) {
        return 'HOME_FAMILY_EXPENSE';
      }
      return 'BUSINESS_EXPENSE';
    };

    // All-time cumulative initial investment & all-time true net profit for Capital Recovery Card
    let totalInitialInvestmentAllTime = 0;
    let allTimeRawMaterialExp = 0;
    let allTimeOperatingExp = 0;

    for (const exp of allExpenses) {
      const eType = classifyExpense(exp);
      if (eType === 'INITIAL_INVESTMENT') {
        totalInitialInvestmentAllTime += exp.amount;
      } else if (eType === 'RAW_MATERIAL_EXPENSE') {
        allTimeRawMaterialExp += exp.amount;
      } else if (eType === 'BUSINESS_EXPENSE') {
        allTimeOperatingExp += exp.amount;
      }
    }

    const allTimeSalesRevenue = allInvoices.reduce((s, inv) => s + inv.grand_total, 0);
    const allTimeCogs = allInvoices.reduce((s, inv) => s + inv.total_cogs, 0);
    // When explicit RAW_MATERIAL_EXPENSE is tracked, True Business Net Profit = Sales - (Raw Material Expenses + Operating Expenses)
    const allTimeMaterialDeduction =
      allTimeRawMaterialExp > 0 ? allTimeRawMaterialExp : allTimeCogs;
    const cumulativeTrueNetProfit = roundCurrency(
      allTimeSalesRevenue - allTimeMaterialDeduction - allTimeOperatingExp
    );

    totalInitialInvestmentAllTime = roundCurrency(totalInitialInvestmentAllTime);
    const capitalRecoveredPct =
      totalInitialInvestmentAllTime > 0
        ? roundCurrency(
            Math.min(100, Math.max(0, (Math.max(0, cumulativeTrueNetProfit) / totalInitialInvestmentAllTime) * 100))
          )
        : 100;
    const remainingToBreakEven = roundCurrency(
      Math.max(0, totalInitialInvestmentAllTime - Math.max(0, cumulativeTrueNetProfit))
    );
    const netProfitAfterCapitalPayback = roundCurrency(
      cumulativeTrueNetProfit - totalInitialInvestmentAllTime
    );

    // Period-filtered metrics
    const periodInvoices = allInvoices.filter((inv) => inRange(inv.created_at));
    const periodInvoiceIds = new Set(periodInvoices.map((inv) => inv.id));
    const periodExpenses = allExpenses.filter((exp) => inRange(exp.created_at));

    let periodInitialInvestment = 0;
    let periodRawMaterialExpenses = 0;
    let periodOperatingExpenses = 0;
    let periodHomeFamilyExpenses = 0;

    for (const exp of periodExpenses) {
      const eType = classifyExpense(exp);
      if (eType === 'INITIAL_INVESTMENT') periodInitialInvestment += exp.amount;
      else if (eType === 'RAW_MATERIAL_EXPENSE') periodRawMaterialExpenses += exp.amount;
      else if (eType === 'HOME_FAMILY_EXPENSE') periodHomeFamilyExpenses += exp.amount;
      else periodOperatingExpenses += exp.amount;
    }

    periodInitialInvestment = roundCurrency(periodInitialInvestment);
    periodRawMaterialExpenses = roundCurrency(periodRawMaterialExpenses);
    periodOperatingExpenses = roundCurrency(periodOperatingExpenses);
    periodHomeFamilyExpenses = roundCurrency(periodHomeFamilyExpenses);

    const totalSalesRevenue = roundCurrency(
      periodInvoices.reduce((s, inv) => s + inv.grand_total, 0)
    );
    const totalItemMakingCostCogs = roundCurrency(
      periodInvoices.reduce((s, inv) => s + inv.total_cogs, 0)
    );
    const grossProfitFromSales = roundCurrency(totalSalesRevenue - totalItemMakingCostCogs);
    const periodMaterialDeduction =
      periodRawMaterialExpenses > 0 ? periodRawMaterialExpenses : totalItemMakingCostCogs;
    const trueBusinessNetProfit = roundCurrency(
      totalSalesRevenue - periodMaterialDeduction - periodOperatingExpenses
    );
    const netRetainedCashSavings = roundCurrency(
      trueBusinessNetProfit - periodHomeFamilyExpenses
    );

    // Item-wise profitability breakdown
    const itemStatsMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        marathiName?: string;
        category: string;
        unitType: UnitType;
        qtySold: number;
        totalRevenue: number;
        estMakingCost: number;
      }
    >();

    for (const item of allSaleItems) {
      if (!periodInvoiceIds.has(item.invoice_id)) continue;
      const prod = productMap.get(item.product_id);
      const existing = itemStatsMap.get(item.product_id) || {
        productId: item.product_id,
        productName: prod?.name || item.product_name_snapshot,
        marathiName: prod?.marathi_name,
        category: prod?.category || 'Homemade Food',
        unitType: prod?.unit_type || 'PCS',
        qtySold: 0,
        totalRevenue: 0,
        estMakingCost: 0,
      };
      existing.qtySold = roundQty(existing.qtySold + item.qty);
      existing.totalRevenue = roundCurrency(existing.totalRevenue + item.line_total);
      existing.estMakingCost = roundCurrency(
        existing.estMakingCost + item.qty * item.unit_purchase_cost
      );
      itemStatsMap.set(item.product_id, existing);
    }

    const itemWiseProfitability = Array.from(itemStatsMap.values())
      .map((row) => {
        const grossProfit = roundCurrency(row.totalRevenue - row.estMakingCost);
        const profitMarginPct =
          row.totalRevenue > 0 ? roundCurrency((grossProfit / row.totalRevenue) * 100) : 0;
        return {
          ...row,
          estimatedMakingCost: row.estMakingCost,
          grossProfit,
          profitMarginPct,
          marginPct: profitMarginPct,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      totalInitialInvestmentAllTime,
      cumulativeTrueNetProfit,
      capitalRecoveredPct,
      remainingToBreakEven,
      netProfitAfterCapitalPayback,
      periodInitialInvestment,
      periodRawMaterialExpenses,
      periodOperatingExpenses,
      periodHomeFamilyExpenses,
      periodSalesRevenue: totalSalesRevenue,
      periodEstimatedCOGS: totalItemMakingCostCogs,
      totalSalesRevenue,
      totalItemMakingCostCogs,
      grossProfitFromSales,
      trueBusinessNetProfit,
      netRetainedCashSavings,
      itemWiseProfitability,
      periodExpenses,
    };
  }
}
