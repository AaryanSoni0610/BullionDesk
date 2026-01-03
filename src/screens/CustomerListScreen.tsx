import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  BackHandler,
} from 'react-native';
import {
  Surface,
  Searchbar,
  List,
  Text,
  Avatar,
  IconButton,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Customer, LedgerEntry } from '../types';
import { theme } from '../theme';
import { CustomerService } from '../services/customer.service';
import { LedgerService } from '../services/ledger.service';
import { TransactionService } from '../services/transaction.service';
import { formatFullDate, formatIndianNumber, formatPureGoldPrecise, formatPureSilver, customFormatPureSilver } from '../utils/formatting';
import { useAppContext } from '../context/AppContext';
import * as FileSystem from 'expo-file-system';
import CustomAlert from '../components/CustomAlert';

export const CustomerListScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [ledgerCache, setLedgerCache] = useState<Map<string, { data: LedgerEntry[], timestamp: number }>>(new Map());
  const [customersWithTransactions, setCustomersWithTransactions] = useState<Set<string>>(new Set());
  const [areTransactionsChecked, setAreTransactionsChecked] = useState(false);
  const [deleteAlertVisible, setDeleteAlertVisible] = useState(false);
  const [deleteAlertTitle, setDeleteAlertTitle] = useState('');
  const [deleteAlertMessage, setDeleteAlertMessage] = useState('');
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
                <th colspan="2">Gold</th>
                <th colspan="2">Silver</th>
                <th colspan="2">Money</th>
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
                  <td class="balance">${row.goldBalance}</td>
                  <td class="debt">${row.goldDebt}</td>
                  <td class="balance">${row.silverBalance}</td>
                  <td class="debt">${row.silverDebt}</td>
                  <td class="balance">${row.moneyBalance}</td>
                  <td class="debt">${row.moneyDebt}</td>
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
                if (entry.amountReceived > 0) {
                    moneyHtml = `<span style="color: #2e7d32;">↙️ ₹${formatIndianNumber(entry.amountReceived)}</span>`; // Green
                } else if (entry.amountGiven > 0) {
                    moneyHtml = `<span style="color: #1976d2;">↗️ ₹${formatIndianNumber(entry.amountGiven)}</span>`; // Blue
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

  const fetchCustomerLedger = async (customerId: string): Promise<LedgerEntry[]> => {
    const now = Date.now();
    // Removed cache check to ensure fresh data
    
    try {
      // Fetch both ledger entries and transactions for this customer directly from database
      const [moneyLedgerEntries, customerTransactions] = await Promise.all([
        LedgerService.getLedgerEntriesByCustomerId(customerId),
        TransactionService.getTransactionsByCustomerId(customerId)
      ]);

      // Get metal transactions and convert them to ledger-like entries
      const metalLedgerEntries: LedgerEntry[] = [];

      // Create a set of transaction IDs that are already in moneyLedgerEntries
      const existingTransactionIds = new Set(moneyLedgerEntries.map(entry => entry.transactionId));

      customerTransactions.forEach(transaction => {
        // Skip if this transaction is already represented in moneyLedgerEntries
        if (existingTransactionIds.has(transaction.id)) {
            return;
        }

        // Only include transactions that have entries (exclude money-only)
        const hasEntries = transaction.entries && transaction.entries.length > 0;

        if (hasEntries) {
          // Create a ledger-like entry for transactions with entries
          const metalEntry: LedgerEntry = {
            id: `metal_${transaction.id}`,
            transactionId: transaction.id,
            customerId: transaction.customerId,
            customerName: transaction.customerName,
            date: transaction.date,
            amountReceived: 0, // Metal transactions don't involve money
            amountGiven: 0,
            entries: transaction.entries, // Include all transaction entries
            createdAt: transaction.createdAt
          };

          metalLedgerEntries.push(metalEntry);
        }
      });

      // Combine money and metal entries
      const allCustomerEntries = [...moneyLedgerEntries, ...metalLedgerEntries];

      // Sort by date (newest first), then by type (metal before money)
      const sortedEntries = allCustomerEntries.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();

        if (dateA !== dateB) {
          return dateB - dateA; // Newest first
        }

        // Within same date, prioritize metal entries over money entries
        const aHasMetal = a.entries.some(entry => entry.type !== 'money');
        const bHasMetal = b.entries.some(entry => entry.type !== 'money');

        if (aHasMetal && !bHasMetal) return -1;
        if (!aHasMetal && bHasMetal) return 1;

        return 0;
      });

      // Cache the result
      setLedgerCache(prev => new Map(prev.set(customerId, { data: sortedEntries, timestamp: now })));

      return sortedEntries;
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
      setCustomerToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteAlertVisible(false);
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

  const renderLedgerEntry = (entry: LedgerEntry) => {
    const date = formatFullDate(entry.date);
    
    // Money Column Logic
    let moneyText = '';
    let moneyColor = theme.colors.onSurface;
    let moneyFlowArrow = '';
    
    if (entry.amountReceived > 0) {
      moneyText = `₹${formatIndianNumber(entry.amountReceived)}`;
      moneyColor = theme.colors.sellColor; // Green
      moneyFlowArrow = '↙️';
    } else if (entry.amountGiven > 0) {
      moneyText = `₹${formatIndianNumber(entry.amountGiven)}`;
      moneyColor = theme.colors.primary; // Blue
      moneyFlowArrow = '↗️';
    }

    // Bullion Column Logic
    const bullionEntries: React.ReactNode[] = [];
    
    // Filter and sort entries: Sell first, then Purchase
    const metalEntries = entry.entries.filter(e => e.type !== 'money');
    const sellEntries = metalEntries.filter(e => e.type === 'sell');
    const purchaseEntries = metalEntries.filter(e => e.type === 'purchase');
    
    const sortedMetalEntries = [...sellEntries, ...purchaseEntries];

    sortedMetalEntries.forEach((e, index) => {
        const isSell = e.type === 'sell';
        const arrow = isSell ? '↗️' : '↙️';
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
            <Text key={index} variant="bodySmall" style={{ color: theme.colors.onSurface }}>
                {arrow} {details}
            </Text>
        );
    });

    return (
      <View style={styles.transactionRow}>
        <View style={[styles.transactionCell, { flex: 0.8 }]}> 
          <Text variant="bodySmall" style={styles.transactionDate}>
            {date}
          </Text>
        </View>
        <View style={[styles.transactionCell, { flex: 1 }]}>
          <Text variant="bodySmall" style={[styles.transactionAmount, { color: moneyColor, textAlign: 'center' }]}>
            {moneyFlowArrow} {moneyText}
          </Text>
        </View>
        <View style={[styles.transactionCell, { flex: 1 }]}>
            {bullionEntries}
        </View>
      </View>
    );
  };

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const isExpanded = expandedCards.has(item.id);
    const ledgerData = ledgerCache.get(item.id)?.data || [];

    return (
      <View>
        <List.Item
          title={item.name}
          description={formatMetalBalances(item)}
          titleStyle={styles.customerName}
          descriptionStyle={styles.customerBalance}
          left={() => (
            <Avatar.Text
              size={36}
              label={getInitials(item.name)}
              style={styles.avatar}
              labelStyle={[styles.avatarLabel, {fontFamily: 'Outfit_500Medium'}]}
            />
          )}
          right={() => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {areTransactionsChecked && !customersWithTransactions.has(item.id) && (
                <IconButton
                  icon="delete-outline"
                  size={18}
                  onPress={() => handleDeleteCustomer(item)}
                  style={{ marginRight: -5, marginTop: 0, marginBottom: 0 }}
                  iconColor={theme.colors.error}
                />
              )}
              <IconButton
                icon="tray-arrow-up"
                size={18}
                onPress={() => exportCustomerTransactionHistoryToPDF(item)}
                style={{ marginRight: -5, marginTop: 0, marginBottom: 0 }}
              />
              <IconButton
                icon={isExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                onPress={() => toggleCardExpansion(item.id)}
                style={styles.expandButton}
              />
            </View>
          )}
          onPress={() => toggleCardExpansion(item.id)}
          style={styles.customerItem}
        />

        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Transaction Header */}
            <View style={styles.transactionHeader}>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'left', flex: 0.8 }]}>
                Date
              </Text>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'center', flex: 1, paddingRight: 10 }]}>
                Money
              </Text>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'left', flex: 1 }]}>
                Bullion
              </Text>
            </View>

            {/* Transaction Table */}
            <ScrollView style={styles.transactionTable} nestedScrollEnabled={true}>
              {ledgerData.length > 0 ? (
                ledgerData.map((entry, index) => (
                  <View key={`${entry.id}-${index}`}>
                    {renderLedgerEntry(entry)}
                  </View>
                ))
              ) : (
                <Text style={styles.noLedgerData}>No transactions found</Text>
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
        {/* App Title Bar */}
        <Surface style={styles.appTitleBar} elevation={1}>
            <View style={styles.appTitleContent}>
            <IconButton
                icon="arrow-left"
                size={20}
                onPress={navigateToSettings}
                style={styles.backButton}
            />
            <Text variant="titleLarge" style={styles.appTitle}>
                Customers
            </Text>
            <IconButton
                icon="tray-arrow-up"
                size={24}
                onPress={exportCustomersToPDF}
                style={styles.exportButton}
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

        {error ? (
          <Text variant="bodyMedium" style={styles.errorText}>
            {error}
          </Text>
        ) : (
          <FlatList
            data={displayedCustomers}
            renderItem={renderCustomerItem}
            keyExtractor={item => item.id}
            style={styles.customerList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            ItemSeparatorComponent={() => <Divider />}
            ListEmptyComponent={
              searchQuery.trim() !== '' ? (
                <Text variant="bodyMedium" style={styles.noResults}>
                  No customers found
                </Text>
              ) : (
                <Text variant="bodyMedium" style={styles.noResults}>
                  No customers yet
                </Text>
              )
            }
          />
        )}
      </View>

      {/* Delete Confirmation Alert */}
      <CustomAlert
        visible={deleteAlertVisible}
        title={deleteAlertTitle}
        message={deleteAlertMessage}
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
    backgroundColor: theme.colors.background,
  },
  appTitleBar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.xs,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Outfit_700Bold',
    flex: 1,
  },
  backButton: {
    marginRight: theme.spacing.sm,
  },
  exportButton: {
    margin: 0,
    marginRight: 10
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  searchBar: {
    marginHorizontal: theme.spacing.xs,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    elevation: 0,
    backgroundColor: theme.colors.surfaceVariant,
  },
  customerList: {
    flex: 1,
  },
  customerItem: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
  },
  customerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: theme.colors.primary,
    marginLeft: 10,
    marginRight: 0,
  },
  avatarLabel: {
    color: theme.colors.onPrimary,
    fontSize: 16,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    color: theme.colors.onSurface,
    fontWeight: '500',
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
    marginTop: -10,
  },
  customerBalance: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    marginTop: 2,
    fontFamily: 'Outfit_400Regular',
  },
  historyButton: {
    margin: 0,
  },
  noResults: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    marginTop: 32,
  },
  errorText: {
    textAlign: 'center',
    color: theme.colors.error,
    marginTop: 32,
  },
  expandButton: {
    marginRight: -10,
    marginTop: 0,
    marginBottom: 0,
  },
  expandedContent: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    elevation: theme.elevation.level1,
  },
  transactionTable: {
    maxHeight: 200,
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
    fontFamily: 'Outfit_700Bold',
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
  transactionDate: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
  },
  transactionType: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
  },
  transactionAmount: {
    fontFamily: 'Outfit_500Medium',
    color: theme.colors.onSurface,
    fontSize: 14,
  },
  noLedgerData: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    marginTop: 0,
    padding: theme.spacing.sm,
    fontFamily: 'Outfit_400Regular',

  },
});
