export type BusinessMode = 'KIRANA_RETAIL' | 'HOMEMADE_FOOD';

export const HOMEMADE_CATEGORIES = new Set([
  'All Homemade Items',
  'Homemade Laddus & Sweets',
  'Homemade Laddus & Vadi',
  'Homemade Laddus & Vadi (लाडू, खोबऱ्याची वडी / कापा)',
  'Traditional Laddus',
  'Traditional Laddus (लाडू)',
  'Modak & Festive Specials',
  'Modak & Festive Specials (मोदक / पुरणपोळी)',
  'Modak & Festive Specials (उकडीचे मोदक, तळणीचे मोदक)',
  'Festival Specials',
  'Konkani Breakfast & Tiffin',
  'Konkani Fresh Tiffin & Breakfast',
  'Konkani Breakfast & Tiffin (घावणे, आंबोळी, पोहे, उपमा)',
  'Konkani Breakfast (घावणे / आंबोळी)',
  'Konkani Breakfast',
  'Fresh Bhakri & Chapati',
  'Fresh Bhakri & Chapati (भाकरी / चपाती)',
  'Fresh Bhakri & Chapati (भाकरी, चपाती, पुरणपोळी)',
  'Homemade Vadi & Kapa',
  'Homemade Vadi & Kapa (खोबऱ्याच्या कापा)',
  'Homemade Pickles & Chutney',
  'Homemade Pickles, Chutney & Papad (लोणचे, चटणी, पापड)',
  'Homemade Food / Gruh Udyog',
]);

export const KIRANA_CATEGORIES = new Set([
  'Grains & Pulses',
  'Dals & Pulses',
  'Grains & Flours',
  'Grains & Staples',
  'Flours & Grains',
  'Spices & Masala',
  'Edible Oil & Ghee',
  'Edible Oils',
  'Oil & Ghee',
  'Packaged Food & Snacks',
  'Snacks & Biscuits',
  'Biscuits & Bakery',
  'Dairy & Cold Drinks',
  'Beverages & Tea/Coffee',
  'Beverages & Drinks',
  'Personal Care',
  'Cleaning & Household',
  'Household & Cleaning',
  'Puja Needs',
  'General & Hardware',
  'Vegetables',
  'Paan & Tobacco',
  'General',
]);

export const HOMEMADE_NAME_KEYWORDS = [
  'लाडू', 'laddu', 'ladoo',
  'मोदक', 'modak',
  'घावणे', 'ghavane',
  'आंबोळी', 'amboli',
  'भाकरी', 'bhakri',
  'चपाती', 'chapati', 'poli',
  'पुरणपोळी', 'puran poli',
  'खोबऱ्याची वडी', 'खोबऱ्याच्या वड्या', 'खोबऱ्याच्या कापा', 'कापा', 'khobryachi kapa', 'khobryachi vadi', 'vadi',
  'पोहे', 'pohe',
  'उपमा', 'upma',
  'चकली', 'chakali', 'chakli',
  'करंजी', 'karanji',
  'शेव', 'shev',
  'चिवडा', 'chivda',
  'लोणचे', 'lonche', 'pickle',
  'पापड', 'papad',
  'चटणी', 'chutney',
  'कुरडई', 'kurdai'
];

export function getBaseKiranaShopId(shopId?: string | null): string {
  // If already on the HMF shop_id, restore or look up the base Kirana shop_id from localStorage
  if (typeof localStorage !== 'undefined') {
    const savedBase = localStorage.getItem('kirana_base_shop_id') || localStorage.getItem('kirana_primary_shop_id');
    if (savedBase && !savedBase.endsWith('-484d-4600-000000000001')) return savedBase;
  }
  if (!shopId) return 'current_shop';
  if (shopId.endsWith('-484d-4600-000000000001')) {
    const stripped = shopId.replace(/-484d-4600-000000000001$/, '');
    return stripped || 'current_shop';
  }
  if (shopId.endsWith('_hmf')) {
    return shopId.slice(0, -4) || 'current_shop';
  }
  return shopId;
}

export function getHomemadeShopId(kiranaShopId: string): string {
  const cleanBase = getBaseKiranaShopId(kiranaShopId);
  return `${cleanBase.substring(0, 18)}-484d-4600-000000000001`;
}

export function getHomemadeShopIdForOwner(kiranaShopId: string): string {
  return getHomemadeShopId(kiranaShopId);
}

/**
 * Resolves the primary Kirana shop_id given a Homemade Food shop_id
 */
export function getKiranaShopIdFromHomemade(homemadeShopId: string, originalKiranaId?: string): string {
  if (originalKiranaId) return originalKiranaId;
  return getBaseKiranaShopId(homemadeShopId);
}

/**
 * Checks whether a given shop_id represents the Homemade Food business tenant
 */
export function isHomemadeShopId(shopId?: string | null): boolean {
  if (!shopId) return false;
  const s = shopId.toLowerCase();
  if (
    s.endsWith('-484d-4600-000000000001') ||
    s.endsWith('_hmf') ||
    s.endsWith('ba7c') ||
    s.endsWith('ceef') ||
    s === 'homemade_food_shop'
  ) {
    return true;
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('kirana_homemade_shop_id');
    if (stored && s === stored.toLowerCase()) return true;
  }
  return false;
}

/**
 * Helper to fetch active shop_id from localStorage or defaults
 */
export function getActiveShopId(): string {
  if (typeof localStorage !== 'undefined') {
    const active = localStorage.getItem('kirana_active_shop_id');
    if (active) return active;
    const biz = localStorage.getItem('kirana_active_business_type');
    const primary = getBaseKiranaShopId();
    if (biz === 'HOMEMADE_FOOD') {
      return getHomemadeShopId(primary);
    }
    return primary;
  }
  return 'current_shop';
}

/**
 * Helper to fetch active business mode
 */
export function getActiveBusinessType(): BusinessMode {
  if (typeof localStorage !== 'undefined') {
    const biz = localStorage.getItem('kirana_active_business_type');
    if (biz === 'HOMEMADE_FOOD') return 'HOMEMADE_FOOD';
  }
  return 'KIRANA_RETAIL';
}

/**
 * Deterministically resolves whether a product belongs to KIRANA_RETAIL or HOMEMADE_FOOD.
 * 
 * Rules:
 * 1. Physical shop_id check: If shop_id is the secondary homemadeShopId, return 'HOMEMADE_FOOD'.
 * 2. Hard Rule: Any standard Kirana category (e.g., "Grains & Pulses", "Dals & Pulses") is ALWAYS KIRANA_RETAIL,
 *    even if corrupted or overwritten by cloud sync.
 * 3. Hard Rule: Any Homemade category or specific homemade food title is ALWAYS HOMEMADE_FOOD.
 * 4. Fallback: If explicit business_type === 'HOMEMADE_FOOD', return 'HOMEMADE_FOOD'.
 * 5. Default: Everything else is 'KIRANA_RETAIL'.
 */
export function resolveProductBusinessType(product: {
  id?: string;
  shop_id?: string | null;
  name?: string;
  marathi_name?: string;
  category?: string;
  business_type?: string | null;
}): BusinessMode {
  const cat = (product.category || '').trim();
  const nameLower = `${product.name || ''} ${product.marathi_name || ''}`.toLowerCase();

  // 1. Hard rule: Any standard Kirana category (like "Grains & Pulses") is ALWAYS KIRANA_RETAIL
  if (KIRANA_CATEGORIES.has(cat)) {
    return 'KIRANA_RETAIL';
  }

  // 2. Physical tenant shop_id check
  if (product.shop_id && isHomemadeShopId(product.shop_id)) {
    return 'HOMEMADE_FOOD';
  }

  // 3. Hard rule: Any Homemade category or Homemade food name is ALWAYS HOMEMADE_FOOD
  if (
    HOMEMADE_CATEGORIES.has(cat) ||
    HOMEMADE_NAME_KEYWORDS.some((kw) => nameLower.includes(kw))
  ) {
    return 'HOMEMADE_FOOD';
  }

  // 4. Fallback to explicit business_type if valid, otherwise default to KIRANA_RETAIL
  if (product.business_type === 'HOMEMADE_FOOD') {
    return 'HOMEMADE_FOOD';
  }

  return 'KIRANA_RETAIL';
}

/**
 * Filter an array of products strictly for the active business mode and active shop_id.
 */
export function filterProductsForBusiness<
  T extends {
    shop_id?: string | null;
    name?: string;
    marathi_name?: string;
    category?: string;
    business_type?: string | null;
  }
>(products: T[], activeMode: BusinessMode, activeShopId?: string): T[] {
  return products.filter((p) => {
    if (activeShopId && p.shop_id && p.shop_id !== activeShopId) {
      const isProductHmf = isHomemadeShopId(p.shop_id) || p.business_type === 'HOMEMADE_FOOD';
      const isActiveHmf = isHomemadeShopId(activeShopId) || activeMode === 'HOMEMADE_FOOD';
      // If both represent HOMEMADE_FOOD, permit the product
      if (isProductHmf && isActiveHmf) {
        // Allow
      } else {
        return false;
      }
    }
    return resolveProductBusinessType(p) === activeMode;
  });
}
