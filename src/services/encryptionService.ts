import Aes from 'react-native-aes-crypto';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import { BackupService } from './backupService';

const INTERNAL_KEY_ALIAS = 'internal_storage_key';
// Set to 10000 for speed on mobile, or 100000 for max security (may cause UI lag)
const PBKDF2_ITERATIONS = 100000; 
const KEY_LENGTH = 256;
const SALT_LENGTH = 16; 
const IV_LENGTH = 16;

export class EncryptionService {
  // --- Internal Key Management ---

  static async getOrCreateInternalKey(): Promise<string> {
    try {
      let key = await SecureStore.getItemAsync(INTERNAL_KEY_ALIAS);
      if (!key) {
        // Generate a random 32-byte (256-bit) key
        // Returns a Hex string automatically
        key = await Aes.randomKey(32);
        await SecureStore.setItemAsync(INTERNAL_KEY_ALIAS, key);
        await BackupService.logAction(`Internal encryption key generated and stored`);
      }
      return key;
    } catch (error) {
      console.error('Error managing internal key:', error);
      await BackupService.logAction(`ERROR: Failed to manage internal encryption key - ${error}`);
      throw new Error('Failed to access internal encryption key');
    }
  }

  // --- Core Encryption (Strings) ---

  /**
   * Encrypt string data using the Internal Key
   */
  static async encryptInternal(data: string): Promise<string> {
    try {
      await BackupService.logAction(`Starting internal encryption (${data.length} characters)`);
      const key = await this.getOrCreateInternalKey();
      const result = await this.encryptWithKey(data, key);
      await BackupService.logAction(`Internal encryption completed (${result.length} bytes)`);
      return result;
    } catch (error) {
      await BackupService.logAction(`ERROR: Internal encryption failed - ${error}`);
      throw error;
    }
  }

  /**
   * Decrypt string data using the Internal Key
   */
  static async decryptInternal(encryptedString: string): Promise<string> {
    try {
      await BackupService.logAction(`Starting internal decryption (${encryptedString.length} bytes)`);
      const key = await this.getOrCreateInternalKey();
      const result = await this.decryptWithKey(encryptedString, key);
      await BackupService.logAction(`Internal decryption completed (${result.length} characters)`);
      return result;
    } catch (error) {
      await BackupService.logAction(`ERROR: Internal decryption failed - ${error}`);
      throw error;
    }
  }

  /**
   * Encrypt string data using a user-provided password
   */
  static async encryptWithPassword(data: string, password: string): Promise<string> {
    try {
      await BackupService.logAction(`Starting password-based encryption (${data.length} characters)`);
      
      // 1. Generate Salt (16 bytes)
      const salt = await Aes.randomKey(SALT_LENGTH);
      
      // 2. Derive Key (PBKDF2) - Native & Fast
      const key = await Aes.pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

      // 3. Encrypt
      const iv = await Aes.randomKey(IV_LENGTH);
      const encrypted = await Aes.encrypt(data, key, iv, 'aes-256-cbc');

      // 4. Return Bundle
      const result = {
        encrypted: encrypted,
        iv: iv,
        salt: salt,
        version: '3.0',
        timestamp: Date.now(),
      };

      const encryptedString = JSON.stringify(result);
      await BackupService.logAction(`Password-based encryption completed (${encryptedString.length} bytes)`);
      return encryptedString;
    } catch (error) {
      console.error('Password encryption error:', error);
      await BackupService.logAction(`ERROR: Password-based encryption failed - ${error}`);
      throw error;
    }
  }

  /**
   * Decrypt string data using a user-provided password
   */
  static async decryptWithPassword(encryptedString: string, password: string): Promise<string> {
    try {
      await BackupService.logAction(`Starting password-based decryption (${encryptedString.length} bytes)`);
      
      const bundle = JSON.parse(encryptedString);
      
      // Derive same key using stored salt
      const key = await Aes.pbkdf2(password, bundle.salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

      // Decrypt
      const decrypted = await Aes.decrypt(bundle.encrypted, key, bundle.iv, 'aes-256-cbc');
      
      await BackupService.logAction(`Password-based decryption completed (${decrypted.length} characters)`);
      return decrypted;
    } catch (error) {
      console.error('Password decryption error:', error);
      await BackupService.logAction(`ERROR: Password-based decryption failed - ${error}`);
      throw new Error('Decryption failed. Wrong password?');
    }
  }

  // --- Helper: Raw Key Encryption ---

  private static async encryptWithKey(data: string, keyHex: string): Promise<string> {
    try {
      const iv = await Aes.randomKey(IV_LENGTH);
      const encrypted = await Aes.encrypt(data, keyHex, iv, 'aes-256-cbc');
      
      const result = { 
        encrypted, 
        iv,
        version: '3.0',
        timestamp: Date.now() 
      };
      
      return JSON.stringify(result);
    } catch (error) {
      console.error('Key-based encryption error:', error);
      throw error;
    }
  }

  private static async decryptWithKey(encryptedJSON: string, keyHex: string): Promise<string> {
    try {
      const bundle = JSON.parse(encryptedJSON);
      return await Aes.decrypt(bundle.encrypted, keyHex, bundle.iv, 'aes-256-cbc');
    } catch (error) {
      console.error('Key-based decryption error:', error);
      throw error;
    }
  }

  // --- ZIP Handling (Binary) ---

  static async encryptZip(zipData: ArrayBuffer, password: string): Promise<string> {
    try {
      await BackupService.logAction(`Starting ZIP encryption (${zipData.byteLength} bytes)`);
      
      // 1. Convert Binary -> Base64 (Aes-crypto deals in strings)
      const base64Data = Buffer.from(zipData).toString('base64');
      
      // 2. Reuse the robust password encryption logic
      // This REUSES the code above instead of duplicating it
      const result = await this.encryptWithPassword(base64Data, password);
      
      await BackupService.logAction(`ZIP encryption completed`);
      return result;
    } catch (error) {
      console.error('Encryption error:', error);
      await BackupService.logAction(`ERROR: ZIP encryption failed - ${error}`);
      throw new Error('Failed to encrypt zip data');
    }
  }

  static async decryptZip(encryptedString: string, password: string): Promise<ArrayBuffer> {
    try {
      await BackupService.logAction(`Starting ZIP decryption (${encryptedString.length} bytes)`);

      // 1. Decrypt to get the Base64 string back
      // Reuses the password decryption logic above
      const decryptedBase64 = await this.decryptWithPassword(encryptedString, password);
      
      // 2. Convert Base64 -> Binary Buffer
      const buffer = Buffer.from(decryptedBase64, 'base64');
      
      // 3. Return ArrayBuffer
      const result = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      
      await BackupService.logAction(`ZIP decryption completed (${result.byteLength} bytes)`);
      return result;
    } catch (error) {
      console.error('Decryption error:', error);
      await BackupService.logAction(`ERROR: ZIP decryption failed - ${error}`);
      throw new Error('Failed to decrypt zip data');
    }
  }

  static isValidKey(key: string): { valid: boolean; message?: string } {
    if (!key || key.length < 8) return { valid: false, message: 'Password too short' };
    return { valid: true };
  }
}