import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
} from 'react-native';
import {
  Surface,
  Text,
  IconButton,
  FAB,
  List,
  Avatar,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Trade } from '../types';
import { theme } from '../theme';
import { TradeService } from '../services/tradeService';
import { formatFullDate, formatIndianNumber } from '../utils/formatting';
import { useAppContext } from '../context/AppContext';
import { InventoryInputDialog } from '../components/InventoryInputDialog';

export const TradeScreen: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showTradeDialog, setShowTradeDialog] = useState(false);
  const [tradeInputs, setTradeInputs] = useState<any[]>([]);
  const [collectedTradeData, setCollectedTradeData] = useState<any>({});

  const { showAlert, navigateToSettings } = useAppContext();

  // Load trades on mount
  useEffect(() => {
    loadTrades();
  }, []);

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

  const toggleCardExpansion = (tradeId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(tradeId)) {
      newExpanded.delete(tradeId);
    } else {
      newExpanded.add(tradeId);
    }
    setExpandedCards(newExpanded);
  };

  const handleAddTrade = () => {
    // Start with customer name input
    setTradeInputs([
      {
        key: 'customerName',
        label: 'Customer Name',
        value: '',
        placeholder: 'Enter customer name',
        type: 'text',
        keyboardType: 'default'
      }
    ]);
    setCollectedTradeData({});
    setShowTradeDialog(true);
  };

  const handleTradeDialogSubmit = (values: Record<string, any>) => {
    const updatedData = { ...collectedTradeData, ...values };
    setCollectedTradeData(updatedData);

    if (!updatedData.customerName) {
      // Move to customer name input
      setTradeInputs([
        {
          key: 'customerName',
          label: 'Customer Name',
          value: '',
          placeholder: 'Enter customer name',
          type: 'text',
          keyboardType: 'default'
        }
      ]);
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
            { label: 'Purchase', value: 'purchase' }
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
      setShowTradeDialog(false);

      const tradeData = {
        customerName: updatedData.customerName,
        type: updatedData.tradeType,
        itemType: updatedData.itemType,
        price: updatedData.price,
        weight: updatedData.weight,
        date: new Date().toISOString(),
      };

      TradeService.addTrade(tradeData).then(success => {
        if (success) {
          showAlert('Success', 'Trade added successfully');
          loadTrades(); // Refresh the list
        } else {
          showAlert('Error', 'Failed to add trade');
        }
      });
    }
  };

  const handleTradeDialogCancel = () => {
    setShowTradeDialog(false);
    setCollectedTradeData({});
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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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

  const formatPrice = (price: number, itemType: string) => {
    const isGold = itemType.includes('gold') || itemType === 'rani';
    const unit = isGold ? '/10g' : '/kg';
    return `₹${formatIndianNumber(price)}${unit}`;
  };

  const renderTradeItem = ({ item }: { item: Trade }) => {
    const isExpanded = expandedCards.has(item.id);

    return (
      <View>
        <List.Item
          title={item.customerName}
          titleStyle={styles.customerName}
          descriptionStyle={styles.tradeDescription}
          left={() => (
            <Avatar.Text
              size={36}
              label={getInitials(item.customerName)}
              style={styles.avatar}
              labelStyle={[styles.avatarLabel, {fontFamily: 'Roboto_500Medium'}]}
            />
          )}
          right={() => (
            <IconButton
              icon={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              onPress={() => toggleCardExpansion(item.id)}
              style={styles.expandButton}
            />
          )}
          onPress={() => toggleCardExpansion(item.id)}
          style={styles.tradeItem}
        />

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.tradeDetails}>
              <View style={styles.detailRow}>
                <Text variant="bodyMedium" style={styles.detailLabel}>
                  Date:
                </Text>
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {formatFullDate(item.date)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="bodyMedium" style={styles.detailLabel}>
                  Type:
                </Text>
                <Text variant="bodyMedium" style={[styles.detailValue, { textTransform: 'capitalize' }]}>
                  {item.type}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="bodyMedium" style={styles.detailLabel}>
                  Item:
                </Text>
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {formatItemType(item.itemType)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="bodyMedium" style={styles.detailLabel}>
                  Price:
                </Text>
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {formatPrice(item.price, item.itemType)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="bodyMedium" style={styles.detailLabel}>
                  Weight:
                </Text>
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {item.weight}g
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  // Empty State Component
  const EmptyState: React.FC = () => (
    <View style={styles.emptyState}>
      <Icon name="swap-vertical-bold" size={72} color={theme.colors.onSurfaceVariant} />
      <Text variant="headlineSmall" style={styles.emptyTitle}>
        No Trades Yet
      </Text>
      <Text variant="bodyLarge" style={styles.emptyDescription}>
        Start by adding your first trade record
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* App Title Bar */}
      <Surface style={styles.appTitleBar} elevation={1}>
        <View style={styles.appTitleContent}>
          <Text variant="titleLarge" style={styles.appTitle}>
            Trades
          </Text>
          <IconButton
            icon="cog-outline"
            size={24}
            onPress={navigateToSettings}
            style={styles.settingsButton}
          />
        </View>
      </Surface>

      <View style={styles.content}>
        {trades.length === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            data={trades}
            renderItem={renderTradeItem}
            keyExtractor={item => item.id}
            style={styles.tradeList}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <Divider />}
          />
        )}
      </View>

      {/* FAB */}
      {!showTradeDialog && (
        <FAB
          icon="swap-vertical"
          style={styles.fab}
          onPress={handleAddTrade}
        />
      )}

      {/* Trade Input Dialog */}
      <InventoryInputDialog
        visible={showTradeDialog}
        title={
          !collectedTradeData.customerName ? 'Add Trade - Customer' :
          (!collectedTradeData.tradeType || !collectedTradeData.itemType) ? 'Add Trade - Details' :
          'Add Trade - Amount'
        }
        message={
          !collectedTradeData.customerName ? 'Enter the customer name:' :
          (!collectedTradeData.tradeType || !collectedTradeData.itemType) ? 'Select trade type and item:' :
          'Enter weight and price:'
        }
        inputs={tradeInputs}
        onSubmit={handleTradeDialogSubmit}
        onCancel={handleTradeDialogCancel}
        onRadioChange={handleRadioChange}
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
    paddingVertical: theme.spacing.sm,
  },
  appTitleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
  },
  appTitle: {
    color: theme.colors.primary,
    fontFamily: 'Roboto_700Bold',
  },
  settingsButton: {
    margin: 0,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  tradeList: {
    flex: 1,
  },
  tradeItem: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    borderRadius: 50,
  },
  avatar: {
    backgroundColor: theme.colors.primary,
    marginRight: 0,
    marginLeft: 10,
  },
  avatarLabel: {
    color: theme.colors.onPrimary,
    fontSize: 16,
  },
  customerName: {
    color: theme.colors.onSurface,
    fontWeight: '500',
    fontSize: 16,
    fontFamily: 'Roboto_500Medium',
    marginTop: -10,
  },
  tradeDescription: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    marginTop: 2,
    fontFamily: 'Roboto_400Regular',
  },
  expandButton: {
    marginRight: -10,
    marginTop: -5,
  },
  expandedContent: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: 8,
    elevation: theme.elevation.level1,
  },
  tradeDetails: {
    padding: theme.spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  detailLabel: {
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Roboto_500Medium',
  },
  detailValue: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_400Regular',
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
    fontFamily: 'Roboto_400Regular',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    color: theme.colors.onSurface,
  },
  emptyDescription: {
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    color: theme.colors.onSurfaceVariant,
  },
  fab: {
    position: 'absolute',
    margin: theme.spacing.md,
    right: 0,
    bottom: theme.spacing.md,
    borderRadius: 16,
  },
});