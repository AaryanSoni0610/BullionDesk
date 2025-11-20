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
            console.error('Error deleting transaction:', error);
            setAlertTitle('Error');
            setAlertMessage('Failed to delete transaction');
            setAlertButtons([{ text: 'OK' }]);
            setAlertVisible(true);
          }
        },
      },
    ]);
    setAlertVisible(true);
  };

  // Handle share transaction
  const handleShareTransaction = async (transaction: Transaction, cardRef: React.RefObject<View>) => {
    try {
      if (!cardRef.current) {
        setAlertTitle('Error');
        setAlertMessage('Unable to capture transaction card');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        return;
      }

      // Capture the card as an image with better quality settings
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: 400, // Fixed width matching shareableCardWrapper
      });

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        setAlertTitle('Error');
        setAlertMessage('Sharing is not available on this device');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        return;
      }

      // Share the image
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Transaction - ${transaction.customerName}`,
      });
    } catch (error) {
      console.error('Error sharing transaction:', error);
      setAlertTitle('Error');
      setAlertMessage('Failed to share transaction');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
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
  

  useEffect(() => {
    loadTransactions();
  }, [selectedFilter, customEndDate]);

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
    // Blue for Given (purchase), Green for Received (sell)
    const isReceived = transaction.total > 0;
    return isReceived ? theme.colors.sellColor : theme.colors.primary;
  };

  // Enhanced Transaction Card Component
  const TransactionCard: React.FC<{ transaction: Transaction; isShareable?: boolean }> = ({ transaction, isShareable = false }) => {
    const shareableCardRef = useRef<View>(null);
    const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
    
    const cardStyle = isShareable ? styles.shareableCard : styles.transactionCard;
    const contentStyle = isShareable ? styles.shareableCardContent : undefined;
    
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
      // For money transactions, show money balance
      const transactionRemaining = transaction.total >= 0 
        ? Math.abs(transaction.total) - transaction.amountPaid - Math.abs(transaction.discountExtraAmount)
        : transaction.amountPaid - Math.abs(transaction.total) - Math.abs(transaction.discountExtraAmount);
      
      const hasRemainingBalance = transactionRemaining !== 0;
      
      // Check if this is a money-only transaction (no entries)
      const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;

      if (hasRemainingBalance) {
        if (!isMoneyOnly) {
          const isDebt = transaction.total > 0;
          transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
        } else {
          const isDebt = transaction.amountPaid < 0;
          transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
        }
      } else {
        transactionBalanceColor = theme.colors.primary; // Blue for settled
      }
    }
    
    return (
      <>
        {/* Visible Card with Action Buttons */}
        <Card style={cardStyle}>
          <Card.Content style={contentStyle}>
            
            {!isShareable && (
              <>
                {/* Action Buttons Row */}
                <View style={styles.editButtonRow}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteTransaction(transaction)}
                  >
                    <Icon name="delete" size={16} color={theme.colors.error} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.shareButton]}
                    onPress={() => handleShareTransaction(transaction, shareableCardRef)}
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
              </>
            )}

            {/* Header Row */}
            <View style={styles.cardHeader}>
              <View style={styles.customerInfo}>
                <Text variant="titleMedium" style={styles.customerName}>
                  {highlightSearchText(transaction.customerName, searchQuery)}
                </Text>
                <Text variant="bodySmall" style={styles.transactionDate}>
                  {formatFullDate(transaction.date)}
                </Text>
              </View>
              <View style={styles.rightSection}>
                {!isMetalOnly && (
                  <Text 
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
              <Divider style={styles.expandedDivider} />
              {transaction.entries.map((entry, index) => (
                <React.Fragment key={index}>
                  {/* Special handling for rani/rupa purchase items */}
                  {(entry.itemType === 'rani' || entry.itemType === 'rupu') && entry.type === 'purchase' ? (
                    <>
                      <View style={styles.entryRow}>
                        <Text variant="bodySmall" style={styles.entryType}>
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
                        <Text variant="bodySmall" style={styles.entryDetails}>
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
                          <Text variant="bodySmall" style={[styles.entryDetails, { flex: 1 }]}>
                            ₹{formatIndianNumber(entry.price)}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.entryRow}>
                      <Text variant="bodySmall" style={styles.entryType}>
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
                      <Text variant="bodySmall" style={styles.entryDetails}>
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
                  
                  {/* Show Rupu silver returns */}
                  {entry.itemType === 'rupu' && entry.type === 'purchase' && entry.rupuReturnType === 'silver' && (
                    <>
                      {entry.silverWeight && entry.silverWeight > 0 && (
                        <View style={styles.entryRow}>
                          <Text variant="bodySmall" style={[styles.entryType]}>
                            ↗️ Silver
                          </Text>
                          <Text variant="bodySmall" style={[styles.entryDetails]}>
                            {Math.floor(entry.silverWeight).toFixed(1)}g
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                  
                </React.Fragment>
              ))}
              
              {/* Total Row - Show only for non-metal-only transactions */}
              {!isMetalOnly && (
                <>
                  <Divider style={styles.totalDivider} />
                  <View style={styles.totalRow}>
                    <Text variant="bodySmall" style={styles.totalLabel}>
                      Total
                    </Text>
                    <Text variant="bodySmall" style={[styles.entryDetails, { color: getAmountColor(transaction) }]}>
                      ₹{formatIndianNumber(Math.abs(transaction.total))}
                    </Text>
                  </View>
                </>
              )}
              
              {/* Payment/Balance Row */}
              <View style={styles.paymentRow}>
                {!isMetalOnly && transaction.amountPaid > 0 && (
                  <Text variant="bodySmall" style={styles.paymentLabel}>
                    {transaction.total > 0 ? 'Amount Received' : 'Amount Given'}: ₹{formatIndianNumber(transaction.amountPaid)}
                  </Text>
                )}
                {(!(!isMetalOnly && transaction.amountPaid > 0)) && <View style={{ flex: 1 }} />}
                <Text variant="bodySmall" style={[styles.transactionBalance, 
                  { color: transactionBalanceColor }
                ]}>
                  {transactionBalanceLabel}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Hidden Shareable Card (without action buttons) for screenshot */}
        <View style={styles.hiddenCard} collapsable={false}>
          <View ref={shareableCardRef} collapsable={false} style={styles.shareableCardWrapper}>
            <Card style={styles.shareableCard}>
              <Card.Content style={styles.shareableCardContent}>
                {/* Header Row */}
                <View style={styles.cardHeader}>
                  <View style={styles.customerInfo}>
                    <Text variant="titleMedium" style={styles.customerName}>
                      {transaction.customerName}
                    </Text>
                    <Text variant="bodySmall" style={styles.transactionDate}>
                      {formatFullDate(transaction.date)}
                    </Text>
                  </View>
                  <View style={styles.rightSection}>
                    {!isMetalOnly && (
                      <Text 
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
                  <Divider style={styles.expandedDivider} />
                  {transaction.entries.map((entry, index) => (
                    <React.Fragment key={index}>
                      {/* Special handling for rani/rupa purchase items */}
                      {(entry.itemType === 'rani' || entry.itemType === 'rupu') && entry.type === 'purchase' ? (
                        <>
                          <View style={styles.entryRow}>
                            <Text variant="bodySmall" style={styles.entryType}>
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
                            <Text variant="bodySmall" style={styles.entryDetails}>
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
                              <Text variant="bodySmall" style={[styles.entryDetails, { flex: 1 }]}>
                                ₹{formatIndianNumber(entry.price)}
                              </Text>
                            </View>
                          ) : null}
                        </>
                      ) : (
                        <View style={styles.entryRow}>
                          <Text variant="bodySmall" style={styles.entryType}>
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
                          <Text variant="bodySmall" style={styles.entryDetails}>
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
                      
                      {/* Show Rupu silver returns */}
                      {entry.itemType === 'rupu' && entry.type === 'purchase' && entry.rupuReturnType === 'silver' && (
                        <>
                          {entry.silverWeight && entry.silverWeight > 0 && (
                            <View style={styles.entryRow}>
                              <Text variant="bodySmall" style={[styles.entryType]}>
                                ↗️ Silver
                              </Text>
                              <Text variant="bodySmall" style={[styles.entryDetails]}>
                                {Math.floor(entry.silverWeight).toFixed(1)}g
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                      
                    </React.Fragment>
                  ))}
                  
                  {/* Total Row - Show only for non-metal-only transactions */}
                  {!isMetalOnly && (
                    <>
                      <Divider style={styles.totalDivider} />
                      <View style={styles.totalRow}>
                        <Text variant="bodySmall" style={styles.totalLabel}>
                          Total
                        </Text>
                        <Text variant="bodyMedium" style={[styles.entryDetails, { color: getAmountColor(transaction) }]}>
                          ₹{formatIndianNumber(Math.abs(transaction.total))}
                        </Text>
                      </View>
                    </>
                  )}
                  
                  {/* Payment/Balance Row */}
                  <View style={styles.paymentRow}>
                    {!isMetalOnly && transaction.amountPaid > 0 && (
                      <Text variant="bodySmall" style={styles.paymentLabel}>
                        {transaction.total > 0 ? 'Amount Received' : 'Amount Given'}: ₹{formatIndianNumber(transaction.amountPaid)}
                      </Text>
                    )}
                    {(!(!isMetalOnly && transaction.amountPaid > 0)) && <View style={{ flex: 1 }} />}
                    <Text variant="bodySmall" style={[styles.transactionBalance, 
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
      </>
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
          <IconButton
            icon="cog-outline"
            size={24}
            onPress={navigateToSettings}
            style={styles.settingsButton}
          />
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
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={handleStartDateChange}
        maximumDate={new Date(new Date().setDate(new Date().getDate() - 1))}
      />
    )}
    
    {showEndDatePicker && customStartDate && (
      <DateTimePicker
        value={customEndDate || customStartDate}
        mode="date"
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={handleEndDateChange}
        minimumDate={customStartDate}
        maximumDate={new Date()} // Allow selecting today
      />
    )}
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
    left: -9999,
    top: -9999,
    opacity: 0,
  },
  shareableCardWrapper: {
    backgroundColor: '#FAFAFA',
    padding: 16,
    width: 400, // Fixed width for consistent sharing
  },
  shareableCard: {
    borderRadius: 12,
    elevation: theme.elevation.level1,
  },
  shareableCardContent: {
    padding: 16,
  },
});