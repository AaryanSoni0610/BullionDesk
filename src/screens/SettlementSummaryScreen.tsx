import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, BackHandler, Alert, Platform, TouchableOpacity } from 'react-native';
import {
  Surface,
  Text,
  Button,
  Card,
  IconButton,
  FAB,
  Divider,
  TextInput,
  HelperText,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { formatWeight, formatIndianNumber } from '../utils/formatting';
import { Customer, TransactionEntry, PaymentInput } from '../types';
import { LedgerService } from '../services/ledger.service';
import CustomAlert from '../components/CustomAlert';
import { useAppContext } from '../context/AppContext';

interface SettlementSummaryScreenProps {
  customer: Customer;
  entries: TransactionEntry[];
  onBack: () => void;
  onAddMoreEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onEditEntry: (entryId: string) => void;
  onSaveTransaction: (payments: PaymentInput[], saveDate?: Date | null, note?: string) => void;
  editingTransactionId?: string | null;
  transactionCreatedAt?: string | null;
  transactionLastUpdatedAt?: string | null;
  initialNote?: string;
}

export const SettlementSummaryScreen: React.FC<SettlementSummaryScreenProps> = ({
  customer,
  entries,
  onBack,
  onAddMoreEntry,
  onDeleteEntry,
  onEditEntry,
  onSaveTransaction,
  editingTransactionId,
  transactionCreatedAt,
  initialNote = '',
}) => {
  const { pendingMoneyAmount, setPendingMoneyAmount, pendingMoneyType } = useAppContext();
  
  const [payments, setPayments] = useState<PaymentInput[]>([]);
  
  // Load payments
  React.useEffect(() => {
    const loadPayments = async () => {
      if (editingTransactionId) {
        const ledgerEntries = await LedgerService.getLedgerEntriesByTransactionId(editingTransactionId);
        const moneyEntries = ledgerEntries.filter(l => l.itemType === 'money');
        const loadedPayments = moneyEntries.map(l => ({
          id: l.id,
          amount: l.amount || 0,
          date: l.date,
          type: l.type as 'receive' | 'give'
        })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setPayments(loadedPayments);
      } else if (pendingMoneyAmount !== 0) {
         setPayments([{
           amount: Math.abs(pendingMoneyAmount), 
           date: new Date().toISOString(),
           type: pendingMoneyType
         }]);
         setPendingMoneyAmount(0);
      }
    };
    loadPayments();
  }, [editingTransactionId]);
  
  const [paymentError, setPaymentError] = useState('');
  const [note, setNote] = useState(initialNote);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSaveDate, setSelectedSaveDate] = useState<Date>(
    transactionCreatedAt ? new Date(transactionCreatedAt) : new Date()
  );
  const [showSaveDatePicker, setShowSaveDatePicker] = useState(false);
  const [pendingSaveDate, setPendingSaveDate] = useState<Date | null>(null);
  const [showDateWarningAlert, setShowDateWarningAlert] = useState(false);
  const [editingPaymentDateIndex, setEditingPaymentDateIndex] = useState<number | null>(null);
  const isEditing = !!editingTransactionId;

  // Format date for display in DD Mon YYYY format
  const formatDateDisplay = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${monthNames[date.getMonth()]} ${year}`;
  };

  // Handle hardware back button - same as X button in titlebar
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        onBack();
        return true; // Prevent default back behavior
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [onBack])
  );

  // Handle Select Save Date button press
  const handleSelectSaveDatePress = () => {
    if (isEditing) return; // Disabled for editing
    setShowSaveDatePicker(true);
  };

  // Handle save date picker change
  const handleSaveDateChange = (event: any, selectedDate?: Date) => {
    const isConfirmed = event.type === 'set';
    setShowSaveDatePicker(Platform.OS === 'ios' && isConfirmed); // Keep open on iOS only if confirmed
    
    if (isConfirmed && selectedDate) {
      const today = new Date();
      const isTodaySelected = selectedDate.getFullYear() === today.getFullYear() &&
                             selectedDate.getMonth() === today.getMonth() &&
                             selectedDate.getDate() === today.getDate();
      
      if (!isTodaySelected) {
        // Show custom alert warning for non-today dates
        setPendingSaveDate(selectedDate);
        setShowDateWarningAlert(true);
      } else {
        // Today selected, no warning needed
        setSelectedSaveDate(selectedDate);
        
        // If money-only transaction, update payment dates to match
        if (isMoneyOnlyTransaction) {
            const newPayments = payments.map(p => ({
                ...p,
                date: selectedDate.toISOString()
            }));
            setPayments(newPayments);
        }
      }
    } else if (event.type === 'dismissed') {
      // User cancelled, don't change anything
      setShowSaveDatePicker(false);
    }
  };

  // Handle date warning alert continue
  const handleDateWarningContinue = () => {
    if (pendingSaveDate) {
      setSelectedSaveDate(pendingSaveDate);
      
      // If money-only transaction, update payment dates to match
      if (isMoneyOnlyTransaction) {
          const newPayments = payments.map(p => ({
              ...p,
              date: pendingSaveDate.toISOString()
          }));
          setPayments(newPayments);
      }
      
      setPendingSaveDate(null);
    }
    setShowDateWarningAlert(false);
  };

  // Handle date warning alert cancel
  const handleDateWarningCancel = () => {
    setPendingSaveDate(null);
    setShowDateWarningAlert(false);
  };

  const handlePaymentDateChange = (event: any, selectedDate?: Date) => {
    const isConfirmed = event.type === 'set';
    // On Android, the picker closes automatically. On iOS, we might need to handle it.
    // But for simplicity, let's assume standard behavior.
    
    if (isConfirmed && selectedDate && editingPaymentDateIndex !== null) {
      handleUpdatePayment(editingPaymentDateIndex, 'date', selectedDate.toISOString());
    }
    setEditingPaymentDateIndex(null);
  };
  
  const getItemDisplayName = (entry: TransactionEntry): string => {
    if (entry.type === 'money') {
      return 'Money';
    }
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999',
      'gold995': 'Gold 995',
      'rani': 'Rani',
      'silver': 'Silver',
      'rupu': 'Rupu',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };

  const formatEntryDetails = (entry: TransactionEntry): string => {
    if (entry.type === 'money') {
      const type = entry.moneyType === 'receive' ? 'Receive' : 'Give';
      return `${type}: ₹${formatIndianNumber(entry.amount || 0)}`;
    }

    if (entry.itemType === 'rani') {
      const touchNum = entry.touch || 0;
      const cutNum = entry.cut || 0;
      const effectiveTouch = Math.max(0, touchNum - cutNum);
      const pureGold = entry.pureWeight || ((entry.weight || 0) * effectiveTouch) / 100;
      const details = `Weight: ${entry.weight?.toFixed(3)}g, Touch: ${entry.touch?.toFixed(2)}%, Cut: ${entry.cut?.toFixed(2) || 0}%, Pure: ${formatWeight(pureGold, false)}`;
      if (entry.price !== undefined) {
        return `${details}, Price: ₹${formatIndianNumber(entry.price)}/10g`;
      }
      return details;
    }

    if (entry.itemType === 'rupu') {
      const pureWeight = entry.pureWeight || ((entry.weight || 0) * (entry.touch || 0)) / 100;
      const details = `Weight: ${entry.weight?.toFixed(1)}g, Touch: ${entry.touch?.toFixed(2)}%, Pure: ${formatWeight(pureWeight, true)}`;
      if (entry.price !== undefined) {
        return `${details}, Price: ₹${formatIndianNumber(entry.price)}/kg`;
      }
      return details;
    }

    // Regular metals
    const details = `Weight: ${entry.weight}g`;
    if (entry.price !== undefined) {
      return `${details}, Price: ₹${formatIndianNumber(entry.price)}/${entry.itemType.startsWith('gold') ? '10g' : 'kg'}`;
    }
    return details;
  };

  const calculateTotals = () => {
    let netMoneyFlow = 0; // Net money from merchant perspective: positive = merchant takes money, negative = merchant gives money
    const giveItems: { item: string; amount: string }[] = []; // What merchant gives to customer
    const takeItems: { item: string; amount: string }[] = []; // What merchant takes from customer
    
    // Check if this is a metal-only transaction
    const isMetalOnly = entries.some(entry => entry.metalOnly === true);

    entries.forEach(entry => {
      // For metal-only entries, don't add to netMoneyFlow
      if (entry.metalOnly) {
        if (entry.type === 'sell') {
          // Merchant gives metal to customer (metal debt - customer owes merchant metal)
          giveItems.push({ 
            item: getItemDisplayName(entry), 
            amount: formatWeight(entry.weight || 0, entry.itemType?.includes('silver') || entry.itemType === 'rupu') 
          });
        } else if (entry.type === 'purchase') {
          // Merchant takes metal from customer (metal balance - merchant owes customer metal)
          takeItems.push({ 
            item: getItemDisplayName(entry), 
            amount: formatWeight(entry.weight || 0, entry.itemType?.includes('silver') || entry.itemType === 'rupu') 
          });
        }
      } else {
        // Regular money transactions
        if (entry.type === 'sell') {
          // Merchant sells: takes money (+), gives goods
          netMoneyFlow += Math.abs(entry.subtotal);
          giveItems.push({ 
            item: getItemDisplayName(entry), 
            amount: formatWeight(entry.weight || 0, entry.itemType?.includes('silver') || entry.itemType === 'rupu') 
          });
        } else if (entry.type === 'purchase') {
          // Special case for rupu purchase with silver return and net weight < 0: inward flow
          if (entry.itemType === 'rupu' && entry.rupuReturnType === 'silver' && (entry.netWeight || 0) < 0) {
            // Inward flow: merchant receives money
            netMoneyFlow += Math.abs(entry.subtotal);
            takeItems.push({ 
              item: getItemDisplayName(entry), 
              amount: formatWeight(entry.weight || 0, entry.itemType?.includes('silver') || entry.itemType === 'rupu') 
            });
          } else {
            // Normal purchase: gives money (-), takes goods
            netMoneyFlow -= Math.abs(entry.subtotal);
            takeItems.push({ 
              item: getItemDisplayName(entry), 
              amount: formatWeight(entry.weight || 0, entry.itemType?.includes('silver') || entry.itemType === 'rupu') 
            });
          }
        } else if (entry.type === 'money') {
          // Money transaction: add to net money flow based on moneyType
          // Positive subtotal = inward flow (merchant receives money)
          // Negative subtotal = outward flow (merchant gives money)
          netMoneyFlow += entry.subtotal;
          // Don't add money entries to give/take items to avoid redundancy
        }
      }
    });

    const netAmount = netMoneyFlow; // Positive = customer owes merchant, Negative = merchant owes customer
    
    return { 
      netAmount, 
      giveItems, 
      takeItems,
      isMetalOnly 
    };
  };

  const { netAmount, giveItems, takeItems, isMetalOnly } = calculateTotals();
  
  // Calculate total received from payments
  const totalReceived = payments.reduce((sum, p) => sum + (p.type === 'receive' ? p.amount : -p.amount), 0);

  // Apply discount/extra to net amount
  const adjustedNetAmount = netAmount;

  // Calculate full amount excluding last payment
  const fullAmount = payments.length === 0 
    ? Math.abs(adjustedNetAmount)
    : payments.length === 1
    ? Math.abs(adjustedNetAmount - totalReceived)
    : (() => {
        const receivedExclLast = payments.slice(0, -1)
          .filter(p => p.type === 'receive')
          .reduce((sum, p) => sum + p.amount, 0);
        const givenExclLast = payments.slice(0, -1)
          .filter(p => p.type === 'give')
          .reduce((sum, p) => sum + p.amount, 0);
        return Math.abs(adjustedNetAmount - (receivedExclLast - givenExclLast));
      })();


  
  // Check if this is a money-only transaction (no entries)
  const isMoneyOnlyTransaction = entries.length === 0;
  


  // Show FAB for non-money-only transactions or when editing money-only transactions
  const shouldShowFAB = !isMoneyOnlyTransaction || isEditing;

  const handleAddPayment = (initialAmount?: number) => {
    // If money-only transaction, use the selected save date as default
    const defaultDate = isMoneyOnlyTransaction ? selectedSaveDate.toISOString() : new Date().toISOString();
    
    // Auto-determine payment type based on remaining balance
    // If we have received more than net amount, we need to give back (give)
    // If we have received less than net amount, we need to receive more (receive)
    // For purchase (negative netAmount): if we gave more (more negative), receive back. If we gave less, give more.
    let defaultType: 'receive' | 'give' = 'receive';
    
    // Logic: 
    // Target = adjustedNetAmount
    // Current = totalReceived
    // Gap = Target - Current.
    // If Gap > 0, we need positive flow (receive).
    // If Gap < 0, we need negative flow (give).
    if (!isMoneyOnlyTransaction) {
        const gap = adjustedNetAmount - totalReceived;
        if (gap < 0) defaultType = 'give';
        else defaultType = 'receive';
    }

    setPayments([...payments, {
      amount: initialAmount || 0,
      date: defaultDate,
      type: defaultType
    }]);
  };

  const handleUpdatePayment = (index: number, field: keyof PaymentInput, value: any) => {
    const newPayments = [...payments];
    newPayments[index] = { ...newPayments[index], [field]: value };
    setPayments(newPayments);
  };

  // Enhanced save transaction with validation
  const handleSaveTransaction = async () => {
    
    setIsSaving(true);
    setPaymentError('');
    try {
      // Determine save date: null for today (use current date/time), or selected date with random time
      const today = new Date();
      const isTodaySelected = selectedSaveDate.getFullYear() === today.getFullYear() &&
                             selectedSaveDate.getMonth() === today.getMonth() &&
                             selectedSaveDate.getDate() === today.getDate();
      
      let saveDate: Date | null = null;
      if (!isTodaySelected) {
        // Create date with random time between 10:00 AM and 8:00 PM
        const randomHour = Math.floor(Math.random() * 10) + 10; // 10 to 19 (10 AM to 9 PM)
        const randomMinute = Math.floor(Math.random() * 60);
        saveDate = new Date(selectedSaveDate);
        saveDate.setHours(randomHour, randomMinute, 0, 0);
      }
      
      // For money-only transactions, ensure payment dates match the transaction date if they are different
      // This fixes the issue where transaction date and ledger entry date are out of sync
      let finalPayments = [...payments];
      if (isMoneyOnlyTransaction && saveDate) {
          finalPayments = payments.map(p => {
              // If the payment date is just "today" (default) or different from saveDate, sync it
              // We preserve the time if possible, or use the saveDate time
              const pDate = new Date(p.date);
              const sDate = new Date(saveDate!);
              
              // Check if dates (YMD) are different
              if (pDate.getFullYear() !== sDate.getFullYear() || 
                  pDate.getMonth() !== sDate.getMonth() || 
                  pDate.getDate() !== sDate.getDate()) {
                      return { ...p, date: saveDate!.toISOString() };
                  }
              return p;
          });
      }

      // Validations
      if (!isMoneyOnlyTransaction) {
        // Calculate new total received including the new changes
        const totalReceivedAmount = finalPayments
          .filter(p => p.type === 'receive')
          .reduce((sum, p) => sum + p.amount, 0);
        
        const totalGivenAmount = finalPayments
          .filter(p => p.type === 'give')
          .reduce((sum, p) => sum + p.amount, 0);

        const netSettlement = Math.abs(totalReceivedAmount - totalGivenAmount);
        const transactionTotal = Math.abs(adjustedNetAmount);
        
        // Strict validation: Net settlement (difference between received and given) cannot exceed transaction total
        if (netSettlement > transactionTotal + 1) { // +1 tolerance
            setPaymentError(`Net settlement amount (₹${formatIndianNumber(netSettlement)}) cannot exceed transaction total (₹${formatIndianNumber(transactionTotal)})`);
            return;
        }
      }

      await onSaveTransaction(finalPayments, saveDate, note);
    } catch (error) {
      console.error('Failed to save transaction:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Calculate final balance based on money flow direction (using adjusted amount)
  let finalBalance: number;
  
  if (isMoneyOnlyTransaction) {
    // For money-only transactions (INVERTED SIGN CONVENTION):
    // Positive received = merchant receives money = customer has balance/credit
    // Negative received = merchant gives money = customer has debt
    finalBalance = totalReceived;
  } else {
    // For sell/purchase transactions (INVERTED SIGN CONVENTION):
    // Positive balance = merchant owes customer (credit)
    // Negative balance = customer owes merchant (debt)
    finalBalance = totalReceived - adjustedNetAmount;
  }

  const renderEntryCard = (entry: TransactionEntry, index: number) => {


    return (
    <View key={entry.id} style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <Text style={styles.entryTitle}>
          {entry.type === 'money' ? 'Money' : `${entry.type === 'sell' ? 'Sell' : 'Buy'} - ${getItemDisplayName(entry)}`}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => onEditEntry(entry.id)}>
             <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDeleteEntry(entry.id)} disabled={!!editingTransactionId}>
             <MaterialCommunityIcons name="delete" size={20} color={!!editingTransactionId ? theme.colors.onSurfaceDisabled : theme.colors.error} style={{ marginLeft: 16 }} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.entryDetails}>{formatEntryDetails(entry)}</Text>
      <Text style={styles.entryTotal}>Total: {entry.subtotal >= 0 ? '+' : '-'}₹{formatIndianNumber(Math.abs(entry.subtotal))}</Text>
    </View>
  );
};

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1B1B1F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Summary</Text>
      </View>

      {/* Customer Bar */}
      <View style={styles.customerBar}>
        <Text style={styles.customerName}>{customer.name}</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onBack}>
          <MaterialCommunityIcons name="close" size={20} color="#BA1A1A" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          shouldShowFAB ? styles.scrollContentWithFAB : styles.scrollContentWithoutFAB
        ]}
      >
        {/* Date Pill */}
        <View style={styles.dateContainer}>
          <TouchableOpacity style={styles.dateBtnProminent} onPress={handleSelectSaveDatePress} disabled={isEditing}>
            <MaterialCommunityIcons name="calendar-month" size={20} color="#005AC1" />
            <Text style={styles.dateText}>Save on: {formatDateDisplay(selectedSaveDate)}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color="#44474F" />
          </TouchableOpacity>
        </View>

        {/* Save Date Picker Modal */}
        {showSaveDatePicker && (
          <DateTimePicker
            value={selectedSaveDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleSaveDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Entry Cards */}
        <View style={styles.entriesSection}>
          {isMoneyOnlyTransaction ? (
            <View style={styles.entryCard}>
              <Text style={styles.moneyOnlyText}>
                No entry is added
              </Text>
            </View>
          ) : (
            entries.map((entry, index) => renderEntryCard(entry, index))
          )}
        </View>

        {/* Trade Summary Card */}
        <View style={styles.tradeCard}>
          <Text style={styles.cardLabel}>Trade Summary</Text>
          <View style={styles.tradeRow}>
            {/* Give Section */}
            <View style={styles.tradeCol}>
              <View style={styles.tradeHeader}>
                <MaterialCommunityIcons name="hand-coin-outline" size={20} color={theme.colors.primary} />
                <Text style={[styles.tradeHeaderText, { color: theme.colors.onSurfaceVariant }]}>GIVE</Text>
              </View>
              {giveItems.map((item, index) => (
                <Text key={index} style={styles.tradeItem}>
                  • {item.item}: {item.amount}
                </Text>
              ))}
              {!isMetalOnly && netAmount < 0 && (
                <Text style={styles.tradeItem}>
                  • Money: ₹{formatIndianNumber(Math.abs(netAmount))}
                </Text>
              )}
              {giveItems.length === 0 && (isMetalOnly || netAmount >= 0) && (
                <Text style={styles.tradeItem}>• Nothing</Text>
              )}
            </View>

            {/* Take Section */}
            <View style={styles.tradeCol}>
              <View style={styles.tradeHeader}>
                <MaterialCommunityIcons name="hand-coin" size={20} color={theme.colors.sellColor} />
                <Text style={[styles.tradeHeaderText, { color: theme.colors.onSurfaceVariant }]}>TAKE</Text>
              </View>
              {takeItems.map((item, index) => (
                <Text key={index} style={styles.tradeItem}>
                  • {item.item}: {item.amount}
                </Text>
              ))}
              {!isMetalOnly && netAmount > 0 && (
                <Text style={styles.tradeItem}>
                  • Money: ₹{formatIndianNumber(netAmount)}
                </Text>
              )}
              {takeItems.length === 0 && (isMetalOnly || netAmount <= 0) && (
                <Text style={styles.tradeItem}>• Nothing</Text>
              )}
            </View>
          </View>
        </View>

        {/* Settlement Card - hide for metal-only transactions */}
        {!isMetalOnly && (entries.some(entry => entry.type !== 'money') || isMoneyOnlyTransaction) && (
          <View style={styles.settleCard}>
            <View style={styles.settleHeader}>
              <Text style={styles.settleHeaderLabel}>
                {isMoneyOnlyTransaction 
                  ? (pendingMoneyType === 'receive' ? 'Customer Pays:' : 'Customer Gets:')
                  : ((adjustedNetAmount - totalReceived) > 0 ? 'Customer Pays:' : 'Customer Gets:')
                }
              </Text>
              <Text style={styles.heroAmount}>
                ₹{formatIndianNumber(isMoneyOnlyTransaction 
                  ? 0
                  : Math.abs(adjustedNetAmount - totalReceived)
                )}
              </Text>
            </View>

            <View style={styles.settleBody}>
              {/* Payments List */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                   <Text style={styles.cardLabel}>Payments</Text>
                   <Button mode="contained" compact onPress={() => handleAddPayment()} icon="plus" disabled={(isMoneyOnlyTransaction && !isEditing) || payments.some(p => p.amount === 0) || finalBalance === 0}>Add</Button>
                </View>
                
                {paymentError ? <Text style={{ color: 'red', fontSize: 12, marginHorizontal: 4 }}>{paymentError}</Text> : null}

                {payments.map((payment, index) => (
                  <View key={index} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      value={payment.amount === 0 ? '' : payment.amount.toString()}
                      onChangeText={!!payment.id ? undefined : (text) => handleUpdatePayment(index, 'amount', parseFloat(text) || 0)}
                      label={payment.type === 'receive' ? "Receive" : "Give"}
                      mode="outlined"
                      keyboardType="numeric"
                      editable={!payment.id}
                      style={[styles.textInput, { flex: 1 }]}
                      theme={{ roundness: 12, fonts: { regular: { fontFamily: 'Outfit_400Regular' } } }}
                    />
                    
                    <TouchableOpacity 
                      onPress={!!payment.id ? undefined : () => setEditingPaymentDateIndex(index)} 
                      disabled={!!payment.id}
                      style={[styles.dateBtnProminent, { paddingHorizontal: 12, paddingVertical: 8 }]}
                    >
                       <Text style={styles.dateText}>{formatDateDisplay(new Date(payment.date))}</Text>
                    </TouchableOpacity>
                    {!payment.id && (
                      <IconButton icon="close" size={20} onPress={() => {
                        const newPayments = [...payments];
                        newPayments.splice(index, 1);
                        setPayments(newPayments);
                      }} />
                    )}
                  </View>
                ))}
                {payments.length === 0 && (
                   <Text style={{ textAlign: 'center', color: '#666', fontStyle: 'italic' }}>No payments added</Text>
                )}
              </View>

              {/* Payment Date Picker */}
              {editingPaymentDateIndex !== null && (
                <DateTimePicker
                  value={new Date(payments[editingPaymentDateIndex].date)}
                  mode="date"
                  display="default"
                  onChange={handlePaymentDateChange}
                  maximumDate={new Date()}
                  minimumDate={
                    editingPaymentDateIndex === 0
                      ? selectedSaveDate
                      : new Date(payments[editingPaymentDateIndex - 1].date)
                  }
                />
              )}

              {/* Full Amount Chip */}
              {!isMoneyOnlyTransaction && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Chip
                    mode="outlined"
                    style={styles.fullChip}
                    textStyle={styles.fullChipText}
                    onPress={() => {
                      const editablePayments = payments.filter(p => !p.id);
                      if (editablePayments.length > 0) {
                        const lastEditableIndex = payments.lastIndexOf(editablePayments[editablePayments.length - 1]);
                        handleUpdatePayment(lastEditableIndex, 'amount', fullAmount);
                      } else {
                        handleAddPayment(fullAmount);
                      }
                    }}
                  >
                    Full: ₹{formatIndianNumber(fullAmount)}
                  </Chip>
                  <Chip
                    mode="outlined"
                    style={styles.clearChip}
                    textStyle={styles.clearChipText}
                    onPress={() => {
                      if (payments.length > 0) {
                        const lastIndex = payments.length - 1;
                        handleUpdatePayment(lastIndex, 'amount', 0);
                      }
                    }}
                  >
                    Clear
                  </Chip>
                </View>
              )}

              {/* Note Input */}
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Add a note..."
                style={[ styles.textInput ]}
                mode="outlined"
                theme={{ roundness: 12, colors: { outline: 'transparent' } }}
              />
            </View>

            <View style={styles.settleFooter}>
              <Text style={styles.settleFooterLabel}>
                {finalBalance > 0 ? 'Balance:' : finalBalance < 0 ? 'Debt:' : 'Settled'}
              </Text>
              <Text style={[
                styles.balanceVal,
                { color: finalBalance > 0 ? '#146C2E' : finalBalance < 0 ? theme.colors.debtColor : theme.colors.onSurface }
              ]}>
                ₹{formatIndianNumber(Math.abs(finalBalance))}
              </Text>
            </View>
          </View>
        )}
        
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      {shouldShowFAB && (
        <TouchableOpacity style={styles.fab} onPress={onAddMoreEntry}>
          <MaterialCommunityIcons name="plus" size={32} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* Save Bar */}
      <View style={styles.saveBar}>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btnSecondary} onPress={onBack}>
            <Text style={styles.btnSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, (isSaving || !!paymentError || (payments.length > 0 && payments[payments.length - 1].amount === 0)) && { opacity: 0.75 }]}
            onPress={handleSaveTransaction}
            disabled={isSaving || !!paymentError || (payments.length > 0 && payments[payments.length - 1].amount === 0)}
          >
            {isSaving ? (
              <Text style={styles.btnPrimaryText}>{isEditing ? 'Updating...' : 'Saving...'}</Text>
            ) : (
              <>
                <MaterialCommunityIcons name="check" size={20} color="#FFF" />
                <Text style={styles.btnPrimaryText}>{isEditing ? 'Update Transaction' : 'Save Transaction'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Warning Custom Alert */}
      <CustomAlert
        visible={showDateWarningAlert}
        title="Date Selection Warning"
        message="You have selected a date that is not today. This can lead to severe problems in accounting. Are you sure you want to continue?"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: handleDateWarningCancel },
          { text: 'Continue', onPress: handleDateWarningContinue }
        ]}
        onDismiss={handleDateWarningCancel}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFBFF', // --background
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDFBFF',
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F2F5', // --surface-container
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#1B1B1F', // --on-surface
    letterSpacing: -1,
  },
  customerBar: {
    backgroundColor: 'rgba(240, 242, 245, 0.5)', // --surface
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E2E5', // --outline
  },
  customerName: {
    fontSize: 16,
    color: '#1B1B1F', // --on-surface
    fontFamily: 'Outfit_600SemiBold',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFDAD6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  scrollContentWithFAB: {
    paddingBottom: 50,
  },
  scrollContentWithoutFAB: {
    paddingBottom: 50,
  },
  dateContainer: {
    alignItems: 'center',
    backgroundColor: '#FDFBFF',
  },
  dateBtnProminent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF', // --surface
    borderWidth: 1,
    borderColor: '#E0E2E5', // --outline
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 100, // --radius-pill
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  dateText: {
    fontSize: 14,
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F', // --on-surface
  },
  entriesSection: {
    gap: 16,
  },
  entryCard: {
    backgroundColor: '#FFFFFF', // --surface
    borderWidth: 1,
    borderColor: '#E0E2E5', // --outline
    borderRadius: 16, // --radius-m
    padding: 16,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryTitle: {
    fontSize: 14,
    color: '#005AC1', // --primary
    fontFamily: 'Outfit_700Bold',
  },
  entryDetails: {
    fontSize: 13,
    color: '#44474F', // --on-surface-variant
    marginBottom: 4,
    lineHeight: 18,
    fontFamily: 'Outfit_400Regular',
  },
  entryTotal: {
    fontSize: 14,
    color: '#1B1B1F', // --on-surface
    fontFamily: 'Outfit_600SemiBold',
  },
  moneyOnlyText: {
    textAlign: 'center',
    fontFamily: 'Outfit_500Medium',
    color: '#44474F',
  },
  tradeCard: {
    backgroundColor: '#F0F2F5', // --surface-container
    borderRadius: 24, // --radius-l
    padding: 16,
  },
  cardLabel: {
    fontSize: 14,
    marginBottom: 12,
    fontFamily: 'Outfit_700Bold',
    color: '#1B1B1F',
  },
  tradeRow: {
    flexDirection: 'row',
    gap: 16,
  },
  tradeCol: {
    flex: 1,
  },
  tradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  tradeHeaderText: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: 'Outfit_700Bold',
  },
  tradeItem: {
    fontSize: 13,
    color: '#1B1B1F',
    marginBottom: 4,
    fontFamily: 'Outfit_400Regular',
  },
  settleCard: {
    backgroundColor: '#F0F2F5', // --surface-container
    borderRadius: 24, // --radius-l
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E2E5', // --outline
  },
  settleHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E2E5',
  },
  settleHeaderLabel: {
    fontSize: 14,
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F',
  },
  heroAmount: {
    fontSize: 20,
    color: '#005AC1', // --primary
    fontFamily: 'Outfit_700Bold',
  },
  settleBody: {
    padding: 16,
    gap: 12,
  },
  textInput: {
    backgroundColor: '#FFFFFF', // --surface
    fontSize: 16,
    fontFamily: 'Outfit_400Regular',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: '#FFFFFF', // --surface
    borderWidth: 1,
    borderColor: '#E0E2E5', // --outline
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100, // --radius-pill
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F',
  },
  noteInput: {
    backgroundColor: 'transparent',
    fontSize: 16,
    fontFamily: 'Outfit_400Regular',
    paddingHorizontal: 0,
  },
  fullChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E2E5',
  },
  fullChipText: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F',
  },
  clearChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E2E5',
  },
  clearChipText: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F',
  },
  settleFooter: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderTopWidth: 1,
    borderTopColor: '#E0E2E5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settleFooterLabel: {
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F',
  },
  balanceVal: {
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 64,
    height: 64,
    backgroundColor: '#00BCD4', // --primary
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#00BCD4',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF', // --surface
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E2E5', // --outline
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#FFFFFF', // --surface
    borderWidth: 1,
    borderColor: '#E0E2E5', // --outline
    paddingVertical: 14,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F', // --on-surface
  },
  btnPrimary: {
    flex: 2,
    backgroundColor: '#1B1B1F', // Success Green
    paddingVertical: 14,
    borderRadius: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    color: '#FFFFFF', // --on-primary
  },
});