import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Customer, Transaction, TransactionEntry, LedgerEntry } from '../types';
import { RaniRupaStockService } from './raniRupaStockService';

export const STORAGE_KEYS = {
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

// Simple in-memory cache for performance optimization
let customersCache: Customer[] | null = null;
let transactionsCache: Transaction[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 300000; // 5 minutes

export class DatabaseService {
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

  // Cache management
  static clearCache() {
    customersCache = null;
    transactionsCache = null;
    cacheTimestamp = 0;
  }

  // Calculate net opening balance effects on inventory
  static async calculateOpeningBalanceEffects(): Promise<{
    gold999: number;
    gold995: number;
    silver: number;
    rani: number;
    rupu: number;
    money: number;
  }> {
    try {
      const customers = await this.getAllCustomers();
      
      const effects = {
        gold999: 0,
        gold995: 0,
        silver: 0,
        rani: 0,
        rupu: 0,
        money: 0
      };

      for (const customer of customers) {
        // Money balance: Positive = customer owes merchant (merchant has received money)
        // So positive balance reduces base inventory (inflow)
        effects.money += customer.balance;

        // Metal balances: Positive = merchant owes customer (merchant has given out metal)
        // So positive balance reduces base inventory (outflow)
        if (customer.metalBalances) {
          effects.gold999 += customer.metalBalances.gold999 || 0;
          effects.gold995 += customer.metalBalances.gold995 || 0;
          effects.silver += customer.metalBalances.silver || 0;
          effects.rani += customer.metalBalances.rani || 0;
          effects.rupu += customer.metalBalances.rupu || 0;
        }
      }

      return effects;
    } catch (error) {
      console.error('Error calculating opening balance effects:', error);
      return {
        gold999: 0,
        gold995: 0,
        silver: 0,
        rani: 0,
        rupu: 0,
        money: 0
      };
    }
  }

  // Customer operations
  static async getAllCustomers(): Promise<Customer[]> {
    try {
      // Check cache first
      const now = Date.now();
      if (customersCache !== null && (now - cacheTimestamp) < CACHE_DURATION) {
        return [...customersCache];
      }

      const customersJson = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      const customers: Customer[] = customersJson ? JSON.parse(customersJson) : [];
      
      // Ensure all customer names are trimmed
      customersCache = customers.map(customer => ({ ...customer, name: customer.name.trim() }));
      cacheTimestamp = now;
      
      return [...customersCache];
    } catch (error) {
      console.error('Error getting customers:', error);
      customersCache = [];
      return [];
    }
  }

  static async saveCustomer(customer: Customer): Promise<boolean> {
    try {
      const customers = await this.getAllCustomers();
      const existingIndex = customers.findIndex(c => c.id === customer.id);
      
      // Ensure customer name is trimmed
      const trimmedCustomer = { ...customer, name: customer.name.trim() };
      
      if (existingIndex >= 0) {
        customers[existingIndex] = trimmedCustomer;
      } else {
        customers.push(trimmedCustomer);
      }
      
      await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
      
      // Clear cache since data has changed
      DatabaseService.clearCache();
      
      return true;
    } catch (error) {
      console.error('Error saving customer:', error);
      return false;
    }
  }

  static async getCustomerById(id: string): Promise<Customer | null> {
    try {
      const customers = await this.getAllCustomers();
      return customers.find(c => c.id === id) || null;
    } catch (error) {
      console.error('Error getting customer by ID:', error);
      return null;
    }
  }

  static async updateCustomerBalance(customerId: string, newBalance: number): Promise<boolean> {
    try {
      const customer = await this.getCustomerById(customerId);
      if (!customer) return false;
      
      customer.balance = newBalance;
      return await this.saveCustomer(customer);
    } catch (error) {
      console.error('Error updating customer balance:', error);
      return false;
    }
  }

  static async updateCustomerMetalBalance(
    customerId: string,
    itemType: string,
    amount: number
  ): Promise<boolean> {
    try {
      const customer = await this.getCustomerById(customerId);
      if (!customer) return false;

      if (!customer.metalBalances) {
        customer.metalBalances = {};
      }

      const currentBalance = customer.metalBalances[itemType as keyof typeof customer.metalBalances] || 0;
      customer.metalBalances[itemType as keyof typeof customer.metalBalances] = currentBalance + amount;

      return await this.saveCustomer(customer);
    } catch (error) {
      console.error('Error updating customer metal balance:', error);
      return false;
    }
  }

  // Ledger operations
  static async getAllLedgerEntries(): Promise<LedgerEntry[]> {
    try {
      const ledgerJson = await AsyncStorage.getItem(STORAGE_KEYS.LEDGER);
      const entries: LedgerEntry[] = ledgerJson ? JSON.parse(ledgerJson) : [];
      // Sort by date (most recent first)
      return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
      console.error('Error getting ledger entries:', error);
      return [];
    }
  }

  static async getLedgerEntriesByDate(startDate: Date, endDate: Date): Promise<LedgerEntry[]> {
    try {
      const allEntries = await this.getAllLedgerEntries();
      return allEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= startDate && entryDate <= endDate;
      });
    } catch (error) {
      console.error('Error getting ledger entries by date:', error);
      return [];
    }
  }

  static async getLedgerEntriesByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    try {
      const allEntries = await this.getAllLedgerEntries();
      return allEntries.filter(entry => entry.transactionId === transactionId);
    } catch (error) {
      console.error('Error getting ledger entries by transaction ID:', error);
      return [];
    }
  }

  static async getLedgerEntriesByCustomerId(customerId: string): Promise<LedgerEntry[]> {
    try {
      const allEntries = await this.getAllLedgerEntries();
      return allEntries.filter(entry => entry.customerId === customerId);
    } catch (error) {
      console.error('Error getting ledger entries by customer ID:', error);
      return [];
    }
  }

  static async createLedgerEntry(
    transaction: Transaction,
    deltaAmount: number,
    timestamp: string
  ): Promise<boolean> {
    try {
      // Use timestamp with milliseconds for unique ID
      const ledgerId = `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const ledgerEntry: LedgerEntry = {
        id: ledgerId,
        transactionId: transaction.id,
        customerId: transaction.customerId,
        customerName: transaction.customerName,
        date: timestamp,
        amountReceived: transaction.total >= 0 ? Math.abs(deltaAmount) : 0,
        amountGiven: transaction.total < 0 ? Math.abs(deltaAmount) : 0,
        entries: transaction.entries,
        createdAt: timestamp,
      };

      const ledgerEntries = await this.getAllLedgerEntries();
      
      ledgerEntries.push(ledgerEntry);
      await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(ledgerEntries));
      
      return true;
    } catch (error) {
      console.error('Error creating ledger entry:', error);
      return false;
    }
  }

  // Transaction operations
  static async getAllTransactions(): Promise<Transaction[]> {
    try {
      // Check cache first
      const now = Date.now();
      if (transactionsCache !== null && (now - cacheTimestamp) < CACHE_DURATION) {
        return [...transactionsCache]; // Return a copy to prevent external mutations
      }

      const transactionsJson = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      const transactions = transactionsJson ? JSON.parse(transactionsJson) : [];
      transactionsCache = transactions;
      cacheTimestamp = now;
      
      return [...transactions];
    } catch (error) {
      console.error('Error getting transactions:', error);
      transactionsCache = [];
      return [];
    }
  }

  static async getTransactionsByCustomerId(customerId: string): Promise<Transaction[]> {
    try {
      const transactions = await this.getAllTransactions();
      return transactions.filter(t => t.customerId === customerId);
    } catch (error) {
      console.error('Error getting transactions by customer ID:', error);
      return [];
    }
  }

  static async saveTransaction(
    customer: Customer,
    entries: TransactionEntry[],
    receivedAmount: number = 0,
    existingTransactionId?: string,  // If provided, update existing transaction
    discountExtraAmount: number = 0,
    saveDate?: Date | null
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Validate input
      if (!customer || !entries || entries.length === 0) {
        return { success: false, error: 'Invalid customer or entries data' };
      }

      console.log('entries details:', entries);
      // Use provided saveDate or current date
      const transactionDate = saveDate ? saveDate.toISOString() : new Date().toISOString();
      const now = new Date().toISOString(); // Keep current time for createdAt/lastUpdatedAt when updating
      const isUpdate = !!existingTransactionId;

      // Calculate totals
      const { netAmount, subtotal } = this.calculateTransactionTotals(entries);

      // Check if this is a money-only transaction
      const isMoneyOnlyTransaction = entries.every(entry => entry.type === 'money');

      // Final balance calculation (from MERCHANT's perspective):
      let finalBalance: number;
      if (isMoneyOnlyTransaction) {
        // For money-only transactions:
        // Positive netAmount (receive) = merchant receives money = customer has credit
        // Negative netAmount (give) = merchant gives money = customer owes more
        finalBalance = netAmount;
        if (customer.name.toLowerCase() === 'adjust') {
          finalBalance = 0; // Do not adjust balance for "Adjust" customer
          console.log(`netAmount: ${netAmount}, finalBalance: ${finalBalance}`)
        }
      } else {
        // For sell/purchase transactions:
        finalBalance = netAmount >= 0
          ? netAmount - receivedAmount - discountExtraAmount  // SELL: customer pays less due to discount
          : receivedAmount - Math.abs(netAmount) - discountExtraAmount; // PURCHASE: merchant pays, adjust for extra
        finalBalance *= -1;
      }

      let transaction: Transaction;
      let previousAmountPaid = 0;
      let oldBalanceEffect = 0;

      if (isUpdate) {
        // UPDATE existing transaction
        const transactions = await this.getAllTransactions();
        const existingIndex = transactions.findIndex(t => t.id === existingTransactionId);
        
        if (existingIndex === -1) {
          return { success: false, error: 'Transaction not found' };
        }

        const existingTransaction = transactions[existingIndex];
        previousAmountPaid = existingTransaction.lastGivenMoney;
        
        // Calculate old transaction's balance effect (only for non-metal-only transactions)
        const isOldMetalOnly = existingTransaction.entries.some((entry: TransactionEntry) => entry.metalOnly === true);
        if (!isOldMetalOnly) {
          const oldNetAmount = existingTransaction.total;
          const oldReceivedAmount = existingTransaction.amountPaid;
          oldBalanceEffect = oldNetAmount >= 0 
            ? oldReceivedAmount - oldNetAmount - existingTransaction.discountExtraAmount          // SELL: customer payment reduces customer debt
            : Math.abs(oldNetAmount) - oldReceivedAmount - existingTransaction.discountExtraAmount; // PURCHASE: merchant payment reduces merchant debt
        }
        
        // REVERSE old metal balances from previous transaction state
        // This is crucial when entries change from metal-only to regular transactions
        if (existingTransaction.entries.some((entry: TransactionEntry) => entry.metalOnly === true)) {
          
          existingTransaction.entries.forEach(oldEntry => {
            if (oldEntry.metalOnly && oldEntry.type !== 'money') {
              const itemType = oldEntry.itemType;
              let metalAmount = 0;

              // Calculate the metal amount that was previously added
              if (oldEntry.itemType === 'rani') {
                metalAmount = oldEntry.pureWeight || 0;
                metalAmount = oldEntry.type === 'sell' ? -metalAmount : metalAmount;
              } else if (oldEntry.itemType === 'rupu') {
                if (oldEntry.rupuReturnType === 'silver' && oldEntry.netWeight !== undefined) {
                  metalAmount = oldEntry.netWeight;
                } else {
                  metalAmount = oldEntry.pureWeight || 0;
                  metalAmount = oldEntry.type === 'sell' ? -metalAmount : metalAmount;
                }
              } else {
                // Regular metals
                metalAmount = oldEntry.weight || 0;
                metalAmount = oldEntry.type === 'sell' ? -metalAmount : metalAmount;
              }

              // Reverse the metal balance (subtract what was added, add what was subtracted)
              if (!customer.metalBalances) {
                customer.metalBalances = {};
              }
              const currentBalance = customer.metalBalances[itemType as keyof typeof customer.metalBalances] || 0;
              customer.metalBalances[itemType as keyof typeof customer.metalBalances] = currentBalance - metalAmount;
              
            }
          });
        }
        
        // Update transaction with new values
        const mappedEntries = entries.map(e => ({ ...e, lastUpdatedAt: now }));
        
        // Handle stock reversal for old entries and stock management for new entries
        try {
          // First, reverse stock changes from existing transaction entries
          for (const entry of existingTransaction.entries) {
            if (entry.stock_id) {
              if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
                // Remove stock for purchases that were added
                const removeResult = await RaniRupaStockService.removeStock(entry.stock_id);
                if (!removeResult.success) {
                  console.error(`[STOCK_UPDATE] Failed to remove stock for purchase reversal: ${removeResult.error}`);
                }
              } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
                // Add back stock for sales that were removed - use original stock_id
                const touch = entry.touch || 100; // Default to 100% for rupu
                const restoreResult = await RaniRupaStockService.restoreStock(entry.stock_id, entry.itemType, entry.weight || 0, touch);
                if (!restoreResult.success) {
                  console.error(`[STOCK_UPDATE] Failed to restore stock for sale reversal: ${restoreResult.error}`);
                }
              }
            } else {
              console.error(`[STOCK_UPDATE] Skipping old entry reversal - no stock_id found`);
            }
          }
          
          // Then apply stock management to new entries
          for (const entry of mappedEntries) {
            if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              // Add stock for purchases
              const touch = entry.touch || 100; // Default to 100% for rupu
              const result = await RaniRupaStockService.addStock(entry.itemType, entry.weight || 0, touch);
              if (result.success && result.stock_id) {
                entry.stock_id = result.stock_id;
              } else {
                console.error(`[STOCK_UPDATE] Failed to add stock: ${result.error}`);
                return { success: false, error: `Failed to add stock: ${result.error}` };
              }
            } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              // Remove stock for sales - use existing stock_id or find stock to remove
              let stockIdToRemove = entry.stock_id;
              if (!stockIdToRemove) {
                // Find stock to remove for new/modified sell entries
                const stockOfType = await RaniRupaStockService.getStockByType(entry.itemType);
                if (stockOfType.length > 0) {
                  // Sort by creation date (oldest first) and take the first one
                  const oldestStock = stockOfType.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
                  stockIdToRemove = oldestStock.stock_id;
                  entry.stock_id = oldestStock.stock_id; // Set it on the entry for future reference
                } else {
                  console.error(`[STOCK_UPDATE] No stock available for sale of ${entry.itemType}`);
                  return { success: false, error: `No stock available for sale of ${entry.itemType}` };
                }
              }
              const removeResult = await RaniRupaStockService.removeStock(stockIdToRemove);
              if (!removeResult.success) {
                console.error(`[STOCK_UPDATE] Failed to remove stock for sale: ${removeResult.error}`);
                return { success: false, error: `Failed to remove stock for sale: ${removeResult.error}` };
              }
            } else {
              console.log(`[STOCK_UPDATE] Skipping entry - not Rani/Rupa or missing stock_id for sell`);
            }
          }
        } catch (stockError) {
          console.error('[STOCK_UPDATE] Error managing stock for update:', stockError);
          return { success: false, error: 'Error managing stock' };
        }

        console.log(`netAmount: ${netAmount}, finalBalance: ${finalBalance}`)
        transaction = {
          ...existingTransaction,
          entries: mappedEntries,
          discount: 0,
          discountExtraAmount,
          subtotal: Math.abs(subtotal),
          total: netAmount,
          amountPaid: receivedAmount,
          lastGivenMoney: receivedAmount,
          lastToLastGivenMoney: previousAmountPaid,
          settlementType: finalBalance === 0 ? 'full' : 'partial',
          lastUpdatedAt: now,
        };

        transactions[existingIndex] = transaction;
        await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
        DatabaseService.clearCache();
      } else {
        // CREATE new transaction
        const transactionId = `txn_${Date.now()}`;
        
        // Get device ID for conflict-free merging
        let deviceId = await SecureStore.getItemAsync('device_id');
        if (!deviceId) {
          deviceId = `device_${Date.now()}`;
          await SecureStore.setItemAsync('device_id', deviceId);
        }

        // Create mapped entries first
        // If saveDate is provided and it's not today, use selected date with current time for entry timestamps
        let entryTimestamp = now;
        if (saveDate) {
          const today = new Date();
          const selectedDate = new Date(saveDate);
          
          // Check if selected date is different from today (compare date parts only)
          const isDifferentDate = 
            selectedDate.getFullYear() !== today.getFullYear() ||
            selectedDate.getMonth() !== today.getMonth() ||
            selectedDate.getDate() !== today.getDate();
          
          if (isDifferentDate) {
            const entryDateTime = saveDate;
            entryTimestamp = entryDateTime.toISOString();
          }
        }
        
        const mappedEntries = entries.map(e => ({ ...e, createdAt: entryTimestamp, lastUpdatedAt: entryTimestamp }));

        // INTEGRATE STOCK MANAGEMENT: Add stock for purchases, remove for sales
        try {
          for (const entry of mappedEntries) {
            if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              // Add stock for purchases
              const touch = entry.touch || 100; // Default to 100% for rupu
              const result = await RaniRupaStockService.addStock(entry.itemType, entry.weight || 0, touch);
              if (result.success && result.stock_id) {
                entry.stock_id = result.stock_id;
              } else {
                console.error(`[STOCK] Failed to add stock: ${result.error}`);
              }
            } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              // Remove stock for sales - find and remove the oldest stock of this type
              const stockOfType = await RaniRupaStockService.getStockByType(entry.itemType);
              if (stockOfType.length > 0) {
                // Sort by creation date (oldest first) and take the first one
                const oldestStock = stockOfType.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
                entry.stock_id = oldestStock.stock_id;
                const removeResult = await RaniRupaStockService.removeStock(oldestStock.stock_id);
                if (!removeResult.success) {
                  console.error(`[STOCK] Failed to remove stock for sale: ${removeResult.error}`);
                }
              } else {
                console.error(`[STOCK] No stock available for sale of ${entry.itemType}`);
              }
            }
          }
        } catch (stockError) {
          console.error('[STOCK] Error managing stock:', stockError);
          return { success: false, error: 'Error managing stock' };
        }
        
        transaction = {
          id: transactionId,
          deviceId,
          customerId: customer.id,
          customerName: customer.name.trim(),
          date: transactionDate,
          entries: mappedEntries,
          discount: 0,
          discountExtraAmount,
          subtotal: Math.abs(subtotal),
          total: netAmount,
          amountPaid: receivedAmount,
          lastGivenMoney: receivedAmount,
          lastToLastGivenMoney: 0,
          settlementType: finalBalance === 0 ? 'full' : 'partial',
          status: 'completed',
          createdAt: now,
          lastUpdatedAt: now,
        };

        const transactions = await this.getAllTransactions();
        transactions.push(transaction);
        await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
        DatabaseService.clearCache();
      }

      // Calculate the delta amount for ledger entry
      const deltaAmount = receivedAmount - previousAmountPaid;
      
      // Check if this is a money-only transaction
      const isMoneyOnly = entries.some(entry => entry.type === 'money');
      
      // Create ledger entry for money changes or money-only transactions
      if (deltaAmount !== 0 || isMoneyOnly) {
        // For money-only transactions, use the transaction date (when transaction was saved)
        // For non-money-only transactions, use the earliest entry's createdAt timestamp
        let ledgerTimestamp = transactionDate;
        if (!isMoneyOnly) {
          // Find the earliest entry creation time
          const entryTimestamps = entries
            .map(entry => entry.createdAt)
            .filter((timestamp): timestamp is string => timestamp !== undefined) // Filter out undefined timestamps
            .sort();
          if (entryTimestamps.length > 0) {
            ledgerTimestamp = entryTimestamps[0]; // Use the earliest entry creation time
          }
        }
        
        // For money-only transactions, use the transaction total as delta if no payment made
        const ledgerDelta = isMoneyOnly && deltaAmount === 0 ? netAmount : deltaAmount;
        await this.createLedgerEntry(transaction, ledgerDelta, ledgerTimestamp);
      }

      // Check if any entry is metal-only
      const isMetalOnly = entries.some((entry: TransactionEntry) => entry.metalOnly === true);

      // Update customer balance based on transaction type
      let newBalance = customer.balance;
      if (!isMetalOnly) {
        // For regular transactions: reverse old effect and apply new effect
        newBalance = customer.balance - oldBalanceEffect + finalBalance;
      }
      // For metal-only transactions: balance remains unchanged (only metal balances are affected)

      const updatedCustomer: Customer = {
        ...customer,
        balance: newBalance,
        lastTransaction: now,
        metalBalances: customer.metalBalances || {},
      };

      // Apply NEW metal balances for metal-only entries in updated transaction
      if (isMetalOnly) {
        entries.forEach(entry => {
          if (entry.metalOnly && entry.type !== 'money') {
            const itemType = entry.itemType;
            let metalAmount = 0;

            // Determine metal balance change based on entry type and item
            if (entry.itemType === 'rani') {
              metalAmount = entry.pureWeight || 0;
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
            } else if (entry.itemType === 'rupu') {
              if (entry.rupuReturnType === 'silver' && entry.netWeight !== undefined) {
                metalAmount = entry.netWeight;
              } else {
                metalAmount = entry.pureWeight || 0;
                // Sell = customer owes merchant (negative), Purchase = merchant owes customer (positive)
                metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
              }
            } else {
              // Regular metals: use actual weight
              metalAmount = entry.weight || 0;
              // Sell = customer owes merchant (negative), Purchase = merchant owes customer (positive)
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
            }

            // Update the metal balance
            if (!updatedCustomer.metalBalances) {
              updatedCustomer.metalBalances = {};
            }
            const currentBalance = updatedCustomer.metalBalances[itemType as keyof typeof updatedCustomer.metalBalances] || 0;
            updatedCustomer.metalBalances[itemType as keyof typeof updatedCustomer.metalBalances] = currentBalance + metalAmount;
          }
        });
      }

      const customerSaved = await this.saveCustomer(updatedCustomer);
      if (!customerSaved) {
      }

      // Calculate current inventory for logging
      const allTransactions = await this.getAllTransactions();
      const baseInventory = await this.getBaseInventory();
      const inventoryBefore = {
        gold999: baseInventory.gold999,
        gold995: baseInventory.gold995,
        rani: baseInventory.rani,
        silver: baseInventory.silver,
        rupu: baseInventory.rupu,
        money: baseInventory.money,
      };

      // Update inventory based on all transactions
      allTransactions.forEach(trans => {
        trans.entries.forEach(entry => {
          if (entry.type === 'money') {
            // Money entries affect money inventory
            // moneyType 'receive' = merchant receives money = increase money inventory
            // moneyType 'give' = merchant gives money = decrease money inventory
            const moneyChange = entry.moneyType === 'receive' ? (entry.amount || 0) : -(entry.amount || 0);
            inventoryBefore.money += moneyChange;
          } else if (entry.type === 'sell') {
            if (entry.itemType === 'rani') {
              inventoryBefore.rani -= entry.weight || 0;
              inventoryBefore.gold999 -= entry.actualGoldGiven || 0;
            } else if (entry.weight) {
              const weight = entry.pureWeight || entry.weight;
              if (entry.itemType in inventoryBefore) {
                inventoryBefore[entry.itemType as keyof typeof inventoryBefore] -= weight;
              }
            }
          } else if (entry.type === 'purchase') {
            if (entry.itemType === 'rupu' && entry.rupuReturnType === 'silver') {
              inventoryBefore.rupu += entry.weight || 0;
              inventoryBefore.silver -= entry.silverWeight || 0;
            } else if (entry.weight) {
              const weight = entry.pureWeight || entry.weight;
              if (entry.itemType in inventoryBefore) {
                inventoryBefore[entry.itemType as keyof typeof inventoryBefore] += weight;
              }
            }
          }
        });
        // Update money inventory based on payments (only for non-money-only transactions)
        // For money-only transactions, inventory is already updated via entry.type === 'money'
        const transactionHasMoneyEntry = trans.entries.some(e => e.type === 'money');
        if (!transactionHasMoneyEntry) {
          if (trans.total >= 0) {
            inventoryBefore.money += trans.amountPaid;
          } else {
            inventoryBefore.money -= trans.amountPaid;
          }
        }
      });

      // Apply rounding to inventory values to prevent floating point precision issues
      inventoryBefore.gold999 = this.roundInventoryValue(inventoryBefore.gold999, 'gold999');
      inventoryBefore.gold995 = this.roundInventoryValue(inventoryBefore.gold995, 'gold995');
      inventoryBefore.rani = this.roundInventoryValue(inventoryBefore.rani, 'rani');
      inventoryBefore.silver = this.roundInventoryValue(inventoryBefore.silver, 'silver');
      inventoryBefore.rupu = this.roundInventoryValue(inventoryBefore.rupu, 'rupu');
      inventoryBefore.money = this.roundInventoryValue(inventoryBefore.money, 'money');

      // Update last transaction ID
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_TRANSACTION_ID, transaction.id);

      return { success: true, transactionId: transaction.id };
    } catch (error) {
      console.error('Error saving transaction:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getTransactionById(id: string): Promise<Transaction | null> {
    try {
      const transactions = await this.getAllTransactions();
      return transactions.find(t => t.id === id) || null;
    } catch (error) {
      console.error('Error getting transaction by ID:', error);
      return null;
    }
  }

  // Utility functions
  private static calculateTransactionTotals(entries: TransactionEntry[]) {
    let netMoneyFlow = 0; // Net money from merchant perspective

    entries.forEach(entry => {
      // Keep the sign from entry.subtotal as it already has correct direction:
      // Positive subtotal = SELL (merchant expects to receive money)
      // Negative subtotal = PURCHASE (merchant expects to pay money)
      netMoneyFlow += entry.subtotal;
    });

    const subtotal = entries.reduce((sum, entry) => sum + Math.abs(entry.subtotal), 0);

    return { 
      totalGive: netMoneyFlow < 0 ? Math.abs(netMoneyFlow) : 0, 
      totalTake: netMoneyFlow > 0 ? netMoneyFlow : 0, 
      netAmount: netMoneyFlow, // Positive = merchant expects to receive (SELL), Negative = merchant expects to pay (PURCHASE)
      subtotal 
    };
  }

  static async exportData(): Promise<{
    customers: Customer[];
    transactions: Transaction[];
    ledger: LedgerEntry[];
    baseInventory: {
      gold999: number;
      gold995: number;
      silver: number;
      rani: number;
      rupu: number;
      money: number;
    };
    raniRupaStock: any[];
  } | null> {
    try {
      const customers = await this.getAllCustomers();
      const transactions = await this.getAllTransactions();
      const ledger = await this.getAllLedgerEntries();
      const baseInventory = await this.getBaseInventory();
      const raniRupaStock = await RaniRupaStockService.getAllStock();
      return { customers, transactions, ledger, baseInventory, raniRupaStock };
    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  }

  static async importData(data: {
    customers: Customer[];
    transactions: Transaction[];
    ledger?: LedgerEntry[];
    baseInventory?: {
      gold999: number;
      gold995: number;
      silver: number;
      rani: number;
      rupu: number;
      money: number;
    };
    raniRupaStock?: any[];
  }): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers));
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data.transactions));
      if (data.ledger) {
        await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(data.ledger));
      }
      if (data.baseInventory) {
        await AsyncStorage.setItem(STORAGE_KEYS.BASE_INVENTORY, JSON.stringify(data.baseInventory));
      }
      if (data.raniRupaStock) {
        await AsyncStorage.setItem(STORAGE_KEYS.RANI_RUPA_STOCK, JSON.stringify(data.raniRupaStock));
      }
      DatabaseService.clearCache();
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }

  // Base inventory operations
  static async getBaseInventory(): Promise<{
    gold999: number;
    gold995: number;
    silver: number;
    rani: number;
    rupu: number;
    money: number;
  }> {
    try {
      const baseInventoryJson = await AsyncStorage.getItem(STORAGE_KEYS.BASE_INVENTORY);
      if (baseInventoryJson) {
        const inventory = JSON.parse(baseInventoryJson);
        // Migrate old inventory by combining silver98 and silver96 into silver
        if (inventory.silver98 || inventory.silver96) {
          inventory.silver = (inventory.silver || 0) + (inventory.silver98 || 0) + (inventory.silver96 || 0);
          delete inventory.silver98;
          delete inventory.silver96;
          await this.setBaseInventory(inventory);
        }
        return inventory;
      }
      
      // Initialize with default values
      const defaultInventory = {
        gold999: 300,
        gold995: 100,
        silver: 10000,
        rani: 0,
        rupu: 0,
        money: 3000000
      };
      
      await this.setBaseInventory(defaultInventory);
      return defaultInventory;
    } catch (error) {
      console.error('Error getting base inventory:', error);
      return {
        gold999: 300,
        gold995: 100,
        silver: 10000,
        rani: 0,
        rupu: 0,
        money: 3000000
      };
    }
  }

  static async setBaseInventory(inventory: {
    gold999: number;
    gold995: number;
    silver: number;
    rani: number;
    rupu: number;
    money: number;
  }): Promise<boolean> {
    try {
      // Calculate opening balance effects
      const openingEffects = await this.calculateOpeningBalanceEffects();

      // Adjust base inventory based on opening balance effects
      // Positive opening effect = merchant has received (inflow) = reduce base inventory
      // Negative opening effect = merchant has given (outflow) = increase base inventory
      const adjustedInventory = {
        gold999: inventory.gold999 - openingEffects.gold999,
        gold995: inventory.gold995 - openingEffects.gold995,
        silver: inventory.silver - openingEffects.silver,
        rani: inventory.rani - openingEffects.rani,
        rupu: inventory.rupu - openingEffects.rupu,
        money: inventory.money - openingEffects.money
      };

      await AsyncStorage.setItem(STORAGE_KEYS.BASE_INVENTORY, JSON.stringify(adjustedInventory));
      return true;
    } catch (error) {
      console.error('Error setting base inventory:', error);
      return false;
    }
  }

  static async resetBaseInventory(): Promise<boolean> {
    try {
      const defaultInventory = {
        gold999: 300,
        gold995: 100,
        silver: 10000,
        rani: 0,
        rupu: 0,
        money: 3000000
      };
      
      await this.setBaseInventory(defaultInventory);
      return true;
    } catch (error) {
      console.error('Error resetting base inventory:', error);
      return false;
    }
  }

  // Clear all data (preserves base inventory)
  static async clearAllData(): Promise<boolean> {
    try {
      // Clear all main data storage keys
      const keysToRemove = [
        STORAGE_KEYS.CUSTOMERS,
        STORAGE_KEYS.TRANSACTIONS,
        STORAGE_KEYS.LEDGER,
        STORAGE_KEYS.LAST_TRANSACTION_ID,
        STORAGE_KEYS.TRADES,
        STORAGE_KEYS.LAST_TRADE_ID,
        STORAGE_KEYS.RANI_RUPA_STOCK, // Rani/Rupa stock data
        // Note: BASE_INVENTORY is preserved - inventory will reset to base values
        // Note: AUTO_BACKUP_ENABLED, STORAGE_PERMISSION_GRANTED, LAST_BACKUP_TIME are preserved
        // Note: Notification settings are preserved
      ];
      await AsyncStorage.multiRemove(keysToRemove);

      // Clear device ID from secure store
      try {
        await SecureStore.deleteItemAsync('device_id');
      } catch (error) {
        console.error('[CLEAR_DATA] Device ID not found in secure store (this is normal)');
        // Ignore if device_id doesn't exist
      }

      // Clear in-memory cache
      DatabaseService.clearCache();

      return true;
    } catch (error) {
      console.error('[CLEAR_DATA] Error clearing all data:', error);
      return false;
    }
  }

  // Delete transaction and reverse inventory changes
  static async deleteTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get the transaction to delete
      const transactions = await this.getAllTransactions();
      const transaction = transactions.find(t => t.id === transactionId);
      
      if (!transaction) {
        console.error(`[DELETE_TRANSACTION] Transaction not found: ${transactionId}`);
        return { success: false, error: 'Transaction not found' };
      }

      // Note: Base inventory should remain unchanged. Current inventory is calculated as:
      // base_inventory + sum of all transaction effects
      // When a transaction is deleted, it's automatically removed from the calculation

      // Reverse customer balance changes
      const customer = await this.getCustomerById(transaction.customerId);
      if (customer) {
        // Calculate what the finalBalance was for this transaction to reverse it
        const { netAmount } = this.calculateTransactionTotals(transaction.entries);
        
        // Check if this was a money-only transaction
        const isMoneyOnlyTransaction = transaction.entries.every(entry => entry.type === 'money');
        
        let finalBalance: number;
        if (isMoneyOnlyTransaction) {
          // For money-only transactions
          finalBalance = netAmount>=0 ? -netAmount : netAmount;
          if (customer.name.toLowerCase() === 'adjust') {
            finalBalance = 0; // Do not adjust balance for "Adjust" customer
          }
        } else {
          // For sell/purchase transactions
          //finalBalance = netAmount >= 0
          // ? netAmount - receivedAmount - discountExtraAmount  // SELL: customer pays less due to discount
          // : receivedAmount - Math.abs(netAmount) - discountExtraAmount; // PURCHASE: merchant pays, adjust for extra
          finalBalance = netAmount >= 0 
            ? netAmount - transaction.amountPaid - transaction.discountExtraAmount          // SELL: customer payment reduces customer debt
            : transaction.amountPaid - Math.abs(netAmount) - transaction.discountExtraAmount; // PURCHASE: merchant payment reduces merchant debt
          finalBalance *= -1;
        }
        
        // Check if transaction was metal-only
        const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
        
        // Reverse the balance change
        customer.balance = isMetalOnly
          ? customer.balance
          : netAmount >= 0
            ? customer.balance + finalBalance
            : customer.balance - finalBalance;
        
        // Reverse metal balances
        for (const entry of transaction.entries) {
          if (entry.metalOnly) {
            const itemType = entry.itemType;
            let metalAmount = 0;

            // Use the same logic as saveTransaction for determining metal amount
            if (entry.itemType === 'rani') {
              metalAmount = entry.pureWeight || 0;
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
            } else if (entry.itemType === 'rupu') {
              if (entry.rupuReturnType === 'silver' && entry.netWeight !== undefined) {
                metalAmount = entry.netWeight;
              } else {
                metalAmount = entry.pureWeight || 0;
                // Sell = customer owes merchant (negative), Purchase = merchant owes customer (positive)
                metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
              }
            } else {
              // Regular metals: use actual weight
              metalAmount = entry.weight || 0;
              // Sell = customer owes merchant (negative), Purchase = merchant owes customer (positive)
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
            }
            
            if (!customer.metalBalances) {
              customer.metalBalances = {} as any;
            }
            
            const currentBalance = (customer.metalBalances as any)[itemType] || 0;
            
            // Reverse the metal balance change (subtract what was added)
            (customer.metalBalances as any)[itemType] = currentBalance - metalAmount;
          }
        }
        
        await this.saveCustomer(customer);
      }

      // Reverse stock changes for rani/rupa entries
      try {
        for (const entry of transaction.entries) {
          console.log('stock id:', entry.stock_id);
          if (entry.stock_id) {
            if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              // Remove stock for purchases that were added
              const removeResult = await RaniRupaStockService.removeStock(entry.stock_id);
              if (!removeResult.success) {
                console.error(`[STOCK_DELETE] Failed to remove stock for purchase reversal: ${removeResult.error}`);
              }
            } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              // Add back stock for sales that were removed - use original stock_id
              const touch = entry.touch || 100; // Default to 100% for rupu
              const restoreResult = await RaniRupaStockService.restoreStock(entry.stock_id, entry.itemType, entry.weight || 0, touch);
              if (!restoreResult.success) {
                console.error(`[STOCK_DELETE] Failed to restore stock for sale reversal: ${restoreResult.error}`);
              }
            }
          } else {
            if (entry.stock_id !== undefined) { // Explicitly check for undefined to allow empty string or null as valid IDs
              console.error(`[STOCK_DELETE] Skipping entry - no stock_id found`);
            }
          }
        }
      } catch (stockError) {
        console.error('[STOCK_DELETE] Error reversing stock changes:', stockError);
        // Continue with deletion even if stock reversal fails
      }

      // Remove all ledger entries for this transaction
      const ledgerEntries = await this.getAllLedgerEntries();
      const filteredLedger = ledgerEntries.filter(entry => entry.transactionId !== transactionId);
      await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(filteredLedger));

      // Remove the transaction
      const filteredTransactions = transactions.filter(t => t.id !== transactionId);
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(filteredTransactions));
      DatabaseService.clearCache();

      return { success: true };
    } catch (error) {
      console.error('Error deleting transaction:', error);
      return { success: false, error: 'Failed to delete transaction' };
    }
  }

  // Backup settings operations
  static async getAutoBackupEnabled(): Promise<boolean> {
    try {
      const enabledJson = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_BACKUP_ENABLED);
      const result = enabledJson ? JSON.parse(enabledJson) : false;
      return result;
    } catch (error) {
      console.error('Error getting auto backup enabled:', error);
      return false;
    }
  }

  static async setAutoBackupEnabled(enabled: boolean): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTO_BACKUP_ENABLED, JSON.stringify(enabled));
      
      return true;
    } catch (error) {
      console.error('Error setting auto backup enabled:', error);
      return false;
    }
  }

  static async getStoragePermissionGranted(): Promise<boolean> {
    try {
      const grantedJson = await AsyncStorage.getItem(STORAGE_KEYS.STORAGE_PERMISSION_GRANTED);
      return grantedJson ? JSON.parse(grantedJson) : false;
    } catch (error) {
      console.error('Error getting storage permission granted:', error);
      return false;
    }
  }

  static async setStoragePermissionGranted(granted: boolean): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.STORAGE_PERMISSION_GRANTED, JSON.stringify(granted));
      return true;
    } catch (error) {
      console.error('Error setting storage permission granted:', error);
      return false;
    }
  }

  static async getLastBackupTime(): Promise<number | null> {
    try {
      const timeJson = await AsyncStorage.getItem(STORAGE_KEYS.LAST_BACKUP_TIME);
      return timeJson ? JSON.parse(timeJson) : null;
    } catch (error) {
      console.error('Error getting last backup time:', error);
      return null;
    }
  }

  static async setLastBackupTime(time: number): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_BACKUP_TIME, JSON.stringify(time));
      return true;
    } catch (error) {
      console.error('Error setting last backup time:', error);
      return false;
    }
  }
}