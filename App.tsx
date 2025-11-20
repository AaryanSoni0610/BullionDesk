import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, Snackbar } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
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
import { TradeScreen } from './src/screens/TradeScreen';
import { RaniRupaSellScreen } from './src/screens/RaniRupaSellScreen';
import { RecycleBinScreen } from './src/screens/RecycleBinScreen';
import { CustomerSelectionModal } from './src/components/CustomerSelectionModal';
import CustomAlert from './src/components/CustomAlert';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { NotificationService } from './src/services/notificationService';
import { BackupService } from './src/services/backupService';
import { DatabaseService } from './src/services/database.sqlite';
import { TradeService } from './src/services/trade.service';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

type AppState = 'tabs' | 'entry' | 'settlement' | 'settings' | 'customers' | 'trade' | 'raniRupaSell' | 'recycleBin';

// Custom Tab Bar Button with Rectangular Touch Area and Ripple Effect
const CustomTabBarButton = ({ children, onPress }: any) => {

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        opacity: pressed ? 0.7 : 1, // Fallback opacity for iOS
      })}
      android_ripple={{
        color: theme.colors.primaryContainer,
        borderless: false,
        radius: undefined, // Use default radius (rectangular)
      }}
    >
      {children}
    </Pressable>
  );
};

// Main Tab Navigator Component with Stack for smooth transitions
const MainTabNavigator = () => {
  const Tab = createBottomTabNavigator();

  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: any }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
          let iconName;
          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'history' : 'clock-outline';
          } else if (route.name === 'Trade') {
            iconName = focused ? 'swap-vertical-circle-outline' : 'swap-vertical';
          } else if (route.name === 'Ledger') {
            iconName = focused ? 'chart-line' : 'chart-line-variant';
          }
          return <Icon name={iconName as keyof typeof Icon.glyphMap} size={size} color={color} />;
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
          marginTop: 2,
        },
        tabBarButton: CustomTabBarButton,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Trade" component={TradeScreen} />
      <Tab.Screen name="Ledger" component={LedgerScreen} />
    </Tab.Navigator>
  );
};

// Main App Component with Context
interface AppContentProps {
  appState: AppState;
  onNavigateToEntry: () => void;
  onNavigateToSettlement: () => void;
  onNavigateToSettings: () => void;
  onNavigateToTabs: () => void;
  onNavigateToCustomers: () => void;
  onNavigateToTrade: () => void;
  onNavigateToRaniRupaSell: () => void;
  onNavigateToRecycleBin: () => void;
}

const AppContent: React.FC<AppContentProps> = ({
  appState,
  onNavigateToEntry,
  onNavigateToSettlement,
  onNavigateToTabs,
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
    allowCustomerCreation,
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

          {appState === 'trade' && (
            <TradeScreen />
          )}

          {appState === 'raniRupaSell' && (
            <RaniRupaSellScreen />
          )}

          {appState === 'recycleBin' && (
            <RecycleBinScreen />
          )}

          {/* Customer Selection Modal */}
          <CustomerSelectionModal
            visible={customerModalVisible}
            onDismiss={() => setCustomerModalVisible(false)}
            onSelectCustomer={handleSelectCustomer}
            onCreateCustomer={handleCreateCustomer}
            allowCreateCustomer={allowCustomerCreation}
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
      // Initialize SQLite database first
      await DatabaseService.initDatabase();
      
      // Initialize notifications
      await NotificationService.initialize();

      // Setup console.error logging to backup log file
      BackupService.setupConsoleErrorLogging();

      // Register background auto backup task if enabled
      const isAutoBackupEnabled = await BackupService.isAutoBackupEnabled();
      if (isAutoBackupEnabled) {
        await BackupService.registerBackgroundTask();
      }

      // Register background trade cleanup task
      await TradeService.registerBackgroundTask();

      // Check if immediate backup is needed
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
  const handleNavigateToTrade = () => setAppState('trade');
  const handleNavigateToRaniRupaSell = () => setAppState('raniRupaSell');
  const handleNavigateToRecycleBin = () => setAppState('recycleBin');

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
      onNavigateToTrade={handleNavigateToTrade}
      onNavigateToRaniRupaSell={handleNavigateToRaniRupaSell}
      onNavigateToRecycleBin={handleNavigateToRecycleBin}
    >
      <AppContent 
        appState={appState}
        onNavigateToEntry={handleNavigateToEntry}
        onNavigateToSettlement={handleNavigateToSettlement}
        onNavigateToSettings={handleNavigateToSettings}
        onNavigateToTabs={handleNavigateToTabs}
        onNavigateToCustomers={handleNavigateToCustomers}
        onNavigateToTrade={handleNavigateToTrade}
        onNavigateToRaniRupaSell={handleNavigateToRaniRupaSell}
        onNavigateToRecycleBin={handleNavigateToRecycleBin}
      />
    </AppProvider>
  );
}
