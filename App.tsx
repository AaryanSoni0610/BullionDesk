import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, Snackbar } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import {
  Roboto_100Thin,
  Roboto_300Light,
  Roboto_400Regular,
  Roboto_400Regular_Italic,
  Roboto_500Medium,
  Roboto_500Medium_Italic,
  Roboto_700Bold,
  Roboto_700Bold_Italic,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';

import { theme } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { LedgerScreen } from './src/screens/LedgerScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { EntryScreen } from './src/screens/EntryScreen';
import { SettlementSummaryScreen } from './src/screens/SettlementSummaryScreen';
import { CustomerListScreen } from './src/screens/CustomerListScreen';
import { CustomerSelectionModal } from './src/components/CustomerSelectionModal';
import CustomAlert from './src/components/CustomAlert';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { NotificationService } from './src/services/notificationService';
import { BackupService } from './src/services/backupService';

const Tab = createBottomTabNavigator();

type AppState = 'tabs' | 'entry' | 'settlement' | 'settings' | 'customers';

// Main App Component with Context
interface AppContentProps {
  appState: AppState;
  onNavigateToEntry: () => void;
  onNavigateToSettlement: () => void;
  onNavigateToSettings: () => void;
  onNavigateToTabs: () => void;
  onNavigateToCustomers: () => void;
}

const AppContent: React.FC<AppContentProps> = ({
  appState,
  onNavigateToEntry,
  onNavigateToSettlement,
  onNavigateToSettings,
  onNavigateToTabs,
  onNavigateToCustomers,
}) => {
  const {
    currentCustomer,
    currentEntries,
    editingEntryId,
    editingTransactionId,
    lastGivenMoney,
    transactionCreatedAt,
    transactionLastUpdatedAt,
    customerModalVisible,
    setCustomerModalVisible,
    snackbarVisible,
    setSnackbarVisible,
    snackbarMessage,
    alertVisible,
    setAlertVisible,
    alertTitle,
    alertMessage,
    alertButtons,
    handleSelectCustomer,
    handleCreateCustomer,
    handleAddEntry,
    handleEditEntry,
    handleDeleteEntry,
    handleSaveTransaction,
  } = useAppContext();

  const handleAddMoreEntry = () => {
    onNavigateToEntry();
  };

  // Main Tab Navigator Component
  const MainTabNavigator = () => (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size }) => {
          let iconName: keyof typeof Icon.glyphMap;
          
          switch (route.name) {
            case 'Home':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'History':
              iconName = focused ? 'history' : 'clock-outline';
              break;
            case 'Ledger':
              iconName = focused ? 'chart-line' : 'chart-line-variant';
              break;
            default:
              iconName = 'circle';
          }
          
          return (
            <Icon 
              name={iconName} 
              size={24} 
              color={focused ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
          );
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          height: theme.dimensions.bottomNavHeight,
          backgroundColor: theme.colors.surface,
          elevation: theme.elevation.level3,
          borderTopWidth: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'Roboto_500Medium',
          marginBottom: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen}
        options={{ tabBarLabel: 'History' }}
      />
      <Tab.Screen 
        name="Ledger" 
        component={LedgerScreen}
        options={{ tabBarLabel: 'Ledger' }}
      />
    </Tab.Navigator>
  );

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NavigationContainer>
          {appState === 'tabs' && (
            <MainTabNavigator />
          )}
          
          {appState === 'entry' && currentCustomer && (
            <EntryScreen
              customer={currentCustomer}
              editingEntry={editingEntryId ? currentEntries.find(e => e.id === editingEntryId) : undefined}
              existingEntries={currentEntries}
              onBack={onNavigateToTabs}
              onNavigateToSummary={onNavigateToSettlement}
              onAddEntry={handleAddEntry}
            />
          )}
          
          {appState === 'settlement' && currentCustomer && (
            <SettlementSummaryScreen
              customer={currentCustomer}
              entries={currentEntries}
              onBack={onNavigateToTabs}
              onAddMoreEntry={handleAddMoreEntry}
              onDeleteEntry={handleDeleteEntry}
              onEditEntry={handleEditEntry}
              onSaveTransaction={handleSaveTransaction}
              editingTransactionId={editingTransactionId}
              lastGivenMoney={lastGivenMoney}
              transactionCreatedAt={transactionCreatedAt}
              transactionLastUpdatedAt={transactionLastUpdatedAt}
            />
          )}

          {appState === 'settings' && (
            <SettingsScreen />
          )}

          {appState === 'customers' && (
            <CustomerListScreen />
          )}

          {/* Customer Selection Modal */}
          <CustomerSelectionModal
            visible={customerModalVisible}
            onDismiss={() => setCustomerModalVisible(false)}
            onSelectCustomer={handleSelectCustomer}
            onCreateCustomer={handleCreateCustomer}
          />

          {/* Success Snackbar */}
          <Snackbar
            visible={snackbarVisible}
            onDismiss={() => setSnackbarVisible(false)}
            duration={3000}
            action={{
              label: 'OK',
              onPress: () => setSnackbarVisible(false),
            }}
          >
            {snackbarMessage}
          </Snackbar>

          {/* Custom Alert */}
          <CustomAlert
            visible={alertVisible}
            title={alertTitle}
            message={alertMessage}
            buttons={alertButtons}
            onDismiss={() => setAlertVisible(false)}
          />

          <StatusBar style="dark" backgroundColor="#FAFAFA" />
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Roboto_100Thin,
    Roboto_300Light,
    Roboto_400Regular,
    Roboto_400Regular_Italic,
    Roboto_500Medium,
    Roboto_500Medium_Italic,
    Roboto_700Bold,
    Roboto_700Bold_Italic,
    Roboto_900Black,
  });

  const [appState, setAppState] = useState<AppState>('tabs');

  // Initialize services on app start
  React.useEffect(() => {
    const initializeServices = async () => {
      // Initialize notifications
      await NotificationService.initialize();

      const shouldBackup = await BackupService.shouldPerformAutoBackup();
      if (shouldBackup) {
        await BackupService.performAutoBackup();
      }
    };

    initializeServices();
  }, []);

  const handleNavigateToEntry = () => setAppState('entry');
  const handleNavigateToSettlement = () => setAppState('settlement');
  const handleNavigateToSettings = () => setAppState('settings');
  const handleNavigateToTabs = () => setAppState('tabs');
  const handleNavigateToCustomers = () => setAppState('customers');

  if (!fontsLoaded) {
    return null; // or a loading screen
  }

  return (
    <AppProvider
      onNavigateToEntry={handleNavigateToEntry}
      onNavigateToSettlement={handleNavigateToSettlement}
      onNavigateToSettings={handleNavigateToSettings}
      onNavigateToTabs={handleNavigateToTabs}
      onNavigateToCustomers={handleNavigateToCustomers}
    >
      <AppContent 
        appState={appState}
        onNavigateToEntry={handleNavigateToEntry}
        onNavigateToSettlement={handleNavigateToSettlement}
        onNavigateToSettings={handleNavigateToSettings}
        onNavigateToTabs={handleNavigateToTabs}
        onNavigateToCustomers={handleNavigateToCustomers}
      />
    </AppProvider>
  );
}
