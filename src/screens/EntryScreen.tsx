import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
import {
  Surface,
  Text,
  SegmentedButtons,
  Menu,
  Button,
  TextInput,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Customer, TransactionEntry, ItemType } from '../types';

interface EntryScreenProps {
  customer: Customer;
  onBack: () => void;
  onAddEntry: (entry: TransactionEntry) => void;
}

export const EntryScreen: React.FC<EntryScreenProps> = ({
  customer,
  onBack,
  onAddEntry,
}) => {
  const [transactionType, setTransactionType] = useState<'purchase' | 'sell'>('sell');
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

  // Mock prices - in real app, these would come from settings/API
  const mockPrices = {
    gold999: 68500,
    gold995: 68000,
    silver: 80000,
    silver98: 80000, // Default silver for calculations
    silver96: 76000,
  };

  const itemOptions = [
    { label: 'Gold 999', value: 'gold999' },
    { label: 'Gold 995', value: 'gold995' },
    { label: 'Rani (Impure Gold)', value: 'rani' },
    { label: 'Silver', value: 'silver' },
    { label: 'Silver 98', value: 'silver98' },
    { label: 'Silver 96', value: 'silver96' },
    { label: 'Rupu (Impure Silver)', value: 'rupu' },
    { label: 'Money', value: 'money' },
  ];

  const calculateSubtotal = (): number => {
    if (itemType === 'money') {
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
      // Use Silver 98 price as default for Rupu money calculation
      const defaultPrice = priceNum || mockPrices.silver98;
      return (pureWeight * defaultPrice) / 1000; // Silver price is per kg
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
  const isValid = itemType === 'money' ? 
    parseFloat(moneyAmount) > 0 : 
    parseFloat(weight) > 0 && parseFloat(price) > 0;

  const handleAddEntry = () => {
    if (!isValid) return;

    const entry: TransactionEntry = {
      id: Date.now().toString(),
      type: transactionType,
      itemType,
      weight: parseFloat(weight) || undefined,
      price: parseFloat(price) || undefined,
      touch: parseFloat(touch) || undefined,
      extraPerKg: parseFloat(extraPerKg) || undefined,
      actualGoldGiven: parseFloat(actualGoldGiven) || undefined,
      moneyType: itemType === 'money' ? moneyType : undefined,
      amount: parseFloat(moneyAmount) || undefined,
      subtotal,
    };

    onAddEntry(entry);
    
    // Reset form
    setWeight('');
    setPrice('');
    setTouch('');
    setExtraPerKg('');
    setActualGoldGiven('');
    setMoneyAmount('');
  };

  const renderDynamicFields = () => {
    if (itemType === 'money') {
      return (
        <>
          <SegmentedButtons
            value={moneyType}
            onValueChange={setMoneyType as any}
            buttons={[
              { value: 'debt', label: 'Add Debt', icon: 'arrow-down-circle' },
              { value: 'balance', label: 'Add Balance', icon: 'arrow-up-circle' },
            ]}
            style={styles.segmentedButtons}
          />
          <TextInput
            label="Amount (₹)"
            value={moneyAmount}
            onChangeText={setMoneyAmount}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
          />
        </>
      );
    }

    if (itemType === 'rani') {
      const pureGold = (parseFloat(weight) * parseFloat(touch)) / 100 || 0;
      return (
        <>
          <TextInput
            label="Rani Weight (g)"
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
            label="Pure Gold Equivalent"
            value={`${pureGold.toFixed(3)}g`}
            mode="outlined"
            editable={false}
            style={styles.input}
          />
          <TextInput
            label="Price (₹/10g)"
            value={price}
            onChangeText={setPrice}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
          />
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
    const defaultPrice = mockPrices[itemType as keyof typeof mockPrices] || 0;
    
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
          placeholder={defaultPrice.toString()}
          style={styles.input}
        />
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* App Title Bar */}
      <Surface style={styles.appTitleBar} elevation={2}>
        <View style={styles.appTitleContent}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.appIcon}
          />
          <Text variant="titleLarge" style={styles.appTitle}>
            BullionDesk
          </Text>
        </View>
      </Surface>

      {/* Customer Header */}
      <Surface style={styles.customerHeader} elevation={1}>
        <View style={styles.customerHeaderContent}>
          <Button
            icon="arrow-left"
            mode="text"
            onPress={onBack}
            contentStyle={styles.backButton}
          >
            {customer.name}
          </Button>
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
          ]}
          style={styles.segmentedButtons}
        />

        {/* Item Type Dropdown */}
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
                // Auto-fill price for regular metals and Rupu (Silver 98 default)
                if (mockPrices[option.value as keyof typeof mockPrices]) {
                  setPrice(mockPrices[option.value as keyof typeof mockPrices].toString());
                } else if (option.value === 'rupu') {
                  // Set Silver 98 price as default for Rupu
                  setPrice(mockPrices.silver98.toString());
                }
              }}
              title={option.label}
            />
          ))}
        </Menu>

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
            disabled={!isValid}
            style={[styles.actionButton, { flex: 0.45 }]}
          >
            Add Entry
          </Button>
        </View>
      </Surface>
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
});
