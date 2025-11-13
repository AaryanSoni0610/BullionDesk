import React, { useState, useEffect, useCallback } from 'react';
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
import { formatFullDate, formatIndianNumber } from '../utils/formatting';
import { useAppContext } from '../context/AppContext';
import * as FileSystem from 'expo-file-system';

export const CustomerListScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [ledgerCache, setLedgerCache] = useState<Map<string, { data: LedgerEntry[], timestamp: number }>>(new Map());

  const { navigateToSettings } = useAppContext();

  // Debounced search function with database-level filtering
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (query.trim() === '') {
        setFilteredCustomers([]);
      } else {
        try {
          // Use database-level filtering for better performance
          const filtered = await CustomerService.searchCustomersByName(query.trim());
          setFilteredCustomers(filtered);
        } catch (error) {
          console.error('Error searching customers:', error);
          setFilteredCustomers([]);
        }
      }
    }, 300),
    []
  );

  // Load all customers initially (removed - only load on search now)
  useEffect(() => {
    // Initialize with empty list - customers load on search
    setCustomers([]);
    setFilteredCustomers([]);
  }, []);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

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

  const exportCustomersToPDF = async () => {
    try {
      // Prepare data for PDF - export all customers with debt/balance
      const pdfData: Array<{customer: string, balance: string, debt: string}> = [];
      
      // Filter customers to only include those with debt/balance
      const customersWithBalances = customers.filter(customer => {
        // Check money balance
        if (customer.balance !== 0) return true;
        
        // Check metal balances
        const metalBalances = customer.metalBalances || {};
        return Object.values(metalBalances).some(balance => balance && Math.abs(balance) > 0.001);
      });
      
      customersWithBalances.forEach(customer => {
        const metalBalances = customer.metalBalances || {};
        
        // Process money balance/debt
        if (customer.balance > 0) {
          pdfData.push({
            customer: customer.name,
            balance: `₹${formatIndianNumber(Math.abs(customer.balance))}`,
            debt: ''
          });
        } else if (customer.balance < 0) {
          pdfData.push({
            customer: customer.name,
            balance: '',
            debt: `₹${formatIndianNumber(Math.abs(customer.balance))}`
          });
        }
        
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
            
            if (balance > 0) {
              pdfData.push({
                customer: customer.name,
                balance: balanceText,
                debt: ''
              });
            } else {
              pdfData.push({
                customer: customer.name,
                balance: '',
                debt: balanceText
              });
            }
          }
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
                <th>Customer</th>
                <th>Balance</th>
                <th>Debt</th>
              </tr>
            </thead>
            <tbody>
              ${pdfData.map(row => `
                <tr>
                  <td class="customer-name">${row.customer}</td>
                  <td class="balance">${row.balance}</td>
                  <td class="debt">${row.debt}</td>
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
                <th>Type</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerData.map(entry => {
                const date = formatFullDate(entry.date);
                let transactionType = '';
                let details = '';

                if (entry.amountReceived > 0) {
                  transactionType = 'Receive';
                  details = `₹${formatIndianNumber(entry.amountReceived)}`;
                } else if (entry.amountGiven > 0) {
                  transactionType = 'Give';
                  details = `₹${formatIndianNumber(entry.amountGiven)}`;
                } else {
                  const hasSell = entry.entries.some(e => e.type === 'sell');
                  const hasPurchase = entry.entries.some(e => e.type === 'purchase');

                  if (hasSell) {
                    transactionType = 'Sell';
                  } else if (hasPurchase) {
                    transactionType = 'Purchase';
                  }

                  const metalDetails: string[] = [];
                  entry.entries.forEach(e => {
                    if (e.type !== 'money') {
                      const isGold = e.itemType.includes('gold') || e.itemType === 'rani';
                      const weight = isGold ? e.weight?.toFixed(3) : Math.floor(e.weight || 0).toFixed(1);
                      const typeName = e.itemType === 'gold999' ? 'Gold 999' :
                                      e.itemType === 'gold995' ? 'Gold 995' :
                                      e.itemType === 'rani' ? 'Rani' :
                                      e.itemType === 'silver' ? 'Silver' :
                                      e.itemType === 'rupu' ? 'Rupu' : e.itemType;
                      const detail = `${typeName} ${weight}g`;
                      metalDetails.push(detail);
                    }
                  });
                  details = metalDetails.join(', ');
                }

                return `
                  <tr>
                    <td>${date}</td>
                    <td>${transactionType}</td>
                    <td>${details}</td>
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
    const CACHE_DURATION = 60000; // 1 minute

    // Check cache first
    const cached = ledgerCache.get(customerId);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }

    try {
      // Fetch both ledger entries and transactions for this customer directly from database
      const [moneyLedgerEntries, customerTransactions] = await Promise.all([
        LedgerService.getLedgerEntriesByCustomerId(customerId),
        TransactionService.getTransactionsByCustomerId(customerId)
      ]);

      // Get metal transactions and convert them to ledger-like entries
      const metalLedgerEntries: LedgerEntry[] = [];

      customerTransactions.forEach(transaction => {
        // Only include transactions that have metal entries (not money-only)
        const hasMetalEntries = transaction.entries.some(entry => entry.type !== 'money');

        if (hasMetalEntries) {
          // Create a ledger-like entry for metal transactions
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
    let transactionType = '';
    let details = '';

    // Determine transaction type and details
    if (entry.amountReceived > 0) {
      transactionType = 'Receive';
      details = `₹${formatIndianNumber(entry.amountReceived)}`;
    } else if (entry.amountGiven > 0) {
      transactionType = 'Give';
      details = `₹${formatIndianNumber(entry.amountGiven)}`;
    } else {
      // Metal transaction - check entries for type
      const hasSell = entry.entries.some(e => e.type === 'sell');
      const hasPurchase = entry.entries.some(e => e.type === 'purchase');

      if (hasSell) {
        transactionType = 'Sell';
      } else if (hasPurchase) {
        transactionType = 'Purchase';
      }

      // Get metal details
      const metalDetails: string[] = [];
      entry.entries.forEach(e => {
        if (e.type !== 'money') {
          const isGold = e.itemType.includes('gold') || e.itemType === 'rani';
          const weight = isGold ? e.weight?.toFixed(3) : Math.floor(e.weight || 0).toFixed(1);
          const typeName = e.itemType === 'gold999' ? 'Gold 999' :
                          e.itemType === 'gold995' ? 'Gold 995' :
                          e.itemType === 'rani' ? 'Rani' :
                          e.itemType === 'silver' ? 'Silver' :
                          e.itemType === 'rupu' ? 'Rupu' : e.itemType;
          const detail = `${typeName} ${weight}g`;
          metalDetails.push(detail);
        }
      });
      details = metalDetails.join(', ');
    }

    return (
      <View style={styles.transactionRow}>
        <View style={styles.transactionCell}>
          <Text variant="bodyMedium" style={styles.transactionDate}>
            {date}
          </Text>
        </View>
        <View style={styles.transactionCell}>
          <Text variant="bodyMedium" style={[styles.transactionType, { textAlign: 'center' }]}>
            {transactionType}
          </Text>
        </View>
        <View style={styles.transactionCell}>
          <Text variant="bodyMedium" style={[styles.transactionAmount, { textAlign: 'right' }]}>
            {details}
          </Text>
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
              labelStyle={[styles.avatarLabel, {fontFamily: 'Roboto_500Medium'}]}
            />
          )}
          right={() => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'left' }]}>
                Date
              </Text>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'center' }]}>
                Type
              </Text>
              <Text variant="bodyMedium" style={[styles.transactionHeaderText, { textAlign: 'right' }]}>
                Details
              </Text>
            </View>

            {/* Transaction Table */}
            <ScrollView style={styles.transactionTable}>
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
    fontFamily: 'Roboto_700Bold',
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
    marginTop: theme.spacing.sm,
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
    fontFamily: 'Roboto_500Medium',
    marginTop: -10,
  },
  customerBalance: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    marginTop: 2,
    fontFamily: 'Roboto_400Regular',
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
    fontFamily: 'Roboto_500Medium',
    color: theme.colors.onSurface,
    fontSize: 14,
  },
  noLedgerData: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    marginTop: 0,
    padding: theme.spacing.sm,
    fontFamily: 'Roboto_400Regular',

  },
});