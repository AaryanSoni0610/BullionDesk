import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  BackHandler,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Text,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Customer } from '../types';
import { CustomerService } from '../services/customer.service';
import { LedgerService } from '../services/ledger.service';
import { TransactionService } from '../services/transaction.service';
import { formatFullDate, formatIndianNumber, formatPureGoldPrecise, formatPureSilver, customFormatPureSilver } from '../utils/formatting';
import { useAppContext } from '../context/AppContext';
import * as FileSystem from 'expo-file-system';
import CustomAlert from '../components/CustomAlert';

// Define a local interface for display purposes
interface CustomerLedgerItem {
  id: string;
  transactionId: string;
  date: string;
  receivedAmount: number;
  givenAmount: number;
  entries: any[]; // Using any[] to accommodate TransactionEntry structure
  note?: string;
}

export const CustomerListScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [ledgerCache, setLedgerCache] = useState<Map<string, { data: CustomerLedgerItem[], timestamp: number }>>(new Map());
  const [customersWithTransactions, setCustomersWithTransactions] = useState<Set<string>>(new Set());
  const [areTransactionsChecked, setAreTransactionsChecked] = useState(false);
  const [deleteAlertVisible, setDeleteAlertVisible] = useState(false);
  const [deleteAlertTitle, setDeleteAlertTitle] = useState('');
  const [deleteAlertMessage, setDeleteAlertMessage] = useState('');
  const [deleteAlertIcon, setDeleteAlertIcon] = useState<string | undefined>(undefined);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const { navigateToSettings, showAlert } = useAppContext();

  // Debounced search function with local filtering
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      if (query.trim() === '') {
        setFilteredCustomers(customers); // Show all customers when no search
      } else {
        // Filter locally from loaded customers
        const filtered = customers.filter(customer =>
          customer.name.toLowerCase().includes(query.toLowerCase().trim())
        );
        setFilteredCustomers(filtered);
      }
    }, 300),
    [customers] // Depend on customers so it updates when customers load
  );

  const expandedCardsRef = useRef(expandedCards);
  useEffect(() => {
    expandedCardsRef.current = expandedCards;
  }, [expandedCards]);

  // Load all customers on focus and refresh expanded cards
  useFocusEffect(
    useCallback(() => {
      loadAllCustomers();
      // Refresh ledger data for expanded cards
      expandedCardsRef.current.forEach(id => {
        fetchCustomerLedger(id);
      });
    }, [])
  );

  const loadAllCustomers = async () => {
    try {
      setAreTransactionsChecked(false);
      const allCustomers = await CustomerService.getAllCustomers();
      setCustomers(allCustomers);
      setFilteredCustomers(allCustomers); // Initially show all customers

      // Check which customers have transactions (optimized with Promise.all)
      const transactionChecks = await Promise.all(
        allCustomers.map(async (customer) => {
          const hasTransactions = await hasCustomerTransactions(customer.id);
          return { id: customer.id, hasTransactions };
        })
      );

      const customersWithTxns = new Set<string>();
      transactionChecks.forEach(check => {
        if (check.hasTransactions) {
          customersWithTxns.add(check.id);
        }
      });
      
      setCustomersWithTransactions(customersWithTxns);
      setAreTransactionsChecked(true);
    } catch (error) {
      console.error('Error loading customers:', error);
      setError('Failed to load customers');
      setAreTransactionsChecked(true); // Ensure we don't get stuck in unchecked state
    }
  };

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch, customers]);

  // Handle hardware back button - navigate to settings
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigateToSettings();
        return true; // Prevent default back behavior
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [navigateToSettings])
  );

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatBalance = (balance: number) => {
    if (balance === 0) return 'Settled';
    // INVERTED: positive = balance (merchant owes), negative = debt (customer owes)
    if (balance > 0) return `Balance: ₹${formatIndianNumber(Math.abs(balance))}`;
    else return `Debt: ₹${formatIndianNumber(Math.abs(balance))}`;
  };

  const formatMetalBalances = (customer: Customer) => {
    const metalBalances = customer.metalBalances;
    if (!metalBalances) {
      return formatBalance(customer.balance);
    }

    const balanceItems: string[] = [];
    const debtItems: string[] = [];

    const metalTypeNames: Record<string, string> = {
      gold999: 'Gold 999',
      gold995: 'Gold 995',
      rani: 'Rani',
      silver: 'Silver',
      silver98: 'Silver 98',
      silver96: 'Silver 96',
      rupu: 'Rupu',
    };

    Object.entries(metalBalances).forEach(([type, balance]) => {
      if (balance && Math.abs(balance) > 0.001) {
        const isGold = type.includes('gold') || type === 'rani';
        const displayName = metalTypeNames[type] || type;
        const formattedBalance = isGold ? Math.abs(balance).toFixed(3) : Math.floor(Math.abs(balance));

        if (balance > 0) {
          balanceItems.push(`${displayName} ${formattedBalance}g`);
        } else {
          debtItems.push(`${displayName} ${formattedBalance}g`);
        }
      }
    });

    const hasMoneyBalance = customer.balance !== 0;
    const hasMetalBalance = balanceItems.length > 0 || debtItems.length > 0;

    if (!hasMoneyBalance && !hasMetalBalance) {
      return 'Settled';
    }

    const parts: string[] = [];

    if (hasMoneyBalance) {
      parts.push(formatBalance(customer.balance));
    }

    if (balanceItems.length > 0) {
      parts.push(`Balance: ${balanceItems.join(', ')}`);
    }

    if (debtItems.length > 0) {
      parts.push(`Debt: ${debtItems.join(', ')}`);
    }

    return parts.join(' | ');
  };

  // Check if customer has any transactions
  const hasCustomerTransactions = async (customerId: string): Promise<boolean> => {
    try {
      const transactions = await TransactionService.getTransactionsByCustomerId(customerId);
      return transactions.length > 0;
    } catch (error) {
      console.error('Error checking customer transactions:', error);
      return true; // Assume has transactions if error occurs
    }
  };

  const exportCustomersToPDF = async () => {
    try {
      // Load all customers for PDF export (not just searched ones)
      const allCustomers = await CustomerService.getAllCustomers();
      
      // Prepare data for PDF - export all customers with debt/balance
      const pdfData: Array<{customer: string, goldBalance: string, goldDebt: string, silverBalance: string, silverDebt: string, moneyBalance: string, moneyDebt: string}> = [];
      
      // Filter customers to only include those with debt/balance
      const customersWithBalances = allCustomers.filter(customer => {
        // Check money balance
        if (customer.balance !== 0) return true;
        
        // Check metal balances
        const metalBalances = customer.metalBalances || {};
        return Object.values(metalBalances).some(balance => balance && Math.abs(balance) > 0.001);
      });
      
      customersWithBalances.forEach(customer => {
        const metalBalances = customer.metalBalances || {};
        
        // Create gold column content
        const goldBalances: string[] = [];
        const goldDebts: string[] = [];
        const silverBalances: string[] = [];
        const silverDebts: string[] = [];
        let moneyBalance = '';
        let moneyDebt = '';
        
        // Process metal balances/debts
        Object.entries(metalBalances).forEach(([type, balance]) => {
          if (balance && Math.abs(balance) > 0.001) {
            const isGold = type.includes('gold') || type === 'rani';
            const displayName = {
              gold999: 'Gold 999',
              gold995: 'Gold 995',
              rani: 'Rani',
              silver: 'Silver',
              silver98: 'Silver 98',
              silver96: 'Silver 96',
              rupu: 'Rupu',
            }[type] || type;
            
            const formattedBalance = isGold ? Math.abs(balance).toFixed(3) : Math.floor(Math.abs(balance)).toFixed(1);
            const balanceText = `${displayName} ${formattedBalance}g`;
            
            if (isGold) {
              if (balance > 0) {
                goldBalances.push(balanceText);
              } else {
                goldDebts.push(balanceText);
              }
            } else {
              if (balance > 0) {
                silverBalances.push(balanceText);
              } else {
                silverDebts.push(balanceText);
              }
            }
          }
        });
        
        // Process money balance/debt (INVERTED SIGN)
        if (customer.balance > 0) {
          // Positive = merchant owes customer (balance)
          moneyBalance = `₹${formatIndianNumber(Math.abs(customer.balance))}`;
        } else if (customer.balance < 0) {
          // Negative = customer owes merchant (debt)
          moneyDebt = `₹${formatIndianNumber(Math.abs(customer.balance))}`;
        }
        
        pdfData.push({
          customer: customer.name,
          goldBalance: goldBalances.join('<br>'),
          goldDebt: goldDebts.join('<br>'),
          silverBalance: silverBalances.join('<br>'),
          silverDebt: silverDebts.join('<br>'),
          moneyBalance: moneyBalance,
          moneyDebt: moneyDebt
        });
      });
      
      // Generate HTML for PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Customer List - BullionDesk</title>
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
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: left;
              font-size: 14px;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
              color: #555;
              text-align: center;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .customer-name {
              font-weight: 500;
            }
            .balance {
              color: #2e7d32;
            }
            .debt {
              color: #d32f2f;
            }
            .footer {
              margin-top: 10px;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="footer">
            Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
          </div>
          <h1>Customer List - BullionDesk</h1>
          <table>
            <thead>
              <tr>
                <th rowspan="2">Customer</th>
                <th colspan="2">Money</th>
                <th colspan="2">Gold</th>
                <th colspan="2">Silver</th>
              </tr>
              <tr>
                <th>Balance</th>
                <th>Debt</th>
                <th>Balance</th>
                <th>Debt</th>
                <th>Balance</th>
                <th>Debt</th>
              </tr>
            </thead>
            <tbody>
              ${pdfData.map(row => `
                <tr>
                  <td class="customer-name">${row.customer}</td>
                  <td class="balance">${row.moneyBalance}</td>
                  <td class="debt">${row.moneyDebt}</td>
                  <td class="balance">${row.goldBalance}</td>
                  <td class="debt">${row.goldDebt}</td>
                  <td class="balance">${row.silverBalance}</td>
                  <td class="debt">${row.silverDebt}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;
      
      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });
      
      const date = new Date();
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const dateStr = `${day}-${month}-${year}`; // e.g., "08-10-2025"
      
      // Save the PDF to file system
      const newUri = `${FileSystem.documentDirectory}BullionDesk_CustomerBalance_${dateStr}.pdf`;
      await FileSystem.moveAsync({
        from: uri,
        to: newUri,
      });

      // Share the PDF
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(newUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Customer List PDF',
        });
      } else {
        setError('Sharing is not available on this device');
      }
      
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(newUri, { idempotent: true });
        } catch (error) {
          console.error('Could not clean up pdf file:', error);
        }
      }, 120000); // 2 minute delay
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      setError('Failed to generate PDF');
    }
  };

  const exportCustomerTransactionHistoryToPDF = async (customer: Customer) => {
    try {
      // Fetch ledger data if not cached
      let ledgerData = ledgerCache.get(customer.id)?.data;
      if (!ledgerData) {
        ledgerData = await fetchCustomerLedger(customer.id);
      }

      // Generate HTML for PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Transaction History - ${customer.name}</title>
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
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: left;
              font-size: 14px;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
              color: #555;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .footer {
              margin-top: 10px;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="footer">
            Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
          </div>
          <h1>Transaction History - ${customer.name}</h1>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Money</th>
                <th>Bullion</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerData.map(entry => {
                const date = formatFullDate(entry.date);
                
                let moneyHtml = '';
                if (entry.receivedAmount > 0) {
                    moneyHtml = `<span style="color: #2e7d32;">↙️ ₹${formatIndianNumber(entry.receivedAmount)}</span>`; // Green
                } else if (entry.givenAmount > 0) {
                    moneyHtml = `<span style="color: #1976d2;">↗️ ₹${formatIndianNumber(entry.givenAmount)}</span>`; // Blue
                }

                const metalEntries = entry.entries.filter(e => e.type !== 'money');
                const sellEntries = metalEntries.filter(e => e.type === 'sell');
                const purchaseEntries = metalEntries.filter(e => e.type === 'purchase');
                const sortedMetalEntries = [...sellEntries, ...purchaseEntries];

                const bullionDetails = sortedMetalEntries.map(e => {
                    const isSell = e.type === 'sell';
                    const arrow = isSell ? '↗️' : '↙️';
                    let details = '';
                    
                    if (e.itemType === 'rani' || e.itemType === 'rupu') {
                      const weight = e.weight || 0;
                      const touch = e.touch || 100;
                      const cut = e.cut || 0;
                      let effectiveTouch = touch;
                      let pureWeight = weight*touch/100;
                      const decimalPlaces = e.itemType === 'rani' ? 3 : 1;

                      let weightStr = '';
                      if (e.itemType === 'rani') {
                          if (isSell) {
                            effectiveTouch = Math.max(0, touch - cut);
                            pureWeight = (weight * effectiveTouch) / 1000;
                            weightStr = `${formatPureGoldPrecise(pureWeight).toFixed(3)}g`;
                          } else {
                              weightStr = `${(Math.floor(pureWeight * 100) / 100).toFixed(3)}g`;
                          }
                      } else {
                          if (isSell) {
                            weightStr = `${customFormatPureSilver(weight, touch).toFixed(1)}g`;
                          } else {
                            weightStr = `${formatPureSilver(pureWeight)}g`;
                          }
                      }
                      
                      const typeName = e.itemType === 'rani' ? 'Rani' : 'Rupu';
                      details = `${typeName} ${weight.toFixed(decimalPlaces)}g - ${effectiveTouch.toFixed(2)}% - ${weightStr}`;
                    } else {
                      const isGold = e.itemType.includes('gold');
                      const weight = e.weight || 0;
                      const formattedWeight = isGold ? weight.toFixed(3) : weight.toFixed(1);
                      const typeName = e.itemType === 'gold999' ? 'Gold 999' :
                                      e.itemType === 'gold995' ? 'Gold 995' :
                                      e.itemType === 'silver' ? 'Silver' : e.itemType;
                      details = `${typeName} ${formattedWeight}g`;
                    }
                    return `<div>${arrow} ${details}</div>`;
                }).join('');

                return `
                  <tr>
                    <td>${date}</td>
                    <td>${moneyHtml}</td>
                    <td>${bullionDetails}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      const date = new Date();
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const dateStr = `${day}-${month}-${year}`;

      const fileName = `Customer-Transaction-History-till-${dateStr}.pdf`;
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
          dialogTitle: 'Share Customer Transaction History PDF',
        });
      } else {
        setError('Sharing is not available on this device');
      }

      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(newUri, { idempotent: true });
        } catch (error) {
          console.error('Could not clean up temp file:', error);
        }
      }, 120000); // 2 minute delay

    } catch (error) {
      console.error('Error generating PDF:', error);
      setError('Failed to generate PDF');
    }
  };

  const fetchCustomerLedger = async (customerId: string): Promise<CustomerLedgerItem[]> => {
    const now = Date.now();
    
    try {
      const [ledgerEntries, customerTransactions] = await Promise.all([
        LedgerService.getLedgerEntriesByCustomerId(customerId),
        TransactionService.getTransactionsByCustomerId(customerId)
      ]);

      const transactionMap = new Map(customerTransactions.map(t => [t.id, t]));
      const groupedItems = new Map<string, CustomerLedgerItem>();

      // Process ledger entries
      ledgerEntries.forEach(entry => {
        // Create a unique key for grouping: transactionId + date
        const key = `${entry.transactionId}_${entry.date}`;
        
        if (!groupedItems.has(key)) {
          groupedItems.set(key, {
            id: key,
            transactionId: entry.transactionId,
            date: entry.date,
            receivedAmount: 0,
            givenAmount: 0,
            entries: [],
            note: transactionMap.get(entry.transactionId)?.note
          });
        }

        const group = groupedItems.get(key)!;

        if (entry.itemType === 'money') {
          if (entry.type === 'receive') {
            group.receivedAmount += entry.amount || 0;
          } else if (entry.type === 'give') {
            group.givenAmount += entry.amount || 0;
          }
        } else {
            // It's a metal entry. 
            // If this group corresponds to the transaction date, we can populate entries from the transaction.
            const transaction = transactionMap.get(entry.transactionId);
            if (transaction && transaction.date === entry.date) {
                // Only populate once
                if (group.entries.length === 0) {
                    group.entries = transaction.entries.filter(e => e.itemType !== 'money');
                }
            } else {
                // Fallback if dates don't match exactly or transaction missing
                group.entries.push({
                    type: entry.type,
                    itemType: entry.itemType,
                    weight: entry.weight,
                    touch: entry.touch,
                    pureWeight: (entry.weight || 0) * (entry.touch || 0) / 100
                });
            }
        }
      });

      // Convert map to array and sort
      const sortedItems = Array.from(groupedItems.values()).sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Newest first
      });

      setLedgerCache(prev => new Map(prev.set(customerId, { data: sortedItems, timestamp: now })));
      return sortedItems;
    } catch (error) {
      console.error('Error fetching customer ledger:', error);
      return [];
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    try {
      // Prevent deletion of Expense(Kharch) account
      if (customer.name === 'Expense(Kharch)') {
        showAlert('Cannot Delete', 'The Expense(Kharch) account is a default account and cannot be deleted.');
        return;
      }

      // Set up custom alert
      setCustomerToDelete(customer);
      setDeleteAlertTitle('Delete Customer');
      setDeleteAlertMessage(`Are you sure you want to delete "${customer.name}"? This action cannot be undone.`);
      setDeleteAlertIcon('delete-outline');
      setDeleteAlertVisible(true);
    } catch (error) {
      console.error('Error checking customer transactions:', error);
      setError('Failed to check customer transactions');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!customerToDelete) return;

    try {
      // Delete the customer
      const success = await CustomerService.deleteCustomer(customerToDelete.id);
      
      if (success) {
        // Remove from local state
        setCustomers(prev => prev.filter(c => c.id !== customerToDelete.id));
        setFilteredCustomers(prev => prev.filter(c => c.id !== customerToDelete.id));
        setError(''); // Clear any previous error
      } else {
        setError('Failed to delete customer');
      }
    } catch (error) {
      console.error('Error deleting customer:', error);
      setError('Failed to delete customer');
    } finally {
      // Close the alert
      setDeleteAlertVisible(false);
      setDeleteAlertIcon(undefined);
      setCustomerToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteAlertVisible(false);
    setDeleteAlertIcon(undefined);
    setCustomerToDelete(null);
  };

  const toggleCardExpansion = async (customerId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(customerId)) {
      newExpanded.delete(customerId);
    } else {
      newExpanded.add(customerId);
      // Pre-fetch ledger data when expanding
      await fetchCustomerLedger(customerId);
    }
    setExpandedCards(newExpanded);
  };

  const renderLedgerEntry = (entry: CustomerLedgerItem) => {
    const date = formatFullDate(entry.date);
    
    const receivedAmount = entry.receivedAmount;
    const givenAmount = entry.givenAmount;

    // Money Column Logic
    let moneyContent = <Text style={styles.dashText}>-</Text>;
    let hasMoney = false;
    
    if (receivedAmount > 0) {
      hasMoney = true;
      moneyContent = (
        <View style={styles.moneyCellContent}>
          <View style={[styles.arrowIcon, { backgroundColor: '#E8F5E9' }]}>
             <MaterialCommunityIcons name="arrow-bottom-left" size={16} color="#146C2E" />
          </View>
          <Text style={[styles.moneyText, { color: '#146C2E' }]}>
            ₹{formatIndianNumber(receivedAmount)}
          </Text>
        </View>
      );
    } else if (givenAmount > 0) {
      hasMoney = true;
      moneyContent = (
        <View style={styles.moneyCellContent}>
          <View style={[styles.arrowIcon, { backgroundColor: '#E3F2FD' }]}>
             <MaterialCommunityIcons name="arrow-top-right" size={16} color="#005AC1" />
          </View>
          <Text style={[styles.moneyText, { color: '#005AC1' }]}>
            ₹{formatIndianNumber(givenAmount)}
          </Text>
        </View>
      );
    }

    // Bullion Column Logic
    const bullionEntries: React.ReactNode[] = [];
    
    // Filter and sort entries: Sell first, then Purchase
    // Note: entry.entries already excludes money entries based on fetchCustomerLedger logic
    const sellEntries = entry.entries.filter(e => e.type === 'sell');
    const purchaseEntries = entry.entries.filter(e => e.type === 'purchase');
    
    const sortedMetalEntries = [...sellEntries, ...purchaseEntries];

    if (sortedMetalEntries.length === 0) {
        if (!hasMoney && entry.note) {
            bullionEntries.push(
                <Text key="note" style={[styles.bullionText, { fontStyle: 'italic', color: '#44474F', textAlign: 'center' }]}>
                    {entry.note}
                </Text>
            );
        } else {
            bullionEntries.push(<Text key="empty" style={styles.dashText}>-</Text>);
        }
    } else {
        sortedMetalEntries.forEach((e, index) => {
            const isSell = e.type === 'sell';
            // Sell (Outgoing Goods) -> arrow-top-right (Blue)
            // Purchase (Incoming Goods) -> arrow-bottom-left (Green)
            const arrowIconName = isSell ? 'arrow-top-right' : 'arrow-bottom-left';
            const arrowBg = isSell ? '#E3F2FD' : '#E8F5E9';
            const arrowColor = isSell ? '#005AC1' : '#146C2E';
            
            let details = '';
            
            if (e.itemType === 'rani' || e.itemType === 'rupu') {
                 const weight = e.weight || 0;
                 const touch = e.touch || 100;
                 const cut = e.cut || 0;
                 const effectiveTouch = e.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
                 const pureWeight = (weight * effectiveTouch) / 100;
                 
                 if (e.itemType === 'rani') {
                     if (isSell) {
                         // 3 decimal precision
                         details = `${formatPureGoldPrecise(pureWeight).toFixed(3)}g`;
                     } else {
                         // Purchase: 2 decimal precision (X.YZ0)
                         details = `${(Math.floor(pureWeight * 100) / 100).toFixed(3)}g`;
                     }
                 } else {
                     // Rupu
                     if (isSell) {
                        // Use precision from raniRupuBulkSell screen (usually 1 decimal for silver)
                        details = `${formatPureSilver(pureWeight).toFixed(1)}g`;
                     } else {
                        // Purchase: same as purchase entry in entry screen (integer)
                        details = `${formatPureSilver(pureWeight)}g`;
                     }
                 }
                 
                 const typeName = e.itemType === 'rani' ? 'Rani' : 'Rupu';
                 details = `${typeName} ${details}`;

            } else {
                 // Gold/Silver
                 const isGold = e.itemType.includes('gold');
                 const weight = e.weight || 0;
                 const formattedWeight = isGold ? weight.toFixed(3) : weight.toFixed(1);
                 
                 const typeName = e.itemType === 'gold999' ? 'Gold 999' :
                                  e.itemType === 'gold995' ? 'Gold 995' :
                                  e.itemType === 'silver' ? 'Silver' : e.itemType;
                 
                 details = `${typeName} ${formattedWeight}g`;
            }
            
            bullionEntries.push(
                <View key={index} style={styles.bullionRow}>
                    <View style={[styles.arrowIcon, { backgroundColor: arrowBg }]}>
                        <MaterialCommunityIcons name={arrowIconName} size={16} color={arrowColor} />
                    </View>
                    <Text style={styles.bullionText}>{details}</Text>
                </View>
            );
        });
    }

    return (
      <View style={styles.txnRow}>
        <View style={styles.colDate}> 
          <Text style={styles.dateText}>{date}</Text>
        </View>
        <View style={styles.colMoney}>
          {moneyContent}
        </View>
        <View style={styles.colBullion}>
            {bullionEntries}
        </View>
      </View>
    );
  };

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const isExpanded = expandedCards.has(item.id);
    const ledgerData = ledgerCache.get(item.id)?.data || [];

    // Badge Logic
    const badges: React.ReactNode[] = [];
    
    // Money Balance
    if (item.balance > 0) {
        badges.push(
            <View key="money-bal" style={[styles.badge, styles.badgeGreen]}>
                <Text style={styles.badgeTextGreen}>Bal: ₹{formatIndianNumber(item.balance)}</Text>
            </View>
        );
    } else if (item.balance < 0) {
        badges.push(
            <View key="money-debt" style={[styles.badge, styles.badgeRed]}>
                <Text style={styles.badgeTextRed}>Debt: ₹{formatIndianNumber(Math.abs(item.balance))}</Text>
            </View>
        );
    }

    // Metal Balances
    if (item.metalBalances) {
        Object.entries(item.metalBalances).forEach(([type, balance]) => {
            if (balance && Math.abs(balance) > 0.001) {
                const isGold = type.includes('gold') || type === 'rani';
                const formattedBalance = isGold ? Math.abs(balance).toFixed(3) : Math.floor(Math.abs(balance));
                
                const typeName = type === 'gold999' ? 'Gold999' :
                                 type === 'gold995' ? 'Gold995' :
                                 type === 'rani' ? 'Rani' :
                                 type === 'silver' ? 'Silver' :
                                 type === 'rupu' ? 'Rupu' : type;
                
                const label = `${typeName} ${formattedBalance}g`;
                
                if (balance < 0) {
                    // Debt
                    badges.push(
                        <View key={`metal-${type}`} style={[styles.badge, styles.badgeRed]}>
                            <Text style={styles.badgeTextRed}>Debt: {label}</Text>
                        </View>
                    );
                } else {
                    // Balance (Credit)
                    badges.push(
                        <View key={`metal-${type}`} style={[styles.badge, styles.badgeMetal]}>
                            <Text style={styles.badgeTextMetal}>Bal: {label}</Text>
                        </View>
                    );
                }
            }
        });
    }

    return (
      <View style={styles.customerItemContainer}>
        <TouchableOpacity 
            style={styles.customerMain} 
            onPress={() => toggleCardExpansion(item.id)}
            activeOpacity={0.7}
        >
            <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            </View>
            
            <View style={styles.infoContainer}>
                <Text style={styles.customerName}>{item.name}</Text>
                <View style={styles.statusRow}>
                    {badges}
                </View>
            </View>
            
            <View style={styles.actionsContainer}>
                {areTransactionsChecked && !customersWithTransactions.has(item.id) && (
                    <TouchableOpacity onPress={() => handleDeleteCustomer(item)} style={styles.actionIconBtn}>
                        <MaterialCommunityIcons name="delete-outline" size={20} color="#BA1A1A" />
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => exportCustomerTransactionHistoryToPDF(item)} style={styles.actionIconBtn}>
                    <MaterialCommunityIcons name="share-variant" size={20} color="#44474F" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleCardExpansion(item.id)} style={styles.actionIconBtn}>
                    <MaterialCommunityIcons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#44474F" />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedView}>
            <ScrollView style={styles.scrollableContent}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.colDate]}>Date</Text>
                <Text style={[styles.th, styles.colMoney]}>Money</Text>
                <Text style={[styles.th, styles.colBullion]}>Bullion</Text>
              </View>
              
              {ledgerData.length === 0 ? (
                  <Text style={styles.noLedgerData}>No transactions found</Text>
              ) : (
                  ledgerData.map((entry, index) => (
                      <React.Fragment key={index}>
                          {renderLedgerEntry(entry)}
                      </React.Fragment>
                  ))
              )}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const displayedCustomers = searchQuery.trim() === '' ? customers : filteredCustomers;

  return (
    <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
            <View style={styles.headerLeft}>
                <TouchableOpacity style={styles.backButton} onPress={navigateToSettings}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1B1B1F" />
                </TouchableOpacity>
                <Text style={styles.screenTitle}>Customers</Text>
            </View>
        </View>

        {/* Toolbar Island (Search + Share) */}
        <View style={styles.toolbarIsland}>
            <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={24} color="#44474F" style={styles.searchIcon} />
                <TextInput
                    placeholder="Search customers..."
                    placeholderTextColor="#44474F"
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={styles.searchInput}
                />
            </View>
            <TouchableOpacity style={styles.exportBtn} onPress={exportCustomersToPDF}>
                <MaterialCommunityIcons name="share-variant" size={24} color="#1B1B1F" />
            </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
            {error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : (
                <FlatList
                    data={displayedCustomers}
                    renderItem={renderCustomerItem}
                    keyExtractor={item => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    ListEmptyComponent={
                        <Text style={styles.noResults}>
                            {searchQuery.trim() !== '' ? 'No customers found' : 'No customers yet'}
                        </Text>
                    }
                />
            )}
        </View>

      {/* Delete Confirmation Alert */}
      <CustomAlert
        visible={deleteAlertVisible}
        title={deleteAlertTitle}
        message={deleteAlertMessage}
        icon={deleteAlertIcon}
        buttons={[
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: handleDeleteCancel,
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: handleDeleteConfirm,
          },
        ]}
        onDismiss={handleDeleteCancel}
      />
    </SafeAreaView>
  );
};

// Debounce utility function
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // --background
  },
  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F4F7', // Match background
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3E7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#1B1B1F', // --on-surface
    letterSpacing: -1,
  },
  // Toolbar Island
  toolbarIsland: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  exportBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  // Search
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 50,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Outfit_400Regular',
    fontSize: 16,
    color: '#1B1B1F', // on-surface
  },
  // List
  listContainer: {
    flex: 1,
  },
  customerItemContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0E2E5', // outline
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  customerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#005AC1', // primary
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontFamily: 'Outfit_600SemiBold',
  },
  infoContainer: {
    flex: 1,
    gap: 4,
  },
  customerName: {
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F', // on-surface
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeGreen: {
    backgroundColor: '#E6F4EA',
  },
  badgeRed: {
    backgroundColor: '#FFDAD6',
  },
  badgeMetal: {
    backgroundColor: '#E6F4EA', // Same as badgeGreen
  },
  badgeTextGreen: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: '#146C2E',
  },
  badgeTextRed: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: '#BA1A1A',
  },
  badgeTextMetal: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: '#146C2E', // Same as badgeTextGreen
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionIconBtn: {
    padding: 8,
  },
  // Expanded View
  expandedView: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  scrollableContent: {
    maxHeight: 300,
  },
  tableHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  th: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: '#44474F', // on-surface-variant
    textTransform: 'uppercase',
  },
  colDate: { width: '25%' },
  colMoney: { width: '30%', textAlign: 'center' },
  colBullion: { flex: 1, textAlign: 'center' },
  
  txnRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
  },
  dateText: {
    color: '#44474F',
    fontSize: 12,
    fontFamily: 'Outfit_500Medium',
  },
  moneyCellContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  moneyText: {
    fontSize: 13,
    fontFamily: 'Outfit_600SemiBold',
  },
  arrowIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bullionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bullionText: {
    color: '#1B1B1F',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular',
  },
  dashText: {
    textAlign: 'center',
    color: '#44474F',
  },
  noLedgerData: {
    textAlign: 'center',
    color: '#44474F',
    fontSize: 14,
    padding: 16,
    fontFamily: 'Outfit_400Regular',
  },
  noResults: {
    textAlign: 'center',
    color: '#44474F',
    marginTop: 32,
    fontFamily: 'Outfit_500Medium',
  },
  errorText: {
    textAlign: 'center',
    color: '#BA1A1A',
    marginTop: 32,
    fontFamily: 'Outfit_500Medium',
  },
});
