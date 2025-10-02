import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions, Platform } from 'react-native';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../theme';
import { formatWeight, formatCurrency } from '../utils/formatting';
import { DatabaseService } from '../services/database';
import { Transaction, Customer, LedgerEntry } from '../types';
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
  const [filteredLedgerEntries, setFilteredLedgerEntries] = useState<LedgerEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [selectedInventory, setSelectedInventory] = useState<'gold' | 'silver' | 'money'>('gold');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const { navigateToSettings } = useAppContext();

  // Format date for display in DD/MM/YYYY format
  const formatDateDisplay = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Handle date picker change
  const handleDateChange = (event: any, selectedDate?: Date) => {
    const isConfirmed = event.type === 'set';
    setShowDatePicker(Platform.OS === 'ios' && isConfirmed); // Keep open on iOS only if confirmed
    
    if (isConfirmed && selectedDate) {
      setCustomDate(selectedDate);
      setSelectedPeriod('custom');
    } else if (event.type === 'dismissed') {
      // User cancelled, don't change anything
      setShowDatePicker(false);
    }
  };

  // Handle Select Date button press
  const handleSelectDatePress = () => {
    setShowDatePicker(true);
    // Don't set selectedPeriod to 'custom' until date is actually selected
  };

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

      const [transactions, customers, allLedgerEntries] = await Promise.all([
        DatabaseService.getAllTransactions(),
        DatabaseService.getAllCustomers(),
        DatabaseService.getAllLedgerEntries()
      ]);

      // Filter transactions by selected period
      const filteredTrans = filterTransactionsByPeriod(transactions);
      
      // Filter ledger entries by selected period
      const filteredLedger = filterLedgerEntriesByPeriod(allLedgerEntries);

      const data = await calculateInventoryData(filteredTrans, customers);
      setInventoryData(data);
      setFilteredTransactions(filteredTrans);
      setFilteredLedgerEntries(filteredLedger);
      setCustomers(customers);
      
      console.log('📊 Loaded ledger data:', {
        totalTransactions: transactions.length,
        filteredTransactions: filteredTrans.length,
        totalLedgerEntries: allLedgerEntries.length,
        filteredLedgerEntries: filteredLedger.length,
        selectedPeriod,
      });
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

  const filterLedgerEntriesByPeriod = (entries: LedgerEntry[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    switch (selectedPeriod) {
      case 'today':
        const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        return entries.filter(e => {
          const entryDate = new Date(e.date);
          return entryDate >= today && entryDate <= endOfDay;
        });
      case 'yesterday':
        const endOfYesterday = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1);
        return entries.filter(e => {
          const entryDate = new Date(e.date);
          return entryDate >= yesterday && entryDate <= endOfYesterday;
        });
      case 'custom':
        const selectedDate = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate());
        const endOfSelectedDay = new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000 - 1);
        return entries.filter(e => {
          const entryDate = new Date(e.date);
          return entryDate >= selectedDate && entryDate <= endOfSelectedDay;
        });
      default:
        return entries;
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

      // Cash flow calculation based on transaction type:
      // For SELL: amountPaid = cash received FROM customer (money IN)
      // For PURCHASE: amountPaid = cash paid TO customer (money OUT)
      // Check transaction.total to determine type: positive = SELL, negative = PURCHASE
      if (transaction.total >= 0) {
        // SELL transaction: money flows IN from customer
        totalIn += transaction.amountPaid;
      } else {
        // PURCHASE transaction: money flows OUT to customer
        totalOut += transaction.amountPaid;
      }

      transaction.entries.forEach(entry => {
        if (entry.type === 'sell') {
          totalSales += entry.subtotal;
          
          // Track inventory going out
          if (entry.weight) {
            // For rani: deduct actual rani weight from rani inventory and actual gold given from gold999
            if (entry.itemType === 'rani') {
              goldInventory.rani -= entry.weight; // Rani weight goes out
              if (entry.actualGoldGiven) {
                goldInventory.gold999 -= entry.actualGoldGiven; // Actual gold 999 given goes out
              }
            } else {
              const weight = entry.pureWeight || entry.weight;
              switch (entry.itemType) {
                case 'gold999':
                case 'gold995':
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
          }
        } else if (entry.type === 'purchase') {
          totalPurchases += entry.subtotal;
          
          // Track inventory coming in
          if (entry.weight) {
            // For rupu with silver return: add rupu, subtract silver return
            if (entry.itemType === 'rupu' && entry.rupuReturnType === 'silver') {
              silverInventory.rupu += entry.weight; // Rupu weight comes in
              if (entry.silver98Weight) {
                silverInventory.silver98 -= entry.silver98Weight; // Silver 98 return goes out
              }
              if (entry.silverWeight) {
                silverInventory.silver -= entry.silverWeight; // Silver return goes out
              }
            } else {
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
    
    // Calculate inventory totals (excluding rani from gold and rupu from silver)
    goldInventory.total = goldInventory.gold999 + goldInventory.gold995;
    silverInventory.total = silverInventory.silver + silverInventory.silver98 + silverInventory.silver96;

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
    
    if (selectedInventory === 'money') {
      // For money subledger: use ledger entries (one row per payment/update)
      filteredLedgerEntries.forEach(ledgerEntry => {
        // Only include if there's actual money movement
        if (ledgerEntry.amountReceived > 0 || ledgerEntry.amountGiven > 0) {
          entries.push({
            transactionId: ledgerEntry.transactionId,
            customerName: ledgerEntry.customerName,
            entry: {
              ...ledgerEntry.entries[0], // Use first entry as placeholder
              _ledgerEntry: ledgerEntry, // Store full ledger entry for money display
            }
          });
        }
      });
      
      console.log('💰 Money subledger entries:', {
        filteredLedgerEntries: filteredLedgerEntries.length,
        displayedEntries: entries.length,
        entries: entries.map(e => ({
          customer: e.customerName,
          received: e.entry._ledgerEntry?.amountReceived || 0,
          given: e.entry._ledgerEntry?.amountGiven || 0,
        }))
      });
    } else {
      // For gold/silver subledgers - use transactions
      const processedTransactions = new Set<string>();
      
      filteredTransactions.forEach(transaction => {
        const customer = customers.find(c => c.id === transaction.customerId);
        const customerName = customer?.name || 'Unknown Customer';
        transaction.entries.forEach(entry => {
          let includeEntry = false;
          
          if (selectedInventory === 'gold') {
            includeEntry = entry.itemType.startsWith('gold') || entry.itemType === 'rani';
            
            // Add rani return (actualGoldGiven) as a separate sell entry
            if (entry.itemType === 'rani' && entry.type === 'purchase' && entry.actualGoldGiven) {
              entries.push({
                transactionId: transaction.id,
                customerName,
                entry: {
                  ...entry,
                  type: 'sell',
                  itemType: 'gold999',
                  weight: entry.actualGoldGiven,
                  subtotal: 0 // Not shown in subledger
                }
              });
            }
          }
          else if (selectedInventory === 'silver') {
            includeEntry = entry.itemType.startsWith('silver') || entry.itemType === 'rupu';
            
            // Add rupu silver returns (silver98 + silver) as separate sell entries
            if (entry.itemType === 'rupu' && entry.type === 'purchase' && entry.rupuReturnType === 'silver') {
              if (entry.silver98Weight && entry.silver98Weight > 0) {
                entries.push({
                  transactionId: transaction.id,
                  customerName,
                  entry: {
                    ...entry,
                    type: 'sell',
                    itemType: 'silver98',
                    weight: entry.silver98Weight,
                    subtotal: 0
                  }
                });
              }
              if (entry.silverWeight && entry.silverWeight > 0) {
                entries.push({
                  transactionId: transaction.id,
                  customerName,
                  entry: {
                    ...entry,
                    type: 'sell',
                    itemType: 'silver',
                    weight: entry.silverWeight,
                    subtotal: 0
                  }
                });
              }
            }
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
    }
    
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
    const { customerName, entry, transactionId } = entryData;
    
    if (selectedInventory === 'money') {
      // For money subledger: use ledger entry data
      const ledgerEntry = entry._ledgerEntry;
      const receivedAmount = ledgerEntry?.amountReceived || 0;
      const givenAmount = ledgerEntry?.amountGiven || 0;
      
      return (
        <View style={styles.transactionRow}>
          <View style={styles.transactionCell}>
            <Text variant="bodyMedium" style={styles.customerName}>
              {customerName}
            </Text>
          </View>
          <View style={styles.transactionCell}>
            <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'center' }]}>
              {receivedAmount > 0 ? formatCurrency(receivedAmount) : '-'}
            </Text>
          </View>
          <View style={styles.transactionCell}>
            <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'right' }]}>
              {givenAmount > 0 ? formatCurrency(givenAmount) : '-'}
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

      <View style={styles.content}>
        {/* Period Filter - Fixed at top */}
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
            onPress={handleSelectDatePress}
            style={styles.filterChip}
          >
            {selectedPeriod === 'custom' ? formatDateDisplay(customDate) : 'Select Date'}
          </Chip>
        </ScrollView>

        {/* Date Picker */}
        {showDatePicker && (
          <DateTimePicker
            value={customDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Inventory Dashboard - Fixed at top */}
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
                Received
              </Text>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'right' }]}>
                Given
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

        {/* Transaction Table - Scrollable Content - Takes remaining space */}
        <ScrollView 
          style={styles.transactionTable}
          contentContainerStyle={getFilteredEntries().length === 0 ? styles.emptyStateContainer : undefined}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        >
          {/* Transaction Rows */}
          {getFilteredEntries().length > 0 ? (
            getFilteredEntries().map((entryData, index) => {
              // For money subledger, use ledger entry ID for unique key
              const uniqueKey = selectedInventory === 'money' && entryData.entry._ledgerEntry
                ? entryData.entry._ledgerEntry.id
                : `${entryData.transactionId}-${entryData.entry.id}-${index}`;
              
              return <EntryRow key={uniqueKey} entryData={entryData} />;
            })
          ) : (
            <View style={styles.emptyState}>
              <Icon name="book-open-outline" size={72} color={theme.colors.onSurfaceVariant} />
              <Text variant="headlineSmall" style={styles.emptyStateText}>
                Ledger for {selectedInventory} is empty
              </Text>
              <Text variant="bodyLarge" style={styles.emptyStateSubtext}>
                No transactions found for {selectedInventory} in the selected period.
              </Text>
            </View>
          )}
        </ScrollView>
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
  filterContainer: {
    flexGrow: 0,
    flexShrink: 0,
    marginVertical: theme.spacing.md,
  },
  filterChip: {
    marginRight: theme.spacing.sm,
  },
  inventoryScrollContainer: {
    flexGrow: 0,
    flexShrink: 0,
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
    flex: 1,
    marginBottom: theme.spacing.md,
    borderRadius: 8,
  },
  transactionHeader: {
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceVariant,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
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
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
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