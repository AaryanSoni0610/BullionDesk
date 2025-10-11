import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  BackHandler,
  Platform,
} from 'react-native';
import {
  Surface,
  Text,
  IconButton,
  Button,
  SegmentedButtons,
  List,
  Checkbox,
  TextInput,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatPureGoldPrecise, customFormatPureSilver } from '../utils/formatting';
import { theme } from '../theme';
import { RaniRupaStockService } from '../services/raniRupaStockService';
import { DatabaseService } from '../services/database';
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
  const [extraWeight, setExtraWeight] = useState('');
  const [cutValue, setCutValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isWaitingForCustomerSelection, setIsWaitingForCustomerSelection] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedSaveDate, setSelectedSaveDate] = useState<Date>(new Date());
  const [showSaveDatePicker, setShowSaveDatePicker] = useState(false);
  const [showDateWarning, setShowDateWarning] = useState(false);
  const [pendingSaveDate, setPendingSaveDate] = useState<Date | null>(null);
  const [showDateWarningAlert, setShowDateWarningAlert] = useState(false);

  const { navigateToSettings, showAlert, setCustomerModalVisible, setAllowCustomerCreation, customerModalVisible, currentCustomer, setIsCustomerSelectionForRaniRupa, setCurrentCustomer, handleCreateCustomer } = useAppContext();

  // Format date for display in DD/MM/YYYY format
  const formatDateDisplay = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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
  useEffect(() => {
    loadInventoryItems();
  }, [selectedType]);

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

  const loadInventoryItems = async () => {
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
      setSelectedItems(new Set());
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
  };

  const calculateTotalPureWeight = () => {
    let total = 0;
    const cut = parseFloat(cutValue) || 0;

    selectedItems.forEach(itemId => {
      const item = inventoryItems.find(i => i.id === itemId);
      if (item) {
        if (selectedType === 'rani') {
          // Recalculate pure weight with cut applied
          const effectiveTouch = Math.max(0, (item.touch || 0) - cut);
          const pureWeight = (item.weight * effectiveTouch) / 100;
          total += formatPureGoldPrecise(pureWeight);
        } else {
          total += item.pureWeight;
        }
      }
    });

    const extra = parseFloat(extraWeight) || 0;
    return total + extra;
  };

  const handleSell = async () => {
    const totalWeight = calculateTotalPureWeight();
    if (totalWeight === 0) {
      showAlert('No Items Selected', 'Please select items to sell or enter extra weight');
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
      
      // Sell entries for each selected Rani/Rupa item (merchant sells Rani/Rupa to customer)
      selectedItems.forEach(itemId => {
        const item = inventoryItems.find(i => i.id === itemId);
        if (item) {
          entries.push({
            id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'sell',
            itemType: selectedType,
            weight: item.weight,
            touch: item.touch,
            cut: selectedType === 'rani' ? (parseFloat(cutValue) || 0) : undefined, // Save cut for rani items
            pureWeight: item.pureWeight,
            price: 0, // No price for bulk exchange
            subtotal: 0, // No money involved in this exchange
            stock_id: item.stock_id, // Reference to stock item being sold
            createdAt: new Date().toISOString(),
          });
        }
      });

      // Purchase entry for total pure weight (merchant purchases pure metal from customer)
      const totalPureWeight = calculateTotalPureWeight();
      const pureItemType = selectedType === 'rani' ? 'gold999' : 'silver';
      entries.push({
        id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'purchase',
        itemType: pureItemType,
        weight: totalPureWeight,
        price: 0, // No price for bulk exchange
        subtotal: 0, // No money involved in this exchange
        createdAt: new Date().toISOString(),
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
      const result = await DatabaseService.saveTransaction(
        customer,
        entries,
        0, // receivedAmount
        undefined, // existingTransactionId
        0, // discountExtraAmount
        saveDate
      );

      if (!result.success) {
        showAlert('Error', `Failed to create transaction: ${result.error}`);
        return;
      }

      // Transaction created successfully - stock was automatically removed by DatabaseService
      showAlert('Success', `Sold ${selectedItems.size} ${selectedType} item(s) to ${customer.name}. Transaction and stock updated.`);

      // Reset state
      setSelectedItems(new Set());
      setExtraWeight('');
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
    if (isNaN(newWeight) || newWeight <= 0) {
      showAlert('Invalid Weight', 'Please enter a valid weight greater than 0');
      return;
    }

    try {
      const oldWeight = editingItem.weight;
      const weightDiff = newWeight - oldWeight;

      // Show confirmation alert
      showAlert(
        'Confirm Weight Change',
        `Change weight from ${oldWeight.toFixed(selectedType === 'rani' ? 3 : 1)}g to ${newWeight.toFixed(selectedType === 'rani' ? 3 : 1)}g?\n\nThis will ${weightDiff > 0 ? 'increase' : 'decrease'} the total pure weight by ${Math.abs(weightDiff).toFixed(selectedType === 'rani' ? 3 : 1)}g.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              await RaniRupaStockService.updateStock(editingItem.id, { weight: newWeight });
              setShowEditDialog(false);
              setEditingItem(null);
              await loadInventoryItems();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error updating stock weight:', error);
      showAlert('Error', 'Failed to update stock weight');
    }
  };

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setShowEditDialog(true);
  };

  const renderInventoryItem = ({ item }: { item: InventoryItem }) => (
    <List.Item
      key={item.id}
      title={item.name}
      description={`Weight: ${selectedType === 'rani' ? item.weight.toFixed(3) : item.weight.toFixed(1)}g${item.touch ? `, Touch: ${item.touch.toFixed(2)}%` : ''}, Pure: ${selectedType === 'rani' ? item.pureWeight.toFixed(3) : item.pureWeight.toFixed(1)}g`}
      left={() => (
        <Checkbox
          status={selectedItems.has(item.id) ? 'checked' : 'unchecked'}
          onPress={() => toggleItemSelection(item.id)}
        />
      )}
      right={() => (
        <IconButton
          icon="pencil"
          size={18}
          onPress={() => handleEditItem(item)}
          style={{ margin: 0, marginRight: -2 }}
        />
      )}
      onPress={() => toggleItemSelection(item.id)}
      style={[styles.listItem]}
      titleStyle={[{ fontFamily: 'Roboto_500Medium' }]}
      descriptionStyle={[{ fontFamily: 'Roboto_400Regular' }]}
    />
  );

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
            Rani/Rupa Bulk Sell
          </Text>
        </View>
      </Surface>

      {/* Save Date Picker */}
      <View style={styles.dateSection}>
        <Text variant="titleSmall" style={styles.dateLabel}>
          Save on: {formatDateDisplay(selectedSaveDate)}
        </Text>
        <Button
          mode="contained"
          onPress={handleSelectSaveDatePress}
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

      {/* Segmented Buttons */}
      <View style={styles.segmentedContainer}>
        <SegmentedButtons
          value={selectedType}
          onValueChange={(value) => setSelectedType(value as 'rani' | 'rupu')}
          buttons={[
            { value: 'rani', label: 'Rani' },
            { value: 'rupu', label: 'Rupu' },
          ]}
          style={styles.segmentedButtons}
        />
      </View>

      {/* Items List */}
      <FlatList
        data={inventoryItems}
        renderItem={renderInventoryItem}
        keyExtractor={(item) => item.id}
        style={styles.itemsList}
        contentContainerStyle={inventoryItems.length === 0 ? styles.emptyList : styles.listContent}
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.loadingText}>Loading items...</Text>
          ) : (
            <Text style={styles.emptyText}>No {selectedType} items available</Text>
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom Navigation Card */}
      <View style={styles.bottomNavigation}>
        <View style={styles.navigationContent}>
          <View style={styles.summaryRow}>
            <Text style={styles.pureWeightLabel}>
              Pure Weight: {selectedType === 'rani' ? calculateTotalPureWeight().toFixed(3) : calculateTotalPureWeight().toFixed(1)}g
            </Text>
            <View style={styles.inputsRow}>
              {selectedType === 'rani' && (
                <TextInput
                  label="Cut"
                  value={cutValue}
                  onChangeText={(value) => {
                    // Allow only values between 0.00 and 1.00
                    const num = parseFloat(value);
                    if (value === '' || (num >= 0 && num <= 1.00)) {
                      setCutValue(value);
                    }
                  }}
                  keyboardType="decimal-pad"
                  style={styles.cutInput}
                  mode="outlined"
                  dense
                />
              )}
              <TextInput
                label="Extra (g)"
                value={extraWeight}
                onChangeText={setExtraWeight}
                keyboardType="numeric"
                style={styles.extraInput}
                mode="outlined"
                dense
              />
            </View>
          </View>
          <Button
            mode="contained"
            onPress={handleSell}
            style={styles.sellButton}
            disabled={calculateTotalPureWeight() === 0}
          >
            Sell {selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
          </Button>
        </View>
      </View>
      <InventoryInputDialog
        visible={showEditDialog}
        title={`Edit ${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} Weight`}
        message={`Current weight: ${editingItem?.weight.toFixed(selectedType === 'rani' ? 3 : 1)}g`}
        inputs={[
          {
            key: 'weight',
            label: 'Weight (g)',
            value: editingItem?.weight.toString() || '',
            placeholder: 'Enter weight in grams',
            keyboardType: 'numeric'
          }
        ]}
        onCancel={() => setShowEditDialog(false)}
        onSubmit={handleEditConfirm}
      />
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
  },
  backButton: {
    marginRight: theme.spacing.sm,
  },
  segmentedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: theme.colors.background,
  },
  segmentedButtons: {
    marginBottom: 8,
  },
  itemsList: {
    flex: 1,
    backgroundColor: theme.colors.background,
    marginLeft: 10,
  },
  listContent: {
    paddingBottom: 140, // Space for bottom navigation
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
    paddingBottom: 120, // Space for bottom navigation
  },
  listItem: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
  },
  loadingText: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_400Regular',
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_400Regular',
  },
  bottomNavigation: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
    elevation: 8,
  },
  navigationContent: {
    padding: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pureWeightLabel: {
    fontSize: 16,
    color: theme.colors.primary,
    fontFamily: 'Roboto_500Medium',
  },
  cutInput: {
    width: 80,
  },
  extraInput: {
    width: 80,
  },
  sellButton: {
    marginTop: 8,
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
    paddingHorizontal: 16,
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