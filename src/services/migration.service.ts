import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from './database.sqlite';
import { CustomerService } from './customer.service';
import { InventoryService } from './inventory.service';
import { SettingsService } from './settings.service';
import { RaniRupaStockService } from './raniRupaStock.service';
import { Customer, Transaction, LedgerEntry, RaniRupaStock } from '../types';

const OLD_STORAGE_KEYS = {
  CUSTOMERS: '@bulliondesk_customers',
  TRANSACTIONS: '@bulliondesk_transactions',
  LEDGER: '@bulliondesk_ledger',
  LAST_TRANSACTION_ID: '@bulliondesk_last_transaction_id',
  TRADES: '@bulliondesk_trades',
  LAST_TRADE_ID: '@bulliondesk_last_trade_id',
  BASE_INVENTORY: '@bulliondesk_base_inventory',
  AUTO_BACKUP_ENABLED: '@bulliondesk_auto_backup_enabled',
  STORAGE_PERMISSION_GRANTED: '@bulliondesk_storage_permission_granted',
  LAST_BACKUP_TIME: '@bulliondesk_last_backup_time',
  RANI_RUPA_STOCK: '@bulliondesk_rani_rupa_stock'
};

export interface MigrationProgress {
  stage: string;
  progress: number;
  total: number;
  message: string;
}

export class MigrationService {
  private static progressCallback?: (progress: MigrationProgress) => void;

  /**
   * Set a callback to receive migration progress updates
   */
  static setProgressCallback(callback: (progress: MigrationProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Report migration progress
   */
  private static reportProgress(stage: string, progress: number, total: number, message: string): void {
    if (this.progressCallback) {
      this.progressCallback({ stage, progress, total, message });
    }
  }

  /**
   * Check if migration is needed (AsyncStorage has data)
   */
  static async isMigrationNeeded(): Promise<boolean> {
    try {
      // Check if any AsyncStorage keys exist
      const customersJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.CUSTOMERS);
      const transactionsJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.TRANSACTIONS);
      
      // Migration needed if either customers or transactions exist
      return !!(customersJson || transactionsJson);
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Check if migration has already been completed
   */
  static async isMigrationCompleted(): Promise<boolean> {
    try {
      const completed = await SettingsService.getSetting('migration_completed');
      return completed === 'true';
    } catch (error) {
      console.error('Error checking migration completed status:', error);
      return false;
    }
  }

  /**
   * Perform full migration from AsyncStorage to SQLite
   */
  static async performMigration(): Promise<{ success: boolean; error?: string }> {
    try {
      this.reportProgress('initialization', 0, 100, 'Starting migration...');

      // Initialize SQLite database
      await DatabaseService.initDatabase();
      this.reportProgress('initialization', 10, 100, 'Database initialized');

      // Migrate customers
      this.reportProgress('customers', 10, 100, 'Migrating customers...');
      const customersResult = await this.migrateCustomers();
      if (!customersResult.success) {
        return { success: false, error: `Customer migration failed: ${customersResult.error}` };
      }
      this.reportProgress('customers', 30, 100, `Migrated ${customersResult.count} customers`);

      // Migrate transactions
      this.reportProgress('transactions', 30, 100, 'Migrating transactions...');
      const transactionsResult = await this.migrateTransactions();
      if (!transactionsResult.success) {
        return { success: false, error: `Transaction migration failed: ${transactionsResult.error}` };
      }
      this.reportProgress('transactions', 50, 100, `Migrated ${transactionsResult.count} transactions`);

      // Migrate ledger entries
      this.reportProgress('ledger', 50, 100, 'Migrating ledger entries...');
      const ledgerResult = await this.migrateLedgerEntries();
      if (!ledgerResult.success) {
        return { success: false, error: `Ledger migration failed: ${ledgerResult.error}` };
      }
      this.reportProgress('ledger', 65, 100, `Migrated ${ledgerResult.count} ledger entries`);

      // Migrate base inventory
      this.reportProgress('inventory', 65, 100, 'Migrating base inventory...');
      const inventoryResult = await this.migrateBaseInventory();
      if (!inventoryResult.success) {
        return { success: false, error: `Inventory migration failed: ${inventoryResult.error}` };
      }
      this.reportProgress('inventory', 75, 100, 'Base inventory migrated');

      // Migrate Rani/Rupa stock
      this.reportProgress('stock', 75, 100, 'Migrating Rani/Rupa stock...');
      const stockResult = await this.migrateRaniRupaStock();
      if (!stockResult.success) {
        return { success: false, error: `Stock migration failed: ${stockResult.error}` };
      }
      this.reportProgress('stock', 85, 100, `Migrated ${stockResult.count} stock items`);

      // Migrate settings
      this.reportProgress('settings', 85, 100, 'Migrating settings...');
      const settingsResult = await this.migrateSettings();
      if (!settingsResult.success) {
        return { success: false, error: `Settings migration failed: ${settingsResult.error}` };
      }
      this.reportProgress('settings', 90, 100, 'Settings migrated');

      // Recalculate Inventory Chain (Full Rebuild)
      this.reportProgress('inventory_history', 95, 100, 'Building inventory history...');
      await InventoryService.recalculateBalancesFrom();

      // Mark migration as completed
      await SettingsService.setSetting('migration_completed', 'true');
      await SettingsService.setSetting('migration_date', new Date().toISOString());

      this.reportProgress('complete', 100, 100, 'Migration completed successfully!');

      return { success: true };
    } catch (error) {
      console.error('Migration error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during migration' 
      };
    }
  }

  /**
   * Migrate customers from AsyncStorage to SQLite
   */
  private static async migrateCustomers(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const customersJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.CUSTOMERS);
      if (!customersJson) {
        return { success: true, count: 0 };
      }

      const customers: Customer[] = JSON.parse(customersJson);
      
      for (const customer of customers) {
        await CustomerService.saveCustomer(customer);
      }

      return { success: true, count: customers.length };
    } catch (error) {
      console.error('Error migrating customers:', error);
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Migrate transactions from AsyncStorage to SQLite
   */
  private static async migrateTransactions(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const transactionsJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.TRANSACTIONS);
      if (!transactionsJson) {
        return { success: true, count: 0 };
      }

      const transactions: Transaction[] = JSON.parse(transactionsJson);
      const db = DatabaseService.getDatabase();

      for (const transaction of transactions) {
        // Insert transaction directly to preserve IDs and timestamps
        await db.runAsync(
          `INSERT INTO transactions 
           (id, deviceId, customerId, customerName, date, discountExtraAmount, total, 
            amountPaid, lastGivenMoney, lastToLastGivenMoney, settlementType, createdAt, lastUpdatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transaction.id,
            transaction.deviceId || null,
            transaction.customerId,
            transaction.customerName,
            transaction.date,
            transaction.discountExtraAmount || 0,
            transaction.total,
            transaction.amountPaid,
            transaction.lastGivenMoney,
            transaction.lastToLastGivenMoney,
            transaction.settlementType || 'partial',
            transaction.createdAt,
            transaction.lastUpdatedAt
          ]
        );

        // Insert transaction entries
        for (const entry of transaction.entries) {
          await db.runAsync(
            `INSERT INTO transaction_entries 
             (id, transaction_id, type, itemType, weight, price, touch, cut, extraPerKg, 
              pureWeight, moneyType, amount, metalOnly, stock_id, subtotal, createdAt, lastUpdatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              transaction.id,
              entry.type,
              entry.itemType,
              entry.weight || null,
              entry.price || null,
              entry.touch || null,
              entry.cut || null,
              entry.extraPerKg || null,
              entry.pureWeight || null,
              entry.moneyType || null,
              entry.amount || null,
              entry.metalOnly ? 1 : 0,
              entry.stock_id || null,
              entry.subtotal,
              entry.createdAt || transaction.createdAt,
              entry.lastUpdatedAt || transaction.lastUpdatedAt
            ]
          );
        }
      }

      // Migrate last transaction ID
      const lastTransactionId = await AsyncStorage.getItem(OLD_STORAGE_KEYS.LAST_TRANSACTION_ID);
      if (lastTransactionId) {
        await SettingsService.setSetting('last_transaction_id', lastTransactionId);
      }

      return { success: true, count: transactions.length };
    } catch (error) {
      console.error('Error migrating transactions:', error);
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Migrate ledger entries from AsyncStorage to SQLite
   */
  private static async migrateLedgerEntries(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const ledgerJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.LEDGER);
      if (!ledgerJson) {
        return { success: true, count: 0 };
      }

      const ledgerEntries: LedgerEntry[] = JSON.parse(ledgerJson);
      const db = DatabaseService.getDatabase();

      for (const entry of ledgerEntries) {
        // Insert ledger entry
        await db.runAsync(
          `INSERT INTO ledger_entries 
           (id, transactionId, customerId, customerName, date, amountReceived, amountGiven, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entry.id,
            entry.transactionId,
            entry.customerId,
            entry.customerName,
            entry.date,
            entry.amountReceived || 0,
            entry.amountGiven || 0,
            entry.createdAt
          ]
        );

        // Insert ledger entry items
        for (const item of entry.entries) {
          const itemId = item.id || `ledger_item_${Date.now()}_${Math.random()}`;
          await db.runAsync(
            `INSERT INTO ledger_entry_items 
             (id, ledger_entry_id, type, itemType, weight, price, touch, cut, extraPerKg, 
              pureWeight, moneyType, amount, metalOnly, stock_id, subtotal, createdAt, lastUpdatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              itemId,
              entry.id,
              item.type,
              item.itemType,
              item.weight || null,
              item.price || null,
              item.touch || null,
              item.cut || null,
              item.extraPerKg || null,
              item.pureWeight || null,
              item.moneyType || null,
              item.amount || null,
              item.metalOnly ? 1 : 0,
              item.stock_id || null,
              item.subtotal,
              item.createdAt || entry.createdAt,
              item.lastUpdatedAt || entry.createdAt
            ]
          );
        }
      }

      return { success: true, count: ledgerEntries.length };
    } catch (error) {
      console.error('Error migrating ledger entries:', error);
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Migrate base inventory from AsyncStorage to SQLite
   */
  private static async migrateBaseInventory(): Promise<{ success: boolean; error?: string }> {
    try {
      const inventoryJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.BASE_INVENTORY);
      if (!inventoryJson) {
        return { success: true };
      }

      const inventory = JSON.parse(inventoryJson);
      
      // Handle old silver fields (silver98, silver96)
      if (inventory.silver98 || inventory.silver96) {
        inventory.silver = (inventory.silver || 0) + (inventory.silver98 || 0) + (inventory.silver96 || 0);
        delete inventory.silver98;
        delete inventory.silver96;
      }

      await InventoryService.setBaseInventory(inventory);

      return { success: true };
    } catch (error) {
      console.error('Error migrating base inventory:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Migrate Rani/Rupa stock from AsyncStorage to SQLite
   */
  private static async migrateRaniRupaStock(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const stockJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.RANI_RUPA_STOCK);
      if (!stockJson) {
        return { success: true, count: 0 };
      }

      const stock: RaniRupaStock[] = JSON.parse(stockJson);

      for (const item of stock) {
        await RaniRupaStockService.restoreStock(
          item.stock_id,
          item.itemtype,
          item.weight,
          item.touch
        );
      }

      return { success: true, count: stock.length };
    } catch (error) {
      console.error('Error migrating Rani/Rupa stock:', error);
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Migrate settings from AsyncStorage to SQLite
   */
  private static async migrateSettings(): Promise<{ success: boolean; error?: string }> {
    try {
      // Migrate auto backup enabled
      const autoBackupJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.AUTO_BACKUP_ENABLED);
      if (autoBackupJson) {
        const enabled = JSON.parse(autoBackupJson);
        await SettingsService.setAutoBackupEnabled(enabled);
      }

      // Migrate storage permission granted
      const permissionJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.STORAGE_PERMISSION_GRANTED);
      if (permissionJson) {
        const granted = JSON.parse(permissionJson);
        await SettingsService.setStoragePermissionGranted(granted);
      }

      // Migrate last backup time
      const lastBackupJson = await AsyncStorage.getItem(OLD_STORAGE_KEYS.LAST_BACKUP_TIME);
      if (lastBackupJson) {
        const time = JSON.parse(lastBackupJson);
        await SettingsService.setLastBackupTime(time);
      }

      // Migrate last trade ID
      const lastTradeId = await AsyncStorage.getItem(OLD_STORAGE_KEYS.LAST_TRADE_ID);
      if (lastTradeId) {
        await SettingsService.setSetting('last_trade_id', lastTradeId);
      }

      return { success: true };
    } catch (error) {
      console.error('Error migrating settings:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Clear AsyncStorage after successful migration (optional)
   */
  static async clearOldAsyncStorage(): Promise<boolean> {
    try {
      const keysToRemove = Object.values(OLD_STORAGE_KEYS);
      await AsyncStorage.multiRemove(keysToRemove);
      return true;
    } catch (error) {
      console.error('Error clearing old AsyncStorage:', error);
      return false;
    }
  }

  /**
   * Reset migration status (for testing purposes)
   */
  static async resetMigrationStatus(): Promise<void> {
    await SettingsService.deleteSetting('migration_completed');
    await SettingsService.deleteSetting('migration_date');
  }
}
