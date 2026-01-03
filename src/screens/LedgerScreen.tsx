import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Platform, BackHandler } from 'react-native';
import {
  Surface,
  Text,
  Button,
  ActivityIndicator,
  Chip,
  IconButton,
  FAB
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { theme } from '../theme';
import { formatWeight, formatCurrency, formatPureGoldPrecise, formatFullTime, customFormatPureSilver, formatPureSilver } from '../utils/formatting';
import { TransactionService } from '../services/transaction.service';
import { CustomerService } from '../services/customer.service';
import { LedgerService } from '../services/ledger.service';
import { InventoryService } from '../services/inventory.service';
import { RaniRupaStockService } from '../services/raniRupaStock.service';
import { Transaction, Customer, LedgerEntry } from '../types';
import { useAppContext } from '../context/AppContext';
import { InventoryInputDialog } from '../components/InventoryInputDialog';

// Extended transaction entry with additional fields used in calculations
interface ExtendedTransactionEntry {
  id: string;
  type: 'sell' | 'purchase' | 'money';
  itemType: 'gold999' | 'gold995' | 'rani' | 'silver' | 'rupu' | 'money';
  weight?: number;
  price?: number;
  touch?: number;
  cut?: number;
  extraPerKg?: number;
  pureWeight?: number;
  moneyType?: 'give' | 'receive';
  amount?: number;
  metalOnly?: boolean;
  stock_id?: string;
  subtotal: number;
  createdAt?: string;
  lastUpdatedAt?: string;
  actualGoldGiven?: number; // For rani purchases - actual gold 999 given
  rupuReturnType?: 'silver'; // For rupu entries
  silverWeight?: number; // For rupu entries with silver return
}

interface InventoryData {
  totalTransactions: number;
  totalCustomers: number;
  totalSales: number;
  totalPurchases: number;
  netBalance: number;
  goldInventory: {
    gold999: number;
    gold995: number;
    rani: number;
    total: number;
  };
  silverInventory: {
    silver: number;
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
  date: string; // Date for sorting
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
  const [showOnlyRaniRupu, setShowOnlyRaniRupu] = useState(false); // Filter to show only rani/rupu in gold/silver subledgers
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExportDatePicker, setShowExportDatePicker] = useState(false);
  const [exportDate, setExportDate] = useState<Date>(new Date());
  const [showAdjustAlert, setShowAdjustAlert] = useState(false);
  const [raniStock, setRaniStock] = useState<any[]>([]);
  const [rupuStock, setRupuStock] = useState<any[]>([]);
  const { navigateToSettings } = useAppContext();
  const navigation = useNavigation();

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

  // Handle export date picker change
  const handleExportDateChange = (event: any, selectedDate?: Date) => {
    const isConfirmed = event.type === 'set';
    setShowExportDatePicker(Platform.OS === 'ios' && isConfirmed); // Keep open on iOS only if confirmed
    
    if (isConfirmed && selectedDate) {
      setExportDate(selectedDate);
      exportLedgerToPDF(selectedDate, showOnlyRaniRupu);
    } else if (event.type === 'dismissed') {
      // User cancelled, don't change anything
      setShowExportDatePicker(false);
    }
  };

  // Handle Select Date button press
  const handleSelectDatePress = () => {
    setShowDatePicker(true);
    // Don't set selectedPeriod to 'custom' until date is actually selected
  };

  useFocusEffect(
    useCallback(() => {
      loadInventoryData();
    }, [selectedPeriod, customDate, showOnlyRaniRupu, selectedInventory])
  );

  // Reset filter when switching subledgers
  useEffect(() => {
    setShowOnlyRaniRupu(false);
  }, [selectedInventory]);

  // Handle hardware back button - navigate to home screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Navigate to Home tab within the tab navigator
        (navigation as any).navigate('Home');
        return true; // Prevent default back behavior
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [navigation])
  );

  const loadInventoryData = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      // Calculate date range based on selected period
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let startDate: string;
      let endDate: string;
      let upToEndDate: string;
      
      switch (selectedPeriod) {
        case 'today':
          startDate = today.toISOString();
          endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
          upToEndDate = endDate;
          break;
        case 'yesterday':
          const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
          startDate = yesterday.toISOString();
          endDate = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
          upToEndDate = endDate;
          break;
        case 'custom':
          const customStart = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate());
          startDate = customStart.toISOString();
          endDate = new Date(customStart.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
          upToEndDate = endDate;
          break;
        default:
          startDate = today.toISOString();
          endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
          upToEndDate = endDate;
      }

      const basePromises: Promise<any>[] = [
        TransactionService.getTransactionsByDateRange(startDate, endDate),
        CustomerService.getAllCustomers(),
        LedgerService.getLedgerEntriesByDateRange(startDate, endDate),
        TransactionService.getTransactionsByDateRange('1970-01-01T00:00:00.000Z', upToEndDate), // All transactions up to end date
        LedgerService.getLedgerEntriesByDateRange('1970-01-01T00:00:00.000Z', upToEndDate), // All ledger entries up to end date
      ];
      
      // Add itemType-filtered queries for gold and silver subledgers
      if (selectedInventory === 'gold') {
        const goldItemTypes = showOnlyRaniRupu ? ['rani'] : ['gold999', 'gold995'];
        basePromises.push(
          TransactionService.getTransactionsByDateRange(startDate, endDate, goldItemTypes),
          RaniRupaStockService.getStockByType('rani')
        );
      } else if (selectedInventory === 'silver') {
        const silverItemTypes = showOnlyRaniRupu ? ['rupu'] : ['silver'];
        basePromises.push(
          TransactionService.getTransactionsByDateRange(startDate, endDate, silverItemTypes),
          RaniRupaStockService.getStockByType('rupu')
        );
      } else {
        // For 'all' and 'money', load both stock types
        basePromises.push(
          RaniRupaStockService.getStockByType('rani'),
          RaniRupaStockService.getStockByType('rupu')
        );
      }
      
      const results = await Promise.all(basePromises);
      
      const filteredTrans = results[0];
      const customers = results[1];
      const filteredLedger = results[2];
      const transactionsUpToDate = results[3];
      const ledgerEntriesUpToDate = results[4];
      
      // Extract itemType-filtered transactions and stock data based on selected inventory
      let raniStockData: any[] = [];
      let rupuStockData: any[] = [];
      let itemFilteredTransactions: Transaction[] = [];
      
      if (selectedInventory === 'gold') {
        itemFilteredTransactions = results[5];
        raniStockData = results[6];
      } else if (selectedInventory === 'silver') {
        itemFilteredTransactions = results[5];
        rupuStockData = results[6];
      } else {
        raniStockData = results[5];
        rupuStockData = results[6];
      }

      const data = await calculateInventoryData(transactionsUpToDate, customers, ledgerEntriesUpToDate, filteredTrans, filteredLedger);
      setInventoryData(data);
      setFilteredTransactions(itemFilteredTransactions.length > 0 ? itemFilteredTransactions : filteredTrans);
      setFilteredLedgerEntries(filteredLedger);
      setCustomers(customers);
      setRaniStock(raniStockData);
      setRupuStock(rupuStockData);
    } catch (error) {
      console.error('Error loading inventory data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Calculate total pure weight from stock data
  const calculateTotalStockWeight = (stock: any[], type: 'rani' | 'rupu'): number => {
    return stock.reduce((total, item) => {
      if (type === 'rani') {
        // For rani: calculate pure gold weight with precise formatting
        const pureWeight = (item.weight * item.touch) / 100;
        return total + formatPureGoldPrecise(pureWeight);
      } else {
        // For rupu: use custom silver formatting
        return total + customFormatPureSilver(item.weight, item.touch);
      }
    }, 0);
  };

  const handleInventoryAdjustment = async (values: Record<string, any>) => {
    try {
      const gold999Value = parseFloat(values.gold999) || 0;
      const gold995Value = parseFloat(values.gold995) || 0;
      const silverValue = parseFloat(values.silver) || 0;
      const moneyValue = parseFloat(values.money) || 0;

      // Create or get "Adjust" customer
      let adjustCustomer = await CustomerService.getCustomerByName('Adjust');
      if (!adjustCustomer) {
        adjustCustomer = {
          id: `adjust_${Date.now()}`,
          name: 'Adjust',
          balance: 0,
          metalBalances: {
            gold999: 0,
            gold995: 0,
            silver: 0,
          }
        };
        await CustomerService.saveCustomer(adjustCustomer);
        // Add to customers list without reloading all
        setCustomers(prevCustomers => [...prevCustomers, adjustCustomer!]);
      }

      // Handle metal adjustments (gold and silver) as one transaction
      const hasMetalAdjustments = gold999Value !== 0 || gold995Value !== 0 || silverValue !== 0;
      if (hasMetalAdjustments) {
        // Create transaction entries
        const entries: any[] = [];

        // Gold 999 adjustment
        if (gold999Value !== 0) {
          entries.push({
            // Let saveTransaction generate unique ID
            type: gold999Value > 0 ? 'purchase' : 'sell',
            itemType: 'gold999',
            weight: Math.abs(gold999Value),
            price: 0, // No price to avoid balance/debt
            subtotal: 0,
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString()
          });
        }

        // Gold 995 adjustment
        if (gold995Value !== 0) {
          entries.push({
            // Let saveTransaction generate unique ID
            type: gold995Value > 0 ? 'purchase' : 'sell',
            itemType: 'gold995',
            weight: Math.abs(gold995Value),
            price: 0, // No price to avoid balance/debt
            subtotal: 0,
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString()
          });
        }

        // Silver adjustment
        if (silverValue !== 0) {
          entries.push({
            // Let saveTransaction generate unique ID
            type: silverValue > 0 ? 'purchase' : 'sell',
            itemType: 'silver',
            weight: Math.abs(silverValue),
            price: 0, // No price to avoid balance/debt
            subtotal: 0,
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString()
          });
        }

        // Save transaction
        const result = await TransactionService.saveTransaction(
          adjustCustomer,
          entries,
          0, // receivedAmount
          undefined, // existingTransactionId
          0 // discountExtraAmount
        );

        if (!result.success) {
          console.error('Failed to save adjustment transaction:', result.error);
          return;
        }
      }

      // Handle money adjustment as separate ledger entry
      if (moneyValue !== 0) {
        const moneyType: 'give' | 'receive' = moneyValue > 0 ? 'receive' : 'give';
        const amount = Math.abs(moneyValue);
        const subtotal = moneyType === 'receive' ? amount : -amount; // Positive for receive, negative for give

        const entriesNew: any[] = [];
        entriesNew.push({
          // Let saveTransaction generate unique ID
          type: 'money', // Correct type for money entries
          moneyType, // 'receive' or 'give'
          amount, // Raw amount value
          subtotal, // Calculated subtotal
          itemType: 'money',
          createdAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        });
        
        const resultNew = await TransactionService.saveTransaction(
          adjustCustomer,
          entriesNew,
          moneyValue, // receivedAmount - Pass the money value to create ledger entry
          undefined, // existingTransactionId
          0 // discountExtraAmount
        );
        if (!resultNew.success) {
          console.error('Failed to save money adjustment transaction:', resultNew.error);
          return;
        }
      }

      // Reset form and close alert
      setShowAdjustAlert(false);

      // Refresh data
      await loadInventoryData(true);

    } catch (error) {
      console.error('Error creating inventory adjustment:', error);
    }
  };

  const calculateInventoryData = async (
    transactionsUpToDate: Transaction[], 
    customers: Customer[], 
    ledgerEntriesUpToDate: LedgerEntry[],
    dayTransactions: Transaction[],
    dayLedgerEntries: LedgerEntry[]
  ): Promise<InventoryData> => {
    let totalSales = 0;
    let totalPurchases = 0;

    const goldInventory = { gold999: 0, gold995: 0, rani: 0, total: 0 };
    const silverInventory = { silver: 0, rupu: 0, total: 0 };

    // Get base inventory
    const baseInventory = await InventoryService.getBaseInventory();
    
    // Initialize with base values
    goldInventory.gold999 = baseInventory.gold999;
    goldInventory.gold995 = baseInventory.gold995;
    goldInventory.rani = baseInventory.rani;
    silverInventory.silver = baseInventory.silver;
    silverInventory.rupu = baseInventory.rupu;

    // Calculate cumulative inventory using all transactions up to the selected date
    transactionsUpToDate.forEach(transaction => {

      transaction.entries.forEach(entry => {
        const extEntry = entry as ExtendedTransactionEntry; // Cast to access extended properties
        if (extEntry.type === 'sell') {
          // Track inventory going out
          if (extEntry.weight) {
            // For rani: deduct actual rani weight from rani inventory and actual gold given from gold999
            if (extEntry.itemType === 'rani') {
              goldInventory.rani -= extEntry.weight; // Rani weight goes out
              if (extEntry.actualGoldGiven) {
                goldInventory.gold999 -= extEntry.actualGoldGiven; // Actual gold 999 given goes out
              }
            } else {
              const weight = extEntry.pureWeight || extEntry.weight;
              switch (extEntry.itemType) {
                case 'gold999':
                case 'gold995':
                  goldInventory[extEntry.itemType] -= weight;
                  break;
                case 'silver':
                case 'rupu':
                  silverInventory[extEntry.itemType] -= weight;
                  break;
              }
            }
          }
        } else if (extEntry.type === 'purchase') {
          // Track inventory coming in
          if (extEntry.weight) {
            // For rupu with silver return: add rupu, subtract silver return
            if (extEntry.itemType === 'rupu' && extEntry.rupuReturnType === 'silver') {
              silverInventory.rupu += extEntry.weight; // Rupu weight comes in
              if (extEntry.silverWeight) {
                silverInventory.silver -= extEntry.silverWeight; // Silver return goes out
              }
            } else {
              let weight = extEntry.pureWeight || extEntry.weight;
              
              // For Rani entries, recalculate pure weight with precise formatting
              if (extEntry.itemType === 'rani') {
                const touchNum = extEntry.touch || 0;
                const weightNum = extEntry.weight || 0;
                const pureGoldPrecise = (weightNum * touchNum) / 100;
                weight = formatPureGoldPrecise(pureGoldPrecise);
              }
              
              switch (extEntry.itemType) {
                case 'gold999':
                case 'gold995':
                case 'rani':
                  (goldInventory as any)[extEntry.itemType] += weight;
                  break;
                case 'silver':
                case 'rupu':
                  (silverInventory as any)[extEntry.itemType] += weight;
                  break;
              }
            }
          }
        } else {
          // Handle other transaction types if needed
        }
      });
    });

    // Calculate totalSales and totalPurchases from day's transactions only
    dayTransactions.forEach(transaction => {
      transaction.entries.forEach(entry => {
        if (entry.type === 'sell') {
          totalSales += entry.subtotal;
        } else if (entry.type === 'purchase') {
          totalPurchases += entry.subtotal;
        }
      });
    });

    const netBalance = customers
      .filter(c => c.name !== 'Adjust' && c.name !== 'Expense(Kharch)')
      .reduce((sum, customer) => sum + customer.balance, 0);
    
    // Calculate inventory totals (excluding rani from gold and rupu from silver)
    goldInventory.total = goldInventory.gold999 + goldInventory.gold995;
    silverInventory.total = silverInventory.silver + silverInventory.rupu;

    // Apply rounding to prevent floating point precision issues in display
    goldInventory.gold999 = formatPureGoldPrecise(goldInventory.gold999);
    goldInventory.gold995 = formatPureGoldPrecise(goldInventory.gold995);
    goldInventory.rani = formatPureGoldPrecise(goldInventory.rani);
    goldInventory.total = formatPureGoldPrecise(goldInventory.total); // Use gold precision for total
    silverInventory.silver = formatPureSilver(silverInventory.silver);
    silverInventory.rupu = formatPureSilver(silverInventory.rupu);
    silverInventory.total = formatPureSilver(silverInventory.total); // Use silver precision for total

    // Calculate actual money inventory from all ledger entries up to date: base money + sum(amountReceived) - sum(amountGiven)
    const totalMoneyReceived = ledgerEntriesUpToDate.reduce((sum, entry) => sum + entry.amountReceived, 0);
    const totalMoneyGiven = ledgerEntriesUpToDate.reduce((sum, entry) => sum + entry.amountGiven, 0);
    const actualMoneyInventory = Math.round(baseInventory.money + totalMoneyReceived - totalMoneyGiven);

    // Calculate day's cash flow from day's ledger entries only
    const dayMoneyReceived = dayLedgerEntries.reduce((sum, entry) => sum + entry.amountReceived, 0);
    const dayMoneyGiven = dayLedgerEntries.reduce((sum, entry) => sum + entry.amountGiven, 0);

    return {
      totalTransactions: dayTransactions.length,
      totalCustomers: customers.length,
      totalSales,
      totalPurchases,
      netBalance,
      goldInventory,
      silverInventory,
      cashFlow: {
        totalIn: dayMoneyReceived,
        totalOut: dayMoneyGiven,
        netFlow: dayMoneyReceived - dayMoneyGiven,
        moneyIn: actualMoneyInventory,  // Actual cumulative cash holdings
        moneyOut: 0  // Not used for actual inventory
      }
    };
  };

  const exportLedgerToPDF = async (date: Date, showOnlyRaniRupu: boolean = false) => {
    try {
      // Calculate date range for the selected date
      const selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfSelectedDay = new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000 - 1);
      const startDateStr = selectedDate.toISOString();
      const endDateStr = endOfSelectedDay.toISOString();

      // Use database-level filtering for better performance
      const [filteredTrans, filteredLedger, transactionsUpToDate, ledgerEntriesUpToDate, goldTransactions, silverTransactions, raniStockData, rupuStockData] = await Promise.all([
        TransactionService.getTransactionsByDateRange(startDateStr, endDateStr),
        LedgerService.getLedgerEntriesByDateRange(startDateStr, endDateStr),
        TransactionService.getTransactionsByDateRange('1970-01-01T00:00:00.000Z', endDateStr),
        LedgerService.getLedgerEntriesByDateRange('1970-01-01T00:00:00.000Z', endDateStr),
        TransactionService.getTransactionsByDateRange(startDateStr, endDateStr, ['gold999', 'gold995', 'rani']),
        TransactionService.getTransactionsByDateRange(startDateStr, endDateStr, ['silver', 'rupu']),
        RaniRupaStockService.getStockByType('rani'),
        RaniRupaStockService.getStockByType('rupu')
      ]);

      // transactionsUpToDate and ledgerEntriesUpToDate already contain all data up to selected date
      // No need for additional filtering

      // Calculate inventory data
      const data = await calculateInventoryData(transactionsUpToDate, customers, ledgerEntriesUpToDate, filteredTrans, filteredLedger);

      // Get entries for each subledger using pre-filtered transactions
      const goldEntries: EntryData[] = [];
      const silverEntries: EntryData[] = [];
      const moneyEntries: EntryData[] = [];

      // Gold entries - use pre-filtered gold transactions
      goldTransactions.forEach(transaction => {
        const customerName = transaction.customerName;
        transaction.entries.forEach(entry => {
          const extEntry = entry as ExtendedTransactionEntry;
          if (extEntry.itemType === 'rani' && extEntry.type === 'purchase' && extEntry.actualGoldGiven) {
            goldEntries.push({
              transactionId: transaction.id,
              customerName,
              entry: {
                ...extEntry,
                type: 'sell',
                itemType: 'gold999',
                weight: extEntry.actualGoldGiven,
                subtotal: 0
              },
              date: transaction.date
            });
          }
          // Filter based on showOnlyRaniRupu state - MODIFIED: Always include all types in PDF
          // if (showOnlyRaniRupu ? extEntry.itemType === 'rani' : extEntry.itemType !== 'rani') {
            // Filter out 0 weight entries
            if ((extEntry.weight || 0) > 0) {
              goldEntries.push({
                transactionId: transaction.id,
                customerName,
                entry,
                date: transaction.date
              });
            }
          // }
        });
      });

      // Silver entries - use pre-filtered silver transactions
      silverTransactions.forEach(transaction => {
        const customerName = transaction.customerName;
        transaction.entries.forEach(entry => {
          const extEntry = entry as ExtendedTransactionEntry;
          if (extEntry.itemType === 'rupu' && extEntry.type === 'purchase' && extEntry.rupuReturnType === 'silver') {
            if (extEntry.silverWeight && extEntry.silverWeight > 0) {
              silverEntries.push({
                transactionId: transaction.id,
                customerName,
                entry: {
                  ...extEntry,
                  type: 'sell',
                  itemType: 'silver',
                  weight: extEntry.silverWeight,
                  subtotal: 0
                },
                date: transaction.date
              });
            }
          }
          // Filter based on showOnlyRaniRupu state - MODIFIED: Always include all types in PDF
          // if (showOnlyRaniRupu ? extEntry.itemType === 'rupu' : extEntry.itemType !== 'rupu') {
            // Filter out 0 weight entries
            if ((extEntry.weight || 0) > 0) {
              silverEntries.push({
                transactionId: transaction.id,
                customerName,
                entry,
                date: transaction.date
              });
            }
          // }
        });
      });

      // Money entries
      filteredLedger.forEach(ledgerEntry => {
        if (ledgerEntry.amountReceived > 0 || ledgerEntry.amountGiven > 0) {
          moneyEntries.push({
            transactionId: ledgerEntry.transactionId,
            customerName: ledgerEntry.customerName,
            entry: {
              ...ledgerEntry.entries[0],
              _ledgerEntry: ledgerEntry,
            },
            date: ledgerEntry.date
          });
        }
      });

      // Sort all entries by date ascending
      goldEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      silverEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      moneyEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const goldOpeningBalances = {
        gold999: showOnlyRaniRupu ? 0 : data.goldInventory.gold999,
        gold995: showOnlyRaniRupu ? 0 : data.goldInventory.gold995,
        rani: showOnlyRaniRupu ? calculateTotalStockWeight(raniStockData, 'rani') : 0
      };

      const silverOpeningBalances = {
        silver: showOnlyRaniRupu ? 0 : data.silverInventory.silver,
        rupu: showOnlyRaniRupu ? calculateTotalStockWeight(rupuStockData, 'rupu') : 0
      };

      // Calculate gold opening balances
      goldEntries.forEach(entry => {
        const isPurchase = entry.entry.type === 'purchase';
        let weight = entry.entry.pureWeight || entry.entry.weight || 0;
        if (entry.entry.itemType === 'rani') {
          const touchNum = entry.entry.touch || 0;
          const weightNum = entry.entry.weight || 0;
          const pureGoldPrecise = (weightNum * touchNum) / 100;
          weight = formatPureGoldPrecise(pureGoldPrecise);
        }

        if (isPurchase) {
          // Purchase = received, so subtract from opening
          switch (entry.entry.itemType) {
            case 'gold999':
              if (!showOnlyRaniRupu) goldOpeningBalances.gold999 -= weight;
              break;
            case 'gold995':
              if (!showOnlyRaniRupu) goldOpeningBalances.gold995 -= weight;
              break;
            case 'rani':
              if (showOnlyRaniRupu) goldOpeningBalances.rani -= weight;
              break;
          }
        } else {
          // Sell = given, so add to opening
          switch (entry.entry.itemType) {
            case 'gold999':
              if (!showOnlyRaniRupu) goldOpeningBalances.gold999 += weight;
              break;
            case 'gold995':
              if (!showOnlyRaniRupu) goldOpeningBalances.gold995 += weight;
              break;
            case 'rani':
              if (showOnlyRaniRupu) goldOpeningBalances.rani += weight;
              break;
          }
        }
      });

      // Calculate silver opening balances
      silverEntries.forEach(entry => {
        const isPurchase = entry.entry.type === 'purchase';
        const weight = entry.entry.weight || 0;

        if (isPurchase) {
          // Purchase = received, so subtract from opening
          switch (entry.entry.itemType) {
            case 'silver':
              if (!showOnlyRaniRupu) silverOpeningBalances.silver -= weight;
              break;
            case 'rupu':
              if (showOnlyRaniRupu) silverOpeningBalances.rupu -= weight;
              break;
          }
        } else {
          // Sell = given, so add to opening
          switch (entry.entry.itemType) {
            case 'silver':
              if (!showOnlyRaniRupu) silverOpeningBalances.silver += weight;
              break;
            case 'rupu':
              if (showOnlyRaniRupu) silverOpeningBalances.rupu += weight;
              break;
          }
        }
      });

      // Apply rounding to opening balances
      goldOpeningBalances.gold999 = formatPureGoldPrecise(goldOpeningBalances.gold999);
      goldOpeningBalances.gold995 = formatPureGoldPrecise(goldOpeningBalances.gold995);
      goldOpeningBalances.rani = formatPureGoldPrecise(goldOpeningBalances.rani);
      silverOpeningBalances.silver = formatPureSilver(silverOpeningBalances.silver);
      silverOpeningBalances.rupu = formatPureSilver(silverOpeningBalances.rupu);

      // Generate HTML
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Ledger Report - ${formatDateDisplay(date)}</title>
          <style>
            body {
              font-family: 'Helvetica', sans-serif;
              margin: 20px;
              color: #333;
            }
            h1 {
              color: #1976d2;
              text-align: center;
              margin-bottom: 30px;
              font-size: 24px;
            }
            h3 {
              color: #455A64;
              margin-top: 20px;
              margin-bottom: 10px;
              font-size: 16px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
              font-size: 12px;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            td {
              align-items: center;
              width: 33.33%;
            }
            .footer {
              margin-top: 20px;
              text-align: center;
              font-size: 10px;
              color: #666;
            }
            .chips {
              margin-bottom: 10px;
            }
            .chip {
              display: inline-block;
              padding: 4px 8px;
              margin-right: 10px;
              background-color: #e0e0e0;
              border-radius: 4px;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="footer">
            Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
          </div>
          <h1>Ledger Report - ${formatDateDisplay(date)}</h1>

          <!-- Gold Subledger -->
          <h3 style="color: #E65100;">Gold Subledger</h3>
          <div class="chips">
            ${showOnlyRaniRupu ? 
              `<span class="chip">Rani: ${formatWeight(goldOpeningBalances.rani)}</span>` :
              `<span class="chip">Gold 999: ${formatWeight(goldOpeningBalances.gold999)}</span>
               <span class="chip">Gold 995: ${formatWeight(goldOpeningBalances.gold995)}</span>`
            }
          </div>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Purchase</th>
                <th>Sell</th>
              </tr>
            </thead>
            <tbody>
              ${goldEntries.map(entry => {
                const isPurchase = entry.entry.type === 'purchase';
                let weight = entry.entry.pureWeight || entry.entry.weight || 0;
                if (entry.entry.itemType === 'rani') {
                  const touchNum = entry.entry.touch || 0;
                  const weightNum = entry.entry.weight || 0;
                  const pureGoldPrecise = (weightNum * touchNum) / 100;
                  weight = formatPureGoldPrecise(pureGoldPrecise);
                }
                const purchaseWeight = isPurchase ? weight : 0;
                const sellWeight = isPurchase ? 0 : weight;
                
                // Format detailed info for Rani entries
                const formatRaniDetails = (entry: any, weight: number) => {
                  if (entry.itemType === 'rani') {
                    const touchNum = entry.touch || 0;
                    const weightNum = entry.weight || 0;
                    const pureGoldPrecise = (weightNum * touchNum) / 100;
                    return `${weightNum.toFixed(3)}g - ${touchNum.toFixed(2)}% - ${formatPureGoldPrecise(pureGoldPrecise).toFixed(3)}g`;
                  }
                  return `${formatWeight(weight, false)}`;
                };
                
                return `
                  <tr>
                    <td>${entry.customerName}</td>
                    <td>${purchaseWeight > 0 ? formatRaniDetails(entry.entry, purchaseWeight) : '-'} ${purchaseWeight > 0 ? entry.entry.itemType : ''}</td>
                    <td>${sellWeight > 0 ? formatRaniDetails(entry.entry, sellWeight) : '-'} ${sellWeight > 0 ? entry.entry.itemType : ''}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="chips">
            ${showOnlyRaniRupu ?
              `<span class="chip">Rani: ${calculateTotalStockWeight(raniStockData, 'rani').toFixed(3)}g</span>` :
              `<span class="chip">Gold 999: ${formatWeight(data.goldInventory.gold999)}</span>
               <span class="chip">Gold 995: ${formatWeight(data.goldInventory.gold995)}</span>
               <span class="chip">Rani: ${calculateTotalStockWeight(raniStockData, 'rani').toFixed(3)}g</span>`
            }
          </div>
          
          <hr/>
          
          <!-- Silver Subledger -->
          <h3 style="color: #B0BEC5;">Silver Subledger</h3>
          <div class="chips">
            ${showOnlyRaniRupu ?
              `<span class="chip">Rupu: ${formatWeight(silverOpeningBalances.rupu, true)}</span>` :
              `<span class="chip">Silver: ${formatWeight(silverOpeningBalances.silver, true)}</span>`
            }
          </div>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Purchase</th>
                <th>Sell</th>
              </tr>
            </thead>
            <tbody>
              ${silverEntries.map(entry => {
                const isPurchase = entry.entry.type === 'purchase';
                const weight = entry.entry.weight || 0;
                const purchaseWeight = isPurchase ? weight : 0;
                const sellWeight = isPurchase ? 0 : weight;
                
                // Format detailed info for Rupu entries
                const formatRupuDetails = (entry: any, weight: number) => {
                  if (entry.itemType === 'rupu') {
                    const touchNum = entry.touch || 0;
                    const weightNum = entry.weight || 0;
                    return `${weightNum.toFixed(1)}g - ${touchNum.toFixed(2)}% - ${customFormatPureSilver(weightNum, touchNum).toFixed(1)}g`;
                  }
                  return `${formatWeight(weight, true)}`;
                };
                
                return `
                  <tr>
                    <td>${entry.customerName}</td>
                    <td>${purchaseWeight > 0 ? formatRupuDetails(entry.entry, purchaseWeight) : '-'}</td>
                    <td>${sellWeight > 0 ? formatRupuDetails(entry.entry, sellWeight) : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="chips">
            ${showOnlyRaniRupu ?
              `<span class="chip">Rupu: ${calculateTotalStockWeight(rupuStockData, 'rupu').toFixed(1)}g</span>` :
              `<span class="chip">Silver: ${formatWeight(data.silverInventory.silver, true)}</span>
               <span class="chip">Rupu: ${calculateTotalStockWeight(rupuStockData, 'rupu').toFixed(1)}g</span>`
            }
          </div>

          <hr/>

          <!-- Money Subledger -->
          <h3 style="color: #2E7D32;">Money Subledger</h3>
          <div class="chips">
            <span class="chip">Opening: ${formatCurrency(data.cashFlow.moneyIn + data.cashFlow.totalOut - data.cashFlow.totalIn)}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Received</th>
                <th>Given</th>
              </tr>
            </thead>
            <tbody>
              ${moneyEntries.map(entry => {
                const ledgerEntry = entry.entry._ledgerEntry;
                const receivedAmount = ledgerEntry?.amountReceived || 0;
                const givenAmount = ledgerEntry?.amountGiven || 0;
                return `
                  <tr>
                    <td>${entry.customerName}</td>
                    <td>${receivedAmount > 0 ? formatCurrency(receivedAmount) : '-'}</td>
                    <td>${givenAmount > 0 ? formatCurrency(givenAmount) : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="chips">
            <span class="chip">In: ${formatCurrency(data.cashFlow.totalIn)}</span>
            <span class="chip">Out: ${formatCurrency(data.cashFlow.totalOut)}</span>
            <span class="chip">Net: ${formatCurrency(data.cashFlow.moneyIn)}</span>
          </div>
        </body>
        </html>
      `;

      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
      const fileName = `Ledger_Report_${dateStr}.pdf`;
      const newUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.moveAsync({
        from: uri,
        to: newUri,
      });

      // Share the PDF
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(newUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Ledger Report PDF',
        });
      } else {
        console.error('Sharing is not available on this device');
      }

      // Delete after 2 minutes
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(newUri);
        } catch (error) {
          console.error('Error deleting PDF:', error);
        }
      }, 120000); // 2 minutes

    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const onRefresh = () => {
    loadInventoryData(true);
  };

  const getFilteredEntries = useMemo((): EntryData[] => {
    const entries: EntryData[] = [];
    
    if (selectedInventory === 'money') {
      // For money subledger: use ledger entries (one row per payment/update or receivable/payable)
      filteredLedgerEntries.forEach(ledgerEntry => {
        // Only include if there's actual money movement or receivable/payable
        if (ledgerEntry.amountReceived > 0 || ledgerEntry.amountGiven > 0) {
          entries.push({
            transactionId: ledgerEntry.transactionId,
            customerName: ledgerEntry.customerName,
            entry: {
              ...ledgerEntry.entries[0], // Use first entry as placeholder
              _ledgerEntry: ledgerEntry, // Store full ledger entry for money display
            },
            date: ledgerEntry.date
          });
        }
      });

    } else {
      // Add opening stock entry for gold and silver subledgers (not for rani/rupu)
      if (inventoryData && !showOnlyRaniRupu) {
        // Calculate opening balances by reversing transactions in the current period
        const goldOpeningBalances = {
          gold999: inventoryData.goldInventory.gold999,
          gold995: inventoryData.goldInventory.gold995
        };
        
        const silverOpeningBalances = {
          silver: inventoryData.silverInventory.silver
        };

        // Iterate through filtered transactions to reverse their effect
        filteredTransactions.forEach(transaction => {
          transaction.entries.forEach(entry => {
            const extEntry = entry as ExtendedTransactionEntry;
            const isPurchase = extEntry.type === 'purchase';
            
            // Handle Gold
            if (selectedInventory === 'gold') {
              const weight = extEntry.pureWeight || extEntry.weight || 0;
              
              if (extEntry.itemType === 'gold999') {
                if (isPurchase) {
                  goldOpeningBalances.gold999 -= weight;
                } else { // sell
                  goldOpeningBalances.gold999 += weight;
                }
              } else if (extEntry.itemType === 'gold995') {
                if (isPurchase) {
                  goldOpeningBalances.gold995 -= weight;
                } else { // sell
                  goldOpeningBalances.gold995 += weight;
                }
              } else if (extEntry.itemType === 'rani' && isPurchase && extEntry.actualGoldGiven) {
                // Rani purchase with Gold 999 return (exchange)
                // The Gold 999 was given (sold), so we add it back to opening balance
                goldOpeningBalances.gold999 += extEntry.actualGoldGiven;
              }
            }
            
            // Handle Silver
            if (selectedInventory === 'silver') {
              const weight = extEntry.pureWeight || extEntry.weight || 0;
              
              if (extEntry.itemType === 'silver') {
                if (isPurchase) {
                  silverOpeningBalances.silver -= weight;
                } else { // sell
                  silverOpeningBalances.silver += weight;
                }
              } else if (extEntry.itemType === 'rupu' && isPurchase && extEntry.rupuReturnType === 'silver' && extEntry.silverWeight) {
                // Rupu purchase with Silver return (exchange)
                // The Silver was given (sold), so we add it back to opening balance
                silverOpeningBalances.silver += extEntry.silverWeight;
              }
            }
          });
        });

        // Apply rounding
        goldOpeningBalances.gold999 = formatPureGoldPrecise(goldOpeningBalances.gold999);
        goldOpeningBalances.gold995 = formatPureGoldPrecise(goldOpeningBalances.gold995);
        silverOpeningBalances.silver = formatPureSilver(silverOpeningBalances.silver);

        if (selectedInventory === 'gold') {
          entries.push({
            transactionId: 'opening-stock',
            customerName: 'Opening Stock',
            entry: {
              id: 'opening-gold999',
              type: 'purchase',
              itemType: 'gold999',
              weight: goldOpeningBalances.gold999,
              pureWeight: goldOpeningBalances.gold999,
              subtotal: 0,
              _isOpeningStock: true,
              _openingGold995: goldOpeningBalances.gold995
            },
            date: '1970-01-01T00:00:00.000Z' // Earliest date to appear first
          });
        } else if (selectedInventory === 'silver') {
          entries.push({
            transactionId: 'opening-stock',
            customerName: 'Opening Stock',
            entry: {
              id: 'opening-silver',
              type: 'purchase',
              itemType: 'silver',
              weight: silverOpeningBalances.silver,
              pureWeight: silverOpeningBalances.silver,
              subtotal: 0,
              _isOpeningStock: true
            },
            date: '1970-01-01T00:00:00.000Z' // Earliest date to appear first
          });
        }
      }
      
      filteredTransactions.forEach(transaction => {
        const customerName = transaction.customerName;
        transaction.entries.forEach(entry => {
          // Skip money entries in gold/silver subledgers
          if (entry.type === 'money') {
            return;
          }
          
          const extEntry = entry as ExtendedTransactionEntry;
          let includeEntry = false;
          
          if (selectedInventory === 'gold') {
            includeEntry = extEntry.itemType.startsWith('gold') || extEntry.itemType === 'rani';
            
            // Add rani return (actualGoldGiven) as a separate sell entry
            if (extEntry.itemType === 'rani' && extEntry.type === 'purchase' && extEntry.actualGoldGiven) {
              entries.push({
                transactionId: transaction.id,
                customerName,
                entry: {
                  ...extEntry,
                  type: 'sell',
                  itemType: 'gold999',
                  weight: extEntry.actualGoldGiven,
                  subtotal: 0 // Not shown in subledger
                },
                date: extEntry.createdAt || transaction.date
              });
            }
          }
          else if (selectedInventory === 'silver') {
            includeEntry = extEntry.itemType.startsWith('silver') || extEntry.itemType === 'rupu';
            
            // Add rupu silver returns as separate sell entries
            if (extEntry.itemType === 'rupu' && extEntry.type === 'purchase' && extEntry.rupuReturnType === 'silver') {
              if (extEntry.silverWeight && extEntry.silverWeight > 0) {
                entries.push({
                  transactionId: transaction.id,
                  customerName,
                  entry: {
                    ...extEntry,
                    type: 'sell',
                    itemType: 'silver',
                    weight: extEntry.silverWeight,
                    subtotal: 0
                  },
                  date: extEntry.createdAt || transaction.date
                });
              }
            }
          }

          if (includeEntry) {
            // Filter out 0 weight entries
            if ((entry.weight || 0) > 0) {
              entries.push({
                transactionId: transaction.id,
                customerName,
                entry,
                date: entry.createdAt || transaction.date
              });
            }
          }
        });
      });
    }
    
    // Sort by date ascending (oldest first)
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return entries;
  }, [selectedInventory, filteredLedgerEntries, filteredTransactions, customers]);

  const getItemTypeDisplay = (itemType: string) => {
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999',
      'gold995': 'Gold 995',
      'rani': 'Rani',
      'silver': 'Silver',
      'rupu': 'Rupu',
    };
    return typeMap[itemType] || itemType;
  };

  // Entry Row Component
  const EntryRow: React.FC<{ entryData: EntryData }> = ({ entryData }) => {
    const { customerName, entry } = entryData;
    
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
            <Text variant="bodySmall" style={styles.transactionDate}>
              {formatFullTime(entryData.date)}
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
      
      // Handle opening stock entry specially
      if (entry._isOpeningStock) {
        const isGold = selectedInventory === 'gold';
        const gold999Opening = isGold ? (entry.weight || 0) : 0;
        const gold995Opening = isGold ? (entry._openingGold995 || 0) : 0;
        const silverOpening = !isGold ? (entry.weight || 0) : 0;
        
        return (
          <View style={styles.transactionRow}>
            <View style={styles.transactionCell}>
              <Text variant="bodyMedium" style={styles.customerName}>
                {customerName}
              </Text>
            </View>
            <View style={styles.transactionCell}>
              <View>
                <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'center', color: theme.colors.sellColor }]}>
                  {isGold ? formatWeight(gold999Opening) : formatWeight(silverOpening, true)}
                </Text>
                <Text variant="bodySmall" style={[styles.itemTypeText, { textAlign: 'center' }]}>
                  {isGold ? 'Gold 999' : 'Silver'}
                </Text>
              </View>
            </View>
            <View style={styles.transactionCell}>
              {isGold ? (
                <View>
                  <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'right', color: theme.colors.sellColor }]}>
                    {formatWeight(gold995Opening)}
                  </Text>
                  <Text variant="bodySmall" style={[styles.itemTypeText, { textAlign: 'right' }]}>
                    Gold 995
                  </Text>
                </View>
              ) : (
                <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'right' }]}>-</Text>
              )}
            </View>
          </View>
        );
      }
      
      const isPurchase = entry.type === 'purchase';
      
      // For Rani entries in gold subledger, recalculate pure weight with precise formatting
      let weight = entry.pureWeight || entry.weight || 0;
      if (entry.itemType === 'rani' && selectedInventory === 'gold') {
        // Recalculate pure weight for Rani using precise formatting (without cut subtraction for subledger)
        const touchNum = entry.touch || 0;
        const weightNum = entry.weight || 0;
        const pureGoldPrecise = (weightNum * touchNum) / 100;
        weight = formatPureGoldPrecise(pureGoldPrecise);
      }
      if (entry.itemType === 'rupu' && selectedInventory === 'silver') {
        // Recalculate pure weight for Rupu using custom formatting
        const touchNum = entry.touch || 0;
        const weightNum = entry.weight || 0;
        weight = customFormatPureSilver(weightNum, touchNum);
      }
      
      const purchaseWeight = isPurchase ? weight : 0;
      const sellWeight = isPurchase ? 0 : weight;
      const isSilverItem = entry.itemType?.includes('silver') || entry.itemType === 'rupu';
      
      return (
        <View style={styles.transactionRow}>
          <View style={styles.transactionCell}>
            <Text variant="bodyMedium" style={styles.customerName}>
              {customerName}
            </Text>
            <Text variant="bodySmall" style={styles.transactionDate}>
              {formatFullTime(entryData.date)}
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
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons 
          name={icon as any} 
          size={24}
          color={iconColor} 
        />
        <Text variant="titleSmall" style={[styles.inventoryCardTitle, { color: iconColor }]}>
          {title}
        </Text>
      </View>
      <View style={styles.cardContent}>
        <Text variant="headlineSmall" style={[styles.cardValue, { color: iconColor }]}>
          {value}
        </Text>
        {unit && (
          <Text variant="bodyMedium" style={[{ color: iconColor }]}>
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
          {/* add both icons into single row*/}
          <View style={styles.appBarButtons}>
            <IconButton
              icon="tray-arrow-up"
              size={24}
              onPress={() => setShowExportDatePicker(true)}
              style={styles.exportButton}
            />

            <IconButton
              icon="cog-outline"
              size={24}
              onPress={navigateToSettings}
              style={styles.settingsButton}
            />
          </View>

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

        {/* Export Date Picker */}
        {showExportDatePicker && (
          <DateTimePicker
            value={exportDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleExportDateChange}
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
            value={formatWeight(inventoryData.goldInventory.gold999 + inventoryData.goldInventory.gold995)}
            icon="gold"
            backgroundColor="#FFF8E1"
            iconColor="#E65100"
            onPress={() => setSelectedInventory('gold')}
            isSelected={selectedInventory === 'gold'}
          />
          
          {/* Silver Inventory Card */}
          <InventoryCard
            title="Silver"
            value={formatWeight(inventoryData.silverInventory.silver, true)}
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


        {/* Metal Inventory Chips - Show for all subledgers */}
        {inventoryData && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inventoryChipsContainer}>
            {selectedInventory === 'gold' ? (
              <>
                <Chip 
                  mode="flat" 
                  style={[styles.inventoryChip, { backgroundColor: '#FFF8E1' }]}
                  textStyle={{ color: '#E65100' }}
                >
                  Gold 999: {formatWeight(inventoryData.goldInventory.gold999)}
                </Chip>
                <Chip 
                  mode="flat" 
                  style={[styles.inventoryChip, { backgroundColor: '#FFF8E1' }]}
                  textStyle={{ color: '#E65100' }}
                >
                  Gold 995: {formatWeight(inventoryData.goldInventory.gold995)}
                </Chip>
                <Chip 
                  mode={showOnlyRaniRupu ? "outlined" : "flat"}
                  selected={showOnlyRaniRupu}
                  onPress={() => setShowOnlyRaniRupu(!showOnlyRaniRupu)}
                  style={[styles.inventoryChip, { backgroundColor: showOnlyRaniRupu ? '#FFF3E0' : '#FFF8E1' }]}
                  textStyle={{ color: '#E65100' }}
                >
                  Rani: {calculateTotalStockWeight(raniStock, 'rani').toFixed(3)}g
                </Chip>
              </>
            ) : selectedInventory === 'silver' ? (
              <>
                <Chip 
                  mode="flat" 
                  style={[styles.inventoryChip, { backgroundColor: '#ECEFF1' }]}
                  textStyle={{ color: '#455A64' }}
                >
                  Silver: {formatWeight(inventoryData.silverInventory.silver, true)}
                </Chip>
                <Chip 
                  mode={showOnlyRaniRupu ? "outlined" : "flat"}
                  selected={showOnlyRaniRupu}
                  onPress={() => setShowOnlyRaniRupu(!showOnlyRaniRupu)}
                  style={[styles.inventoryChip, { backgroundColor: showOnlyRaniRupu ? '#F1F8E9' : '#ECEFF1' }]}
                  textStyle={{ color: '#455A64' }}
                >
                  Rupu: {calculateTotalStockWeight(rupuStock, 'rupu').toFixed(1)}g
                </Chip>
              </>
            ) : selectedInventory === 'money' ? (
              <>
                <Chip 
                  mode="flat" 
                  style={[styles.inventoryChip, { backgroundColor: '#E8F5E8' }]}
                  textStyle={{ color: '#2E7D32' }}
                >
                  Opening: {formatCurrency(inventoryData.cashFlow.moneyIn + inventoryData.cashFlow.totalOut - inventoryData.cashFlow.totalIn)}
                </Chip>
                <Chip 
                  mode="flat" 
                  style={[styles.inventoryChip, { backgroundColor: '#E8F5E8' }]}
                  textStyle={{ color: '#2E7D32' }}
                >
                  In: {formatCurrency(inventoryData.cashFlow.totalIn)}
                </Chip>
                <Chip 
                  mode="flat" 
                  style={[styles.inventoryChip, { backgroundColor: '#E8F5E8' }]}
                  textStyle={{ color: '#2E7D32' }}
                >
                  Out: {formatCurrency(inventoryData.cashFlow.totalOut)}
                </Chip>
              </>
            ) : null}
          </ScrollView>
        )}


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
          contentContainerStyle={getFilteredEntries.length === 0 ? styles.emptyStateContainer : undefined}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        >
          {/* Transaction Rows */}
          {getFilteredEntries.length > 0 ? (
            getFilteredEntries.map((entryData, index) => {
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

      {/* Floating Action Button for Inventory Adjustment */}
      <FAB
        icon="delta"
        style={styles.fab}
        onPress={() => setShowAdjustAlert(true)}
      />

      {/* Custom Alert for Inventory Adjustment */}
      <InventoryInputDialog
        visible={showAdjustAlert}
        title="Inventory Adjustment"
        message="Enter the weight adjustments for inventory reconciliation:"
        inputs={[
          {
            key: "gold999",
            label: "Gold 999 (g)",
            value: "",
            keyboardType: "numeric",
            placeholder: "0.000"
          },
          {
            key: "gold995",
            label: "Gold 995 (g)",
            value: "",
            keyboardType: "numeric",
            placeholder: "0.000"
          },
          {
            key: "silver",
            label: "Silver (g)",
            value: "",
            keyboardType: "numeric",
            placeholder: "0.0"
          },
          {
            key: "money",
            label: "Money (₹)",
            value: "",
            keyboardType: "numeric",
            placeholder: "0"
          }
        ]}
        onCancel={() => setShowAdjustAlert(false)}
        onSubmit={handleInventoryAdjustment}
        requireAtLeastOneNumeric={true}
        disableRequiredValidation={true}
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
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
  },
  settingsButton: {
    margin: 0,
  },
  appBarButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportButton: {
    margin: 0,
    marginRight: 0,
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
    marginTop: theme.spacing.md,
  },
  inventoryChipsContainer: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: theme.spacing.md,
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
    height: 90,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inventoryCardTitle: {
    fontFamily: 'Roboto_700Bold',
    marginLeft: theme.spacing.xs,
    fontSize: 18,
  },
  cardValue: {
    fontFamily: 'Roboto_700Bold',
    textAlign: 'center',
    marginBottom: -14,
  },
  fab: {
    position: 'absolute',
    margin: theme.spacing.md,
    right: 0,
    bottom: theme.spacing.md,
  },
});