import { DatabaseService } from './database.sqlite';

export class SettingsService {
  // Auto backup settings
  static async getAutoBackupEnabled(): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ['auto_backup_enabled']
      );

      return result ? result.value === 'true' : false;
    } catch (error) {
      console.error('Error getting auto backup enabled:', error);
      return false;
    }
  }

  static async setAutoBackupEnabled(enabled: boolean): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['auto_backup_enabled', enabled ? 'true' : 'false']
      );

      return true;
    } catch (error) {
      console.error('Error setting auto backup enabled:', error);
      return false;
    }
  }

  // Storage permission settings
  static async getStoragePermissionGranted(): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ['storage_permission_granted']
      );

      return result ? result.value === 'true' : false;
    } catch (error) {
      console.error('Error getting storage permission granted:', error);
      return false;
    }
  }

  static async setStoragePermissionGranted(granted: boolean): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['storage_permission_granted', granted ? 'true' : 'false']
      );

      return true;
    } catch (error) {
      console.error('Error setting storage permission granted:', error);
      return false;
    }
  }

  // Last backup time settings
  static async getLastBackupTime(): Promise<number | null> {
    try {
      const db = DatabaseService.getDatabase();
      
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ['last_backup_time']
      );

      return result ? parseInt(result.value, 10) : null;
    } catch (error) {
      console.error('Error getting last backup time:', error);
      return null;
    }
  }

  static async setLastBackupTime(time: number): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['last_backup_time', time.toString()]
      );

      return true;
    } catch (error) {
      console.error('Error setting last backup time:', error);
      return false;
    }
  }

  // Get any setting by key
  static async getSetting(key: string): Promise<string | null> {
    try {
      const db = DatabaseService.getDatabase();
      
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [key]
      );

      return result ? result.value : null;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return null;
    }
  }

  // Set any setting by key
  static async setSetting(key: string, value: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value]
      );

      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  }

  // Delete a setting
  static async deleteSetting(key: string): Promise<boolean> {
    try {
      const db = DatabaseService.getDatabase();
      
      await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);

      return true;
    } catch (error) {
      console.error(`Error deleting setting ${key}:`, error);
      return false;
    }
  }
}
