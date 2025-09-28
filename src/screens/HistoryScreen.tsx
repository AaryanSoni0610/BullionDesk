import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  FlatList, 
  Animated, 
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform
} from 'react-native';
import {
  Surface,
  Text,
  Searchbar,
  Card,
  Chip,
  List,
  Divider,
  Button,
  ActivityIndicator,
  IconButton,
  Menu,
  Appbar
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { DatabaseService } from '../services/database';
import { Transaction } from '../types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const HistoryScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('month');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  
  // Animation refs
  const searchHeight = useRef(new Animated.Value(0)).current;
  const searchDebounceTimer = useRef<NodeJS.Timeout | null>(null);

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

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    
    // Clear existing timer
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }
    
    // Set new timer for debounced search
    searchDebounceTimer.current = setTimeout(() => {
      performSearch(query);
    }, 300);
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

  // Search bar animation functions
  const toggleSearchExpanded = () => {
    const toValue = isSearchExpanded ? 0 : 72;
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsSearchExpanded(!isSearchExpanded);
    
    Animated.timing(searchHeight, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const clearSearch = () => {
    setSearchQuery('');
    performSearch('');
    if (isSearchExpanded) {
      toggleSearchExpanded();
    }
  };

  const toggleCardExpansion = (transactionId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(transactionId)) {
      newExpanded.delete(transactionId);
    } else {
      newExpanded.add(transactionId);
    }
    setExpandedCards(newExpanded);
  };

  const addToRecentSearches = (query: string) => {
    if (query.trim() && !recentSearches.includes(query)) {
      const newSearches = [query, ...recentSearches.slice(0, 4)];
      setRecentSearches(newSearches);
      // In a real app, save to AsyncStorage here
    }
  };

  const selectRecentSearch = (query: string) => {
    setSearchQuery(query);
    performSearch(query);
    if (isSearchExpanded) {
      toggleSearchExpanded();
    }
  };

  // Additional utility functions
  const getTransactionType = (transaction: Transaction) => {
    const hasGold = transaction.entries.some(e => e.itemType.includes('gold') || e.itemType === 'rani');
    const hasSilver = transaction.entries.some(e => e.itemType.includes('silver') || e.itemType === 'rupu');
    const isOnlyMoney = transaction.entries.every(e => e.type === 'money');
    
    if (isOnlyMoney) {
      return { label: 'Money Transfer', color: theme.colors.secondary };
    } else if (hasGold && hasSilver) {
      return { label: 'Mixed Transaction', color: theme.colors.tertiary || theme.colors.secondary };
    } else if (transaction.total > 0) {
      return { label: 'Sale', color: theme.colors.success };
    } else {
      return { label: 'Purchase', color: theme.colors.primary };
    }
  };

  const getItemsSummary = (transaction: Transaction) => {
    const items = transaction.entries
      .filter(e => e.type !== 'money')
      .map(e => getItemDisplayName(e))
      .slice(0, 2);
    
    const remaining = Math.max(0, transaction.entries.filter(e => e.type !== 'money').length - 2);
    
    if (items.length === 0) return 'Money transaction';
    if (remaining > 0) items.push(`+${remaining} more`);
    
    return items.join(', ');
  };

  const getSettlementStatus = (transaction: Transaction) => {
    if (transaction.status === 'completed' && transaction.amountPaid >= Math.abs(transaction.total)) {
      return { label: 'Settled', color: theme.colors.success };
    } else if (transaction.amountPaid > 0) {
      return { label: 'Partial', color: theme.colors.primary };
    } else {
      return { label: 'Pending', color: theme.colors.warning };
    }
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

  const formatAmount = (transaction: Transaction) => {
    const amount = transaction.total;
    const isPositive = amount > 0;
    const sign = isPositive ? '+' : '-';
    return `${sign}₹${Math.abs(amount).toLocaleString()}`;
  };

  const getAmountColor = (transaction: Transaction) => {
    return transaction.total > 0 ? theme.colors.sellColor : theme.colors.purchaseColor;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Enhanced Transaction Card Component
  const TransactionCard: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
    const isExpanded = expandedCards.has(transaction.id);
    const transactionType = getTransactionType(transaction);
    const itemsSummary = getItemsSummary(transaction);
    const settlementStatus = getSettlementStatus(transaction);
    
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
                {formatDate(transaction.date)}
              </Text>
            </View>
            <Text 
              variant="titleMedium" 
              style={[styles.amount, { color: getAmountColor(transaction) }]}
            >
              {formatAmount(transaction)}
            </Text>
          </View>
          
          {/* Details Row */}
          <View style={styles.cardDetails}>
            <View style={styles.transactionTypeContainer}>
              <View style={[styles.typeIndicator, { backgroundColor: transactionType.color }]} />
              <Text variant="bodyMedium" style={styles.transactionTypeText}>
                {transactionType.label}
              </Text>
            </View>
            <Text variant="bodySmall" style={styles.itemsSummary}>
              {itemsSummary}
            </Text>
            <Chip 
              mode="flat"
              style={[styles.statusChip, { backgroundColor: `${settlementStatus.color}20` }]}
              textStyle={[styles.statusChipText, { color: settlementStatus.color }]}
              compact
            >
              {settlementStatus.label}
            </Chip>
          </View>

          {/* Expandable Section */}
          {isExpanded && (
            <View style={styles.expandedContent}>
              <Divider style={styles.expandedDivider} />
              <Text variant="labelMedium" style={styles.expandedSectionTitle}>
                Transaction Details
              </Text>
              {transaction.entries.map((entry, index) => (
                <View key={index} style={styles.entryRow}>
                  <Text variant="bodySmall" style={styles.entryType}>
                    {entry.type === 'sell' ? '↗️' : '↙️'} {getItemDisplayName(entry)}
                  </Text>
                  <Text variant="bodySmall" style={styles.entryDetails}>
                    {entry.weight && `${entry.weight}g`}
                    {entry.amount && ` - ₹${entry.amount.toLocaleString()}`}
                  </Text>
                </View>
              ))}
              {transaction.amountPaid > 0 && (
                <View style={styles.paymentRow}>
                  <Text variant="bodySmall" style={styles.paymentLabel}>
                    Amount Paid: ₹{transaction.amountPaid.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {/* Expand/Collapse Button */}
          <TouchableOpacity 
            style={styles.expandButton}
            onPress={() => toggleCardExpansion(transaction.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon 
              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
              size={24} 
              color={theme.colors.onSurfaceVariant} 
            />
          </TouchableOpacity>
        </Card.Content>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>
            History
          </Text>
        </View>
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
      <Surface style={styles.header} elevation={1}>
        <View style={styles.headerContent}>
          <Text variant="headlineMedium" style={styles.title}>
            History
          </Text>
          <IconButton 
            icon="magnify"
            size={24}
            onPress={toggleSearchExpanded}
            style={styles.searchToggle}
            iconColor={isSearchExpanded ? theme.colors.primary : theme.colors.onSurfaceVariant}
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          <Chip
            mode={selectedFilter === 'today' ? 'flat' : 'outlined'}
            selected={selectedFilter === 'today'}
            onPress={() => handleFilterChange('today')}
            style={styles.filterChip}
          >
            Today
          </Chip>
          <Chip
            mode={selectedFilter === 'week' ? 'flat' : 'outlined'}
            selected={selectedFilter === 'week'}
            onPress={() => handleFilterChange('week')}
            style={styles.filterChip}
          >
            This Week
          </Chip>
          <Chip
            mode={selectedFilter === 'month' ? 'flat' : 'outlined'}
            selected={selectedFilter === 'month'}
            onPress={() => handleFilterChange('month')}
            style={styles.filterChip}
          >
            This Month
          </Chip>
          <Chip
            mode={selectedFilter === 'all' ? 'flat' : 'outlined'}
            selected={selectedFilter === 'all'}
            onPress={() => handleFilterChange('all')}
            style={styles.filterChip}
          >
            All Time
          </Chip>
        </ScrollView>

        {/* Search Bar */}
        <Animated.View style={[styles.searchContainer, { height: searchHeight }]}>
          <Searchbar
            placeholder="Search by customer name..."
            onChangeText={handleSearchChange}
            value={searchQuery}
            style={styles.searchBar}
            onClearIconPress={clearSearch}
            icon={() => <Icon name="magnify" size={24} color={theme.colors.onSurfaceVariant} />}
            clearIcon={() => searchQuery ? <Icon name="close" size={24} color={theme.colors.onSurfaceVariant} /> : null}
          />
          
          {/* Recent Searches */}
          {isSearchExpanded && recentSearches.length > 0 && !searchQuery && (
            <ScrollView horizontal style={styles.recentSearches} showsHorizontalScrollIndicator={false}>
              {recentSearches.map((search, index) => (
                <Chip
                  key={index}
                  onPress={() => selectRecentSearch(search)}
                  style={styles.recentSearchChip}
                  mode="outlined"
                  compact
                >
                  {search}
                </Chip>
              ))}
            </ScrollView>
          )}
        </Animated.View>

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
              <Icon name="magnify" size={48} color={theme.colors.onSurfaceVariant} />
              <Text variant="titleLarge" style={styles.emptyTitle}>
                {searchQuery.trim() || selectedFilter !== 'all' ? 'No transactions found' : 'No transactions yet'}
              </Text>
              <Text variant="bodyMedium" style={styles.emptyMessage}>
                {searchQuery.trim() || selectedFilter !== 'all'
                  ? 'Try adjusting your search or date filters'
                  : 'Start by creating your first transaction from the Home tab'
                }
              </Text>
              {(searchQuery.trim() || selectedFilter !== 'all') && (
                <Button 
                  mode="outlined" 
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedFilter('all');
                    performSearch('');
                  }}
                  style={styles.clearFiltersButton}
                >
                  Clear Filters
                </Button>
              )}
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
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    elevation: theme.elevation.level1,
  },
  title: {
    color: theme.colors.onSurface,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  searchBar: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    elevation: theme.elevation.level1,
  },
  filterContainer: {
    marginBottom: theme.spacing.md,
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
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: {
    color: theme.colors.onBackground,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptyMessage: {
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  transactionsList: {
    paddingBottom: theme.spacing.xxl,
  },
  transactionCard: {
    marginBottom: theme.spacing.sm,
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
  customerName: {
    color: theme.colors.onSurface,
    fontWeight: '500',
  },
  transactionDate: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  amount: {
    fontWeight: 'bold',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  searchToggle: {
    margin: 0,
  },
  searchContainer: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.md,
    overflow: 'hidden',
  },
  recentSearches: {
    marginTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  recentSearchChip: {
    marginRight: theme.spacing.sm,
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
    fontStyle: 'italic',
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
    marginBottom: theme.spacing.sm,
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
    fontWeight: '500',
  },
  itemsSummary: {
    color: theme.colors.onSurfaceVariant,
    marginLeft: theme.spacing.md,
  },
  statusChip: {
    alignSelf: 'flex-start',
    height: 24,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '500',
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
    fontWeight: '600',
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
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline + '20',
    marginTop: theme.spacing.xs,
  },
  expandButton: {
    position: 'absolute',
    top: theme.spacing.xs,
    right: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  
  // Payment and Additional Styles
  paymentLabel: {
    color: theme.colors.onSurfaceVariant,
    fontWeight: '500',
  },
  paymentValue: {
    color: theme.colors.onSurface,
    fontWeight: '600',
  },
  totalAmount: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  remainingAmount: {
    color: theme.colors.error,
    fontWeight: '600',
  },
  balanceAmount: {
    color: theme.colors.onSurfaceVariant,
  },
});