import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Customer, TransactionEntry, ItemType, PaymentInput } from '../types';
import { CustomerService } from '../services/customer.service';
import { TransactionService } from '../services/transaction.service';
import { TradeService } from '../services/trade.service';

export interface LastEntryState {
  transactionType: 'purchase' | 'sell' | 'money';
  itemType: ItemType;
  weight?: number;
  price?: number;
}

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AppContextType {
  // Customer and Entry Management
  currentCustomer: Customer | null;
  setCurrentCustomer: (customer: Customer | null) => void;
  currentEntries: TransactionEntry[];
  setCurrentEntries: (entries: TransactionEntry[]) => void;
  editingEntryId: string | null;
  setEditingEntryId: (id: string | null) => void;
  editingTransactionId: string | null;
  setEditingTransactionId: (id: string | null) => void;
  pendingMoneyAmount: number;
  setPendingMoneyAmount: (amount: number) => void;
  pendingMoneyType: 'give' | 'receive';
  setPendingMoneyType: (type: 'give' | 'receive') => void;
  transactionCreatedAt: string | null;
  transactionLastUpdatedAt: string | null;
  
  // Trade Conversion State
  tradeIdToDeleteOnSave: string | null;
  setTradeIdToDeleteOnSave: (id: string | null) => void;
  
  // Last Entry State
  lastEntryState: LastEntryState | null;
  setLastEntryState: (state: LastEntryState | null) => void;

  // Modal Management
  customerModalVisible: boolean;
  setCustomerModalVisible: (visible: boolean) => void;
  tradeDialogVisible: boolean;
  setTradeDialogVisible: (visible: boolean) => void;
  ledgerDialogVisible: boolean;
  setLedgerDialogVisible: (visible: boolean) => void;
  allowCustomerCreation: boolean;
  setAllowCustomerCreation: (allow: boolean) => void;
  isCustomerSelectionForRaniRupa: boolean;
  setIsCustomerSelectionForRaniRupa: (isForRaniRupa: boolean) => void;
  isCustomerSelectionForTrade: boolean;
  setIsCustomerSelectionForTrade: (isForTrade: boolean) => void;
  
  // Snackbar Management
  snackbarVisible: boolean;
  setSnackbarVisible: (visible: boolean) => void;
  snackbarMessage: string;
  setSnackbarMessage: (message: string) => void;
  
  // Alert Management
  alertVisible: boolean;
  setAlertVisible: (visible: boolean) => void;
  alertTitle: string;
  setAlertTitle: (title: string) => void;
  alertMessage: string;
  setAlertMessage: (message: string) => void;
  alertIcon?: string;
  setAlertIcon: (icon?: string) => void;
  alertButtons: AlertButton[];
  setAlertButtons: (buttons: AlertButton[]) => void;
  showAlert: (title: string, message: string, buttons?: AlertButton[], icon?: string) => void;
  
  // Navigation
  navigateToEntry: (customer: Customer) => void;
  navigateToSettlement: () => void;
  navigateToSettings: () => void;
  navigateToTabs: () => void;
  navigateToCustomers: () => void;
  navigateToTrade: () => void;
  navigateToRaniRupaSell: () => void;
  navigateToRecycleBin: () => void;
  navigateToRateCut: () => void;
  
  // Transaction Management
  handleSelectCustomer: (customer: Customer) => void;
  handleCreateCustomer: (name: string) => Promise<void>;
  handleAddEntry: (entry: TransactionEntry) => void;
  handleEditEntry: (entryId: string) => void;
  handleDeleteEntry: (entryId: string) => void;
  handleSaveTransaction: (payments: PaymentInput[], saveDate?: Date | null, note?: string) => Promise<void>;
  loadTransactionForEdit: (transactionId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
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

export const AppProvider: React.FC<AppProviderProps> = ({ 
  children, 
  onNavigateToEntry,
  onNavigateToSettlement,
  onNavigateToSettings,
  onNavigateToTabs,
  onNavigateToCustomers,
  onNavigateToTrade,
  onNavigateToRaniRupaSell,
  onNavigateToRecycleBin,
  onNavigateToRateCut,
}) => {
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [currentEntries, setCurrentEntries] = useState<TransactionEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [pendingMoneyAmount, setPendingMoneyAmount] = useState<number>(0);
  const [pendingMoneyType, setPendingMoneyType] = useState<'give' | 'receive'>('receive');
  const [transactionCreatedAt, setTransactionCreatedAt] = useState<string | null>(null);
  const [transactionLastUpdatedAt, setTransactionLastUpdatedAt] = useState<string | null>(null);
  const [tradeIdToDeleteOnSave, setTradeIdToDeleteOnSave] = useState<string | null>(null);
  const [lastEntryState, setLastEntryState] = useState<LastEntryState | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [tradeDialogVisible, setTradeDialogVisible] = useState(false);
  const [ledgerDialogVisible, setLedgerDialogVisible] = useState(false);
  const [allowCustomerCreation, setAllowCustomerCreation] = useState(true);
  const [isCustomerSelectionForRaniRupa, setIsCustomerSelectionForRaniRupa] = useState(false);
  const [isCustomerSelectionForTrade, setIsCustomerSelectionForTrade] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertIcon, setAlertIcon] = useState<string | undefined>(undefined);
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([{ text: 'OK' }]);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);

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
    setEditingTransactionId(null);
    setPendingMoneyAmount(0);
    setPendingMoneyType('receive');
    setTransactionCreatedAt(null);
    setTransactionLastUpdatedAt(null);
    setLastEntryState(null);
    setTradeIdToDeleteOnSave(null);
    onNavigateToTabs();
  };

  const navigateToCustomers = () => {
    onNavigateToCustomers();
  };

  const navigateToTrade = () => {
    onNavigateToTrade();
  };

  const navigateToRaniRupaSell = () => {
    onNavigateToRaniRupaSell();
  };

  const navigateToRecycleBin = () => {
    onNavigateToRecycleBin();
  };

  const navigateToRateCut = () => {
    onNavigateToRateCut();
  };

  const handleSelectCustomer = (customer: Customer) => {
    setCustomerModalVisible(false);
    
    if (isCustomerSelectionForRaniRupa) {
      // For Rani/Rupa sell, just set the customer without navigating
      setCurrentCustomer(customer);
      setIsCustomerSelectionForRaniRupa(false);
    } else if (isCustomerSelectionForTrade) {
      // For Trade screen, just set the customer without navigating
      setCurrentCustomer(customer);
      // DON'T clear flag here - let TradeScreen clear it after processing
    } else {
      // Clear editing transaction ID for new transactions
      setEditingTransactionId(null);
      setTransactionCreatedAt(null);
      setTransactionLastUpdatedAt(null);
      navigateToEntry(customer);
    }
  };

  const handleCreateCustomer = async (name: string) => {
    setCustomerModalVisible(false);

    // Create new customer
    const newCustomer: Customer = {
      id: Date.now().toString(),
      name,
      balance: 0,
    };

    if (isCustomerSelectionForRaniRupa) {
      // For Rani/Rupa sell, just set the customer without navigating
      setCurrentCustomer(newCustomer);
      setIsCustomerSelectionForRaniRupa(false);
    } else if (isCustomerSelectionForTrade) {
      // For Trade screen, just set the customer without navigating
      setCurrentCustomer(newCustomer);
      // DON'T clear flag here - let TradeScreen clear it after processing
    } else {
      // Clear editing transaction ID for new transactions
      setEditingTransactionId(null);
      setTransactionCreatedAt(null);
      setTransactionLastUpdatedAt(null);
      navigateToEntry(newCustomer);
    }

    // Save customer in background
    try {
      const saved = await CustomerService.saveCustomer(newCustomer);
      if (saved) {
        // Customer saved successfully
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

  const handleSaveTransaction = async (payments: PaymentInput[], saveDate?: Date | null, note?: string) => {
    // Guard against concurrent saves
    if (isSavingTransaction) {
      return;
    }

    // Allow saving with empty entries (money-only transactions) or with entries
    if (!currentCustomer) {
      return;
    }

    setIsSavingTransaction(true);

    try {
      // Save transaction to database (update if editingTransactionId exists)
      const result = await TransactionService.saveTransaction(
        currentCustomer, 
        currentEntries, 
        payments,
        editingTransactionId || undefined,
        saveDate,
        note
      );

      if (result.success) {
        // If this was a trade conversion, delete the original trade
        if (tradeIdToDeleteOnSave) {
          try {
            await TradeService.deleteTrade(tradeIdToDeleteOnSave);
            setTradeIdToDeleteOnSave(null); // Clear the ID
          } catch (error) {
            console.error('Error deleting trade after conversion:', error);
            // We don't block navigation if trade deletion fails, but we log it
          }
        }

        // Navigate back to tabs (no snackbar message)
        setLastEntryState(null);
        onNavigateToTabs();
      } else {
        console.error('❌ Transaction save failed:', result.error);
        // Show error message
        setSnackbarMessage(result.error || 'Failed to save transaction');
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('❌ Exception during transaction save:', error);
      setSnackbarMessage('Error saving transaction');
      setSnackbarVisible(true);
    } finally {
      setIsSavingTransaction(false);
    }
  };

  const showAlert = (title: string, message: string, buttons: AlertButton[] = [{ text: 'OK' }], icon?: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons(buttons);
    setAlertIcon(icon);
    setAlertVisible(true);
  };

  const loadTransactionForEdit = async (transactionId: string) => {
    try {
      // Get the specific transaction by ID
      const transaction = await TransactionService.getTransactionById(transactionId);

      if (!transaction) {
        setSnackbarMessage('Transaction not found');
        setSnackbarVisible(true);
        return;
      }

      // Get the customer
      const customer = await CustomerService.getCustomerById(transaction.customerId);
      if (!customer) {
        setSnackbarMessage('Customer not found');
        setSnackbarVisible(true);
        return;
      }

      // Set the current customer, entries, transaction ID
      setCurrentCustomer(customer);
      setCurrentEntries(transaction.entries);
      setEditingTransactionId(transactionId);
      setTransactionCreatedAt(transaction.createdAt || transaction.date);
      setTransactionLastUpdatedAt(transaction.lastUpdatedAt || transaction.date);

      // For money-only transactions, set the pending money type based on amountPaid
      if (transaction.entries.length === 0) {
        if (transaction.amountPaid > 0) {
          setPendingMoneyType('receive'); // Money received from customer
          setPendingMoneyAmount(transaction.amountPaid);
        } else if (transaction.amountPaid < 0) {
          setPendingMoneyType('give'); // Money given to customer
          setPendingMoneyAmount(Math.abs(transaction.amountPaid));
        } else {
          setPendingMoneyType('receive'); // Default to receive
          setPendingMoneyAmount(0);
        }
      }

      // Navigate to settlement screen to show transaction details
      onNavigateToSettlement();
    } catch (error) {
      console.error('Error loading transaction for edit:', error);
      setSnackbarMessage('Error loading transaction');
      setSnackbarVisible(true);
    }
  };  const contextValue: AppContextType = {
    currentCustomer,
    setCurrentCustomer,
    currentEntries,
    setCurrentEntries,
    editingEntryId,
    setEditingEntryId,
    editingTransactionId,
    setEditingTransactionId,
    pendingMoneyAmount,
    setPendingMoneyAmount,
    pendingMoneyType,
    setPendingMoneyType,
    transactionCreatedAt,
    transactionLastUpdatedAt,
    tradeIdToDeleteOnSave,
    setTradeIdToDeleteOnSave,
    lastEntryState,
    setLastEntryState,
    tradeDialogVisible,
    setTradeDialogVisible,
    ledgerDialogVisible,
    setLedgerDialogVisible,
    customerModalVisible,
    setCustomerModalVisible,
    allowCustomerCreation,
    setAllowCustomerCreation,
    isCustomerSelectionForRaniRupa,
    setIsCustomerSelectionForRaniRupa,
    isCustomerSelectionForTrade,
    setIsCustomerSelectionForTrade,
    snackbarVisible,
    setSnackbarVisible,
    snackbarMessage,
    setSnackbarMessage,
    alertVisible,
    setAlertVisible,
    alertTitle,
    setAlertTitle,
    alertMessage,
    setAlertMessage,
    alertIcon,
    setAlertIcon,
    alertButtons,
    setAlertButtons,
    showAlert,
    navigateToEntry,
    navigateToSettlement,
    navigateToSettings,
    navigateToTabs,
    navigateToCustomers,
    navigateToTrade,
    navigateToRaniRupaSell,
    navigateToRecycleBin,
    navigateToRateCut,
    handleSelectCustomer,
    handleCreateCustomer,
    handleAddEntry,
    handleEditEntry,
    handleDeleteEntry,
    handleSaveTransaction,
    loadTransactionForEdit,
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
