import * as SQLite from 'expo-sqlite';
import { Customer, Transaction, TransactionEntry, LedgerEntry } from '../types';

// SQLite database instance
let db: SQLite.SQLiteDatabase | null = null;

export class DatabaseService {
  // Initialize database and create tables
  static async initDatabase(): Promise<void> {
    try {
      // Open database
      db = await SQLite.openDatabaseAsync('bulliondesk.db');
      
      // Enable foreign keys
      await db.execAsync('PRAGMA foreign_keys = ON;');
      
      // Create tables
      await db.execAsync(`
        -- Customers Table
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          lastTransaction DATETIME,
          avatar TEXT
        );

        -- Customer Metal Balances Table
        CREATE TABLE IF NOT EXISTS customer_balances (
          customer_id TEXT PRIMARY KEY NOT NULL,
          balance REAL NOT NULL DEFAULT 0,
          gold999 REAL DEFAULT 0,
          gold995 REAL DEFAULT 0,
          rani REAL DEFAULT 0,
          silver REAL DEFAULT 0,
          rupu REAL DEFAULT 0,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );

        -- Transactions Table
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY NOT NULL,
          deviceId TEXT,
          customerId TEXT NOT NULL,
          customerName TEXT NOT NULL,
          date DATETIME NOT NULL,
          discountExtraAmount REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          amountPaid REAL NOT NULL DEFAULT 0,
          lastGivenMoney REAL NOT NULL DEFAULT 0,
          lastToLastGivenMoney REAL NOT NULL DEFAULT 0,
          settlementType TEXT NOT NULL CHECK(settlementType IN ('full', 'partial', 'none')),
          deleted_on DATE,
          createdAt DATETIME NOT NULL,
          lastUpdatedAt DATETIME NOT NULL,
          FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE
        );

        -- Transaction Entries Table
        CREATE TABLE IF NOT EXISTS transaction_entries (
          id TEXT PRIMARY KEY NOT NULL,
          transaction_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('sell', 'purchase', 'money')),
          itemType TEXT NOT NULL CHECK(itemType IN ('gold999', 'gold995', 'rani', 'silver', 'rupu', 'money')),
          weight REAL,
          price REAL,
          touch REAL,
          cut REAL,
          extraPerKg REAL,
          pureWeight REAL,
          moneyType TEXT CHECK(moneyType IN ('give', 'receive')),
          amount REAL,
          metalOnly INTEGER DEFAULT 0,
          stock_id TEXT,
          subtotal REAL,
          createdAt DATETIME,
          lastUpdatedAt DATETIME,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
        );

        -- Trades Table
        CREATE TABLE IF NOT EXISTS trades (
          id TEXT PRIMARY KEY NOT NULL,
          customerName TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('sell', 'purchase')),
          itemType TEXT NOT NULL CHECK(itemType IN ('gold999', 'gold995', 'silver', 'rani', 'rupu')),
          price REAL NOT NULL,
          weight REAL NOT NULL,
          date DATETIME NOT NULL,
          createdAt DATETIME NOT NULL
        );

        -- Ledger Entries Table
        CREATE TABLE IF NOT EXISTS ledger_entries (
          id TEXT PRIMARY KEY NOT NULL,
          transactionId TEXT NOT NULL,
          customerId TEXT NOT NULL,
          customerName TEXT NOT NULL,
          date DATETIME NOT NULL,
          amountReceived REAL,
          amountGiven REAL,
          deleted_on DATE,
          createdAt DATETIME NOT NULL,
          FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE,
          FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE
        );

        -- Ledger Entry Items Table (stores the entries array from ledger)
        CREATE TABLE IF NOT EXISTS ledger_entry_items (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_entry_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('sell', 'purchase', 'money')),
          itemType TEXT NOT NULL CHECK(itemType IN ('gold999', 'gold995', 'rani', 'silver', 'rupu', 'money')),
          weight REAL,
          price REAL,
          touch REAL,
          cut REAL,
          extraPerKg REAL,
          pureWeight REAL,
          moneyType TEXT CHECK(moneyType IN ('give', 'receive')),
          amount REAL,
          metalOnly INTEGER DEFAULT 0,
          stock_id TEXT,
          subtotal REAL NOT NULL DEFAULT 0,
          createdAt DATETIME,
          lastUpdatedAt DATETIME,
          FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE
        );

        -- Rani-Rupa Stock Table
        CREATE TABLE IF NOT EXISTS rani_rupa_stock (
          stock_id TEXT PRIMARY KEY NOT NULL,
          itemtype TEXT NOT NULL CHECK(itemtype IN ('rani', 'rupu')),
          weight REAL NOT NULL,
          touch REAL NOT NULL,
          date DATE NOT NULL,
          createdAt DATETIME NOT NULL
        );

        -- Base Inventory Settings Table
        CREATE TABLE IF NOT EXISTS base_inventory (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          gold999 REAL NOT NULL DEFAULT 0,
          gold995 REAL NOT NULL DEFAULT 0,
          silver REAL NOT NULL DEFAULT 0,
          rani REAL NOT NULL DEFAULT 0,
          rupu REAL NOT NULL DEFAULT 0,
          money REAL NOT NULL DEFAULT 0
        );

        -- Settings Table
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        -- Indexes for better query performance
        CREATE INDEX IF NOT EXISTS idx_transactions_customerId ON transactions(customerId);
        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_transactions_deleted_on ON transactions(deleted_on);
        CREATE INDEX IF NOT EXISTS idx_transaction_entries_transaction_id ON transaction_entries(transaction_id);
        CREATE INDEX IF NOT EXISTS idx_transaction_entries_stock_id ON transaction_entries(stock_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_transactionId ON ledger_entries(transactionId);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_customerId ON ledger_entries(customerId);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries(date);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_deleted_on ON ledger_entries(deleted_on);
        CREATE INDEX IF NOT EXISTS idx_ledger_entry_items_ledger_entry_id ON ledger_entry_items(ledger_entry_id);
        CREATE INDEX IF NOT EXISTS idx_rani_rupa_stock_itemtype ON rani_rupa_stock(itemtype);
        CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(date);
        CREATE INDEX IF NOT EXISTS idx_trades_createdAt ON trades(createdAt);
      `);

      // Initialize base inventory if not exists
      await db.runAsync(
        'INSERT OR IGNORE INTO base_inventory (id, gold999, gold995, silver, rani, rupu, money) VALUES (1, 0, 0, 0, 0, 0, 0)'
      );

    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  // Get database instance
  static getDatabase(): SQLite.SQLiteDatabase {
    if (!db) {
      throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
  }

  // Helper function to round inventory values to appropriate precision
  static roundInventoryValue(value: number, itemType: string): number {
    if (itemType === 'money') {
      return Math.round(value); // Whole rupees
    } else if (itemType.includes('gold') || itemType === 'rani') {
      return Math.round(value * 1000) / 1000; // 3 decimal places for gold
    } else if (itemType.includes('silver') || itemType === 'rupu') {
      return Math.round(value * 10) / 10; // 1 decimal place for silver
    }
    return Math.round(value * 1000) / 1000; // Default to 3 decimal places
  }

  // Export all data
  static async exportData(): Promise<{
    customers: any[];
    transactions: any[];
    ledger: any[];
    baseInventory: any;
    raniRupaStock: any[];
    settings: any;
  } | null> {
    try {
      const dbInstance = this.getDatabase();
      
      // Export customers with balances
      const customers = await dbInstance.getAllAsync('SELECT * FROM customers');
      const customersWithBalances = [];
      for (const customer of customers) {
        const balance = await dbInstance.getFirstAsync(
          'SELECT * FROM customer_balances WHERE customer_id = ?',
          [(customer as any).id]
        );
        customersWithBalances.push({ ...(customer as any), balance });
      }

      // Export transactions with entries
      const transactions = await dbInstance.getAllAsync('SELECT * FROM transactions');
      const transactionsWithEntries = [];
      for (const transaction of transactions) {
        const entries = await dbInstance.getAllAsync(
          'SELECT * FROM transaction_entries WHERE transaction_id = ?',
          [(transaction as any).id]
        );
        transactionsWithEntries.push({ ...(transaction as any), entries });
      }

      // Export ledger with items
      const ledger = await dbInstance.getAllAsync('SELECT * FROM ledger_entries');
      const ledgerWithItems = [];
      for (const entry of ledger) {
        const items = await dbInstance.getAllAsync(
          'SELECT * FROM ledger_entry_items WHERE ledger_entry_id = ?',
          [(entry as any).id]
        );
        ledgerWithItems.push({ ...(entry as any), entries: items });
      }

      // Export base inventory
      const baseInventory = await dbInstance.getFirstAsync(
        'SELECT * FROM base_inventory WHERE id = 1'
      );

      // Export rani/rupa stock
      const raniRupaStock = await dbInstance.getAllAsync('SELECT * FROM rani_rupa_stock');

      // Export settings
      const settingsRows = await dbInstance.getAllAsync('SELECT * FROM settings');
      const settings: any = {};
      for (const row of settingsRows) {
        settings[(row as any).key] = (row as any).value;
      }

      return {
        customers: customersWithBalances,
        transactions: transactionsWithEntries,
        ledger: ledgerWithItems,
        baseInventory,
        raniRupaStock,
        settings
      };
    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  }

  // Import data
  static async importData(data: {
    customers: any[];
    transactions: any[];
    ledger?: any[];
    baseInventory?: any;
    raniRupaStock?: any[];
    settings?: any;
  }): Promise<boolean> {
    const dbInstance = this.getDatabase();
    
    try {
      await dbInstance.execAsync('BEGIN TRANSACTION');

      // Clear existing data
      await dbInstance.runAsync('DELETE FROM ledger_entry_items');
      await dbInstance.runAsync('DELETE FROM ledger_entries');
      await dbInstance.runAsync('DELETE FROM transaction_entries');
      await dbInstance.runAsync('DELETE FROM transactions');
      await dbInstance.runAsync('DELETE FROM customer_balances');
      await dbInstance.runAsync('DELETE FROM customers');
      await dbInstance.runAsync('DELETE FROM rani_rupa_stock');
      await dbInstance.runAsync('DELETE FROM settings');

      // Import customers
      for (const customer of data.customers) {
        await dbInstance.runAsync(
          'INSERT INTO customers (id, name, lastTransaction, avatar) VALUES (?, ?, ?, ?)',
          [customer.id, customer.name, customer.lastTransaction || null, customer.avatar || null]
        );

        const balance = customer.balance || {};
        await dbInstance.runAsync(
          `INSERT INTO customer_balances (customer_id, balance, gold999, gold995, rani, silver, rupu) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            customer.id,
            balance.balance || 0,
            balance.gold999 || 0,
            balance.gold995 || 0,
            balance.rani || 0,
            balance.silver || 0,
            balance.rupu || 0
          ]
        );
      }

      // Import transactions
      for (const transaction of data.transactions) {
        await dbInstance.runAsync(
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

        // Import entries
        if (transaction.entries) {
          for (const entry of transaction.entries) {
            await dbInstance.runAsync(
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
      }

      // Import ledger
      if (data.ledger) {
        for (const entry of data.ledger) {
          await dbInstance.runAsync(
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

          // Import ledger items
          if (entry.entries) {
            for (const item of entry.entries) {
              const itemId = item.id || `ledger_item_${Date.now()}_${Math.random()}`;
              await dbInstance.runAsync(
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
        }
      }

      // Import base inventory
      if (data.baseInventory) {
        await dbInstance.runAsync(
          `UPDATE base_inventory 
           SET gold999 = ?, gold995 = ?, silver = ?, rani = ?, rupu = ?, money = ? 
           WHERE id = 1`,
          [
            data.baseInventory.gold999 || 0,
            data.baseInventory.gold995 || 0,
            data.baseInventory.silver || 0,
            data.baseInventory.rani || 0,
            data.baseInventory.rupu || 0,
            data.baseInventory.money || 0
          ]
        );
      }

      // Import rani/rupa stock
      if (data.raniRupaStock) {
        for (const stock of data.raniRupaStock) {
          await dbInstance.runAsync(
            'INSERT INTO rani_rupa_stock (stock_id, itemtype, weight, touch, date, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [stock.stock_id, stock.itemtype, stock.weight, stock.touch, stock.date, stock.createdAt]
          );
        }
      }

      // Import settings
      if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
          await dbInstance.runAsync(
            'INSERT INTO settings (key, value) VALUES (?, ?)',
            [key, value as string]
          );
        }
      }

      await dbInstance.execAsync('COMMIT');
      return true;
    } catch (error) {
      await dbInstance.execAsync('ROLLBACK');
      console.error('Error importing data:', error);
      return false;
    }
  }

  // Clear all data (preserves base inventory and settings)
  static async clearAllData(): Promise<boolean> {
    try {
      const dbInstance = this.getDatabase();
      
      await dbInstance.execAsync('BEGIN TRANSACTION');
      
      await dbInstance.runAsync('DELETE FROM ledger_entry_items');
      await dbInstance.runAsync('DELETE FROM ledger_entries');
      await dbInstance.runAsync('DELETE FROM transaction_entries');
      await dbInstance.runAsync('DELETE FROM transactions');
      await dbInstance.runAsync('DELETE FROM customer_balances');
      await dbInstance.runAsync('DELETE FROM customers');
      await dbInstance.runAsync('DELETE FROM rani_rupa_stock');
      await dbInstance.runAsync('DELETE FROM trades');
      
      // Clear device_id and last_transaction_id from settings
      await dbInstance.runAsync('DELETE FROM settings WHERE key IN (?, ?)', ['device_id', 'last_transaction_id']);
      
      await dbInstance.execAsync('COMMIT');
      
      return true;
    } catch (error) {
      console.error('Error clearing all data:', error);
      return false;
    }
  }
}
