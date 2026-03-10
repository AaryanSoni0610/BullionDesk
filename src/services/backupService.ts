import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { NotificationService } from './notificationService';
import { Logger } from '../utils/logger';
import { EncryptionService } from './encryptionService';
import { DatabaseService } from './database.sqlite';
import { CustomerService } from './customer.service';
import { TransactionService } from './transaction.service';
import { LedgerService } from './ledger.service';
import { InventoryService } from './inventory.service';
import { SettingsService } from './settings.service';
import { RaniRupaStockService } from './raniRupaStock.service';
import { TradeService } from './trade.service';
import { RaniRupaStock, Trade } from '../types';
import { RateCutService } from './rateCut.service';
import { ObjectStorageService } from './backup/ObjectStorageService';
import { CanonicalService } from './backup/CanonicalService';
import { HashService } from './backup/HashService';

const SECURE_STORE_KEYS = {
  ENCRYPTION_KEY: 'backup_encryption_key',
  DEVICE_ID: 'device_id',
  AUTO_BACKUP_ENABLED: 'auto_backup_enabled',
  LAST_BACKUP_TIME: 'last_backup_time',
  STORAGE_PERMISSION_GRANTED: 'storage_permission_granted',
  SAF_DIRECTORY_URI: 'saf_directory_uri',
  FIRST_EXPORT_OR_AUTO_BACKUP: 'first_export_or_auto_backup',
  BACKUP_LOG_FILE_URI: 'backup_log_file_uri',
  INTERNAL_BACKUP_KEY_HASH: 'internal_backup_key_hash',
};

// Background task constants
const AUTO_BACKUP_TASK = 'auto-backup-task';

interface BackupData {
  exportType: 'manual' | 'auto';
  timestamp: number;
  recordCount: number;
  records: {
    customers: any[];
    transactions: any[];
    ledger: any[];
    baseInventory?: {
      gold999: number;
      gold995: number;
      silver: number;
      money: number;
    };
    raniRupaStock: RaniRupaStock[];
    trades: Trade[];
    rateCutHistory?: any[]; // Making it optional for backwards compatibility
  };
}

type AlertFunction = (title: string, message: string, buttons?: any[]) => void;

// Define the background task for auto backup
TaskManager.defineTask(AUTO_BACKUP_TASK, async () => {
  try {
    // Check if auto backup is enabled
    const isEnabled = await BackupService.isAutoBackupEnabled();
    if (!isEnabled) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Check if it's time to perform backup
    const shouldBackup = await BackupService.shouldPerformAutoBackup();
    if (!shouldBackup) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Perform the backup
    const success = await BackupService.performAutoBackup();
    if (success) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } else {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export class BackupService {
  // Static alert function that can be overridden
  private static alertFunction: AlertFunction = Alert.alert;

  /**
   * Set custom alert function (for using CustomAlert component)
   */
  static setAlertFunction(alertFunc: AlertFunction): void {
    this.alertFunction = alertFunc;
  }

  /**
   * Redirect console.error to also log to device
   */
  static setupConsoleErrorLogging(): void {
    // Initialize the logger first
    Logger.initialize().catch(error => console.error('Failed to initialize logger:', error));
    
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      // Call original console.error
      originalConsoleError(...args);
      
      // Also log to backup log file if available
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.logAction(`ERROR: ${message}`);
    };
    this.logAction('Console error logging setup completed');
  }

  /**
   * Show alert using configured alert function
   */
  private static showAlert(title: string, message: string, buttons?: any[]): void {
    this.alertFunction(title, message, buttons);
  }

  /**
   * Request storage permissions (Android)
   */
  static async requestStoragePermission(): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') {
        await SettingsService.setStoragePermissionGranted(true);
        return true;
      }

      // Check if permission was already granted
      const permissionGranted = await SettingsService.getStoragePermissionGranted();
      if (permissionGranted) {
        return true;
      }

      // Request media library permissions (which includes storage access)
      const { status: existingStatus } = await MediaLibrary.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        await SettingsService.setStoragePermissionGranted(false);
        return false;
      }

      // Test if we can create directories
      try {
        const testDir = `${FileSystem.documentDirectory}BullionDeskBackup`;
        const dirInfo = await FileSystem.getInfoAsync(testDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(testDir, { intermediates: true });
        }
        
        // If successful, store permission granted
        await SettingsService.setStoragePermissionGranted(true);
        return true;
      } catch (dirError) {
        console.error('Directory creation error:', dirError);
        await SettingsService.setStoragePermissionGranted(false);
        return false;
      }
    } catch (error) {
      console.error('Error requesting storage permission:', error);
      await SettingsService.setStoragePermissionGranted(false);
      return false;
    }
  }

  /**
   * Check if storage permission is granted
   */
  static async hasStoragePermission(): Promise<boolean> {
    try {
      return await SettingsService.getStoragePermissionGranted();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get or create device ID for conflict-free merging
   */
  static async getDeviceId(): Promise<string> {
    try {
      let deviceId = await SecureStore.getItemAsync(SECURE_STORE_KEYS.DEVICE_ID);
      if (!deviceId) {
        // Generate unique device ID
        deviceId = `${Device.modelName}_${Device.osName}_${Date.now()}`;
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.DEVICE_ID, deviceId);
      }
      return deviceId;
    } catch (error) {
      console.error('Error getting device ID:', error);
      return `fallback_${Date.now()}`;
    }
  }

  /**
   * Check if encryption key exists
   */
  static async hasEncryptionKey(): Promise<boolean> {
    try {
      const key = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ENCRYPTION_KEY);
      return !!key;
    } catch (error) {
      console.error('Error checking encryption key:', error);
      return false;
    }
  }

  /**
   * Setup encryption key (deprecated - UI should handle this now)
   * This method now just checks if the key exists
   */
  static async setupEncryptionKey(): Promise<boolean> {
    try {
      const hasKey = await this.hasEncryptionKey();
      if (hasKey) {
      } else {
      }
      return hasKey;
    } catch (error) {
      console.error('Error setting up encryption key:', error);
      return false;
    }
  }

  /**
   * Get encryption key from secure storage
   */
  static async getEncryptionKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SECURE_STORE_KEYS.ENCRYPTION_KEY);
    } catch (error) {
      console.error('Error getting encryption key:', error);
      return null;
    }
  }

  /**
   * Sync the internal backup encryption key with the user's export key.
   *
   * Call this:
   *   1. After the user sets/changes their export key (SettingsScreen)
   *   2. At the end of data migration (MigrationService)
   *
   * If the user key has changed (detected via stored hash):
   *   - Clears all internal backup objects (they were encrypted with the old key)
   *   - Derives a new internal key from the user key + device ID (as salt)
   *   - Persists the new key hash so we can detect future changes
   *   - Schedules a background incremental backup to rebuild the internal store
   */
  static async syncInternalKeyWithUserKey(): Promise<void> {
    try {
      const userKey = await this.getEncryptionKey();
      if (!userKey) {
        // No user key set yet — leave the random internal key as-is
        await Logger.logAction('syncInternalKeyWithUserKey: no user key set, skipping');
        return;
      }

      // Compute hash of current user key
      const currentHash = await EncryptionService.getUserKeyHash(userKey);

      // Compare with stored hash
      const storedHash = await SecureStore.getItemAsync(SECURE_STORE_KEYS.INTERNAL_BACKUP_KEY_HASH);

      if (storedHash === currentHash) {
        await Logger.logAction('syncInternalKeyWithUserKey: key unchanged, no action needed');
        return;
      }

      await Logger.logAction('syncInternalKeyWithUserKey: key changed — clearing internal backup and re-keying');

      // 1. Wipe the internal object store (all .enc files were with old key)
      await ObjectStorageService.clearAll();

      // 2. Derive a new deterministic internal key from user password + device ID
      const deviceId = await this.getDeviceId();
      await EncryptionService.deriveAndSetInternalKeyFromUserKey(userKey, deviceId);

      // 3. Persist the new hash so we only rebuild once
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.INTERNAL_BACKUP_KEY_HASH, currentHash);

      await Logger.logAction('syncInternalKeyWithUserKey: internal key updated, scheduling background rebuild');

      // 4. Schedule a background incremental backup to re-populate the internal store
      //    Run slightly deferred so the calling code can finish first
      setTimeout(() => {
        this.performAutoBackup().catch(e =>
          console.error('syncInternalKeyWithUserKey: background rebuild failed:', e)
        );
      }, 2000);

    } catch (error) {
      console.error('syncInternalKeyWithUserKey error:', error);
      await Logger.logAction(`syncInternalKeyWithUserKey ERROR: ${error}`);
      // Non-fatal — internal backup will be rebuilt on next opportunity
    }
  }

  /**
   * Get SAF directory URI from secure storage
   */
  static async getSAFDirectoryUri(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SECURE_STORE_KEYS.SAF_DIRECTORY_URI);
    } catch (error) {
      console.error('Error getting SAF directory URI:', error);
      return null;
    }
  }

  /**
   * Set SAF directory URI in secure storage
   */
  static async setSAFDirectoryUri(uri: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.SAF_DIRECTORY_URI, uri);
    } catch (error) {
      console.error('Error setting SAF directory URI:', error);
      throw error;
    }
  }

  /**
   * Check if this is the first export or auto backup
   */
  static async isFirstExportOrAutoBackup(): Promise<boolean> {
    try {
      const flag = await SecureStore.getItemAsync(SECURE_STORE_KEYS.FIRST_EXPORT_OR_AUTO_BACKUP);
      return flag !== 'done';
    } catch (error) {
      console.error('Error checking first export/auto backup flag:', error);
      return true; // Default to true if error
    }
  }

  /**
   * Mark that first export or auto backup has been completed
   */
  static async markFirstExportOrAutoBackupDone(): Promise<void> {
    try {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.FIRST_EXPORT_OR_AUTO_BACKUP, 'done');
    } catch (error) {
      console.error('Error setting first export/auto backup flag:', error);
      throw error;
    }
  }

  /**
   * Share an exported file, handling both SAF URIs and file URIs
   */
  static async shareExportedFile(fileUri: string, fileName: string): Promise<void> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        this.showAlert('Sharing Not Available', 'Sharing is not available on this device.');
        return;
      }

      let shareUri = fileUri;

      // Check if this is a SAF URI (content scheme) that needs to be copied to a file URI
      if (fileUri.startsWith('content://')) {
        try {
          // Read the file content from SAF
          const fileContent = await FileSystem.StorageAccessFramework.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          // Create a temporary file in the app's cache directory (better for temp files)
          const tempFileUri = `${FileSystem.cacheDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(tempFileUri, fileContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          shareUri = tempFileUri;

          // Share the temporary file
          await Sharing.shareAsync(shareUri, {
            mimeType: 'application/octet-stream',
            dialogTitle: 'Share Backup File',
          });

          // Clean up the temporary file after a delay to ensure sharing is complete
          setTimeout(async () => {
            try {
              await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
            } catch (error) {
              console.error('Could not clean up temp file:', error);
            }
          }, 120000); // 2 minute delay
          return;
        } catch (copyError) {
          console.error('Error copying SAF file for sharing:', copyError);
          this.showAlert('Share Failed', 'Failed to prepare file for sharing.');
          return;
        }
      }

      // For regular file URIs, share directly
      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Share Backup File',
      });
    } catch (error) {
      console.error('Error sharing file:', error);
      this.showAlert('Share Failed', 'Failed to share the backup file.');
    }
  }

  /**
   * Collect all data from database
   */
  private static async collectDatabaseData(): Promise<BackupData['records']> {
    const customers = await CustomerService.getAllCustomers();
    const transactions = await TransactionService.getAllTransactions();
    const ledger = await LedgerService.getAllLedgerEntries();
    const baseInventory = await InventoryService.getBaseInventory();
    const raniRupaStock = await RaniRupaStockService.getAllStock();
    const trades = await TradeService.getAllTrades();
    const rateCutHistory = await RateCutService.getAllRateCutHistory(10000); // Pass large limit to get all

    return {
      customers,
      transactions,
      ledger,
      baseInventory,
      raniRupaStock,
      trades,
      rateCutHistory,
    } as BackupData['records'];
  }

  /**
   * Manual export to user-accessible storage using SAF
   */
  static async exportDataToUserStorage(): Promise<{ success: boolean; fileUri?: string; fileName?: string }> {
    const startTime = Date.now();
    console.log('BackupService: Starting export');
    await this.logAction('Starting export');
    try {

      // Check if this is the first export/auto backup
      const isFirstTime = await this.isFirstExportOrAutoBackup();
      console.log('BackupService: Is first time export:', isFirstTime);
      if (isFirstTime) {
        console.log('BackupService: Requesting directory permissions');
        await this.logAction('First export - requesting storage permissions');
        // Request directory permissions using SAF FIRST
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (!permissions.granted) {
          console.log('BackupService: Permission denied');
          await this.logAction('Storage permission denied');
          this.showAlert('Permission Denied', 'Cannot access storage location.');
          return { success: false };
        }

        // Save the directory URI for future use
        await this.setSAFDirectoryUri(permissions.directoryUri);
        // Mark first export/auto backup as done
        await this.markFirstExportOrAutoBackupDone();
        await this.logAction('Storage permissions granted and directory saved');
      }

      // Get encryption key
      const key = await this.getEncryptionKey();
      if (!key) {
        console.log('BackupService: No encryption key found');
        await this.logAction('Export failed: encryption key not found');
        this.showAlert('Error', 'Encryption key not found. Please set up encryption first.');
        return { success: false };
      }

      // Get saved directory URI (should exist now)
      const safDirectoryUri = await this.getSAFDirectoryUri();
      if (!safDirectoryUri) {
        console.log('BackupService: No backup location configured');
        this.showAlert('Error', 'No backup location configured. Please try again.');
        return { success: false };
      }

      // Show initial progress
      this.updateProgressAlert('Reading database... 20%');

      // Read the raw SQLite DB file directly — much faster than JSON serialization
      const dbPath = `${FileSystem.documentDirectory}SQLite/bulliondesk.db`;
      const base64Db = await FileSystem.readAsStringAsync(dbPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log(`BackupService: DB file read took ${Date.now() - startTime}ms`);
      await this.logAction(`DB file read (${base64Db.length} base64 chars)`);

      this.updateProgressAlert('Encrypting database... 60%');
      console.log('BackupService: Encrypting DB file with user password');
      // Encrypt the base64 DB with the user password
      const encrypted = await EncryptionService.encryptWithPassword(base64Db, key);
      console.log(`BackupService: Encryption took ${Date.now() - startTime}ms`);
      await this.logAction(`DB encrypted (${encrypted.length} bytes)`);

      this.updateProgressAlert('Saving file... 90%');
      console.log('BackupService: Creating export file');
      // Create file using SAF in root directory
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `export_all_${dateStr}.enc`;

      // Delete existing export files (any file starting with "export_")
      try {
        const directoryContents = await FileSystem.StorageAccessFramework.readDirectoryAsync(safDirectoryUri);
        for (const uri of directoryContents) {
          // Extract filename from URI (SAF URIs end with :filename)
          const fileNameFromUri = uri.split(':').pop();
          if (fileNameFromUri && fileNameFromUri.startsWith('export_')) {
            await FileSystem.StorageAccessFramework.deleteAsync(uri);
          }
        }
      } catch (error) {
        // Ignore errors when trying to delete - file might not exist
      }

      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        safDirectoryUri,
        fileName,
        'application/octet-stream'
      );

      // Write encrypted data using SAF
      await FileSystem.StorageAccessFramework.writeAsStringAsync(
        fileUri,
        encrypted,
        { encoding: FileSystem.EncodingType.UTF8 }
      );
      console.log(`BackupService: File saving took ${Date.now() - startTime}ms`);
      await this.logAction(`Export file saved: ${fileName} (${encrypted.length} bytes)`);

      console.log('BackupService: Export completed successfully, file:', fileName);
      console.log(`BackupService: Total export time: ${Date.now() - startTime}ms`);
      await this.logAction(`SAF export completed: file: ${fileName}`);

      return { success: true, fileUri, fileName };
    } catch (error) {
      console.error('BackupService: SAF export error:', error);
      await this.logAction(`SAF export error: ${error}`);
      this.showAlert('Export Failed', 'Failed to export data. Please try again.');
      return { success: false };
    }
  }

  /**
   * Import data — clears all existing data and restores from backup file
   */
  static async importData(fileUri: string): Promise<boolean> {
    const startTime = Date.now();
    console.log('BackupService: Starting import, file:', fileUri);
    await this.logAction(`Starting import from file: ${fileUri}`);
    try {

      // Get encryption key (should be set by UI before calling this)
      const key = await this.getEncryptionKey();
      if (!key) {
        console.log('BackupService: No encryption key found');
        await this.logAction('Import failed: encryption key not found');
        this.showAlert('Error', 'Encryption key not found. Please set up encryption first.');
        return false;
      }

      this.updateImportProgressAlert('Starting import... 0%');
      console.log('BackupService: Reading encrypted file');

      // Read encrypted file
      this.updateImportProgressAlert('Reading backup file... 20%');
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      console.log(`BackupService: File reading took ${Date.now() - startTime}ms`);

      this.updateImportProgressAlert('Decrypting data... 40%');
      console.log('BackupService: Decrypting backup file');

      let decryptedBase64Db: string;
      try {
        decryptedBase64Db = await EncryptionService.decryptWithPassword(fileContent, key);
        console.log(`BackupService: Decryption took ${Date.now() - startTime}ms`);
      } catch (e) {
        console.error('BackupService: Decryption failed');
        throw new Error('Failed to decrypt. Wrong password or corrupted file.');
      }

      // Replace the database file with the decrypted base64-encoded SQLite DB
      this.updateImportProgressAlert('Replacing database... 70%');
      console.log('BackupService: Replacing database file');
      const dbPath = `${FileSystem.documentDirectory}SQLite/bulliondesk.db`;
      await DatabaseService.closeDatabase();
      await FileSystem.writeAsStringAsync(dbPath, decryptedBase64Db, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log(`BackupService: DB file replaced in ${Date.now() - startTime}ms`);
      await DatabaseService.initDatabase();
      console.log(`BackupService: DB reinitialized in ${Date.now() - startTime}ms`);

      this.updateImportProgressAlert('Import complete! 100%');

      console.log('BackupService: Import completed successfully');
      console.log(`BackupService: Total import time: ${Date.now() - startTime}ms`);
      await this.logAction(`Import completed`);

      this.showAlert(
        'Import Successful',
        `Data restored successfully from backup.`,
        [{ text: 'OK' }]
      );

      return true;
    } catch (error) {
      console.error('📥 Import error:', error);
      await this.logAction(`Import error: ${error}`);

      if (error instanceof Error && error.message.includes('decrypt')) {
        this.showAlert(
          'Import Failed',
          'Invalid encryption key or corrupted backup file.',
          [{ text: 'OK' }]
        );
      } else {
        this.showAlert('Import Failed', 'Failed to import data. Please try again.');
      }

      return false;
    }
  }

  /**
   * Import from SAF URI — clears all existing data and restores from backup file
   */
  static async importDataFromSAF(fileUri: string): Promise<boolean> {
    const startTime = Date.now();
    console.log('BackupService: Starting SAF import from file:', fileUri);
    await this.logAction(`Starting SAF import from file: ${fileUri}`);
    try {

      // Get encryption key
      const key = await this.getEncryptionKey();
      if (!key) {
        console.log('BackupService: No encryption key found');
        await this.logAction('SAF import failed: encryption key not found');
        this.showAlert('Error', 'Encryption key not found. Please set up encryption first.');
        return false;
      }

      this.updateImportProgressAlert('Starting import... 0%');
      console.log('BackupService: Reading encrypted file');

      // Read encrypted file using SAF
      this.updateImportProgressAlert('Reading backup file... 20%');
      const fileContent = await FileSystem.StorageAccessFramework.readAsStringAsync(
        fileUri,
        { encoding: FileSystem.EncodingType.UTF8 }
      );
      console.log(`BackupService: File reading took ${Date.now() - startTime}ms`);

      this.updateImportProgressAlert('Decrypting data... 40%');
      console.log('BackupService: Decrypting backup file');

      let decryptedBase64Db: string;
      try {
        decryptedBase64Db = await EncryptionService.decryptWithPassword(fileContent, key);
        console.log(`BackupService: Decryption took ${Date.now() - startTime}ms`);
      } catch (e) {
        console.error('BackupService: Decryption failed');
        throw new Error('Failed to decrypt. Wrong password or corrupted file.');
      }

      // Replace the database file with the decrypted base64-encoded SQLite DB
      this.updateImportProgressAlert('Replacing database... 70%');
      console.log('BackupService: Replacing database file');
      const dbPath = `${FileSystem.documentDirectory}SQLite/bulliondesk.db`;
      await DatabaseService.closeDatabase();
      await FileSystem.writeAsStringAsync(dbPath, decryptedBase64Db, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log(`BackupService: DB file replaced in ${Date.now() - startTime}ms`);
      await DatabaseService.initDatabase();
      console.log(`BackupService: DB reinitialized in ${Date.now() - startTime}ms`);

      this.updateImportProgressAlert('Import complete! 100%');

      console.log('BackupService: Import completed successfully');
      console.log(`BackupService: Total import time: ${Date.now() - startTime}ms`);
      await this.logAction(`SAF import completed`);

      this.showAlert(
        'Import Successful',
        `Data restored successfully from backup.`,
        [{ text: 'OK' }]
      );

      return true;
    } catch (error) {
      console.error('BackupService: SAF import error:', error);
      await this.logAction(`SAF import error: ${error}`);

      if (error instanceof Error && error.message.includes('decrypt')) {
        this.showAlert(
          'Import Failed',
          'Invalid encryption key or corrupted backup file.',
          [{ text: 'OK' }]
        );
      } else {
        this.showAlert('Import Failed', 'Failed to import data. Please try again.');
      }

      return false;
    }
  }

  /**
   * Auto backup with Notification Support & Garbage Collection
   */
  static async performAutoBackup(): Promise<boolean> {
    try {
      await this.logAction('Starting incremental auto-backup...');
      
      // Load Manifest
      const manifest = await ObjectStorageService.getManifest();
      const newManifest: Record<string, string> = {};
      let changesCount = 0;

      // Helper to process a list of items
      const processItems = async (items: any[], prefix: string) => {
        // Step 1: stringify all items (CPU, sync — fast)
        const canonicals = items.map(item => ({
          id: item.id || 'single',
          canonical: CanonicalService.stringify(item)
        }));

        // Step 2: hash ALL in parallel (native crypto, huge win)
        const hashes = await Promise.all(
          canonicals.map(c => HashService.computeHash(c.canonical))
        );

        // Step 3: only write changed items (still sequential to avoid disk thrash)
        for (let i = 0; i < canonicals.length; i++) {
          const key = `${prefix}:${canonicals[i].id}`;
          const hash = hashes[i];
          if (manifest[key] !== hash) {
            await ObjectStorageService.saveRawObject(canonicals[i].canonical, hash);
            changesCount++;
          }
          newManifest[key] = hash;
        }
      };

      // Gather Data
      const recordData = await this.collectDatabaseData();
      
      await processItems(recordData.customers, 'customers');
      await processItems(recordData.transactions, 'transactions');
      await processItems(recordData.ledger, 'ledger');
      await processItems(recordData.raniRupaStock, 'stock');
      await processItems(recordData.trades, 'trades');
      if (recordData.rateCutHistory) {
        await processItems(recordData.rateCutHistory, 'rate_cut_history');
      }
      if (recordData.baseInventory) {
        await processItems([recordData.baseInventory], 'inventory');
      }

      // Save Manifest
      console.log('BackupService: Saving updated manifest');
      await ObjectStorageService.saveManifest(newManifest);
      await this.logAction(`Manifest updated with ${changesCount} changes`);
      
      // Update Snapshot
      const backupData: BackupData = {
          exportType: 'auto',
          timestamp: Date.now(),
          recordCount: Object.keys(newManifest).length,
          records: recordData
      };
      
      console.log('BackupService: Saving snapshot');
      await ObjectStorageService.saveSnapshot(backupData);
      await this.logAction(`Snapshot updated: ${backupData.recordCount} records`);

      // --- GARBAGE COLLECTION START ---
      // Identify active files (values in the manifest)
      const activeHashes = new Set(Object.values(newManifest));
      
      // Delete anything on disk that isn't in activeHashes
      const deletedFiles = await ObjectStorageService.cleanupOrphanedObjects(activeHashes);
      
      if (deletedFiles > 0) {
        console.log(`BackupService: Garbage collected ${deletedFiles} orphaned files`);
        await this.logAction(`Garbage collection: Cleaned up ${deletedFiles} orphaned files`);
      }
      // --- GARBAGE COLLECTION END ---
      
      const now = Date.now();
      await SettingsService.setLastBackupTime(now);
      await this.logAction(`Auto backup complete. ${changesCount} changes processed.`);

      // Notification Logic
      const notifEnabled = await NotificationService.isNotificationsEnabled();
      const isAutoEnabled = await this.isAutoBackupEnabled();
      
      if (notifEnabled && isAutoEnabled && changesCount > 0) {
         console.log('BackupService: Sending backup success notification');
         await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Backup Successful',
              body: `Backed up ${changesCount} new changes securely.`,
              sound: 'default',
              priority: Notifications.AndroidNotificationPriority.LOW,
            },
            trigger: null,
         });
      }
      
      console.log('BackupService: Auto backup completed successfully');
      return true;
    } catch (error) {
        console.error('BackupService: Auto backup error:', error);
        await this.logAction(`Auto backup error: ${error}`);
        return false;
    }
  }

  /**
   * Enable/disable auto backup
   */
  static async setAutoBackupEnabled(enabled: boolean): Promise<void> {
    try {
      const success = await SettingsService.setAutoBackupEnabled(enabled);
      if (!success) {
        throw new Error('Failed to save auto backup setting');
      }

      // Register or unregister background task based on enabled state
      if (enabled) {
        await this.registerBackgroundTask();
      } else {
        await this.unregisterBackgroundTask();
      }



      await this.logAction(`Auto backup ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error setting auto backup:', error);
      throw error; // Throw the error so it can be caught in the UI
    }
  }

  /**
   * Check if auto backup is enabled
   */
  static async isAutoBackupEnabled(): Promise<boolean> {
    try {
      return await SettingsService.getAutoBackupEnabled();
    } catch (error) {
      console.error('Error checking auto backup status:', error);
      return false;
    }
  }

  /**
   * Check if backup is needed (24 hours elapsed)
   */
  static async shouldPerformAutoBackup(): Promise<boolean> {
    try {
      // First check if first export/auto backup setup is done
      const isFirstTime = await this.isFirstExportOrAutoBackup();
      if (isFirstTime) {
        // Don't perform auto backup until user has set up export/auto backup location
        return false;
      }

      const lastBackup = await SettingsService.getLastBackupTime();
      if (!lastBackup) {
        return true;
      }

      const now = Date.now();
      const hoursSinceBackup = (now - lastBackup) / (1000 * 60 * 60);

      return hoursSinceBackup >= 24;
    } catch (error) {
      console.error('Error checking backup time:', error);
      return false;
    }
  }

  /**
   * Log an action to device storage (public method for other services)
   */
  static async logAction(message: string): Promise<void> {
    await Logger.logAction(message);
  }

  /**
   * Ensure SAF directory is selected (prompt if not set)
   */
  static async ensureSAFDirectorySelected(): Promise<boolean> {
    try {
      const existingUri = await this.getSAFDirectoryUri();
      if (existingUri) {
        return true;
      }

      
      // Request directory permissions using SAF
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (!permissions.granted) {
        this.showAlert('Permission Denied', 'Cannot access storage location for backups.');
        return false;
      }

      // Save the directory URI
      await this.setSAFDirectoryUri(permissions.directoryUri);
      
      return true;
    } catch (error) {
      console.error('Error ensuring SAF directory:', error);
      this.showAlert('Error', 'Failed to select backup location.');
      return false;
    }
  }

  /**
   * Update progress alert message
   */
  private static updateProgressAlert(message: string): void {
    this.showAlert('Exporting...', message, []);
  }

  /**
   * Update import progress alert message
   */
  private static updateImportProgressAlert(message: string): void {
    this.showAlert('Importing...', message, []);
  }

  /**
   * Register the background auto backup task
   */
  static async registerBackgroundTask(): Promise<void> {
    try {
      await this.logAction('Registering background auto backup task');
      // Check if task is already registered
      const isRegistered = await TaskManager.isTaskRegisteredAsync(AUTO_BACKUP_TASK);
      if (isRegistered) {
        await this.logAction('Background task already registered');
        return;
      }

      // Register the background fetch
      await BackgroundFetch.registerTaskAsync(AUTO_BACKUP_TASK, {
        minimumInterval: 6 * 60 * 60, // 6 hours in seconds
        stopOnTerminate: false, // Continue when app is terminated
        startOnBoot: true, // Start when device boots
      });
      await this.logAction('Background auto backup task registered successfully');

    } catch (error) {
      console.error('Failed to register auto backup background task:', error);
      await this.logAction(`Failed to register background task: ${error}`);
    }
  }

  /**
   * Unregister the background auto backup task
   */
  static async unregisterBackgroundTask(): Promise<void> {
    try {
      await this.logAction('Unregistering background auto backup task');
      // Check if task is registered
      const isRegistered = await TaskManager.isTaskRegisteredAsync(AUTO_BACKUP_TASK);
      if (!isRegistered) {
        await this.logAction('Background task not registered');
        return;
      }

      // Unregister the background fetch
      await BackgroundFetch.unregisterTaskAsync(AUTO_BACKUP_TASK);
      await this.logAction('Background auto backup task unregistered successfully');
    } catch (error) {
      console.error('Failed to unregister auto backup background task:', error);
      await this.logAction(`Failed to unregister background task: ${error}`);
    }
  }
}
