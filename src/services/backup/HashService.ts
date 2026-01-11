import QuickCrypto from 'react-native-quick-crypto';
import { BackupService } from '../backupService';

export class HashService {
  /**
   * Generates a SHA-256 hash of the input string using QuickCrypto (Native C++).
   */
  static async computeHash(content: string): Promise<string> {
    try {
      // Create hash object
      const hash = QuickCrypto.createHash('sha256');
      
      // Update with content 
      // .digest() returns a Buffer
      // .toString('hex') converts that Buffer to a string
      return hash.update(content).digest().toString('hex');
    } catch (error) {
      console.error('HashService: Hashing error:', error);
      await BackupService.logAction(`HashService: Hashing error: ${error}`);
      throw new Error('Failed to compute hash');
    }
  }
}