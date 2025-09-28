import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
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
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { Customer, TransactionEntry, ItemType } from '../types';

interface EntryScreenProps {
  customer: Customer;
  editingEntry?: TransactionEntry;
  onBack: () => void;
  onAddEntry: (entry: TransactionEntry) => void;
}

export const EntryScreen: React.FC<EntryScreenProps> = ({
  customer,
  editingEntry,
  onBack,
  onAddEntry,
}) => {
  const [transactionType, setTransactionType] = useState<'purchase' | 'sell' | 'money'>('sell');
  const [itemType, setItemType] = useState<ItemType>('gold999');
  const [menuVisible, setMenuVisible] = useState(false);
  
  // Input fields
  const [weight, setWeight] = useState('');
  const [price, setPrice] = useState('');
  const [touch, setTouch] = useState('');
  const [extraPerKg, setExtraPerKg] = useState('');
  const [actualGoldGiven, setActualGoldGiven] = useState('');
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyType, setMoneyType] = useState<'debt' | 'balance'>('debt');
  
  // Validation and error states
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [hasInteracted, setHasInteracted] = useState<Record<string, boolean>>({});

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
    }
  }, [editingEntry]);

  const itemOptions = [
    { label: 'Gold 999', value: 'gold999' },
    { label: 'Gold 995', value: 'gold995' },
    { label: 'Rani (Impure Gold)', value: 'rani' },
    { label: 'Silver', value: 'silver' },
    { label: 'Silver 98', value: 'silver98' },
    { label: 'Silver 96', value: 'silver96' },
    { label: 'Rupu (Impure Silver)', value: 'rupu' },
  ];

  const calculateSubtotal = (): number => {
    if (transactionType === 'money') {
      return parseFloat(moneyAmount) || 0;
    }

    const weightNum = parseFloat(weight) || 0;
    const priceNum = parseFloat(price) || 0;

    if (itemType === 'rani') {
      const touchNum = parseFloat(touch) || 0;
      const pureGold = (weightNum * touchNum) / 100;
      return (pureGold * priceNum) / 10; // Gold price is per 10g
    }

    if (itemType === 'rupu') {
      const touchNum = parseFloat(touch) || 0;
      const pureWeight = (weightNum * touchNum) / 100;
      return (pureWeight * priceNum) / 1000; // Silver price is per kg
    }

    if (itemType.startsWith('gold')) {
      return (weightNum * priceNum) / 10; // Gold price is per 10g
    }

    if (itemType.startsWith('silver')) {
      return (weightNum * priceNum) / 1000; // Silver price is per kg
    }

    return 0;
  };

  const subtotal = calculateSubtotal();
  
  // Enhanced validation functions
  const validateWeight = (value: string): string => {
    if (!value.trim()) return 'Weight is required';
    const num = parseFloat(value);
    if (isNaN(num)) return 'Please enter a valid number';
    if (num <= 0) return 'Weight must be greater than 0';
    if (num > 10000) return 'Weight cannot exceed 10,000g';
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'Maximum 2 decimal places allowed';
    return '';
  };
  
  const validatePrice = (value: string): string => {
    if (!value.trim()) return 'Price is required';
    const num = parseFloat(value);
    if (isNaN(num)) return 'Please enter a valid price';
    if (num <= 0) return 'Price must be greater than ₹0';
    if (num > 1000000) return 'Price seems unusually high, please verify';
    return '';
  };
  
  const validateTouch = (value: string): string => {
    if (!value.trim()) return 'Touch percentage is required';
    const num = parseFloat(value);
    if (isNaN(num)) return 'Please enter a valid percentage';
    if (num <= 0 || num > 100) return 'Touch percentage must be between 1-100%';
    if (!Number.isInteger(num)) return 'Touch percentage must be a whole number';
    return '';
  };
  
  const validateMoneyAmount = (value: string): string => {
    if (!value.trim()) return 'Amount is required';
    const num = parseFloat(value);
    if (isNaN(num)) return 'Please enter a valid amount';
    if (num <= 0) return 'Amount must be greater than ₹0';
    if (num > 10000000) return 'Amount cannot exceed ₹1,00,00,000';
    return '';
  };
  
  // Debounced validation
  const debouncedValidate = useCallback(
    debounce((field: string, value: string) => {
      let error = '';
      switch (field) {
        case 'weight':
          error = validateWeight(value);
          break;
        case 'price':
          error = validatePrice(value);
          break;
        case 'touch':
          error = validateTouch(value);
          break;
        case 'moneyAmount':
          error = validateMoneyAmount(value);
          break;
      }
      setFieldErrors(prev => ({ ...prev, [field]: error }));
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
  
  const isValid = () => {
    const hasErrors = Object.values(fieldErrors).some(error => error !== '');
    if (hasErrors) return false;
    
    if (transactionType === 'money') {
      return moneyAmount.trim() !== '' && !validateMoneyAmount(moneyAmount);
    }
    
    const hasRequiredFields = weight.trim() !== '' && !validateWeight(weight) && 
                              price.trim() !== '' && !validatePrice(price);
    
    if (itemType === 'rani' || itemType === 'rupu') {
      return hasRequiredFields && touch.trim() !== '' && !validateTouch(touch);
    }
    
    return hasRequiredFields;
  };

  const handleAddEntry = async () => {
    // Validate all fields before submission
    const errors: Record<string, string> = {};
    
    if (transactionType === 'money') {
      errors.moneyAmount = validateMoneyAmount(moneyAmount);
    } else {
      errors.weight = validateWeight(weight);
      errors.price = validatePrice(price);
      if (itemType === 'rani' || itemType === 'rupu') {
        errors.touch = validateTouch(touch);
      }
    }
    
    // Filter out empty errors
    const validationErrors = Object.fromEntries(
      Object.entries(errors).filter(([_, error]) => error !== '')
    );
    
    setFieldErrors(validationErrors);
    
    if (Object.keys(validationErrors).length > 0) {
      setSnackbarMessage('Please fix the errors above');
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
        price: price.trim() ? parseFloat(price) : undefined,
        touch: touch.trim() ? parseFloat(touch) : undefined,
        extraPerKg: extraPerKg.trim() ? parseFloat(extraPerKg) : undefined,
        pureWeight: itemType === 'rani' && weight.trim() && touch.trim() ? 
          (parseFloat(weight) * parseFloat(touch)) / 100 : 
          itemType === 'rupu' && weight.trim() && touch.trim() ?
          (parseFloat(weight) * parseFloat(touch)) / 100 : 
          undefined,
        actualGoldGiven: actualGoldGiven.trim() ? parseFloat(actualGoldGiven) : undefined,
        moneyType: transactionType === 'money' ? moneyType : undefined,
        amount: transactionType === 'money' && moneyAmount.trim() ? parseFloat(moneyAmount) : undefined,
        subtotal,
      };

      onAddEntry(entry);
      
      // Reset form on success
      setWeight('');
      setPrice('');
      setTouch('');
      setExtraPerKg('');
      setActualGoldGiven('');
      setMoneyAmount('');
      setFieldErrors({});
      setHasInteracted({});
      
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
                label: 'Add Debt', 
                icon: 'arrow-up-circle',
                style: { backgroundColor: moneyType === 'debt' ? theme.colors.error : undefined }
              },
              { 
                value: 'balance', 
                label: 'Add Balance', 
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
                setHasInteracted(prev => ({ ...prev, moneyAmount: true }));
                debouncedValidate('moneyAmount', text);
              }}
              mode="outlined"
              keyboardType="numeric"
              style={[
                styles.input,
                fieldErrors.moneyAmount ? styles.inputError : null
              ]}
              error={!!fieldErrors.moneyAmount}
              right={
                fieldErrors.moneyAmount ? (
                  <TextInput.Icon icon="alert-circle" />
                ) : moneyAmount && !fieldErrors.moneyAmount && hasInteracted.moneyAmount ? (
                  <TextInput.Icon icon="check-circle" />
                ) : null
              }
            />
            <HelperText type="error" visible={!!fieldErrors.moneyAmount}>
              {fieldErrors.moneyAmount}
            </HelperText>
          </View>
        </>
      );
    }

    if (itemType === 'rani') {
      const pureGold = (parseFloat(weight) * parseFloat(touch)) / 100 || 0;
      return (
        <>
          <View>
            <TextInput
              label="Rani Weight (g)"
              value={weight}
              onChangeText={(text) => {
                setWeight(text);
                setHasInteracted(prev => ({ ...prev, weight: true }));
                debouncedValidate('weight', text);
              }}
              mode="outlined"
              keyboardType="numeric"
              style={[
                styles.input,
                fieldErrors.weight ? styles.inputError : null
              ]}
              error={!!fieldErrors.weight}
              right={
                fieldErrors.weight ? (
                  <TextInput.Icon icon="alert-circle" />
                ) : weight && !fieldErrors.weight && hasInteracted.weight ? (
                  <TextInput.Icon icon="check-circle" />
                ) : null
              }
            />
            <HelperText type="error" visible={!!fieldErrors.weight}>
              {fieldErrors.weight}
            </HelperText>
          </View>
          <View>
            <TextInput
              label="Touch % (1-100)"
              value={touch}
              onChangeText={(text) => {
                setTouch(text);
                setHasInteracted(prev => ({ ...prev, touch: true }));
                debouncedValidate('touch', text);
              }}
              mode="outlined"
              keyboardType="numeric"
              style={[
                styles.input,
                fieldErrors.touch ? styles.inputError : null
              ]}
              error={!!fieldErrors.touch}
              right={
                fieldErrors.touch ? (
                  <TextInput.Icon icon="alert-circle" />
                ) : touch && !fieldErrors.touch && hasInteracted.touch ? (
                  <TextInput.Icon icon="check-circle" />
                ) : null
              }
            />
            <HelperText type="error" visible={!!fieldErrors.touch}>
              {fieldErrors.touch}
            </HelperText>
          </View>
          <TextInput
            label="Pure Gold Equivalent"
            value={`${pureGold.toFixed(3)}g`}
            mode="outlined"
            editable={false}
            style={styles.input}
          />
          <View>
            <TextInput
              label="Price (₹/10g)"
              value={price}
              onChangeText={(text) => {
                setPrice(text);
                setHasInteracted(prev => ({ ...prev, price: true }));
                debouncedValidate('price', text);
              }}
              mode="outlined"
              keyboardType="numeric"
              style={[
                styles.input,
                fieldErrors.price ? styles.inputError : null
              ]}
              error={!!fieldErrors.price}
              right={
                fieldErrors.price ? (
                  <TextInput.Icon icon="alert-circle" />
                ) : price && !fieldErrors.price && hasInteracted.price ? (
                  <TextInput.Icon icon="check-circle" />
                ) : null
              }
            />
            <HelperText type="error" visible={!!fieldErrors.price}>
              {fieldErrors.price}
            </HelperText>
          </View>
          {transactionType === 'sell' && (
            <TextInput
              label="Actual Gold Given (g)"
              value={actualGoldGiven}
              onChangeText={setActualGoldGiven}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
            />
          )}
        </>
      );
    }

    if (itemType === 'rupu') {
      const pureWeight = (parseFloat(weight) * parseFloat(touch)) / 100 || 0;
      const extraWeight = parseFloat(extraPerKg) || 0;
      const totalGiven = pureWeight + (pureWeight * extraWeight) / 1000;
      
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
          <TextInput
            label="Price per Kg (₹)"
            value={price}
            onChangeText={setPrice}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
          />
          <View style={styles.calculationDisplay}>
            <Text variant="bodySmall">Pure Silver: {pureWeight.toFixed(3)}g</Text>
            {extraWeight > 0 && (
              <Text variant="bodySmall">Bonus: {((pureWeight * extraWeight) / 1000).toFixed(3)}g</Text>
            )}
            <Text variant="bodySmall">Total Given: {totalGiven.toFixed(3)}g</Text>
          </View>
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
        <TextInput
          label={`Price (₹/${unit})`}
          value={price}
          onChangeText={setPrice}
          mode="outlined"
          keyboardType="numeric"
          style={styles.input}
        />
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
            {
              value: 'purchase',
              label: 'Purchase',
              icon: 'arrow-down-circle',
              style: { backgroundColor: transactionType === 'purchase' ? theme.colors.primary : undefined }
            },
            {
              value: 'sell',
              label: 'Sell',
              icon: 'arrow-up-circle',
              style: { backgroundColor: transactionType === 'sell' ? theme.colors.sellColor : undefined }
            },
            {
              value: 'money',
              label: 'Money',
              icon: 'cash',
              style: { backgroundColor: transactionType === 'money' ? theme.colors.secondary : undefined }
            },
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

        {/* Subtotal Display */}
        <Surface style={styles.subtotalContainer} elevation={1}>
          <View style={styles.subtotalContent}>
            <Text variant="titleMedium">Subtotal:</Text>
            <Text 
              variant="titleMedium" 
              style={styles.subtotalAmount}
            >
              {transactionType === 'sell' ? '+' : '-'}₹{Math.abs(subtotal).toLocaleString()}
            </Text>
          </View>
        </Surface>
      </ScrollView>

      {/* Action Buttons */}
      <Surface style={styles.actionButtons} elevation={2}>
        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={onBack}
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
    fontWeight: 'bold',
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
  calculationDisplay: {
    backgroundColor: theme.colors.surfaceVariant,
    padding: theme.spacing.md,
    borderRadius: 8,
    marginBottom: theme.spacing.md,
  },
  subtotalContainer: {
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 12,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  subtotalContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  subtotalAmount: {
    fontWeight: 'bold',
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
  
  // Part 5 Enhanced Styles - Validation & Error Handling
  inputError: {
    borderColor: theme.colors.error,
    borderWidth: 2,
  },
});
