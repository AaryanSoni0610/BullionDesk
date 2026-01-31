import Aes from 'react-native-aes-crypto';
import { Logger } from '../../utils/logger';

export class HashService {
  /**
   * Generates a SHA-256 hash using Native OS Crypto.
   * This is ASYNC, fast, and does not block the UI.
   */
  static async computeHash(content: string): Promise<string> {
    try {
      // Aes.sha256 returns the hash directly as a Hex string
      const hash = await Aes.sha256(content);
      return hash;
    } catch (error) {
      console.error('HashService: Hashing error:', error);
      await Logger.logAction(`HashService: Hashing error: ${error}`);
      throw new Error('Failed to compute hash');
    }
  }
}