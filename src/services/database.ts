import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer, Transaction, TransactionEntry } from '../types';

const STORAGE_KEYS = {
  CUSTOMERS: '@bulliondesk_customers',
  TRANSACTIONS: '@bulliondesk_transactions',
  LAST_TRANSACTION_ID: '@bulliondesk_last_transaction_id',
};

export class DatabaseService {
  // Customer operations
  static async getAllCustomers(): Promise<Customer[]> {
    try {
      const customersJson = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      return customersJson ? JSON.parse(customersJson) : [];
    } catch (error) {
      console.error('Error getting customers:', error);
      return [];
    }
  }

  static async saveCustomer(customer: Customer): Promise<boolean> {
    try {
      const customers = await this.getAllCustomers();
      const existingIndex = customers.findIndex(c => c.id === customer.id);
      
      if (existingIndex >= 0) {
        customers[existingIndex] = customer;
      } else {
        customers.push(customer);
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
      // Final balance calculation:
      // If netAmount > 0: customer owes merchant, so finalBalance = netAmount - receivedAmount
      // If netAmount < 0: merchant owes customer, so finalBalance = netAmount + receivedAmount
      const finalBalance = netAmount > 0 
        ? netAmount - receivedAmount  // Customer owes: positive = still owes, negative = overpaid
        : netAmount + receivedAmount; // Merchant owes: negative = still owes, positive = overpaid

      // Generate transaction ID
      const transactionId = `txn_${Date.now()}`;

      // Create transaction object
      const transaction: Transaction = {
        id: transactionId,
        customerId: customer.id,
        customerName: customer.name,
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

      // Update customer balance and last transaction
      // Current balance: positive = customer has credit, negative = customer owes us
      // finalBalance: positive = customer owes for this transaction, negative = customer gets credit from this transaction
      // New balance = old balance + credit from transaction = old balance - finalBalance
      const updatedCustomer: Customer = {
        ...customer,
        balance: customer.balance - finalBalance,
        lastTransaction: new Date().toISOString(),
      };

      const customerSaved = await this.saveCustomer(updatedCustomer);
      if (!customerSaved) {
        console.warn('Transaction saved but customer update failed');
      }

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
      if (entry.type === 'sell') {
        // Merchant sells: takes money (+)
        netMoneyFlow += Math.abs(entry.subtotal);
      } else if (entry.type === 'purchase') {
        // Merchant purchases: gives money (-)
        netMoneyFlow -= Math.abs(entry.subtotal);
      } else if (entry.type === 'money') {
        // Money transactions: debt = customer owes (+), balance = merchant owes (-)
        if (entry.moneyType === 'debt') {
          netMoneyFlow += Math.abs(entry.subtotal);
        } else {
          netMoneyFlow -= Math.abs(entry.subtotal);
        }
      }
    });

    const subtotal = entries.reduce((sum, entry) => sum + Math.abs(entry.subtotal), 0);

    return { 
      totalGive: netMoneyFlow < 0 ? Math.abs(netMoneyFlow) : 0, 
      totalTake: netMoneyFlow > 0 ? netMoneyFlow : 0, 
      netAmount: netMoneyFlow, // Positive = customer owes merchant, Negative = merchant owes customer
      subtotal 
    };
  }

  static async exportData(): Promise<{
    customers: Customer[];
    transactions: Transaction[];
  } | null> {
    try {
      const customers = await this.getAllCustomers();
      const transactions = await this.getAllTransactions();
      return { customers, transactions };
    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  }

  static async importData(data: {
    customers: Customer[];
    transactions: Transaction[];
  }): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers));
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data.transactions));
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }
}