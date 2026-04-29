import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  BackHandler,
  TouchableOpacity,
  TextInput,
  InteractionManager,
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
import { RateCutService } from '../services/rateCut.service';
import { formatFullDate, formatIndianNumber, formatPureGoldPrecise, formatPureSilver, customFormatPureSilver } from '../utils/formatting';
import { useAppContext } from '../context/AppContext';
import * as FileSystem from 'expo-file-system';
import CustomAlert from '../components/CustomAlert';
import { AnimatedAccordion } from '../components/AnimatedAccordion';
import { InventoryInputDialog } from '../components/InventoryInputDialog';
import { CustomerSelectionModal } from '../components/CustomerSelectionModal';

// Define a local interface for display purposes
interface CustomerLedgerItem {
  id: string;
  transactionId: string;
  date: string;
  receivedAmount: number;
  givenAmount: number;
  entries: any[]; // Using any[] to accommodate TransactionEntry structure
  note?: string;
  isRateCut?: boolean;
  rateCutData?: {
    metalType: 'gold999' | 'gold995' | 'silver';
    weight: number;
    rate: number;
    totalAmount: number;
  };
}

const EMPTY_LEDGER_ARRAY: CustomerLedgerItem[] = [];
// ── Memoized row component ────────────────────────────────────────────────────
// Defined outside the screen so React.memo can do a shallow-prop comparison.
// When the user taps a customer, only THAT row's props change (isExpanded /
// ledgerData). Every other row bails out immediately → zero wasted re-renders.
type CustomerRowProps = {
  item: Customer;
  isExpanded: boolean;
  ledgerData: any[];
  isLoadingLedger: boolean;
  areTransactionsChecked: boolean;
  customersWithTransactions: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (c: Customer) => void;
  onExport: (c: Customer) => void;
  renderLedgerEntry: (entry: any) => React.ReactNode;
};

const CustomerRow = memo(({
  item,
  isExpanded,
  ledgerData,
  isLoadingLedger,
  areTransactionsChecked,
  customersWithTransactions,
  onToggle,
  onDelete,
  onExport,
  renderLedgerEntry,
}: CustomerRowProps) => {
  // Badge logic
  const badges: React.ReactNode[] = [];

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

  if (item.metalBalances) {
    Object.entries(item.metalBalances).forEach(([type, balance]) => {
      if (balance && Math.abs(balance) > 0.001) {
        const isGold = type.includes('gold') || type === 'rani';
        const formattedBalance = isGold ? Math.abs(balance).toFixed(3) : Math.floor(Math.abs(balance));
        if (parseFloat(formattedBalance.toString()) === 0) return;

        const typeName = type === 'gold999' ? 'Gold999' :
          type === 'gold995' ? 'Gold995' :
            type === 'rani' ? 'Rani' :
              type === 'silver' ? 'Silver' :
                type === 'rupu' ? 'Rupu' : type;

        const label = `${typeName} ${formattedBalance}g`;

        if (balance < 0) {
          badges.push(
            <View key={`metal-${type}`} style={[styles.badge, styles.badgeRed]}>
              <Text style={styles.badgeTextRed}>Debt: {label}</Text>
            </View>
          );
        } else {
          badges.push(
            <View key={`metal-${type}`} style={[styles.badge, styles.badgeMetal]}>
              <Text style={styles.badgeTextMetal}>Bal: {label}</Text>
            </View>
          );
        }
      }
    });
  }

  const initials = item.name
    .split(' ')
    .map(w => w.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.customerItemContainer}>
      <TouchableOpacity
        style={styles.customerMain}
        onPress={() => onToggle(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.customerName}>{item.name}</Text>
          <View style={styles.statusRow}>{badges}</View>
        </View>

        <View style={styles.actionsContainer}>
          {areTransactionsChecked && !customersWithTransactions.has(item.id) && (
            <TouchableOpacity onPress={() => onDelete(item)} style={styles.actionIconBtn}>
              <MaterialCommunityIcons name="delete-outline" size={22} color="#BA1A1A" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onExport(item)} style={styles.actionIconBtn}>
            <MaterialCommunityIcons name="export-variant" size={20} color="#44474F" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onToggle(item.id)} style={styles.actionIconBtn}>
            <MaterialCommunityIcons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#44474F" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <AnimatedAccordion isExpanded={isExpanded}>
        <View style={styles.expandedView}>
          {isExpanded && (
            <ScrollView style={styles.scrollableContent} nestedScrollEnabled={true}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.colDate]}>Date</Text>
                <Text style={[styles.th, styles.colMoney]}>Money</Text>
                <Text style={[styles.th, styles.colBullion]}>Bullion</Text>
              </View>

              {isLoadingLedger && ledgerData.length === 0 ? (
                <Text style={styles.noLedgerData}>Loading transactions...</Text>
              ) : ledgerData.length === 0 ? (
                <Text style={styles.noLedgerData}>No transactions found</Text>
              ) : (
                // Render cap: 20 rows max to keep mount cost low
                ledgerData.slice(0, 20).map((entry, index) => (
                  <React.Fragment key={index}>
                    {renderLedgerEntry(entry)}
                  </React.Fragment>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </AnimatedAccordion>
    </View>
  );
});

export const CustomerListScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string>('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [ledgerCache, setLedgerCache] = useState<Map<string, { data: CustomerLedgerItem[], timestamp: number }>>(new Map());
  const [customersWithTransactions, setCustomersWithTransactions] = useState<Set<string>>(new Set());
  const [areTransactionsChecked, setAreTransactionsChecked] = useState(false);
  const [deleteAlertVisible, setDeleteAlertVisible] = useState(false);
  const [deleteAlertTitle, setDeleteAlertTitle] = useState('');
  const [deleteAlertMessage, setDeleteAlertMessage] = useState('');
  const [deleteAlertIcon, setDeleteAlertIcon] = useState<string | undefined>(undefined);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  // NOTE: isLoadingLedger is intentionally NOT a component-level state anymore.
  // It was causing a full-screen re-render (and React.memo bypass on every row)
  // every time a fetch started/finished. Loading state is now derived per-row
  // inside renderCustomerItem by checking if the cache entry is absent.

  // Quick-add state
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showBalancesDialog, setShowBalancesDialog] = useState(false);
  const [pendingCustomerId, setPendingCustomerId] = useState<string>('');
  const [pendingCustomerName, setPendingCustomerName] = useState<string>('');

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

  const expandedCardIdRef = useRef(expandedCardId);
  useEffect(() => {
    expandedCardIdRef.current = expandedCardId;
  }, [expandedCardId]);

  // A ref mirror of ledgerCache so fetchCustomerLedger (useCallback) can always
  // read the latest cache without capturing a stale closure value.
  const ledgerCacheRef = useRef(ledgerCache);
  useEffect(() => {
    ledgerCacheRef.current = ledgerCache;
  }, [ledgerCache]);

  // A stable ref to fetchCustomerLedger so useFocusEffect (defined before the
  // function declaration) can call it without a "used before declaration" error.
  // The ref is kept up-to-date by the useEffect below fetchCustomerLedger.
  const fetchCustomerLedgerRef = useRef<(id: string) => Promise<CustomerLedgerItem[]>>(() => Promise.resolve([]));

  // Load all customers on focus and refresh expanded cards
  useFocusEffect(
    useCallback(() => {
      loadAllCustomers();
      // Refresh ledger data for the open card (bypass cache so data is fresh on re-focus)
      if (expandedCardIdRef.current) {
        // Clear cached entry so fetchCustomerLedger skips the TTL guard on re-focus
        setLedgerCache(prev => {
          const next = new Map(prev);
          next.delete(expandedCardIdRef.current!);
          return next;
        });
        fetchCustomerLedgerRef.current(expandedCardIdRef.current);
      }
    }, []) // stable: only reads refs, never stale
  );

  const loadAllCustomers = async () => {
    try {
      setAreTransactionsChecked(false);
      const allCustomers = await CustomerService.getAllCustomers();
      setCustomers(allCustomers);
      setFilteredCustomers(allCustomers); // Initially show all customers

      const customersWithTxnsSet = await TransactionService.getCustomersWithTransactions();
      setCustomersWithTransactions(customersWithTxnsSet);
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

  const exportCustomersToPDF = async () => {
    try {
      // Load all customers for PDF export (not just searched ones)
      const allCustomers = await CustomerService.getAllCustomers();

      // Prepare data for PDF - export all customers with debt/balance
      const pdfData: Array<{ customer: string, goldBalance: string, goldDebt: string, silverBalance: string, silverDebt: string, moneyBalance: string, moneyDebt: string }> = [];

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

  const exportCustomerTransactionHistoryToPDF = useCallback(async (customer: Customer) => {
    try {
      // ALWAYS fetch detailed data explicitly for the PDF, ignoring UI cache
      const ledgerData = await fetchDetailedLedgerForPDF(customer.id);

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
                <th style="width:30%">Date</th>
                <th style="width:30%">Money</th>
                <th style="width:40%">Bullion</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerData.map(entry => {
        const date = formatFullDate(entry.date);

        // Handle rate cut entries
        if (entry.isRateCut && entry.rateCutData) {
          const { metalType, weight, rate } = entry.rateCutData;
          const isGold = metalType.includes('gold');
          const formattedWeight = isGold ? Math.abs(weight).toFixed(3) : Math.abs(weight).toFixed(1);
          const metalName = metalType === 'gold999' ? 'Gold 999' :
            metalType === 'gold995' ? 'Gold 995' :
              metalType === 'silver' ? 'Silver' : metalType;
          let metalValue = (parseFloat(formattedWeight) * rate);
          if (metalType === 'silver') {
            metalValue /= 1000; // Silver rate is per kg
          } else {
            metalValue /= 10; // Gold rate is per 10g
          }

          // Determine color based on balance vs debt
          const isBalanceReduction = weight > 0;
          const textColor = isBalanceReduction ? '#2e7d32' : '#d32f2f';

          return `
                    <tr>
                      <td>${date}</td>
                      <td colspan="2" style="text-align: center; color: ${textColor};">
                        Rate Cut: ${metalName} ${formattedWeight}g x ₹${formatIndianNumber(rate)} => ₹${formatIndianNumber(metalValue)}
                      </td>
                    </tr>
                  `;
        }

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
            let pureWeight = weight * touch / 100;
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
  }, []);

  // Per-row loading state: tracks which customerId is currently being fetched.
  // Using a ref (not useState) so flipping it never triggers a component re-render.
  // The FlatList row that needs to show a spinner derives it from ledgerCache absence.
  const fetchingCustomerIdRef = useRef<string | null>(null);

  // ── Fast UI fetch: uses only LedgerService (no TransactionService) ──────────
  // KEY FIXES vs previous version:
  //   1. Wrapped in useCallback so its reference is stable → toggleCardExpansion
  //      and renderCustomerItem keep their stable references → React.memo works.
  //   2. Cache-hit check at the top: second open is instant (no DB call at all).
  //   3. Uses ledgerCacheRef to read latest cache state without a stale closure.
  //   4. Cache writes use the functional updater form (new Map each time) so React
  //      sees a genuinely new reference and rerenders the affected row only.
  const fetchCustomerLedger = useCallback(async (customerId: string): Promise<CustomerLedgerItem[]> => {
    const now = Date.now();
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL

    // ✅ CHECK CACHE FIRST — makes every repeat open instant
    const cached = ledgerCacheRef.current.get(customerId);
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      return cached.data;
    }

    // Guard: don't fire duplicate fetches for the same customer
    if (fetchingCustomerIdRef.current === customerId) return [];
    fetchingCustomerIdRef.current = customerId;

    try {
      // 1. Fetch ONLY Ledger and RateCuts - Lightning Fast!
      const [ledgerEntries, rateCuts] = await Promise.all([
        LedgerService.getLedgerEntriesByCustomerId(customerId),
        RateCutService.getRateCutHistory(customerId, 1000, 0)
      ]);

      const groupedItems = new Map<string, CustomerLedgerItem>();

      // 2. Process ledger entries directly
      ledgerEntries.forEach(entry => {
        // Fast date grouping: slice 'YYYY-MM-DDTHH:mm' to group by minute
        const minuteString = entry.date.substring(0, 16);
        const key = `${entry.transactionId}_${minuteString}`;

        if (!groupedItems.has(key)) {
          groupedItems.set(key, {
            id: key,
            transactionId: entry.transactionId,
            date: entry.date,
            receivedAmount: 0,
            givenAmount: 0,
            entries: [],
            note: undefined // Not displayed in UI accordion
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
          // Metal entry: entry.weight IS already the pureWeight from sync logic.
          // Do NOT apply touch/cut math here — that would double-shrink the value.
          group.entries.push({
            type: entry.type,
            itemType: entry.itemType,
            weight: entry.weight,
          });
        }
      });

      const ledgerItems = Array.from(groupedItems.values());

      // 3. Add Rate Cuts and Sort
      const rateCutItems: CustomerLedgerItem[] = rateCuts.map(rc => ({
        id: rc.id,
        transactionId: rc.id,
        date: new Date(rc.cut_date).toISOString(),
        receivedAmount: 0,
        givenAmount: 0,
        entries: [],
        isRateCut: true,
        rateCutData: {
          metalType: rc.metal_type,
          weight: rc.weight_cut,
          rate: rc.rate,
          totalAmount: rc.total_amount
        }
      }));

      const allItems = [...ledgerItems, ...rateCutItems];
      const sortedItems = allItems.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Newest first
      });

      // ✅ Functional updater creates a NEW Map reference each time — React sees
      //    the change and rerenders only the row whose ledgerData just arrived.
      //    Cap cache at 10 customers to prevent memory bloat.
      setLedgerCache(prev => {
        const next = new Map(prev);
        if (next.size >= 10) {
          const oldestKey = next.keys().next().value;
          if (oldestKey) next.delete(oldestKey);
        }
        next.set(customerId, { data: sortedItems, timestamp: now });
        return next;
      });

      return sortedItems;
    } catch (error) {
      console.error('Error fetching customer ledger:', error);
      return [];
    } finally {
      fetchingCustomerIdRef.current = null;
    }
  }, []); // ✅ Empty deps: function reference is permanently stable

  // Keep the ref in sync so useFocusEffect (declared above) always calls the
  // real implementation even though it can't reference it directly.
  fetchCustomerLedgerRef.current = fetchCustomerLedger;

  // ── Heavy PDF fetch: uses TransactionService for full gross/touch/cut detail ─
  // This is the ONLY place TransactionService should be called in this screen.
  // It intentionally bypasses the UI cache so it never pollutes it.
  const fetchDetailedLedgerForPDF = async (customerId: string): Promise<CustomerLedgerItem[]> => {
    try {
      const [ledgerEntries, customerTransactions, rateCuts] = await Promise.all([
        LedgerService.getLedgerEntriesByCustomerId(customerId),
        TransactionService.getTransactionsByCustomerId(customerId),
        RateCutService.getRateCutHistory(customerId, 1000, 0)
      ]);

      const transactionMap = new Map(customerTransactions.map(t => [t.id, t]));
      const groupedItems = new Map<string, CustomerLedgerItem>();

      ledgerEntries.forEach(entry => {
        // Group by transactionId + formatted date (rounded to minute)
        // This ensures entries created at the same time (same minute) are grouped together
        const formattedTime = entry.date.substring(0, 16);
        const key = `${entry.transactionId}_${formattedTime}`;

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
          const transaction = transactionMap.get(entry.transactionId);
          if (transaction && transaction.date === entry.date) {
            if (group.entries.length === 0) {
              group.entries = transaction.entries.filter(e => e.itemType !== 'money');
            }
          } else {
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

      const ledgerItems = Array.from(groupedItems.values());

      const rateCutItems: CustomerLedgerItem[] = rateCuts.map(rc => ({
        id: rc.id,
        transactionId: rc.id,
        date: new Date(rc.cut_date).toISOString(),
        receivedAmount: 0,
        givenAmount: 0,
        entries: [],
        isRateCut: true,
        rateCutData: {
          metalType: rc.metal_type,
          weight: rc.weight_cut,
          rate: rc.rate,
          totalAmount: rc.total_amount
        }
      }));

      const allItems = [...ledgerItems, ...rateCutItems];
      return allItems.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Error fetching detailed ledger for PDF:', error);
      return [];
    }
  };

  const handleDeleteCustomer = useCallback(async (customer: Customer) => {
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
  }, []);

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

  // ── Quick-add handlers ──────────────────────────────────────────────────────
  const openQuickAdd = () => setShowCustomerModal(true);

  // Called when user picks an existing customer from the modal
  const handleCustomerSelected = (customer: Customer) => {
    setShowCustomerModal(false);
    setPendingCustomerId(customer.id);
    setPendingCustomerName(customer.name);
    setShowBalancesDialog(true);
  };

  // Called when user types a new name and confirms creation in the modal
  const handleCustomerCreated = async (name: string) => {
    setShowCustomerModal(false);
    const newId = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newCustomer: Customer = {
      id: newId,
      name,
      balance: 0,
      metalBalances: { gold999: 0, gold995: 0, silver: 0 },
    };
    await CustomerService.saveCustomer(newCustomer);
    setPendingCustomerId(newId);
    setPendingCustomerName(name);
    setShowBalancesDialog(true);
  };

  const handleQuickAddStep2 = async (values: Record<string, any>) => {
    const id = pendingCustomerId;
    const moneyBal  = values.moneyBalance   || 0;
    const g999Bal   = values.gold999Balance  || 0;
    const g995Bal   = values.gold995Balance  || 0;
    const silverBal = values.silverBalance   || 0;

    // Update customer balances directly (no transactions)
    if (moneyBal  !== 0) await CustomerService.updateCustomerBalance(id, moneyBal);
    if (g999Bal   !== 0) await CustomerService.updateCustomerMetalBalance(id, 'gold999', g999Bal);
    if (g995Bal   !== 0) await CustomerService.updateCustomerMetalBalance(id, 'gold995', g995Bal);
    if (silverBal !== 0) await CustomerService.updateCustomerMetalBalance(id, 'silver',  silverBal);

    setShowBalancesDialog(false);
    setPendingCustomerId('');
    setPendingCustomerName('');
    await loadAllCustomers();
  };

  const handleQuickAddCancel = () => {
    setShowCustomerModal(false);
    setShowBalancesDialog(false);
    setPendingCustomerId('');
    setPendingCustomerName('');
  };

  const toggleCardExpansion = useCallback((customerId: string) => {
    if (expandedCardIdRef.current === customerId) {
      // Collapse: update the ref immediately (so any in-flight InteractionManager
      // callback that checks the ref sees the card is already closed), then defer
      // the React state update until after all pending interactions settle.
      // This means the JS thread is completely free when the close animation runs —
      // setExpandedCardId(null) triggers reconciliation of the open row's subtree,
      // and deferring it ensures that work happens after the 250ms animation, not
      // competing with it.
      expandedCardIdRef.current = null;
      InteractionManager.runAfterInteractions(() => {
        setExpandedCardId(null);
      });
    } else {
      // Expand: update ref and state immediately so the animation starts on this
      // frame. Defer only the heavy DB fetch.
      expandedCardIdRef.current = customerId;
      setExpandedCardId(customerId);

      // Defer DB fetch until after the accordion open animation finishes,
      // so the JS thread is fully free to drive the animation at 60 fps.
      InteractionManager.runAfterInteractions(() => {
        fetchCustomerLedger(customerId);
      });
    }
    // ✅ No longer depends on expandedCardId state — reading the ref instead
    //    means this callback's identity is permanently stable, which means
    //    renderCustomerItem's identity is stable, which means React.memo on
    //    every closed CustomerRow fires zero re-renders when a card toggles.
  }, [fetchCustomerLedger]);

  const renderLedgerEntry = useCallback((entry: CustomerLedgerItem) => {
    const date = formatFullDate(entry.date);

    // Handle rate cut entries
    if (entry.isRateCut && entry.rateCutData) {
      const { metalType, weight, rate } = entry.rateCutData;
      const isGold = metalType.includes('gold');
      const formattedWeight = isGold ? Math.abs(weight).toFixed(3) : Math.abs(weight).toFixed(1);
      const metalName = metalType === 'gold999' ? 'Gold 999' :
        metalType === 'gold995' ? 'Gold 995' :
          metalType === 'silver' ? 'Silver' : metalType;
      let metalValue = (parseFloat(formattedWeight) * rate);
      if (metalType === 'silver') {
        metalValue /= 1000; // Silver rate is per kg
      } else {
        metalValue /= 10; // Gold rate is per 10g
      }

      // Determine color based on balance vs debt
      // Positive weight = balance reduction (green), Negative weight = debt reduction (red)
      const isBalanceReduction = weight > 0;
      const textColor = isBalanceReduction ? '#146C2E' : '#BA1A1A';

      return (
        <View style={styles.txnRow}>
          <View style={styles.colDate}>
            <Text style={styles.dateText}>{date}</Text>
          </View>
          <View style={styles.rateCutSpan}>
            <Text style={[styles.rateCutText, { color: textColor }]}>
              Rate Cut: {metalName} {formattedWeight}g {'\n'}
              ₹{formatIndianNumber(rate)} {'=>'} ₹{formatIndianNumber(metalValue)}
            </Text>
          </View>
        </View>
      );
    }

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
          // entry.weight is ALREADY the pureWeight stored by LedgerService.syncMetalLedgerEntries.
          // Do NOT apply touch/cut math — the ledger already has the final value.
          const pureWeight = e.weight || 0;

          let detailsStr = '';
          if (e.itemType === 'rani') {
            if (isSell) {
              detailsStr = `${formatPureGoldPrecise(pureWeight).toFixed(3)}g`;
            } else {
              detailsStr = `${(Math.floor(pureWeight * 100) / 100).toFixed(3)}g`;
            }
          } else {
            // Rupu
            if (isSell) {
              detailsStr = `${formatPureSilver(pureWeight).toFixed(1)}g`;
            } else {
              detailsStr = `${formatPureSilver(pureWeight)}g`;
            }
          }

          const typeName = e.itemType === 'rani' ? 'Rani' : 'Rupu';
          details = `${detailsStr}\n${typeName}`;

        } else {
          // Gold/Silver
          const isGold = e.itemType.includes('gold');
          const weight = e.weight || 0;
          const formattedWeight = isGold ? weight.toFixed(3) : weight.toFixed(1);

          const typeName = e.itemType === 'gold999' ? 'Gold 999' :
            e.itemType === 'gold995' ? 'Gold 995' :
              e.itemType === 'silver' ? 'Silver' : e.itemType;

          details = `${formattedWeight}g\n${typeName}`;
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
  }, []);

  // Wrap in useCallback so FlatList gets a stable function reference and does not
  // re-render every visible row whenever unrelated state changes.
  const renderCustomerItem = useCallback(({ item }: { item: Customer }) => {
    const isExpanded = expandedCardId === item.id;
    const cachedEntry = ledgerCache.get(item.id);

    // ✅ isLoadingLedger is derived per-row, never from a global state boolean.
    //    A row is "loading" only when it IS expanded AND its data hasn't arrived yet.
    //    Closed rows always derive false → their props are permanently stable →
    //    React.memo bails out instantly for every closed row on every render.
    const isLoadingLedger = isExpanded && !cachedEntry;

    return (
      <CustomerRow
        item={item}
        isExpanded={isExpanded}
        ledgerData={cachedEntry?.data || EMPTY_LEDGER_ARRAY}
        isLoadingLedger={isLoadingLedger}
        areTransactionsChecked={areTransactionsChecked}
        customersWithTransactions={customersWithTransactions}
        onToggle={toggleCardExpansion}
        onDelete={handleDeleteCustomer}
        onExport={exportCustomerTransactionHistoryToPDF}
        renderLedgerEntry={renderLedgerEntry}
      />
    );
  }, [expandedCardId, ledgerCache, areTransactionsChecked, customersWithTransactions,
      toggleCardExpansion, handleDeleteCustomer, exportCustomerTransactionHistoryToPDF, renderLedgerEntry]);

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
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons
                name="close-circle"
                size={24}
                color="#44474F"
                style={{ marginRight: -4 }}
              />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCustomersToPDF}>
          <MaterialCommunityIcons name="export-variant" size={24} color="#1B1B1F" />
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
            contentContainerStyle={{ paddingBottom: 100 }}
            initialNumToRender={15}
            maxToRenderPerBatch={15}
            windowSize={11}
            removeClippedSubviews={false}
            updateCellsBatchingPeriod={25}
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

      {/* Floating + button */}
      <TouchableOpacity style={styles.fab} onPress={openQuickAdd}>
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Customer selection modal for quick-add */}
      <CustomerSelectionModal
        visible={showCustomerModal}
        onDismiss={handleQuickAddCancel}
        onSelectCustomer={handleCustomerSelected}
        onCreateCustomer={handleCustomerCreated}
        allowCreateCustomer={true}
      />

      {/* Opening balances dialog */}
      <InventoryInputDialog
        visible={showBalancesDialog}
        title={`Opening Balances — ${pendingCustomerName}`}
        message="All optional. Positive = balance, negative = debt."
        allowDefaults
        submitLabel="Save"
        inputs={[
          { key: 'moneyBalance',   label: 'Money Balance (₹)',    value: '', placeholder: '0', type: 'text', keyboardType: 'numeric' },
          { key: 'gold999Balance', label: 'Gold 999 Balance (g)', value: '', placeholder: '0', type: 'text', keyboardType: 'numeric' },
          { key: 'gold995Balance', label: 'Gold 995 Balance (g)', value: '', placeholder: '0', type: 'text', keyboardType: 'numeric' },
          { key: 'silverBalance',  label: 'Silver Balance (g)',   value: '', placeholder: '0', type: 'text', keyboardType: 'numeric' },
        ]}
        onSubmit={handleQuickAddStep2}
        onCancel={handleQuickAddCancel}
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
    fontSize: 24,
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
  fab: {
    position: 'absolute',
    bottom: 36,
    right: 36,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#005AC1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#005AC1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
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
    padding: 6,
  },
  // Expanded View
  expandedView: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    overflow: 'hidden',
    // minHeight fills the full accordion window so the white card always
    // stretches to 300px even when there are only 1-2 rows of data.
    // 300 (accordion) - 12 (marginTop) = 288px
    minHeight: 288,
  },
  scrollableContent: {
    // Fixed height = accordion(300) - marginTop(12) - paddingVertical(24) - tableHeader(~36)
    height: 228,
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
  colDate: { width: '30%' },
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
  rateCutSpan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  rateCutText: {
    color: '#7c3aed',
    fontSize: 13,
    fontFamily: 'Outfit_500Medium',
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