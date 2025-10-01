import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer, Transaction, TransactionEntry } from '../types';

const STORAGE_KEYS = {
  CUSTOMERS: '@bulliondesk_customers',
  TRANSACTIONS: '@bulliondesk_transactions',
  LAST_TRANSACTION_ID: '@bulliondesk_last_transaction_id',
  BASE_INVENTORY: '@bulliondesk_base_inventory',
};

export class DatabaseService {
  // Customer operations
  static async getAllCustomers(): Promise<Customer[]> {
    try {
      const customersJson = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      const customers: Customer[] = customersJson ? JSON.parse(customersJson) : [];
      // Ensure all customer names are trimmed
      return customers.map(customer => ({ ...customer, name: customer.name.trim() }));
    } catch (error) {
      console.error('Error getting customers:', error);
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

  // Transaction operations
  static async getAllTransactions(): Promise<Transaction[]> {
    try {
      const transactionsJson = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      return transactionsJson ? JSON.parse(transactionsJson) : [];
    } catch (error) {
      console.error('Error getting transactions:', error);
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
    receivedAmount: number = 0
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Validate input
      if (!customer || !entries || entries.length === 0) {
        return { success: false, error: 'Invalid customer or entries data' };
      }

      // Calculate totals
      const { netAmount, subtotal } = this.calculateTransactionTotals(entries);
      // Final balance calculation (from MERCHANT's perspective):
      // Negative balance = Customer owes merchant (DEBT)
      // Positive balance = Merchant owes customer (CREDIT/BALANCE)
      // 
      // netAmount sign convention:
      //   Positive = SELL (money flows TO merchant, customer owes)
      //   Negative = PURCHASE (money flows FROM merchant, merchant owes)
      // 
      // Formula depends on transaction direction:
      //   SELL (netAmount > 0): finalBalance = receivedAmount - netAmount
      //     Example: receive ₹50k from ₹100k sale → 50k - 100k = -50k (customer debt)
      //   PURCHASE (netAmount < 0): finalBalance = |netAmount| - receivedAmount
      //     Example: pay ₹70k for ₹140k purchase → 140k - 70k = +70k (merchant debt)
      const finalBalance = netAmount >= 0 
        ? receivedAmount - netAmount           // SELL: customer payment reduces customer debt
        : Math.abs(netAmount) - receivedAmount; // PURCHASE: merchant payment reduces merchant debt

      // Generate transaction ID
      const transactionId = `txn_${Date.now()}`;

      // Create transaction object
      const transaction: Transaction = {
        id: transactionId,
        customerId: customer.id,
        customerName: customer.name.trim(),
        date: new Date().toISOString(),
        entries: entries,
        discount: 0,
        subtotal: Math.abs(subtotal),
        total: netAmount, // Keep the sign: positive = customer owes, negative = merchant owes
        amountPaid: receivedAmount,
        settlementType: finalBalance === 0 ? 'full' : finalBalance > 0 ? 'partial' : 'full',
        status: 'completed',
      };

      // Save transaction
      const transactions = await this.getAllTransactions();
      transactions.push(transaction);
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));

      // Check if any entry is metal-only
      const isMetalOnly = entries.some(entry => entry.metalOnly === true);

      // Update customer balance based on transaction type
      const updatedCustomer: Customer = {
        ...customer,
        balance: isMetalOnly ? customer.balance : customer.balance + finalBalance,
        lastTransaction: new Date().toISOString(),
        metalBalances: customer.metalBalances || {},
      };

      // Update metal balances for metal-only transactions
      if (isMetalOnly) {
        entries.forEach(entry => {
          if (entry.metalOnly && entry.type !== 'money') {
            const itemType = entry.itemType;
            let metalAmount = 0;

            // Determine metal balance change based on entry type and item
            if (entry.itemType === 'rani') {
              // Rani: use pure gold equivalent
              metalAmount = entry.pureWeight || 0;
              // Sell = customer owes merchant (negative), Purchase = merchant owes customer (positive)
              metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
            } else if (entry.itemType === 'rupu') {
              // Rupu: use pure silver equivalent
              if (entry.rupuReturnType === 'silver' && entry.netWeight !== undefined) {
                // For silver return, use net weight to determine direction
                metalAmount = entry.netWeight;
                // Net weight already has correct sign
              } else {
                // For money return or no return type
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
        console.warn('Transaction saved but customer update failed');
      }

      // Calculate current inventory for logging
      const allTransactions = await this.getAllTransactions();
      const baseInventory = await this.getBaseInventory();
      const currentInventory = {
        gold999: baseInventory.gold999,
        gold995: baseInventory.gold995,
        rani: baseInventory.rani,
        silver: baseInventory.silver,
        silver98: baseInventory.silver98,
        silver96: baseInventory.silver96,
        rupu: baseInventory.rupu,
        money: baseInventory.money,
      };

      // Update inventory based on all transactions
      allTransactions.forEach(trans => {
        trans.entries.forEach(entry => {
          if (entry.type === 'sell') {
            if (entry.itemType === 'rani') {
              currentInventory.rani -= entry.weight || 0;
              currentInventory.gold999 -= entry.actualGoldGiven || 0;
            } else if (entry.weight) {
              const weight = entry.pureWeight || entry.weight;
              if (entry.itemType in currentInventory) {
                currentInventory[entry.itemType as keyof typeof currentInventory] -= weight;
              }
            }
          } else if (entry.type === 'purchase') {
            if (entry.itemType === 'rupu' && entry.rupuReturnType === 'silver') {
              currentInventory.rupu += entry.weight || 0;
              currentInventory.silver98 -= entry.silver98Weight || 0;
              currentInventory.silver -= entry.silverWeight || 0;
            } else if (entry.weight) {
              const weight = entry.pureWeight || entry.weight;
              if (entry.itemType in currentInventory) {
                currentInventory[entry.itemType as keyof typeof currentInventory] += weight;
              }
            }
          }
        });
        // Update money inventory
        if (trans.total >= 0) {
          currentInventory.money += trans.amountPaid;
        } else {
          currentInventory.money -= trans.amountPaid;
        }
      });

      // Log inventory impact for debugging
      console.log('\n=== Transaction Saved - Inventory Impact ===');
      entries.forEach(entry => {
        console.log(`Entry: ${entry.type} ${entry.itemType}`);
        if (entry.type === 'sell') {
          if (entry.weight) {
            console.log(`  ${entry.itemType} out: ${entry.pureWeight || entry.weight}g`);
          }
        } else if (entry.type === 'purchase') {
          if (entry.itemType === 'rani') {
            console.log(`  Rani in: ${entry.weight}g (inward flow)`);
            console.log(`  Gold999 out: ${entry.actualGoldGiven || 0}g (return to customer)`);
          } else if (entry.itemType === 'rupu' && entry.rupuReturnType === 'silver') {
            console.log(`  Rupu in: ${entry.weight}g (inward flow)`);
            console.log(`  Silver98 out: ${entry.silver98Weight || 0}g (return to customer)`);
            console.log(`  Silver out: ${entry.silverWeight || 0}g (return to customer)`);
          } else if (entry.weight) {
            console.log(`  ${entry.itemType} in: ${entry.pureWeight || entry.weight}g (inward flow)`);
          }
        }
        console.log(`  Subtotal: ₹${entry.subtotal}`);
      });
      console.log(`Money flow: ${transaction.total >= 0 ? 'IN' : 'OUT'} ₹${transaction.amountPaid}`);
      console.log(`Customer balance: ${customer.balance} → ${updatedCustomer.balance}`);
      console.log('\n--- Current Inventory ---');
      console.log(`Gold 999: ${currentInventory.gold999.toFixed(3)}g`);
      console.log(`Gold 995: ${currentInventory.gold995.toFixed(3)}g`);
      console.log(`Rani: ${currentInventory.rani.toFixed(3)}g`);
      console.log(`Silver: ${currentInventory.silver.toFixed(1)}g`);
      console.log(`Silver 98: ${currentInventory.silver98.toFixed(1)}g`);
      console.log(`Silver 96: ${currentInventory.silver96.toFixed(1)}g`);
      console.log(`Rupu: ${currentInventory.rupu.toFixed(1)}g`);
      console.log(`Money: ₹${currentInventory.money.toLocaleString()}`);
      console.log('==========================================\n');

      // Update last transaction ID
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_TRANSACTION_ID, transactionId);

      console.log('Transaction saved successfully:', {
        transactionId,
        originalCustomer: customer,
        updatedCustomer,
        entries: entries.length,
        netAmount,
        finalBalance,
        receivedAmount,
        transaction,
        balanceCalculation: {
          oldBalance: customer.balance,
          transactionOwed: netAmount,
          customerPaid: receivedAmount,
          transactionResult: finalBalance,
          newBalance: updatedCustomer.balance,
          calculation: `${customer.balance} - (${finalBalance}) = ${updatedCustomer.balance}`
        }
      });

      return { success: true, transactionId };
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
    baseInventory: {
      gold999: number;
      gold995: number;
      silver: number;
      silver98: number;
      silver96: number;
      rani: number;
      rupu: number;
      money: number;
    };
  } | null> {
    try {
      const customers = await this.getAllCustomers();
      const transactions = await this.getAllTransactions();
      const baseInventory = await this.getBaseInventory();
      return { customers, transactions, baseInventory };
    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  }

  static async importData(data: {
    customers: Customer[];
    transactions: Transaction[];
    baseInventory?: {
      gold999: number;
      gold995: number;
      silver: number;
      silver98: number;
      silver96: number;
      rani: number;
      rupu: number;
      money: number;
    };
  }): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers));
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data.transactions));
      if (data.baseInventory) {
        await AsyncStorage.setItem(STORAGE_KEYS.BASE_INVENTORY, JSON.stringify(data.baseInventory));
      }
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
    silver98: number;
    silver96: number;
    rani: number;
    rupu: number;
    money: number;
  }> {
    try {
      const baseInventoryJson = await AsyncStorage.getItem(STORAGE_KEYS.BASE_INVENTORY);
      if (baseInventoryJson) {
        return JSON.parse(baseInventoryJson);
      }
      
      // Initialize with default values
      const defaultInventory = {
        gold999: 300,
        gold995: 100,
        silver: 10000,
        silver98: 20000,
        silver96: 5000,
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
        silver98: 20000,
        silver96: 5000,
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
    silver98: number;
    silver96: number;
    rani: number;
    rupu: number;
    money: number;
  }): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.BASE_INVENTORY, JSON.stringify(inventory));
      return true;
    } catch (error) {
      console.error('Error setting base inventory:', error);
      return false;
    }
  }

  // Clear all data (preserves base inventory)
  static async clearAllData(): Promise<boolean> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.CUSTOMERS,
        STORAGE_KEYS.TRANSACTIONS,
        STORAGE_KEYS.LAST_TRANSACTION_ID,
        // Note: BASE_INVENTORY is preserved - inventory will reset to base values
      ]);
      console.log('All data cleared successfully (base inventory preserved)');
      return true;
    } catch (error) {
      console.error('Error clearing all data:', error);
      return false;
    }
  }
}