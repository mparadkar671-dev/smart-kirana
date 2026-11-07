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
  BusinessWorkspaceRecord,
} from '../types';
import { DEFAULT_SHOP_PROFILE } from '../db/seed';
import { generateUniqueStoreBarcode } from '../utils/barcodeGenerator';
import { roundCurrency, roundQty } from '../utils/math';
import { BillingService } from './billingService';
import { cloudSyncService } from './cloudSyncService';
import {
  resolveProductBusinessType,
  getHomemadeShopIdForOwner,
  getBaseKiranaShopId,
  getHomemadeShopId,
  getActiveShopId,
  isHomemadeShopId,
  HOMEMADE_CATEGORIES,
  HOMEMADE_NAME_KEYWORDS,
  KIRANA_CATEGORIES,
} from '../utils/businessFirewall';

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
 * Authentic Konkani / Maharashtrian Homemade Food (Gruh Udyog) Catalog:
 * Exactly the 8 authentic home products requested:
 * 1. घावणे (Ghavane)
 * 2. चपाती (Chapati)
 * 3. आंबोळी (Amboli)
 * 4. मोदक (Ukadiche Modak)
 * 5. तांदळाचे लाडू (Tandlache Ladu)
 * 6. खोबऱ्याची वडी (Khobryachi Vadi)
 * 7. कांदे पोहे - घरगुती (Kande Pohe Homemade)
 * 8. उपमा - घरगुती (Upma Homemade)
 */
export const EXACT_8_HOMEMADE_FOOD_CATALOG: HomemadeStarterItem[] = [
  {
    marathiName: 'घावणे',
    englishName: 'Ghavane',
    shortCode: 'GHV',
    category: 'Konkani Breakfast & Tiffin',
    unitType: 'PLATE',
    sellingPrice: 35,
    makingCost: 18,
    mrp: 40,
    initialBatchQty: 30,
    lowStockThreshold: 5,
    searchKeywords: 'ghavane, malvani ghavane, घावणे, breakfast',
    emoji: '🥞',
  },
  {
    marathiName: 'चपाती',
    englishName: 'Chapati',
    shortCode: 'CHP',
    category: 'Fresh Bhakri & Chapati',
    unitType: 'PCS',
    sellingPrice: 10,
    makingCost: 5.5,
    mrp: 12,
    initialBatchQty: 60,
    lowStockThreshold: 10,
    searchKeywords: 'chapati, poli, चपाती, पोळी, homemade chapati',
    emoji: '🫓',
  },
  {
    marathiName: 'आंबोळी',
    englishName: 'Amboli',
    shortCode: 'AMB',
    category: 'Konkani Breakfast & Tiffin',
    unitType: 'PLATE',
    sellingPrice: 40,
    makingCost: 20,
    mrp: 45,
    initialBatchQty: 25,
    lowStockThreshold: 5,
    searchKeywords: 'amboli, amaboli, आंबोळी, konkani amboli',
    emoji: '🥞',
  },
  {
    marathiName: 'मोदक',
    englishName: 'Ukadiche Modak',
    shortCode: 'UMD',
    category: 'Modak & Festive Specials',
    unitType: 'PCS',
    sellingPrice: 25,
    makingCost: 14,
    mrp: 30,
    initialBatchQty: 40,
    lowStockThreshold: 5,
    searchKeywords: 'modak, ukadiche modak, मोदक, उकडीचे मोदक, ganpati modak',
    emoji: '🥟',
  },
  {
    marathiName: 'तांदळाचे लाडू',
    englishName: 'Tandlache Ladu',
    shortCode: 'TLD',
    category: 'Homemade Laddus & Vadi',
    unitType: 'KG_LOOSE',
    sellingPrice: 380,
    makingCost: 260,
    mrp: 420,
    initialBatchQty: 5,
    lowStockThreshold: 1,
    searchKeywords: 'ladu, laddu, tandlache ladu, तांदळाचे लाडू, कोकणी लाडू, TLD1',
    emoji: '🟡',
  },
  {
    marathiName: 'खोबऱ्याची वडी',
    englishName: 'Khobryachi Vadi',
    shortCode: 'KHK',
    category: 'Homemade Laddus & Vadi',
    unitType: 'KG_LOOSE',
    sellingPrice: 460,
    makingCost: 310,
    mrp: 500,
    initialBatchQty: 5,
    lowStockThreshold: 1,
    searchKeywords: 'khobryachi vadi, kapa, khobryachi kapa, खोबऱ्याची वडी, खोबऱ्याच्या कापा, naralachi vadi, KBV1',
    emoji: '🥥',
  },
  {
    marathiName: 'कांदे पोहे - घरगुती',
    englishName: 'Kande Pohe Homemade',
    shortCode: 'KPH',
    category: 'Konkani Breakfast & Tiffin',
    unitType: 'PLATE',
    sellingPrice: 30,
    makingCost: 15,
    mrp: 35,
    initialBatchQty: 25,
    lowStockThreshold: 5,
    searchKeywords: 'kande pohe, pohe homemade, कांदे पोहे, घरगुती पोहे, breakfast',
    emoji: '🥣',
  },
  {
    marathiName: 'उपमा - घरगुती',
    englishName: 'Upma Homemade',
    shortCode: 'UPM',
    category: 'Konkani Breakfast & Tiffin',
    unitType: 'PLATE',
    sellingPrice: 30,
    makingCost: 15,
    mrp: 35,
    initialBatchQty: 25,
    lowStockThreshold: 5,
    searchKeywords: 'upma homemade, sanja, उपमा, घरगुती उपमा, breakfast',
    emoji: '🥣',
  },
];

export const HOMEMADE_FOOD_STARTER_CATALOG = EXACT_8_HOMEMADE_FOOD_CATALOG;

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

/**
 * Detects whether a product belongs to Homemade Food / Gruh Udyog based on name, Marathi name, or category
 */
export function isHomemadeFoodCategoryOrName(item: {
  name?: string;
  marathi_name?: string;
  category?: string;
  business_type?: string | null;
}): boolean {
  return resolveProductBusinessType(item) === 'HOMEMADE_FOOD';
}

/**
 * Deterministic cleanup pass over db.products to ensure every product is tagged with its correct business_type
 */
export async function repairMixedBusinessProducts(): Promise<{
  repairedCount: number;
  homemadeCount: number;
  kiranaCount: number;
}> {
  const allProducts = await db.products.toArray();
  let repairedCount = 0;
  let homemadeCount = 0;
  let kiranaCount = 0;

  const updates: Product[] = [];
  const primaryKiranaShopId = getBaseKiranaShopId();
  const hmfShopId = getHomemadeShopId(primaryKiranaShopId);

  for (const prod of allProducts) {
    const expectedType: BusinessType = resolveProductBusinessType(prod);
    let changed = false;

    if (prod.business_type !== expectedType) {
      prod.business_type = expectedType;
      changed = true;
    }

    if (expectedType === 'HOMEMADE_FOOD') {
      if (!prod.shop_id || !isHomemadeShopId(prod.shop_id)) {
        prod.shop_id = hmfShopId;
        changed = true;
      }
      homemadeCount++;
    } else {
      if (!prod.shop_id || isHomemadeShopId(prod.shop_id)) {
        prod.shop_id = primaryKiranaShopId;
        changed = true;
      }
      kiranaCount++;
    }

    if (changed) {
      updates.push(prod);
      repairedCount++;
    }
  }

  if (updates.length > 0) {
    await db.products.bulkPut(updates);
    try {
      for (const p of updates) {
        await cloudSyncService.syncProduct(p);
      }
    } catch {
      // Ignore in offline/test
    }
  }

  return { repairedCount, homemadeCount, kiranaCount };
}

// In-memory + localStorage workspace snapshots for instantaneous 0ms multi-business switching
const inMemoryWorkspaces: Record<string, any> = {};

function getWorkspaceStorageKey(businessType: BusinessType): string {
  return `kirana_biz_workspace_${businessType}`;
}

export class HomemadeFoodService {
  /**
   * Scans all products and repairs/reassigns business_type based on categories and keywords.
   */
  static async repairMixedBusinessProducts(): Promise<{
    repairedCount: number;
    homemadeCount: number;
    kiranaCount: number;
  }> {
    return repairMixedBusinessProducts();
  }

  /**
   * Resets in-memory workspace snapshots (used when wiping records or between isolated tests)
   */
  static async resetWorkspaceSnapshots(): Promise<void> {
    for (const key of Object.keys(inMemoryWorkspaces)) {
      delete inMemoryWorkspaces[key];
    }
    try {
      await db.business_workspaces.clear();
    } catch {
      // Ignore if table not yet initialized
    }
  }

  /**
   * Purges any old or corrupted homemade food products from the primary Kirana store
   */
  static async purgeCorruptedHomemadeFromKirana(kiranaShopId?: string): Promise<number> {
    const primaryId =
      kiranaShopId ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_primary_shop_id') : null) ||
      'current_shop';
    const allProducts = await db.products.toArray();
    const toDelete: string[] = [];

    for (const p of allProducts) {
      if (p.shop_id === primaryId) {
        const isHmf =
          p.business_type === 'HOMEMADE_FOOD' ||
          HOMEMADE_CATEGORIES.has(p.category || '') ||
          HOMEMADE_NAME_KEYWORDS.some((kw) => `${p.name} ${p.marathi_name || ''}`.toLowerCase().includes(kw));
        const isKirana = KIRANA_CATEGORIES.has(p.category || '');
        if (isHmf && !isKirana) {
          toDelete.push(p.id);
        }
      }
    }

    if (toDelete.length > 0) {
      await db.products.bulkDelete(toDelete);
      try {
        const { supabase } = await import('../lib/supabase');
        if (supabase) {
          await supabase.from('products').delete().eq('shop_id', primaryId).in('id', toDelete);
        }
      } catch {}
    }
    return toDelete.length;
  }

  /**
   * Complete multi-tenant store reset:
   * 1. Purges mixed homemade items from kiranaShopId
   * 2. Clears old products from homemadeShopId
   * 3. Ensures both shop_profiles exist with KRN and HMF prefixes
   * 4. Seeds ONLY the user's exact 8-Product authentic catalog under homemadeShopId
   */
  static async cleanPurgeAndSeedHomemadeStore(
    kiranaShopId?: string,
    homemadeShopId?: string
  ): Promise<{
    purgedFromKirana: number;
    seededCount: number;
  }> {
    const primaryId = getBaseKiranaShopId(
      kiranaShopId ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_base_shop_id') || localStorage.getItem('kirana_primary_shop_id') : null) ||
      'current_shop'
    );
    const hmfId = homemadeShopId || getHomemadeShopId(primaryId);

    // 1. Purge corrupted homemade products from kiranaShopId
    const purgedFromKirana = await this.purgeCorruptedHomemadeFromKirana(primaryId);

    // 2. Clear old products under homemadeShopId
    const oldHmf = await db.products.filter((p) => p.shop_id === hmfId).toArray();
    if (oldHmf.length > 0) {
      await db.products.bulkDelete(oldHmf.map((p) => p.id));
      try {
        const { supabase } = await import('../lib/supabase');
        if (supabase) {
          await supabase.from('products').delete().eq('shop_id', hmfId);
        }
      } catch {}
    }

    // 3. Ensure dual shop profiles exist in db.shop_profile
    const nowIso = new Date().toISOString();
    const existingKirana = await db.shop_profile.get(primaryId);
    if (!existingKirana) {
      await db.shop_profile.put({
        ...DEFAULT_SHOP_PROFILE,
        id: primaryId,
        shop_id: primaryId,
        business_type: 'KIRANA_RETAIL',
        invoice_prefix: 'KRN',
        updated_at: nowIso,
      });
    }

    const existingHmf = await db.shop_profile.get(hmfId);
    if (!existingHmf) {
      await db.shop_profile.put({
        ...DEFAULT_SHOP_PROFILE,
        id: hmfId,
        shop_id: hmfId,
        shop_name: 'Laxmi Vatsalya Gruh Udyog (Homemade Foods)',
        business_type: 'HOMEMADE_FOOD',
        invoice_prefix: 'HMF',
        updated_at: nowIso,
      });
    }

    // 4. Seed strictly the 8 authentic Homemade Food products matching Supabase barcodes
    const productsToPut: Product[] = [];
    const logsToPut: InventoryLog[] = [];
    const existingBarcodes = new Set((await db.products.toArray()).map((p) => p.barcode).filter(Boolean));
    const canonicalBarcodes = [
      '2009000000018',
      '2009000000025',
      '2009000000032',
      '2009000000049',
      '2009000000056',
      '2009000000063',
      '2009000000070',
      '2009000000087',
    ];

    EXACT_8_HOMEMADE_FOOD_CATALOG.forEach((item, idx) => {
      const id = `hmf-prod-${String(idx + 1).padStart(3, '0')}`;
      const barcode = canonicalBarcodes[idx] || generateUniqueStoreBarcode(existingBarcodes);
      existingBarcodes.add(barcode);

      const prod: Product = {
        id,
        shop_id: hmfId,
        business_type: 'HOMEMADE_FOOD',
        name: `${item.marathiName} (${item.englishName})`,
        marathi_name: item.marathiName,
        search_keywords: item.searchKeywords,
        short_code: item.shortCode,
        barcode,
        category: item.category,
        unit_type: item.unitType,
        purchase_price: item.makingCost,
        selling_price: item.sellingPrice,
        mrp: item.mrp,
        current_stock: item.initialBatchQty,
        low_stock_threshold: item.lowStockThreshold,
        last_supplier_name: 'In-House Fresh Kitchen Batch',
        wholesaler_id: null,
        loan_account_id: null,
        image_url: generateHomemadeFoodThumbnail({
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
      logsToPut.push({
        id: `hmf-init-log-${id}`,
        shop_id: hmfId,
        business_type: 'HOMEMADE_FOOD',
        product_id: id,
        change_qty: prod.current_stock,
        reason_type: 'BATCH_MADE_IN',
        unit_cost_at_time: prod.purchase_price,
        reference_id: null,
        notes: 'Initial authentic fresh batch stock',
        created_at: nowIso,
      });
    });

    await db.transaction('rw', [db.products, db.inventory_logs], async () => {
      await db.products.bulkPut(productsToPut);
      if (logsToPut.length > 0) {
        await db.inventory_logs.bulkPut(logsToPut);
      }
    });

    try {
      for (const p of productsToPut) {
        await cloudSyncService.syncProduct(p);
      }
    } catch {}

    return {
      purgedFromKirana,
      seededCount: productsToPut.length,
    };
  }

  /**
   * Seeds the authentic Homemade Konkani/Maharashtrian Food Menu items into the active store
   */
  static async seedHomemadeFoodCatalog(): Promise<{
    importedCount: number;
    seededCount: number;
    totalProducts: number;
    totalHomemadeCount: number;
  }> {
    const profile = await db.getShopProfile();
    const primaryId = getBaseKiranaShopId(
      (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_base_shop_id') || localStorage.getItem('kirana_primary_shop_id') : null) ||
      profile?.shop_id ||
      'current_shop'
    );
    const shopId = profile?.business_type === 'HOMEMADE_FOOD'
      ? (profile?.shop_id || getHomemadeShopId(primaryId))
      : getHomemadeShopId(primaryId);

    const res = await this.cleanPurgeAndSeedHomemadeStore(primaryId, shopId);
    const totalProducts = await db.products.count();
    return {
      importedCount: res.seededCount,
      seededCount: res.seededCount,
      totalProducts,
      totalHomemadeCount: res.seededCount,
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

    // 1. Save current business snapshot before switching to IndexedDB (unlimited quota) + inMemory
    const currentProducts = (await db.products.toArray()).filter(
      (p) => resolveProductBusinessType(p) === currentBusinessType
    );
    const currentSnapshot: BusinessWorkspaceRecord = {
      business_type: currentBusinessType,
      shop_profile: currentProfile || DEFAULT_SHOP_PROFILE,
      products: currentProducts,
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
      updated_at: new Date().toISOString(),
    };

    const currentKey = getWorkspaceStorageKey(currentBusinessType);
    inMemoryWorkspaces[currentKey] = currentSnapshot;
    try {
      await db.business_workspaces.put(currentSnapshot);
    } catch (e) {
      console.warn('Failed to save workspace snapshot to IndexedDB:', e);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(currentKey, JSON.stringify({ business_type: currentBusinessType, saved: true }));
      }
    } catch {
      // Ignore
    }

    // 2. Load target business snapshot from IndexedDB first, then inMemory
    const targetKey = getWorkspaceStorageKey(targetBusinessType);
    let targetSnapshot = await db.business_workspaces.get(targetBusinessType);
    if (!targetSnapshot && inMemoryWorkspaces[targetKey]) {
      targetSnapshot = inMemoryWorkspaces[targetKey];
    }

    const primaryKiranaShopId = getBaseKiranaShopId(
      (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_base_shop_id') || localStorage.getItem('kirana_primary_shop_id') : null) ||
      (currentProfile?.shop_id && !isHomemadeShopId(currentProfile.shop_id) ? currentProfile.shop_id : 'current_shop')
    );
    const homemadeShopId = getHomemadeShopId(primaryKiranaShopId);
    const targetShopId = targetBusinessType === 'HOMEMADE_FOOD' ? homemadeShopId : primaryKiranaShopId;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('kirana_base_shop_id', primaryKiranaShopId);
      localStorage.setItem('kirana_primary_shop_id', primaryKiranaShopId);
      localStorage.setItem('kirana_homemade_shop_id', homemadeShopId);
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
          if (targetSnapshot.products?.length) {
            const cleanTargetProds = targetSnapshot.products.filter(
              (p) => resolveProductBusinessType(p) === targetBusinessType
            );
            if (cleanTargetProds.length) await db.products.bulkPut(cleanTargetProds);
          }
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
            id: targetShopId,
            shop_id: targetShopId,
            business_type: targetBusinessType,
            invoice_prefix: targetBusinessType === 'HOMEMADE_FOOD' ? 'HMF' : 'KRN',
            updated_at: new Date().toISOString(),
          };
          await db.shop_profile.put(restoredProfile);
          await db.shop_profile.put({ ...restoredProfile, id: DEFAULT_SHOP_PROFILE.id });
        } else {
          // Initialize fresh workspace for targetBusinessType
          await db.customers.put({ ...WALK_IN_CUSTOMER_RECORD, shop_id: targetShopId });
          const newProfile: ShopProfile = {
            ...DEFAULT_SHOP_PROFILE,
            id: targetShopId,
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
          await db.shop_profile.put({ ...newProfile, id: DEFAULT_SHOP_PROFILE.id });
        }
      }
    );

    const shouldSeed =
      options.seedCatalogIfEmpty !== false && options.autoSeedHomemadeMenu !== false;
    if (targetBusinessType === 'HOMEMADE_FOOD' && shouldSeed) {
      const count = await db.products.count();
      if (count === 0) {
        await this.cleanPurgeAndSeedHomemadeStore(primaryKiranaShopId, targetShopId);
      }
    } else if (targetBusinessType === 'KIRANA_RETAIL') {
      await this.purgeCorruptedHomemadeFromKirana(primaryKiranaShopId);
    }

    await repairMixedBusinessProducts();

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
