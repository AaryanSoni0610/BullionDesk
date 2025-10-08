import Realm from 'realm';

// Embedded object for metal balances
export class MetalBalances extends Realm.Object<MetalBalances> {
  gold999?: number;
  gold995?: number;
  rani?: number;
  silver?: number;
  rupu?: number;

  static schema: Realm.ObjectSchema = {
    name: 'MetalBalances',
    embedded: true,
    properties: {
      gold999: 'double?',
      gold995: 'double?',
      rani: 'double?',
      silver: 'double?',
      rupu: 'double?',
    },
  };
}

// Customer schema
export class Customer extends Realm.Object<Customer> {
  id!: string;
  name!: string;
  lastTransaction?: string;
  balance!: number;
  metalBalances?: MetalBalances;
  avatar?: string;

  static schema: Realm.ObjectSchema = {
    name: 'Customer',
    primaryKey: 'id',
    properties: {
      id: 'string',
      name: { type: 'string', indexed: true },
      lastTransaction: 'string?',
      balance: { type: 'double', default: 0 },
      metalBalances: 'MetalBalances?',
      avatar: 'string?',
    },
  };
}

// Embedded object for transaction entries
export class TransactionEntry extends Realm.Object<TransactionEntry> {
  id!: string;
  type!: string; // 'sell' | 'purchase' | 'money'
  itemType!: string; // 'gold999' | 'gold995' | 'rani' | 'silver' | 'rupu' | 'money'
  weight?: number;
  price?: number;
  touch?: number;
  cut?: number;
  extraPerKg?: number;
  pureWeight?: number;
  actualGoldGiven?: number;
  moneyType?: string; // 'give' | 'receive'
  amount?: number;
  rupuReturnType?: string; // 'money' | 'silver'
  silverWeight?: number;
  metalOnly?: boolean;
  stock_id?: string;
  subtotal!: number;
  createdAt?: string;
  lastUpdatedAt?: string;

  static schema: Realm.ObjectSchema = {
    name: 'TransactionEntry',
    embedded: true,
    properties: {
      id: 'string',
      type: 'string',
      itemType: 'string',
      weight: 'double?',
      price: 'double?',
      touch: 'double?',
      cut: 'double?',
      extraPerKg: 'double?',
      pureWeight: 'double?',
      actualGoldGiven: 'double?',
      moneyType: 'string?',
      amount: 'double?',
      rupuReturnType: 'string?',
      silverWeight: 'double?',
      metalOnly: 'bool?',
      stock_id: 'string?',
      subtotal: 'double',
      createdAt: 'string?',
      lastUpdatedAt: 'string?',
    },
  };
}

// Transaction schema
export class Transaction extends Realm.Object<Transaction> {
  id!: string;
  deviceId?: string;
  customerId!: string;
  customerName!: string;
  date!: string;
  entries!: Realm.List<TransactionEntry>;
  discount!: number;
  discountExtraAmount!: number;
  subtotal!: number;
  total!: number;
  amountPaid!: number;
  lastGivenMoney!: number;
  lastToLastGivenMoney!: number;
  settlementType!: string; // 'full' | 'partial' | 'none'
  status!: string; // 'completed' | 'pending'
  createdAt!: string;
  lastUpdatedAt!: string;

  static schema: Realm.ObjectSchema = {
    name: 'Transaction',
    primaryKey: 'id',
    properties: {
      id: 'string',
      deviceId: 'string?',
      customerId: { type: 'string', indexed: true },
      customerName: 'string',
      date: { type: 'string', indexed: true },
      entries: 'TransactionEntry[]',
      discount: { type: 'double', default: 0 },
      discountExtraAmount: { type: 'double', default: 0 },
      subtotal: { type: 'double', default: 0 },
      total: { type: 'double', default: 0 },
      amountPaid: { type: 'double', default: 0 },
      lastGivenMoney: { type: 'double', default: 0 },
      lastToLastGivenMoney: { type: 'double', default: 0 },
      settlementType: 'string',
      status: 'string',
      createdAt: 'string',
      lastUpdatedAt: 'string',
    },
  };
}

// LedgerEntry schema
export class LedgerEntry extends Realm.Object<LedgerEntry> {
  id!: string;
  transactionId!: string;
  customerId!: string;
  customerName!: string;
  date!: string;
  amountReceived!: number;
  amountGiven!: number;
  entries!: Realm.List<TransactionEntry>;
  notes?: string;
  createdAt!: string;

  static schema: Realm.ObjectSchema = {
    name: 'LedgerEntry',
    primaryKey: 'id',
    properties: {
      id: 'string',
      transactionId: { type: 'string', indexed: true },
      customerId: { type: 'string', indexed: true },
      customerName: 'string',
      date: { type: 'string', indexed: true },
      amountReceived: { type: 'double', default: 0 },
      amountGiven: { type: 'double', default: 0 },
      entries: 'TransactionEntry[]',
      notes: 'string?',
      createdAt: 'string',
    },
  };
}

// RaniRupaStock schema
export class RaniRupaStock extends Realm.Object<RaniRupaStock> {
  stock_id!: string;
  itemtype!: string; // 'rani' | 'rupu'
  weight!: number;
  touch!: number;
  date!: string;
  createdAt!: string;

  static schema: Realm.ObjectSchema = {
    name: 'RaniRupaStock',
    primaryKey: 'stock_id',
    properties: {
      stock_id: 'string',
      itemtype: 'string',
      weight: 'double',
      touch: 'double',
      date: 'string',
      createdAt: 'string',
    },
  };
}

// Trade schema
export class Trade extends Realm.Object<Trade> {
  id!: string;
  customerName!: string;
  type!: string; // 'sell' | 'purchase'
  itemType!: string; // 'gold999' | 'gold995' | 'silver' | 'rani' | 'rupu'
  price!: number;
  weight!: number;
  date!: string;
  createdAt!: string;

  static schema: Realm.ObjectSchema = {
    name: 'Trade',
    primaryKey: 'id',
    properties: {
      id: 'string',
      customerName: 'string',
      type: 'string',
      itemType: 'string',
      price: 'double',
      weight: 'double',
      date: { type: 'string', indexed: true },
      createdAt: 'string',
    },
  };
}

// BaseInventory schema (singleton pattern)
export class BaseInventory extends Realm.Object<BaseInventory> {
  id!: string; // Always 'default'
  gold999!: number;
  gold995!: number;
  silver!: number;
  rani!: number;
  rupu!: number;
  money!: number;

  static schema: Realm.ObjectSchema = {
    name: 'BaseInventory',
    primaryKey: 'id',
    properties: {
      id: 'string',
      gold999: { type: 'double', default: 0 },
      gold995: { type: 'double', default: 0 },
      silver: { type: 'double', default: 0 },
      rani: { type: 'double', default: 0 },
      rupu: { type: 'double', default: 0 },
      money: { type: 'double', default: 0 },
    },
  };
}

// Settings schema (optional - can keep in AsyncStorage if preferred)
export class Settings extends Realm.Object<Settings> {
  id!: string; // Always 'default'
  autoBackupEnabled?: boolean;
  storagePermissionGranted?: boolean;
  lastBackupTime?: number;
  lastTransactionId?: string;
  lastTradeId?: string;
  notificationEnabled?: boolean;

  static schema: Realm.ObjectSchema = {
    name: 'Settings',
    primaryKey: 'id',
    properties: {
      id: 'string',
      autoBackupEnabled: 'bool?',
      storagePermissionGranted: 'bool?',
      lastBackupTime: 'int?',
      lastTransactionId: 'string?',
      lastTradeId: 'string?',
      notificationEnabled: 'bool?',
    },
  };
}

// Configuration
export const realmConfig: Realm.Configuration = {
  schema: [
    Customer,
    MetalBalances,
    Transaction,
    TransactionEntry,
    LedgerEntry,
    RaniRupaStock,
    Trade,
    BaseInventory,
    Settings,
  ],
  schemaVersion: 1,
  // path: 'bulliondesk.realm', // Optional: custom path
};

// Helper to initialize Realm
export const getRealm = async (): Promise<Realm> => {
  return await Realm.open(realmConfig);
};

// Helper functions to maintain similar API to your current code

// Example: Get all customers
export const getAllCustomers = async (): Promise<Customer[]> => {
  const realm = await getRealm();
  const customers = realm.objects<Customer>('Customer');
  return Array.from(customers);
};

// Example: Add/Update customer
export const saveCustomer = async (customerData: Partial<Customer>): Promise<void> => {
  const realm = await getRealm();
  realm.write(() => {
    realm.create('Customer', customerData, Realm.UpdateMode.Modified);
  });
};

// Example: Get BaseInventory (singleton)
export const getBaseInventory = async () => {
  const realm = await getRealm();
  let inventory = realm.objectForPrimaryKey<BaseInventory>('BaseInventory', 'default');
  
  if (!inventory) {
    realm.write(() => {
      inventory = realm.create<BaseInventory>('BaseInventory', {
        id: 'default',
        gold999: 0,
        gold995: 0,
        silver: 0,
        rani: 0,
        rupu: 0,
        money: 0,
      });
    });
  }
  
  return inventory;
};

// Example: Update BaseInventory
export const updateBaseInventory = async (updates: Partial<Omit<BaseInventory, 'id'>>) => {
  const realm = await getRealm();
  realm.write(() => {
    realm.create('BaseInventory', { id: 'default', ...updates }, Realm.UpdateMode.Modified);
  });
};

// Example: Query transactions by customer
export const getTransactionsByCustomer = async (customerId: string): Promise<Transaction[]> => {
  const realm = await getRealm();
  const transactions = realm.objects<Transaction>('Transaction')
    .filtered('customerId == $0', customerId)
    .sorted('date', true);
  return Array.from(transactions);
};

// Example: Delete customer
export const deleteCustomer = async (customerId: string): Promise<void> => {
  const realm = await getRealm();
  realm.write(() => {
    const customer = realm.objectForPrimaryKey<Customer>('Customer', customerId);
    if (customer) {
      realm.delete(customer);
    }
  });
};