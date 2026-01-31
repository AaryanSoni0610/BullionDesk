import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

const LOG_FILE_KEY = 'backup_log_file_uri';

export class Logger {
  private static logFileUri: string | null = null;

  /**
   * Initialize the logger by setting up the log file
   */
  static async initialize(): Promise<void> {
    try {
      // Try to get existing log file URI
      let logUri = await SecureStore.getItemAsync(LOG_FILE_KEY);

      if (!logUri) {
        // Create a new log file in document directory
        const fileName = `backup_log_${new Date().toISOString().split('T')[0]}.txt`;
        logUri = `${FileSystem.documentDirectory}${fileName}`;

        // Create the file with initial content
        await FileSystem.writeAsStringAsync(logUri, `=== Backup Log Started: ${new Date().toISOString()} ===\n`, {
          encoding: FileSystem.EncodingType.UTF8
        });

        // Store the URI
        await SecureStore.setItemAsync(LOG_FILE_KEY, logUri);
      }

      this.logFileUri = logUri;
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  /**
   * Log an action to the log file
   */
  static async logAction(message: string): Promise<void> {
    try {
      if (!this.logFileUri) {
        await this.initialize();
      }

      if (!this.logFileUri) {
        console.warn('Logger not initialized, cannot log:', message);
        return;
      }

      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;

      // Read existing content and append new entry
      let existingContent = '';
      try {
        existingContent = await FileSystem.readAsStringAsync(this.logFileUri, {
          encoding: FileSystem.EncodingType.UTF8
        });
      } catch (error) {
        // File doesn't exist yet, start with empty content
      }

      // Write updated content
      await FileSystem.writeAsStringAsync(this.logFileUri, existingContent + logEntry, {
        encoding: FileSystem.EncodingType.UTF8
      });
    } catch (error) {
      console.error('Failed to log action:', error);
    }
  }

  /**
   * Get the current log file URI
   */
  static getLogFileUri(): string | null {
    return this.logFileUri;
  }
}