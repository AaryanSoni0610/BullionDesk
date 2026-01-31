import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  BackHandler,
  Platform,
  TouchableOpacity,
  TextInput as RNTextInput,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatPureGoldPrecise, customFormatPureSilver } from '../utils/formatting';
import { theme } from '../theme';
import { TransactionService } from '../services/transaction.service';
import { RaniRupaStockService } from '../services/raniRupaStock.service';
import { useAppContext } from '../context/AppContext';
import { InventoryInputDialog } from '../components/InventoryInputDialog';
import CustomAlert from '../components/CustomAlert';
import { Customer, TransactionEntry } from '../types';

interface InventoryItem {
  id: string;
  name: string;
  weight: number;
  touch: number; // For Rani items
  pureWeight: number;
  stock_id: string; // Reference to stock item
}

export const RaniRupaSellScreen: React.FC = () => {
  const [selectedType, setSelectedType] = useState<'rani' | 'rupu'>('rani');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [cutValue, setCutValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isWaitingForCustomerSelection, setIsWaitingForCustomerSelection] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedSaveDate, setSelectedSaveDate] = useState<Date>(new Date());
  const [showSaveDatePicker, setShowSaveDatePicker] = useState(false);
  const [pendingSaveDate, setPendingSaveDate] = useState<Date | null>(null);
  const [showDateWarningAlert, setShowDateWarningAlert] = useState(false);

  const { navigateToSettings, showAlert, setCustomerModalVisible, customerModalVisible, currentCustomer, setIsCustomerSelectionForRaniRupa, setCurrentCustomer } = useAppContext();

  // Format date for display in DD/MM/YYYY format
  const formatDateDisplay = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${monthNames[date.getMonth()]} ${year}`;
  };

  // Handle Select Save Date button press
  const handleSelectSaveDatePress = () => {
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

  // Load inventory items based on selected type
  useFocusEffect(
    useCallback(() => {
      loadInventoryItems();
    }, [selectedType])
  );

  // Reset cut value when switching away from rani
  useEffect(() => {
    if (selectedType !== 'rani') {
      setCutValue('');
    }
  }, [selectedType]);

  // Handle customer selection completion
  useEffect(() => {
    if (!customerModalVisible && isWaitingForCustomerSelection) {
      setIsWaitingForCustomerSelection(false);
      setIsCustomerSelectionForRaniRupa(false); // Reset the flag
      if (currentCustomer) {
        // Customer was selected, show confirmation
        handleCustomerSelected(currentCustomer);
        // Clear currentCustomer after handling
        setCurrentCustomer(null);
      }
    }
  }, [customerModalVisible, isWaitingForCustomerSelection, currentCustomer, setCurrentCustomer]);

  const loadInventoryItems = async (preserveSelection = false) => {
    try {
      setIsLoading(true);
      const stockItems = await RaniRupaStockService.getStockByType(selectedType);

      // Convert stock items to inventory items format
      const items: InventoryItem[] = stockItems.map((stock, index) => ({
        id: stock.stock_id,
        name: `${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} ${index + 1}`,
        weight: stock.weight,
        touch: stock.touch,
        pureWeight: selectedType === 'rani' ? formatPureGoldPrecise((stock.weight * stock.touch) / 100) : customFormatPureSilver(stock.weight, stock.touch),
        stock_id: stock.stock_id,
      }));

      setInventoryItems(items);
      
      if (!preserveSelection) {
        setSelectedItems(new Set());
        setSelectAll(false);
      } else {
        // Filter out selected items that no longer exist
        const currentIds = new Set(items.map(i => i.id));
        const validSelected = new Set(
          Array.from(selectedItems).filter(id => currentIds.has(id))
        );
        setSelectedItems(validSelected);
        
        // Update selectAll state
        if (items.length > 0 && validSelected.size === items.length) {
          setSelectAll(true);
        } else {
          setSelectAll(false);
        }
      }
    } catch (error) {
      console.error('Error loading inventory items:', error);
      showAlert('Error', 'Failed to load inventory items');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle hardware back button - navigate to settings
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        navigateToSettings();
        return true; // Prevent default back behavior
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [navigateToSettings])
  );

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
    
    // Update selectAll state based on whether all items are selected
    if (inventoryItems.length > 0 && newSelected.size === inventoryItems.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  };

  const toggleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    
    if (newSelectAll) {
      const allIds = new Set(inventoryItems.map(item => item.id));
      setSelectedItems(allIds);
    } else {
      setSelectedItems(new Set());
    }
  };

  const calculateTotalPureWeight = () => {
    let total = 0;
    const cut = parseFloat(cutValue) || 0;

    selectedItems.forEach(itemId => {
      const item = inventoryItems.find(i => i.id === itemId);
      if (item) {
        const pureWeight = selectedType === 'rani'
          ? formatPureGoldPrecise((item.weight * (item.touch - cut)) / 100)
          : customFormatPureSilver(item.weight, item.touch);
        
        total += pureWeight;
      }
    });

    return total;
  };

  const handleSell = async () => {
    const totalWeight = calculateTotalPureWeight();
    if (totalWeight === 0) {
      showAlert('No Items Selected', 'Please select items to sell');
      return;
    }

    // Show customer selection modal
    setIsCustomerSelectionForRaniRupa(true);
    setIsWaitingForCustomerSelection(true);
    setCustomerModalVisible(true);
  };

  const handleCustomerSelected = (customer: Customer) => {
    const itemCount = selectedItems.size;
    const totalWeight = calculateTotalPureWeight();
    
    // Show confirmation alert
    showAlert(
      'Confirm Sale',
      `Are you sure you want to sell ${itemCount} ${selectedType} item(s) to '${customer.name}'?\n\nTotal Pure Weight: ${selectedType === 'rani' ? totalWeight.toFixed(3) : totalWeight.toFixed(1)}g`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => executeSale(customer) }
      ]
    );
    
    // Clear currentCustomer after handling
    setSelectedCustomer(customer);
  };

  const executeSale = async (customer: Customer) => {
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

      // Create transaction entries
      const entries: TransactionEntry[] = [];
      const cut = parseFloat(cutValue) || 0;
      const hasCut = cut > 0;
      const itemType = selectedType === 'rani' ? (hasCut ? 'gold999' : 'gold995') : 'silver';
      
      // Create purchase entries for each selected item (metal-only)
      selectedItems.forEach(itemId => {
        const item = inventoryItems.find(i => i.id === itemId);
        if (item) {
          const pureWeight = selectedType === 'rani'
            ? (item.weight * (item.touch - cut)) / 100
            : (item.weight * item.touch) / 100;
          entries.push({
            id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'sell',
            itemType: selectedType,
            weight: item.weight,
            touch: item.touch,
            cut: selectedType === 'rani' ? cut : 0,
            pureWeight,
            price: 0,
            subtotal: 0,
            metalOnly: true,
            stock_id: item.stock_id,
            createdAt: new Date().toISOString(),
          });
        }
      });

      const allStock = await RaniRupaStockService.getAllStock();
      
      const missingItems: string[] = [];
      for (const itemId of selectedItems) {
        const item = inventoryItems.find(i => i.id === itemId);
        if (item) {
          const existingStock = await RaniRupaStockService.getStockById(item.stock_id);
          if (!existingStock) {
            missingItems.push(item.name);
          }
        }
      }

      if (missingItems.length > 0) {
        showAlert('Error', `Cannot complete sale. The following stock items are no longer available: ${missingItems.join(', ')}. Please refresh the inventory and try again.`);
        return;
      }

      // Save transaction
      const result = await TransactionService.saveTransaction(
        customer,
        entries,
        [], // payments
        undefined, // existingTransactionId
        saveDate
      );

      if (!result.success) {
        showAlert('Error', `Failed to create transaction: ${result.error}`);
        return;
      }

      // Transaction created successfully - stock was automatically removed by DatabaseService
      showAlert('Success', `Sold ${selectedItems.size} ${selectedType} item(s) to ${customer.name}. Transaction and stock updated.`, undefined, 'check-circle');

      // Reset state
      setSelectedItems(new Set());
      setCutValue('');
      await loadInventoryItems();
      
    } catch (error) {
      console.error('Error during sale execution:', error);
      showAlert('Error', 'Failed to complete the sale');
    }
  };

  const handleEditConfirm = async (values: Record<string, any>) => {
    if (!editingItem) return;

    const newWeight = parseFloat(values.weight);
    const newTouch = parseFloat(values.touch);

    if (isNaN(newWeight) || newWeight <= 0) {
      showAlert('Invalid Weight', 'Please enter a valid weight greater than 0');
      return;
    }

    if (isNaN(newTouch) || newTouch < 0 || newTouch > 100) {
      showAlert('Invalid Touch', 'Please enter a valid touch percentage between 0 and 100');
      return;
    }

    try {
      const oldWeight = editingItem.weight;
      const oldTouch = editingItem.touch;
      const weightChanged = newWeight !== oldWeight;
      const touchChanged = newTouch !== oldTouch;

      if (!weightChanged && !touchChanged) {
        showAlert('No Changes', 'No changes were made to the stock item');
        return;
      }

      // Build confirmation message
      let message = 'Confirm changes:\n\n';
      if (weightChanged) {
        const weightDiff = newWeight - oldWeight;
        message += `Weight: ${oldWeight.toFixed(selectedType === 'rani' ? 3 : 1)}g → ${newWeight.toFixed(selectedType === 'rani' ? 3 : 1)}g\n`;
        message += `(${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(selectedType === 'rani' ? 3 : 1)}g)\n\n`;
      }
      if (touchChanged) {
        message += `Touch: ${oldTouch.toFixed(2)}% → ${newTouch.toFixed(2)}%\n`;
        message += `(${newTouch > oldTouch ? '+' : ''}${(newTouch - oldTouch).toFixed(2)}%)\n\n`;
      }

      // Calculate new pure weight for display
      const newPureWeight = selectedType === 'rani'
        ? formatPureGoldPrecise((newWeight * newTouch) / 100)
        : customFormatPureSilver(newWeight, newTouch);
      const oldPureWeight = selectedType === 'rani'
        ? formatPureGoldPrecise((oldWeight * oldTouch) / 100)
        : customFormatPureSilver(oldWeight, oldTouch);

      message += `Pure Weight: ${oldPureWeight.toFixed(selectedType === 'rani' ? 3 : 1)}g → ${newPureWeight.toFixed(selectedType === 'rani' ? 3 : 1)}g`;

      // Show confirmation alert
      showAlert(
        'Confirm Stock Changes',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              await RaniRupaStockService.updateStock(editingItem.id, {
                weight: weightChanged ? newWeight : undefined,
                touch: touchChanged ? newTouch : undefined
              });
              setShowEditDialog(false);
              setEditingItem(null);
              await loadInventoryItems(true);
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error updating stock:', error);
      showAlert('Error', 'Failed to update stock');
    }
  };

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setShowEditDialog(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={navigateToSettings}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#1B1B1F" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Rani/Rupa Bulk Sell</Text>
        </View>
      </View>

      {/* Date Button */}
      <View style={styles.dateContainer}>
        <TouchableOpacity style={styles.dateBtnProminent} onPress={handleSelectSaveDatePress}>
            <MaterialCommunityIcons name="calendar-month" size={20} color="#005AC1" />
            <Text style={styles.dateText}>Save on: {formatDateDisplay(selectedSaveDate)}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color="#44474F" />
        </TouchableOpacity>
      </View>

      {/* Date Picker Modal */}
      {showSaveDatePicker && (
        <DateTimePicker
          value={selectedSaveDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleSaveDateChange}
          maximumDate={new Date()}
        />
      )}

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabs}>
            <TouchableOpacity 
                style={[styles.tab, selectedType === 'rani' && styles.tabActive]} 
                onPress={() => setSelectedType('rani')}
            >
                <Text style={[styles.tabText, selectedType === 'rani' && styles.tabTextActive]}>Rani</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                style={[styles.tab, selectedType === 'rupu' && styles.tabActive]} 
                onPress={() => setSelectedType('rupu')}
            >
                <Text style={[styles.tabText, selectedType === 'rupu' && styles.tabTextActive]}>Rupu</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* Select All */}
      {inventoryItems.length > 0 && (
        <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll} activeOpacity={0.7}>
            <View style={[styles.checkboxCustom, selectAll && styles.checkboxSelected]}>
                {selectAll && <MaterialCommunityIcons name="check" size={14} color="white" />}
            </View>
            <Text style={styles.selectLabel}>Select All Items{selectedItems.size > 0 ? ` (Selected ${selectedItems.size})` : ''}</Text>
        </TouchableOpacity>
      )}

      {/* List */}
      <FlatList
        data={inventoryItems}
        renderItem={({ item }) => {
            const isSelected = selectedItems.has(item.id);
            return (
                <TouchableOpacity 
                    style={[styles.itemCard, isSelected && styles.itemCardSelected]} 
                    onPress={() => toggleItemSelection(item.id)}
                    activeOpacity={0.9}
                >
                    <View style={[styles.itemCheckbox, isSelected && styles.itemCheckboxSelected]}>
                        {isSelected && <MaterialCommunityIcons name="check" size={16} color="white" />}
                    </View>
                    <View style={styles.itemContent}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemMeta}>
                            Weight: <Text style={styles.itemMetaValue}>{selectedType === 'rani' ? item.weight.toFixed(3) : item.weight.toFixed(1)}g</Text>
                            {item.touch ? <Text> • Touch: <Text style={styles.itemMetaValue}>{item.touch.toFixed(2)}%</Text></Text> : ''}
                            {' '} • Pure: <Text style={styles.itemMetaValue}>{selectedType === 'rani' ? item.pureWeight.toFixed(3) : item.pureWeight.toFixed(1)}g</Text>
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.editBtn} onPress={() => handleEditItem(item)}>
                      <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.primary} />
                    </TouchableOpacity>
                </TouchableOpacity>
            );
        }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
            isLoading ? (
              <Text style={styles.loadingText}>Loading items...</Text>
            ) : (
              <Text style={styles.emptyText}>No {selectedType} items available</Text>
            )
        }
      />

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetContent}>
          <View style={styles.sheetSummary}>
              <Text style={styles.totalLabel}>{selectedType === 'rani' ? ((parseFloat(cutValue) || 0) > 0 ? 'Gold 999: ' : 'Gold 995: ') : 'Silver: '}</Text>
              <Text style={styles.totalValue}>
                  {selectedType === 'rani' ? calculateTotalPureWeight().toFixed(3) : calculateTotalPureWeight().toFixed(0)}g
              </Text>
          </View>

          <View style={styles.inputRow}>
              {selectedType === 'rani' && (
                  <RNTextInput
                      placeholder="Cut (e.g. 0.2)"
                      value={cutValue}
                      onChangeText={(value) => {
                          const num = parseFloat(value);
                          if (value === '' || (num >= 0 && num <= 1.00)) {
                              setCutValue(value);
                          }
                      }}
                      keyboardType="decimal-pad"
                      style={styles.sheetInput}
                      placeholderTextColor="#44474F"
                  />
              )}
          </View>
        </View>

        <TouchableOpacity 
            style={[styles.sellBtn, calculateTotalPureWeight() === 0 && styles.sellBtnDisabled]} 
            onPress={handleSell}
            disabled={calculateTotalPureWeight() === 0}
        >
            <Text style={styles.sellBtnText}>Sell {selectedType === 'rani' ? 'Rani' : 'Rupu'}</Text>
        </TouchableOpacity>
      </View>

      <InventoryInputDialog
        key={editingItem?.id}
        visible={showEditDialog}
        title={`Edit ${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} Stock`}
        message={`Current: ${editingItem?.weight.toFixed(selectedType === 'rani' ? 3 : 1)}g @ ${editingItem?.touch.toFixed(2)}%`}
        inputs={[
          {
            key: 'weight',
            label: 'Weight (g)',
            value: editingItem?.weight.toString() || '',
            placeholder: 'Enter weight in grams',
            keyboardType: 'numeric'
          },
          {
            key: 'touch',
            label: 'Touch (%)',
            value: editingItem?.touch.toString() || '',
            placeholder: 'Enter touch percentage (0-100)',
            keyboardType: 'numeric'
          }
        ]}
        onCancel={() => setShowEditDialog(false)}
        onSubmit={handleEditConfirm}
      />
      
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
  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FDFBFF',
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
    backgroundColor: '#F0F2F5', // --surface-container
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#1B1B1F',
    letterSpacing: -1,
  },
  // Date
  dateContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
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
  // Tabs
  tabsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FDFBFF',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F0F2F5', // --surface-container
    padding: 4,
    borderRadius: 100,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 100,
  },
  tabActive: {
    backgroundColor: '#FFFFFF', // --surface
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'Outfit_600SemiBold',
    color: '#44474F', // --on-surface-variant
  },
  tabTextActive: {
    color: '#005AC1', // --primary
  },
  // Select All
  selectAllRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkboxCustom: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#44474F',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#005AC1',
    borderColor: '#005AC1',
  },
  selectLabel: {
    fontSize: 14,
    fontFamily: 'Outfit_500Medium',
    color: '#44474F',
  },
  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 200, // Space for bottom sheet
    gap: 8,
  },
  itemCard: {
    backgroundColor: '#FFFFFF', // --surface
    borderWidth: 1,
    borderColor: '#E0E2E5', // --outline
    borderRadius: 12, // --radius-m
    padding: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  itemCardSelected: {
    backgroundColor: '#E3F2FD', // --highlight
    borderColor: '#005AC1', // --primary
  },
  itemCheckbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#44474F',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCheckboxSelected: {
    backgroundColor: '#005AC1',
    borderColor: '#005AC1',
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
    color: '#44474F',
    lineHeight: 18,
  },
  itemMetaValue: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#1B1B1F',
  },
  editBtn: {
    padding: 8,
  },
  // Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF', // --surface
    borderTopLeftRadius: 24, // --radius-l
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 16,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  sheetSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetContent:{
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
    color: '#44474F',
  },
  totalValue: {
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
    color: '#005AC1',
  },
  inputRow: {
    gap: 12,
  },
  sheetInput: {
    flex: 1,
    width: 125,
    backgroundColor: '#F0F2F5', // --surface-container
    borderRadius: 12, // --radius-m
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    color: '#1B1B1F',
  },
  sellBtn: {
    backgroundColor: '#1B1B1F', // --on-surface
    paddingVertical: 16,
    borderRadius: 100,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  sellBtnDisabled: {
    opacity: 0.5,
  },
  sellBtnText: {
    color: '#FFFFFF', // --on-primary
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 20,
    fontFamily: 'Outfit_400Regular',
    color: '#44474F',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontFamily: 'Outfit_400Regular',
    color: '#44474F',
  },
});