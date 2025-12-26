import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, BackHandler, Alert, Platform } from 'react-native';
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
import { theme } from '../theme';
import { formatWeight, formatIndianNumber } from '../utils/formatting';
import { Customer, TransactionEntry } from '../types';
import CustomAlert from '../components/CustomAlert';
import { useAppContext } from '../context/AppContext';

interface SettlementSummaryScreenProps {
  customer: Customer;
  entries: TransactionEntry[];
  onBack: () => void;
  onAddMoreEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onEditEntry: (entryId: string) => void;
  onSaveTransaction: (receivedAmount?: number, discountExtraAmount?: number, saveDate?: Date | null, note?: string) => void;
  editingTransactionId?: string | null;
  lastGivenMoney?: number;
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
  lastGivenMoney = 0,
  transactionCreatedAt,
  initialNote = '',
}) => {
  const { pendingMoneyAmount, setPendingMoneyAmount, pendingMoneyType } = useAppContext();
  
  // Initialize receivedAmount with pending money or lastGivenMoney
  const [receivedAmount, setReceivedAmount] = useState(() => {
    if (pendingMoneyAmount !== 0) {
      return pendingMoneyAmount.toString();
    }
    return lastGivenMoney !== 0 ? lastGivenMoney.toString() : '';
  });
  
  // Clear pending money amount when component mounts
  React.useEffect(() => {
    if (pendingMoneyAmount !== 0) {
      // Clear it after using it
      setPendingMoneyAmount(0);
    }
  }, []);
  
  const [paymentError, setPaymentError] = useState('');
  const [discountExtra, setDiscountExtra] = useState('');
  const [note, setNote] = useState(initialNote);
  const [isSaving, setIsSaving] = useState(false);
  const [hasPaymentInteracted, setHasPaymentInteracted] = useState(false);
  const [selectedSaveDate, setSelectedSaveDate] = useState<Date>(new Date());
  const [showSaveDatePicker, setShowSaveDatePicker] = useState(false);
  const [pendingSaveDate, setPendingSaveDate] = useState<Date | null>(null);
  const [showDateWarningAlert, setShowDateWarningAlert] = useState(false);
  const isEditing = !!editingTransactionId;

  // Format date for display in DD/MM/YYYY format
  const formatDateDisplay = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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
      setPendingSaveDate(null);
    }
    setShowDateWarningAlert(false);
  };

  // Handle date warning alert cancel
  const handleDateWarningCancel = () => {
    setPendingSaveDate(null);
    setShowDateWarningAlert(false);
  };
  
  // Input filtering function for discount/extra
  const filterDiscountExtraInput = (value: string): string => {
    // Remove any non-numeric characters except decimal point
    let filtered = value.replace(/[^0-9.]/g, '');
    
    // Handle multiple decimal points - keep only the first one
    const parts = filtered.split('.');
    if (parts.length > 2) {
      filtered = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Check length restrictions
    const beforeDecimal = parts[0] || '';
    
    if (beforeDecimal.length > 3) {
      filtered = beforeDecimal.slice(0, 3) + (parts[1] ? '.' + parts[1] : '');
    }
    
    // If 3 digits, must be exactly "100" (no decimal allowed)
    if (beforeDecimal.length === 3) {
      if (beforeDecimal !== '100') {
        filtered = beforeDecimal.slice(0, 2) + (parts[1] ? '.' + parts[1] : '');
      } else {
        filtered = '100'; // Remove any decimal part for 100
      }
    }
    
    // If 2 digits, allow decimal but limit to reasonable precision
    if (beforeDecimal.length <= 2 && parts[1]) {
      filtered = beforeDecimal + '.' + parts[1].slice(0, 2);
    }
    
    return filtered;
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
  const received = parseFloat(receivedAmount) || 0;
  const discountExtraAmount = parseFloat(discountExtra) || 0;
  
  // Safety feature: Lock entry modifications for transactions created on previous dates
  const isOldTransaction = transactionCreatedAt
    ? (() => {
        const today = new Date();
        const transactionDate = new Date(transactionCreatedAt);
        return today.getFullYear() !== transactionDate.getFullYear() ||
               today.getMonth() !== transactionDate.getMonth() ||
               today.getDate() !== transactionDate.getDate();
      })()
    : false;
  
  // Check if this is a money-only transaction (no entries)
  const isMoneyOnlyTransaction = entries.length === 0;
  
  // Determine if entry modifications are locked
  // Allow editing metal-only transactions at any time
  const areEntriesLocked = isEditing && isOldTransaction && !isMetalOnly;

  // Show FAB for non-money-only transactions or when editing money-only transactions
  const shouldShowFAB = !isMoneyOnlyTransaction || isEditing;
  
  // Apply discount/extra to net amount
  const adjustedNetAmount = netAmount > 0 
    ? netAmount - discountExtraAmount  // Customer owes: subtract discount
    : netAmount + discountExtraAmount; // Merchant owes: add extra

  // Enhanced save transaction with validation
  const handleSaveTransaction = async () => {
    
    setIsSaving(true);
    try {
      // Calculate effective received amount including discount/extra (signed)
      // For money-only: received already has correct sign (positive = receive, negative = give)
      // For sell: merchant receives money (positive)
      // For purchase: merchant gives money (negative)
      let effectiveReceived: number;
      if (isMoneyOnlyTransaction) {
        // Money-only: received already has correct sign from EntryScreen
        effectiveReceived = received;
      } else if (netAmount > 0) {
        // Sell: merchant receives amountPaid (positive)
        effectiveReceived = received;
      } else {
        // Purchase: merchant gives amountPaid + extra (negative)
        effectiveReceived = -(received + discountExtraAmount);
      }
      
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
      
      await onSaveTransaction(effectiveReceived, discountExtraAmount, saveDate, note);
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
    finalBalance = received;
  } else {
    // For sell/purchase transactions (INVERTED SIGN CONVENTION):
    // Positive balance = merchant owes customer (credit)
    // Negative balance = customer owes merchant (debt)
    // received is always positive in UI, but represents merchant receiving (positive) or giving (negative)
    const signedReceived = adjustedNetAmount > 0 ? received : -received;
    finalBalance = signedReceived - adjustedNetAmount;
  }

  const renderEntryCard = (entry: TransactionEntry, index: number) => {
    // Check if this specific entry should be locked
    // For old transactions: lock all entries
    // For editing current transactions: lock only rani/rupu entries that are not metal-only
    const isEntryLocked = areEntriesLocked || (isEditing && (entry.itemType === 'rani' || entry.itemType === 'rupu') && !entry.metalOnly);

    return (
    <Card key={entry.id} style={styles.entryCard} mode="outlined">
      <Card.Content style={styles.entryCardContent}>
        <View style={styles.entryHeader}>
          <View style={styles.entryTitleContainer}>
            <Text 
              variant="titleSmall" 
              style={[
                styles.entryType,
                { color: entry.type === 'sell' ? theme.colors.sellColor : 
                        entry.type === 'money' ? (entry.moneyType === 'give' ? theme.colors.debtColor : theme.colors.success) : 
                        theme.colors.primary }
              ]}
            >
              {entry.type === 'money' ? 'Money' : `${entry.type === 'sell' ? 'Sell' : 'Purchase'} - ${getItemDisplayName(entry)}`}
            </Text>
          </View>
          <View style={styles.actionButtons}>
            <IconButton
              icon="pencil"
              iconColor={isEntryLocked ? theme.colors.onSurfaceDisabled : theme.colors.primary}
              size={20}
              onPress={() => onEditEntry(entry.id)}
              style={styles.editButton}
              disabled={isEntryLocked}
            />
          </View>
        </View>
        
        <Divider style={styles.entryDivider} />
        
        <Text variant="bodySmall" style={styles.entryDetails}>
          {formatEntryDetails(entry)}
        </Text>
        <Text variant="bodyMedium" style={styles.entrySubtotal}>
          Total: {entry.subtotal >= 0 ? '+' : '-'}₹{formatIndianNumber(Math.abs(entry.subtotal))}
        </Text>
      </Card.Content>
    </Card>
  );
};

  return (
    <SafeAreaView style={styles.container}>
      {/* Page Title Bar */}
      <Surface style={styles.appTitleBar} elevation={2}>
        <View style={styles.appTitleContent}>
          <Text variant="titleLarge" style={styles.appTitle}>
            Transaction Summary
          </Text>
        </View>
      </Surface>

      {/* Customer Header */}
      <Surface style={styles.customerHeader} elevation={1}>
        <View style={styles.customerHeaderContent}>
          <View style={styles.customerHeaderRow}>
            <Button
              mode="text"
              onPress={onBack}
              contentStyle={styles.backButton}
              labelStyle={styles.customerNameLabel}
            >
              {customer.name}
            </Button>
            <IconButton
              icon="close"
              onPress={onBack}
              iconColor={theme.colors.onError}
              containerColor={theme.colors.error}
              style={styles.crossButton}
            />
          </View>
        </View>
      </Surface>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          shouldShowFAB ? styles.scrollContentWithFAB : styles.scrollContentWithoutFAB
        ]}
      >
        {/* Save Date Picker */}
        <View style={styles.dateSection}>
          <Text variant="titleSmall" style={styles.dateLabel}>
            Save on: {formatDateDisplay(selectedSaveDate)}
          </Text>
          <Button
            mode="contained"
            onPress={handleSelectSaveDatePress}
            disabled={isEditing}
            style={styles.dateButton}
            contentStyle={styles.dateButtonContent}
          >
            Change Date
          </Button>
        </View>
        <Divider style={styles.dateDivider} />

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
            <Card style={styles.entryCard} mode="outlined">
              <Card.Content style={styles.entryCardContent}>
                <Text variant="titleMedium" style={styles.moneyOnlyText}>
                  No entry is added
                </Text>
              </Card.Content>
            </Card>
          ) : (
            entries.map((entry, index) => renderEntryCard(entry, index))
          )}
        </View>

        {/* Horizontal Line */}
        <Divider style={styles.sectionDivider} />

        {/* Transaction Summary Card */}
        <Card style={styles.summaryCard} mode="contained">
          <Card.Content>
            <Text variant="titleMedium" style={styles.summaryTitle}>
              Transaction Summary
            </Text>
            
            <View style={styles.summaryContent}>
              {/* Give Section */}
              <View style={styles.summarySection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.iconContainer}>
                    <IconButton 
                      icon="hand-coin-outline" 
                      iconColor={theme.colors.primary}
                      size={20}
                    />
                    <IconButton 
                      icon="arrow-up" 
                      iconColor={theme.colors.primary}
                      size={16}
                      style={styles.arrowIcon}
                    />
                  </View>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Give</Text>
                </View>
                {giveItems.map((item, index) => (
                  <Text key={index} variant="bodyMedium" style={styles.summaryItem}>
                    • {item.item}: {item.amount}
                  </Text>
                ))}
                {/* Show net money if negative (merchant owes customer) - only for non-metal-only */}
                {!isMetalOnly && netAmount < 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>
                    • Money: ₹{formatIndianNumber(Math.abs(netAmount))}
                  </Text>
                )}
                {giveItems.length === 0 && (isMetalOnly || netAmount >= 0) && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>• Nothing</Text>
                )}
              </View>

              {/* Take Section */}
              <View style={styles.summarySection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.iconContainer}>
                    <IconButton 
                      icon="hand-coin-outline" 
                      iconColor={theme.colors.sellColor}
                      size={20}
                    />
                    <IconButton 
                      icon="arrow-down" 
                      iconColor={theme.colors.sellColor}
                      size={16}
                      style={styles.arrowIcon}
                    />
                  </View>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Take</Text>
                </View>
                {takeItems.map((item, index) => (
                  <Text key={index} variant="bodyMedium" style={styles.summaryItem}>
                    • {item.item}: {item.amount}
                  </Text>
                ))}
                {/* Show net money if positive (customer owes merchant) - only for non-metal-only */}
                {!isMetalOnly && netAmount > 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>
                    • Money: ₹{formatIndianNumber(netAmount)}
                  </Text>
                )}
                {takeItems.length === 0 && (isMetalOnly || netAmount <= 0) && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>• Nothing</Text>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Horizontal Line */}
        <Divider style={styles.sectionDivider} />

        {/* Total Card - hide for metal-only transactions */}
        {!isMetalOnly && (entries.some(entry => entry.type !== 'money') || isMoneyOnlyTransaction) && (
          <>
            <Card style={styles.totalCard} mode="contained">
              <Card.Content>
                <View style={styles.totalSection}>
                  <Text variant="titleMedium">
                    {isMoneyOnlyTransaction 
                      ? (pendingMoneyType === 'receive' ? 'Customer Pays:' : 'Customer Gets:')
                      : (adjustedNetAmount > 0 ? 'Customer Pays:' : 'Customer Gets:')
                    }
                  </Text>
                  <Text 
                    variant="titleMedium" 
                    style={[
                      styles.totalAmount,
                      { color: isMoneyOnlyTransaction 
                        ? (pendingMoneyType === 'receive' ? theme.colors.sellColor : theme.colors.primary)
                        : (adjustedNetAmount > 0 ? theme.colors.sellColor : theme.colors.primary)
                      }
                    ]}
                  >
                    ₹{formatIndianNumber(isMoneyOnlyTransaction 
                      ? 0
                      : Math.abs(adjustedNetAmount)
                    )}
                  </Text>
                </View>

                <Divider style={styles.totalDivider} />

                {/* Enhanced Money Input */}
                <View>
                  <TextInput
                    label={isMoneyOnlyTransaction 
                      ? (pendingMoneyType === 'receive' ? "Customer Pays (₹)" : "Merchant Pays (₹)")
                      : (adjustedNetAmount > 0 ? "Customer Pays (₹)" : "Merchant Pays (₹)")
                    }
                    value={Math.abs(parseFloat(receivedAmount || '0')).toString()}
                    onChangeText={(text) => {
                      // Only allow editing if there are entries (not money-only)
                      if (!isMoneyOnlyTransaction) {
                        setReceivedAmount(text);
                        setHasPaymentInteracted(true);
                      } else {
                        // For money-only transactions, determine sign based on money type
                        const numericValue = parseFloat(text) || 0;
                        const signedValue = pendingMoneyType === 'receive' ? numericValue : -numericValue;
                        setReceivedAmount(signedValue.toString());
                        setHasPaymentInteracted(true);
                      }
                    }}
                    mode="outlined"
                    keyboardType="numeric"
                    editable={!isMoneyOnlyTransaction} // Active but not editable unless there is at least one entry
                    style={[
                      styles.receivedInput,
                      paymentError ? styles.inputError : null
                    ]}
                    error={!!paymentError}
                    placeholder={`Suggested: ₹${formatIndianNumber(Math.abs(adjustedNetAmount))}`}
                  />
                  {/* Discount/Extra Input */}
                  <View>
                    <TextInput
                      label={netAmount > 0 ? "Discount (₹)" : "Extra (₹)"}
                      value={discountExtra}
                      onChangeText={(text) => {
                        const filtered = filterDiscountExtraInput(text);
                        setDiscountExtra(filtered);
                      }}
                      mode="outlined"
                      keyboardType="numeric"
                      style={styles.discountInput}
                      placeholder="0-100"
                      disabled={isMoneyOnlyTransaction}
                    />
                  </View>


                  {/* Quick Amount Chips */}
                  <View style={styles.quickAmountChips}>
                    <Chip 
                      mode="outlined" 
                      onPress={() => {
                        if (!isMoneyOnlyTransaction) {
                          setReceivedAmount(Math.abs(adjustedNetAmount).toString());
                        }
                      }}
                      style={styles.amountChip}
                    >
                      Full: ₹{formatIndianNumber(Math.abs(adjustedNetAmount))}
                    </Chip>
                    <Chip 
                      mode="outlined" 
                      onPress={() => {
                        if (!isMoneyOnlyTransaction) {
                          setReceivedAmount((Math.abs(adjustedNetAmount) / 2).toString());
                        }
                      }}
                      style={styles.amountChip}
                    >
                      Half: ₹{formatIndianNumber(Math.abs(adjustedNetAmount) / 2)}
                    </Chip>
                    <Chip 
                      mode="outlined" 
                      onPress={() => {
                        if (!isMoneyOnlyTransaction) {
                          setReceivedAmount('');
                        }
                      }}
                      style={styles.amountChip}
                    >
                      Clear
                    </Chip>
                  </View>

                  {/* Note Input */}
                  <TextInput
                    label="Note"
                    value={note}
                    onChangeText={setNote}
                    mode="outlined"
                    style={{ marginTop: 6 }}
                    placeholder="Add a note..."
                  />
                </View>

                <Divider style={styles.totalDivider} />

                {/* Final Balance */}
                <View style={styles.balanceSection}>
                  <Text variant="titleMedium">
                    {/* INVERTED SIGN: positive = balance, negative = debt */}
                    {finalBalance > 0 ? 'Balance:' : finalBalance < 0 ? 'Debt:' : 'Settled'}
                  </Text>
                  <Text 
                    variant="titleMedium" 
                    style={[
                      styles.balanceAmount,
                      { 
                        color: finalBalance > 0
                          ? theme.colors.success  // Positive = balance (green)
                          : finalBalance < 0
                            ? theme.colors.debtColor  // Negative = debt (orange)
                            : theme.colors.onSurface  // Zero = settled
                      }
                    ]}
                  >
                    ₹{formatIndianNumber(Math.abs(finalBalance))}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* Horizontal Line */}
            <Divider style={styles.sectionDivider} />
          </>
        )}

        {/* Enhanced Save Transaction Button */}

        {/* Enhanced Save Transaction Button */}
        <Button
          mode="contained"
          icon={isSaving ? undefined : "check"}
          onPress={handleSaveTransaction}
          disabled={isSaving || !!paymentError}
          loading={isSaving}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          buttonColor={theme.colors.success}
        >
          {isSaving ? (isEditing ? 'Updating...' : 'Saving...') : (isEditing ? 'Update Transaction' : 'Save Transaction')}
        </Button>
      </ScrollView>

      {/* FAB for adding more entries - hide when all entries are money */}
      {shouldShowFAB && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={onAddMoreEntry}
        />
      )}

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
    backgroundColor: theme.colors.background,
  },
  appTitleBar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  appIcon: {
    width: 24,
    height: 24,
    marginRight: theme.spacing.sm,
  },
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
  },
  customerHeader: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
  },
  customerHeaderContent: {
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
  },
  headerContent: {
    paddingHorizontal: theme.spacing.md,
  },
  backButton: {
    flexDirection: 'row-reverse',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
  },
  scrollContentWithFAB: {
    paddingBottom: 100, // Space for FAB
  },
  scrollContentWithoutFAB: {
    paddingBottom: theme.spacing.md,
  },
  entriesSection: {
    marginBottom: theme.spacing.xs,
  },
  sectionDivider: {
    marginVertical: theme.spacing.lg,
    height: 1,
    backgroundColor: theme.colors.outline,
  },
  entryCard: {
    borderRadius: 12,
    marginTop: theme.spacing.sm,
  },
  entryCardContent: {
    paddingVertical: theme.spacing.md,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryTitleContainer: {
    flex: 1,
  },
  entryTitle: {
    fontFamily: 'Roboto_700Bold',
    marginBottom: theme.spacing.xs,
  },
  entryType: {
    fontFamily: 'Roboto_500Medium',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    margin: 0,
    marginTop: -8,
  },
  entryDivider: {
    marginVertical: theme.spacing.sm,
  },
  entryDetails: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: theme.spacing.xs,
  },
  entrySubtotal: {
    fontFamily: 'Roboto_500Medium',
  },
  summaryCard: {
    borderRadius: 12,
  },
  summaryTitle: {
    textAlign: 'left',
    marginBottom: theme.spacing.sm,
    fontFamily: 'Roboto_700Bold',
  },
  customerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerNameLabel: {
    textAlign: 'left',
  },
  crossButton: {
    margin: 0,
    borderRadius: 8,
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.md,
  },
  summarySection: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontFamily: 'Roboto_700Bold',
    marginLeft: theme.spacing.xs,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowIcon: {
    margin: 0,
    marginLeft: -22,
  },
  summaryItem: {
    marginLeft: theme.spacing.md,
  },
  summaryDivider: {
    marginVertical: theme.spacing.md,
  },
  totalCard: {
    borderRadius: 12,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalAmount: {
    fontFamily: 'Roboto_700Bold',
  },
  totalDivider: {
    marginVertical: theme.spacing.md,
    height: 1,
  },
  receivedInput: {
    marginBottom: theme.spacing.sm,
  },
  discountInput: {
    marginBottom: theme.spacing.sm,
  },
  balanceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceAmount: {
    fontFamily: 'Roboto_700Bold',
    fontSize: 18,
  },
  saveButton: {
    marginBottom: theme.spacing.md,
    borderRadius: 12,
  },
  saveButtonContent: {
    paddingVertical: theme.spacing.sm,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 10,
    bottom: 32,
    backgroundColor: theme.colors.primary,
  },
  
  // Part 5 Enhanced Styles - Validation & Error Handling
  inputError: {
    borderColor: theme.colors.error,
    borderWidth: 2,
  },
  quickAmountChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: theme.spacing.sm,
  },
  amountChip: {
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  dateCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 12,
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  dateLabel: {
    fontFamily: 'Roboto_500Medium',
    flex: 1,
  },
  moneyOnlyText: {
    textAlign: 'center',
    fontFamily: 'Roboto_500Medium',
    marginBottom: theme.spacing.xs,
  },
  moneyOnlyHint: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
  },
  dateButton: {
    marginLeft: theme.spacing.sm,
    borderRadius: 20,
  },
  dateButtonContent: {
    paddingHorizontal: theme.spacing.sm,
  },
  dateDivider: {
    marginBottom: theme.spacing.md,
  },
});
