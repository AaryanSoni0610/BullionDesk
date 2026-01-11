import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, BackHandler, TouchableOpacity, TextInput as RNTextInput, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RateCutService, RateCutRecord } from '../services/rateCut.service';
import { Customer } from '../types';
import { formatIndianNumber } from '../utils/formatting';
import { CustomerSelectionModal } from '../components/CustomerSelectionModal';
import { useAppContext } from '../context/AppContext';
import CustomAlert from '../components/CustomAlert';

const hasMetalBalance = (customer: Customer) => {
  return (Math.abs(customer.metalBalances?.gold999 || 0) > 0.01) || 
         (Math.abs(customer.metalBalances?.gold995 || 0) > 0.01) || 
         (Math.abs(customer.metalBalances?.silver || 0) > 0.01);
};

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
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showDeleteConfirmAlert, setShowDeleteConfirmAlert] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RateCutRecord | null>(null);

  // Pagination State
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const PAGE_SIZE = 20;

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
    loadHistory(true);
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
      const isCurrentValid = availableMetals.some((m: { value: 'gold999' | 'gold995' | 'silver', label: string }) => m.value === metalType);
      if (!isCurrentValid) {
        setMetalType(availableMetals[0].value);
      }
    }
  }, [availableMetals, metalType]);

  const loadHistory = async (reset = false) => {
    if (isFetchingHistory) return;
    if (!reset && !hasMore) return;

    setIsFetchingHistory(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const limit = PAGE_SIZE;

      let data: RateCutRecord[];
      if (selectedCustomer) {
        // Load history for specific customer
        data = await RateCutService.getRateCutHistory(selectedCustomer.id, limit, currentOffset);
      } else {
        // Load all history
        data = await RateCutService.getAllRateCutHistory(limit, currentOffset);
      }
      
      setHasMore(data.length >= limit);

      if (reset) {
        setHistory(data);
        setOffset(limit);
      } else {
        setHistory(prev => [...prev, ...data]);
        setOffset(prev => prev + limit);
      }
    } catch (error) {
      console.error('Error loading rate cut history:', error);
      if (reset) setHistory([]);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleApply = async () => {
    if (!selectedCustomer || !weight || !rate) return;

    const weightVal = parseFloat(weight);
    const rateVal = parseFloat(rate);
    
    if (isNaN(weightVal) || isNaN(rateVal) || weightVal <= 0 || rateVal <= 0) {
      setErrorMessage('Please enter valid positive numbers for weight and rate');
      setShowErrorAlert(true);
      return;
    }

    const currentBalance = selectedCustomer.metalBalances?.[metalType] || 0;

    // Validation: Weight Cut <= Metal Balance (Absolute)
    if (weightVal > Math.abs(currentBalance)) {
      setErrorMessage(`Weight cut (${weightVal}) cannot exceed current balance (${Math.abs(currentBalance).toFixed(3)})`);
      setShowErrorAlert(true);
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
      loadHistory(true);
      setShowSuccessAlert(true);
    } else {
      setErrorMessage('Failed to apply rate cut');
      setShowErrorAlert(true);
    }
    setLoading(false);
  };

  const handleDelete = async (cut: RateCutRecord) => {
    setDeleteTarget(cut);
    setShowDeleteConfirmAlert(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    
    setShowDeleteConfirmAlert(false);
    setLoading(true);
    // @ts-ignore - metal_type is compatible but TS might complain due to strict union check if not updated everywhere
    const success = await RateCutService.deleteLatestRateCut(deleteTarget.id, deleteTarget.customer_id, deleteTarget.metal_type);
    if (success) {
      loadHistory(true);
    } else {
      setErrorMessage('Failed to delete rate cut');
      setShowErrorAlert(true);
    }
    setLoading(false);
    setDeleteTarget(null);
  };

  const renderHistoryItem = ({ item }: { item: RateCutRecord }) => {
    const isGold = item.metal_type.includes('gold');
    const badgeStyle = isGold ? styles.badgeGold : styles.badgeSilver;
    const badgeTextStyle = isGold ? styles.badgeTextGold : styles.badgeTextSilver;
    const metalLabel = item.metal_type === 'gold999' ? 'Gold 999' : 
                       item.metal_type === 'gold995' ? 'Gold 995' : 'Silver';

    const cutDate = new Date(item.cut_date);
    const formattedDate = `${cutDate.getDate().toString().padStart(2, '0')}/${(cutDate.getMonth() + 1).toString().padStart(2, '0')}/${cutDate.getFullYear()}`;

    return (
      <View style={styles.historyCard}>
        <View style={styles.cardTop}>
          <Text style={styles.hDate}>{formattedDate}</Text>
          <View style={styles.cardTopRight}>
            <View style={[styles.hBadge, badgeStyle]}>
              <Text style={[styles.hBadgeText, badgeTextStyle]}>{metalLabel}</Text>
            </View>
            <TouchableOpacity 
              style={styles.deleteIcon}
              onPress={() => handleDelete(item)}
            >
              <MaterialCommunityIcons name="delete" size={18} color="#BA1A1A" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.cardDetails}>
          <View>
            <Text style={styles.calcRow}>
              Weight: <Text style={styles.calcVal}>{Math.abs(item.weight_cut).toFixed(3)}g</Text>
            </Text>
            <Text style={styles.calcRow}>
              Rate: <Text style={styles.calcVal}>₹{formatIndianNumber(item.rate)}</Text>
            </Text>
          </View>
          <Text style={styles.hTotal}>₹{formatIndianNumber(Math.abs(item.total_amount))}</Text>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.formContainer}>
        {/* Customer Select */}
        <View style={styles.customerSelectContainer}>
          <TouchableOpacity 
            style={styles.customerSelect}
            onPress={() => setShowCustomerModal(true)}
          >
            <Text style={styles.customerSelectText}>
              {selectedCustomer ? selectedCustomer.name : 'Select Customer (All History)'}
            </Text>
            <MaterialCommunityIcons name="menu-down" size={24} color="#44474F" />
          </TouchableOpacity>
          {selectedCustomer && (
            <TouchableOpacity 
              style={styles.clearCustomerBtn}
              onPress={() => setSelectedCustomer(null)}
            >
              <MaterialCommunityIcons name="close" size={20} color="#44474F" />
            </TouchableOpacity>
          )}
        </View>

        {/* Metal Segment */}
        {selectedCustomer && availableMetals.length > 0 ? (
          <View style={styles.metalSegment}>
            {availableMetals.map((metal: { value: 'gold999' | 'gold995' | 'silver', label: string }) => (
              <TouchableOpacity
                key={metal.value}
                style={[
                  styles.segmentOpt,
                  metalType === metal.value && styles.segmentOptActive
                ]}
                onPress={() => setMetalType(metal.value as any)}
              >
                <Text style={[
                  styles.segmentText,
                  metalType === metal.value && styles.segmentTextActive
                ]}>
                  {metal.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.noMetalText}>
            {selectedCustomer ? 'No metal balance available for rate cut' : 'Select a customer to see options'}
          </Text>
        )}

        {/* Inputs Row */}
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Weight Cut (g)</Text>
            <RNTextInput
              style={styles.textInput}
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
              editable={!!selectedCustomer && availableMetals.length > 0}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Rate</Text>
            <RNTextInput
              style={styles.textInput}
              value={rate}
              onChangeText={setRate}
              keyboardType="numeric"
              editable={!!selectedCustomer && availableMetals.length > 0}
            />
          </View>
        </View>

        {/* Date and Submit Buttons Row */}
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.dateBtn, { flex: 0.3 }]}
            onPress={() => setShowDatePicker(true)}
            disabled={!selectedCustomer || availableMetals.length === 0}
          >
            <Text style={styles.dateBtnText}>{`${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.submitBtn,
              { flex: 0.7 },
              (!selectedCustomer || !weight || !rate || availableMetals.length === 0) && styles.submitBtnDisabled
            ]}
            onPress={handleApply}
            disabled={loading || !selectedCustomer || !weight || !rate || availableMetals.length === 0}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Apply Rate Cut</Text>
            )}
          </TouchableOpacity>
        </View>

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
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={navigateToSettings}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#1B1B1F" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Rate Cut</Text>
        </View>
      </View>

      <View style={styles.content}>
        {renderHeader()}
        <Text style={styles.sectionTitle}>
          {selectedCustomer ? `Rate Cut History - ${selectedCustomer.name}` : 'All Rate Cut History'}
        </Text>
        <FlatList
          data={history}
          renderItem={renderHistoryItem}
          keyExtractor={item => item.id}
          onEndReached={() => loadHistory(false)}
          onEndReachedThreshold={0.5}
          style={styles.historyList}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListFooterComponent={
            isFetchingHistory ? <ActivityIndicator style={{ paddingVertical: 20 }} color="#005AC1" /> : null
          }
          ListEmptyComponent={
            !isFetchingHistory ? (
            <Text style={styles.emptyHistoryText}>
              {selectedCustomer ? `No rate cut history found for ${selectedCustomer.name}` : 'No rate cut history found'}
            </Text>
            ) : null
          }
        />
      </View>
      
      <CustomerSelectionModal
        visible={showCustomerModal}
        onDismiss={() => setShowCustomerModal(false)}
        onSelectCustomer={(customer) => {
          setSelectedCustomer(customer);
          setShowCustomerModal(false);
        }}
        onCreateCustomer={() => {}}
        allowCreateCustomer={false}
        filterFn={hasMetalBalance}
      />

      {/* Error Alert */}
      <CustomAlert
        visible={showErrorAlert}
        title="Error"
        message={errorMessage}
        icon="alert-circle-outline"
        buttons={[{ text: 'OK', onPress: () => setShowErrorAlert(false) }]}
        onDismiss={() => setShowErrorAlert(false)}
      />

      {/* Success Alert */}
      <CustomAlert
        visible={showSuccessAlert}
        title="Success"
        message="Rate cut applied successfully"
        icon="check-circle-outline"
        buttons={[{ text: 'OK', onPress: () => setShowSuccessAlert(false) }]}
        onDismiss={() => setShowSuccessAlert(false)}
      />

      {/* Delete Confirmation Alert */}
      <CustomAlert
        visible={showDeleteConfirmAlert}
        title="Confirm Delete"
        message="Are you sure you want to delete this rate cut?"
        icon="delete-outline"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setShowDeleteConfirmAlert(false) },
          { text: 'Delete', style: 'destructive', onPress: handleConfirmDelete }
        ]}
        onDismiss={() => setShowDeleteConfirmAlert(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // --background
  },
  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3E7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#1B1B1F', // --on-surface
    letterSpacing: -1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  // History Container
  historyContainer: {
    maxHeight: 800,
  },
  // Form Card
  formContainer: {
    marginBottom: 24,
    backgroundColor: '#FFFFFF', // --surface
    padding: 20,
    borderRadius: 24, // --radius-l
    // box-shadow approximation
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E2E5', // --outline
    gap: 16,
  },
  // Customer Select
  customerSelectContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerSelect: {
    backgroundColor: '#F0F2F5', // --surface-container
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 32, // --radius-m
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
  },
  customerSelectText: {
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
    color: '#1B1B1F',
  },
  clearCustomerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F2F5', // --surface-container
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Metal Segment
  metalSegment: {
    flexDirection: 'row',
    backgroundColor: '#F0F2F5', // --surface-container
    padding: 4,
    borderRadius: 100, // --radius-pill
  },
  segmentOpt: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 100,
  },
  segmentOptActive: {
    backgroundColor: '#005AC1', // --primary
    // box-shadow approximation
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: 'Outfit_600SemiBold',
    color: '#44474F', // --on-surface-variant
  },
  segmentTextActive: {
    color: '#FFFFFF', // --on-primary
  },
  noMetalText: {
    textAlign: 'center',
    color: '#44474F',
    padding: 10,
    fontFamily: 'Outfit_400Regular',
  },
  // Inputs Row
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: '#44474F', // --on-surface-variant
    marginLeft: 4,
  },
  textInput: {
    backgroundColor: '#F0F2F5', // --surface-container
    borderRadius: 32, // --radius-m
    paddingVertical: 12, // Adjusted for RN TextInput vertical alignment
    paddingHorizontal: 20,
    fontSize: 16,
    fontFamily: 'Outfit_400Regular',
    color: '#1B1B1F', // --on-surface
  },
  // Date Button
  dateBtn: {
    backgroundColor: '#F0F2F5', // --surface-container
    padding: 14,
    borderRadius: 32, // --radius-m
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#005AC1', // --primary
    borderStyle: 'dashed', // Note: dashed border style support varies in RN, works on iOS/Android usually
  },
  dateBtnText: {
    fontSize: 14,
    fontFamily: 'Outfit_500Medium',
    color: '#005AC1', // --primary
  },
  // Submit Button
  submitBtn: {
    backgroundColor: '#1B1B1F', // --on-surface
    padding: 16,
    borderRadius: 100,
    alignItems: 'center',
    marginTop: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFFFFF', // --on-primary
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
  },
  // Button Row
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // History
  sectionTitle: {
    paddingBottom: 12,
    fontSize: 14,
    fontFamily: 'Outfit_600SemiBold',
    color: '#44474F', // --on-surface-variant
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  historyList: {
    maxHeight: 800,
  },
  historyCard: {
    backgroundColor: '#FFFFFF', // --surface
    borderRadius: 16, // --radius-m
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E2E5', // --outline
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hDate: {
    fontSize: 13,
    fontFamily: 'Outfit_500Medium',
    color: '#44474F', // --on-surface-variant
  },
  hBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    borderWidth: 1,
  },
  hBadgeText: {
    fontSize: 10,
    fontFamily: 'Outfit_700Bold',
    textTransform: 'uppercase',
  },
  badgeGold: {
    backgroundColor: '#FFF8E1', // --gold-light
    borderColor: 'rgba(255, 193, 7, 0.2)',
  },
  badgeTextGold: {
    color: '#6F4C00', // --gold-text
  },
  badgeSilver: {
    backgroundColor: '#ECEFF1', // --silver-light
    borderColor: 'rgba(120, 144, 156, 0.2)',
  },
  badgeTextSilver: {
    color: '#263238', // --silver-text
  },
  cardDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  calcRow: {
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    color: '#44474F', // --on-surface-variant
    marginBottom: 4,
  },
  calcVal: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F', // --on-surface
  },
  hTotal: {
    fontSize: 18,
    fontFamily: 'Outfit_700Bold',
    color: '#1B1B1F', // --on-surface
  },
  deleteIcon: {
    backgroundColor: '#FFDAD6',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHistoryText: {
    textAlign: 'center',
    color: '#44474F',
    marginTop: 20,
    fontFamily: 'Outfit_400Regular',
  },
});
