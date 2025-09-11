# UI Specification 10: Save Actions & FAB

## Bottom Actions Layout
```
┌─────────────────────────────────┐
│  [Save Settlement Button]       │
└─────────────────────────────────┘
     [FAB (+)]
```

## Save Settlement Button
- **Mode**: Contained
- **Icon**: content-save
- **Label**: "Save Settlement"
- **Full width**: Margin 16px
- **Height**: 48px
- **Border Radius**: 28px (pill)
- **Style**: labelLarge, bold
- **Color**: primary

### Disabled States:
- No entries added
- Calculating in progress
- Payment required but not entered

### Loading State:
- Show progress indicator
- Disable interaction
- Label: "Saving..."

## FAB for Adding Entries
- **Icon**: plus (not save icon)
- **Size**: Medium (56px)
- **Position**: Bottom right
- **Bottom**: 100px (above save button)
- **Right**: 16px
- **Color**: secondary (to differentiate)
- **Action**: Navigate to entry screen

### FAB Animation:
- Scale: 0.9 on press
- Elevation: Increase on press
- Hide when scrolling down
- Show when scrolling up

## Save Flow

### On Save Press:
1. Validate all entries
2. Check payment amount
3. Calculate adjustments
4. Show loading state
5. Save to database
6. Navigate to success

### Success Feedback:
```
Snackbar:
"Settlement saved successfully"
[View] action button
Duration: 3 seconds
```

### Error Handling:
```
Dialog:
Title: "Unable to Save"
Message: Error details
Actions: [Retry] [Cancel]
```

## Navigation After Save
- Action: Replace stack
- Destination: Home screen
- Refresh: Settlement list
- Clear: Transaction state