import { MD3LightTheme } from 'react-native-paper';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    // Primary colors - Updated to match Expressive Design
    primary: '#005AC1',
    onPrimary: '#FFFFFF',
    primaryContainer: '#DCE6F9',
    onPrimaryContainer: '#001D35',
    
    // Secondary colors
    secondary: '#575E71',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#DAE2F9',
    onSecondaryContainer: '#131C2B',
    
    // Background & Surface
    background: '#FDFBFF',     // --surface
    surface: '#FDFBFF',        // --surface
    onBackground: '#1B1B1F',   // --text-primary
    onSurface: '#1B1B1F',      // --text-primary
    surfaceVariant: '#E1E2EC',
    onSurfaceVariant: '#44474F', // --text-secondary
    outline: '#74777F',        // --outline
    
    // Status colors
    error: '#BA1A1A',          // --error-text
    onError: '#FFFFFF',
    errorContainer: '#FFDAD6', // --error-container
    onErrorContainer: '#410002', // --on-error-container
    
    success: '#146C2E',        // --success-text
    onSuccess: '#FFFFFF',
    successContainer: '#E6F4EA', // --success-container
    onSuccessContainer: '#0D3E1A', // --on-success-container
    
    warning: '#F57C00',
    
    // Transaction specific colors
    sellColor: '#146C2E',      // --success-text
    purchaseColor: '#005AC1',  // --primary
    balanceColor: '#146C2E',   // --success-text (Green for positive balance/received)
    debtColor: '#BA1A1A',      // --error-text (Red for debt/paid)
    
    // Surface colors with elevation
    surfaceContainer: '#EEF0F4',      // --surface-container
    surfaceContainerHigh: '#E4E7EC',  // --surface-container-high
    surfaceContainerHighest: '#E6E0E9',
  },
  
  // Typography scale - Using Outfit font family
  fonts: {
    ...MD3LightTheme.fonts,
    displayLarge: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 57,
      lineHeight: 64,
      letterSpacing: -0.25,
    },
    displayMedium: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 45,
      lineHeight: 52,
      letterSpacing: 0,
    },
    displaySmall: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 36,
      lineHeight: 44,
      letterSpacing: 0,
    },
    headlineLarge: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 32,
      lineHeight: 40,
      letterSpacing: 0,
    },
    headlineMedium: {
      fontFamily: 'Outfit_600SemiBold',
      fontSize: 28,
      lineHeight: 36,
      letterSpacing: 0,
    },
    headlineSmall: {
      fontFamily: 'Outfit_600SemiBold',
      fontSize: 24,
      lineHeight: 32,
      letterSpacing: 0,
    },
    titleLarge: {
      fontFamily: 'Outfit_500Medium',
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: 0,
    },
    titleMedium: {
      fontFamily: 'Outfit_500Medium',
      fontSize: 16,
      lineHeight: 24,
      letterSpacing: 0.15,
    },
    titleSmall: {
      fontFamily: 'Outfit_500Medium',
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 0.1,
    },
    labelLarge: {
      fontFamily: 'Outfit_500Medium',
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 0.1,
    },
    labelMedium: {
      fontFamily: 'Outfit_500Medium',
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.5,
    },
    labelSmall: {
      fontFamily: 'Outfit_500Medium',
      fontSize: 11,
      lineHeight: 16,
      letterSpacing: 0.5,
    },
    bodyLarge: {
      fontFamily: 'Outfit_400Regular',
      fontSize: 16,
      lineHeight: 24,
      letterSpacing: 0.5,
    },
    bodyMedium: {
      fontFamily: 'Outfit_400Regular',
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 0.25,
    },
    bodySmall: {
      fontFamily: 'Outfit_400Regular',
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.4,
    },
  },
  
  // Custom dimensions
  dimensions: {
    bottomNavHeight: 80, // --nav-height
    borderRadiusL: 28,   // --radius-l
    borderRadiusM: 16,   // --radius-m
    borderRadiusPill: 100, // --radius-pill
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  
  elevation: {
    level0: 0,
    level1: 1,
    level2: 3,
    level3: 6,
    level4: 8,
    level5: 12,
  }
};

export type AppTheme = typeof theme;
