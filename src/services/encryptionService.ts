import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

interface EncryptedData {
  encrypted: string;
  salt: string;
  iv: string;
  version: string;
  timestamp: number;
}

export class EncryptionService {
  private static readonly VERSION = '1.0';
  private static readonly ITERATIONS = 100000;

  /**
   * Generate random hex string
   */
  private static async getRandomHex(length: number): Promise<string> {
    const bytes = await Crypto.getRandomBytesAsync(length);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Derive a key from password using PBKDF2
   */
  private static deriveKey(password: string, salt: string): string {
    return CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: this.ITERATIONS,
      hasher: CryptoJS.algo.SHA256,
    }).toString();
  }

  /**
   * Encrypt data with AES-256-GCM (using CBC as GCM is not available in crypto-js)
   */
  static async encryptData(jsonData: any, password: string): Promise<EncryptedData> {
    try {
      // Generate random salt and IV
      const salt = await this.getRandomHex(16);
      const iv = await this.getRandomHex(16);

      // Derive key from password
      const key = this.deriveKey(password, salt);

      // Convert data to string
      const jsonString = JSON.stringify(jsonData);

      // Encrypt using AES-256-CBC
      const encrypted = CryptoJS.AES.encrypt(jsonString, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      return {
        encrypted: encrypted.toString(),
        salt,
        iv,
        version: this.VERSION,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data with AES-256-CBC
   */
  static async decryptData(encryptedData: EncryptedData, password: string): Promise<any> {
    try {
      const { encrypted, salt, iv } = encryptedData;

      // Derive key from password
      const key = this.deriveKey(password, salt);

      // Decrypt using AES-256-CBC
      const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Convert to UTF-8 string
      const jsonString = decrypted.toString(CryptoJS.enc.Utf8);

      if (!jsonString) {
        throw new Error('Decryption failed - invalid key or corrupted data');
      }

      return JSON.parse(jsonString);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data. Invalid encryption key or corrupted file.');
    }
  }

  /**
   * Validate encryption key strength
   */
  static isValidKey(key: string): { valid: boolean; message?: string } {
    if (!key || key.length < 8) {
      return { valid: false, message: 'Key must be at least 8 characters long' };
    }
    return { valid: true };
  }
}
