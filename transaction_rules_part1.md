# BullionDesk Transaction Rules - Part 1: Money-Based Transaction Logic

## 1. Core Money-Based System

### 1.1 Fundamental Principle
**All transactions are handled through money value calculations**. Every bullion entry converts to money value, and final settlement balances the money difference.

### 1.2 Transaction Flow
1. **Convert all entries to money**: Each buy/sell calculates monetary value
2. **Track money flow**: Sum money in vs money out across all entries
3. **Calculate subtotal**: Sum all entry values before discount
4. **Apply discount**: Subtract discount amount from subtotal (can be negative for markup)
5. **Calculate total**: Final amount after discount application
6. **Handle partial payment**: Process actual money exchanged vs total owed
7. **Update customer balance**: Adjust debt or balance based on partial payment

### 1.3 Transaction Types (Merchant Perspective)

#### **SELL Transactions**
- **Definition**: Merchant sells bullion to customer
- **Money Flow**: Merchant receives money (positive)
- **Calculation**: `Money Value = Weight × Price per unit ÷ Unit divisor`

#### **PURCHASE Transactions**  
- **Definition**: Merchant buys bullion from customer
- **Money Flow**: Merchant pays money (negative)
- **Calculation**: `Money Value = Weight × Price per unit ÷ Unit divisor`

#### **MONEY Transactions**
- **Add Debt**: Merchant lends money to customer (negative money flow)
- **Add Balance**: Merchant receives money from customer (positive money flow)

## 2. Basic Calculation Formulas

### 2.1 Pure Metal Calculations
```
Gold: Money Value = Weight(g) × Price per 10g ÷ 10
Silver: Money Value = Weight(g) × Price per kg ÷ 1000
```

### 2.2 Money Flow Tracking
```
For each entry:
- SELL: +Money Value (merchant receives)
- PURCHASE: -Money Value (merchant pays)
- MONEY Add Debt: -Amount (merchant gives)
- MONEY Add Balance: +Amount (merchant receives)

Subtotal = Sum of all entry values
Total = Subtotal - Discount Amount (discount can be negative for markup)
Net Money Flow = Total
```

### 2.3 Final Settlement Logic
```
If Net Money Flow > 0: Customer owes merchant the amount
If Net Money Flow < 0: Merchant owes customer the amount
If Net Money Flow = 0: No money exchange needed
```

## 3. Partial Transaction Logic

### 3.1 Core Partial Payment Concept
**After calculating the total amount (subtotal ± discount), the transaction can be settled partially or fully based on actual money exchanged.**

### 3.2 Partial Payment Scenarios

#### **Scenario A: Customer Owes Money (Positive Total)**
```
Total = +₹1,300 (customer should pay merchant)

Case A1 - Full Payment:
- Money Paid by Customer = ₹1,300
- Remaining Debt = ₹0
- Balance Change = None

Case A2 - Partial Payment:
- Money Paid by Customer = ₹1,000
- Remaining Debt = ₹300
- Action: Add Debt of ₹300 to customer account

Case A3 - Overpayment:
- Money Paid by Customer = ₹1,500
- Excess Amount = ₹200
- Action: Add Balance of ₹200 to customer account
```

#### **Scenario B: Merchant Owes Money (Negative Total)**
```
Total = -₹1,300 (merchant should pay customer)

Case B1 - Full Payment:
- Money Paid by Merchant = ₹1,300
- Remaining Balance = ₹0
- Debt Change = None

Case B2 - Partial Payment:
- Money Paid by Merchant = ₹1,000
- Remaining Balance = ₹300
- Action: Add Balance of ₹300 to customer account

Case B3 - Overpayment:
- Money Paid by Merchant = ₹1,500
- Excess Amount = ₹200
- Action: Add Debt of ₹200 to customer account
```

### 3.3 Partial Payment Calculation Formulas

#### **When Customer Owes (Total > 0):**
```
Debt Adjustment = Max(0, Total - Amount Paid by Customer)
Balance Adjustment = Max(0, Amount Paid by Customer - Total)

If Amount Paid < Total:
    Add Debt = Total - Amount Paid
If Amount Paid > Total:
    Add Balance = Amount Paid - Total
```

#### **When Merchant Owes (Total < 0):**
```
Balance Adjustment = Max(0, |Total| - Amount Paid by Merchant)
Debt Adjustment = Max(0, Amount Paid by Merchant - |Total|)

If Amount Paid < |Total|:
    Add Balance = |Total| - Amount Paid
If Amount Paid > |Total|:
    Add Debt = Amount Paid - |Total|
```

## 4. Multi-Entry Example with Partial Payment

### 4.1 Example Scenario - Customer Owes Money
- **Entry 1**: Purchase 500g Silver = -₹40,000 (merchant pays)
- **Entry 2**: Sell 8.2g Gold = +₹49,200 (merchant receives)
- **Subtotal**: -₹40,000 + ₹49,200 = ₹9,200
- **Discount**: ₹200
- **Total**: ₹9,200 - ₹200 = ₹9,000 (customer owes merchant)

**Partial Payment Scenarios:**
- **Full Payment**: Customer pays ₹9,000 → No debt/balance change
- **Partial Payment**: Customer pays ₹7,000 → Add Debt ₹2,000
- **Overpayment**: Customer pays ₹10,000 → Add Balance ₹1,000

### 4.2 Example Scenario - Merchant Owes Money
- **Entry 1**: Purchase 10g Gold = -₹60,000 (merchant pays)
- **Entry 2**: Sell 500g Silver = +₹40,000 (merchant receives)
- **Subtotal**: -₹60,000 + ₹40,000 = -₹20,000
- **Discount**: ₹1,000
- **Total**: -₹20,000 - ₹1,000 = -₹21,000 (merchant owes customer)

**Partial Payment Scenarios:**
- **Full Payment**: Merchant pays ₹21,000 → No debt/balance change
- **Partial Payment**: Merchant pays ₹15,000 → Add Balance ₹6,000
- **Overpayment**: Merchant pays ₹25,000 → Add Debt ₹4,000

## 5. Negative Discount (Markup) Logic

### 5.1 Negative Discount Concept
**Negative discount acts as markup, increasing the final total.**

### 5.2 Negative Discount Examples
```
Example 1:
- Subtotal: ₹1,298
- Discount: -₹2 (markup of ₹2)
- Total: ₹1,298 - (-₹2) = ₹1,300

Example 2:
- Subtotal: ₹5,000
- Discount: -₹500 (markup of ₹500)
- Total: ₹5,000 - (-₹500) = ₹5,500
```

## 6. Transaction Summary Logic

### 6.1 Logic
The Give/Take display needs to show actual physical exchange, with proper partial payment handling.

### 6.2 Correct Summary Display
```
Transaction Summary:
├── Physical Exchange:
│   ├── Merchant Gives: [List all bullion sold to customer]
│   └── Merchant Takes: [List all bullion bought from customer]
├── Financial Summary:
│   ├── Subtotal: ₹X,XXX
│   ├── Discount: ±₹XXX (+ for discount, - for markup)
│   └── Total: ₹X,XXX
├── Payment Details:
│   ├── Total Amount: ₹X,XXX
│   └── Amount Paid: ₹X,XXX
└── Account Adjustments:
    ├── Add Debt: ₹XXX (if applicable)
    ├── Add Balance: ₹XXX (if applicable)
    └── Net Account Change: ₹±XXX
```

### 6.3 Summary Calculation Rules
- **Merchant Gives**: Sum all SELL entries (bullion given to customer)
- **Merchant Takes**: Sum all PURCHASE entries (bullion received from customer)
- **Subtotal**: Sum of all entry money values
- **Total**: Subtotal minus discount amount (can be negative discount)
- **Account Adjustments**: Based on partial payment logic
- **Settlement Status**: Full if amount paid = total, Partial otherwise

## 7. UI Implementation Requirements

### 7.1 Entry Input Section (Updated)
Each entry should show:
- Transaction type (Sell/Purchase/Money)
- Item details (type, weight, purity for rani and rupu)
- Money value (calculated)
- **Show only**: Subtotal calculation

### 7.2 Summary Section (Updated)
After all entries are added:
- Display transaction summary with Give/Take
- Show subtotal of all entries
- **Add**: Discount input field (allows negative values for markup)
- **Add**: Total calculation (Subtotal - Discount)
- **Add**: Payment amount input field
- **Add**: Payment method selection
- Show partial payment calculations and account adjustments

### 7.3 Payment Processing Section (New)
**Payment Input Fields:**
- Amount paid input (currency format)
- Payment notes (optional)

**Real-Time Calculations:**
- Show remaining amount due or excess paid
- Calculate debt/balance adjustments automatically
- Display account change preview

### 7.4 Real-Time Calculation Flow
**Entry Input Phase:**
- Update subtotal as entries are added
- Show subtotal only
- No discount or total calculations

**Summary Phase:**
- Display complete transaction summary
- Allow discount input (positive or negative)
- Calculate total = subtotal - discount
- Show payment input section

**Payment Phase:**
- Input actual amount paid
- Calculate partial payment adjustments
- Show debt/balance changes
- Display final settlement status

### 7.5 Entry Validation
- Weight must be positive
- Price must be positive
- Calculated money values must be reasonable
- **New**: Payment amount must be non-negative
- **New**: Warn for large debt/balance adjustments

## 8. Discount Logic Implementation

### 8.1 Discount Input Rules
- **Location**: Summary section after transaction entries, before summary and after all entries
- **Validation**: Can be positive (discount) or negative (markup)
- **Default**: ₹0.00
- **Format**: Currency input with rupee symbol
- **Range**: Reasonable limits to prevent calculation errors

### 8.2 Discount Calculation Impact
```
Original Flow: Entry Values → Net Money Flow
Updated Flow: Entry Values → Subtotal → Apply Discount → Total → Payment → Account Adjustment
```

### 8.3 Discount Display Logic
- Show discount field in summary section
- Allow negative values with clear markup indication
- Update total automatically when discount changes
- Show calculation: "Subtotal ± Discount = Total"

## 9. Partial Payment Implementation

### 9.1 Payment Processing Logic
```javascript
function processPartialPayment(total, amountPaid, customerAccount) {
    let debtAdjustment = 0;
    let balanceAdjustment = 0;
    
    if (total > 0) { // Customer owes merchant
        if (amountPaid < total) {
            debtAdjustment = total - amountPaid; // Add debt
        } else if (amountPaid > total) {
            balanceAdjustment = amountPaid - total; // Add balance
        }
    } else if (total < 0) { // Merchant owes customer
        const merchantOwes = Math.abs(total);
        if (amountPaid < merchantOwes) {
            balanceAdjustment = merchantOwes - amountPaid; // Add balance
        } else if (amountPaid > merchantOwes) {
            debtAdjustment = amountPaid - merchantOwes; // Add debt
        }
    }
    
    return { debtAdjustment, balanceAdjustment };
}
```

### 9.2 Account Adjustment Display
- Show clear labels: "Debt" or "Balance" (e.g. +1100 (Balance) or -1100 (Debt))
- Display adjustment amounts prominently
- Indicate net change to customer account
- Provide confirmation before processing

## 10. Error Handling

### 10.1 Input Validation
- Prevent negative weights or prices
- Ensure all required fields are filled
- Validate money calculations are accurate

### 10.2 Business Logic Validation
- Flag very large settlement amounts for confirmation
- Warn if transaction seems unbalanced for typical exchange
- Prevent saving incomplete entries

### 10.3 Calculation Verification
- Double-check money flow math before saving
- Verify settlement amount matches total calculation
- Show calculation breakdown for transparency
- **New**: Verify partial payment calculations
- **New**: Confirm debt/balance adjustments are correct

## 11. Implementation Priority

### 11.1 Critical Fixes
1. Add discount field to summary section (allow negative values)
2. Implement subtotal → discount → total calculation flow
3. Add payment amount input section
4. Implement partial payment calculation logic

## 12. Updated Calculation Examples

### 12.1 Single Entry with Discount and Partial Payment
- **Entry**: Sell 10g Gold 999 = +₹60,000
- **Subtotal**: ₹60,000
- **Discount**: ₹1,000
- **Total**: ₹59,000
- **Amount Paid**: ₹50,000
- **Add Debt**: ₹9,000
- **Settlement**: Partial - ₹9,000 debt added to customer

### 12.2 Mixed Transaction with Markup and Overpayment
- **Entry 1**: Sell 5g Gold = +₹30,000
- **Entry 2**: Purchase 200g Silver = -₹16,000
- **Subtotal**: ₹14,000
- **Discount**: -₹500 (markup)
- **Total**: ₹14,500
- **Amount Paid**: ₹15,000
- **Add Balance**: ₹500
- **Settlement**: Overpaid - ₹500 balance added to customer

### 12.3 Negative Balance with Partial Merchant Payment
- **Entry 1**: Purchase 10g Gold = -₹60,000
- **Entry 2**: Sell 500g Silver = +₹40,000
- **Subtotal**: -₹20,000
- **Discount**: ₹1,000
- **Total**: -₹21,000 (merchant owes customer)
- **Amount Paid by Merchant**: ₹15,000
- **Add Balance**: ₹6,000
- **Settlement**: Partial - ₹6,000 balance added to customer