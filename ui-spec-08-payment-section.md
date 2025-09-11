# UI Specification 08: Payment Section

## Payment Layout
```
┌─────────────────────────────────┐
│  Payment Details                │
│  ─────────────────────────────  │
│  Total Due:       ₹353,780     │
│  Amount Paid: [₹          ]     │
│                                 │
│  Settlement Type: Partial       │
│  Remaining: ₹53,780            │
│  Add Debt: ₹53,780             │
└─────────────────────────────────┘
```

## Container Properties
- **Elevation**: level1
- **Background**: surface
- **Padding**: 24px
- **Margin**: 16px
- **Border Radius**: 16px

## Payment Input
- **Mode**: Outlined
- **Label**: "Amount Paid"
- **Prefix**: ₹ symbol
- **Placeholder**: "0"
- **Border**: 2px, primary color
- **Keyboard**: Numeric

## Live Calculations

### When Amount Entered:
Show real-time updates for:
- Settlement type (Full/Partial/None)
- Remaining amount (if partial)
- Account adjustment preview

### Adjustment Logic:
**Customer Owes (Total > 0):**
- Paid < Total → Add Debt
- Paid > Total → Add Balance
- Paid = Total → Full Settlement

**Merchant Owes (Total < 0):**
- Paid < |Total| → Add Balance
- Paid > |Total| → Add Debt
- Paid = |Total| → Full Settlement

## Adjustment Preview
```
┌─────────────────────────────┐
│ Account Adjustment          │
│ Add Debt: ₹53,780          │
└─────────────────────────────┘
```

- Background: primaryContainer
- Padding: 16px
- Border Radius: 8px
- Icon: trending-down (debt) or trending-up (balance)
- Color: debtColor or balanceColor

## Settlement Status Chip
- **Full**: Green background
- **Partial**: Orange background
- **No Payment**: Gray background
- Position: Below amount input