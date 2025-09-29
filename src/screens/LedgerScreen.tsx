import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import {
  Surface,
  Text,
  Card,
  Button,
  Divider,
  ActivityIndicator,
  ProgressBar,
  Chip,
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { DatabaseService } from '../services/database';
import { Transaction, Customer } from '../types';

interface InventoryData {
  totalTransactions: number;
  totalCustomers: number;
  totalSales: number;
  totalPurchases: number;
  netBalance: number;
  pendingTransactions: number;
  goldInventory: {
    gold999: number;
    gold995: number;
    rani: number;
    total: number;
  };
  silverInventory: {
    silver: number;
    silver98: number;
    silver96: number;
    rupu: number;
    total: number;
  };
  cashFlow: {
    totalIn: number;
    totalOut: number;
    netFlow: number;
    moneyIn: number;  // Customer debts (receivables)
    moneyOut: number; // Merchant debts (payables)
  };
}

interface InventoryCardProps {
  title: string;
  value: string;
  unit?: string;
  icon: string;
  backgroundColor: string;
  iconColor: string;
  onPress: () => void;
  isSelected?: boolean;
}

export const LedgerScreen: React.FC = () => {
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [selectedInventory, setSelectedInventory] = useState<'gold' | 'silver' | 'money'>('gold');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);

  useEffect(() => {
    loadInventoryData();
  }, [selectedPeriod]);

  useEffect(() => {
    const updateLayout = () => {
      setScreenWidth(Dimensions.get('window').width);
    };

    const subscription = Dimensions.addEventListener('change', updateLayout);
    return () => subscription?.remove();
  }, []);

  const loadInventoryData = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const [transactions, customers] = await Promise.all([
        DatabaseService.getAllTransactions(),
        DatabaseService.getAllCustomers()
      ]);

      // Filter transactions by selected period
      const filteredTrans = filterTransactionsByPeriod(transactions);

      const data = calculateInventoryData(filteredTrans, customers);
      setInventoryData(data);
      setFilteredTransactions(filteredTrans);
    } catch (error) {
      console.error('Error loading inventory data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const filterTransactionsByPeriod = (transactions: Transaction[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    switch (selectedPeriod) {
      case 'today':
        const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        return transactions.filter(t => {
          const transDate = new Date(t.date);
          return transDate >= today && transDate <= endOfDay;
        });
      case 'yesterday':
        const endOfYesterday = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1);
        return transactions.filter(t => {
          const transDate = new Date(t.date);
          return transDate >= yesterday && transDate <= endOfYesterday;
        });
      case 'custom':
        const selectedDate = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate());
        const endOfSelectedDay = new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000 - 1);
        return transactions.filter(t => {
          const transDate = new Date(t.date);
          return transDate >= selectedDate && transDate <= endOfSelectedDay;
        });
      default:
        return transactions;
    }
  };

  const calculateInventoryData = (transactions: Transaction[], customers: Customer[]): InventoryData => {
    let totalSales = 0;
    let totalPurchases = 0;
    let totalIn = 0;
    let totalOut = 0;
    let pendingTransactions = 0;
    let moneyIn = 0;  // Customer owes to merchant
    let moneyOut = 0; // Merchant owes to customer

    const goldInventory = { gold999: 0, gold995: 0, rani: 0, total: 0 };
    const silverInventory = { silver: 0, silver98: 0, silver96: 0, rupu: 0, total: 0 };

    transactions.forEach(transaction => {
      if (transaction.status === 'pending') {
        pendingTransactions++;
      }

      // Cash flow is based on actual money movement
      // Money IN: Cash received from customers
      totalIn += transaction.amountPaid;

      transaction.entries.forEach(entry => {
        if (entry.type === 'sell') {
          totalSales += entry.subtotal;
          
          // Track inventory going out
          if (entry.weight) {
            const weight = entry.pureWeight || entry.weight;
            switch (entry.itemType) {
              case 'gold999':
              case 'gold995':
              case 'rani':
                goldInventory[entry.itemType] -= weight;
                break;
              case 'silver':
              case 'silver98':
              case 'silver96':
              case 'rupu':
                silverInventory[entry.itemType] -= weight;
                break;
            }
          }
        } else if (entry.type === 'purchase') {
          totalPurchases += entry.subtotal;
          // Cash flow OUT: Only add to totalOut if we actually paid cash for the purchase
          // In bullion business, purchases create debt until settled
          
          // Track inventory coming in
          if (entry.weight) {
            const weight = entry.pureWeight || entry.weight;
            switch (entry.itemType) {
              case 'gold999':
              case 'gold995':
              case 'rani':
                goldInventory[entry.itemType] += weight;
                break;
              case 'silver':
              case 'silver98':
              case 'silver96':
              case 'rupu':
                silverInventory[entry.itemType] += weight;
                break;
            }
          }
        } else if (entry.type === 'money') {
          // Money OUT: Direct money payments to customers
          if (entry.moneyType === 'debt' || entry.moneyType === 'balance') {
            totalOut += entry.amount || 0;
          }
        }
      });
    });

    const netBalance = customers.reduce((sum, customer) => sum + customer.balance, 0);
    
    // Calculate money in/out based on customer balances
    customers.forEach(customer => {
      if (customer.balance > 0) {
        moneyIn += customer.balance; // Customer owes money
      } else {
        moneyOut += Math.abs(customer.balance); // Merchant owes money
      }
    });
    
    // Calculate inventory totals
    goldInventory.total = goldInventory.gold999 + goldInventory.gold995 + goldInventory.rani;
    silverInventory.total = silverInventory.silver + silverInventory.silver98 + silverInventory.silver96 + silverInventory.rupu;

    return {
      totalTransactions: transactions.length,
      totalCustomers: customers.length,
      totalSales,
      totalPurchases,
      netBalance,
      pendingTransactions,
      goldInventory,
      silverInventory,
      cashFlow: {
        totalIn,
        totalOut,
        netFlow: totalIn - totalOut,
        moneyIn,
        moneyOut
      }
    };
  };

  const onRefresh = () => {
    loadInventoryData(true);
  };

  const getFilteredTransactions = () => {
    return filteredTransactions.filter(transaction => {
      return transaction.entries.some(entry => {
        if (selectedInventory === 'money') {
          return entry.type === 'money';
        } else if (selectedInventory === 'gold') {
          return entry.itemType?.includes('gold') || entry.itemType === 'rani';
        } else if (selectedInventory === 'silver') {
          return entry.itemType?.includes('silver') || entry.itemType === 'rupu';
        }
        return false;
      });
    });
  };

  const formatCurrency = (amount: number) => {
    const isNegative = amount < 0;
    const formattedAmount = `₹${Math.abs(amount).toLocaleString()}`;
    return isNegative ? `-${formattedAmount}` : formattedAmount;
  };

  const formatWeight = (weight: number) => {
    return `${weight.toFixed(3)}g`;
  };

  // Navigation handlers for sub-ledgers
  const navigateToGoldLedger = () => {
    // TODO: Navigate to Gold Sub-Ledger screen
    console.log('Navigate to Gold Ledger');
  };

  const navigateToSilverLedger = () => {
    // TODO: Navigate to Silver Sub-Ledger screen
    console.log('Navigate to Silver Ledger');
  };

  const navigateToMoneyInLedger = () => {
    // TODO: Navigate to Money In (Receivables) Sub-Ledger screen
    console.log('Navigate to Money In Ledger');
  };

  const navigateToMoneyOutLedger = () => {
    // TODO: Navigate to Money Out (Payables) Sub-Ledger screen
    console.log('Navigate to Money Out Ledger');
  };

  // Transaction Row Component
  const TransactionRow: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
    const customer = inventoryData?.totalCustomers ? 
      // We need customer data, but for now use placeholder
      { name: 'Customer Name' } : { name: 'Customer Name' };

    const relevantEntries = transaction.entries.filter(entry => {
      if (selectedInventory === 'money') {
        return entry.type === 'money';
      } else if (selectedInventory === 'gold') {
        return entry.itemType?.includes('gold') || entry.itemType === 'rani';
      } else if (selectedInventory === 'silver') {
        return entry.itemType?.includes('silver') || entry.itemType === 'rupu';
      }
      return false;
    });

    const totalAmount = relevantEntries.reduce((sum, entry) => sum + (entry.subtotal || 0), 0);

    return (
      <View style={styles.transactionRow}>
        <View style={styles.transactionCell}>
          <Text variant="bodyMedium" style={styles.customerName}>
            {customer.name}
          </Text>
          <Text variant="bodySmall" style={styles.transactionDate}>
            {new Date(transaction.date).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.transactionCell}>
          <Text variant="bodyMedium" style={styles.transactionAmount}>
            {formatCurrency(totalAmount)}
          </Text>
        </View>
        <View style={styles.transactionCell}>
          <Text variant="bodySmall" style={styles.transactionType}>
            {transaction.status === 'completed' ? '✓' : transaction.status === 'pending' ? '⏳' : '✗'}
          </Text>
        </View>
      </View>
    );
  };

  // Enhanced Inventory Card Component
  const InventoryCard: React.FC<InventoryCardProps> = ({ 
    title, 
    value, 
    unit, 
    icon, 
    backgroundColor, 
    iconColor, 
    onPress,
    isSelected = false
  }) => (
    <TouchableOpacity 
      style={[
        styles.inventoryCard, 
        { backgroundColor },
        isSelected && styles.inventoryCardSelected
      ]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardIconContainer}>
        <MaterialCommunityIcons 
          name={icon as any} 
          size={32} 
          color={iconColor} 
        />
      </View>
      <View style={styles.cardContent}>
        <Text variant="titleLarge" style={[styles.inventoryCardTitle, { color: iconColor }]}>
          {title}
        </Text>
        <Text variant="headlineMedium" style={[styles.cardValue, { color: iconColor }]}>
          {value}
        </Text>
        {unit && (
          <Text variant="bodyLarge" style={[styles.cardUnit, { color: iconColor }]}>
            {unit}
          </Text>
        )}
      </View>
      {isSelected && <View style={[styles.selectionIndicator, { borderColor: iconColor }]} />}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>
            Ledger
          </Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="bodyLarge" style={styles.loadingText}>
            Calculating inventory...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!inventoryData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>
            Ledger
          </Text>
        </View>
        <View style={styles.errorContainer}>
          <Text variant="titleLarge" style={styles.errorTitle}>
            Error loading data
          </Text>
          <Button mode="outlined" onPress={() => loadInventoryData()}>
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>
          Ledger
        </Text>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {/* Period Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          <Chip
            mode={selectedPeriod === 'today' ? 'flat' : 'outlined'}
            selected={selectedPeriod === 'today'}
            onPress={() => setSelectedPeriod('today')}
            style={styles.filterChip}
          >
            Today
          </Chip>
          <Chip
            mode={selectedPeriod === 'yesterday' ? 'flat' : 'outlined'}
            selected={selectedPeriod === 'yesterday'}
            onPress={() => setSelectedPeriod('yesterday')}
            style={styles.filterChip}
          >
            Yesterday
          </Chip>
          <Chip
            mode={selectedPeriod === 'custom' ? 'flat' : 'outlined'}
            selected={selectedPeriod === 'custom'}
            onPress={() => {
              // TODO: Show date picker
              setSelectedPeriod('custom');
            }}
            style={styles.filterChip}
          >
            Select Date
          </Chip>
        </ScrollView>

        {/* Inventory Dashboard - Horizontal ScrollView */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.inventoryScrollContainer}
          contentContainerStyle={styles.inventoryScrollContent}
        >
          {/* Gold Inventory Card */}
          <InventoryCard
            title="Gold"
            value={formatWeight(inventoryData.goldInventory.total)}
            unit="g"
            icon="gold"
            backgroundColor="#FFF8E1"
            iconColor="#E65100"
            onPress={() => setSelectedInventory('gold')}
            isSelected={selectedInventory === 'gold'}
          />
          
          {/* Silver Inventory Card */}
          <InventoryCard
            title="Silver"
            value={formatWeight(inventoryData.silverInventory.total)}
            unit="g"
            icon="circle-outline"
            backgroundColor="#ECEFF1"
            iconColor="#455A64"
            onPress={() => setSelectedInventory('silver')}
            isSelected={selectedInventory === 'silver'}
          />
          
          {/* Money Inventory Card */}
          <InventoryCard
            title="Money"
            value={formatCurrency(inventoryData.cashFlow.moneyIn)}
            icon="cash"
            backgroundColor="#E8F5E8"
            iconColor="#2E7D32"
            onPress={() => setSelectedInventory('money')}
            isSelected={selectedInventory === 'money'}
          />
        </ScrollView>

        {/* Transaction Table */}
        <View style={styles.transactionTable}>
          {/* Table Header */}
          <View style={styles.transactionHeader}>
            <Text variant="bodyMedium" style={styles.transactionHeaderText}>
              Customer
            </Text>
            <Text variant="bodyMedium" style={styles.transactionHeaderText}>
              Amount
            </Text>
            <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'center' }]}>
              Status
            </Text>
          </View>
          
          {/* Transaction Rows */}
          {getFilteredTransactions().length > 0 ? (
            getFilteredTransactions().map((transaction, index) => (
              <TransactionRow key={transaction.id || index} transaction={transaction} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text variant="bodyMedium" style={styles.emptyStateText}>
                No transactions found for {selectedInventory} in the selected period.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
  filterContainer: {
    marginVertical: theme.spacing.md,
  },
  filterChip: {
    marginRight: theme.spacing.sm,
  },
  inventoryScrollContainer: {
    marginVertical: theme.spacing.md,
  },
  inventoryScrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: 8,
  },
  inventoryCardSelected: {
    elevation: theme.elevation.level4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderRadius: 12,
  },
  inventorySelector: {
    marginVertical: theme.spacing.md,
  },
  inventoryChip: {
    marginRight: theme.spacing.sm,
  },
  transactionTable: {
    marginTop: theme.spacing.md,
  },
  transactionHeader: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceVariant,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  transactionHeaderText: {
    flex: 1,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
  },
  transactionRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
  },
  transactionCell: {
    flex: 1,
    justifyContent: 'center',
  },
  customerName: {
    fontWeight: '500',
    color: theme.colors.onSurface,
  },
  transactionDate: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  transactionAmount: {
    fontWeight: '500',
    color: theme.colors.onSurface,
  },
  transactionType: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
  },
  emptyState: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  emptyStateText: {
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
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
    paddingHorizontal: theme.spacing.lg,
  },
  errorTitle: {
    color: theme.colors.onBackground,
    marginBottom: theme.spacing.md,
  },
  summaryCard: {
    marginBottom: theme.spacing.md,
    elevation: theme.elevation.level1,
  },
  card: {
    marginBottom: theme.spacing.md,
    elevation: theme.elevation.level1,
  },
  cardTitle: {
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryNumber: {
    fontWeight: 'bold',
  },
  summaryLabel: {
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xs,
  },
  cashFlowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cashFlowItem: {
    flex: 1,
    alignItems: 'center',
  },
  cashAmount: {
    fontWeight: 'bold',
  },
  cashLabel: {
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xs,
  },
  salesPurchaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  salesPurchaseItem: {
    alignItems: 'center',
  },
  amount: {
    fontWeight: 'bold',
  },
  salesPurchaseLabel: {
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xs,
  },
  balanceContainer: {
    alignItems: 'center',
  },
  balanceAmount: {
    fontWeight: 'bold',
  },
  balanceLabel: {
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  inventoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  inventoryItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  inventoryWeight: {
    color: theme.colors.onSurface,
    fontWeight: 'bold',
  },
  inventoryLabel: {
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xs,
  },

  // Part 4 Enhanced Styles - Inventory Dashboard
  dateContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 8,
    marginBottom: theme.spacing.md,
  },
  dateText: {
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    fontWeight: '500',
  },
  dashboardGrid: {
    marginBottom: theme.spacing.lg,
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 8,
  },
  singleColumn: {
    flexDirection: 'column',
  },
  doubleColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  inventoryCard: {
    height: 120,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: 8,
    elevation: theme.elevation.level2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flex: 1,
    marginHorizontal: 4,
    minWidth: 150,
  },
  cardIconContainer: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: theme.spacing.md,
  },
  inventoryCardTitle: {
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
  },
  cardValue: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cardUnit: {
    marginTop: theme.spacing.xs / 2,
    opacity: 0.8,
  },
});