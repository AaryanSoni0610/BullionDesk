import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, BackHandler } from 'react-native';
import { Surface, Text, Switch, Divider, List, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import { theme } from '../theme';
import { useAppContext } from '../context/AppContext';
import { DatabaseService } from '../services/database';
import { NotificationService } from '../services/notificationService';
import { BackupService } from '../services/backupService';
import { EncryptionService } from '../services/encryptionService';
import { EncryptionKeyDialog } from '../components/EncryptionKeyDialog';
import { InventoryInputDialog } from '../components/InventoryInputDialog';
import { formatIndianNumber } from '../utils/formatting';

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
  const [openingBalanceEffects, setOpeningBalanceEffects] = React.useState<any>(null);
  const [isLoadingCustomers, setIsLoadingCustomers] = React.useState(true);
  const [isLoadingInventory, setIsLoadingInventory] = React.useState(true);
  const [showInventoryDialog, setShowInventoryDialog] = React.useState(false);
  const [inventoryDialogStep, setInventoryDialogStep] = React.useState<'gold' | 'silver' | 'money'>('gold');
  const [inventoryInputs, setInventoryInputs] = React.useState<any[]>([]);
  const [collectedInventoryData, setCollectedInventoryData] = React.useState<any>({});
  const { navigateToTabs, showAlert, navigateToCustomers, navigateToRaniRupaSell } = useAppContext();

  // Check notification and backup status on mount
  React.useEffect(() => {
    // Configure BackupService to use CustomAlert
    BackupService.setAlertFunction(showAlert);
    
    const checkSettings = async () => {
      try {
        
        const notifEnabled = await NotificationService.isNotificationsEnabled();
        setNotificationsEnabled(notifEnabled);

        const backupEnabled = await BackupService.isAutoBackupEnabled();
        setAutoBackupEnabled(backupEnabled);

        // Load customers and base inventory
        const [customersData, inventoryData, effectsData] = await Promise.all([
          DatabaseService.getAllCustomers(),
          DatabaseService.getBaseInventory(),
          DatabaseService.calculateOpeningBalanceEffects()
        ]);
        
        setCustomers(customersData);
        setBaseInventory(inventoryData);
        setOpeningBalanceEffects(effectsData);
        
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
  }, []);

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
      'Setting base inventory when there are existing customer balances or transactions can significantly affect your inventory calculations.\n\nPlease ensure that:\n• All customer balances represent opening balances only\n• No actual business transactions have been recorded yet\n• You understand that this will adjust your base inventory to account for existing balances\n\nThis action cannot be easily undone.',
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
        label: 'Gold 999 (grams)',
        value: (baseInventory?.gold999 || 300).toString(),
        placeholder: '300'
      },
      {
        key: 'gold995',
        label: 'Gold 995 (grams)',
        value: (baseInventory?.gold995 || 100).toString(),
        placeholder: '100'
      }
    ]);
    setCollectedInventoryData({});
    setShowInventoryDialog(true);
  };

  const handleInventoryDialogSubmit = (values: Record<string, number>) => {
    const updatedData = { ...collectedInventoryData, ...values };
    setCollectedInventoryData(updatedData);

    if (inventoryDialogStep === 'gold') {
      // Move to silver
      setInventoryDialogStep('silver');
      setInventoryInputs([
        {
          key: 'silver',
          label: 'Base Silver (grams)',
          value: (baseInventory?.silver || 10000).toString(),
          placeholder: '10000'
        }
      ]);
    } else if (inventoryDialogStep === 'silver') {
      // Move to money
      setInventoryDialogStep('money');
      setInventoryInputs([
        {
          key: 'money',
          label: 'Money (₹)',
          value: (baseInventory?.money || 3000000).toString(),
          placeholder: '3000000'
        }
      ]);
    } else if (inventoryDialogStep === 'money') {
      // All steps complete, save the inventory
      setShowInventoryDialog(false);
      
      const finalInventory = {
        gold999: updatedData.gold999,
        gold995: updatedData.gold995,
        silver: updatedData.silver,
        rani: baseInventory?.rani || 0,
        rupu: baseInventory?.rupu || 0,
        money: updatedData.money
      };

      DatabaseService.setBaseInventory(finalInventory).then(success => {
        if (success) {
          setBaseInventory(finalInventory);
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
                  DatabaseService.getAllCustomers(),
                  DatabaseService.getBaseInventory()
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
            title="Metal Inventory"
            description={
              isLoadingInventory
                ? "Loading..."
                : `Gold: ${DatabaseService.roundInventoryValue((baseInventory?.gold999 + baseInventory?.gold995 || 0), 'gold999')}g, Silver: ${DatabaseService.roundInventoryValue(baseInventory?.silver || 0, 'silver')}g, Money: ₹${formatIndianNumber(DatabaseService.roundInventoryValue(baseInventory?.money || 0, 'money'))}`
            }
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="package-variant-closed" />}
            onPress={() => {
              if (baseInventory) {
                let message = `Gold 999: ${DatabaseService.roundInventoryValue(baseInventory.gold999, 'gold999')}g\nGold 995: ${DatabaseService.roundInventoryValue(baseInventory.gold995, 'gold995')}g\nSilver: ${DatabaseService.roundInventoryValue(baseInventory.silver, 'silver')}g\nRani: ${DatabaseService.roundInventoryValue(baseInventory.rani, 'rani')}g\nRupu: ${DatabaseService.roundInventoryValue(baseInventory.rupu, 'rupu')}g\nMoney: ₹${formatIndianNumber(DatabaseService.roundInventoryValue(baseInventory.money, 'money'))}`;
                
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
            left={props => <List.Icon {...props} icon="delete-outline" color={theme.colors.error} />}
            disabled={isClearing}
            onPress={handleClearAllData}
          />
        </List.Section>

        {/* About */}
        <List.Section>
          <List.Subheader style={styles.sectionHeader}>About</List.Subheader>

          <List.Item
            title="Version"
            description="v1.2.6"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            descriptionStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="information-outline" />}
          />

          <Divider />

          <List.Item
            title="Privacy Policy"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="shield-check-outline" />}
            onPress={() => {
              // TODO: Open privacy policy
            }}
          />

          <Divider />

          <List.Item
            title="Terms of Service"
            titleStyle={{ fontFamily: 'Roboto_400Regular' }}
            left={props => <List.Icon {...props} icon="file-document-outline" />}
            onPress={() => {
              // TODO: Open terms of service
            }}
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
            ? 'Enter the current gold inventory levels:'
            : inventoryDialogStep === 'silver'
            ? 'Enter the current silver inventory levels:'
            : 'Enter the current money balance:'
        }
        inputs={inventoryInputs}
        onSubmit={handleInventoryDialogSubmit}
        onCancel={handleInventoryDialogCancel}
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