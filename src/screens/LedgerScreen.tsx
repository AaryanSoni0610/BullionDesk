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
}

export const LedgerScreen: React.FC = () => {
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');
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
      const filteredTransactions = filterTransactionsByPeriod(transactions);

      const data = calculateInventoryData(filteredTransactions, customers);
      setInventoryData(data);
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
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

    switch (selectedPeriod) {
      case 'today':
        return transactions.filter(t => new Date(t.date) >= today);
      case 'week':
        return transactions.filter(t => new Date(t.date) >= weekAgo);
      case 'month':
        return transactions.filter(t => new Date(t.date) >= monthAgo);
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
          totalOut += entry.subtotal;
          
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
          if (entry.moneyType === 'balance') {
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

  // Enhanced Inventory Card Component
  const InventoryCard: React.FC<InventoryCardProps> = ({ 
    title, 
    value, 
    unit, 
    icon, 
    backgroundColor, 
    iconColor, 
    onPress 
  }) => (
    <TouchableOpacity 
      style={[styles.inventoryCard, { backgroundColor }]} 
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
        {/* Date Indicator */}
        <View style={styles.dateContainer}>
          <Text variant="bodyMedium" style={styles.dateText}>
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Text>
        </View>

        {/* Enhanced Inventory Dashboard - 2x2 Grid */}
        <View style={styles.dashboardGrid}>
          <View style={styles.gridRow}>
            <InventoryCard
              title="Gold"
              value={formatWeight(inventoryData.goldInventory.total)}
              icon="gold"
              backgroundColor="#FFF8E1"
              iconColor="#E65100"
              onPress={navigateToGoldLedger}
            />
            
            <InventoryCard
              title="Silver"
              value={formatWeight(inventoryData.silverInventory.total)}
              icon="circle-outline"
              backgroundColor="#ECEFF1"
              iconColor="#455A64"
              onPress={navigateToSilverLedger}
            />
          </View>
          
          <View style={styles.gridRow}>
            <InventoryCard
              title="Money In"
              value={formatCurrency(inventoryData.cashFlow.moneyIn)}
              icon="cash-plus"
              backgroundColor="#E8F5E8"
              iconColor="#2E7D32"
              onPress={navigateToMoneyInLedger}
            />
            
            <InventoryCard
              title="Money Out"
              value={formatCurrency(inventoryData.cashFlow.moneyOut)}
              icon="cash-minus"
              backgroundColor="#FFEBEE"
              iconColor="#C62828"
              onPress={navigateToMoneyOutLedger}
            />
          </View>
        </View>

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
            mode={selectedPeriod === 'week' ? 'flat' : 'outlined'}
            selected={selectedPeriod === 'week'}
            onPress={() => setSelectedPeriod('week')}
            style={styles.filterChip}
          >
            This Week
          </Chip>
          <Chip
            mode={selectedPeriod === 'month' ? 'flat' : 'outlined'}
            selected={selectedPeriod === 'month'}
            onPress={() => setSelectedPeriod('month')}
            style={styles.filterChip}
          >
            This Month
          </Chip>
          <Chip
            mode={selectedPeriod === 'all' ? 'flat' : 'outlined'}
            selected={selectedPeriod === 'all'}
            onPress={() => setSelectedPeriod('all')}
            style={styles.filterChip}
          >
            All Time
          </Chip>
        </ScrollView>

        {/* Summary Cards */}
        <Card style={styles.summaryCard} mode="outlined">
          <Card.Content>
            <Text variant="titleLarge" style={styles.cardTitle}>
              Business Overview
            </Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text variant="headlineMedium" style={[styles.summaryNumber, { color: theme.colors.primary }]}>
                  {inventoryData.totalTransactions}
                </Text>
                <Text variant="bodySmall" style={styles.summaryLabel}>
                  Transactions
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text variant="headlineMedium" style={[styles.summaryNumber, { color: theme.colors.primary }]}>
                  {inventoryData.totalCustomers}
                </Text>
                <Text variant="bodySmall" style={styles.summaryLabel}>
                  Customers
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Cash Flow */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleLarge" style={styles.cardTitle}>
              Cash Flow
            </Text>
            <View style={styles.cashFlowRow}>
              <View style={styles.cashFlowItem}>
                <Text variant="titleMedium" style={[styles.cashAmount, { color: theme.colors.sellColor }]}>
                  {formatCurrency(inventoryData.cashFlow.totalIn)}
                </Text>
                <Text variant="bodySmall" style={styles.cashLabel}>Cash In</Text>
              </View>
              <View style={styles.cashFlowItem}>
                <Text variant="titleMedium" style={[styles.cashAmount, { color: theme.colors.purchaseColor }]}>
                  {formatCurrency(inventoryData.cashFlow.totalOut)}
                </Text>
                <Text variant="bodySmall" style={styles.cashLabel}>Cash Out</Text>
              </View>
              <View style={styles.cashFlowItem}>
                <Text variant="titleMedium" style={[
                  styles.cashAmount, 
                  { color: inventoryData.cashFlow.netFlow >= 0 ? theme.colors.sellColor : theme.colors.purchaseColor }
                ]}>
                  {formatCurrency(inventoryData.cashFlow.netFlow)}
                </Text>
                <Text variant="bodySmall" style={styles.cashLabel}>Net Flow</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Sales vs Purchases */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleLarge" style={styles.cardTitle}>
              Sales & Purchases
            </Text>
            <View style={styles.salesPurchaseRow}>
              <View style={styles.salesPurchaseItem}>
                <Text variant="titleMedium" style={[styles.amount, { color: theme.colors.sellColor }]}>
                  {formatCurrency(inventoryData.totalSales)}
                </Text>
                <Text variant="bodySmall" style={styles.salesPurchaseLabel}>Total Sales</Text>
              </View>
              <View style={styles.salesPurchaseItem}>
                <Text variant="titleMedium" style={[styles.amount, { color: theme.colors.purchaseColor }]}>
                  {formatCurrency(inventoryData.totalPurchases)}
                </Text>
                <Text variant="bodySmall" style={styles.salesPurchaseLabel}>Total Purchases</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Customer Balance */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleLarge" style={styles.cardTitle}>
              Customer Balance
            </Text>
            <View style={styles.balanceContainer}>
              <Text variant="headlineMedium" style={[
                styles.balanceAmount,
                { color: inventoryData.netBalance >= 0 ? theme.colors.sellColor : theme.colors.purchaseColor }
              ]}>
                {formatCurrency(inventoryData.netBalance)}
              </Text>
              <Text variant="bodyMedium" style={styles.balanceLabel}>
                {inventoryData.netBalance >= 0 ? 'Net credit to customers' : 'Net debt from customers'}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Gold Inventory */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleLarge" style={styles.cardTitle}>
              Gold Inventory
            </Text>
            <View style={styles.inventoryGrid}>
              <View style={styles.inventoryItem}>
                <Text variant="titleMedium" style={styles.inventoryWeight}>
                  {formatWeight(inventoryData.goldInventory.gold999)}
                </Text>
                <Text variant="bodySmall" style={styles.inventoryLabel}>Gold 999</Text>
              </View>
              <View style={styles.inventoryItem}>
                <Text variant="titleMedium" style={styles.inventoryWeight}>
                  {formatWeight(inventoryData.goldInventory.gold995)}
                </Text>
                <Text variant="bodySmall" style={styles.inventoryLabel}>Gold 995</Text>
              </View>
              <View style={styles.inventoryItem}>
                <Text variant="titleMedium" style={styles.inventoryWeight}>
                  {formatWeight(inventoryData.goldInventory.rani)}
                </Text>
                <Text variant="bodySmall" style={styles.inventoryLabel}>Rani</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Silver Inventory */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleLarge" style={styles.cardTitle}>
              Silver Inventory
            </Text>
            <View style={styles.inventoryGrid}>
              <View style={styles.inventoryItem}>
                <Text variant="titleMedium" style={styles.inventoryWeight}>
                  {formatWeight(inventoryData.silverInventory.silver)}
                </Text>
                <Text variant="bodySmall" style={styles.inventoryLabel}>Silver</Text>
              </View>
              <View style={styles.inventoryItem}>
                <Text variant="titleMedium" style={styles.inventoryWeight}>
                  {formatWeight(inventoryData.silverInventory.silver98)}
                </Text>
                <Text variant="bodySmall" style={styles.inventoryLabel}>Silver 98</Text>
              </View>
              <View style={styles.inventoryItem}>
                <Text variant="titleMedium" style={styles.inventoryWeight}>
                  {formatWeight(inventoryData.silverInventory.silver96)}
                </Text>
                <Text variant="bodySmall" style={styles.inventoryLabel}>Silver 96</Text>
              </View>
              <View style={styles.inventoryItem}>
                <Text variant="titleMedium" style={styles.inventoryWeight}>
                  {formatWeight(inventoryData.silverInventory.rupu)}
                </Text>
                <Text variant="bodySmall" style={styles.inventoryLabel}>Rupu</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
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