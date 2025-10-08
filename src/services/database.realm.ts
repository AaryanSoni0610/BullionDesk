import Realm, { ObjectSchema } from 'realm';
import * as SecureStore from 'expo-secure-store';
import { Customer, Transaction, TransactionEntry, LedgerEntry } from '../types';
import { RaniRupaStockService } from './raniRupaStockService';

// Realm Schema Definitions

// Embedded object for metal balances
const MetalBalancesSchema: ObjectSchema = {
  name: 'MetalBalances',
  embedded: true,
  properties: {
    gold999: 'double?',
    gold995: 'double?',
    rani: 'double?',
    silver: 'double?',
    rupu: 'double?',
  },
};

// Customer schema
const CustomerSchema: ObjectSchema = {
  name: 'Customer',
  primaryKey: 'id',
  properties: {
    id: 'string',
    name: { type: 'string', indexed: true },
    lastTransaction: 'string?',
    balance: { type: 'double', default: 0 },
    metalBalances: 'MetalBalances?',
    avatar: 'string?',
  },
};

// Embedded object for transaction entries
const TransactionEntrySchema: ObjectSchema = {
  name: 'TransactionEntry',
  embedded: true,
  properties: {
    id: 'string',
    type: 'string',
    itemType: 'string',
    weight: 'double?',
    price: 'double?',
    touch: 'double?',
    cut: 'double?',
    extraPerKg: 'double?',
    pureWeight: 'double?',
    actualGoldGiven: 'double?',
    moneyType: 'string?',
    amount: 'double?',
    rupuReturnType: 'string?',
    silverWeight: 'double?',
    metalOnly: 'bool?',
    stock_id: 'string?',
    subtotal: 'double',
    createdAt: 'string?',
    lastUpdatedAt: 'string?',
    netWeight: 'double?',
  },
};

// Transaction schema
const TransactionSchema: ObjectSchema = {
  name: 'Transaction',
  primaryKey: 'id',
  properties: {
    id: 'string',
    deviceId: 'string?',
    customerId: { type: 'string', indexed: true },
    customerName: 'string',
    date: { type: 'string', indexed: true },
    entries: 'TransactionEntry[]',
    discount: { type: 'double', default: 0 },
    discountExtraAmount: { type: 'double', default: 0 },
    subtotal: { type: 'double', default: 0 },
    total: { type: 'double', default: 0 },
    amountPaid: { type: 'double', default: 0 },
    lastGivenMoney: { type: 'double', default: 0 },
    lastToLastGivenMoney: { type: 'double', default: 0 },
    settlementType: 'string',
    status: 'string',
    createdAt: 'string',
    lastUpdatedAt: 'string',
  },
};

// LedgerEntry schema
const LedgerEntrySchema: ObjectSchema = {
  name: 'LedgerEntry',
  primaryKey: 'id',
  properties: {
    id: 'string',
    transactionId: { type: 'string', indexed: true },
    customerId: { type: 'string', indexed: true },
    customerName: 'string',
    date: { type: 'string', indexed: true },
    amountReceived: { type: 'double', default: 0 },
    amountGiven: { type: 'double', default: 0 },
    entries: 'TransactionEntry[]',
    notes: 'string?',
    createdAt: 'string',
  },
};

// BaseInventory schema (singleton)
const BaseInventorySchema: ObjectSchema = {
  name: 'BaseInventory',
  primaryKey: 'id',
  properties: {
    id: 'string',
    gold999: { type: 'double', default: 0 },
    gold995: { type: 'double', default: 0 },
    silver: { type: 'double', default: 0 },
    rani: { type: 'double', default: 0 },
    rupu: { type: 'double', default: 0 },
    money: { type: 'double', default: 0 },
  },
};

// Settings schema
const SettingsSchema: ObjectSchema = {
  name: 'Settings',
  primaryKey: 'id',
  properties: {
    id: 'string',
    autoBackupEnabled: 'bool?',
    storagePermissionGranted: 'bool?',
    lastBackupTime: 'int?',
    lastTransactionId: 'string?',
    lastTradeId: 'string?',
  },
};

// Configuration
const realmConfig: Realm.Configuration = {
  schema: [
    CustomerSchema,
    MetalBalancesSchema,
    TransactionSchema,
    TransactionEntrySchema,
    LedgerEntrySchema,
    BaseInventorySchema,
    SettingsSchema,
  ],
  schemaVersion: 1,
  path: 'bulliondesk.realm',
};

// Singleton Realm instance
let realmInstance: Realm | null = null;

const getRealm = async (): Promise<Realm> => {
  if (realmInstance) {
    return realmInstance;
  }
  realmInstance = await Realm.open(realmConfig);
  return realmInstance;
};

// Simple in-memory cache for performance optimization (kept for compatibility)
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

  // Helper to convert Realm object to plain JS object
  private static toPlainObject<T>(realmObject: any): T {
    return JSON.parse(JSON.stringify(realmObject));
  }

  // Helper to convert Realm List to Array
  private static listToArray<T>(list: Realm.List<any> | undefined): T[] {
    if (!list) return [];
    return Array.from(list).map(item => this.toPlainObject<T>(item));
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
        effects.money += customer.balance;

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
      const now = Date.now();
      if (customersCache !== null && (now - cacheTimestamp) < CACHE_DURATION) {
        return [...customersCache];
      }

      const realm = await getRealm();
      const customers = realm.objects('Customer');
      
      customersCache = Array.from(customers).map(c => ({
        ...this.toPlainObject<Customer>(c),
        name: (c as any).name.trim()
      }));
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
      const realm = await getRealm();
      
      const trimmedCustomer = { ...customer, name: customer.name.trim() };
      
      realm.write(() => {
        realm.create('Customer', trimmedCustomer, Realm.UpdateMode.Modified);
      });
      
      this.clearCache();
      return true;
    } catch (error) {
      console.error('Error saving customer:', error);
      return false;
    }
  }

  static async getCustomerById(id: string): Promise<Customer | null> {
    try {
      const realm = await getRealm();
      const customer = realm.objectForPrimaryKey('Customer', id);
      
      if (!customer) return null;
      
      return this.toPlainObject<Customer>(customer);
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
      const realm = await getRealm();
      const entries = realm.objects('LedgerEntry').sorted('date', true);
      
      return Array.from(entries).map(entry => ({
        ...this.toPlainObject<LedgerEntry>(entry),
        entries: this.listToArray<TransactionEntry>((entry as any).entries)
      }));
    } catch (error) {
      console.error('Error getting ledger entries:', error);
      return [];
    }
  }

  static async getLedgerEntriesByDate(startDate: Date, endDate: Date): Promise<LedgerEntry[]> {
    try {
      const realm = await getRealm();
      const entries = realm.objects('LedgerEntry')
        .filtered('date >= $0 AND date <= $1', startDate.toISOString(), endDate.toISOString());
      
      return Array.from(entries).map(entry => ({
        ...this.toPlainObject<LedgerEntry>(entry),
        entries: this.listToArray<TransactionEntry>((entry as any).entries)
      }));
    } catch (error) {
      console.error('Error getting ledger entries by date:', error);
      return [];
    }
  }

  static async getLedgerEntriesByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    try {
      const realm = await getRealm();
      const entries = realm.objects('LedgerEntry')
        .filtered('transactionId == $0', transactionId);
      
      return Array.from(entries).map(entry => ({
        ...this.toPlainObject<LedgerEntry>(entry),
        entries: this.listToArray<TransactionEntry>((entry as any).entries)
      }));
    } catch (error) {
      console.error('Error getting ledger entries by transaction ID:', error);
      return [];
    }
  }

  static async getLedgerEntriesByCustomerId(customerId: string): Promise<LedgerEntry[]> {
    try {
      const realm = await getRealm();
      const entries = realm.objects('LedgerEntry')
        .filtered('customerId == $0', customerId);
      
      return Array.from(entries).map(entry => ({
        ...this.toPlainObject<LedgerEntry>(entry),
        entries: this.listToArray<TransactionEntry>((entry as any).entries)
      }));
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
      const realm = await getRealm();
      
      const ledgerId = `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const ledgerEntry = {
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

      realm.write(() => {
        realm.create('LedgerEntry', ledgerEntry);
      });
      
      return true;
    } catch (error) {
      console.error('Error creating ledger entry:', error);
      return false;
    }
  }

  // Transaction operations
  static async getAllTransactions(): Promise<Transaction[]> {
    try {
      const now = Date.now();
      if (transactionsCache !== null && (now - cacheTimestamp) < CACHE_DURATION) {
        return [...transactionsCache];
      }

      const realm = await getRealm();
      const transactions = realm.objects('Transaction');
      
      transactionsCache = Array.from(transactions).map(t => ({
        ...this.toPlainObject<Transaction>(t),
        entries: this.listToArray<TransactionEntry>((t as any).entries)
      }));
      cacheTimestamp = now;
      
      return [...transactionsCache];
    } catch (error) {
      console.error('Error getting transactions:', error);
      transactionsCache = [];
      return [];
    }
  }

  static async getTransactionsByCustomerId(customerId: string): Promise<Transaction[]> {
    try {
      const realm = await getRealm();
      const transactions = realm.objects('Transaction')
        .filtered('customerId == $0', customerId);
      
      return Array.from(transactions).map(t => ({
        ...this.toPlainObject<Transaction>(t),
        entries: this.listToArray<TransactionEntry>((t as any).entries)
      }));
    } catch (error) {
      console.error('Error getting transactions by customer ID:', error);
      return [];
    }
  }

  static async saveTransaction(
    customer: Customer,
    entries: TransactionEntry[],
    receivedAmount: number = 0,
    existingTransactionId?: string,
    discountExtraAmount: number = 0
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Validate input
      if (!customer || !entries || entries.length === 0) {
        return { success: false, error: 'Invalid customer or entries data' };
      }

      const now = new Date().toISOString();
      const isUpdate = !!existingTransactionId;

      // Calculate totals
      const { netAmount, subtotal } = this.calculateTransactionTotals(entries);

      // Check if this is a money-only transaction
      const isMoneyOnlyTransaction = entries.every(entry => entry.type === 'money');

      // Final balance calculation (from MERCHANT's perspective):
      let finalBalance: number;
      if (isMoneyOnlyTransaction) {
        finalBalance = netAmount;
      } else {
        finalBalance = netAmount >= 0
          ? netAmount - receivedAmount - discountExtraAmount
          : receivedAmount - Math.abs(netAmount) - discountExtraAmount;
        finalBalance *= -1;
      }

      let transaction: Transaction;
      let previousAmountPaid = 0;
      let oldBalanceEffect = 0;

      if (isUpdate) {
        // UPDATE existing transaction
        const existingTransaction = await this.getTransactionById(existingTransactionId);
        
        if (!existingTransaction) {
          return { success: false, error: 'Transaction not found' };
        }

        previousAmountPaid = existingTransaction.lastGivenMoney;
        
        // Calculate old transaction's balance effect
        const isOldMetalOnly = existingTransaction.entries.some((entry: TransactionEntry) => entry.metalOnly === true);
        if (!isOldMetalOnly) {
          const oldNetAmount = existingTransaction.total;
          const oldReceivedAmount = existingTransaction.amountPaid;
          oldBalanceEffect = oldNetAmount >= 0 
            ? oldReceivedAmount - oldNetAmount - existingTransaction.discountExtraAmount
            : Math.abs(oldNetAmount) - oldReceivedAmount - existingTransaction.discountExtraAmount;
        }
        
        // REVERSE old metal balances
        if (existingTransaction.entries.some((entry: TransactionEntry) => entry.metalOnly === true)) {
          existingTransaction.entries.forEach(oldEntry => {
            if (oldEntry.metalOnly && oldEntry.type !== 'money') {
              const itemType = oldEntry.itemType;
              let metalAmount = 0;

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
                metalAmount = oldEntry.weight || 0;
                metalAmount = oldEntry.type === 'sell' ? -metalAmount : metalAmount;
              }

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
        
        // Handle stock management
        try {
          for (const entry of mappedEntries) {
            if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              const touch = entry.touch || 100;
              const result = await RaniRupaStockService.addStock(entry.itemType, entry.weight || 0, touch);
              if (result.success && result.stock_id) {
                entry.stock_id = result.stock_id;
              } else {
                console.error(`[STOCK] Failed to add stock: ${result.error}`);
              }
            } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu') && entry.stock_id) {
              const removeResult = await RaniRupaStockService.removeStock(entry.stock_id);
              if (!removeResult.success) {
                console.error(`[STOCK] Failed to remove stock for sale: ${removeResult.error}`);
              }
            }
          }
        } catch (stockError) {
          console.error('[STOCK] Error managing stock for update:', stockError);
          return { success: false, error: 'Error managing stock' };
        }
        
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

        const realm = await getRealm();
        realm.write(() => {
          realm.create('Transaction', transaction, Realm.UpdateMode.Modified);
        });
        this.clearCache();
      } else {
        // CREATE new transaction
        const transactionId = `txn_${Date.now()}`;
        
        let deviceId = await SecureStore.getItemAsync('device_id');
        if (!deviceId) {
          deviceId = `device_${Date.now()}`;
          await SecureStore.setItemAsync('device_id', deviceId);
        }

        const mappedEntries = entries.map(e => ({ ...e, createdAt: now, lastUpdatedAt: now }));

        // Handle stock management
        try {
          for (const entry of mappedEntries) {
            if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              const touch = entry.touch || 100;
              const result = await RaniRupaStockService.addStock(entry.itemType, entry.weight || 0, touch);
              if (result.success && result.stock_id) {
                entry.stock_id = result.stock_id;
              } else {
                console.error(`[STOCK] Failed to add stock: ${result.error}`);
              }
            } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu') && entry.stock_id) {
              const removeResult = await RaniRupaStockService.removeStock(entry.stock_id);
              if (!removeResult.success) {
                console.error(`[STOCK] Failed to remove stock for sale: ${removeResult.error}`);
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
          date: now,
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

        const realm = await getRealm();
        realm.write(() => {
          realm.create('Transaction', transaction);
        });
        this.clearCache();
      }

      // Calculate the delta amount for ledger entry
      const deltaAmount = receivedAmount - previousAmountPaid;
      
      const isMoneyOnly = entries.some(entry => entry.type === 'money');
      
      if (deltaAmount !== 0 || isMoneyOnly) {
        const ledgerDelta = isMoneyOnly && deltaAmount === 0 ? netAmount : deltaAmount;
        await this.createLedgerEntry(transaction, ledgerDelta, now);
      }

      // Check if any entry is metal-only
      const isMetalOnly = entries.some((entry: TransactionEntry) => entry.metalOnly === true);

      // Update customer balance
      let newBalance = customer.balance;
      if (!isMetalOnly) {
        newBalance = customer.balance - oldBalanceEffect + finalBalance;
      }

      const updatedCustomer: Customer = {
        ...customer,
        balance: newBalance,
        lastTransaction: now,
        metalBalances: customer.metalBalances || {},
      };

      // Apply NEW metal balances for metal-only entries
      if (isMetalOnly) {
        entries.forEach(entry => {
          if (entry.metalOnly && entry.type !== 'money') {
            const itemType = entry.itemType;
            let metalAmount = 0;

            if (entry.itemType === 'rani') {
              metalAmount = entry.pureWeight || 0;
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
            } else if (entry.itemType === 'rupu') {
              if (entry.rupuReturnType === 'silver' && entry.netWeight !== undefined) {
                metalAmount = entry.netWeight;
              } else {
                metalAmount = entry.pureWeight || 0;
                metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
              }
            } else {
              metalAmount = entry.weight || 0;
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
            }

            if (!updatedCustomer.metalBalances) {
              updatedCustomer.metalBalances = {};
            }
            const currentBalance = updatedCustomer.metalBalances[itemType as keyof typeof updatedCustomer.metalBalances] || 0;
            updatedCustomer.metalBalances[itemType as keyof typeof updatedCustomer.metalBalances] = currentBalance + metalAmount;
          }
        });
      }

      await this.saveCustomer(updatedCustomer);

      // Calculate and log inventory (keeping original logic)
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

      allTransactions.forEach(trans => {
        trans.entries.forEach(entry => {
          if (entry.type === 'money') {
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
        const transactionHasMoneyEntry = trans.entries.some(e => e.type === 'money');
        if (!transactionHasMoneyEntry) {
          if (trans.total >= 0) {
            inventoryBefore.money += trans.amountPaid;
          } else {
            inventoryBefore.money -= trans.amountPaid;
          }
        }
      });

      // Apply rounding
      inventoryBefore.gold999 = this.roundInventoryValue(inventoryBefore.gold999, 'gold999');
      inventoryBefore.gold995 = this.roundInventoryValue(inventoryBefore.gold995, 'gold995');
      inventoryBefore.rani = this.roundInventoryValue(inventoryBefore.rani, 'rani');
      inventoryBefore.silver = this.roundInventoryValue(inventoryBefore.silver, 'silver');
      inventoryBefore.rupu = this.roundInventoryValue(inventoryBefore.rupu, 'rupu');
      inventoryBefore.money = this.roundInventoryValue(inventoryBefore.money, 'money');

      // Update settings
      const realm = await getRealm();
      realm.write(() => {
        realm.create('Settings', { id: 'default', lastTransactionId: transaction.id }, Realm.UpdateMode.Modified);
      });

      return { success: true, transactionId: transaction.id };
    } catch (error) {
      console.error('Error saving transaction:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getTransactionById(id: string): Promise<Transaction | null> {
    try {
      const realm = await getRealm();
      const transaction = realm.objectForPrimaryKey('Transaction', id);
      
      if (!transaction) return null;
      
      return {
        ...this.toPlainObject<Transaction>(transaction),
        entries: this.listToArray<TransactionEntry>((transaction as any).entries)
      };
    } catch (error) {
      console.error('Error getting transaction by ID:', error);
      return null;
    }
  }

  // Utility functions
  private static calculateTransactionTotals(entries: TransactionEntry[]) {
    let netMoneyFlow = 0;

    entries.forEach(entry => {
      netMoneyFlow += entry.subtotal;
    });

    const subtotal = entries.reduce((sum, entry) => sum + Math.abs(entry.subtotal), 0);

    return { 
      totalGive: netMoneyFlow < 0 ? Math.abs(netMoneyFlow) : 0, 
      totalTake: netMoneyFlow > 0 ? netMoneyFlow : 0, 
      netAmount: netMoneyFlow,
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
      const realm = await getRealm();
      
      realm.write(() => {
        // Import customers
        data.customers.forEach(customer => {
          realm.create('Customer', customer, Realm.UpdateMode.Modified);
        });
        
        // Import transactions
        data.transactions.forEach(transaction => {
          realm.create('Transaction', transaction, Realm.UpdateMode.Modified);
        });
        
        // Import ledger
        if (data.ledger) {
          data.ledger.forEach(entry => {
            realm.create('LedgerEntry', entry, Realm.UpdateMode.Modified);
          });
        }
        
        // Import base inventory
        if (data.baseInventory) {
          realm.create('BaseInventory', { id: 'default', ...data.baseInventory }, Realm.UpdateMode.Modified);
        }
      });
      
      // Import Rani/Rupa stock (handled by RaniRupaStockService)
      if (data.raniRupaStock) {
        // Import each stock item individually
        for (const stock of data.raniRupaStock) {
          await RaniRupaStockService.addStock(stock.itemtype, stock.weight, stock.touch);
        }
      }
      
      this.clearCache();
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
      const realm = await getRealm();
      let inventory: any = realm.objectForPrimaryKey('BaseInventory', 'default');
      
      if (!inventory) {
        const defaultInventory = {
          id: 'default',
          gold999: 300,
          gold995: 100,
          silver: 10000,
          rani: 0,
          rupu: 0,
          money: 3000000
        };
        
        realm.write(() => {
          inventory = realm.create('BaseInventory', defaultInventory);
        });
      }
      
      return this.toPlainObject<any>(inventory);
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
      const openingEffects = await this.calculateOpeningBalanceEffects();

      const adjustedInventory = {
        id: 'default',
        gold999: inventory.gold999 - openingEffects.gold999,
        gold995: inventory.gold995 - openingEffects.gold995,
        silver: inventory.silver - openingEffects.silver,
        rani: inventory.rani - openingEffects.rani,
        rupu: inventory.rupu - openingEffects.rupu,
        money: inventory.money - openingEffects.money
      };

      const realm = await getRealm();
      realm.write(() => {
        realm.create('BaseInventory', adjustedInventory, Realm.UpdateMode.Modified);
      });
      
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
      const realm = await getRealm();
      
      realm.write(() => {
        // Delete all customers, transactions, and ledger entries
        realm.delete(realm.objects('Customer'));
        realm.delete(realm.objects('Transaction'));
        realm.delete(realm.objects('LedgerEntry'));
        
        // Reset settings
        const settings: any = realm.objectForPrimaryKey('Settings', 'default');
        if (settings) {
          settings.lastTransactionId = undefined;
          settings.lastTradeId = undefined;
        }
      });

      // Clear device ID from secure store
      try {
        await SecureStore.deleteItemAsync('device_id');
      } catch (error) {
        console.error('[CLEAR_DATA] Device ID not found in secure store (this is normal)');
      }

      // Clear Rani/Rupa stock
      await RaniRupaStockService.clearAllStock();

      this.clearCache();
      return true;
    } catch (error) {
      console.error('[CLEAR_DATA] Error clearing all data:', error);
      return false;
    }
  }

  // Delete transaction and reverse inventory changes
  static async deleteTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const transaction = await this.getTransactionById(transactionId);
      
      if (!transaction) {
        console.error(`[DELETE_TRANSACTION] Transaction not found: ${transactionId}`);
        return { success: false, error: 'Transaction not found' };
      }

      // Reverse customer balance changes
      const customer = await this.getCustomerById(transaction.customerId);
      if (customer) {
        const { netAmount } = this.calculateTransactionTotals(transaction.entries);
        
        const isMoneyOnlyTransaction = transaction.entries.every(entry => entry.type === 'money');
        
        let finalBalance: number;
        if (isMoneyOnlyTransaction) {
          finalBalance = -netAmount;
        } else {
          finalBalance = netAmount >= 0 
            ? netAmount - transaction.amountPaid - transaction.discountExtraAmount
            : transaction.amountPaid - Math.abs(netAmount) - transaction.discountExtraAmount;
          finalBalance *= -1;
        }
        
        const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
        
        customer.balance = isMetalOnly
          ? customer.balance
          : netAmount >= 0
            ? customer.balance + finalBalance
            : customer.balance - finalBalance;
        
        // Reverse metal balances
        for (const entry of transaction.entries) {
          if (entry.metalOnly) {
            const itemType = entry.itemType;
            const weight = entry.weight || 0;
            
            if (!customer.metalBalances) {
              customer.metalBalances = {} as any;
            }
            
            const currentBalance = (customer.metalBalances as any)[itemType] || 0;
            const balanceDelta = entry.type === 'sell' ? -weight : weight;
            (customer.metalBalances as any)[itemType] = currentBalance - balanceDelta;
          }
        }
        
        await this.saveCustomer(customer);
      }

      // Reverse stock changes
      try {
        for (const entry of transaction.entries) {
          if (entry.stock_id) {
            if (entry.type === 'purchase' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              const removeResult = await RaniRupaStockService.removeStock(entry.stock_id);
              if (!removeResult.success) {
                console.error(`[STOCK_DELETE] Failed to remove stock for purchase reversal: ${removeResult.error}`);
              }
            } else if (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu')) {
              const touch = entry.touch || 100;
              const addResult = await RaniRupaStockService.addStock(entry.itemType, entry.weight || 0, touch);
              if (!(addResult.success && addResult.stock_id)) {
                console.error(`[STOCK_DELETE] Failed to add back stock for sale reversal: ${addResult.error}`);
              }
            }
          }
        }
      } catch (stockError) {
        console.error('[STOCK_DELETE] Error reversing stock changes:', stockError);
      }

      // Delete from Realm
      const realm = await getRealm();
      realm.write(() => {
        // Remove ledger entries
        const ledgerEntries = realm.objects('LedgerEntry')
          .filtered('transactionId == $0', transactionId);
        realm.delete(ledgerEntries);
        
        // Remove transaction
        const transactionObj = realm.objectForPrimaryKey('Transaction', transactionId);
        if (transactionObj) {
          realm.delete(transactionObj);
        }
      });
      
      this.clearCache();
      return { success: true };
    } catch (error) {
      console.error('Error deleting transaction:', error);
      return { success: false, error: 'Failed to delete transaction' };
    }
  }

  // Settings operations
  static async getAutoBackupEnabled(): Promise<boolean> {
    try {
      const realm = await getRealm();
      let settings: any = realm.objectForPrimaryKey('Settings', 'default');
      
      if (!settings) {
        realm.write(() => {
          settings = realm.create('Settings', { id: 'default' });
        });
      }
      
      return settings?.autoBackupEnabled || false;
    } catch (error) {
      console.error('Error getting auto backup enabled:', error);
      return false;
    }
  }

  static async setAutoBackupEnabled(enabled: boolean): Promise<boolean> {
    try {
      const realm = await getRealm();
      realm.write(() => {
        realm.create('Settings', { id: 'default', autoBackupEnabled: enabled }, Realm.UpdateMode.Modified);
      });
      return true;
    } catch (error) {
      console.error('Error setting auto backup enabled:', error);
      return false;
    }
  }

  static async getStoragePermissionGranted(): Promise<boolean> {
    try {
      const realm = await getRealm();
      const settings: any = realm.objectForPrimaryKey('Settings', 'default');
      return settings?.storagePermissionGranted || false;
    } catch (error) {
      console.error('Error getting storage permission granted:', error);
      return false;
    }
  }

  static async setStoragePermissionGranted(granted: boolean): Promise<boolean> {
    try {
      const realm = await getRealm();
      realm.write(() => {
        realm.create('Settings', { id: 'default', storagePermissionGranted: granted }, Realm.UpdateMode.Modified);
      });
      return true;
    } catch (error) {
      console.error('Error setting storage permission granted:', error);
      return false;
    }
  }

  static async getLastBackupTime(): Promise<number | null> {
    try {
      const realm = await getRealm();
      const settings: any = realm.objectForPrimaryKey('Settings', 'default');
      return settings?.lastBackupTime || null;
    } catch (error) {
      console.error('Error getting last backup time:', error);
      return null;
    }
  }

  static async setLastBackupTime(time: number): Promise<boolean> {
    try {
      const realm = await getRealm();
      realm.write(() => {
        realm.create('Settings', { id: 'default', lastBackupTime: time }, Realm.UpdateMode.Modified);
      });
      return true;
    } catch (error) {
      console.error('Error setting last backup time:', error);
      return false;
    }
  }
}

// Export storage keys for backward compatibility (not used in Realm version)
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
