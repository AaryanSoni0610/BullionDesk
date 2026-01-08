import { RaniRupaStock } from '../types';
import { DatabaseService } from './database.sqlite';

export class RaniRupaStockService {
  // Get all available (unsold) stock items
  static async getAllStock(): Promise<RaniRupaStock[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const stock = await DatabaseService.getAllAsyncBatch<{
        stock_id: string;
        itemtype: string;
        weight: number;
        touch: number;
        date: string;
        createdAt: string;
        isSold: number;
      }>('SELECT * FROM rani_rupa_stock WHERE isSold = 0 ORDER BY createdAt ASC');

      return stock.map(item => ({
        stock_id: item.stock_id,
        itemtype: item.itemtype as 'rani' | 'rupu',
        weight: item.weight,
        touch: item.touch,
        date: item.date,
        createdAt: item.createdAt,
        isSold: item.isSold === 1,
      }));
    } catch (error) {
      console.error('Error getting Rani-Rupa stock:', error);
      return [];
    }
  }

  // Add new stock item
  static async addStock(
    itemtype: 'rani' | 'rupu',
    weight: number,
    touch: number
  ): Promise<{ success: boolean; stock_id?: string; error?: string }> {
    try {
      const db = DatabaseService.getDatabase();
      
      const stock_id = `stock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const createdAt = now.toISOString();

      await db.runAsync(
        'INSERT INTO rani_rupa_stock (stock_id, itemtype, weight, touch, date, createdAt, isSold) VALUES (?, ?, ?, ?, ?, ?, 0)',
        [stock_id, itemtype, weight, touch, date, createdAt]
      );

      return { success: true, stock_id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Mark stock as sold or unsold
  static async markStockAsSold(
    stock_id: string,
    isSold: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const db = DatabaseService.getDatabase();
      
      const result = await db.runAsync(
        'UPDATE rani_rupa_stock SET isSold = ? WHERE stock_id = ?',
        [isSold ? 1 : 0, stock_id]
      );

      if (result.changes === 0) {
        return { success: false, error: 'Stock item not found' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Restore stock item with specific stock_id (used for transaction reversal)
  static async restoreStock(
    stock_id: string,
    itemtype: 'rani' | 'rupu',
    weight: number,
    touch: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Check if stock with this ID already exists
      const existing = await db.getFirstAsync<{ stock_id: string }>(
        'SELECT stock_id FROM rani_rupa_stock WHERE stock_id = ?',
        [stock_id]
      );

      if (existing) {
        return { success: false, error: 'Stock with this ID already exists' };
      }

      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const createdAt = now.toISOString();

      await db.runAsync(
        'INSERT INTO rani_rupa_stock (stock_id, itemtype, weight, touch, date, createdAt, isSold) VALUES (?, ?, ?, ?, ?, ?, 0)',
        [stock_id, itemtype, weight, touch, date, createdAt]
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Remove stock item by stock_id
  static async removeStock(stock_id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = DatabaseService.getDatabase();
      
      // Attempt delete directly where it is NOT sold
      const result = await db.runAsync(
        'DELETE FROM rani_rupa_stock WHERE stock_id = ? AND isSold = 0',
        [stock_id]
      );

      if (result.changes > 0) {
        return { success: true };
      }

      // If delete failed, check why (Edge case)
      const item = await db.getFirstAsync<{ isSold: number }>(
        'SELECT isSold FROM rani_rupa_stock WHERE stock_id = ?',
        [stock_id]
      );

      if (!item) {
        return { success: false, error: 'Stock item not found' };
      }

      if (item.isSold === 1) {
        return { success: false, error: 'Cannot delete sold stock. Please delete the sales transaction first.' };
      }
      
      return { success: false, error: 'Unknown error' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Update stock item weight by stock_id
  static async updateStock(
    stock_id: string,
    updates: { weight?: number; touch?: number }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const db = DatabaseService.getDatabase();
      
      const updateFields: string[] = [];
      const params: any[] = [];

      if (updates.weight !== undefined) {
        updateFields.push('weight = ?');
        params.push(updates.weight);
      }
      if (updates.touch !== undefined) {
        updateFields.push('touch = ?');
        params.push(updates.touch);
      }

      if (updateFields.length === 0) {
        return { success: true }; // Nothing to update
      }

      params.push(stock_id);

      const result = await db.runAsync(
        `UPDATE rani_rupa_stock SET ${updateFields.join(', ')} WHERE stock_id = ?`,
        params
      );

      if (result.changes === 0) {
        return { success: false, error: 'Stock item not found' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Get stock by itemtype
  static async getStockByType(itemtype: 'rani' | 'rupu'): Promise<RaniRupaStock[]> {
    try {
      const db = DatabaseService.getDatabase();
      
      const stock = await DatabaseService.getAllAsyncBatch<{
        stock_id: string;
        itemtype: string;
        weight: number;
        touch: number;
        date: string;
        createdAt: string;
        isSold: number;
      }>('SELECT * FROM rani_rupa_stock WHERE itemtype = ? AND isSold = 0 ORDER BY createdAt ASC', [itemtype]);

      return stock.map(item => ({
        stock_id: item.stock_id,
        itemtype: item.itemtype as 'rani' | 'rupu',
        weight: item.weight,
        touch: item.touch,
        date: item.date,
        createdAt: item.createdAt,
        isSold: item.isSold === 1,
      }));
    } catch (error) {
      console.error('Error getting stock by type:', error);
      return [];
    }
  }

  // Get stock item by stock_id
  static async getStockById(stock_id: string): Promise<RaniRupaStock | null> {
    try {
      const db = DatabaseService.getDatabase();
      
      const item = await db.getFirstAsync<{
        stock_id: string;
        itemtype: string;
        weight: number;
        touch: number;
        date: string;
        createdAt: string;
        isSold: number;
      }>('SELECT * FROM rani_rupa_stock WHERE stock_id = ?', [stock_id]);

      if (!item) return null;

      return {
        stock_id: item.stock_id,
        itemtype: item.itemtype as 'rani' | 'rupu',
        weight: item.weight,
        touch: item.touch,
        date: item.date,
        createdAt: item.createdAt,
        isSold: item.isSold === 1,
      };
    } catch (error) {
      console.error('Error getting stock by ID:', error);
      return null;
    }
  }

  // Clear all stock (for testing/reset purposes)
  static async clearAllStock(): Promise<{ success: boolean; error?: string }> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync('DELETE FROM rani_rupa_stock');
      
      return { success: true };
    } catch (error) {
      console.error('Error clearing stock:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
