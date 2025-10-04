import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import JSZip from 'jszip';
import { EncryptionService } from './encryptionService';
import { DatabaseService } from './database';

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

interface BackupData {
  exportType: 'manual' | 'auto';
  timestamp: number;
  recordCount: number;
  deviceId: string;
  records: {
    customers: any[];
    transactions: any[];
    ledger: any[];
  };
}

type AlertFunction = (title: string, message: string, buttons?: any[]) => void;

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
        await DatabaseService.setStoragePermissionGranted(true);
        return true;
      }

      // Check if permission was already granted
      const permissionGranted = await DatabaseService.getStoragePermissionGranted();
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
        await DatabaseService.setStoragePermissionGranted(false);
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
        await DatabaseService.setStoragePermissionGranted(true);
        return true;
      } catch (dirError) {
        console.error('Directory creation error:', dirError);
        await DatabaseService.setStoragePermissionGranted(false);
        return false;
      }
    } catch (error) {
      console.error('Error requesting storage permission:', error);
      await DatabaseService.setStoragePermissionGranted(false);
      return false;
    }
  }

  /**
   * Check if storage permission is granted
   */
  static async hasStoragePermission(): Promise<boolean> {
    try {
      return await DatabaseService.getStoragePermissionGranted();
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
              // Ignore cleanup errors
              console.log('Could not clean up temp file:', error);
            }
          }, 30000); // 30 second delay
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
    const customers = await DatabaseService.getAllCustomers();
    const transactions = await DatabaseService.getAllTransactions();
    const ledger = await DatabaseService.getAllLedgerEntries();

    return {
      customers,
      transactions,
      ledger,
    };
  }

  /**
   * Collect data from database for a specific date
   */
  private static async collectDatabaseDataForDate(targetDate: Date): Promise<BackupData['records']> {
    const customers = await DatabaseService.getAllCustomers();
    const allTransactions = await DatabaseService.getAllTransactions();
    const allLedger = await DatabaseService.getAllLedgerEntries();

    // Filter transactions for the target date
    const targetDateString = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    const transactions = allTransactions.filter(transaction => {
      return transaction.date === targetDateString;
    });

    // Filter ledger entries for transactions from the target date
    const transactionIds = new Set(transactions.map(t => t.id));
    const ledger = allLedger.filter(entry => transactionIds.has(entry.transactionId));

    return {
      customers,
      transactions,
      ledger,
    };
  }

  /**
   * Manual export to user-accessible storage using SAF
   */
  static async exportDataToUserStorage(exportType: 'today' | 'all' = 'all'): Promise<{ success: boolean; fileUri?: string; fileName?: string }> {
    try {

      // Check if this is the first export/auto backup
      const isFirstTime = await this.isFirstExportOrAutoBackup();
      if (isFirstTime) {
        // Request directory permissions using SAF FIRST
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (!permissions.granted) {
          this.showAlert('Permission Denied', 'Cannot access storage location.');
          return { success: false };
        }

        // Save the directory URI for future use
        await this.setSAFDirectoryUri(permissions.directoryUri);
        // Mark first export/auto backup as done
        await this.markFirstExportOrAutoBackupDone();
      }

      // Get encryption key
      const key = await this.getEncryptionKey();
      if (!key) {
        this.showAlert('Error', 'Encryption key not found. Please set up encryption first.');
        return { success: false };
      }

      // Get saved directory URI (should exist now)
      const safDirectoryUri = await this.getSAFDirectoryUri();
      if (!safDirectoryUri) {
        this.showAlert('Error', 'No backup location configured. Please try again.');
        return { success: false };
      }

      // Show initial progress
      this.updateProgressAlert('Starting export... 0%');

      // Step 1: Collect data with granular progress updates
      this.updateProgressAlert('Loading customers... 10%');
      const customers = await DatabaseService.getAllCustomers();
      
      this.updateProgressAlert('Loading transactions... 30%');
      const transactions = await DatabaseService.getAllTransactions();
      
      this.updateProgressAlert('Loading ledger... 50%');
      const ledger = await DatabaseService.getAllLedgerEntries();
      
      const records = { customers, transactions, ledger };
      
      this.updateProgressAlert('Preparing backup data... 60%');
      const deviceId = await this.getDeviceId();

      const backupData: BackupData = {
        exportType: 'manual',
        timestamp: Date.now(),
        recordCount:
          records.customers.length +
          records.transactions.length +
          records.ledger.length,
        deviceId,
        records,
      };

      this.updateProgressAlert('Creating zip file... 70%');
      // Create zip file
      const zip = new JSZip();
      zip.file('backup.json', JSON.stringify(backupData, null, 2));
      const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });

      this.updateProgressAlert('Encrypting data... 80%');
      // Encrypt zip
      const encrypted = await EncryptionService.encryptZip(zipBlob, key);

      this.updateProgressAlert('Saving file... 90%');
      // Create file using SAF in root directory
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = exportType === 'today'
        ? `export_${dateStr}.encrypted`
        : `export_all_${dateStr}.encrypted`;

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

      await this.logAction(`SAF export completed: ${backupData.recordCount} records, file: ${fileName}`);

      return { success: true, fileUri, fileName };
    } catch (error) {
      console.error('📤 SAF export error:', error);
      await this.logAction(`SAF export error: ${error}`);
      this.showAlert('Export Failed', 'Failed to export data. Please try again.');
      return { success: false };
    }
  }

  /**
   * Manual import with conflict-free merge
   */
  static async importData(fileUri: string): Promise<boolean> {
    try {
      
      // Check storage permission first
      const hasPermission = await this.hasStoragePermission();
      if (!hasPermission) {
        const granted = await this.requestStoragePermission();
        if (!granted) {
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
        this.showAlert('Error', 'Encryption key not found. Please set up encryption first.');
        return false;
      }

      this.updateImportProgressAlert('Starting import... 0%');

      // Read encrypted file
      this.updateImportProgressAlert('Reading backup file... 20%');
      const fileContent = await FileSystem.readAsStringAsync(fileUri);

      // Decrypt zip
      this.updateImportProgressAlert('Decrypting data... 40%');
      const decryptedZipBuffer = await EncryptionService.decryptZip(fileContent, key);

      // Extract zip
      this.updateImportProgressAlert('Extracting files... 60%');
      const zip = await JSZip.loadAsync(decryptedZipBuffer);
      const backupJson = await zip.file('backup.json')?.async('string');
      if (!backupJson) {
        throw new Error('Invalid backup file: missing backup.json');
      }
      const decryptedData: BackupData = JSON.parse(backupJson);

      // Get current device ID
      this.updateImportProgressAlert('Preparing data... 70%');
      const currentDeviceId = await this.getDeviceId();

      // Perform conflict-free merge
      this.updateImportProgressAlert('Merging data... 90%');
      await this.mergeData(decryptedData, currentDeviceId);

      this.updateImportProgressAlert('Import complete! 100%');

      await this.logAction(
        `Import completed: ${decryptedData.recordCount} records from device ${decryptedData.deviceId}`
      );

      this.showAlert(
        'Import Successful',
        `Imported ${decryptedData.recordCount} records successfully.`,
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
   * Import from SAF URI
   */
  static async importDataFromSAF(fileUri: string): Promise<boolean> {
    try {

      // Get encryption key
      const key = await this.getEncryptionKey();
      if (!key) {
        this.showAlert('Error', 'Encryption key not found. Please set up encryption first.');
        return false;
      }

      this.updateImportProgressAlert('Starting import... 0%');

      // Read encrypted file using SAF
      this.updateImportProgressAlert('Reading backup file... 20%');
      const fileContent = await FileSystem.StorageAccessFramework.readAsStringAsync(
        fileUri,
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      // Decrypt zip
      this.updateImportProgressAlert('Decrypting data... 40%');
      const decryptedZipBuffer = await EncryptionService.decryptZip(fileContent, key);

      // Extract zip
      this.updateImportProgressAlert('Extracting files... 60%');
      const zip = await JSZip.loadAsync(decryptedZipBuffer);
      const backupJson = await zip.file('backup.json')?.async('string');
      if (!backupJson) {
        throw new Error('Invalid backup file: missing backup.json');
      }
      const decryptedData: BackupData = JSON.parse(backupJson);

      // Get current device ID
      this.updateImportProgressAlert('Preparing data... 70%');
      const currentDeviceId = await this.getDeviceId();

      // Perform conflict-free merge
      this.updateImportProgressAlert('Merging data... 90%');
      await this.mergeData(decryptedData, currentDeviceId);

      this.updateImportProgressAlert('Import complete! 100%');

      await this.logAction(
        `SAF import completed: ${decryptedData.recordCount} records from device ${decryptedData.deviceId}`
      );

      this.showAlert(
        'Import Successful',
        `Imported ${decryptedData.recordCount} records successfully.`,
        [{ text: 'OK' }]
      );

      return true;
    } catch (error) {
      console.error('📥 SAF import error:', error);
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
    const { records } = backupData;

    // Merge customers (by ID)
    const existingCustomers = await DatabaseService.getAllCustomers();
    const customerMap = new Map(existingCustomers.map((c) => [c.id, c]));

    for (const customer of records.customers) {
      if (!customerMap.has(customer.id)) {
        await DatabaseService.saveCustomer(customer);
      } else {
        // Update if backup is newer
        const existing = customerMap.get(customer.id)!;
        if (
          new Date(customer.lastTransaction || 0) >
          new Date(existing.lastTransaction || 0)
        ) {
          await DatabaseService.saveCustomer(customer);
        }
      }
    }

    // Merge transactions (conflict-free by txn_id + device_id)
    const existingTransactions = await DatabaseService.getAllTransactions();
    const transactionMap = new Map(
      existingTransactions.map((t) => [`${t.id}_${currentDeviceId}`, t])
    );

    for (const transaction of records.transactions) {
      const key = `${transaction.id}_${backupData.deviceId}`;
      if (!transactionMap.has(key)) {
        // Check if same transaction ID exists with different device
        const sameIdExists = existingTransactions.some(
          (t) => t.id === transaction.id
        );

        if (sameIdExists) {
          // Rename transaction ID to avoid conflict
          transaction.id = `${transaction.id}_imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        // Save transaction directly to avoid ID conflicts
        const allTransactions = await DatabaseService.getAllTransactions();
        allTransactions.push(transaction);
        await AsyncStorage.setItem('@bulliondesk_transactions', JSON.stringify(allTransactions));
        
      }
    }

    // Merge ledger entries (by ID) - only add if doesn't exist
    const existingLedger = await DatabaseService.getAllLedgerEntries();
    const ledgerMap = new Map(existingLedger.map((l) => [l.id, l]));

    // Save ledger entries that don't exist
    for (const ledgerEntry of records.ledger) {
      if (!ledgerMap.has(ledgerEntry.id)) {
        // Save ledger entry directly to AsyncStorage
        const allLedger = await DatabaseService.getAllLedgerEntries();
        allLedger.push(ledgerEntry);
        await AsyncStorage.setItem('@bulliondesk_ledger', JSON.stringify(allLedger));
      }
    }

    // Force inventory recalculation after import
    await this.recalculateInventoryAfterImport();
  }

  /**
   * Recalculate inventory after import to ensure consistency
   */
  private static async recalculateInventoryAfterImport(): Promise<void> {
    try {
      // Get all transactions and recalculate inventory
      const allTransactions = await DatabaseService.getAllTransactions();
      const baseInventory = await DatabaseService.getBaseInventory();

      // Reset to base inventory
      const currentInventory = { ...baseInventory };

      // Recalculate based on all transactions
      allTransactions.forEach(trans => {
        trans.entries.forEach(entry => {
          if (entry.type === 'sell') {
            if (entry.itemType === 'rani') {
              currentInventory.rani -= entry.weight || 0;
              currentInventory.gold999 -= entry.actualGoldGiven || 0;
            } else if (entry.weight) {
              const weight = entry.pureWeight || entry.weight;
              if (entry.itemType in currentInventory) {
                currentInventory[entry.itemType as keyof typeof currentInventory] -= weight;
              }
            }
          } else if (entry.type === 'purchase') {
            if (entry.itemType === 'rupu' && entry.rupuReturnType === 'silver') {
              currentInventory.rupu += entry.weight || 0;
              currentInventory.silver -= entry.silverWeight || 0;
            } else if (entry.weight) {
              const weight = entry.pureWeight || entry.weight;
              if (entry.itemType in currentInventory) {
                currentInventory[entry.itemType as keyof typeof currentInventory] += weight;
              }
            }
          }
        });
        // Update money inventory
        if (trans.total >= 0) {
          currentInventory.money += trans.amountPaid;
        } else {
          currentInventory.money -= trans.amountPaid;
        }
      });

    } catch (error) {
      console.error('Error recalculating inventory after import:', error);
    }
  }

  /**
   * Auto backup
   */
  static async performAutoBackup(): Promise<boolean> {
    try {
      const key = await this.getEncryptionKey();
      if (!key) {
        await this.logAction('Auto backup skipped: No encryption key');
        return false;
      }

      // Check if enabled
      const enabled = await DatabaseService.getAutoBackupEnabled();
      if (!enabled) {
        await this.logAction('Auto backup skipped: Disabled');
        return false;
      }

      // Get saved directory URI (should exist now)
      const safDirectoryUri = await this.getSAFDirectoryUri();
      if (!safDirectoryUri) {
        await this.logAction('Auto backup skipped: No external storage location configured');
        return false;
      }

      // Collect data
      const records = await this.collectDatabaseData();
      const deviceId = await this.getDeviceId();

      const backupData: BackupData = {
        exportType: 'auto',
        timestamp: Date.now(),
        recordCount:
          records.customers.length +
          records.transactions.length +
          records.ledger.length,
        deviceId,
        records,
      };

      // Create zip file
      const zip = new JSZip();
      zip.file('backup.json', JSON.stringify(backupData, null, 2));
      const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });

      // Encrypt zip
      const encrypted = await EncryptionService.encryptZip(zipBlob, key);

      // Use saved SAF directory

      const filename = 'autobackup.encrypted';

      // Delete existing auto backup file if it exists
      try {
        const directoryContents = await FileSystem.StorageAccessFramework.readDirectoryAsync(safDirectoryUri);
        for (const uri of directoryContents) {
          // Extract filename from URI (SAF URIs end with :filename)
          const fileNameFromUri = uri.split(':').pop();
          if (fileNameFromUri === filename) {
            await FileSystem.StorageAccessFramework.deleteAsync(uri);
            break;
          }
        }
      } catch (error) {
        // Ignore errors when trying to delete - file might not exist
      }

      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        safDirectoryUri,
        filename,
        'application/octet-stream'
      );

      // Write encrypted data using SAF
      await FileSystem.StorageAccessFramework.writeAsStringAsync(
        fileUri,
        encrypted,
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      // Update last backup time
      await DatabaseService.setLastBackupTime(Date.now());

      await this.logAction(
        `Auto backup completed: ${backupData.recordCount} records, file: ${filename} (SAF)`
      );

      return true;
    } catch (error) {
      console.error('Auto backup error:', error);
      await this.logAction(`Auto backup error: ${error}`);
      return false;
    }
  }

  /**
   * Enable/disable auto backup
   */
  static async setAutoBackupEnabled(enabled: boolean): Promise<void> {
    try {
      const success = await DatabaseService.setAutoBackupEnabled(enabled);
      if (!success) {
        throw new Error('Failed to save auto backup setting');
      }

      // If enabling auto backup, check if we need to set up storage
      if (enabled) {
        const isFirstTime = await this.isFirstExportOrAutoBackup();
        if (isFirstTime) {
          // First time - request directory permissions
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

          if (permissions.granted) {
            // Save the directory URI for future use
            await this.setSAFDirectoryUri(permissions.directoryUri);
            // Mark first export/auto backup as done
            await this.markFirstExportOrAutoBackupDone();
          } else {
            // User denied permission, disable auto backup
            await DatabaseService.setAutoBackupEnabled(false);
            throw new Error('Storage permission required for auto backup');
          }
        }
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
      return await DatabaseService.getAutoBackupEnabled();
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

      const lastBackup = await DatabaseService.getLastBackupTime();
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

  private static async logAction(message: string): Promise<void> {
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
}
