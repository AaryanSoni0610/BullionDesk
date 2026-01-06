import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Modal,
  Portal,
  Searchbar,
  List,
  Button,
  Text,
  Avatar,
  Divider,
  IconButton,
  Surface,
  ActivityIndicator
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Customer } from '../types';
import { theme } from '../theme';
import { CustomerService } from '../services/customer.service';
import { formatIndianNumber, formatPureGold, formatPureSilver } from '../utils/formatting';

interface CustomerSelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectCustomer: (customer: Customer) => void;
  onCreateCustomer: (name: string) => void;
  allowCreateCustomer?: boolean;
  filterFn?: (customer: Customer) => boolean;
}

export const CustomerSelectionModal: React.FC<CustomerSelectionModalProps> = ({
  visible,
  onDismiss,
  onSelectCustomer,
  onCreateCustomer,
  allowCreateCustomer = true,
  filterFn,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [slideAnim] = useState(new Animated.Value(Dimensions.get('window').height));
  const [error, setError] = useState<string>('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  // Validation Logic
  const validateCustomerName = (name: string): string => {
    if (!name.trim()) return 'Customer name is required';
    if (name.trim().length < 2) return 'Customer name must be at least 2 characters';
    if (name.length > 50) return 'Customer name cannot exceed 50 characters';
    if (!/^[a-zA-Z0-9\s\-\.]+$/.test(name)) return 'Customer name contains invalid characters';
    return '';
  };

  function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  const filterCustomers = useCallback(async (query: string) => {
    if (query.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      const filtered = await CustomerService.searchCustomersByName(query);
      const validFiltered = filtered.filter(c => c.name.toLowerCase() !== 'adjust');
      if (filterFn) {
        setFilteredCustomers(validFiltered.filter(filterFn));
      } else {
        setFilteredCustomers(validFiltered);
      }
    }
  }, [customers, filterFn]);

  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      await filterCustomers(query);
    }, 300),
    [filterCustomers]
  );

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: Dimensions.get('window').height, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        let expenseCustomer = await CustomerService.getCustomerByName('Expense(Kharch)');
        if (!expenseCustomer) {
             expenseCustomer = {
                id: `expense_${Date.now()}`,
                name: 'Expense(Kharch)',
                balance: 0,
                metalBalances: { gold999: 0, gold995: 0, silver: 0 }
             };
             await CustomerService.saveCustomer(expenseCustomer);
        }

        const allCustomers = await CustomerService.getAllCustomers();
        const validCustomers = allCustomers.filter(c => c.name.toLowerCase() !== 'adjust');
        
        if (filterFn) {
            setCustomers(validCustomers.filter(filterFn));
        } else {
            setCustomers(validCustomers);
        }
        
        const recentCust = await CustomerService.getRecentCustomers(10, ['adjust']);
        if (filterFn) {
            setRecentCustomers(recentCust.filter(filterFn));
        } else {
            setRecentCustomers(recentCust);
        }
      } catch (error) {
        console.error('Error loading customers:', error);
        setCustomers([]);
        setRecentCustomers([]);
      }
    };

    if (visible) {
      loadCustomers();
    }
  }, [visible]);

  useEffect(() => {
    if (searchQuery.trim() === '' && customers.length > 0) {
      setFilteredCustomers(customers);
    }
  }, [customers, searchQuery]);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  const handleSelectCustomer = (customer: Customer) => {
    setSearchQuery('');
    setFilteredCustomers([]);
    onSelectCustomer(customer);
  };

  const handleCreateCustomer = async () => {
    const customerName = searchQuery.trim();
    const validationResult = validateCustomerName(customerName);
    
    if (validationResult) {
      setValidationError(validationResult);
      return;
    }

    const existingCustomer = customers.find(
      customer => customer.name.toLowerCase() === customerName.toLowerCase()
    );
    
    if (existingCustomer) {
      setValidationError('Customer with this name already exists');
      return;
    }

    setIsCreatingCustomer(true);
    setValidationError('');
    
    try {
      setSearchQuery('');
      setFilteredCustomers([]);
      onCreateCustomer(customerName);
    } catch (error) {
      setError('Failed to create customer. Please try again.');
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleCancel = () => {
    setSearchQuery('');
    setFilteredCustomers([]);
    onDismiss();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatLastTransaction = (date?: string) => {
    if (!date) return 'No transactions';
    const d = new Date(date);
    return `Last: ${d.getDate()} ${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
  };

  // --- NEW: Custom Balance Renderer for "Expressive" List ---
  const BalanceRow = ({ customer }: { customer: Customer }) => {
    const parts: React.ReactNode[] = [];
    let hasData = false;

    // 1. Money
    if (customer.balance > 0) {
       parts.push(
         <Text key="money" style={styles.balGreen}>Bal: ₹{formatIndianNumber(customer.balance)}</Text>
       );
       hasData = true;
    } else if (customer.balance < 0) {
       parts.push(
         <Text key="money" style={styles.balRed}>Debt: ₹{formatIndianNumber(Math.abs(customer.balance))}</Text>
       );
       hasData = true;
    }

    // 2. Metal Balances - Separate positive and negative
    if (customer.metalBalances) {
      const metalTypeNames: Record<string, string> = {
        gold999: 'Gold999', gold995: 'Gold995', rani: 'Rani', silver: 'Silver', rupu: 'Rupu',
      };

      const positiveMetals: Array<{type: string, balance: number, label: string}> = [];
      const negativeMetals: Array<{type: string, balance: number, label: string}> = [];

      Object.entries(customer.metalBalances).forEach(([type, balance]) => {
        if (typeof balance !== 'number' || Math.abs(balance) <= 0.001) return;

        const displayName = metalTypeNames[type] || type;
        let formattedWeight = '';

        if (type === 'rani') formattedWeight = formatPureGold(Math.abs(balance)).toFixed(3);
        else if (type === 'rupu') formattedWeight = formatPureSilver(Math.abs(balance)).toFixed(1);
        else if (type.includes('gold')) formattedWeight = Math.abs(balance).toFixed(3);
        else formattedWeight = Math.floor(Math.abs(balance)).toString();

        const label = `${displayName} ${formattedWeight}g`;

        if (balance > 0) {
          positiveMetals.push({ type, balance, label });
        } else {
          negativeMetals.push({ type, balance, label });
        }
      });

      // Add positive metals first
      positiveMetals.forEach(({ type, label }) => {
        if (parts.length > 0) {
          parts.push(<Text key={`sep-pos-${type}`} style={styles.balSeparator}> • </Text>);
        }
        parts.push(<Text key={`pos-${type}`} style={styles.balGreen}>Bal: {label}</Text>);
        hasData = true;
      });

      // Add negative metals after
      negativeMetals.forEach(({ type, label }) => {
        if (parts.length > 0) {
          parts.push(<Text key={`sep-neg-${type}`} style={styles.balSeparator}> • </Text>);
        }
        parts.push(<Text key={`neg-${type}`} style={styles.balRed}>Debt: {label}</Text>);
        hasData = true;
      });
    }

    if (!hasData) return <Text style={styles.balSettled}>Settled</Text>;

    return (
       <View style={styles.balanceContainer}>
          {parts}
       </View>
    );
  };

  const showCreateButton = allowCreateCustomer && searchQuery.trim() !== '' && 
    !filteredCustomers.some(c => c.name.toLowerCase() === searchQuery.trim().toLowerCase()) &&
    searchQuery.trim().toLowerCase() !== 'adjust';

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    return (
      <List.Item
        title={item.name}
        description={() => (
          <View>
             <Text style={styles.customerMeta}>
                {formatLastTransaction(item.lastTransaction)}
             </Text>
             <BalanceRow customer={item} />
          </View>
        )}
        left={() => (
          <Avatar.Text
            size={40}
            label={getInitials(item.name)}
            style={styles.avatar}
            labelStyle={styles.avatarLabel}
          />
        )}
        onPress={() => handleSelectCustomer(item)}
        style={styles.customerItem}
        titleStyle={styles.customerName}
        rippleColor={theme.colors.primaryContainer}
      />
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleCancel}
        contentContainerStyle={styles.modalOverlay}
        dismissable={true}
      >
        <KeyboardAvoidingView 
           behavior={Platform.OS === "ios" ? "padding" : "height"}
           style={styles.keyboardAvoidingView}
        >
            <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
              {/* Header */}
              <View style={styles.headerSection}>
                <View style={styles.dragHandle} />
                <Text variant="titleMedium" style={styles.title}>Select Customer</Text>
                
                <Searchbar
                  placeholder="Search or create customer..."
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setValidationError('');
                    setError('');
                  }}
                  value={searchQuery}
                  style={[styles.searchBar, validationError ? styles.searchBarError : null]}
                  inputStyle={styles.searchInput}
                  iconColor={theme.colors.onSurfaceVariant}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  right={() => searchQuery ? (
                    <IconButton
                      icon="close-circle"
                      size={20}
                      onPress={() => { setSearchQuery(''); setValidationError(''); }}
                    />
                  ) : null}
                />
                
                {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </View>
              
              {/* List */}
              <View style={styles.resultsContainer}>
                {showCreateButton && (
                  <Button
                    mode="contained-tonal"
                    icon={isCreatingCustomer ? undefined : "account-plus"}
                    onPress={handleCreateCustomer}
                    style={styles.createButton}
                    loading={isCreatingCustomer}
                    disabled={isCreatingCustomer || !!validationError}
                    rippleColor="transparent"
                  >
                    {isCreatingCustomer ? 'Creating...' : `Create "${searchQuery}"`}
                  </Button>
                )}
                
                <FlatList
                    data={searchQuery.trim() === '' ? customers : filteredCustomers} // Show all if no search
                    renderItem={renderCustomerItem}
                    keyExtractor={item => item.id}
                    style={styles.customerList}
                    contentContainerStyle={{ paddingBottom: 16 }}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                        searchQuery.trim() === '' ? 
                        <Text style={styles.sectionLabel}>All Customers</Text> : null
                    }
                    ListEmptyComponent={
                        !showCreateButton ? (
                            <Text style={styles.noResults}>No customers found</Text>
                        ) : null
                    }
                />
              </View>
              
              {/* Footer */}
              <View style={styles.bottomSection}>
                <Button
                  mode="contained-tonal"
                  onPress={handleCancel}
                  style={styles.cancelButton}
                  contentStyle={{ height: 48 }}
                >
                  Cancel
                </Button>
              </View>
            </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)', // Dim background
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '85%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    elevation: 24,
  },
  
  // Header
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: theme.colors.surface,
  },
  dragHandle: {
    width: 32,
    height: 4,
    backgroundColor: theme.colors.outline,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.5,
  },
  title: {
    textAlign: 'center',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    marginBottom: 20,
    color: theme.colors.onSurface,
  },
  searchBar: {
    borderRadius: 100, // Pill shape
    backgroundColor: theme.colors.surfaceVariant, // Slightly darker than surface
    elevation: 0,
    height: 52,
  },
  searchInput: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 16,
    alignSelf: 'center', // Center text vertically
  },
  searchBarError: {
    borderWidth: 1,
    borderColor: theme.colors.error,
  },

  // List Items
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 0, // List items handle their own padding
  },
  sectionLabel: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  customerList: {
    flex: 1,
  },
  customerItem: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  customerName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: theme.colors.onSurface,
  },
  customerMeta: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    opacity: 0.8,
    marginBottom: 2,
  },
  avatar: {
    backgroundColor: theme.colors.primary,
    marginRight: 8,
  },
  avatarLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: theme.colors.onPrimary,
  },

  // Balance Row Styles
  balanceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  balGreen: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    color: theme.colors.success,
  },
  balRed: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    color: theme.colors.error,
  },
  balMetal: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    color: '#44474F', // Dark Grey
  },
  balSettled: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    color: theme.colors.primary,
  },
  balSeparator: {
    fontSize: 12,
    color: theme.colors.outline,
  },

  // Buttons & States
  createButton: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    minWidth: 250,
    alignSelf: 'center',
    height: 48,
    alignContent: 'center',
    justifyContent: 'center',
    borderRadius: 100,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: 'Outfit_500Medium',
    color: theme.colors.onSurfaceVariant,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
    marginLeft: 16,
    marginTop: 4,
    fontFamily: 'Outfit_400Regular',
  },

  // Footer
  bottomSection: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline + '20', // Very faint border
    backgroundColor: theme.colors.surface,
  },
  cancelButton: {
    borderRadius: 100,
    backgroundColor: theme.colors.surfaceVariant,
  },
});