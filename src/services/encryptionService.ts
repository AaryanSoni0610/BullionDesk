import * as Crypto from 'expo-crypto';

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
   * Derive a key from password using PBKDF2
   */
  private static async deriveKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: this.ITERATIONS,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  static async encryptData(jsonData: any, password: string): Promise<EncryptedData> {
    try {
      // Generate random salt and IV
      const salt = new Uint8Array(
        await Crypto.getRandomBytesAsync(16)
      );
      const iv = new Uint8Array(
        await Crypto.getRandomBytesAsync(12)
      );

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Convert data to string and then to bytes
      const enc = new TextEncoder();
      const data = enc.encode(JSON.stringify(jsonData));

      // Encrypt
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        data
      );

      // Convert to base64 for storage
      const encryptedArray = new Uint8Array(encrypted);
      const encryptedBase64 = this.arrayBufferToBase64(encryptedArray);
      const saltBase64 = this.arrayBufferToBase64(salt);
      const ivBase64 = this.arrayBufferToBase64(iv);

      return {
        encrypted: encryptedBase64,
        salt: saltBase64,
        iv: ivBase64,
        version: this.VERSION,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  static async decryptData(encryptedData: EncryptedData, password: string): Promise<any> {
    try {
      // Convert base64 to Uint8Array
      const encrypted = this.base64ToArrayBuffer(encryptedData.encrypted);
      const salt = this.base64ToArrayBuffer(encryptedData.salt);
      const iv = this.base64ToArrayBuffer(encryptedData.iv);

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv.buffer as ArrayBuffer,
        },
        key,
        encrypted.buffer as ArrayBuffer
      );

      // Convert bytes back to string
      const dec = new TextDecoder();
      const jsonString = dec.decode(decrypted);

      return JSON.parse(jsonString);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data. Invalid encryption key or corrupted file.');
    }
  }

  /**
   * Convert ArrayBuffer to Base64 string
   */
  private static arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 string to ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
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
