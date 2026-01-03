import { Customer } from '../types';
import { DatabaseService } from './database.sqlite';

export class CustomerService {
  // Get all customers
  static async getAllCustomers(): Promise<Customer[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Optimized query with JOIN
      const rows = await DatabaseService.getAllAsyncBatch<{
        id: string;
        name: string;
        lastTransaction: string | null;
        avatar: string | null;
        balance: number | null;
        gold999: number | null;
        gold995: number | null;
        silver: number | null;
        last_gold999_lock_date: number | null;
        last_gold995_lock_date: number | null;
        last_silver_lock_date: number | null;
      }>(`
        SELECT c.id, c.name, c.lastTransaction, c.avatar, 
               cb.balance, cb.gold999, cb.gold995, cb.silver,
               cb.last_gold999_lock_date, cb.last_gold995_lock_date, cb.last_silver_lock_date
        FROM customers c
        LEFT JOIN customer_balances cb ON c.id = cb.customer_id
        ORDER BY c.name ASC
      `);

      return rows.map(row => ({
        id: row.id,
        name: row.name.trim(),
        lastTransaction: row.lastTransaction || undefined,
        avatar: row.avatar || undefined,
        balance: row.balance || 0,
        metalBalances: {
          gold999: row.gold999 || 0,
          gold995: row.gold995 || 0,
          silver: row.silver || 0,
        },
        last_gold999_lock_date: row.last_gold999_lock_date || 0,
        last_gold995_lock_date: row.last_gold995_lock_date || 0,
        last_silver_lock_date: row.last_silver_lock_date || 0,
      }));
    } catch (error) {
      console.error('Error getting customers:', error);
      return [];
    }
  }

  // Search customers by name (database-level filtering)
  static async searchCustomersByName(searchQuery: string): Promise<Customer[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Use LIKE for case-insensitive search
      const searchPattern = `%${searchQuery}%`;
      
      // Optimized query with JOIN
      const rows = await DatabaseService.getAllAsyncBatch<{
        id: string;
        name: string;
        lastTransaction: string | null;
        avatar: string | null;
        balance: number | null;
        gold999: number | null;
        gold995: number | null;
        silver: number | null;
        last_gold999_lock_date: number | null;
        last_gold995_lock_date: number | null;
        last_silver_lock_date: number | null;
      }>(`
        SELECT c.id, c.name, c.lastTransaction, c.avatar, 
               cb.balance, cb.gold999, cb.gold995, cb.silver,
               cb.last_gold999_lock_date, cb.last_gold995_lock_date, cb.last_silver_lock_date
        FROM customers c
        LEFT JOIN customer_balances cb ON c.id = cb.customer_id
        WHERE c.name LIKE ?
        ORDER BY c.name ASC
      `, [searchPattern]);

      return rows.map(row => ({
        id: row.id,
        name: row.name.trim(),
        lastTransaction: row.lastTransaction || undefined,
        avatar: row.avatar || undefined,
        balance: row.balance || 0,
        metalBalances: {
          gold999: row.gold999 || 0,
          gold995: row.gold995 || 0,
          silver: row.silver || 0,
        },
        last_gold999_lock_date: row.last_gold999_lock_date || 0,
        last_gold995_lock_date: row.last_gold995_lock_date || 0,
        last_silver_lock_date: row.last_silver_lock_date || 0,
      }));
    } catch (error) {
      console.error('Error searching customers:', error);
      return [];
    }
  }

  // Save or update customer
  static async saveCustomer(customer: Customer): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Ensure customer name is trimmed
      const trimmedName = customer.name.trim();

      // Check if customer exists
      const existing = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM customers WHERE id = ?',
        [customer.id]
      );

      if (existing) {
        // Update existing customer
        await db.runAsync(
          'UPDATE customers SET lastTransaction = ? WHERE id = ?',
          [customer.lastTransaction || null, customer.id]
        );

        // Update balances
        await db.runAsync(
          `UPDATE customer_balances 
           SET balance = ?, gold999 = ?, gold995 = ?, silver = ? 
           WHERE customer_id = ?`,
          [
            customer.balance,
            customer.metalBalances?.gold999 || 0,
            customer.metalBalances?.gold995 || 0,
            customer.metalBalances?.silver || 0,
            customer.id
          ]
        );
      } else {
        // Insert new customer
        await db.runAsync(
          'INSERT INTO customers (id, name, lastTransaction, avatar) VALUES (?, ?, ?, ?)',
          [customer.id, trimmedName, customer.lastTransaction || null, customer.avatar || null]
        );

        // Insert balances
        await db.runAsync(
          `INSERT INTO customer_balances (customer_id, balance, gold999, gold995, silver) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            customer.id,
            customer.balance,
            customer.metalBalances?.gold999 || 0,
            customer.metalBalances?.gold995 || 0,
            customer.metalBalances?.silver || 0
          ]
        );
      }

      return true;
    } catch (error) {
      console.error('Error saving customer:', error);
      return false;
    }
  }

  // Get customer by name
  static async getCustomerByName(name: string): Promise<Customer | null> {
    try {
      const db = DatabaseService.getDatabase();

      const customer = await db.getFirstAsync<{
        id: string;
        name: string;
        lastTransaction: string | null;
        avatar: string | null;
      }>('SELECT id, name, lastTransaction, avatar FROM customers WHERE name = ?', [name]);

      if (!customer) return null;

      const balanceRow = await db.getFirstAsync<{
        balance: number;
        gold999: number | null;
        gold995: number | null;
        silver: number | null;
      }>('SELECT balance, gold999, gold995, silver FROM customer_balances WHERE customer_id = ?', [customer.id]);

      return {
        id: customer.id,
        name: customer.name.trim(),
        lastTransaction: customer.lastTransaction || undefined,
        avatar: customer.avatar || undefined,
        balance: balanceRow?.balance || 0,
        metalBalances: {
          gold999: balanceRow?.gold999 || 0,
          gold995: balanceRow?.gold995 || 0,
          silver: balanceRow?.silver || 0,
        }
      };
    } catch (error) {
      console.error('Error getting customer by name:', error);
      return null;
    }
  }

  // Get customer by ID
  static async getCustomerById(id: string): Promise<Customer | null> {
    try {
      const db = DatabaseService.getDatabase();

      const customer = await db.getFirstAsync<{
        id: string;
        name: string;
        lastTransaction: string | null;
        avatar: string | null;
      }>('SELECT id, name, lastTransaction, avatar FROM customers WHERE id = ?', [id]);

      if (!customer) return null;

      const balanceRow = await db.getFirstAsync<{
        balance: number;
        gold999: number | null;
        gold995: number | null;
        silver: number | null;
        last_gold999_lock_date: number | null;
        last_gold995_lock_date: number | null;
        last_silver_lock_date: number | null;
      }>('SELECT balance, gold999, gold995, silver, last_gold999_lock_date, last_gold995_lock_date, last_silver_lock_date FROM customer_balances WHERE customer_id = ?', [id]);

      return {
        id: customer.id,
        name: customer.name.trim(),
        lastTransaction: customer.lastTransaction || undefined,
        avatar: customer.avatar || undefined,
        balance: balanceRow?.balance || 0,
        metalBalances: {
          gold999: balanceRow?.gold999 || 0,
          gold995: balanceRow?.gold995 || 0,
          silver: balanceRow?.silver || 0,
        },
        last_gold999_lock_date: balanceRow?.last_gold999_lock_date || 0,
        last_gold995_lock_date: balanceRow?.last_gold995_lock_date || 0,
        last_silver_lock_date: balanceRow?.last_silver_lock_date || 0,
      };
    } catch (error) {
      console.error('Error getting customer by ID:', error);
      return null;
    }
  }

  // Update customer balance
  static async updateCustomerBalance(customerId: string, newBalance: number): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync(
        'UPDATE customer_balances SET balance = ? WHERE customer_id = ?',
        [newBalance, customerId]
      );

      return true;
    } catch (error) {
      console.error('Error updating customer balance:', error);
      return false;
    }
  }

  // Update customer metal balance
  static async updateCustomerMetalBalance(
    customerId: string,
    itemType: string,
    amount: number
  ): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();

      // Get current balance
      const currentRow = await db.getFirstAsync<{ [key: string]: number }>(
        `SELECT ${itemType} FROM customer_balances WHERE customer_id = ?`,
        [customerId]
      );

      const currentBalance = currentRow?.[itemType] || 0;
      const newBalance = currentBalance + amount;

      // Update balance
      await db.runAsync(
        `UPDATE customer_balances SET ${itemType} = ? WHERE customer_id = ?`,
        [newBalance, customerId]
      );

      return true;
    } catch (error) {
      console.error('Error updating customer metal balance:', error);
      return false;
    }
  }

  // Delete customer
  static async deleteCustomer(customerId: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Foreign key cascade will handle deleting balances and related records
      await db.runAsync('DELETE FROM customers WHERE id = ?', [customerId]);
      
      return true;
    } catch (error) {
      console.error('Error deleting customer:', error);
      return false;
    }
  }

  // Get all customers excluding specific names (database-level filtering)
  static async getAllCustomersExcluding(excludeNames: string[] = []): Promise<Customer[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      let query = 'SELECT id, name, lastTransaction, avatar FROM customers';
      let params: any[] = [];
      
      if (excludeNames.length > 0) {
        const placeholders = excludeNames.map(() => 'LOWER(TRIM(name)) != ?').join(' AND ');
        query += ` WHERE ${placeholders}`;
        params = excludeNames.map(name => name.toLowerCase().trim());
      }
      
      query += ' ORDER BY name ASC';
      
      const customers = await DatabaseService.getAllAsyncBatch<{
        id: string;
        name: string;
        lastTransaction: string | null;
        avatar: string | null;
      }>(query, params);

      const customersWithBalances: Customer[] = [];
      
      for (const customer of customers) {
        const balanceRow = await db.getFirstAsync<{
          balance: number;
          gold999: number | null;
          gold995: number | null;
          silver: number | null;
        }>('SELECT balance, gold999, gold995, silver FROM customer_balances WHERE customer_id = ?', [customer.id]);

        const customerObj: Customer = {
          id: customer.id,
          name: customer.name.trim(),
          lastTransaction: customer.lastTransaction || undefined,
          avatar: customer.avatar || undefined,
          balance: balanceRow?.balance || 0,
          metalBalances: {
            gold999: balanceRow?.gold999 || 0,
            gold995: balanceRow?.gold995 || 0,
            silver: balanceRow?.silver || 0,
          }
        };

        customersWithBalances.push(customerObj);
      }

      return customersWithBalances;
    } catch (error) {
      console.error('Error getting customers excluding names:', error);
      return [];
    }
  }

  // Search customers by name with limit and exclusions (database-level filtering)
  static async searchCustomers(
    searchQuery: string,
    excludeNames: string[] = [],
    limit: number = 50
  ): Promise<Customer[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Trim the search query to handle trailing spaces
      const trimmedQuery = searchQuery.trim();
      
      let query = 'SELECT id, name, lastTransaction, avatar FROM customers WHERE LOWER(name) LIKE ?';
      let params: any[] = [`%${trimmedQuery.toLowerCase()}%`];
      
      if (excludeNames.length > 0) {
        const placeholders = excludeNames.map(() => 'LOWER(TRIM(name)) != ?').join(' AND ');
        query += ` AND ${placeholders}`;
        params.push(...excludeNames.map(name => name.toLowerCase().trim()));
      }
      
      query += ' ORDER BY name ASC LIMIT ?';
      params.push(limit);
      
      const customers = await db.getAllAsync<{
        id: string;
        name: string;
        lastTransaction: string | null;
        avatar: string | null;
      }>(query, params);

      const customersWithBalances: Customer[] = [];
      
      for (const customer of customers) {
        const balanceRow = await db.getFirstAsync<{
          balance: number;
          gold999: number | null;
          gold995: number | null;
          silver: number | null;
        }>('SELECT balance, gold999, gold995, silver FROM customer_balances WHERE customer_id = ?', [customer.id]);

        const customerObj: Customer = {
          id: customer.id,
          name: customer.name.trim(),
          lastTransaction: customer.lastTransaction || undefined,
          avatar: customer.avatar || undefined,
          balance: balanceRow?.balance || 0,
          metalBalances: {
            gold999: balanceRow?.gold999 || 0,
            gold995: balanceRow?.gold995 || 0,
            silver: balanceRow?.silver || 0,
          }
        };

        customersWithBalances.push(customerObj);
      }

      return customersWithBalances;
    } catch (error) {
      console.error('Error searching customers:', error);
      return [];
    }
  }

  // Get recent customers by last transaction date (database-level filtering)
  static async getRecentCustomers(
    limit: number = 5,
    excludeNames: string[] = []
  ): Promise<Customer[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      let query = 'SELECT id, name, lastTransaction, avatar FROM customers WHERE lastTransaction IS NOT NULL';
      let params: any[] = [];
      
      if (excludeNames.length > 0) {
        const placeholders = excludeNames.map(() => 'LOWER(TRIM(name)) != ?').join(' AND ');
        query += ` AND ${placeholders}`;
        params = excludeNames.map(name => name.toLowerCase().trim());
      }
      
      query += ' ORDER BY lastTransaction DESC LIMIT ?';
      params.push(limit);
      
      const customers = await db.getAllAsync<{
        id: string;
        name: string;
        lastTransaction: string | null;
        avatar: string | null;
      }>(query, params);

      const customersWithBalances: Customer[] = [];
      
      for (const customer of customers) {
        const balanceRow = await db.getFirstAsync<{
          balance: number;
          gold999: number | null;
          gold995: number | null;
          silver: number | null;
          last_gold999_lock_date: number | null;
          last_gold995_lock_date: number | null;
          last_silver_lock_date: number | null;
        }>('SELECT balance, gold999, gold995, silver, last_gold999_lock_date, last_gold995_lock_date, last_silver_lock_date FROM customer_balances WHERE customer_id = ?', [customer.id]);

        const customerObj: Customer = {
          id: customer.id,
          name: customer.name.trim(),
          lastTransaction: customer.lastTransaction || undefined,
          avatar: customer.avatar || undefined,
          balance: balanceRow?.balance || 0,
          metalBalances: {
            gold999: balanceRow?.gold999 || 0,
            gold995: balanceRow?.gold995 || 0,
            silver: balanceRow?.silver || 0,
          },
          last_gold999_lock_date: balanceRow?.last_gold999_lock_date || 0,
          last_gold995_lock_date: balanceRow?.last_gold995_lock_date || 0,
          last_silver_lock_date: balanceRow?.last_silver_lock_date || 0,
        };

        customersWithBalances.push(customerObj);
      }

      return customersWithBalances;
    } catch (error) {
      console.error('Error getting recent customers:', error);
      return [];
    }
  }
}
