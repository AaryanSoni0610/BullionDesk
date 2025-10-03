import { DatabaseService } from '../services/database';

export class DatabaseTestUtils {
  static async testDatabase() {
    
    try {
      // Test 1: Create a customer
      const testCustomer = {
        id: 'test_customer_123',
        name: 'Test Customer',
        balance: 0,
      };
      
      const customerSaved = await DatabaseService.saveCustomer(testCustomer);
      
      // Test 2: Retrieve customers
      const customers = await DatabaseService.getAllCustomers();
      
      // Test 3: Create a transaction
      const testEntries = [
        {
          id: 'entry_1',
          type: 'sell' as const,
          itemType: 'gold999' as const,
          weight: 10,
          price: 117800,
          subtotal: 117800,
        }
      ];
      
      const transactionResult = await DatabaseService.saveTransaction(
        testCustomer,
        testEntries,
        50000
      );
      
      // Test 4: Retrieve transactions
      const transactions = await DatabaseService.getAllTransactions();
      
      // Test 5: Check updated customer
      const updatedCustomer = await DatabaseService.getCustomerById(testCustomer.id);
      
    } catch (error) {
      console.error('Database test error:', error);
    }
    
  }
}