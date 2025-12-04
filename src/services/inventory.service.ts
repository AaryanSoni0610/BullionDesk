import { DatabaseService } from './database.sqlite';

export class InventoryService {

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
      const db = DatabaseService.getDatabase();
      
      const effects = {
        gold999: 0,
        gold995: 0,
        silver: 0,
        rani: 0,
        rupu: 0,
        money: 0
      };

      // Calculate money effects from ledger_entries (includes money-only transactions)
      const moneyEntries = await DatabaseService.getAllAsyncBatch<{
        amountReceived: number;
        amountGiven: number;
      }>(`
        SELECT le.amountReceived, le.amountGiven
        FROM ledger_entries le
        WHERE le.deleted_on IS NULL
      `);

      moneyEntries.forEach(entry => {
        // amountReceived = merchant receives money (inflow) = positive effect
        // amountGiven = merchant gives money (outflow) = negative effect
        effects.money += entry.amountReceived;
        effects.money -= entry.amountGiven;
      });

      // Calculate effects from ledger_entry_items table for item transactions
      const items = await DatabaseService.getAllAsyncBatch<{
        type: string;
        itemType: string;
        weight: number | null;
        pureWeight: number | null;
        subtotal: number;
        metalOnly: number;
      }>(`
        SELECT lei.type, lei.itemType, lei.weight, lei.pureWeight, lei.subtotal, lei.metalOnly
        FROM ledger_entry_items lei
        INNER JOIN ledger_entries le ON lei.ledger_entry_id = le.id
        WHERE le.deleted_on IS NULL
      `);

      items.forEach(item => {
        if (item.type === 'money') {
          // Money entries in items: subtotal represents money flow
          // This is already counted in ledger_entries above, so skip
          // (Money entries in items are legacy/redundant)
        } else if (item.metalOnly === 1) {
          // Metal-only entries affect metal balances
          const weight = (item.itemType === 'rani' || item.itemType === 'rupu') 
            ? (item.pureWeight || 0) 
            : (item.weight || 0);
          
          // Sell = merchant gives metal (outflow) = negative
          // Purchase = merchant receives metal (inflow) = positive
          const metalFlow = item.type === 'sell' ? -weight : weight;
          
          if (item.itemType === 'gold999') effects.gold999 += metalFlow;
          else if (item.itemType === 'gold995') effects.gold995 += metalFlow;
          else if (item.itemType === 'silver') effects.silver += metalFlow;
          else if (item.itemType === 'rani') effects.rani += metalFlow;
          else if (item.itemType === 'rupu') effects.rupu += metalFlow;
        }
        // Regular sell/purchase entries: money is already counted from ledger_entries
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
