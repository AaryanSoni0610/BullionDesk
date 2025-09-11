# UI Specification 01: Project Overview & Tech Stack

## Project: BullionDesk
Mobile app for bullion/jewelry transaction management

## Technology Requirements
- **Framework**: React Native with Expo SDK 51
- **UI Library**: react-native-paper (Material Design 3)
- **State Management**: React Context or Redux
- **Storage**: AsyncStorage
- **Platform**: iOS & Android

## Core User Flow
1. Home Screen (Settlement List)
2. Customer Selection Modal
3. Transaction Entry Screen
4. Entry Summary Screen
5. Payment & Settlement
6. Save & Complete

## App Navigation Structure
```
App
├── HomeScreen
│   ├── Empty State
│   └── Settlement List
├── CustomerSelectionModal
├── TransactionEntryScreen
├── EntrySummaryScreen
└── SettlementDetailScreen
```

## Key Business Rules
- All transactions are money-based calculations
- Supports Gold, Silver, Rani (impure gold), Rupu (impure silver)
- Partial payment with debt/balance tracking
- Discount can be negative (markup)
- Multi-entry transactions per customer

## UI Changes from Current Design
1. FAB (+) button on summary screen adds new entry (not save)
2. Remove "Add Another Entry" button
3. Add "Save Settlement" button at bottom
4. Customer creation integrated in search flow