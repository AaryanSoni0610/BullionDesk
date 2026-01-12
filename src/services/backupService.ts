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
import JSZip from 'jszip';
import { EncryptionService } from './encryptionService';
import { DatabaseService } from './database.sqlite';
import { CustomerService } from './customer.service';
import { TransactionService } from './transaction.service';
import { LedgerService } from './ledger.service';
import { InventoryService } from './inventory.service';
import { SettingsService } from './settings.service';
import { RaniRupaStockService } from './raniRupaStock.service';
import { Customer, Transaction, TransactionEntry, RaniRupaStock } from '../types';
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
};

// Background task constants
const AUTO_BACKUP_TASK = 'auto-backup-task';

interface BackupData {
  exportType: 'manual' | 'auto';
  timestamp: number;
  recordCount: number;
  deviceId: string;
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

    return {
      customers,
      transactions,
      ledger,
      baseInventory,
      raniRupaStock,
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
      this.updateProgressAlert('Syncing internal backup... 0%');

      // Run incremental backup to ensure snapshot reflects latest changes
      await this.performAutoBackup(true); // Force mode = no notifications during export
      console.log(`BackupService: Internal backup sync took ${Date.now() - startTime}ms`);
      await this.logAction('Internal backup sync completed');

      this.updateProgressAlert('Loading snapshot... 50%');
      // Load the now-up-to-date snapshot
      let finalData = await ObjectStorageService.getSnapshot();
      
      if (!finalData) {
         console.error('BackupService: Snapshot missing after backup - this should not happen');
         await this.logAction('Export failed: snapshot missing after backup sync');
         throw new Error("Internal snapshot missing after backup");
      }

      console.log('BackupService: Exporting', finalData.recordCount, 'records');
      console.log(`BackupService: Snapshot loading took ${Date.now() - startTime}ms`);

      this.updateProgressAlert('Encrypting data... 60%');
      console.log('BackupService: Encrypting data with user password');
      
      // 3. Encrypt with User Password
      // Convert to string first
      const payload = JSON.stringify(finalData);
      const encrypted = await EncryptionService.encryptWithPassword(payload, key);
      console.log(`BackupService: Encryption took ${Date.now() - startTime}ms`);
      await this.logAction(`Data encrypted successfully (${payload.length} characters)`);

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
      await this.logAction(`SAF export completed: ${finalData.recordCount} records, file: ${fileName}`);

      return { success: true, fileUri, fileName };
    } catch (error) {
      console.error('BackupService: SAF export error:', error);
      await this.logAction(`SAF export error: ${error}`);
      this.showAlert('Export Failed', 'Failed to export data. Please try again.');
      return { success: false };
    }
  }

  /**
   * Manual import with conflict-free merge
   */
  static async importData(fileUri: string): Promise<boolean> {
    const startTime = Date.now();
    console.log('BackupService: Starting import, file:', fileUri);
    await this.logAction(`Starting import from file: ${fileUri}`);
    try {
      
      // Check storage permission first
      const hasPermission = await this.hasStoragePermission();
      if (!hasPermission) {
        const granted = await this.requestStoragePermission();
        if (!granted) {
          await this.logAction('Import failed: storage permission denied');
          this.showAlert(
            'Permission Required',
            'Storage permission is required to import data. Please grant permission to continue.',
            [{ text: 'OK' }]
          );
          return false;
        }
      }

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

      let decryptedData: BackupData;

      // Try Decrypt (New JSON format or Legacy Zip)
      try {
           console.log('BackupService: Attempting to decrypt as new JSON format');
           this.updateImportProgressAlert('Decrypting data... 40%');
           // Try JSON first (Version 2)
           const decryptedString = await EncryptionService.decryptWithPassword(fileContent, key);
           decryptedData = JSON.parse(decryptedString);
           console.log('BackupService: Successfully decrypted as JSON format, record count:', decryptedData.recordCount);
      } catch (e) {
           console.log('BackupService: JSON decryption failed, trying legacy ZIP format');
           // Fallback to Legacy Zip (Version 1)
           try {
               const decryptedZipBuffer = await EncryptionService.decryptZip(fileContent, key);
               this.updateImportProgressAlert('Extracting files... 60%');
               const zip = await JSZip.loadAsync(decryptedZipBuffer);
               const backupJson = await zip.file('backup.json')?.async('string');
               if (!backupJson) {
                 throw new Error('Invalid backup file: missing backup.json');
               }
               decryptedData = JSON.parse(backupJson);
               console.log('BackupService: Successfully decrypted as legacy ZIP format, record count:', decryptedData.recordCount);
           } catch (zipError) {
               console.error('BackupService: Both decryption methods failed');
               throw new Error('Failed to decrypt. Invalid key or format.');
           }
      }
      console.log(`BackupService: Decryption took ${Date.now() - startTime}ms`);

      // Get current device ID
      this.updateImportProgressAlert('Preparing data... 70%');
      const currentDeviceId = await this.getDeviceId();
      console.log('BackupService: Current device ID:', currentDeviceId, 'Import device ID:', decryptedData.deviceId);
      console.log(`BackupService: Data preparation took ${Date.now() - startTime}ms`);

      // Perform conflict-free merge
      this.updateImportProgressAlert('Merging data... 80%');
      console.log('BackupService: Starting data merge');
      await this.mergeData(decryptedData, currentDeviceId);
      console.log(`BackupService: Data merging took ${Date.now() - startTime}ms`);

      // Recalculate Inventory Chain (Full Rebuild)
      this.updateImportProgressAlert('Recalculating inventory... 90%');
      console.log('BackupService: Recalculating inventory balances');
      await InventoryService.recalculateBalancesFrom();
      console.log(`BackupService: Inventory recalculation took ${Date.now() - startTime}ms`);

      this.updateImportProgressAlert('Import complete! 100%');

      console.log('BackupService: Import completed successfully');
      console.log(`BackupService: Total import time: ${Date.now() - startTime}ms`);
      await this.logAction(
        `Import completed: ${decryptedData.recordCount} records from device ${decryptedData.deviceId}`
      );

      this.showAlert(
        'Import Successful',
        `Imported ${decryptedData.recordCount} records successfully.`,
        [{ text: 'OK' }]
      );
      
      // Trigger Background Rehydration
      setTimeout(() => {
          this.logAction("Starting Background Rehydration...");
          this.performAutoBackup().catch(e => console.error(e));
      }, 2000);

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
   * Import from SAF URI
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

      let decryptedData: BackupData;

      // Try Decrypt (New JSON format or Legacy Zip)
      try {
           console.log('BackupService: Attempting to decrypt as new JSON format');
           this.updateImportProgressAlert('Decrypting data... 40%');
           // Try JSON first (Version 2)
           const decryptedString = await EncryptionService.decryptWithPassword(fileContent, key);
           decryptedData = JSON.parse(decryptedString);
           console.log('BackupService: Successfully decrypted as JSON format, record count:', decryptedData.recordCount);
      } catch (e) {
           console.log('BackupService: JSON decryption failed, trying legacy ZIP format');
           // Fallback to Legacy Zip (Version 1)
           try {
               const decryptedZipBuffer = await EncryptionService.decryptZip(fileContent, key);
               this.updateImportProgressAlert('Extracting files... 60%');
               const zip = await JSZip.loadAsync(decryptedZipBuffer);
               const backupJson = await zip.file('backup.json')?.async('string');
               if (!backupJson) {
                  throw new Error('Invalid backup file: missing backup.json');
               }
               decryptedData = JSON.parse(backupJson);
               console.log('BackupService: Successfully decrypted as legacy ZIP format, record count:', decryptedData.recordCount);
           } catch (zipError) {
               console.error('BackupService: Both decryption methods failed');
               throw new Error('Failed to decrypt. Invalid key or format.');
           }
      }
      console.log(`BackupService: Decryption took ${Date.now() - startTime}ms`);

      // Get current device ID
      this.updateImportProgressAlert('Preparing data... 70%');
      const currentDeviceId = await this.getDeviceId();
      console.log('BackupService: Current device ID:', currentDeviceId, 'Import device ID:', decryptedData.deviceId);
      console.log(`BackupService: Data preparation took ${Date.now() - startTime}ms`);

      // Perform conflict-free merge
      this.updateImportProgressAlert('Merging data... 80%');
      console.log('BackupService: Starting data merge');
      await this.mergeData(decryptedData, currentDeviceId);
      console.log(`BackupService: Data merging took ${Date.now() - startTime}ms`);

      // Recalculate Inventory Chain (Full Rebuild)
      this.updateImportProgressAlert('Recalculating inventory... 90%');
      console.log('BackupService: Recalculating inventory balances');
      await InventoryService.recalculateBalancesFrom();
      console.log(`BackupService: Inventory recalculation took ${Date.now() - startTime}ms`);

      this.updateImportProgressAlert('Import complete! 100%');

      console.log('BackupService: Import completed successfully');
      console.log(`BackupService: Total import time: ${Date.now() - startTime}ms`);
      await this.logAction(
        `SAF import completed: ${decryptedData.recordCount} records from device ${decryptedData.deviceId}`
      );

      this.showAlert(
        'Import Successful',
        `Imported ${decryptedData.recordCount} records successfully.`,
        [{ text: 'OK' }]
      );

      // Trigger Background Rehydration
      setTimeout(() => {
          this.performAutoBackup().catch(e => console.error('BackupService: Background rehydration failed:', e));
      }, 2000);

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
   * Conflict-free merge system
   */
  private static async mergeData(
    backupData: BackupData,
    currentDeviceId: string
  ): Promise<void> {
    await this.logAction(`Starting data merge: ${backupData.recordCount} records from device ${backupData.deviceId}`);
    const { records } = backupData;
    const db = DatabaseService.getDatabase();

    // Stats tracking
    let stats = {
      customers: 0,
      transactions: 0,
      entries: 0,
      ledger: 0,
      stock: 0,
      balanceUpdates: 0
    };

    // --- 1. Batch Merge Customers ---
    await this.logAction('Starting customer merge');
    const existingCustomers = await CustomerService.getAllCustomers();
    const customerMap = new Map(existingCustomers.map((c) => [c.id, c]));
    const customersToInsert: Customer[] = [];
    const customersToUpdate: Customer[] = [];

    for (const customer of records.customers) {
      if (!customerMap.has(customer.id)) {
        customersToInsert.push(customer);
      } else {
        const existing = customerMap.get(customer.id)!;
        if (new Date(customer.lastTransaction || 0) > new Date(existing.lastTransaction || 0)) {
          customersToUpdate.push(customer);
        }
      }
    }

    // Process Customer Batches
    if (customersToInsert.length > 0) {
      // For new customers, we insert them with their backup balances initially
      // (Balances will be recalculated/aggregated later in the process)
      for (const c of customersToInsert) {
        await CustomerService.saveCustomer(c);
      }
      stats.customers += customersToInsert.length;
    }
    // Updates are handled individually for safety, but we could batch them too if needed
    for (const c of customersToUpdate) {
      await CustomerService.saveCustomer(c);
      stats.customers++; // Count updates as activity
    }
    await this.logAction(`Customer merge completed: ${stats.customers} customers processed`);

    // --- 2. Prepare Transactions & Aggregations ---
    await this.logAction('Starting transaction preparation and aggregation');
    const existingTransactions = await TransactionService.getAllTransactions();
    // Create a Set for fast lookup of existing IDs
    const existingTxnIds = new Set(existingTransactions.map(t => t.id));
    // Composite key map to detect cross-device duplicates
    const transactionMap = new Map(
      existingTransactions.map((t) => [`${t.id}_${currentDeviceId}`, t])
    );

    const transactionsToInsert: any[] = [];
    const entriesToInsert: any[] = [];
    const legacyLedgerToInsert: any[] = []; // For old backups (payment migration)
    
    // Aggregation Map for Customer Balances: CustomerID -> { balance: 0, metal: { gold999: 0... } }
    const customerBalanceEffects = new Map<string, {
      moneyChange: number;
      lastTxnDate: string;
      metalChanges: Record<string, number>;
    }>();

    for (const transaction of records.transactions) {
      const key = `${transaction.id}_${backupData.deviceId}`;
      
      // Skip if we already have this exact transaction from this device
      if (transactionMap.has(key)) continue;

      // Handle ID Conflict (Same ID, different device source)
      if (existingTxnIds.has(transaction.id)) {
        transaction.id = `${transaction.id}_imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Verify Customer Exists
      // (We can use our local map since we just merged customers)
      if (!customerMap.has(transaction.customerId) && !customersToInsert.find(c => c.id === transaction.customerId)) {
        console.warn('Skipping orphan transaction:', transaction.id);
        continue;
      }

      // Add to batch lists
      transactionsToInsert.push(transaction);
      
      if (transaction.entries) {
        // Fix entry parent IDs if transaction ID changed
        transaction.entries.forEach((e: any) => e.transaction_id = transaction.id);
        entriesToInsert.push(...transaction.entries);
      }

      // --- Calculate Balance Effects (In Memory) ---
      // This replaces the N+1 DB calls for balance updates
      if (!customerBalanceEffects.has(transaction.customerId)) {
        customerBalanceEffects.set(transaction.customerId, { 
          moneyChange: 0, 
          lastTxnDate: '', 
          metalChanges: {} 
        });
      }
      
      const effect = customerBalanceEffects.get(transaction.customerId)!;
      
      // Update last transaction date
      if (!effect.lastTxnDate || new Date(transaction.createdAt) > new Date(effect.lastTxnDate)) {
        effect.lastTxnDate = transaction.createdAt;
      }

      const isMetalOnly = transaction.entries?.some((entry: any) => entry.metalOnly === true);

      if (!isMetalOnly) {
        // Money Logic: Customer Balance = (Credit) - (Debit)
        // Transaction Total = Amount customer owes merchant (Debit)
        // Amount Paid = Amount merchant received (Credit)
        // Net Change = AmountPaid - Total
        effect.moneyChange += ((transaction.amountPaid || 0) - transaction.total);
      } else {
        // Metal Logic
        transaction.entries?.forEach((entry: any) => {
          if (entry.metalOnly && entry.type !== 'money') {
            const itemType = entry.itemType;
            let metalAmount = 0;
            
            // Calculate pure weight based on type
            if (entry.itemType === 'rani') {
              metalAmount = entry.pureWeight || 0;
            } else if (entry.itemType === 'rupu') {
               // Special case for rupu return
               if (entry.rupuReturnType === 'silver' && entry.netWeight !== undefined) {
                 metalAmount = entry.netWeight;
               } else {
                 metalAmount = entry.pureWeight || 0;
               }
            } else {
              metalAmount = entry.weight || 0;
            }

            // Sell = Merchant gives metal = Customer owes metal (Positive debt? Depends on system)
            // Based on previous logic: Sell = -Amount, Purchase = +Amount (Or vice versa, aligned with previous logic)
            // Previous Logic: "metalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;"
            const finalAmount = entry.type === 'sell' ? -metalAmount : metalAmount;
            
            effect.metalChanges[itemType] = (effect.metalChanges[itemType] || 0) + finalAmount;
          }
        });
      }

      // Handle Legacy Payments (Convert to Ledger)
      const legacyTx = transaction as any;
      if ((legacyTx.lastGivenMoney !== undefined || legacyTx.lastToLastGivenMoney !== undefined) && (transaction.amountPaid || 0) > 0) {
         legacyLedgerToInsert.push({
            id: `payment_${transaction.id}_imported`,
            transactionId: transaction.id,
            customerId: transaction.customerId,
            customerName: transaction.customerName,
            date: transaction.date,
            type: transaction.total >= 0 ? 'receive' : 'give',
            itemType: 'money',
            amount: transaction.amountPaid,
            createdAt: transaction.createdAt
         });
      }
    }
    await this.logAction(`Transaction preparation completed: ${transactionsToInsert.length} transactions to insert, ${entriesToInsert.length} entries to insert`);

    // --- 3. Execute Batch Inserts (The Speedup) ---
    await this.logAction('Starting batch inserts');
    
    // Batch Insert Transactions
    if (transactionsToInsert.length > 0) {
      await this.batchInsertTransactions(db, transactionsToInsert);
      stats.transactions += transactionsToInsert.length;
    }

    // Batch Insert Entries
    if (entriesToInsert.length > 0) {
      await this.batchInsertTransactionEntries(db, entriesToInsert);
      stats.entries += entriesToInsert.length;
    }
    await this.logAction(`Batch inserts completed: ${stats.transactions} transactions, ${stats.entries} entries`);

    // --- 4. Batch Merge Ledger ---
    await this.logAction('Starting ledger merge');
    const existingLedger = await LedgerService.getAllLedgerEntries();
    const ledgerMap = new Set(existingLedger.map(l => l.id));
    const ledgerToInsert: any[] = [...legacyLedgerToInsert];

    // Filter new ledger entries
    for (const entry of records.ledger) {
      if (!ledgerMap.has(entry.id)) {
        // Convert legacy 'entries' array format to flat format if needed
        if (entry.entries && Array.isArray(entry.entries)) {
           // Flatten logic (Money)
           const amtReceived = entry.amountReceived || 0;
           const amtGiven = entry.amountGiven || 0;
           if (amtReceived > 0 || amtGiven > 0) {
             ledgerToInsert.push({
               id: `${entry.id}_money`,
               transactionId: entry.transactionId,
               customerId: entry.customerId,
               customerName: entry.customerName,
               date: entry.date,
               type: amtReceived > 0 ? 'receive' : 'give',
               itemType: 'money',
               amount: amtReceived + amtGiven,
               createdAt: entry.createdAt
             });
           }
           // Flatten logic (Items)
           entry.entries.forEach((subItem: any) => {
             ledgerToInsert.push({
               id: subItem.id || `ledger_item_${Date.now()}_${Math.random()}`,
               transactionId: entry.transactionId,
               customerId: entry.customerId,
               customerName: entry.customerName,
               date: entry.date,
               type: subItem.type,
               itemType: subItem.itemType,
               weight: subItem.weight || 0,
               touch: subItem.touch || 0,
               amount: 0,
               createdAt: subItem.createdAt || entry.createdAt
             });
           });
        } else {
           // Standard new format
           ledgerToInsert.push(entry);
        }
      }
    }

    if (ledgerToInsert.length > 0) {
      await this.batchInsertLedgerEntries(db, ledgerToInsert);
      stats.ledger += ledgerToInsert.length;
    }
    await this.logAction(`Ledger merge completed: ${stats.ledger} ledger entries`);

    // --- 5. Apply Aggregated Balance Updates ---
    await this.logAction('Starting aggregated balance updates');
    // This reduces N updates to 1 update per active customer
    for (const [customerId, effect] of customerBalanceEffects) {
      // Fetch fresh balance (snapshot)
      const current = await CustomerService.getCustomerById(customerId);
      if (current) {
        // Apply Money
        let newBalance = current.balance + effect.moneyChange;
        
        // Apply Metals
      const newMetals = { ...current.metalBalances };
      for (const [type, change] of Object.entries(effect.metalChanges)) {
        // Cast string to valid key type
        const key = type as keyof typeof newMetals;
        
        // Now safely index
        newMetals[key] = (newMetals[key] || 0) + change;
      }

        // Apply Date
        const newDate = (!current.lastTransaction || new Date(effect.lastTxnDate) > new Date(current.lastTransaction))
          ? effect.lastTxnDate
          : current.lastTransaction;

        // Save
        // Optimization: We could add a specific update method for this, but standard save is okay since it's now 1 per customer
        await CustomerService.saveCustomer({
          ...current,
          balance: newBalance,
          metalBalances: newMetals,
          lastTransaction: newDate
        });
        stats.balanceUpdates++;
      }
    }
    await this.logAction(`Balance updates completed: ${stats.balanceUpdates} customers updated`);

    // --- 6. Handle Inventory & Stock ---
    await this.logAction('Starting inventory and stock handling');
    // (Existing logic for Base Inventory & Stock is fine as-is, volume is low)
    if (records.baseInventory) {
       // ... existing base inventory logic ...
       // (Keeping the logic provided in previous file for safety)
       const currentBaseInventory = await InventoryService.getBaseInventory();
       const isDifferent = Object.keys(records.baseInventory).some(key => 
         records.baseInventory![key as keyof typeof records.baseInventory] !== currentBaseInventory[key as keyof typeof currentBaseInventory]
       );
       if (isDifferent) {
          // In a background merge, we might auto-accept or skip.
          // For now, let's auto-accept if it's an automated process to avoid blocking
          await InventoryService.setBaseInventory(records.baseInventory);
       }
    }

    if (records.raniRupaStock) {
      const existingStock = await RaniRupaStockService.getAllStock();
      const stockMap = new Set(existingStock.map(s => s.stock_id));
      for (const item of records.raniRupaStock) {
        if (!stockMap.has(item.stock_id)) {
          await RaniRupaStockService.restoreStock(item.stock_id, item.itemtype, item.weight, item.touch);
          stats.stock++;
        }
      }
    }
    await this.logAction(`Inventory and stock handling completed: ${stats.stock} stock items`);

    console.log(`BackupService: Batch Import summary - Customers: ${stats.customers}, Txns: ${stats.transactions}, Entries: ${stats.entries}, Ledger: ${stats.ledger}`);
    await this.logAction(`Batch Merge completed: +${stats.transactions} txns, +${stats.balanceUpdates} bal updates`);
  }

  // --- HELPER: Batch Insert Transactions ---
  private static async batchInsertTransactions(db: any, transactions: any[]): Promise<void> {
    const CHUNK_SIZE = 50; // Safe for SQLite variables
    for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
      const batch = transactions.slice(i, i + CHUNK_SIZE);
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const params: any[] = [];
      
      batch.forEach(t => {
        params.push(
          t.id, t.deviceId || null, t.customerId, t.customerName, 
          t.date, t.total, t.amountPaid, t.createdAt, t.lastUpdatedAt
        );
      });

      await db.runAsync(
        `INSERT OR REPLACE INTO transactions 
         (id, deviceId, customerId, customerName, date, total, amountPaid, createdAt, lastUpdatedAt) 
         VALUES ${placeholders}`,
        params
      );
    }
  }

  // --- HELPER: Batch Insert Entries ---
  private static async batchInsertTransactionEntries(db: any, entries: any[]): Promise<void> {
    const CHUNK_SIZE = 40; // Smaller chunk size because entries have many columns
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const batch = entries.slice(i, i + CHUNK_SIZE);
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const params: any[] = [];

      batch.forEach(e => {
        params.push(
          e.id, e.transaction_id, e.type, e.itemType, 
          e.weight || null, e.price || null, e.touch || null, e.cut || null, e.extraPerKg || null,
          e.pureWeight || null, e.moneyType || null, e.amount || null, e.metalOnly ? 1 : 0,
          e.stock_id || null, e.subtotal, e.createdAt, e.lastUpdatedAt
        );
      });

      await db.runAsync(
        `INSERT OR REPLACE INTO transaction_entries 
         (id, transaction_id, type, itemType, weight, price, touch, cut, extraPerKg, 
          pureWeight, moneyType, amount, metalOnly, stock_id, subtotal, createdAt, lastUpdatedAt)
         VALUES ${placeholders}`,
        params
      );
    }
  }

  // --- HELPER: Batch Insert Ledger ---
  private static async batchInsertLedgerEntries(db: any, ledgerEntries: any[]): Promise<void> {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < ledgerEntries.length; i += CHUNK_SIZE) {
      const batch = ledgerEntries.slice(i, i + CHUNK_SIZE);
      // Note: INSERT OR IGNORE to prevent crashing on duplicates
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const params: any[] = [];

      batch.forEach(e => {
        params.push(
          e.id, e.transactionId, e.customerId, e.customerName, e.date,
          e.type, e.itemType, e.weight || 0, e.touch || 0, e.amount || 0, e.createdAt
        );
      });

      await db.runAsync(
        `INSERT OR IGNORE INTO ledger_entries 
         (id, transactionId, customerId, customerName, date, type, itemType, weight, touch, amount, createdAt)
         VALUES ${placeholders}`,
        params
      );
    }
  }
  /**
   * Auto backup with Notification Support & Garbage Collection
   */
  static async performAutoBackup(force: boolean = false): Promise<boolean> {
    console.log('BackupService: Starting incremental auto-backup, force:', force);
    try {
      await this.logAction('Starting incremental auto-backup...');
      
      // Load Manifest
      console.log('BackupService: Loading current manifest');
      const manifest = await ObjectStorageService.getManifest();
      const newManifest: Record<string, string> = {};
      let changesCount = 0;

      // Helper to process a list of items
      const processItems = async (items: any[], prefix: string) => {
           for (const item of items) {
               const id = item.id || 'single';
               const key = `${prefix}:${id}`;
               const canonical = CanonicalService.stringify(item);
               const hash = await HashService.computeHash(canonical);
               
               if (manifest[key] !== hash) {
                   await ObjectStorageService.saveRawObject(canonical, hash);
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
      if (recordData.baseInventory) {
        await processItems([recordData.baseInventory], 'inventory');
      }

      // Save Manifest
      console.log('BackupService: Saving updated manifest');
      await ObjectStorageService.saveManifest(newManifest);
      await this.logAction(`Manifest updated with ${changesCount} changes`);
      
      // Update Snapshot
      const deviceId = await this.getDeviceId();
      const backupData: BackupData = {
          exportType: 'auto',
          timestamp: Date.now(),
          recordCount: Object.keys(newManifest).length,
          deviceId,
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
      
      if (notifEnabled && isAutoEnabled && !force && changesCount > 0) {
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
    try {
      // Check if SAF directory URI is configured
      const safDirectoryUri = await this.getSAFDirectoryUri();
      if (!safDirectoryUri) {
        // Don't log if no external storage is configured
        return;
      }

      const now = new Date();
      const timestamp = now.toISOString();
      const logMessage = `[${timestamp}] ${message}\n`;

      // Get or create log file URI
      let logFileUri = await SecureStore.getItemAsync(SECURE_STORE_KEYS.BACKUP_LOG_FILE_URI);

      if (!logFileUri) {
        // Create new log file in the root SAF directory
        logFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          safDirectoryUri,
          'logs',
          'text/plain'
        );
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.BACKUP_LOG_FILE_URI, logFileUri);
        // Write initial content
        await FileSystem.StorageAccessFramework.writeAsStringAsync(
          logFileUri,
          logMessage,
          { encoding: FileSystem.EncodingType.UTF8 }
        );
      } else {
        // Read existing content and append
        try {
          const existingLog = await FileSystem.StorageAccessFramework.readAsStringAsync(
            logFileUri,
            { encoding: FileSystem.EncodingType.UTF8 }
          );
          const updatedLog = existingLog + logMessage;
          await FileSystem.StorageAccessFramework.writeAsStringAsync(
            logFileUri,
            updatedLog,
            { encoding: FileSystem.EncodingType.UTF8 }
          );
        } catch (readError) {
          // File might not exist anymore, recreate it
          logFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            safDirectoryUri,
            'logs',
            'text/plain'
          );
          await SecureStore.setItemAsync(SECURE_STORE_KEYS.BACKUP_LOG_FILE_URI, logFileUri);
          await FileSystem.StorageAccessFramework.writeAsStringAsync(
            logFileUri,
            logMessage,
            { encoding: FileSystem.EncodingType.UTF8 }
          );
        }
      }

    } catch (error) {
      // Silently fail if logging doesn't work, just console log
      console.error('Error logging action:', error);
    }
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
