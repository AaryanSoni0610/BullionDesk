import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Trade } from '../types';
import { DatabaseService } from './database.sqlite';
import { SettingsService } from './settings.service';

// Background task constants
const TRADE_CLEANUP_TASK = 'trade-cleanup-task';

// Define the background task for trade cleanup
TaskManager.defineTask(TRADE_CLEANUP_TASK, async () => {
  try {
    await TradeService.cleanupOldTrades();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Error in trade cleanup background task:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export class TradeService {
  // Get all trades
  static async getAllTrades(): Promise<Trade[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const trades = await DatabaseService.getAllAsyncBatch<{
        id: string;
        customerName: string;
        type: string;
        itemType: string;
        price: number;
        weight: number;
        date: string;
        createdAt: string;
      }>('SELECT * FROM trades ORDER BY createdAt DESC');

      return trades.map(trade => ({
        id: trade.id,
        customerName: trade.customerName,
        type: trade.type as 'sell' | 'purchase',
        itemType: trade.itemType as 'gold999' | 'gold995' | 'silver' | 'rani' | 'rupu',
        price: trade.price,
        weight: trade.weight,
        date: trade.date,
        createdAt: trade.createdAt,
      }));
    } catch (error) {
      console.error('Error getting trades:', error);
      return [];
    }
  }

  // Get trades by date range
  static async getTradesByDateRange(startDate: Date, endDate: Date): Promise<Trade[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const trades = await DatabaseService.getAllAsyncBatch<any>(
        'SELECT * FROM trades WHERE date >= ? AND date <= ? ORDER BY createdAt DESC',
        [startDate.toISOString(), endDate.toISOString()]
      );

      return trades.map((trade: any) => ({
        id: trade.id,
        customerName: trade.customerName,
        type: trade.type as 'sell' | 'purchase',
        itemType: trade.itemType as 'gold999' | 'gold995' | 'silver' | 'rani' | 'rupu',
        price: trade.price,
        weight: trade.weight,
        date: trade.date,
        createdAt: trade.createdAt,
      }));
    } catch (error) {
      console.error('Error getting trades by date range:', error);
      return [];
    }
  }

  // Add a new trade
  static async addTrade(trade: Omit<Trade, 'id' | 'createdAt'>): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      const tradeId = await this.generateTradeId();
      const createdAt = new Date().toISOString();

      await db.runAsync(
        'INSERT INTO trades (id, customerName, type, itemType, price, weight, date, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [tradeId, trade.customerName, trade.type, trade.itemType, trade.price, trade.weight, trade.date, createdAt]
      );

      // Clean up old trades (older than 7 days)
      await this.cleanupOldTrades();

      return true;
    } catch (error) {
      console.error('Error adding trade:', error);
      return false;
    }
  }

  // Update a trade
  static async updateTrade(tradeId: string, updates: Partial<Omit<Trade, 'id' | 'createdAt'>>): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      const updateFields: string[] = [];
      const params: any[] = [];

      if (updates.customerName !== undefined) {
        updateFields.push('customerName = ?');
        params.push(updates.customerName);
      }
      if (updates.type !== undefined) {
        updateFields.push('type = ?');
        params.push(updates.type);
      }
      if (updates.itemType !== undefined) {
        updateFields.push('itemType = ?');
        params.push(updates.itemType);
      }
      if (updates.price !== undefined) {
        updateFields.push('price = ?');
        params.push(updates.price);
      }
      if (updates.weight !== undefined) {
        updateFields.push('weight = ?');
        params.push(updates.weight);
      }
      if (updates.date !== undefined) {
        updateFields.push('date = ?');
        params.push(updates.date);
      }

      if (updateFields.length === 0) {
        return true; // Nothing to update
      }

      params.push(tradeId);

      await db.runAsync(
        `UPDATE trades SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );

      return true;
    } catch (error) {
      console.error('Error updating trade:', error);
      return false;
    }
  }

  // Delete a trade
  static async deleteTrade(tradeId: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync('DELETE FROM trades WHERE id = ?', [tradeId]);
      
      return true;
    } catch (error) {
      console.error('Error deleting trade:', error);
      return false;
    }
  }

  // Generate unique trade ID
  private static async generateTradeId(): Promise<string> {
    try {
      const lastId = await SettingsService.getSetting('last_trade_id');
      const nextId = lastId ? parseInt(lastId) + 1 : 1;
      await SettingsService.setSetting('last_trade_id', nextId.toString());
      return `trade_${nextId}`;
    } catch (error) {
      console.error('Error generating trade ID:', error);
      return `trade_${Date.now()}`;
    }
  }

  // Clean up trades older than 7 days
  static async cleanupOldTrades(): Promise<void> {
    try {
      const db = DatabaseService.getDatabase();
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      await db.runAsync(
        'DELETE FROM trades WHERE createdAt < ?',
        [sevenDaysAgo.toISOString()]
      );
    } catch (error) {
      console.error('Error cleaning up old trades:', error);
    }
  }

  // Clear all trades (for testing/debugging)
  static async clearAllTrades(): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync('DELETE FROM trades');
      await SettingsService.deleteSetting('last_trade_id');
      
      return true;
    } catch (error) {
      console.error('Error clearing trades:', error);
      return false;
    }
  }

  /**
   * Register the background trade cleanup task
   */
  static async registerBackgroundTask(): Promise<void> {
    try {
      // Register the task with BackgroundFetch
      await BackgroundFetch.registerTaskAsync(TRADE_CLEANUP_TASK, {
        minimumInterval: 6 * 60 * 60, // 6 hours in seconds
        stopOnTerminate: false, // Continue running after app terminates
        startOnBoot: true, // Start when device boots
      });
    } catch (error) {
      console.error('Error registering trade cleanup background task:', error);
    }
  }

  /**
   * Unregister the background trade cleanup task
   */
  static async unregisterBackgroundTask(): Promise<void> {
    try {
      await BackgroundFetch.unregisterTaskAsync(TRADE_CLEANUP_TASK);
    } catch (error) {
      console.error('Error unregistering trade cleanup background task:', error);
    }
  }
}
