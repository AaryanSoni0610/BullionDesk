import QuickCrypto from 'react-native-quick-crypto';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer'; // Standard in RN with QuickCrypto/shims
import { BackupService } from './backupService';

const INTERNAL_KEY_ALIAS = 'internal_storage_key';
const PBKDF2_ITERATIONS = 100000; // High security, fast with C++
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 16; // 128 bits (AES block size)

export class EncryptionService {

  // --- Internal Key Management ---

  static async getOrCreateInternalKey(): Promise<string> {
    try {
      let key = await SecureStore.getItemAsync(INTERNAL_KEY_ALIAS);
      if (!key) {
        // Use QuickCrypto for synchronous, secure random bytes
        const randomBytes = QuickCrypto.randomBytes(KEY_LENGTH);
        key = randomBytes.toString('hex');
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

  /**
   * Encrypt string data using the Internal Key (stored in SecureStore)
   */
  static async encryptInternal(data: string): Promise<string> {
    try {
      await BackupService.logAction(`Starting internal encryption (${data.length} characters)`);
      const keyString = await this.getOrCreateInternalKey();
      const result = await this.encryptWithKey(data, keyString);
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
      const keyString = await this.getOrCreateInternalKey();
      const result = await this.decryptWithKey(encryptedString, keyString);
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
      
      // 1. Generate Salt
      const saltBuffer = QuickCrypto.randomBytes(SALT_LENGTH);
      
      // 2. Derive Key (PBKDF2) - Sync C++ call (Instant)
      const keyBuffer = QuickCrypto.pbkdf2Sync(
          password, 
          saltBuffer, 
          PBKDF2_ITERATIONS, 
          KEY_LENGTH,     
          'SHA-256'
      );

      // 3. Encrypt
      const ivBuffer = QuickCrypto.randomBytes(IV_LENGTH);
      const cipher = QuickCrypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
      
      let encrypted = cipher.update(data, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // 4. Return Format with Metadata
      const result = {
        encrypted: encrypted,
        iv: ivBuffer.toString('hex'),
        salt: saltBuffer.toString('hex'),
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
      
      const encryptedData = JSON.parse(encryptedString);
      const { encrypted, iv, salt } = encryptedData;
      
      // Convert hex strings back to buffers
      const saltBuffer = Buffer.from(salt, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');

      // Derive Key
      const keyBuffer = QuickCrypto.pbkdf2Sync(
        password, 
        saltBuffer, 
        PBKDF2_ITERATIONS, 
        KEY_LENGTH, 
        'SHA-256'
      );

      // Decrypt
      const decipher = QuickCrypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      await BackupService.logAction(`Password-based decryption completed (${decrypted.length} characters)`);
      return decrypted;
    } catch (error) {
      console.error('Password decryption error:', error);
      await BackupService.logAction(`ERROR: Password-based decryption failed - ${error}`);
      throw error;
    }
  }

  // --- Core Encryption Logic (Internal Key) ---

  private static async encryptWithKey(data: string, keyHex: string): Promise<string> {
      try {
        // Internal keys are stored as Hex strings, convert to Buffer
        const keyBuffer = Buffer.from(keyHex, 'hex');
        const ivBuffer = QuickCrypto.randomBytes(IV_LENGTH);
        
        const cipher = QuickCrypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        const result = {
          encrypted: encrypted,
          iv: ivBuffer.toString('hex'),
          version: '3.0',
          timestamp: Date.now(),
        };
        
        return JSON.stringify(result);
      } catch (error) {
        console.error('Key-based encryption error:', error);
        await BackupService.logAction(`ERROR: Key-based encryption failed - ${error}`);
        throw error;
      }
  }

  private static async decryptWithKey(encryptedJSON: string, keyHex: string): Promise<string> {
    try {
        const encryptedData = JSON.parse(encryptedJSON);
        const { encrypted, iv } = encryptedData;

        const keyBuffer = Buffer.from(keyHex, 'hex');
        const ivBuffer = Buffer.from(iv, 'hex');

        const decipher = QuickCrypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (e) {
        console.error("Decryption failed", e);
        await BackupService.logAction(`ERROR: Key-based decryption failed - ${e}`);
        throw new Error("Decryption failed");
    }
  }

  /**
   * Encrypt zip data with AES-256-CBC (Binary handling)
   */
  static async encryptZip(zipData: ArrayBuffer, password: string): Promise<string> {
    try {
      await BackupService.logAction(`Starting ZIP encryption (${zipData.byteLength} bytes)`);
      
      // Generate random salt and IV
      const saltBuffer = QuickCrypto.randomBytes(SALT_LENGTH);
      const ivBuffer = QuickCrypto.randomBytes(IV_LENGTH);

      // Derive key
      const keyBuffer = QuickCrypto.pbkdf2Sync(
        password,
        saltBuffer,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'SHA-256'
      );

      // Convert ArrayBuffer to Buffer for processing
      const dataBuffer = Buffer.from(zipData);

      // Encrypt
      const cipher = QuickCrypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
      const encryptedBuffer = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);

      // Return JSON
      const result = {
        encrypted: encryptedBuffer.toString('base64'),
        salt: saltBuffer.toString('hex'),
        iv: ivBuffer.toString('hex'),
        version: '3.0',
        timestamp: Date.now(),
      };

      const encryptedString = JSON.stringify(result);
      await BackupService.logAction(`ZIP encryption completed (${encryptedString.length} bytes)`);
      return encryptedString;
    } catch (error) {
      console.error('Encryption error:', error);
      await BackupService.logAction(`ERROR: ZIP encryption failed - ${error}`);
      throw new Error('Failed to encrypt zip data');
    }
  }

  /**
   * Decrypt zip data with AES-256-CBC (Binary handling)
   */
  static async decryptZip(encryptedString: string, password: string): Promise<ArrayBuffer> {
    try {
      await BackupService.logAction(`Starting ZIP decryption (${encryptedString.length} bytes)`);
      
      const encryptedData = JSON.parse(encryptedString);
      const { encrypted, salt, iv } = encryptedData;

      const saltBuffer = Buffer.from(salt, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');
      const encryptedBuffer = Buffer.from(encrypted, 'base64');

      // Derive key
      const keyBuffer = QuickCrypto.pbkdf2Sync(
        password,
        saltBuffer,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'SHA-256'
      );

      // Decrypt
      const decipher = QuickCrypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
      const decryptedBuffer = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

      // Convert Buffer back to ArrayBuffer
      const result = decryptedBuffer.buffer.slice(
        decryptedBuffer.byteOffset, 
        decryptedBuffer.byteOffset + decryptedBuffer.byteLength
      );
      
      await BackupService.logAction(`ZIP decryption completed (${result.byteLength} bytes)`);
      return result;
    } catch (error) {
      console.error('Decryption error:', error);
      await BackupService.logAction(`ERROR: ZIP decryption failed - ${error}`);
      throw new Error('Failed to decrypt zip data. Invalid encryption key or corrupted file.');
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