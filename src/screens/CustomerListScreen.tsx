import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import {
  Surface,
  Searchbar,
  List,
  Text,
  Avatar,
  Appbar,
  IconButton,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Customer } from '../types';
import { theme } from '../theme';
import { DatabaseService } from '../services/database';
import { useAppContext } from '../context/AppContext';

export const CustomerListScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string>('');

  const { navigateToEntry, navigateToTabs } = useAppContext();

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      if (query.trim() === '') {
        setFilteredCustomers([]);
      } else {
        const filtered = customers.filter(customer =>
          customer.name.toLowerCase().trim().includes(query.toLowerCase().trim())
        );
        setFilteredCustomers(filtered);
      }
    }, 300),
    [customers]
  );

  // Load customers from database
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const allCustomers = await DatabaseService.getAllCustomers();
        setCustomers(allCustomers);
      } catch (error) {
        console.error('Error loading customers:', error);
        setCustomers([]);
        setError('Failed to load customers');
      }
    };

    loadCustomers();
  }, []);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatBalance = (balance: number) => {
    if (balance === 0) return 'Settled';
    if (balance > 0) return `Balance: ₹${balance.toLocaleString()}`;
    else return `Debt: ₹${Math.abs(balance).toLocaleString()}`;
  };

  const formatMetalBalances = (customer: Customer) => {
    const metalBalances = customer.metalBalances;
    if (!metalBalances) {
      return formatBalance(customer.balance);
    }

    const balanceItems: string[] = [];
    const debtItems: string[] = [];

    const metalTypeNames: Record<string, string> = {
      gold999: 'Gold 999',
      gold995: 'Gold 995',
      rani: 'Rani',
      silver: 'Silver',
      silver98: 'Silver 98',
      silver96: 'Silver 96',
      rupu: 'Rupu',
    };

    Object.entries(metalBalances).forEach(([type, balance]) => {
      if (balance && Math.abs(balance) > 0.001) {
        const isGold = type.includes('gold') || type === 'rani';
        const displayName = metalTypeNames[type] || type;
        const formattedBalance = isGold ? Math.abs(balance).toFixed(3) : Math.floor(Math.abs(balance));

        if (balance > 0) {
          balanceItems.push(`${displayName} ${formattedBalance}g`);
        } else {
          debtItems.push(`${displayName} ${formattedBalance}g`);
        }
      }
    });

    const hasMoneyBalance = customer.balance !== 0;
    const hasMetalBalance = balanceItems.length > 0 || debtItems.length > 0;

    if (!hasMoneyBalance && !hasMetalBalance) {
      return 'Settled';
    }

    const parts: string[] = [];

    if (hasMoneyBalance) {
      parts.push(formatBalance(customer.balance));
    }

    if (balanceItems.length > 0) {
      parts.push(`Balance: ${balanceItems.join(', ')}`);
    }

    if (debtItems.length > 0) {
      parts.push(`Debt: ${debtItems.join(', ')}`);
    }

    return parts.join(' | ');
  };

  const handleCustomerPress = (customer: Customer) => {
    navigateToEntry(customer);
  };

  const handleHistoryPress = (customer: Customer) => {
    // For now, navigate back to tabs - user can manually go to History tab
    // TODO: Implement customer-specific history filtering
    navigateToTabs();
  };

  const renderCustomerItem = ({ item }: { item: Customer }) => (
    <Surface style={styles.customerItem} elevation={1}>
      <TouchableOpacity
        style={styles.customerContent}
        onPress={() => handleCustomerPress(item)}
      >
        <Avatar.Text
          size={50}
          label={getInitials(item.name)}
          style={styles.avatar}
          labelStyle={styles.avatarLabel}
        />
        <View style={styles.customerInfo}>
          <Text variant="titleMedium" style={styles.customerName}>
            {item.name}
          </Text>
          <Text variant="bodySmall" style={styles.customerBalance}>
            {formatMetalBalances(item)}
          </Text>
        </View>
      </TouchableOpacity>
      <IconButton
        icon="history"
        size={24}
        onPress={() => handleHistoryPress(item)}
        style={styles.historyButton}
      />
    </Surface>
  );

  const displayedCustomers = searchQuery.trim() === '' ? customers : filteredCustomers;

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={navigateToTabs} />
        <Appbar.Content title="Customers" />
      </Appbar.Header>

      <View style={styles.content}>
        <Searchbar
          placeholder="Search customers..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />

        {error ? (
          <Text variant="bodyMedium" style={styles.errorText}>
            {error}
          </Text>
        ) : (
          <FlatList
            data={displayedCustomers}
            renderItem={renderCustomerItem}
            keyExtractor={item => item.id}
            style={styles.customerList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              searchQuery.trim() !== '' ? (
                <Text variant="bodyMedium" style={styles.noResults}>
                  No customers found
                </Text>
              ) : (
                <Text variant="bodyMedium" style={styles.noResults}>
                  No customers yet
                </Text>
              )
            }
          />
        )}
      </View>
    </View>
  );
};

// Debounce utility function
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.primary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchBar: {
    marginBottom: 16,
    backgroundColor: theme.colors.surface,
  },
  customerList: {
    flex: 1,
  },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  customerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: theme.colors.primary,
    marginRight: 16,
  },
  avatarLabel: {
    color: theme.colors.onPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    color: theme.colors.onSurface,
    fontWeight: '600',
  },
  customerBalance: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  historyButton: {
    margin: 0,
  },
  noResults: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    marginTop: 32,
  },
  errorText: {
    textAlign: 'center',
    color: theme.colors.error,
    marginTop: 32,
  },
});