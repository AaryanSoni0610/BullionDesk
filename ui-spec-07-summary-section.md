# UI Specification 07: Settlement Summary Section

## Summary Layout
```
┌─────────────────────────────────┐
│  Settlement Summary             │
│  ─────────────────────────────  │
│  Subtotal:        ₹353,780     │
│  Discount: [₹0            ]     │
│  ─────────────────────────────  │
│  Total:           ₹353,780     │
│  Direction: Customer Pays       │
└─────────────────────────────────┘
```

## Container Properties
- **Component**: Surface
- **Elevation**: level2
- **Background**: surfaceVariant
- **Padding**: 24px
- **Margin**: 16px
- **Border Radius**: 16px

## Content Structure

### Title
- Text: "Settlement Summary"
- Style: titleMedium
- Color: onSurfaceVariant
- Margin bottom: 16px

### Subtotal Row
- Label: "Subtotal", bodyLarge
- Value: titleLarge, onSurface
- Show absolute value

### Discount Input
- **Mode**: Outlined
- **Label**: "Discount"
- **Prefix**: ₹ symbol
- **Placeholder**: "0"
- **Allow negative**: Yes (for markup)
- **Helper text**: "Enter negative value for markup"
- **Background**: surface

### Total Row
- **Border top**: 2px, primary color
- **Padding top**: 16px
- **Label**: "Total", titleMedium, primary, bold
- **Value**: headlineSmall, primary, bold

### Direction Indicator
- Shows who pays whom
- Icons: 📥 Customer Pays | 📤 Merchant Pays | ✅ Balanced
- Style: bodySmall, onSurfaceVariant
- Center aligned

## Calculation Logic
```
Total = Subtotal - Discount
If Discount < 0: Shows as markup
If Total > 0: Customer pays merchant
If Total < 0: Merchant pays customer
If Total = 0: Balanced transaction
```