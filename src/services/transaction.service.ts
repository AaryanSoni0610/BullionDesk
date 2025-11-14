import { Transaction, TransactionEntry, Customer } from '../types';
import { DatabaseService } from './database.sqlite';
import { CustomerService } from './customer.service';
import { LedgerService } from './ledger.service';
import { RaniRupaStockService } from './raniRupaStock.service';
import * as SecureStore from 'expo-secure-store';

export class TransactionService {
  // Get all transactions
  static async getAllTransactions(): Promise<Transaction[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const transactions = await db.getAllAsync<{
        id: string;
        deviceId: string | null;
        customerId: string;
        customerName: string;
        date: string;
        discountExtraAmount: number;
        total: number;
        amountPaid: number;
        lastGivenMoney: number;
        lastToLastGivenMoney: number;
        settlementType: string;
        createdAt: string;
        lastUpdatedAt: string;
      }>('SELECT * FROM transactions ORDER BY date DESC');

      const result: Transaction[] = [];
      
      for (const trans of transactions) {
        // Get entries for this transaction
        const entries = await db.getAllAsync<any>(
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
          discountExtraAmount: trans.discountExtraAmount,
          total: trans.total,
          amountPaid: trans.amountPaid,
          lastGivenMoney: trans.lastGivenMoney,
          lastToLastGivenMoney: trans.lastToLastGivenMoney,
          settlementType: trans.settlementType as 'full' | 'partial' | 'none',
          createdAt: trans.createdAt,
          lastUpdatedAt: trans.lastUpdatedAt,
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
      const db = DatabaseService.getDatabase();
      
      const transactions = await db.getAllAsync<any>(
        'SELECT * FROM transactions WHERE customerId = ? ORDER BY date DESC',
        [customerId]
      );

      const result: Transaction[] = [];
      
      for (const trans of transactions) {
        const entries = await db.getAllAsync<any>(
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
          discountExtraAmount: trans.discountExtraAmount,
          total: trans.total,
          amountPaid: trans.amountPaid,
          lastGivenMoney: trans.lastGivenMoney,
          lastToLastGivenMoney: trans.lastToLastGivenMoney,
          settlementType: trans.settlementType as 'full' | 'partial' | 'none',
          createdAt: trans.createdAt,
          lastUpdatedAt: trans.lastUpdatedAt,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting transactions by customer ID:', error);
      return [];
    }
  }

  // Get transactions by date range (database-level filtering)
  static async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Query transactions where date is between startDate and endDate (inclusive)
      const transactions = await db.getAllAsync<any>(
        'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date DESC',
        [startDate, endDate]
      );

      const result: Transaction[] = [];
      
      for (const trans of transactions) {
        const entries = await db.getAllAsync<any>(
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
          discountExtraAmount: trans.discountExtraAmount,
          total: trans.total,
          amountPaid: trans.amountPaid,
          lastGivenMoney: trans.lastGivenMoney,
          lastToLastGivenMoney: trans.lastToLastGivenMoney,
          settlementType: trans.settlementType as 'full' | 'partial' | 'none',
          createdAt: trans.createdAt,
          lastUpdatedAt: trans.lastUpdatedAt,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting transactions by date range:', error);
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

      const entries = await db.getAllAsync<any>(
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
        discountExtraAmount: trans.discountExtraAmount,
        total: trans.total,
        amountPaid: trans.amountPaid,
        lastGivenMoney: trans.lastGivenMoney,
        lastToLastGivenMoney: trans.lastToLastGivenMoney,
        settlementType: trans.settlementType as 'full' | 'partial' | 'none',
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
    receivedAmount: number = 0,
    existingTransactionId?: string,
    discountExtraAmount: number = 0,
    saveDate?: Date | null
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const db = DatabaseService.getDatabase();
    
    try {
      // Validate input
      if (!customer || !entries || entries.length === 0) {
        return { success: false, error: 'Invalid customer or entries data' };
      }

      // Use provided saveDate or current date
      const transactionDate = saveDate ? saveDate.toISOString() : new Date().toISOString();
      const now = new Date().toISOString();
      const isUpdate = !!existingTransactionId;

      // Calculate totals
      const { netAmount } = this.calculateTransactionTotals(entries);

      // Check if this is a money-only transaction
      const isMoneyOnlyTransaction = entries.every(entry => entry.type === 'money');

      // Final balance calculation
      let finalBalance: number;
      if (isMoneyOnlyTransaction) {
        finalBalance = netAmount;
        if (customer.name.toLowerCase() === 'adjust') {
          finalBalance = 0;
        }
      } else {
        finalBalance = netAmount >= 0
          ? netAmount - receivedAmount - discountExtraAmount
          : receivedAmount - Math.abs(netAmount) - discountExtraAmount;
        finalBalance *= -1;
      }

      let transactionId: string;
      let previousAmountPaid = 0;
      let oldBalanceEffect = 0;

      // Begin transaction
      await db.execAsync('BEGIN TRANSACTION');

      try {
        if (isUpdate) {
          // UPDATE existing transaction
          const existingTransaction = await this.getTransactionById(existingTransactionId!);
          
          if (!existingTransaction) {
            await db.execAsync('ROLLBACK');
            return { success: false, error: 'Transaction not found' };
          }

          transactionId = existingTransactionId!;
          previousAmountPaid = existingTransaction.lastGivenMoney;
          
          // Calculate old balance effect
          const isOldMetalOnly = existingTransaction.entries.some(entry => entry.metalOnly === true);
          if (!isOldMetalOnly) {
            const oldNetAmount = existingTransaction.total;
            const oldReceivedAmount = existingTransaction.amountPaid;
            oldBalanceEffect = oldNetAmount >= 0 
              ? oldReceivedAmount - oldNetAmount - existingTransaction.discountExtraAmount
              : Math.abs(oldNetAmount) - oldReceivedAmount - existingTransaction.discountExtraAmount;
          }

          // REVERSE old metal balances
          if (existingTransaction.entries.some(entry => entry.metalOnly === true)) {
            for (const oldEntry of existingTransaction.entries) {
              if (oldEntry.metalOnly && oldEntry.type !== 'money') {
                const itemType = oldEntry.itemType;
                let metalAmount = 0;

                if (oldEntry.itemType === 'rani') {
                  metalAmount = oldEntry.pureWeight || 0;
                  metalAmount = oldEntry.type === 'sell' ? -metalAmount : metalAmount;
                } else if (oldEntry.itemType === 'rupu') {
                  metalAmount = oldEntry.pureWeight || 0;
                  metalAmount = oldEntry.type === 'sell' ? -metalAmount : metalAmount;
                } else {
                  metalAmount = oldEntry.weight || 0;
                  metalAmount = oldEntry.type === 'sell' ? -metalAmount : metalAmount;
                }

                // Reverse the metal balance
                await CustomerService.updateCustomerMetalBalance(customer.id, itemType, -metalAmount);
              }
            }
          }

          // Handle stock reversal for old entries
          for (const entry of existingTransaction.entries) {
            if (entry.stock_id) {
              if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
                await RaniRupaStockService.removeStock(entry.stock_id);
              } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
                const touch = entry.touch || 100;
                await RaniRupaStockService.restoreStock(entry.stock_id, entry.itemType, entry.weight || 0, touch);
              }
            }
          }

          // Delete old transaction entries
          await db.runAsync('DELETE FROM transaction_entries WHERE transaction_id = ?', [transactionId]);

          // Update transaction
          await db.runAsync(
            `UPDATE transactions 
             SET customerName = ?, date = ?, discountExtraAmount = ?, total = ?, 
                 amountPaid = ?, lastGivenMoney = ?, lastToLastGivenMoney = ?, 
                 settlementType = ?, lastUpdatedAt = ?
             WHERE id = ?`,
            [
              customer.name.trim(),
              transactionDate,
              discountExtraAmount,
              netAmount,
              receivedAmount,
              receivedAmount,
              previousAmountPaid,
              finalBalance === 0 ? 'full' : 'partial',
              now,
              transactionId
            ]
          );
        } else {
          // CREATE new transaction
          transactionId = `txn_${Date.now()}`;
          
          // Get device ID
          let deviceId = await SecureStore.getItemAsync('device_id');
          if (!deviceId) {
            deviceId = `device_${Date.now()}`;
            await SecureStore.setItemAsync('device_id', deviceId);
          }

          // Insert transaction
          await db.runAsync(
            `INSERT INTO transactions 
             (id, deviceId, customerId, customerName, date, discountExtraAmount, total, 
              amountPaid, lastGivenMoney, lastToLastGivenMoney, settlementType, createdAt, lastUpdatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              transactionId,
              deviceId,
              customer.id,
              customer.name.trim(),
              transactionDate,
              discountExtraAmount,
              netAmount,
              receivedAmount,
              receivedAmount,
              0,
              finalBalance === 0 ? 'full' : 'partial',
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
            const result = await RaniRupaStockService.addStock(entry.itemType, entry.weight || 0, touch);
            if (result.success && result.stock_id) {
              stockId = result.stock_id;
            } else {
              await db.execAsync('ROLLBACK');
              return { success: false, error: `Failed to add stock: ${result.error}` };
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
            const removeResult = await RaniRupaStockService.removeStock(stockId);
            if (!removeResult.success) {
              await db.execAsync('ROLLBACK');
              return { success: false, error: `Failed to remove stock: ${removeResult.error}` };
            }
          }

          // Insert entry
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
              isUpdate ? now : entryTimestamp,
              now
            ]
          );
        }

        // Create ledger entry
        const deltaAmount = receivedAmount - previousAmountPaid;
        const isMoneyOnly = entries.some(entry => entry.type === 'money');
        
        if (deltaAmount !== 0 || isMoneyOnly) {
          let ledgerTimestamp = transactionDate;
          if (!isMoneyOnly) {
            const entryTimestamps = entries
              .map(entry => entry.createdAt)
              .filter((timestamp): timestamp is string => timestamp !== undefined)
              .sort();
            if (entryTimestamps.length > 0) {
              ledgerTimestamp = entryTimestamps[0];
            }
          }
          
          const ledgerDelta = isMoneyOnly && deltaAmount === 0 ? netAmount : deltaAmount;
          
          // Get the full transaction object to pass to ledger service
          const fullTransaction = await this.getTransactionById(transactionId);
          if (fullTransaction) {
            await LedgerService.createLedgerEntry(fullTransaction, ledgerDelta, ledgerTimestamp);
          }
        }

        // Update customer balance
        const isMetalOnly = entries.some(entry => entry.metalOnly === true);
        let newBalance = customer.balance;
        
        if (!isMetalOnly) {
          newBalance = customer.balance - oldBalanceEffect + finalBalance;
        }

        // Apply metal balances for metal-only entries
        if (isMetalOnly) {
          for (const entry of entries) {
            if (entry.metalOnly && entry.type !== 'money') {
              const itemType = entry.itemType;
              let metalAmount = 0;

              if (entry.itemType === 'rani') {
                metalAmount = entry.pureWeight || 0;
                metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
              } else if (entry.itemType === 'rupu') {
                metalAmount = entry.pureWeight || 0;
                metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
              } else {
                metalAmount = entry.weight || 0;
                metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
              }

              await CustomerService.updateCustomerMetalBalance(customer.id, itemType, metalAmount);
            }
          }
        }

        // Update customer
        const updatedCustomer: Customer = {
          ...customer,
          balance: newBalance,
          lastTransaction: now,
        };
        
        await CustomerService.saveCustomer(updatedCustomer);

        // Store last transaction ID in settings
        await db.runAsync(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
          ['last_transaction_id', transactionId]
        );

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

      // Calculate the balance effect to reverse
      const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
      let balanceEffect = 0;
      if (!isMetalOnly) {
        const netAmount = transaction.total;
        const receivedAmount = transaction.amountPaid;
        const discountExtraAmount = transaction.discountExtraAmount;
        balanceEffect = netAmount >= 0 
          ? receivedAmount - netAmount - discountExtraAmount
          : Math.abs(netAmount) - receivedAmount - discountExtraAmount;
        balanceEffect *= -1; // Reverse the effect
      }

      // Reverse metal balances for metal-only entries
      if (isMetalOnly) {
        for (const entry of transaction.entries) {
          if (entry.metalOnly && entry.type !== 'money') {
            const itemType = entry.itemType;
            let metalAmount = 0;

            if (entry.itemType === 'rani') {
              metalAmount = entry.pureWeight || 0;
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount; // Reverse
            } else if (entry.itemType === 'rupu') {
              metalAmount = entry.pureWeight || 0;
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount; // Reverse
            } else {
              metalAmount = entry.weight || 0;
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount; // Reverse
            }

            await CustomerService.updateCustomerMetalBalance(customer.id, itemType, -metalAmount);
          }
        }
      }

      // Reverse stock
      for (const entry of transaction.entries) {
        if (entry.stock_id) {
          if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
            await RaniRupaStockService.removeStock(entry.stock_id);
          } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
            const touch = entry.touch || 100;
            await RaniRupaStockService.restoreStock(entry.stock_id, entry.itemType, entry.weight || 0, touch);
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
      }

      // Delete ledger entries
      await LedgerService.deleteLedgerEntryByTransactionId(transactionId);

      // Delete the transaction (cascade will delete entries)
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [transactionId]);
      
      return true;
    } catch (error) {
      console.error('Error deleting transaction:', error);
      return false;
    }
  }
}
