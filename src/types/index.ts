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
  customerId: string;
  customerName: string;
  date: string;
  entries: TransactionEntry[];
  discount: number;
  subtotal: number;
  total: number;
  amountPaid: number;
  settlementType: 'full' | 'partial' | 'none';
  status: 'completed' | 'pending';
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
}

export type MetalType = 'gold999' | 'gold995' | 'silver' | 'silver98' | 'silver96';
export type ImpureMetalType = 'rani' | 'rupu';
export type ItemType = MetalType | ImpureMetalType;
