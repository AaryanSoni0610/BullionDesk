# UI Specification 02: Material Design 3 Theme

## Color Palette
```javascript
colors = {
  // Primary colors
  primary: '#1E88E5',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D4E3FF',
  onPrimaryContainer: '#001B3D',
  
  // Secondary colors  
  secondary: '#565E71',
  secondaryContainer: '#DAE2F9',
  
  // Background & Surface
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceVariant: '#E3E2E6',
  
  // Transaction specific
  sellColor: '#4CAF50',     // Green - money in
  purchaseColor: '#F44336',  // Red - money out
  balanceColor: '#2196F3',   // Blue - credit
  debtColor: '#FF9800',      // Orange - debt
  
  // Status colors
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  success: '#4CAF50',
  warning: '#FF9800'
}
```

## Typography
```javascript
// Headlines
headlineLarge: 32px
headlineMedium: 28px
headlineSmall: 24px

// Titles
titleLarge: 22px, weight: 500
titleMedium: 16px, weight: 500
titleSmall: 14px, weight: 500

// Body
bodyLarge: 16px
bodyMedium: 14px
bodySmall: 12px

// Labels
labelLarge: 14px, weight: 500
labelMedium: 12px, weight: 500
labelSmall: 11px, weight: 500
```

## Spacing
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- xxl: 48px

## Elevation Levels
- level0: 0 (flat)
- level1: 1 (cards)
- level2: 3 (raised)
- level3: 6 (FAB)
- level4: 8 (picked up)
- level5: 12 (modal)

## Component Radius
- Small: 8px (inputs, buttons)
- Medium: 12px (cards)
- Large: 16px (surfaces)
- Extra Large: 28px (modals, FAB)