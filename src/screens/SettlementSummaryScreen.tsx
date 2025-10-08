import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, BackHandler } from 'react-native';
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
import { theme } from '../theme';
import { formatWeight, formatIndianNumber } from '../utils/formatting';
import { Customer, TransactionEntry } from '../types';

interface SettlementSummaryScreenProps {
  customer: Customer;
  entries: TransactionEntry[];
  onBack: () => void;
  onAddMoreEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onEditEntry: (entryId: string) => void;
  onSaveTransaction: (receivedAmount?: number, discountExtraAmount?: number) => void;
  editingTransactionId?: string | null;
  lastGivenMoney?: number;
  transactionCreatedAt?: string | null;
  transactionLastUpdatedAt?: string | null;
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
}) => {
  const [receivedAmount, setReceivedAmount] = useState(lastGivenMoney > 0 ? lastGivenMoney.toString() : '');
  const [paymentError, setPaymentError] = useState('');
  const [discountExtra, setDiscountExtra] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasPaymentInteracted, setHasPaymentInteracted] = useState(false);
  const isEditing = !!editingTransactionId;

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

  // Enhanced payment validation
  const validatePaymentAmount = (value: string, maxAmount: number): string => {
    if (!value.trim()) return ''; // Allow empty for partial payments
    const num = parseFloat(value);
    if (isNaN(num)) return 'Please enter a valid amount';
    if (num < 0) return 'Amount cannot be negative';
    if (num > maxAmount * 1.1) return `Amount seems too high. Maximum expected: ₹${formatIndianNumber(maxAmount)}`;
    if (num > 10000000) return 'Amount cannot exceed ₹1,00,00,000';
    return '';
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
  
  // Debounced validation
  const debouncedValidatePayment = useCallback(
    debounce((value: string, maxAmount: number) => {
      const error = validatePaymentAmount(value, maxAmount);
      setPaymentError(error);
    }, 300),
    []
  );
  

  
  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
  
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
      const details = `Weight: ${entry.weight}g, Touch: ${entry.touch}%, Cut: ${entry.cut || 0}%, Pure: ${formatWeight(pureGold, false)}`;
      if (entry.price !== undefined) {
        return `${details}, Price: ₹${formatIndianNumber(entry.price)}/10g`;
      }
      return details;
    }

    if (entry.itemType === 'rupu') {
      const pureWeight = entry.pureWeight || ((entry.weight || 0) * (entry.touch || 0)) / 100;
      const details = `Weight: ${entry.weight}g, Touch: ${entry.touch}%, Pure: ${formatWeight(pureWeight, true)}`;
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
  
  // Check if there are any money-only entries
  const hasMoneyOnlyEntry = entries.some(entry => entry.type === 'money');
  
  // Determine if entry modifications are locked
  // Allow editing metal-only transactions at any time
  const areEntriesLocked = isEditing && isOldTransaction && !isMetalOnly;
  
  // Check if FAB should be shown: hide if entries are locked OR if there's a money-only entry
  const shouldShowFAB = !areEntriesLocked && !hasMoneyOnlyEntry;
  
  // Apply discount/extra to net amount
  const adjustedNetAmount = netAmount > 0 
    ? netAmount - discountExtraAmount  // Customer owes: subtract discount
    : netAmount + discountExtraAmount; // Merchant owes: add extra

  // Enhanced save transaction with validation
  const handleSaveTransaction = async () => {
    const paymentValidationError = validatePaymentAmount(receivedAmount, Math.abs(adjustedNetAmount));
    
    if (paymentValidationError) {
      setPaymentError(paymentValidationError);
      return;
    }
    
    setIsSaving(true);
    try {
      // Calculate effective received amount including discount/extra
      const effectiveReceived = netAmount > 0 
        ? received  // Sell: merchant receives amountPaid
        : received + discountExtraAmount; // Purchase: merchant gives amountPaid + extra
      
      await onSaveTransaction(effectiveReceived, discountExtraAmount);
    } catch (error) {
      console.error('Failed to save transaction:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Calculate final balance based on money flow direction (using adjusted amount)
  let finalBalance: number;
  
  // Check if this is a money-only transaction
  const isMoneyOnlyTransaction = entries.every(entry => entry.type === 'money');
  
  if (isMoneyOnlyTransaction) {
    // For money-only transactions:
    // Positive adjustedNetAmount (receive) = merchant receives money = reduces customer debt = negative balance change
    // Negative adjustedNetAmount (give) = merchant gives money = increases customer debt = positive balance change
    finalBalance = -adjustedNetAmount;
  } else {
    // For sell/purchase transactions:
    if (adjustedNetAmount > 0) {
      // Inward flow: Customer pays merchant
      finalBalance = adjustedNetAmount - received; // Positive = debt, Negative = balance
    } else {
      // Outward flow: Merchant pays customer
      finalBalance = adjustedNetAmount + received; // Negative = still owes, Positive = overpaid
    }
  }

  const renderEntryCard = (entry: TransactionEntry, index: number) => {
    // Check if this specific entry should be locked
    const isEntryLocked = areEntriesLocked || (entry.type === 'sell' && (entry.itemType === 'rani' || entry.itemType === 'rupu'));
    
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
            <IconButton
              icon="delete"
              iconColor={isEntryLocked ? theme.colors.onSurfaceDisabled : theme.colors.error}
              size={20}
              onPress={() => onDeleteEntry(entry.id)}
              style={styles.deleteButton}
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
        {/* Entry Cards */}
        <View style={styles.entriesSection}>
          {entries.map((entry, index) => renderEntryCard(entry, index))}
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
        {!isMetalOnly && entries.some(entry => entry.type !== 'money') && (
          <>
            <Card style={styles.totalCard} mode="contained">
              <Card.Content>
                <View style={styles.totalSection}>
                  <Text variant="titleMedium">
                    {adjustedNetAmount > 0 ? 'Customer Pays:' : 'Customer Gets:'}
                  </Text>
                  <Text 
                    variant="titleMedium" 
                    style={[
                      styles.totalAmount,
                      { color: adjustedNetAmount > 0 ? theme.colors.sellColor : theme.colors.primary }
                    ]}
                  >
                    ₹{formatIndianNumber(Math.abs(adjustedNetAmount))}
                  </Text>
                </View>

                <Divider style={styles.totalDivider} />

                {/* Enhanced Money Input */}
                <View>
                  <TextInput
                    label={adjustedNetAmount > 0 ? "Customer Pays (₹)" : "Merchant Pays (₹)"}
                    value={receivedAmount}
                    onChangeText={(text) => {
                      setReceivedAmount(text);
                      setHasPaymentInteracted(true);
                      debouncedValidatePayment(text, Math.abs(adjustedNetAmount));
                    }}
                    mode="outlined"
                    keyboardType="numeric"
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
                    />
                    <HelperText type="info" visible={true}>
                      {netAmount > 0 
                        ? "Give discount to customer (reduces their payment)" 
                        : "Pay extra to customer (increases their receipt)"}
                    </HelperText>
                  </View>


                  {/* Quick Amount Chips */}
                  <View style={styles.quickAmountChips}>
                    <Chip 
                      mode="outlined" 
                      onPress={() => setReceivedAmount(Math.abs(adjustedNetAmount).toString())}
                      style={styles.amountChip}
                    >
                      Full: ₹{formatIndianNumber(Math.abs(adjustedNetAmount))}
                    </Chip>
                    <Chip 
                      mode="outlined" 
                      onPress={() => setReceivedAmount((Math.abs(adjustedNetAmount) / 2).toString())}
                      style={styles.amountChip}
                    >
                      Half: ₹{formatIndianNumber(Math.abs(adjustedNetAmount) / 2)}
                    </Chip>
                    <Chip 
                      mode="outlined" 
                      onPress={() => setReceivedAmount('')}
                      style={styles.amountChip}
                    >
                      Clear
                    </Chip>
                  </View>
                </View>

                <Divider style={styles.totalDivider} />

                {/* Final Balance */}
                <View style={styles.balanceSection}>
                  <Text variant="titleMedium">
                    {adjustedNetAmount > 0 
                      ? (finalBalance > 0 ? 'Debt:' : 'Balance:') 
                      : (finalBalance < 0 ? 'Balance:' : 'Debt:')}
                  </Text>
                  <Text 
                    variant="titleMedium" 
                    style={[
                      styles.balanceAmount,
                      { 
                        color: (adjustedNetAmount > 0 && finalBalance > 0) || (adjustedNetAmount <= 0 && finalBalance > 0)
                          ? theme.colors.debtColor 
                          : (adjustedNetAmount > 0 && finalBalance < 0) || (adjustedNetAmount <= 0 && finalBalance < 0)
                            ? theme.colors.balanceColor 
                            : theme.colors.onSurface 
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
          disabled={entries.length === 0 || isSaving || !!paymentError}
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
    height: 2,
    backgroundColor: theme.colors.outline,
  },
  entryCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 12,
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
  },
  deleteButton: {
    margin: 0,
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
    marginBottom: theme.spacing.md,
    borderRadius: 12,
  },
  summaryTitle: {
    textAlign: 'left',
    marginBottom: theme.spacing.md,
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
    marginBottom: theme.spacing.md,
    borderRadius: 12,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  totalAmount: {
    fontFamily: 'Roboto_700Bold',
  },
  totalDivider: {
    marginVertical: theme.spacing.md,
  },
  receivedInput: {
    marginBottom: theme.spacing.md,
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
});
