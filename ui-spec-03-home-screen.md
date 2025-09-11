# UI Specification 03: Home Screen Layout

## Screen Structure
```
┌─────────────────────────────────┐
│  Status Bar                     │
├─────────────────────────────────┤
│  App Bar                        │
│  BullionDesk          [Settings]│
├─────────────────────────────────┤
│                                 │
│  Content Area                   │
│  (Empty State or List)          │
│                                 │
├─────────────────────────────────┤
│  Bottom Navigation              │
│  [Add] [Search] [History]       │
└─────────────────────────────────┘
      [FAB (+)]
```

## Empty State
- **Illustration**: Ledger/book icon
- **Title**: "Start Your First Transaction"
- **Subtitle**: "Tap the + button to create a new settlement"
- **Style**: Centered, 60% opacity

## Settlement List Item
```
Card Component:
┌──────────────────────────────┐
│ Customer Name        ₹Amount │
│ Date & Time          Status  │
│ Items: Gold, Silver...       │
└──────────────────────────────┘
```

**Card Properties:**
- Elevation: level1
- Margin: 8px
- Padding: 16px
- Border Radius: 12px
- Ripple effect on press

**Content:**
- Customer name: titleMedium
- Amount: titleLarge, color based on +/-
- Date: bodySmall, onSurfaceVariant
- Status chip: outlined, small
- Items preview: bodySmall, max 2 items

## FAB Button
- **Icon**: plus
- **Size**: 56px
- **Position**: bottom: 80px, right: 16px
- **Color**: primary
- **Action**: Opens Customer Selection Modal

## Bottom Navigation
Three tabs:
1. **Add** (default active)
2. **Search** - filter settlements
3. **History** - view all past

**Note**: FAB overlaps bottom navigation slightly