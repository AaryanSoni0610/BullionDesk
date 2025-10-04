import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Image, BackHandler } from 'react-native';
import {
  Surface,
  Text,
  SegmentedButtons,
  Menu,
  Button,
  TextInput,
  Divider,
  IconButton,
  HelperText,
  Snackbar,
  RadioButton,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { formatWeight, formatMoney, formatPureGold, formatPureSilver } from '../utils/formatting';
import { Customer, TransactionEntry, ItemType } from '../types';

interface EntryScreenProps {
  customer: Customer;
  editingEntry?: TransactionEntry;
  existingEntries?: TransactionEntry[];
  onBack: () => void;
  onNavigateToSummary?: () => void;
  onAddEntry: (entry: TransactionEntry) => void;
}

export const EntryScreen: React.FC<EntryScreenProps> = ({
  customer,
  editingEntry,
  existingEntries = [],
  onBack,
  onNavigateToSummary,
  onAddEntry,
}) => {
  
  // Check what types of entries already exist (excluding the one being edited)
  const otherEntries = existingEntries.filter(entry => entry.id !== editingEntry?.id);
  const hasMoneyEntries = otherEntries.some(entry => entry.type === 'money');
  const hasSellPurchaseEntries = otherEntries.some(entry => entry.type === 'sell' || entry.type === 'purchase');
  const hasMetalOnlyEntries = otherEntries.some(entry => entry.metalOnly === true);
  
  // Handle back button navigation
  const handleBack = () => {
    if (existingEntries.length > 0 && onNavigateToSummary) {
      onNavigateToSummary();
    } else {
      onBack();
    }
  };

  // Handle hardware back button - same as UI back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleBack();
        return true; // Prevent default back behavior
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [existingEntries.length, onNavigateToSummary, onBack])
  );
  
  // Determine available transaction types
  const getAvailableTransactionTypes = () => {
    if (hasMoneyEntries) {
      // If money entries exist, only allow money
      return ['money'];
    } else if (hasMetalOnlyEntries) {
      // If metal-only entries exist, only allow metal-only (no new entries)
      return [];
    } else if (hasSellPurchaseEntries) {
      // If sell/purchase entries exist, only allow sell/purchase
      return ['sell', 'purchase'];
    } else {
      // No entries exist, allow all types
      return ['sell', 'purchase', 'money'];
    }
  };
  
  const availableTypes = getAvailableTransactionTypes();
  const [transactionType, setTransactionType] = useState<'purchase' | 'sell' | 'money'>('sell');
  const [itemType, setItemType] = useState<ItemType>('gold999');
  const [menuVisible, setMenuVisible] = useState(false);
  const [metalOnly, setMetalOnly] = useState(false);
  
  // Input fields
  const [weight, setWeight] = useState('');
  const [price, setPrice] = useState('');
  const [touch, setTouch] = useState('');
  const [extraPerKg, setExtraPerKg] = useState('');
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyType, setMoneyType] = useState<'debt' | 'balance'>('debt');
  
  // Rupu specific fields
  const [rupuReturnType, setRupuReturnType] = useState<'money' | 'silver'>('money');
  const [silverWeight, setSilverWeight] = useState('');
  
  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Pre-fill form when editing an entry
  useEffect(() => {
    if (editingEntry) {
      setTransactionType(editingEntry.type);
      if (editingEntry.type !== 'money') {
        setItemType(editingEntry.itemType);
      }
      setWeight(editingEntry.weight?.toString() || '');
      setPrice(editingEntry.price?.toString() || '');
      setTouch(editingEntry.touch?.toString() || '');
      setMoneyAmount(editingEntry.amount?.toString() || '');
      setMoneyType(editingEntry.moneyType || 'debt');
      setRupuReturnType(editingEntry.rupuReturnType || 'money');
      setSilverWeight(editingEntry.silverWeight?.toString() || '');
      setMetalOnly(editingEntry.metalOnly || false);
    }
  }, [editingEntry]);
  
  // Reset itemType to valid option when switching to sell tab with rani/rupu selected
  useEffect(() => {
    if (transactionType === 'sell' && (itemType === 'rani' || itemType === 'rupu')) {
      setItemType('gold999');
    }
  }, [transactionType, itemType]);
  
  // Auto-select valid transaction type when available types change
  useEffect(() => {
    if (!availableTypes.includes(transactionType as any)) {
      // Current transaction type is not available, switch to first available
      if (availableTypes.length > 0) {
        setTransactionType(availableTypes[0] as any);
      }
    }
  }, [availableTypes, transactionType]);

  const getItemOptions = () => {
    const allOptions = [
      { label: 'Gold 999', value: 'gold999' },
      { label: 'Gold 995', value: 'gold995' },
      { label: 'Rani (Impure Gold)', value: 'rani' },
      { label: 'Silver', value: 'silver' },
      { label: 'Rupu (Impure Silver)', value: 'rupu' },
    ];
    
    // Filter out rani and rupu from sell transactions
    if (transactionType === 'sell') {
      return allOptions.filter(option => option.value !== 'rani' && option.value !== 'rupu');
    }
    
    return allOptions;
  };
  
  const itemOptions = getItemOptions();

  const calculateSubtotal = (): number => {
    // Metal-only transactions have no subtotal (no money involved)
    if (metalOnly) {
      return 0;
    }
    
    if (transactionType === 'money') {
      const formatted = formatMoney(moneyAmount);
      const amount = parseFloat(formatted) || 0;
      // Debt = customer owes merchant = inward flow = positive
      // Balance = merchant owes customer = outward flow = negative
      return moneyType === 'debt' ? amount : -amount;
    }

    const weightNum = parseFloat(weight) || 0;
    const priceNum = parseFloat(price) || 0;
    let rawSubtotal = 0;

    if (itemType === 'rani') {
      const touchNum = parseFloat(touch) || 0;
      const pureGold = (weightNum * touchNum) / 100;
      const formattedPureGold = formatPureGold(pureGold);
      rawSubtotal = (formattedPureGold * priceNum) / 10; // Gold price is per 10g
    } else if (itemType === 'rupu') {
      const touchNum = parseFloat(touch) || 0;
      const extraNum = parseFloat(extraPerKg) || 0;
      const pureWeight = (weightNum * touchNum) / 100;
      const formattedPureSilver = formatPureSilver(pureWeight);
      const formattedBonus = formatPureSilver((formattedPureSilver * extraNum) / 1000);
      const totalPureWithExtra = formattedPureSilver + formattedBonus;
      const formattedTotalPureWithExtra = formatPureSilver(totalPureWithExtra);
      
      if (rupuReturnType === 'money') {
        // Money return: subtotal = (pure weight + extra) * price per kg / 1000 (outward flow)
        rawSubtotal = (formattedTotalPureWithExtra * priceNum) / 1000;
      } else {
        // Silver return: net weight = (pure silver + extra) - silver
        const silverNum = parseFloat(silverWeight) || 0;
        const rawNetWeight = formattedTotalPureWithExtra - silverNum;
        const netWeight = formatPureSilver(rawNetWeight);
        rawSubtotal = (netWeight * priceNum) / 1000;
      }
    } else if (itemType.startsWith('gold')) {
      rawSubtotal = (weightNum * priceNum) / 10; // Gold price is per 10g
    } else if (itemType.startsWith('silver')) {
      rawSubtotal = (weightNum * priceNum) / 1000; // Silver price is per kg
    }

    // Apply money formatting to all non-money transaction subtotals
    const formatted = formatMoney(Math.abs(rawSubtotal).toString());
    const formattedAmount = parseFloat(formatted);
    
    // Determine sign based on actual cash flow direction
    let signedAmount: number;
    
    if (itemType === 'rupu' && rupuReturnType !== 'money') {
      // For rupu silver returns, sign is determined by net weight direction
      // Negative net weight (rawSubtotal < 0) = inward flow (positive cash)
      // Positive net weight (rawSubtotal > 0) = outward flow (negative cash)
      signedAmount = rawSubtotal < 0 ? formattedAmount : -formattedAmount;
    } else {
      // For all other transactions: purchases = negative (outward), sales = positive (inward)
      signedAmount = transactionType === 'purchase' ? -formattedAmount : formattedAmount;
    }
    
    return signedAmount;
  };

  const subtotal = calculateSubtotal();
  

  
  const isValid = () => {
    if (transactionType === 'money') {
      return moneyAmount.trim() !== '';
    }
    
    // For metal-only transactions, price is not required
    const hasRequiredFields = metalOnly 
      ? weight.trim() !== '' 
      : weight.trim() !== '' && price.trim() !== '';
    
    if (itemType === 'rani' || itemType === 'rupu') {
      const hasTouch = touch.trim() !== '';
      if (itemType === 'rupu' && rupuReturnType === 'silver') {
        return hasRequiredFields && hasTouch && silverWeight.trim() !== '';
      }
      return hasRequiredFields && hasTouch;
    }
    
    return hasRequiredFields;
  };

  const handleAddEntry = async () => {
    if (!isValid()) {
      setSnackbarMessage('Please fill in all required fields');
      setSnackbarVisible(true);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const entry: TransactionEntry = {
        id: editingEntry?.id || Date.now().toString(),
        type: transactionType,
        itemType: transactionType === 'money' ? 'gold999' : itemType,
        weight: weight.trim() ? parseFloat(weight) : undefined,
        price: metalOnly ? undefined : (price.trim() ? parseFloat(price) : undefined),
        touch: touch.trim() ? parseFloat(touch) : undefined,
        extraPerKg: extraPerKg.trim() ? parseFloat(extraPerKg) : undefined,
        pureWeight: itemType === 'rani' && weight.trim() && touch.trim() ? 
          formatPureGold((parseFloat(weight) * parseFloat(touch)) / 100) : 
          itemType === 'rupu' && weight.trim() && touch.trim() ?
          formatPureSilver((parseFloat(weight) * parseFloat(touch)) / 100) : 
          undefined,
        moneyType: transactionType === 'money' ? moneyType : undefined,
        amount: transactionType === 'money' && moneyAmount.trim() ? parseFloat(moneyAmount) : undefined,
        rupuReturnType: itemType === 'rupu' ? rupuReturnType : undefined,
        silverWeight: itemType === 'rupu' && rupuReturnType === 'silver' ? parseFloat(silverWeight) || 0 : undefined,
        netWeight: itemType === 'rupu' && rupuReturnType === 'silver' ? (() => {
          const touchNum = parseFloat(touch) || 0;
          const extraNum = parseFloat(extraPerKg) || 0;
          const pureWeight = (parseFloat(weight) * touchNum) / 100;
          const formattedPureSilver = formatPureSilver(pureWeight);
          const totalPureWithExtra = formattedPureSilver + (formattedPureSilver * extraNum) / 1000;
          const formattedTotalPureWithExtra = formatPureSilver(totalPureWithExtra);
          const silverNum = parseFloat(silverWeight) || 0;
          const rawNetWeight = formattedTotalPureWithExtra - silverNum;
          return formatPureSilver(rawNetWeight);
        })() : undefined,
        metalOnly: transactionType !== 'money' ? metalOnly : undefined,
        subtotal,
      };

      onAddEntry(entry);
      
      // Reset form on success
      setWeight('');
      setPrice('');
      setTouch('');
      setExtraPerKg('');
      setMoneyAmount('');
      setRupuReturnType('money');
      setSilverWeight('');

      
      setSnackbarMessage(editingEntry ? 'Entry updated successfully' : 'Entry added successfully');
      setSnackbarVisible(true);
      
    } catch (error) {
      setSnackbarMessage('Failed to save entry. Please try again.');
      setSnackbarVisible(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDynamicFields = () => {
    if (transactionType === 'money') {
      return (
        <>
          <SegmentedButtons
            value={moneyType}
            onValueChange={setMoneyType as any}
            buttons={[
              { 
                value: 'debt', 
                label: 'Give', 
                icon: 'arrow-up-circle',
                style: { backgroundColor: moneyType === 'debt' ? theme.colors.error : undefined }
              },
              { 
                value: 'balance', 
                label: 'Receive', 
                icon: 'arrow-down-circle',
                style: { backgroundColor: moneyType === 'balance' ? theme.colors.success : undefined }
              },
            ]}
            style={styles.segmentedButtons}
          />
          <View>
            <TextInput
              label="Amount (₹)"
              value={moneyAmount}
              onChangeText={(text) => {
                setMoneyAmount(text);
              }}
              onBlur={() => {
                if (moneyAmount.trim()) {
                  const formatted = formatMoney(moneyAmount);
                  setMoneyAmount(formatted);
                }
              }}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
        </>
      );
    }

    if (itemType === 'rani') {
      const pureGold = (parseFloat(weight) * parseFloat(touch)) / 100 || 0;
      const formattedPureGold = formatPureGold(pureGold);
      return (
        <>
          <View>
            <TextInput
              label="Rani Weight (g)"
              value={weight}
              onChangeText={setWeight}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <View>
            <TextInput
              label="Touch % (1-100)"
              value={touch}
              onChangeText={setTouch}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <TextInput
            label="Pure Gold Equivalent"
            value={`${formattedPureGold.toFixed(3)}g`}
            mode="outlined"
            editable={false}
            style={styles.input}
          />
          
          {/* Metal Only Toggle */}
          <View style={styles.metalOnlyContainer}>
            <RadioButton
              value="metal-only"
              status={metalOnly ? 'checked' : 'unchecked'}
              onPress={() => setMetalOnly(!metalOnly)}
            />
            <Text variant="bodyLarge" onPress={() => setMetalOnly(!metalOnly)} style={styles.metalOnlyText}>Metal Only</Text>
          </View>
          
          {!metalOnly && (
            <View>
              <TextInput
                label="Price (₹/10g)"
                value={price}
                onChangeText={setPrice}
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
              />
            </View>
          )}
        </>
      );
    }

    if (itemType === 'rupu') {
      const pureWeight = (parseFloat(weight) * parseFloat(touch)) / 100 || 0;
      const formattedPureSilver = formatPureSilver(pureWeight);
      const extraWeight = parseFloat(extraPerKg) || 0;
      const totalPureWithExtra = formattedPureSilver + (formattedPureSilver * extraWeight) / 1000;
      const formattedTotalPureWithExtra = formatPureSilver(totalPureWithExtra);
      
      return (
        <>
          <TextInput
            label="Rupu Weight (g)"
            value={weight}
            onChangeText={setWeight}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
          />
          <TextInput
            label="Touch % (0-99.99)"
            value={touch}
            onChangeText={setTouch}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
          />
          <TextInput
            label="Extra per Kg (g) - Optional"
            value={extraPerKg}
            onChangeText={setExtraPerKg}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
          />

          <View style={styles.calculationDisplay}>
            <Text variant="bodySmall">Pure Silver: {formattedPureSilver}g</Text>
            {extraWeight > 0 && (
              <Text variant="bodySmall">Bonus: {formatPureSilver((formattedPureSilver * extraWeight) / 1000)}g</Text>
            )}
            <Text variant="bodySmall">Total Weight: {formattedTotalPureWithExtra}g</Text>
          </View>
          
          {/* Metal Only Toggle */}
          <View style={styles.metalOnlyContainer}>
            <RadioButton
              value="metal-only"
              status={metalOnly ? 'checked' : 'unchecked'}
              onPress={() => setMetalOnly(!metalOnly)}
            />
            <Text variant="bodyLarge" onPress={() => setMetalOnly(!metalOnly)} style={styles.metalOnlyText}>Metal Only</Text>
          </View>
          
          {!metalOnly && (
            <TextInput
              label="Price per Kg (₹)"
              value={price}
              onChangeText={setPrice}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
            />
          )}
          
          {/* Return Type Selection */}
          {!metalOnly && (
            <View style={styles.segmentedButtons}>
              <SegmentedButtons
                value={rupuReturnType}
                onValueChange={setRupuReturnType as any}
                buttons={[
                  { value: 'money', label: 'Money Return' },
                  { value: 'silver', label: 'Silver Return' },
                ]}
              />
            </View>
          )}
          
          {!metalOnly && rupuReturnType === 'silver' && (
            <>
              <TextInput
                label="Silver Return (g)"
                value={silverWeight}
                onChangeText={setSilverWeight}
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
              />
              <View style={styles.calculationDisplay}>
                <Text variant="bodySmall">Net Weight: {(() => {
                  const silverNum = parseFloat(silverWeight) || 0;
                  const rawNet = formattedTotalPureWithExtra - silverNum;
                  const net = formatPureSilver(rawNet);
                  return `${net}g`;
                })()}</Text>
              </View>
            </>
          )}
        </>
      );
    }

    // Regular Gold/Silver
    const unit = itemType.startsWith('gold') ? '10g' : 'kg';
    
    return (
      <>
        <TextInput
          label={`Weight (${itemType.startsWith('gold') ? 'g' : 'g'})`}
          value={weight}
          onChangeText={setWeight}
          mode="outlined"
          keyboardType="numeric"
          style={styles.input}
        />
        
        {/* Metal Only Toggle */}
        <View style={styles.metalOnlyContainer}>
          <RadioButton
            value="metal-only"
            status={metalOnly ? 'checked' : 'unchecked'}
            onPress={() => setMetalOnly(!metalOnly)}
          />
          <Text variant="bodyLarge" onPress={() => setMetalOnly(!metalOnly)} style={styles.metalOnlyText}>Metal Only</Text>
        </View>
        
        {!metalOnly && (
          <TextInput
            label={`Price (₹/${unit})`}
            value={price}
            onChangeText={setPrice}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
          />
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Page Title Bar */}
      <Surface style={styles.appTitleBar} elevation={2}>
        <View style={styles.appTitleContent}>
          <Text variant="titleLarge" style={styles.appTitle}>
            Transaction Entry
          </Text>
        </View>
      </Surface>

      {/* Customer Header */}
      <Surface style={styles.customerHeader} elevation={1}>
        <View style={styles.customerHeaderContent}>
          <View style={styles.customerHeaderRow}>
            <Button
              mode="text"
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Transaction Type Selector */}
        
        <SegmentedButtons
          value={transactionType}
          onValueChange={setTransactionType as any}
          buttons={[
            ...(availableTypes.includes('purchase') ? [{
              value: 'purchase',
              label: 'Purchase',
              icon: 'arrow-down-circle',
              style: { backgroundColor: transactionType === 'purchase' ? theme.colors.primary : undefined }
            }] : []),
            ...(availableTypes.includes('sell') ? [{
              value: 'sell',
              label: 'Sell',
              icon: 'arrow-up-circle',
              style: { backgroundColor: transactionType === 'sell' ? theme.colors.sellColor : undefined }
            }] : []),
            ...(availableTypes.includes('money') ? [{
              value: 'money',
              label: 'Money',
              icon: 'cash',
              style: { backgroundColor: transactionType === 'money' ? theme.colors.secondary : undefined }
            }] : []),
          ]}
          style={styles.segmentedButtons}
        />

        {/* Item Type Dropdown - Only show for sell/purchase */}
        {transactionType !== 'money' && (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setMenuVisible(true)}
                icon="chevron-down"
                contentStyle={styles.dropdownContent}
                style={styles.dropdown}
              >
                {itemOptions.find(opt => opt.value === itemType)?.label}
              </Button>
            }
          >
            {itemOptions.map(option => (
              <Menu.Item
                key={option.value}
                onPress={() => {
                  setItemType(option.value as ItemType);
                  setMenuVisible(false);
                }}
                title={option.label}
              />
            ))}
          </Menu>
        )}

        {/* Dynamic Input Fields */}
        {renderDynamicFields()}

        {/* Divider before subtotal - only show for non-metal-only */}
        {!metalOnly && <Divider style={styles.subtotalDivider} />}

        {/* Subtotal Display - only show for non-metal-only */}
        {!metalOnly && (
          <Surface style={styles.subtotalContainer} elevation={1}>
            <View style={styles.subtotalContent}>
              <Text variant="titleMedium">Subtotal:</Text>
              <Text 
                variant="titleMedium" 
                style={styles.subtotalAmount}
              >
                {subtotal >= 0 ? '+' : '-'}₹{
                  parseFloat(formatMoney(Math.abs(subtotal).toString())).toLocaleString()
                }
              </Text>
            </View>
          </Surface>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <Surface style={styles.actionButtons} elevation={2}>
        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={handleBack}
            style={[styles.actionButton, { flex: 0.45 }]}
          >
            Back
          </Button>
          <Button
            mode="contained"
            onPress={handleAddEntry}
            disabled={!isValid() || isSubmitting}
            loading={isSubmitting}
            style={[styles.actionButton, { flex: 0.45 }]}
            icon={isSubmitting ? undefined : "check"}
          >
            {isSubmitting ? 'Saving...' : editingEntry ? 'Update Entry' : 'Add Entry'}
          </Button>
        </View>
      </Surface>
      
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
  header: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
  },
  headerContent: {
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row-reverse',
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
  },
  segmentedButtons: {
    marginBottom: theme.spacing.md,
  },
  dropdown: {
    marginBottom: theme.spacing.md,
    borderRadius: 8,
    height: 56,
  },
  dropdownContent: {
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 48,
    height: 56,
  },
  input: {
    marginBottom: theme.spacing.md,
  },
  restrictionNotice: {
    backgroundColor: theme.colors.primaryContainer,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 8,
    marginBottom: theme.spacing.md,
  },
  restrictionText: {
    color: theme.colors.onPrimaryContainer,
    textAlign: 'center',
    fontFamily: 'Roboto_400Regular_Italic',
  },
  calculationDisplay: {
    backgroundColor: theme.colors.surfaceVariant,
    padding: theme.spacing.md,
    borderRadius: 8,
    marginBottom: theme.spacing.md,
  },
  metalOnlyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  metalOnlyText: {
    marginLeft: theme.spacing.xs,
  },
  subtotalContainer: {
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 12,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xxl,
  },
  subtotalDivider: {
    marginVertical: theme.spacing.sm,
  },
  subtotalContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  subtotalAmount: {
    fontFamily: 'Roboto_700Bold',
  },
  actionButtons: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    borderRadius: 8,
  },
  
  inputError: {
    borderColor: theme.colors.error,
    borderWidth: 2,
  },
});
