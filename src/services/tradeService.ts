import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Trade } from '../types';

const STORAGE_KEYS = {
  TRADES: '@bulliondesk_trades',
  LAST_TRADE_ID: '@bulliondesk_last_trade_id',
};

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
      const tradesJson = await AsyncStorage.getItem(STORAGE_KEYS.TRADES);
      const trades: Trade[] = tradesJson ? JSON.parse(tradesJson) : [];
      return trades;
    } catch (error) {
      console.error('Error getting trades:', error);
      return [];
    }
  }

  // Add a new trade
  static async addTrade(trade: Omit<Trade, 'id' | 'createdAt'>): Promise<boolean> {
    try {
      const trades = await this.getAllTrades();
      const newTrade: Trade = {
        ...trade,
        id: await this.generateTradeId(),
        createdAt: new Date().toISOString(),
      };

      trades.push(newTrade);
      await AsyncStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));

      // Clean up old trades (older than 7 days)
      await this.cleanupOldTrades();

      return true;
    } catch (error) {
      console.error('Error adding trade:', error);
      return false;
    }
  }

  // Generate unique trade ID
  private static async generateTradeId(): Promise<string> {
    try {
      const lastId = await AsyncStorage.getItem(STORAGE_KEYS.LAST_TRADE_ID);
      const nextId = lastId ? parseInt(lastId) + 1 : 1;
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_TRADE_ID, nextId.toString());
      return `trade_${nextId}`;
    } catch (error) {
      console.error('Error generating trade ID:', error);
      return `trade_${Date.now()}`;
    }
  }

  // Clean up trades older than 7 days
  static async cleanupOldTrades(): Promise<void> {
    try {
      const trades = await this.getAllTrades();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentTrades = trades.filter(trade => {
        const tradeDate = new Date(trade.createdAt);
        return tradeDate >= sevenDaysAgo;
      });

      if (recentTrades.length !== trades.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(recentTrades));
      }
    } catch (error) {
      console.error('Error cleaning up old trades:', error);
    }
  }

  // Clear all trades (for testing/debugging)
  static async clearAllTrades(): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.TRADES);
      await AsyncStorage.removeItem(STORAGE_KEYS.LAST_TRADE_ID);
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
      console.log('Trade cleanup background task registered');
    } catch (error) {
      console.error('Error registering trade cleanup background task:', error);
    }
  }
}