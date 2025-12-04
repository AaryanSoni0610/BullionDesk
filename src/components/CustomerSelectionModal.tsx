import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Animated,
  Dimensions,
} from 'react-native';
import {
  Modal,
  Portal,
  Surface,
  Searchbar,
  List,
  Button,
  Text,
  Avatar,
  Divider,
  IconButton,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Customer } from '../types';
import { theme } from '../theme';
import { CustomerService } from '../services/customer.service';
import { formatIndianNumber } from '../utils/formatting';

interface CustomerSelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectCustomer: (customer: Customer) => void;
  onCreateCustomer: (name: string) => void;
  allowCreateCustomer?: boolean;
}

export const CustomerSelectionModal: React.FC<CustomerSelectionModalProps> = ({
  visible,
  onDismiss,
  onSelectCustomer,
  onCreateCustomer,
  allowCreateCustomer = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [slideAnim] = useState(new Animated.Value(Dimensions.get('window').height));
  const [error, setError] = useState<string>('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  // Enhanced validation functions
  const validateCustomerName = (name: string): string => {
    if (!name.trim()) {
      return 'Customer name is required';
    }
    if (name.trim().length < 2) {
      return 'Customer name must be at least 2 characters';
    }
    if (name.length > 50) {
      return 'Customer name cannot exceed 50 characters';
    }
    if (!/^[a-zA-Z0-9\s\-\.]+$/.test(name)) {
      return 'Customer name contains invalid characters';
    }
    return '';
  };

  // Debounce utility function
  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  // Enhanced filter function with database search
  const filterCustomers = useCallback(async (query: string) => {
    if (query.trim() === '') {
      // Show all customers when no search query
      setFilteredCustomers(customers);
    } else {
      // Use database-level search instead of in-memory filtering
      const filtered = await CustomerService.searchCustomers(query, ['adjust'], 50);
      setFilteredCustomers(filtered);
    }
  }, [customers]);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      await filterCustomers(query);
    }, 300),
    [filterCustomers]
  );

  // Animation effect
  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get('window').height,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  // Load customers from database
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        // Load all customers excluding 'adjust' at database level
        const allCustomers = await CustomerService.getAllCustomersExcluding(['adjust']);
        setCustomers(allCustomers);
        
        // Get recent customers with database-level filtering and sorting
        const recentCust = await CustomerService.getRecentCustomers(5, ['adjust']);
        setRecentCustomers(recentCust);
      } catch (error) {
        console.error('Error loading customers:', error);
        // Fallback to empty state
        setCustomers([]);
        setRecentCustomers([]);
      }
    };

    if (visible) {
      loadCustomers();
    }
  }, [visible]);

  // Update filtered customers when customers list changes and no search query
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

    // Check if customer already exists
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

  const formatBalance = (balance: number) => {
    if (balance === 0) return 'Settled';
    if (balance < 0) return `Balance: ₹${formatIndianNumber(balance)}`; // Merchant owes customer
    else return `Debt: ₹${formatIndianNumber(Math.abs(balance))}`; // Customer owes merchant
  };

  const formatMetalBalances = (customer: Customer) => {
    const metalBalances = customer.metalBalances;
    if (!metalBalances) {
      return formatBalance(customer.balance);
    }
    
    const balanceItems: string[] = []; // Merchant owes customer (positive)
    const debtItems: string[] = []; // Customer owes merchant (negative)
    
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
    
    // Check if both money and metal balances are zero
    const hasMoneyBalance = customer.balance !== 0;
    const hasMetalBalance = balanceItems.length > 0 || debtItems.length > 0;

    if (!hasMoneyBalance && !hasMetalBalance) {
      return 'Settled';
    }
    
    const parts: string[] = [];
    
    // Add money balance/debt first
    if (customer.balance > 0) {
      parts.push(`Balance: ₹${formatIndianNumber(Math.abs(customer.balance))}`);
    } else if (customer.balance < 0) {
      parts.push(`Debt: ₹${formatIndianNumber(Math.abs(customer.balance))}`);
    }
    
    // Add metal balance
    if (balanceItems.length > 0) {
      parts.push(`Balance: ${balanceItems.join(', ')}`);
    }
    
    // Add metal debt
    if (debtItems.length > 0) {
      parts.push(`Debt: ${debtItems.join(', ')}`);
    }
    
    return parts.join('; ');
  };

  const formatLastTransaction = (date?: string) => {
    if (!date) return 'No transactions';
    return `Last: ${new Date(date).toLocaleDateString()}`;
  };

  const showCreateButton = allowCreateCustomer && searchQuery.trim() !== '' && 
    !filteredCustomers.some(c => c.name.toLowerCase() === searchQuery.trim().toLowerCase()) &&
    searchQuery.trim().toLowerCase() !== 'adjust';

  const showRecentCustomers = false; // Disabled since we now show all customers when no search query

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const balanceText = formatMetalBalances(item);
    
    return (
      <List.Item
        title={item.name}
        description={() => (
          <View>
            <Text variant="bodySmall" style={styles.customerDescription}>
              {formatLastTransaction(item.lastTransaction)}
            </Text>
            <Text 
              variant="bodySmall" 
              style={styles.customerDescription}
            >
              {balanceText}
            </Text>
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
      />
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleCancel}
        contentContainerStyle={styles.modalContainer}
        dismissable={true}
      >
        <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
          {/* Header Section */}
          <View style={styles.headerSection}>
            {/* Drag Handle */}
            <View style={styles.dragHandle} />
            
            {/* Title */}
            <Text variant="titleMedium" style={styles.title}>
              Select Customer
            </Text>
            
            <Divider style={styles.divider} />
            
            {/* Search Input */}
            <Searchbar
              placeholder="Search or create customer..."
              onChangeText={(text) => {
                setSearchQuery(text);
                setValidationError('');
                setError('');
              }}
              value={searchQuery}
              style={[
                styles.searchBar,
                validationError ? styles.searchBarError : null
              ]}
              inputStyle={styles.searchInput}
              autoFocus
              right={() => searchQuery ? (
                <IconButton
                  icon="close"
                  size={20}
                  onPress={() => {
                    setSearchQuery('');
                    setValidationError('');
                  }}
                />
              ) : null}
            />
            
            {/* Validation Error */}
            {validationError ? (
              <Text variant="bodySmall" style={styles.errorText}>
                {validationError}
              </Text>
            ) : null}
            
            {/* Network Error */}
            {error ? (
              <Surface style={styles.errorBanner}>
                <MaterialCommunityIcons name="alert-circle" size={20} color={theme.colors.error} />
                <Text variant="bodySmall" style={[styles.errorText, { marginLeft: 8 }]}>
                  {error}
                </Text>
              </Surface>
            ) : null}
          </View>
          
          {/* Scrollable Results */}
          <View style={styles.resultsContainer}>
            {showCreateButton && (
              <Button
                mode="contained-tonal"
                icon={isCreatingCustomer ? undefined : "account-plus"}
                onPress={handleCreateCustomer}
                style={styles.createButton}
                contentStyle={styles.createButtonContent}
                disabled={isCreatingCustomer || !!validationError}
                loading={isCreatingCustomer}
              >
                {isCreatingCustomer ? 'Creating...' : `Create "${searchQuery}"`}
              </Button>
            )}
            
            {showRecentCustomers && (
              <>
                <Text variant="labelMedium" style={styles.sectionLabel}>
                  Recent Customers
                </Text>
                <FlatList
                  data={recentCustomers}
                  renderItem={renderCustomerItem}
                  keyExtractor={item => item.id}
                  style={styles.customerList}
                  showsVerticalScrollIndicator={false}
                />
              </>
            )}
            
            {filteredCustomers.length > 0 && (
              <>
                {searchQuery.trim() === '' && (
                  <Text variant="labelMedium" style={styles.sectionLabel}>
                    All Customers
                  </Text>
                )}
                <FlatList
                  data={filteredCustomers}
                  renderItem={renderCustomerItem}
                  keyExtractor={item => item.id}
                  style={styles.customerList}
                  showsVerticalScrollIndicator={false}
                />
              </>
            )}
            
            {searchQuery.trim() !== '' && filteredCustomers.length === 0 && !showCreateButton && (
              <Text variant="bodyMedium" style={styles.noResults}>
                No customers found
              </Text>
            )}
          </View>
          
          {/* Fixed Cancel Button at Bottom */}
          <View style={styles.bottomSection}>
            <Button
              mode="contained-tonal"
              onPress={handleCancel}
              style={styles.cancelButton}
              contentStyle={styles.cancelButtonContent}
            >
              Cancel
            </Button>
          </View>
        </Animated.View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    height: '80%',
    minHeight: 400,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.colors.surface,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    paddingTop: theme.spacing.sm,
    display: 'flex',
    flexDirection: 'column',
  },
  dragHandle: {
    width: 32,
    height: 4,
    backgroundColor: theme.colors.onSurfaceVariant,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  headerSection: {
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    color: theme.colors.onSurface,
  },
  divider: {
    marginBottom: theme.spacing.md,
  },
  searchBar: {
    borderRadius: 28,
    marginBottom: theme.spacing.md,
  },
  searchInput: {
    textAlign: 'left',
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  createButton: {
    borderRadius: 28,
    marginBottom: theme.spacing.md,
  },
  createButtonContent: {
    paddingVertical: theme.spacing.sm,
  },
  bottomSection: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
    paddingTop: theme.spacing.md,
  },
  sectionLabel: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
  },
  customerList: {
    flex: 1,
  },
  customerItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  customerName: {
    fontSize: 16,
    fontFamily: 'Roboto_500Medium',
  },
  customerDescription: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Roboto_400Regular',
  },
  avatar: {
    marginRight: theme.spacing.sm,
  },
  avatarLabel: {
    fontFamily: 'Roboto_400Regular',
  },
  noResults: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.lg,
  },
  cancelButton: {
    borderRadius: 28,
  },
  cancelButtonContent: {
    paddingVertical: theme.spacing.sm,
  },
  
  // Part 5 Enhanced Styles - Validation & Error Handling
  searchBarError: {
    borderColor: theme.colors.error,
    borderWidth: 2,
  },
  errorText: {
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
    fontSize: 12,
  },
  errorBanner: {
    backgroundColor: `${theme.colors.error}12`,
    padding: theme.spacing.sm,
    borderRadius: 8,
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
