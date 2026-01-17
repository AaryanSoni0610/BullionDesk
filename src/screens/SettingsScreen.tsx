import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, BackHandler, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Switch } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
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
  const { navigateToTabs, showAlert, navigateToCustomers, navigateToRaniRupaSell, navigateToRecycleBin, navigateToRateCut } = useAppContext();

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
      'Important Warning',
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
      ],
      'alert-outline'
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

        // Key is set, now enable auto backup
        await BackupService.setAutoBackupEnabled(true);
        
        // Verify it was actually saved
        const isEnabled = await BackupService.isAutoBackupEnabled();
        
        if (isEnabled) {
          setAutoBackupEnabled(true);
          showAlert(
            'Auto Backup Enabled',
            'Your data will be automatically backed up daily.',
            [{ text: 'OK' }],
            'cloud-upload-outline'
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
                BackupService.setAutoBackupEnabled(false);
                setAutoBackupEnabled(false);
              } catch (error) {
                console.error('🔴 Error disabling auto backup:', error);
                showAlert('Error', 'Failed to disable auto backup.');
              }
            },
          },
        ],
        'cloud-upload-outline'
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
            text: 'All Data',
            onPress: async () => {
              await performExport();
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ],
        'file-export-outline'
      );
    } catch (error) {
      console.error('Error preparing export:', error);
      showAlert('Error', 'Failed to prepare export. Please try again.');
    }
  };

  const performExport = async () => {
    try {
      const result = await BackupService.exportDataToUserStorage();
      
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
          ],
          'check-circle-outline'
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
      ],
      'delete-forever-outline'
    );
  };

  const SettingsItem = ({ 
    icon, 
    title, 
    description, 
    onPress, 
    rightElement, 
    isDestructive = false,
    isLast = false,
    disabled = false
  }: any) => (
    <>
      <TouchableOpacity 
        style={[styles.itemContainer, isDestructive && styles.destructiveItem]} 
        onPress={onPress}
        activeOpacity={0.7}
        disabled={disabled || !onPress}
      >
        <View style={styles.iconBox}>
          <Icon 
            name={icon} 
            size={24} 
            color={isDestructive ? theme.colors.error : '#44474F'} 
          />
        </View>
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, isDestructive && styles.destructiveText]}>{title}</Text>
          <Text style={styles.itemDesc}>{description}</Text>
        </View>
        {rightElement || (onPress && <Icon name="chevron-right" size={24} color="#E0E2E5" />)}
      </TouchableOpacity>
      {!isLast && <View style={styles.separator} />}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={navigateToTabs}>
          <Icon name="arrow-left" size={24} color="#1B1B1F" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* App Settings */}
        <View style={styles.groupContainer}>
          <Text style={styles.groupLabel}>App Settings</Text>
          <View style={[styles.cardContainer, { paddingVertical: 0 }]}>
            <SettingsItem
              icon="bell-outline"
              title="Enable Notifications"
              description="Daily reminders for pending debt"
              rightElement={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotificationToggle}
                  disabled={isCheckingNotifications}
                  color="#005AC1"
                  style={{ height: 36, marginVertical: 0 }}
                />
              }
            />
            <SettingsItem
              icon="cloud-upload-outline"
              title="Auto Backup"
              description="Daily backup to external storage"
              isLast
              rightElement={
                <Switch
                  value={autoBackupEnabled}
                  onValueChange={handleAutoBackupToggle}
                  disabled={isCheckingBackup}
                  color="#005AC1"
                  style={{ height: 36, marginVertical: 0 }}
                />
              }
            />
          </View>
        </View>

        {/* Data Overview */}
        <View style={styles.groupContainer}>
          <Text style={styles.groupLabel}>Data Overview</Text>
          <View style={styles.cardContainer}>
            <SettingsItem
              icon="account-group-outline"
              title="Customers"
              description={isLoadingCustomers ? "Loading..." : `${customers.length} customers registered`}
              onPress={navigateToCustomers}
            />
            <SettingsItem
              icon="content-cut"
              title="Rate Cut"
              description="Manage metal rate cuts"
              onPress={navigateToRateCut}
            />
            <SettingsItem
              icon="swap-horizontal"
              title="Rani/Rupa Bulk Sell"
              description="Bulk sell Rani or Rupu items"
              onPress={() => navigateToRaniRupaSell()}
            />
            <SettingsItem
              icon="package-variant-closed"
              title="Base Inventory"
              description={
                isLoadingInventory
                  ? "Loading..."
                  : `Gold: ${formatPureGoldPrecise((baseInventory?.gold999 + baseInventory?.gold995 || 0))}g, Silver: ${formatPureSilver(baseInventory?.silver || 0)}g, Money: ₹${formatIndianNumber(Math.round(baseInventory?.money || 0))}`
              }
              isLast
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
                          setTimeout(() => {
                            handleSetBaseInventoryWithWarning();
                          }, 100);
                        }
                      }
                    ],
                    'package-variant-closed'
                  );
                }
              }}
            />
          </View>
        </View>

        {/* Data Management */}
        <View style={styles.groupContainer}>
          <Text style={styles.groupLabel}>Data Management</Text>
          <View style={styles.cardContainer}>
            <SettingsItem
              icon="recycle"
              title="Recycle Bin"
              description="Restore deleted transactions"
              onPress={navigateToRecycleBin}
            />
            <SettingsItem
              icon="file-export-outline"
              title="Export Data"
              description="Backup manually to storage"
              onPress={handleExportData}
            />
            <SettingsItem
              icon="file-import-outline"
              title="Import Data"
              description="Restore from file"
              onPress={handleImportData}
            />
            <SettingsItem
              icon="delete-forever-outline"
              title="Clear All Data"
              description={isClearing ? "Clearing data..." : "Reset app to empty state"}
              isDestructive
              isLast
              onPress={handleClearAllData}
            />
          </View>
        </View>

        {/* About */}
        <View style={styles.groupContainer}>
          <Text style={styles.groupLabel}>About</Text>
          <View style={styles.cardContainer}>
            <SettingsItem
              icon="shield-check-outline"
              title="Privacy Policy"
              description="View privacy policy"
              onPress={() => setShowPrivacyPolicy(true)}
            />
            <SettingsItem
              icon="file-document-outline"
              title="Terms of Service"
              description="View terms of service"
              onPress={() => setShowTermsOfService(true)}
            />
            <SettingsItem
              icon="information-outline"
              title="About BullionDesk"
              description="v7.5.6"
              isLast
              onPress={() => setShowAbout(true)}
            />
          </View>
        </View>
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
        icon="shield-check-outline"
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
        icon="file-document-outline"
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
        icon="information-outline"
        message={`BullionDesk v7.5.6

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
    backgroundColor: '#F2F4F7', // --background
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#F2F4F7', // Match background
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3E7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#1B1B1F', // --on-surface
    letterSpacing: -1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 20,
  },
  groupContainer: {
    gap: 8,
  },
  groupLabel: {
    marginLeft: 12,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    color: '#005AC1', // --primary
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF', // --surface
    borderRadius: 32, // --card-radius
    overflow: 'hidden',
    elevation: 1, // box-shadow approximation
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    gap: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E2E5', // --outline-variant
  },
  iconBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
    color: '#1B1B1F', // --on-surface
    marginBottom: 2,
  },
  itemDesc: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    color: '#44474F', // --on-surface-variant
    lineHeight: 18,
  },
  destructiveItem: {
    backgroundColor: '#FFFBFB',
  },
  destructiveText: {
    color: '#BA1A1A', // --error
  },
});
