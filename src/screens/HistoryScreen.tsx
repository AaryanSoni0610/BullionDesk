import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  FlatList, 
  TouchableOpacity,
  BackHandler,
  Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Surface,
  Text,
  Searchbar,
  Card,
  Chip,
  Divider,
  Button,
  ActivityIndicator,
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { theme } from '../theme';
import { formatTransactionAmount, formatFullDate, formatPureGoldPrecise, formatPureSilver, formatIndianNumber } from '../utils/formatting';
import { TransactionService } from '../services/transaction.service';
import { Transaction } from '../types';
import { useAppContext } from '../context/AppContext';
import CustomAlert from '../components/CustomAlert';



export const HistoryScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'today' | 'last7days' | 'last30days' | 'custom'>('today');
  const [error, setError] = useState<string | null>(null);
  const { navigateToSettings, loadTransactionForEdit } = useAppContext();
  const navigation = useNavigation();
  
  // State for tracking which transaction is being shared (memory optimization)
  const [sharingTransactionId, setSharingTransactionId] = useState<string | null>(null);
  const shareableCardRef = useRef<View>(null);
  
  // Custom date range states
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [previousFilter, setPreviousFilter] = useState<'today' | 'last7days' | 'last30days'>('today');
  
  type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  };
  
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);
  
  // Export state
  const [showExportDatePicker, setShowExportDatePicker] = useState(false);
  const [exportDate, setExportDate] = useState<Date>(new Date());
  const [exportTransactions, setExportTransactions] = useState<Transaction[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const exportCardRefs = useRef<Array<View | null>>([]);

  // Helper function to check if transaction is settled and old (cannot be edited)
  const isSettledAndOld = (transaction: Transaction): boolean => {
    if (!transaction.lastUpdatedAt) return false;
    
    const timeSinceUpdate = Date.now() - new Date(transaction.lastUpdatedAt).getTime();
    const isOld = timeSinceUpdate > (24 * 60 * 60 * 1000); // 24 hours
    
    // Check if transaction is fully settled (no remaining balance)
    const remainingBalance = Math.abs(transaction.total) - transaction.amountPaid;
    const isSettled = remainingBalance <= 0;

    const isMetalOnly = transaction.entries.every(entry => entry.metalOnly === true);

    return isSettled && isOld && !isMetalOnly;
  };

  // Handle delete transaction
  const handleDeleteTransaction = async (transaction: Transaction) => {
    setAlertTitle('Delete Transaction');
    setAlertMessage(`Are you sure you want to delete this transaction?\n\nCustomer: ${transaction.customerName}\nDate: ${formatFullDate(transaction.date)}\n\nThis action cannot be undone and will reverse all inventory changes.`);
    setAlertButtons([
      {
        text: 'No',
        style: 'cancel',
      },
      {
        text: 'Yes, Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await TransactionService.deleteTransaction(transaction.id);
            
            if (result) {
              // Reload transactions
              await loadTransactions(true);
              setAlertTitle('Success');
              setAlertMessage('Transaction deleted successfully');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            } else {
              setAlertTitle('Error');
              setAlertMessage('Failed to delete transaction');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            }
          } catch (error) {
            console.warn('Error deleting transaction:', error);
            setAlertTitle('Error');
            setAlertMessage(error instanceof Error ? error.message : 'Failed to delete transaction');
            setAlertButtons([{ text: 'OK' }]);
            setAlertVisible(true);
          }
        },
      },
    ]);
    setAlertVisible(true);
  };

  // Handle share transaction - optimized to render shareable card only when needed
  const handleShareTransaction = async (transaction: Transaction) => {
    try {
      // Set the transaction to be shared, which will render the shareable card
      setSharingTransactionId(transaction.id);
      
      // Wait for the shareable card to render (give React time to complete the render cycle)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (!shareableCardRef.current) {
        setAlertTitle('Error');
        setAlertMessage('Unable to capture transaction card');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        setSharingTransactionId(null);
        return;
      }

      // Capture the card as an image with better quality settings
      const uri = await captureRef(shareableCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile'
      });

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        setAlertTitle('Error');
        setAlertMessage('Sharing is not available on this device');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        setSharingTransactionId(null);
        return;
      }

      // Share the image
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Transaction - ${transaction.customerName}`,
      });
      
      // Clean up - remove the shareable card from memory
      setSharingTransactionId(null);
    } catch (error) {
      console.error('Error sharing transaction:', error);
      setAlertTitle('Error');
      setAlertMessage('Failed to share transaction');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
      setSharingTransactionId(null);
    }
  };

  // Handle export date selection
  const handleExportDateChange = (event: any, selectedDate?: Date) => {
    const isConfirmed = event.type === 'set';
    
    if (isConfirmed && selectedDate) {
      setExportDate(selectedDate);
      performExport(selectedDate);
    } else if (event.type === 'dismissed') {
      setShowExportDatePicker(false);
    }
  };

  const performExport = async (date: Date) => {
    let imageUris: string[] = [];
    try {
      setIsExporting(true);

      // Show loading alert
      setAlertTitle('Exporting Transactions');
      setAlertMessage('Preparing to export...');
      setAlertButtons([]); // Non-dismissible
      setAlertVisible(true);
      
      // Calculate date range for the selected date
      const selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfSelectedDay = new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000 - 1);
      const startDateStr = selectedDate.toISOString();
      const endDateStr = endOfSelectedDay.toISOString();

      // Fetch transactions for the date
      const transactions = await TransactionService.getTransactionsByDateRange(startDateStr, endDateStr);
      
      // Filter out 'Adjust' transactions and reverse to show oldest first
      const filtered = transactions
        .filter(t => t.customerName.toLowerCase() !== 'adjust')
        .reverse();
      
      if (filtered.length === 0) {
        setAlertTitle('No Transactions');
        setAlertMessage('No transactions found for the selected date.');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        setIsExporting(false);
        return;
      }
      // Set transactions to render hidden cards
      setExportTransactions(filtered);
      setAlertMessage(`Found ${filtered.length} transactions. Rendering...`);
      
      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture images to temporary files
      imageUris = [];
      for (let i = 0; i < filtered.length; i++) {
        setAlertMessage(`Exporting transactions ${i + 1}/${filtered.length}...`);
        // Small delay to allow UI update
        await new Promise(resolve => setTimeout(resolve, 1));
        
        const ref = exportCardRefs.current[i];
        if (ref) {
          try {
            const uri = await captureRef(ref, {
              format: 'jpg',
              quality: 0.75,
              result: 'tmpfile'
            });
            imageUris.push(uri);
          } catch (err) {
            console.error(`Error capturing card ${i}:`, err);
          }
        }
      }

      if (imageUris.length === 0) {
        // No images captured - inform the user via CustomAlert instead of throwing
        setAlertTitle('No Transactions');
        setAlertMessage('No transactions could be captured for the selected date.');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);

        // Cleanup and reset export state
        setExportTransactions([]);
        exportCardRefs.current = [];
        setIsExporting(false);

        return;
      }

      setAlertMessage('Generating PDF...');

      date = new Date(date.toISOString());
      let formattedDate = date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      // Generate HTML for PDF
      let htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              h1 { text-align: center; }
              .card { break-inside: avoid; margin-bottom: 16px; 
              display: block; border-radius: 8px; 
              box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            </style>
          </head>
          <body>
            <h1>Transactions - ${formattedDate}</h1>
            <div style="column-count: 2; column-gap: 20px; margin-top: 10px;">
      `;

      for (let i = 0; i < imageUris.length; i++) {
        try {
          // 1. Read file to Base64 (One at a time!)
          // This loads ONLY this single image into JS memory
          const base64Data = await FileSystem.readAsStringAsync(imageUris[i], {
            encoding: FileSystem.EncodingType.Base64
          });

          // 2. Append to HTML immediately
          htmlContent += `
            <div class="card">
              <img src="data:image/jpeg;base64,${base64Data}" style="width: 100%;" />
            </div>
          `;

          // 3. IMPORTANT: Clean up the temp file to save disk space
          await FileSystem.deleteAsync(imageUris[i], { idempotent: true });

          // The 'base64Data' variable now goes out of scope and is garbage collected
          // before the next iteration starts.
          
        } catch (err) {
          console.error(`Error capturing card ${i}:`, err);
        }
      }

      htmlContent += `
            </div>
          </body>
        </html>
      `;

      // Generate PDF
      const { uri: pdfUri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false
      });

      setAlertMessage('Sharing PDF...');

      const date_now = new Date();
      const date_date = date_now.getDate();
      const date_month = date_now.getMonth() + 1;
      const date_year = date_now.getFullYear();

      const provided_date = date.getDate();
      const provided_month = date.getMonth() + 1;
      const provided_year = date.getFullYear();

      if (date_date === provided_date && date_month === provided_month && date_year === provided_year) {
        formattedDate = date.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else{
        formattedDate = date.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
      const newFileName = `Transaction-${formattedDate}.pdf`;
      const newUri = FileSystem.documentDirectory + newFileName;

      await FileSystem.moveAsync({
        from: pdfUri,
        to: newUri
      });

      // Hide alert before sharing to allow interaction
      setAlertVisible(false);
      setIsExporting(false);

      // Schedule cleanup (5 minutes from now)
      setTimeout(async () => {
        try {
          const info = await FileSystem.getInfoAsync(newUri);
          if (info.exists) {
            await FileSystem.deleteAsync(newUri, { idempotent: true });
            console.log('Cleaned up exported PDF:', newFileName);
          }
        } catch (error) {
          console.error('Error cleaning up PDF:', error);
        }
      }, 5 * 60 * 1000);

      await Sharing.shareAsync(newUri, {
        mimeType: 'application/pdf',
        dialogTitle: newFileName,
        UTI: 'com.adobe.pdf'
      });

      // Immediately clean up temporary image files after sharing
      for (const imageUri of imageUris) {
        try {
          await FileSystem.deleteAsync(imageUri, { idempotent: true });
        } catch (error) {
          console.error('Error cleaning up temporary image file:', error);
        }
      }

    } catch (error) {
      console.error('Error exporting transactions:', error);
      setAlertTitle('Export Error');
      setAlertMessage('Failed to export transactions to PDF.');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    } finally {
      // Clean up temporary image files in case of error
      for (const imageUri of imageUris) {
        try {
          await FileSystem.deleteAsync(imageUri, { idempotent: true });
        } catch (error) {
          console.error('Error cleaning up temporary image file:', error);
        }
      }
      setExportTransactions([]);
      setIsExporting(false);
      exportCardRefs.current = [];
    }
  };

  const getItemDisplayName = (entry: any): string => {
    // For money transactions, show "Money" regardless of itemType
    if (entry.type === 'money') {
      return 'Money';
    }
    
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999',
      'gold995': 'Gold 995',
      'rani': 'Rani',
      'silver': 'Silver',
      'rupu': 'Rupu',
      'money': 'Money',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };
  

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [selectedFilter, customStartDate, customEndDate])
  );

  const loadTransactions = async (refresh = false) => {
    try {
      if (!refresh) {
        setIsLoading(true);
      }
      setError(null);
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let startDate: string;
      let endDate: string;
      
      // Calculate date range based on filter
      switch (selectedFilter) {
        case 'today':
          startDate = today.toISOString();
          endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
          break;
        case 'last7days':
          // Last 7 days excluding today
          startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          endDate = new Date(today.getTime() - 1).toISOString();
          break;
        case 'last30days':
          // Last 30 days excluding today
          startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          endDate = new Date(today.getTime() - 1).toISOString();
          break;
        case 'custom':
          // Custom date range - whole day (00:00:00 to 23:59:59)
          if (!customStartDate || !customEndDate) {
            // If custom dates not set, fall back to today
            startDate = today.toISOString();
            endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
          } else {
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            startDate = start.toISOString();
            
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            endDate = end.toISOString();
          }
          break;
        default:
          startDate = today.toISOString();
          endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
      }
      
      // Fetch transactions using database-level filtering
      const allTransactions = await TransactionService.getTransactionsByDateRange(startDate, endDate);
      
      // Filter out 'Adjust' transactions
      const sortedTransactions = allTransactions.filter(t => t.customerName.toLowerCase() !== 'adjust');
      
      setTransactions(sortedTransactions);
      
    } catch (error) {
      console.error('Error loading transactions:', error);
      setError('Unable to load transaction history');
      if (!refresh) {
        setTransactions([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced search with debouncing
  const performSearch = useCallback((query: string) => {
    setIsSearching(true);
    
    let filtered = transactions;

    // Enhanced search logic
    if (query.trim()) {
      const searchTerm = query.trim().toLowerCase();
      filtered = filtered.filter(transaction => {
        // Search in customer name
        const customerMatch = transaction.customerName.trim().toLowerCase().includes(searchTerm);
        
        // Search in transaction entries (item types)
        const itemMatch = transaction.entries.some(entry => {
          const itemName = getItemDisplayName(entry).toLowerCase();
          return itemName.includes(searchTerm);
        });
        
        return customerMatch || itemMatch;
      });
    }
    
    setFilteredTransactions(filtered);
    setIsSearching(false);
  }, [transactions]);

  const highlightSearchText = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;
    
    // For now, return plain text. In a more advanced implementation,
    // you would return a Text component with highlighted portions
    return text;
  };

  const handleFilterChange = (filter: typeof selectedFilter) => {
    if (filter === 'custom') {
      // Save current filter as previous before showing date picker
      if (selectedFilter !== 'custom') {
        setPreviousFilter(selectedFilter);
      }
      // Show start date picker
      setShowStartDatePicker(true);
    } else {
      // Reset custom dates when switching away from custom filter
      setCustomStartDate(null);
      setCustomEndDate(null);
      setSelectedFilter(filter);
      // Save non-custom filters as previous
      setPreviousFilter(filter);
    }
  };
  
  // Handle start date selection
  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    setShowStartDatePicker(false);
    
    if (event.type === 'dismissed') {
      // User cancelled - revert to previous filter
      if (selectedFilter === 'custom' && !customStartDate) {
        setSelectedFilter(previousFilter);
      }
      return;
    }
    
    if (selectedDate) {
      // Validate: start date cannot be today or future
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(selectedDate);
      selected.setHours(0, 0, 0, 0);
      
      if (selected >= today) {
        setAlertTitle('Invalid Date');
        setAlertMessage('Start date must be at least 1 day before today.');
        setAlertButtons([{ text: 'OK', onPress: () => setSelectedFilter(previousFilter) }]);
        setAlertVisible(true);
        return;
      }
      
      setCustomStartDate(selectedDate);
      // Show end date picker after start date is selected
      setShowEndDatePicker(true);
    }
  };
  
  // Handle end date selection
  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    
    if (event.type === 'dismissed') {
      // User cancelled - revert to previous filter
      setCustomStartDate(null);
      setSelectedFilter(previousFilter);
      return;
    }
    
    if (selectedDate && customStartDate) {
      // Validate: end date cannot be future, and must be >= start date
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      const selected = new Date(selectedDate);
      selected.setHours(23, 59, 59, 999);
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      
      if (selected > today) {
        setAlertTitle('Invalid Date');
        setAlertMessage('End date cannot be in the future.');
        setAlertButtons([{ text: 'OK', onPress: () => {
          setCustomStartDate(null);
          setSelectedFilter(previousFilter);
        }}]);
        setAlertVisible(true);
        return;
      }
      
      if (selected < start) {
        setAlertTitle('Invalid Date');
        setAlertMessage('End date cannot be before start date.');
        setAlertButtons([{ text: 'OK', onPress: () => {
          setCustomStartDate(null);
          setSelectedFilter(previousFilter);
        }}]);
        setAlertVisible(true);
        return;
      }
      
      setCustomEndDate(selectedDate);
      setSelectedFilter('custom');
    }
  };
  
  // Format custom date range label
  const getCustomDateLabel = () => {
    if (!customStartDate || !customEndDate) return 'Select Date Range';
    
    const formatDate = (date: Date) => {
      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
    };
    
    const start = formatDate(customStartDate);
    const end = formatDate(customEndDate);
    
    // If same date, show only once
    if (customStartDate.toDateString() === customEndDate.toDateString()) {
      return start;
    }
    
    return `${start} - ${end}`;
  };


  useEffect(() => {
    performSearch(searchQuery);
  }, [performSearch, searchQuery]);

  useEffect(() => {
    if (transactions.length > 0) {
      performSearch(searchQuery);
    }
  }, [transactions.length]);

  // Handle hardware back button - navigate to home screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Navigate to Home tab within the tab navigator
        (navigation as any).navigate('Home');
        return true; // Prevent default back behavior
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [navigation])
  );

  const getAmountColor = (transaction: Transaction) => {
    const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;
    if (isMoneyOnly) {
      // For money-only: amountPaid > 0 = merchant received money (green)
      //                 amountPaid < 0 = merchant gave money (blue)
      const isReceived = transaction.amountPaid > 0;
      return isReceived ? theme.colors.sellColor : theme.colors.primary;
    } else {
      // Blue for Given (purchase), Green for Received (sell)
      const isReceived = transaction.total > 0;
      return isReceived ? theme.colors.sellColor : theme.colors.primary;
    }
  };

  // Enhanced Transaction Card Component (optimized - no hidden card)
  const TransactionCard: React.FC<{ transaction: Transaction; hideActions?: boolean; allowFontScaling?: boolean }> = ({ transaction, hideActions = false, allowFontScaling = true }) => {
    const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
    
    // Calculate transaction-specific remaining balance
    let transactionBalanceLabel = 'Settled';
    let transactionBalanceColor = theme.colors.primary; // Blue for settled
    
    if (isMetalOnly) {
      // For metal-only transactions, show the metal items
      const metalItems: string[] = [];
      transaction.entries.forEach(entry => {
        if (entry.metalOnly) {
          const itemName = getItemDisplayName(entry);
          const weight = entry.weight || 0;
          const isGold = entry.itemType.includes('gold') || entry.itemType === 'rani';
          const formattedWeight = isGold ? weight.toFixed(3) : Math.floor(weight);
          const label = entry.type === 'sell' ? 'Debt' : 'Balance';
          metalItems.push(`${label}: ${itemName} ${formattedWeight}g`);
        }
      });
      if (metalItems.length > 0) {
        transactionBalanceLabel = metalItems.join(', ');
        // Check if it's debt or balance for color
        const isDebt = metalItems.some(item => item.startsWith('Debt'));
        const isBalance = metalItems.some(item => item.startsWith('Balance'));
        if (isDebt) {
          transactionBalanceColor = theme.colors.debtColor; // Orange for debt
        } else if (isBalance) {
          transactionBalanceColor = theme.colors.success; // Green for balance
        }
      }
    } else {
      // For money transactions, show money balance (INVERTED SIGN CONVENTION)
      // Formula: receivedAmount - netAmount + discount
      // Positive result = balance (merchant owes), Negative result = debt (customer owes)
      const transactionRemaining = transaction.amountPaid - transaction.total + transaction.discountExtraAmount;
      
      const hasRemainingBalance = transactionRemaining !== 0;
      
      // Check if this is a money-only transaction (no entries)
      const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;

      if (hasRemainingBalance) {
        if (!isMoneyOnly) {
          const isDebt = transactionRemaining < 0;
          transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
        } else {
          // For money-only (INVERTED): amountPaid > 0 = balance, amountPaid < 0 = debt
          const isBalance = transaction.amountPaid > 0;
          transactionBalanceLabel = `${isBalance ? 'Balance' : 'Debt'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isBalance ? theme.colors.success : theme.colors.debtColor;
        }
      } else {
        transactionBalanceColor = theme.colors.primary; // Blue for settled
      }
    }
    
    return (
      <Card style={styles.transactionCard}>
        <Card.Content>
          {/* Action Buttons Row */}
          {!hideActions && (
            <View style={styles.editButtonRow}>
              <TouchableOpacity 
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDeleteTransaction(transaction)}
              >
                <Icon name="delete" size={16} color={theme.colors.error} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionButton, styles.shareButton]}
                onPress={() => handleShareTransaction(transaction)}
              >
                <Icon name="share-variant" size={16} color={theme.colors.success} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionButton, styles.editButton, isSettledAndOld(transaction) && styles.disabledButton]}
                onPress={() => {
                  if (isSettledAndOld(transaction)) {
                    setAlertTitle('Cannot Edit Transaction');
                    setAlertMessage('This transaction has been settled and is too old to edit.');
                    setAlertButtons([{ text: 'OK' }]);
                    setAlertVisible(true);
                  } else {
                    loadTransactionForEdit(transaction.id);
                  }
                }}
                disabled={isSettledAndOld(transaction)}
              >
                <Icon 
                  name="pencil" 
                  size={16} 
                  color={isSettledAndOld(transaction) ? theme.colors.onSurfaceDisabled : theme.colors.primary} 
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Header Row */}
          <View style={styles.cardHeader}>
              <View style={styles.customerInfo}>
                <Text allowFontScaling={allowFontScaling} variant="titleMedium" style={styles.customerName}>
                  {highlightSearchText(transaction.customerName, searchQuery)}
                </Text>
                <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.transactionDate}>
                  {formatFullDate(transaction.date)}
                </Text>
              </View>
              <View style={styles.rightSection}>
                {!isMetalOnly && (
                  <Text 
                    allowFontScaling={allowFontScaling}
                    variant="titleMedium" 
                    style={[styles.amount, { color: getAmountColor(transaction) }]}
                  >
                    {formatTransactionAmount(transaction)}
                  </Text>
                )}
              </View>
            </View>

            {/* Transaction Details - Always Visible */}
            <View style={styles.expandedContent}>
              {transaction.entries.length > 0 && <Divider style={styles.expandedDivider} />}
              {transaction.entries.map((entry, index) => (
                <React.Fragment key={index}>
                  {/* Special handling for rani/rupa purchase items */}
                  {(entry.itemType === 'rani' || entry.itemType === 'rupu') && entry.type === 'purchase' ? (
                    <>
                      <View style={styles.entryRow}>
                        <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.entryType}>
                          ↙️ {getItemDisplayName(entry)}{(() => {
                            const sameTypeEntries = transaction.entries.slice(0, index + 1).filter(e => 
                              e.itemType === entry.itemType && e.type === entry.type
                            );
                            const totalCount = transaction.entries.filter(e => 
                              e.itemType === entry.itemType && e.type === entry.type
                            ).length;
                            if (totalCount > 1) {
                              return ` ${sameTypeEntries.length}`;
                            }
                            return '';
                          })()}
                        </Text>
                        <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.entryDetails}>
                          {(() => {
                            const weight = entry.weight || 0;
                            const touch = entry.touch || 100;
                            const cut = entry.cut || 0;
                            const effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
                            const pureWeight = (weight * effectiveTouch) / 100;
                            const formattedPureWeight = entry.itemType === 'rani' 
                              ? formatPureGoldPrecise(pureWeight) 
                              : formatPureSilver(pureWeight);
                            
                            const fixedDigits = entry.itemType === 'rani' ? 3 : 1;
                            // For rani purchases, format pure weight with last digit as 0
                            const displayPureWeight = entry.itemType === 'rani' && entry.type === 'purchase'
                              ? (Math.floor(pureWeight * 100) / 100).toFixed(3)
                              : formattedPureWeight.toFixed(fixedDigits);
                            return `${weight.toFixed(fixedDigits)}g : ${effectiveTouch.toFixed(2)}% : ${displayPureWeight}g`;
                          })()}
                        </Text>
                      </View>
                      {!entry.metalOnly && entry.price && entry.price > 0 && (() => {
                        // For rani purchases, don't show price if paired with gold999/gold995 sell at same price
                        if (entry.itemType === 'rani' && entry.type === 'purchase') {
                          const hasMatchingGoldSell = transaction.entries.some(otherEntry => 
                            (otherEntry.itemType === 'gold999' || otherEntry.itemType === 'gold995') && 
                            otherEntry.type === 'sell' && 
                            otherEntry.price === entry.price
                          );
                          return !hasMatchingGoldSell;
                        }
                        // For rupu purchases, don't show price if paired with silver sell at same price
                        if (entry.itemType === 'rupu' && entry.type === 'purchase') {
                          const hasMatchingSilverSell = transaction.entries.some(otherEntry => 
                            otherEntry.itemType === 'silver' && 
                            otherEntry.type === 'sell' && 
                            otherEntry.price === entry.price
                          );
                          return !hasMatchingSilverSell;
                        }
                        return true;
                      })() ? (
                        <View style={styles.entryRow}>
                          <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={[styles.entryDetails, { flex: 1 }]}>
                            ₹{formatIndianNumber(entry.price)}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.entryRow}>
                      <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.entryType}>
                        {entry.type === 'sell' ? '↗️' : '↙️'} {getItemDisplayName(entry)}{(() => {
                          if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
                            const sameTypeEntries = transaction.entries.slice(0, index + 1).filter(e => 
                              e.itemType === entry.itemType && e.type === entry.type
                            );
                            const totalCount = transaction.entries.filter(e => 
                              e.itemType === entry.itemType && e.type === entry.type
                            ).length;
                            if (totalCount > 1) {
                              return ` ${sameTypeEntries.length}`;
                            }
                          }
                          return '';
                        })()}
                      </Text>
                      <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.entryDetails}>
                        {entry.weight && (() => {
                          // Special formatting for rani/rupu sell items
                          if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
                            const weight = entry.weight || 0;
                            const touch = entry.touch || 100;
                            const cut = entry.cut || 0;
                            const effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
                            const pureWeight = (weight * effectiveTouch) / 100;
                            const formattedPureWeight = entry.itemType === 'rani' 
                              ? formatPureGoldPrecise(pureWeight) 
                              : formatPureSilver(pureWeight);
                            

                            const fixedDigits = entry.itemType === 'rani' ? 3 : 1;
                            if (entry.type === 'sell') {
                              return `${weight.toFixed(fixedDigits)}g : ${effectiveTouch.toFixed(2)}% : ${formattedPureWeight.toFixed(fixedDigits)}g`;
                            } else {
                              return `${weight.toFixed(fixedDigits)}g : ${effectiveTouch.toFixed(2)}%`;
                            }
                          } else {
                            // Default formatting for other items
                            const isGold = entry.itemType.includes('gold');
                            const formattedWeight = isGold ? (entry.weight || 0).toFixed(3) : (entry.weight || 0).toFixed(1);
                            return `${formattedWeight}g`;
                          }
                        })()}{(!entry.metalOnly && entry.price && entry.price > 0) ? ` : ₹${formatIndianNumber(entry.price)}` : ''}
                      </Text>
                    </View>
                  )}
                  
                </React.Fragment>
              ))}
              
              {/* Total Row - Show only for non-metal-only transactions */}
              {!isMetalOnly && (
                <>
                  <Divider style={styles.totalDivider} />
                  <View style={styles.totalRow}>
                    <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.totalLabel}>
                      Total:
                    </Text>
                    <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={[styles.entryDetails, { color: getAmountColor(transaction) }]}>
                      ₹{formatIndianNumber(Math.abs(transaction.total))}
                    </Text>
                  </View>
                </>
              )}

              {/* Note Display */}
              {transaction.note && (
                <>
                  <Divider style={styles.totalDivider} />
                  <View style={styles.noteRow}>
                    <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.noteLabel}>
                      Note:
                    </Text>
                    <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.noteText}>
                      {transaction.note}
                    </Text>
                  </View>
                </>
              )}
              
              {/* Payment/Balance Row */}
              <View style={styles.paymentRow}>
                {!isMetalOnly && (
                  <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={styles.paymentLabel}>
                    {transaction.entries.length === 0 ? transaction.amountPaid > 0 ? 'Received' : 'Given' 
                    : transaction.amountPaid > 0 ? 'Received' : 'Given'}: ₹{formatIndianNumber(Math.abs(transaction.amountPaid))}
                  </Text>
                )}
                {(!(!isMetalOnly && transaction.amountPaid > 0)) && <View style={{ flex: 1 }} />}
                <Text allowFontScaling={allowFontScaling} variant="bodySmall" style={[styles.transactionBalance, 
                  { color: transactionBalanceColor }
                ]}>
                  {transactionBalanceLabel}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      );
    };

  if (isLoading) {
    return (
      <>
        <SafeAreaView style={styles.container}>
          <Surface style={styles.appTitleBar} elevation={1}>
            <View style={styles.appTitleContent}>
              <Text variant="titleLarge" style={styles.appTitle}>
                History
              </Text>
              <IconButton
                icon="cog-outline"
                size={24}
                onPress={navigateToSettings}
                style={styles.settingsButton}
              />
            </View>
          </Surface>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text variant="bodyLarge" style={styles.loadingText}>
              Loading transactions...
            </Text>
          </View>
        </SafeAreaView>
        <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} buttons={alertButtons} onDismiss={() => setAlertVisible(false)} />
      </>
    );
  }  return (
    <>
      <SafeAreaView style={styles.container}>
      <Surface style={styles.appTitleBar} elevation={1}>
        <View style={styles.appTitleContent}>
          <Text variant="titleLarge" style={styles.appTitle}>
            History
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon="tray-arrow-up"
              size={24}
              onPress={() => setShowExportDatePicker(true)}
              disabled={isExporting}
              style={styles.settingsButton}
            />
            <IconButton
              icon="cog-outline"
              size={24}
              onPress={navigateToSettings}
              style={styles.settingsButton}
            />
          </View>
        </View>
      </Surface>

      <View style={styles.content}>
        <Searchbar
          placeholder="Search by customer name"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />

        <View style={styles.filterContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.filterContent}
          >
            <Chip
              mode={selectedFilter === 'today' ? 'flat' : 'outlined'}
              selected={selectedFilter === 'today'}
              onPress={() => handleFilterChange('today')}
              style={styles.filterChip}
              compact
            >
              Today
            </Chip>
            <Chip
              mode={selectedFilter === 'last7days' ? 'flat' : 'outlined'}
              selected={selectedFilter === 'last7days'}
              onPress={() => handleFilterChange('last7days')}
              style={styles.filterChip}
              compact
            >
              Last 7 Days
            </Chip>
            <Chip
              mode={selectedFilter === 'last30days' ? 'flat' : 'outlined'}
              selected={selectedFilter === 'last30days'}
              onPress={() => handleFilterChange('last30days')}
              style={styles.filterChip}
              compact
            >
              Last 30 Days
            </Chip>
            <Chip
              mode={selectedFilter === 'custom' ? 'flat' : 'outlined'}
              selected={selectedFilter === 'custom'}
              onPress={() => handleFilterChange('custom')}
              style={styles.filterChip}
              compact
            >
              {getCustomDateLabel()}
            </Chip>
          </ScrollView>
        </View>



        {filteredTransactions.length === 0 ? (
          error ? (
            <View style={styles.emptyContainer}>
              <Icon name="alert-circle-outline" size={48} color={theme.colors.error} />
              <Text variant="titleLarge" style={[styles.emptyTitle, { color: theme.colors.error }]}>
                {error}
              </Text>
              <Button mode="outlined" onPress={() => loadTransactions()} style={styles.retryButton}>
                Retry
              </Button>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon name="magnify" size={72} color={theme.colors.onSurfaceVariant} />
              <Text variant="headlineSmall" style={styles.emptyTitle}>
                No transactions found
              </Text>
              <Text variant="bodyLarge" style={styles.emptyMessage}>
                Try adjusting your search or date filters
              </Text>
              <Button 
                mode="contained" 
                onPress={() => {
                  setSearchQuery('');
                  setSelectedFilter('today');
                  performSearch('');
                }}
                style={styles.clearFiltersButton}
              >
                Clear Filters
              </Button>
            </View>
          )
        ) : (
          <FlatList
            data={filteredTransactions}
            renderItem={({ item }) => <TransactionCard transaction={item} />}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.transactionsList}
            showsVerticalScrollIndicator={false}
            refreshing={isLoading}
            onRefresh={() => loadTransactions(true)}
            ListHeaderComponent={
              filteredTransactions.length > 0 ? (
                <Text variant="bodyMedium" style={styles.resultCount}>
                  {isSearching ? 'Searching...' : `Showing ${filteredTransactions.length} transaction${filteredTransactions.length === 1 ? '' : 's'}`}
                  {searchQuery.trim() && ` for "${searchQuery.trim()}"`}
                </Text>
              ) : null
            }
          />
        )}
      </View>
    </SafeAreaView>
    <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} buttons={alertButtons} onDismiss={() => setAlertVisible(false)} />
    
    {/* Date Pickers for Custom Date Range */}
    {showStartDatePicker && (
      <DateTimePicker
        value={customStartDate || new Date()}
        mode="date"
        display={'default'}
        onChange={handleStartDateChange}
        maximumDate={new Date(new Date().setDate(new Date().getDate() - 1))}
      />
    )}
    
    {showEndDatePicker && customStartDate && (
      <DateTimePicker
        value={customEndDate || customStartDate}
        mode="date"
        display={'default'}
        onChange={handleEndDateChange}
        minimumDate={customStartDate}
        maximumDate={new Date()} // Allow selecting today
      />
    )}

    {/* Export Date Picker */}
    {showExportDatePicker && (
      <DateTimePicker
        value={exportDate}
        mode="date"
        display={'default'}
        onChange={handleExportDateChange}
        maximumDate={new Date()}
      />
    )}

    {/* Hidden Container for Export Cards */}
    {isExporting && exportTransactions.length > 0 && (
      <View style={styles.hiddenCard}>
        {exportTransactions.map((transaction, index) => (
          <View 
            key={transaction.id} 
            ref={(el) => (exportCardRefs.current[index] = el)}
            style={styles.shareableCardWrapper}
            collapsable={false}
          >
            <TransactionCard transaction={transaction} hideActions={true} allowFontScaling={false} />
          </View>
        ))}
      </View>
    )}
    
    {/* Conditionally render shareable card only when sharing */}
    {sharingTransactionId && (() => {
      const transaction = transactions.find(t => t.id === sharingTransactionId);
      if (!transaction) return null;
      
      const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
      
      // Calculate transaction balance (same logic as TransactionCard)
      let transactionBalanceLabel = 'Settled';
      let transactionBalanceColor = theme.colors.primary;
      
      if (isMetalOnly) {
        const metalItems: string[] = [];
        transaction.entries.forEach(entry => {
          if (entry.metalOnly) {
            const itemName = getItemDisplayName(entry);
            const weight = entry.weight || 0;
            const isGold = entry.itemType.includes('gold') || entry.itemType === 'rani';
            const formattedWeight = isGold ? weight.toFixed(3) : Math.floor(weight);
            const label = entry.type === 'sell' ? 'Debt' : 'Balance';
            metalItems.push(`${label}: ${itemName} ${formattedWeight}g`);
          }
        });
        if (metalItems.length > 0) {
          transactionBalanceLabel = metalItems.join(', ');
          const isDebt = metalItems.some(item => item.startsWith('Debt'));
          const isBalance = metalItems.some(item => item.startsWith('Balance'));
          if (isDebt) {
            transactionBalanceColor = theme.colors.debtColor;
          } else if (isBalance) {
            transactionBalanceColor = theme.colors.success;
          }
        }
      } else {
        // For money transactions (INVERTED SIGN CONVENTION)
        // Formula: receivedAmount - netAmount + discount
        const transactionRemaining = transaction.amountPaid - transaction.total + transaction.discountExtraAmount;
        
        const hasRemainingBalance = transactionRemaining !== 0;
        const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;

        if (hasRemainingBalance) {
          if (!isMoneyOnly) {
            const isDebt = transactionRemaining < 0;
            transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
            transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
          } else {
            const isBalance = transaction.amountPaid > 0;
            transactionBalanceLabel = `${isBalance ? 'Balance' : 'Debt'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
            transactionBalanceColor = isBalance ? theme.colors.success : theme.colors.debtColor;
          }
        } else {
          transactionBalanceColor = theme.colors.primary;
        }
      }
      
      return (
        <View style={styles.hiddenCard} collapsable={false}>
          <View ref={shareableCardRef} collapsable={false} style={styles.shareableCardWrapper}>
            <Card style={styles.shareableCard}>
              <Card.Content style={styles.shareableCardContent}>
                <View style={styles.cardHeader}>
                  <View style={styles.customerInfo}>
                    <Text allowFontScaling={false} variant="titleMedium" style={styles.customerName}>
                      {transaction.customerName}
                    </Text>
                    <Text allowFontScaling={false} variant="bodySmall" style={styles.transactionDate}>
                      {formatFullDate(transaction.date)}
                    </Text>
                  </View>
                  <View style={styles.rightSection}>
                    {!isMetalOnly && (
                      <Text 
                        allowFontScaling={false}
                        variant="titleMedium" 
                        style={[styles.amount, { color: getAmountColor(transaction) }]}
                      >
                        {formatTransactionAmount(transaction)}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.expandedContent}>
                  {transaction.entries.length > 0 && <Divider style={styles.expandedDivider} />}
                  {transaction.entries.map((entry, index) => (
                    <React.Fragment key={index}>
                      {(entry.itemType === 'rani' || entry.itemType === 'rupu') && entry.type === 'purchase' ? (
                        <>
                          <View style={styles.entryRow}>
                            <Text allowFontScaling={false} variant="bodySmall" style={styles.entryType}>
                              ↙️ {getItemDisplayName(entry)}{(() => {
                                const sameTypeEntries = transaction.entries.slice(0, index + 1).filter(e => 
                                  e.itemType === entry.itemType && e.type === entry.type
                                );
                                const totalCount = transaction.entries.filter(e => 
                                  e.itemType === entry.itemType && e.type === entry.type
                                ).length;
                                if (totalCount > 1) {
                                  return ` ${sameTypeEntries.length}`;
                                }
                                return '';
                              })()}
                            </Text>
                            <Text allowFontScaling={false} variant="bodySmall" style={styles.entryDetails}>
                              {(() => {
                                const weight = entry.weight || 0;
                                const touch = entry.touch || 100;
                                const cut = entry.cut || 0;
                                const effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
                                const pureWeight = (weight * effectiveTouch) / 100;
                                const formattedPureWeight = entry.itemType === 'rani' 
                                  ? formatPureGoldPrecise(pureWeight) 
                                  : formatPureSilver(pureWeight);
                                
                                const fixedDigits = entry.itemType === 'rani' ? 3 : 1;
                                const displayPureWeight = entry.itemType === 'rani' && entry.type === 'purchase'
                                  ? (Math.floor(pureWeight * 100) / 100).toFixed(3)
                                  : formattedPureWeight.toFixed(fixedDigits);
                                return `${weight.toFixed(fixedDigits)}g : ${effectiveTouch.toFixed(2)}% : ${displayPureWeight}g`;
                              })()}
                            </Text>
                          </View>
                          {!entry.metalOnly && entry.price && entry.price > 0 && (() => {
                            if (entry.itemType === 'rani' && entry.type === 'purchase') {
                              const hasMatchingGoldSell = transaction.entries.some(otherEntry => 
                                (otherEntry.itemType === 'gold999' || otherEntry.itemType === 'gold995') && 
                                otherEntry.type === 'sell' && 
                                otherEntry.price === entry.price
                              );
                              return !hasMatchingGoldSell;
                            }
                            if (entry.itemType === 'rupu' && entry.type === 'purchase') {
                              const hasMatchingSilverSell = transaction.entries.some(otherEntry => 
                                otherEntry.itemType === 'silver' && 
                                otherEntry.type === 'sell' && 
                                otherEntry.price === entry.price
                              );
                              return !hasMatchingSilverSell;
                            }
                            return true;
                          })() ? (
                            <View style={styles.entryRow}>
                              <Text allowFontScaling={false} variant="bodySmall" style={[styles.entryDetails, { flex: 1 }]}>
                                ₹{formatIndianNumber(entry.price)}
                              </Text>
                            </View>
                          ) : null}
                        </>
                      ) : (
                        <View style={styles.entryRow}>
                          <Text allowFontScaling={false} variant="bodySmall" style={styles.entryType}>
                            {entry.type === 'sell' ? '↗️' : '↙️'} {getItemDisplayName(entry)}{(() => {
                              if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
                                const sameTypeEntries = transaction.entries.slice(0, index + 1).filter(e => 
                                  e.itemType === entry.itemType && e.type === entry.type
                                );
                                const totalCount = transaction.entries.filter(e => 
                                  e.itemType === entry.itemType && e.type === entry.type
                                ).length;
                                if (totalCount > 1) {
                                  return ` ${sameTypeEntries.length}`;
                                }
                              }
                              return '';
                            })()}
                          </Text>
                          <Text allowFontScaling={false} variant="bodySmall" style={styles.entryDetails}>
                            {entry.weight && (() => {
                              if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
                                const weight = entry.weight || 0;
                                const touch = entry.touch || 100;
                                const cut = entry.cut || 0;
                                const effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
                                const pureWeight = (weight * effectiveTouch) / 100;
                                const formattedPureWeight = entry.itemType === 'rani' 
                                  ? formatPureGoldPrecise(pureWeight) 
                                  : formatPureSilver(pureWeight);
                                
                                const fixedDigits = entry.itemType === 'rani' ? 3 : 1;
                                if (entry.type === 'sell') {
                                  return `${weight.toFixed(fixedDigits)}g : ${effectiveTouch.toFixed(2)}% : ${formattedPureWeight.toFixed(fixedDigits)}g`;
                                } else {
                                  return `${weight.toFixed(fixedDigits)}g : ${effectiveTouch.toFixed(2)}%`;
                                }
                              } else {
                                const isGold = entry.itemType.includes('gold');
                                const formattedWeight = isGold ? (entry.weight || 0).toFixed(3) : (entry.weight || 0).toFixed(1);
                                return `${formattedWeight}g`;
                              }
                            })()}{(!entry.metalOnly && entry.price && entry.price > 0) ? ` : ₹${formatIndianNumber(entry.price)}` : ''}
                          </Text>
                        </View>
                      )}

                    </React.Fragment>
                  ))}
                  
                  {!isMetalOnly && (
                    <>
                      <Divider style={styles.totalDivider} />
                      <View style={styles.totalRow}>
                        <Text allowFontScaling={false} variant="bodySmall" style={styles.totalLabel}>
                          Total:
                        </Text>
                        <Text allowFontScaling={false} variant="bodyMedium" style={[styles.entryDetails, { color: getAmountColor(transaction) }]}>
                          ₹{formatIndianNumber(Math.abs(transaction.total))}
                        </Text>
                      </View>
                    </>
                  )}
                  
                  {/* Note Display */}
                  {transaction.note && (
                    <>
                      <Divider style={styles.totalDivider} />
                      <View style={styles.noteRow}>
                        <Text allowFontScaling={false} variant="bodySmall" style={styles.noteLabel}>
                          Note:
                        </Text>
                        <Text allowFontScaling={false} variant="bodySmall" style={styles.noteText}>
                          {transaction.note}
                        </Text>
                      </View>
                    </>
                  )}
                  
                  <View style={styles.paymentRow}>
                    {!isMetalOnly && transaction.amountPaid > 0 && (
                      <Text allowFontScaling={false} variant="bodySmall" style={styles.paymentLabel}>
                        {transaction.entries.length === 0 ? transaction.amountPaid > 0 ? 'Received' : 'Given' 
                    : transaction.amountPaid > 0 ? 'Received' : 'Given'}: ₹{formatIndianNumber(Math.abs(transaction.amountPaid))}
                      </Text>
                    )}
                    {(!(!isMetalOnly && transaction.amountPaid > 0)) && <View style={{ flex: 1 }} />}
                    <Text allowFontScaling={false} variant="bodySmall" style={[styles.transactionBalance, 
                      { color: transactionBalanceColor }
                    ]}>
                      {transactionBalanceLabel}
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          </View>
        </View>
      );
    })()}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  appTitleBar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
  },
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
  },
  settingsButton: {
    margin: 0,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    elevation: theme.elevation.level1,
  },
  title: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_700Bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  searchBar: {
    marginHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    elevation: 0,
    backgroundColor: theme.colors.surfaceVariant,
  },
  filterContainer: {
    marginVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  filterContent: {
    paddingRight: theme.spacing.sm,
  },
  filterChip: {
    marginRight: theme.spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.onBackground,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    minHeight: 400,
  },
  emptyTitle: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_400Regular',
    textAlign: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyMessage: {
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  transactionsList: {
    paddingBottom: theme.spacing.xxl,
  },
  transactionCard: {
    marginHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  customerInfo: {
    flex: 1,
  },
  rightSection: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: theme.spacing.xs,
  },
  customerName: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_500Medium',
  },
  transactionDate: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  amount: {
    fontFamily: 'Roboto_700Bold',
    textAlign: 'right',
  },
  receivedAmount: {
    marginTop: theme.spacing.xs,
  },
  receivedLabel: {
    color: theme.colors.onSurfaceVariant,
  },
  entryCount: {
    marginTop: theme.spacing.xs,
  },
  entryCountText: {
    color: theme.colors.onSurfaceVariant,
  },
  
  // Part 3 Enhanced Styles
  headerContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },

  retryButton: {
    marginTop: theme.spacing.md,
  },
  clearFiltersButton: {
    marginTop: theme.spacing.md,
  },
  resultCount: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_400Regular_Italic',
  },
  
  // Enhanced Transaction Card Styles
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  cardDetails: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  transactionTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  typeIndicator: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  transactionTypeText: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_500Medium',
  },
  itemsSummary: {
    color: theme.colors.onSurfaceVariant,
    marginLeft: theme.spacing.md,
  },
  statusChip: {
    alignSelf: 'flex-end',
    height: 24,
    paddingHorizontal: theme.spacing.xs / 2,
  },
  statusChipText: {
    fontSize: 11,
    fontFamily: 'Roboto_700Bold',
    lineHeight: 14,
  },
  expandedContent: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  expandedDivider: {
    marginBottom: theme.spacing.sm,
  },
  expandedSectionTitle: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_700Bold',
    marginBottom: theme.spacing.xs,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs / 2,
  },
  entryType: {
    color: theme.colors.onSurface,
    flex: 1,
  },
  entryDetails: {
    color: theme.colors.onSurfaceVariant,
    textAlign: 'right',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline + '20',
    marginTop: theme.spacing.xs,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  noteLabel: {
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_500Medium',
    flex: 1,
  },
  noteText: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_400Regular',
  },
  transactionBalance: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 11,
  },

  // Payment and Additional Styles
  paymentLabel: {
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_500Medium',
  },
  paymentValue: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_700Bold',
  },
  totalAmount: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
    fontSize: 16,
  },
  remainingAmount: {
    color: theme.colors.error,
    fontFamily: 'Roboto_700Bold',
  },
  balanceAmount: {
    color: theme.colors.onSurfaceVariant,
  },
  editButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: theme.spacing.xs,
  },
  deleteButton: {
    backgroundColor: theme.colors.errorContainer,
  },
  shareButton: {
    backgroundColor: '#C8E6C9', // Light green background (Green 100)
  },
  editButton: {
    backgroundColor: theme.colors.primaryContainer,
  },
  disabledButton: {
    backgroundColor: theme.colors.surfaceDisabled,
    opacity: 0.5,
  },
  editButtonText: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_500Medium',
    fontSize: 12,
  },
  totalDivider: {
    marginVertical: theme.spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  totalLabel: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_500Medium',
  },
  totalValue: {
    fontFamily: 'Roboto_700Bold',
    fontSize: 15,
  },
  hiddenCard: {
    position: 'absolute',
    opacity: 0,
  },
  shareableCardWrapper: {
    backgroundColor: '#FAFAFA',
    padding: -5,
    width: 350,
  },
  shareableCard: {
    borderRadius: 12,
    padding: -5,
    elevation: theme.elevation.level1,
  },
  shareableCardContent: {
    padding: -5,
  },
});