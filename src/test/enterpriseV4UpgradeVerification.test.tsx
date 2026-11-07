import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { kiranaDb, homemadeDb } from '../db/db';
import { InterBusinessTransferService } from '../services/interBusinessTransferService';
import { BatchFifoService } from '../services/batchFifoService';
import { RecipeBomService } from '../services/recipeBomService';
import { WholesalerPurchaseService } from '../services/wholesalerPurchaseService';
import { SalesReturnService } from '../services/salesReturnService';
import { SecurityAuditService } from '../services/securityAuditService';
import { BillingService } from '../services/billingService';
import { HomemadeFoodService } from '../services/homemadeFoodService';
import {
  Product,
  Wholesaler,
  Customer,
  DailyGallaSession,
  AdvanceOrder,
} from '../types';
import { toPaise, toRupees, roundCurrency, roundQty } from '../utils/math';

describe('Enterprise POS v4.0.0 Upgrade Verification Suite', () => {
  beforeEach(async () => {
    // Clean slate for testing
    await kiranaDb.clearAllRecordsToEmpty();
    await homemadeDb.clearAllRecordsToEmpty();

    // Setup Shop Profiles
    await kiranaDb.updateShopProfile({
      id: 'current_shop',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      invoice_prefix: 'KRN',
      shop_name: 'Laxminivas Kirana Supermarket',
      owner_name: 'Laxminivas',
      phone: '9876543210',
      upi_vpa: 'laxminivas@upi',
      address: 'Shop 4, Market Yard, Pune',
      gst_footer_note: 'Thank you!',
      updated_at: new Date().toISOString(),
    });

    await homemadeDb.updateShopProfile({
      id: 'homemade_food_shop',
      shop_id: 'current_shop-484d-4600-000000000001',
      business_type: 'HOMEMADE_FOOD',
      invoice_prefix: 'HMF',
      shop_name: 'Shree Ganesh Gruh Udyog',
      owner_name: 'Laxminivas',
      phone: '9876543210',
      upi_vpa: 'laxminivas@upi',
      address: 'Shop 4 Kitchen, Market Yard, Pune',
      gst_footer_note: 'Fresh Homemade Goodness',
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // =========================================================================
  // Module 1: Controlled Inter-Business Stock Transfer Bridge
  // =========================================================================
  it('Module 1: Transfers raw ingredients from Kirana to Gruh Udyog at exact raw purchase cost (0 markup)', async () => {
    // 1. Setup raw ingredient in Kirana Store
    const besanKirana: Product = {
      id: 'prod-besan-kirana',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      name: 'Chana Besan (Flour)',
      marathi_name: 'हरभरा डाळ पीठ',
      short_code: 'BSN1',
      barcode: '8901234001',
      category: 'Grains & Flours',
      unit_type: 'KG_LOOSE',
      purchase_price: 80.0, // Wholesale buy rate
      selling_price: 95.0, // Retail price
      mrp: 100.0,
      current_stock: 50.0, // 50 kg available
      low_stock_threshold: 5.0,
      last_supplier_name: 'APMC Grain Merchant',
      is_quick_tap: false,
      updated_at: new Date().toISOString(),
    };
    await kiranaDb.products.add(besanKirana);

    // 2. Transfer 15 kg of Besan to Gruh Udyog Kitchen
    const result = await InterBusinessTransferService.transferKiranaToHomemade({
      kiranaProductId: besanKirana.id,
      transferQty: 15.0,
      targetProductName: 'Gram Flour (Besan)',
      notes: 'Festival Besan Laddu production batch',
    });

    expect(result.success).toBe(true);
    expect(result.transferredQty).toBe(15.0);
    // 15 kg * ₹80.00 = ₹1,200.00
    expect(result.transferCost).toBe(1200.0);

    // 3. Verify Kirana DB deductions
    const updatedKirana = await kiranaDb.products.get(besanKirana.id);
    expect(updatedKirana?.current_stock).toBe(35.0); // 50 - 15 = 35 kg

    const kiranaLog = await kiranaDb.inventory_logs
      .where('product_id')
      .equals(besanKirana.id)
      .first();
    expect(kiranaLog?.change_qty).toBe(-15.0);
    expect(kiranaLog?.reason_type).toBe('SELF_USE_OUT');
    expect(kiranaLog?.unit_cost_at_time).toBe(80.0);

    // 4. Verify Homemade DB Raw Material Expense & Inward
    const hmExpense = await homemadeDb.expenses_and_drawings
      .where('entry_type')
      .equals('RAW_MATERIAL_EXPENSE')
      .first();
    expect(hmExpense).toBeDefined();
    expect(hmExpense?.amount).toBe(1200.0);
    expect(hmExpense?.paid_via).toBe('INVENTORY_DEDUCTION');

    const hmProduct = await homemadeDb.products.get(result.homemadeProduct!.id);
    expect(hmProduct).toBeDefined();
    expect(hmProduct?.current_stock).toBe(15.0);
    expect(hmProduct?.purchase_price).toBe(80.0);

    // 5. Verify Security Audit Log
    const auditLogs = await InterBusinessTransferService.getTransferHistory();
    expect(auditLogs.length).toBeGreaterThan(0);
    expect(auditLogs[0].event_type).toBe('STOCK_TRANSFER_AUDIT');
    expect(auditLogs[0].action_summary).toContain('Transferred 15 KG_LOOSE');
  });

  // =========================================================================
  // Module 2: Batch-Level FIFO Expiry, Shelf-Life Alerts & Spoilage Engine
  // =========================================================================
  it('Module 2: Manages fresh production batches, executes FIFO deduction on sale, alerts expiry & logs spoilage', async () => {
    // 1. Setup Homemade Food product
    const ladduProd: Product = {
      id: 'prod-laddu-hmf',
      shop_id: 'current_shop-484d-4600-000000000001',
      business_type: 'HOMEMADE_FOOD',
      name: 'Besan Laddu (Pure Cow Ghee)',
      marathi_name: 'बेसन लाडू',
      short_code: 'LAD1',
      barcode: 'HMF-LAD-01',
      category: 'Traditional Laddus (लाडू)',
      unit_type: 'KG_LOOSE',
      purchase_price: 350.0, // Production cost
      selling_price: 550.0,
      mrp: 600.0,
      current_stock: 20.0,
      low_stock_threshold: 2.0,
      last_supplier_name: 'Own Kitchen',
      shelf_life_days: 7,
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    await homemadeDb.products.add(ladduProd);

    // 2. Create Batch 1: Made 2 days ago, 10 kg
    const batch1 = await BatchFifoService.createBatch({
      productId: ladduProd.id,
      qty: 10.0,
      unitType: 'KG_LOOSE',
      unitProductionCost: 350.0,
      shelfLifeDays: 5,
      batchCode: 'BATCH-20261105-001',
    });
    // Manually backdate batch 1 produced_at
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await homemadeDb.production_batches.update(batch1.id, {
      produced_at: twoDaysAgo,
    });

    // 3. Create Batch 2: Made today, 10 kg
    const batch2 = await BatchFifoService.createBatch({
      productId: ladduProd.id,
      qty: 10.0,
      unitType: 'KG_LOOSE',
      unitProductionCost: 350.0,
      shelfLifeDays: 7,
      batchCode: 'BATCH-20261107-002',
    });

    // 4. Test FIFO Stock Deduction: Customer buys 12 kg
    // Batch 1 (oldest) should exhaust completely (10 kg), Batch 2 should deduct 2 kg
    const deductions = await BatchFifoService.deductFifoStock(ladduProd.id, 12.0);
    expect(deductions.length).toBe(2);
    expect(deductions[0].batchCode).toBe('BATCH-20261105-001');
    expect(deductions[0].deductedQty).toBe(10.0);
    expect(deductions[0].remainingInBatch).toBe(0.0);

    expect(deductions[1].batchCode).toBe('BATCH-20261107-002');
    expect(deductions[1].deductedQty).toBe(2.0);
    expect(deductions[1].remainingInBatch).toBe(8.0);

    const checkBatch1 = await homemadeDb.production_batches.get(batch1.id);
    expect(checkBatch1?.status).toBe('EXHAUSTED');

    const checkBatch2 = await homemadeDb.production_batches.get(batch2.id);
    expect(checkBatch2?.status).toBe('ACTIVE');
    expect(checkBatch2?.remaining_qty).toBe(8.0);

    // 5. Create an Expiring Batch (expires in 12 hours) to test alert
    const nearExpiryBatch = await BatchFifoService.createBatch({
      productId: ladduProd.id,
      qty: 3.0,
      unitType: 'KG_LOOSE',
      unitProductionCost: 350.0,
      shelfLifeDays: 1,
      batchCode: 'BATCH-EXP-003',
    });
    const expiringIn12Hours = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    await homemadeDb.production_batches.update(nearExpiryBatch.id, {
      expires_at: expiringIn12Hours,
    });

    const alerts = await BatchFifoService.getExpiryAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    const targetAlert = alerts.find((a) => a.batch.batch_code === 'BATCH-EXP-003');
    expect(targetAlert).toBeDefined();
    expect(targetAlert?.alertSeverity).toBe('WARNING_24H');
    expect(targetAlert?.hoursRemaining).toBeLessThanOrEqual(24);

    // 6. Test 1-Click Spoilage Loss Logging
    const spoilRes = await BatchFifoService.logBatchSpoilage({
      batchId: nearExpiryBatch.id,
      reason: 'Quality degraded past shelf life',
    });

    expect(spoilRes.spoiledQty).toBe(3.0);
    // 3 kg * ₹350 = ₹1,050.00
    expect(spoilRes.lossAmount).toBe(1050.0);
    expect(spoilRes.batch.status).toBe('SPOILED');

    const invLog = await homemadeDb.inventory_logs.get(spoilRes.inventoryLog.id);
    expect(invLog?.reason_type).toBe('DAMAGE_EXPIRED_OUT');
    expect(invLog?.change_qty).toBe(-3.0);
  });

  // =========================================================================
  // Module 3: Recipe Bill of Materials & Festival Advance Order Prep Calculator
  // =========================================================================
  it('Module 3: Aggregates festival advance bookings against current inventory and calculates raw material BOM procurement deficits', async () => {
    // 1. Setup Besan Laddu with Recipe BOM
    const besanLaddu: Product = {
      id: 'prod-diwali-laddu',
      shop_id: 'current_shop-484d-4600-000000000001',
      business_type: 'HOMEMADE_FOOD',
      name: 'Diwali Special Besan Laddu',
      short_code: 'DWLAD',
      barcode: 'HMF-DW-01',
      category: 'Traditional Laddus (लाडू)',
      unit_type: 'KG_LOOSE',
      purchase_price: 350.0,
      selling_price: 550.0,
      mrp: 600.0,
      current_stock: 5.0, // Only 5 kg ready in stock
      low_stock_threshold: 1.0,
      last_supplier_name: 'Kitchen',
      is_quick_tap: true,
      recipe_bom: [
        { name: 'Gram Flour (Besan)', qty_required: 0.500, unit: 'KG_LOOSE', cost_estimate: 80 },
        { name: 'Pure Cow Ghee', qty_required: 0.300, unit: 'KG_LOOSE', cost_estimate: 600 },
        { name: 'Powdered Sugar', qty_required: 0.400, unit: 'KG_LOOSE', cost_estimate: 42 },
      ],
      updated_at: new Date().toISOString(),
    };
    await homemadeDb.products.add(besanLaddu);

    // 2. Setup Raw Material Inventory Product in stock
    const cowGhee: Product = {
      id: 'prod-cow-ghee-rm',
      shop_id: 'current_shop-484d-4600-000000000001',
      business_type: 'HOMEMADE_FOOD',
      name: 'Pure Cow Ghee',
      short_code: 'CWGHE',
      barcode: 'HMF-GHEE-01',
      category: 'Homemade Food / Gruh Udyog',
      unit_type: 'KG_LOOSE',
      purchase_price: 600.0,
      selling_price: 700.0,
      mrp: 750.0,
      current_stock: 2.0, // 2 kg Ghee already in kitchen
      low_stock_threshold: 1.0,
      last_supplier_name: 'Kirana Stock Transfer',
      is_quick_tap: false,
      updated_at: new Date().toISOString(),
    };
    await homemadeDb.products.add(cowGhee);

    // 3. Create Festival Advance Orders: 25 kg total Besan Laddu ordered
    const order1: AdvanceOrder = {
      id: 'adv-order-01',
      shop_id: 'current_shop-484d-4600-000000000001',
      business_type: 'HOMEMADE_FOOD',
      order_number: 'ADV-20261107-001',
      customer_name: 'Mrs. Kulkarni',
      customer_phone: '9822011223',
      delivery_date: '2026-11-10',
      delivery_date_time: '2026-11-10 10:00 AM',
      items_json: [
        { product_id: besanLaddu.id, product_name: besanLaddu.name, qty: 15.0, unit_type: 'KG_LOOSE', line_total: 8250 },
      ],
      items: [
        { product_id: besanLaddu.id, product_name: besanLaddu.name, qty: 15.0, unit_type: 'KG_LOOSE', line_total: 8250 },
      ],
      total_amount: 8250,
      advance_paid: 2000,
      advance_token_paid: 2000,
      balance_due: 6250,
      payment_mode: 'UPI',
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const order2: AdvanceOrder = {
      id: 'adv-order-02',
      shop_id: 'current_shop-484d-4600-000000000001',
      business_type: 'HOMEMADE_FOOD',
      order_number: 'ADV-20261107-002',
      customer_name: 'Mr. Deshmukh',
      customer_phone: '9822044556',
      delivery_date: '2026-11-10',
      delivery_date_time: '2026-11-10 04:00 PM',
      items_json: [
        { product_id: besanLaddu.id, product_name: besanLaddu.name, qty: 10.0, unit_type: 'KG_LOOSE', line_total: 5500 },
      ],
      items: [
        { product_id: besanLaddu.id, product_name: besanLaddu.name, qty: 10.0, unit_type: 'KG_LOOSE', line_total: 5500 },
      ],
      total_amount: 5500,
      advance_paid: 1000,
      advance_token_paid: 1000,
      balance_due: 4500,
      payment_mode: 'CASH',
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await homemadeDb.advance_orders.bulkAdd([order1, order2]);

    // 4. Calculate Kitchen Prep Requirements Sheet
    const sheet = await RecipeBomService.calculateKitchenPrepRequirements();
    expect(sheet.totalOrdersCount).toBe(2);

    // Finished Goods check: 15 + 10 = 25 kg ordered. 5 kg in stock -> 20 kg net target!
    const targetProd = sheet.productRequirements.find((p) => p.productId === besanLaddu.id);
    expect(targetProd).toBeDefined();
    expect(targetProd?.totalOrderedQty).toBe(25.0);
    expect(targetProd?.currentStock).toBe(5.0);
    expect(targetProd?.netProductionNeeded).toBe(20.0);

    // Raw Material explosion for 20 kg production:
    // Ghee needed = 20 kg * 0.300 = 6.000 kg.
    // Ghee in stock = 2.000 kg.
    // Deficit needed = 6.000 - 2.000 = 4.000 kg!
    const gheeSummary = sheet.rawMaterialsSummary.find((m) => m.materialName === 'Pure Cow Ghee');
    expect(gheeSummary).toBeDefined();
    expect(gheeSummary?.totalQtyNeeded).toBe(6.0);
    expect(gheeSummary?.currentStock).toBe(2.0);
    expect(gheeSummary?.deficitQty).toBe(4.0);

    // Besan needed = 20 kg * 0.500 = 10.000 kg
    const besanSummary = sheet.rawMaterialsSummary.find((m) => m.materialName === 'Gram Flour (Besan)');
    expect(besanSummary).toBeDefined();
    expect(besanSummary?.totalQtyNeeded).toBe(10.0);

    expect(sheet.totalEstimatedRawMaterialCost).toBeGreaterThan(0);
  });

  // =========================================================================
  // Module 4: Wholesaler Purchase Inward (GRN) & Weighted-Average Costing
  // =========================================================================
  it('Module 4: Inwards stock via GRN, recalculates exact weighted-average costs in integer paise, and updates Galla/Khata', async () => {
    // 1. Setup Wholesaler
    const wholesaler: Wholesaler = {
      id: 'ws-rameshwar-01',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      name: 'Rameshwar Wholesale Traders',
      phone: '9822112233',
      agency_or_brand: 'APMC Pulses Distributor',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    await kiranaDb.wholesalers.add(wholesaler);

    // 2. Setup Daily Galla session
    const today = new Date().toISOString().slice(0, 10);
    const galla: DailyGallaSession = {
      id: 'galla-today',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      session_date: today,
      opening_cash: 5000.0,
      cash_sales_total: 2000.0,
      cash_udhari_recovered: 0.0,
      cash_expenses_out: 0.0,
      expected_closing_cash: 7000.0,
    };
    await kiranaDb.daily_galla_sessions.add(galla);

    // 3. Setup Product with initial stock 10 units @ ₹40.00
    const toorDal: Product = {
      id: 'prod-toor-dal',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      name: 'Premium Toor Dal',
      short_code: 'TD1',
      barcode: '8901001',
      category: 'Dals & Pulses',
      unit_type: 'KG_LOOSE',
      purchase_price: 40.0, // Old cost: ₹40.00
      selling_price: 65.0,
      mrp: 70.0,
      current_stock: 10.0, // 10 kg
      low_stock_threshold: 2.0,
      last_supplier_name: 'Local Mandi',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    await kiranaDb.products.add(toorDal);

    // 4. Inward 20 kg @ ₹55.00
    // Weighted Average Math:
    // Old Value = 10 * 40 = ₹400
    // New Value = 20 * 55 = ₹1100
    // Total Value = ₹1500
    // Total Stock = 30 kg
    // C_avg = 1500 / 30 = ₹50.00 exactly!
    const inwardRes = await WholesalerPurchaseService.processPurchaseInward({
      wholesalerId: wholesaler.id,
      invoiceNumber: 'GRN-20261107-001',
      items: [
        {
          productId: toorDal.id,
          qty: 20.0,
          purchasePrice: 55.0,
          sellingPrice: 75.0,
        },
      ],
      paymentMode: 'SPLIT',
      amountPaid: 500.0, // ₹500 cash paid immediately from Galla
      notes: 'New crop arrivals',
    });

    expect(inwardRes.invoice.grand_total).toBe(1100.0);
    expect(inwardRes.invoice.amount_paid).toBe(500.0);
    expect(inwardRes.invoice.balance_due).toBe(600.0);

    // 5. Verify product updated stock & weighted average cost
    const updatedProd = await kiranaDb.products.get(toorDal.id);
    expect(updatedProd?.current_stock).toBe(30.0);
    expect(updatedProd?.purchase_price).toBe(50.0); // Exactly ₹50.00!

    // 6. Verify Galla deduction for the ₹500 cash payment
    const updatedGalla = await kiranaDb.daily_galla_sessions.get(galla.id);
    expect(updatedGalla?.cash_expenses_out).toBe(500.0);
    expect(updatedGalla?.expected_closing_cash).toBe(6500.0); // 7000 - 500 = 6500

    // 7. Verify Wholesaler Khata balance due (₹600 credit)
    expect(inwardRes.khataTransaction).toBeDefined();
    expect(inwardRes.khataTransaction?.entry_type).toBe('PURCHASE_CREDIT_DUE');
    expect(inwardRes.khataTransaction?.amount).toBe(600.0);
    expect(inwardRes.khataTransaction?.running_balance_after).toBe(600.0);

    // 8. Settle partial payment of ₹300 later to Wholesaler
    const settleTx = await WholesalerPurchaseService.recordWholesalerPayment({
      wholesalerId: wholesaler.id,
      amount: 300.0,
      paymentChannel: 'CASH',
      notes: 'Part payment cash',
    });

    expect(settleTx.entry_type).toBe('PAYMENT_MADE_SETTLED');
    expect(settleTx.running_balance_after).toBe(300.0); // 600 - 300 = 300 due
  });

  // =========================================================================
  // Module 5: Partial Sales Returns, Exchanges & Multi-Device Prefixed IDs
  // =========================================================================
  it('Module 5: Issues itemized partial sales return, restores stock, adjusts Galla/Udhari & formats device-prefixed IDs', async () => {
    // 1. Setup products
    const dal: Product = {
      id: 'prod-ret-dal',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      name: 'Moong Dal',
      short_code: 'MD1',
      barcode: '8902001',
      category: 'Dals & Pulses',
      unit_type: 'KG_LOOSE',
      purchase_price: 90.0,
      selling_price: 120.0,
      mrp: 130.0,
      current_stock: 10.0,
      low_stock_threshold: 1.0,
      last_supplier_name: 'APMC',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    const biscuit: Product = {
      id: 'prod-ret-biscuit',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      name: 'Parle-G 250g',
      short_code: 'PG250',
      barcode: '8902002',
      category: 'Packaged Food & Snacks',
      unit_type: 'PCS',
      purchase_price: 20.0,
      selling_price: 25.0,
      mrp: 25.0,
      current_stock: 20.0,
      low_stock_threshold: 2.0,
      last_supplier_name: 'Parle Agency',
      is_quick_tap: true,
      updated_at: new Date().toISOString(),
    };
    await kiranaDb.products.bulkAdd([dal, biscuit]);

    // 2. Setup Customer with existing Udhari
    const customer: Customer = {
      id: 'cust-sharma',
      shop_id: 'current_shop',
      business_type: 'KIRANA_RETAIL',
      name: 'Rajesh Sharma',
      phone: '9822998877',
      credit_limit: 5000,
      current_udhari_balance: 500, // ₹500 outstanding
      created_at: new Date().toISOString(),
    };
    await kiranaDb.customers.add(customer);

    // 3. Checkout Bill with 2 kg Moong Dal (@ ₹120 = ₹240) + 2 PCS Parle-G (@ ₹25 = ₹50) = ₹290
    // Paid ₹90 cash + ₹200 added to Udhari
    const checkoutRes = await BillingService.executeCheckout({
      customerId: customer.id,
      items: [
        { product: dal, qty: 2.0, unit_selling_price: 120.0, unit_purchase_cost: 90.0, line_total: 240.0 },
        { product: biscuit, qty: 2.0, unit_selling_price: 25.0, unit_purchase_cost: 20.0, line_total: 50.0 },
      ],
      subtotalAmount: 290.0,
      discountRoundoff: 0.0,
      paymentMode: 'SPLIT_PARTIAL',
      amountPaidNow: 90.0,
      udhariAdded: 200.0,
    });

    // Check stocks after checkout
    const dalAfterSale = await kiranaDb.products.get(dal.id);
    expect(dalAfterSale?.current_stock).toBe(8.0); // 10 - 2 = 8

    // Customer balance after checkout = 500 + 200 = ₹700
    const custAfterSale = await kiranaDb.customers.get(customer.id);
    expect(custAfterSale?.current_udhari_balance).toBe(700.0);

    // 4. Partial Return: Customer returns 1 kg of Moong Dal (value ₹120)
    // Refund mode: UDHARI_CREDIT (reduces Rajesh Sharma's debt)
    const dalSaleItem = checkoutRes.saleItems.find((i) => i.product_id === dal.id);
    expect(dalSaleItem).toBeDefined();

    const returnRes = await SalesReturnService.executePartialReturn({
      invoiceId: checkoutRes.invoice.id,
      itemsToReturn: [
        {
          saleItemId: dalSaleItem!.id,
          returnQty: 1.0,
        },
      ],
      refundMode: 'UDHARI_CREDIT',
      reason: 'CUSTOMER_RETURN',
      notes: 'Customer only needed 1 kg',
    });

    expect(returnRes.refundTotal).toBe(120.0);
    expect(returnRes.creditNote.credit_note_number).toMatch(/^CN-\d{4}$/);

    // 5. Verify product stock restored: 8 + 1 = 9 kg
    const dalAfterReturn = await kiranaDb.products.get(dal.id);
    expect(dalAfterReturn?.current_stock).toBe(9.0);

    // 6. Verify Customer Khata reduced: 700 - 120 = ₹580
    const custAfterReturn = await kiranaDb.customers.get(customer.id);
    expect(custAfterReturn?.current_udhari_balance).toBe(580.0);

    // 7. Verify device prefix invoice numbering
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('kirana_device_id', 'D2');
    }
    const prefixedNum = SalesReturnService.getDevicePrefixedInvoiceNumber('KRN', 42);
    expect(prefixedNum).toContain('-D2-042');
  });

  // =========================================================================
  // Module 6: Security Hardening, Salted SHA-256 PIN & 5-Attempt Rate Limiting
  // =========================================================================
  it('Module 6: Validates manager PIN with fallback, updates salted SHA-256 hash, and enforces 5-attempt rate limiter lockout', async () => {
    // 1. Initial State: Default fallback PIN '1234' works
    const checkDefault = await SecurityAuditService.verifyManagerPin('1234');
    expect(checkDefault.valid).toBe(true);
    expect(checkDefault.isLocked).toBe(false);

    // 2. Set custom Manager PIN: '9876'
    await SecurityAuditService.setManagerPin('9876', 'Store Owner Laxminivas');

    const profile = await kiranaDb.getShopProfile();
    expect(profile?.pin_hash).toBeDefined();
    expect(profile?.pin_salt).toBeDefined();
    expect(profile?.pin_failed_attempts).toBe(0);

    // Old default PIN '1234' must now fail!
    const checkOld = await SecurityAuditService.verifyManagerPin('1234');
    expect(checkOld.valid).toBe(false);

    // New PIN '9876' succeeds
    const checkNew = await SecurityAuditService.verifyManagerPin('9876');
    expect(checkNew.valid).toBe(true);
    expect(checkNew.isLocked).toBe(false);

    // 3. Rate Limiter Test: Enter incorrect PIN 5 times
    for (let i = 1; i <= 4; i++) {
      const failCheck = await SecurityAuditService.verifyManagerPin('0000');
      expect(failCheck.valid).toBe(false);
      expect(failCheck.isLocked).toBe(false);
      expect(failCheck.remainingAttempts).toBe(5 - i);
    }

    // 5th failed attempt -> Triggers 15-minute temporary lockout!
    const fifthFail = await SecurityAuditService.verifyManagerPin('0000');
    expect(fifthFail.valid).toBe(false);
    expect(fifthFail.isLocked).toBe(true);
    expect(fifthFail.message).toContain('Locked out for 15 minutes');

    // Subsequent attempt during lockout is immediately rejected
    const lockedCheck = await SecurityAuditService.verifyManagerPin('9876'); // Even correct PIN is locked out
    expect(lockedCheck.valid).toBe(false);
    expect(lockedCheck.isLocked).toBe(true);

    // 4. Verify Immutable Audit Trail
    const logs = await SecurityAuditService.getAuditLogs(10);
    expect(logs.length).toBeGreaterThan(0);
    const lockoutLog = logs.find((l) => l.event_type === 'LOCKOUT_TRIGGERED');
    expect(lockoutLog).toBeDefined();
    expect(lockoutLog?.action_summary).toContain('5 consecutive invalid PIN attempts');
  });
});
