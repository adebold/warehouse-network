/**
 * Email Notification Provider - Handles email notifications
 */

import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import { Logger } from 'winston';
import {
  NotificationProvider,
  NotificationRequest,
  NotificationRecipient,
  NotificationResult,
  NotificationChannel,
  NotificationStatus,
  EmailProviderConfig
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export class EmailProvider implements NotificationProvider {
  readonly id = 'email';
  readonly name = 'Email Provider';
  readonly channels = [NotificationChannel.EMAIL];

  private transporter: Transporter;
  private logger: Logger;

  constructor(private config: EmailProviderConfig) {
    this.logger = createLogger('EmailProvider');
    this.setupTransporter();
  }

  /**
   * Send email notification
   */
  async send(request: NotificationRequest, recipient: NotificationRecipient): Promise<NotificationResult> {
    const startTime = Date.now();
    const notificationId = `${request.id}_${recipient.id}_email`;

    try {
      if (!recipient.email) {
        throw new Error('Recipient email address is required');
      }

      this.logger.info(`Sending email notification: ${notificationId}`);

      const mailOptions: SendMailOptions = {
        from: {
          name: this.config.fromName,
          address: this.config.fromAddress
        },
        to: recipient.email,
        subject: request.subject || 'Notification',
        text: request.content,
        html: request.htmlContent || this.generateHtmlFromText(request.content),
        messageId: notificationId,
        headers: {
          'X-Notification-ID': notificationId,
          'X-Organization-ID': recipient.organizationId || '',
          'X-User-ID': recipient.userId || ''
        }
      };

      // Add tracking metadata
      if (request.metadata) {
        mailOptions.headers = {
          ...mailOptions.headers,
          'X-Metadata': JSON.stringify(request.metadata)
        };
      }

      // Send email
      const result = await this.transporter.sendMail(mailOptions);

      const notificationResult: NotificationResult = {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
        providerId: this.id,
        providerMessageId: result.messageId,
        providerResponse: {
          accepted: result.accepted,
          rejected: result.rejected,
          response: result.response
        },
        sentAt: new Date(),
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.logger.info(
        `Email sent successfully: ${notificationId} (${Date.now() - startTime}ms) - ${result.messageId}`
      );

      return notificationResult;
    } catch (error) {
      this.logger.error(`Failed to send email notification ${notificationId}:`, error);

      return {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.FAILED,
        providerId: this.id,
        error: {
          code: error.code || 'EMAIL_SEND_FAILED',
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
    // For most email providers, we can only know if it was sent
    // Delivery tracking would require webhooks or additional services
    return NotificationStatus.SENT;
  }

  /**
   * Validate provider configuration
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Verify transporter configuration
      await this.transporter.verify();
      this.logger.info('Email provider configuration is valid');
      return true;
    } catch (error) {
      this.logger.error('Email provider configuration is invalid:', error);
      return false;
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulk(requests: { request: NotificationRequest; recipient: NotificationRecipient }[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    // Process in batches to avoid overwhelming the email service
    const batchSize = 50;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchPromises = batch.map(({ request, recipient }) => this.send(request, recipient));

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            this.logger.error('Bulk email send failed:', result.reason);
            // Create error result
            results.push({
              id: `failed_${Date.now()}`,
              requestId: 'bulk_failed',
              recipientId: 'unknown',
              channel: NotificationChannel.EMAIL,
              status: NotificationStatus.FAILED,
              providerId: this.id,
              error: {
                code: 'BULK_SEND_FAILED',
                message: result.reason?.message || 'Unknown error',
                details: result.reason
              },
              attemptCount: 1,
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }
      } catch (error) {
        this.logger.error('Batch processing failed:', error);
      }

      // Small delay between batches to be respectful to the email service
      if (i + batchSize < requests.length) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Setup email transporter based on configuration
   */
  private setupTransporter(): void {
    try {
      switch (this.config.provider) {
        case 'smtp':
          this.transporter = nodemailer.createTransporter({
            host: this.config.host,
            port: this.config.port || 587,
            secure: this.config.secure || false,
            auth: this.config.auth
          });
          break;

        case 'ses':
          this.transporter = nodemailer.createTransporter({
            service: 'SES',
            region: this.config.region || 'us-east-1',
            auth: {
              user: this.config.auth?.user,
              pass: this.config.auth?.pass
            }
          });
          break;

        case 'sendgrid':
          this.transporter = nodemailer.createTransporter({
            service: 'SendGrid',
            auth: {
              user: 'apikey',
              pass: this.config.apiKey
            }
          });
          break;

        case 'mailgun':
          this.transporter = nodemailer.createTransporter({
            service: 'Mailgun',
            auth: {
              user: this.config.auth?.user,
              pass: this.config.apiKey
            }
          });
          break;

        default:
          throw new Error(`Unsupported email provider: ${this.config.provider}`);
      }

      this.logger.info(`Email transporter configured for provider: ${this.config.provider}`);
    } catch (error) {
      this.logger.error('Failed to setup email transporter:', error);
      throw error;
    }
  }

  /**
   * Generate HTML from plain text
   */
  private generateHtmlFromText(text: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Notification</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          }
          .content {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 12px;
            color: #666;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">${this.escapeHtml(text)}</div>
          <div class="footer">
            This is an automated notification from Warehouse Network.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const div = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>');

    return div;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test email configuration by sending a test email
   */
  async testConfiguration(testEmail: string): Promise<boolean> {
    try {
      const testRequest: NotificationRequest = {
        id: `test_${Date.now()}`,
        recipients: [],
        content: 'This is a test email from Warehouse Network notification system.',
        subject: 'Test Email - Warehouse Network',
        channels: [NotificationChannel.EMAIL],
        priority: 'normal' as any,
        category: 'system' as any
      };

      const testRecipient: NotificationRecipient = {
        id: 'test_recipient',
        type: 'external',
        email: testEmail
      };

      const result = await this.send(testRequest, testRecipient);
      return result.status === NotificationStatus.SENT;
    } catch (error) {
      this.logger.error('Email configuration test failed:', error);
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
      status: 'active',
      lastVerified: new Date()
    };
  }
}