import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
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
  Snackbar,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { formatWeight } from '../utils/formatting';
import { Customer, TransactionEntry } from '../types';

interface SettlementSummaryScreenProps {
  customer: Customer;
  entries: TransactionEntry[];
  onBack: () => void;
  onAddMoreEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onEditEntry: (entryId: string) => void;
  onSaveTransaction: (receivedAmount?: number) => void;
}

export const SettlementSummaryScreen: React.FC<SettlementSummaryScreenProps> = ({
  customer,
  entries,
  onBack,
  onAddMoreEntry,
  onDeleteEntry,
  onEditEntry,
  onSaveTransaction,
}) => {
  const [receivedAmount, setReceivedAmount] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [discountExtra, setDiscountExtra] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [hasPaymentInteracted, setHasPaymentInteracted] = useState(false);
  
  // Enhanced payment validation
  const validatePaymentAmount = (value: string, maxAmount: number): string => {
    if (!value.trim()) return ''; // Allow empty for partial payments
    const num = parseFloat(value);
    if (isNaN(num)) return 'Please enter a valid amount';
    if (num < 0) return 'Amount cannot be negative';
    if (num > maxAmount * 1.1) return `Amount seems too high. Maximum expected: ₹${maxAmount.toLocaleString()}`;
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
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999',
      'gold995': 'Gold 995',
      'rani': 'Rani',
      'silver': 'Silver',
      'silver98': 'Silver 98',
      'silver96': 'Silver 96',
      'rupu': 'Rupu',
      'money': 'Money',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };

  const formatEntryDetails = (entry: TransactionEntry): string => {
    if (entry.type === 'money') {
      const type = entry.moneyType === 'debt' ? 'Debt' : 'Balance';
      return `${type}: ₹${entry.amount?.toLocaleString()}`;
    }

    if (entry.itemType === 'rani') {
      const pureGold = entry.pureWeight || ((entry.weight || 0) * (entry.touch || 0)) / 100;
      return `Weight: ${entry.weight}g, Touch: ${entry.touch}%, Pure: ${formatWeight(pureGold, false)}`;
    }

    if (entry.itemType === 'rupu') {
      const pureWeight = entry.pureWeight || ((entry.weight || 0) * (entry.touch || 0)) / 100;
      return `Weight: ${entry.weight}g, Touch: ${entry.touch}%, Pure: ${formatWeight(pureWeight, true)}`;
    }

    return `Weight: ${entry.weight}g, Price: ₹${entry.price?.toLocaleString()}/${entry.itemType.startsWith('gold') ? '10g' : 'kg'}`;
  };

  const calculateTotals = () => {
    let netMoneyFlow = 0; // Net money from merchant perspective: positive = merchant takes money, negative = merchant gives money
    const giveItems: { item: string; amount: string }[] = []; // What merchant gives to customer
    const takeItems: { item: string; amount: string }[] = []; // What merchant takes from customer

    entries.forEach(entry => {
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
        if (entry.moneyType === 'debt') {
          // Debt means merchant owes money to customer
          netMoneyFlow -= Math.abs(entry.subtotal);
        } else {
          // Balance means customer owes money to merchant
          netMoneyFlow += Math.abs(entry.subtotal);
        }
        // Don't add money entries to give/take items to avoid redundancy
      }
    });

    const netAmount = netMoneyFlow; // Positive = customer owes merchant, Negative = merchant owes customer
    
    return { 
      totalGive: netMoneyFlow < 0 ? Math.abs(netMoneyFlow) : 0, 
      totalTake: netMoneyFlow > 0 ? netMoneyFlow : 0, 
      netAmount, 
      giveItems, 
      takeItems 
    };
  };

  const { totalGive, totalTake, netAmount, giveItems, takeItems } = calculateTotals();
  const received = parseFloat(receivedAmount) || 0;
  const discountExtraAmount = parseFloat(discountExtra) || 0;
  
  // Check if FAB should be shown (hide when all entries are money)
  const shouldShowFAB = entries.some(entry => entry.type !== 'money');
  const isMoneyOnlyTransaction = entries.length > 0 && entries.every(entry => entry.type === 'money');
  
  // Apply discount/extra to net amount
  const adjustedNetAmount = netAmount > 0 
    ? netAmount - discountExtraAmount  // Customer owes: subtract discount
    : netAmount - discountExtraAmount; // Merchant owes: subtract extra (making it more negative)
  
  // Enhanced save transaction with validation
  const handleSaveTransaction = async () => {
    // Skip payment validation for money-only transactions
    if (!isMoneyOnlyTransaction) {
      const paymentValidationError = validatePaymentAmount(receivedAmount, Math.abs(adjustedNetAmount));
      
      if (paymentValidationError) {
        setPaymentError(paymentValidationError);
        setSnackbarMessage('Please fix payment amount errors');
        setSnackbarVisible(true);
        return;
      }
    }
    
    setIsSaving(true);
    try {
      await onSaveTransaction(received);
      setSnackbarMessage('Transaction saved successfully');
      setSnackbarVisible(true);
    } catch (error) {
      setSnackbarMessage('Failed to save transaction. Please try again.');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Calculate final balance based on money flow direction (using adjusted amount)
  let finalBalance;
  if (adjustedNetAmount > 0) {
    // Inward flow: Customer pays merchant
    finalBalance = adjustedNetAmount - received; // Positive = debt, Negative = balance
  } else {
    // Outward flow: Merchant pays customer
    finalBalance = adjustedNetAmount + received; // Negative = still owes, Positive = overpaid
  }

  const renderEntryCard = (entry: TransactionEntry, index: number) => (
    <Card key={entry.id} style={styles.entryCard} mode="outlined">
      <Card.Content style={styles.entryCardContent}>
        <View style={styles.entryHeader}>
          <View style={styles.entryTitleContainer}>
            <Text 
              variant="titleSmall" 
              style={[
                styles.entryType,
                { color: entry.type === 'sell' ? theme.colors.sellColor : 
                        entry.type === 'money' ? (entry.moneyType === 'debt' ? theme.colors.error : theme.colors.success) : 
                        theme.colors.primary }
              ]}
            >
              {entry.type === 'money' ? 'Money' : `${entry.type === 'sell' ? 'Sell' : 'Purchase'} - ${getItemDisplayName(entry)}`}
            </Text>
          </View>
          <View style={styles.actionButtons}>
            <IconButton
              icon="pencil"
              iconColor={theme.colors.primary}
              size={20}
              onPress={() => onEditEntry(entry.id)}
              style={styles.editButton}
            />
            <IconButton
              icon="delete"
              iconColor={theme.colors.error}
              size={20}
              onPress={() => onDeleteEntry(entry.id)}
              style={styles.deleteButton}
            />
          </View>
        </View>
        
        <Divider style={styles.entryDivider} />
        
        <Text variant="bodySmall" style={styles.entryDetails}>
          {formatEntryDetails(entry)}
        </Text>
        <Text variant="bodyMedium" style={styles.entrySubtotal}>
          Total: {entry.subtotal >= 0 ? '+' : '-'}₹{Math.abs(entry.subtotal).toLocaleString()}
        </Text>
      </Card.Content>
    </Card>
  );

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
                {/* Show net money if negative (merchant owes customer) */}
                {netAmount < 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>
                    • Money: ₹{Math.abs(netAmount).toLocaleString()}
                  </Text>
                )}
                {giveItems.length === 0 && netAmount >= 0 && (
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
                {/* Show net money if positive (customer owes merchant) */}
                {netAmount > 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>
                    • Money: ₹{netAmount.toLocaleString()}
                  </Text>
                )}
                {takeItems.length === 0 && netAmount <= 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>• Nothing</Text>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Horizontal Line */}
        <Divider style={styles.sectionDivider} />

        {/* Total Card - hide when all entries are money */}
        {entries.some(entry => entry.type !== 'money') && (
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
                    ₹{Math.abs(adjustedNetAmount).toLocaleString()}
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
                    placeholder={`Suggested: ₹${Math.abs(adjustedNetAmount).toLocaleString()}`}
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
                      Full: ₹{Math.abs(adjustedNetAmount).toLocaleString()}
                    </Chip>
                    <Chip 
                      mode="outlined" 
                      onPress={() => setReceivedAmount((Math.abs(adjustedNetAmount) / 2).toString())}
                      style={styles.amountChip}
                    >
                      Half: ₹{(Math.abs(adjustedNetAmount) / 2).toLocaleString()}
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
                    ₹{Math.abs(finalBalance).toLocaleString()}
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
          disabled={entries.length === 0 || isSaving || (!isMoneyOnlyTransaction && !!paymentError)}
          loading={isSaving}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          buttonColor={theme.colors.success}
        >
          {isSaving ? 'Saving...' : 'Save Transaction'}
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
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}
      >
        {snackbarMessage}
      </Snackbar>
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
    marginBottom: theme.spacing.md,
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
    margin: -8,
    marginLeft: -12,
  },
  summaryItem: {
    marginLeft: theme.spacing.md,
    marginBottom: theme.spacing.xs,
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
    right: 0,
    bottom: 16,
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
