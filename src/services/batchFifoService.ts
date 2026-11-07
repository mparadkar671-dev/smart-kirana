import { db, getActiveDb, kiranaDb, homemadeDb, KiranaDatabase } from '../db/db';
import {
  Product,
  ProductionBatch,
  InventoryLog,
  ExpenseAndDrawing,
  SecurityAuditLog,
  UnitType,
} from '../types';
import { roundCurrency, roundQty, toPaise, toRupees } from '../utils/math';
import { getActiveShopId, getActiveBusinessType } from '../utils/businessFirewall';

export interface CreateBatchParams {
  productId: string;
  qty: number;
  unitType: UnitType;
  unitProductionCost: number;
  shelfLifeDays?: number;
  notes?: string;
  batchCode?: string;
}

export interface BatchDeductionResult {
  batchId: string;
  batchCode: string;
  deductedQty: number;
  remainingInBatch: number;
}

export interface ExpiryAlertItem {
  batch: ProductionBatch;
  product: Product;
  hoursRemaining: number;
  isExpired: boolean;
  alertSeverity: 'CRITICAL_EXPIRED' | 'WARNING_24H' | 'NORMAL';
}

export class BatchFifoService {
  /**
   * Generates a unique batch code for today: BATCH-YYYYMMDD-001
   */
  static async generateBatchCode(targetDb?: KiranaDatabase): Promise<string> {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const prefix = `BATCH-${yyyy}${mm}${dd}-`;

    const activeDb = targetDb || getActiveDb();
    const count = await activeDb.production_batches.count();
    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}${seq}`;
  }

  /**
   * Creates a new production batch when fresh food or packaged items are made/received
   */
  static async createBatch(params: CreateBatchParams, targetDb?: KiranaDatabase): Promise<ProductionBatch> {
    let activeDb = targetDb || getActiveDb();
    let product = await activeDb.products.get(params.productId);
    if (!product) {
      const otherDb = activeDb === kiranaDb ? homemadeDb : kiranaDb;
      const foundInOther = await otherDb.products.get(params.productId);
      if (foundInOther) {
        activeDb = otherDb;
        product = foundInOther;
      }
    }
    if (!product) {
      throw new Error(`Product not found: ${params.productId}`);
    }

    const qty = roundQty(params.qty);
    if (qty <= 0) {
      throw new Error('Batch quantity must be greater than zero');
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const shelfLife = params.shelfLifeDays ?? product.shelf_life_days ?? 3;
    const expiresAt = new Date(now.getTime() + shelfLife * 24 * 60 * 60 * 1000).toISOString();
    const batchCode = params.batchCode || (await this.generateBatchCode(activeDb));

    const batch: ProductionBatch = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: product.shop_id || getActiveShopId(),
      business_type: product.business_type || getActiveBusinessType(),
      product_id: product.id,
      batch_code: batchCode,
      initial_qty: qty,
      remaining_qty: qty,
      unit_type: params.unitType || product.unit_type,
      unit_production_cost: roundCurrency(params.unitProductionCost || product.purchase_price),
      produced_at: nowIso,
      shelf_life_days: shelfLife,
      expires_at: expiresAt,
      status: 'ACTIVE',
      notes: params.notes,
      created_at: nowIso,
    };

    await activeDb.production_batches.add(batch);
    return batch;
  }

  /**
   * Deducts quantity strictly FIFO (oldest produced batch first) upon sale
   */
  static async deductFifoStock(productId: string, qtyToDeduct: number, targetDb?: KiranaDatabase): Promise<BatchDeductionResult[]> {
    let activeDb = targetDb || getActiveDb();
    let activeBatches = await activeDb.production_batches
      .where('product_id')
      .equals(productId)
      .filter((b) => b.status === 'ACTIVE' && b.remaining_qty > 0)
      .sortBy('produced_at');

    if (activeBatches.length === 0) {
      const otherDb = activeDb === kiranaDb ? homemadeDb : kiranaDb;
      const otherBatches = await otherDb.production_batches
        .where('product_id')
        .equals(productId)
        .filter((b) => b.status === 'ACTIVE' && b.remaining_qty > 0)
        .sortBy('produced_at');
      if (otherBatches.length > 0) {
        activeDb = otherDb;
        activeBatches = otherBatches;
      }
    }

    let needed = roundQty(qtyToDeduct);
    const results: BatchDeductionResult[] = [];

    for (const batch of activeBatches) {
      if (needed <= 0) break;

      const deductFromBatch = Math.min(batch.remaining_qty, needed);
      const newRemaining = roundQty(batch.remaining_qty - deductFromBatch);
      needed = roundQty(needed - deductFromBatch);

      const newStatus = newRemaining <= 0 ? 'EXHAUSTED' : 'ACTIVE';
      await activeDb.production_batches.update(batch.id, {
        remaining_qty: newRemaining,
        status: newStatus,
      });

      results.push({
        batchId: batch.id,
        batchCode: batch.batch_code,
        deductedQty: deductFromBatch,
        remainingInBatch: newRemaining,
      });
    }

    return results;
  }

  /**
   * Scans active batches and reports shelf life & expiration status:
   * - Red Alert: Already Expired
   * - Amber Alert: Expiring within 24 hours
   */
  static async getExpiryAlerts(targetDb?: KiranaDatabase): Promise<ExpiryAlertItem[]> {
    const activeDb = targetDb || getActiveDb();
    const nowMs = Date.now();
    const msInHour = 60 * 60 * 1000;
    const msIn24Hours = 24 * msInHour;

    const batches = await activeDb.production_batches
      .filter((b) => b.status === 'ACTIVE' && b.remaining_qty > 0)
      .toArray();

    if (batches.length === 0 && !targetDb) {
      const otherDb = activeDb === kiranaDb ? homemadeDb : kiranaDb;
      const otherBatches = await otherDb.production_batches
        .filter((b) => b.status === 'ACTIVE' && b.remaining_qty > 0)
        .toArray();
      batches.push(...otherBatches);
    }

    const alerts: ExpiryAlertItem[] = [];

    for (const batch of batches) {
      const expiresMs = new Date(batch.expires_at).getTime();
      const diffMs = expiresMs - nowMs;
      const hoursRemaining = Math.round(diffMs / msInHour);

      let product = await activeDb.products.get(batch.product_id);
      if (!product) {
        const otherDb = activeDb === kiranaDb ? homemadeDb : kiranaDb;
        product = await otherDb.products.get(batch.product_id);
      }
      if (!product) continue;

      if (diffMs <= 0) {
        alerts.push({
          batch,
          product,
          hoursRemaining,
          isExpired: true,
          alertSeverity: 'CRITICAL_EXPIRED',
        });
      } else if (diffMs <= msIn24Hours) {
        alerts.push({
          batch,
          product,
          hoursRemaining,
          isExpired: false,
          alertSeverity: 'WARNING_24H',
        });
      }
    }

    return alerts.sort((a, b) => a.hoursRemaining - b.hoursRemaining);
  }

  /**
   * 1-Click Spoilage Loss Logging
   */
  static async logBatchSpoilage(params: {
    batchId: string;
    spoiledQty?: number;
    reason?: string;
    loggedBy?: string;
  }, targetDb?: KiranaDatabase): Promise<{
    batch: ProductionBatch;
    spoiledQty: number;
    lossAmount: number;
    inventoryLog: InventoryLog;
  }> {
    let activeDb = targetDb || getActiveDb();
    let batch = await activeDb.production_batches.get(params.batchId);
    if (!batch) {
      const otherDb = activeDb === kiranaDb ? homemadeDb : kiranaDb;
      const foundInOther = await otherDb.production_batches.get(params.batchId);
      if (foundInOther) {
        activeDb = otherDb;
        batch = foundInOther;
      }
    }
    if (!batch) {
      throw new Error(`Batch not found: ${params.batchId}`);
    }

    const available = roundQty(batch.remaining_qty);
    if (available <= 0) {
      throw new Error(`Batch ${batch.batch_code} has no remaining quantity to spoil`);
    }

    const spoiled = roundQty(params.spoiledQty !== undefined ? Math.min(params.spoiledQty, available) : available);
    const unitCost = roundCurrency(batch.unit_production_cost);
    const lossPaise = Math.round(spoiled * toPaise(unitCost));
    const lossAmount = toRupees(lossPaise);

    const nowIso = new Date().toISOString();
    const newBatchRemaining = roundQty(available - spoiled);
    const newStatus = newBatchRemaining <= 0 ? 'SPOILED' : 'ACTIVE';

    await activeDb.production_batches.update(batch.id, {
      remaining_qty: newBatchRemaining,
      status: newStatus,
    });

    const product = await activeDb.products.get(batch.product_id);
    if (product) {
      const newStock = roundQty(Math.max(0, product.current_stock - spoiled));
      await activeDb.products.update(product.id, {
        current_stock: newStock,
        updated_at: nowIso,
      });
    }

    const invLog: InventoryLog = {
      id: `log-spoil-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: batch.shop_id,
      business_type: batch.business_type,
      product_id: batch.product_id,
      change_qty: -spoiled,
      reason_type: 'DAMAGE_EXPIRED_OUT',
      unit_cost_at_time: unitCost,
      reference_id: batch.batch_code,
      notes: `Batch ${batch.batch_code} spoiled write-off: ${spoiled} ${batch.unit_type}. ${params.reason || 'Shelf-life expired'}`.trim(),
      created_at: nowIso,
    };
    await activeDb.inventory_logs.add(invLog);

    const expense: ExpenseAndDrawing = {
      id: `exp-spoil-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: batch.shop_id,
      business_type: batch.business_type,
      entry_type: 'BUSINESS_EXPENSE',
      category: 'SHOP_EXPENSE_RENT_ELEC',
      amount: lossAmount,
      paid_via: 'INVENTORY_DEDUCTION',
      description: `Spoilage Loss: ${product?.name || 'Batch'} (${batch.batch_code}) - ${spoiled} ${batch.unit_type} @ ₹${unitCost}`.trim(),
      created_at: nowIso,
    };
    await activeDb.expenses_and_drawings.add(expense);

    const audit: SecurityAuditLog = {
      id: `audit-spoil-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: batch.shop_id,
      business_type: batch.business_type,
      event_type: 'SPOILED_BATCH_LOGGED',
      cashier_name: params.loggedBy || 'Store Operator',
      action_summary: `Written off ${spoiled} ${batch.unit_type} from batch ${batch.batch_code} (Loss: ₹${lossAmount})`,
      metadata: {
        batchId: batch.id,
        batchCode: batch.batch_code,
        productId: batch.product_id,
        spoiledQty: spoiled,
        lossAmount,
      },
      timestamp: nowIso,
    };
    await activeDb.security_audit_logs.add(audit);

    return {
      batch: { ...batch, remaining_qty: newBatchRemaining, status: newStatus },
      spoiledQty: spoiled,
      lossAmount,
      inventoryLog: invLog,
    };
  }
}
