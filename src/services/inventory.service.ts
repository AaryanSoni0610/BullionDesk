import { DatabaseService } from './database.sqlite';
import { CustomerService } from './customer.service';

export class InventoryService {
  // Round inventory values based on item type
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

  // Get base inventory
  static async getBaseInventory(): Promise<{
    gold999: number;
    gold995: number;
    silver: number;
    rani: number;
    rupu: number;
    money: number;
  }> {
    try {
      const db = DatabaseService.getDatabase();
      
      const inventory = await db.getFirstAsync<{
        gold999: number;
        gold995: number;
        silver: number;
        rani: number;
        rupu: number;
        money: number;
      }>('SELECT gold999, gold995, silver, rani, rupu, money FROM base_inventory WHERE id = 1');

      if (inventory) {
        return inventory;
      }

      // Return default if not found
      return {
        gold999: 300,
        gold995: 100,
        silver: 10000,
        rani: 0,
        rupu: 0,
        money: 3000000
      };
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

  // Calculate opening balance effects on inventory
  static async calculateOpeningBalanceEffects(): Promise<{
    gold999: number;
    gold995: number;
    silver: number;
    rani: number;
    rupu: number;
    money: number;
  }> {
    try {
      const customers = await CustomerService.getAllCustomers();
      
      const effects = {
        gold999: 0,
        gold995: 0,
        silver: 0,
        rani: 0,
        rupu: 0,
        money: 0
      };

      customers.forEach(customer => {
        // Money balance: positive = customer has credit = merchant gave money (outflow)
        // negative = customer owes = merchant received money (inflow)
        effects.money -= customer.balance;

        // Metal balances: positive = merchant owes customer = merchant received metal (inflow)
        // negative = customer owes merchant = merchant gave metal (outflow)
        if (customer.metalBalances) {
          effects.gold999 -= customer.metalBalances.gold999 || 0;
          effects.gold995 -= customer.metalBalances.gold995 || 0;
          effects.silver -= customer.metalBalances.silver || 0;
          effects.rani -= customer.metalBalances.rani || 0;
          effects.rupu -= customer.metalBalances.rupu || 0;
        }
      });

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

  // Set base inventory
  static async setBaseInventory(inventory: {
    gold999: number;
    gold995: number;
    silver: number;
    rani: number;
    rupu: number;
    money: number;
  }): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Calculate opening balance effects
      const openingEffects = await this.calculateOpeningBalanceEffects();

      // Adjust base inventory based on opening balance effects
      const adjustedInventory = {
        gold999: inventory.gold999 - openingEffects.gold999,
        gold995: inventory.gold995 - openingEffects.gold995,
        silver: inventory.silver - openingEffects.silver,
        rani: inventory.rani - openingEffects.rani,
        rupu: inventory.rupu - openingEffects.rupu,
        money: inventory.money - openingEffects.money
      };

      await db.runAsync(
        `UPDATE base_inventory 
         SET gold999 = ?, gold995 = ?, silver = ?, rani = ?, rupu = ?, money = ? 
         WHERE id = 1`,
        [
          adjustedInventory.gold999,
          adjustedInventory.gold995,
          adjustedInventory.silver,
          adjustedInventory.rani,
          adjustedInventory.rupu,
          adjustedInventory.money
        ]
      );

      return true;
    } catch (error) {
      console.error('Error setting base inventory:', error);
      return false;
    }
  }

  // Reset base inventory to defaults
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
}
