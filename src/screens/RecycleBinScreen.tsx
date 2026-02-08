import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  BackHandler,
  TouchableOpacity,
  TextInput,
  Text,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import {
  formatTransactionAmount,
  formatFullDate,
  formatPureGoldPrecise,
  formatIndianNumber,
  customFormatPureSilver,
  formatCurrency,
  formatPureGold,
  formatPureSilver
} from '../utils/formatting';
import { TransactionService } from '../services/transaction.service';
import { Transaction } from '../types';
import { useAppContext } from '../context/AppContext';
import CustomAlert from '../components/CustomAlert';

export const RecycleBinScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { navigateToSettings } = useAppContext();

  // Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<Array<{ text: string; style?: 'cancel' | 'default' | 'destructive'; onPress?: () => void }>>([]);
  const [alertIcon, setAlertIcon] = useState<string | undefined>(undefined);

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigateToSettings();
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [navigateToSettings])
  );

  // Handle delete transaction permanently
  const handleDeletePermanently = (transaction: Transaction) => {
    setAlertTitle('Delete Permanently');
    setAlertMessage('This will permanently delete this transaction. This action cannot be undone.');
    setAlertButtons([
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const success = await TransactionService.deleteTransactionPermanently(transaction.id);
            if (success) {
              await loadTransactions(true);
              setAlertTitle('Success');
              setAlertMessage('Transaction deleted permanently');
              setAlertIcon('check-circle');
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

  // Handle restore transaction
  const handleRestoreTransaction = (transaction: Transaction) => {
    setAlertTitle('Restore Transaction');
    setAlertMessage('Do you want to restore this transaction?');
    setAlertButtons([
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          try {
            const success = await TransactionService.restoreTransaction(transaction.id);
            if (success) {
              await loadTransactions(true);
              setAlertTitle('Success');
              setAlertMessage('Transaction restored successfully');
              setAlertIcon('check-circle');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            } else {
              setAlertTitle('Error');
              setAlertMessage('Failed to restore transaction');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            }
          } catch (error) {
            console.error('Error restoring transaction:', error);
            setAlertTitle('Error');
            setAlertMessage('Failed to restore transaction');
            setAlertButtons([{ text: 'OK' }]);
            setAlertVisible(true);
          }
        },
      },
    ]);
    setAlertVisible(true);
  };

  // Handle delete all transactions permanently
  const handleDeleteAllPermanently = () => {
    if (filteredTransactions.length === 0) {
      setAlertTitle('No Transactions');
      setAlertMessage('There are no transactions to delete.');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
      return;
    }

    setAlertTitle('Delete All Permanently');
    setAlertMessage(`This will permanently delete all ${filteredTransactions.length} transaction${filteredTransactions.length > 1 ? 's' : ''} in the recycle bin. This action cannot be undone.`);
    setAlertButtons([
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          try {
            let successCount = 0;
            for (const transaction of filteredTransactions) {
              const success = await TransactionService.deleteTransactionPermanently(transaction.id);
              if (success) successCount++;
            }

            if (successCount > 0) {
              await loadTransactions(true);
              setAlertTitle('Success');
              setAlertMessage(`${successCount} transaction${successCount > 1 ? 's' : ''} deleted permanently`);
              setAlertIcon('check-circle');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            } else {
              setAlertTitle('Error');
              setAlertMessage('Failed to delete transactions');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            }
          } catch (error) {
            console.warn('Error deleting all transactions:', error);
            setAlertTitle('Error');
            setAlertMessage(error instanceof Error ? error.message : 'Failed to delete transactions');
            setAlertButtons([{ text: 'OK' }]);
            setAlertVisible(true);
          }
        },
      },
    ]);
    setAlertVisible(true);
  };

  const getItemDisplayName = (entry: any): string => {
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
    }, [])
  );

  const loadTransactions = async (refresh = false) => {
    try {
      if (!refresh) {
        setIsLoading(true);
      }
      setError(null);

      // Load deleted transactions only
      const allTransactions = await TransactionService.getDeletedTransactions();

      // Sort by deleted_on in descending order (most recently deleted first)
      const sortedTransactions = allTransactions.sort((a, b) => {
        const dateA = new Date(a.deleted_on || 0).getTime();
        const dateB = new Date(b.deleted_on || 0).getTime();
        return dateA - dateB; // Descending order
      });

      setTransactions(sortedTransactions);
      setFilteredTransactions(sortedTransactions);
    } catch (error) {
      console.error('Error loading deleted transactions:', error);
      setError('Failed to load deleted transactions');
    } finally {
      setIsLoading(false);
    }
  };

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredTransactions(transactions);
    } else {
      const query = searchQuery.toLowerCase().trim();
      const filtered = transactions.filter(transaction =>
        transaction.customerName.toLowerCase().includes(query)
      );
      setFilteredTransactions(filtered);
    }
  }, [searchQuery, transactions]);

  const getAmountColor = (transaction: Transaction) => {
    const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;
    if (isMoneyOnly) {
      // For money-only: positive amountPaid = received (green), negative = given (blue)
      const isReceived = transaction.amountPaid > 0;
      return isReceived ? theme.colors.sellColor : theme.colors.primary;
    } else {
      // Blue for Given (purchase), Green for Received (sell)
      const isReceived = transaction.total > 0;
      return isReceived ? theme.colors.sellColor : theme.colors.primary;
    }
  };

  const getEntryDisplayData = (entry: any, transaction: Transaction) => {
    const isMetalOnly = entry.metalOnly;
    const isRaniRupa = ['rani', 'rupu'].includes(entry.itemType);
    const isGoldSilver = !isRaniRupa && entry.type !== 'money';

    // Exception Check: Rani Sell + Gold Purchase -> Keep "Same as is"
    const hasRaniSell = transaction.entries.some(e => e.itemType === 'rani' && e.type === 'sell');
    const hasGoldPurchase = transaction.entries.some(e => e.itemType.includes('gold') && e.type === 'purchase');
    const isExceptionCase = hasRaniSell && hasGoldPurchase;

    if (isExceptionCase) {
      let line1 = '';
      if (isRaniRupa) {
        const weight = entry.weight || 0;
        const touch = entry.touch || 100;
        const cut = entry.cut || 0;
        const effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
        const pureWeight = (weight * effectiveTouch) / 100;
        const formattedPure = entry.itemType === 'rani'
          ? formatPureGoldPrecise(pureWeight)
          : formatPureSilver(pureWeight);
        const fixedDigits = entry.itemType === 'rani' ? 3 : 1;
        line1 = `${weight.toFixed(fixedDigits)}g : ${effectiveTouch.toFixed(2)}% : ${formattedPure.toFixed(fixedDigits)}g`;
      } else if (isGoldSilver) {
        const isGold = entry.itemType.includes('gold');
        line1 = `${(entry.weight || 0).toFixed(isGold ? 3 : 1)}g`;
      }

      let line2 = '';
      if (!isMetalOnly && entry.price && entry.price > 0) {
        line2 = formatCurrency(entry.price);
      }
      return { line1, line2 };
    }

    // New Logic
    let line1 = '';
    let line2 = '';

    if (isRaniRupa) {
      const weight = entry.weight || 0;
      const touch = entry.touch || 100;
      const cut = entry.cut || 0;
      const effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
      const pureWeight = (weight * effectiveTouch) / 100;

      // Pure Weight Formatting Logic
      let formattedPure = 0;
      if (entry.itemType === 'rani') {
        if (entry.type === 'sell') formattedPure = formatPureGoldPrecise(pureWeight);
        else formattedPure = formatPureGold(pureWeight); // Purchase -> Normal
      } else {
        formattedPure = formatPureSilver(pureWeight);
      }

      const fixedDigits = entry.itemType === 'rani' ? 3 : 1;
      line1 = `${weight.toFixed(fixedDigits)}g : ${effectiveTouch.toFixed(2)}% : ${formattedPure.toFixed(fixedDigits)}g`;

      if (!isMetalOnly && entry.price && entry.price > 0) {
        line2 = `${formatCurrency(entry.price)} : ${formatCurrency(entry.subtotal || 0)}`;
      }
    } else if (isGoldSilver) {
      const isGold = entry.itemType.includes('gold');
      const weightStr = `${(entry.weight || 0).toFixed(isGold ? 3 : 1)}g`;

      if (!isMetalOnly && entry.price && entry.price > 0) {
        line1 = `${weightStr} : ${formatCurrency(entry.price)}`;

        // Subtotal Logic
        const hasRaniRupaEntry = transaction.entries.some(e => ['rani', 'rupu'].includes(e.itemType));
        if (!hasRaniRupaEntry) {
          // Normal Gold/Silver only
          line2 = `(${formatCurrency(entry.subtotal || 0)})`;
        } else {
          // Mixed case -> No subtotal
          line2 = '';
        }
      } else {
        line1 = weightStr;
      }
    } else if (entry.type === 'money') {
      // For money entries
      line1 = formatCurrency(entry.amount || 0);
    }

    return { line1, line2 };
  };

  const renderTransactionCard = ({ item: transaction }: { item: Transaction }) => {
    const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);

    // Preprocess entries
    const processedEntries = transaction.entries.map((entry, index) => {
      let displayName = getItemDisplayName(entry);
      if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
        const sameTypeEntries = transaction.entries.slice(0, index + 1).filter(e =>
          e.itemType === entry.itemType && e.type === entry.type
        );
        const totalCount = transaction.entries.filter(e =>
          e.itemType === entry.itemType && e.type === entry.type
        ).length;
        if (totalCount > 1) {
          displayName += ` ${sameTypeEntries.length}`;
        }
      }
      return { ...entry, displayName };
    });

    let transactionBalanceLabel = '';
    let transactionBalanceColor = theme.colors.onSurfaceVariant;

    // Calculate deleted on info
    let deletedOnInfo = null;
    if (transaction.deleted_on) {
      const deletedDate = new Date(transaction.deleted_on);
      const autoDeleteDate = new Date(deletedDate);
      autoDeleteDate.setDate(autoDeleteDate.getDate() + 15); // Changed to 15 days
      const daysLeft = Math.ceil((autoDeleteDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      deletedOnInfo = {
        text: daysLeft > 0 ? `Auto-delete in ${daysLeft} day${daysLeft > 1 ? 's' : ''}` : 'Pending deletion',
        isWarning: daysLeft <= 3
      };
    }

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
      // Check if this is a money-only transaction (no entries)
      const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;

      if (isMoneyOnly) {
        const isBalance = transaction.amountPaid > 0;
        transactionBalanceLabel = `${isBalance ? 'Balance' : 'Debt'}: ₹${formatIndianNumber(Math.abs(transaction.amountPaid))}`;
        transactionBalanceColor = isBalance ? theme.colors.success : theme.colors.debtColor;
      } else {
        const transactionRemaining = transaction.amountPaid - transaction.total;

        if (transactionRemaining === 0) {
          transactionBalanceLabel = 'Settled';
        } else {
          const isDebt = transactionRemaining < 0;
          transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
        }
      }
    }

    return (
      <View style={styles.historyCard}>
        {/* Action Buttons and Delete Info */}
        <View style={styles.cardTopActions}>
          {deletedOnInfo && (
            <View style={[styles.warningPill, deletedOnInfo.isWarning ? styles.warningPillUrgent : styles.warningPillNormal]}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={deletedOnInfo.isWarning ? "#D32F2F" : "#F57F17"} />
              <Text style={[styles.warningPillText, deletedOnInfo.isWarning ? styles.warningPillTextUrgent : styles.warningPillTextNormal]}>
                {deletedOnInfo.text}
              </Text>
            </View>
          )}
          <View style={styles.actionPill}>
            <TouchableOpacity
              style={[styles.iconBtn, styles.btnRestore]}
              onPress={() => handleRestoreTransaction(transaction)}
            >
              <MaterialCommunityIcons name="restore" size={20} color={theme.colors.onPrimaryContainer} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconBtn, styles.btnDelete]}
              onPress={() => handleDeletePermanently(transaction)}
            >
              <MaterialCommunityIcons name="delete-forever" size={20} color={theme.colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.infoBlock}>
            <Text style={styles.customerName}>
              {transaction.customerName}
            </Text>
            <Text style={styles.transactionDate}>
              {formatFullDate(transaction.date)}
            </Text>
          </View>
          <View style={styles.amountBlock}>
            {!isMetalOnly && (
              <Text
                style={[styles.mainAmount, { color: getAmountColor(transaction) }]}
              >
                {formatTransactionAmount(transaction)}
              </Text>
            )}
          </View>
        </View>

        {/* Receipt / Details Section */}
        <View style={styles.receiptSection}>
          {processedEntries.map((entry, index) => (
            <View key={index} style={styles.entryWrapper}>
              {(() => {
                const isMoneyGive = entry.type === 'money' && entry.moneyType === 'give';
                const isMoneyReceive = entry.type === 'money' && entry.moneyType === 'receive';
                const isSell = entry.type === 'sell' || isMoneyGive;
                const isPurchase = entry.type === 'purchase' || isMoneyReceive;
                const iconName = isSell ? 'arrow-top-right' : isPurchase ? 'arrow-bottom-left' : 'cash';
                const iconColor = isSell ? theme.colors.success : isPurchase ? theme.colors.primary : '#F57C00';
                const iconStyle = isSell ? styles.iconSell : isPurchase ? styles.iconPurchase : styles.iconMoney;

                const { line1, line2 } = getEntryDisplayData(entry, transaction);

                return (
                  <>
                    {/* Item Row */}
                    <View style={styles.receiptRow}>
                      <View style={styles.itemNameRow}>
                        <View style={[styles.iconBox, iconStyle]}>
                          <MaterialCommunityIcons name={iconName} size={14} color={iconColor} />
                        </View>
                        <Text style={styles.itemNameText}>
                          {entry.displayName}
                        </Text>
                      </View>

                      {/* Line 1: Weight / Details */}
                      <Text style={styles.itemVal}>
                        {line1}
                      </Text>
                    </View>

                    {/* Line 2: Price / Subtotal (if applicable) */}
                    {line2 !== '' && (
                      <View style={[styles.receiptRow, { marginTop: -4 }]}>
                        <View />
                        <Text style={[styles.itemVal, { fontSize: 13, opacity: 0.8 }]}>
                          {line2}
                        </Text>
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
          ))}

          {/* Dividers & Totals */}
          {!isMetalOnly && processedEntries.length > 0 && <View style={styles.divider} />}

          {/* Total Row or Money-Only Label */}
          {!isMetalOnly && (
            processedEntries.length === 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Money-Only</Text>
              </View>
            ) : (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={[styles.totalAmount]}>
                  ₹{formatIndianNumber(Math.abs(transaction.total))}
                </Text>
              </View>
            )
          )}

          {/* Divider */}
          {!isMetalOnly && <View style={styles.divider} />}

          {/* Payment/Balance Row */}
          {!isMetalOnly && (
            <View style={[styles.receiptRow, styles.footerRow]}>
              <Text style={styles.footerLabel}>
                {transaction.amountPaid > 0 ? 'Received' : 'Given'}:
              </Text>
              <Text style={[styles.footerAmount, { color: transaction.amountPaid >= 0 ? theme.colors.success : theme.colors.primary }]}>
                {transaction.amountPaid >= 0 ? '+' : '-'}₹{formatIndianNumber(Math.abs(transaction.amountPaid))}
              </Text>
              <View style={{ flex: 1 }} />
              <View>
                <Text style={[styles.balanceLabel, { color: transactionBalanceColor }]}>
                  {transactionBalanceLabel}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Note Section */}
        {transaction.note && transaction.note.trim() !== '' && (
          <View style={styles.noteRow}>
            <Text style={styles.noteLabel}>NOTE</Text>
            <Text style={styles.noteText}>{transaction.note}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={navigateToSettings}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#1B1B1F" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Recycle Bin</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Search Box */}
        <View style={styles.toolbarIsland}>
          <View style={styles.searchContainer}>
            <MaterialCommunityIcons name="magnify" size={24} color={theme.colors.onSurfaceVariant} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search deleted transactions..."
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <TouchableOpacity
            style={styles.deleteAllButton}
            onPress={handleDeleteAllPermanently}
            disabled={filteredTransactions.length === 0}
          >
            <MaterialCommunityIcons
              name="delete-sweep"
              size={28}
              color={filteredTransactions.length === 0 ? theme.colors.onSurfaceVariant : theme.colors.error}
            />
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredTransactions}
            renderItem={renderTransactionCard}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {isLoading ? 'Loading...' : 'No deleted transactions'}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        icon={alertIcon}
        buttons={alertButtons}
        onDismiss={() => {
          setAlertVisible(false);
          setAlertIcon(undefined);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3E7ED', // --surface-container
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#1B1B1F',
    letterSpacing: -1,
  },
  content: {
    flex: 1,
  },
  // Search Box
  toolbarIsland: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 50,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Outfit_400Regular',
    fontSize: 16,
    color: theme.colors.onSurface,
  },
  deleteAllButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  // Transaction Card
  historyCard: {
    backgroundColor: theme.colors.surfaceContainerHigh || '#F0F2F5',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoBlock: {
    flex: 1,
  },
  customerName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    color: theme.colors.onSurface,
  },
  transactionDate: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  mainAmount: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    marginBottom: 4,
  },
  balanceLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  receiptSection: {
    backgroundColor: theme.colors.surface, // Lighter inner card for depth
    borderRadius: 16,
    padding: 12,
  },
  entryWrapper: {
    marginBottom: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  iconSell: {
    backgroundColor: '#E8F5E9', // Light Green
  },
  iconPurchase: {
    backgroundColor: '#E3F2FD', // Light Blue
  },
  iconMoney: {
    backgroundColor: '#FFF8E1', // Light Orange
  },
  itemNameText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  itemVal: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 8,
  },
  footerLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  footerRow: {
    justifyContent: 'flex-start',
  },
  footerAmount: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: theme.colors.onSurface,
    marginLeft: 4,
  },
  // Actions
  cardTopActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionPill: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDelete: {
    backgroundColor: theme.colors.errorContainer,
  },
  btnRestore: {
    backgroundColor: theme.colors.primaryContainer,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  totalAmount: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  noteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  noteLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  noteText: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: 'right',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: theme.colors.error,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
  },
  deletedInfoContainer: {
    flex: 1,
  },
  deletedOnText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    fontFamily: 'Outfit_400Regular',
  },
  warningText: {
    color: theme.colors.error,
    fontFamily: 'Outfit_500Medium',
  },
  warningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    gap: 6,
    marginBottom: 12,
  },
  warningPillNormal: {
    backgroundColor: '#FFF8E1', // Light orange background
  },
  warningPillUrgent: {
    backgroundColor: '#FFEBEE', // Light red background (matching red)
  },
  warningPillText: {
    fontSize: 12,
    fontFamily: 'Outfit_700Bold',
  },
  warningPillTextNormal: {
    color: '#F57F17', // Dark orange
  },
  warningPillTextUrgent: {
    color: '#D32F2F', // Dark red (matching red)
  },
});
