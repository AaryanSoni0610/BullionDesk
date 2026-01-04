import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { TransactionService } from '../services/transaction.service';
import { Transaction, TransactionEntry } from '../types';
import { useAppContext } from '../context/AppContext';
import { formatIndianNumber, formatRelativeDate, formatPureGoldPrecise, formatPureSilver } from '../utils/formatting';

export const HomeScreen = ({ navigation }: any) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { navigateToSettings } = useAppContext();

  const loadTransactions = async () => {
    try {
      const data = await TransactionService.getAllTransactions(20);
      setTransactions(data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getItemDisplayName = (entry: TransactionEntry & { _isAggregated?: boolean, _count?: number }): string => {
    if (entry.type === 'money') return 'Money';
    
    // Aggregated Display Name
    if (entry._isAggregated && entry._count) {
      const typeLabel = entry.itemType === 'rani' ? 'Rani' : 'Rupu';
      return `${entry._count} ${typeLabel} items`;
    }

    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999',
      'gold995': 'Gold 995',
      'rani': 'Rani',
      'silver': 'Silver',
      'rupu': 'Rupu',
      'money': 'Money',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };

  // Helper to aggregate Rani/Rupa entries
  const getAggregatedEntries = (entries: TransactionEntry[]) => {
    const aggregated: TransactionEntry[] = [];
    const raniEntries: TransactionEntry[] = [];
    const rupaEntries: TransactionEntry[] = [];

    entries.forEach(entry => {
      if (entry.itemType === 'rani') {
        raniEntries.push(entry);
      } else if (entry.itemType === 'rupu') {
        rupaEntries.push(entry);
      } else {
        aggregated.push(entry);
      }
    });

    if (raniEntries.length > 0) {
      const totalWeight = raniEntries.reduce((sum, e) => sum + (e.weight || 0), 0);
      const totalPureWeight = raniEntries.reduce((sum, e) => {
        const touch = e.touch || 100;
        const cut = e.cut || 0;
        const effectiveTouch = Math.max(0, touch - cut);
        return sum + ((e.weight || 0) * effectiveTouch) / 100;
      }, 0);
      
      // Calculate average effective touch for display
      const avgTouch = totalWeight > 0 ? (totalPureWeight / totalWeight) * 100 : 0;

      aggregated.push({
        ...raniEntries[0], // Keep base properties of first entry
        weight: totalWeight,
        touch: avgTouch, // Store average touch for display logic if needed
        cut: 0, // Already factored into pure weight
        price: raniEntries.reduce((sum, e) => sum + (e.price || 0), 0),
        subtotal: raniEntries.reduce((sum, e) => sum + (e.subtotal || 0), 0),
        // Custom property to indicate aggregation
        _aggregatedPureWeight: totalPureWeight,
        _isAggregated: raniEntries.length > 1,
        _count: raniEntries.length
      } as any);
    }

    if (rupaEntries.length > 0) {
      const totalWeight = rupaEntries.reduce((sum, e) => sum + (e.weight || 0), 0);
      const totalPureWeight = rupaEntries.reduce((sum, e) => {
        const touch = e.touch || 100;
        return sum + ((e.weight || 0) * touch) / 100;
      }, 0);
      
      const avgTouch = totalWeight > 0 ? (totalPureWeight / totalWeight) * 100 : 0;

      aggregated.push({
        ...rupaEntries[0],
        weight: totalWeight,
        touch: avgTouch,
        price: rupaEntries.reduce((sum, e) => sum + (e.price || 0), 0),
        subtotal: rupaEntries.reduce((sum, e) => sum + (e.subtotal || 0), 0),
        _aggregatedPureWeight: totalPureWeight,
        _isAggregated: rupaEntries.length > 1,
        _count: rupaEntries.length
      } as any);
    }

    return aggregated;
  };

  // Helper to calculate Pure Weight details (Restored from HistoryScreen logic)
  const getEntryDetails = (entry: TransactionEntry & { _aggregatedPureWeight?: number, _isAggregated?: boolean, _count?: number }) => {
    const weight = entry.weight || 0;
    
    // 1. Rani/Rupa Logic (Show Pure Weight)
    if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
      // Use pre-calculated pure weight if aggregated, otherwise calculate
      let pureWeight: number;
      let effectiveTouch: number;

      if (entry._aggregatedPureWeight !== undefined) {
        pureWeight = entry._aggregatedPureWeight;
        effectiveTouch = entry.touch || 0; // This is the average touch we calculated
      } else {
        const touch = entry.touch || 100;
        const cut = entry.cut || 0;
        effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
        pureWeight = (weight * effectiveTouch) / 100;
      }
      
      const formattedPure = entry.itemType === 'rani' 
        ? formatPureGoldPrecise(pureWeight) 
        : formatPureSilver(pureWeight);

      // If aggregated, show simplified format: "Total Weight : Pure Weight"
      if (entry._isAggregated) {
        return `Total Weight: ${weight.toFixed(3)}g : Pure Weight: ${formattedPure.toFixed(3)}g`;
      }

      // Standard Format: "Weight : Touch% : Pure Weight"
      return `${weight.toFixed(3)}g : ${effectiveTouch.toFixed(2)}% : ${formattedPure.toFixed(3)}g`;
    }

    // 2. Standard Metal Logic
    if (entry.weight) {
      return `${weight.toFixed(3)}g`;
    }

    // 3. Money Logic
    return 'Manual Entry';
  };

  const renderTransactionCard = ({ item }: { item: Transaction }) => {
    const dateStr = formatRelativeDate(item.date);
    const isMetalOnly = item.entries.some(e => e.metalOnly);
    
    // Aggregate entries for display
    const displayEntries = getAggregatedEntries(item.entries);

    let statusText = 'Settled';
    let statusStyle = styles.statusSettled;
    let statusTextStyle = styles.statusSettledText;
    let totalColorStyle = styles.textBlue;

    if (isMetalOnly) {
      // Metal Only Logic
      const metalItems: string[] = [];
      item.entries.forEach(entry => {
        if (entry.metalOnly) {
           const itemName = getItemDisplayName(entry);
           const w = entry.weight || 0;
           metalItems.push(`${itemName} ${w.toFixed(3)}g`);
        }
      });
      
      if (metalItems.length > 0) {
        statusText = metalItems.join(', ');
        // Debt/Balance color logic for metal
        const isDebt = item.entries.some(e => e.type === 'sell'); // Sell = Debt in metal context
        statusStyle = isDebt ? styles.statusDebt : styles.statusBalance;
        statusTextStyle = isDebt ? styles.statusDebtText : styles.statusBalanceText;
      }
    } else {
      // Money Transaction Logic
      // Formula: amountPaid - total + discount
      const transactionRemaining = item.amountPaid - item.total + (item.discountExtraAmount || 0);
      const hasRemaining = Math.abs(transactionRemaining) >= 1; // Tolerance of 1

      if (hasRemaining) {
         const isDebt = transactionRemaining < 0;
         statusText = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
         
         statusStyle = isDebt ? styles.statusDebt : styles.statusBalance;
         statusTextStyle = isDebt ? styles.statusDebtText : styles.statusBalanceText;
      } else {
         statusText = 'Settled';
         statusStyle = styles.statusSettled;
         statusTextStyle = styles.statusSettledText;
      }
      
      // Hero Amount Color
      // Received = Green, Given = Blue
      if (item.total > 0) totalColorStyle = styles.textGreen;
      else totalColorStyle = styles.textBlue;
    }

    // Handle money-only color based on amountPaid
    if (!isMetalOnly && displayEntries.length === 0) {
      totalColorStyle = item.amountPaid >= 0 ? styles.textGreen : styles.textBlue;
    }

    // Determine total label based on item.total
    let totalLabel = 'Total Amount';
    if (item.total > 0) totalLabel = 'Received';
    else if (item.total < 0) totalLabel = 'Given';
    else totalLabel = 'Settled';

    // Handle money-only label based on amountPaid
    if (!isMetalOnly && displayEntries.length === 0) {
      totalLabel = item.amountPaid > 0 ? 'Received' : item.amountPaid < 0 ? 'Given' : 'Settled';
    }

    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.75}
      >
        {/* Card Header */}
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.customerName}>{item.customerName}</Text>
            <Text style={styles.dateText}>{dateStr}</Text>
          </View>
          <View style={[styles.statusBadge, statusStyle]}>
            <Text style={[styles.statusBadgeText, statusTextStyle]} numberOfLines={1}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Entries List */}
        <View style={styles.entriesContainer}>
          {displayEntries && displayEntries.length > 0 ? (
            displayEntries.map((entry: TransactionEntry, index: number) => {
              const isSell = entry.type === 'sell';
              const isPurchase = entry.type === 'purchase';
              const iconName = isSell ? 'arrow-top-right' : isPurchase ? 'arrow-bottom-left' : 'cash';
              const iconStyle = isSell ? styles.iconSell : isPurchase ? styles.iconPurchase : styles.iconMoney;
              const iconColor = isSell ? theme.colors.success : isPurchase ? theme.colors.primary : '#F57C00';

              return (
                <View key={index} style={styles.itemRow}>
                  {/* Icon Box */}
                  <View style={[styles.iconBox, iconStyle]}>
                    <Icon name={iconName} size={20} color={iconColor} />
                  </View>
                  
                  {/* Item Text Details */}
                  <View style={styles.itemDetails}>
                    <View style={styles.itemHeaderRow}>
                      <Text style={styles.itemName}>
                        {isSell ? 'Sell' : isPurchase ? 'Purchase' : 'Money'}: {getItemDisplayName(entry)}
                      </Text>
                      {/* Price on the right (WITH SIGNS) */}
                      {(entry.subtotal || 0) !== 0 && (
                        <Text style={[
                          styles.itemPrice, 
                          isSell ? styles.textGreen : styles.textBlue
                        ]}>
                          {isSell ? '+' : '-'}₹{formatIndianNumber(Math.abs(entry.subtotal!))}
                        </Text>
                      )}
                    </View>
                    
                    {/* Weight / Pure Weight Logic */}
                    <Text style={styles.itemMeta}>
                      {getEntryDetails(entry)}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            // Fallback for Money-Only (Legacy)
            <View style={styles.itemRow}>
              <View style={[styles.iconBox, item.amountPaid >= 0 ? styles.iconSell : styles.iconMoney]}>
                <Icon name="cash" size={20} color={item.amountPaid >= 0 ? theme.colors.success : '#F57C00'} />
              </View>
              <View style={styles.itemDetails}>
                <View style={styles.itemHeaderRow}>
                   <Text style={styles.itemName}>{item.amountPaid > 0 ? 'Received' : 'Given'}</Text>
                   <Text style={[styles.itemPrice, item.amountPaid >= 0 ? styles.textGreen : styles.textBlue]}>
                     {item.amountPaid >= 0 ? '+' : '-'}₹{formatIndianNumber(Math.abs(item.amountPaid))}
                   </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Footer: Total Amount */}
        {!isMetalOnly && (
          <View style={styles.cardFooter}>
            <Text style={styles.totalLabel}>
              {totalLabel}
            </Text>
            <Text style={[styles.totalAmount, totalColorStyle]}>
              {item.amountPaid >= 0 ? '+' : '-'}₹{formatIndianNumber(Math.abs(item.amountPaid))}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Expressive Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greetingText}>{getGreeting()}</Text>
          <Text style={styles.screenTitle}>BullionDesk</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={navigateToSettings}>
          <Icon name="cog" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
      </View>

      {/* Section Label */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Recent Transactions</Text>
        <View style={styles.sectionLine} />
      </View>

      {/* List */}
      <FlatList
        data={transactions}
        renderItem={renderTransactionCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      />
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
    fontSize: 34,
    color: theme.colors.onPrimaryContainer,
    letterSpacing: -1,
  },
  greetingText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
    color: theme.colors.onSurfaceVariant,
    marginBottom: -4,
  },
  settingsBtn: {
    width: 48,
    height: 48,
    marginTop: -14,
    marginRight: -7,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  sectionLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: theme.colors.primary,
    marginRight: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.surfaceVariant,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100, // Space for Navbar
    gap: 12,
  },
  card: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: 28, // Expressive Corner Radius
    padding: 20,
    marginBottom: 4,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  customerName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 20,
    color: theme.colors.onSurface,
  },
  dateText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    maxWidth: '40%', // Prevent badge from pushing text
  },
  statusBadgeText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  statusSettled: {
    backgroundColor: theme.colors.primaryContainer,
  },
  statusSettledText: {
    color: theme.colors.primary,
  },
  statusBalance: {
    backgroundColor: theme.colors.successContainer,
  },
  statusBalanceText: {
    color: theme.colors.success,
  },
  statusDebt: {
    backgroundColor: theme.colors.errorContainer,
  },
  statusDebtText: {
    color: theme.colors.error,
  },
  entriesContainer: {
    gap: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconSell: {
    backgroundColor: '#E8F5E9', // Light Green
  },
  iconPurchase: {
    backgroundColor: '#E3F2FD', // Light Blue
  },
  iconMoney: {
    backgroundColor: '#FFF8E1', // Light Orange
  },
  itemDetails: {
    flex: 1,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 15,
    color: theme.colors.onSurface,
  },
  itemPrice: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16, // Increased to match total amount visual weight slightly better
  },
  itemMeta: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  cardFooter: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  totalAmount: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18, // Reduced from 22 to match item price size better
    letterSpacing: -0.5,
  },
  textGreen: {
    color: theme.colors.success,
  },
  textBlue: {
    color: theme.colors.primary,
  },
  textRed: {
    color: theme.colors.error,
  },
});