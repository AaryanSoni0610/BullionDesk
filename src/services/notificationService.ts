import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from './database';
import { Customer } from '../types';

const STORAGE_KEYS = {
  NOTIFICATION_ENABLED: '@bulliondesk_notification_enabled',
  LAST_NOTIFICATION_DATES: '@bulliondesk_last_notification_dates',
  NOTIFICATION_SCHEDULER_ACTIVE: '@bulliondesk_notification_scheduler_active',
};

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService {
  private static schedulerInterval: NodeJS.Timeout | null = null;

  /**
   * Request notification permissions from the user
   */
  static async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          console.log('Notification permissions not granted');
          return false;
        }

        // Set notification channel for Android
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('debt-reminders', {
            name: 'Debt Reminders',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'default',
            enableVibrate: true,
          });
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Enable notifications
   */
  static async enableNotifications(): Promise<boolean> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return false;
      }

      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_ENABLED, 'true');
      await this.startNotificationScheduler();
      return true;
    } catch (error) {
      console.error('Error enabling notifications:', error);
      return false;
    }
  }

  /**
   * Disable notifications
   */
  static async disableNotifications(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_ENABLED, 'false');
      await this.stopNotificationScheduler();
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error disabling notifications:', error);
    }
  }

  /**
   * Check if notifications are enabled
   */
  static async isNotificationsEnabled(): Promise<boolean> {
    try {
      const enabled = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_ENABLED);
      return enabled === 'true';
    } catch (error) {
      console.error('Error checking notification status:', error);
      return false;
    }
  }

  /**
   * Get the last notification dates for customers
   */
  private static async getLastNotificationDates(): Promise<Record<string, string>> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_NOTIFICATION_DATES);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error getting last notification dates:', error);
      return {};
    }
  }

  /**
   * Save the last notification date for a customer
   */
  private static async saveLastNotificationDate(customerId: string, date: string): Promise<void> {
    try {
      const dates = await this.getLastNotificationDates();
      dates[customerId] = date;
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_NOTIFICATION_DATES, JSON.stringify(dates));
    } catch (error) {
      console.error('Error saving last notification date:', error);
    }
  }

  /**
   * Calculate days difference between two dates (date-based, not time-based)
   */
  private static calculateDaysDifference(date1: Date, date2: Date): number {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Get customers who have debt pending for more than 1 day
   */
  private static async getCustomersWithPendingDebt(): Promise<Array<{ customer: Customer; daysPending: number }>> {
    try {
      const customers = await DatabaseService.getAllCustomers();
      const transactions = await DatabaseService.getAllTransactions();
      const today = new Date();
      const customersWithDebt: Array<{ customer: Customer; daysPending: number }> = [];

      for (const customer of customers) {
        // Check if customer has negative balance (debt)
        if (customer.balance < 0) {
          // Find the most recent transaction for this customer
          const customerTransactions = transactions
            .filter(t => t.customerId === customer.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          if (customerTransactions.length > 0) {
            const lastTransactionDate = new Date(customerTransactions[0].date);
            const daysPending = this.calculateDaysDifference(lastTransactionDate, today);

            // Only include if debt is pending for more than 1 day
            if (daysPending > 1) {
              customersWithDebt.push({
                customer,
                daysPending,
              });
            }
          }
        }
      }

      return customersWithDebt;
    } catch (error) {
      console.error('Error getting customers with pending debt:', error);
      return [];
    }
  }

  /**
   * Schedule a notification for a specific customer
   */
  private static async scheduleNotificationForCustomer(
    customer: Customer,
    daysPending: number,
    delaySeconds: number
  ): Promise<void> {
    try {
      const debt = Math.abs(customer.balance);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: customer.name,
          body: `Debt: ₹${debt.toFixed(2)} | Pending from ${daysPending} days`,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { customerId: customer.id, type: 'debt-reminder' },
        },
        trigger: {
          seconds: delaySeconds,
          channelId: 'debt-reminders',
        },
      });

      console.log(`Scheduled notification for ${customer.name} (${daysPending} days pending) in ${delaySeconds}s`);
    } catch (error) {
      console.error(`Error scheduling notification for customer ${customer.name}:`, error);
    }
  }

  /**
   * Check and schedule notifications for customers with pending debt
   */
  static async checkAndScheduleNotifications(): Promise<void> {
    try {
      const isEnabled = await this.isNotificationsEnabled();
      if (!isEnabled) {
        console.log('Notifications are disabled, skipping check');
        return;
      }

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Only schedule notifications between 12:00 PM and 1:00 PM
      if (currentHour !== 12) {
        console.log(`Current time ${currentHour}:${currentMinute} is outside notification window (12:00-13:00)`);
        return;
      }

      const customersWithDebt = await this.getCustomersWithPendingDebt();
      if (customersWithDebt.length === 0) {
        console.log('No customers with pending debt found');
        return;
      }

      const lastNotificationDates = await this.getLastNotificationDates();
      const todayString = now.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Filter customers who haven't received a notification today
      const customersToNotify = customersWithDebt.filter(({ customer }) => {
        const lastNotificationDate = lastNotificationDates[customer.id];
        return !lastNotificationDate || lastNotificationDate !== todayString;
      });

      if (customersToNotify.length === 0) {
        console.log('All customers have already been notified today');
        return;
      }

      console.log(`Scheduling notifications for ${customersToNotify.length} customers`);

      // Calculate delay interval to spread notifications across the hour (3600 seconds)
      const totalSeconds = 3600; // 1 hour in seconds
      const delayInterval = Math.floor(totalSeconds / customersToNotify.length);

      // Cancel any existing scheduled notifications
      await Notifications.cancelAllScheduledNotificationsAsync();

      // Schedule notifications with staggered delays
      for (let i = 0; i < customersToNotify.length; i++) {
        const { customer, daysPending } = customersToNotify[i];
        const delaySeconds = i * delayInterval;

        await this.scheduleNotificationForCustomer(customer, daysPending, delaySeconds);
        
        // Save the notification date
        await this.saveLastNotificationDate(customer.id, todayString);
      }

      console.log(`Successfully scheduled ${customersToNotify.length} notifications`);
    } catch (error) {
      console.error('Error checking and scheduling notifications:', error);
    }
  }

  /**
   * Start the notification scheduler that checks every hour
   */
  static async startNotificationScheduler(): Promise<void> {
    try {
      // Stop any existing scheduler
      await this.stopNotificationScheduler();

      // Check immediately on start
      await this.checkAndScheduleNotifications();

      // Check every 10 minutes to catch the 12 PM window
      this.schedulerInterval = setInterval(async () => {
        await this.checkAndScheduleNotifications();
      }, 10 * 60 * 1000); // 10 minutes

      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_SCHEDULER_ACTIVE, 'true');
      console.log('Notification scheduler started');
    } catch (error) {
      console.error('Error starting notification scheduler:', error);
    }
  }

  /**
   * Stop the notification scheduler
   */
  static async stopNotificationScheduler(): Promise<void> {
    try {
      if (this.schedulerInterval) {
        clearInterval(this.schedulerInterval);
        this.schedulerInterval = null;
      }
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_SCHEDULER_ACTIVE, 'false');
      console.log('Notification scheduler stopped');
    } catch (error) {
      console.error('Error stopping notification scheduler:', error);
    }
  }

  /**
   * Initialize notification service on app start
   */
  static async initialize(): Promise<void> {
    try {
      const isEnabled = await this.isNotificationsEnabled();
      if (isEnabled) {
        await this.startNotificationScheduler();
      }
    } catch (error) {
      console.error('Error initializing notification service:', error);
    }
  }
}
