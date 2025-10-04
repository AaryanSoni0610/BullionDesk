import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
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
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { DatabaseService } from '../services/database';
import { useAppContext } from '../context/AppContext';

interface InventoryItem {
  id: string;
  name: string;
  weight: number;
  touch?: number; // For Rani items
  pureWeight: number;
}

export const RaniRupaSellScreen: React.FC = () => {
  const [selectedType, setSelectedType] = useState<'rani' | 'rupu'>('rani');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [extraWeight, setExtraWeight] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const { navigateToSettings, showAlert } = useAppContext();

  // Load inventory items based on selected type
  useEffect(() => {
    loadInventoryItems();
  }, [selectedType]);

  const loadInventoryItems = async () => {
    try {
      setIsLoading(true);
      const baseInventory = await DatabaseService.getBaseInventory();

      // For now, we'll create mock items based on inventory levels
      // In a real implementation, you'd have actual inventory tracking
      const items: InventoryItem[] = [];

      if (selectedType === 'rani' && baseInventory.rani > 0) {
        // Create sample Rani items
        items.push({
          id: 'rani_1',
          name: 'Rani Item 1',
          weight: 50,
          touch: 85,
          pureWeight: 42.5
        });
        items.push({
          id: 'rani_2',
          name: 'Rani Item 2',
          weight: 75,
          touch: 90,
          pureWeight: 67.5
        });
      } else if (selectedType === 'rupu' && baseInventory.rupu > 0) {
        // Create sample Rupu items
        items.push({
          id: 'rupu_1',
          name: 'Rupu Item 1',
          weight: 1000,
          pureWeight: 950
        });
        items.push({
          id: 'rupu_2',
          name: 'Rupu Item 2',
          weight: 1500,
          pureWeight: 1425
        });
      }

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
    return total + extra;
  };

  const handleSell = () => {
    const totalWeight = calculateTotalPureWeight();
    if (totalWeight === 0) {
      showAlert('No Items Selected', 'Please select items to sell or enter extra weight');
      return;
    }

    // TODO: Implement sell logic
    showAlert('Success', `Sold ${totalWeight.toFixed(2)}g of pure ${selectedType.toUpperCase()}`);
  };

  const renderInventoryItem = (item: InventoryItem) => (
    <List.Item
      key={item.id}
      title={item.name}
      description={`Weight: ${item.weight}g${item.touch ? `, Touch: ${item.touch}%` : ''}, Pure: ${item.pureWeight}g`}
      left={() => (
        <Checkbox
          status={selectedItems.has(item.id) ? 'checked' : 'unchecked'}
          onPress={() => toggleItemSelection(item.id)}
        />
      )}
      onPress={() => toggleItemSelection(item.id)}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <Surface style={styles.header}>
        <View style={styles.headerContent}>
          <IconButton
            icon="arrow-left"
            size={24}
            onPress={navigateToSettings}
          />
          <Text style={styles.headerTitle}>Rani/Rupa Bulk Sell</Text>
          <View style={styles.headerSpacer} />
        </View>
      </Surface>

      <ScrollView style={styles.content}>
        <Surface style={styles.section}>
          <Text style={styles.sectionTitle}>Select Type</Text>
          <SegmentedButtons
            value={selectedType}
            onValueChange={(value) => setSelectedType(value as 'rani' | 'rupu')}
            buttons={[
              { value: 'rani', label: 'Rani' },
              { value: 'rupu', label: 'Rupu' },
            ]}
            style={styles.segmentedButtons}
          />
        </Surface>

        <Surface style={styles.section}>
          <Text style={styles.sectionTitle}>Available {selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} Items</Text>
          {isLoading ? (
            <Text style={styles.loadingText}>Loading items...</Text>
          ) : inventoryItems.length === 0 ? (
            <Text style={styles.emptyText}>No {selectedType} items available</Text>
          ) : (
            inventoryItems.map(renderInventoryItem)
          )}
        </Surface>

        <Surface style={styles.section}>
          <Text style={styles.sectionTitle}>Extra Weight</Text>
          <TextInput
            label={`Extra ${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} Weight (g)`}
            value={extraWeight}
            onChangeText={setExtraWeight}
            keyboardType="numeric"
            style={styles.extraWeightInput}
          />
        </Surface>

        <Surface style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Selected Items:</Text>
            <Text style={styles.summaryValue}>{selectedItems.size}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Pure Weight:</Text>
            <Text style={styles.summaryValue}>{calculateTotalPureWeight().toFixed(2)}g</Text>
          </View>
          <Divider style={styles.divider} />
          <Button
            mode="contained"
            onPress={handleSell}
            style={styles.sellButton}
            disabled={calculateTotalPureWeight() === 0}
          >
            Sell {selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
          </Button>
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    elevation: 4,
    backgroundColor: theme.colors.primary,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.onPrimary,
    marginLeft: 16,
  },
  headerSpacer: {
    width: 48,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: theme.colors.primary,
  },
  segmentedButtons: {
    marginBottom: 8,
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
  extraWeightInput: {
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: theme.colors.onSurface,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  divider: {
    marginVertical: 16,
  },
  sellButton: {
    marginTop: 8,
  },
});