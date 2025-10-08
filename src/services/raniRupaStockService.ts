import AsyncStorage from '@react-native-async-storage/async-storage';
import { RaniRupaStock } from '../types';

const STORAGE_KEYS = {
  RANI_RUPA_STOCK: '@bulliondesk_rani_rupa_stock',
};

export class RaniRupaStockService {
  // Get all stock items
  static async getAllStock(): Promise<RaniRupaStock[]> {
    try {
      const stockData = await AsyncStorage.getItem(STORAGE_KEYS.RANI_RUPA_STOCK);
      return stockData ? JSON.parse(stockData) : [];
    } catch (error) {
      console.error('Error getting Rani-Rupa stock:', error);
      return [];
    }
  }

  // Add new stock item
  static async addStock(itemtype: 'rani' | 'rupu', weight: number, touch: number): Promise<{ success: boolean; stock_id?: string; error?: string }> {
    try {
      const stock = await this.getAllStock();
      const stock_id = `stock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newStock: RaniRupaStock = {
        stock_id,
        itemtype,
        weight,
        touch,
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
        createdAt: new Date().toISOString(),
      };

      stock.push(newStock);
      await AsyncStorage.setItem(STORAGE_KEYS.RANI_RUPA_STOCK, JSON.stringify(stock));

      return { success: true, stock_id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Remove stock item by stock_id
  static async removeStock(stock_id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const stock = await this.getAllStock();
      const index = stock.findIndex(item => item.stock_id === stock_id);

      if (index === -1) {
        return { success: false, error: 'Stock item not found' };
      }

      await AsyncStorage.setItem(STORAGE_KEYS.RANI_RUPA_STOCK, JSON.stringify(stock));

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Get stock by itemtype
  static async getStockByType(itemtype: 'rani' | 'rupu'): Promise<RaniRupaStock[]> {
    try {
      const stock = await this.getAllStock();
      return stock.filter(item => item.itemtype === itemtype);
    } catch (error) {
      console.error('Error getting stock by type:', error);
      return [];
    }
  }

  // Get stock item by stock_id
  static async getStockById(stock_id: string): Promise<RaniRupaStock | null> {
    try {
      const stock = await this.getAllStock();
      return stock.find(item => item.stock_id === stock_id) || null;
    } catch (error) {
      console.error('Error getting stock by ID:', error);
      return null;
    }
  }

  // Clear all stock (for testing/reset purposes)
  static async clearAllStock(): Promise<{ success: boolean; error?: string }> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.RANI_RUPA_STOCK);
      return { success: true };
    } catch (error) {
      console.error('Error clearing stock:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
