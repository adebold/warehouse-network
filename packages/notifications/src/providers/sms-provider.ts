/**
 * SMS Notification Provider - Handles SMS notifications via Twilio and other providers
 */

import { Logger } from 'winston';
import axios from 'axios';
import {
  NotificationProvider,
  NotificationRequest,
  NotificationRecipient,
  NotificationResult,
  NotificationChannel,
  NotificationStatus,
  SMSProviderConfig
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export class SMSProvider implements NotificationProvider {
  readonly id = 'sms';
  readonly name = 'SMS Provider';
  readonly channels = [NotificationChannel.SMS];

  private logger: Logger;
  private twilioClient?: any;

  constructor(private config: SMSProviderConfig) {
    this.logger = createLogger('SMSProvider');
    this.setupProvider();
  }

  /**
   * Send SMS notification
   */
  async send(request: NotificationRequest, recipient: NotificationRecipient): Promise<NotificationResult> {
    const startTime = Date.now();
    const notificationId = `${request.id}_${recipient.id}_sms`;

    try {
      if (!recipient.phone) {
        throw new Error('Recipient phone number is required');
      }

      this.logger.info(`Sending SMS notification: ${notificationId}`);

      const result = await this.sendViaTwilio(request, recipient, notificationId);

      this.logger.info(
        `SMS sent successfully: ${notificationId} (${Date.now() - startTime}ms) - SID: ${result.providerMessageId}`
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to send SMS notification ${notificationId}:`, error);

      return {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.FAILED,
        providerId: this.id,
        error: {
          code: error.code || 'SMS_SEND_FAILED',
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
    if (this.config.provider !== 'twilio' || !this.twilioClient) {
      return NotificationStatus.SENT;
    }

    try {
      const message = await this.twilioClient.messages(messageId).fetch();

      switch (message.status) {
        case 'queued':
        case 'sending':
          return NotificationStatus.PROCESSING;
        case 'sent':
        case 'delivered':
          return NotificationStatus.DELIVERED;
        case 'failed':
        case 'undelivered':
          return NotificationStatus.FAILED;
        default:
          return NotificationStatus.SENT;
      }
    } catch (error) {
      this.logger.error('Failed to get SMS status:', error);
      return NotificationStatus.SENT;
    }
  }

  /**
   * Validate provider configuration
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      switch (this.config.provider) {
        case 'twilio':
          return await this.validateTwilioConfig();
        case 'aws-sns':
          return await this.validateSNSConfig();
        case 'vonage':
          return await this.validateVonageConfig();
        default:
          this.logger.error(`Unsupported SMS provider: ${this.config.provider}`);
          return false;
      }
    } catch (error) {
      this.logger.error('SMS provider configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Send bulk SMS messages
   */
  async sendBulk(requests: { request: NotificationRequest; recipient: NotificationRecipient }[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    // Process in smaller batches for SMS to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchPromises = batch.map(({ request, recipient }) => this.send(request, recipient));

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            this.logger.error('Bulk SMS send failed:', result.reason);
            results.push(this.createErrorResult('bulk_failed', 'unknown', result.reason));
          }
        }
      } catch (error) {
        this.logger.error('SMS batch processing failed:', error);
      }

      // Longer delay between batches for SMS
      if (i + batchSize < requests.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Format phone number to E.164 format
   */
  formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Add country code if missing (assuming US +1)
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (!digits.startsWith('+')) {
      return `+${digits}`;
    }

    return digits;
  }

  /**
   * Test SMS configuration
   */
  async testConfiguration(testPhone: string): Promise<boolean> {
    try {
      const testRequest: NotificationRequest = {
        id: `test_${Date.now()}`,
        recipients: [],
        content: 'Test SMS from Warehouse Network notification system.',
        channels: [NotificationChannel.SMS],
        priority: 'normal' as any,
        category: 'system' as any
      };

      const testRecipient: NotificationRecipient = {
        id: 'test_recipient',
        type: 'external',
        phone: testPhone
      };

      const result = await this.send(testRequest, testRecipient);
      return result.status === NotificationStatus.SENT || result.status === NotificationStatus.PROCESSING;
    } catch (error) {
      this.logger.error('SMS configuration test failed:', error);
      return false;
    }
  }

  /**
   * Setup SMS provider client
   */
  private setupProvider(): void {
    try {
      switch (this.config.provider) {
        case 'twilio':
          // Dynamic import to avoid requiring Twilio if not used
          try {
            const twilio = require('twilio');
            this.twilioClient = twilio(this.config.accountSid, this.config.authToken);
            this.logger.info('Twilio SMS client configured');
          } catch (error) {
            this.logger.warn('Twilio package not available. Install with: npm install twilio');
          }
          break;
        // Other providers would be set up here
      }
    } catch (error) {
      this.logger.error('Failed to setup SMS provider:', error);
      throw error;
    }
  }

  /**
   * Send SMS via Twilio
   */
  private async sendViaTwilio(
    request: NotificationRequest,
    recipient: NotificationRecipient,
    notificationId: string
  ): Promise<NotificationResult> {
    if (!this.twilioClient) {
      throw new Error('Twilio client not configured');
    }

    const formattedPhone = this.formatPhoneNumber(recipient.phone!);

    // Truncate message if too long (SMS limit is 160 chars for single message)
    let messageBody = request.content;
    if (messageBody.length > 1600) { // Twilio's limit for concatenated SMS
      messageBody = messageBody.substring(0, 1597) + '...';
    }

    const message = await this.twilioClient.messages.create({
      body: messageBody,
      from: this.config.fromNumber,
      to: formattedPhone,
      statusCallback: process.env.TWILIO_WEBHOOK_URL // For delivery status updates
    });

    return {
      id: notificationId,
      requestId: request.id!,
      recipientId: recipient.id,
      channel: NotificationChannel.SMS,
      status: NotificationStatus.SENT,
      providerId: this.id,
      providerMessageId: message.sid,
      providerResponse: {
        sid: message.sid,
        status: message.status,
        direction: message.direction,
        from: message.from,
        to: message.to
      },
      sentAt: new Date(),
      attemptCount: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Send SMS via AWS SNS
   */
  private async sendViaSNS(
    request: NotificationRequest,
    recipient: NotificationRecipient,
    notificationId: string
  ): Promise<NotificationResult> {
    // AWS SNS implementation would go here
    throw new Error('AWS SNS SMS provider not implemented yet');
  }

  /**
   * Send SMS via Vonage (formerly Nexmo)
   */
  private async sendViaVonage(
    request: NotificationRequest,
    recipient: NotificationRecipient,
    notificationId: string
  ): Promise<NotificationResult> {
    // Vonage implementation would go here
    throw new Error('Vonage SMS provider not implemented yet');
  }

  /**
   * Validate Twilio configuration
   */
  private async validateTwilioConfig(): Promise<boolean> {
    if (!this.twilioClient) {
      return false;
    }

    try {
      await this.twilioClient.api.accounts(this.config.accountSid).fetch();
      this.logger.info('Twilio configuration is valid');
      return true;
    } catch (error) {
      this.logger.error('Twilio configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Validate AWS SNS configuration
   */
  private async validateSNSConfig(): Promise<boolean> {
    // AWS SNS validation would go here
    this.logger.warn('AWS SNS validation not implemented');
    return true;
  }

  /**
   * Validate Vonage configuration
   */
  private async validateVonageConfig(): Promise<boolean> {
    // Vonage validation would go here
    this.logger.warn('Vonage validation not implemented');
    return true;
  }

  /**
   * Create error result helper
   */
  private createErrorResult(requestId: string, recipientId: string, error: any): NotificationResult {
    return {
      id: `failed_${Date.now()}`,
      requestId,
      recipientId,
      channel: NotificationChannel.SMS,
      status: NotificationStatus.FAILED,
      providerId: this.id,
      error: {
        code: 'SMS_SEND_FAILED',
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
   * Get provider statistics
   */
  getStats(): {
    provider: string;
    status: string;
    lastVerified?: Date;
  } {
    return {
      provider: this.config.provider,
      status: this.twilioClient ? 'active' : 'inactive',
      lastVerified: new Date()
    };
  }

  /**
   * Handle Twilio webhook for delivery status updates
   */
  async handleTwilioWebhook(webhookData: any): Promise<void> {
    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = webhookData;

      this.logger.info(`Twilio webhook received: ${MessageSid} - ${MessageStatus}`);

      // Update notification status in your database based on webhook data
      // This would typically emit an event or update Redis/database

      // Emit event for status update
      // this.emit('sms:status_update', {
      //   messageId: MessageSid,
      //   status: this.mapTwilioStatus(MessageStatus),
      //   error: ErrorCode ? { code: ErrorCode, message: ErrorMessage } : null
      // });

    } catch (error) {
      this.logger.error('Failed to process Twilio webhook:', error);
    }
  }

  /**
   * Map Twilio status to notification status
   */
  private mapTwilioStatus(twilioStatus: string): NotificationStatus {
    switch (twilioStatus) {
      case 'queued':
      case 'sending':
        return NotificationStatus.PROCESSING;
      case 'sent':
        return NotificationStatus.SENT;
      case 'delivered':
        return NotificationStatus.DELIVERED;
      case 'failed':
      case 'undelivered':
        return NotificationStatus.FAILED;
      default:
        return NotificationStatus.SENT;
    }
  }
}