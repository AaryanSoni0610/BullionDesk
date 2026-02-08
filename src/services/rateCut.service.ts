import { formatMoney } from '../utils/formatting';
import { DatabaseService } from './database.sqlite';

export interface RateCutRecord {
  id: string;
  customer_id: string;
  customer_name?: string; // From JOIN with customers table
  metal_type: 'gold999' | 'gold995' | 'silver';
  weight_cut: number;
  rate: number;
  total_amount: number;
  cut_date: number;
  created_at: string;
  direction: 'sell' | 'purchase';
}

export class RateCutService {
  // Helper function to get available sell and purchase weights for a customer
  static async getAvailableWeights(
    customerId: string,
    metalType: 'gold999' | 'gold995' | 'silver'
  ): Promise<{ sellWeight: number; purchaseWeight: number }> {
    const db = DatabaseService.getDatabase();
    
    try {
      // 1. Get all metal-only transaction entries for this customer
      const entries = await db.getAllAsync<any>(
        `SELECT te.type, te.itemType, te.weight, te.pureWeight, te.cut
         FROM transaction_entries te
         JOIN transactions t ON te.transaction_id = t.id
         WHERE t.customerId = ? AND te.metalOnly = 1 AND t.deleted_on IS NULL`,
        [customerId]
      );

      let totalSellWeight = 0;
      let totalPurchaseWeight = 0;

      for (const entry of entries) {
        // Get the weight to use (pureWeight for rani/rupu, weight for others)
        const weight = (entry.itemType === 'rani' || entry.itemType === 'rupu')
          ? (entry.pureWeight || 0)
          : (entry.weight || 0);

        // Determine the actual metal type after rani/rupu conversion
        let actualMetalType = entry.itemType;
        if (entry.itemType === 'rani') {
          // Rani with cut -> Gold 999, without cut -> Gold 995
          actualMetalType = (entry.cut || 0) > 0 ? 'gold999' : 'gold995';
        } else if (entry.itemType === 'rupu') {
          // Rupu -> Silver
          actualMetalType = 'silver';
        }

        // Only count if it matches the requested metal type
        if (actualMetalType === metalType) {
          if (entry.type === 'sell') {
            totalSellWeight += weight;
          } else if (entry.type === 'purchase') {
            totalPurchaseWeight += weight;
          }
        }
      }

      // 2. Get already-used weights from rate_cut_history
      const usedResult = await db.getFirstAsync<any>(
        `SELECT 
          SUM(CASE WHEN direction = 'sell' THEN weight_cut ELSE 0 END) as usedSellWeight,
          SUM(CASE WHEN direction = 'purchase' THEN weight_cut ELSE 0 END) as usedPurchaseWeight
         FROM rate_cut_history
         WHERE customer_id = ? AND metal_type = ?`,
        [customerId, metalType]
      );

      const usedSellWeight = usedResult?.usedSellWeight || 0;
      const usedPurchaseWeight = usedResult?.usedPurchaseWeight || 0;

      // 3. Calculate available weights (total - used)
      const availableSellWeight = Math.max(0, Math.abs(totalSellWeight) - Math.abs(usedSellWeight));
      const availablePurchaseWeight = Math.max(0, Math.abs(totalPurchaseWeight) - Math.abs(usedPurchaseWeight));

      return {
        sellWeight: availableSellWeight,
        purchaseWeight: availablePurchaseWeight
      };
    } catch (error) {
      console.error('Error getting available weights:', error);
      return { sellWeight: 0, purchaseWeight: 0 };
    }
  }

  static async applyRateCut(
    customerId: string,
    metalType: 'gold999' | 'gold995' | 'silver',
    weight: number,
    rate: number,
    cutDate: number, // Unix timestamp
    direction: 'sell' | 'purchase'
  ): Promise<boolean> {
    const db = DatabaseService.getDatabase();
    
    // Calculate total money based on metal type (using absolute weight)
    let totalMoney = 0;
    const absWeight = Math.abs(weight);
    if (metalType.includes('gold')) {
      // Gold rate is per 10g
      totalMoney = (absWeight / 10) * rate;
    } else if (metalType === 'silver') {
      // Silver rate is per 1kg (1000g)
      totalMoney = (absWeight / 1000) * rate;
    } else {
      // Fallback
      totalMoney = absWeight * rate;
    }

    totalMoney = parseInt(formatMoney(totalMoney.toString()));

    const id = `rc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();

    try {
      await db.withTransactionAsync(async () => {
        // 1. Insert into rate_cut_history with direction
        await db.runAsync(
          `INSERT INTO rate_cut_history (id, customer_id, metal_type, weight_cut, rate, total_amount, cut_date, created_at, direction)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, customerId, metalType, weight, rate, totalMoney, cutDate, createdAt, direction]
        );

        // 2. Update customer_balances
        // Direction logic:
        // - Sell: merchant gives metal, customer should pay money -> decrease money balance (increase debt)
        // - Purchase: merchant receives metal, merchant should pay money -> increase money balance (credit)
        
        // Money balance change
        const moneyChange = direction === 'sell' ? -totalMoney : totalMoney;
        
        // Metal balance change
        // - Sell: merchant gives metal to customer -> increase customer's metal balance (positive)
        // - Purchase: merchant receives metal from customer -> decrease customer's metal balance (negative)
        const metalChange = direction === 'sell' ? weight : -weight;
        
        // Determine metal and lock columns
        let metalColumn = 'silver';
        let lockColumn = 'last_silver_lock_date';
        if (metalType === 'gold999') {
          metalColumn = 'gold999';
          lockColumn = 'last_gold999_lock_date';
        } else if (metalType === 'gold995') {
          metalColumn = 'gold995';
          lockColumn = 'last_gold995_lock_date';
        }

        await db.runAsync(
          `UPDATE customer_balances 
           SET balance = balance + ?,
               ${metalColumn} = COALESCE(${metalColumn}, 0) + ?,
               ${lockColumn} = MAX(${lockColumn}, ?)
           WHERE customer_id = ?`,
          [moneyChange, metalChange, cutDate, customerId]
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
        // Calculate reversal amounts based on stored direction
        // Money reversal: opposite of what was applied
        const moneyReversal = cut.direction === 'sell' ? cut.total_amount : -cut.total_amount;
        
        // Metal reversal: opposite of what was applied
        // If original was sell (added metal), now subtract it
        // If original was purchase (subtracted metal), now add it back
        const metalReversal = cut.direction === 'sell' ? -cut.weight_cut : cut.weight_cut;

        // Determine metal and lock columns
        let metalColumn = 'silver';
        let lockColumn = 'last_silver_lock_date';
        if (metalType === 'gold999') {
          metalColumn = 'gold999';
          lockColumn = 'last_gold999_lock_date';
        } else if (metalType === 'gold995') {
          metalColumn = 'gold995';
          lockColumn = 'last_gold995_lock_date';
        }

        await db.runAsync(
          `UPDATE customer_balances 
           SET balance = balance + ?,
               ${metalColumn} = COALESCE(${metalColumn}, 0) + ?,
               ${lockColumn} = ?
           WHERE customer_id = ?`,
          [moneyReversal, metalReversal, newLockDate, customerId]
        );
      });
      return true;
    } catch (error) {
      console.error('Error deleting rate cut:', error);
      return false;
    }
  }

  static async getRateCutHistory(customerId: string, limit = 50, offset = 0): Promise<RateCutRecord[]> {
    try {
      const db = DatabaseService.getDatabase();
      return await db.getAllAsync<RateCutRecord>(
        `SELECT rch.*, c.name as customer_name
         FROM rate_cut_history rch
         LEFT JOIN customers c ON rch.customer_id = c.id
         WHERE rch.customer_id = ? 
         ORDER BY rch.cut_date DESC, rch.created_at DESC 
         LIMIT ? OFFSET ?`,
        [customerId, limit, offset]
      );
    } catch (error) {
      console.error('Error getting rate cut history:', error);
      return [];
    }
  }

  static async getAllRateCutHistory(limit = 50, offset = 0): Promise<RateCutRecord[]> {
    try {
      const db = DatabaseService.getDatabase();
      return await db.getAllAsync<RateCutRecord>(
        `SELECT rch.*, c.name as customer_name
         FROM rate_cut_history rch
         LEFT JOIN customers c ON rch.customer_id = c.id
         ORDER BY rch.cut_date DESC, rch.created_at DESC 
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    } catch (error) {
      console.error('Error getting all rate cut history:', error);
      return [];
    }
  }
}