import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Customer, TransactionEntry } from '../types';
import { DatabaseService } from '../services/database';

interface AppContextType {
  // Customer and Entry Management
  currentCustomer: Customer | null;
  setCurrentCustomer: (customer: Customer | null) => void;
  currentEntries: TransactionEntry[];
  setCurrentEntries: (entries: TransactionEntry[]) => void;
  editingEntryId: string | null;
  setEditingEntryId: (id: string | null) => void;
  
  // Modal Management
  customerModalVisible: boolean;
  setCustomerModalVisible: (visible: boolean) => void;
  
  // Snackbar Management
  snackbarVisible: boolean;
  setSnackbarVisible: (visible: boolean) => void;
  snackbarMessage: string;
  setSnackbarMessage: (message: string) => void;
  
  // Navigation
  navigateToEntry: (customer: Customer) => void;
  navigateToSettlement: () => void;
  navigateToSettings: () => void;
  navigateToTabs: () => void;
  
  // Transaction Management
  handleSelectCustomer: (customer: Customer) => void;
  handleCreateCustomer: (name: string) => Promise<void>;
  handleAddEntry: (entry: TransactionEntry) => void;
  handleEditEntry: (entryId: string) => void;
  handleDeleteEntry: (entryId: string) => void;
  handleSaveTransaction: (receivedAmount?: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
  onNavigateToEntry: () => void;
  onNavigateToSettlement: () => void;
  onNavigateToSettings: () => void;
  onNavigateToTabs: () => void;
}

export const AppProvider: React.FC<AppProviderProps> = ({ 
  children, 
  onNavigateToEntry,
  onNavigateToSettlement,
  onNavigateToSettings,
  onNavigateToTabs,
}) => {
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [currentEntries, setCurrentEntries] = useState<TransactionEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const navigateToEntry = (customer: Customer) => {
    setCurrentCustomer(customer);
    setCurrentEntries([]);
    onNavigateToEntry();
  };

  const navigateToSettlement = () => {
    onNavigateToSettlement();
  };

  const navigateToSettings = () => {
    onNavigateToSettings();
  };

  const navigateToTabs = () => {
    setCurrentCustomer(null);
    setCurrentEntries([]);
    setEditingEntryId(null);
    onNavigateToTabs();
  };

  const handleSelectCustomer = (customer: Customer) => {
    setCustomerModalVisible(false);
    navigateToEntry(customer);
  };

  const handleCreateCustomer = async (name: string) => {
    setCustomerModalVisible(false);

    // Create new customer
    const newCustomer: Customer = {
      id: Date.now().toString(),
      name,
      balance: 0,
    };

    // Navigate immediately to avoid lag
    navigateToEntry(newCustomer);

    // Save customer in background
    try {
      const saved = await DatabaseService.saveCustomer(newCustomer);
      if (saved) {
        console.log('New customer created:', newCustomer);
      } else {
        setSnackbarMessage('Failed to save customer data');
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      setSnackbarMessage('Error saving customer data');
      setSnackbarVisible(true);
    }
  };

  const handleAddEntry = (entry: TransactionEntry) => {
    if (editingEntryId) {
      // Update existing entry
      setCurrentEntries(prev => prev.map(e => e.id === editingEntryId ? entry : e));
      setEditingEntryId(null);
    } else {
      // Add new entry
      setCurrentEntries(prev => [...prev, entry]);
    }
    // Navigate to settlement summary after adding/updating entry
    onNavigateToSettlement();
  };

  const handleEditEntry = (entryId: string) => {
    setEditingEntryId(entryId);
    onNavigateToEntry();
  };

  const handleDeleteEntry = (entryId: string) => {
    setCurrentEntries(prev => prev.filter(entry => entry.id !== entryId));
    // If no entries left, go back to entry screen
    if (currentEntries.length <= 1) {
      onNavigateToEntry();
    }
  };

  const handleSaveTransaction = async (receivedAmount: number = 0) => {
    if (!currentCustomer || currentEntries.length === 0) {
      return;
    }

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
        
        // Navigate back to tabs
        onNavigateToTabs();
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
    }
  };

  const contextValue: AppContextType = {
    currentCustomer,
    setCurrentCustomer,
    currentEntries,
    setCurrentEntries,
    editingEntryId,
    setEditingEntryId,
    customerModalVisible,
    setCustomerModalVisible,
    snackbarVisible,
    setSnackbarVisible,
    snackbarMessage,
    setSnackbarMessage,
    navigateToEntry,
    navigateToSettlement,
    navigateToSettings,
    navigateToTabs,
    handleSelectCustomer,
    handleCreateCustomer,
    handleAddEntry,
    handleEditEntry,
    handleDeleteEntry,
    handleSaveTransaction,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
