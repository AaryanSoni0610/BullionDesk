# UI Specification 09: Transaction Summary Display

## Summary Layout
```
┌─────────────────────────────────┐
│  Transaction Summary            │
│  ─────────────────────────────  │
│  🤝 Give                        │
│  • Gold 999: 15.8g              │
│  • Silver: 1.006kg              │
│                                 │
│  📥 Take                        │
│  • Silver: 500g                 │
│  • Rani 80%: 100g (80g pure)    │
│  • ₹353,780                     │
└─────────────────────────────────┘
```

## Container Properties
- **Mode**: Outlined card
- **Border**: 1px, outline color
- **Padding**: 24px
- **Margin**: 16px
- **Border Radius**: 12px

## Give Section
- **Icon**: hand-extended
- **Color**: sellColor
- **Label**: "Give", titleMedium
- **Items**: List with bullet points
- **Item style**: bodyMedium

## Take Section
- **Icon**: hand-extended-outline
- **Color**: purchaseColor
- **Label**: "Take", titleMedium
- **Items**: List with bullet points

## Special Displays

### Impure Metals:
- Rani: "Rani 80%: 100g (80g pure)"
- Rupu: "Rupu 73%: 1.25kg (1kg pure)"

### With Bonus:
- "Silver: 1.006kg (includes 6g bonus)"

### Money:
- Show net amount in respective section
- Format: "₹Amount"
- Style: titleMedium, bold

## Logic:
- SELL entries → Give section
- PURCHASE entries → Take section
- Net money → Show in appropriate section
- Group same items together