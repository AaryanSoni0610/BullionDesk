export interface Customer {
  id: string;
  name: string;
  lastTransaction?: string;
  balance: number; // Positive = customer has credit, Negative = customer owes debt
  metalBalances?: {
    gold999?: number; // Positive = merchant owes customer, Negative = customer owes merchant
    gold995?: number;
    rani?: number; // Stores pure gold equivalent
    silver?: number;
    silver98?: number;
    silver96?: number;
    rupu?: number; // Stores pure silver equivalent
  };
  avatar?: string;
}

export interface Transaction {
  id: string;
  deviceId?: string; // Device ID for conflict-free merging
  customerId: string;
  customerName: string;
  date: string;
  entries: TransactionEntry[];
  discount: number;
  subtotal: number;
  total: number;
  amountPaid: number;
  lastGivenMoney: number; // Current total paid by customer
  lastToLastGivenMoney: number; // Previous total paid (for calculating delta)
  settlementType: 'full' | 'partial' | 'none';
  status: 'completed' | 'pending';
  createdAt: string; // ISO datetime when transaction was created
  lastUpdatedAt: string; // ISO datetime when transaction was last updated
}

export interface TransactionEntry {
  id: string;
  type: 'sell' | 'purchase' | 'money';
  itemType: 'gold999' | 'gold995' | 'rani' | 'silver' | 'silver98' | 'silver96' | 'rupu';
  weight?: number;
  price?: number;
  touch?: number; // For Rani/Rupu
  extraPerKg?: number; // For Rupu bonus
  pureWeight?: number; // Calculated for impure metals
  actualGoldGiven?: number; // For Rani sell entries
  moneyType?: 'debt' | 'balance'; // For money entries
  amount?: number; // For money entries
  rupuReturnType?: 'money' | 'silver'; // For Rupu purchase entries
  silver98Weight?: number; // For Rupu silver return
  silverWeight?: number; // For Rupu silver return
  netWeight?: number; // For Rupu silver return calculation
  metalOnly?: boolean; // For metal-only transactions (no money involved)
  subtotal: number;
  createdAt?: string; // ISO datetime when entry was created
  lastUpdatedAt?: string; // ISO datetime when entry was last updated
}

export type MetalType = 'gold999' | 'gold995' | 'silver' | 'silver98' | 'silver96';
export type ImpureMetalType = 'rani' | 'rupu';
export type ItemType = MetalType | ImpureMetalType;

// Ledger Entry - tracks each transaction update for accurate daily cash flow
export interface LedgerEntry {
  id: string; // Unique ID for this ledger entry
  transactionId: string; // Reference to the transaction
  customerId: string;
  customerName: string;
  date: string; // ISO datetime - serves as primary sorting key
  amountReceived: number; // Money received from customer (positive)
  amountGiven: number; // Money given to customer (positive)
  entries: TransactionEntry[]; // Copy of transaction entries at this point
  notes?: string;
  createdAt: string; // Same as date for ledger entries
}
