import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { PaperProvider, FAB, Snackbar } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { theme } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { EntryScreen } from './src/screens/EntryScreen';
import { SettlementSummaryScreen } from './src/screens/SettlementSummaryScreen';
import { CustomerSelectionModal } from './src/components/CustomerSelectionModal';
import { Customer, TransactionEntry } from './src/types';
import { DatabaseService } from './src/services/database';
import { DatabaseTestUtils } from './src/utils/databaseTest';

// Clear database on app start (development/testing only)
DatabaseService.clearAllData().then(() => console.log('Database cleared for fresh start'));

const Tab = createBottomTabNavigator();

type AppState = 'home' | 'entry' | 'settlement';

export default function App() {
  const [appState, setAppState] = useState<AppState>('home');
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [currentEntries, setCurrentEntries] = useState<TransactionEntry[]>([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectCustomer = (customer: Customer) => {
    setCustomerModalVisible(false);
    setCurrentCustomer(customer);
    setCurrentEntries([]);
    setAppState('entry');
  };

  const handleCreateCustomer = async (name: string) => {
    setCustomerModalVisible(false);
    try {
      // Create new customer
      const newCustomer: Customer = {
        id: Date.now().toString(),
        name,
        balance: 0,
      };
      
      // Save customer to database
      const saved = await DatabaseService.saveCustomer(newCustomer);
      if (saved) {
        console.log('New customer created:', newCustomer);
        setCurrentCustomer(newCustomer);
        setCurrentEntries([]);
        setAppState('entry');
      } else {
        setSnackbarMessage('Failed to create customer');
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      setSnackbarMessage('Error creating customer');
      setSnackbarVisible(true);
    }
  };

  const handleBackToHome = () => {
    setCurrentCustomer(null);
    setCurrentEntries([]);
    setAppState('home');
  };

  const handleAddEntry = (entry: TransactionEntry) => {
    setCurrentEntries(prev => [...prev, entry]);
    // Navigate to settlement summary after adding entry
    setAppState('settlement');
  };

  const handleAddMoreEntry = () => {
    // Go back to entry screen to add more entries
    setAppState('entry');
  };

  const handleDeleteEntry = (entryId: string) => {
    setCurrentEntries(prev => prev.filter(entry => entry.id !== entryId));
    // If no entries left, go back to entry screen
    if (currentEntries.length <= 1) {
      setAppState('entry');
    }
  };

  const handleSaveTransaction = async (receivedAmount: number = 0) => {
    if (!currentCustomer || currentEntries.length === 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    console.log('Saving transaction:', { 
      customer: currentCustomer, 
      entries: currentEntries,
      receivedAmount 
    });

    try {
      // Save transaction to database
      const result = await DatabaseService.saveTransaction(
        currentCustomer, 
        currentEntries, 
        receivedAmount
      );

      if (result.success) {
        // Show success message
        setSnackbarMessage('Transaction saved successfully!');
        setSnackbarVisible(true);
        
        // Navigate back to home
        handleBackToHome();
        console.log('Transaction saved with ID:', result.transactionId);
      } else {
        // Show error message
        setSnackbarMessage(result.error || 'Failed to save transaction');
        setSnackbarVisible(true);
        console.error('Failed to save transaction:', result.error);
      }
    } catch (error) {
      console.error('Error saving transaction:', error);
      setSnackbarMessage('Error saving transaction');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  const showFAB = appState === 'home' || appState === 'settlement';
  const fabIcon = appState === 'home' ? 'plus' : 'plus';
  
  const handleFABPress = () => {
    if (appState === 'home') {
      setCustomerModalVisible(true);
    } else if (appState === 'settlement') {
      handleAddMoreEntry();
    }
  };

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NavigationContainer>
          {appState === 'home' && (
            <Tab.Navigator
              screenOptions={{
                headerShown: false,
                tabBarStyle: { display: 'none' }, // Hide tab bar for now
              }}
            >
              <Tab.Screen name="Home" component={HomeScreen} />
            </Tab.Navigator>
          )}
          
          {appState === 'entry' && currentCustomer && (
            <EntryScreen
              customer={currentCustomer}
              onBack={handleBackToHome}
              onAddEntry={handleAddEntry}
            />
          )}
          
          {appState === 'settlement' && currentCustomer && (
            <SettlementSummaryScreen
              customer={currentCustomer}
              entries={currentEntries}
              onBack={handleBackToHome}
              onAddMoreEntry={handleAddMoreEntry}
              onDeleteEntry={handleDeleteEntry}
              onSaveTransaction={handleSaveTransaction}
            />
          )}

          {/* Floating Action Button */}
          {showFAB && (
            <FAB
              icon={fabIcon}
              style={styles.fab}
              onPress={handleFABPress}
            />
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

          <StatusBar style="auto" />
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 16,
    backgroundColor: theme.colors.primary,
  },
});
