import { LedgerEntry, Transaction, PaymentInput, Customer } from '../types';
import { DatabaseService } from './database.sqlite';

export class LedgerService {
  // Get all ledger entries
  static async getAllLedgerEntries(): Promise<LedgerEntry[]> {
    try {
      const rows = await DatabaseService.getAllAsyncBatch<LedgerEntry>(
        `SELECT * FROM ledger_entries WHERE deleted_on IS NULL ORDER BY date DESC`
      );
      return rows;
    } catch (error) {
      console.error('Error getting ledger entries:', error);
      return [];
    }
  }

  // Get ledger entries by date range
  static async getLedgerEntriesByDate(startDate: Date, endDate: Date): Promise<LedgerEntry[]> {
    return this.getLedgerEntriesByDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }

  // Get ledger entries by date range (string-based for consistency)
  static async getLedgerEntriesByDateRange(startDate: string, endDate: string): Promise<LedgerEntry[]> {
    try {
      const rows = await DatabaseService.getAllAsyncBatch<LedgerEntry>(
        `SELECT * FROM ledger_entries 
         WHERE date >= ? AND date <= ? AND deleted_on IS NULL 
         ORDER BY date DESC`,
        [startDate, endDate]
      );
      return rows;
    } catch (error) {
      console.error('Error getting ledger entries by date range:', error);
      return [];
    }
  }

  // Get ledger entries by transaction ID
  static async getLedgerEntriesByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    try {
      const rows = await DatabaseService.getAllAsyncBatch<LedgerEntry>(
        `SELECT * FROM ledger_entries 
         WHERE transactionId = ? AND deleted_on IS NULL 
         ORDER BY date DESC`,
        [transactionId]
      );
      return rows;
    } catch (error) {
      console.error('Error getting ledger entries by transaction ID:', error);
      return [];
    }
  }

  // Get ledger entries by customer ID
  static async getLedgerEntriesByCustomerId(customerId: string): Promise<LedgerEntry[]> {
    try {
      const rows = await DatabaseService.getAllAsyncBatch<LedgerEntry>(
        `SELECT * FROM ledger_entries 
         WHERE customerId = ? AND deleted_on IS NULL 
         ORDER BY date DESC`,
        [customerId]
      );
      return rows;
    } catch (error) {
      console.error('Error getting ledger entries by customer ID:', error);
      return [];
    }
  }

  // Delete ledger entries by transaction ID (Soft Delete)
  static async deleteLedgerEntryByTransactionId(transactionId: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      await db.runAsync(
        `UPDATE ledger_entries SET deleted_on = ? WHERE transactionId = ?`,
        [new Date().toISOString().split('T')[0], transactionId]
      );
      return true;
    } catch (error) {
      console.error('Error deleting ledger entries by transaction ID:', error);
      return false;
    }
  }

  // Sync metal entries to ledger
  static async syncMetalLedgerEntries(
    transaction: Transaction,
    saveDate: string
  ): Promise<boolean> {
    const db = DatabaseService.getDatabase();
    try {
      // Delete existing metal entries for this transaction
      await db.runAsync(
        `DELETE FROM ledger_entries WHERE transactionId = ? AND itemType != 'money'`,
        [transaction.id]
      );

      // Insert new metal entries based on current transaction state
      for (const entry of transaction.entries) {
        if (entry.itemType !== 'money') {
          const ledgerId = `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          await db.runAsync(
            `INSERT INTO ledger_entries 
             (id, transactionId, customerId, customerName, date, type, itemType, weight, touch, amount, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ledgerId,
              transaction.id,
              transaction.customerId,
              transaction.customerName,
              transaction.date, // Use Transaction Date for historical accuracy
              entry.type,
              entry.itemType,
              entry.pureWeight || entry.weight || 0, // Use pure weight if available, else weight
              entry.touch || 0,
              0, // Amount is 0 for metal entries in this schema context (value is in weight)
              saveDate // Created at is now
            ]
          );
        }
      }
      return true;
    } catch (error) {
      console.error('Error syncing metal ledger entries:', error);
      return false;
    }
  }

  // Sync money entries to ledger (Explicit Payments)
  static async syncMoneyLedgerEntries(
    transactionId: string,
    customer: Customer,
    payments: PaymentInput[]
  ): Promise<boolean> {
    const db = DatabaseService.getDatabase();
    try {
      // 1. Get existing ledger entries for this transaction (money only)
      const existingLedgerEntries = await this.getLedgerEntriesByTransactionId(transactionId);
      const existingMoneyEntries = existingLedgerEntries.filter(l => l.itemType === 'money');
      
      const paymentIdsToKeep = new Set<string>();

      // 2. Upsert (Update or Insert) Payments
      for (const payment of payments) {
        if (payment.id) {
          // UPDATE existing ledger entry
          paymentIdsToKeep.add(payment.id);
          await db.runAsync(
            `UPDATE ledger_entries 
             SET amount = ?, date = ?, type = ?
             WHERE id = ?`,
            [
              payment.amount,
              payment.date, // User defined date
              payment.type,
              payment.id
            ]
          );
        } else {
          // INSERT new ledger entry
          const newLedgerId = `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await db.runAsync(
            `INSERT INTO ledger_entries 
             (id, transactionId, customerId, customerName, date, type, itemType, weight, touch, amount, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newLedgerId,
              transactionId,
              customer.id,
              customer.name,
              payment.date, // User defined date
              payment.type, // 'receive' or 'give'
              'money',
              0,
              0,
              payment.amount,
              new Date().toISOString()
            ]
          );
        }
      }

      // 3. Delete Removed Payments
      for (const existing of existingMoneyEntries) {
        if (!paymentIdsToKeep.has(existing.id)) {
          await db.runAsync('DELETE FROM ledger_entries WHERE id = ?', [existing.id]);
        }
      }
      return true;
    } catch (error) {
      console.error('Error syncing money ledger entries:', error);
      return false;
    }
  }

  // Sync transaction to ledger (Atomic Sync)
  static async syncTransactionToLedger(
    transaction: Transaction,
    amountPaid: number,
    saveDate: string
  ): Promise<boolean> {
    const db = DatabaseService.getDatabase();
    
    try {
      // 1. Metal Logic (State-Based)
      // Delete existing metal entries for this transaction
      await db.runAsync(
        `DELETE FROM ledger_entries WHERE transactionId = ? AND itemType != 'money'`,
        [transaction.id]
      );

      // Insert new metal entries based on current transaction state
      for (const entry of transaction.entries) {
        if (entry.itemType !== 'money') {
          const ledgerId = `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          await db.runAsync(
            `INSERT INTO ledger_entries 
             (id, transactionId, customerId, customerName, date, type, itemType, weight, touch, amount, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ledgerId,
              transaction.id,
              transaction.customerId,
              transaction.customerName,
              transaction.date, // Use Transaction Date for historical accuracy
              entry.type,
              entry.itemType,
              entry.pureWeight || entry.weight || 0, // Use pure weight if available, else weight
              entry.touch || 0,
              0, // Amount is 0 for metal entries in this schema context (value is in weight)
              saveDate // Created at is now
            ]
          );
        }
      }

      // 2. Money Logic (Event-Based / Delta)
      // Calculate total recorded money for this transaction so far
      const moneyRows = await db.getAllAsync<{ amount: number; type: string }>(
        `SELECT amount, type FROM ledger_entries WHERE transactionId = ? AND itemType = 'money' AND deleted_on IS NULL`,
        [transaction.id]
      );

      let totalRecorded = 0;
      for (const row of moneyRows) {
        if (row.type === 'receive') {
          totalRecorded += row.amount;
        } else if (row.type === 'give') {
          totalRecorded -= row.amount;
        }
      }

      // Calculate difference
      // amountPaid is the target total paid.
      // If amountPaid > totalRecorded, we received more money.
      // If amountPaid < totalRecorded, we gave back money (or corrected a mistake).
      const difference = amountPaid - totalRecorded;

      if (Math.abs(difference) > 0.001) { // Use epsilon for float comparison
        const ledgerId = `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const type = difference > 0 ? 'receive' : 'give';
        const amount = Math.abs(difference);

        await db.runAsync(
          `INSERT INTO ledger_entries 
           (id, transactionId, customerId, customerName, date, type, itemType, weight, touch, amount, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ledgerId,
            transaction.id,
            transaction.customerId,
            transaction.customerName,
            saveDate, // Use current event time for money movement
            type,
            'money',
            0,
            0,
            amount,
            saveDate
          ]
        );
      }

      return true;
    } catch (error) {
      console.error('Error syncing transaction to ledger:', error);
      return false;
    }
  }
}
