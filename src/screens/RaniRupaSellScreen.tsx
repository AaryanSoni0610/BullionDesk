import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  BackHandler,
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
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { formatPureGoldPrecise, formatPureSilver, formatPureGold } from '../utils/formatting';
import { theme } from '../theme';
import { RaniRupaStockService } from '../services/raniRupaStockService';
import { useAppContext } from '../context/AppContext';
import { Customer, TransactionEntry } from '../types';
import { DatabaseService } from '../services/database';

interface InventoryItem {
  id: string;
  name: string;
  weight: number;
  touch?: number; // For Rani items
  pureWeight: number;
  stock_id: string; // Reference to stock item
}

export const RaniRupaSellScreen: React.FC = () => {
  const [selectedType, setSelectedType] = useState<'rani' | 'rupu'>('rani');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [extraWeight, setExtraWeight] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isWaitingForCustomerSelection, setIsWaitingForCustomerSelection] = useState(false);

  const { navigateToSettings, showAlert, setCustomerModalVisible, setAllowCustomerCreation, customerModalVisible, currentCustomer, setIsCustomerSelectionForRaniRupa, setCurrentCustomer } = useAppContext();

  // Load inventory items based on selected type
  useEffect(() => {
    loadInventoryItems();
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
        pureWeight: selectedType === 'rani' ? formatPureGoldPrecise((stock.weight * stock.touch) / 100) : formatPureSilver((stock.weight * stock.touch) / 100),
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
    selectedItems.forEach(itemId => {
      const item = inventoryItems.find(i => i.id === itemId);
      if (item) {
        total += item.pureWeight;
      }
    });

    const extra = parseFloat(extraWeight) || 0;
    return formatPureGold(total) + extra;
  };

  const handleSell = async () => {
    const totalWeight = calculateTotalPureWeight();
    if (totalWeight === 0) {
      showAlert('No Items Selected', 'Please select items to sell or enter extra weight');
      return;
    }

    // Show customer selection modal without allowing customer creation
    setAllowCustomerCreation(false);
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
            pureWeight: item.pureWeight,
            price: 0, // No price for bulk exchange
            subtotal: 0, // No money involved in this exchange
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

      // Save transaction
      const result = await DatabaseService.saveTransaction(
        customer,
        entries,
        0, // receivedAmount
        undefined, // existingTransactionId
        0 // discountExtraAmount
      );

      if (!result.success) {
        showAlert('Error', `Failed to create transaction: ${result.error}`);
        return;
      }

      // Remove selected stock items
      for (const itemId of selectedItems) {
        const item = inventoryItems.find(i => i.id === itemId);
        if (item) {
          const stockResult = await RaniRupaStockService.removeStock(item.stock_id);
          if (!stockResult.success) {
            showAlert('Warning', `Transaction created but failed to remove stock item: ${stockResult.error}`);
            // Continue with other items
          }
        }
      }

      showAlert('Success', `Sold ${selectedItems.size} ${selectedType} item(s) to ${customer.name}. Transaction and stock updated.`);

      // Reset state
      setSelectedItems(new Set());
      setExtraWeight('');
      await loadInventoryItems();
      
    } catch (error) {
      console.error('Error during sale execution:', error);
      showAlert('Error', 'Failed to complete the sale');
    }
  };

  const renderInventoryItem = ({ item }: { item: InventoryItem }) => (
    <List.Item
      key={item.id}
      title={item.name}
      description={`Weight: ${item.weight}g${item.touch ? `, Touch: ${item.touch}%` : ''}, Pure: ${selectedType === 'rani' ? item.pureWeight.toFixed(3) : item.pureWeight.toFixed(1)}g`}
      left={() => (
        <Checkbox
          status={selectedItems.has(item.id) ? 'checked' : 'unchecked'}
          onPress={() => toggleItemSelection(item.id)}
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
    marginLeft: 8,
  },
  listContent: {
    paddingBottom: 120, // Space for bottom navigation
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
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
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
  pureWeightLabel: {
    fontSize: 16,
    color: theme.colors.primary,
    fontFamily: 'Roboto_500Medium',
  },
  extraInput: {
    width: 120,
  },
  sellButton: {
    marginTop: 8,
  },
});