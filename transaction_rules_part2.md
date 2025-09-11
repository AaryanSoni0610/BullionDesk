# BullionDesk Transaction Rules - Part 2: Impure Metals with Money-Based Logic

## 1. Rani (Impure Gold) Transactions

### 1.1 Direct Metal-to-Metal Logic
**Business Rule**: Rani to Gold conversion calculates pure gold equivalent, then handles actual gold given.

### 1.2 Rani Calculation Process
```
Step 1: Create Purchase Entry (Merchant buys Rani)
- Type: Purchase Rani
- Pure Gold = (Rani Weight × Touch%) ÷ 100
- Money Value: Pure Gold × Gold Price per 10g ÷ 10

Step 2: Create Sell Entry (Merchant sells actual gold)
- Type: Sell Gold
- Weight: Actual gold given
- Money Value: Actual Weight × Gold Price per 10g ÷ 10

Step 3: Money Settlement
Net = Purchase Money - Sell Money
If Net > 0: Customer pays difference to merchant(for extra gold)
If Net < 0: Merchant pays difference to customer(if customer requires less gold)
```

### 1.3 Rani Transaction Example
**Scenario**: Customer brings 10g Rani at 80% touch, gets 6.1g gold

**Calculation**:
- Pure gold equivalent: 10g × 0.80 = 8g
- Entry 1 (Purchase Rani): 8g worth = -₹4,800
- Entry 2 (Sell Gold): 6.1g actual = +₹3,660
- **Net**: -₹4,800 + ₹3,660 = -₹1,140
- **Settlement**: Customer gets ₹1,140 for the exchange

### 1.4 UI Requirements for Rani
**Input Fields**:
- Rani Weight: [number input]
- Touch%: [number input 0.00-99.99]
- Auto-calculated Pure Gold: [read-only display]

**Entry Creation**:
- Creates Purchase entry for Rani
- if sold gold, then sell entry for actual gold given, else only money returned
- Shows live money difference calculation(if any in case metal or cross-metal purchase)

## 2. Rupu (Impure Silver) with Configurable Bonus

### 2.1 Money-Based Rupu Logic
**Business Rule**: Rupu transactions use configurable bonus system with automatic price adjustment to maintain money balance.

### 2.2 Rupu Calculation Process
```
Step 1: Calculate Pure Silver
Pure Silver = (Rupu Weight × Touch%) ÷ 100

Step 2: Calculate Bonus (if configured)
Bonus Weight = Pure Silver × (Extra per Kg ÷ 1000)
Total Silver Given = Pure Silver + Bonus Weight

Step 3: Calculate Adjusted Price
Adjusted Price = Base Price ÷ (1 + Extra per Kg ÷ 1000)

Step 4: Calculate Transaction Value
Money Value = Total Silver Given × Adjusted Price
```

### 2.3 Rupu Transaction Example
**Scenario**: 1.25kg Rupu at 80% touch, 6g extra per kg, ₹1000/kg base price

**Calculation**:
- Pure silver: 1.25kg × 0.80 = 1kg
- Bonus: 1kg × (6÷1000) = 0.006kg
- Total given: 1.006kg
- Adjusted price: ₹1000 ÷ 1.006 = ₹994.04/kg
- **Transaction value**: 1.006kg × ₹994.04 = ₹1000

**Entry**:
- Type: Purchase Rupu (merchant buys)
- Money Value: -₹1000
- Physical: Takes 1.25kg Rupu, Gives 1.006kg Silver

### 2.4 UI Requirements for Rupu
**Input Fields**:
- Rupu Weight: [number input]
- Touch%: [number input 1-100]
- Extra per Kg: [number input] (placeholder: "Extra per Kg", default: 0)
- Base Price per Kg: [number input]

**Auto-Calculations**:
- Pure Silver Weight: [read-only display]
- Bonus Weight: [read-only display] (if Extra > 0)
- Total Silver Given: [read-only display]
- Adjusted Price: [read-only display] (if Extra > 0)
- Transaction Value: [read-only display]

**Logic Flow**:
```
If Extra per Kg = 0 (or empty):
  - No bonus applied
  - Standard price used
  - Value = Pure Silver × Base Price

If Extra per Kg > 0:
  - Bonus weight calculated
  - Price automatically adjusted
  - Value balances to equivalent exchange
```

## 3. Integration with Money-Based System

### 3.1 Rani Rupu Integration
- Creates two separate entries in transaction (with adjusted pricing in rupu)
- Each entry follows money-based calculation
- Net settlement handles any imbalance
- Works seamlessly with other entry types

### 3.2 Mixed Transaction Example
**Complex Scenario**: Customer brings Rani + Rupu, wants Gold + Silver

**Entries**:
1. Purchase 100g Rani (80% touch) = -₹48,000
2. Purchase 1.25kg Rupu (80% touch) = -₹1000
3. Sell 15g Gold = +₹90,000
4. Sell 2.012kg (per kg 6g (configurable)) Silver = +₹2000

**Net**: -₹48,000 - ₹1000 + ₹90,000 + ₹1600 = +₹42,600
**Settlement**: Customer pays merchant ₹42,600

## 4. Validation Rules for Impure Metals

### 4.1 Rani Validation
- Touch% must be 0.00-99.99%
- Rani weight must be positive

### 4.2 Rupu Validation
- Touch% must be 0.00-99.99%
- Extra per Kg should be reasonable (0-50g typical range)
- Base price must be positive
- Adjusted price should not be negative

## 5. Implementation Notes

### 5.1 Entry Creation Flow
**For Rani**:
1. User(merchant) fills Rani details
2. creates Purchase entry
3. adds Sell entry for actual gold
4. System calculates net settlement

**For Rupu**:
1. User fills Rupu details including bonus(6g configurable)
2. System calculates all adjustments automatically
3. Creates Purchase entry
4. Integrates seamlessly with other entries

### 5.2 Price Configuration
- Extra per Kg should be configurable per transaction
- Price adjustments should be transparent to user

### 5.3 Error Prevention
- Validate calculations before creating entries
- Show clear breakdown of adjustments