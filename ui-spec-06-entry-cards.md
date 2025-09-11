# UI Specification 06: Entry Summary Cards

## Entry Card Layout
```
┌─────────────────────────────┐
│ Entry 1              [Edit]  │
│ Sell - Gold 999     [Delete] │
│ ──────────────────────────── │
│ Weight: 15.8g                │
│ Price: ₹68,500/10g           │
│ Subtotal: ₹108,370           │
└─────────────────────────────┘
```

## Card Properties
- **Elevation**: level1
- **Margin**: 8px horizontal, 4px vertical
- **Padding**: 16px
- **Border Radius**: 12px

## Card Content

### Header Row
- Entry number: labelSmall, onSurfaceVariant
- Action buttons: text mode, compact

### Type Row
- Icon: arrow-up/down-circle
- Color: sellColor/purchaseColor
- Text: "Sell/Purchase - ItemType"
- Style: titleMedium

### Details Section
- Layout: Row with space-between
- Label: bodySmall, onSurfaceVariant
- Value: bodyMedium, onSurface

### Special Cases

**Rani Entry:**
```
Purchase - Rani
Weight: 100g (80% touch)
Pure Gold: 80g
Subtotal: ₹48,000
```

**Rupu Entry:**
```
Purchase - Rupu
Weight: 1000g (73% touch)
Pure Silver: 730g
Bonus: 6g/kg
Total Given: 734.38g
Subtotal: ₹58,750
```

**Money Entry:**
```
Money - Add Debt
Amount: ₹5,000
Type: Customer Debt
```

### Subtotal Row
- Border top: 1px, surfaceVariant
- Margin top: 8px
- Padding top: 8px
- Font: titleLarge
- Show absolute value (no +/- sign)

## Action Buttons
- **Edit**: Opens entry screen with data
- **Delete**: Shows confirmation dialog
- Color: primary for edit, error for delete