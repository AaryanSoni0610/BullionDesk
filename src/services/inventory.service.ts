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
        money: number;
      }>('SELECT gold999, gold995, silver, money FROM base_inventory WHERE id = 1');

      if (inventory) {
        return {
          ...inventory,
          rani: 0,
          rupu: 0
        };
      }

      // Return default if not found
      return {
        gold999: 0,
        gold995: 0,
        silver: 0,
        rani: 0,
        rupu: 0,
        money: 0
      };
    } catch (error) {
      console.error('Error getting base inventory:', error);
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

  // Helper to get local YYYY-MM-DD string from ISO date or Date object
  private static getLocalDayString(dateInput: string | Date): string {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Get Opening Balance for a specific date (Read Strategy)
  static async getInventoryForDate(targetDate: string): Promise<{
    gold999: number;
    gold995: number;
    silver: number;
    rani: number;
    rupu: number;
    money: number;
  }> {
    const db = DatabaseService.getDatabase();

    // Step 1: Try to find exact match in daily_opening_balances
    const exactSnapshot = await db.getFirstAsync<{
      gold999: number;
      gold995: number;
      silver: number;
      rani: number;
      rupu: number;
      money: number;
    }>('SELECT gold999, gold995, silver, rani, rupu, money FROM daily_opening_balances WHERE date = ?', [targetDate]);

    if (exactSnapshot) {
      return exactSnapshot;
    }

    // Step 2: Gap Fallback - Find nearest previous snapshot
    const previousSnapshot = await db.getFirstAsync<{
      date: string;
      gold999: number;
      gold995: number;
      silver: number;
      rani: number;
      rupu: number;
      money: number;
    }>('SELECT * FROM daily_opening_balances WHERE date < ? ORDER BY date DESC LIMIT 1', [targetDate]);

    // If no previous snapshot, start from Base Inventory
    let currentBalance = previousSnapshot 
      ? { ...previousSnapshot } 
      : await this.getBaseInventory();
    
    // If we found a previous snapshot, we assume it's the valid opening balance for all subsequent days 
    // until the next transaction. Since we are recalculating the chain on every write, 
    // the "nearest previous snapshot" IS the correct opening balance for the target date 
    // (because if there were transactions in between, there would be a snapshot for the day after those transactions).
    
    // However, to be absolutely safe against gaps or partial rebuilds, we could fetch transactions 
    // between snapshot date and target date. But per the "Chain" logic, we should trust the chain.
    // The only case where this might be off is if the chain is broken.
    // For now, we return the nearest previous snapshot (or base) as the Opening Balance.
    
    return {
      gold999: currentBalance.gold999,
      gold995: currentBalance.gold995,
      silver: currentBalance.silver,
      rani: currentBalance.rani,
      rupu: currentBalance.rupu,
      money: currentBalance.money
    };
  }

  // The "Ripple" Rebuild: Recalculate balances from a specific date forward
  static async recalculateBalancesFrom(startDateStr?: string): Promise<void> {
    const db = DatabaseService.getDatabase();
    
    // 1. Identify Start State
    let currentBalance: {
      gold999: number;
      gold995: number;
      silver: number;
      rani: number;
      rupu: number;
      money: number;
    };
    
    let processingDate: Date;
    let startDayStr = '';

    if (startDateStr) {
      const dateObj = new Date(startDateStr);
      startDayStr = this.getLocalDayString(dateObj);

      currentBalance = await this.getInventoryForDate(startDayStr);
      processingDate = new Date(startDayStr);
    } else {
      currentBalance = await this.getBaseInventory();
      // Find the date of the very first transaction
      const firstTxn = await db.getFirstAsync<{ date: string }>(
        'SELECT min(date) as date FROM transactions WHERE deleted_on IS NULL'
      );
      if (firstTxn && firstTxn.date) {
        processingDate = new Date(firstTxn.date);
      } else {
        return; // No transactions
      }
    }

    // Reset time to midnight
    processingDate.setHours(0, 0, 0, 0);
    const startIso = processingDate.toISOString();

    // ---------------------------------------------------------
    // STREAM A: PHYSICAL INVENTORY (Metal/Stock)
    // Source: transaction_entries (Joined with transactions)
    // Logic: Physical items only move ONCE when the transaction happens.
    // ---------------------------------------------------------
    const metalRows = await DatabaseService.getAllAsyncBatch<{
      date: string;
      type: string;
      itemType: string;
      weight: number | null;
      pureWeight: number | null;
    }>(`
      SELECT 
        t.date, 
        te.type, 
        te.itemType, 
        te.weight, 
        te.pureWeight
      FROM transaction_entries te
      JOIN transactions t ON te.transaction_id = t.id
      WHERE t.date >= ? 
        AND t.deleted_on IS NULL 
        AND te.itemType != 'money'
      ORDER BY t.date ASC
    `, [startIso]);

    // ---------------------------------------------------------
    // STREAM B: FINANCIAL INVENTORY (Money)
    // Source 1: ledger_entries (Payments Received/Given)
    // Logic: Money moves multiple times (installments).
    // ---------------------------------------------------------
    const ledgerRows = await DatabaseService.getAllAsyncBatch<{
      date: string;
      type: string;
      amount: number;
    }>(`
      SELECT le.date, le.type, le.amount
      FROM ledger_entries le
      JOIN transactions t ON le.transactionId = t.id
      WHERE le.date >= ? 
        AND le.deleted_on IS NULL 
        AND t.deleted_on IS NULL
        AND le.itemType = 'money'
      ORDER BY le.date ASC
    `, [startIso]);

    // Source 2: transaction_entries (Direct Money Adjustments)
    const moneyItemRows = await DatabaseService.getAllAsyncBatch<{
      date: string;
      moneyType: string;
      amount: number;
    }>(`
      SELECT t.date, te.moneyType, te.amount
      FROM transaction_entries te
      JOIN transactions t ON te.transaction_id = t.id
      WHERE t.date >= ? 
        AND t.deleted_on IS NULL 
        AND te.itemType = 'money'
    `, [startIso]);

    // Source 3: Ghost Money Repair (Transactions with amountPaid but missing ledger)
    // This catches data from imports or manual edits where ledger might be desynced
    const txnPaymentRows = await DatabaseService.getAllAsyncBatch<{
      id: string;
      date: string;
      amountPaid: number;
    }>(`
      SELECT id, date, amountPaid
      FROM transactions 
      WHERE date >= ? AND deleted_on IS NULL AND amountPaid != 0
    `, [startIso]);

    // Get all transaction IDs that have ledger entries (to avoid double counting)
    const transactionsWithLedger = new Set<string>();
    const allLedgerRows = await DatabaseService.getAllAsyncBatch<{ transactionId: string }>(
      `SELECT DISTINCT transactionId FROM ledger_entries WHERE deleted_on IS NULL`
    );
    allLedgerRows.forEach(row => transactionsWithLedger.add(row.transactionId));

    // ---------------------------------------------------------
    // 3. MERGE & CALCULATE
    // ---------------------------------------------------------
    
    // Clear future snapshots to rebuild them
    if (startDateStr) {
      await db.runAsync('DELETE FROM daily_opening_balances WHERE date > ?', [startDateStr]);
    } else {
      await db.runAsync('DELETE FROM daily_opening_balances');
    }

    // Helper to group events by day
    const eventsByDay = new Map<string, {
      metals: typeof metalRows;
      ledger: typeof ledgerRows;
      moneyItems: typeof moneyItemRows;
      txnPayments: typeof txnPaymentRows;
    }>();

    const addEvent = (dateStr: string, type: 'metals' | 'ledger' | 'moneyItems' | 'txnPayments', item: any) => {
      const localDay = this.getLocalDayString(dateStr);
      if (!eventsByDay.has(localDay)) {
        eventsByDay.set(localDay, { metals: [], ledger: [], moneyItems: [], txnPayments: [] });
      }
      eventsByDay.get(localDay)![type].push(item);
    };

    metalRows.forEach(r => addEvent(r.date, 'metals', r));
    ledgerRows.forEach(r => addEvent(r.date, 'ledger', r));
    moneyItemRows.forEach(r => addEvent(r.date, 'moneyItems', r));
    txnPaymentRows.forEach(r => addEvent(r.date, 'txnPayments', r));

    const daysToProcess = Array.from(eventsByDay.keys()).sort();

    // Loop through days
    for (const day of daysToProcess) {
      // Skip days strictly before the start DAY (string comparison of YYYY-MM-DD)
      if (startDayStr && day < startDayStr) continue;

      const events = eventsByDay.get(day)!;

      // 1. Apply Metal Changes (From Transactions - Single Source of Truth)
      for (const row of events.metals) {
        const weight = Number((row.itemType === 'rani' || row.itemType === 'rupu') 
          ? (row.pureWeight || 0) 
          : (row.weight || 0));
        
        // Sell = Out (-), Purchase = In (+)
        const flow = row.type === 'sell' ? -weight : weight;
        
        if (row.itemType === 'gold999') currentBalance.gold999 += flow;
        else if (row.itemType === 'gold995') currentBalance.gold995 += flow;
        else if (row.itemType === 'silver') currentBalance.silver += flow;
        else if (row.itemType === 'rani') currentBalance.rani += flow;
        else if (row.itemType === 'rupu') currentBalance.rupu += flow;
      }

      // Ensure Rani/Rupu balances don't go negative (floating point errors or data inconsistencies)
      if (currentBalance.rani < 0) {
        currentBalance.rani = 0;
      }
      if (currentBalance.rupu < 0) {
        currentBalance.rupu = 0;
      }

      // 2. Apply Money Changes (From Ledger - Primary Source)
      let dailyMoneyChange = 0;
      
      // A. Ledger Entries
      for (const row of events.ledger) {
        if (row.type === 'receive') {
          dailyMoneyChange += Number(row.amount || 0);
        } else if (row.type === 'give') {
          dailyMoneyChange -= Number(row.amount || 0);
        }
      }

      // B. Money Items (Direct adjustments)
      for (const row of events.moneyItems) {
        if (row.moneyType === 'receive') dailyMoneyChange += Number(row.amount || 0);
        else dailyMoneyChange -= Number(row.amount || 0);
      }

      // C. Ghost Money Repair (Fallback)
      // If a transaction has amountPaid, but no corresponding ledger entry exists/sums up
      // This is crucial for imported data or glitches
      for (const txn of events.txnPayments) {
        if (!transactionsWithLedger.has(txn.id)) {
           dailyMoneyChange += Number(txn.amountPaid || 0);
        }
      }
      
      currentBalance.money += dailyMoneyChange;

      // 3. Save "Opening Balance" for the NEXT day
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = this.getLocalDayString(nextDay);

      await db.runAsync(
        `INSERT OR REPLACE INTO daily_opening_balances 
         (date, gold999, gold995, silver, rani, rupu, money) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          nextDayStr,
          currentBalance.gold999,
          currentBalance.gold995,
          currentBalance.silver,
          currentBalance.rani,
          currentBalance.rupu,
          currentBalance.money
        ]
      );
    }
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
        type: string;
        amount: number;
      }>(`
        SELECT le.type, le.amount
        FROM ledger_entries le
        WHERE le.deleted_on IS NULL AND le.itemType = 'money'
      `);

      moneyEntries.forEach(entry => {
        // receive = merchant receives money (inflow) = positive effect
        // give = merchant gives money (outflow) = negative effect
        if (entry.type === 'receive') {
          effects.money += entry.amount;
        } else if (entry.type === 'give') {
          effects.money -= entry.amount;
        }
      });

      // Calculate effects from transaction_entries table for item transactions
      // We use transaction_entries joined with transactions to avoid double counting from ledger updates
      const items = await DatabaseService.getAllAsyncBatch<{
        type: string;
        itemType: string;
        weight: number | null;
        pureWeight: number | null;
      }>(`
        SELECT te.type, te.itemType, te.weight, te.pureWeight
        FROM transaction_entries te
        JOIN transactions t ON te.transaction_id = t.id
        WHERE t.deleted_on IS NULL AND te.itemType != 'money'
      `);

      items.forEach(item => {
        // Metal entries affect metal balances
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
    money: number;
  }): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Direct update of base inventory
      await db.runAsync(
        `UPDATE base_inventory 
         SET gold999 = ?, gold995 = ?, silver = ?, money = ? 
         WHERE id = 1`,
        [
          inventory.gold999,
          inventory.gold995,
          inventory.silver,
          inventory.money
        ]
      );

      // Trigger full recalculation of the inventory chain from the beginning
      await this.recalculateBalancesFrom();

      return true;
    } catch (error) {
      console.error('Error setting base inventory:', error);
      return false;
    }
  }
}
