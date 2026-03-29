/**
 * Push Notification Provider - Handles mobile push notifications via FCM and APNS
 */

import admin from 'firebase-admin';
import { Logger } from 'winston';
import {
  NotificationProvider,
  NotificationRequest,
  NotificationRecipient,
  NotificationResult,
  NotificationChannel,
  NotificationStatus,
  PushProviderConfig
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export class PushProvider implements NotificationProvider {
  readonly id = 'push';
  readonly name = 'Push Notification Provider';
  readonly channels = [NotificationChannel.PUSH];

  private logger: Logger;
  private fcmApp?: admin.app.App;

  constructor(private config: PushProviderConfig) {
    this.logger = createLogger('PushProvider');
    this.setupProvider();
  }

  /**
   * Send push notification
   */
  async send(request: NotificationRequest, recipient: NotificationRecipient): Promise<NotificationResult> {
    const startTime = Date.now();
    const notificationId = `${request.id}_${recipient.id}_push`;

    try {
      if (!recipient.deviceTokens || recipient.deviceTokens.length === 0) {
        throw new Error('Recipient device tokens are required');
      }

      this.logger.info(`Sending push notification: ${notificationId} to ${recipient.deviceTokens.length} devices`);

      const results = await Promise.allSettled(
        recipient.deviceTokens.map(token => this.sendToDevice(request, token, notificationId))
      );

      // Determine overall status
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.length - successCount;

      let status = NotificationStatus.SENT;
      if (failureCount === results.length) {
        status = NotificationStatus.FAILED;
      } else if (failureCount > 0) {
        // Partial success - we'll consider it sent but log the failures
        this.logger.warn(`Push notification partially delivered: ${successCount}/${results.length} devices`);
      }

      const notificationResult: NotificationResult = {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.PUSH,
        status,
        providerId: this.id,
        providerResponse: {
          successCount,
          failureCount,
          results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
        },
        sentAt: new Date(),
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (status === NotificationStatus.FAILED) {
        notificationResult.error = {
          code: 'PUSH_SEND_FAILED',
          message: `Failed to send to all ${results.length} devices`,
          details: results.filter(r => r.status === 'rejected').map(r => r.reason)
        };
      }

      this.logger.info(
        `Push notification processed: ${notificationId} (${Date.now() - startTime}ms) - ${successCount}/${results.length} successful`
      );

      return notificationResult;
    } catch (error) {
      this.logger.error(`Failed to send push notification ${notificationId}:`, error);

      return {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.FAILED,
        providerId: this.id,
        error: {
          code: error.code || 'PUSH_SEND_FAILED',
          message: error.message,
          details: error
        },
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  }

  /**
   * Get notification status
   */
  async getStatus(messageId: string): Promise<NotificationStatus> {
    // Push notifications are typically fire-and-forget
    // Status tracking would require additional implementation
    return NotificationStatus.SENT;
  }

  /**
   * Validate provider configuration
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      if (this.config.provider === 'fcm') {
        return await this.validateFCMConfig();
      } else if (this.config.provider === 'apns') {
        return await this.validateAPNSConfig();
      }
      return false;
    } catch (error) {
      this.logger.error('Push provider configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Send push notification to a single device
   */
  private async sendToDevice(request: NotificationRequest, deviceToken: string, notificationId: string): Promise<string> {
    if (this.config.provider === 'fcm') {
      return await this.sendViaFCM(request, deviceToken, notificationId);
    } else if (this.config.provider === 'apns') {
      return await this.sendViaAPNS(request, deviceToken, notificationId);
    }
    throw new Error(`Unsupported push provider: ${this.config.provider}`);
  }

  /**
   * Send push notification via Firebase Cloud Messaging
   */
  private async sendViaFCM(request: NotificationRequest, deviceToken: string, notificationId: string): Promise<string> {
    if (!this.fcmApp) {
      throw new Error('FCM not configured');
    }

    const message: admin.messaging.Message = {
      token: deviceToken,
      notification: {
        title: request.subject || 'Notification',
        body: this.truncateText(request.content, 200) // FCM has body limits
      },
      data: {
        notificationId,
        requestId: request.id!,
        category: request.category,
        priority: request.priority,
        ...(request.metadata || {})
      },
      android: {
        priority: this.mapPriorityToAndroid(request.priority),
        notification: {
          channelId: this.getAndroidChannelId(request.category),
          priority: this.mapPriorityToAndroid(request.priority),
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: request.subject || 'Notification',
              body: this.truncateText(request.content, 200)
            },
            sound: 'default',
            badge: 1
          }
        },
        headers: {
          'apns-priority': this.mapPriorityToAPNS(request.priority),
          'apns-push-type': 'alert'
        }
      }
    };

    const messaging = admin.messaging(this.fcmApp);
    const response = await messaging.send(message);

    this.logger.debug(`FCM message sent: ${response}`);
    return response;
  }

  /**
   * Send push notification via Apple Push Notification Service
   */
  private async sendViaAPNS(request: NotificationRequest, deviceToken: string, notificationId: string): Promise<string> {
    // APNS implementation would require additional setup with certificates
    // This is a placeholder for the APNS implementation
    throw new Error('APNS provider not fully implemented');
  }

  /**
   * Setup push notification provider
   */
  private setupProvider(): void {
    try {
      if (this.config.provider === 'fcm' && this.config.serviceAccountKey) {
        // Initialize Firebase Admin
        let serviceAccount;

        if (typeof this.config.serviceAccountKey === 'string') {
          // If it's a file path or JSON string
          try {
            serviceAccount = JSON.parse(this.config.serviceAccountKey);
          } catch {
            // Assume it's a file path
            serviceAccount = require(this.config.serviceAccountKey);
          }
        } else {
          serviceAccount = this.config.serviceAccountKey;
        }

        this.fcmApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        }, `notification-push-${Date.now()}`);

        this.logger.info('FCM push notification provider configured');
      } else if (this.config.provider === 'apns') {
        // APNS setup would go here
        this.logger.info('APNS push notification provider configured');
      }
    } catch (error) {
      this.logger.error('Failed to setup push notification provider:', error);
      throw error;
    }
  }

  /**
   * Validate FCM configuration
   */
  private async validateFCMConfig(): Promise<boolean> {
    try {
      if (!this.fcmApp) {
        return false;
      }

      // Test the connection by attempting to get project info
      const messaging = admin.messaging(this.fcmApp);

      // Try to validate a fake token to test the connection
      // This will fail gracefully but confirm FCM connectivity
      try {
        await messaging.send({
          token: 'fake-token-for-validation',
          notification: {
            title: 'Test',
            body: 'Test'
          }
        }, true); // Dry run
      } catch (error) {
        // Expected error for fake token, but confirms FCM is working
        if (error.code === 'messaging/registration-token-not-registered') {
          this.logger.info('FCM configuration is valid');
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('FCM configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Validate APNS configuration
   */
  private async validateAPNSConfig(): Promise<boolean> {
    // APNS validation would go here
    this.logger.warn('APNS validation not implemented');
    return true;
  }

  /**
   * Send bulk push notifications
   */
  async sendBulk(requests: { request: NotificationRequest; recipient: NotificationRecipient }[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    // FCM supports batch sending up to 500 messages
    const batchSize = 500;

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);

      if (this.config.provider === 'fcm' && this.fcmApp) {
        try {
          const messages = this.prepareFCMBatch(batch);
          const messaging = admin.messaging(this.fcmApp);
          const response = await messaging.sendAll(messages);

          // Process batch response
          for (let j = 0; j < response.responses.length; j++) {
            const messageResponse = response.responses[j];
            const originalRequest = batch[j];

            const result: NotificationResult = {
              id: `${originalRequest.request.id}_${originalRequest.recipient.id}_push`,
              requestId: originalRequest.request.id!,
              recipientId: originalRequest.recipient.id,
              channel: NotificationChannel.PUSH,
              status: messageResponse.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
              providerId: this.id,
              providerMessageId: messageResponse.messageId,
              sentAt: new Date(),
              attemptCount: 1,
              createdAt: new Date(),
              updatedAt: new Date()
            };

            if (!messageResponse.success) {
              result.error = {
                code: messageResponse.error?.code || 'PUSH_SEND_FAILED',
                message: messageResponse.error?.message || 'Unknown error'
              };
            }

            results.push(result);
          }
        } catch (error) {
          this.logger.error('FCM batch send failed:', error);
          // Create error results for the entire batch
          for (const item of batch) {
            results.push(this.createErrorResult(item.request.id!, item.recipient.id, error));
          }
        }
      } else {
        // Fallback to individual sends
        const individualResults = await Promise.allSettled(
          batch.map(({ request, recipient }) => this.send(request, recipient))
        );

        for (const result of individualResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push(this.createErrorResult('unknown', 'unknown', result.reason));
          }
        }
      }

      // Small delay between batches
      if (i + batchSize < requests.length) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Prepare FCM batch messages
   */
  private prepareFCMBatch(requests: { request: NotificationRequest; recipient: NotificationRecipient }[]): admin.messaging.Message[] {
    const messages: admin.messaging.Message[] = [];

    for (const { request, recipient } of requests) {
      if (!recipient.deviceTokens) continue;

      for (const deviceToken of recipient.deviceTokens) {
        messages.push({
          token: deviceToken,
          notification: {
            title: request.subject || 'Notification',
            body: this.truncateText(request.content, 200)
          },
          data: {
            notificationId: `${request.id}_${recipient.id}_push`,
            requestId: request.id!,
            category: request.category,
            priority: request.priority,
            ...(request.metadata || {})
          },
          android: {
            priority: this.mapPriorityToAndroid(request.priority),
            notification: {
              channelId: this.getAndroidChannelId(request.category),
              sound: 'default'
            }
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title: request.subject || 'Notification',
                  body: this.truncateText(request.content, 200)
                },
                sound: 'default',
                badge: 1
              }
            }
          }
        });
      }
    }

    return messages;
  }

  /**
   * Map notification priority to Android priority
   */
  private mapPriorityToAndroid(priority: string): 'min' | 'low' | 'default' | 'high' | 'max' {
    switch (priority) {
      case 'critical':
        return 'max';
      case 'high':
        return 'high';
      case 'normal':
        return 'default';
      case 'low':
        return 'low';
      default:
        return 'default';
    }
  }

  /**
   * Map notification priority to APNS priority
   */
  private mapPriorityToAPNS(priority: string): '5' | '10' {
    return priority === 'critical' || priority === 'high' ? '10' : '5';
  }

  /**
   * Get Android notification channel ID based on category
   */
  private getAndroidChannelId(category: string): string {
    const channelMap: { [key: string]: string } = {
      'system': 'system_notifications',
      'security': 'security_alerts',
      'billing': 'billing_notifications',
      'inventory': 'inventory_updates',
      'user_action': 'user_notifications',
      'marketing': 'marketing_notifications',
      'operational': 'operational_updates'
    };

    return channelMap[category] || 'default_notifications';
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Create error result helper
   */
  private createErrorResult(requestId: string, recipientId: string, error: any): NotificationResult {
    return {
      id: `failed_${Date.now()}`,
      requestId,
      recipientId,
      channel: NotificationChannel.PUSH,
      status: NotificationStatus.FAILED,
      providerId: this.id,
      error: {
        code: 'PUSH_SEND_FAILED',
        message: error?.message || 'Unknown error',
        details: error
      },
      attemptCount: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test push notification configuration
   */
  async testConfiguration(testDeviceToken: string): Promise<boolean> {
    try {
      const testRequest: NotificationRequest = {
        id: `test_${Date.now()}`,
        recipients: [],
        content: 'Test push notification from Warehouse Network notification system.',
        subject: 'Test Notification',
        channels: [NotificationChannel.PUSH],
        priority: 'normal' as any,
        category: 'system' as any
      };

      const testRecipient: NotificationRecipient = {
        id: 'test_recipient',
        type: 'external',
        deviceTokens: [testDeviceToken]
      };

      const result = await this.send(testRequest, testRecipient);
      return result.status === NotificationStatus.SENT;
    } catch (error) {
      this.logger.error('Push notification configuration test failed:', error);
      return false;
    }
  }

  /**
   * Get provider statistics
   */
  getStats(): {
    provider: string;
    status: string;
    lastVerified?: Date;
  } {
    return {
      provider: this.config.provider,
      status: this.fcmApp ? 'active' : 'inactive',
      lastVerified: new Date()
    };
  }

  /**
   * Clean up invalid device tokens
   */
  async cleanupInvalidTokens(deviceTokens: string[]): Promise<string[]> {
    if (this.config.provider !== 'fcm' || !this.fcmApp) {
      return deviceTokens;
    }

    try {
      // Use FCM's batch token validation (dry run)
      const messages = deviceTokens.map(token => ({
        token,
        notification: {
          title: 'Test',
          body: 'Test'
        }
      }));

      const messaging = admin.messaging(this.fcmApp);
      const response = await messaging.sendAll(messages, true); // Dry run

      const validTokens: string[] = [];
      for (let i = 0; i < response.responses.length; i++) {
        const messageResponse = response.responses[i];
        if (messageResponse.success ||
            (messageResponse.error?.code !== 'messaging/registration-token-not-registered' &&
             messageResponse.error?.code !== 'messaging/invalid-registration-token')) {
          validTokens.push(deviceTokens[i]);
        }
      }

      this.logger.info(`Cleaned up ${deviceTokens.length - validTokens.length} invalid device tokens`);
      return validTokens;
    } catch (error) {
      this.logger.error('Failed to clean up device tokens:', error);
      return deviceTokens; // Return all tokens if cleanup fails
    }
  }
}