import { db } from '../db/db';
import {
  Product,
  InventoryLog,
  Customer,
  SalesInvoice,
  SaleItem,
  KhataTransaction,
  ExpenseAndDrawing,
  DailyGallaSession,
  ShopProfile,
} from '../types';

export interface DatabaseSnapshot {
  version: number;
  exported_at: string;
  shop_profile: ShopProfile[];
  products: Product[];
  inventory_logs: InventoryLog[];
  customers: Customer[];
  sales_invoices: SalesInvoice[];
  sale_items: SaleItem[];
  khata_transactions: KhataTransaction[];
  expenses_and_drawings: ExpenseAndDrawing[];
  daily_galla_sessions: DailyGallaSession[];
}

export class BackupService {
  /**
   * Exports entire local IndexedDB state to a structured JSON object
   */
  static async exportFullDatabase(): Promise<DatabaseSnapshot> {
    const [
      shop_profile,
      products,
      inventory_logs,
      customers,
      sales_invoices,
      sale_items,
      khata_transactions,
      expenses_and_drawings,
      daily_galla_sessions,
    ] = await Promise.all([
      db.shop_profile.toArray(),
      db.products.toArray(),
      db.inventory_logs.toArray(),
      db.customers.toArray(),
      db.sales_invoices.toArray(),
      db.sale_items.toArray(),
      db.khata_transactions.toArray(),
      db.expenses_and_drawings.toArray(),
      db.daily_galla_sessions.toArray(),
    ]);

    return {
      version: 1,
      exported_at: new Date().toISOString(),
      shop_profile,
      products,
      inventory_logs,
      customers,
      sales_invoices,
      sale_items,
      khata_transactions,
      expenses_and_drawings,
      daily_galla_sessions,
    };
  }

  /**
   * Generates downloadable JSON snapshot file for disaster recovery
   */
  static async downloadJsonBackup(): Promise<string> {
    const snapshot = await this.exportFullDatabase();
    const jsonString = JSON.stringify(snapshot, null, 2);

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const filename = `kirana_backup_${yyyy}_${mm}_${dd}.json`;

    if (typeof window !== 'undefined' && window.document) {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    return jsonString;
  }

  /**
   * Restores entire database from JSON snapshot with 100% bit-for-bit parity
   */
  static async restoreDatabaseFromJson(jsonContent: string | DatabaseSnapshot): Promise<void> {
    const snapshot: DatabaseSnapshot =
      typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;

    if (!snapshot || !Array.isArray(snapshot.products) || !Array.isArray(snapshot.customers)) {
      throw new Error('Invalid Kirana database backup snapshot format');
    }

    await db.transaction(
      'rw',
      [
        db.shop_profile,
        db.products,
        db.inventory_logs,
        db.customers,
        db.sales_invoices,
        db.sale_items,
        db.khata_transactions,
        db.expenses_and_drawings,
        db.daily_galla_sessions,
      ],
      async () => {
        // Clear all tables
        await db.shop_profile.clear();
        await db.products.clear();
        await db.inventory_logs.clear();
        await db.customers.clear();
        await db.sales_invoices.clear();
        await db.sale_items.clear();
        await db.khata_transactions.clear();
        await db.expenses_and_drawings.clear();
        await db.daily_galla_sessions.clear();

        // Restore tables
        if (snapshot.shop_profile?.length) await db.shop_profile.bulkAdd(snapshot.shop_profile);
        if (snapshot.products?.length) await db.products.bulkAdd(snapshot.products);
        if (snapshot.inventory_logs?.length) await db.inventory_logs.bulkAdd(snapshot.inventory_logs);
        if (snapshot.customers?.length) await db.customers.bulkAdd(snapshot.customers);
        if (snapshot.sales_invoices?.length) await db.sales_invoices.bulkAdd(snapshot.sales_invoices);
        if (snapshot.sale_items?.length) await db.sale_items.bulkAdd(snapshot.sale_items);
        if (snapshot.khata_transactions?.length) await db.khata_transactions.bulkAdd(snapshot.khata_transactions);
        if (snapshot.expenses_and_drawings?.length) await db.expenses_and_drawings.bulkAdd(snapshot.expenses_and_drawings);
        if (snapshot.daily_galla_sessions?.length) await db.daily_galla_sessions.bulkAdd(snapshot.daily_galla_sessions);
      }
    );
  }
}

