import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Surface, Text, List } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';

export const HomeScreen: React.FC = () => {
  // Mock recent transactions - in real app, this would come from storage
  const recentTransactions = [
    {
      id: '1',
      customerName: 'John Doe',
      date: '2024-01-15',
      amount: 108370,
      type: 'sell' as const,
    },
    {
      id: '2',
      customerName: 'Jane Smith',
      date: '2024-01-14',
      amount: 45200,
      type: 'purchase' as const,
    },
  ];

  const formatAmount = (amount: number, type: 'sell' | 'purchase') => {
    const sign = type === 'sell' ? '+' : '-';
    return `${sign}₹${amount.toLocaleString()}`;
  };

  const getAmountColor = (type: 'sell' | 'purchase') => {
    return type === 'sell' ? theme.colors.sellColor : theme.colors.purchaseColor;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* App Title Bar */}
      <Surface style={styles.appTitleBar} elevation={2}>
        <View style={styles.appTitleContent}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.appIcon}
          />
          <Text variant="titleLarge" style={styles.appTitle}>
            BullionDesk
          </Text>
        </View>
      </Surface>

      {/* Content Area */}
      <View style={styles.content}>
        {recentTransactions.length === 0 ? (
          /* Empty State */
          <View style={styles.emptyState}>
            <Text variant="headlineMedium" style={styles.emptyTitle}>
              Welcome to BullionDesk
            </Text>
            <Text variant="bodyLarge" style={styles.emptyDescription}>
              Tap the + button to start your first transaction
            </Text>
          </View>
        ) : (
          /* Transaction List */
          <Surface style={styles.transactionList} elevation={1}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Recent Transactions
            </Text>
            {recentTransactions.map((transaction) => (
              <List.Item
                key={transaction.id}
                title={transaction.customerName}
                description={new Date(transaction.date).toLocaleDateString()}
                right={() => (
                  <Text
                    variant="labelLarge"
                    style={[
                      styles.amountText,
                      { color: getAmountColor(transaction.type) }
                    ]}
                  >
                    {formatAmount(transaction.amount, transaction.type)}
                  </Text>
                )}
                onPress={() => {
                  // TODO: Navigate to transaction details
                  console.log('View transaction:', transaction.id);
                }}
                style={styles.transactionItem}
              />
            ))}
          </Surface>
        )}
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
  appBar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md,
  },
  appBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    color: theme.colors.onSurface,
  },
  emptyDescription: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
  },
  transactionList: {
    borderRadius: 12,
    paddingVertical: theme.spacing.sm,
  },
  sectionTitle: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.onSurface,
  },
  transactionItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  amountText: {
    fontWeight: 'bold',
    alignSelf: 'center',
  },
});
