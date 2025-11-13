import { LedgerEntry, Transaction, TransactionEntry } from '../types';
import { DatabaseService } from './database.sqlite';

export class LedgerService {
  // Get all ledger entries
  static async getAllLedgerEntries(): Promise<LedgerEntry[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const entries = await db.getAllAsync<{
        id: string;
        transactionId: string;
        customerId: string;
        customerName: string;
        date: string;
        amountReceived: number | null;
        amountGiven: number | null;
        createdAt: string;
      }>('SELECT * FROM ledger_entries ORDER BY date DESC');

      const result: LedgerEntry[] = [];
      
      for (const entry of entries) {
        // Get entry items
        const items = await db.getAllAsync<any>(
          'SELECT * FROM ledger_entry_items WHERE ledger_entry_id = ? ORDER BY createdAt ASC',
          [entry.id]
        );

        const mappedItems: TransactionEntry[] = items.map(item => ({
          id: item.id,
          type: item.type,
          itemType: item.itemType,
          weight: item.weight,
          price: item.price,
          touch: item.touch,
          cut: item.cut,
          extraPerKg: item.extraPerKg,
          pureWeight: item.pureWeight,
          moneyType: item.moneyType,
          amount: item.amount,
          metalOnly: item.metalOnly === 1,
          stock_id: item.stock_id,
          subtotal: item.subtotal,
          createdAt: item.createdAt,
          lastUpdatedAt: item.lastUpdatedAt,
        }));

        result.push({
          id: entry.id,
          transactionId: entry.transactionId,
          customerId: entry.customerId,
          customerName: entry.customerName,
          date: entry.date,
          amountReceived: entry.amountReceived || 0,
          amountGiven: entry.amountGiven || 0,
          entries: mappedItems,
          createdAt: entry.createdAt,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting ledger entries:', error);
      return [];
    }
  }

  // Get ledger entries by date range
  static async getLedgerEntriesByDate(startDate: Date, endDate: Date): Promise<LedgerEntry[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const entries = await db.getAllAsync<any>(
        'SELECT * FROM ledger_entries WHERE date >= ? AND date <= ? ORDER BY date DESC',
        [startDate.toISOString(), endDate.toISOString()]
      );

      const result: LedgerEntry[] = [];
      
      for (const entry of entries) {
        const items = await db.getAllAsync<any>(
          'SELECT * FROM ledger_entry_items WHERE ledger_entry_id = ? ORDER BY createdAt ASC',
          [entry.id]
        );

        const mappedItems: TransactionEntry[] = items.map(item => ({
          id: item.id,
          type: item.type,
          itemType: item.itemType,
          weight: item.weight,
          price: item.price,
          touch: item.touch,
          cut: item.cut,
          extraPerKg: item.extraPerKg,
          pureWeight: item.pureWeight,
          moneyType: item.moneyType,
          amount: item.amount,
          metalOnly: item.metalOnly === 1,
          stock_id: item.stock_id,
          subtotal: item.subtotal,
          createdAt: item.createdAt,
          lastUpdatedAt: item.lastUpdatedAt,
        }));

        result.push({
          id: entry.id,
          transactionId: entry.transactionId,
          customerId: entry.customerId,
          customerName: entry.customerName,
          date: entry.date,
          amountReceived: entry.amountReceived || 0,
          amountGiven: entry.amountGiven || 0,
          entries: mappedItems,
          createdAt: entry.createdAt,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting ledger entries by date:', error);
      return [];
    }
  }

  // Get ledger entries by date range (string-based for consistency)
  static async getLedgerEntriesByDateRange(startDate: string, endDate: string): Promise<LedgerEntry[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const entries = await db.getAllAsync<any>(
        'SELECT * FROM ledger_entries WHERE date >= ? AND date <= ? ORDER BY date DESC',
        [startDate, endDate]
      );

      const result: LedgerEntry[] = [];
      
      for (const entry of entries) {
        const items = await db.getAllAsync<any>(
          'SELECT * FROM ledger_entry_items WHERE ledger_entry_id = ? ORDER BY createdAt ASC',
          [entry.id]
        );

        const mappedItems: TransactionEntry[] = items.map(item => ({
          id: item.id,
          type: item.type,
          itemType: item.itemType,
          weight: item.weight,
          price: item.price,
          touch: item.touch,
          cut: item.cut,
          extraPerKg: item.extraPerKg,
          pureWeight: item.pureWeight,
          moneyType: item.moneyType,
          amount: item.amount,
          metalOnly: item.metalOnly === 1,
          stock_id: item.stock_id,
          subtotal: item.subtotal,
          createdAt: item.createdAt,
          lastUpdatedAt: item.lastUpdatedAt,
        }));

        result.push({
          id: entry.id,
          transactionId: entry.transactionId,
          customerId: entry.customerId,
          customerName: entry.customerName,
          date: entry.date,
          amountReceived: entry.amountReceived || 0,
          amountGiven: entry.amountGiven || 0,
          entries: mappedItems,
          createdAt: entry.createdAt,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting ledger entries by date range:', error);
      return [];
    }
  }

  // Get ledger entries by transaction ID
  static async getLedgerEntriesByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const entries = await db.getAllAsync<any>(
        'SELECT * FROM ledger_entries WHERE transactionId = ? ORDER BY date DESC',
        [transactionId]
      );

      const result: LedgerEntry[] = [];
      
      for (const entry of entries) {
        const items = await db.getAllAsync<any>(
          'SELECT * FROM ledger_entry_items WHERE ledger_entry_id = ? ORDER BY createdAt ASC',
          [entry.id]
        );

        const mappedItems: TransactionEntry[] = items.map(item => ({
          id: item.id,
          type: item.type,
          itemType: item.itemType,
          weight: item.weight,
          price: item.price,
          touch: item.touch,
          cut: item.cut,
          extraPerKg: item.extraPerKg,
          pureWeight: item.pureWeight,
          moneyType: item.moneyType,
          amount: item.amount,
          metalOnly: item.metalOnly === 1,
          stock_id: item.stock_id,
          subtotal: item.subtotal,
          createdAt: item.createdAt,
          lastUpdatedAt: item.lastUpdatedAt,
        }));

        result.push({
          id: entry.id,
          transactionId: entry.transactionId,
          customerId: entry.customerId,
          customerName: entry.customerName,
          date: entry.date,
          amountReceived: entry.amountReceived || 0,
          amountGiven: entry.amountGiven || 0,
          entries: mappedItems,
          createdAt: entry.createdAt,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting ledger entries by transaction ID:', error);
      return [];
    }
  }

  // Get ledger entries by customer ID
  static async getLedgerEntriesByCustomerId(customerId: string): Promise<LedgerEntry[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const entries = await db.getAllAsync<any>(
        'SELECT * FROM ledger_entries WHERE customerId = ? ORDER BY date DESC',
        [customerId]
      );

      const result: LedgerEntry[] = [];
      
      for (const entry of entries) {
        const items = await db.getAllAsync<any>(
          'SELECT * FROM ledger_entry_items WHERE ledger_entry_id = ? ORDER BY createdAt ASC',
          [entry.id]
        );

        const mappedItems: TransactionEntry[] = items.map(item => ({
          id: item.id,
          type: item.type,
          itemType: item.itemType,
          weight: item.weight,
          price: item.price,
          touch: item.touch,
          cut: item.cut,
          extraPerKg: item.extraPerKg,
          pureWeight: item.pureWeight,
          moneyType: item.moneyType,
          amount: item.amount,
          metalOnly: item.metalOnly === 1,
          stock_id: item.stock_id,
          subtotal: item.subtotal,
          createdAt: item.createdAt,
          lastUpdatedAt: item.lastUpdatedAt,
        }));

        result.push({
          id: entry.id,
          transactionId: entry.transactionId,
          customerId: entry.customerId,
          customerName: entry.customerName,
          date: entry.date,
          amountReceived: entry.amountReceived || 0,
          amountGiven: entry.amountGiven || 0,
          entries: mappedItems,
          createdAt: entry.createdAt,
        });
      }

      return result;
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
          transaction.total >= 0 ? Math.abs(deltaAmount) : 0,
          transaction.total < 0 ? Math.abs(deltaAmount) : 0,
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
            entry.createdAt || timestamp,
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

  // Delete ledger entry
  static async deleteLedgerEntry(ledgerId: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Foreign key cascade will handle deleting items
      await db.runAsync('DELETE FROM ledger_entries WHERE id = ?', [ledgerId]);
      
      return true;
    } catch (error) {
      console.error('Error deleting ledger entry:', error);
      return false;
    }
  }
}
