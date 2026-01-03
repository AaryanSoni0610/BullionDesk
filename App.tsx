import React, { useState } from 'react';
import { Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSpring,
  interpolateColor,
  useDerivedValue
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, Snackbar, FAB } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';

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
import { RateCutScreen } from './src/screens/RateCutScreen';
import { CustomerSelectionModal } from './src/components/CustomerSelectionModal';
import CustomAlert from './src/components/CustomAlert';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { NotificationService } from './src/services/notificationService';
import { BackupService } from './src/services/backupService';
import { DatabaseService } from './src/services/database.sqlite';
import { TradeService } from './src/services/trade.service';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

type AppState = 'tabs' | 'entry' | 'settlement' | 'settings' | 'customers' | 'trade' | 'raniRupaSell' | 'recycleBin' | 'rateCut';

// 1. Define the Custom Tab Bar Component
const CustomTabBar = ({ state, descriptors, navigation, fabIcon, onFabPress }: any) => {
  // Shared Values (UI Thread)
  const translateX = useSharedValue(0);
  const highlightWidth = useSharedValue(0);
  // We use index to drive color interpolation
  const activeIndex = useSharedValue(state.index);
  
  const [layouts, setLayouts] = React.useState<Array<{ x: number; width: number }>>([]);

  // Theme colors for interpolation
  const colors = [
    theme.colors.primaryContainer,
    theme.colors.secondaryContainer,
    theme.colors.surfaceContainer,
    theme.colors.surfaceContainerHigh,
  ];

  // Sync Shared Values when index or layouts change
  React.useEffect(() => {
    const target = layouts[state.index];
    
    // Update active index for color
    activeIndex.value = withTiming(state.index, { duration: 250 });

    if (target) {
      // Use Spring for "Expressive" feel, or Timing for "Standard"
      // Spring feels much more "physical" and hides lag better
      translateX.value = withSpring(target.x, { damping: 15, stiffness: 100 });
      highlightWidth.value = withSpring(target.width, { damping: 15, stiffness: 100 });
    }
  }, [state.index, layouts]);

  // Animated Style for the Highlight Pill
  const animatedHighlightStyle = useAnimatedStyle(() => {
    // Interpolate color on the UI thread
    const backgroundColor = interpolateColor(
      activeIndex.value,
      [0, 1, 2, 3], // Input range (tab indexes)
      colors        // Output colors
    );

    return {
      transform: [{ translateX: translateX.value }],
      width: highlightWidth.value,
      backgroundColor: backgroundColor,
    };
  });

  return (
    <View style={styles.tabBarContainer}>
      
      <View style={styles.navPill}>
        {/* Animated Highlight using Reanimated View */}
        <Animated.View
          style={[styles.highlight, animatedHighlightStyle]}
        />

        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // Define Icons
          let iconName;
          if (route.name === 'Home') iconName = isFocused ? 'home' : 'home-outline';
          else if (route.name === 'History') iconName = isFocused ? 'history' : 'clock-outline';
          else if (route.name === 'Trade') iconName = isFocused ? 'swap-vertical-circle-outline' : 'swap-vertical';
          else if (route.name === 'Ledger') iconName = isFocused ? 'chart-line' : 'chart-line-variant';

          const color = isFocused ? theme.colors.onPrimaryContainer : '#C7C7CC';

          return (
            <TouchableOpacity
              key={index}
              onPress={onPress}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                // Only update if layout actually changed to prevent re-renders
                setLayouts(prev => {
                  if (prev[index]?.x === x && prev[index]?.width === width) return prev;
                  const copy = [...prev]; 
                  copy[index] = { x, width }; 
                  return copy; 
                });
              }}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <Icon name={iconName as any} size={28} color={color} />
              {isFocused && (
                <Text style={[styles.tabLabel, { color }]}>
                  {route.name}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <FAB
        icon={fabIcon}
        style={styles.fab}
        color={theme.colors.onPrimaryContainer}
        onPress={onFabPress}
        customSize={64}
      />
      
    </View>
  );
};

// Main Tab Navigator Component with Stack for smooth transitions
const MainTabNavigator = () => {
  const Tab = createBottomTabNavigator();
  const { setCustomerModalVisible, setTradeDialogVisible, setLedgerDialogVisible } = useAppContext();
  const [activeRoute, setActiveRoute] = useState('Home');

  const getFabIcon = () => {
    switch (activeRoute) {
      case 'Home': return 'plus';
      case 'History': return 'plus';
      case 'Trade': return 'swap-vertical';
      case 'Ledger': return 'triangle-outline';
      default: return 'plus';
    }
  };

  const handleFabPress = () => {
    switch (activeRoute) {
      case 'Home': setCustomerModalVisible(true); break;
      case 'History': setCustomerModalVisible(true); break;
      case 'Trade': setTradeDialogVisible(true); break;
      case 'Ledger': setLedgerDialogVisible(true); break;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenListeners={({ route }) => ({
          state: (e: any) => {
            // Update active route state when tab changes
            const index = e.data.state.index;
            const routeName = e.data.state.routes[index].name;
            setActiveRoute(routeName);
          },
        })}
        // PASS THE CUSTOM TAB BAR HERE
        tabBar={(props) => (
          <CustomTabBar 
            {...props} 
            fabIcon={getFabIcon()} 
            onFabPress={handleFabPress} 
          />
        )}
        screenOptions={{ 
          headerShown: false
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Trade" component={TradeScreen} />
        <Tab.Screen name="Ledger" component={LedgerScreen} />
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  // The Parent Container (Fixed at bottom)
  tabBarContainer: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    flexDirection: 'row', // This aligns Navbar and FAB horizontally
    alignItems: 'center',
    backgroundColor: 'transparent',
    elevation: 0, // No shadow on container itself
    zIndex: 100,
  },
  
  // The Nav Pill (Flex Child 1)
  navPill: {
    flex: 1, // Takes all available width minus the FAB
    flexDirection: 'row',
    height: 64,
    backgroundColor: '#1B1B1F',
    borderRadius: 100,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    // Shadows
    elevation: 8,
    shadowColor: theme.colors.onPrimaryContainer,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  highlight: {
    position: 'absolute',
    left: 0,
    height: 54,
    borderRadius: 100,
    zIndex: 0,
  },

  // The FAB (Flex Child 2)
  fab: {
    marginLeft: 16, // The gap between Nav and FAB
    backgroundColor: '#00BCD4',
    borderRadius: 32,
    elevation: 6,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Individual Tab Items
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 100,
    height: 48,
    zIndex: 1,
  },
  tabLabel: {
    marginLeft: 8,
    fontSize: 12,
    fontFamily: 'Outfit_500Medium',
  }
});

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
  onNavigateToRateCut: () => void;
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
    pendingMoneyType,
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
              isFirstEntryForMoneyOnlyTransaction={editingTransactionId !== null && currentEntries.length === 0}
              originalMoneyOnlyType={pendingMoneyType}
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

          {appState === 'rateCut' && (
            <RateCutScreen />
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
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold
   });
  const [appState, setAppState] = useState<AppState>('tabs');

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
  const handleNavigateToRateCut = () => setAppState('rateCut');

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
      onNavigateToRateCut={handleNavigateToRateCut}
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
        onNavigateToRateCut={handleNavigateToRateCut}
      />
    </AppProvider>
  );
}
