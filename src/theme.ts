import { MD3LightTheme } from 'react-native-paper';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
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
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48
  },
  elevation: {
    level0: 0,
    level1: 1,
    level2: 3,
    level3: 6,
    level4: 8,
    level5: 12
  }
};

export type AppTheme = typeof theme;
