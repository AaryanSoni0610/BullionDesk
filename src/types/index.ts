export interface Customer {
  id: string;
  name: string;
  lastTransaction?: string;
  balance: number; // Positive = customer has credit, Negative = customer owes debt
  metalBalances?: {
    gold999?: number; // Positive = merchant owes customer, Negative = customer owes merchant
    gold995?: number;
    silver?: number;
  };
  last_gold999_lock_date?: number;
  last_gold995_lock_date?: number;
  last_silver_lock_date?: number;
  avatar?: string;
}

export interface PaymentInput {
  id?: string;
  amount: number;
  date: string;
  type: 'receive' | 'give';
}

export interface Transaction {
  id: string;
  deviceId?: string; // Device ID for conflict-free merging
  customerId: string;
  customerName: string;
  date: string;
  entries: TransactionEntry[];
  total: number;
  amountPaid: number;
  deleted_on?: string; // Date when transaction was deleted (soft delete)
  note?: string; // Optional note for the transaction
  createdAt: string; // ISO datetime when transaction was created
  lastUpdatedAt: string; // ISO datetime when transaction was last updated
  customerLockDates?: {
    gold999?: number;
    gold995?: number;
    silver?: number;
  };
}

export interface TransactionEntry {
  id: string;
  type: 'sell' | 'purchase' | 'money';
  itemType: 'gold999' | 'gold995' | 'rani' | 'silver' | 'rupu' | 'money';
  weight?: number;
  price?: number;
  touch?: number; // For Rani/Rupu
  cut?: number; // For Rani purchase - cut percentage (cannot exceed touch)
  extraPerKg?: number; // For Rupu bonus
  pureWeight?: number; // Calculated for impure metals
  moneyType?: 'give' | 'receive'; // For money entries: 'give' = merchant gives money (outward), 'receive' = merchant receives money (inward)
  amount?: number; // For money entries
  metalOnly?: boolean; // For metal-only transactions (no money involved)
  stock_id?: string; // For Rani/Rupu entries - links to stock item
  rupuReturnType?: 'money' | 'silver'; // For Rupu entries - how merchant returns value
  silverWeight?: number; // For Rupu entries when return type is silver
  netWeight?: number; // For Rupu entries - calculated net weight after silver return
  subtotal: number;
  createdAt?: string; // ISO datetime when entry was created
  lastUpdatedAt?: string; // ISO datetime when entry was last updated
}

export type ItemType = 'gold999' | 'gold995' | 'silver' | 'rani' | 'rupu' | 'money';

// Trade Entry - separate from main transaction system
export interface Trade {
  id: string;
  customerName: string;
  type: 'sell' | 'purchase';
  itemType: 'gold999' | 'gold995' | 'silver' | 'rani' | 'rupu';
  price: number; // Price per 10g (gold/rani) or per kg (silver/rupu)
  weight: number; // Weight in grams
  date: string;
  createdAt: string;
}

// Ledger Entry - tracks each transaction update for accurate daily cash flow
export interface LedgerEntry {
  id: string; // Unique ID for this ledger entry
  transactionId: string; // Reference to the transaction
  customerId: string;
  customerName: string;
  date: string; // ISO datetime - serves as primary sorting key
  type: 'sell' | 'purchase' | 'receive' | 'give';
  itemType: 'gold999' | 'gold995' | 'rani' | 'silver' | 'rupu' | 'money';
  weight?: number;
  touch?: number;
  amount?: number; // For money entries
  createdAt: string; // Same as date for ledger entries
}

// Rani-Rupa Stock Entry - tracks individual stock items
export interface RaniRupaStock {
  stock_id: string; // Unique stock identifier
  itemtype: 'rani' | 'rupu'; // Type of item
  weight: number; // Weight in grams
  touch: number; // Touch percentage (purity)
  date: string; // Date when stock was added
  createdAt: string; // ISO datetime when stock was created
  isSold?: boolean; // Whether the stock item has been sold
}
