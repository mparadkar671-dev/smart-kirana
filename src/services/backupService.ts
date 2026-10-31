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
  StoreUser,
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
  store_users?: StoreUser[];
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
      store_users,
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
      db.store_users.toArray(),
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
      store_users,
    };
  }

  /**
   * Generates a downloadable JSON file in the browser (returns json string for test compatibility)
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
   * Alias for export
   */
  static async exportToFile(): Promise<void> {
    await this.downloadJsonBackup();
  }

  /**
   * Restores entire database from JSON string or object
   */
  static async restoreDatabaseFromJson(jsonContent: string | DatabaseSnapshot): Promise<void> {
    const snapshot: DatabaseSnapshot =
      typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;

    if (!snapshot || !Array.isArray(snapshot.products) || !Array.isArray(snapshot.customers)) {
      throw new Error('Invalid Kirana database backup snapshot format');
    }

    await this.restoreFromSnapshot(snapshot);
  }

  /**
   * Imports and validates a JSON backup file
   */
  static async importFromFile(file: File): Promise<{
    success: boolean;
    recordCounts: Record<string, number>;
  }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const snapshot = JSON.parse(content) as DatabaseSnapshot;

          if (!snapshot.exported_at || !snapshot.version) {
            throw new Error('Invalid backup file format: Missing metadata headers.');
          }

          if (!Array.isArray(snapshot.products) || !Array.isArray(snapshot.customers)) {
            throw new Error('Invalid backup structure: Products or Customers table missing.');
          }

          await this.restoreFromSnapshot(snapshot);

          resolve({
            success: true,
            recordCounts: {
              products: snapshot.products.length,
              customers: snapshot.customers.length,
              sales_invoices: snapshot.sales_invoices?.length || 0,
              khata_transactions: snapshot.khata_transactions?.length || 0,
              inventory_logs: snapshot.inventory_logs?.length || 0,
              store_users: snapshot.store_users?.length || 0,
            },
          });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file from disk.'));
      reader.readAsText(file);
    });
  }

  /**
   * Restores tables inside an atomic Dexie transaction
   */
  static async restoreFromSnapshot(snapshot: DatabaseSnapshot): Promise<void> {
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
        db.store_users,
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
        await db.store_users.clear();

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
        if (snapshot.store_users?.length) await db.store_users.bulkAdd(snapshot.store_users);
      }
    );
  }
}
