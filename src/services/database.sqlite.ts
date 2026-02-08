import * as SQLite from 'expo-sqlite';

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
          silver REAL DEFAULT 0,
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
          deleted_on DATE,
          note TEXT,
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
          customer_id TEXT,
          customerName TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('sell', 'purchase')),
          itemType TEXT NOT NULL CHECK(itemType IN ('gold999', 'gold995', 'silver', 'rani', 'rupu')),
          price REAL NOT NULL,
          weight REAL NOT NULL,
          date DATETIME NOT NULL,
          createdAt DATETIME NOT NULL,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
        );

        -- Ledger Entries Table (Flattened)
        CREATE TABLE IF NOT EXISTS ledger_entries (
          id TEXT PRIMARY KEY NOT NULL,
          transactionId TEXT NOT NULL,
          customerId TEXT NOT NULL,
          customerName TEXT NOT NULL,
          date DATETIME NOT NULL,
          type TEXT NOT NULL,      -- 'sell', 'purchase', 'receive', 'give'
          itemType TEXT NOT NULL,  -- 'gold999', 'silver', 'money', etc.
          weight REAL DEFAULT 0,
          touch REAL DEFAULT 0,
          amount REAL DEFAULT 0,   -- For money entries
          deleted_on DATE,
          createdAt DATETIME NOT NULL,
          FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE,
          FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE
        );

        -- Rani-Rupa Stock Table
        CREATE TABLE IF NOT EXISTS rani_rupa_stock (
          stock_id TEXT PRIMARY KEY NOT NULL,
          itemtype TEXT NOT NULL CHECK(itemtype IN ('rani', 'rupu')),
          weight REAL NOT NULL,
          touch REAL NOT NULL,
          date DATE NOT NULL,
          createdAt DATETIME NOT NULL,
          isSold INTEGER DEFAULT 0
        );

        -- Rate Cut History Table
        CREATE TABLE IF NOT EXISTS rate_cut_history (
          id TEXT PRIMARY KEY NOT NULL,
          customer_id TEXT NOT NULL,
          metal_type TEXT NOT NULL CHECK(metal_type IN ('gold999', 'gold995', 'silver')),
          weight_cut REAL NOT NULL,
          rate REAL NOT NULL,
          total_amount REAL NOT NULL,
          cut_date INTEGER NOT NULL,
          created_at DATETIME NOT NULL,
          direction TEXT DEFAULT 'sell' CHECK(direction IN ('sell', 'purchase')),
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );

        -- Base Inventory Settings Table
        CREATE TABLE IF NOT EXISTS base_inventory (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          gold999 REAL NOT NULL DEFAULT 0,
          gold995 REAL NOT NULL DEFAULT 0,
          silver REAL NOT NULL DEFAULT 0,
          money REAL NOT NULL DEFAULT 0
        );

        -- Settings Table
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        -- Daily Opening Balances Table (The Chain)
        CREATE TABLE IF NOT EXISTS daily_opening_balances (
          date TEXT PRIMARY KEY NOT NULL, -- Format: YYYY-MM-DD
          gold999 REAL DEFAULT 0,
          gold995 REAL DEFAULT 0,
          silver REAL DEFAULT 0,
          rani REAL DEFAULT 0,    -- Total Pure Weight
          rupu REAL DEFAULT 0,    -- Total Pure Weight
          money REAL DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_opening_balances_date ON daily_opening_balances(date);

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
        CREATE INDEX IF NOT EXISTS idx_rani_rupa_stock_itemtype ON rani_rupa_stock(itemtype);
        CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(date);
        CREATE INDEX IF NOT EXISTS idx_trades_createdAt ON trades(createdAt);
        CREATE INDEX IF NOT EXISTS idx_rate_cut_history_customer_id ON rate_cut_history(customer_id);
      `);

      // Initialize base inventory if not exists
      await db.runAsync(
        'INSERT OR IGNORE INTO base_inventory (id, gold999, gold995, silver, money) VALUES (1, 0, 0, 0, 0)'
      );

      // Add note column to transactions table if it doesn't exist
      try {
        await db.execAsync('ALTER TABLE transactions ADD COLUMN note TEXT;');
      } catch (e) {
        // Column likely already exists, ignore error
      }

      // Add isSold column to rani_rupa_stock table if it doesn't exist
      try {
        await db.execAsync('ALTER TABLE rani_rupa_stock ADD COLUMN isSold INTEGER DEFAULT 0;');
      } catch (e) {
        // Column likely already exists, ignore error
      }

      // Add lock date columns to customer_balances table if they don't exist
      try {
        await db.execAsync('ALTER TABLE customer_balances ADD COLUMN last_gold999_lock_date INTEGER DEFAULT 0;');
      } catch (e) {
        // Column likely already exists, ignore error
      }
      try {
        await db.execAsync('ALTER TABLE customer_balances ADD COLUMN last_gold995_lock_date INTEGER DEFAULT 0;');
      } catch (e) {
        // Column likely already exists, ignore error
      }
      try {
        await db.execAsync('ALTER TABLE customer_balances ADD COLUMN last_silver_lock_date INTEGER DEFAULT 0;');
      } catch (e) {
        // Column likely already exists, ignore error
      }

      // Add direction column to rate_cut_history table if it doesn't exist
      try {
        await db.execAsync('ALTER TABLE rate_cut_history ADD COLUMN direction TEXT DEFAULT \'sell\' CHECK(direction IN (\'sell\', \'purchase\'));');
      } catch (e) {
        // Column likely already exists, ignore error
      }

      // Add customer_id column to trades table if it doesn't exist
      try {
        await db.execAsync('ALTER TABLE trades ADD COLUMN customer_id TEXT;');
      } catch (e) {
        // Column likely already exists, ignore error
      }

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

  // Export all data
  static async exportData(): Promise<{
    customers: any[];
    transactions: any[];
    ledger: any[];
    baseInventory: any;
    raniRupaStock: any[];
    settings: any;
    rateCutHistory: any[];
    dailyOpeningBalances: any[];
    trades: any[];
  } | null> {
    try {
      const db = this.getDatabase();
      
      // Export customers with balances
      const customers = await DatabaseService.getAllAsyncBatch('SELECT * FROM customers');
      const customersWithBalances = [];
      for (const customer of customers) {
        const balance = await db.getFirstAsync(
          'SELECT * FROM customer_balances WHERE customer_id = ?',
          [(customer as any).id]
        );
        customersWithBalances.push({ ...(customer as any), balance });
      }

      // Export transactions with entries
      const transactions = await DatabaseService.getAllAsyncBatch('SELECT * FROM transactions');
      const transactionsWithEntries = [];
      for (const transaction of transactions) {
        const entries = await DatabaseService.getAllAsyncBatch(
          'SELECT * FROM transaction_entries WHERE transaction_id = ?',
          [(transaction as any).id]
        );
        transactionsWithEntries.push({ ...(transaction as any), entries });
      }

      // Export ledger (flattened)
      const ledger = await DatabaseService.getAllAsyncBatch('SELECT * FROM ledger_entries');

      // Export base inventory
      const baseInventory = await db.getFirstAsync(
        'SELECT * FROM base_inventory WHERE id = 1'
      );

      // Export rani/rupa stock
      const raniRupaStock = await DatabaseService.getAllAsyncBatch('SELECT * FROM rani_rupa_stock');

      // Export settings
      const settingsRows = await DatabaseService.getAllAsyncBatch('SELECT * FROM settings');
      const settings: any = {};
      for (const row of settingsRows) {
        settings[(row as any).key] = (row as any).value;
      }

      // Export rate cut history
      const rateCutHistory = await DatabaseService.getAllAsyncBatch('SELECT * FROM rate_cut_history');

      // Export daily opening balances
      const dailyOpeningBalances = await DatabaseService.getAllAsyncBatch('SELECT * FROM daily_opening_balances');

      // Export trades
      const trades = await DatabaseService.getAllAsyncBatch('SELECT * FROM trades');

      return {
        customers: customersWithBalances,
        transactions: transactionsWithEntries,
        ledger,
        baseInventory,
        raniRupaStock,
        settings,
        rateCutHistory,
        dailyOpeningBalances,
        trades
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
    rateCutHistory?: any[];
    dailyOpeningBalances?: any[];
    trades?: any[];
  }): Promise<boolean> {
    const db = this.getDatabase();
    
    try {
      await db.execAsync('BEGIN TRANSACTION');

      // Clear existing data
      // await db.runAsync('DELETE FROM ledger_entry_items'); // Removed
      await db.runAsync('DELETE FROM ledger_entries');
      await db.runAsync('DELETE FROM transaction_entries');
      await db.runAsync('DELETE FROM transactions');
      await db.runAsync('DELETE FROM customer_balances');
      await db.runAsync('DELETE FROM customers');
      await db.runAsync('DELETE FROM rani_rupa_stock');
      await db.runAsync('DELETE FROM settings');
      await db.runAsync('DELETE FROM rate_cut_history');
      await db.runAsync('DELETE FROM daily_opening_balances');
      await db.runAsync('DELETE FROM trades');

      // Import customers
      for (const customer of data.customers) {
        await db.runAsync(
          'INSERT INTO customers (id, name, lastTransaction, avatar) VALUES (?, ?, ?, ?)',
          [customer.id, customer.name, customer.lastTransaction || null, customer.avatar || null]
        );

        const balance = customer.balance || {};
        await db.runAsync(
          `INSERT INTO customer_balances (customer_id, balance, gold999, gold995, silver) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            customer.id,
            balance.balance || 0,
            balance.gold999 || 0,
            balance.gold995 || 0,
            balance.silver || 0
          ]
        );
      }

      // Import transactions
      for (const transaction of data.transactions) {
        await db.runAsync(
          `INSERT INTO transactions 
           (id, deviceId, customerId, customerName, date, total, 
            amountPaid, createdAt, lastUpdatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transaction.id,
            transaction.deviceId || null,
            transaction.customerId,
            transaction.customerName,
            transaction.date,
            transaction.total,
            transaction.amountPaid,
            transaction.createdAt,
            transaction.lastUpdatedAt
          ]
        );

        // Import entries
        if (transaction.entries) {
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
      }

      // Import ledger (Flattened)
      if (data.ledger) {
        for (const entry of data.ledger) {
          await db.runAsync(
            `INSERT INTO ledger_entries 
             (id, transactionId, customerId, customerName, date, type, itemType, weight, touch, amount, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              entry.transactionId,
              entry.customerId,
              entry.customerName,
              entry.date,
              entry.type,
              entry.itemType,
              entry.weight || 0,
              entry.touch || 0,
              entry.amount || 0,
              entry.createdAt
            ]
          );
        }
      }

      // Import base inventory
      if (data.baseInventory) {
        await db.runAsync(
          `UPDATE base_inventory 
           SET gold999 = ?, gold995 = ?, silver = ?, money = ? 
           WHERE id = 1`,
          [
            data.baseInventory.gold999 || 0,
            data.baseInventory.gold995 || 0,
            data.baseInventory.silver || 0,
            data.baseInventory.money || 0
          ]
        );
      }

      // Import rani/rupa stock
      if (data.raniRupaStock) {
        for (const stock of data.raniRupaStock) {
          await db.runAsync(
            'INSERT INTO rani_rupa_stock (stock_id, itemtype, weight, touch, date, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [stock.stock_id, stock.itemtype, stock.weight, stock.touch, stock.date, stock.createdAt]
          );
        }
      }

      // Import settings
      if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
          await db.runAsync(
            'INSERT INTO settings (key, value) VALUES (?, ?)',
            [key, value as string]
          );
        }
      }

      // Import rate cut history
      if (data.rateCutHistory) {
        for (const item of data.rateCutHistory) {
          await db.runAsync(
            'INSERT INTO rate_cut_history (id, customer_id, metal_type, weight_cut, rate, total_amount, cut_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [item.id, item.customer_id, item.metal_type, item.weight_cut, item.rate, item.total_amount, item.cut_date, item.created_at]
          );
        }
      }

      // Import daily opening balances
      if (data.dailyOpeningBalances) {
        for (const item of data.dailyOpeningBalances) {
          await db.runAsync(
            'INSERT INTO daily_opening_balances (date, gold999, gold995, silver, rani, rupu, money, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [item.date, item.gold999 || 0, item.gold995 || 0, item.silver || 0, item.rani || 0, item.rupu || 0, item.money || 0, item.updated_at || new Date().toISOString()]
          );
        }
      }

      // Import trades
      if (data.trades) {
        for (const item of data.trades) {
          await db.runAsync(
            'INSERT INTO trades (id, customerName, type, itemType, price, weight, date, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [item.id, item.customerName, item.type, item.itemType, item.price, item.weight, item.date, item.createdAt]
          );
        }
      }

      await db.execAsync('COMMIT');
      return true;
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('Error importing data:', error);
      return false;
    }
  }

  // Clear all data (preserves base inventory and settings)
  static async clearAllData(): Promise<boolean> {
    try {
      const db = this.getDatabase();
      
      await db.execAsync('BEGIN TRANSACTION');
      
      await db.runAsync('DELETE FROM ledger_entries');
      await db.runAsync('DELETE FROM transaction_entries');
      await db.runAsync('DELETE FROM transactions');
      await db.runAsync('DELETE FROM customer_balances');
      await db.runAsync('DELETE FROM customers');
      await db.runAsync('DELETE FROM rani_rupa_stock');
      await db.runAsync('DELETE FROM trades');
      await db.runAsync('DELETE FROM daily_opening_balances');
      await db.runAsync('DELETE FROM rate_cut_history');
      
      // Clear device_id and last_transaction_id from settings
      await db.runAsync('DELETE FROM settings WHERE key IN (?, ?)', ['device_id', 'last_transaction_id']);
      
      await db.execAsync('COMMIT');
      
      return true;
    } catch (error) {
      console.error('Error clearing all data:', error);
      return false;
    }
  }

  // Batch version of getAllAsync to handle large datasets
  static async getAllAsyncBatch<T = any>(
    query: string,
    params: any[] = [],
  ): Promise<T[]> {
    const db = this.getDatabase();
    // 1. Await the database query to get actual rows
    const rows = await db.getAllAsync(query, params); 
    // 2. Return the rows
    return rows as unknown as T[];
  }
}
