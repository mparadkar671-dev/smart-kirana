import { db, kiranaDb, homemadeDb } from '../db/db';
import { Product, InventoryLog, ExpenseAndDrawing, UnitType, InventoryReason, BusinessType } from '../types';
import { roundQty, roundCurrency, calculateProfitMarginPercent } from '../utils/math';
import { generateUniqueStoreBarcode } from '../utils/barcodeGenerator';
import { getHomemadeShopId, getBaseKiranaShopId, getActiveBusinessType, isHomemadeShopId } from '../utils/businessFirewall';
import { cloudSyncService } from './cloudSyncService';

export interface CreateProductInput {
  name: string;
  marathi_name?: string;
  search_keywords?: string;
  short_code: string;
  barcode?: string;
  category: string;
  unit_type: UnitType;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  current_stock: number;
  low_stock_threshold: number;
  last_supplier_name?: string;
  supplier_phone?: string;
  wholesaler_id?: string | null;
  loan_account_id?: string | null;
  image_url?: string | null;
  expiry_date?: string | null;
  is_quick_tap: boolean;
  shop_id?: string;
  business_type?: BusinessType;
  raw_material_cost?: number;
  equipment_fuel_cost?: number;
  labour_cost?: number;
  wholesale_price?: number;
  is_loan_funded?: boolean;
  shelf_life_days?: number;
  batch_notes?: string;
}

export class InventoryService {
  /**
   * Creates a new product and immediately records initial stock in inventory_logs
   */
  static async createProduct(input: CreateProductInput): Promise<Product> {
    const id = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    let barcode = input.barcode?.trim() || '';
    if (!barcode) {
      const allProds = await db.products.toArray();
      const existingSet = new Set(allProds.map((p) => p.barcode).filter(Boolean));
      barcode = generateUniqueStoreBarcode(existingSet);
    }

    const currentActiveBiz = getActiveBusinessType();
    const shopProfile = await db.getShopProfile().catch(() => null);
    const resolvedBiz: BusinessType = input.business_type || (currentActiveBiz === 'HOMEMADE_FOOD' ? 'HOMEMADE_FOOD' : (shopProfile?.business_type || 'KIRANA_RETAIL'));
    const rawShopId =
      input.shop_id ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null) ||
      shopProfile?.shop_id ||
      shopProfile?.id ||
      'current_shop';
    const activeShopId = resolvedBiz === 'HOMEMADE_FOOD' ? getHomemadeShopId(rawShopId) : getBaseKiranaShopId(rawShopId);

    const newProduct: Product = {
      id,
      shop_id: activeShopId,
      business_type: resolvedBiz,
      name: input.name.trim(),
      marathi_name: input.marathi_name?.trim() || undefined,
      search_keywords: input.search_keywords?.trim() || undefined,
      short_code: input.short_code.trim().toUpperCase(),
      barcode,
      category: input.category.trim() || (resolvedBiz === 'HOMEMADE_FOOD' ? 'Konkani Breakfast & Tiffin' : 'General'),
      unit_type: input.unit_type,
      purchase_price: roundCurrency(input.purchase_price),
      selling_price: roundCurrency(input.selling_price),
      mrp: roundCurrency(input.mrp || input.selling_price),
      current_stock: roundQty(input.current_stock || 0),
      low_stock_threshold: roundQty(input.low_stock_threshold ?? 5),
      last_supplier_name: input.last_supplier_name?.trim() || (resolvedBiz === 'HOMEMADE_FOOD' ? 'In-House Kitchen' : 'General Wholesaler'),
      supplier_phone: input.supplier_phone?.trim() || undefined,
      wholesaler_id: input.wholesaler_id || null,
      loan_account_id: input.loan_account_id || null,
      is_loan_funded: Boolean(input.is_loan_funded || input.loan_account_id),
      image_url: input.image_url || null,
      expiry_date: input.expiry_date || null,
      is_quick_tap: !!input.is_quick_tap,
      raw_material_cost: input.raw_material_cost !== undefined ? roundCurrency(input.raw_material_cost) : 0,
      equipment_fuel_cost: input.equipment_fuel_cost !== undefined ? roundCurrency(input.equipment_fuel_cost) : 0,
      labour_cost: input.labour_cost !== undefined ? roundCurrency(input.labour_cost) : 0,
      wholesale_price: input.wholesale_price !== undefined ? roundCurrency(input.wholesale_price) : 0,
      shelf_life_days: input.shelf_life_days,
      batch_notes: input.batch_notes?.trim() || undefined,
      updated_at: new Date().toISOString(),
    };

    const targetDb = resolvedBiz === 'HOMEMADE_FOOD' ? homemadeDb : kiranaDb;

    await targetDb.transaction('rw', [targetDb.products, targetDb.inventory_logs], async () => {
      await targetDb.products.put(newProduct);

      if (newProduct.current_stock > 0) {
        const log: InventoryLog = {
          id: `log-${Date.now()}-init`,
          shop_id: newProduct.shop_id || activeShopId,
          business_type: resolvedBiz,
          product_id: newProduct.id,
          change_qty: newProduct.current_stock,
          reason_type: resolvedBiz === 'HOMEMADE_FOOD' ? 'BATCH_MADE_IN' : 'PURCHASE_IN',
          unit_cost_at_time: newProduct.purchase_price,
          reference_id: null,
          loan_account_id: newProduct.loan_account_id || null,
          notes: newProduct.loan_account_id
            ? 'Opening stock on product creation (Loan Funded)'
            : 'Opening stock on product creation',
          created_at: new Date().toISOString(),
        };
        await targetDb.inventory_logs.put(log);
      }
    });

    // Also place in active db proxy so UI updates immediately
    await db.products.put(newProduct).catch(() => {});

    // Queue sync in outbox so it is NEVER purged as stale
    await targetDb.queueSync(
      {
        table_name: 'products',
        operation: 'INSERT',
        payload: newProduct as unknown as Record<string, unknown>,
        shop_id: activeShopId,
      },
      targetDb.sync_outbox
    ).catch(() => {});

    // Sync to Supabase cloud
    cloudSyncService.syncProduct(newProduct);
    return newProduct;
  }

  /**
   * Updates an existing product and logs adjustments if stock changes manually
   */
  static async updateProduct(productId: string, updates: Partial<CreateProductInput>): Promise<void> {
    await db.transaction('rw', [db.products, db.inventory_logs], async () => {
      const existing = await db.products.get(productId);
      if (!existing) throw new Error(`Product not found: ${productId}`);

      const patched: Partial<Product> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      if (updates.purchase_price !== undefined) {
        patched.purchase_price = roundCurrency(updates.purchase_price);
      }
      if (updates.selling_price !== undefined) {
        patched.selling_price = roundCurrency(updates.selling_price);
      }
      if (updates.mrp !== undefined) {
        patched.mrp = roundCurrency(updates.mrp);
      }
      if (updates.low_stock_threshold !== undefined) {
        patched.low_stock_threshold = roundQty(updates.low_stock_threshold);
      }
      if (updates.raw_material_cost !== undefined) {
        patched.raw_material_cost = roundCurrency(updates.raw_material_cost);
      }
      if (updates.equipment_fuel_cost !== undefined) {
        patched.equipment_fuel_cost = roundCurrency(updates.equipment_fuel_cost);
      }
      if (updates.labour_cost !== undefined) {
        patched.labour_cost = roundCurrency(updates.labour_cost);
      }
      if (updates.wholesale_price !== undefined) {
        patched.wholesale_price = roundCurrency(updates.wholesale_price);
      }
      if (updates.is_loan_funded !== undefined || updates.loan_account_id !== undefined) {
        patched.is_loan_funded = Boolean(updates.is_loan_funded || updates.loan_account_id || existing.loan_account_id);
      }

      // Check if stock is directly changed in edit modal
      if (updates.current_stock !== undefined) {
        const newStock = roundQty(updates.current_stock);
        const diff = roundQty(newStock - existing.current_stock);
        if (diff !== 0) {
          patched.current_stock = newStock;
          const log: InventoryLog = {
            id: `log-${Date.now()}-adjust`,
            product_id: productId,
            change_qty: diff,
            reason_type: 'AUDIT_ADJUST',
            unit_cost_at_time: patched.purchase_price ?? existing.purchase_price,
            reference_id: null,
            notes: `Manual inventory audit edit (${diff > 0 ? '+' : ''}${diff})`,
            created_at: new Date().toISOString(),
          };
          await db.inventory_logs.add(log);
        }
      }

      const isHmf = existing.business_type === 'HOMEMADE_FOOD' || (existing.shop_id && isHomemadeShopId(existing.shop_id));
      const targetDb = isHmf ? homemadeDb : kiranaDb;
      await targetDb.products.update(productId, patched);
      await db.products.update(productId, patched).catch(() => {});
    });

    const activeDb = getActiveBusinessType() === 'HOMEMADE_FOOD' ? homemadeDb : kiranaDb;
    activeDb.products.get(productId).then((p) => {
      if (p) cloudSyncService.syncProduct(p);
    });
  }

  /**
   * Deletes a product
   */
  static async deleteProduct(productId: string): Promise<void> {
    await Promise.all([
      kiranaDb.products.delete(productId).catch(() => {}),
      homemadeDb.products.delete(productId).catch(() => {}),
      db.products.delete(productId).catch(() => {}),
    ]);
    const shopId = (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null) || 'current_shop';
    await db.queueSync(
      { table_name: 'products', operation: 'DELETE', payload: { id: productId }, shop_id: shopId },
      db.sync_outbox
    ).catch(() => {});
    cloudSyncService.deleteProduct(productId);
  }

  /**
   * Bulk deletes multiple products atomically
   */
  static async bulkDeleteProducts(productIds: string[]): Promise<void> {
    if (!productIds || productIds.length === 0) return;
    await db.transaction('rw', [db.products, db.inventory_logs, db.sync_outbox], async () => {
      await db.products.bulkDelete(productIds);
      for (const id of productIds) {
        await db.queueSync(
          { table_name: 'products', operation: 'DELETE', payload: { id } },
          db.sync_outbox
        );
      }
    });
    for (const id of productIds) { cloudSyncService.deleteProduct(id); }
  }

  /**
   * Bulk toggles Quick-Tap (Fast-Tap counter grid) for multiple products
   */
  static async bulkToggleQuickTap(productIds: string[], isQuickTap: boolean): Promise<void> {
    if (!productIds || productIds.length === 0) return;
    const shopId = (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null) || 'current_shop';
    const nowIso = new Date().toISOString();
    await db.transaction('rw', [db.products, db.sync_outbox], async () => {
      for (const id of productIds) {
        await db.products.update(id, {
          is_quick_tap: isQuickTap,
          updated_at: nowIso,
        });
        await db.queueSync(
          { table_name: 'products', operation: 'UPDATE', payload: { id, is_quick_tap: isQuickTap, updated_at: nowIso }, shop_id: shopId },
          db.sync_outbox
        );
      }
    });
  }

  /**
   * Bulk updates category for multiple products
   */
  static async bulkUpdateCategory(productIds: string[], newCategory: string): Promise<void> {
    if (!productIds || productIds.length === 0 || !newCategory) return;
    const shopId = (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_shop_id') : null) || 'current_shop';
    const nowIso = new Date().toISOString();
    await db.transaction('rw', [db.products, db.sync_outbox], async () => {
      for (const id of productIds) {
        await db.products.update(id, {
          category: newCategory,
          updated_at: nowIso,
        });
        await db.queueSync(
          { table_name: 'products', operation: 'UPDATE', payload: { id, category: newCategory, updated_at: nowIso }, shop_id: shopId },
          db.sync_outbox
        );
      }
    });
  }

  /**
   * Quick Stock In (++ Restock)
   * Atomically updates product current_stock and inserts a PURCHASE_IN inventory log.
   */
  static async restock(params: {
    productId: string;
    qty: number;
    unitCost?: number;
    supplierName?: string;
    loanAccountId?: string | null;
    reasonType?: 'PURCHASE_IN' | 'BATCH_MADE_IN';
    notes?: string;
  }): Promise<{ product: Product; log: InventoryLog }> {
    if (params.qty <= 0) throw new Error('Restock quantity must be positive');

    let updatedProduct!: Product;
    let newLog!: InventoryLog;

    await db.transaction('rw', [db.products, db.inventory_logs, db.sync_outbox], async () => {
      const product = await db.products.get(params.productId);
      if (!product) throw new Error(`Product not found: ${params.productId}`);

      const cost = params.unitCost !== undefined && params.unitCost > 0
        ? roundCurrency(params.unitCost)
        : product.purchase_price;

      const newStock = roundQty(product.current_stock + params.qty);

      const updates: Partial<Product> = {
        current_stock: newStock,
        purchase_price: cost,
        updated_at: new Date().toISOString(),
      };

      if (params.supplierName && params.supplierName.trim()) {
        updates.last_supplier_name = params.supplierName.trim();
      }
      if (params.loanAccountId !== undefined) {
        updates.loan_account_id = params.loanAccountId || null;
      }

      await db.products.update(params.productId, updates);
      await db.queueSync(
        { table_name: 'products', operation: 'UPDATE', payload: { id: params.productId, ...updates }, shop_id: product.shop_id },
        db.sync_outbox
      );

      newLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        shop_id: product.shop_id || 'current_shop',
        business_type: product.business_type || 'KIRANA_RETAIL',
        product_id: params.productId,
        change_qty: roundQty(params.qty),
        reason_type: params.reasonType || 'PURCHASE_IN',
        unit_cost_at_time: cost,
        reference_id: null,
        loan_account_id: params.loanAccountId !== undefined ? (params.loanAccountId || null) : (product.loan_account_id || null),
        notes:
          params.notes?.trim() ||
          (params.reasonType === 'BATCH_MADE_IN'
            ? `🍳 Fresh Batch Made Today (+${params.qty} ${product.unit_type})`
            : `Restocked +${params.qty} from ${updates.last_supplier_name || product.last_supplier_name}`),
        created_at: new Date().toISOString(),
      };

      await db.inventory_logs.add(newLog);
      await db.queueSync(
        { table_name: 'inventory_logs', operation: 'INSERT', payload: newLog as unknown as Record<string, unknown>, shop_id: newLog.shop_id },
        db.sync_outbox
      );
      updatedProduct = { ...product, ...updates };
    });

    return { product: updatedProduct, log: newLog };
  }

  /**
   * Quick Stock Out (-- Damage / Expired / Self-Use)
   * For SELF_USE_OUT: Atomically deducts stock AND creates a HOME_SELF_USE_GOODS
   * entry in expenses_and_drawings valued at purchase_price * qty (REQ-05 / REQ-20).
   */
  static async stockOut(params: {
    productId: string;
    qty: number;
    reasonType: 'SELF_USE_OUT' | 'DAMAGE_EXPIRED_OUT' | 'AUDIT_ADJUST';
    notes?: string;
  }): Promise<{ product: Product; log: InventoryLog; expense?: ExpenseAndDrawing }> {
    if (params.qty <= 0) throw new Error('Stock out quantity must be positive');

    let updatedProduct!: Product;
    let newLog!: InventoryLog;
    let newExpense: ExpenseAndDrawing | undefined;

    await db.transaction('rw', [db.products, db.inventory_logs, db.expenses_and_drawings, db.sync_outbox], async () => {
      const product = await db.products.get(params.productId);
      if (!product) throw new Error(`Product not found: ${params.productId}`);

      const newStock = roundQty(product.current_stock - params.qty);

      await db.products.update(params.productId, {
        current_stock: newStock,
        updated_at: new Date().toISOString(),
      });
      await db.queueSync(
        { table_name: 'products', operation: 'UPDATE', payload: { id: params.productId, current_stock: newStock }, shop_id: product.shop_id },
        db.sync_outbox
      );

      let linkedExpenseId: string | null = null;

      // REQ-05 / REQ-20 INVARIANT: If home use, write to expenses_and_drawings at purchase_price
      if (params.reasonType === 'SELF_USE_OUT') {
        const homeValuation = roundCurrency(params.qty * product.purchase_price);
        linkedExpenseId = `exp-home-${Date.now()}`;
        newExpense = {
          id: linkedExpenseId,
          shop_id: product.shop_id || 'current_shop',
          business_type: product.business_type || 'KIRANA_RETAIL',
          category: 'HOME_SELF_USE_GOODS',
          amount: homeValuation,
          paid_via: 'INVENTORY_DEDUCTION',
          description: `Home use: ${params.qty} ${product.unit_type} of ${product.name} @ ₹${product.purchase_price.toFixed(2)}`,
          created_at: new Date().toISOString(),
        };
        await db.expenses_and_drawings.add(newExpense);
        await db.queueSync(
          { table_name: 'expenses_and_drawings', operation: 'INSERT', payload: newExpense as unknown as Record<string, unknown>, shop_id: newExpense.shop_id },
          db.sync_outbox
        );
      }

      newLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        shop_id: product.shop_id || 'current_shop',
        business_type: product.business_type || 'KIRANA_RETAIL',
        product_id: params.productId,
        change_qty: roundQty(-params.qty),
        reason_type: params.reasonType,
        unit_cost_at_time: product.purchase_price,
        reference_id: linkedExpenseId,
        notes: params.notes?.trim() || `${params.reasonType}: -${params.qty} units`,
        created_at: new Date().toISOString(),
      };

      await db.inventory_logs.add(newLog);
      await db.queueSync(
        { table_name: 'inventory_logs', operation: 'INSERT', payload: newLog as unknown as Record<string, unknown>, shop_id: newLog.shop_id },
        db.sync_outbox
      );
      updatedProduct = { ...product, current_stock: newStock, updated_at: new Date().toISOString() };
    });

    return { product: updatedProduct, log: newLog, expense: newExpense };
  }

  /**
   * Checks for products whose current_stock <= low_stock_threshold
   */
  static filterLowStock(products: Product[]): Product[] {
    return products.filter((p) => p.current_stock <= p.low_stock_threshold);
  }

  /**
   * Checks for products expiring within given days (default 15 days)
   */
  static filterExpiringSoon(products: Product[], days: number = 15): Product[] {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + days);
    thresholdDate.setHours(23, 59, 59, 999);

    return products.filter((p) => {
      if (!p.expiry_date) return false;
      const expiry = new Date(p.expiry_date);
      return expiry <= thresholdDate;
    });
  }

  /**
   * Generates WhatsApp message text for Wholesaler Market Purchase Restock List
   */
  static generateWholesalerWhatsAppText(lowStockItems: Product[], shopName: string): string {
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    let text = `🛒 *Wholesaler Purchase Order - ${shopName}*\n📅 Date: ${dateStr}\n\n`;
    text += `Please arrange the following items for delivery/pickup:\n\n`;

    lowStockItems.forEach((item, index) => {
      const neededQty = Math.max(1, Math.ceil(item.low_stock_threshold * 2 - item.current_stock));
      text += `${index + 1}. *${item.name}*\n`;
      text += `   - Current Stock: ${item.current_stock} ${item.unit_type}\n`;
      text += `   - Needed Order: ~${neededQty} ${item.unit_type}\n`;
      text += `   - Last Wholesale Rate: ₹${item.purchase_price.toFixed(2)}\n`;
      if (item.last_supplier_name) {
        text += `   - Supplier: ${item.last_supplier_name}\n`;
      }
      text += `\n`;
    });

    text += `Total Items to Restock: ${lowStockItems.length}\n`;
    text += `Sent from Smart Kirana POS`;

    return encodeURIComponent(text);
  }
}

