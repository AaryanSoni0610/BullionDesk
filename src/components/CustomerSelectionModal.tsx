import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Keyboard,
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
} from 'react-native-paper';
import { Customer } from '../types';
import { theme } from '../theme';
import { DatabaseService } from '../services/database';

interface CustomerSelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectCustomer: (customer: Customer) => void;
  onCreateCustomer: (name: string) => void;
}

export const CustomerSelectionModal: React.FC<CustomerSelectionModalProps> = ({
  visible,
  onDismiss,
  onSelectCustomer,
  onCreateCustomer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [slideAnim] = useState(new Animated.Value(Dimensions.get('window').height));

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
        const allCustomers = await DatabaseService.getAllCustomers();
        setCustomers(allCustomers);
        
        // Sort by last transaction date for recent customers
        const sortedByTransaction = [...allCustomers].sort((a, b) => {
          if (!a.lastTransaction && !b.lastTransaction) return 0;
          if (!a.lastTransaction) return 1;
          if (!b.lastTransaction) return -1;
          return new Date(b.lastTransaction).getTime() - new Date(a.lastTransaction).getTime();
        });
        
        setRecentCustomers(sortedByTransaction.slice(0, 5)); // Show 5 most recent
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

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCustomers([]);
    } else {
      const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCustomers(filtered);
    }
  }, [searchQuery, customers]);

  const handleSelectCustomer = (customer: Customer) => {
    setSearchQuery('');
    setFilteredCustomers([]);
    onSelectCustomer(customer);
  };

  const handleCreateCustomer = () => {
    if (searchQuery.trim()) {
      const customerName = searchQuery.trim();
      setSearchQuery('');
      setFilteredCustomers([]);
      onCreateCustomer(customerName);
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
    if (balance === 0) return 'Balance: ₹0';
    if (balance > 0) return `Balance: ₹${balance.toLocaleString()}`;
    return `Debt: ₹${Math.abs(balance).toLocaleString()}`;
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return theme.colors.balanceColor;
    if (balance < 0) return theme.colors.debtColor;
    return theme.colors.onSurfaceVariant;
  };

  const formatLastTransaction = (date?: string) => {
    if (!date) return 'No transactions';
    return `Last: ${new Date(date).toLocaleDateString()}`;
  };

  const showCreateButton = searchQuery.trim() !== '' && 
    !filteredCustomers.some(c => c.name.toLowerCase() === searchQuery.toLowerCase());

  const showRecentCustomers = searchQuery.trim() === '' && recentCustomers.length > 0;

  const renderCustomerItem = ({ item }: { item: Customer }) => (
    <List.Item
      title={item.name}
      description={() => (
        <View>
          <Text variant="bodySmall" style={styles.customerDescription}>
            {formatLastTransaction(item.lastTransaction)}
          </Text>
          <Text 
            variant="bodySmall" 
            style={[
              styles.customerDescription,
              { color: getBalanceColor(item.balance) }
            ]}
          >
            {formatBalance(item.balance)}
          </Text>
        </View>
      )}
      left={() => (
        <Avatar.Text
          size={40}
          label={getInitials(item.name)}
          style={styles.avatar}
        />
      )}
      onPress={() => handleSelectCustomer(item)}
      style={styles.customerItem}
      titleStyle={styles.customerName}
    />
  );

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
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchBar}
              inputStyle={styles.searchInput}
              autoFocus
            />
          </View>
          
          {/* Scrollable Results */}
          <View style={styles.resultsContainer}>
            {showCreateButton && (
              <Button
                mode="contained-tonal"
                icon="account-plus"
                onPress={handleCreateCustomer}
                style={styles.createButton}
                contentStyle={styles.createButtonContent}
              >
                Create "{searchQuery}"
              </Button>
            )}
            
            {showRecentCustomers && (
              <>
                <Text variant="labelMedium" style={styles.sectionLabel}>
                  All Customers
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
              <FlatList
                data={filteredCustomers}
                renderItem={renderCustomerItem}
                keyExtractor={item => item.id}
                style={styles.customerList}
                showsVerticalScrollIndicator={false}
              />
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
    fontWeight: '500',
  },
  customerDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  avatar: {
    marginRight: theme.spacing.sm,
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
});
