import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, BackHandler, TouchableOpacity } from 'react-native';
import {
  Text,
  TextInput,
  Snackbar,
  ActivityIndicator,
  Portal,
  Modal,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { formatMoney, formatPureGold, formatPureSilver, formatIndianNumber } from '../utils/formatting';
import { Customer, TransactionEntry, ItemType } from '../types';
import { useAppContext } from '../context/AppContext';

interface EntryScreenProps {
  customer: Customer;
  editingEntry?: TransactionEntry;
  existingEntries?: TransactionEntry[];
  onBack: () => void;
  onNavigateToSummary?: () => void;
  onAddEntry: (entry: TransactionEntry) => void;
  isFirstEntryForMoneyOnlyTransaction?: boolean;
  originalMoneyOnlyType?: 'receive' | 'give';
}

export const EntryScreen: React.FC<EntryScreenProps> = ({
  customer,
  editingEntry,
  existingEntries = [],
  onBack,
  onNavigateToSummary,
  onAddEntry,
  isFirstEntryForMoneyOnlyTransaction = false,
  originalMoneyOnlyType,
}) => {
  const { setPendingMoneyAmount, setPendingMoneyType, lastEntryState, setLastEntryState } = useAppContext();
  
  // Check what types of entries already exist (excluding the one being edited)
  const otherEntries = existingEntries.filter(entry => entry.id !== editingEntry?.id);
  const hasMetalOnlyEntries = otherEntries.some(entry => entry.metalOnly === true);
  const hasPricedEntries = otherEntries.some(entry => entry.type !== 'money' && entry.metalOnly === false);
  
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
    if (hasMetalOnlyEntries) {
      // If metal-only entries exist, do not allow adding non-metal entries
      return ['sell', 'purchase'];
    }

    // If this is the special case of editing a money-only transaction and there
    // are no existing entries yet, only allow the first entry type based on the
    // original money-only transaction type:
    // - originalMoneyOnlyType === 'receive'  => first entry must be 'sell'
    // - originalMoneyOnlyType === 'give'     => first entry must be 'purchase'
    if (isFirstEntryForMoneyOnlyTransaction) {
      if (originalMoneyOnlyType === 'receive') return ['sell'];
      if (originalMoneyOnlyType === 'give') return ['purchase'];
      // fallback: allow sell/purchase
      return ['sell', 'purchase'];
    }

    // If there are existing entries (editing a transaction with entries),
    // never allow money entries — only sell/purchase are allowed.
    if (existingEntries.length > 0) {
      return ['sell', 'purchase'];
    }

    // Default case (creating a new transaction with no entries): allow money
    // as well as sell/purchase.
    return ['sell', 'purchase', 'money'];
  };
  
  const availableTypes = getAvailableTransactionTypes();
  const [transactionType, setTransactionType] = useState<'purchase' | 'sell' | 'money'>(() => {
    // If this is the first entry for a money-only transaction, set default based on original money type
    if (isFirstEntryForMoneyOnlyTransaction && originalMoneyOnlyType) {
      return originalMoneyOnlyType === 'receive' ? 'sell' : 'purchase';
    }
    if (lastEntryState && !editingEntry) return lastEntryState.transactionType;
    return 'sell';
  });
  const [moneyType, setMoneyType] = useState<'give' | 'receive'>('receive');
  const [itemType, setItemType] = useState<ItemType>(() => {
    if (lastEntryState && !editingEntry) return lastEntryState.itemType;
    return 'gold999';
  });
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [metalOnly, setMetalOnly] = useState(() => {
    if (hasMetalOnlyEntries) return true;
    if (hasPricedEntries) return false;
    return false;
  });
  
  // Input fields
  const [weight, setWeight] = useState('');
  const [price, setPrice] = useState('');
  const [touch, setTouch] = useState('');
  const [cut, setCut] = useState('');
  const [extraPerKg, setExtraPerKg] = useState('');
  const [amount, setAmount] = useState('');
  
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
      setTransactionType(editingEntry.type as 'purchase' | 'sell' | 'money');
      if (editingEntry.type === 'money') {
        setMoneyType(editingEntry.moneyType || 'receive');
        setAmount(editingEntry.amount?.toString() || '');
      } else {
        setItemType(editingEntry.itemType);
        setWeight(editingEntry.weight?.toString() || '');
        setPrice(editingEntry.price?.toString() || '');
        setTouch(editingEntry.touch?.toString() || '');
        setCut(editingEntry.cut?.toString() || '');
        setRupuReturnType(editingEntry.rupuReturnType || 'money');
        setSilverWeight(editingEntry.silverWeight?.toString() || '');
        setMetalOnly(editingEntry.metalOnly || false);
      }
    }
  }, [editingEntry]);
  
  // Reset itemType to valid option when switching to sell transaction type
  useEffect(() => {
    if (transactionType === 'sell' && (itemType === 'rani' || itemType === 'rupu')) {
      setItemType('gold999'); // Default to gold999 for sell transactions
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

  // Ensure Rupu sell transactions use money return only
  useEffect(() => {
    if (transactionType === 'sell' && itemType === 'rupu' && rupuReturnType === 'silver') {
      setRupuReturnType('money');
      setSilverWeight('');
    }
  }, [transactionType, itemType, rupuReturnType]);

  // Enforce metal-only constraints
  useEffect(() => {
    if (hasMetalOnlyEntries) {
      setMetalOnly(true);
    } else if (hasPricedEntries) {
      setMetalOnly(false);
    }
  }, [hasMetalOnlyEntries, hasPricedEntries]);

  const getItemOptions = () => {
    const allOptions = [
      { label: 'Gold 999', value: 'gold999' },
      { label: 'Gold 995', value: 'gold995' },
      { label: 'Rani (Impure Gold)', value: 'rani' },
      { label: 'Silver', value: 'silver' },
      { label: 'Rupu (Impure Silver)', value: 'rupu' },
    ];
    
    // Filter out rani and rupu for sell transactions
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

    // Handle money transactions
    if (transactionType === 'money') {
      const amountNum = parseFloat(amount) || 0;
      return moneyType === 'receive' ? amountNum : -amountNum;
    }

    const weightNum = parseFloat(weight) || 0;
    const priceNum = parseFloat(price) || 0;
    let rawSubtotal = 0;

    if (itemType === 'rani') {
      const touchNum = parseFloat(touch) || 0;
      const cutNum = parseFloat(cut) || 0;
      const effectiveTouch = Math.max(0, touchNum - cutNum); // Ensure non-negative
      const pureGold = (weightNum * effectiveTouch) / 100;
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
    // For money transactions, only amount is required
    if (transactionType === 'money') {
      return amount.trim() !== '' && parseFloat(amount) > 0;
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
      // For money transactions, set the pending money amount and navigate to settlement
      if (transactionType === 'money') {
        const amountNum = parseFloat(amount) || 0;
        // Store the amount with proper sign based on money type
        // receive = positive (merchant receives money from customer)
        // give = negative (merchant gives money to customer)
        const signedAmount = moneyType === 'receive' ? amountNum : -amountNum;
        setPendingMoneyAmount(signedAmount);
        setPendingMoneyType(moneyType);
        
        // Navigate to settlement summary
        if (onNavigateToSummary) {
          onNavigateToSummary();
        }
        return;
      }

      // Create regular entry
      const entry: TransactionEntry = {
        id: editingEntry?.id || Date.now().toString(),
          type: transactionType as 'purchase' | 'sell',
          itemType,
          weight: weight.trim() ? parseFloat(weight) : undefined,
          price: metalOnly ? undefined : (price.trim() ? parseFloat(price) : undefined),
          touch: touch.trim() ? parseFloat(touch) : undefined,
          cut: cut.trim() ? parseFloat(cut) : undefined,
          extraPerKg: extraPerKg.trim() ? parseFloat(extraPerKg) : undefined,
          pureWeight: itemType === 'rani' && weight.trim() && touch.trim() ? 
            formatPureGold((parseFloat(weight) * (parseFloat(touch) - (parseFloat(cut) || 0))) / 100) : 
            itemType === 'rupu' && weight.trim() && touch.trim() ?
            formatPureSilver((parseFloat(weight) * parseFloat(touch)) / 100) : 
            undefined,
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
          metalOnly,
          subtotal,
          createdAt: editingEntry?.createdAt || new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        };

      onAddEntry(entry);
      
      // Save last entry state for next entry
      setLastEntryState({
        transactionType: transactionType as 'purchase' | 'sell' | 'money',
        itemType,
      });
      
      // Reset form on success
      setWeight('');
      setPrice('');
      setTouch('');
      setCut('');
      setExtraPerKg('');
      setRupuReturnType('money');
      setSilverWeight('');
      setAmount('');
      setMoneyType('receive');

      
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
    const inputTheme = { 
      roundness: 12,
      fonts: { regular: { fontFamily: 'Outfit_400Regular' } }
    };
    
    // Money transaction fields
    if (transactionType === 'money') {
      return (
        <TextInput
          label="Amount (₹)"
          value={amount}
          onChangeText={setAmount}
          mode="outlined"
          keyboardType="numeric"
          style={styles.input}
          theme={inputTheme}
        />
      );
    }

    if (itemType === 'rani') {
      const touchNum = parseFloat(touch) || 0;
      const cutNum = parseFloat(cut) || 0;
      const effectiveTouch = Math.max(0, touchNum - cutNum);
      const pureGold = (parseFloat(weight) * effectiveTouch) / 100 || 0;
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
              theme={inputTheme}
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
              theme={inputTheme}
            />
          </View>
          <View>
            <TextInput
              label="Cut %"
              value={cut}
              onChangeText={(value) => {
                const numValue = parseFloat(value) || 0;
                const touchNum = parseFloat(touch) || 0;
                if (numValue > touchNum) {
                  setCut(touchNum.toString());
                } else {
                  setCut(value);
                }
              }}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
              theme={inputTheme}
            />
          </View>
          <TextInput
            label="Pure Gold (g)"
            value={`${formattedPureGold !== 0 ? `${formattedPureGold.toFixed(3)}g` : ''}`}
            mode="outlined"
            editable={false}
            style={styles.input}
            theme={inputTheme}
          />
          
          {/* Metal Only Toggle */}
          <TouchableOpacity 
            style={styles.checkboxRow} 
            onPress={() => !(hasMetalOnlyEntries || hasPricedEntries) && setMetalOnly(!metalOnly)}
            disabled={hasMetalOnlyEntries || hasPricedEntries}
          >
            <View style={[styles.radioCircle, metalOnly && styles.radioCircleActive]}>
              {metalOnly && <View style={styles.radioInner} />}
            </View>
            <Text style={[styles.checkboxLabel, (hasMetalOnlyEntries || hasPricedEntries) && { color: theme.colors.onSurfaceDisabled }]}>
              Metal Only
            </Text>
          </TouchableOpacity>
          
          {!metalOnly && (
            <View>
              <TextInput
                label="Price (₹/10g)"
                value={price}
                onChangeText={setPrice}
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
                theme={inputTheme}
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
            theme={inputTheme}
          />
          <TextInput
            label="Touch % (0-99.99)"
            value={touch}
            onChangeText={setTouch}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
            theme={inputTheme}
          />
          <TextInput
            label="Extra per Kg (g) - Optional"
            value={extraPerKg}
            onChangeText={setExtraPerKg}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
            theme={inputTheme}
          />

          <TextInput
            label="Pure Weight + Extra (g)"
            value={`${formattedTotalPureWithExtra !== 0 ? `${formattedTotalPureWithExtra.toFixed(1)}g` : ''}`}
            mode="outlined"
            editable={false}
            style={styles.input}
            theme={inputTheme}
          />
          
          {/* Metal Only Toggle */}
          <TouchableOpacity 
            style={styles.checkboxRow} 
            onPress={() => !(hasMetalOnlyEntries || hasPricedEntries) && setMetalOnly(!metalOnly)}
            disabled={hasMetalOnlyEntries || hasPricedEntries}
          >
            <View style={[styles.radioCircle, metalOnly && styles.radioCircleActive]}>
              {metalOnly && <View style={styles.radioInner} />}
            </View>
            <Text style={[styles.checkboxLabel, (hasMetalOnlyEntries || hasPricedEntries) && { color: theme.colors.onSurfaceDisabled }]}>
              Metal Only
            </Text>
          </TouchableOpacity>
          
          {!metalOnly && (
            <TextInput
              label="Price per Kg (₹)"
              value={price}
              onChangeText={setPrice}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
              theme={inputTheme}
            />
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
          theme={inputTheme}
        />
        
        {/* Metal Only Toggle */}
        <TouchableOpacity 
          style={styles.checkboxRow} 
          onPress={() => !(hasMetalOnlyEntries || hasPricedEntries) && setMetalOnly(!metalOnly)}
          disabled={hasMetalOnlyEntries || hasPricedEntries}
        >
          <View style={[styles.radioCircle, metalOnly && styles.radioCircleActive]}>
            {metalOnly && <View style={styles.radioInner} />}
          </View>
          <Text style={[styles.checkboxLabel, (hasMetalOnlyEntries || hasPricedEntries) && { color: theme.colors.onSurfaceDisabled }]}>
            Metal Only
          </Text>
        </TouchableOpacity>
        
        {!metalOnly && (
          <TextInput
            label={`Price (₹/${unit})`}
            value={price}
            onChangeText={setPrice}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
            theme={inputTheme}
          />
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Entry</Text>
      </View>

      {/* Customer Bar */}
      <View style={styles.customerBar}>
        <Text style={styles.customerName}>{customer.name}</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onBack}>
          <MaterialCommunityIcons name="close" size={20} color="#BA1A1A" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Transaction Type Tabs */}
        <View style={styles.tabContainer}>
          {availableTypes.includes('purchase') && (
            <TouchableOpacity
              style={[
                styles.tab,
                transactionType === 'purchase' && { backgroundColor: theme.colors.primary }
              ]}
              onPress={() => setTransactionType('purchase')}
            >
              {transactionType === 'purchase' && (
                <MaterialCommunityIcons
                  name="arrow-bottom-left"
                  size={18}
                  color="#FFF"
                />
              )}
              <Text style={[
                styles.tabText,
                transactionType === 'purchase' && { color: '#FFF' }
              ]}>Purchase</Text>
            </TouchableOpacity>
          )}
          {availableTypes.includes('sell') && (
            <TouchableOpacity
              style={[
                styles.tab,
                transactionType === 'sell' && { backgroundColor: theme.colors.sellColor }
              ]}
              onPress={() => setTransactionType('sell')}
            >
              {transactionType === 'sell' && (
                <MaterialCommunityIcons
                  name="arrow-top-right"
                  size={18}
                  color="#FFF"
                />
              )}
              <Text style={[
                styles.tabText,
                transactionType === 'sell' && { color: '#FFF' }
              ]}>Sell</Text>
            </TouchableOpacity>
          )}
          {availableTypes.includes('money') && (
            <TouchableOpacity
              style={[
                styles.tab,
                transactionType === 'money' && { backgroundColor: '#607D8B' }
              ]}
              onPress={() => setTransactionType('money')}
            >
              {transactionType === 'money' && (
                <MaterialCommunityIcons
                  name="cash-multiple"
                  size={18}
                  color="#FFF"
                />
              )}
              <Text style={[
                styles.tabText,
                transactionType === 'money' && { color: '#FFF' }
              ]}>Money</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Money Sub-tabs */}
        {transactionType === 'money' && (
          <View style={[styles.tabContainer, { marginTop: 0, marginBottom: 16 }]}>
            <TouchableOpacity
              style={[
                styles.tab,
                moneyType === 'receive' && { backgroundColor: theme.colors.success }
              ]}
              onPress={() => setMoneyType('receive')}
            >
              {moneyType === 'receive' && (
                <MaterialCommunityIcons
                  name="arrow-bottom-left"
                  size={18}
                  color="#FFF"
                />
              )}
              <Text style={[
                styles.tabText,
                moneyType === 'receive' && { color: '#FFF' }
              ]}>Receive</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                moneyType === 'give' && { backgroundColor: theme.colors.warning }
              ]}
              onPress={() => setMoneyType('give')}
            >
              {moneyType === 'give' && (
                <MaterialCommunityIcons
                  name="arrow-top-right"
                  size={18}
                  color="#FFF"
                />
              )}
              <Text style={[
                styles.tabText,
                moneyType === 'give' && { color: '#FFF' }
              ]}>Give</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Item Type Selector */}
        {transactionType !== 'money' && (
          <TouchableOpacity
            style={styles.dropdownField}
            onPress={() => setBottomSheetVisible(true)}
          >
            <Text style={styles.dropdownText}>
              {itemOptions.find(opt => opt.value === itemType)?.label}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={24} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {renderDynamicFields()}
        </View>

        {/* Spacer for bottom bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomBar}>
        
        {!metalOnly && (
          <View style={styles.subtotalCard}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.subtotalValue}>
              {subtotal >= 0 ? '+' : '-'}₹{
                formatIndianNumber(parseFloat(formatMoney(Math.abs(subtotal).toString())))
              }
            </Text>
          </View>
        )}
        
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btnSecondary} onPress={handleBack}>
            <Text style={styles.btnSecondaryText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, (!isValid() || isSubmitting) && { opacity: 0.6 }]}
            onPress={handleAddEntry}
            disabled={!isValid() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="check" size={20} color="#FFF" />
                <Text style={styles.btnPrimaryText}>
                  {editingEntry ? 'Update Entry' : 'Add Entry'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
      
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

      <Portal>
        <Modal
          visible={bottomSheetVisible}
          onDismiss={() => setBottomSheetVisible(false)}
          contentContainerStyle={styles.bottomSheetContent}
          style={styles.bottomSheetModal}
        >
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.bottomSheetTitle}>Select Item Type</Text>
          {itemOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.bottomSheetItem,
                itemType === option.value && styles.bottomSheetItemActive
              ]}
              onPress={() => {
                setItemType(option.value as ItemType);
                setBottomSheetVisible(false);
              }}
            >
              <Text style={[
                styles.bottomSheetItemText,
                itemType === option.value && styles.bottomSheetItemTextActive
              ]}>
                {option.label}
              </Text>
              {itemType === option.value && (
                <MaterialCommunityIcons name="check" size={24} color={theme.colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </Modal>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceContainer,
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
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.outline,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurface,
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
  tabContainer: {
    margin: 20,
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceContainer,
    padding: 4,
    borderRadius: 100,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Outfit_600SemiBold',
  },
  dropdownField: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_500Medium',
  },
  formContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  input: {
    backgroundColor: theme.colors.surface,
    fontSize: 16,
    fontFamily: 'Outfit_400Regular',
    marginBottom: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 4,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    color: '#1B1B1F',
    borderColor: '#1B1B1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#1B1B1F',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1B1B1F',
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_500Medium',
  },
  subtotalCard: {
    marginHorizontal: 10,
    marginBottom: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.outline,
  },
  subtotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
    textTransform: 'uppercase',
    fontFamily: 'Outfit_600SemiBold',
  },
  subtotalValue: {
    fontSize: 20,
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_700Bold',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.outline,
    flexDirection: 'column',
    gap: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingVertical: 14,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_600SemiBold',
  },
  btnPrimary: {
    flex: 2,
    backgroundColor: theme.colors.onSurface,
    paddingVertical: 14,
    borderRadius: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onPrimary,
    fontFamily: 'Outfit_600SemiBold',
  },
  bottomSheetModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  bottomSheetContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  bottomSheetHandle: {
    width: 32,
    height: 4,
    backgroundColor: theme.colors.outline,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.4,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
    color: theme.colors.onSurface,
    marginBottom: 16,
    textAlign: 'center',
  },
  bottomSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceContainer,
  },
  bottomSheetItemActive: {
    backgroundColor: theme.colors.secondaryContainer,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 0,
  },
  bottomSheetItemText: {
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
    color: theme.colors.onSurface,
  },
  bottomSheetItemTextActive: {
    color: theme.colors.primary,
    fontFamily: 'Outfit_700Bold',
  },
});
