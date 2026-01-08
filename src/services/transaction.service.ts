import { Transaction, TransactionEntry, Customer, PaymentInput } from '../types';
import { DatabaseService } from './database.sqlite';
import { CustomerService } from './customer.service';
import { LedgerService } from './ledger.service';
import { InventoryService, InventoryDelta } from './inventory.service';
import { RaniRupaStockService } from './raniRupaStock.service';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';

export class TransactionService {
  
  // Helper to calculate inventory delta from entries
  private static calculateInventoryDeltaFromEntries(entries: TransactionEntry[]): InventoryDelta {
    const delta: InventoryDelta = {
      gold999: 0,
      gold995: 0,
      silver: 0,
      rani: 0,
      rupu: 0,
      money: 0
    };

    entries.forEach(entry => {
      if (entry.itemType !== 'money') {
        const weight = (entry.itemType === 'rani' || entry.itemType === 'rupu') 
          ? (entry.pureWeight || 0) 
          : (entry.weight || 0);
        
        // Sell = merchant gives metal = negative inventory effect
        // Purchase = merchant receives metal = positive inventory effect
        const metalFlow = entry.type === 'sell' ? -weight : weight;
        
        if (entry.itemType === 'gold999') delta.gold999 += metalFlow;
        else if (entry.itemType === 'gold995') delta.gold995 += metalFlow;
        else if (entry.itemType === 'silver') delta.silver += metalFlow;
        else if (entry.itemType === 'rani') delta.rani += metalFlow;
        else if (entry.itemType === 'rupu') delta.rupu += metalFlow;
      }
    });

    return delta;
  }

  // Get all transactions
  static async getAllTransactions(limit?: number): Promise<Transaction[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      let query = `
        SELECT t.*
        FROM transactions t
        LEFT JOIN customer_balances cb ON t.customerId = cb.customer_id
        WHERE t.deleted_on IS NULL 
        ORDER BY t.date DESC
      `;

      let transactions;
      if (limit) {
        query += ` LIMIT ${limit}`;
        transactions = await db.getAllAsync<{
          id: string;
          deviceId: string | null;
          customerId: string;
          customerName: string;
          date: string;
          total: number;
          amountPaid: number;
          note?: string;
          createdAt: string;
          lastUpdatedAt: string;
          last_gold999_lock_date: number | null;
          last_gold995_lock_date: number | null;
          last_silver_lock_date: number | null;
        }>(query);
      } else {
        transactions = await DatabaseService.getAllAsyncBatch<{
          id: string;
          deviceId: string | null;
          customerId: string;
          customerName: string;
          date: string;
          total: number;
          amountPaid: number;
          note?: string;
          createdAt: string;
          lastUpdatedAt: string;
          last_gold999_lock_date: number | null;
          last_gold995_lock_date: number | null;
          last_silver_lock_date: number | null;
        }>(query);
      }

      const result: Transaction[] = [];

      for (const trans of transactions) {
        // Get entries for this transaction
        const entries = await DatabaseService.getAllAsyncBatch<any>(
          'SELECT * FROM transaction_entries WHERE transaction_id = ? ORDER BY createdAt ASC',
          [trans.id]
        );

        const mappedEntries: TransactionEntry[] = entries.map(entry => ({
          id: entry.id,
          type: entry.type,
          itemType: entry.itemType,
          weight: entry.weight,
          price: entry.price,
          touch: entry.touch,
          cut: entry.cut,
          extraPerKg: entry.extraPerKg,
          pureWeight: entry.pureWeight,
          moneyType: entry.moneyType,
          amount: entry.amount,
          metalOnly: entry.metalOnly === 1,
          stock_id: entry.stock_id,
          subtotal: entry.subtotal,
          createdAt: entry.createdAt,
          lastUpdatedAt: entry.lastUpdatedAt,
        }));

        result.push({
          id: trans.id,
          deviceId: trans.deviceId || undefined,
          customerId: trans.customerId,
          customerName: trans.customerName,
          date: trans.date,
          entries: mappedEntries,
          total: trans.total,
          amountPaid: trans.amountPaid,
          note: trans.note,
          createdAt: trans.createdAt,
          lastUpdatedAt: trans.lastUpdatedAt,
          customerLockDates: {
            gold999: trans.last_gold999_lock_date || 0,
            gold995: trans.last_gold995_lock_date || 0,
            silver: trans.last_silver_lock_date || 0,
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  }

  // Get transactions by customer ID
  static async getTransactionsByCustomerId(customerId: string): Promise<Transaction[]> {
    try {
      const transactions = await DatabaseService.getAllAsyncBatch<any>(
        `SELECT t.*, cb.last_gold999_lock_date, cb.last_gold995_lock_date, cb.last_silver_lock_date
         FROM transactions t
         LEFT JOIN customer_balances cb ON t.customerId = cb.customer_id
         WHERE t.customerId = ? AND t.deleted_on IS NULL 
         ORDER BY t.date DESC`,
        [customerId]
      );

      const result: Transaction[] = [];
      
      for (const trans of transactions) {
        const entries = await DatabaseService.getAllAsyncBatch<any>(
          'SELECT * FROM transaction_entries WHERE transaction_id = ? ORDER BY createdAt ASC',
          [trans.id]
        );

        const mappedEntries: TransactionEntry[] = entries.map(entry => ({
          id: entry.id,
          type: entry.type,
          itemType: entry.itemType,
          weight: entry.weight,
          price: entry.price,
          touch: entry.touch,
          cut: entry.cut,
          extraPerKg: entry.extraPerKg,
          pureWeight: entry.pureWeight,
          moneyType: entry.moneyType,
          amount: entry.amount,
          metalOnly: entry.metalOnly === 1,
          stock_id: entry.stock_id,
          subtotal: entry.subtotal,
          createdAt: entry.createdAt,
          lastUpdatedAt: entry.lastUpdatedAt,
        }));

        result.push({
          id: trans.id,
          deviceId: trans.deviceId || undefined,
          customerId: trans.customerId,
          customerName: trans.customerName,
          date: trans.date,
          entries: mappedEntries,
          total: trans.total,
          amountPaid: trans.amountPaid,
          note: trans.note,
          createdAt: trans.createdAt,
          lastUpdatedAt: trans.lastUpdatedAt,
          customerLockDates: {
            gold999: trans.last_gold999_lock_date || 0,
            gold995: trans.last_gold995_lock_date || 0,
            silver: trans.last_silver_lock_date || 0,
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting transactions by customer ID:', error);
      return [];
    }
  }

  // Get transactions by date range (database-level filtering)
  static async getTransactionsByDateRange(
    startDate: string, 
    endDate: string, 
    itemTypes?: string[],
    excludeCustomerName?: string
  ): Promise<Transaction[]> {
    try {
      const db = DatabaseService.getDatabase();

      let query = `
        SELECT t.*, cb.last_gold999_lock_date, cb.last_gold995_lock_date, cb.last_silver_lock_date
        FROM transactions t
        LEFT JOIN customer_balances cb ON t.customerId = cb.customer_id
        WHERE t.date >= ? AND t.date <= ? AND t.deleted_on IS NULL
      `;
      let params: any[] = [startDate, endDate];

      // Exclude specific customer
      if (excludeCustomerName) {
        query += ' AND LOWER(t.customerName) != ?';
        params.push(excludeCustomerName.toLowerCase());
      }

      // If itemTypes are specified, filter transactions that have entries with those item types
      if (itemTypes && itemTypes.length > 0) {
        const placeholders = itemTypes.map(() => '?').join(',');
        query += ` AND t.id IN (
          SELECT DISTINCT transaction_id FROM transaction_entries
          WHERE itemType IN (${placeholders})
        )`;
        params.push(...itemTypes);
      }

      query += ' ORDER BY t.date DESC';

      const transactions = await DatabaseService.getAllAsyncBatch<any>(query, params);

      const result: Transaction[] = [];

      for (const trans of transactions) {
        let entriesQuery = 'SELECT * FROM transaction_entries WHERE transaction_id = ?';
        let entriesParams: any[] = [trans.id];

        // If itemTypes are specified, also filter the entries
        if (itemTypes && itemTypes.length > 0) {
          const placeholders = itemTypes.map(() => '?').join(',');
          entriesQuery += ` AND itemType IN (${placeholders})`;
          entriesParams.push(...itemTypes);
        }

        entriesQuery += ' ORDER BY createdAt ASC';

        const entries = await DatabaseService.getAllAsyncBatch<any>(entriesQuery, entriesParams);

        const mappedEntries: TransactionEntry[] = entries.map(entry => ({
          id: entry.id,
          type: entry.type,
          itemType: entry.itemType,
          weight: entry.weight,
          price: entry.price,
          touch: entry.touch,
          cut: entry.cut,
          extraPerKg: entry.extraPerKg,
          pureWeight: entry.pureWeight,
          moneyType: entry.moneyType,
          amount: entry.amount,
          metalOnly: entry.metalOnly === 1,
          stock_id: entry.stock_id,
          subtotal: entry.subtotal,
          createdAt: entry.createdAt,
          lastUpdatedAt: entry.lastUpdatedAt,
        }));

        // Fetch ledger money entries (payments)
        if (!itemTypes || itemTypes.includes('money')) {
          const moneyEntries = await DatabaseService.getAllAsyncBatch<any>(
            'SELECT * FROM ledger_entries WHERE transactionId = ? AND itemType = "money" ORDER BY date ASC',
            [trans.id]
          );

          const mappedMoneyEntries: TransactionEntry[] = moneyEntries.map(entry => ({
            id: entry.id,
            type: 'money',
            itemType: 'money',
            moneyType: entry.type === 'receive' ? 'receive' : 'give',
            amount: entry.amount,
            subtotal: entry.amount,
            createdAt: entry.date,
            metalOnly: false
          }));

          mappedEntries.push(...mappedMoneyEntries);
        }

        result.push({
          id: trans.id,
          deviceId: trans.deviceId || undefined,
          customerId: trans.customerId,
          customerName: trans.customerName,
          date: trans.date,
          entries: mappedEntries,
          total: trans.total,
          amountPaid: trans.amountPaid,
          note: trans.note,
          createdAt: trans.createdAt,
          lastUpdatedAt: trans.lastUpdatedAt,
          customerLockDates: {
            gold999: trans.last_gold999_lock_date || 0,
            gold995: trans.last_gold995_lock_date || 0,
            silver: trans.last_silver_lock_date || 0,
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting transactions by date range:', error);
      return [];
    }
  }

  // Get transactions by date range OR by ledger activity date range
  static async getTransactionsWithActivityByDateRange(
    startDate: string, 
    endDate: string
  ): Promise<Transaction[]> {
    try {
      // DISTINCT is crucial here because a transaction might satisfy both conditions 
      // (created today AND paid today) or have multiple ledger entries today.
      // We join ledger_entries to check if any payments happened in the range.
      const query = `
        SELECT DISTINCT t.*, cb.last_gold999_lock_date, cb.last_gold995_lock_date, cb.last_silver_lock_date
        FROM transactions t
        LEFT JOIN customer_balances cb ON t.customerId = cb.customer_id
        LEFT JOIN ledger_entries le ON t.id = le.transactionId
        WHERE 
          (t.deleted_on IS NULL) AND
          (
            (t.date >= ? AND t.date <= ?) 
            OR 
            (le.date >= ? AND le.date <= ? AND le.deleted_on IS NULL)
          )
        ORDER BY t.date DESC
      `;
      
      // Pass the date range twice: once for transaction date, once for ledger date
      const params = [startDate, endDate, startDate, endDate];

      const transactions = await DatabaseService.getAllAsyncBatch<any>(query, params);
      const result: Transaction[] = [];

      for (const trans of transactions) {
        let entriesQuery = 'SELECT * FROM transaction_entries WHERE transaction_id = ? ORDER BY createdAt ASC';
        const entries = await DatabaseService.getAllAsyncBatch<any>(entriesQuery, [trans.id]);

        const mappedEntries: TransactionEntry[] = entries.map(entry => ({
             id: entry.id,
             type: entry.type,
             itemType: entry.itemType,
             weight: entry.weight,
             price: entry.price,
             touch: entry.touch,
             cut: entry.cut,
             extraPerKg: entry.extraPerKg,
             pureWeight: entry.pureWeight,
             moneyType: entry.moneyType,
             amount: entry.amount,
             metalOnly: entry.metalOnly === 1,
             stock_id: entry.stock_id,
             subtotal: entry.subtotal,
             createdAt: entry.createdAt,
             lastUpdatedAt: entry.lastUpdatedAt,
        }));

        // Fetch ledger money entries
        const moneyEntries = await DatabaseService.getAllAsyncBatch<any>(
            'SELECT * FROM ledger_entries WHERE transactionId = ? AND itemType = "money" ORDER BY date ASC',
            [trans.id]
        );

        const mappedMoneyEntries: TransactionEntry[] = moneyEntries.map(entry => ({
            id: entry.id,
            type: 'money',
            itemType: 'money',
            moneyType: entry.type === 'receive' ? 'receive' : 'give',
            amount: entry.amount,
            subtotal: entry.amount,
            createdAt: entry.date,
            metalOnly: false
        }));

        mappedEntries.push(...mappedMoneyEntries);

        result.push({
            id: trans.id,
            deviceId: trans.deviceId || undefined,
            customerId: trans.customerId,
            customerName: trans.customerName,
            date: trans.date,
            entries: mappedEntries,
            total: trans.total,
            amountPaid: trans.amountPaid,
            note: trans.note,
            createdAt: trans.createdAt,
            lastUpdatedAt: trans.lastUpdatedAt,
            customerLockDates: {
                gold999: trans.last_gold999_lock_date || 0,
                gold995: trans.last_gold995_lock_date || 0,
                silver: trans.last_silver_lock_date || 0,
            }
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting transactions with activity:', error);
      return [];
    }
  }

  // Get transaction by ID
  static async getTransactionById(id: string): Promise<Transaction | null> {
    try {
      const db = DatabaseService.getDatabase();
      
      const trans = await db.getFirstAsync<any>(
        'SELECT * FROM transactions WHERE id = ?',
        [id]
      );

      if (!trans) return null;

      const entries = await DatabaseService.getAllAsyncBatch<any>(
        'SELECT * FROM transaction_entries WHERE transaction_id = ? ORDER BY createdAt ASC',
        [trans.id]
      );

      const mappedEntries: TransactionEntry[] = entries.map(entry => ({
        id: entry.id,
        type: entry.type,
        itemType: entry.itemType,
        weight: entry.weight,
        price: entry.price,
        touch: entry.touch,
        cut: entry.cut,
        extraPerKg: entry.extraPerKg,
        pureWeight: entry.pureWeight,
        moneyType: entry.moneyType,
        amount: entry.amount,
        metalOnly: entry.metalOnly === 1,
        stock_id: entry.stock_id,
        subtotal: entry.subtotal,
        createdAt: entry.createdAt,
        lastUpdatedAt: entry.lastUpdatedAt,
      }));

      return {
        id: trans.id,
        deviceId: trans.deviceId || undefined,
        customerId: trans.customerId,
        customerName: trans.customerName,
        date: trans.date,
        entries: mappedEntries,
        total: trans.total,
        amountPaid: trans.amountPaid,
        note: trans.note,
        createdAt: trans.createdAt,
        lastUpdatedAt: trans.lastUpdatedAt,
      };
    } catch (error) {
      console.error('Error getting transaction by ID:', error);
      return null;
    }
  }

  // Calculate transaction totals
  private static calculateTransactionTotals(entries: TransactionEntry[]) {
    let netAmount = 0;
    
    entries.forEach(entry => {
      netAmount += entry.subtotal;
    });

    return { netAmount };
  }

  // Save transaction (create or update)
  static async saveTransaction(
    customer: Customer,
    entries: TransactionEntry[],
    payments: PaymentInput[],
    existingTransactionId?: string,
    saveDate?: Date | null,
    note?: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const db = DatabaseService.getDatabase();
    
    try {
      // Validate input - allow empty entries for money-only transactions
      if (!customer) {
        return { success: false, error: 'Invalid customer data' };
      }

      // Calculate total amount paid from payments
      const receivedAmount = payments.reduce((sum, p) => {
        // For 'receive', we add. For 'give', we subtract (or treat as negative payment).
        return sum + (p.type === 'receive' ? p.amount : -p.amount);
      }, 0);

      // Use provided saveDate or current date
      const transactionDate = saveDate ? saveDate.toISOString() : new Date().toISOString();
      const now = new Date().toISOString();
      const isUpdate = !!existingTransactionId;

      // Check if this is a money-only transaction (no entries)
      const isMoneyOnlyTransaction = entries.length === 0;

      // Calculate totals
      const { netAmount } = isMoneyOnlyTransaction 
        ? { netAmount: 0 } 
        : this.calculateTransactionTotals(entries);

      // Final balance calculation
      let finalBalance: number;
      if (isMoneyOnlyTransaction) {
        // For money-only transactions (INVERTED SIGN CONVENTION):
        // Positive receivedAmount = merchant receives money = customer balance increases (credit)
        // Negative receivedAmount = merchant gives money = customer balance decreases (debt)
        finalBalance = receivedAmount;
      } else {
        // Regular transactions (INVERTED SIGN CONVENTION):
        // Positive balance = merchant owes customer (credit)
        // Negative balance = customer owes merchant (debt)
        // For sells: customer should pay netAmount, they paid receivedAmount
        // Remaining: netAmount - receivedAmount = what customer still owes (negative balance)
        // For purchases: merchant should pay netAmount, they paid receivedAmount
        // Remaining: netAmount - receivedAmount = what merchant still owes (positive balance)
        finalBalance = receivedAmount - netAmount;
      }

      // Special case for 'adjust' and 'expense(kharch)' customers - always zero balance
      if (customer.name.toLowerCase() === 'adjust' || customer.name.toLowerCase() === 'expense(kharch)') {
        finalBalance = 0;
      }

      let transactionId: string;
      let oldBalanceEffect = 0;
      let existingTransaction: Transaction | null | undefined;
      let earliestAffectedDate = transactionDate; // Default to new date

      // Optimization: Track net metal changes to minimize DB writes
      const netMetalChanges: Record<string, number> = {
        gold999: 0,
        gold995: 0,
        silver: 0
      };

      // Begin transaction
      await db.execAsync('BEGIN TRANSACTION');

      try {
        if (isUpdate) {
          // UPDATE existing transaction
          existingTransaction = await this.getTransactionById(existingTransactionId!);
          
          if (!existingTransaction) {
            await db.execAsync('ROLLBACK');
            return { success: false, error: 'Transaction not found' };
          }

          // Capture the old date to determine the earliest affected date
          if (existingTransaction.date < earliestAffectedDate) {
            earliestAffectedDate = existingTransaction.date;
          }

          transactionId = existingTransactionId!;
          
          // Calculate old balance effect
          const isOldMoneyOnly = existingTransaction.entries.length === 0;
          const isOldMetalOnly = existingTransaction.entries.some(entry => entry.metalOnly === true);
          
          if (isOldMoneyOnly) {
            // For old money-only transactions, the balance effect was amountPaid (inverted)
            oldBalanceEffect = existingTransaction.amountPaid;
          } else if (!isOldMetalOnly) {
            const oldNetAmount = existingTransaction.total;
            const oldReceivedAmount = existingTransaction.amountPaid;
            // Inverted formula: receivedAmount - netAmount
            oldBalanceEffect = oldReceivedAmount - oldNetAmount;
          }

          // REVERSE old metal balances
          if (existingTransaction.entries.some(entry => entry.metalOnly === true)) {
            for (const oldEntry of existingTransaction.entries) {
              if (oldEntry.metalOnly && oldEntry.type !== 'money') {
                let itemType = oldEntry.itemType;
                
                // Get the weight to use
                const weight = (oldEntry.itemType === 'rani' || oldEntry.itemType === 'rupu') 
                  ? (oldEntry.pureWeight || 0) 
                  : (oldEntry.weight || 0);

                // Conversion logic for Rani/Rupu
                if (oldEntry.itemType === 'rani') {
                  // Rani with cut -> Gold 999, Rani without cut -> Gold 995
                  if ((oldEntry.cut || 0) > 0) {
                    itemType = 'gold999';
                  } else {
                    itemType = 'gold995';
                  }
                } else if (oldEntry.itemType === 'rupu') {
                  // Rupu -> Silver
                  itemType = 'silver';
                }

                // Calculate original effect then reverse it
                const originalEffect = oldEntry.type === 'sell' ? weight : -weight;
                
                // Accumulate to net changes instead of immediate DB write
                if (netMetalChanges[itemType] !== undefined) {
                  netMetalChanges[itemType] += originalEffect;
                }
              }
            }
          }

          // Handle stock reversal for old entries
          for (const entry of existingTransaction.entries) {
            if (entry.stock_id) {
              if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
                // Check if this stock_id is present in the NEW entries list (being updated)
                const isBeingUpdated = entries.some(newEntry => newEntry.stock_id === entry.stock_id);
                
                if (!isBeingUpdated) {
                  // It is being deleted. Try to remove stock.
                  const result = await RaniRupaStockService.removeStock(entry.stock_id);
                  if (!result.success) {
                    await db.execAsync('ROLLBACK');
                    return { success: false, error: `Failed to update transaction: ${result.error}` };
                  }
                }
                // If updated, we do nothing here. We will update it in the insertion loop.
              } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
                // Check if this entry is being preserved/updated
                const isBeingUpdated = entries.some(newEntry => newEntry.stock_id === entry.stock_id);
                
                if (!isBeingUpdated) {
                  // This sell entry is being removed. Mark stock as unsold.
                  await RaniRupaStockService.markStockAsSold(entry.stock_id, false);
                }
                // If updated, we do nothing here. The stock remains sold.
              }
            }
          }

          // Delete old transaction entries
          await db.runAsync('DELETE FROM transaction_entries WHERE transaction_id = ?', [transactionId]);

          // Update transaction
          // Only update date if saveDate is explicitly provided
          const newDate = saveDate ? transactionDate : existingTransaction.date;
          
          await db.runAsync(
            `UPDATE transactions 
             SET customerName = ?, date = ?, total = ?, 
                 amountPaid = ?, note = ?, lastUpdatedAt = ?
             WHERE id = ?`,
            [
              customer.name.trim(),
              newDate,
              netAmount,
              receivedAmount,
              note || null,
              now,
              transactionId
            ]
          );
        } else {
          // CREATE new transaction
          transactionId = `txn_${Date.now()}`;
          
          // Get device ID with error handling
          let deviceId: string;
          try {
            const storedDeviceId = await SecureStore.getItemAsync('device_id');
            if (storedDeviceId) {
              deviceId = storedDeviceId;
            } else {
              deviceId = `${Device.modelName}_${Device.osName}_${Date.now()}`;
              await SecureStore.setItemAsync('device_id', deviceId);
            }
          } catch (error) {
            try {
              await SecureStore.deleteItemAsync('device_id');
            } catch (deleteError) {
              // Ignore delete errors
            }
            deviceId = `${Device.modelName}_${Device.osName}_${Date.now()}`;
            try {
              await SecureStore.setItemAsync('device_id', deviceId);
            } catch (setError) {
              console.error('Failed to set device_id, using temporary ID:', setError);
              deviceId = `${Device.modelName}_${Device.osName}_${Date.now()}`;
            }
          }

          // Insert transaction
          await db.runAsync(
            `INSERT INTO transactions 
             (id, deviceId, customerId, customerName, date, total, 
              amountPaid, note, createdAt, lastUpdatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              transactionId,
              deviceId,
              customer.id,
              customer.name.trim(),
              transactionDate,
              netAmount,
              receivedAmount,
              note || null,
              transactionDate,
              now
            ]
          );
        }

        // Insert new transaction entries and handle stock
        let entryTimestamp = now;
        if (saveDate && !isUpdate) {
          const today = new Date();
          const selectedDate = new Date(saveDate);
          
          const isDifferentDate = 
            selectedDate.getFullYear() !== today.getFullYear() ||
            selectedDate.getMonth() !== today.getMonth() ||
            selectedDate.getDate() !== today.getDate();
          
          if (isDifferentDate) {
            entryTimestamp = saveDate.toISOString();
          }
        }

        for (const entry of entries) {
          const entryId = entry.id || `entry_${Date.now()}_${Math.random()}`;
          
          // Handle stock management
          let stockId = entry.stock_id;
          
          if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
            const touch = entry.touch || 100;
            
            if (stockId) {
              // Update existing stock (even if sold)
              const result = await RaniRupaStockService.updateStock(stockId, { weight: entry.weight || 0, touch });
              if (!result.success) {
                await db.execAsync('ROLLBACK');
                return { success: false, error: `Failed to update stock: ${result.error}` };
              }
            } else {
              // Create new stock
              const result = await RaniRupaStockService.addStock(entry.itemType, entry.weight || 0, touch);
              if (result.success && result.stock_id) {
                stockId = result.stock_id;
              } else {
                await db.execAsync('ROLLBACK');
                return { success: false, error: `Failed to add stock: ${result.error}` };
              }
            }
          } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
            if (!stockId) {
              const stockOfType = await RaniRupaStockService.getStockByType(entry.itemType);
              if (stockOfType.length > 0) {
                const oldestStock = stockOfType.sort((a: any, b: any) =>
                  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                )[0];
                stockId = oldestStock.stock_id;
              } else {
                await db.execAsync('ROLLBACK');
                return { success: false, error: `No stock available for sale of ${entry.itemType}` };
              }
            }
            const markResult = await RaniRupaStockService.markStockAsSold(stockId, true);
            if (!markResult.success) {
              await db.execAsync('ROLLBACK');
              return { success: false, error: `Failed to sell stock: ${markResult.error}` };
            }
          }

          // Insert entry
          // Preserve original creation date for existing entries during update
          const entryCreatedAt = (isUpdate && entry.createdAt) ? entry.createdAt : (isUpdate ? now : entryTimestamp);

          await db.runAsync(
            `INSERT INTO transaction_entries 
             (id, transaction_id, type, itemType, weight, price, touch, cut, extraPerKg, 
              pureWeight, moneyType, amount, metalOnly, stock_id, subtotal, createdAt, lastUpdatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entryId,
              transactionId,
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
              stockId || null,
              entry.subtotal,
              entryCreatedAt,
              now
            ]
          );
        }

        // Sync Metal Ledger Entries
        const fullTransaction = await this.getTransactionById(transactionId);
        if (fullTransaction) {
          const syncDate = saveDate ? saveDate.toISOString() : (isUpdate ? now : transactionDate);
          await LedgerService.syncMetalLedgerEntries(fullTransaction, syncDate);
        }

        // Sync Money Ledger Entries (Payments)
        await LedgerService.syncMoneyLedgerEntries(transactionId, customer, payments);

        // Update customer balance
        const isMetalOnly = entries.some(entry => entry.metalOnly === true);
        let newBalance = customer.balance;
        
        if (isMoneyOnlyTransaction) {
          // For money-only transactions, update balance based on old and new received amounts
          newBalance = customer.balance - oldBalanceEffect + finalBalance;
        } else if (!isMetalOnly) {
          newBalance = customer.balance - oldBalanceEffect + finalBalance;
        }

        // Apply metal balances for metal-only entries
        if (isMetalOnly) {
          for (const entry of entries) {
            if (entry.metalOnly && entry.type !== 'money') {
              let itemType = entry.itemType;

              // Get the weight to use
              const weight = (entry.itemType === 'rani' || entry.itemType === 'rupu') 
                ? (entry.pureWeight || 0) 
                : (entry.weight || 0);

              // Conversion logic for Rani/Rupu
              if (entry.itemType === 'rani') {
                // Rani with cut -> Gold 999, Rani without cut -> Gold 995
                if ((entry.cut || 0) > 0) {
                  itemType = 'gold999';
                } else {
                  itemType = 'gold995';
                }
              } else if (entry.itemType === 'rupu') {
                // Rupu -> Silver
                itemType = 'silver';
              }

              // Sign convention: 
              // - Purchase (customer gives metal) = reduces their debt = negative (they owe less)
              // - Sell (merchant gives metal) = increases their debt = positive (they owe more)
              const metalAmount = entry.type === 'sell' ? -weight : weight;
              
              // Accumulate to net changes
              if (netMetalChanges[itemType] !== undefined) {
                netMetalChanges[itemType] += metalAmount;
              }
            }
          }
        }

        // Apply net metal balance changes to DB
        for (const [itemType, change] of Object.entries(netMetalChanges)) {
          if (Math.abs(change) > 0.0001) { // Floating point check
            await CustomerService.updateCustomerMetalBalance(customer.id, itemType, change);
          }
        }

        // Fetch fresh customer data to get updated metal balances
        const freshCustomer = await CustomerService.getCustomerById(customer.id);
        if (!freshCustomer) {
          await db.execAsync('ROLLBACK');
          return { success: false, error: 'Failed to fetch updated customer data' };
        }

        // Update customer with new money balance and timestamp
        const updatedCustomer: Customer = {
          ...freshCustomer,
          balance: newBalance,
          lastTransaction: now,
        };
        
        await CustomerService.saveCustomer(updatedCustomer);

        // Store last transaction ID in settings
        await db.runAsync(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
          ['last_transaction_id', transactionId]
        );

        // Trigger Inventory Recalculation from the earliest affected date
        await InventoryService.recalculateBalancesFrom(earliestAffectedDate);

        // Commit transaction
        await db.execAsync('COMMIT');

        return { success: true, transactionId };
      } catch (error) {
        await db.execAsync('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('Error saving transaction:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Delete transaction
  static async deleteTransaction(transactionId: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Get the transaction to reverse its effects
      const transaction = await this.getTransactionById(transactionId);
      if (!transaction) {
        console.error('Transaction not found for deletion');
        return false;
      }

      // Get the customer
      const customer = await CustomerService.getCustomerById(transaction.customerId);
      if (!customer) {
        console.error('Customer not found for transaction deletion');
        return false;
      }

      // Check if this is a money-only transaction
      const isMoneyOnly = transaction.entries.length === 0;
      
      // Calculate the balance effect to reverse
      const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
      let balanceEffect = 0;
      
      if (isMoneyOnly) {
        // For money-only transactions, reverse the balance effect which was amountPaid (inverted)
        balanceEffect = transaction.amountPaid;
      } else if (!isMetalOnly) {
        const netAmount = transaction.total;
        const receivedAmount = transaction.amountPaid;
        // Inverted formula: receivedAmount - netAmount
        balanceEffect = receivedAmount - netAmount;
      }

      // Special case for 'adjust' and 'expense(kharch)' customers - always zero balance
      if (customer.name.toLowerCase() === 'adjust' || customer.name.toLowerCase() === 'expense(kharch)') {
        balanceEffect = 0;
      }

      // Reverse metal balances for metal-only entries
      if (isMetalOnly) {
        for (const entry of transaction.entries) {
          if (entry.metalOnly && entry.type !== 'money') {
            let itemType = entry.itemType;
            
            // Get the weight to use
            const weight = (entry.itemType === 'rani' || entry.itemType === 'rupu') 
              ? (entry.pureWeight || 0) 
              : (entry.weight || 0);

            // Conversion logic for Rani/Rupu
            if (entry.itemType === 'rani') {
              // Rani with cut -> Gold 999, Rani without cut -> Gold 995
              if ((entry.cut || 0) > 0) {
                itemType = 'gold999';
              } else {
                itemType = 'gold995';
              }
            } else if (entry.itemType === 'rupu') {
              // Rupu -> Silver
              itemType = 'silver';
            }

            // Calculate original effect then reverse it
            const originalEffect = entry.type === 'sell' ? weight : -weight;
            
            // Reverse the metal balance
            await CustomerService.updateCustomerMetalBalance(customer.id, itemType, originalEffect);
          }
        }
      }

      // Reverse stock
      for (const entry of transaction.entries) {
        if (entry.stock_id) {
          if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
            const result = await RaniRupaStockService.removeStock(entry.stock_id);
            if (!result.success) {
              throw new Error(`Cannot delete transaction: ${result.error}`);
            }
          } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
            await RaniRupaStockService.markStockAsSold(entry.stock_id, false);
          }
        }
      }

      // Reverse customer balance
      if (!isMetalOnly) {
        const updatedCustomer: Customer = {
          ...customer,
          balance: customer.balance - balanceEffect,
          lastTransaction: new Date().toISOString(),
        };
        await CustomerService.saveCustomer(updatedCustomer);
      } else {
        // Update last transaction timestamp for metal-only transactions
        await db.runAsync('UPDATE customers SET lastTransaction = ? WHERE id = ?', [new Date().toISOString(), customer.id]);
      }

      // Delete ledger entries
      await LedgerService.deleteLedgerEntryByTransactionId(transactionId);

      // Soft delete the transaction by setting deleted_on to current date
      await db.runAsync('UPDATE transactions SET deleted_on = ? WHERE id = ?', [new Date().toISOString().split('T')[0], transactionId]);
      await db.runAsync('UPDATE ledger_entries SET deleted_on = ? WHERE transactionId = ?', [new Date().toISOString().split('T')[0], transactionId]);
      
      // Trigger Inventory Recalculation from the transaction date
      await InventoryService.recalculateBalancesFrom(transaction.date);

      return true;
    } catch (error) {
      console.warn('Error deleting transaction:', error);
      throw error; // Re-throw to allow UI to handle specific error messages
    }
  }

  // Get deleted transactions (for recycle bin)
  static async getDeletedTransactions(): Promise<Transaction[]> {
    try {
      
      const transactions = await DatabaseService.getAllAsyncBatch<{
        id: string;
        deviceId: string | null;
        customerId: string;
        customerName: string;
        date: string;
        total: number;
        amountPaid: number;
        note: string | null;
        deleted_on: string;
        createdAt: string;
        lastUpdatedAt: string;
      }>('SELECT * FROM transactions WHERE deleted_on IS NOT NULL ORDER BY deleted_on DESC');

      const result: Transaction[] = [];
      
      for (const trans of transactions) {
        const entries = await DatabaseService.getAllAsyncBatch<any>(
          'SELECT * FROM transaction_entries WHERE transaction_id = ? ORDER BY createdAt ASC',
          [trans.id]
        );

        const mappedEntries: TransactionEntry[] = entries.map(entry => ({
          id: entry.id,
          type: entry.type,
          itemType: entry.itemType,
          weight: entry.weight,
          price: entry.price,
          touch: entry.touch,
          cut: entry.cut,
          extraPerKg: entry.extraPerKg,
          pureWeight: entry.pureWeight,
          moneyType: entry.moneyType,
          amount: entry.amount,
          metalOnly: entry.metalOnly === 1,
          stock_id: entry.stock_id,
          subtotal: entry.subtotal,
          createdAt: entry.createdAt,
          lastUpdatedAt: entry.lastUpdatedAt,
        }));

        result.push({
          id: trans.id,
          deviceId: trans.deviceId || undefined,
          customerId: trans.customerId,
          customerName: trans.customerName,
          date: trans.date,
          entries: mappedEntries,
          total: trans.total,
          amountPaid: trans.amountPaid,
          deleted_on: trans.deleted_on,
          note: trans.note || undefined,
          createdAt: trans.createdAt,
          lastUpdatedAt: trans.lastUpdatedAt,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting deleted transactions:', error);
      return [];
    }
  }

  // Restore a deleted transaction
  static async restoreTransaction(transactionId: string): Promise<boolean> {
    const db = DatabaseService.getDatabase();
    
    try {
      // Get the deleted transaction
      const transaction = await this.getTransactionById(transactionId);
      if (!transaction) {
        return false;
      }

      // Restore customer balances
      const customer = await CustomerService.getCustomerById(transaction.customerId);
      if (!customer) {
        return false;
      }

      // Calculate and restore balances (same logic as when transaction was deleted, but reverse)
      let updatedCustomer = { ...customer };
      console.log('Restoring transaction for customer:', updatedCustomer);

      const isMoneyOnly = transaction.entries.length === 0;
      const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
      let balanceEffect = 0;
      
      if (isMoneyOnly) {
        // For money-only transactions, restore the balance effect which was amountPaid (inverted)
        balanceEffect = transaction.amountPaid;
        updatedCustomer.balance += balanceEffect;
        console.log('Restored money-only balance effect:', balanceEffect);
      } else if (!isMetalOnly) {
        const netAmount = transaction.total;
        const receivedAmount = transaction.amountPaid;
        // Inverted formula: receivedAmount - netAmount
        balanceEffect = receivedAmount - netAmount;
        
        updatedCustomer.balance += balanceEffect;
        console.log('Restored money balance effect:', balanceEffect);
      }
      // Restore metal balances for metal-only entries
      console.log('isMetalOnly:', isMetalOnly);
      if (isMetalOnly) {
        for (const entry of transaction.entries) {
          if (entry.metalOnly && entry.type !== 'money') {
            let itemType = entry.itemType;
            
            // Get the weight to use
            const weight = (entry.itemType === 'rani' || entry.itemType === 'rupu') 
              ? (entry.pureWeight || 0) 
              : (entry.weight || 0);

            // Conversion logic for Rani/Rupu
            if (entry.itemType === 'rani') {
              // Rani with cut -> Gold 999, Rani without cut -> Gold 995
              if ((entry.cut || 0) > 0) {
                itemType = 'gold999';
              } else {
                itemType = 'gold995';
              }
            } else if (entry.itemType === 'rupu') {
              // Rupu -> Silver
              itemType = 'silver';
            }

            // Apply original effect
            console.log('weight:', weight);
            const effect = entry.type === 'sell' ? -weight : weight;
            
            // Update metal balance
            console.log(`Restoring metal balance for ${itemType}, effect: ${effect}`);
            await CustomerService.updateCustomerMetalBalance(customer.id, itemType, effect);
          }
        }
      }

      // Restore stock
      for (const entry of transaction.entries) {
        if (entry.stock_id) {
          if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
            const touch = entry.touch || 100;
            await RaniRupaStockService.restoreStock(entry.stock_id, entry.itemType, entry.weight || 0, touch);
          } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
            // Check if stock is available
            const stock = await RaniRupaStockService.getStockById(entry.stock_id);
            if (!stock) {
               throw new Error(`Cannot restore transaction: Stock item ${entry.stock_id} not found`);
            }
            if (stock.isSold) {
               throw new Error(`Cannot restore transaction: Stock item ${entry.stock_id} is already sold`);
            }
            await RaniRupaStockService.markStockAsSold(entry.stock_id, true);
          }
        }
      }

      // For metal-only transactions, fetch fresh customer to get updated metal balances
      if (isMetalOnly) {
        const freshCustomer = await CustomerService.getCustomerById(customer.id);
        if (freshCustomer) {
          updatedCustomer = { ...freshCustomer };
        }
      }

      // Update last transaction timestamp
      updatedCustomer.lastTransaction = new Date().toISOString();

      await CustomerService.saveCustomer(updatedCustomer);

      // Restore ledger entries (set deleted_on to NULL)
      await db.runAsync('UPDATE ledger_entries SET deleted_on = NULL WHERE transactionId = ?', [transactionId]);

      // Restore the transaction by setting deleted_on to NULL
      await db.runAsync('UPDATE transactions SET deleted_on = NULL, lastUpdatedAt = ? WHERE id = ?', [new Date().toISOString(), transactionId]);

      // check the balance of the customer after restoration
      const freshCustomer = await CustomerService.getCustomerById(customer.id);
      console.log('money:', freshCustomer?.balance ?? 0);
      console.log('gold 999:', freshCustomer?.metalBalances?.gold999 ?? 0);
      console.log('gold 995:', freshCustomer?.metalBalances?.gold995 ?? 0);
      console.log('silver:', freshCustomer?.metalBalances?.silver ?? 0);
      
      return true;
    } catch (error) {
      console.error('Error restoring transaction:', error);
      return false;
    }
  }

  // Permanently delete a transaction
  static async deleteTransactionPermanently(transactionId: string): Promise<boolean> {
    const db = DatabaseService.getDatabase();
    
    try {
      // Delete ledger entries permanently
      await db.runAsync('DELETE FROM ledger_entries WHERE transactionId = ?', [transactionId]);
      await db.runAsync('DELETE FROM ledger_entry_items WHERE ledger_entry_id IN (SELECT id FROM ledger_entries WHERE transactionId = ?)', [transactionId]);

      // Delete the transaction permanently (cascade will delete entries)
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [transactionId]);
      
      return true;
    } catch (error) {
      console.error('Error permanently deleting transaction:', error);
      return false;
    }
  }

  // Automatically delete transactions that have been in recycle bin for 15+ days
  static async cleanupOldDeletedTransactions(): Promise<number> {
    
    try {
      // Calculate date 15 days ago
      const cutoffDateObj = new Date();
      cutoffDateObj.setDate(cutoffDateObj.getDate() - 15);
      const cutoffDate = cutoffDateObj.toISOString().split('T')[0];

      // Find transactions that were deleted 15 or more days ago
      const oldTransactions = await DatabaseService.getAllAsyncBatch<{ id: string }>(
        'SELECT id FROM transactions WHERE deleted_on IS NOT NULL AND deleted_on <= ?',
        [cutoffDate]
      );

      // Delete each transaction permanently
      let deletedCount = 0;
      for (const transaction of oldTransactions) {
        const success = await this.deleteTransactionPermanently(transaction.id);
        if (success) {
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old deleted transactions:', error);
      return 0;
    }
  }
}

