import * as FileSystem from 'expo-file-system';
import { CanonicalService } from './CanonicalService';
import { HashService } from './HashService';
import { EncryptionService } from '../encryptionService';
import { Logger } from '../../utils/logger';

const BACKUP_DIR = `${FileSystem.documentDirectory}backup/`;
const OBJECTS_DIR = `${BACKUP_DIR}objects/`;
const MANIFEST_FILE = `${BACKUP_DIR}manifest.json`;
const SNAPSHOT_FILE = `${BACKUP_DIR}internal_snapshot.enc`;

export class ObjectStorageService {

  static async ensureBackupDirectory(): Promise<void> {
    const backupDirInfo = await FileSystem.getInfoAsync(BACKUP_DIR);
    if (!backupDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(BACKUP_DIR);
    }
    const objectsDirInfo = await FileSystem.getInfoAsync(OBJECTS_DIR);
    if (!objectsDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(OBJECTS_DIR);
    }
  }

  static async getManifest(): Promise<Record<string, string>> {
     await this.ensureBackupDirectory();
     const fileInfo = await FileSystem.getInfoAsync(MANIFEST_FILE);
     if (!fileInfo.exists) {
       return {};
     }
     const content = await FileSystem.readAsStringAsync(MANIFEST_FILE);
     const manifest = JSON.parse(content);
     return manifest;
  }

  static async saveManifest(manifest: Record<string, string>): Promise<void> {
    await this.ensureBackupDirectory();
    await FileSystem.writeAsStringAsync(MANIFEST_FILE, JSON.stringify(manifest));
  }

  static async saveObject(data: any): Promise<string> {
    const canonicalString = CanonicalService.stringify(data);
    const hash = await HashService.computeHash(canonicalString);
    await this.saveRawObject(canonicalString, hash);
    return hash;
  }

  static async saveRawObject(canonicalString: string, hash: string): Promise<void> {
    await this.ensureBackupDirectory();
    const objectPath = `${OBJECTS_DIR}${hash}.enc`;
    const fileInfo = await FileSystem.getInfoAsync(objectPath);
    if (fileInfo.exists) {
       return; 
    }
    const encrypted = await EncryptionService.encryptInternal(canonicalString);
    await FileSystem.writeAsStringAsync(objectPath, encrypted);
  }


  static async getObject(hash: string): Promise<any> {
    const objectPath = `${OBJECTS_DIR}${hash}.enc`;
    const fileInfo = await FileSystem.getInfoAsync(objectPath);
    if (!fileInfo.exists) {
      console.error('ObjectStorageService: Object not found:', hash);
      await Logger.logAction(`ObjectStorageService: Object not found: ${hash}`);
      throw new Error(`Object ${hash} not found`);
    }
    
    const encrypted = await FileSystem.readAsStringAsync(objectPath);
    const canonicalString = await EncryptionService.decryptInternal(encrypted);
    const data = JSON.parse(canonicalString);
    return data;
  }

  static async saveSnapshot(data: any): Promise<void> {
    await this.ensureBackupDirectory();
    const canonicalString = CanonicalService.stringify(data);
    const encrypted = await EncryptionService.encryptInternal(canonicalString);
    await FileSystem.writeAsStringAsync(SNAPSHOT_FILE, encrypted);
  }

  static async getSnapshot(): Promise<any | null> {
    await this.ensureBackupDirectory();
    const fileInfo = await FileSystem.getInfoAsync(SNAPSHOT_FILE);
    if (!fileInfo.exists) {
      return null;
    }
    
    try {
        const encrypted = await FileSystem.readAsStringAsync(SNAPSHOT_FILE);
        const canonicalString = await EncryptionService.decryptInternal(encrypted);
        const data = JSON.parse(canonicalString);
        return data;
    } catch (e) {
        console.error('ObjectStorageService: Failed to load snapshot:', e);
        return null;
    }
  }

  /**
   * GARBAGE COLLECTION: Deletes files not referenced in the activeHashes set.
   * Returns the number of files deleted.
   */
  static async cleanupOrphanedObjects(activeHashes: Set<string>): Promise<number> {
    try {
      await Logger.logAction(`Starting garbage collection: ${activeHashes.size} active objects`);
      await this.ensureBackupDirectory();
      
      // 1. Get all files in the objects directory
      const files = await FileSystem.readDirectoryAsync(OBJECTS_DIR);
      let deletedCount = 0;

      // 2. Iterate and check against active hashes
      for (const file of files) {
        // Skip system files or weird things, only process .enc
        if (!file.endsWith('.enc')) continue;

        // Extract hash from filename (remove .enc)
        const hash = file.slice(0, -4);

        // 3. If file hash is NOT in our active set, kill it
        if (!activeHashes.has(hash)) {
          await FileSystem.deleteAsync(`${OBJECTS_DIR}${file}`, { idempotent: true });
          deletedCount++;
        }
      }
      await Logger.logAction(`Garbage collection completed: ${deletedCount} orphaned objects deleted`);
      return deletedCount;
    } catch (error) {
      console.error('ObjectStorageService: Cleanup error:', error);
      await Logger.logAction(`Garbage collection error: ${error}`);
      // Don't throw, just return 0 to avoid breaking the backup flow
      return 0;
    }
  }

  static async clearAll(): Promise<void> {
      const backupDirInfo = await FileSystem.getInfoAsync(BACKUP_DIR);
      if (backupDirInfo.exists) {
          await FileSystem.deleteAsync(BACKUP_DIR);
      }
      await this.ensureBackupDirectory();
  }
}
