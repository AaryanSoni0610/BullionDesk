import { DatabaseService } from './database.sqlite';

export interface RateCutRecord {
  id: string;
  customer_id: string;
  metal_type: 'gold999' | 'gold995' | 'silver';
  weight_cut: number;
  rate: number;
  total_amount: number;
  cut_date: number;
  created_at: string;
}

export class RateCutService {
  private static async ensureTableExists() {
    const db = DatabaseService.getDatabase();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS rate_cut_history (
        id TEXT PRIMARY KEY NOT NULL,
        customer_id TEXT NOT NULL,
        metal_type TEXT NOT NULL CHECK(metal_type IN ('gold999', 'gold995', 'silver')),
        weight_cut REAL NOT NULL,
        rate REAL NOT NULL,
        total_amount REAL NOT NULL,
        cut_date INTEGER NOT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rate_cut_history_customer_id ON rate_cut_history(customer_id);
    `);
  }

  static async applyRateCut(
    customerId: string,
    metalType: 'gold999' | 'gold995' | 'silver',
    weight: number,
    rate: number,
    cutDate: number // Unix timestamp
  ): Promise<boolean> {
    await this.ensureTableExists();
    const db = DatabaseService.getDatabase();
    
    // Calculate total money based on metal type
    let totalMoney = 0;
    if (metalType.includes('gold')) {
      // Gold rate is per 10g
      totalMoney = (weight / 10) * rate;
    } else if (metalType === 'silver') {
      // Silver rate is per 1kg (1000g)
      totalMoney = (weight / 1000) * rate;
    } else {
      // Fallback
      totalMoney = weight * rate;
    }

    const id = `rc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();

    try {
      await db.withTransactionAsync(async () => {
        // 1. Insert into rate_cut_history
        await db.runAsync(
          `INSERT INTO rate_cut_history (id, customer_id, metal_type, weight_cut, rate, total_amount, cut_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, customerId, metalType, weight, rate, totalMoney, cutDate, createdAt]
        );

        // 2. Update customer_balances
        // Decrease metal (Merchant owes less metal) -> If balance is positive (Merchant owes), decreasing it means subtracting.
        // "Metal Balance decreases (Merchant owes less metal)". So subtract weight.
        // "Money Balance increases (Merchant owes more money)". So add totalMoney.
        
        const metalColumn = metalType; 
        
        // Update lock date: MAX(current_lock, new_cut_date)
        let lockColumn = 'last_silver_lock_date';
        if (metalType === 'gold999') lockColumn = 'last_gold999_lock_date';
        else if (metalType === 'gold995') lockColumn = 'last_gold995_lock_date';

        await db.runAsync(
          `UPDATE customer_balances 
           SET ${metalColumn} = ${metalColumn} - ?,
               balance = balance + ?,
               ${lockColumn} = MAX(${lockColumn}, ?)
           WHERE customer_id = ?`,
          [weight, totalMoney, cutDate, customerId]
        );
      });
      return true;
    } catch (error) {
      console.error('Error applying rate cut:', error);
      return false;
    }
  }

  static async deleteLatestRateCut(
    cutId: string,
    customerId: string,
    metalType: 'gold999' | 'gold995' | 'silver'
  ): Promise<boolean> {
    const db = DatabaseService.getDatabase();

    try {
      await db.withTransactionAsync(async () => {
        // Get the cut details first to know what to reverse
        const cut = await db.getFirstAsync<RateCutRecord>(
          'SELECT * FROM rate_cut_history WHERE id = ?',
          [cutId]
        );

        if (!cut) throw new Error('Rate cut not found');

        // 1. Delete the record
        await db.runAsync('DELETE FROM rate_cut_history WHERE id = ?', [cutId]);

        // 2. Recalculate Lock
        const result = await db.getFirstAsync<{ max_date: number }>(
          `SELECT MAX(cut_date) as max_date FROM rate_cut_history 
           WHERE customer_id = ? AND metal_type = ?`,
          [customerId, metalType]
        );
        const newLockDate = result?.max_date || 0;

        // 3. Revert Balance
        // Decrease balance (Money)
        // Increase specific metal column
        const metalColumn = metalType;
        let lockColumn = 'last_silver_lock_date';
        if (metalType === 'gold999') lockColumn = 'last_gold999_lock_date';
        else if (metalType === 'gold995') lockColumn = 'last_gold995_lock_date';

        await db.runAsync(
          `UPDATE customer_balances 
           SET ${metalColumn} = ${metalColumn} + ?,
               balance = balance - ?,
               ${lockColumn} = ?
           WHERE customer_id = ?`,
          [cut.weight_cut, cut.total_amount, newLockDate, customerId]
        );
      });
      return true;
    } catch (error) {
      console.error('Error deleting rate cut:', error);
      return false;
    }
  }

  static async getRateCutHistory(customerId: string): Promise<RateCutRecord[]> {
    try {
      await this.ensureTableExists();
      const db = DatabaseService.getDatabase();
      return await db.getAllAsync<RateCutRecord>(
        'SELECT * FROM rate_cut_history WHERE customer_id = ? ORDER BY cut_date DESC, created_at DESC',
        [customerId]
      );
    } catch (error) {
      console.error('Error getting rate cut history:', error);
      return [];
    }
  }
}
