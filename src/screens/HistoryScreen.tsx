import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  FlatList, 
  TouchableOpacity
} from 'react-native';
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
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { formatTransactionAmount, formatFullDate } from '../utils/formatting';
import { DatabaseService } from '../services/database';
import { Transaction } from '../types';
import { useAppContext } from '../context/AppContext';



export const HistoryScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('today');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { navigateToSettings } = useAppContext();
  

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async (refresh = false) => {
    try {
      if (!refresh) {
        setIsLoading(true);
      }
      setError(null);
      
      const allTransactions = await DatabaseService.getAllTransactions();
      
      // Sort by date (most recent first)
      const sortedTransactions = allTransactions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setTransactions(sortedTransactions);
      
      // Load recent searches from storage (simplified for now)
      // In a real app, you'd load this from AsyncStorage
      const savedSearches = ['Gold 999', 'Silver', 'John Doe']; // Mock data
      setRecentSearches(savedSearches.slice(0, 5));
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
      const searchTerm = query.toLowerCase();
      filtered = filtered.filter(transaction => {
        // Search in customer name
        const customerMatch = transaction.customerName.toLowerCase().includes(searchTerm);
        
        // Search in transaction entries (item types)
        const itemMatch = transaction.entries.some(entry => {
          const itemName = getItemDisplayName(entry).toLowerCase();
          return itemName.includes(searchTerm);
        });
        
        return customerMatch || itemMatch;
      });
    }

    // Apply time filter
    filtered = applyTimeFilter(filtered);
    
    setFilteredTransactions(filtered);
    setIsSearching(false);
  }, [transactions, selectedFilter]);

  const applyTimeFilter = (transactionList: Transaction[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (selectedFilter) {
      case 'today':
        const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        return transactionList.filter(transaction => {
          const transDate = new Date(transaction.date);
          return transDate >= today && transDate <= endOfDay;
        });
      case 'week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        return transactionList.filter(transaction => 
          new Date(transaction.date) >= startOfWeek
        );
      case 'month':
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return transactionList.filter(transaction => 
          new Date(transaction.date) >= startOfMonth
        );
      default:
        return transactionList;
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
      'silver98': 'Silver 98',
      'silver96': 'Silver 96',
      'rupu': 'Rupu',
      'money': 'Money',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };

  const highlightSearchText = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;
    
    // For now, return plain text. In a more advanced implementation,
    // you would return a Text component with highlighted portions
    return text;
  };

  const handleFilterChange = (filter: typeof selectedFilter) => {
    if (filter === selectedFilter) {
      // Deselect if tapping the same filter
      setSelectedFilter('all');
    } else {
      setSelectedFilter(filter);
    }
  };

  // Effects
  useEffect(() => {
    loadTransactions();
  }, []);

  useEffect(() => {
    performSearch(searchQuery);
  }, [performSearch, searchQuery]);

  useEffect(() => {
    if (transactions.length > 0) {
      performSearch(searchQuery);
    }
  }, [selectedFilter, transactions.length]);

  const getAmountColor = (transaction: Transaction) => {
    // Blue for Given (purchase), Green for Received (sell)
    const isReceived = transaction.total > 0;
    return isReceived ? theme.colors.sellColor : theme.colors.primary;
  };

  // Enhanced Transaction Card Component
  const TransactionCard: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
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
      <Card style={styles.transactionCard} mode="outlined">
        <Card.Content>
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
              <View key={index} style={styles.entryRow}>
                <Text variant="bodySmall" style={styles.entryType}>
                  {entry.type === 'sell' ? '↗️' : '↙️'} {getItemDisplayName(entry)}
                </Text>
                <Text variant="bodySmall" style={styles.entryDetails}>
                  {entry.weight && `${entry.weight}g`}
                </Text>
              </View>
            ))}
            {/* Balance/Debt Row - Always show for transactions */}
            <View style={styles.paymentRow}>
              <Text variant="bodySmall" style={[styles.transactionBalance, 
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
    );
  }

  return (
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
              mode={selectedFilter === 'week' ? 'flat' : 'outlined'}
              selected={selectedFilter === 'week'}
              onPress={() => handleFilterChange('week')}
              style={styles.filterChip}
              compact
            >
              This Week
            </Chip>
            <Chip
              mode={selectedFilter === 'month' ? 'flat' : 'outlined'}
              selected={selectedFilter === 'month'}
              onPress={() => handleFilterChange('month')}
              style={styles.filterChip}
              compact
            >
              This Month
            </Chip>
            <Chip
              mode={selectedFilter === 'all' ? 'flat' : 'outlined'}
              selected={selectedFilter === 'all'}
              onPress={() => handleFilterChange('all')}
              style={styles.filterChip}
              compact
            >
              All Time
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
                  setSelectedFilter('all');
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
                  {searchQuery.trim() && ` for "${searchQuery}"`}
                </Text>
              ) : null
            }
          />
        )}
      </View>
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
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    elevation: 0,
    backgroundColor: theme.colors.surfaceVariant,
  },
  filterContainer: {
    marginVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  filterContent: {
    paddingRight: theme.spacing.md,
  },
  filterChip: {
    marginRight: theme.spacing.sm,
    height: 32,
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
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: 12,
    elevation: theme.elevation.level1,
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
});