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
import { formatWeight, formatCurrency, formatPureGoldPrecise } from '../utils/formatting';
import { DatabaseService } from '../services/database';
import { Transaction, Customer, LedgerEntry } from '../types';
import { useAppContext } from '../context/AppContext';
import { InventoryInputDialog } from '../components/InventoryInputDialog';

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
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExportDatePicker, setShowExportDatePicker] = useState(false);
  const [exportDate, setExportDate] = useState<Date>(new Date());
  const [showAdjustAlert, setShowAdjustAlert] = useState(false);
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
      exportLedgerToPDF(selectedDate);
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

  useEffect(() => {
    loadInventoryData();
  }, [selectedPeriod]);

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

      const [transactions, customers, allLedgerEntries] = await Promise.all([
        DatabaseService.getAllTransactions(),
        DatabaseService.getAllCustomers(),
        DatabaseService.getAllLedgerEntries()
      ]);

      // Filter transactions by selected period
      const filteredTrans = filterTransactionsByPeriod(transactions);
      
      // Filter ledger entries by selected period
      const filteredLedger = filterLedgerEntriesByPeriod(allLedgerEntries);

      const data = await calculateInventoryData(filteredTrans, customers, filteredLedger);
      setInventoryData(data);
      setFilteredTransactions(filteredTrans);
      setFilteredLedgerEntries(filteredLedger);
      setCustomers(customers);
    } catch (error) {
      console.error('Error loading inventory data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleInventoryAdjustment = async (values: Record<string, any>) => {
    try {
      const gold999Value = values.gold999 || 0;
      const gold995Value = values.gold995 || 0;
      const silverValue = values.silver || 0;

      // Create or get "Adjust" customer
      let adjustCustomer = customers.find(c => c.name === 'Adjust');
      if (!adjustCustomer) {
        adjustCustomer = {
          id: `adjust_${Date.now()}`,
          name: 'Adjust',
          balance: 0,
          metalBalances: {}
        };
        await DatabaseService.saveCustomer(adjustCustomer);
        // Refresh customers list
        const updatedCustomers = await DatabaseService.getAllCustomers();
        setCustomers(updatedCustomers);
        adjustCustomer = updatedCustomers.find(c => c.name === 'Adjust')!;
      }

      // Create transaction entries
      const entries: any[] = [];
      let entryId = 1;

      // Gold 999 adjustment
      if (gold999Value !== 0) {
        entries.push({
          id: `entry_${entryId++}`,
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
          id: `entry_${entryId++}`,
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
          id: `entry_${entryId++}`,
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
      const result = await DatabaseService.saveTransaction(
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

      // Reset form and close alert
      setShowAdjustAlert(false);

      // Refresh data
      await loadInventoryData(true);

    } catch (error) {
      console.error('Error creating inventory adjustment:', error);
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

  const calculateInventoryData = async (transactions: Transaction[], customers: Customer[], ledgerEntries: LedgerEntry[]): Promise<InventoryData> => {
    let totalSales = 0;
    let totalPurchases = 0;
    let pendingTransactions = 0;

    const goldInventory = { gold999: 0, gold995: 0, rani: 0, total: 0 };
    const silverInventory = { silver: 0, rupu: 0, total: 0 };

    // Get base inventory
    const baseInventory = await DatabaseService.getBaseInventory();
    
    // Initialize with base values
    goldInventory.gold999 = baseInventory.gold999;
    goldInventory.gold995 = baseInventory.gold995;
    goldInventory.rani = baseInventory.rani;
    silverInventory.silver = baseInventory.silver;
    silverInventory.rupu = baseInventory.rupu;

    transactions.forEach(transaction => {
      if (transaction.status === 'pending') {
        pendingTransactions++;
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
              if (entry.silverWeight) {
                silverInventory.silver -= entry.silverWeight; // Silver return goes out
              }
            } else {
              let weight = entry.pureWeight || entry.weight;
              
              // For Rani entries, recalculate pure weight with precise formatting
              if (entry.itemType === 'rani') {
                const touchNum = entry.touch || 0;
                const weightNum = entry.weight || 0;
                const pureGoldPrecise = (weightNum * touchNum) / 100;
                weight = formatPureGoldPrecise(pureGoldPrecise);
              }
              
              switch (entry.itemType) {
                case 'gold999':
                case 'gold995':
                case 'rani':
                  goldInventory[entry.itemType] += weight;
                  break;
                case 'silver':
                case 'rupu':
                  silverInventory[entry.itemType] += weight;
                  break;
              }
            }
          }
        } else {
          // Handle other transaction types if needed
        }
      });
    });

    const netBalance = customers.reduce((sum, customer) => sum + customer.balance, 0);
    
    // Calculate inventory totals (excluding rani from gold and rupu from silver)
    goldInventory.total = goldInventory.gold999 + goldInventory.gold995;
    silverInventory.total = silverInventory.silver + silverInventory.rupu;

    // Apply rounding to prevent floating point precision issues in display
    goldInventory.gold999 = DatabaseService.roundInventoryValue(goldInventory.gold999, 'gold999');
    goldInventory.gold995 = DatabaseService.roundInventoryValue(goldInventory.gold995, 'gold995');
    goldInventory.rani = DatabaseService.roundInventoryValue(goldInventory.rani, 'rani');
    goldInventory.total = DatabaseService.roundInventoryValue(goldInventory.total, 'gold999'); // Use gold999 precision for total
    silverInventory.silver = DatabaseService.roundInventoryValue(silverInventory.silver, 'silver');
    silverInventory.rupu = DatabaseService.roundInventoryValue(silverInventory.rupu, 'rupu');
    silverInventory.total = DatabaseService.roundInventoryValue(silverInventory.total, 'silver'); // Use silver precision for total

    // Calculate actual money inventory from ledger entries: base money + sum(amountReceived) - sum(amountGiven)
    const totalMoneyReceived = ledgerEntries.reduce((sum, entry) => sum + entry.amountReceived, 0);
    const totalMoneyGiven = ledgerEntries.reduce((sum, entry) => sum + entry.amountGiven, 0);
    const actualMoneyInventory = DatabaseService.roundInventoryValue(baseInventory.money + totalMoneyReceived - totalMoneyGiven, 'money');

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
        totalIn: totalMoneyReceived,
        totalOut: totalMoneyGiven,
        netFlow: totalMoneyReceived - totalMoneyGiven,
        moneyIn: actualMoneyInventory,  // Actual cash holdings
        moneyOut: 0  // Not used for actual inventory
      }
    };
  };

  const exportLedgerToPDF = async (date: Date) => {
    try {
      // Get data for the selected date
      const [transactions, allLedgerEntries] = await Promise.all([
        DatabaseService.getAllTransactions(),
        DatabaseService.getAllLedgerEntries()
      ]);

      // Filter transactions and ledger for the date
      const selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfSelectedDay = new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000 - 1);

      const filteredTrans = transactions.filter(t => {
        const transDate = new Date(t.date);
        return transDate >= selectedDate && transDate <= endOfSelectedDay;
      });

      const filteredLedger = allLedgerEntries.filter(e => {
        const entryDate = new Date(e.date);
        return entryDate >= selectedDate && entryDate <= endOfSelectedDay;
      });

      // Calculate inventory data
      const data = await calculateInventoryData(filteredTrans, customers, filteredLedger);

      // Get entries for each subledger
      const goldEntries: EntryData[] = [];
      const silverEntries: EntryData[] = [];
      const moneyEntries: EntryData[] = [];

      // Gold entries
      filteredTrans.forEach(transaction => {
        const customer = customers.find(c => c.id === transaction.customerId);
        const customerName = customer?.name || 'Unknown Customer';
        transaction.entries.forEach(entry => {
          if (entry.type === 'money') return;
          if (entry.itemType.startsWith('gold') || entry.itemType === 'rani') {
            if (entry.itemType === 'rani' && entry.type === 'purchase' && entry.actualGoldGiven) {
              goldEntries.push({
                transactionId: transaction.id,
                customerName,
                entry: {
                  ...entry,
                  type: 'sell',
                  itemType: 'gold999',
                  weight: entry.actualGoldGiven,
                  subtotal: 0
                },
                date: transaction.date
              });
            }
            goldEntries.push({
              transactionId: transaction.id,
              customerName,
              entry,
              date: transaction.date
            });
          }
        });
      });

      // Silver entries
      filteredTrans.forEach(transaction => {
        const customer = customers.find(c => c.id === transaction.customerId);
        const customerName = customer?.name || 'Unknown Customer';
        transaction.entries.forEach(entry => {
          if (entry.type === 'money') return;
          if (entry.itemType.startsWith('silver') || entry.itemType === 'rupu') {
            if (entry.itemType === 'rupu' && entry.type === 'purchase' && entry.rupuReturnType === 'silver') {
              if (entry.silverWeight && entry.silverWeight > 0) {
                silverEntries.push({
                  transactionId: transaction.id,
                  customerName,
                  entry: {
                    ...entry,
                    type: 'sell',
                    itemType: 'silver',
                    weight: entry.silverWeight,
                    subtotal: 0
                  },
                  date: transaction.date
                });
              }
            }
            silverEntries.push({
              transactionId: transaction.id,
              customerName,
              entry,
              date: transaction.date
            });
          }
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

      // Calculate opening balances for gold and silver
      // Opening = Current + sum(sold weights) - sum(purchased weights)
      const goldOpeningBalances = {
        gold999: data.goldInventory.gold999,
        gold995: data.goldInventory.gold995,
        rani: data.goldInventory.rani
      };

      const silverOpeningBalances = {
        silver: data.silverInventory.silver,
        rupu: data.silverInventory.rupu
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
              goldOpeningBalances.gold999 -= weight;
              break;
            case 'gold995':
              goldOpeningBalances.gold995 -= weight;
              break;
            case 'rani':
              goldOpeningBalances.rani -= weight;
              break;
          }
        } else {
          // Sell = given, so add to opening
          switch (entry.entry.itemType) {
            case 'gold999':
              goldOpeningBalances.gold999 += weight;
              break;
            case 'gold995':
              goldOpeningBalances.gold995 += weight;
              break;
            case 'rani':
              goldOpeningBalances.rani += weight;
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
              silverOpeningBalances.silver -= weight;
              break;
            case 'rupu':
              silverOpeningBalances.rupu -= weight;
              break;
          }
        } else {
          // Sell = given, so add to opening
          switch (entry.entry.itemType) {
            case 'silver':
              silverOpeningBalances.silver += weight;
              break;
            case 'rupu':
              silverOpeningBalances.rupu += weight;
              break;
          }
        }
      });

      // Apply rounding to opening balances
      goldOpeningBalances.gold999 = DatabaseService.roundInventoryValue(goldOpeningBalances.gold999, 'gold999');
      goldOpeningBalances.gold995 = DatabaseService.roundInventoryValue(goldOpeningBalances.gold995, 'gold995');
      goldOpeningBalances.rani = DatabaseService.roundInventoryValue(goldOpeningBalances.rani, 'rani');
      silverOpeningBalances.silver = DatabaseService.roundInventoryValue(silverOpeningBalances.silver, 'silver');
      silverOpeningBalances.rupu = DatabaseService.roundInventoryValue(silverOpeningBalances.rupu, 'rupu');

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
            <span class="chip">Gold 999: ${formatWeight(goldOpeningBalances.gold999)}</span>
            <span class="chip">Gold 995: ${formatWeight(goldOpeningBalances.gold995)}</span>
            <span class="chip">Rani: ${goldOpeningBalances.rani.toFixed(3)}g</span>
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
                    return `${weightNum.toFixed(3)}g, ${touchNum}%, ${formatPureGoldPrecise(pureGoldPrecise)}g`;
                  }
                  return `${formatWeight(weight, false)}`;
                };
                
                return `
                  <tr>
                    <td>${entry.customerName}</td>
                    <td>${purchaseWeight > 0 ? formatRaniDetails(entry.entry, purchaseWeight) : '-'}</td>
                    <td>${sellWeight > 0 ? formatRaniDetails(entry.entry, sellWeight) : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="chips">
            <span class="chip">Gold 999: ${formatWeight(data.goldInventory.gold999)}</span>
            <span class="chip">Gold 995: ${formatWeight(data.goldInventory.gold995)}</span>
            <span class="chip">Rani: ${data.goldInventory.rani.toFixed(3)}g</span>
          </div>
          
          <hr/>
          
          <!-- Silver Subledger -->
          <h3 style="color: #B0BEC5;">Silver Subledger</h3>
          <div class="chips">
            <span class="chip">Silver: ${formatWeight(silverOpeningBalances.silver, true)}</span>
            <span class="chip">Rupu: ${formatWeight(silverOpeningBalances.rupu, true)}</span>
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
                    const pureSilverPrecise = (weightNum * touchNum) / 100;
                    return `${weightNum.toFixed(1)}g, ${touchNum}%, ${pureSilverPrecise.toFixed(1)}g`;
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
            <span class="chip">Silver: ${formatWeight(data.silverInventory.silver, true)}</span>
            <span class="chip">Rupu: ${formatWeight(data.silverInventory.rupu, true)}</span>
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
            <span class="chip">Net: ${formatCurrency(data.cashFlow.moneyIn - data.cashFlow.totalOut)}</span>
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
      filteredTransactions.forEach(transaction => {
        const customer = customers.find(c => c.id === transaction.customerId);
        const customerName = customer?.name || 'Unknown Customer';
        transaction.entries.forEach(entry => {
          // Skip money entries in gold/silver subledgers
          if (entry.type === 'money') {
            return;
          }
          
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
                },
                date: transaction.date
              });
            }
          }
          else if (selectedInventory === 'silver') {
            includeEntry = entry.itemType.startsWith('silver') || entry.itemType === 'rupu';
            
            // Add rupu silver returns as separate sell entries
            if (entry.itemType === 'rupu' && entry.type === 'purchase' && entry.rupuReturnType === 'silver') {
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
                  },
                  date: transaction.date
                });
              }
            }
          }

          if (includeEntry) {
            entries.push({
              transactionId: transaction.id,
              customerName,
              entry,
              date: transaction.date
            });
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
      
      // For Rani entries in gold subledger, recalculate pure weight with precise formatting
      let weight = entry.pureWeight || entry.weight || 0;
      if (entry.itemType === 'rani' && selectedInventory === 'gold') {
        // Recalculate pure weight for Rani using precise formatting (without cut subtraction for subledger)
        const touchNum = entry.touch || 0;
        const weightNum = entry.weight || 0;
        const pureGoldPrecise = (weightNum * touchNum) / 100;
        weight = formatPureGoldPrecise(pureGoldPrecise);
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
                  mode="flat" 
                  style={[styles.inventoryChip, { backgroundColor: '#FFF8E1' }]}
                  textStyle={{ color: '#E65100' }}
                >
                  Rani: {inventoryData.goldInventory.rani.toFixed(3)}g
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
                  mode="flat" 
                  style={[styles.inventoryChip, { backgroundColor: '#ECEFF1' }]}
                  textStyle={{ color: '#455A64' }}
                >
                  Rupu: {formatWeight(inventoryData.silverInventory.rupu, true)}
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
            placeholder: "0.000"
          }
        ]}
        onCancel={() => setShowAdjustAlert(false)}
        onSubmit={handleInventoryAdjustment}
        requireAtLeastOneNumeric={true}
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
  fab: {
    position: 'absolute',
    margin: theme.spacing.md,
    right: 0,
    bottom: theme.spacing.md,
  },
});