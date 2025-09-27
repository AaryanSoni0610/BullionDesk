import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
import {
  Surface,
  Text,
  Button,
  Card,
  IconButton,
  FAB,
  Divider,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Customer, TransactionEntry } from '../types';

interface SettlementSummaryScreenProps {
  customer: Customer;
  entries: TransactionEntry[];
  onBack: () => void;
  onAddMoreEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onSaveTransaction: (receivedAmount?: number) => void;
}

export const SettlementSummaryScreen: React.FC<SettlementSummaryScreenProps> = ({
  customer,
  entries,
  onBack,
  onAddMoreEntry,
  onDeleteEntry,
  onSaveTransaction,
}) => {
  const [receivedAmount, setReceivedAmount] = useState('');
  
  const getItemDisplayName = (entry: TransactionEntry): string => {
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999',
      'gold995': 'Gold 995',
      'rani': 'Rani',
      'silver': 'Silver',
      'silver98': 'Silver 98',
      'silver96': 'Silver 96',
      'rupu': 'Rupu',
      'money': 'Money',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };

  const formatEntryDetails = (entry: TransactionEntry): string => {
    if (entry.itemType === 'money') {
      const type = entry.moneyType === 'debt' ? 'Debt' : 'Balance';
      return `${type}: ₹${entry.amount?.toLocaleString()}`;
    }

    if (entry.itemType === 'rani') {
      const pureGold = entry.pureWeight || ((entry.weight || 0) * (entry.touch || 0)) / 100;
      return `Weight: ${entry.weight}g, Touch: ${entry.touch}%, Pure: ${pureGold.toFixed(3)}g`;
    }

    if (entry.itemType === 'rupu') {
      const pureWeight = entry.pureWeight || ((entry.weight || 0) * (entry.touch || 0)) / 100;
      return `Weight: ${entry.weight}g, Touch: ${entry.touch}%, Pure: ${pureWeight.toFixed(3)}g`;
    }

    return `Weight: ${entry.weight}g, Price: ₹${entry.price?.toLocaleString()}/${entry.itemType.startsWith('gold') ? '10g' : 'kg'}`;
  };

  const calculateTotals = () => {
    let netMoneyFlow = 0; // Net money from merchant perspective: positive = merchant takes money, negative = merchant gives money
    const giveItems: { item: string; amount: string }[] = []; // What merchant gives to customer
    const takeItems: { item: string; amount: string }[] = []; // What merchant takes from customer

    entries.forEach(entry => {
      if (entry.type === 'sell') {
        // Merchant sells: takes money (+), gives goods
        netMoneyFlow += Math.abs(entry.subtotal);
        if (entry.itemType === 'money') {
          takeItems.push({ item: 'Money', amount: `₹${entry.amount?.toLocaleString()}` });
        } else {
          giveItems.push({ 
            item: getItemDisplayName(entry), 
            amount: `${entry.weight}g` 
          });
        }
      } else {
        // Merchant purchases: gives money (-), takes goods
        netMoneyFlow -= Math.abs(entry.subtotal);
        if (entry.itemType === 'money') {
          giveItems.push({ item: 'Money', amount: `₹${entry.amount?.toLocaleString()}` });
        } else {
          takeItems.push({ 
            item: getItemDisplayName(entry), 
            amount: `${entry.weight}g` 
          });
        }
      }
    });

    const netAmount = netMoneyFlow; // Positive = customer owes merchant, Negative = merchant owes customer
    
    return { 
      totalGive: netMoneyFlow < 0 ? Math.abs(netMoneyFlow) : 0, 
      totalTake: netMoneyFlow > 0 ? netMoneyFlow : 0, 
      netAmount, 
      giveItems, 
      takeItems 
    };
  };

  const { totalGive, totalTake, netAmount, giveItems, takeItems } = calculateTotals();
  const received = parseFloat(receivedAmount) || 0;
  const finalBalance = netAmount - received; // Net amount customer owes - what they paid

  const renderEntryCard = (entry: TransactionEntry, index: number) => (
    <Card key={entry.id} style={styles.entryCard} mode="outlined">
      <Card.Content style={styles.entryCardContent}>
        <View style={styles.entryHeader}>
          <View style={styles.entryTitleContainer}>
            <Text 
              variant="titleSmall" 
              style={[
                styles.entryType,
                { color: entry.type === 'sell' ? theme.colors.sellColor : theme.colors.primary }
              ]}
            >
              {entry.type === 'sell' ? 'Sell' : 'Purchase'} - {getItemDisplayName(entry)}
            </Text>
          </View>
          <IconButton
            icon="delete"
            iconColor={theme.colors.error}
            size={20}
            onPress={() => onDeleteEntry(entry.id)}
            style={styles.deleteButton}
          />
        </View>
        
        <Divider style={styles.entryDivider} />
        
        <Text variant="bodySmall" style={styles.entryDetails}>
          {formatEntryDetails(entry)}
        </Text>
        <Text variant="bodyMedium" style={styles.entrySubtotal}>
          Subtotal: {entry.type === 'sell' ? '+' : '-'}₹{Math.abs(entry.subtotal).toLocaleString()}
        </Text>
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Page Title Bar */}
      <Surface style={styles.appTitleBar} elevation={2}>
        <View style={styles.appTitleContent}>
          <Text variant="titleLarge" style={styles.appTitle}>
            Transaction Summary
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

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Entry Cards */}
        <View style={styles.entriesSection}>
          {entries.map((entry, index) => renderEntryCard(entry, index))}
        </View>

        {/* Horizontal Line */}
        <Divider style={styles.sectionDivider} />

        {/* Transaction Summary Card */}
        <Card style={styles.summaryCard} mode="contained">
          <Card.Content>
            <Text variant="titleMedium" style={styles.summaryTitle}>
              Transaction Summary
            </Text>
            
            <View style={styles.summaryContent}>
              {/* Give Section */}
              <View style={styles.summarySection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.iconContainer}>
                    <IconButton 
                      icon="hand-coin-outline" 
                      iconColor={theme.colors.primary}
                      size={20}
                    />
                    <IconButton 
                      icon="arrow-up" 
                      iconColor={theme.colors.primary}
                      size={16}
                      style={styles.arrowIcon}
                    />
                  </View>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Give</Text>
                </View>
                {giveItems.map((item, index) => (
                  <Text key={index} variant="bodyMedium" style={styles.summaryItem}>
                    • {item.item}: {item.amount}
                  </Text>
                ))}
                {/* Show net money if negative (merchant owes customer) */}
                {netAmount < 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>
                    • Money: ₹{Math.abs(netAmount).toLocaleString()}
                  </Text>
                )}
                {giveItems.length === 0 && netAmount >= 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>• Nothing</Text>
                )}
              </View>

              {/* Take Section */}
              <View style={styles.summarySection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.iconContainer}>
                    <IconButton 
                      icon="hand-coin-outline" 
                      iconColor={theme.colors.sellColor}
                      size={20}
                    />
                    <IconButton 
                      icon="arrow-down" 
                      iconColor={theme.colors.sellColor}
                      size={16}
                      style={styles.arrowIcon}
                    />
                  </View>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Take</Text>
                </View>
                {takeItems.map((item, index) => (
                  <Text key={index} variant="bodyMedium" style={styles.summaryItem}>
                    • {item.item}: {item.amount}
                  </Text>
                ))}
                {/* Show net money if positive (customer owes merchant) */}
                {netAmount > 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>
                    • Money: ₹{netAmount.toLocaleString()}
                  </Text>
                )}
                {takeItems.length === 0 && netAmount <= 0 && (
                  <Text variant="bodyMedium" style={styles.summaryItem}>• Nothing</Text>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Horizontal Line */}
        <Divider style={styles.sectionDivider} />

        {/* Total Card */}
        <Card style={styles.totalCard} mode="contained">
          <Card.Content>
            <View style={styles.totalSection}>
              <Text variant="titleMedium">
                {netAmount >= 0 ? 'Customer Gets:' : 'Customer Owes:'}
              </Text>
              <Text 
                variant="titleMedium" 
                style={[
                  styles.totalAmount,
                  { color: netAmount >= 0 ? theme.colors.sellColor : theme.colors.primary }
                ]}
              >
                ₹{Math.abs(netAmount).toLocaleString()}
              </Text>
            </View>

            <Divider style={styles.totalDivider} />

            {/* Received Money Input */}
            <TextInput
              label="Received Money (₹)"
              value={receivedAmount}
              onChangeText={setReceivedAmount}
              mode="outlined"
              keyboardType="numeric"
              style={styles.receivedInput}
            />

            <Divider style={styles.totalDivider} />

            {/* Final Balance */}
            <View style={styles.balanceSection}>
              <Text variant="titleMedium">
                {finalBalance > 0 ? 'Debt:' : 'Balance:'}
              </Text>
              <Text 
                variant="titleMedium" 
                style={[
                  styles.balanceAmount,
                  { 
                    color: finalBalance > 0 
                      ? theme.colors.debtColor 
                      : finalBalance < 0 
                        ? theme.colors.balanceColor 
                        : theme.colors.onSurface 
                  }
                ]}
              >
                ₹{Math.abs(finalBalance).toLocaleString()}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Horizontal Line */}
        <Divider style={styles.sectionDivider} />

        {/* Save Transaction Button */}
        <Button
          mode="contained"
          icon="check"
          onPress={() => onSaveTransaction(received)}
          disabled={entries.length === 0}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          buttonColor={theme.colors.success}
        >
          Save Transaction
        </Button>
      </ScrollView>

      {/* FAB for adding more entries */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={onAddMoreEntry}
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
  },
  backButton: {
    flexDirection: 'row-reverse',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: 100, // Space for FAB
  },
  entriesSection: {
    marginBottom: theme.spacing.md,
  },
  sectionDivider: {
    marginVertical: theme.spacing.lg,
    height: 2,
    backgroundColor: theme.colors.outline,
  },
  entryCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 12,
  },
  entryCardContent: {
    paddingVertical: theme.spacing.md,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryTitleContainer: {
    flex: 1,
  },
  entryTitle: {
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
  },
  entryType: {
    fontWeight: '500',
  },
  deleteButton: {
    margin: 0,
  },
  entryDivider: {
    marginVertical: theme.spacing.sm,
  },
  entryDetails: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: theme.spacing.xs,
  },
  entrySubtotal: {
    fontWeight: '500',
  },
  summaryCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 12,
  },
  summaryTitle: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    fontWeight: 'bold',
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.md,
  },
  summarySection: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginLeft: theme.spacing.xs,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowIcon: {
    margin: -8,
    marginLeft: -12,
  },
  summaryItem: {
    marginLeft: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  summaryDivider: {
    marginVertical: theme.spacing.md,
  },
  totalCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 12,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  totalAmount: {
    fontWeight: 'bold',
  },
  totalDivider: {
    marginVertical: theme.spacing.md,
  },
  receivedInput: {
    marginBottom: theme.spacing.md,
  },
  balanceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceAmount: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  saveButton: {
    marginBottom: theme.spacing.md,
    borderRadius: 12,
  },
  saveButtonContent: {
    paddingVertical: theme.spacing.sm,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 16,
    backgroundColor: theme.colors.primary,
  },
});
