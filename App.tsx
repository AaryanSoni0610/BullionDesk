import React, { useState } from 'react';
import { View, Animated, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, Snackbar, Text } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation, useNavigationState } from '@react-navigation/native';
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
import { CustomerSelectionModal } from './src/components/CustomerSelectionModal';
import CustomAlert from './src/components/CustomAlert';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { NotificationService } from './src/services/notificationService';
import { BackupService } from './src/services/backupService';
import { TradeService } from './src/services/tradeService';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

type AppState = 'tabs' | 'entry' | 'settlement' | 'settings' | 'customers' | 'trade' | 'raniRupaSell';

// Custom horizontal sliding interpolator for swipe gestures
const horizontalSlideInterpolator = ({ current, next, inverted, layouts: { screen } }: any) => {
  const translateX = Animated.multiply(
    current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [screen.width, 0],
      extrapolate: 'clamp',
    }),
    inverted
  );

  return {
    cardStyle: {
      transform: [{ translateX }],
    },
  };
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

  // Main Tab Navigator Component with Stack for smooth transitions
  const MainTabNavigator = () => {
    const navigation = useNavigation();
    const currentRouteName = useNavigationState(state => {
      if (!state) return 'Home';
      const route = state.routes[state.index];
      return route?.name || 'Home';
    });
    
    return (
      <View style={{ flex: 1 }}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyleInterpolator: horizontalSlideInterpolator,
            transitionSpec: {
              open: {
                animation: 'timing',
                config: {
                  duration: 300,
                },
              },
              close: {
                animation: 'timing',
                config: {
                  duration: 300,
                },
              },
            },
          }}
        >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="Trade" component={TradeScreen} />
        <Stack.Screen name="Ledger" component={LedgerScreen} />
      </Stack.Navigator>
      
      {/* Custom Bottom Tab Bar */}
      <View style={{
        height: theme.dimensions.bottomNavHeight,
        backgroundColor: theme.colors.surface,
        elevation: theme.elevation.level3,
        borderTopWidth: 0,
        flexDirection: 'row',
      }}>
        {[
          { name: 'Home', label: 'Home', focusedIcon: 'home', unfocusedIcon: 'home-outline' },
          { name: 'History', label: 'History', focusedIcon: 'history', unfocusedIcon: 'clock-outline' },
          { name: 'Trade', label: 'Trade', focusedIcon: 'swap-vertical-circle-outline', unfocusedIcon: 'swap-vertical' },
          { name: 'Ledger', label: 'Ledger', focusedIcon: 'chart-line', unfocusedIcon: 'chart-line-variant' },
        ].map((tab) => {
          const isFocused = currentRouteName === tab.name;
          return (
            <TouchableOpacity
              key={tab.name}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
              }}
              onPress={() => {
                (navigation as any).navigate(tab.name);
              }}
            >
              <Icon 
                name={(isFocused ? tab.focusedIcon : tab.unfocusedIcon) as keyof typeof Icon.glyphMap}
                size={24}
                color={isFocused ? theme.colors.primary : theme.colors.onSurfaceVariant}
              />
              <Text style={{
                fontSize: 12,
                fontFamily: 'Roboto_500Medium',
                marginTop: 2,
                color: isFocused ? theme.colors.primary : theme.colors.onSurfaceVariant,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
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
      />
    </AppProvider>
  );
}
