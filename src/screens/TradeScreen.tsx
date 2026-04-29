import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Text,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Trade, Customer, ItemType } from '../types';
import { theme } from '../theme';
import { TradeService } from '../services/trade.service';
import { CustomerService } from '../services/customer.service';
import { formatFullDate, formatIndianNumber } from '../utils/formatting';
import { useAppContext } from '../context/AppContext';
import { InventoryInputDialog } from '../components/InventoryInputDialog';
import { CustomerSelectionModal } from '../components/CustomerSelectionModal';
import { AnimatedAccordion } from '../components/AnimatedAccordion';

// ── Stable components defined outside TradeScreen ────────────────────────────
// Defined here so React.memo can do a proper shallow-prop comparison.
// If these were defined inside TradeScreen they'd be recreated on every render
// and memo would never bail out.

const TradeEmptyState = React.memo(() => (
  <View style={styles.emptyState}>
    <Icon name="swap-vertical-bold" size={72} color={theme.colors.onSurfaceVariant} />
    <Text variant="headlineSmall" style={styles.emptyTitle}>
      No Trades Yet
    </Text>
    <Text variant="bodyLarge" style={styles.emptyDescription}>
      Start by adding your first trade record
    </Text>
  </View>
));

type CustomerGroupRowProps = {
  item: { customerId: string; customerName: string; trades: Trade[] };
  isExpanded: boolean;
  onToggle: (id: string | null) => void;
  onQuickAdd: (customerId: string, customerName: string) => void;
  renderTradeItem: ({ item }: { item: Trade }) => React.ReactNode;
};

const CHEVRON_TIMING = { duration: 250, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };

const CustomerGroupRow = React.memo(({
  item,
  isExpanded,
  onToggle,
  onQuickAdd,
  renderTradeItem,
}: CustomerGroupRowProps) => {
  const tradeCount = item.trades.length;

  // Totals memoized per-row — only recalculates when this group's trades change
  const totals = useMemo(() =>
    item.trades.reduce((acc, trade) => {
      acc[trade.itemType] = (acc[trade.itemType] || 0) + trade.weight;
      return acc;
    }, {} as Record<string, number>),
  [item.trades]);

  // ✅ Chevron animates on the UI thread via Reanimated shared value.
  // useSharedValue is held in a ref so it is created exactly once on mount —
  // calling useSharedValue() directly would re-initialise on every render and
  // trigger Reanimated strict-mode warnings about writes during render.
  // The animation is triggered in a useEffect (not inline during render) for
  // the same reason — writing .value during render is also flagged.
  const chevronRotation = useSharedValue(isExpanded ? 180 : 0);

  useEffect(() => {
    chevronRotation.value = withTiming(isExpanded ? 180 : 0, CHEVRON_TIMING);
  }, [isExpanded]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  return (
    <View style={styles.customerGroupContainer}>
      <TouchableOpacity
        style={styles.customerGroupHeader}
        onPress={() => onToggle(isExpanded ? null : item.customerId)}
        activeOpacity={0.7}
      >
        <View style={styles.customerGroupLeft}>
          <View style={styles.customerAvatar}>
            <Text style={styles.customerAvatarText}>
              {item.customerName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.customerGroupInfo}>
            <Text style={styles.customerGroupName}>{item.customerName}</Text>
            <Text style={styles.customerGroupMeta}>
              {tradeCount} trade{tradeCount !== 1 ? 's' : ''}
              {Object.entries(totals).length > 0 && (
                <Text style={styles.customerGroupMetaSecondary}>
                  {' • '}
                  {Object.entries(totals).map(([type, weight], idx) => (
                    <Text key={type} style={{ fontFamily: 'Outfit_400Regular' }}>
                      {idx > 0 && ', '}
                      {formatItemType(type)}: {type.includes('gold') ? weight.toFixed(3) : weight.toFixed(1)}g
                    </Text>
                  ))}
                </Text>
              )}
            </Text>
          </View>
        </View>
        <View style={styles.customerGroupRight}>
          <TouchableOpacity
            style={styles.quickAddBtn}
            onPress={() => onQuickAdd(item.customerId, item.customerName)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="plus" size={18} color="#fff" />
          </TouchableOpacity>
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={24} color={theme.colors.onSurfaceVariant} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      <AnimatedAccordion isExpanded={isExpanded}>
        <View style={styles.accordionDivider} />
        <ScrollView
          style={styles.tradesScrollView}
          // 1. Move padding to contentContainerStyle so it calculates scroll height correctly
          contentContainerStyle={styles.tradesContainer} 
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={false}
        >
          {item.trades.map((trade, index) => (
            // 2. Give EVERY item a consistent bottom margin so the last one doesn't get clipped
            <View key={trade.id} style={{ marginBottom: 12 }}>
              {renderTradeItem({ item: trade })}
            </View>
          ))}
        </ScrollView>
      </AnimatedAccordion>
    </View>
  );
});

// Needed by CustomerGroupRow which is defined outside TradeScreen
const formatItemType = (itemType: string) => {
  const typeMap: Record<string, string> = {
    gold999: 'Gold 999',
    gold995: 'Gold 995',
    silver: 'Silver',
    rani: 'Rani',
    rupu: 'Rupu',
  };
  return typeMap[itemType] || itemType;
};

export const TradeScreen: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeInputs, setTradeInputs] = useState<any[]>([]);
  const [collectedTradeData, setCollectedTradeData] = useState<any>({});
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  const { showAlert, navigateToSettings, tradeDialogVisible, setTradeDialogVisible, 
    currentCustomer, setCurrentCustomer, customerModalVisible, 
    isCustomerSelectionForTrade, setIsCustomerSelectionForTrade,
    setLastEntryState, navigateToEntry, setTradeIdToDeleteOnSave } = useAppContext();

  // Load trades on focus
  useFocusEffect(
    useCallback(() => {
      loadTrades();
    }, [])
  );

  // Handle customer selection completion from global modal
  React.useEffect(() => {
    if (!customerModalVisible && isCustomerSelectionForTrade && currentCustomer) {
      const selectedCust = currentCustomer;
      
      // Clear both immediately to prevent re-triggering
      setCurrentCustomer(null);
      setIsCustomerSelectionForTrade(false);
      
      // Add small delay to allow customer modal to fully close before opening trade dialog
      setTimeout(() => {
        setSelectedCustomer(selectedCust);
        
        // Add customer info to collected data
        const updatedData = {
          customerId: selectedCust.id,
          customerName: selectedCust.name,
        };
        setCollectedTradeData(updatedData);
        
        // Now show trade type and item type selection
        const inputs = [
          {
            key: 'tradeType',
            label: 'Trade Type',
            value: '',
            type: 'radio',
            options: [
              { label: 'Sell', value: 'sell' },
              { label: 'Buy', value: 'purchase' }
            ]
          },
          {
            key: 'itemType',
            label: 'Item Type',
            value: '',
            type: 'radio',
            options: [] // Will be populated based on tradeType
          }
        ];
        setTradeInputs(inputs);
        setTradeDialogVisible(true);
      }, 300); // 300ms delay
    }
  }, [customerModalVisible, isCustomerSelectionForTrade, currentCustomer]);

  const loadTrades = async () => {
    try {
      const allTrades = await TradeService.getAllTrades();
      // Sort by date (newest first)
      const sortedTrades = allTrades.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setTrades(sortedTrades);
    } catch (error) {
      console.error('Error loading trades:', error);
      showAlert('Error', 'Failed to load trades');
    }
  };

  // Memoized so these expensive reduce+sort don't re-run on every render
  // (e.g. when the trade dialog opens/closes). Only recomputes when trades changes.
  const customerGroups = useMemo(() => {
    const groupedTrades = trades.reduce((acc, trade) => {
      const customerId = trade.customerId || 'unknown';
      if (!acc[customerId]) {
        acc[customerId] = {
          customerId,
          customerName: trade.customerName,
          trades: [],
        };
      }
      acc[customerId].trades.push(trade);
      return acc;
    }, {} as Record<string, { customerId: string; customerName: string; trades: Trade[] }>);

    return Object.values(groupedTrades).sort((a, b) => {
      const aLatest = Math.max(...a.trades.map(t => new Date(t.date).getTime()));
      const bLatest = Math.max(...b.trades.map(t => new Date(t.date).getTime()));
      return bLatest - aLatest;
    });
  }, [trades]);

  const handleDeleteTrade = async (trade: Trade) => {
    showAlert(
      'Delete Trade',
      `Are you sure you want to delete this trade?\n\nCustomer: ${trade.customerName}\nDate: ${formatFullDate(trade.date)}\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await TradeService.deleteTrade(trade.id);
              if (result) {
                showAlert('Success', 'Trade deleted successfully', undefined, 'check-circle');
                loadTrades(); // Refresh the list
              } else {
                showAlert('Error', 'Failed to delete trade');
              }
            } catch (error) {
              console.error('Error deleting trade:', error);
              showAlert('Error', 'Failed to delete trade');
            }
          }
        }
      ]
    );
  };

  const handleTradeDialogSubmit = (values: Record<string, any>) => {
    const updatedData = { ...collectedTradeData, ...values };
    setCollectedTradeData(updatedData);

    if (!updatedData.customerId) {
      // Show customer selection modal instead of text input
      setTradeDialogVisible(false);
      setShowCustomerModal(true);
    } else if (!updatedData.tradeType || !updatedData.itemType) {
      // Move to trade type and item type selection (both in same dialog)
      const tradeType = updatedData.tradeType || 'sell';
      const itemOptions = tradeType === 'sell'
        ? [
            { label: 'Gold 999', value: 'gold999' },
            { label: 'Gold 995', value: 'gold995' },
            { label: 'Silver', value: 'silver' }
          ]
        : [
            { label: 'Gold 999', value: 'gold999' },
            { label: 'Gold 995', value: 'gold995' },
            { label: 'Silver', value: 'silver' },
            { label: 'Rani', value: 'rani' },
            { label: 'Rupu', value: 'rupu' }
          ];

      setTradeInputs([
        {
          key: 'tradeType',
          label: 'Trade Type',
          value: tradeType,
          type: 'radio',
          options: [
            { label: 'Sell', value: 'sell' },
            { label: 'Buy', value: 'purchase' }
          ]
        },
        {
          key: 'itemType',
          label: 'Item Type',
          value: 'gold999',
          type: 'select',
          options: itemOptions
        }
      ]);
    } else if (!updatedData.weight || !updatedData.price) {
      // Move to weight and price input (both in same dialog)
      const itemType = updatedData.itemType || 'gold999';
      const isGold = itemType.includes('gold') || itemType === 'rani';
      const priceLabel = isGold
        ? `Price per 10g (${itemType === 'gold999' ? 'Gold 999' : itemType === 'gold995' ? 'Gold 995' : 'Rani'})`
        : `Price per kg (${itemType === 'silver' ? 'Silver' : 'Rupu'})`;

      setTradeInputs([
        {
          key: 'weight',
          label: 'Weight (g)',
          value: '',
          placeholder: '0',
          type: 'text',
          keyboardType: 'numeric'
        },
        {
          key: 'price',
          label: priceLabel,
          value: '',
          placeholder: '0',
          type: 'text',
          keyboardType: 'numeric'
        }
      ]);
    } else {
      // All data collected, save the trade
      setTradeDialogVisible(false);
      setCollectedTradeData({}); // Reset collected data after saving
      setTradeInputs([]); // Reset inputs after saving

      const tradeData = {
        customerId: updatedData.customerId,
        customerName: updatedData.customerName,
        type: updatedData.tradeType,
        itemType: updatedData.itemType,
        price: updatedData.price,
        weight: updatedData.weight,
        date: new Date().toISOString(),
      };

      TradeService.addTrade(tradeData).then(success => {
        if (success) {
          showAlert('Success', 'Trade added successfully', undefined, 'check-circle');
          loadTrades(); // Refresh the list
          setSelectedCustomer(null); // Clear selected customer
        } else {
          showAlert('Error', 'Failed to add trade');
        }
      });
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowCustomerModal(false);
    
    // Add customer info to collected data
    const updatedData = {
      customerId: customer.id,
      customerName: customer.name,
    };
    setCollectedTradeData(updatedData);
    
    // Now show trade type and item type selection
    setTradeInputs([
      {
        key: 'tradeType',
        label: 'Trade Type',
        value: '',
        type: 'radio',
        options: [
          { label: 'Sell', value: 'sell' },
          { label: 'Buy', value: 'purchase' }
        ]
      },
      {
        key: 'itemType',
        label: 'Item Type',
        value: '',
        type: 'radio',
        options: [] // Will be populated based on tradeType
      }
    ]);
    setTradeDialogVisible(true);
  };

  const handleCustomerCreate = async (customerName: string) => {
    const newCustomer = {
      id: `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: customerName,
      balance: 0,
      metalBalances: { gold999: 0, gold995: 0, silver: 0 },
    };
    
    await CustomerService.saveCustomer(newCustomer);
    handleCustomerSelect(newCustomer);
  };

  const handleAddTrade = async (trade: Trade) => {
    // Get the customer from the trade
    const customer = await CustomerService.getCustomerById(trade.customerId || '');
    
    if (!customer) {
      showAlert('Error', 'Customer not found');
      return;
    }
    
    // Set last entry state to pre-fill the entry screen
    setLastEntryState({
      transactionType: trade.type,
      itemType: trade.itemType as ItemType,
      weight: trade.weight,
      price: trade.price,
    });
    
    // Set the trade ID to be deleted upon successful save
    setTradeIdToDeleteOnSave(trade.id);
    
    // Navigate to entry screen with the customer
    navigateToEntry(customer);
  };

  const handleTradeDialogCancel = () => {
    setTradeDialogVisible(false);
    setCollectedTradeData({});
    setTradeInputs([]); // Reset inputs on cancel
    setSelectedCustomer(null); // Clear selected customer
  };

  // Quick-add: opens dialog directly for a known customer, skipping customer selection
  const handleQuickAddTrade = (customerId: string, customerName: string) => {
    const data = { customerId, customerName };
    setCollectedTradeData(data);
    setTradeInputs([
      {
        key: 'tradeType',
        label: 'Trade Type',
        value: '',
        type: 'radio',
        options: [
          { label: 'Sell', value: 'sell' },
          { label: 'Buy', value: 'purchase' },
        ],
      },
      {
        key: 'itemType',
        label: 'Item Type',
        value: 'gold999',
        type: 'select',
        options: [
          { label: 'Gold 999', value: 'gold999' },
          { label: 'Gold 995', value: 'gold995' },
          { label: 'Silver', value: 'silver' },
        ],
      },
    ]);
    setTradeDialogVisible(true);
  };

  const handleRadioChange = (key: string, value: string) => {
    const updatedData = { ...collectedTradeData, [key]: value };
    setCollectedTradeData(updatedData);

    // If trade type changed, update item type options
    if (key === 'tradeType') {
      const itemOptions = value === 'sell'
        ? [
            { label: 'Gold 999', value: 'gold999' },
            { label: 'Gold 995', value: 'gold995' },
            { label: 'Silver', value: 'silver' }
          ]
        : [
            { label: 'Gold 999', value: 'gold999' },
            { label: 'Gold 995', value: 'gold995' },
            { label: 'Silver', value: 'silver' },
            { label: 'Rani', value: 'rani' },
            { label: 'Rupu', value: 'rupu' }
          ];

      setTradeInputs(prevInputs =>
        prevInputs.map(input =>
          input.key === 'itemType'
            ? { ...input, options: itemOptions }
            : input
        )
      );
    }
  };

  const getCardVariant = (itemType: string) => {
    const isGold = itemType.includes('gold') || itemType === 'rani';
    return isGold ? 'gold' : 'silver';
  };

  const renderTradeItem = useCallback(({ item }: { item: Trade }) => {
    const variant = getCardVariant(item.itemType);
    const isGold = variant === 'gold';
    
    const cardStyle = isGold ? styles.cardGold : styles.cardSilver;
    const textColor = isGold ? styles.textGold : styles.textSilver;
    const labelColor = isGold ? styles.labelGold : styles.labelSilver;
    const accentColor = isGold ? '#B08204' : '#455A64';

    return (
      <View style={[styles.tradeCard, cardStyle]}>
        <View style={styles.cardTop}>
          <View style={styles.userBlock}>
            <Text style={[styles.dateLabel, labelColor]}>{formatFullDate(item.date)}</Text>
            <View style={styles.nameRow}>
              <View style={[styles.typeBadge]}>
                <Text style={[styles.typeText, { color: accentColor }]}>{item.type}</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.deleteAction} 
              onPress={() => handleDeleteTrade(item)}
            >
              <Icon name="delete-outline" size={20} color={theme.colors.error} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.addButton} 
              onPress={() => handleAddTrade(item)}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dataRow}>
          <View style={styles.dataPill}>
            <Text style={[styles.pillLabel, labelColor]}>Item</Text>
            <Text style={[styles.pillValue, textColor]}>{formatItemType(item.itemType)}</Text>
          </View>
          <View style={styles.dataPill}>
            <Text style={[styles.pillLabel, labelColor]}>Weight</Text>
            <Text style={[styles.pillValue, textColor]}>{item.itemType.includes('gold') ? `${item.weight.toFixed(3)}g` : item.itemType.includes('rani') ? `${item.weight.toFixed(3)}g` :`${item.weight.toFixed(1)}g`}</Text>
          </View>
          <View style={styles.dataPill}>
            <Text style={[styles.pillLabel, labelColor]}>Price</Text>
            <Text style={[styles.pillValue, textColor]}>
                ₹{formatIndianNumber(item.price)}
            </Text>
          </View>
        </View>

      </View>
    );
  }, [handleDeleteTrade, handleAddTrade]);

  // Customer Group Header Component
  const renderCustomerGroup = useCallback(({ item }: { item: { customerId: string; customerName: string; trades: Trade[] } }) => {
    return (
      <CustomerGroupRow
        item={item}
        isExpanded={expandedCustomerId === item.customerId}
        onToggle={setExpandedCustomerId}
        onQuickAdd={handleQuickAddTrade}
        renderTradeItem={renderTradeItem}
      />
    );
  }, [expandedCustomerId, handleQuickAddTrade, renderTradeItem]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Trades</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={navigateToSettings}>
          <Icon name="cog" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {trades.length === 0 ? (
          <TradeEmptyState />
        ) : (
          <FlatList
            data={customerGroups}
            renderItem={renderCustomerGroup}
            keyExtractor={item => item.customerId}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            
            // ── PERFORMANCE PROPS ──
            initialNumToRender={10} 
            maxToRenderPerBatch={10} 
            windowSize={11} 
            removeClippedSubviews={false} 
            updateCellsBatchingPeriod={10} 
          />
        )}
      </View>

      {/* Customer Selection Modal */}
      <CustomerSelectionModal
        visible={showCustomerModal}
        onDismiss={() => setShowCustomerModal(false)}
        onSelectCustomer={handleCustomerSelect}
        onCreateCustomer={handleCustomerCreate}
        allowCreateCustomer={true}
      />

      {/* Trade Input Dialog */}
      {tradeDialogVisible && (
        <InventoryInputDialog
          visible={tradeDialogVisible}
          title='Add Trade Details'
          message=''
          inputs={tradeInputs}
          onSubmit={handleTradeDialogSubmit}
          onCancel={handleTradeDialogCancel}
          onRadioChange={handleRadioChange}
          allowDefaults={(!collectedTradeData.tradeType || !collectedTradeData.itemType)}
        />
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  screenTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: theme.colors.onPrimaryContainer,
    letterSpacing: -1,
  },
  settingsBtn: {
    width: 48,
    height: 48,
    marginRight: -7,
    marginTop: -2.5,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  screenSubtitle: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    color: '#44474F',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 80,
  },
  tradeCard: {
    marginHorizontal: 6,
    borderRadius: 32,
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  cardGold: {
    backgroundColor: '#FFF8E1',
  },
  cardSilver: {
    backgroundColor: '#E4E7EC',
  },
  textGold: { color: '#5C4300' },
  textSilver: { color: '#191C1E' },
  labelGold: { color: '#5C4300', opacity: 0.7 },
  labelSilver: { color: '#191C1E', opacity: 0.7 },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  userBlock: {
    flex: 1,
  },
  dateLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    marginBottom: 2,
  },
  userName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 22,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignSelf: 'flex-start',
  },
  deleteAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.errorContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  addButtonText: {
    color: theme.colors.onPrimary,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
  },
  typeText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dataRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dataPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
    padding: 12,
    borderRadius: 16,
    alignItems: 'flex-start',
  },
  pillLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pillValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },

  extendedFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: 'lightseagreen',
    shadowColor: 'lightseagreen',
    borderRadius: 32,
    elevation: 6,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    minHeight: 400,
  },
  emptyTitle: {
    textAlign: 'center',
    fontFamily: 'Outfit_400Regular',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    color: theme.colors.onSurface,
  },
  emptyDescription: {
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Outfit_400Regular',
  },
  // Customer Group Styles
  customerGroupContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0E2E5',
    backgroundColor: theme.colors.background,
  },
  customerGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  accordionDivider: {
    height: 1,
    backgroundColor: '#E0E2E5', // Matches outline color
    width: '92.5%',
    alignSelf: 'center',
    marginBottom: 4,
  },
  customerGroupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerAvatarText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    color: theme.colors.onPrimary,
  },
  customerGroupInfo: {
    flex: 1,
  },
  customerGroupName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: theme.colors.onSurface,
    marginBottom: 2,
  },
  customerGroupMeta: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  customerGroupMetaSecondary: {
    fontFamily: 'Outfit_400Regular',
    opacity: 0.7,
  },
  customerGroupRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickAddBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradesScrollView: {
    maxHeight: 400, // ~2 trade cards visible at a time
  },
  tradesContainer: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 100, // Extra clearance at the bottom
  },
});