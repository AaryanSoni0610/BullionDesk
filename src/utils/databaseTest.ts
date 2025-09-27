import { DatabaseService } from '../services/database';

export class DatabaseTestUtils {
  static async testDatabase() {
    console.log('=== Testing Database Functionality ===');
    
    try {
      // Test 1: Create a customer
      const testCustomer = {
        id: 'test_customer_123',
        name: 'Test Customer',
        balance: 0,
      };
      
      console.log('1. Creating customer:', testCustomer);
      const customerSaved = await DatabaseService.saveCustomer(testCustomer);
      console.log('   Customer saved:', customerSaved);
      
      // Test 2: Retrieve customers
      console.log('2. Retrieving all customers:');
      const customers = await DatabaseService.getAllCustomers();
      console.log('   Found customers:', customers.length);
      
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
      
      console.log('3. Creating transaction:');
      const transactionResult = await DatabaseService.saveTransaction(
        testCustomer,
        testEntries,
        50000
      );
      console.log('   Transaction result:', transactionResult);
      
      // Test 4: Retrieve transactions
      console.log('4. Retrieving transactions:');
      const transactions = await DatabaseService.getAllTransactions();
      console.log('   Found transactions:', transactions.length);
      
      // Test 5: Check updated customer
      console.log('5. Checking updated customer:');
      const updatedCustomer = await DatabaseService.getCustomerById(testCustomer.id);
      console.log('   Updated customer:', updatedCustomer);
      
    } catch (error) {
      console.error('Database test error:', error);
    }
    
    console.log('=== Database Test Complete ===');
  }
  
  static async clearTestData() {
    console.log('Clearing test data...');
    await DatabaseService.clearAllData();
    console.log('Test data cleared');
  }
}