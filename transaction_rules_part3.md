# BullionDesk Transaction Rules - Part 3: Advanced Features & Multi-Entry Management

## 1. Multi-Entry Transaction Management

### 1.1 Entry Aggregation Logic
**Core Principle**: All entries within one customer session aggregate through money-based calculation, regardless of complexity.

### 1.2 Multi-Entry Flow
```
1. Each entry calculates independent money value
2. Running total tracks cumulative money flow
3. Final settlement balances net money difference
4. Summary shows all bullion+net money exchanged
```

### 1.3 Entry Combination Examples

#### **Example 1: Simple Multi-Metal Exchange**
- Entry 1: Purchase 500g Silver = -₹40,000
- Entry 2: Purchase 10g Rani (80% touch) = -₹48,000  
- Entry 3: Sell 15g Gold = +₹90,000
- **Net Flow**: +₹2,000 (Customer pays merchant)

#### **Example 2: Complex Mixed Transaction**
- Entry 1: Purchase 1.25kg Rupu (80% touch, 6g extra) = -₹1,000
- Entry 2: Money Credit (lend to customer) = -₹5,000
- Entry 3: Sell 8.2g Gold = +₹49,200
- **Net Flow**: +₹43,200 (Customer pays merchant)

### 1.4 Running Total Display
```
Entry 1: -₹40,000    Running Total: -₹40,000
Entry 2: -₹48,000    Running Total: -₹88,000  
Entry 3: +₹90,000    Running Total: +₹2,000
Final Settlement: Customer pays ₹2,000
```

## 2. Enhanced Transaction Summary

### 2.1 Complete Summary Format
```
Transaction Summary
├── Physical Exchange:
│   ├── Merchant Gives:
│   │   ├── Gold 999: 15g
│   │   └── Silver: 1kg+(X/1000)kg (from Rupu conversion)
│   └── Merchant Takes:
│       ├── Silver: 500g
│       └── Rani 80%: 100g (= 80g pure gold)
├── Money Settlement:
│   ├── Net Amount: ₹2,000
│   └── Customer pays merchant
└── Transaction Details:
    ├── Total Entries: 3
    ├── Money In: ₹90,000
    └── Money Out: ₹88,000
```

### 2.2 Summary Calculation Rules
**Physical Exchange**:
- List all SELL entries under "Merchant Gives"
- List all PURCHASE entries under "Merchant Takes"  
- if Net Money exchange is -ve, show under give, if +ve, show under take
- Show actual weights/net amount exchanged
- Include conversion details for impure metals (Impure metal weight(Pure weight), e.g. 10g(8g))

**Money Settlement**:
- Calculate net from all money flows
- Indicate direction (customer pays/merchant pays)

## 3. Advanced UI/UX Features

### 3.1 Real-Time Transaction Builder
**Live Calculation Display**:
- Running money total updates with each entry
- Settlement amount and direction shown continuously
- Visual balance indicator (balanced/unbalanced)
- Entry-by-entry breakdown available

**Entry Management**:
- Edit/delete individual entries before saving
- Reorder entries if needed
- Duplicate entry functionality for similar items
- Bulk entry templates for common transactions

### 3.2 Enhanced Entry Cards
```
Entry 1 Card Display:
┌─────────────────────────────────────┐
│                    [Edit] [Delete]  │
│ Sell - Silver 98                    │
│ ─────────────────────────────────── │
│ Weight: 500g                        │
│ Price: ₹80/kg                       │
│ Subotal: ₹40,000 (don't show sign)  │ (remember sign in memory/background)
└─────────────────────────────────────┘

Entry 2 Card Display:
┌─────────────────────────────────────┐
│                    [Edit] [Delete]  │
│ Purchase - Rupu                     │
│ ─────────────────────────────────── │
│ Weight: 1000g                       │
│ Touch: 80.22(%)                     │
│ Price: ₹80/kg                       │
│ Subotal: ₹64,176 (don't show sign)  │ (remember sign in memory/background)
└─────────────────────────────────────┘
```

### 3.3 Smart Transaction Suggestions
**Auto-Adjustment**:
- Adjust weight in Rani Rupa Calculation
  ├── Rani: 
  │   ├── Example 1: weight 25g, touch 93.55%, actual pure weight: 23.3875, adjust to 23.380
  │   └── Example 2: weight 26g, touch 93.57%, actual pure weight: 24.3282, adjust to 24.330, if actual weight is X.YZ(W) where X>=0, Y,Z in [0,9], and W>=0, if W<80, then adjusted weight is X.YZ0, if W>=80, then adjusted weight is X.Y(Z+1)0
  └── Rupu: 
      └── Example 1: weight 526g, touch 73.57%, actual pure weight: 386.9782, adjust to 387, if actual weight is X.Y where X>=0, Y>=0, if Y<800, then adjusted weight is X.0, if Y>=800, then adjusted weight is (X+1).0

## 4. Customer Balance & History Integration

### 4.1 Customer Balance Tracking
**Balance Display**:
```
Customer: John Doe
Current Balance: ₹15,000 owed to merchant
Last Transactions: List of transaction with details in scrollable table format
```

### 4.2 Partial Settlement Handling
**Partial Payment Options**:
- Customer pays partial amount of settlement
- Remaining amount added to customer balance
- Clear indication of what remains outstanding

**Example**:
- Settlement due: ₹50,000 (customer pays merchant)
- Customer pays: ₹30,000
- Added to balance: ₹20,000 owed

## 5. Validation & Error Prevention

### 5.1 Multi-Entry Validation
**Entry Consistency**:
- Warn if buying and selling same metal type (unusual)

### 5.2 Settlement Validation
**Balance Impact**:
- Show how settlement affects customer's running balance

### 5.3 Error Recovery
**Transaction Rollback**:
- Allow cancellation before final save
- Allow editing at later time/date, opening full settlement, editing any entry
- Undo last entry functionality
- Restore from accidental deletion

**Data Validation**:
- Verify entry consistency across transaction

## 6. Implementation Priorities

### 6.1: Core Multi-Entry
1. Implement subtotal calculation
2. Transaction summary display
3. Add entry edit/delete functionality
4. Build real-time settlement display

## 7. Testing Scenarios

### 7.1 Edge Cases to Test
- Zero settlement transactions (perfectly balanced)
- Multiple impure metal entries
- Mixed entry types with money transactions

### 7.2 User Workflow Testing
- Rapid entry addition/removal
- Complex multi-metal exchanges
- Error correction and transaction modification

### 7.3 Calculation Verification
- Manual verification of money flow math
- Cross-check physical vs money summaries
- Validate impure metal conversions
- Test edge cases with bonus calculations