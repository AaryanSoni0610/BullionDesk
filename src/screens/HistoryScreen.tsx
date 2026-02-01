import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  FlatList, 
  TouchableOpacity,
  BackHandler,
  TextInput,
  RefreshControl,
  Modal,
  Pressable,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import ThermalPrinterModule from 'react-native-thermal-printer';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Text,
  Divider,
  ActivityIndicator,
  Surface,
  Button
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { theme } from '../theme';
import { formatTransactionAmount, formatFullDate, formatPureGoldPrecise, formatPureGold, formatPureSilver, customFormatPureSilver, formatIndianNumber, formatCurrency } from '../utils/formatting';
import { TransactionService } from '../services/transaction.service';
import { Transaction } from '../types';
import { useAppContext } from '../context/AppContext';
import CustomAlert from '../components/CustomAlert';

// Filter Options
const ITEM_FILTER_OPTIONS = [
  { label: 'Gold 999', value: 'gold999' },
  { label: 'Gold 995', value: 'gold995' },
  { label: 'Rani', value: 'rani' },
  { label: 'Silver', value: 'silver' },
  { label: 'Rupu', value: 'rupu' },
  { label: 'Money Only', value: 'money' },
];

export const HistoryScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [itemFilters, setItemFilters] = useState<string[]>([]);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'today' | 'last7days' | 'last30days' | 'custom'>('today');
  const [error, setError] = useState<string | null>(null);
  const { navigateToSettings, loadTransactionForEdit } = useAppContext();
  const navigation = useNavigation();
  
  // State for sharing
  const [sharingTransactionId, setSharingTransactionId] = useState<string | null>(null);
  const shareableCardRef = useRef<View>(null);
  
  // Date Picker States
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [previousFilter, setPreviousFilter] = useState<'today' | 'last7days' | 'last30days'>('today');
  
  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<any[]>([]);
  
  // Export State
  const [showExportDatePicker, setShowExportDatePicker] = useState(false);
  const [exportDate, setExportDate] = useState<Date>(new Date());
  
  // Enhanced Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'capturing' | 'generating' | 'cleaning'>('idle');
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  
  // Printing State
  const [isPrinting, setIsPrinting] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState<string | null>(null);


  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isRateCutLocked = (transaction: Transaction): boolean => {
    const isMetalOnly = transaction.entries.every(entry => entry.metalOnly === true);
    if (isMetalOnly) {
      const txDate = new Date(transaction.date).getTime();
      const lockDates = transaction.customerLockDates;
      if (lockDates) {
        return transaction.entries.some(entry => {
          if (entry.itemType === 'gold999' && txDate <= (lockDates.gold999 || 0)) return true;
          if (entry.itemType === 'gold995' && txDate <= (lockDates.gold995 || 0)) return true;
          if (entry.itemType === 'silver' && txDate <= (lockDates.silver || 0)) return true;
          return false;
        });
      }
    }
    return false;
  };

  const isEditLocked = (transaction: Transaction): boolean => {
    if (isRateCutLocked(transaction)) return true;
    
    const isMetalOnly = transaction.entries.every(entry => entry.metalOnly === true);
    if (isMetalOnly) return false;

    const isMoneyOnly = transaction.entries.length === 1 && transaction.entries[0].type === 'money';
    if (isMoneyOnly) return false;

    const remainingBalance = Math.abs(transaction.total) - transaction.amountPaid;
    const isSettled = remainingBalance <= 0;
    return isSettled;
  };

  const handleDeleteTransaction = async (transaction: Transaction) => {
    setAlertTitle('Delete Transaction');
    setAlertMessage(`Are you sure you want to delete this transaction?\n\nCustomer: ${transaction.customerName}\nDate: ${formatFullDate(transaction.date)}\n\nThis action cannot be undone and will reverse all inventory changes.`);
    setAlertButtons([
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await TransactionService.deleteTransaction(transaction.id);
            if (result) {
              await loadTransactions(true);
              setAlertTitle('Success');
              setAlertMessage('Transaction deleted successfully');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            } else {
              setAlertTitle('Error');
              setAlertMessage('Failed to delete transaction');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            }
          } catch (error) {
            setAlertTitle('Error');
            setAlertMessage(error instanceof Error ? error.message : 'Failed to delete transaction');
            setAlertButtons([{ text: 'OK' }]);
            setAlertVisible(true);
          }
        },
      },
    ]);
    setAlertVisible(true);
  };

  // Request Bluetooth permissions for Android
  const requestBluetoothPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    
    try {
      const apiLevel = Platform.Version;
      
      if (apiLevel >= 31) {
        // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
        const scanGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          {
            title: 'Bluetooth Scan Permission',
            message: 'This app needs Bluetooth scan permission to find printers.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        const connectGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: 'Bluetooth Connect Permission',
            message: 'This app needs Bluetooth connect permission to connect to printers.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        return scanGranted === PermissionsAndroid.RESULTS.GRANTED && 
               connectGranted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // Android 11 and below
        const fineLocationGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs location permission to scan for Bluetooth devices.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        return fineLocationGranted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.error('Error requesting Bluetooth permissions:', err);
      return false;
    }
  };

  // Connect to a printer (Bluetooth must be paired at OS level)
  const connectToPrinter = async (printerAddress: string): Promise<boolean> => {
    try {
      // For Bluetooth, connection is handled during print
      // Just store the address for later use
      setConnectedPrinter(printerAddress);
      return true;
    } catch (error) {
      console.error('Error connecting to printer:', error);
      return false;
    }
  };

  // Print image to thermal printer - chunked approach to prevent height-based scaling
  const printImage = async (imageUri: string | any): Promise<void> => {
    try {
      // 1. Handle cases where captureRef returns an object instead of string
      let uri: string = typeof imageUri === 'string' ? imageUri : imageUri?.uri;
      if (!uri) throw new Error('Invalid URI');

      // Load image size to determine if chunking is needed for the P2600
      const { width, height } = await new Promise<{width: number, height: number}>((resolve, reject) => {
        const Image = require('react-native').Image;
        Image.getSize(uri, 
          (w: number, h: number) => resolve({ width: w, height: h }),
          (err: any) => reject(err)
        );
      });

      const CHUNK_HEIGHT = 400; // Smaller chunks for better Bluetooth stability

      // first paper feed before the first chunk
      await ThermalPrinterModule.printBluetooth({
        payload: '\n',
        printerWidthMM: 80,
        printerNbrCharactersPerLine: 48,
      });

      const { default: ImageEditor } = require('@react-native-community/image-editor');
      const numChunks = Math.ceil(height / CHUNK_HEIGHT);

      for (let i = 0; i < numChunks; i++) {
        const offsetY = i * CHUNK_HEIGHT;
        const currentChunkHeight = Math.min(CHUNK_HEIGHT, height - offsetY);

        const chunkResult = await ImageEditor.cropImage(uri, {
          offset: { x: 0, y: offsetY },
          size: { width: width, height: currentChunkHeight },
        });

        const chunkUri = typeof chunkResult === 'string' ? chunkResult : chunkResult.uri;
        const chunkBase64 = await FileSystem.readAsStringAsync(chunkUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Print each chunk individually. Only the first chunk gets the [L] tag.
        await ThermalPrinterModule.printBluetooth({
          payload: `<img>data:image/png;base64,${chunkBase64}</img>`,
          printerWidthMM: 80,
          printerNbrCharactersPerLine: 48,
        });

        await FileSystem.deleteAsync(chunkUri, { idempotent: true });
      }

      // // Final paper feed after the last chunk
      // await ThermalPrinterModule.printBluetooth({
      //   payload: '\n',
      //   printerWidthMM: 80,
      //   printerNbrCharactersPerLine: 48,
      // });
    } catch (error) {
      console.error("Print execution failed:", error);
      throw error;
    }
  };

  // Handle the share/print action choice
  const handleShareOrPrintTransaction = (transaction: Transaction) => {
    setAlertTitle('Share or Print');
    setAlertMessage('Would you like to share this transaction as an image or print it to your thermal printer?');
    setAlertButtons([
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Share',
        onPress: () => performShare(transaction),
      },
      {
        text: 'Print',
        onPress: () => handlePrintTransaction(transaction),
      },
    ]);
    setAlertVisible(true);
  };

  // Original share functionality
  const performShare = async (transaction: Transaction) => {
    try {
      setSharingTransactionId(transaction.id);
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!shareableCardRef.current) {
        setSharingTransactionId(null);
        return;
      }
      const uri = await captureRef(shareableCardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        setAlertTitle('Error');
        setAlertMessage('Sharing is not available');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        setSharingTransactionId(null);
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Transaction - ${transaction.customerName}` });
      setSharingTransactionId(null);
    } catch (error) {
      setSharingTransactionId(null);
    }
  };

  // Handle print transaction
  const handlePrintTransaction = async (transaction: Transaction) => {
    try {
      // Request Bluetooth permissions first
      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission) {
        setAlertTitle('Permission Required');
        setAlertMessage('Bluetooth permissions are required to print. Please enable them in settings.');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        return;
      }

      setIsPrinting(true);

      // Hardcoded printer MAC address
      const printerAddress = '00:1B:10:73:14:45';

      // If already connected to the printer, use it directly
      if (connectedPrinter === printerAddress) {
        await performPrint(transaction);
        return;
      }

      // Try to connect to the hardcoded printer
      try {
        await connectToPrinter(printerAddress);
        await performPrint(transaction);
      } catch (connectError) {
        console.error('Failed to connect to printer:', connectError);
        setAlertTitle('Printer Connection Failed');
        setAlertMessage('Could not connect to the thermal printer. Please ensure the printer is paired and powered on.');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
      }
    } catch (error) {
      console.error('Print error:', error);
      setAlertTitle('Print Error');
      setAlertMessage(error instanceof Error ? error.message : 'Failed to initialize printing');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    } finally {
      setIsPrinting(false);
    }
  };

  // Perform the actual printing
  const performPrint = async (transaction: Transaction) => {
    try {
      setSharingTransactionId(transaction.id);
      // Increased delay to ensure the hidden view renders fully
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (!shareableCardRef.current) {
        throw new Error('Could not capture transaction card');
      }
      
      // Capture at fixed dot-density for 80mm printer (400 dots for safe width)
      // Fixed width prevents printer driver from auto-scaling based on aspect ratio
      const uri = await captureRef(shareableCardRef, { 
        format: 'png', 
        quality: 1, 
        result: 'tmpfile',
        width: 400, // Reduced width for safe printing on 80mm paper
      });
      
      console.log(`Captured image URI type: ${typeof uri}, value: ${JSON.stringify(uri)}`);
      
      // Print the image
      await printImage(uri);
      
      setSharingTransactionId(null);
      setIsPrinting(false);
      
      setAlertTitle('Print Success');
      setAlertMessage('Transaction printed successfully!');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    } catch (error) {
      setSharingTransactionId(null);
      setIsPrinting(false);
      throw error;
    }
  };

  // Legacy function name for compatibility (now shows dialog)
  const handleShareTransaction = (transaction: Transaction) => {
    handleShareOrPrintTransaction(transaction);
  };

  // --- EXPORT LOGIC ---
  const handleExportDateChange = (event: any, selectedDate?: Date) => {
    setShowExportDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      setExportDate(selectedDate);
      performExport(selectedDate);
    }
  };

  const performExport = async (date: Date) => {
    setIsExporting(true);
    setExportStatus('generating');
    try {
      const start = new Date(date); start.setHours(0,0,0,0);
      const end = new Date(date); end.setHours(23,59,59,999);
      
      // Use getTransactionsWithActivityByDateRange to include transactions with payments on this date
      const txs = await TransactionService.getTransactionsWithActivityByDateRange(start.toISOString(), end.toISOString());
      const validTxs = txs.filter(t => t.customerName.toLowerCase() !== 'adjust');
      
      if (validTxs.length === 0) {
        setIsExporting(false);
        setAlertTitle('No Data');
        setAlertMessage('No transactions found for this date.');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        return;
      }
      
      generatePDFDirectly(validTxs);
    } catch (e) {
      setIsExporting(false);
      console.error(e);
      setAlertTitle('Error');
      setAlertMessage('Failed to prepare export.');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    }
  };

  const generateTransactionCardHTML = (transaction: Transaction) => {
    const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
    
    // Preprocess entries to add numbered labels for Rani/Rupa when multiple
    const processedEntries = transaction.entries.map((entry, index) => {
      let displayName = getItemDisplayName(entry);
      if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
        const type = entry.itemType;
        const count = transaction.entries.filter(e => e.itemType === type).length;
        if (count > 1) {
          const itemIndex = transaction.entries.slice(0, index).filter(e => e.itemType === type).length + 1;
          displayName = `${displayName} ${itemIndex}`;
        }
      } else if (entry.stock_id && entry.metalOnly && entry.type === 'sell') {
        // For Rani/Rupa sell entries, show as Rani or Rupu
        displayName = entry.itemType === 'gold999' || entry.itemType === 'gold995' ? 'Rani' : 'Rupu';
      } else if (entry.type === 'money' && entry.createdAt) {
        // Format date as DD/MM HH:MM am/pm
        const date = new Date(entry.createdAt);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        const hour12 = hours % 12 || 12;
        displayName = `Money (${day}/${month} ${hour12}:${minutes} ${ampm})`;
      }
      return { ...entry, displayName };
    });

    // Separate Rani/Rupa sell entries (metal-only with stock_id)
    const raniRupaEntries = processedEntries.filter(e => e.stock_id && e.metalOnly && e.type === 'sell');

    // Group Rani/Rupa entries by itemType for summary
    const groupedRaniRupa = raniRupaEntries.reduce((acc, entry) => {
      let groupKey = entry.itemType;
      // Map to metal types for summary
      if (entry.itemType === 'rani') {
          groupKey = (entry.cut || 0) > 0 ? 'gold999' : 'gold995';
      } else if (entry.itemType === 'rupu') {
          groupKey = 'silver';
      }
      
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(entry);
      return acc;
    }, {} as Record<string, typeof processedEntries>);

    // Balance Logic
    let transactionBalanceLabel = 'Settled';
    let transactionBalanceColor = theme.colors.primary;
    
    if (isMetalOnly) {
      const metalItems: string[] = [];
      processedEntries.forEach(entry => {
        if (entry.metalOnly) {
          const itemName = entry.displayName;
          const weight = entry.weight || 0;
          const isGold = entry.itemType.includes('gold') || entry.itemType === 'rani';
          const formattedWeight = isGold ? weight.toFixed(3) : Math.floor(weight);
          const label = entry.type === 'sell' ? 'Debt' : 'Balance';
          metalItems.push(`${label}: ${itemName} ${formattedWeight}g`);
        }
      });
      if (metalItems.length > 0) {
        transactionBalanceLabel = metalItems.join(', ');
        const isDebt = metalItems.some(item => item.startsWith('Debt'));
        const isBalance = metalItems.some(item => item.startsWith('Balance'));
        if (isDebt) transactionBalanceColor = theme.colors.debtColor;
        else if (isBalance) transactionBalanceColor = theme.colors.success;
      }
    } else {
      const transactionRemaining = transaction.amountPaid - transaction.total;
      const hasRemainingBalance = Math.abs(transactionRemaining) >= 1;
      const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;

      if (hasRemainingBalance) {
        if (!isMoneyOnly) {
          const isDebt = transactionRemaining < 0;
          transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
        } else {
          const isBalance = transaction.amountPaid > 0;
          transactionBalanceLabel = `${isBalance ? 'Balance' : 'Debt'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isBalance ? theme.colors.success : theme.colors.debtColor;
        }
      } else {
        transactionBalanceColor = theme.colors.primary;
      }
    }

    const amountColor = getAmountColor(transaction);
    const formattedDate = formatFullDate(transaction.date);
    const formattedAmount = !isMetalOnly ? formatTransactionAmount(transaction) : '';

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="customer-name">${transaction.customerName}</div>
            <div class="date">${formattedDate}</div>
          </div>
          <div class="amount" style="color: ${amountColor}">${formattedAmount}</div>
        </div>
        
        <div class="receipt-section">
          ${processedEntries.map(entry => {
             // Logic for money entries: 'give' -> like sell (top-right), 'receive' -> like purchase (bottom-left)
             const isMoneyGive = entry.type === 'money' && entry.moneyType === 'give';
             const isMoneyReceive = entry.type === 'money' && entry.moneyType === 'receive';

             const isSell = entry.type === 'sell' || isMoneyGive;
             const isPurchase = entry.type === 'purchase' || isMoneyReceive;
             const iconChar = isSell ? '↗' : isPurchase ? '↙' : '₹';
             const iconBg = isSell ? '#E8F5E9' : isPurchase ? '#E3F2FD' : '#FFF8E1';
             const iconColor = isSell ? theme.colors.success : isPurchase ? theme.colors.primary : '#F57C00';
             
             const { line1, line2 } = getEntryDisplayData(entry, transaction);

             return `
               <div class="entry-row">
                 <div class="item-name-row">
                   <div class="icon-box" style="background-color: ${iconBg}; color: ${iconColor}">${iconChar}</div>
                   <span class="item-name">${entry.displayName}</span>
                 </div>
                 <span class="item-val">${line1}</span>
               </div>
               ${(line2 !== '') ? `
                 <div class="entry-row" style="margin-top: -2px;">
                   <div></div>
                   <span class="item-val" style="font-size: 11px; opacity: 0.8;">${line2}</span>
                 </div>
               ` : ''}
             `;
          }).join('')}
          
          ${raniRupaEntries.length > 0 ? '<div class="divider"></div>' : ''}
          
          ${Object.entries(groupedRaniRupa).map(([itemType, entries]) => {
            const sumPure = entries.reduce((sum, e) => {
                const weight = e.weight || 0;
                const touch = e.touch || 100;
                
                if (itemType === 'rupu') {
                  return sum + customFormatPureSilver(weight, touch);
                } else {
                  const effectiveTouch = touch/100;
                  const rawPure = (weight * effectiveTouch);
                  return sum + (formatPureGoldPrecise(rawPure));
                }
              }, 0);
              
              const sumDebt = entries.reduce((sum, e) => {
                const weight = e.weight || 0;
                const touch = e.touch || 100;
                const cut = e.cut || 0;
                
                if (itemType === 'rupu') {
                  return sum + customFormatPureSilver(weight, touch);
                } else {
                  const effectiveTouch = (touch - cut)/100;
                  const rawPure = (weight * effectiveTouch);
                  return sum + formatPureGoldPrecise(rawPure);
                }
              }, 0);
            
            const hasCut = entries.some(e => (e.cut || 0) > 0);
            const displayType = itemType === 'gold999' ? 'Pure Gold 999' : itemType === 'gold995' ? 'Pure Gold 995' : 'Pure Silver';
            const decimals = itemType === 'silver' ? 0 : 3;
            const firstCut = entries[0].cut || 0;
            const line1 = hasCut && itemType === 'gold999' ? `${sumPure.toFixed(decimals)}g : ${sumDebt.toFixed(3)}g (-${Math.abs(firstCut).toFixed(2)}%)` : `${sumPure.toFixed(decimals)}g`;

            return `
              <div class="entry-row">
                <div class="item-name-row">
                  <div class="icon-box">-</div>
                  <span class="item-name">${displayType}</span>
                </div>
                <span class="item-val">${line1}</span>
              </div>
            `;
          }).join('')}
          
          ${(!isMetalOnly && processedEntries.length > 0) ? '<div class="divider"></div>' : ''}
          
          ${(!isMetalOnly) ? (
              processedEntries.length === 0 ? `
                <div class="total-row">
                  <span class="total-label">Money-Only</span>
                </div>
              ` : `
                <div class="total-row">
                  <span class="total-label">Total</span>
                  <span class="total-amount">₹${formatIndianNumber(Math.abs(transaction.total))}</span>
                </div>
              `
          ) : ''}
          
          ${(!isMetalOnly) ? '<div class="divider"></div>' : ''}
          
          ${(!isMetalOnly) ? `
             <div class="footer-row">
               <span class="footer-label">${transaction.amountPaid > 0 ? 'Received' : 'Given'}:</span>
               <span class="footer-amount" style="color: ${transaction.amountPaid >= 0 ? theme.colors.success : theme.colors.primary}">
                 ${transaction.amountPaid >= 0 ? '+' : '-'}₹${formatIndianNumber(Math.abs(transaction.amountPaid))}
               </span>
               <div style="flex:1"></div>
               <span class="balance-label" style="color: ${transactionBalanceColor}">${transactionBalanceLabel}</span>
             </div>
          ` : ''}
        </div>
        
        ${(transaction.note && transaction.note.trim() !== '') ? `
          <div class="note-row">
            <span class="note-label">NOTE</span>
            <span class="note-text">${transaction.note}</span>
          </div>
        ` : ''}
      </div>
    `;
  };

  const generatePDFDirectly = async (transactions: Transaction[]) => {
    // setIsExporting(true); // Already set in performExport
    // setExportStatus('generating'); // Already set in performExport
    setExportProgress({ current: 0, total: transactions.length });

    try {
      let htmlBody = '';
      const chunkSize = 20;
      
      for (let i = 0; i < transactions.length; i += chunkSize) {
          const chunk = transactions.slice(i, i + chunkSize);
          
          // Allow UI to update
          await new Promise(resolve => setTimeout(resolve, 0));
          
          chunk.forEach(tx => {
              htmlBody += generateTransactionCardHTML(tx);
          });
          
          setExportProgress({ current: Math.min(i + chunkSize, transactions.length), total: transactions.length });
      }

      const html = `
        <html>
          <head>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
              body { font-family: 'Outfit', sans-serif; padding: 20px; background: #fff; }
              h1 { text-align: center; color: #333; margin-bottom: 20px; font-size: 24px; font-weight: 700; }
              .container { column-count: 2; column-gap: 15px; }
              .card { break-inside: avoid; margin-bottom: 15px; background-color: #F0F2F5; border-radius: 12px; padding: 12px; }
              .card-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
              .customer-name { font-weight: 600; font-size: 14px; color: #1A1C1E; }
              .date { font-size: 10px; color: #444746; font-weight: 400; }
              .amount { font-weight: 700; font-size: 14px; text-align: right; }
              .receipt-section { background-color: #FFFFFF; border-radius: 8px; padding: 8px; }
              .entry-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
              .item-name-row { display: flex; align-items: center; }
              .icon-box { width: 10px; height: 10px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; margin-right: 6px; }
              .item-name { font-size: 12px; font-weight: 500; color: #1A1C1E; }
              .item-val { font-size: 12px; color: #444746; font-weight: 400; }
              .divider { height: 1px; background-color: rgba(0,0,0,0.05); margin: 6px 0; }
              .total-row { display: flex; justify-content: space-between; align-items: center; }
              .total-label { font-size: 11px; font-weight: 500; color: #1A1C1E; }
              .total-amount { font-size: 12px; font-weight: 600; color: #1A1C1E; }
              .footer-row { display: flex; justify-content: space-between; align-items: center; }
              .footer-label { font-size: 11px; font-weight: 500; color: #1A1C1E; margin-right: 4px; }
              .footer-amount { font-size: 12px; font-weight: 600; }
              .balance-label { font-size: 10px; font-weight: 600; text-transform: uppercase; }
              .note-row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.05); }
              .note-label { font-size: 11px; font-weight: 500; color: #444746; }
              .note-text { font-size: 11px; color: #1A1C1E; text-align: right; flex: 1; margin-left: 8px; }
            </style>
          </head>
          <body>
            <h1>Transaction History - ${formatDate(exportDate)}</h1>
            <div class="container">
              ${htmlBody}
            </div>
          </body>
        </html>
      `;
      
      const { uri: pdfUri } = await Print.printToFileAsync({ html, base64: false });
      
      // Rename PDF
      const dateStr = exportDate.toLocaleDateString('en-GB').replace(/\//g, '-');
      const timeStr = new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}).replace(':', '-');
      const fileName = `HistoryExport-${dateStr}-${timeStr}.pdf`;
      const finalPdfUri = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.moveAsync({ from: pdfUri, to: finalPdfUri });
      
      // Share
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(finalPdfUri, { mimeType: 'application/pdf', dialogTitle: 'Export History' });
      } else {
        setAlertTitle('Error');
        setAlertMessage('Sharing is not available on this device');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
      }
      
      // Schedule delete
      setTimeout(async () => {
        try { await FileSystem.deleteAsync(finalPdfUri, { idempotent: true }); } catch (e) {}
      }, 5 * 60 * 1000);
      
    } catch (error) {
      console.error('PDF Generation failed:', error);
      setAlertTitle('Export Failed');
      setAlertMessage('Could not generate PDF.');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    } finally {
      setIsExporting(false);
      setExportStatus('idle');
    }
  };
  // ------------------------------------------------

  const getItemDisplayName = (entry: any): string => {
    if (entry.type === 'money') return 'Money';
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999', 'gold995': 'Gold 995', 'rani': 'Rani', 'silver': 'Silver', 'rupu': 'Rupu', 'money': 'Money',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };

  const loadTransactions = async (refresh = false) => {
    try {
      if (!refresh) setIsLoading(true);
      setError(null);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let startDate: string;
      let endDate: string;
      
      switch (selectedFilter) {
        case 'today':
          startDate = today.toISOString();
          endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
          break;
        case 'last7days':
          startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          endDate = new Date(today.getTime() - 1).toISOString();
          break;
        case 'last30days':
          startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          endDate = new Date(today.getTime() - 1).toISOString();
          break;
        case 'custom':
          if (!customStartDate || !customEndDate) {
            startDate = today.toISOString();
            endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
          } else {
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            startDate = start.toISOString();
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            endDate = end.toISOString();
          }
          break;
        default:
          startDate = today.toISOString();
          endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
      }
      
      const allTransactions = await TransactionService.getTransactionsByDateRange(startDate, endDate);
      const sortedTransactions = allTransactions.filter(t => t.customerName.toLowerCase() !== 'adjust');
      setTransactions(sortedTransactions);
    } catch (error) {
      setError('Unable to load transaction history');
      if (!refresh) setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemFilter = (value: string) => {
    setItemFilters(prev => {
      if (prev.includes(value)) return prev.filter(v => v !== value);
      return [...prev, value];
    });
  };

  const applyFilters = useCallback(() => {
    setIsSearching(true);
    let result = transactions;

    if (itemFilters.length > 0) {
      result = result.filter(tx => {
        const isMoneyOnly = !tx.entries || tx.entries.length === 0;
        if (itemFilters.includes('money') && isMoneyOnly) return true;
        if (!isMoneyOnly) {
           const hasMatch = tx.entries.some(entry => itemFilters.includes(entry.itemType));
           if (hasMatch) return true;
        }
        return false;
      });
    }

    if (searchQuery.trim()) {
      const searchTerm = searchQuery.trim().toLowerCase();
      result = result.filter(transaction => {
        const customerMatch = transaction.customerName.trim().toLowerCase().includes(searchTerm);
        const itemMatch = transaction.entries.some(entry => getItemDisplayName(entry).toLowerCase().includes(searchTerm));
        return customerMatch || itemMatch;
      });
    }
    setFilteredTransactions(result);
    setIsSearching(false);
  }, [transactions, itemFilters, searchQuery]);

  const handleFilterChange = (filter: typeof selectedFilter) => {
    if (filter === 'custom') {
      if (selectedFilter !== 'custom') setPreviousFilter(selectedFilter);
      setShowStartDatePicker(true);
    } else {
      setCustomStartDate(null);
      setCustomEndDate(null);
      setSelectedFilter(filter);
      setPreviousFilter(filter);
    }
  };

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    setShowStartDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setCustomStartDate(selectedDate);
      setShowEndDatePicker(true);
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setCustomEndDate(selectedDate);
      setSelectedFilter('custom');
    }
  };

  useEffect(() => { applyFilters(); }, [applyFilters]);
  useFocusEffect(useCallback(() => { loadTransactions(); }, [selectedFilter, customStartDate, customEndDate]));
  useFocusEffect(useCallback(() => {
      const onBackPress = () => { (navigation as any).navigate('Home'); return true; };
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [navigation]));

  // --- CORE COLOR & LABEL LOGIC (Preserved from Original) ---
  const getAmountColor = (transaction: Transaction) => {
    const isMoneyOnly = transaction.entries.length === 1 && transaction.entries[0].type === 'money';
    if (isMoneyOnly) {
      const isReceived = transaction.amountPaid > 0;
      return isReceived ? theme.colors.sellColor : theme.colors.primary;
    } else {
      const isReceived = transaction.total > 0;
      return isReceived ? theme.colors.sellColor : theme.colors.primary;
    }
  };

  const getEntryDisplayData = (entry: any, transaction: Transaction) => {
    const isMetalOnly = entry.metalOnly;
    
    const isRaniRupa = ['rani', 'rupu'].includes(entry.itemType);
    const isGoldSilver = !isRaniRupa && entry.type !== 'money';
    
    // Special handling for Rani/Rupa sell entries (metal-only with stock_id)
    if (entry.metalOnly && entry.stock_id && entry.type === 'sell') {
      const weight = entry.weight || 0;
      const touch = entry.touch || 100;
      const cut = entry.cut || 0;
      let effectiveTouch = touch;
      let pureWeight = 0;
      let fixedDigits = 0;
      let formattedPure = 0;

      if (entry.itemType === 'rani') {
        effectiveTouch = touch - cut;
        pureWeight = (weight * effectiveTouch) / 100;
        fixedDigits = 3;
        formattedPure = formatPureGoldPrecise(pureWeight);
      } else if (entry.itemType === 'rupu') {
         effectiveTouch = touch;
         pureWeight = (weight * effectiveTouch) / 100;
         fixedDigits = 0;
         formattedPure = customFormatPureSilver(weight, touch);
      } else if (entry.itemType.includes('gold')) {
         // Fallback if existing data has gold type
         effectiveTouch = entry.itemType === 'gold999' ? touch - cut : touch;
         pureWeight = (weight * effectiveTouch) / 100;
         fixedDigits = 3;
         formattedPure = formatPureGoldPrecise(pureWeight);
      } else {
         // Fallback for silver
         effectiveTouch = touch;
         pureWeight = (weight * effectiveTouch) / 100;
         fixedDigits = 0;
         formattedPure = customFormatPureSilver(weight, touch);
      }

      const touchDisplay = cut > 0 ? `${touch.toFixed(2)}-${Math.abs(cut).toFixed(2)}` : effectiveTouch.toFixed(2);
      let line1 = `${weight.toFixed(fixedDigits)}g : ${touchDisplay}% : ${formattedPure.toFixed(fixedDigits)}g`;
      let line2 = '';
      return { line1, line2 };
    }
    
    // New Logic
    let line1 = '';
    let line2 = '';

    if (isRaniRupa) {
         const weight = entry.weight || 0;
         const touch = entry.touch || 100;
         const cut = entry.cut || 0;
         const effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
         const pureWeight = (weight * effectiveTouch) / 100;
         
         // Pure Weight Formatting Logic
         let formattedPure = 0;
         if (entry.itemType === 'rani') {
             if (entry.type === 'sell') formattedPure = formatPureGoldPrecise(pureWeight);
             else formattedPure = formatPureGold(pureWeight); // Purchase -> Normal
         } else {
             formattedPure = formatPureSilver(pureWeight);
             if (entry.type === 'sell') formattedPure = customFormatPureSilver(weight, touch);
             else formattedPure = formatPureSilver(pureWeight); // Purchase -> Normal
         }
         
         const fixedDigits = entry.itemType === 'rani' ? 3 : 0;
         const touchDisplay = (entry.itemType === 'rani' && cut > 0) ? `${touch.toFixed(2)}-${Math.abs(cut).toFixed(2)}` : effectiveTouch.toFixed(2);
         
         line1 = `${weight.toFixed(fixedDigits)}g : ${touchDisplay}% : ${formattedPure.toFixed(fixedDigits)}g`;
         
         if (!isMetalOnly && entry.price && entry.price > 0) {
             line2 = `${formatCurrency(entry.price)} (${formatCurrency(entry.subtotal || 0)})`;
         }
    } else if (isGoldSilver) {
         const isGold = entry.itemType.includes('gold');
         const weightStr = `${(entry.weight || 0).toFixed(isGold?3:1)}g`;
         
         if (!isMetalOnly && entry.price && entry.price > 0) {
             line1 = `${weightStr} : ${formatCurrency(entry.price)}`;
             line2 = `(${formatCurrency(entry.subtotal || 0)})`;
         } else {
             line1 = weightStr;
         }
    } else if (entry.type === 'money') {
        // Money Entry (Payment)
        line1 = `₹${formatIndianNumber(Math.abs(entry.amount || 0))}`;
    }

    return { line1, line2 };
  };

  // Transaction Card Component
  const TransactionCard: React.FC<{ transaction: Transaction; hideActions?: boolean; allowFontScaling?: boolean }> = ({ transaction, hideActions = false, allowFontScaling = true }) => {
    const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
    
    // Preprocess entries to add numbered labels for Rani/Rupa when multiple
    const processedEntries = transaction.entries.map((entry, index) => {
      let displayName = getItemDisplayName(entry);
      if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
        const type = entry.itemType;
        const count = transaction.entries.filter(e => e.itemType === type).length;
        if (count > 1) {
          const itemIndex = transaction.entries.slice(0, index).filter(e => e.itemType === type).length + 1;
          displayName = `${displayName} ${itemIndex}`;
        }
      } else if (entry.stock_id && entry.metalOnly && entry.type === 'sell') {
        // For Rani/Rupa sell entries, show as Rani or Rupu
        displayName = entry.itemType === 'gold999' || entry.itemType === 'gold995' ? 'Rani' : 'Rupu';
      } else if (entry.type === 'money' && entry.createdAt) {
        // Format date as DD/MM HH:MM am/pm
        const date = new Date(entry.createdAt);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        const hour12 = hours % 12 || 12;
        displayName = `Money (${day}/${month} ${hour12}:${minutes} ${ampm})`;
      }
      return { ...entry, displayName };
    });

    // Separate Rani/Rupa sell entries (metal-only with stock_id)
    const raniRupaEntries = processedEntries.filter(e => e.stock_id && e.metalOnly && e.type === 'sell');

    // Group Rani/Rupa entries by itemType for summary
    const groupedRaniRupa = raniRupaEntries.reduce((acc, entry) => {
      let groupKey = entry.itemType;
      // Map to metal types for summary
      if (entry.itemType === 'rani') {
          groupKey = (entry.cut || 0) > 0 ? 'gold999' : 'gold995';
      } else if (entry.itemType === 'rupu') {
          groupKey = 'silver';
      }
      
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(entry);
      return acc;
    }, {} as Record<string, typeof processedEntries>);

    // Logic for Transaction Balance Label
    let transactionBalanceLabel = 'Settled';
    let transactionBalanceColor = theme.colors.primary; // Blue default
    
    if (isMetalOnly) {
      const metalItems: string[] = [];
      processedEntries.forEach(entry => {
        if (entry.metalOnly) {
          const itemName = entry.displayName;
          const weight = entry.weight || 0;
          const isGold = entry.itemType.includes('gold') || entry.itemType === 'rani';
          const formattedWeight = isGold ? weight.toFixed(3) : Math.floor(weight);
          const label = entry.type === 'sell' ? 'Debt' : 'Balance';
          metalItems.push(`${label}: ${itemName} ${formattedWeight}g`);
        }
      });
      if (metalItems.length > 0) {
        transactionBalanceLabel = metalItems.join(', ');
        const isDebt = metalItems.some(item => item.startsWith('Debt'));
        const isBalance = metalItems.some(item => item.startsWith('Balance'));
        if (isDebt) transactionBalanceColor = theme.colors.debtColor;
        else if (isBalance) transactionBalanceColor = theme.colors.success;
      }
    } else {
      // Money Transaction Logic
      const transactionRemaining = transaction.amountPaid - transaction.total;
      const hasRemainingBalance = Math.abs(transactionRemaining) >= 1; // Tolerance
      const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;

      if (hasRemainingBalance) {
        if (!isMoneyOnly) {
          const isDebt = transactionRemaining < 0;
          transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
        } else {
          const isBalance = transaction.amountPaid > 0;
          transactionBalanceLabel = `${isBalance ? 'Balance' : 'Debt'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
          transactionBalanceColor = isBalance ? theme.colors.success : theme.colors.debtColor;
        }
      } else {
        transactionBalanceColor = theme.colors.primary; // Blue for settled
      }
    }
    
    return (
      <View style={[
        styles.historyCard,
        // Optimize for thermal printing when hideActions is true
        hideActions && {
          backgroundColor: '#FFFFFF', // Pure white for thermal
          borderRadius: 0, // No rounded corners
          padding: 4, // Minimal padding for thermal (reduced from 10)
          paddingRight: 50, // Increase right padding for safety margin
          marginBottom: 0,
          margin: 0, // No margins
          elevation: 0, // Remove shadow (prevents gray noise)
          shadowOpacity: 0,
          width: 400, // Reduced width for safe printing on 80mm paper
        }
      ]}>
        {/* Action Buttons at Top Left */}
        {!hideActions && (
          <View style={styles.cardTopActions}>
            <View style={styles.actionPill}>
              <TouchableOpacity 
                style={[styles.iconBtn, styles.btnDelete, isRateCutLocked(transaction) && styles.disabledButton]}
                onPress={() => !isRateCutLocked(transaction) && handleDeleteTransaction(transaction)}
                disabled={isRateCutLocked(transaction)}
              >
                <Icon name="delete" size={20} color={isRateCutLocked(transaction) ? theme.colors.onSurfaceDisabled : theme.colors.error} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.iconBtn, styles.btnShare]}
                onPress={() => handleShareTransaction(transaction)}
              >
                <Icon name="share-variant" size={20} color={theme.colors.success} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.iconBtn, styles.btnEdit, isEditLocked(transaction) && styles.disabledButton]}
                onPress={() => !isEditLocked(transaction) && loadTransactionForEdit(transaction.id)}
                disabled={isEditLocked(transaction)}
              >
                <Icon name="pencil" size={20} color={isEditLocked(transaction) ? theme.colors.onSurfaceDisabled : theme.colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.infoBlock}>
            <Text allowFontScaling={allowFontScaling} style={[
              styles.customerName,
              hideActions && { color: '#000000', fontSize: 20 } // Base size +2
            ]}>
              {transaction.customerName}
            </Text>
            <Text allowFontScaling={allowFontScaling} style={[
              styles.transactionDate,
              hideActions && { color: '#000000', fontSize: 14 } // Base size +2
            ]}>
              {formatFullDate(transaction.date)}
            </Text>
          </View>
          <View style={styles.amountBlock}>
            {!isMetalOnly && (
              <Text 
                allowFontScaling={allowFontScaling}
                style={[
                  styles.mainAmount, 
                  { 
                    color: hideActions ? '#000000' : getAmountColor(transaction),
                    fontSize: hideActions ? 20 : 18 // Base size +2
                  }
                ]}
              >
                {formatTransactionAmount(transaction)}
              </Text>
            )}
          </View>
        </View>

        {/* Receipt / Details Section */}
        <View style={styles.receiptSection}>
            {/* Render all entries */}
            {processedEntries.map((entry, index) => (
                <View key={index} style={styles.entryWrapper}>
                  {(() => {
                    // Logic for money entries: 'give' -> like sell (top-right), 'receive' -> like purchase (bottom-left)
                    const isMoneyGive = entry.type === 'money' && entry.moneyType === 'give';
                    const isMoneyReceive = entry.type === 'money' && entry.moneyType === 'receive';

                    const isSell = entry.type === 'sell' || isMoneyGive;
                    const isPurchase = entry.type === 'purchase' || isMoneyReceive;
                    
                    const iconName = isSell ? 'arrow-top-right' : isPurchase ? 'arrow-bottom-left' : 'cash';
                    const iconColor = isSell ? theme.colors.success : isPurchase ? theme.colors.primary : '#F57C00';
                    const iconStyle = isSell ? styles.iconSell : isPurchase ? styles.iconPurchase : styles.iconMoney;
                    
                    const { line1, line2 } = getEntryDisplayData(entry, transaction);

                    return (
                      <>
                        {/* Item Row */}
                        <View style={styles.receiptRow}>
                          <View style={styles.itemNameRow}>
                            <View style={[styles.iconBox, iconStyle]}>
                              <Icon name={iconName} size={hideActions ? 20 : 14} color={iconColor} />
                            </View>
                            <Text allowFontScaling={allowFontScaling} style={[
                              styles.itemNameText,
                              hideActions && { fontSize: 16, color: '#000000' } // Base size +2
                            ]}>
                              {entry.displayName}
                            </Text>
                          </View>
                    
                          {/* Line 1: Weight / Details */}
                          <Text allowFontScaling={allowFontScaling} style={[
                            styles.itemVal,
                            hideActions && { fontSize: 16, color: '#000000' } // Base size +2
                          ]}>
                              {line1}
                          </Text>
                        </View>

                        {/* Line 2: Price / Subtotal (if applicable) */}
                        {line2 !== '' && (
                           <View style={[styles.receiptRow, { marginTop: -4 }]}>
                              <View /> 
                              <Text allowFontScaling={allowFontScaling} style={[
                                styles.itemVal, 
                                { 
                                  fontSize: hideActions ? 15 : 13, // Base size +2
                                  opacity: hideActions ? 1 : 0.8,
                                  color: hideActions ? '#000000' : undefined
                                }
                              ]}>
                                 {line2}
                              </Text>
                           </View>
                        )}
                      </>
                    );
                  })()}
                </View>
            ))}

            {/* Divider before summary */}
            {raniRupaEntries.length > 0 && <Divider style={[styles.divider, { marginVertical: 2 }]} />}

            {/* Summary for Rani/Rupa pure metals */}
            {Object.entries(groupedRaniRupa).map(([itemType, entries]) => {
              const sumPure = entries.reduce((sum, e) => {
                const weight = e.weight || 0;
                const touch = e.touch || 100;
                
                if (itemType === 'rupu') {
                  return sum + customFormatPureSilver(weight, touch);
                } else {
                  const effectiveTouch = touch/100;
                  const rawPure = (weight * effectiveTouch);
                  return sum + (formatPureGoldPrecise(rawPure));
                }
              }, 0);
              
              const sumDebt = entries.reduce((sum, e) => {
                const weight = e.weight || 0;
                const touch = e.touch || 100;
                const cut = e.cut || 0;
                
                if (itemType === 'rupu') {
                  return sum + customFormatPureSilver(weight, touch);
                } else {
                  const effectiveTouch = (touch - cut)/100;
                  const rawPure = (weight * effectiveTouch);
                  return sum + formatPureGoldPrecise(rawPure);
                }
              }, 0);
              
              const hasCut = entries.some(e => (e.cut || 0) > 0);
              const displayType = itemType === 'gold999' ? 'Pure Gold 999' : itemType === 'gold995' ? 'Pure Gold 995' : 'Pure Silver';
              const decimals = itemType === 'silver' ? 0 : 3;
              const firstCut = entries[0].cut || 0;
              const line1 = hasCut && itemType === 'gold999' ? `${sumPure.toFixed(decimals)}g : ${sumDebt.toFixed(3)}g (-${Math.abs(firstCut).toFixed(2)})` : `${sumPure.toFixed(decimals)}g`;

              return (
                <View key={`summary-${itemType}`} style={styles.entryWrapper}>
                  <View style={styles.receiptRow}>
                    <View style={styles.itemNameRow}>
                      <Text allowFontScaling={allowFontScaling} style={[
                        styles.itemNameText, 
                        { marginLeft: 2 },
                        hideActions && { fontSize: 16, color: '#000000' } // Base size +2
                      ]}>
                        {displayType}
                      </Text>
                    </View>
                    <Text allowFontScaling={allowFontScaling} style={[
                      styles.itemVal,
                      hideActions && { fontSize: 16, color: '#000000' } // Base size +2
                    ]}>
                      {line1}
                    </Text>
                  </View>
                </View>
              );
            })}

            {/* Dividers & Totals */}
            {!isMetalOnly && processedEntries.length > 0 && <Divider style={styles.divider} />}
            
            {/* Total Row or Money-Only Label */}
            {!isMetalOnly && (
              processedEntries.length === 0 ? (
                <View style={styles.totalRow}>
                  <Text style={[
                    styles.totalLabel,
                    hideActions && { fontSize: 15, color: '#000000' } // Base size +2
                  ]}>Money-Only</Text>
                </View>
              ) : (
                <View style={styles.totalRow}>
                  <Text style={[
                    styles.totalLabel,
                    hideActions && { fontSize: 15, color: '#000000' } // Base size +2
                  ]}>Total</Text>
                  <Text style={[
                    styles.totalAmount,
                    hideActions && { fontSize: 16, color: '#000000' } // Base size +2
                  ]}>
                    ₹{formatIndianNumber(Math.abs(transaction.total))}
                  </Text>
                </View>
              )
            )}

            {/* Divider */}
            {!isMetalOnly && <Divider style={styles.divider} />}

            {/* Payment/Balance Row */}
            {!isMetalOnly && (
               <View style={[styles.receiptRow, styles.footerRow]}>
                 <Text style={[
                   styles.footerLabel,
                   hideActions && { fontSize: 15, color: '#000000' } // Base size +2
                 ]}>
                   {transaction.amountPaid > 0 ? 'Received' : 'Given'}:
                 </Text>
                 <Text style={[
                   styles.footerAmount, 
                   { color: hideActions ? '#000000' : (transaction.amountPaid >= 0 ? theme.colors.success : theme.colors.primary) },
                   hideActions && { fontSize: 16 } // Base size +2
                 ]}>
                   {' '}₹{formatIndianNumber(Math.abs(transaction.amountPaid))}
                 </Text>
                 <View style={{ flex: 1 }} />
                 <View>
                   <Text style={[
                     styles.balanceLabel, 
                     { color: hideActions ? '#000000' : transactionBalanceColor },
                     hideActions && { fontSize: 12 } // Base size +2
                   ]}>
                     {transactionBalanceLabel}
                   </Text>
                 </View>
               </View>
            )}
        </View>

        {/* Note Section */}
        {transaction.note && transaction.note.trim() !== '' && (
          <View style={styles.noteRow}>
            <Text style={[
              styles.noteLabel,
              hideActions && { fontSize: 15, color: '#000000' } // Base size +2
            ]}>NOTE</Text>
            <Text style={[
              styles.noteText,
              hideActions && { fontSize: 15, color: '#000000' } // Base size +2
            ]}>{transaction.note}</Text>
          </View>
        )}
      </View>
    );
  };

  // Empty State Component
  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="history" size={72} color={theme.colors.onSurfaceVariant} />
      <Text style={styles.emptyTitle}>
        No Transactions Found
      </Text>
      <Text style={styles.emptyDescription}>
        {selectedFilter !== 'today' 
          ? 'Try adjusting your filters or search query' 
          : 'No transactions recorded for today'}
      </Text>
      {selectedFilter !== 'today' && (
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => handleFilterChange('today')}
        >
          <Icon name="filter-remove-outline" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Clear Filter</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. Header Island (Title + Settings) */}
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>History</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={navigateToSettings}>
          <Icon name="cog" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
      </View>

      {/* 2. Toolbar Island (Search + Export) */}
      <View style={styles.toolbarIsland}>
        <View style={styles.searchContainer}>
          <Icon name="magnify" size={24} color={theme.colors.onSurfaceVariant} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={24} color={theme.colors.onSurfaceVariant}
                style={{ marginRight: -4 }}
              />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Export Button (Right of Search) */}
        <TouchableOpacity 
          style={styles.exportBtn} 
          onPress={() => setShowExportDatePicker(true)}
          disabled={isExporting}
        >
          {isExporting ? (
             <ActivityIndicator size={20} color={theme.colors.primary} />
          ) : (
             <Icon name="export-variant" size={24} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* 3. Filter Carousel */}
      <View style={styles.filterCarouselContainer}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterPill, 
              itemFilters.length > 0 && styles.filterPillActive, 
              { marginRight: 8, borderStyle: itemFilters.length === 0 ? 'dashed' : 'solid', 
                borderColor: itemFilters.length > 0 ? theme.colors.primary : 'rgba(0,0,0,0.2)',
                paddingHorizontal: 8, }
            ]}
            onPress={() => setShowFilterSheet(true)}
          >
             <View style={{flexDirection:'row', alignItems:'center', gap: 6}}>
               <Icon 
                 name="filter-variant" 
                 size={18} 
                 color={itemFilters.length > 0 ? theme.colors.onPrimary : theme.colors.primary} 
               />
               <Text style={[
                 styles.filterPillText, 
                 itemFilters.length > 0 && styles.filterPillTextActive,
               ]}>
                 {itemFilters.length === 0 ? 'All Items' : itemFilters.length === 1 ? ITEM_FILTER_OPTIONS.find(o => o.value === itemFilters[0])?.label : `${itemFilters.length} Items`}
               </Text>
               <Icon 
                 name="chevron-down" 
                 size={16} 
                 color={itemFilters.length > 0 ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} 
               />
            </View>
          </TouchableOpacity>

          <View style={{ width: 1, height: 24, backgroundColor: theme.colors.onSurfaceVariant, marginRight: 8 }} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterCarousel}>
            {['today', 'last7days', 'last30days', 'custom'].map((f) => {
              let label = '';
              if (f === 'today') label = 'Today';
              else if (f === 'last7days') label = 'Last 7 Days';
              else if (f === 'last30days') label = 'Last 30 Days';
              else {
                  if (customStartDate && customEndDate) {
                      const startStr = formatDate(customStartDate);
                      const endStr = formatDate(customEndDate);
                      if (startStr === endStr) label = startStr;
                      else label = `${startStr} - ${endStr}`;
                  } else {
                      label = 'Custom Range';
                  }
              }
              
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterPill, selectedFilter === f && styles.filterPillActive]}
                  onPress={() => handleFilterChange(f as any)}
                >
                  <Text style={[styles.filterPillText, selectedFilter === f && styles.filterPillTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* 4. Transaction List */}
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionCard transaction={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => loadTransactions(true)} colors={[theme.colors.primary]} />
        }
      />
    </SafeAreaView>

    {/* Components (Alerts, Modals) */}
    <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} buttons={alertButtons} onDismiss={() => setAlertVisible(false)} />
    {showStartDatePicker && <DateTimePicker value={customStartDate || new Date()} mode="date" onChange={handleStartDateChange} />}
    {showEndDatePicker && <DateTimePicker value={customEndDate || customStartDate || new Date()} mode="date" onChange={handleEndDateChange} />}
    {showExportDatePicker && <DateTimePicker value={exportDate} mode="date" onChange={handleExportDateChange} maximumDate={new Date()} />}
    
    {/* Export Progress Modal */}
    <Modal visible={isExporting} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center'}}>
        <Surface style={{padding: 24, borderRadius: 16, width: 300, alignItems: 'center', backgroundColor: theme.colors.surface, elevation: 4}}>
          <ActivityIndicator size="large" color={theme.colors.primary} style={{marginBottom: 16}} />
          <Text variant="titleMedium" style={{marginBottom: 8, fontFamily: 'Outfit_600SemiBold', color: theme.colors.onSurface}}>
            {exportStatus === 'capturing' ? 'Capturing Transactions...' : 
             exportStatus === 'generating' ? 'Generating PDF...' : 
             exportStatus === 'cleaning' ? 'Cleaning up...' : 'Preparing...'}
          </Text>
          {exportStatus === 'capturing' && (
            <Text variant="bodyMedium" style={{color: theme.colors.onSurfaceVariant}}>
              {exportProgress.current} / {exportProgress.total}
            </Text>
          )}
        </Surface>
      </View>
    </Modal>

    {/* Filter Bottom Sheet */}
    <Modal
      visible={showFilterSheet}
      transparent
      animationType="slide"
      onRequestClose={() => setShowFilterSheet(false)}
    >
      <Pressable style={styles.sheetOverlay} onPress={() => setShowFilterSheet(false)}>
        <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filter Items</Text>
            {itemFilters.length > 0 && (
                <TouchableOpacity onPress={() => setItemFilters([])}>
                    <Text style={{color: theme.colors.primary, fontFamily:'Outfit_600SemiBold'}}>Clear</Text>
                </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.sheetSubtitle}>Show transactions containing:</Text>
          
          <View style={styles.chipGrid}>
            {ITEM_FILTER_OPTIONS.map((option) => {
              const isSelected = itemFilters.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.sheetChip, isSelected && styles.sheetChipSelected]}
                  onPress={() => toggleItemFilter(option.value)}
                >
                  {isSelected && <Icon name="check" size={16} color={theme.colors.primary} style={{marginRight:4}} />}
                  <Text style={[styles.sheetChipText, isSelected && styles.sheetChipTextSelected]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button 
            mode="contained" 
            style={styles.applyButton} 
            onPress={() => setShowFilterSheet(false)}
            contentStyle={{height: 48}}
            labelStyle={{fontSize:16}}
          >
            Apply Filters
          </Button>
        </Pressable>
      </Pressable>
    </Modal>

    {/* Hidden Share View */}
    {sharingTransactionId && (
      <View style={styles.hiddenCard}>
         <View ref={shareableCardRef} style={styles.shareableCardWrapper} collapsable={false}>
            {(() => {
               const tx = transactions.find(t => t.id === sharingTransactionId);
               return tx ? <TransactionCard transaction={tx} hideActions={true} allowFontScaling={false} /> : null;
            })()}
         </View>
      </View>
    )}

    {/* Printing Progress Modal */}
    <Modal visible={isPrinting} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center'}}>
        <Surface style={{padding: 24, borderRadius: 16, width: 300, alignItems: 'center', backgroundColor: theme.colors.surface, elevation: 4}}>
          <ActivityIndicator size="large" color={theme.colors.primary} style={{marginBottom: 16}} />
          <Text variant="titleMedium" style={{marginBottom: 8, fontFamily: 'Outfit_600SemiBold', color: theme.colors.onSurface}}>
            Printing...
          </Text>
          <Text variant="bodyMedium" style={{color: theme.colors.onSurfaceVariant, textAlign: 'center'}}>
            Please wait while the transaction is being printed.
          </Text>
        </Surface>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  // 1. Header Styles
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  screenTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 32,
    color: theme.colors.onPrimaryContainer,
    letterSpacing: -1,
  },
  settingsBtn: {
    width: 48,
    height: 48,
    marginRight: -7,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  // 2. Toolbar Island
  toolbarIsland: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.onSurface,
  },
  exportBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  // 3. Filter Carousel
  filterCarouselContainer: {
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  filterCarousel: {
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  filterPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterPillText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  filterPillTextActive: {
    color: theme.colors.onPrimary,
  },
  // 4. Transaction Card
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  historyCard: {
    backgroundColor: theme.colors.surfaceContainerHigh || '#F0F2F5', 
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    elevation: 3, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoBlock: {
    flex: 1,
  },
  customerName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    color: theme.colors.onSurface,
  },
  transactionDate: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  mainAmount: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    marginBottom: 4,
  },
  balanceLabelContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  balanceLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  receiptSection: {
    backgroundColor: theme.colors.surface, // Lighter inner card for depth
    borderRadius: 16,
    padding: 12,
  },
  entryWrapper: {
    marginBottom: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  iconSell: {
    backgroundColor: '#E8F5E9', // Light Green
  },
  iconPurchase: {
    backgroundColor: '#E3F2FD', // Light Blue
  },
  iconMoney: {
    backgroundColor: '#FFF8E1', // Light Orange
  },
  itemNameText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  itemVal: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  divider: {
    marginVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    height: 1,
  },
  footerLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  footerRow: {
    justifyContent: 'flex-start',
  },
  // Actions
  cardTopActions: {
    marginBottom: 12,
    alignSelf: 'flex-end'
  },
  actionPill: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDelete: {
    backgroundColor: theme.colors.errorContainer,
  },
  btnShare: {
    backgroundColor: '#E8F5E9',
  },
  btnEdit: {
    backgroundColor: theme.colors.primaryContainer,
  },
  disabledButton: {
    opacity: 0.5,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  totalAmount: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  footerAmount: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  noteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  noteLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  noteText: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: 'right',
  },
  emptyState: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    textAlign: 'center',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 20,
    marginTop: 16,
    marginBottom: 8,
    color: theme.colors.onSurface,
  },
  emptyDescription: {
    textAlign: 'center',
    marginBottom: 24,
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 100,
    gap: 8,
    elevation: 2,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  hiddenCard: {
    position: 'absolute',
    left: -1000,
    top: 0,
  },
  shareableCardWrapper: {
    backgroundColor: '#FFFFFF', // Pure white for thermal printing
    padding: 0, // Zero padding to prevent clipping
    margin: 0, // Ensure NO margins are present
    width: 400, // Reduced width for safe printing on 80mm paper
  },
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    elevation: 24,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: 'Outfit_700Bold', fontSize: 20, color: theme.colors.onSurface,
  },
  sheetSubtitle: {
    fontFamily: 'Outfit_400Regular', color: theme.colors.onSurfaceVariant, marginBottom: 16,
  },
  chipGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24,
  },
  sheetChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1, borderColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  sheetChipSelected: {
    backgroundColor: theme.colors.primaryContainer, 
    borderColor: theme.colors.primary,
  },
  sheetChipText: {
    fontFamily: 'Outfit_500Medium', color: theme.colors.onSurfaceVariant,
  },
  sheetChipTextSelected: {
    color: theme.colors.primary,
  },
  applyButton: {
    borderRadius: 100, overflow: 'hidden',
  },
});