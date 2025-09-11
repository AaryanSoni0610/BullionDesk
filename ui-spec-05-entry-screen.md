# UI Specification 05: Transaction Entry Screen

## Screen Layout
```
┌─────────────────────────────────┐
│  ← Customer Name                │
├─────────────────────────────────┤
│                                 │
│  [Purchase] [Sell]              │
│                                 │
│  [▼ Select Item Type        ]   │
│                                 │
│  Dynamic Input Fields           │
│                                 │
│  ─────────────────────────────  │
│  Subtotal: ₹0.00               │
│                                 │
│  [Back]        [Add Entry]      │
└─────────────────────────────────┘
```

## Transaction Type Selector
- **Component**: SegmentedButtons
- **Options**: Purchase | Sell
- **Icons**: arrow-down-circle | arrow-up-circle
- **Colors**: purchaseColor | sellColor when selected

## Item Type Dropdown
**Options:**
- Gold 999, Gold 995, Gold 916
- Rani (impure gold)
- Silver, Silver 98, Silver 96
- Rupu (impure silver)
- Money

**Style:**
- Outlined mode
- Chevron-down icon
- Border radius: 8px

## Dynamic Input Fields

### Gold/Silver Fields
1. Weight (g) - decimal input
2. Price (₹/10g for gold, ₹/kg for silver)

### Rani Fields
1. Rani Weight (g)
2. Touch % (0-99.99)
3. Pure Gold Display (read-only, calculated)
4. Actual Gold Given (g) - for sell entry

### Rupu Fields
1. Rupu Weight (g)
2. Touch % (0-99.99)
3. Extra per Kg (g) - optional bonus
4. Price per Kg (₹)
5. Calculations Display:
   - Pure Silver
   - Bonus Weight (if extra > 0)
   - Total Given
   - Adjusted Price (if extra > 0)

### Money Fields
1. Type: Add Debt | Add Balance (segmented)
2. Amount (₹)

## Subtotal Display
- Background: surfaceVariant
- Shows absolute value
- Direction indicator if non-zero

## Action Buttons
- **Back**: Outlined, flex: 0.45
- **Add Entry**: Contained, flex: 0.45
- Disabled when invalid input