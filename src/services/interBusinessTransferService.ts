import { kiranaDb, homemadeDb, db } from '../db/db';
import {
  Product,
  InventoryLog,
  ExpenseAndDrawing,
  SecurityAuditLog,
} from '../types';
import { roundCurrency, roundQty, toPaise, toRupees } from '../utils/math';
import { getActiveShopId, getHomemadeShopIdForOwner } from '../utils/businessFirewall';

export interface TransferStockParams {
  kiranaProductId: string;
  transferQty: number; // Positive quantity to transfer out of Kirana into Gruh Udyog
  targetProductName?: string; // Optional name in Homemade DB
  notes?: string;
  transferredBy?: string;
}

export interface TransferStockResult {
  success: boolean;
  kiranaProduct: Product;
  transferredQty: number;
  transferCost: number; // Total cost in rupees at raw Kirana purchase price
  expenseRecord: ExpenseAndDrawing;
  kiranaLog: InventoryLog;
  homemadeProduct?: Product;
}

export class InterBusinessTransferService {
  /**
   * Executes a controlled stock transfer from Kirana Store to Gruh Udyog at raw wholesale cost.
   * Zero markup is applied so Homemade Food COGS reflects actual acquisition expense.
   */
  static async transferKiranaToHomemade(params: TransferStockParams): Promise<TransferStockResult> {
    if (params.transferQty <= 0) {
      throw new Error('Transfer quantity must be greater than zero');
    }

    const qty = roundQty(params.transferQty);
    const nowIso = new Date().toISOString();

    // 1. Fetch Kirana Product
    const kiranaProduct = await kiranaDb.products.get(params.kiranaProductId);
    if (!kiranaProduct) {
      throw new Error(`Kirana product not found with ID: ${params.kiranaProductId}`);
    }

    if (kiranaProduct.current_stock < qty) {
      console.warn(
        `Warning: Kirana product ${kiranaProduct.name} stock (${kiranaProduct.current_stock}) is lower than requested transfer (${qty}). Proceeding with stock adjustment.`
      );
    }

    const unitCost = roundCurrency(kiranaProduct.purchase_price);
    const totalCostPaise = Math.round(qty * toPaise(unitCost));
    const totalCost = toRupees(totalCostPaise);

    const kiranaShopId = kiranaProduct.shop_id || getActiveShopId();
    const homemadeShopId = getHomemadeShopIdForOwner(kiranaShopId);

    // 2. Decrement Kirana Stock & Create InventoryLog
    const newKiranaStock = roundQty(kiranaProduct.current_stock - qty);
    await kiranaDb.products.update(kiranaProduct.id, {
      current_stock: newKiranaStock,
      updated_at: nowIso,
    });

    const kiranaLog: InventoryLog = {
      id: `log-xfer-out-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      product_id: kiranaProduct.id,
      change_qty: -qty,
      reason_type: 'SELF_USE_OUT',
      unit_cost_at_time: unitCost,
      notes: `Transfer to Gruh Udyog kitchen (${qty} ${kiranaProduct.unit_type} @ ₹${unitCost}). ${params.notes || ''}`.trim(),
      created_at: nowIso,
    };
    await kiranaDb.inventory_logs.add(kiranaLog);

    // 3. In Homemade Food: Record Raw Material Expense via INVENTORY_DEDUCTION
    const expenseRecord: ExpenseAndDrawing = {
      id: `exp-xfer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: homemadeShopId,
      business_type: 'HOMEMADE_FOOD',
      entry_type: 'RAW_MATERIAL_EXPENSE',
      category: 'RAW_MATERIAL_INGREDIENTS',
      amount: totalCost,
      paid_via: 'INVENTORY_DEDUCTION',
      description: `Raw Material from Kirana: ${kiranaProduct.name} (${qty} ${kiranaProduct.unit_type} @ ₹${unitCost}). ${params.notes || ''}`.trim(),
      created_at: nowIso,
    };
    await homemadeDb.expenses_and_drawings.add(expenseRecord);

    // 4. In Homemade Food: Find or Create the raw material ingredient product in Homemade DB
    const targetName = params.targetProductName || kiranaProduct.name;
    let hmProduct = await homemadeDb.products
      .filter((p) => p.name.toLowerCase() === targetName.toLowerCase() || p.barcode === kiranaProduct.barcode)
      .first();

    if (hmProduct) {
      const newHmStock = roundQty(hmProduct.current_stock + qty);
      await homemadeDb.products.update(hmProduct.id, {
        current_stock: newHmStock,
        purchase_price: unitCost,
        updated_at: nowIso,
      });
      hmProduct = { ...hmProduct, current_stock: newHmStock, purchase_price: unitCost };
    } else {
      const newHmId = `hm-raw-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      hmProduct = {
        id: newHmId,
        shop_id: homemadeShopId,
        business_type: 'HOMEMADE_FOOD',
        name: targetName,
        marathi_name: kiranaProduct.marathi_name,
        short_code: `RM${Math.floor(10 + Math.random() * 90)}`,
        barcode: kiranaProduct.barcode ? `HM-${kiranaProduct.barcode}` : `HM-${Date.now().toString().slice(-6)}`,
        category: 'Homemade Food / Gruh Udyog',
        unit_type: kiranaProduct.unit_type,
        purchase_price: unitCost,
        selling_price: roundCurrency(unitCost * 1.2), // Default selling/transfer estimate
        mrp: roundCurrency(unitCost * 1.2),
        current_stock: qty,
        low_stock_threshold: 1,
        last_supplier_name: 'Kirana Store Internal Transfer',
        is_quick_tap: false,
        raw_material_cost: unitCost,
        updated_at: nowIso,
      };
      await homemadeDb.products.add(hmProduct);
    }

    // 5. In Homemade Food: Add InventoryLog for inward raw material
    const hmLog: InventoryLog = {
      id: `log-xfer-in-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: homemadeShopId,
      business_type: 'HOMEMADE_FOOD',
      product_id: hmProduct.id,
      change_qty: qty,
      reason_type: 'PURCHASE_IN',
      unit_cost_at_time: unitCost,
      reference_id: expenseRecord.id,
      notes: `Received from Kirana store: ${qty} ${kiranaProduct.unit_type} @ ₹${unitCost}`,
      created_at: nowIso,
    };
    await homemadeDb.inventory_logs.add(hmLog);

    // 6. Security & Operational Audit Log
    const auditLog: SecurityAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      event_type: 'STOCK_TRANSFER_AUDIT',
      cashier_name: params.transferredBy || 'Store Owner',
      action_summary: `Transferred ${qty} ${kiranaProduct.unit_type} of ${kiranaProduct.name} to Gruh Udyog @ ₹${unitCost} (Total: ₹${totalCost})`,
      metadata: {
        kiranaProductId: kiranaProduct.id,
        homemadeProductId: hmProduct.id,
        transferQty: qty,
        unitCost,
        totalCost,
      },
      timestamp: nowIso,
    };
    await kiranaDb.security_audit_logs.add(auditLog);

    return {
      success: true,
      kiranaProduct: { ...kiranaProduct, current_stock: newKiranaStock },
      transferredQty: qty,
      transferCost: totalCost,
      expenseRecord,
      kiranaLog,
      homemadeProduct: hmProduct,
    };
  }

  /**
   * Retrieves all transfer audit history across businesses
   */
  static async getTransferHistory(): Promise<SecurityAuditLog[]> {
    return await kiranaDb.security_audit_logs
      .where('event_type')
      .equals('STOCK_TRANSFER_AUDIT')
      .reverse()
      .sortBy('timestamp');
  }
}

