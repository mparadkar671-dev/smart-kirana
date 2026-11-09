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
  'Festive Specials',
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
  'All Categories',
  'Groceries',
  'Grains & Pulses',
  'Grains, Atta & Dal (धान्य व डाळी)',
  'Dals & Pulses',
  'Grains & Flours',
  'Grains & Staples',
  'Flours & Grains',
  'Spices & Masala',
  'Spices & Masalas',
  'Masala, Spices & Cooking (मसाले व तेल)',
  'Edible Oil & Ghee',
  'Edible Oils',
  'Oil & Ghee',
  'Packaged Food & Snacks',
  'Snacks, Biscuits & Namkeen (फरसाण व बिस्कीट)',
  'Snacks & Biscuits',
  'Biscuits & Bakery',
  'Dairy, Bakery & Beverages (दुग्ध व पेये)',
  'Dairy & Cold Drinks',
  'Beverages & Tea/Coffee',
  'Beverages & Drinks',
  'Personal Care',
  'Personal Care & Hygiene (वैयक्तिक स्वच्छता)',
  'Cleaning & Household',
  'Cleaning & Household (स्वच्छता व घरगुती)',
  'Household & Cleaning',
  'Puja Needs',
  'Puja & Traditional Needs (पूजा साहित्य)',
  'General & Hardware',
  'Vegetables',
  'Paan & Tobacco',
  'General',
]);

export const HOMEMADE_NAME_KEYWORDS = [
  'मोदक', 'modak', 'ukadiche modak',
  'घावणे', 'ghavane',
  'आंबोळी', 'amboli',
  'पुरणपोळी', 'puran poli',
  'खोबऱ्याची कापा', 'khobryachi kapa',
];

export function getBaseKiranaShopId(shopId?: string | null): string {
  // If already on the HMF shop_id, restore or look up the base Kirana shop_id from localStorage
  if (typeof localStorage !== 'undefined') {
    const savedBase =
      localStorage.getItem('kirana_base_shop_id') ||
      localStorage.getItem('kirana_primary_shop_id') ||
      localStorage.getItem('kirana_active_shop_id');
    if (savedBase && !savedBase.endsWith('-484d-4600-000000000001') && !savedBase.endsWith('_hmf')) return savedBase;
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
 * In Smart Kirana, products are KIRANA_RETAIL by default.
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

  // 1. Hard rule: Any standard Kirana category is ALWAYS KIRANA_RETAIL (recovers corrupted records)
  if (KIRANA_CATEGORIES.has(cat)) {
    return 'KIRANA_RETAIL';
  }

  // 2. Hard rule: Any Homemade category is ALWAYS HOMEMADE_FOOD
  if (HOMEMADE_CATEGORIES.has(cat)) {
    return 'HOMEMADE_FOOD';
  }

  // 3. Physical tenant shop_id check
  if (product.shop_id && isHomemadeShopId(product.shop_id)) {
    return 'HOMEMADE_FOOD';
  }

  // 4. Explicit business_type takes precedence for general categories
  if (product.business_type === 'KIRANA_RETAIL') {
    return 'KIRANA_RETAIL';
  }
  if (product.business_type === 'HOMEMADE_FOOD') {
    return 'HOMEMADE_FOOD';
  }

  // 5. Keyword match for traditional homemade specialties
  if (HOMEMADE_NAME_KEYWORDS.some((kw) => nameLower.includes(kw))) {
    return 'HOMEMADE_FOOD';
  }

  // 6. Default in Smart Kirana is ALWAYS KIRANA_RETAIL
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
    // 1. Business Mode Firewall
    if (resolveProductBusinessType(p) !== activeMode) {
      return false;
    }

    // 2. Multi-tenant shop_id verification
    if (activeShopId && p.shop_id && p.shop_id !== activeShopId) {
      // Local fallback: allow products created with default 'current_shop' or matching activeShopId
      if (p.shop_id === 'current_shop' || activeShopId === 'current_shop') {
        return true;
      }
      if (activeMode === 'HOMEMADE_FOOD') {
        const isProductHmf = isHomemadeShopId(p.shop_id) || p.business_type === 'HOMEMADE_FOOD';
        const isActiveHmf = isHomemadeShopId(activeShopId) || activeMode === 'HOMEMADE_FOOD';
        if (isProductHmf && isActiveHmf) {
          return true;
        }
        return false;
      } else {
        // KIRANA_RETAIL: Allow if both are Kirana retail and share base shop_id
        const isProductHmf = isHomemadeShopId(p.shop_id) || p.business_type === 'HOMEMADE_FOOD';
        const isActiveHmf = isHomemadeShopId(activeShopId);
        if (!isProductHmf && !isActiveHmf) {
          const baseP = getBaseKiranaShopId(p.shop_id);
          const baseActive = getBaseKiranaShopId(activeShopId);
          if (baseP === baseActive || baseP === 'current_shop' || baseActive === 'current_shop') {
            return true;
          }
        }
        return false;
      }
    }
    return true;
  });
}
