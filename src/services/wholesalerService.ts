import { db } from '../db/db';
import { Wholesaler, Product, BusinessType } from '../types';
import { cloudSyncService } from './cloudSyncService';
import { roundQty } from '../utils/math';

export interface CreateWholesalerInput {
  name: string;
  phone: string;
  agency_or_brand?: string;
  gstin?: string;
  address?: string;
  visit_day?: string;
  is_active?: boolean;
  contact_person?: string;
  address_city?: string;
  gst_number?: string;
  notes?: string;
  business_type?: BusinessType;
}

export class WholesalerService {
  /**
   * Retrieves all registered wholesalers for the active shop
   */
  static async getAll(shopId?: string, businessType?: BusinessType): Promise<Wholesaler[]> {
    const targetShopId =
      shopId ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('smart_kirana_shop_id') || 'current_shop'
        : 'current_shop');
    const all = await db.wholesalers.toArray();
    return all.filter(
      (w) =>
        (!w.shop_id || w.shop_id === targetShopId || w.shop_id === 'current_shop') &&
        w.is_active !== false &&
        (!businessType || !w.business_type || w.business_type === businessType)
    );
  }

  static async getAllWholesalers(shopId?: string, businessType?: BusinessType): Promise<Wholesaler[]> {
    return this.getAll(shopId, businessType);
  }

  static async createWholesaler(input: CreateWholesalerInput): Promise<Wholesaler> {
    return this.create(input);
  }

  static async updateWholesaler(id: string, updates: Partial<CreateWholesalerInput>): Promise<void> {
    return this.update(id, updates);
  }

  static async deleteWholesaler(id: string): Promise<void> {
    return this.delete(id);
  }

  static getRecommendedOrderQty(item: Product): number {
    const isLoose = item.unit_type === 'KG_LOOSE' || item.unit_type === 'LTR';
    const rawNeeded = Math.max(
      isLoose ? 0.5 : 1,
      (item.low_stock_threshold || 1) * 2 - (item.current_stock || 0)
    );
    return isLoose ? roundQty(rawNeeded) : Math.max(1, Math.ceil(rawNeeded));
  }

  static formatUnitLabel(unitType: Product['unit_type'] | string): string {
    if (unitType === 'KG_LOOSE') return 'kg';
    if (unitType === 'LTR') return 'L';
    if (unitType === 'PACK') return 'pack';
    if (unitType === 'PCS') return 'pcs';
    return unitType;
  }

  /**
   * Retrieves a single wholesaler by ID
   */
  static async getById(id: string): Promise<Wholesaler | undefined> {
    return await db.wholesalers.get(id);
  }

  /**
   * Creates a new wholesaler / distributor in local Dexie and queues cloud sync
   */
  static async create(input: CreateWholesalerInput): Promise<Wholesaler> {
    if (!input.name.trim()) {
      throw new Error('Wholesaler name is required');
    }
    const cleanPhone = input.phone ? input.phone.replace(/\D/g, '') : '';
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new Error('Please enter a valid 10-digit WhatsApp contact phone number');
    }

    const shopId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('smart_kirana_shop_id') || 'current_shop'
        : 'current_shop';
    const id = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const profile = await db.getShopProfile();
    const targetBusinessType: BusinessType = input.business_type || profile?.business_type || 'KIRANA_RETAIL';

    const newWholesaler: Wholesaler = {
      id,
      shop_id: shopId,
      business_type: targetBusinessType,
      name: input.name.trim(),
      agency_or_brand: input.agency_or_brand?.trim() || input.notes?.trim() || '',
      phone: cleanPhone.slice(-10),
      gstin: (input.gstin || input.gst_number || '').trim().toUpperCase(),
      address: (input.address || input.address_city || '').trim(),
      visit_day: input.visit_day?.trim() || '',
      is_active: input.is_active !== false,
      contact_person: input.contact_person?.trim() || input.name.trim(),
      address_city: (input.address_city || input.address || '').trim(),
      gst_number: (input.gst_number || input.gstin || '').trim().toUpperCase(),
      notes: input.notes?.trim(),
      created_at: now,
      updated_at: now,
    };

    await db.transaction('rw', [db.wholesalers, db.sync_outbox], async () => {
      await db.wholesalers.add(newWholesaler);
      await db.queueSync(
        {
          table_name: 'wholesalers',
          operation: 'INSERT',
          payload: newWholesaler as unknown as Record<string, unknown>,
          shop_id: shopId,
        },
        db.sync_outbox
      );
    });

    cloudSyncService.syncWholesaler(newWholesaler).catch(() => {});
    return newWholesaler;
  }

  /**
   * Updates an existing wholesaler
   */
  static async update(id: string, updates: Partial<CreateWholesalerInput>): Promise<void> {
    const existing = await db.wholesalers.get(id);
    if (!existing) throw new Error(`Wholesaler not found: ${id}`);

    const patched: Partial<Wholesaler> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) patched.name = updates.name.trim();
    if (updates.phone !== undefined) {
      const digits = updates.phone.replace(/\D/g, '');
      patched.phone = digits.length >= 10 ? digits.slice(-10) : digits;
    }
    if (updates.agency_or_brand !== undefined) patched.agency_or_brand = updates.agency_or_brand.trim();
    if (updates.address !== undefined) {
      patched.address = updates.address.trim();
      patched.address_city = updates.address.trim();
    }
    if (updates.gstin !== undefined) {
      patched.gstin = updates.gstin.trim().toUpperCase();
      patched.gst_number = updates.gstin.trim().toUpperCase();
    }

    await db.transaction('rw', [db.wholesalers, db.sync_outbox], async () => {
      await db.wholesalers.update(id, patched);
      await db.queueSync(
        {
          table_name: 'wholesalers',
          operation: 'UPDATE',
          payload: { id, ...patched },
          shop_id: existing.shop_id || 'current_shop',
        },
        db.sync_outbox
      );
    });

    cloudSyncService.syncWholesaler({ ...existing, ...patched }).catch(() => {});
  }

  /**
   * Deletes a wholesaler
   */
  static async delete(id: string): Promise<void> {
    const existing = await db.wholesalers.get(id);
    if (!existing) return;

    await db.transaction('rw', [db.wholesalers, db.sync_outbox], async () => {
      await db.wholesalers.delete(id);
      await db.queueSync(
        {
          table_name: 'wholesalers',
          operation: 'DELETE',
          payload: { id },
          shop_id: existing.shop_id || 'current_shop',
        },
        db.sync_outbox
      );
    });

    cloudSyncService.deleteWholesaler(id).catch(() => {});
  }

  /**
   * Cleans an Indian mobile phone number for WhatsApp / SMS routing
   */
  static cleanPhoneNumber(phone?: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length > 10 && digits.startsWith('91')) return digits;
    return digits;
  }

  /**
   * Formats a clean Purchase Order message for WhatsApp / SMS
   */
  static formatPurchaseOrderText(
    wholesaler: Wholesaler,
    items: Product[],
    shopName: string,
    ownerPhoneOrCustomQtys?: string | Record<string, number>
  ): string {
    const currentDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const customQtys =
      ownerPhoneOrCustomQtys && typeof ownerPhoneOrCustomQtys === 'object'
        ? ownerPhoneOrCustomQtys
        : undefined;
    const ownerPhone =
      typeof ownerPhoneOrCustomQtys === 'string' ? ownerPhoneOrCustomQtys : undefined;

    let text = `Namaste *${wholesaler.name}* ji, 🙏\n`;
    text += `*Purchase Order from ${shopName}* (${currentDate})\n`;
    text += `Please send the following stock items:\n`;

    items.forEach((item, index) => {
      const isLoose = item.unit_type === 'KG_LOOSE' || item.unit_type === 'LTR';
      const unitLabel = item.unit_type === 'KG_LOOSE' ? 'kg' : item.unit_type === 'LTR' ? 'L' : item.unit_type;
      const customVal = customQtys ? customQtys[item.id] : undefined;
      const rawNeeded =
        customVal !== undefined
          ? customVal
          : Math.max(isLoose ? 0.5 : 1, item.low_stock_threshold * 2 - item.current_stock);
      const recommendedOrderQty = isLoose
        ? roundQty(rawNeeded).toString()
        : Math.ceil(rawNeeded).toString();

      text += `${index + 1}. *${item.name}* — Qty: *${recommendedOrderQty}${unitLabel}*\n`;
    });

    text += `Please confirm availability & bill amount. Thank you!`;
    if (ownerPhone) {
      text += `\n📞 Contact: ${ownerPhone}`;
    }

    return text;
  }

  /**
   * Builds the 1-click WhatsApp web/app link to send the purchase order directly
   */
  static getWhatsAppShareUrl(
    wholesaler: Wholesaler,
    items: Product[],
    shopName: string,
    ownerPhone?: string
  ): string {
    const text = this.formatPurchaseOrderText(wholesaler, items, shopName, ownerPhone);
    const phone = this.cleanPhoneNumber(wholesaler.phone);
    if (phone) {
      return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    }
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  /**
   * Builds a custom manual WhatsApp link for a wholesaler
   */
  static getCustomWhatsAppUrl(wholesaler: Wholesaler, customMessage: string): string {
    const phone = this.cleanPhoneNumber(wholesaler.phone);
    if (phone) {
      return `https://wa.me/${phone}?text=${encodeURIComponent(customMessage)}`;
    }
    return `https://wa.me/?text=${encodeURIComponent(customMessage)}`;
  }

  /**
   * Builds the SMS URI for keypad phones or cellular direct SMS
   */
  static getSmsShareUri(
    wholesaler: Wholesaler,
    items: Product[],
    shopName: string,
    ownerPhone?: string
  ): string {
    const text = this.formatPurchaseOrderText(wholesaler, items, shopName, ownerPhone);
    const phone = wholesaler.phone ? wholesaler.phone.replace(/\D/g, '') : '';
    return `sms:${phone}?body=${encodeURIComponent(text)}`;
  }
}
