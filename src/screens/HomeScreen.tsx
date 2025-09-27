import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ScrollView } from 'react-native';
import { Surface, Text, List } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { DatabaseService } from '../services/database';
import { Transaction } from '../types';

export const HomeScreen: React.FC = () => {
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRecentTransactions();
  }, []);

  const loadRecentTransactions = async () => {
    try {
      setIsLoading(true);
      const allTransactions = await DatabaseService.getAllTransactions();
      
      // Sort by date (most recent first) and take the first 20
      const sortedTransactions = allTransactions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20);
      
      setRecentTransactions(sortedTransactions);
    } catch (error) {
      console.error('Error loading recent transactions:', error);
      setRecentTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmount = (transaction: Transaction) => {
    const amount = transaction.total;
    const isPositive = amount > 0;
    const sign = isPositive ? '+' : '-';
    return `${sign}₹${Math.abs(amount).toLocaleString()}`;
  };

  const getAmountColor = (transaction: Transaction) => {
    return transaction.total > 0 ? theme.colors.sellColor : theme.colors.purchaseColor;
  };

  const formatTransactionDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getItemDisplayName = (entry: any): string => {
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999',
      'gold995': 'Gold 995',
      'rani': 'Rani',
      'silver': 'Silver',
      'silver98': 'Silver 98',
      'silver96': 'Silver 96',
      'rupu': 'Rupu',
      'money': 'Money',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* App Title Bar */}
      <Surface style={styles.appTitleBar} elevation={2}>
        <View style={styles.appTitleContent}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.appIcon}
          />
          <Text variant="titleLarge" style={styles.appTitle}>
            BullionDesk
          </Text>
        </View>
      </Surface>

      {/* Content Area */}
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          /* Loading State */
          <View style={styles.emptyState}>
            <Text variant="bodyLarge" style={styles.emptyDescription}>
              Loading transactions...
            </Text>
          </View>
        ) : recentTransactions.length === 0 ? (
          /* Empty State */
          <View style={styles.emptyState}>
            <Text variant="headlineMedium" style={styles.emptyTitle}>
              Welcome to BullionDesk
            </Text>
            <Text variant="bodyLarge" style={styles.emptyDescription}>
              Tap the + button to start your first transaction
            </Text>
          </View>
        ) : (
          /* Transaction List */
          <Surface style={styles.transactionList} elevation={1}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Recent Transactions ({recentTransactions.length})
            </Text>
            {recentTransactions.map((transaction) => (
              <Surface key={transaction.id} style={styles.transactionCard} elevation={1}>
                <View style={styles.transactionHeader}>
                  <View style={styles.customerInfo}>
                    <Text variant="titleSmall" style={styles.customerName}>
                      {transaction.customerName}
                    </Text>
                    <Text variant="bodySmall" style={styles.transactionDate}>
                      {formatTransactionDate(transaction.date)}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.transactionDetails}>
                  {/* Items Summary */}
                  <View style={styles.itemsSection}>
                    {transaction.entries.map((entry, index) => (
                      <Text key={index} variant="bodySmall" style={styles.itemText}>
                        {entry.type === 'sell' ? '-' : '-'} {entry.type === 'sell' ? 'Sell' : 'Purchase'}: {getItemDisplayName(entry)} {entry.weight}g
                      </Text>
                    ))}
                  </View>
                  
                  {/* Payment Summary */}
                  <View style={styles.paymentSection}>
                    <View style={styles.paymentRow}>
                      <Text variant="bodySmall" style={styles.paymentLabel}>
                        Total: {transaction.total >= 0 ? '+' : '-'}₹{Math.abs(transaction.total).toLocaleString()}
                      </Text>
                      <Text variant="bodySmall" style={styles.paymentLabel}>
                        {transaction.total >= 0 ? 'Took' : 'Gave'}: ₹{transaction.amountPaid.toLocaleString()}
                      </Text>
                    </View>
                    
                    <View style={styles.settlementRow}>
                      <Text 
                        variant="labelMedium" 
                        style={[
                          styles.settlementStatus,
                          { 
                            color: transaction.settlementType === 'full' 
                              ? theme.colors.success 
                              : transaction.settlementType === 'partial'
                                ? theme.colors.warning
                                : theme.colors.error
                          }
                        ]}
                      >
                        {transaction.settlementType === 'full' ? '✓ Settled' : 
                         transaction.settlementType === 'partial' ? '⚠ Partial' : '⏳ Pending'}
                      </Text>
                      
                      {transaction.amountPaid !== transaction.total && (
                        <Text variant="bodySmall" style={styles.balanceText}>
                          {(() => {
                            const remaining = transaction.total - transaction.amountPaid;
                            if (transaction.total >= 0) {
                              // Customer owed money for this transaction
                              return remaining > 0 
                                ? `Debt: ₹${remaining.toLocaleString()}` 
                                : `Overpaid: ₹${Math.abs(remaining).toLocaleString()}`;
                            } else {
                              // Customer was owed money for this transaction
                              return remaining < 0 
                                ? `Balance: ₹${Math.abs(remaining).toLocaleString()}` 
                                : `Underpaid: ₹${remaining.toLocaleString()}`;
                            }
                          })()
                          }
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </Surface>
            ))}
          </Surface>
        )}
      </ScrollView>
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
    paddingVertical: theme.spacing.md,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  appIcon: {
    width: 24,
    height: 24,
    marginRight: theme.spacing.sm,
  },
  appTitle: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  appBar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md,
  },
  appBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    minHeight: 400, // Ensure minimum height for proper centering
  },
  emptyTitle: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    color: theme.colors.onSurface,
  },
  emptyDescription: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
  },
  transactionList: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: theme.spacing.sm,
  },
  sectionTitle: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.onSurface,
  },
  transactionItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  amountText: {
    fontWeight: 'bold',
    alignSelf: 'center',
  },
  transactionCard: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: 12,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  transactionDate: {
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xs / 2,
  },
  transactionId: {
    color: theme.colors.outline,
    fontSize: 10,
  },
  transactionDetails: {
    gap: theme.spacing.sm,
  },
  itemsSection: {
    gap: theme.spacing.xs / 2,
  },
  itemText: {
    color: theme.colors.onSurfaceVariant,
    lineHeight: 16,
  },
  paymentSection: {
    gap: theme.spacing.xs,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLabel: {
    color: theme.colors.onSurface,
    fontWeight: '500',
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settlementStatus: {
    fontWeight: 'bold',
  },
  balanceText: {
    color: theme.colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
});
