import { db, getActiveDb, kiranaDb, homemadeDb, KiranaDatabase } from '../db/db';
import {
  Product,
  AdvanceOrder,
  RecipeIngredient,
  UnitType,
} from '../types';
import { roundCurrency, roundQty, toPaise, toRupees } from '../utils/math';

export interface KitchenPrepProductRequirement {
  productId: string;
  productName: string;
  unitType: UnitType;
  totalOrderedQty: number;
  currentStock: number;
  netProductionNeeded: number; // Max(0, totalOrderedQty - currentStock)
  recipeIngredients: RecipeIngredient[];
}

export interface RawMaterialRequirementSummary {
  materialName: string;
  unit: UnitType;
  totalQtyNeeded: number;
  currentStock: number;
  deficitQty: number; // Max(0, totalQtyNeeded - currentStock)
  estimatedCost: number;
  matchedProductId?: string;
}

export interface KitchenPrepSheet {
  generatedAt: string;
  totalOrdersCount: number;
  productRequirements: KitchenPrepProductRequirement[];
  rawMaterialsSummary: RawMaterialRequirementSummary[];
  totalEstimatedRawMaterialCost: number;
}

export class RecipeBomService {
  /**
   * Aggregates pending & preparing Advance Orders to calculate
   * exact finished product targets and itemized raw material procurement sheet.
   */
  static async calculateKitchenPrepRequirements(orderIds?: string[], targetDb?: KiranaDatabase): Promise<KitchenPrepSheet> {
    let activeDb = targetDb || getActiveDb();

    // 1. Fetch relevant Advance Orders (checking partition fallback)
    let orders: AdvanceOrder[] = [];
    if (orderIds && orderIds.length > 0) {
      orders = await activeDb.advance_orders
        .filter((o) => orderIds.includes(o.id) && o.status !== 'CANCELLED' && o.status !== 'DELIVERED_BILLED')
        .toArray();
    } else {
      orders = await activeDb.advance_orders
        .filter((o) => (o.status === 'PENDING' || o.status === 'PREPARING'))
        .toArray();
    }

    if (orders.length === 0 && !targetDb) {
      const otherDb = activeDb === kiranaDb ? homemadeDb : kiranaDb;
      const otherOrders = await otherDb.advance_orders
        .filter((o) => (o.status === 'PENDING' || o.status === 'PREPARING'))
        .toArray();
      if (otherOrders.length > 0) {
        activeDb = otherDb;
        orders = otherOrders;
      }
    }

    // 2. Aggregate total ordered quantity per product
    const productQtyMap = new Map<string, number>();

    for (const order of orders) {
      const items = order.items_json || order.items || [];
      for (const item of items) {
        if (!item.product_id) continue;
        const currentQty = productQtyMap.get(item.product_id) || 0;
        productQtyMap.set(item.product_id, roundQty(currentQty + (item.qty || 0)));
      }
    }

    // 3. For each ordered product, compute net production needed
    const allProducts = await activeDb.products.toArray();
    // Also include products from other DB if needed
    const otherDb = activeDb === kiranaDb ? homemadeDb : kiranaDb;
    const otherProducts = await otherDb.products.toArray();
    const combinedProducts = [...allProducts, ...otherProducts];
    const productMap = new Map<string, Product>(combinedProducts.map((p) => [p.id, p]));

    const productRequirements: KitchenPrepProductRequirement[] = [];
    const rawMaterialMap = new Map<
      string,
      {
        materialName: string;
        unit: UnitType;
        totalQtyNeeded: number;
        costPerUnit: number;
        matchedProductId?: string;
      }
    >();

    for (const [productId, orderedQty] of productQtyMap.entries()) {
      const product = productMap.get(productId);
      if (!product) continue;

      const currentStock = roundQty(product.current_stock);
      const netProductionNeeded = roundQty(Math.max(0, orderedQty - currentStock));

      const bom = product.recipe_bom && product.recipe_bom.length > 0
        ? product.recipe_bom
        : this.getStandardFallbackBom(product);

      productRequirements.push({
        productId: product.id,
        productName: product.name,
        unitType: product.unit_type,
        totalOrderedQty: orderedQty,
        currentStock,
        netProductionNeeded,
        recipeIngredients: bom,
      });

      if (netProductionNeeded > 0) {
        for (const ing of bom) {
          const key = ing.name.toLowerCase().trim();
          const qtyForThisProduct = roundQty(netProductionNeeded * ing.qty_required);
          const existing = rawMaterialMap.get(key);

          if (existing) {
            existing.totalQtyNeeded = roundQty(existing.totalQtyNeeded + qtyForThisProduct);
          } else {
            rawMaterialMap.set(key, {
              materialName: ing.name,
              unit: ing.unit,
              totalQtyNeeded: qtyForThisProduct,
              costPerUnit: ing.cost_estimate || 0,
              matchedProductId: ing.raw_material_product_id,
            });
          }
        }
      }
    }

    // 4. Match raw materials against inventory stocks & compute deficit
    const rawMaterialsSummary: RawMaterialRequirementSummary[] = [];
    let totalEstimatedCostPaise = 0;

    for (const mat of rawMaterialMap.values()) {
      let invStock = 0;
      let matchedProd: Product | undefined;

      if (mat.matchedProductId) {
        matchedProd = productMap.get(mat.matchedProductId);
      }
      if (!matchedProd) {
        matchedProd = combinedProducts.find((p) =>
          p.name.toLowerCase().includes(mat.materialName.toLowerCase()) ||
          mat.materialName.toLowerCase().includes(p.name.toLowerCase())
        );
      }

      if (matchedProd) {
        invStock = roundQty(matchedProd.current_stock);
        if (mat.costPerUnit === 0 && matchedProd.purchase_price > 0) {
          mat.costPerUnit = matchedProd.purchase_price;
        }
      }

      const deficitQty = roundQty(Math.max(0, mat.totalQtyNeeded - invStock));
      const estCost = toRupees(Math.round(mat.totalQtyNeeded * toPaise(mat.costPerUnit)));
      totalEstimatedCostPaise += toPaise(estCost);

      rawMaterialsSummary.push({
        materialName: mat.materialName,
        unit: mat.unit,
        totalQtyNeeded: mat.totalQtyNeeded,
        currentStock: invStock,
        deficitQty,
        estimatedCost: estCost,
        matchedProductId: matchedProd?.id,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      totalOrdersCount: orders.length,
      productRequirements,
      rawMaterialsSummary: rawMaterialsSummary.sort((a, b) => b.deficitQty - a.deficitQty),
      totalEstimatedRawMaterialCost: toRupees(totalEstimatedCostPaise),
    };
  }

  /**
   * Generates realistic standard Maharashtrian Gruh Udyog BOM
   */
  private static getStandardFallbackBom(product: Product): RecipeIngredient[] {
    const name = (product.name + ' ' + (product.marathi_name || '')).toLowerCase();

    if (name.includes('besan') || name.includes('लाडू')) {
      return [
        { name: 'Gram Flour (Besan)', qty_required: 0.450, unit: 'KG_LOOSE', cost_estimate: 80 },
        { name: 'Pure Cow Ghee', qty_required: 0.250, unit: 'KG_LOOSE', cost_estimate: 600 },
        { name: 'Sugar / Boora', qty_required: 0.450, unit: 'KG_LOOSE', cost_estimate: 42 },
        { name: 'Cardamom & Dry Fruits', qty_required: 0.050, unit: 'KG_LOOSE', cost_estimate: 800 },
      ];
    }

    if (name.includes('puran') || name.includes('पुरणपोळी')) {
      return [
        { name: 'Chana Dal (हरभरा डाळ)', qty_required: 0.400, unit: 'KG_LOOSE', cost_estimate: 85 },
        { name: 'Jaggery / Gul (सेंद्रिय गूळ)', qty_required: 0.400, unit: 'KG_LOOSE', cost_estimate: 55 },
        { name: 'Wheat Flour / Maida (गहू पीठ / मैदा)', qty_required: 0.350, unit: 'KG_LOOSE', cost_estimate: 40 },
        { name: 'Nutmeg & Cardamom (जायफळ, वेलची)', qty_required: 0.020, unit: 'KG_LOOSE', cost_estimate: 1000 },
      ];
    }

    if (name.includes('modak') || name.includes('मोदक')) {
      return [
        { name: 'Basmati Rice Flour (आंबेमोहर तांदूळ पिठी)', qty_required: 0.400, unit: 'KG_LOOSE', cost_estimate: 60 },
        { name: 'Fresh Grated Coconut (ओला नारळ खवलेला)', qty_required: 0.500, unit: 'KG_LOOSE', cost_estimate: 80 },
        { name: 'Organic Jaggery (बारीक चिरलेला गूळ)', qty_required: 0.350, unit: 'KG_LOOSE', cost_estimate: 55 },
        { name: 'Poppy Seeds & Cardamom (खसखस, वेलची)', qty_required: 0.030, unit: 'KG_LOOSE', cost_estimate: 900 },
      ];
    }

    if (name.includes('bhakri') || name.includes('भाकरी')) {
      return [
        { name: 'Jowar / Bajra Flour (ज्वारी / बाजरी पीठ)', qty_required: 0.150, unit: 'KG_LOOSE', cost_estimate: 45 },
      ];
    }

    if (name.includes('chapati') || name.includes('चपाती')) {
      return [
        { name: 'Whole Wheat Flour (गव्हाचे पीठ)', qty_required: 0.120, unit: 'KG_LOOSE', cost_estimate: 40 },
        { name: 'Refined Oil (खाद्यतेल)', qty_required: 0.020, unit: 'KG_LOOSE', cost_estimate: 140 },
      ];
    }

    return [
      {
        name: `${product.name} Raw Ingredients`,
        qty_required: 1,
        unit: product.unit_type,
        cost_estimate: product.raw_material_cost || product.purchase_price,
      },
    ];
  }
}
