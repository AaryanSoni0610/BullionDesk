import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  BackHandler,
} from 'react-native';
import {
  Surface,
  Text,
  Searchbar,
  Card,
  Divider,
  ActivityIndicator,
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import { formatTransactionAmount, formatFullDate, formatPureGoldPrecise, formatIndianNumber, customFormatPureSilver } from '../utils/formatting';
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
  const [alertButtons, setAlertButtons] = useState<Array<{ text: string; onPress?: () => void }>>([]);

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
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            const success = await TransactionService.deleteTransactionPermanently(transaction.id);
            if (success) {
              await loadTransactions(true);
              setAlertTitle('Success');
              setAlertMessage('Transaction deleted permanently');
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
      { text: 'Cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          try {
            const success = await TransactionService.restoreTransaction(transaction.id);
            if (success) {
              await loadTransactions(true);
              setAlertTitle('Success');
              setAlertMessage('Transaction restored successfully');
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
      
      // Clean up old deleted transactions (3+ days old)
      const deletedCount = await TransactionService.cleanupOldDeletedTransactions();
      if (deletedCount > 0) {
        console.log(`Automatically deleted ${deletedCount} old transactions from recycle bin`);
      }
      
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

  const renderTransactionCard = ({ item: transaction }: { item: Transaction }) => {
    const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
    
    let transactionBalanceLabel = '';
    let transactionBalanceColor = theme.colors.onSurfaceVariant;

    // Calculate deleted on info if needed
    let deletedOnInfo = null;
    if (transaction.deleted_on) {
      const deletedDate = new Date(transaction.deleted_on);
      const autoDeleteDate = new Date(deletedDate);
      autoDeleteDate.setDate(autoDeleteDate.getDate() + 3);
      const daysLeft = Math.ceil((autoDeleteDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      deletedOnInfo = {
        text: daysLeft > 0 ? `Auto-delete in ${daysLeft} day${daysLeft > 1 ? 's' : ''}` : 'Pending deletion',
        isWarning: daysLeft <= 1
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
        // For money-only transactions (NEW SIGN CONVENTION):
        // amountPaid > 0 = merchant received = customer has balance/credit
        // amountPaid < 0 = merchant gave = customer has debt
        const isBalance = transaction.amountPaid > 0;
        transactionBalanceLabel = `${isBalance ? 'Balance' : 'Debt'}: ₹${formatIndianNumber(Math.abs(transaction.amountPaid))}`;
        transactionBalanceColor = isBalance ? theme.colors.success : theme.colors.debtColor;
      } else {
        // For regular transactions with entries
        // Formula: amountPaid - total + discount
        // Positive = balance (merchant owes), Negative = debt (customer owes)
        const transactionRemaining = transaction.amountPaid - transaction.total + transaction.discountExtraAmount;
        
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
      <Card style={styles.transactionCard}>
        <Card.Content style={styles.cardContent}>
          {/* Action Buttons and Delete Info */}
          <View style={styles.editButtonRow}>
            {deletedOnInfo && (
              <Text variant="bodySmall" style={[styles.deletedOnText, deletedOnInfo.isWarning ? styles.warningText : null]}>
                {deletedOnInfo.text}
              </Text>
            )}
            <View style={styles.iconContainer}>
              <IconButton
                icon="restore"
                size={20}
                iconColor={theme.colors.onPrimaryContainer}
                style={{ backgroundColor: theme.colors.primaryContainer, margin: 0, marginRight: 2.5 }}
                onPress={() => handleRestoreTransaction(transaction)}
              />
              <IconButton
                icon="delete-forever"
                size={20}
                iconColor={theme.colors.error}
                style={{ backgroundColor: theme.colors.errorContainer, margin: 0 }}
                onPress={() => handleDeletePermanently(transaction)}
              />
            </View>
          </View>

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

          {/* Transaction Details */}
          <View style={styles.expandedContent}>
            {transaction.entries.length > 0 && <Divider style={styles.expandedDivider} />}
            {transaction.entries.length > 0 ? transaction.entries.map((entry, index) => (
              <React.Fragment key={index}>
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
                            : customFormatPureSilver(weight, effectiveTouch);
                          
                          return `${weight.toFixed(entry.itemType === 'rani' ? 3 : 1)}g, ${touch}%${entry.itemType === 'rani' && cut > 0 ? ` (-${cut}%)` : ''}, ${formattedPureWeight.toFixed(entry.itemType === 'rani' ? 3 : 1)}g`;
                        })()}
                      </Text>
                    </View>
                    {entry.itemType === 'rani' && (entry as any).actualGoldGiven && (
                      <View style={styles.subEntryRow}>
                        <Text variant="bodySmall" style={styles.subEntryLabel}>
                          └ Return Gold
                        </Text>
                        <Text variant="bodySmall" style={styles.subEntryValue}>
                          {(entry as any).actualGoldGiven.toFixed(3)}g
                        </Text>
                      </View>
                    )}
                    {entry.itemType === 'rupu' && (entry as any).rupuReturnType === 'silver' && (entry as any).silverWeight && (
                      <View style={styles.subEntryRow}>
                        <Text variant="bodySmall" style={styles.subEntryLabel}>
                          └ Return Silver
                        </Text>
                        <Text variant="bodySmall" style={styles.subEntryValue}>
                          {Math.floor((entry as any).silverWeight).toFixed(1)}g
                        </Text>
                      </View>
                    )}
                  </>
                ) : entry.type === 'money' ? (
                  <View style={styles.entryRow}>
                    <Text variant="bodySmall" style={styles.entryType}>
                      {entry.moneyType === 'give' ? '💸 Money Given' : '💰 Money Received'}
                    </Text>
                    <Text variant="bodySmall" style={styles.entryDetails}>
                      ₹{formatIndianNumber(entry.amount || 0)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.entryRow}>
                    <Text variant="bodySmall" style={styles.entryType}>
                      {entry.type === 'sell' ? '↗️' : '↙️'} {getItemDisplayName(entry)}{(() => {
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
                      {entry.weight?.toFixed(entry.itemType.includes('gold') || entry.itemType === 'rani' ? 3 : 1) || '0'}g
                      {!entry.metalOnly && ` • ₹${formatIndianNumber(entry.subtotal)}`}
                    </Text>
                  </View>
                )}
              </React.Fragment>
            )) : null}
            
            {!isMetalOnly && (
              <>
                <Divider style={styles.totalDivider} />
                <View style={styles.totalRow}>
                  <Text variant="bodySmall" style={styles.totalLabel}>
                    Total
                  </Text>
                  <Text variant="bodySmall" style={[styles.totalValue, { color: getAmountColor(transaction) }]}>
                    ₹{formatIndianNumber(Math.abs(transaction.total))}
                  </Text>
                </View>
              </>
            )}
            
            <View style={styles.paymentRow}>
              {!isMetalOnly && transaction.amountPaid !== 0 && (
                <Text variant="bodySmall" style={styles.paymentLabel}>
                  {transaction.entries.length === 0 ? (transaction.amountPaid > 0 ? 'Received' : 'Given') 
                  : (transaction.total > 0 ? 'Amount Received' : 'Amount Given')}: ₹{formatIndianNumber(Math.abs(transaction.amountPaid))}
                </Text>
              )}
              {(!(!isMetalOnly && transaction.amountPaid !== 0)) && <View style={{ flex: 1 }} />}
              <Text variant="bodySmall" style={[styles.transactionBalance, { color: transactionBalanceColor }]}>
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
      <SafeAreaView style={styles.container}>
        <Surface style={styles.appTitleBar} elevation={1}>
          <View style={styles.appTitleContent}>
            <IconButton
              icon="arrow-left"
              size={20}
              onPress={navigateToSettings}
              style={styles.backButton}
            />
            <Text variant="titleLarge" style={styles.appTitle}>
              Recycle Bin
            </Text>
            <View style={{ width: 40 }} />
          </View>
        </Surface>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="bodyLarge" style={styles.loadingText}>
            Loading deleted transactions...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Surface style={styles.appTitleBar} elevation={1}>
        <View style={styles.appTitleContent}>
          <IconButton
            icon="arrow-left"
            size={20}
            onPress={navigateToSettings}
            style={styles.backButton}
          />
          <Text variant="titleLarge" style={styles.appTitle}>
            Recycle Bin
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </Surface>

      <View style={styles.content}>
        <Searchbar
          placeholder="Search by customer name"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />

        {error ? (
          <View style={styles.errorContainer}>
            <Text variant="bodyMedium" style={styles.errorText}>
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
                <Text variant="bodyLarge" style={styles.emptyText}>
                  No deleted transactions
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
        buttons={alertButtons}
        onDismiss={() => setAlertVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  appTitleBar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.xs,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
  },
  backButton: {
    marginRight: theme.spacing.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  searchBar: {
    marginVertical: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceVariant,
  },
  listContainer: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  transactionCard: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_500Medium',
  },
  transactionDate: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  rightSection: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: theme.spacing.xs,
  },
  amount: {
    fontFamily: 'Roboto_700Bold',
    textAlign: 'right',
  },
  expandedContent: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  expandedDivider: {
    marginBottom: theme.spacing.sm,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs / 2,
  },
  entryType: {
    flex: 1,
    color: theme.colors.onSurface,
  },
  entryDetails: {
    textAlign: 'right',
    color: theme.colors.onSurfaceVariant,
  },
  subEntryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingLeft: theme.spacing.md,
  },
  subEntryLabel: {
    flex: 1,
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
  },
  subEntryValue: {
    flex: 1,
    textAlign: 'right',
    color: theme.colors.onSurface,
    fontSize: 11,
  },
  totalDivider: {
    marginVertical: theme.spacing.sm,
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
    fontSize: 12,
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
  paymentLabel: {
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_500Medium',
  },
  transactionBalance: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 11,
  },
  editButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  iconContainer: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
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
    paddingVertical: theme.spacing.xl * 2,
  },
  emptyText: {
    color: theme.colors.onSurfaceVariant,
  },
  deletedOnText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    marginTop: 2,
  },
  warningText: {
    color: theme.colors.error,
    fontFamily: 'Roboto_500Medium',
  },
});
