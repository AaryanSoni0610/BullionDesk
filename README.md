# BullionDesk

A comprehensive bullion business management app designed for bullion dealers, goldsmiths, and jewelry traders. Built with React Native and Expo, BullionDesk helps manage customer balances, transactions, inventory, and provides detailed reporting capabilities.

## Features

### Core Business Management
- **Customer Management**: Track customer information, balances, and transaction history
- **Transaction Recording**: Record purchases, sales, and money transactions with detailed entries
- **Inventory Tracking**: Manage gold (999/995), silver, rani, rupu, and cash inventory
- **Balance Calculations**: Automatic calculation of customer debts and credits in money and metals

### Advanced Features
- **Rani/Rupa Stock Management**: Dedicated stock tracking for rani and rupu items with touch percentages
- **Ledger & Reporting**: Generate detailed ledger reports and PDF exports
- **Bulk Operations**: Bulk sell rani/rupa items with customer selection
- **Trade Management**: Separate trade system for quick price/weight entries

### Data Security & Backup
- **Encrypted Backups**: Secure data export/import with encryption
- **Auto Backup**: Daily automatic backups to external storage
- **Conflict-Free Merging**: Safe data import with conflict resolution
- **Local Storage**: All data stored locally on device

### User Experience
- **Intuitive UI**: Clean, material design interface
- **Notifications**: Daily reminders for customers with pending balances
- **PDF Export**: Generate customer lists and transaction histories as PDFs
- **Search & Filter**: Easy navigation through customers and transactions

## Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- Android Studio (for Android development)

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/bulliondesk.git
   cd bulliondesk
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install Expo CLI globally:
   ```bash
   npm install -g @expo/cli
   ```

4. Start the development server:
   ```bash
   npx expo start
   ```

5. Run on device/emulator:
   - For Android: `npx expo run:android`
   - Or scan QR code with Expo Go app

## Usage

### Getting Started
1. **Set Up Encryption**: On first launch, set up a backup encryption key for data security
2. **Configure Base Inventory**: Set initial inventory levels for accurate tracking
3. **Add Customers**: Create customer profiles to start recording transactions

### Recording Transactions
1. Select a customer from the home screen
2. Choose transaction type (Purchase/Sell/Money)
3. Add entries for metals, rani/rupa, or cash
4. Review and save the transaction

### Managing Inventory
- View current inventory levels in the Ledger screen
- Adjust inventory manually for reconciliation
- Automatic updates based on transactions

### Backup & Restore
- Export data to external storage with encryption
- Import data with automatic conflict resolution
- Enable auto-backup for daily data protection

## Project Structure

```
bulliondesk/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── CustomAlert.tsx
│   │   ├── CustomerSelectionModal.tsx
│   │   └── ...
│   ├── context/             # React context for state management
│   │   └── AppContext.tsx
│   ├── screens/             # Main app screens
│   │   ├── HomeScreen.tsx
│   │   ├── EntryScreen.tsx
│   │   ├── SettlementSummaryScreen.tsx
│   │   └── ...
│   ├── services/            # Business logic and data services
│   │   ├── database.ts
│   │   ├── backupService.ts
│   │   └── ...
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   └── theme.ts             # App theming
├── assets/                  # Static assets
├── App.tsx                  # Main app component
├── app.json                 # Expo configuration
└── package.json             # Dependencies and scripts
```

## Technologies Used

- **React Native**: Cross-platform mobile development
- **Expo**: Development platform and SDK
- **TypeScript**: Type-safe JavaScript
- **React Native Paper**: Material Design components
- **AsyncStorage**: Local data persistence
- **Expo SecureStore**: Secure key storage
- **Expo FileSystem**: File operations for backup
- **Expo Print**: PDF generation
- **Expo Sharing**: File sharing capabilities

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add your feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a pull request

### Development Guidelines
- Follow TypeScript best practices
- Use meaningful commit messages
- Test on Android
- Ensure data integrity in business logic
- Maintain consistent code formatting

## Privacy Policy

BullionDesk stores all data locally on your device and does not transmit any information to external servers. Data is encrypted when backed up to external storage. See the full Privacy Policy in the app settings.

## Support

For support, feedback, or bug reports:
- Create an issue on GitHub
- Contact the developer: imaaryan3563@gmail.com

## Version History

- **v1.2.8**: Latest stable release with enhanced features and bug fixes

---

**BullionDesk** - Streamlining bullion business management since 2023. Built with ❤️ by Aaryan Soni.
