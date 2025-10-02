import React from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Surface, Text, Switch, Divider, List, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import { theme } from '../theme';
import { useAppContext } from '../context/AppContext';
import { DatabaseService } from '../services/database';
import { NotificationService } from '../services/notificationService';
import { BackupService } from '../services/backupService';
import { EncryptionService } from '../services/encryptionService';
import { EncryptionKeyDialog } from '../components/EncryptionKeyDialog';

export const SettingsScreen: React.FC = () => {
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = React.useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = React.useState(false);
  const [isClearing, setIsClearing] = React.useState(false);
  const [isCheckingNotifications, setIsCheckingNotifications] = React.useState(true);
  const [isCheckingBackup, setIsCheckingBackup] = React.useState(true);
  const [showKeyDialog, setShowKeyDialog] = React.useState(false);
  const [keyDialogMode, setKeyDialogMode] = React.useState<'setup' | 'confirm' | 'enter'>('setup');
  const [tempKey, setTempKey] = React.useState<string>('');
  const [keyDialogCallback, setKeyDialogCallback] = React.useState<((key: string | null) => void) | null>(null);
  const { navigateToTabs } = useAppContext();

  // Check notification and backup status on mount
  React.useEffect(() => {
    const checkSettings = async () => {
      try {
        console.log('⚙️ SettingsScreen: Checking initial settings...');
        
        const notifEnabled = await NotificationService.isNotificationsEnabled();
        console.log('⚙️ SettingsScreen: Notifications enabled:', notifEnabled);
        setNotificationsEnabled(notifEnabled);

        const backupEnabled = await BackupService.isAutoBackupEnabled();
        console.log('⚙️ SettingsScreen: Auto backup enabled:', backupEnabled);
        setAutoBackupEnabled(backupEnabled);

        // Don't auto-initialize directories here
        // They will be created on demand when needed
      } catch (error) {
        console.error('Error checking settings:', error);
      } finally {
        setIsCheckingNotifications(false);
        setIsCheckingBackup(false);
      }
    };

    checkSettings();
  }, []);

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

  // Setup encryption key with Android-friendly dialogs
  const setupEncryptionKey = async (): Promise<boolean> => {
    try {
      // Check if key already exists
      const existingKey = await SecureStore.getItemAsync('backup_encryption_key');
      if (existingKey) {
        console.log('🔑 Encryption key already exists');
        return true;
      }

      console.log('🔑 No encryption key found, prompting user...');

      // Show setup dialog
      const key = await promptForEncryptionKey('setup');
      if (!key) {
        console.log('🔑 User cancelled key setup');
        return false;
      }

      // Validate key
      const validation = EncryptionService.isValidKey(key);
      if (!validation.valid) {
        Alert.alert('Invalid Key', validation.message || 'Key is invalid');
        return false;
      }

      // Show confirmation dialog
      const confirmKey = await promptForEncryptionKey('confirm');
      if (!confirmKey) {
        console.log('🔑 User cancelled key confirmation');
        return false;
      }

      if (key !== confirmKey) {
        Alert.alert('Error', 'Keys do not match. Please try again.');
        return false;
      }

      // Save key
      await SecureStore.setItemAsync('backup_encryption_key', key);
      console.log('🔑 Encryption key saved successfully');
      
      Alert.alert(
        'Success',
        'Encryption key has been set. Please remember this key - you will need it to restore your backups.',
        [{ text: 'OK' }]
      );
      
      return true;
    } catch (error) {
      console.error('🔑 Error setting up encryption key:', error);
      Alert.alert('Error', 'Failed to set up encryption key');
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
          Alert.alert(
            'Notifications Enabled',
            'You will receive daily reminders for customers with pending debt between 12:00 PM - 1:00 PM.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Permission Required',
            'Please grant notification permissions in your device settings to receive debt reminders.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('Error enabling notifications:', error);
        Alert.alert(
          'Error',
          'Failed to enable notifications. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } else {
      // Disabling notifications
      Alert.alert(
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
                Alert.alert(
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
      // Enabling auto backup - check and request permission first
      try {
        console.log('🟢 Auto backup toggle ON - Starting...');
        
        const hasPermission = await BackupService.hasStoragePermission();
        console.log('🟢 Has storage permission:', hasPermission);
        
        if (!hasPermission) {
          console.log('🟢 Requesting storage permission...');
          const granted = await BackupService.requestStoragePermission();
          console.log('🟢 Permission granted:', granted);
          
          if (!granted) {
            Alert.alert(
              'Permission Required',
              'Storage permission is required for automatic backups. Please grant permission to continue.',
              [{ text: 'OK' }]
            );
            return;
          }
        }

        console.log('🟢 Initializing directories...');
        const dirsReady = await BackupService.initializeDirectories();
        console.log('🟢 Directories ready:', dirsReady);
        
        if (!dirsReady) {
          Alert.alert('Error', 'Failed to initialize backup directories.');
          return;
        }

        // Setup encryption key - will prompt if not set
        console.log('🟢 Setting up encryption key if needed...');
        const hasKey = await setupEncryptionKey();
        console.log('🟢 Encryption key setup result:', hasKey);
        
        if (!hasKey) {
          console.log('🟢 User cancelled key setup - NOT enabling backup');
          // Don't change the toggle state - user cancelled
          return; // User cancelled key setup
        }

        // Key is set, now enable auto backup
        console.log('🟢 Setting auto backup enabled in database...');
        await BackupService.setAutoBackupEnabled(true);
        console.log('🟢 Verifying auto backup was saved...');
        
        // Verify it was actually saved
        const isEnabled = await BackupService.isAutoBackupEnabled();
        console.log('🟢 Auto backup verification result:', isEnabled);
        
        if (isEnabled) {
          setAutoBackupEnabled(true);
          console.log('🟢 Auto backup enabled successfully!');
          Alert.alert(
            'Auto Backup Enabled',
            'Your data will be automatically backed up daily.',
            [{ text: 'OK' }]
          );
        } else {
          console.error('🔴 Auto backup was not saved properly!');
          Alert.alert('Error', 'Failed to enable auto backup. Please try again.');
        }
      } catch (error) {
        console.error('🔴 Error enabling auto backup:', error);
        Alert.alert('Error', 'Failed to enable auto backup. Please try again.');
      }
    } else {
      // Disabling auto backup
      Alert.alert(
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
                console.log('🟢 Auto backup disabled');
              } catch (error) {
                console.error('🔴 Error disabling auto backup:', error);
                Alert.alert('Error', 'Failed to disable auto backup.');
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
        console.log('📤 No encryption key, setting up...');
        const keySetup = await setupEncryptionKey();
        if (!keySetup) {
          console.log('📤 User cancelled encryption key setup');
          return;
        }
      }

      await BackupService.exportData();
    } catch (error) {
      console.error('Error exporting data:', error);
      Alert.alert('Error', 'Failed to export data. Please try again.');
    }
  };

  const handleImportData = async () => {
    try {
      // Check if encryption key is set up
      const hasKey = await BackupService.hasEncryptionKey();
      if (!hasKey) {
        console.log('📥 No encryption key, setting up...');
        const keySetup = await setupEncryptionKey();
        if (!keySetup) {
          console.log('📥 User cancelled encryption key setup');
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
      await BackupService.importData(file.uri);
    } catch (error) {
      console.error('Error importing data:', error);
      Alert.alert('Error', 'Failed to import data. Please try again.');
    }
  };

  const handleClearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to permanently delete all data? This action cannot be undone.\n\nThis will delete:\n• All customers\n• All transactions\n\nInventory will reset to base values.',
      [
        {
          text: 'No',
          style: 'cancel',
          onPress: () => {
            console.log('Clear data cancelled');
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
                Alert.alert(
                  'Success',
                  'All data has been cleared successfully.',
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  'Error',
                  'Failed to clear data. Please try again.',
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              Alert.alert(
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
      { cancelable: true }
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
            title="Dark Mode"
            description="Use dark theme for the app"
            left={props => <List.Icon {...props} icon="theme-light-dark" />}
            right={() => (
              <Switch
                value={darkModeEnabled}
                onValueChange={setDarkModeEnabled}
              />
            )}
          />

          <Divider />

          <List.Item
            title="Auto Backup"
            description="Automatically backup data daily"
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

        {/* Data Management */}
        <List.Section>
          <List.Subheader style={styles.sectionHeader}>Data Management</List.Subheader>

          <List.Item
            title="Export Data"
            description="Export all transactions and customers"
            left={props => <List.Icon {...props} icon="file-export-outline" />}
            onPress={handleExportData}
          />

          <Divider />

          <List.Item
            title="Import Data"
            description="Import transactions and customers from file"
            left={props => <List.Icon {...props} icon="file-import-outline" />}
            onPress={handleImportData}
          />

          <Divider />

          <List.Item
            title="Clear All Data"
            description={isClearing ? "Clearing data..." : "Delete all data, reset inventory to base"}
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
            description="1.0.0"
            left={props => <List.Icon {...props} icon="information-outline" />}
          />

          <Divider />

          <List.Item
            title="Privacy Policy"
            left={props => <List.Icon {...props} icon="shield-check-outline" />}
            onPress={() => {
              // TODO: Open privacy policy
            }}
          />

          <Divider />

          <List.Item
            title="Terms of Service"
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
});