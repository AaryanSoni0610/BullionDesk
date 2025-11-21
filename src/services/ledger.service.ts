import { LedgerEntry, Transaction } from '../types';
import { DatabaseService } from './database.sqlite';

export class LedgerService {
  // Get all ledger entries
  static async getAllLedgerEntries(): Promise<LedgerEntry[]> {
    try {

      // Optimized query with JOIN and soft delete filtering
      const rows = await DatabaseService.getAllAsyncBatch<any>(
        `SELECT
          le.id, le.transactionId, le.customerId, le.customerName, le.date,
          le.amountReceived, le.amountGiven, le.createdAt,
          lei.id as item_id, lei.type, lei.itemType, lei.weight, lei.price,
          lei.touch, lei.cut, lei.extraPerKg, lei.pureWeight, lei.moneyType,
          lei.amount, lei.metalOnly, lei.stock_id, lei.subtotal,
          lei.createdAt as item_createdAt, lei.lastUpdatedAt as item_lastUpdatedAt
        FROM ledger_entries le
        LEFT JOIN ledger_entry_items lei ON le.id = lei.ledger_entry_id
        JOIN transactions t ON le.transactionId = t.id
        WHERE le.deleted_on IS NULL
          AND t.deleted_on IS NULL
        ORDER BY le.date DESC, lei.createdAt ASC`
      );

      // Group results by ledger entry ID
      const entryMap = new Map<string, LedgerEntry>();

      for (const row of rows) {
        const entryId = row.id;

        if (!entryMap.has(entryId)) {
          // Create new ledger entry
          entryMap.set(entryId, {
            id: row.id,
            transactionId: row.transactionId,
            customerId: row.customerId,
            customerName: row.customerName,
            date: row.date,
            amountReceived: row.amountReceived || 0,
            amountGiven: row.amountGiven || 0,
            entries: [],
            createdAt: row.createdAt,
          });
        }

        // Add item to the entry (if it exists)
        if (row.item_id) {
          const entry = entryMap.get(entryId)!;
          entry.entries.push({
            id: row.item_id,
            type: row.type,
            itemType: row.itemType,
            weight: row.weight,
            price: row.price,
            touch: row.touch,
            cut: row.cut,
            extraPerKg: row.extraPerKg,
            pureWeight: row.pureWeight,
            moneyType: row.moneyType,
            amount: row.amount,
            metalOnly: row.metalOnly === 1,
            stock_id: row.stock_id,
            subtotal: row.subtotal,
            createdAt: row.item_createdAt,
            lastUpdatedAt: row.item_lastUpdatedAt,
          });
        }
      }

      return Array.from(entryMap.values());
    } catch (error) {
      console.error('Error getting ledger entries:', error);
      return [];
    }
  }

  // Get ledger entries by date range
  static async getLedgerEntriesByDate(startDate: Date, endDate: Date): Promise<LedgerEntry[]> {
    try {

      // Optimized query with JOIN and soft delete filtering
      const rows = await DatabaseService.getAllAsyncBatch<any>(
        `SELECT
          le.id, le.transactionId, le.customerId, le.customerName, le.date,
          le.amountReceived, le.amountGiven, le.createdAt,
          lei.id as item_id, lei.type, lei.itemType, lei.weight, lei.price,
          lei.touch, lei.cut, lei.extraPerKg, lei.pureWeight, lei.moneyType,
          lei.amount, lei.metalOnly, lei.stock_id, lei.subtotal,
          lei.createdAt as item_createdAt, lei.lastUpdatedAt as item_lastUpdatedAt
        FROM ledger_entries le
        LEFT JOIN ledger_entry_items lei ON le.id = lei.ledger_entry_id
        JOIN transactions t ON le.transactionId = t.id
        WHERE le.date >= ? AND le.date <= ?
          AND le.deleted_on IS NULL
          AND t.deleted_on IS NULL
        ORDER BY le.date DESC, lei.createdAt ASC`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
      );

      // Group results by ledger entry ID
      const entryMap = new Map<string, LedgerEntry>();

      for (const row of rows) {
        const entryId = row.id;

        if (!entryMap.has(entryId)) {
          // Create new ledger entry
          entryMap.set(entryId, {
            id: row.id,
            transactionId: row.transactionId,
            customerId: row.customerId,
            customerName: row.customerName,
            date: row.date,
            amountReceived: row.amountReceived || 0,
            amountGiven: row.amountGiven || 0,
            entries: [],
            createdAt: row.createdAt,
          });
        }

        // Add item to the entry (if it exists)
        if (row.item_id) {
          const entry = entryMap.get(entryId)!;
          entry.entries.push({
            id: row.item_id,
            type: row.type,
            itemType: row.itemType,
            weight: row.weight,
            price: row.price,
            touch: row.touch,
            cut: row.cut,
            extraPerKg: row.extraPerKg,
            pureWeight: row.pureWeight,
            moneyType: row.moneyType,
            amount: row.amount,
            metalOnly: row.metalOnly === 1,
            stock_id: row.stock_id,
            subtotal: row.subtotal,
            createdAt: row.item_createdAt,
            lastUpdatedAt: row.item_lastUpdatedAt,
          });
        }
      }

      return Array.from(entryMap.values());
    } catch (error) {
      console.error('Error getting ledger entries by date:', error);
      return [];
    }
  }

  // Get ledger entries by date range (string-based for consistency)
  static async getLedgerEntriesByDateRange(startDate: string, endDate: string): Promise<LedgerEntry[]> {
    try {

      // Optimized query with JOIN and soft delete filtering
      const rows = await DatabaseService.getAllAsyncBatch<any>(
        `SELECT
          le.id, le.transactionId, le.customerId, le.customerName, le.date,
          le.amountReceived, le.amountGiven, le.createdAt,
          lei.id as item_id, lei.type, lei.itemType, lei.weight, lei.price,
          lei.touch, lei.cut, lei.extraPerKg, lei.pureWeight, lei.moneyType,
          lei.amount, lei.metalOnly, lei.stock_id, lei.subtotal,
          lei.createdAt as item_createdAt, lei.lastUpdatedAt as item_lastUpdatedAt
        FROM ledger_entries le
        LEFT JOIN ledger_entry_items lei ON le.id = lei.ledger_entry_id
        JOIN transactions t ON le.transactionId = t.id
        WHERE le.date >= ? AND le.date <= ?
          AND le.deleted_on IS NULL
          AND t.deleted_on IS NULL
        ORDER BY le.date DESC, lei.createdAt ASC`,
        [startDate, endDate]
      );

      // Group results by ledger entry ID
      const entryMap = new Map<string, LedgerEntry>();

      for (const row of rows) {
        const entryId = row.id;

        if (!entryMap.has(entryId)) {
          // Create new ledger entry
          entryMap.set(entryId, {
            id: row.id,
            transactionId: row.transactionId,
            customerId: row.customerId,
            customerName: row.customerName,
            date: row.date,
            amountReceived: row.amountReceived || 0,
            amountGiven: row.amountGiven || 0,
            entries: [],
            createdAt: row.createdAt,
          });
        }

        // Add item to the entry (if it exists)
        if (row.item_id) {
          const entry = entryMap.get(entryId)!;
          entry.entries.push({
            id: row.item_id,
            type: row.type,
            itemType: row.itemType,
            weight: row.weight,
            price: row.price,
            touch: row.touch,
            cut: row.cut,
            extraPerKg: row.extraPerKg,
            pureWeight: row.pureWeight,
            moneyType: row.moneyType,
            amount: row.amount,
            metalOnly: row.metalOnly === 1,
            stock_id: row.stock_id,
            subtotal: row.subtotal,
            createdAt: row.item_createdAt,
            lastUpdatedAt: row.item_lastUpdatedAt,
          });
        }
      }

      return Array.from(entryMap.values());
    } catch (error) {
      console.error('Error getting ledger entries by date range:', error);
      return [];
    }
  }

  // Get ledger entries by transaction ID
  static async getLedgerEntriesByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    try {

      // Optimized query with JOIN and soft delete filtering
      const rows = await DatabaseService.getAllAsyncBatch<any>(
        `SELECT
          le.id, le.transactionId, le.customerId, le.customerName, le.date,
          le.amountReceived, le.amountGiven, le.createdAt,
          lei.id as item_id, lei.type, lei.itemType, lei.weight, lei.price,
          lei.touch, lei.cut, lei.extraPerKg, lei.pureWeight, lei.moneyType,
          lei.amount, lei.metalOnly, lei.stock_id, lei.subtotal,
          lei.createdAt as item_createdAt, lei.lastUpdatedAt as item_lastUpdatedAt
        FROM ledger_entries le
        LEFT JOIN ledger_entry_items lei ON le.id = lei.ledger_entry_id
        JOIN transactions t ON le.transactionId = t.id
        WHERE le.transactionId = ?
          AND le.deleted_on IS NULL
          AND t.deleted_on IS NULL
        ORDER BY le.date DESC, lei.createdAt ASC`,
        [transactionId]
      );

      // Group results by ledger entry ID
      const entryMap = new Map<string, LedgerEntry>();

      for (const row of rows) {
        const entryId = row.id;

        if (!entryMap.has(entryId)) {
          // Create new ledger entry
          entryMap.set(entryId, {
            id: row.id,
            transactionId: row.transactionId,
            customerId: row.customerId,
            customerName: row.customerName,
            date: row.date,
            amountReceived: row.amountReceived || 0,
            amountGiven: row.amountGiven || 0,
            entries: [],
            createdAt: row.createdAt,
          });
        }

        // Add item to the entry (if it exists)
        if (row.item_id) {
          const entry = entryMap.get(entryId)!;
          entry.entries.push({
            id: row.item_id,
            type: row.type,
            itemType: row.itemType,
            weight: row.weight,
            price: row.price,
            touch: row.touch,
            cut: row.cut,
            extraPerKg: row.extraPerKg,
            pureWeight: row.pureWeight,
            moneyType: row.moneyType,
            amount: row.amount,
            metalOnly: row.metalOnly === 1,
            stock_id: row.stock_id,
            subtotal: row.subtotal,
            createdAt: row.item_createdAt,
            lastUpdatedAt: row.item_lastUpdatedAt,
          });
        }
      }

      return Array.from(entryMap.values());
    } catch (error) {
      console.error('Error getting ledger entries by transaction ID:', error);
      return [];
    }
  }

  // Get ledger entries by customer ID
  static async getLedgerEntriesByCustomerId(customerId: string): Promise<LedgerEntry[]> {
    try {

      // Optimized query with JOIN and soft delete filtering
      const rows = await DatabaseService.getAllAsyncBatch<any>(
        `SELECT
          le.id, le.transactionId, le.customerId, le.customerName, le.date,
          le.amountReceived, le.amountGiven, le.createdAt,
          lei.id as item_id, lei.type, lei.itemType, lei.weight, lei.price,
          lei.touch, lei.cut, lei.extraPerKg, lei.pureWeight, lei.moneyType,
          lei.amount, lei.metalOnly, lei.stock_id, lei.subtotal,
          lei.createdAt as item_createdAt, lei.lastUpdatedAt as item_lastUpdatedAt
        FROM ledger_entries le
        LEFT JOIN ledger_entry_items lei ON le.id = lei.ledger_entry_id
        JOIN transactions t ON le.transactionId = t.id
        WHERE le.customerId = ?
          AND le.deleted_on IS NULL
          AND t.deleted_on IS NULL
        ORDER BY le.date DESC, lei.createdAt ASC`,
        [customerId]
      );

      // Group results by ledger entry ID
      const entryMap = new Map<string, LedgerEntry>();

      for (const row of rows) {
        const entryId = row.id;

        if (!entryMap.has(entryId)) {
          // Create new ledger entry
          entryMap.set(entryId, {
            id: row.id,
            transactionId: row.transactionId,
            customerId: row.customerId,
            customerName: row.customerName,
            date: row.date,
            amountReceived: row.amountReceived || 0,
            amountGiven: row.amountGiven || 0,
            entries: [],
            createdAt: row.createdAt,
          });
        }

        // Add item to the entry (if it exists)
        if (row.item_id) {
          const entry = entryMap.get(entryId)!;
          entry.entries.push({
            id: row.item_id,
            type: row.type,
            itemType: row.itemType,
            weight: row.weight,
            price: row.price,
            touch: row.touch,
            cut: row.cut,
            extraPerKg: row.extraPerKg,
            pureWeight: row.pureWeight,
            moneyType: row.moneyType,
            amount: row.amount,
            metalOnly: row.metalOnly === 1,
            stock_id: row.stock_id,
            subtotal: row.subtotal,
            createdAt: row.item_createdAt,
            lastUpdatedAt: row.item_lastUpdatedAt,
          });
        }
      }

      return Array.from(entryMap.values());
    } catch (error) {
      console.error('Error getting ledger entries by customer ID:', error);
      return [];
    }
  }

  // Create ledger entry
  static async createLedgerEntry(
    transaction: Transaction,
    deltaAmount: number,
    timestamp: string
  ): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      const ledgerId = `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Insert ledger entry
      await db.runAsync(
        `INSERT INTO ledger_entries 
         (id, transactionId, customerId, customerName, date, amountReceived, amountGiven, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ledgerId,
          transaction.id,
          transaction.customerId,
          transaction.customerName,
          timestamp,
          deltaAmount >= 0 ? Math.abs(deltaAmount) : 0,
          deltaAmount < 0 ? Math.abs(deltaAmount) : 0,
          timestamp
        ]
      );

      // Insert ledger entry items
      for (const entry of transaction.entries) {
        const itemId = `ledger_item_${Date.now()}_${Math.random()}`;
        
        await db.runAsync(
          `INSERT INTO ledger_entry_items 
           (id, ledger_entry_id, type, itemType, weight, price, touch, cut, extraPerKg, 
            pureWeight, moneyType, amount, metalOnly, stock_id, subtotal, createdAt, lastUpdatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            ledgerId,
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
            timestamp,
            entry.lastUpdatedAt || timestamp
          ]
        );
      }

      return true;
    } catch (error) {
      console.error('Error creating ledger entry:', error);
      return false;
    }
  }

  // Delete ledger entry (soft delete)
  static async deleteLedgerEntry(ledgerId: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();

      // Soft delete the ledger entry
      await db.runAsync('UPDATE ledger_entries SET deleted_on = ? WHERE id = ?', [
        new Date().toISOString().split('T')[0],
        ledgerId
      ]);

      return true;
    } catch (error) {
      console.error('Error soft deleting ledger entry:', error);
      return false;
    }
  }

  // Delete ledger entries by transaction ID (soft delete)
  static async deleteLedgerEntryByTransactionId(transactionId: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();

      // Soft delete all ledger entries for this transaction
      await db.runAsync('UPDATE ledger_entries SET deleted_on = ? WHERE transactionId = ?', [
        new Date().toISOString().split('T')[0],
        transactionId
      ]);

      return true;
    } catch (error) {
      console.error('Error soft deleting ledger entries by transaction ID:', error);
      return false;
    }
  }
}
