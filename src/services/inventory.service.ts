import { DatabaseService } from './database.sqlite';

export interface InventoryDelta {
  gold999: number;
  gold995: number;
  silver: number;
  rani: number;
  rupu: number;
  money: number;
}

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

  // Ensure a snapshot exists for the given date (Lazy Calculation)
  static async ensureSnapshotForDate(date: string): Promise<void> {
    const db = DatabaseService.getDatabase();
    
    // Check if snapshot already exists
    const existing = await db.getFirstAsync('SELECT date FROM daily_inventory_snapshots WHERE date = ?', [date]);
    if (existing) return;

    // Find the latest available snapshot before this date
    // This handles gaps (e.g., holidays) by finding the nearest last date with a snapshot
    const latestSnapshot = await db.getFirstAsync<{
      date: string;
      gold999: number;
      gold995: number;
      silver: number;
      rani: number;
      rupu: number;
      money: number;
    }>('SELECT * FROM daily_inventory_snapshots WHERE date < ? ORDER BY date DESC LIMIT 1', [date]);

    let openingBalance = {
      gold999: 0,
      gold995: 0,
      silver: 0,
      rani: 0,
      rupu: 0,
      money: 0
    };
    
    let startDate: string;

    if (latestSnapshot) {
      openingBalance = { ...latestSnapshot };
      startDate = latestSnapshot.date; // Start calculating from the day AFTER the snapshot
    } else {
      // No snapshot found, start from Base Inventory
      const base = await this.getBaseInventory();
      openingBalance = { ...base };
      startDate = '1970-01-01'; // Or some very old date, effectively start of time
    }

    // Calculate transactions between startDate (inclusive of startDate if it's a snapshot date) and target date (exclusive)
    // We need to sum up all transactions that happened AFTER the snapshot date and BEFORE the target date
    // Note: If startDate is '1970-01-01', we query all transactions < targetDate
    // If startDate is latestSnapshot.date, we query transactions >= latestSnapshot.date AND < targetDate
    // We use >= because the snapshot represents the Opening Balance of that date, so transactions ON that date must be added to reach the target date.

    // We need to calculate the net effect of transactions in the gap
    const gapEffects = await this.calculateTransactionEffectsInRange(startDate, date);

    // Apply effects to opening balance
    const newSnapshot = {
      gold999: openingBalance.gold999 + gapEffects.gold999,
      gold995: openingBalance.gold995 + gapEffects.gold995,
      silver: openingBalance.silver + gapEffects.silver,
      rani: openingBalance.rani + gapEffects.rani,
      rupu: openingBalance.rupu + gapEffects.rupu,
      money: openingBalance.money + gapEffects.money
    };

    // Insert the new snapshot
    await db.runAsync(
      `INSERT OR REPLACE INTO daily_inventory_snapshots 
       (date, gold999, gold995, silver, rani, rupu, money) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        date,
        newSnapshot.gold999,
        newSnapshot.gold995,
        newSnapshot.silver,
        newSnapshot.rani,
        newSnapshot.rupu,
        newSnapshot.money
      ]
    );
  }

  // Helper to calculate transaction effects in a date range (exclusive of end date)
  // startDate is inclusive (transactions >= startDate) if not 1970-01-01
  // endDate is exclusive (transactions < endDate)
  private static async calculateTransactionEffectsInRange(startDate: string, endDate: string): Promise<InventoryDelta> {
    const db = DatabaseService.getDatabase();
    const effects = {
      gold999: 0,
      gold995: 0,
      silver: 0,
      rani: 0,
      rupu: 0,
      money: 0
    };

    // We need to query ledger entries or transactions to get the effects
    // Using ledger_entries is better as it captures all money flows
    // Using ledger_entry_items captures all metal flows

    // Query for money effects
    // We want transactions that happened strictly AFTER startDate (if it's a real date) and BEFORE endDate
    // If startDate is '1970-01-01', we just check < endDate
    
    let dateCondition = 'le.date < ?';
    const params: any[] = [endDate];
    
    if (startDate !== '1970-01-01') {
      // Use >= to include transactions on the start date itself, as startDate comes from a snapshot which is an Opening Balance
      dateCondition = 'le.date >= ? AND le.date < ?';
      params.unshift(startDate);
    }

    const moneyEntries = await DatabaseService.getAllAsyncBatch<{
      amountReceived: number;
      amountGiven: number;
    }>(`
      SELECT le.amountReceived, le.amountGiven
      FROM ledger_entries le
      WHERE ${dateCondition} AND le.deleted_on IS NULL
    `, params);

    moneyEntries.forEach(entry => {
      effects.money += entry.amountReceived;
      effects.money -= entry.amountGiven;
    });

    // Query for metal effects
    // We need to join with ledger_entries to filter by date
    const items = await DatabaseService.getAllAsyncBatch<{
      type: string;
      itemType: string;
      weight: number | null;
      pureWeight: number | null;
      metalOnly: number;
    }>(`
      SELECT lei.type, lei.itemType, lei.weight, lei.pureWeight, lei.metalOnly
      FROM ledger_entry_items lei
      INNER JOIN ledger_entries le ON lei.ledger_entry_id = le.id
      WHERE ${dateCondition} AND le.deleted_on IS NULL
    `, params);

    items.forEach(item => {
      if (item.metalOnly === 1) {
        const weight = (item.itemType === 'rani' || item.itemType === 'rupu') 
          ? (item.pureWeight || 0) 
          : (item.weight || 0);
        
        const metalFlow = item.type === 'sell' ? -weight : weight;
        
        if (item.itemType === 'gold999') effects.gold999 += metalFlow;
        else if (item.itemType === 'gold995') effects.gold995 += metalFlow;
        else if (item.itemType === 'silver') effects.silver += metalFlow;
        else if (item.itemType === 'rani') effects.rani += metalFlow;
        else if (item.itemType === 'rupu') effects.rupu += metalFlow;
      }
    });

    return effects;
  }

  // Propagate inventory changes to future snapshots (Ripple Effect)
  static async propagateInventoryChange(date: string, changes: InventoryDelta): Promise<void> {
    const db = DatabaseService.getDatabase();
    
    // Update all snapshots strictly AFTER the transaction date
    // Because a change on Date T affects the Opening Balance of Date T+1, T+2, etc.
    await db.runAsync(
      `UPDATE daily_inventory_snapshots
       SET 
         gold999 = gold999 + ?,
         gold995 = gold995 + ?,
         silver = silver + ?,
         rani = rani + ?,
         rupu = rupu + ?,
         money = money + ?
       WHERE date > ?`,
      [
        changes.gold999,
        changes.gold995,
        changes.silver,
        changes.rani,
        changes.rupu,
        changes.money,
        date
      ]
    );
  }

  // Get inventory for a specific date (O(1) Read)
  // Returns the Opening Balance for that date
  static async getInventoryForDate(date: string): Promise<{
    gold999: number;
    gold995: number;
    silver: number;
    rani: number;
    rupu: number;
    money: number;
  }> {
    await this.ensureSnapshotForDate(date);
    
    const db = DatabaseService.getDatabase();
    const snapshot = await db.getFirstAsync<{
      gold999: number;
      gold995: number;
      silver: number;
      rani: number;
      rupu: number;
      money: number;
    }>('SELECT gold999, gold995, silver, rani, rupu, money FROM daily_inventory_snapshots WHERE date = ?', [date]);

    if (snapshot) {
      return snapshot;
    }

    // Fallback (should not happen due to ensureSnapshotForDate)
    return this.getBaseInventory();
  }

  // Calculate opening balance effects on inventory (Legacy / Fallback)
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
      
      // Get old base inventory to calculate delta
      const oldBase = await this.getBaseInventory();

      // Calculate delta
      const delta = {
        gold999: inventory.gold999 - oldBase.gold999,
        gold995: inventory.gold995 - oldBase.gold995,
        silver: inventory.silver - oldBase.silver,
        rani: inventory.rani - oldBase.rani,
        rupu: inventory.rupu - oldBase.rupu,
        money: inventory.money - oldBase.money
      };

      // Direct update of base inventory
      await db.runAsync(
        `UPDATE base_inventory 
         SET gold999 = ?, gold995 = ?, silver = ?, rani = ?, rupu = ?, money = ? 
         WHERE id = 1`,
        [
          inventory.gold999,
          inventory.gold995,
          inventory.silver,
          inventory.rani,
          inventory.rupu,
          inventory.money
        ]
      );

      // Update ALL existing snapshots with the delta
      // This ensures that changing base inventory propagates to all historical data immediately
      // without needing to delete and recalculate (which would be O(N))
      await db.runAsync(
        `UPDATE daily_inventory_snapshots
         SET 
           gold999 = gold999 + ?,
           gold995 = gold995 + ?,
           silver = silver + ?,
           rani = rani + ?,
           rupu = rupu + ?,
           money = money + ?`,
        [
          delta.gold999,
          delta.gold995,
          delta.silver,
          delta.rani,
          delta.rupu,
          delta.money
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
