import { MD3LightTheme } from 'react-native-paper';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    // Primary colors - Updated to match guidelines (Blue 600)
    primary: '#1976D2',
    onPrimary: '#FFFFFF',
    primaryContainer: '#D4E3FF',
    onPrimaryContainer: '#001B3D',
    
    // Secondary colors - Updated to match guidelines (Grey 600)
    secondary: '#757575',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#DAE2F9',
    onSecondaryContainer: '#1C1B1F',
    
    // Background & Surface - Updated to match guidelines
    background: '#FAFAFA',     // Grey 50
    surface: '#FFFFFF',        // White
    onBackground: '#1C1B1F',
    onSurface: '#1C1B1F',
    surfaceVariant: '#E7E0EC',
    onSurfaceVariant: '#49454F',
    
    // Status colors - Updated to match guidelines
    error: '#D32F2F',          // Red 600
    onError: '#FFFFFF',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#410E0B',
    success: '#388E3C',        // Green 600
    warning: '#F57C00',        // Orange 600
    
    // Transaction specific colors
    sellColor: '#388E3C',      // Green 600 - money in
    purchaseColor: '#D32F2F',  // Red 600 - money out
    balanceColor: '#1976D2',   // Blue 600 - credit
    debtColor: '#F57C00',      // Orange 600 - debt
    
    // Surface colors with elevation
    surfaceContainer: '#F3EDF7',
    surfaceContainerHigh: '#ECE6F0',
    surfaceContainerHighest: '#E6E0E9',
  },
  
  // Typography scale - Following Material Design 3
  fonts: {
    ...MD3LightTheme.fonts,
    headlineLarge: {
      fontSize: 32,
      fontWeight: 'bold' as const,
      lineHeight: 40,
    },
    headlineMedium: {
      fontSize: 28,
      fontWeight: 'bold' as const,
      lineHeight: 36,
    },
    titleLarge: {
      fontSize: 22,
      fontWeight: '500' as const,
      lineHeight: 28,
    },
    titleMedium: {
      fontSize: 16,
      fontWeight: '500' as const,
      lineHeight: 24,
    },
    bodyLarge: {
      fontSize: 16,
      fontWeight: 'normal' as const,
      lineHeight: 24,
    },
    bodyMedium: {
      fontSize: 14,
      fontWeight: 'normal' as const,
      lineHeight: 20,
    },
    labelLarge: {
      fontSize: 14,
      fontWeight: '500' as const,
      lineHeight: 20,
    },
    labelMedium: {
      fontSize: 12,
      fontWeight: '500' as const,
      lineHeight: 16,
    },
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48
  },
  
  // Elevation system - Following Material Design 3
  elevation: {
    level0: 0,
    level1: 1,
    level2: 3,
    level3: 6,
    level4: 8,
    level5: 12
  },
  
  // Component dimensions following guidelines
  dimensions: {
    bottomNavHeight: 64,
    appBarHeight: 56,
    fabSize: 56,
    minTouchTarget: 48,
    cardRadius: 8,
  }
};

export type AppTheme = typeof theme;
