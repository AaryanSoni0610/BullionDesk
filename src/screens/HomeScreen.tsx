import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Image, ScrollView, RefreshControl, FlatList, BackHandler } from 'react-native';
import { Surface, Text, List, FAB, Card, Chip, Button, ActivityIndicator, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { formatTransactionAmount, formatRelativeDate } from '../utils/formatting';
import { useAppContext } from '../context/AppContext';
import { DatabaseService } from '../services/database';
import { Transaction, Customer } from '../types';

export const HomeScreen: React.FC = () => {
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Map<string, Customer>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setCustomerModalVisible, navigateToSettings } = useAppContext();

  useEffect(() => {
    loadRecentTransactions();
  }, []);

  // Handle hardware back button - minimize app on Home screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Return true to prevent default back behavior (which would exit app)
        // This effectively minimizes the app
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [])
  );

  const loadRecentTransactions = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
        setError(null);
      } else {
        setIsLoading(true);
      }
      
      // Load both transactions and customers
      const [allTransactions, allCustomers] = await Promise.all([
        DatabaseService.getAllTransactions(),
        DatabaseService.getAllCustomers()
      ]);
      
      // Sort by date (most recent first) and take the first 20
      const sortedTransactions = allTransactions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20);
      
      // Create customer lookup map
      const customerMap = new Map<string, Customer>();
      allCustomers.forEach(customer => {
        customerMap.set(customer.id, customer);
      });
      
      setRecentTransactions(sortedTransactions);
      setCustomers(customerMap);
      setError(null);
    } catch (error) {
      console.error('Error loading recent transactions:', error);
      setError('Unable to load transactions. Please try again.');
      if (!refresh) {
        setRecentTransactions([]);
        setCustomers(new Map());
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    loadRecentTransactions(true);
  }, []);

  const getAmountColor = (transaction: Transaction) => {
    // Blue for Given (purchase), Green for Received (sell)
    const isReceived = transaction.total > 0;
    return isReceived ? theme.colors.sellColor : theme.colors.primary;
  };

  const getPrimaryItems = (transaction: Transaction) => {
    const sellItems: string[] = [];
    const purchaseItems: string[] = [];
    
    transaction.entries.forEach(entry => {
      if (entry.type !== 'money') {
        const displayName = getItemDisplayName(entry);
        // Use 3 decimal places for gold items, 1 for others
        const isGoldItem = ['gold999', 'gold995', 'rani'].includes(entry.itemType);
        const decimals = isGoldItem ? 3 : 1;
        const itemText = entry.weight ? `${displayName} ${entry.weight.toFixed(decimals)}g` : displayName;
        
        if (entry.type === 'sell') {
          sellItems.push(itemText);
        } else if (entry.type === 'purchase') {
          purchaseItems.push(itemText);
        }
      }
    });
    
    const parts: string[] = [];
    if (sellItems.length > 0) {
      parts.push(`Sell: ${sellItems.slice(0, 2).join(', ')}${sellItems.length > 2 ? ` +${sellItems.length - 2} more` : ''}`);
    }
    if (purchaseItems.length > 0) {
      parts.push(`Purchase: ${purchaseItems.slice(0, 2).join(', ')}${purchaseItems.length > 2 ? ` +${purchaseItems.length - 2} more` : ''}`);
    }
    
    return parts.join('\n') || 'Money transaction';
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

  // Transaction Card Component
  const TransactionCard: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
    const primaryItems = getPrimaryItems(transaction);
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
      // For money transactions, show money balance
      const transactionRemaining = Math.abs(transaction.total) - transaction.amountPaid;
      const hasRemainingBalance = transactionRemaining > 0;
      if (hasRemainingBalance) {
        const isDebt = transaction.total > 0;
        transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${transactionRemaining.toLocaleString()}`;
        transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
      }
    }

    return (
      <Card style={styles.transactionCard} mode="contained">
        <Card.Content style={styles.cardContent}>
          {/* Row 1: Customer */}
          <View style={styles.cardRow1}>
            <View style={styles.customerInfo}>
              <Text variant="titleMedium" style={styles.customerName}>
                {transaction.customerName}
              </Text>
              <Text variant="bodyMedium" style={styles.transactionDate}>
                {formatRelativeDate(transaction.date)}
              </Text>
            </View>
          </View>

          {/* Row 2: Transaction Summary */}
          <View style={styles.cardRow2}>
            <View style={styles.transactionSummary}>
              <Text variant="bodyLarge" style={styles.transactionType}>
                {primaryItems}
              </Text>
            </View>
            {!isMetalOnly && (
              <Text 
                variant="titleMedium" 
                style={[styles.totalAmount, { color: getAmountColor(transaction) }]}
              >
                {formatTransactionAmount(transaction)}
              </Text>
            )}
          </View>

          {/* Row 3: Transaction-specific Balance Information */}
          <View style={styles.cardRow3}>
            <Text 
              variant="bodyMedium" 
              style={[styles.balanceInfo, { color: transactionBalanceColor }]}
            >
              {transactionBalanceLabel}
            </Text>
          </View>
        </Card.Content>
      </Card>
    );
  };

  // Loading Skeleton Component
  const LoadingCard: React.FC = () => (
    <Card style={styles.transactionCard} mode="contained">
      <Card.Content style={styles.cardContent}>
        <View style={styles.skeletonContainer}>
          <View style={styles.skeletonLine1} />
          <View style={styles.skeletonLine2} />
          <View style={styles.skeletonLine3} />
        </View>
      </Card.Content>
    </Card>
  );

  // Empty State Component
  const EmptyState: React.FC = () => (
    <View style={styles.emptyState}>
      <Icon name="receipt" size={72} color={theme.colors.onSurfaceVariant} />
      <Text variant="headlineSmall" style={styles.emptyTitle}>
        No Transactions Yet
      </Text>
      <Text variant="bodyLarge" style={styles.emptyDescription}>
        Start by adding your first transaction with a customer
      </Text>
      <Button 
        mode="contained" 
        style={styles.emptyButton}
        onPress={() => setCustomerModalVisible(true)}
      >
        Add Transaction
      </Button>
    </View>
  );

  // Error State Component
  const ErrorState: React.FC = () => (
    <View style={styles.emptyState}>
      <Icon name="alert-circle-outline" size={48} color={theme.colors.error} />
      <Text variant="titleLarge" style={[styles.emptyTitle, { color: theme.colors.error }]}>
        Unable to Load Transactions
      </Text>
      <Text variant="bodyMedium" style={styles.emptyDescription}>
        {error}
      </Text>
      <Button 
        mode="outlined" 
        style={styles.emptyButton}
        onPress={() => loadRecentTransactions()}
      >
        Retry
      </Button>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* App Title Bar */}
      <Surface style={styles.appTitleBar} elevation={1}>
        <View style={styles.appTitleContent}>
          <View style={styles.titleSection}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.appIcon}
            />
            <Text variant="titleLarge" style={styles.appTitle}>
              BullionDesk
            </Text>
          </View>
          <IconButton
            icon="cog-outline"
            size={24}
            onPress={navigateToSettings}
            style={styles.settingsButton}
          />
        </View>
      </Surface>

      {/* Content Area */}
      {error ? (
        <ErrorState />
      ) : isLoading ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <View style={styles.transactionsSection}>
            <View style={styles.sectionHeader}>
              <Text variant="titleLarge" style={styles.sectionTitle}>
                Recent Transactions
              </Text>
            </View>
            {[1, 2, 3, 4].map((item) => (
              <LoadingCard key={item} />
            ))}
          </View>
        </ScrollView>
      ) : recentTransactions.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          data={recentTransactions}
          renderItem={({ item }) => <TransactionCard transaction={item} />}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <Text variant="titleLarge" style={styles.sectionTitle}>
                Recent Transactions
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      
      {/* Floating Action Button */}
      <FAB
        icon="plus"
        style={[
          styles.fab
        ]}
        onPress={() => setCustomerModalVisible(true)}
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
    paddingVertical: theme.spacing.sm,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appIcon: {
    width: 24,
    height: 24,
  },
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
  },
  settingsButton: {
    margin: 0,
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
    minHeight: 400,
  },
  emptyTitle: {
    textAlign: 'center',
    fontFamily: 'Roboto_400Regular',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    color: theme.colors.onSurface,
  },
  emptyDescription: {
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
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
    fontFamily: 'Roboto_700Bold',
    alignSelf: 'center',
  },
  transactionCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    elevation: theme.elevation.level1,
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
    fontFamily: 'Roboto_700Bold',
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
    fontFamily: 'Roboto_500Medium',
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settlementStatus: {
    fontFamily: 'Roboto_700Bold',
  },
  balanceText: {
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_400Regular_Italic',
  },
  fab: {
    position: 'absolute',
    margin: theme.spacing.md,
    right: 0,
    bottom: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
  },
  
  // New styles for Part 2 implementation
  transactionsSection: {
    flex: 1,
    paddingBottom: theme.spacing.xxl,
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  
  // Transaction Card Styles
  cardContent: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  cardRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  cardRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  cardRow3: {
    marginTop: theme.spacing.xs,
  },
  transactionSummary: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  transactionType: {
    color: theme.colors.onSurface,
  },
  totalAmount: {
    fontFamily: 'Roboto_700Bold',
  },
  statusChip: {
    height: 32,
    borderRadius: 16,
  },
  statusChipText: {
    fontSize: 12,
    fontFamily: 'Roboto_500Medium',
  },
  balanceInfo: {
    fontFamily: 'Roboto_400Regular_Italic',
  },
  
  // Loading Skeleton Styles
  skeletonContainer: {
    gap: theme.spacing.sm,
  },
  skeletonLine1: {
    height: 20,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 4,
    width: '70%',
  },
  skeletonLine2: {
    height: 16,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 4,
    width: '90%',
  },
  skeletonLine3: {
    height: 14,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 4,
    width: '50%',
  },
  
  // Empty/Error State Styles
  emptyButton: {
    marginTop: theme.spacing.md,
  },
});
