# Balance Sign Convention Documentation

## Overview

This document describes the sign convention used throughout the BullionDesk application for customer balances and transaction calculations.

## Core Principle

**Customer Balance Sign Convention:**
- **Positive value (+)**: Customer has **BALANCE** = Merchant owes money to customer
- **Negative value (-)**: Customer has **DEBT** = Customer owes money to merchant
- **Zero (0)**: Account is settled

## Database Schema

### customer_balances Table
```sql
CREATE TABLE customer_balances (
  customer_id TEXT PRIMARY KEY,
  balance INTEGER, -- In paise. Positive = customer credit, Negative = customer debt
  gold999 INTEGER,
  gold995 INTEGER,
  silver INTEGER,
  rani INTEGER,
  rupu INTEGER
);
```

### Money Balance Examples
- `balance = 50000` (in paise) → Customer has ₹500 balance (merchant owes customer)
- `balance = -50000` (in paise) → Customer has ₹500 debt (customer owes merchant)
- `balance = 0` → Account is settled

## Transaction Balance Calculations

### 1. Money-Only Transactions

**Formula:**
```typescript
finalBalance = receivedAmount
```

**Logic:**
- `receivedAmount > 0` → Merchant receives money → Customer balance increases (positive direction)
- `receivedAmount < 0` → Merchant gives money → Customer balance decreases (negative direction)

**Examples:**
- Customer gives ₹1000 → `receivedAmount = 100000` → `finalBalance = +100000` → Customer has ₹1000 **BALANCE**
- Merchant gives ₹500 → `receivedAmount = -50000` → `finalBalance = -50000` → Customer has ₹500 **DEBT**

### 2. Regular Transactions (Sell/Purchase)

**Formula:**
```typescript
finalBalance = receivedAmount - netAmount + discountExtraAmount
```

**Where:**
- `netAmount` = Total value of items (positive for sell, negative for purchase)
- `receivedAmount` = Money paid by customer (positive = received, negative = given)
- `discountExtraAmount` = Discount amount (positive) or extra charge (negative)

**Sell Transaction Example:**
Customer buys gold worth ₹10,000, pays ₹3,000:
```
netAmount = 1000000 (₹10,000 sell)
receivedAmount = 300000 (₹3,000 received)
discountExtraAmount = 0
finalBalance = 300000 - 1000000 + 0 = -700000
Result: Customer has ₹7,000 DEBT (owes merchant)
```

**Purchase Transaction Example:**
Merchant buys gold worth ₹5,000 from customer, pays ₹2,000:
```
netAmount = -500000 (₹5,000 purchase)
receivedAmount = -200000 (₹2,000 given to customer)
discountExtraAmount = 0
finalBalance = -200000 - (-500000) + 0 = 300000
Result: Customer has ₹3,000 BALANCE (merchant owes)
```

### 3. Metal-Only Transactions

Metal balances follow the same sign convention:
- **Positive weight**: Merchant owes metal to customer
- **Negative weight**: Customer owes metal to merchant

## UI Display Logic

### Balance/Debt Label Determination

```typescript
if (balance > 0) {
  label = "Balance";
  color = green; // Success color
} else if (balance < 0) {
  label = "Debt";
  color = orange; // Debt color
} else {
  label = "Settled";
  color = gray;
}

displayValue = Math.abs(balance); // Always show positive number
```

### Transaction Remaining Calculation

**For regular transactions:**
```typescript
transactionRemaining = amountPaid - total + discount;
const isDebt = transactionRemaining < 0;
```

**For money-only transactions:**
```typescript
transactionRemaining = amountPaid;
const isBalance = transactionRemaining > 0;
```

## Business Logic Flow

### Transaction Creation
1. Calculate net amount from entries
2. Capture amount paid/received
3. Apply discount/extra
4. Calculate final balance using formula
5. Update customer balance in database

### Balance Update on Edit
```typescript
// When editing a transaction
const oldBalanceEffect = oldTransaction.amountPaid - oldTransaction.total + oldTransaction.discount;
const newBalanceEffect = newTransaction.amountPaid - newTransaction.total + newTransaction.discount;
const balanceChange = newBalanceEffect - oldBalanceEffect;

customerBalance += balanceChange;
```

### Balance Update on Delete
```typescript
// When deleting a transaction
const balanceEffect = transaction.amountPaid - transaction.total + transaction.discount;
customerBalance -= balanceEffect; // Reverse the effect
```

### Balance Update on Restore
```typescript
// When restoring a deleted transaction
const balanceEffect = transaction.amountPaid - transaction.total + transaction.discount;
customerBalance += balanceEffect; // Reapply the effect
```

## Inventory Money Tracking

**Money Inventory Sign Convention:**
- **Positive**: Merchant has money (inflow)
- **Negative**: Merchant owes money (outflow)

**Calculation from ledger entries:**
```typescript
moneyInventory = Σ(amountReceived) - Σ(amountGiven)
```

**Where:**
- `amountReceived` = Money received by merchant (from ledger_entries)
- `amountGiven` = Money given by merchant (from ledger_entries)

## Common Scenarios

### Scenario 1: Customer Gradually Pays Off Debt
```
Initial: Customer has ₹10,000 debt (balance = -1000000)
Payment 1: Customer gives ₹3,000 → balance = -700000 (₹7,000 debt)
Payment 2: Customer gives ₹7,000 → balance = 0 (settled)
```

### Scenario 2: Customer Overpays
```
Initial: Customer has ₹5,000 debt (balance = -500000)
Payment: Customer gives ₹8,000 → balance = +300000 (₹3,000 balance)
Result: Merchant now owes ₹3,000 to customer
```

### Scenario 3: Mixed Transaction Flow
```
T1: Sell ₹10,000, receive ₹5,000 → balance = -500000 (₹5,000 debt)
T2: Purchase ₹3,000, give ₹1,000 → balance = -300000 (₹3,000 debt)
T3: Money-only receive ₹3,000 → balance = 0 (settled)
```

## File Locations

### Core Balance Calculations
- `src/services/transaction.service.ts` - Lines ~410-425 (money-only), ~420-430 (regular)

### Balance Display Logic
- `src/screens/HomeScreen.tsx` - Lines ~220-245
- `src/screens/HistoryScreen.tsx` - Lines ~500-530, ~970-1000
- `src/screens/SettlementSummaryScreen.tsx` - Lines ~370-385, ~720-740
- `src/screens/CustomerListScreen.tsx` - Lines ~100-110

### Type Definitions
- `src/types/index.ts` - Lines ~5-12 (Customer interface with balance comments)

## Migration Notes

**Pre-2025 Sign Convention (DEPRECATED):**
- Positive = customer debt
- Negative = customer balance

**Current Sign Convention (2025+):**
- Positive = customer balance
- Negative = customer debt

All balance calculations and UI displays were inverted during the migration to align with intuitive understanding where positive values represent assets/balance and negative values represent liabilities/debt.

## Testing Checklist

When modifying balance logic, verify:
- [ ] Money-only transactions: receiving creates balance, giving creates debt
- [ ] Sell transactions: underpayment creates debt
- [ ] Purchase transactions: underpayment creates balance
- [ ] Edit transactions: balance changes apply correctly
- [ ] Delete transactions: balance reverses properly
- [ ] Restore transactions: balance reapplies correctly
- [ ] UI displays: "Balance" for positive, "Debt" for negative
- [ ] Colors: Green for balance, Orange for debt
- [ ] Inventory tracking: money-only transactions included in calculations

---

**Last Updated:** January 2025  
**Applies To:** BullionDesk v1.2.8+
