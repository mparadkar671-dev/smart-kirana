import { describe, it, expect, beforeEach } from 'vitest';
import { db, kiranaDb, homemadeDb, getActiveDb } from '../db/db';
import { BillingService } from '../services/billingService';
import { cloudSyncService } from '../services/cloudSyncService';
import { getBaseKiranaShopId, getHomemadeShopId, setActiveShopId } from '../services/tenantManager';
import { Product } from '../types';

describe('Enterprise System Verification Suite: Physical DB Isolation, Dual-Rate Billing & Loan Tracking', () => {
  const kiranaShopId = 'c7b9195a-49e0-4a88-8254-2035ef580001';
  const hmfShopId = getHomemadeShopId(kiranaShopId);

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('kirana_base_shop_id', kiranaShopId);
    localStorage.setItem('kirana_primary_shop_id', kiranaShopId);
    setActiveShopId(kiranaShopId, 'KIRANA_RETAIL');

    // Clear both physical databases
    await kiranaDb.products.clear();
    await kiranaDb.sales_invoices.clear();
    await kiranaDb.sale_items.clear();
    await kiranaDb.inventory_logs.clear();
    await kiranaDb.loan_accounts.clear();

    await homemadeDb.products.clear();
    await homemadeDb.sales_invoices.clear();
    await homemadeDb.sale_items.clear();
    await homemadeDb.inventory_logs.clear();
    await homemadeDb.loan_accounts.clear();

    // Setup shop profiles
    await kiranaDb.shop_profile.put({
      id: kiranaShopId,
      shop_name: 'Shree Ganesh Kirana Store',
      owner_name: 'Laxminivas',
      phone: '9876543210',
      upi_vpa: 'kirana@upi',
      business_type: 'KIRANA_RETAIL',
      invoice_prefix: 'KRN',
      address: 'Chiplun Market',
      gst_footer_note: 'Thank you',
      updated_at: new Date().toISOString(),
    });

    await homemadeDb.shop_profile.put({
      id: hmfShopId,
      shop_name: 'Shree Ganesh Gruh Udyog',
      owner_name: 'Laxminivas',
      phone: '9876543210',
      upi_vpa: 'kirana@upi',
      business_type: 'HOMEMADE_FOOD',
      invoice_prefix: 'HMF',
      address: 'Chiplun Food Kitchen',
      gst_footer_note: 'Fresh Taste',
      updated_at: new Date().toISOString(),
    });
  });

  it('Scenario 1: Physical Database Partitioning & Zero Leakage between kiranaDb and homemadeDb', async () => {
    // 1. In Kirana DB: Add pure grocery items
    const toorDal: Product = {
      id: 'prod-toor-dal-1kg',
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      name: 'तूर डाळ (Toor Dal 1kg)',
      short_code: 'TD1',
      barcode: '890103000001',
      category: 'Dals & Pulses',
      unit_type: 'PACK',
      purchase_price: 135,
      selling_price: 160,
      mrp: 175,
      current_stock: 50,
      low_stock_threshold: 5,
      is_quick_tap: true,
      last_supplier_name: 'Nagpur Dal Mills',
      updated_at: new Date().toISOString(),
    };
    await kiranaDb.products.put(toorDal);

    // 2. In Homemade DB: Add pure homemade food items
    const modak: Product = {
      id: 'prod-ukdiche-modak',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      name: 'उकडीचे मोदक (Ukdiche Modak)',
      short_code: 'MDK1',
      barcode: '2009000000049',
      category: 'Modak & Festive Specials',
      unit_type: 'PCS',
      raw_material_cost: 10,
      equipment_fuel_cost: 2.5,
      labour_cost: 1.5,
      purchase_price: 14,
      wholesale_price: 20,
      selling_price: 25,
      mrp: 30,
      current_stock: 40,
      low_stock_threshold: 10,
      is_quick_tap: true,
      last_supplier_name: 'In-House Kitchen',
      shelf_life_days: 2,
      batch_notes: 'Steamed fresh daily with fresh grated coconut & jaggery',
      updated_at: new Date().toISOString(),
    };
    await homemadeDb.products.put(modak);

    // Verify Kirana DB has ONLY Toor Dal
    const kiranaProducts = await kiranaDb.products.toArray();
    expect(kiranaProducts).toHaveLength(1);
    expect(kiranaProducts[0].name).toContain('Toor Dal');
    expect(kiranaProducts.some((p) => p.name.includes('Modak'))).toBe(false);

    // Verify Homemade DB has ONLY Modak
    const homemadeProducts = await homemadeDb.products.toArray();
    expect(homemadeProducts).toHaveLength(1);
    expect(homemadeProducts[0].name).toContain('Modak');
    expect(homemadeProducts.some((p) => p.name.includes('Toor Dal'))).toBe(false);

    // Verify dynamic DB proxy switches seamlessly
    setActiveShopId(kiranaShopId, 'KIRANA_RETAIL');
    expect(getActiveDb()).toBe(kiranaDb);
    const activeKirana = await db.products.toArray();
    expect(activeKirana[0].name).toContain('Toor Dal');

    setActiveShopId(hmfShopId, 'HOMEMADE_FOOD');
    expect(getActiveDb()).toBe(homemadeDb);
    const activeHomemade = await db.products.toArray();
    expect(activeHomemade[0].name).toContain('Modak');
  });

  it('Scenario 2: B2B Wholesale vs Direct Retail Customer Billing in Homemade Food POS', async () => {
    setActiveShopId(hmfShopId, 'HOMEMADE_FOOD');

    const laddu: Product = {
      id: 'prod-besan-laddu',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      name: 'बेसन लाडू (Besan Laddu)',
      short_code: 'BLD1',
      barcode: '2009000000010',
      category: 'Homemade Laddus & Vadi',
      unit_type: 'KG_LOOSE',
      raw_material_cost: 220,
      equipment_fuel_cost: 25,
      labour_cost: 15,
      purchase_price: 260, // Total Making Cost
      wholesale_price: 360, // B2B Retailer rate
      selling_price: 450, // Direct customer rate
      mrp: 480,
      current_stock: 20,
      low_stock_threshold: 2,
      is_quick_tap: true,
      last_supplier_name: 'In-House Kitchen',
      updated_at: new Date().toISOString(),
    };
    await homemadeDb.products.put(laddu);

    // 1. Bill 1: B2B Wholesale Sale to a Retailer Shop (5 kg at wholesale_price = ₹360)
    const wholesaleCheckout = await BillingService.executeCheckout({
      customerId: '0000-WALK-IN',
      items: [
        {
          product: laddu,
          qty: 5,
          unit_selling_price: laddu.wholesale_price || 360,
          unit_purchase_cost: laddu.purchase_price,
          line_total: 5 * (laddu.wholesale_price || 360),
          sale_rate_type: 'WHOLESALE_RETAILER',
        },
      ],
      subtotalAmount: 1800,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 1800,
      udhariAdded: 0,
      shopId: hmfShopId,
      businessType: 'HOMEMADE_FOOD',
    });

    expect(wholesaleCheckout.invoice.grand_total).toBe(1800);
    expect(wholesaleCheckout.saleItems[0].sale_rate_type).toBe('WHOLESALE_RETAILER');
    expect(wholesaleCheckout.saleItems[0].unit_selling_price).toBe(360);

    // 2. Bill 2: Direct Customer Retail Sale (1 kg at selling_price = ₹450)
    const currentLaddu = (await homemadeDb.products.get('prod-besan-laddu'))!;
    const retailCheckout = await BillingService.executeCheckout({
      customerId: '0000-WALK-IN',
      items: [
        {
          product: currentLaddu,
          qty: 1,
          unit_selling_price: currentLaddu.selling_price,
          unit_purchase_cost: currentLaddu.purchase_price,
          line_total: currentLaddu.selling_price,
          sale_rate_type: 'RETAIL_CUSTOMER',
        },
      ],
      subtotalAmount: 450,
      discountRoundoff: 0,
      paymentMode: 'UPI',
      amountPaidNow: 450,
      udhariAdded: 0,
      shopId: hmfShopId,
      businessType: 'HOMEMADE_FOOD',
    });

    expect(retailCheckout.invoice.grand_total).toBe(450);
    expect(retailCheckout.saleItems[0].sale_rate_type).toBe('RETAIL_CUSTOMER');
    expect(retailCheckout.saleItems[0].unit_selling_price).toBe(450);

    // Check inventory log deductions
    const remainingProd = await homemadeDb.products.get('prod-besan-laddu');
    expect(remainingProd?.current_stock).toBe(14); // 20 - 5 - 1 = 14
  });

  it('Scenario 3: Loan Feature & Capital Tracking in Both Kirana and Homemade Food', async () => {
    // 1. Setup Mudra Loan in Kirana
    setActiveShopId(kiranaShopId, 'KIRANA_RETAIL');
    await kiranaDb.loan_accounts.put({
      id: 'loan-kirana-mudra',
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      name: 'PNB Kirana Mudra Loan',
      lender_name: 'Punjab National Bank',
      principal_amount: 100000,
      amount_repaid: 20000,
      emi_or_daily_target: 300,
      interest_rate_pct: 8.5,
      is_active: true,
      created_at: new Date().toISOString(),
    });

    const loanGhee: Product = {
      id: 'prod-ghee-1ltr',
      shop_id: kiranaShopId,
      business_type: 'KIRANA_RETAIL',
      name: 'शुद्ध तूप (Pure Cow Ghee 1L)',
      short_code: 'GHE1',
      barcode: '890126200001',
      category: 'Edible Oils & Ghee',
      unit_type: 'LTR',
      purchase_price: 520,
      selling_price: 650,
      mrp: 699,
      current_stock: 10,
      low_stock_threshold: 2,
      is_quick_tap: true,
      last_supplier_name: 'Gowardhan Dairy',
      loan_account_id: 'loan-kirana-mudra',
      is_loan_funded: true,
      updated_at: new Date().toISOString(),
    };
    await kiranaDb.products.put(loanGhee);

    // Sell Kirana loan funded ghee
    const kiranaSale = await BillingService.executeCheckout({
      customerId: '0000-WALK-IN',
      items: [
        {
          product: loanGhee,
          qty: 2,
          unit_selling_price: 650,
          unit_purchase_cost: 520,
          line_total: 1300,
          is_loan_funded: true,
        },
      ],
      subtotalAmount: 1300,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 1300,
      udhariAdded: 0,
      shopId: kiranaShopId,
      businessType: 'KIRANA_RETAIL',
    });

    expect(kiranaSale.saleItems[0].loan_account_id).toBe('loan-kirana-mudra');
    expect(kiranaSale.saleItems[0].is_loan_funded).toBe(true);

    // 2. Setup Equipment Loan in Homemade Food (e.g. Grinder / Oven)
    setActiveShopId(hmfShopId, 'HOMEMADE_FOOD');
    await homemadeDb.loan_accounts.put({
      id: 'loan-hmf-machinery',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      name: 'Mahila Gruh Udyog Machinery Loan',
      lender_name: 'Bank of Maharashtra',
      principal_amount: 50000,
      amount_repaid: 5000,
      emi_or_daily_target: 150,
      interest_rate_pct: 7.0,
      is_active: true,
      created_at: new Date().toISOString(),
    });

    const loanKhobryachiKapa: Product = {
      id: 'prod-khobryachi-kapa',
      shop_id: hmfShopId,
      business_type: 'HOMEMADE_FOOD',
      name: 'खोबऱ्याची काप (Khobryachi Kapa)',
      short_code: 'KBK1',
      barcode: '2009000000063',
      category: 'Homemade Laddus & Vadi',
      unit_type: 'KG_LOOSE',
      raw_material_cost: 160,
      equipment_fuel_cost: 20,
      labour_cost: 20,
      purchase_price: 200,
      wholesale_price: 280,
      selling_price: 340,
      mrp: 380,
      current_stock: 15,
      low_stock_threshold: 2,
      is_quick_tap: true,
      last_supplier_name: 'In-House Kitchen',
      loan_account_id: 'loan-hmf-machinery',
      is_loan_funded: true,
      updated_at: new Date().toISOString(),
    };
    await homemadeDb.products.put(loanKhobryachiKapa);

    const hmfSale = await BillingService.executeCheckout({
      customerId: '0000-WALK-IN',
      items: [
        {
          product: loanKhobryachiKapa,
          qty: 3,
          unit_selling_price: 340,
          unit_purchase_cost: 200,
          line_total: 1020,
          is_loan_funded: true,
          sale_rate_type: 'RETAIL_CUSTOMER',
        },
      ],
      subtotalAmount: 1020,
      discountRoundoff: 0,
      paymentMode: 'CASH',
      amountPaidNow: 1020,
      udhariAdded: 0,
      shopId: hmfShopId,
      businessType: 'HOMEMADE_FOOD',
    });

    expect(hmfSale.saleItems[0].loan_account_id).toBe('loan-hmf-machinery');
    expect(hmfSale.saleItems[0].is_loan_funded).toBe(true);

    // Verify inventory log preserves loan_account_id in both DBs
    const kiranaLog = await kiranaDb.inventory_logs.toArray();
    expect(kiranaLog[0].loan_account_id).toBe('loan-kirana-mudra');

    const hmfLog = await homemadeDb.inventory_logs.toArray();
    expect(hmfLog[0].loan_account_id).toBe('loan-hmf-machinery');
  });

  it('Scenario 4: Parallel WebSocket Realtime Sync Routes Accurately to kiranaDb vs homemadeDb', async () => {
    // 1. Simulate incoming cloud payload for Kirana product
    await cloudSyncService.handleRealtimePayload({
      table: 'products',
      eventType: 'INSERT',
      new: {
        id: 'cloud-prod-sugar-1kg',
        shop_id: kiranaShopId,
        business_type: 'KIRANA_RETAIL',
        name: 'साखर (Sugar 1kg)',
        short_code: 'SGR1',
        barcode: '890103000099',
        category: 'Grains & Sugar',
        unit: 'KG_LOOSE',
        purchase_price: 38,
        selling_price: 44,
        mrp: 46,
        current_stock: 100,
        low_stock_threshold: 10,
        is_quick_tap: true,
      },
    }, kiranaShopId);

    // 2. Simulate incoming cloud payload for Homemade Food product
    await cloudSyncService.handleRealtimePayload({
      table: 'products',
      eventType: 'INSERT',
      new: {
        id: 'cloud-prod-ghavane',
        shop_id: hmfShopId,
        business_type: 'HOMEMADE_FOOD',
        name: 'घावणे (Malvani Ghavane)',
        short_code: 'GHV1',
        barcode: '2009000000018',
        category: 'Konkani Breakfast & Tiffin',
        unit: 'PLATE',
        raw_material_cost: 18,
        equipment_fuel_cost: 3,
        labour_cost: 2,
        purchase_price: 23,
        wholesale_price: 32,
        selling_price: 40,
        mrp: 45,
        current_stock: 25,
        low_stock_threshold: 5,
        is_quick_tap: true,
      },
    }, kiranaShopId);

    // Verify sugar was routed ONLY to kiranaDb
    const kiranaProd = await kiranaDb.products.get('cloud-prod-sugar-1kg');
    expect(kiranaProd).toBeDefined();
    expect(kiranaProd?.name).toContain('Sugar');
    expect(await homemadeDb.products.get('cloud-prod-sugar-1kg')).toBeUndefined();

    // Verify ghavane was routed ONLY to homemadeDb
    const hmfProd = await homemadeDb.products.get('cloud-prod-ghavane');
    expect(hmfProd).toBeDefined();
    expect(hmfProd?.name).toContain('Ghavane');
    expect(await kiranaDb.products.get('cloud-prod-ghavane')).toBeUndefined();
  });
});
