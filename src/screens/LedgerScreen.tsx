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
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { formatWeight, formatCurrency } from '../utils/formatting';
import { DatabaseService } from '../services/database';
import { Transaction, Customer } from '../types';
import { useAppContext } from '../context/AppContext';

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

interface EntryData {
  transactionId: string;
  customerName: string;
  entry: any; // TransactionEntry
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [selectedInventory, setSelectedInventory] = useState<'gold' | 'silver' | 'money'>('gold');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const { navigateToSettings } = useAppContext();

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

      const data = await calculateInventoryData(filteredTrans, customers);
      setInventoryData(data);
      setFilteredTransactions(filteredTrans);
      setCustomers(customers);
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

  const calculateInventoryData = async (transactions: Transaction[], customers: Customer[]): Promise<InventoryData> => {
    let totalSales = 0;
    let totalPurchases = 0;
    let totalIn = 0;  // Cash received from customers
    let totalOut = 0; // Cash paid to customers
    let pendingTransactions = 0;

    const goldInventory = { gold999: 0, gold995: 0, rani: 0, total: 0 };
    const silverInventory = { silver: 0, silver98: 0, silver96: 0, rupu: 0, total: 0 };

    // Get base inventory
    const baseInventory = await DatabaseService.getBaseInventory();
    
    // Initialize with base values
    goldInventory.gold999 = baseInventory.gold999;
    goldInventory.gold995 = baseInventory.gold995;
    goldInventory.rani = baseInventory.rani;
    silverInventory.silver = baseInventory.silver;
    silverInventory.silver98 = baseInventory.silver98;
    silverInventory.silver96 = baseInventory.silver96;
    silverInventory.rupu = baseInventory.rupu;

    transactions.forEach(transaction => {
      if (transaction.status === 'pending') {
        pendingTransactions++;
      }

      // Cash flow: amountPaid is cash received from customers
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
          
          // Special handling for rupu purchase with silver return
          if (entry.itemType === 'rupu' && entry.rupuReturnType === 'silver') {
            if (entry.silver98Weight) {
              silverInventory.silver98 -= entry.silver98Weight;
            }
            if (entry.silverWeight) {
              silverInventory.silver -= entry.silverWeight;
            }
          }
        } else if (entry.type === 'money') {
          // Money transactions: track cash paid out to customers
          if (entry.moneyType === 'debt') {
            // Merchant owes money to customer (customer debt)
            totalOut += Math.abs(entry.subtotal);
          } else if (entry.moneyType === 'balance') {
            // Merchant gives money to customer (customer had credit)
            totalOut += Math.abs(entry.subtotal);
          }
        }
      });
    });

    const netBalance = customers.reduce((sum, customer) => sum + customer.balance, 0);
    
    // Calculate inventory totals
    goldInventory.total = goldInventory.gold999 + goldInventory.gold995 + goldInventory.rani;
    silverInventory.total = silverInventory.silver + silverInventory.silver98 + silverInventory.silver96 + silverInventory.rupu;

    // Calculate actual money inventory: base money + cash in - cash out
    const actualMoneyInventory = baseInventory.money + totalIn - totalOut;

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
        moneyIn: actualMoneyInventory,  // Actual cash holdings
        moneyOut: 0  // Not used for actual inventory
      }
    };
  };

  const onRefresh = () => {
    loadInventoryData(true);
  };

  const getFilteredEntries = (): EntryData[] => {
    const entries: EntryData[] = [];
    
    filteredTransactions.forEach(transaction => {
      const customer = customers.find(c => c.id === transaction.customerId);
      const customerName = customer?.name || 'Unknown Customer';
      
      transaction.entries.forEach(entry => {
        let includeEntry = false;
        
        if (selectedInventory === 'money') {
          includeEntry = true;
        } 
        else if (selectedInventory === 'gold') {
          includeEntry = entry.itemType.startsWith('gold');
        }
        else if (selectedInventory === 'silver') {
          includeEntry = entry.itemType.startsWith('silver');
        }

        if (includeEntry) {
          entries.push({
            transactionId: transaction.id,
            customerName,
            entry
          });
        }
      });
    });
    
    return entries;
  };

  const getItemTypeDisplay = (itemType: string) => {
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999',
      'gold995': 'Gold 995',
      'rani': 'Rani',
      'silver': 'Silver',
      'silver98': 'Silver 98',
      'silver96': 'Silver 96',
      'rupu': 'Rupu',
    };
    return typeMap[itemType] || itemType;
  };

  // Entry Row Component
  const EntryRow: React.FC<{ entryData: EntryData }> = ({ entryData }) => {
    const { customerName, entry } = entryData;
    
    if (selectedInventory === 'money') {
      // For money: Customer, Balance, Debt
      const isDebt = entry.moneyType === 'debt';
      const balanceAmount = isDebt ? Math.abs(entry.subtotal) : 0;
      const debtAmount = isDebt ? 0 : Math.abs(entry.subtotal);
      
      return (
        <View style={styles.transactionRow}>
          <View style={styles.transactionCell}>
            <Text variant="bodyMedium" style={styles.customerName}>
              {customerName}
            </Text>
          </View>
          <View style={styles.transactionCell}>
            <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'center' }]}>
              {balanceAmount > 0 ? formatCurrency(balanceAmount) : '-'}
            </Text>
          </View>
          <View style={styles.transactionCell}>
            <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'right' }]}>
              {debtAmount > 0 ? formatCurrency(debtAmount) : '-'}
            </Text>
          </View>
        </View>
      );
    } else {
      // For gold/silver: Customer, Purchase, Sell
      const isPurchase = entry.type === 'purchase';
      const weight = entry.pureWeight || entry.weight || 0;
      const purchaseWeight = isPurchase ? weight : 0;
      const sellWeight = isPurchase ? 0 : weight;
      const isSilverItem = entry.itemType?.includes('silver') || entry.itemType === 'rupu';
      
      return (
        <View style={styles.transactionRow}>
          <View style={styles.transactionCell}>
            <Text variant="bodyMedium" style={styles.customerName}>
              {customerName}
            </Text>
          </View>
          <View style={styles.transactionCell}>
            {purchaseWeight > 0 ? (
              <View>
                <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'center' }]}>
                  {formatWeight(purchaseWeight, isSilverItem)}
                </Text>
                <Text variant="bodySmall" style={[styles.itemTypeText, { textAlign: 'center' }]}>
                  {getItemTypeDisplay(entry.itemType)}
                </Text>
              </View>
            ) : (
              <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'center' }]}>-</Text>
            )}
          </View>
          <View style={styles.transactionCell}>
            {sellWeight > 0 ? (
              <View>
                <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'right' }]}>
                  {formatWeight(sellWeight, isSilverItem)}
                </Text>
                <Text variant="bodySmall" style={[styles.itemTypeText, { textAlign: 'right' }]}>
                  {getItemTypeDisplay(entry.itemType)}
                </Text>
              </View>
            ) : (
              <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'right' }]}>-</Text>
            )}
          </View>
        </View>
      );
    }
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
          size={24} 
          color={iconColor} 
        />
      </View>
      <View style={styles.cardContent}>
        <Text variant="titleMedium" style={[styles.inventoryCardTitle, { color: iconColor }]}>
          {title}
        </Text>
        <Text variant="headlineSmall" style={[styles.cardValue, { color: iconColor }]}>
          {value}
        </Text>
        {unit && (
          <Text variant="bodyMedium" style={[styles.cardUnit, { color: iconColor }]}>
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
        <Surface style={styles.appTitleBar} elevation={1}>
          <View style={styles.appTitleContent}>
            <Text variant="titleLarge" style={styles.appTitle}>
              Ledger
            </Text>
          </View>
        </Surface>
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
        <Surface style={styles.appTitleBar} elevation={1}>
          <View style={styles.appTitleContent}>
            <Text variant="titleLarge" style={styles.appTitle}>
              Ledger
            </Text>
          </View>
        </Surface>
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
      <Surface style={styles.appTitleBar} elevation={1}>
        <View style={styles.appTitleContent}>
          <Text variant="titleLarge" style={styles.appTitle}>
            Ledger
          </Text>
          <IconButton
            icon="cog-outline"
            size={24}
            onPress={navigateToSettings}
            style={styles.settingsButton}
          />
        </View>
      </Surface>

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
            icon="gold"
            backgroundColor="#FFF8E1"
            iconColor="#E65100"
            onPress={() => setSelectedInventory('gold')}
            isSelected={selectedInventory === 'gold'}
          />
          
          {/* Silver Inventory Card */}
          <InventoryCard
            title="Silver"
            value={formatWeight(inventoryData.silverInventory.total, true)}
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

        {/* Transaction Table Header - Fixed */}
        <View style={styles.transactionHeader}>
          <Text variant="bodyMedium" style={styles.transactionHeaderText}>
            Customer
          </Text>
          {selectedInventory === 'money' ? (
            <>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'center' }]}>
                Credit
              </Text>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'right' }]}>
                Debit
              </Text>
            </>
          ) : (
            <>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'center' }]}>
                Purchase
              </Text>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'right' }]}>
                Sell
              </Text>
            </>
          )}
        </View>

        {/* Transaction Table - Scrollable Content */}
        <ScrollView 
          style={styles.transactionTable}
          showsVerticalScrollIndicator={false}
        >
          {/* Transaction Rows */}
          {getFilteredEntries().length > 0 ? (
            getFilteredEntries().map((entryData, index) => (
              <EntryRow key={`${entryData.transactionId}-${entryData.entry.id}`} entryData={entryData} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Icon name="book-open-outline" size={72} color={theme.colors.onSurfaceVariant} />
              <Text variant="headlineSmall" style={styles.emptyStateText}>
                No transactions found
              </Text>
              <Text variant="bodyLarge" style={styles.emptyStateSubtext}>
                No transactions found for {selectedInventory} in the selected period.
              </Text>
            </View>
          )}
        </ScrollView>
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
    paddingHorizontal: theme.spacing.sm,
    gap: 8,
  },
  inventoryCardSelected: {
    // Remove excess shadow - keep base shadow only
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
    flexGrow: 1, // Grow to fill available space without conflicting with parent ScrollView
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: 8,
  },
  transactionHeader: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceVariant,
  },
  transactionHeaderText: {
    flex: 1,
    fontFamily: 'Roboto_700Bold',
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
    fontFamily: 'Roboto_500Medium',
    color: theme.colors.onSurface,
  },
  transactionDate: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  transactionAmount: {
    fontFamily: 'Roboto_500Medium',
    color: theme.colors.onSurface,
  },
  itemTypeText: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  transactionType: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
  },
  emptyState: {
    flex: 1,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center', // Vertically center the empty state in the scrollview
  },
  emptyStateText: {
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_400Regular',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
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
    fontFamily: 'Roboto_700Bold',
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
    fontFamily: 'Roboto_700Bold',
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
    fontFamily: 'Roboto_700Bold',
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
    fontFamily: 'Roboto_700Bold',
  },
  salesPurchaseLabel: {
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xs,
  },
  balanceContainer: {
    alignItems: 'center',
  },
  balanceAmount: {
    fontFamily: 'Roboto_700Bold',
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
    fontFamily: 'Roboto_700Bold',
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
    fontFamily: 'Roboto_500Medium',
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
    height: 100,
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
    marginHorizontal: 2,
    minWidth: 140,
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
    paddingTop: theme.spacing.sm,
  },
  inventoryCardTitle: {
    fontFamily: 'Roboto_700Bold',
    marginBottom: theme.spacing.xs,
  },
  cardValue: {
    fontFamily: 'Roboto_700Bold',
    textAlign: 'center',
  },
  cardUnit: {
    marginTop: theme.spacing.xs / 2,
    opacity: 0.8,
  },
});