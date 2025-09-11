# UI Specification Updates & Flow Corrections

## 1. Item Type Updates

### Remove Gold 916
- Remove "Gold 916" from all dropdown menus
- Keep only: Gold 999, Gold 995, Rani

### Default Silver Calculation for Rupu exchange
- Change default from "Silver" to "Silver 98"
- This is the default silver option, for calculating money from rupu
- Price calculation remains: per kg for all silver types

## 2. Navigation Flow Correction

### Current Flow (INCORRECT)
Home → FAB → Customer → Entry Screen (loop) → Customer Name Back → Home

### Correct Flow (IMPLEMENT THIS)
```
Home Screen → FAB (+) → Customer Selection Modal → 
Entry Screen → Settlement Summary Screen (with new entry visible) → 
FAB (+) for more entries -> Save Transaction Button
```

### Settlement Summary Screen Structure
```
┌─────────────────────────────────┐
│  ← Customer Name                │
├─────────────────────────────────┤
│  Entry Cards                    │
│  [Entry 1 - Details]     🗑️    │
│  [Entry 2 - Details]     🗑️    │
│                                 │
│  Transaction Summary Card       │
│  ─────────────────────────────  │
│  Give / Take sections           │
│  Total: ₹XXX                    │
│                                 │
│  [Save Transaction Button]      │
└─────────────────────────────────┘
     [FAB (+) Add More Entries]
```

### Key Flow Points:
- After adding entry → Redirect to Settlement Summary
- FAB changes from save icon to (+) icon
- FAB adds more entries, not saves
- "Add Another Entry" button removed
- "Save Transaction" button added after summary

## 3. Customer Modal UI Fix

### Cancel Button Styling
```
Before: Text that looks like label
After: Proper button component

Style:
- Mode: contained-tonal or outlined
- Full width minus padding
- Height: 48px
- Margin: 16px
- Position: Fixed at bottom
```

### Modal Layout Fix
```
┌─────────────────────────────────┐
│  ═══  (handle)                  │
│  Select Customer                │
│  ─────────────────────────────  │
│  [🔍 Search Input] (fixed)      │
│  ─────────────────────────────  │
│  Scrollable Area {              │
│   All Customers(before: Recent) │
│    • Customer 1                 │
│    • Customer 2                 │
│    • Customer 3                 │
│  }                              │
│  ─────────────────────────────  │
│  [Cancel Button] (fixed bottom) │
└─────────────────────────────────┘
```

**Responsive behavior:**
- Header: Fixed height
- Search: Fixed height
- Customer list: Flexible height (grows/shrinks depending on available (screen/view) height)
- Cancel button: Fixed at bottom
- Min modal height: 400px
- Max modal height: 80% screen

## 4. Entry Screen Title Fix

### Add App Title
```
┌─────────────────────────────────┐
│  BullionDesk                 ⚙️│
│  ← John Doe                     │
├─────────────────────────────────┤
│  Transaction entry fields...     │
```

OR if space is limited:
```
┌─────────────────────────────────┐
│  ← John Doe          BullionDesk│
├─────────────────────────────────┤
```

## 5. Item Type Dropdown Styling

### Dropdown Alignment
```
Current: Unclear alignment
Fixed:
┌─────────────────────────────────┐
│  Gold 999                    ▼  │
└─────────────────────────────────┘
```

**Style properties:**
- Text align: left (Material Design standard)
- Padding left: 16px
- Padding right: 48px (for arrow space)
- Arrow position: absolute right, 16px from edge
- Height: 56px (standard Material input height)

## 6. Material Design 3 Input Boxes

### Note on Rounded Inputs
- Material Design 3 default: 4px corner radius
- Fully rounded (pill-shaped) inputs not standard
- Keep current outlined text inputs with 8px radius
- This follows MD3 while being slightly rounded

## 7. Save Transaction Button

### Button Properties
- **Mode**: contained
- **Label**: "Save Transaction"
- **Icon**: check or save icon
- **Width**: Full width - 32px margin
- **Position**: Below Transaction Summary
- **Margin bottom**: 100px (space for FAB)
- **Disabled when**: No entries or invalid data

### Complete Save Flow
1. Validate all entries
2. Calculate final amounts
3. Save to database
4. Show success snackbar
5. Navigate to Home
6. Refresh settlement list

## Implementation Priority
1. Fix navigation flow (Critical)
2. Add Save Transaction button
3. Fix Customer modal cancel button
4. Update item types (remove 916, rename Silver)
5. Fix Entry screen title
6. Adjust dropdown styling