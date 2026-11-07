import { db } from '../db/db';
import { Product, BusinessType, InventoryLog } from '../types';
import {
  HOMEMADE_CATEGORIES,
  HOMEMADE_NAME_KEYWORDS,
  KIRANA_CATEGORIES,
  resolveProductBusinessType,
} from '../utils/businessFirewall';

export const HMF_SHOP_ID_SUFFIX = '-484d-4600-000000000001';

/**
 * Standard 8 Authentic Konkani / Maharashtrian Homemade Food Catalog
 */
export const STANDARD_8_HOMEMADE_FOOD_CATALOG = [
  {
    name: 'घावणे (Malvani Ghavane)',
    marathiName: 'घावणे',
    englishName: 'Malvani Ghavane',
    shortCode: 'GHV1',
    barcode: '2009000000018',
    category: 'Konkani Breakfast & Tiffin',
    unitType: 'PLATE' as const,
    purchasePrice: 18,
    sellingPrice: 35,
    mrp: 40,
    currentStock: 30,
    lowStockThreshold: 5,
    searchKeywords: 'ghavane, malvani ghavane, घावणे, breakfast, GHV',
    emoji: '🥞',
  },
  {
    name: 'घरगुती चपाती (Homemade Chapati)',
    marathiName: 'घरगुती चपाती',
    englishName: 'Homemade Chapati',
    shortCode: 'CHP1',
    barcode: '2009000000025',
    category: 'Fresh Bhakri & Chapati',
    unitType: 'PCS' as const,
    purchasePrice: 5.5,
    sellingPrice: 10,
    mrp: 12,
    currentStock: 60,
    lowStockThreshold: 10,
    searchKeywords: 'chapati, poli, चपाती, पोळी, homemade chapati, CHP',
    emoji: '🫓',
  },
  {
    name: 'आंबोळी (Soft Konkani Amboli)',
    marathiName: 'आंबोळी',
    englishName: 'Soft Konkani Amboli',
    shortCode: 'AMB1',
    barcode: '2009000000032',
    category: 'Konkani Breakfast & Tiffin',
    unitType: 'PLATE' as const,
    purchasePrice: 20,
    sellingPrice: 40,
    mrp: 45,
    currentStock: 25,
    lowStockThreshold: 5,
    searchKeywords: 'amboli, amaboli, आंबोळी, konkani amboli, AMB',
    emoji: '🥞',
  },
  {
    name: 'उकडीचे मोदक (Homemade Modak)',
    marathiName: 'उकडीचे मोदक',
    englishName: 'Homemade Modak',
    shortCode: 'MDK1',
    barcode: '2009000000049',
    category: 'Modak & Festive Specials',
    unitType: 'PCS' as const,
    purchasePrice: 14,
    sellingPrice: 25,
    mrp: 30,
    currentStock: 40,
    lowStockThreshold: 10,
    searchKeywords: 'modak, ukadiche modak, मोदक, उकडीचे मोदक, ganpati modak, UMD',
    emoji: '🥟',
  },
  {
    name: 'तांदळाचे लाडू (Tandlache Ladu)',
    marathiName: 'तांदळाचे लाडू',
    englishName: 'Tandlache Ladu',
    shortCode: 'TLD1',
    barcode: '2009000000056',
    category: 'Homemade Laddus & Vadi',
    unitType: 'KG_LOOSE' as const,
    purchasePrice: 260,
    sellingPrice: 380,
    mrp: 420,
    currentStock: 5,
    lowStockThreshold: 1,
    searchKeywords: 'ladu, laddu, tandlache ladu, तांदळाचे लाडू, कोकणी लाडू, TLD',
    emoji: '🟡',
  },
  {
    name: 'खोबऱ्याची वडी (Khobryachi Vadi / Kapa)',
    marathiName: 'खोबऱ्याची वडी',
    englishName: 'Khobryachi Vadi / Kapa',
    shortCode: 'KBV1',
    barcode: '2009000000063',
    category: 'Homemade Laddus & Vadi',
    unitType: 'KG_LOOSE' as const,
    purchasePrice: 310,
    sellingPrice: 460,
    mrp: 500,
    currentStock: 5,
    lowStockThreshold: 1,
    searchKeywords: 'khobryachi vadi, kapa, khobryachi kapa, खोबऱ्याची वडी, खोबऱ्याच्या कापा, naralachi vadi, KHK',
    emoji: '🥥',
  },
  {
    name: 'कांदे पोहे - घरगुती (Kande Pohe Homemade)',
    marathiName: 'कांदे पोहे - घरगुती',
    englishName: 'Kande Pohe Homemade',
    shortCode: 'KPH1',
    barcode: '2009000000070',
    category: 'Konkani Breakfast & Tiffin',
    unitType: 'PLATE' as const,
    purchasePrice: 15,
    sellingPrice: 30,
    mrp: 35,
    currentStock: 25,
    lowStockThreshold: 5,
    searchKeywords: 'kande pohe, pohe homemade, कांदे पोहे, घरगुती पोहे, breakfast, KPH',
    emoji: '🥣',
  },
  {
    name: 'उपमा - घरगुती (Upma Homemade)',
    marathiName: 'उपमा - घरगुती',
    englishName: 'Upma Homemade',
    shortCode: 'UPM1',
    barcode: '2009000000087',
    category: 'Konkani Breakfast & Tiffin',
    unitType: 'PLATE' as const,
    purchasePrice: 15,
    sellingPrice: 30,
    mrp: 35,
    currentStock: 25,
    lowStockThreshold: 5,
    searchKeywords: 'upma homemade, sanja, उपमा, घरगुती उपमा, breakfast, UPM',
    emoji: '🥣',
  },
];

/**
 * Resolves the primary Kirana store shop_id
 */
export function getBaseKiranaShopId(shopId?: string | null): string {
  if (typeof localStorage !== 'undefined') {
    const savedBase =
      localStorage.getItem('kirana_base_shop_id') ||
      localStorage.getItem('kirana_primary_shop_id') ||
      localStorage.getItem('kirana_active_shop_id');
    if (savedBase && !savedBase.endsWith(HMF_SHOP_ID_SUFFIX) && !savedBase.endsWith('_hmf')) return savedBase;
  }
  if (!shopId) return 'current_shop';
  if (shopId.endsWith(HMF_SHOP_ID_SUFFIX)) {
    const stripped = shopId.replace(new RegExp(`${HMF_SHOP_ID_SUFFIX}$`), '');
    return stripped || 'current_shop';
  }
  if (shopId.endsWith('_hmf')) {
    return shopId.slice(0, -4) || 'current_shop';
  }
  return shopId;
}

/**
 * Deterministically computes the secondary Homemade Food store UUID
 */
export function getHomemadeShopId(kiranaShopId?: string | null): string {
  const cleanBase = getBaseKiranaShopId(kiranaShopId);
  return `${cleanBase.substring(0, 18)}${HMF_SHOP_ID_SUFFIX}`;
}

/**
 * Alias for backward compatibility
 */
export function getHomemadeShopIdForOwner(kiranaShopId: string): string {
  return getHomemadeShopId(kiranaShopId);
}

/**
 * Checks if a given shop_id represents the Homemade Food business tenant
 */
export function isHomemadeShopId(shopId?: string | null): boolean {
  if (!shopId) return false;
  const s = shopId.toLowerCase();
  if (
    s.endsWith(HMF_SHOP_ID_SUFFIX) ||
    s.endsWith('_hmf') ||
    s === 'homemade_food_shop'
  ) {
    return true;
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('kirana_homemade_shop_id');
    if (stored && s === stored.toLowerCase() && stored.toLowerCase() !== 'current_shop') return true;
  }
  return false;
}

/**
 * Gets the active business type from localStorage or defaults to KIRANA_RETAIL
 */
export function getActiveBusinessType(): BusinessType {
  if (typeof localStorage !== 'undefined') {
    const biz = localStorage.getItem('kirana_active_business_type');
    if (biz === 'HOMEMADE_FOOD') return 'HOMEMADE_FOOD';
  }
  return 'KIRANA_RETAIL';
}

/**
 * Centralized active shop_id resolver strictly following the active business type
 */
export function getActiveShopId(activeBusinessType?: BusinessType): string {
  const biz = activeBusinessType || getActiveBusinessType();
  const primary = getBaseKiranaShopId();
  if (biz === 'HOMEMADE_FOOD') {
    return getHomemadeShopId(primary);
  }
  return primary;
}

/**
 * Sets the active shop_id and business type in localStorage
 */
export function setActiveShopId(shopId: string, businessType?: BusinessType): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('kirana_active_shop_id', shopId);
    if (businessType) {
      localStorage.setItem('kirana_active_business_type', businessType);
    } else {
      localStorage.setItem('kirana_active_business_type', isHomemadeShopId(shopId) ? 'HOMEMADE_FOOD' : 'KIRANA_RETAIL');
    }
  }
}

/**
 * Ensures strict catalog separation between Kirana and Homemade Food stores:
 * 1. Purges any Homemade items found under kiranaShopId
 * 2. Purges any Kirana items found under homemadeShopId
 * 3. Seeds the exact 8 authentic Homemade Food items if homemadeShopId has 0 products
 */
export async function ensureCatalogSeparationAndSeed(options?: {
  forceSeedHomemade?: boolean;
}): Promise<{
  purgedFromKirana: number;
  purgedFromHomemade: number;
  seededHomemadeCount: number;
}> {
  const primaryKiranaShopId = getBaseKiranaShopId();
  const homemadeShopId = getHomemadeShopId(primaryKiranaShopId);
  const allProducts = await db.products.toArray();

  const toDeleteFromKirana: string[] = [];
  const toDeleteFromHomemade: string[] = [];

  for (const p of allProducts) {
    const resolvedType = resolveProductBusinessType(p);
    const pShopId = p.shop_id || 'current_shop';

    if (pShopId === primaryKiranaShopId || (!isHomemadeShopId(pShopId) && pShopId !== homemadeShopId)) {
      // Should only contain Kirana products
      if (resolvedType === 'HOMEMADE_FOOD' || isHomemadeShopId(p.shop_id)) {
        toDeleteFromKirana.push(p.id);
      }
    } else if (pShopId === homemadeShopId || isHomemadeShopId(pShopId)) {
      // Should only contain Homemade food products
      if (resolvedType === 'KIRANA_RETAIL') {
        toDeleteFromHomemade.push(p.id);
      }
    }
  }

  if (toDeleteFromKirana.length > 0) {
    await db.products.bulkDelete(toDeleteFromKirana);
  }
  if (toDeleteFromHomemade.length > 0) {
    await db.products.bulkDelete(toDeleteFromHomemade);
  }

  // Count remaining products in homemadeShopId
  const remainingHomemadeCount = (await db.products.toArray()).filter(
    (p) => p.shop_id === homemadeShopId || (isHomemadeShopId(p.shop_id) && resolveProductBusinessType(p) === 'HOMEMADE_FOOD')
  ).length;

  let seededHomemadeCount = 0;
  if (remainingHomemadeCount === 0 || options?.forceSeedHomemade) {
    const nowIso = new Date().toISOString();
    const productsToSeed: Product[] = [];
    const logsToSeed: InventoryLog[] = [];

    STANDARD_8_HOMEMADE_FOOD_CATALOG.forEach((item, idx) => {
      const id = `hmf-prod-${String(idx + 1).padStart(3, '0')}`;
      const prod: Product = {
        id,
        shop_id: homemadeShopId,
        business_type: 'HOMEMADE_FOOD',
        name: item.name,
        marathi_name: item.marathiName,
        search_keywords: item.searchKeywords,
        short_code: item.shortCode,
        barcode: item.barcode,
        category: item.category,
        unit_type: item.unitType,
        purchase_price: item.purchasePrice,
        selling_price: item.sellingPrice,
        mrp: item.mrp,
        current_stock: item.currentStock,
        low_stock_threshold: item.lowStockThreshold,
        last_supplier_name: 'In-House Kitchen',
        is_quick_tap: true,
        updated_at: nowIso,
      };

      productsToSeed.push(prod);
      logsToSeed.push({
        id: `hmf-init-log-${id}`,
        shop_id: homemadeShopId,
        business_type: 'HOMEMADE_FOOD',
        product_id: id,
        change_qty: prod.current_stock,
        reason_type: 'BATCH_MADE_IN',
        unit_cost_at_time: prod.purchase_price,
        notes: 'Initial authentic fresh batch stock',
        created_at: nowIso,
      });
    });

    await db.transaction('rw', [db.products, db.inventory_logs], async () => {
      await db.products.bulkPut(productsToSeed);
      if (logsToSeed.length > 0) {
        await db.inventory_logs.bulkPut(logsToSeed);
      }
    });

    seededHomemadeCount = productsToSeed.length;
  }

  return {
    purgedFromKirana: toDeleteFromKirana.length,
    purgedFromHomemade: toDeleteFromHomemade.length,
    seededHomemadeCount,
  };
}

export const TenantManager = {
  getBaseKiranaShopId,
  getHomemadeShopId,
  getActiveShopId,
  getActiveBusinessType,
  isHomemadeShopId,
  ensureCatalogSeparationAndSeed,
  STANDARD_8_HOMEMADE_FOOD_CATALOG,
};

