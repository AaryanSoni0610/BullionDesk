import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, BackHandler } from 'react-native';
import { Surface, Text, Switch, Divider, List, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import { theme } from '../theme';
import { useAppContext } from '../context/AppContext';
import { CustomerService } from '../services/customer.service';
import { InventoryService } from '../services/inventory.service';
import { DatabaseService } from '../services/database.sqlite';
import { RaniRupaStockService } from '../services/raniRupaStock.service';
import { NotificationService } from '../services/notificationService';
import { BackupService } from '../services/backupService';
import { EncryptionService } from '../services/encryptionService';
import { EncryptionKeyDialog } from '../components/EncryptionKeyDialog';
import { InventoryInputDialog } from '../components/InventoryInputDialog';
import CustomAlert from '../components/CustomAlert';
import { formatIndianNumber, formatPureGoldPrecise, formatPureSilver, customFormatPureSilver } from '../utils/formatting';

export const SettingsScreen: React.FC = () => {
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = React.useState(false);
  const [isClearing, setIsClearing] = React.useState(false);
  const [isCheckingNotifications, setIsCheckingNotifications] = React.useState(true);
  const [isCheckingBackup, setIsCheckingBackup] = React.useState(true);
  const [showKeyDialog, setShowKeyDialog] = React.useState(false);
  const [keyDialogMode, setKeyDialogMode] = React.useState<'setup' | 'confirm' | 'enter'>('setup');
  const [keyDialogCallback, setKeyDialogCallback] = React.useState<((key: string | null) => void) | null>(null);
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [baseInventory, setBaseInventory] = React.useState<any>(null);
  const [raniTotal, setRaniTotal] = React.useState(0);
  const [rupuTotal, setRupuTotal] = React.useState(0);
  const [openingBalanceEffects, setOpeningBalanceEffects] = React.useState<any>(null);
  const [isLoadingCustomers, setIsLoadingCustomers] = React.useState(true);
  const [isLoadingInventory, setIsLoadingInventory] = React.useState(true);
  const [showInventoryDialog, setShowInventoryDialog] = React.useState(false);
  const [inventoryDialogStep, setInventoryDialogStep] = React.useState<'gold' | 'silver' | 'money'>('gold');
  const [inventoryInputs, setInventoryInputs] = React.useState<any[]>([]);
  const [collectedInventoryData, setCollectedInventoryData] = React.useState<any>({});
  const [showPrivacyPolicy, setShowPrivacyPolicy] = React.useState(false);
  const [showTermsOfService, setShowTermsOfService] = React.useState(false);
  const [showAbout, setShowAbout] = React.useState(false);
  const { navigateToTabs, showAlert, navigateToCustomers, navigateToRaniRupaSell, navigateToRecycleBin } = useAppContext();

  // Check notification and backup status on focus
  useFocusEffect(
    useCallback(() => {
      // Configure BackupService to use CustomAlert
      BackupService.setAlertFunction(showAlert);
      
      const checkSettings = async () => {
        try {
          
          const notifEnabled = await NotificationService.isNotificationsEnabled();
          setNotificationsEnabled(notifEnabled);

          const backupEnabled = await BackupService.isAutoBackupEnabled();
          setAutoBackupEnabled(backupEnabled);

          // Load customers and base inventory
          const [customersData, inventoryData, effectsData, raniStock, rupuStock] = await Promise.all([
            CustomerService.getAllCustomers(),
            InventoryService.getBaseInventory(),
            InventoryService.calculateOpeningBalanceEffects(),
            RaniRupaStockService.getStockByType('rani'),
            RaniRupaStockService.getStockByType('rupu')
          ]);
          
          setCustomers(customersData);
          setBaseInventory(inventoryData);
          setOpeningBalanceEffects(effectsData);

          // Calculate Rani/Rupu totals
          const raniPure = raniStock.reduce((sum, item) => sum + ((item.weight * item.touch) / 100), 0);
          const rupuPure = rupuStock.reduce((sum, item) => sum + customFormatPureSilver(item.weight, item.touch), 0);
          
          setRaniTotal(raniPure);
          setRupuTotal(rupuPure);
          
          // Don't auto-initialize directories here
          // They will be created on demand when needed
        } catch (error) {
          console.error('Error checking settings:', error);
        } finally {
          setIsCheckingNotifications(false);
          setIsCheckingBackup(false);
          setIsLoadingCustomers(false);
          setIsLoadingInventory(false);
        }
      };

      checkSettings();
    }, [])
  );

  // Handle hardware back button - navigate to home screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigateToTabs();
        return true; // Prevent default back behavior
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [navigateToTabs])
  );

  // Helper function to show encryption key dialog and get user input
  const promptForEncryptionKey = (mode: 'setup' | 'confirm' | 'enter'): Promise<string | null> => {
    return new Promise((resolve) => {
      setKeyDialogMode(mode);
      setKeyDialogCallback(() => resolve);
      setShowKeyDialog(true);
    });
  };

  const handleKeyDialogSubmit = (key: string) => {
    setShowKeyDialog(false);
    if (keyDialogCallback) {
      keyDialogCallback(key);
      setKeyDialogCallback(null);
    }
  };

  const handleKeyDialogCancel = () => {
    setShowKeyDialog(false);
    if (keyDialogCallback) {
      keyDialogCallback(null);
      setKeyDialogCallback(null);
    }
  };

  const handleSetBaseInventoryWithWarning = () => {
    showAlert(
      '⚠️ Important Warning',
      'Setting base inventory will overwrite your starting inventory values.\n\nPlease ensure that:\n• You are entering the initial/opening stock values\n• Current inventory will be calculated as Base Inventory + Transactions\n\nThis action cannot be easily undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: handleSetBaseInventory,
        },
      ]
    );
  };

  const handleSetBaseInventory = () => {
    // Start with gold inventory
    setInventoryDialogStep('gold');
    setInventoryInputs([
      {
        key: 'gold999',
        label: 'Gold 999 (g)',
        value: (baseInventory?.gold999 || 0).toFixed(3),
      },
      {
        key: 'gold995',
        label: 'Gold 995 (g)',
        value: (baseInventory?.gold995 || 0).toFixed(3),
      }
    ]);
    setCollectedInventoryData({});
    setShowInventoryDialog(true);
  };

  const handleInventoryDialogSubmit = (values: Record<string, number>) => {
    const updatedData = { ...collectedInventoryData, ...values };
    setCollectedInventoryData(updatedData);

    if (inventoryDialogStep === 'gold') {
      // Move to silver - always allow progression with defaults
      setInventoryDialogStep('silver');
      setInventoryInputs([
        {
          key: 'silver',
          label: 'Base Silver (g)',
          value: (updatedData.silver !== undefined ? updatedData.silver : (baseInventory?.silver || 0)).toFixed(1),
        }
      ]);
    } else if (inventoryDialogStep === 'silver') {
      // Move to money - always allow progression with defaults
      setInventoryDialogStep('money');
      setInventoryInputs([
        {
          key: 'money',
          label: 'Money (₹)',
          value: (updatedData.money !== undefined ? updatedData.money : (baseInventory?.money || 0)).toString(),
        }
      ]);
    } else if (inventoryDialogStep === 'money') {
      // All steps complete, save the inventory with defaults if not provided
      setShowInventoryDialog(false);

      const finalInventory = {
        gold999: updatedData.gold999 !== undefined ? updatedData.gold999 : 0,
        gold995: updatedData.gold995 !== undefined ? updatedData.gold995 : 0,
        silver: updatedData.silver !== undefined ? updatedData.silver : 0,
        rani: 0, // Rani stock is tracked separately
        rupu: 0, // Rupu stock is tracked separately
        money: updatedData.money !== undefined ? updatedData.money : 0
      };

      InventoryService.setBaseInventory(finalInventory).then(async success => {
        if (success) {
          // Fetch fresh data from DB to ensure consistency and correct types
          const freshInventory = await InventoryService.getBaseInventory();
          setBaseInventory(freshInventory);
          showAlert('Success', 'Base inventory has been set successfully.');
        } else {
          showAlert('Error', 'Failed to set base inventory.');
        }
      });
    }
  };

  const handleInventoryDialogCancel = () => {
    setShowInventoryDialog(false);
    setCollectedInventoryData({});
  };

  // Setup encryption key with Android-friendly dialogs
  const setupEncryptionKey = async (): Promise<boolean> => {
    try {
      // Check if key already exists
      const existingKey = await SecureStore.getItemAsync('backup_encryption_key');
      if (existingKey) {
        return true;
      }

      // Show setup dialog
      const key = await promptForEncryptionKey('setup');
      if (!key) {
        return false;
      }

      // Validate key
      const validation = EncryptionService.isValidKey(key);
      if (!validation.valid) {
        showAlert('Invalid Key', validation.message || 'Key is invalid');
        return false;
      }

      // Show confirmation dialog
      const confirmKey = await promptForEncryptionKey('confirm');
      if (!confirmKey) {
        return false;
      }

      if (key !== confirmKey) {
        showAlert('Error', 'Keys do not match. Please try again.');
        return false;
      }

      // Save key
      await SecureStore.setItemAsync('backup_encryption_key', key);
      
      // Wait for user to acknowledge the success alert
      await new Promise<void>((resolve) => {
        showAlert(
          'Success',
          'Encryption key has been set. Please remember this key - you will need it to restore your backups.',
          [{ text: 'OK', onPress: () => resolve() }]
        );
      });
      
      return true;
    } catch (error) {
      console.error('🔑 Error setting up encryption key:', error);
      showAlert('Error', 'Failed to set up encryption key');
      return false;
    }
  };

  const handleNotificationToggle = async (value: boolean) => {
    if (value) {
      // Enabling notifications - request permissions
      try {
        const success = await NotificationService.enableNotifications();
        if (success) {
          setNotificationsEnabled(true);
          showAlert(
            'Notifications Enabled',
            'You will receive daily reminders for customers with pending debt between 12:00 PM - 1:00 PM.',
            [{ text: 'OK' }]
          );
        } else {
          showAlert(
            'Permission Required',
            'Please grant notification permissions in your device settings to receive debt reminders.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('Error enabling notifications:', error);
        showAlert(
          'Error',
          'Failed to enable notifications. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } else {
      // Disabling notifications
      showAlert(
        'Disable Notifications',
        'Are you sure you want to disable debt reminder notifications?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              try {
                await NotificationService.disableNotifications();
                setNotificationsEnabled(false);
              } catch (error) {
                console.error('Error disabling notifications:', error);
                showAlert(
                  'Error',
                  'Failed to disable notifications. Please try again.',
                  [{ text: 'OK' }]
                );
              }
            },
          },
        ]
      );
    }
  };

  const handleAutoBackupToggle = async (value: boolean) => {
    if (value) {
      // Enabling auto backup - check encryption key first
      try {
        
        // Setup encryption key first - will prompt if not set
        const hasKey = await setupEncryptionKey();
        
        if (!hasKey) {
          // Don't change the toggle state - user cancelled
          return; // User cancelled key setup
        }

        // Ensure SAF directory is selected
        const hasDirectory = await BackupService.ensureSAFDirectorySelected();
        
        if (!hasDirectory) {
          return; // User cancelled directory selection
        }

        // Mark first export/auto backup as done since we have directory
        await BackupService.markFirstExportOrAutoBackupDone();

        // Key and directory are set, now enable auto backup
        await BackupService.setAutoBackupEnabled(true);
        
        // Verify it was actually saved
        const isEnabled = await BackupService.isAutoBackupEnabled();
        
        if (isEnabled) {
          setAutoBackupEnabled(true);
          showAlert(
            'Auto Backup Enabled',
            'Your data will be automatically backed up daily.',
            [{ text: 'OK' }]
          );
        } else {
          console.error('🔴 Auto backup was not saved properly!');
          showAlert('Error', 'Failed to enable auto backup. Please try again.');
        }
      } catch (error) {
        console.error('🔴 Error enabling auto backup:', error);
        showAlert('Error', 'Failed to enable auto backup. Please try again.');
      }
    } else {
      // Disabling auto backup
      showAlert(
        'Disable Auto Backup',
        'Are you sure you want to disable automatic backups?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              try {
                await BackupService.setAutoBackupEnabled(false);
                setAutoBackupEnabled(false);
              } catch (error) {
                console.error('🔴 Error disabling auto backup:', error);
                showAlert('Error', 'Failed to disable auto backup.');
              }
            },
          },
        ]
      );
    }
  };

  const handleExportData = async () => {
    try {
      // Check if encryption key is set up
      const hasKey = await BackupService.hasEncryptionKey();
      if (!hasKey) {
        const keySetup = await setupEncryptionKey();
        if (!keySetup) {
          return;
        }
      }

      // Show export options
      showAlert(
        'Export Data',
        'Choose what data to export:',
        [
          {
            text: 'Today',
            onPress: async () => {
              await performExport('today');
            },
          },
          {
            text: 'All Data',
            onPress: async () => {
              await performExport('all');
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } catch (error) {
      console.error('Error preparing export:', error);
      showAlert('Error', 'Failed to prepare export. Please try again.');
    }
  };

  const performExport = async (exportType: 'today' | 'all') => {
    try {
      const result = await BackupService.exportDataToUserStorage(exportType);
      
      if (result.success && result.fileUri && result.fileName) {
        // Show success alert with share option
        showAlert(
          'Export Complete',
          `Backup saved to your selected location as:\n${result.fileName}`,
          [
            {
              text: 'Share',
              onPress: () => {
                BackupService.shareExportedFile(result.fileUri!, result.fileName!);
              },
            },
            {
              text: 'OK',
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      showAlert('Error', 'Failed to export data. Please try again.');
    }
  };

  const handleImportData = async () => {
    try {
      // Check if encryption key is set up
      const hasKey = await BackupService.hasEncryptionKey();
      if (!hasKey) {
        const keySetup = await setupEncryptionKey();
        if (!keySetup) {
          return;
        }
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];

      // Check if it's a SAF URI (content://) or regular file URI
      if (file.uri.startsWith('content://')) {
        // Use SAF import method
        await BackupService.importDataFromSAF(file.uri);
      } else {
        // Use regular import method
        await BackupService.importData(file.uri);
      }
    } catch (error) {
      console.error('Error importing data:', error);
      showAlert('Error', 'Failed to import data. Please try again.');
    }
  };

  const handleClearAllData = () => {
    showAlert(
      'Clear All Data',
      'Are you sure you want to permanently delete all data? This action cannot be undone.\n\nThis will delete:\n• All customers\n• All transactions\n\nInventory will reset to base values.',
      [
        {
          text: 'No',
          style: 'cancel',
          onPress: () => {
          },
        },
        {
          text: 'Yes, Delete All',
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true);
            try {
              const success = await DatabaseService.clearAllData();
              if (success) {
                // Reload data after clearing
                const [customersData, inventoryData] = await Promise.all([
                  CustomerService.getAllCustomers(),
                  InventoryService.getBaseInventory()
                ]);
                setCustomers(customersData);
                setBaseInventory(inventoryData);
                
                showAlert(
                  'Success',
                  'All data has been cleared successfully.',
                  [{ text: 'OK' }]
                );
              } else {
                showAlert(
                  'Error',
                  'Failed to clear data. Please try again.',
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              showAlert(
                'Error',
                error instanceof Error ? error.message : 'An unknown error occurred',
                [{ text: 'OK' }]
              );
            } finally {
              setIsClearing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* App Title Bar */}
      <Surface style={styles.appTitleBar} elevation={1}>
        <View style={styles.appTitleContent}>
          <IconButton
            icon="arrow-left"
            size={20}
            onPress={navigateToTabs}
            style={styles.backButton}
          />
          <Text variant="titleLarge" style={styles.appTitle}>
            Settings
          </Text>
        </View>
      </Surface>

      <ScrollView style={styles.content}>
        {/* App Settings */}
        <List.Section>
          <List.Subheader style={styles.sectionHeader}>App Settings</List.Subheader>

          <List.Item
            title="Enable Notifications"
            description="Receive daily reminders for customers with pending debt"
            style={styles.sectionListItem}
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="bell-outline" />}
            right={() => (
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                disabled={isCheckingNotifications}
              />
            )}
          />

          <Divider />

          <List.Item
            title="Auto Backup"
            description="Automatically backup data daily to external storage"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="cloud-upload-outline" />}
            right={() => (
              <Switch
                value={autoBackupEnabled}
                onValueChange={handleAutoBackupToggle}
                disabled={isCheckingBackup}
              />
            )}
          />
        </List.Section>

        {/* Data Overview */}
        <List.Section>
          <List.Subheader style={styles.sectionHeader}>Data Overview</List.Subheader>

          <List.Item
            title="Customers"
            description={isLoadingCustomers ? "Loading..." : `${customers.length} customers registered`}
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="account-group-outline" />}
            onPress={navigateToCustomers}
          />

          <Divider />

          <List.Item
            title="Base Inventory"
            description={
              isLoadingInventory
                ? "Loading..."
                : `Gold: ${formatPureGoldPrecise((baseInventory?.gold999 + baseInventory?.gold995 || 0))}g, Silver: ${formatPureSilver(baseInventory?.silver || 0)}g, Money: ₹${formatIndianNumber(Math.round(baseInventory?.money || 0))}`
            }
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="package-variant-closed" />}
            onPress={() => {
              if (baseInventory) {
                let message = `Gold 999: ${formatPureGoldPrecise(baseInventory.gold999)}g\nGold 995: ${formatPureGoldPrecise(baseInventory.gold995)}g\nSilver: ${formatPureSilver(baseInventory.silver)}g\nRani: ${formatPureGoldPrecise(raniTotal)}g\nRupu: ${formatPureSilver(rupuTotal)}g\nMoney: ₹${formatIndianNumber(Math.round(baseInventory.money))}`;
                
                showAlert(
                  'Base Inventory',
                  message,
                  [
                    { text: 'OK' },
                    { 
                      text: 'Set Custom Values', 
                      onPress: () => {
                        // Use setTimeout to ensure the current alert is fully dismissed before showing the warning
                        setTimeout(() => {
                          handleSetBaseInventoryWithWarning();
                        }, 100);
                      }
                    }
                  ]
                );
              }
            }}
          />

          <Divider />

          <List.Item
            title="Rani/Rupa Bulk Sell"
            description="Bulk sell Rani or Rupu items"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="swap-horizontal" />}
            onPress={() => navigateToRaniRupaSell()}
          />
        </List.Section>

        {/* Data Management */}
        <List.Section>
          <List.Subheader style={styles.sectionHeader}>Data Management</List.Subheader>

          <List.Item
            title="Recycle Bin"
            description="View and restore deleted transactions"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="recycle" />}
            onPress={navigateToRecycleBin}
          />

          <Divider />

          <List.Item
            title="Export Data"
            description="Export to external storage location"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="file-export-outline" />}
            onPress={handleExportData}
          />

          <Divider />

          <List.Item
            title="Import Data"
            description="Import from backup file"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="file-import-outline" />}
            onPress={handleImportData}
          />

          <Divider />

          <List.Item
            title="Clear All Data"
            description={isClearing ? "Clearing data..." : "Delete all data, reset inventory to base"}
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="delete-forever-outline" color={theme.colors.error} />}
            disabled={isClearing}
            onPress={handleClearAllData}
          />
        </List.Section>

        {/* About */}
        <List.Section>
          <List.Subheader style={styles.sectionHeader}>About</List.Subheader>

          <List.Item
            title="Privacy Policy"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="shield-check-outline" />}
            onPress={() => setShowPrivacyPolicy(true)}
          />

          <Divider />

          <List.Item
            title="Terms of Service"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="file-document-outline" />}
            onPress={() => setShowTermsOfService(true)}
          />

          <Divider />

          <List.Item
            title="About"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="information-outline" />}
            onPress={() => setShowAbout(true)}
          />
        </List.Section>
      </ScrollView>

      {/* Encryption Key Dialog */}
      <EncryptionKeyDialog
        visible={showKeyDialog}
        mode={keyDialogMode}
        title={
          keyDialogMode === 'setup'
            ? 'Set Backup Encryption Key'
            : keyDialogMode === 'confirm'
            ? 'Confirm Encryption Key'
            : 'Enter Encryption Key'
        }
        message={
          keyDialogMode === 'setup'
            ? "Choose a strong key to encrypt your backups. You'll need this to restore data.\n\nMinimum 8 characters required."
            : keyDialogMode === 'confirm'
            ? 'Please re-enter your encryption key to confirm:'
            : 'Enter your encryption key to decrypt the backup:'
        }
        onSubmit={handleKeyDialogSubmit}
        onCancel={handleKeyDialogCancel}
      />

      {/* Inventory Input Dialog */}
      <InventoryInputDialog
        visible={showInventoryDialog}
        title={
          inventoryDialogStep === 'gold'
            ? 'Set Gold Inventory'
            : inventoryDialogStep === 'silver'
            ? 'Set Silver Inventory'
            : 'Set Money Inventory'
        }
        message={
          inventoryDialogStep === 'gold'
            ? 'Enter the base (opening) gold inventory levels:'
            : inventoryDialogStep === 'silver'
            ? 'Enter the base (opening) silver inventory levels:'
            : 'Enter the base (opening) money balance:'
        }
        inputs={inventoryInputs}
        onSubmit={handleInventoryDialogSubmit}
        onCancel={handleInventoryDialogCancel}
        allowDefaults={true}
      />

      {/* Privacy Policy Dialog */}
      <CustomAlert
        visible={showPrivacyPolicy}
        title="Privacy Policy"
        message={`Privacy Policy for BullionDesk

Last Updated: November 20, 2025

1. Information We Collect
BullionDesk collects and stores the following information locally on your device:
- Customer information (names, contact details, balances)
- Transaction records and history
- Inventory data and business records
- App settings and preferences

2. Data Storage
All data is stored locally on your device using secure storage mechanisms. We do not transmit any of your business data to external servers or third parties.

3. Data Security
Your data is protected using industry-standard encryption when backed up to external storage. The app uses secure local storage APIs provided by your device's operating system.

4. Data Sharing
We do not share, sell, or transmit your personal or business data to any third parties. Your data remains entirely on your device.

5. Backup and Restore
When you choose to backup your data, it is encrypted and stored in a location you specify. Only you have access to your backup files.

6. Contact Information
If you have any questions about this Privacy Policy, please contact the developer.

7. Changes to This Policy
This privacy policy may be updated as needed. Continued use of the app constitutes acceptance of any changes.`}
        maxHeight={400}
        buttons={[{ text: 'OK', onPress: () => setShowPrivacyPolicy(false) }]}
        onDismiss={() => setShowPrivacyPolicy(false)}
      />

      {/* Terms of Service Dialog */}
      <CustomAlert
        visible={showTermsOfService}
        title="Terms of Service"
        message={`Terms of Service for BullionDesk

Last Updated: October 9, 2025

1. Acceptance of Terms
By downloading and using BullionDesk, you agree to these terms of service.

2. Use License
BullionDesk is licensed to you for personal or business use. You may not:
- Modify, reverse engineer, or decompile the app
- Distribute or sell the app
- Use the app for any illegal purposes

3. Data Responsibility
You are responsible for:
- The accuracy of data entered into the app
- Regular backups of your business data
- Compliance with local laws and regulations regarding your business records

4. Service Availability
The app is provided "as is" without warranties. We strive for reliability but cannot guarantee uninterrupted service.

5. Limitation of Liability
The developer is not liable for any direct, indirect, incidental, or consequential damages arising from the use of this app.

6. Updates
The app may receive updates that change functionality. Continued use after updates constitutes acceptance of changes.

7. Termination
You may stop using the app at any time. The developer reserves the right to discontinue support for the app.

8. Governing Law
These terms are governed by applicable local laws.

9. Contact
For support or questions, please contact the developer.`}
        maxHeight={400}
        buttons={[{ text: 'OK', onPress: () => setShowTermsOfService(false) }]}
        onDismiss={() => setShowTermsOfService(false)}
      />

      {/* About Dialog */}
      <CustomAlert
        visible={showAbout}
        title="About BullionDesk"
        message={`BullionDesk v6.2.9

A comprehensive bullion business management app designed for bullion dealers, goldsmiths, and jewelry traders.

Features:
• Customer management with balance tracking
• Transaction recording and history
• Inventory management for gold, silver, and money
• Detailed ledger and reporting
• Secure data backup and restore
• Rani/Rupa stock management

Developer: Aaryan Soni
A passionate developer focused on creating practical business solutions. BullionDesk was built to help bullion businesses manage their operations efficiently and accurately.

If you find this app helpful and would like to support its continued development, consider making a donation. Your support helps maintain and improve the app!

Contact: For feedback, suggestions, or support, please reach out to the developer.`}
        maxHeight={400}
        buttons={[
          { text: 'Donate', onPress: () => {
            setShowAbout(false);
            // Show donation information
            setTimeout(() => {
              showAlert(
                'Support BullionDesk',
                'Thank you for considering a donation!\n\nYou can support the development through:\n\n• UPI: imaaryan3563-2@okhdfcbank\n• UPI Mobile number: 7043414570\n\nEvery contribution, no matter the size, is greatly appreciated and helps keep the app free and improved!',
                [{ text: 'Close' }]
              );
            }, 300);
          }},
          { text: 'OK', onPress: () => setShowAbout(false) }
        ]}
        onDismiss={() => setShowAbout(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  appTitleBar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.xs,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
  },
  backButton: {
    marginRight: theme.spacing.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  sectionHeader: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_500Medium',
    fontSize: 16,
  },
  sectionListItem: {
    // fontFamily removed - use titleStyle and descriptionStyle instead
  },
});