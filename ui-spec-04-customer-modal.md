# UI Specification 04: Customer Selection Modal

## Modal Layout
```
┌─────────────────────────────────┐
│  ═══  (drag handle)             │
│                                 │
│  Select Customer                │
│  ─────────────────────────────  │
│                                 │
│  [🔍 Search/Create Customer]    │
│                                 │
│  Results:                       │
│  [Customer 1]                   │
│  [Customer 2]                   │
│  or                             │
│  [+ Create "SearchText"]        │
│                                 │
│  [Cancel]                       │
└─────────────────────────────────┘
```

## Modal Properties
- **Type**: Bottom sheet modal
- **Height**: Max 80% screen, Min 300px
- **Animation**: Slide up
- **Backdrop**: Semi-transparent (0.5 opacity)
- **Dismissible**: Swipe down or backdrop tap

## Search Input
- **Mode**: Outlined
- **Icon**: magnify
- **Placeholder**: "Search or create customer..."
- **Border Radius**: 28px (pill shape)
- **Auto Focus**: true
- **Debounce**: 300ms

## Search Results
**Customer Item:**
```
[Avatar] Customer Name
         Last transaction: Date
         Balance: ₹Amount
```

**Properties:**
- Padding: 16px
- Ripple effect
- Avatar: 40px, initials
- Name: titleMedium
- Details: bodySmall, onSurfaceVariant
- Balance color: debtColor or balanceColor

## Create New Button
- **Mode**: contained-tonal
- **Icon**: account-plus
- **Label**: Create "SearchText"
- **Show when**: No exact match found
- **Border Radius**: 28px
- **Action**: Creates customer & proceeds

## Recent Customers
- Show 3 recent when search empty
- Label: "Recent Customers"
- Same layout as search results

## Cancel Button
- **Mode**: text
- **Full width**
- **Margin top**: 16px