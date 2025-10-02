import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

export class EncryptionService {
  /**
   * Encrypt zip data with AES-256-CBC
   */
  static async encryptZip(zipData: ArrayBuffer, password: string): Promise<string> {
    try {
      // Generate random salt and IV using expo-crypto
      const saltBytes = await Crypto.getRandomBytesAsync(16);
      const ivBytes = await Crypto.getRandomBytesAsync(16);
      const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const iv = Array.from(ivBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      // Derive key from password using PBKDF2
      const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 100000,
        hasher: CryptoJS.algo.SHA256,
      });

      // Convert ArrayBuffer to WordArray
      const wordArray = CryptoJS.lib.WordArray.create(zipData);

      // Encrypt using AES-256-CBC
      const encrypted = CryptoJS.AES.encrypt(wordArray, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Return encrypted data with metadata
      const result = {
        encrypted: encrypted.toString(),
        salt,
        iv,
        version: '1.0',
        timestamp: Date.now(),
      };

      return JSON.stringify(result);
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt zip data');
    }
  }

  /**
   * Decrypt zip data with AES-256-CBC
   */
  static async decryptZip(encryptedString: string, password: string): Promise<ArrayBuffer> {
    try {
      const encryptedData = JSON.parse(encryptedString);
      const { encrypted, salt, iv } = encryptedData;

      // Derive key from password
      const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 100000,
        hasher: CryptoJS.algo.SHA256,
      });

      // Decrypt using AES-256-CBC
      const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Convert to ArrayBuffer
      const wordArray = decrypted;
      const arrayOfWords = wordArray.hasOwnProperty('words') ? wordArray.words : [];
      const length = wordArray.hasOwnProperty('sigBytes') ? wordArray.sigBytes : arrayOfWords.length * 4;
      const uInt8Array = new Uint8Array(length);
      let index = 0;
      let word: number;
      let i: number;
      for (i = 0; i < length; i++) {
        word = arrayOfWords[i];
        uInt8Array[index++] = word >> 24;
        uInt8Array[index++] = (word >> 16) & 0xff;
        uInt8Array[index++] = (word >> 8) & 0xff;
        uInt8Array[index++] = word & 0xff;
      }

      return uInt8Array.buffer.slice(0, length);
    } catch (error) {
      console.error('Decryption error:', error);
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
