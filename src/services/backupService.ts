import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as Device from 'expo-device';
import * as MediaLibrary from 'expo-media-library';
import { Alert, Platform } from 'react-native';
import { EncryptionService } from './encryptionService';
import { DatabaseService } from './database';

const SECURE_STORE_KEYS = {
  ENCRYPTION_KEY: 'backup_encryption_key',
  DEVICE_ID: 'device_id',
  AUTO_BACKUP_ENABLED: 'auto_backup_enabled',
  LAST_BACKUP_TIME: 'last_backup_time',
  FIRST_LAUNCH_DONE: 'first_launch_done',
  STORAGE_PERMISSION_GRANTED: 'storage_permission_granted',
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

export class BackupService {
  private static readonly BASE_DIR = `${FileSystem.documentDirectory}BullionDeskBackup`;
  private static readonly EXPORTS_DIR = `${this.BASE_DIR}/Exports`;
  private static readonly AUTO_DIR = `${this.BASE_DIR}/Auto`;
  private static readonly LOGS_DIR = `${this.BASE_DIR}/logs`;

  /**
   * Request storage permissions (Android)
   */
  static async requestStoragePermission(): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') {
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.STORAGE_PERMISSION_GRANTED,
          'true'
        );
        return true;
      }

      // Check if permission was already granted
      const permissionGranted = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.STORAGE_PERMISSION_GRANTED
      );
      if (permissionGranted === 'true') {
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
        console.log('Storage permission denied');
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.STORAGE_PERMISSION_GRANTED,
          'false'
        );
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
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.STORAGE_PERMISSION_GRANTED,
          'true'
        );
        console.log('✅ Storage permission granted');
        return true;
      } catch (dirError) {
        console.error('Directory creation error:', dirError);
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.STORAGE_PERMISSION_GRANTED,
          'false'
        );
        return false;
      }
    } catch (error) {
      console.error('Error requesting storage permission:', error);
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.STORAGE_PERMISSION_GRANTED,
        'false'
      );
      return false;
    }
  }

  /**
   * Check if storage permission is granted
   */
  static async hasStoragePermission(): Promise<boolean> {
    try {
      const permission = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.STORAGE_PERMISSION_GRANTED
      );
      return permission === 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize backup directory structure
   */
  static async initializeDirectories(): Promise<boolean> {
    try {
      const hasPermission = await this.hasStoragePermission();
      if (!hasPermission) {
        const granted = await this.requestStoragePermission();
        if (!granted) {
          return false;
        }
      }

      // Check if base directory exists
      const baseInfo = await FileSystem.getInfoAsync(this.BASE_DIR);
      if (!baseInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.BASE_DIR, { intermediates: true });
        await this.logAction('Created base directory');
      }

      // Create subdirectories
      const dirs = [this.EXPORTS_DIR, this.AUTO_DIR, this.LOGS_DIR];
      for (const dir of dirs) {
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          await this.logAction(`Created directory: ${dir}`);
        }
      }

      console.log('✅ Backup directories initialized');
      return true;
    } catch (error) {
      console.error('Error initializing directories:', error);
      await this.logAction(`Error initializing directories: ${error}`);
      return false;
    }
  }

  /**
   * Check if this is the first launch
   */
  static async isFirstLaunch(): Promise<boolean> {
    try {
      const firstLaunchDone = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.FIRST_LAUNCH_DONE
      );
      return firstLaunchDone !== 'true';
    } catch (error) {
      return true;
    }
  }

  /**
   * Mark first launch as complete
   */
  static async markFirstLaunchDone(): Promise<void> {
    try {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.FIRST_LAUNCH_DONE, 'true');
    } catch (error) {
      console.error('Error marking first launch done:', error);
    }
  }

  /**
   * First launch setup - ask user about auto backup
   */
  static async firstLaunchSetup(): Promise<void> {
    return new Promise((resolve) => {
      Alert.alert(
        'Welcome to BullionDesk!',
        'Would you like to enable automatic daily backups of your data? You can change this later in Settings.',
        [
          {
            text: 'No Thanks',
            style: 'cancel',
            onPress: async () => {
              await this.setAutoBackupEnabled(false);
              await this.markFirstLaunchDone();
              
              // Still request storage permission for manual export/import
              const hasPermission = await this.requestStoragePermission();
              if (!hasPermission) {
                Alert.alert(
                  'Storage Permission',
                  'Storage permission is required for backup and restore features. You can enable it later in Settings.',
                  [{ text: 'OK' }]
                );
              }
              resolve();
            },
          },
          {
            text: 'Enable Auto Backup',
            onPress: async () => {
              console.log('🔵 User selected Enable Auto Backup');
              
              // Request storage permission first
              console.log('🔵 Requesting storage permission...');
              const hasPermission = await this.requestStoragePermission();
              console.log('🔵 Storage permission result:', hasPermission);
              
              if (!hasPermission) {
                Alert.alert(
                  'Permission Denied',
                  'Storage permission is required for automatic backups. You can enable this later in Settings.',
                  [{ text: 'OK' }]
                );
                await this.setAutoBackupEnabled(false);
                await this.markFirstLaunchDone();
                resolve();
                return;
              }

              // Initialize directories
              console.log('🔵 Initializing directories...');
              const dirsReady = await this.initializeDirectories();
              console.log('🔵 Directories ready:', dirsReady);
              
              if (!dirsReady) {
                Alert.alert(
                  'Setup Error',
                  'Failed to create backup directories. You can try again in Settings.',
                  [{ text: 'OK' }]
                );
                await this.setAutoBackupEnabled(false);
                await this.markFirstLaunchDone();
                resolve();
                return;
              }

              // Setup encryption key
              console.log('🔵 Setting up encryption key...');
              const hasKey = await this.setupEncryptionKey();
              console.log('🔵 Encryption key setup result:', hasKey);
              
              if (!hasKey) {
                await this.setAutoBackupEnabled(false);
                await this.markFirstLaunchDone();
                resolve();
                return;
              }

              // Enable auto backup
              console.log('🔵 Enabling auto backup...');
              await this.setAutoBackupEnabled(true);
              await this.markFirstLaunchDone();
              console.log('🔵 Auto backup enabled successfully');
              
              Alert.alert(
                'Auto Backup Enabled',
                'Your data will be automatically backed up daily. Backups are stored securely in your device storage.',
                [{ text: 'OK' }]
              );
              resolve();
            },
          },
        ],
        { cancelable: false }
      );
    });
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
   * Setup encryption key (first time or if missing)
   */
  static async setupEncryptionKey(): Promise<boolean> {
    return new Promise((resolve) => {
      // Check if key already exists
      SecureStore.getItemAsync(SECURE_STORE_KEYS.ENCRYPTION_KEY).then((existingKey) => {
        if (existingKey) {
          console.log('🔑 Encryption key already exists');
          resolve(true);
          return;
        }

        console.log('🔑 No encryption key found, prompting user...');
        
        // Show key setup dialog
        Alert.prompt(
          'Set Backup Encryption Key',
          'Choose a strong key to encrypt your backups. You\'ll need this to restore data.\n\nMinimum 8 characters required.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                console.log('🔑 User cancelled key setup');
                resolve(false);
              },
            },
            {
              text: 'Set Key',
              onPress: async (input) => {
                if (!input) {
                  Alert.alert('Error', 'Key cannot be empty');
                  resolve(false);
                  return;
                }

                const validation = EncryptionService.isValidKey(input);
                if (!validation.valid) {
                  Alert.alert('Invalid Key', validation.message || 'Key is invalid');
                  resolve(false);
                  return;
                }

                // Confirm key
                Alert.prompt(
                  'Confirm Encryption Key',
                  'Please re-enter your encryption key to confirm:',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                      onPress: () => {
                        console.log('🔑 User cancelled key confirmation');
                        resolve(false);
                      },
                    },
                    {
                      text: 'Confirm',
                      onPress: async (confirmInput) => {
                        if (input !== confirmInput) {
                          Alert.alert('Error', 'Keys do not match. Please try again.');
                          resolve(false);
                          return;
                        }

                        try {
                          await SecureStore.setItemAsync(
                            SECURE_STORE_KEYS.ENCRYPTION_KEY,
                            input
                          );
                          await this.logAction('Encryption key set successfully');
                          console.log('🔑 Encryption key saved successfully');
                          Alert.alert(
                            'Success',
                            'Encryption key has been set. Please remember this key - you will need it to restore your backups.',
                            [{ text: 'OK' }]
                          );
                          resolve(true);
                        } catch (error) {
                          console.error('🔑 Error saving key:', error);
                          Alert.alert('Error', 'Failed to save encryption key');
                          resolve(false);
                        }
                      },
                    },
                  ],
                  'secure-text'
                );
              },
            },
          ],
          'secure-text'
        );
      });
    });
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
   * Manual export
   */
  static async exportData(): Promise<boolean> {
    try {
      console.log('📤 Starting export...');
      
      // Check storage permission first
      const hasPermission = await this.hasStoragePermission();
      if (!hasPermission) {
        console.log('📤 No storage permission, requesting...');
        const granted = await this.requestStoragePermission();
        if (!granted) {
          Alert.alert(
            'Permission Required',
            'Storage permission is required to export data. Please grant permission to continue.',
            [{ text: 'OK' }]
          );
          return false;
        }
      }

      // Initialize directories
      console.log('📤 Initializing directories...');
      const dirsReady = await this.initializeDirectories();
      if (!dirsReady) {
        Alert.alert('Error', 'Failed to create backup directories.');
        return false;
      }

      // Check/setup encryption key - will prompt if not set
      console.log('📤 Checking for encryption key...');
      const hasKey = await this.setupEncryptionKey();
      if (!hasKey) {
        console.log('📤 User cancelled encryption key setup');
        return false;
      }

      const key = await this.getEncryptionKey();
      if (!key) {
        Alert.alert('Error', 'Encryption key not found');
        return false;
      }

      // Show progress
      Alert.alert('Exporting...', 'Please wait while we prepare your backup.');

      // Collect data
      console.log('📤 Collecting database data...');
      const records = await this.collectDatabaseData();
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

      // Encrypt data
      console.log('📤 Encrypting data...');
      const encrypted = await EncryptionService.encryptData(backupData, key);

      // Delete previous export file
      const exportPath = `${this.EXPORTS_DIR}/export.encrypted`;
      const fileInfo = await FileSystem.getInfoAsync(exportPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(exportPath);
      }

      // Save encrypted file
      console.log('📤 Saving encrypted file...');
      await FileSystem.writeAsStringAsync(exportPath, JSON.stringify(encrypted));

      await this.logAction(`Manual export completed: ${backupData.recordCount} records`);
      console.log('📤 Export completed successfully!');

      // Share file
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        Alert.alert('Export Complete', 'Your backup is ready to share.', [
          {
            text: 'Share',
            onPress: async () => {
              await Sharing.shareAsync(exportPath);
            },
          },
          { text: 'Done', style: 'cancel' },
        ]);
      } else {
        Alert.alert(
          'Export Complete',
          `Backup saved at:\n${exportPath}`,
          [{ text: 'OK' }]
        );
      }

      return true;
    } catch (error) {
      console.error('📤 Export error:', error);
      await this.logAction(`Export error: ${error}`);
      Alert.alert('Export Failed', 'Failed to export data. Please try again.');
      return false;
    }
  }

  /**
   * Manual import with conflict-free merge
   */
  static async importData(fileUri: string): Promise<boolean> {
    try {
      console.log('📥 Starting import...');
      
      // Check storage permission first
      const hasPermission = await this.hasStoragePermission();
      if (!hasPermission) {
        console.log('📥 No storage permission, requesting...');
        const granted = await this.requestStoragePermission();
        if (!granted) {
          Alert.alert(
            'Permission Required',
            'Storage permission is required to import data. Please grant permission to continue.',
            [{ text: 'OK' }]
          );
          return false;
        }
      }

      // Initialize directories
      console.log('📥 Initializing directories...');
      await this.initializeDirectories();

      // Check/setup encryption key - will prompt if not set
      console.log('📥 Checking for encryption key...');
      const hasKey = await this.setupEncryptionKey();
      if (!hasKey) {
        console.log('📥 User cancelled encryption key setup');
        return false;
      }

      // Get encryption key
      const key = await this.getEncryptionKey();
      if (!key) {
        Alert.alert('Error', 'Encryption key not found. Please set up encryption first.');
        return false;
      }

      Alert.alert('Importing...', 'Please wait while we restore your backup.');

      // Read encrypted file
      console.log('📥 Reading encrypted file...');
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const encryptedData = JSON.parse(fileContent);

      // Decrypt data
      console.log('📥 Decrypting data...');
      const decryptedData: BackupData = await EncryptionService.decryptData(
        encryptedData,
        key
      );

      // Get current device ID
      const currentDeviceId = await this.getDeviceId();

      // Perform conflict-free merge
      console.log('📥 Merging data...');
      await this.mergeData(decryptedData, currentDeviceId);

      await this.logAction(
        `Import completed: ${decryptedData.recordCount} records from device ${decryptedData.deviceId}`
      );
      console.log('📥 Import completed successfully!');

      Alert.alert(
        'Import Successful',
        `Imported ${decryptedData.recordCount} records successfully.`,
        [{ text: 'OK' }]
      );

      return true;
    } catch (error) {
      console.error('📥 Import error:', error);
      await this.logAction(`Import error: ${error}`);
      
      if (error instanceof Error && error.message.includes('decrypt')) {
        Alert.alert(
          'Import Failed',
          'Invalid encryption key or corrupted backup file.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Import Failed', 'Failed to import data. Please try again.');
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
          transaction.id = `${transaction.id}_imported_${Date.now()}`;
        }
        
        // Save transaction (this will also update customer balance)
        const entries = transaction.entries;
        const customer = await DatabaseService.getCustomerById(transaction.customerId);
        if (customer) {
          await DatabaseService.saveTransaction(
            customer,
            entries,
            transaction.amountPaid,
            transaction.id
          );
        }
      }
    }

    // Merge ledger entries (by ID) - only add if doesn't exist
    const existingLedger = await DatabaseService.getAllLedgerEntries();
    const ledgerMap = new Map(existingLedger.map((l) => [l.id, l]));

    // Note: Ledger entries are typically created with transactions,
    // but we merge them here to preserve historical data
    for (const ledgerEntry of records.ledger) {
      if (!ledgerMap.has(ledgerEntry.id)) {
        // Manually add ledger entry to AsyncStorage
        const allLedger = await DatabaseService.getAllLedgerEntries();
        allLedger.push(ledgerEntry);
        // We'll need to expose a method to save ledger directly
        // For now, skip ledger merging as they're recreated with transactions
      }
    }
  }

  /**
   * Auto backup
   */
  static async performAutoBackup(): Promise<boolean> {
    try {
      // Check if storage permission is granted
      const hasPermission = await this.hasStoragePermission();
      if (!hasPermission) {
        await this.logAction('Auto backup skipped: No storage permission');
        return false;
      }

      const dirsReady = await this.initializeDirectories();
      if (!dirsReady) {
        return false;
      }

      const key = await this.getEncryptionKey();
      if (!key) {
        await this.logAction('Auto backup skipped: No encryption key');
        return false;
      }

      // Check if enabled
      const enabled = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.AUTO_BACKUP_ENABLED
      );
      if (enabled !== 'true') {
        await this.logAction('Auto backup skipped: Disabled');
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

      // Encrypt data
      const encrypted = await EncryptionService.encryptData(backupData, key);

      // Create filename with date and time
      const now = new Date();
      const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;
      const timeStr = `${now.getHours().toString().padStart(2, '0')}-${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
      const filename = `auto_backup_${dateStr} - ${timeStr}.encrypted`;
      const backupPath = `${this.AUTO_DIR}/${filename}`;

      // Save encrypted file
      await FileSystem.writeAsStringAsync(backupPath, JSON.stringify(encrypted));

      // Rotate backups (keep last 2)
      await this.rotateAutoBackups();

      // Update last backup time
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.LAST_BACKUP_TIME,
        Date.now().toString()
      );

      await this.logAction(
        `Auto backup completed: ${backupData.recordCount} records, file: ${filename}`
      );

      return true;
    } catch (error) {
      console.error('Auto backup error:', error);
      await this.logAction(`Auto backup error: ${error}`);
      return false;
    }
  }

  /**
   * Rotate auto backups (keep last 2)
   */
  private static async rotateAutoBackups(): Promise<void> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.AUTO_DIR);
      const backupFiles = files
        .filter((f) => f.startsWith('auto_backup_') && f.endsWith('.encrypted'))
        .sort()
        .reverse(); // Most recent first

      // Delete old backups (keep only 2 most recent)
      if (backupFiles.length > 2) {
        for (let i = 2; i < backupFiles.length; i++) {
          const filePath = `${this.AUTO_DIR}/${backupFiles[i]}`;
          await FileSystem.deleteAsync(filePath);
          await this.logAction(`Deleted old backup: ${backupFiles[i]}`);
        }
      }
    } catch (error) {
      console.error('Error rotating backups:', error);
    }
  }

  /**
   * Enable/disable auto backup
   */
  static async setAutoBackupEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      SECURE_STORE_KEYS.AUTO_BACKUP_ENABLED,
      enabled ? 'true' : 'false'
    );
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
      const enabled = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.AUTO_BACKUP_ENABLED
      );
      return enabled === 'true';
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
      const lastBackupStr = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.LAST_BACKUP_TIME
      );
      if (!lastBackupStr) {
        return true;
      }

      const lastBackup = parseInt(lastBackupStr, 10);
      const now = Date.now();
      const hoursSinceBackup = (now - lastBackup) / (1000 * 60 * 60);

      return hoursSinceBackup >= 24;
    } catch (error) {
      console.error('Error checking backup time:', error);
      return false;
    }
  }

  /**
   * Log action to file
   */
  private static async logAction(message: string): Promise<void> {
    try {
      // Always log to console
      console.log(`📝 ${message}`);

      // Ensure logs directory exists before writing
      const logsDir = this.LOGS_DIR;
      const logsDirInfo = await FileSystem.getInfoAsync(logsDir);
      if (!logsDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(logsDir, { intermediates: true });
      }

      const now = new Date();
      const timestamp = now.toISOString();
      const logMessage = `[${timestamp}] ${message}\n`;

      const logFile = `${logsDir}/backup.log`;
      const fileInfo = await FileSystem.getInfoAsync(logFile);

      if (fileInfo.exists) {
        const existingLog = await FileSystem.readAsStringAsync(logFile);
        await FileSystem.writeAsStringAsync(logFile, existingLog + logMessage);
      } else {
        await FileSystem.writeAsStringAsync(logFile, logMessage);
      }
    } catch (error) {
      // Silently fail if logging doesn't work, just console log
      console.error('Error logging action:', error);
    }
  }
}
