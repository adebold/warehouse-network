/**
 * Preference Manager - Handles user notification preferences
 */

import Redis from 'ioredis';
import { Logger } from 'winston';
import {
  NotificationPreferences,
  NotificationChannel,
  NotificationCategory,
  NotificationPriority
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export class PreferenceManager {
  private logger: Logger;
  private preferencesCache: Map<string, NotificationPreferences> = new Map();

  constructor(private redis: Redis) {
    this.logger = createLogger('PreferenceManager');
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      // Check cache first
      if (this.preferencesCache.has(userId)) {
        return this.preferencesCache.get(userId)!;
      }

      // Load from Redis
      const prefsKey = `notification:preferences:${userId}`;
      const preferencesData = await this.redis.get(prefsKey);

      let preferences: NotificationPreferences;

      if (preferencesData) {
        preferences = JSON.parse(preferencesData);
      } else {
        // Return default preferences
        preferences = this.getDefaultPreferences();
      }

      // Cache the preferences
      this.preferencesCache.set(userId, preferences);

      return preferences;
    } catch (error) {
      this.logger.error(`Failed to get preferences for user ${userId}:`, error);
      return this.getDefaultPreferences();
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<void> {
    try {
      // Get current preferences
      const currentPrefs = await this.getPreferences(userId);

      // Merge with updates
      const updatedPrefs = this.mergePreferences(currentPrefs, preferences);

      // Validate preferences
      this.validatePreferences(updatedPrefs);

      // Save to Redis
      const prefsKey = `notification:preferences:${userId}`;
      await this.redis.setex(prefsKey, 86400 * 365, JSON.stringify(updatedPrefs)); // Keep for 1 year

      // Update cache
      this.preferencesCache.set(userId, updatedPrefs);

      this.logger.info(`Updated preferences for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to update preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Reset user preferences to defaults
   */
  async resetPreferences(userId: string): Promise<void> {
    try {
      const defaultPrefs = this.getDefaultPreferences();

      // Save to Redis
      const prefsKey = `notification:preferences:${userId}`;
      await this.redis.setex(prefsKey, 86400 * 365, JSON.stringify(defaultPrefs));

      // Update cache
      this.preferencesCache.set(userId, defaultPrefs);

      this.logger.info(`Reset preferences for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to reset preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user can receive notification
   */
  async canReceiveNotification(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
    priority: NotificationPriority
  ): Promise<boolean> {
    try {
      const preferences = await this.getPreferences(userId);

      const channelPrefs = preferences.channels[channel];
      if (!channelPrefs?.enabled) {
        return false;
      }

      // Check priority filter
      if (channelPrefs.priority && !channelPrefs.priority.includes(priority)) {
        return false;
      }

      // Check category filter
      if (channelPrefs.categories && !channelPrefs.categories.includes(category)) {
        return false;
      }

      // Check opt-out preferences
      if (category === NotificationCategory.MARKETING && preferences.optOut?.marketing) {
        return false;
      }

      // Check quiet hours
      if (channelPrefs.quietHours?.enabled) {
        const isInQuietHours = this.isInQuietHours(channelPrefs.quietHours);
        if (isInQuietHours && priority !== NotificationPriority.CRITICAL) {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking notification permission for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Update channel preference
   */
  async updateChannelPreference(
    userId: string,
    channel: NotificationChannel,
    enabled: boolean,
    options?: {
      priority?: NotificationPriority[];
      categories?: NotificationCategory[];
      quietHours?: {
        enabled: boolean;
        start: string;
        end: string;
        timezone: string;
      };
    }
  ): Promise<void> {
    const preferences = await this.getPreferences(userId);

    if (!preferences.channels) {
      preferences.channels = {};
    }

    preferences.channels[channel] = {
      enabled,
      ...options
    };

    await this.updatePreferences(userId, preferences);
  }

  /**
   * Set marketing opt-out
   */
  async setMarketingOptOut(userId: string, optOut: boolean): Promise<void> {
    const preferences = await this.getPreferences(userId);

    if (!preferences.optOut) {
      preferences.optOut = {
        marketing: optOut,
        promotional: false
      };
    } else {
      preferences.optOut.marketing = optOut;
    }

    await this.updatePreferences(userId, preferences);
  }

  /**
   * Set promotional opt-out
   */
  async setPromotionalOptOut(userId: string, optOut: boolean): Promise<void> {
    const preferences = await this.getPreferences(userId);

    if (!preferences.optOut) {
      preferences.optOut = {
        marketing: false,
        promotional: optOut
      };
    } else {
      preferences.optOut.promotional = optOut;
    }

    await this.updatePreferences(userId, preferences);
  }

  /**
   * Get bulk preferences for multiple users
   */
  async getBulkPreferences(userIds: string[]): Promise<Map<string, NotificationPreferences>> {
    const preferences = new Map<string, NotificationPreferences>();

    // Use pipeline for efficient bulk retrieval
    const pipeline = this.redis.pipeline();
    for (const userId of userIds) {
      pipeline.get(`notification:preferences:${userId}`);
    }

    const results = await pipeline.exec();

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const result = results?.[i];

      if (result && result[1]) {
        try {
          preferences.set(userId, JSON.parse(result[1] as string));
        } catch (error) {
          this.logger.warn(`Invalid preferences data for user ${userId}`);
          preferences.set(userId, this.getDefaultPreferences());
        }
      } else {
        preferences.set(userId, this.getDefaultPreferences());
      }
    }

    return preferences;
  }

  /**
   * Clear preferences cache
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.preferencesCache.delete(userId);
    } else {
      this.preferencesCache.clear();
    }
  }

  /**
   * Get default notification preferences
   */
  private getDefaultPreferences(): NotificationPreferences {
    return {
      channels: {
        [NotificationChannel.EMAIL]: {
          enabled: true,
          priority: [NotificationPriority.NORMAL, NotificationPriority.HIGH, NotificationPriority.CRITICAL],
          categories: Object.values(NotificationCategory),
          quietHours: {
            enabled: false,
            start: '22:00',
            end: '08:00',
            timezone: 'UTC'
          }
        },
        [NotificationChannel.SMS]: {
          enabled: false,
          priority: [NotificationPriority.HIGH, NotificationPriority.CRITICAL],
          categories: [NotificationCategory.SECURITY, NotificationCategory.SYSTEM],
          quietHours: {
            enabled: true,
            start: '22:00',
            end: '08:00',
            timezone: 'UTC'
          }
        },
        [NotificationChannel.PUSH]: {
          enabled: true,
          priority: [NotificationPriority.NORMAL, NotificationPriority.HIGH, NotificationPriority.CRITICAL],
          categories: Object.values(NotificationCategory),
          quietHours: {
            enabled: true,
            start: '22:00',
            end: '08:00',
            timezone: 'UTC'
          }
        },
        [NotificationChannel.IN_APP]: {
          enabled: true,
          priority: Object.values(NotificationPriority),
          categories: Object.values(NotificationCategory)
        },
        [NotificationChannel.WEBHOOK]: {
          enabled: false
        }
      },
      frequency: {
        digest: false,
        immediate: true,
        daily: false,
        weekly: false
      },
      optOut: {
        marketing: false,
        promotional: false
      }
    };
  }

  /**
   * Merge preferences with updates
   */
  private mergePreferences(
    current: NotificationPreferences,
    updates: Partial<NotificationPreferences>
  ): NotificationPreferences {
    const merged = { ...current };

    if (updates.channels) {
      merged.channels = { ...current.channels };
      for (const [channel, prefs] of Object.entries(updates.channels)) {
        if (prefs) {
          merged.channels[channel as NotificationChannel] = {
            ...current.channels[channel as NotificationChannel],
            ...prefs
          };
        }
      }
    }

    if (updates.frequency) {
      merged.frequency = { ...current.frequency, ...updates.frequency };
    }

    if (updates.optOut) {
      merged.optOut = { ...current.optOut, ...updates.optOut };
    }

    return merged;
  }

  /**
   * Validate preferences structure
   */
  private validatePreferences(preferences: NotificationPreferences): void {
    if (!preferences.channels) {
      throw new Error('Preferences must include channels configuration');
    }

    for (const [channel, prefs] of Object.entries(preferences.channels)) {
      if (!Object.values(NotificationChannel).includes(channel as NotificationChannel)) {
        throw new Error(`Invalid notification channel: ${channel}`);
      }

      if (prefs && typeof prefs.enabled !== 'boolean') {
        throw new Error(`Channel ${channel} enabled must be boolean`);
      }

      if (prefs?.priority) {
        for (const priority of prefs.priority) {
          if (!Object.values(NotificationPriority).includes(priority)) {
            throw new Error(`Invalid priority: ${priority}`);
          }
        }
      }

      if (prefs?.categories) {
        for (const category of prefs.categories) {
          if (!Object.values(NotificationCategory).includes(category)) {
            throw new Error(`Invalid category: ${category}`);
          }
        }
      }
    }
  }

  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  }): boolean {
    if (!quietHours.enabled) {
      return false;
    }

    try {
      // For simplicity, using UTC. In production, you'd want proper timezone handling
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // HH:mm format

      const { start, end } = quietHours;

      if (start <= end) {
        // Same day quiet hours (e.g., 22:00 to 23:00)
        return currentTime >= start && currentTime <= end;
      } else {
        // Overnight quiet hours (e.g., 22:00 to 08:00)
        return currentTime >= start || currentTime <= end;
      }
    } catch (error) {
      this.logger.error('Error checking quiet hours:', error);
      return false;
    }
  }
}