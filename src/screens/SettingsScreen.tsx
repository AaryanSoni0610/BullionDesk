import React from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Surface, Text, Switch, Divider, List, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { useAppContext } from '../context/AppContext';
import { DatabaseService } from '../services/database';

export const SettingsScreen: React.FC = () => {
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [autoBackupEnabled, setAutoBackupEnabled] = React.useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = React.useState(false);
  const [isClearing, setIsClearing] = React.useState(false);
  const { navigateToTabs } = useAppContext();

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
            description="Receive notifications for new transactions"
            left={props => <List.Icon {...props} icon="bell-outline" />}
            right={() => (
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
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
            description="Automatically backup data to cloud"
            left={props => <List.Icon {...props} icon="cloud-upload-outline" />}
            right={() => (
              <Switch
                value={autoBackupEnabled}
                onValueChange={setAutoBackupEnabled}
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
            onPress={() => {
              // TODO: Implement export functionality
            }}
          />

          <Divider />

          <List.Item
            title="Import Data"
            description="Import transactions and customers from file"
            left={props => <List.Icon {...props} icon="file-import-outline" />}
            onPress={() => {
              // TODO: Implement import functionality
            }}
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