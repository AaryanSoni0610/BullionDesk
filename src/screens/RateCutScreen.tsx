import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, BackHandler } from 'react-native';
import { Text, Button, TextInput, SegmentedButtons, IconButton, Surface } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../theme';
import { RateCutService, RateCutRecord } from '../services/rateCut.service';
import { Customer } from '../types';
import { formatIndianNumber } from '../utils/formatting';
import { CustomerSelectionModal } from '../components/CustomerSelectionModal';
import { useAppContext } from '../context/AppContext';

export const RateCutScreen: React.FC = () => {
  const { navigateToSettings } = useAppContext();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [metalType, setMetalType] = useState<'gold999' | 'gold995' | 'silver'>('gold999');
  const [weight, setWeight] = useState('');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [history, setHistory] = useState<RateCutRecord[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigateToSettings();
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [navigateToSettings])
  );

  useEffect(() => {
    if (selectedCustomer) {
      loadHistory();
    }
  }, [selectedCustomer]);

  // Determine available metals based on customer balance
  const getAvailableMetals = useCallback(() => {
    if (!selectedCustomer || !selectedCustomer.metalBalances) return [];
    
    const metals: { value: 'gold999' | 'gold995' | 'silver', label: string }[] = [];
    
    if (Math.abs(selectedCustomer.metalBalances.gold999 || 0) > 0.001) {
      metals.push({ value: 'gold999', label: 'Gold 999' });
    }
    if (Math.abs(selectedCustomer.metalBalances.gold995 || 0) > 0.001) {
      metals.push({ value: 'gold995', label: 'Gold 995' });
    }
    if (Math.abs(selectedCustomer.metalBalances.silver || 0) > 0.001) {
      metals.push({ value: 'silver', label: 'Silver' });
    }
    
    return metals;
  }, [selectedCustomer]);

  const availableMetals = getAvailableMetals();

  // Auto-select first available metal if current selection is invalid
  useEffect(() => {
    if (availableMetals.length > 0) {
      const isCurrentValid = availableMetals.some(m => m.value === metalType);
      if (!isCurrentValid) {
        setMetalType(availableMetals[0].value);
      }
    }
  }, [availableMetals, metalType]);

  const loadHistory = async () => {
    if (!selectedCustomer) return;
    const data = await RateCutService.getRateCutHistory(selectedCustomer.id);
    setHistory(data);
  };

  const handleApply = async () => {
    if (!selectedCustomer || !weight || !rate) return;

    const weightVal = parseFloat(weight);
    const rateVal = parseFloat(rate);
    
    if (isNaN(weightVal) || isNaN(rateVal) || weightVal <= 0 || rateVal <= 0) {
      Alert.alert('Error', 'Please enter valid positive numbers for weight and rate');
      return;
    }

    const currentBalance = selectedCustomer.metalBalances?.[metalType] || 0;

    // Validation: Weight Cut <= Metal Balance (Absolute)
    if (weightVal > Math.abs(currentBalance)) {
      Alert.alert('Error', `Weight cut (${weightVal}) cannot exceed current balance (${Math.abs(currentBalance).toFixed(3)})`);
      return;
    }

    // Sign Logic:
    // If Balance > 0 (Merchant owes Customer), we reduce balance (positive weight).
    // If Balance < 0 (Customer owes Merchant), we reduce debt (negative weight).
    // The user enters positive weight in UI.
    const signedWeight = Math.sign(currentBalance) * weightVal;

    setLoading(true);
    const success = await RateCutService.applyRateCut(
      selectedCustomer.id,
      metalType,
      signedWeight,
      rateVal,
      date.getTime()
    );

    if (success) {
      setWeight('');
      setRate('');
      loadHistory();
      Alert.alert('Success', 'Rate cut applied successfully');
    } else {
      Alert.alert('Error', 'Failed to apply rate cut');
    }
    setLoading(false);
  };

  const handleDelete = async (cut: RateCutRecord) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this rate cut?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            // @ts-ignore - metal_type is compatible but TS might complain due to strict union check if not updated everywhere
            const success = await RateCutService.deleteLatestRateCut(cut.id, cut.customer_id, cut.metal_type);
            if (success) {
              loadHistory();
            } else {
              Alert.alert('Error', 'Failed to delete rate cut');
            }
            setLoading(false);
          },
        },
      ]
    );
  };

  const hasMetalBalance = (customer: Customer) => {
    return (Math.abs(customer.metalBalances?.gold999 || 0) > 0.01) || 
           (Math.abs(customer.metalBalances?.gold995 || 0) > 0.01) || 
           (Math.abs(customer.metalBalances?.silver || 0) > 0.01);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* App Title Bar */}
      <Surface style={styles.appTitleBar} elevation={1}>
        <View style={styles.appTitleContent}>
          <IconButton
            icon="arrow-left"
            size={20}
            onPress={navigateToSettings}
            style={styles.backButton}
          />
          <Text variant="titleLarge" style={styles.appTitle}>
            Rate Cut
          </Text>
        </View>
      </Surface>

      <ScrollView contentContainerStyle={styles.content}>
        <Surface style={styles.card} elevation={1}>
          <Button 
            mode="outlined" 
            onPress={() => setShowCustomerModal(true)}
            style={styles.input}
          >
            {selectedCustomer ? selectedCustomer.name : 'Select Customer'}
          </Button>

          {selectedCustomer && availableMetals.length > 0 ? (
            <SegmentedButtons
              value={metalType}
              onValueChange={value => setMetalType(value as 'gold999' | 'gold995' | 'silver')}
              buttons={availableMetals}
              style={styles.input}
            />
          ) : (
            <Text style={[styles.input, { textAlign: 'center', color: theme.colors.onSurfaceVariant }]}>
              {selectedCustomer ? 'No metal balance available for rate cut' : 'Select a customer to see options'}
            </Text>
          )}

          <TextInput
            label="Weight Cut"
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            disabled={!selectedCustomer || availableMetals.length === 0}
          />

          <TextInput
            label="Rate"
            value={rate}
            onChangeText={setRate}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            disabled={!selectedCustomer || availableMetals.length === 0}
          />

          <Button 
            mode="outlined" 
            onPress={() => setShowDatePicker(true)}
            style={styles.input}
            disabled={!selectedCustomer || availableMetals.length === 0}
          >
            Date: {date.toLocaleDateString()}
          </Button>

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) setDate(selectedDate);
              }}
            />
          )}

          <Button 
            mode="contained" 
            onPress={handleApply} 
            loading={loading}
            disabled={!selectedCustomer || !weight || !rate || availableMetals.length === 0}
            style={styles.button}
          >
            Apply Rate Cut
          </Button>
        </Surface>

        <Text variant="titleMedium" style={styles.historyTitle}>History</Text>
        
        {history.map((item, index) => (
          <Surface key={item.id} style={styles.historyCard} elevation={1}>
            <View style={styles.historyHeader}>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                {new Date(item.cut_date).toLocaleDateString()}
              </Text>
              <Text variant="bodySmall" style={{ color: item.metal_type.includes('gold') ? '#FFD700' : '#C0C0C0', fontWeight: 'bold' }}>
                {item.metal_type.toUpperCase()}
              </Text>
            </View>
            <View style={styles.historyRow}>
              <Text>Weight: {Math.abs(item.weight_cut)}</Text>
              <Text>Rate: {item.rate}</Text>
            </View>
            <View style={styles.historyRow}>
              <Text>Total: {formatIndianNumber(Math.abs(item.total_amount))}</Text>
              <IconButton icon="delete" size={20} onPress={() => handleDelete(item)} />
            </View>
          </Surface>
        ))}
      </ScrollView>

      <CustomerSelectionModal
        visible={showCustomerModal}
        onDismiss={() => setShowCustomerModal(false)}
        onSelectCustomer={(customer) => {
          setSelectedCustomer(customer);
          setShowCustomerModal(false);
        }}
        onCreateCustomer={() => {}} // Disable creation in this context if desired, or implement
        allowCreateCustomer={false}
        filterFn={hasMetalBalance}
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
    paddingVertical: theme.spacing.xs,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
    flex: 1,
  },
  backButton: {
    marginRight: theme.spacing.sm,
  },
  content: {
    padding: 16,
  },
  card: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    marginBottom: 20,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
  historyTitle: {
    marginBottom: 10,
  },
  historyCard: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    marginBottom: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  modalContent: {
    flex: 1,
  },
});
