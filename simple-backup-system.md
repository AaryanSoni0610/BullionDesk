# Simple Encrypted Backup System
**Manual Export/Import + Auto Backup**

---

## System Architecture

### Storage Structure
```
/Documents/
  └── BullionDeskBackup/
      ├── Exports/
      │   └── export.encrypted    (single file, replaced on each export)
      └── Auto/
          ├── auto_backup_{DD/MM - hh-mm}.encrypted     (single file, replace on each backup)
          ├── auto_backup_{DD/MM - hh-mm}.encrypted     (single file, replace on each backup)
```

### Encryption Key Management
- **First time**: Alert popup asks user to set encryption key(for auto backup/export/import)
- **Storage**: `SecureStore.setItemAsync('backup_encryption_key', userKey)`
- **Retrieval**: Used for all export/import/auto-backup operations
- **Same key**: Used for both manual and automatic backups

---

## Required Packages

```bash
npx expo install expo-crypto expo-file-system expo-secure-store expo-sharing
npx expo install expo-background-fetch
```

---

## Core Components

### 1. Encryption Service

**Uses**: expo-crypto (random bytes) + Web Crypto API (AES-256-GCM)

**Key methods**:
```javascript
encryptData(jsonData, key) // Returns {encrypted, salt, iv}
decryptData(encryptedData, key) // Returns original JSON
```

**Process**:
- PBKDF2 key derivation (100k iterations)
- AES-256-GCM encryption
- Unique salt + IV per backup

---

### 2. Directory Management

**Setup on first launch**:
```javascript
await FileSystem.makeDirectoryAsync(
  FileSystem.documentDirectory + 'BullionDeskBackup/Exports',
  { intermediates: true }
);
await FileSystem.makeDirectoryAsync(
  FileSystem.documentDirectory + 'BullionDeskBackup/Auto',
  { intermediates: true }
);
```

---

### 3. Manual Export

**Flow**:
1. Check if encryption key exists
2. If not → Show alert popup → Save to SecureStore
3. Query all database records
4. Encrypt data in background
5. Delete previous export file
6. Save new file: `Exports/export.encrypted`

**Background process**: Use `InteractionManager.runAfterInteractions()` for smooth UI

**Path**: `${FileSystem.documentDirectory}BullionDeskBackup/Exports/export.encrypted`

---

### 4. Manual Import

**Flow**:
1. Prompt user for encryption key (TextInput in Alert)
2. Verify key by attempting decryption
3. If successful → Parse data
4. Show merge options: Replace or Merge
5. Update database
6. Show import statistics

**File selection**: User uses file picker

---

### 5. Auto Backup

**Trigger conditions**:
- App launch (if >24 hours since last backup)
- Background task (expo-background-fetch)
- After significant data changes (e.g., >50 records modified)

**Process**:
1. Get encryption key from SecureStore
2. Query all database records
3. Encrypt data
4. Save to: `Auto/auto_backup_${DD/MM - hh-mm}.encrypted`
5. Cleanup old backups (keep last 2) (delete older one after the latest backup is safely stored)

**Rotation logic**:
```javascript
const files = await FileSystem.readDirectoryAsync(autoBackupDir);
const backups = files.filter(f => f.startsWith('auto_backup_')).sort();
if (backups.length > 2) {
  await FileSystem.deleteAsync(autoBackupDir + backups[0]);
}
```

---

## Encryption Key Setup

### First Launch Flow

**Alert popup structure**:
```
Title: "Set Backup Encryption Key"
Message: "Choose a strong key to encrypt your backups. You'll need this to restore data."
Input: TextInput (secureTextEntry: true)
Buttons: [Cancel, Set Key]
```

**Validation**:
- Minimum 8 characters
- Confirm key (ask twice)
- Store in SecureStore

**Code**:
```javascript
const key = await SecureStore.getItemAsync('backup_encryption_key');
if (!key) {
  Alert.prompt('Set Backup Encryption Key', 'Enter key:', async (input) => {
    await SecureStore.setItemAsync('backup_encryption_key', input);
  });
}
```

---

## Background Processing

### For Manual Export

**Keep UI responsive**:
```javascript
InteractionManager.runAfterInteractions(() => {
  performEncryptionAndExport();
});
```

**Show progress in silent notification**:
- Show "Exporting..." message
- Show progess if possible
- Show "Export done"

### For Auto Backup

**Background task setup**:
```javascript
TaskManager.defineTask('AUTO_BACKUP', async () => {
  const key = await SecureStore.getItemAsync('backup_encryption_key');
  if (key) {
    await performAutoBackup(database, key);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  }
  return BackgroundFetch.BackgroundFetchResult.NoData;
});

await BackgroundFetch.registerTaskAsync('AUTO_BACKUP', {
  minimumInterval: 60 * 60 * 24, // 24 hours
  stopOnTerminate: false,
  startOnBoot: true
});
```

---

## Security Details

### Encryption Strength
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key derivation**: PBKDF2-SHA256, 100,000 iterations
- **Salt**: 16 bytes random per backup
- **IV**: 12 bytes random per backup
- **Authentication**: GCM mode provides integrity check

### Key Storage
- **Location**: expo-secure-store
- **Access**: Only when app is unlocked
- **Never**: Stored in plain text or AsyncStorage

### File Permissions
- **Directory**: App-private (not accessible by other apps)
- **Export share**: User controls where to send (outside from app)
- **Auto backups**: Never leave app directory

---

## Error Handling

### Common scenarios:

**Wrong encryption key**:
```javascript
catch (error) {
  Alert.alert('Decryption Failed', 'Invalid encryption key or corrupted file');
}
```

**No space**:
```javascript
const info = await FileSystem.getFreeDiskStorageAsync();
if (info < estimatedSize) {
  Alert.alert('Insufficient Storage');
}
```

**Corrupted backup**:
- Try next auto backup in sequence
- Alert user if all backups fail via silent notification

---

## User Experience

### Export
1. User taps "Export Data"
2. Exporting... / Export Done. silent notification appears
3. Background encryption starts
4. Success notification
5. Share file via Android sheet (path '/Documents/BullionDeskBackup/Exports/export.encryption')

### Import
1. User taps "Import Data"
2. load encryption key from secure storage
3. File is decrypted and validated
4. Conflict-Free Merge System where from which device a transaction originated doesn't matter, only transaction matters and making sure that if by coincidence 2 different transactions have same txn_id then there is also a device id to distinguish between transactions
6. Database updated
7. Success message with statistics

### Auto Backup
- **Silent operation** (no user interaction)
- **Error logging**: Store failed backup attempts silent notification

---

## Best Practices

### Performance
- Encrypt in chunks for large databases (>50MB)
- Use `InteractionManager` for UI responsiveness
- Show progress for operations >2 seconds via silent notification

### Reliability
- Validate data structure before encryption
- Log backup operations for debugging saved at /Documents/BullionDeskBackup/logs

### Storage Management
- Export: Single file (always overwritten)
- Auto: 2 rotating backups (FIFO)
- Cleanup on app launch if >2 auto backups exist

---

## Implementation Checklist

- [ ] Create directory structure on app launch
- [ ] Implement encryption service (expo-crypto + Web Crypto)
- [ ] Add encryption key setup flow (first launch)
- [ ] Build manual export with background processing
- [ ] Build manual import(key from expo secure storage)
- [ ] Implement auto backup with scheduling
- [ ] Add backup rotation logic (keep last 2)
- [ ] Setup background fetch task
- [ ] Add error handling for all operations
- [ ] Verify SecureStore integration

---

## File Format

### Encrypted structure:
```json
{
  "encrypted": "base64...",
  "salt": "base64...",
  "iv": "base64...",
  "version": "1.0",
  "timestamp": 1234567890
}
```

### Decrypted payload:
```json
{
  "exportType": "manual|auto",
  "timestamp": 1234567890,
  "recordCount": 150,
  "records": [...]
}
```

---

## Recovery Scenarios

### App crash → Reinstall
1. App launches
2. Checks for auto backups in `Auto/` directory
3. Prompts for encryption key
4. Restores from latest auto backup

### Manual restore
1. User places export file in device
2. Opens app → Import
3. Database restored

### Key forgotten
- **Auto backups**: Unrecoverable (tied to key)
- **Export**: Unrecoverable (encryption is secure)
- **Prevention**: Warn user during key setup

---

## Performance Expectations

| Database Size | Encryption Time | Decryption Time |
|--------------|----------------|-----------------|
| < 1 MB | < 200ms | < 150ms |
| 1-5 MB | 200-800ms | 150-600ms |
| 5-10 MB | 0.8-2s | 0.6-1.5s |
| 10-50 MB | 2-10s | 1.5-8s |
| > 50 MB | Consider chunking | Consider chunking |