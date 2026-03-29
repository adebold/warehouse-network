/**
 * Webhook Notification Provider - Handles webhook notifications for external integrations
 */

import axios, { AxiosResponse, AxiosError } from 'axios';
import crypto from 'crypto';
import { Logger } from 'winston';
import {
  NotificationProvider,
  NotificationRequest,
  NotificationRecipient,
  NotificationResult,
  NotificationChannel,
  NotificationStatus,
  WebhookPayload
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export interface WebhookProviderConfig {
  defaultTimeout: number;
  maxRetries: number;
  retryDelay: number;
  signatureSecret?: string;
  userAgent: string;
  defaultHeaders: Record<string, string>;
}

export class WebhookProvider implements NotificationProvider {
  readonly id = 'webhook';
  readonly name = 'Webhook Provider';
  readonly channels = [NotificationChannel.WEBHOOK];

  private logger: Logger;

  constructor(private config: WebhookProviderConfig) {
    this.logger = createLogger('WebhookProvider');
  }

  /**
   * Send webhook notification
   */
  async send(request: NotificationRequest, recipient: NotificationRecipient): Promise<NotificationResult> {
    const startTime = Date.now();
    const notificationId = `${request.id}_${recipient.id}_webhook`;

    try {
      if (!recipient.webhookUrl) {
        throw new Error('Recipient webhook URL is required');
      }

      this.logger.info(`Sending webhook notification: ${notificationId} to ${recipient.webhookUrl}`);

      // Prepare webhook payload
      const payload = this.preparePayload(request, recipient, notificationId);

      // Send webhook with retry logic
      const response = await this.sendWithRetry(recipient.webhookUrl, payload, notificationId);

      const notificationResult: NotificationResult = {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.WEBHOOK,
        status: NotificationStatus.SENT,
        providerId: this.id,
        providerResponse: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data
        },
        sentAt: new Date(),
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.logger.info(
        `Webhook sent successfully: ${notificationId} (${Date.now() - startTime}ms) - Status: ${response.status}`
      );

      return notificationResult;
    } catch (error) {
      this.logger.error(`Failed to send webhook notification ${notificationId}:`, error);

      return {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.WEBHOOK,
        status: NotificationStatus.FAILED,
        providerId: this.id,
        error: {
          code: error.code || 'WEBHOOK_SEND_FAILED',
          message: error.message,
          details: this.extractErrorDetails(error)
        },
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  }

  /**
   * Get notification status (webhooks are typically fire-and-forget)
   */
  async getStatus(messageId: string): Promise<NotificationStatus> {
    return NotificationStatus.SENT;
  }

  /**
   * Validate provider configuration
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Basic configuration validation
      if (!this.config.defaultTimeout || this.config.defaultTimeout <= 0) {
        this.logger.error('Invalid webhook timeout configuration');
        return false;
      }

      if (!this.config.userAgent) {
        this.logger.error('User agent is required for webhook provider');
        return false;
      }

      this.logger.info('Webhook provider configuration is valid');
      return true;
    } catch (error) {
      this.logger.error('Webhook provider configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Send bulk webhook notifications
   */
  async sendBulk(requests: { request: NotificationRequest; recipient: NotificationRecipient }[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    // Group requests by webhook URL for potential optimization
    const requestsByUrl = new Map<string, typeof requests>();

    for (const item of requests) {
      const url = item.recipient.webhookUrl;
      if (url) {
        if (!requestsByUrl.has(url)) {
          requestsByUrl.set(url, []);
        }
        requestsByUrl.get(url)!.push(item);
      }
    }

    // Process webhooks in parallel batches
    const batchSize = 20;
    const allRequests = Array.from(requestsByUrl.values()).flat();

    for (let i = 0; i < allRequests.length; i += batchSize) {
      const batch = allRequests.slice(i, i + batchSize);
      const batchPromises = batch.map(({ request, recipient }) => this.send(request, recipient));

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            this.logger.error('Bulk webhook send failed:', result.reason);
            results.push(this.createErrorResult('bulk_failed', 'unknown', result.reason));
          }
        }
      } catch (error) {
        this.logger.error('Webhook batch processing failed:', error);
      }

      // Small delay between batches
      if (i + batchSize < allRequests.length) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(webhookUrl: string, customPayload?: any): Promise<boolean> {
    try {
      const testPayload = customPayload || {
        event: 'webhook.test',
        data: {
          message: 'Test webhook from Warehouse Network notification system',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date()
      };

      const response = await this.sendWithRetry(webhookUrl, testPayload, 'test_webhook');
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      this.logger.error('Webhook test failed:', error);
      return false;
    }
  }

  /**
   * Prepare webhook payload
   */
  private preparePayload(request: NotificationRequest, recipient: NotificationRecipient, notificationId: string): WebhookPayload {
    return {
      event: 'notification.sent',
      data: {
        notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        subject: request.subject,
        content: request.content,
        category: request.category,
        priority: request.priority,
        channels: request.channels,
        variables: request.variables,
        metadata: request.metadata
      },
      timestamp: new Date(),
      organizationId: recipient.organizationId,
      signature: this.config.signatureSecret ? this.generateSignature(request, recipient) : undefined,
      metadata: {
        provider: this.id,
        version: '1.0.0'
      }
    };
  }

  /**
   * Send webhook with retry logic
   */
  private async sendWithRetry(url: string, payload: WebhookPayload, notificationId: string): Promise<AxiosResponse> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': this.config.userAgent,
          'X-Notification-ID': notificationId,
          'X-Webhook-Timestamp': payload.timestamp.toISOString(),
          ...this.config.defaultHeaders
        };

        // Add signature header if configured
        if (payload.signature) {
          headers['X-Webhook-Signature'] = payload.signature;
        }

        const response = await axios.post(url, payload, {
          headers,
          timeout: this.config.defaultTimeout,
          maxRedirects: 5,
          validateStatus: (status) => status < 500 // Retry on server errors only
        });

        // Success - return response
        return response;
      } catch (error) {
        lastError = error;
        const axiosError = error as AxiosError;

        // Don't retry on client errors (4xx)
        if (axiosError.response && axiosError.response.status < 500) {
          throw error;
        }

        if (attempt <= this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          this.logger.warn(
            `Webhook attempt ${attempt} failed for ${notificationId}, retrying in ${delay}ms: ${error.message}`
          );
          await this.delay(delay);
        }
      }
    }

    // All retries failed
    throw lastError;
  }

  /**
   * Generate webhook signature for security
   */
  private generateSignature(request: NotificationRequest, recipient: NotificationRecipient): string {
    if (!this.config.signatureSecret) {
      return '';
    }

    const payload = JSON.stringify({
      requestId: request.id,
      recipientId: recipient.id,
      timestamp: new Date().toISOString()
    });

    return crypto
      .createHmac('sha256', this.config.signatureSecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature (for incoming webhooks)
   */
  verifySignature(payload: string, signature: string, secret?: string): boolean {
    try {
      const webhookSecret = secret || this.config.signatureSecret;
      if (!webhookSecret) {
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.logger.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Extract error details from various error types
   */
  private extractErrorDetails(error: any): any {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      return {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        headers: axiosError.response.headers,
        data: axiosError.response.data,
        url: axiosError.config?.url
      };
    }

    if (axiosError.request) {
      return {
        message: 'No response received',
        url: axiosError.config?.url,
        timeout: axiosError.config?.timeout
      };
    }

    return {
      message: error.message,
      stack: error.stack
    };
  }

  /**
   * Create error result helper
   */
  private createErrorResult(requestId: string, recipientId: string, error: any): NotificationResult {
    return {
      id: `failed_${Date.now()}`,
      requestId,
      recipientId,
      channel: NotificationChannel.WEBHOOK,
      status: NotificationStatus.FAILED,
      providerId: this.id,
      error: {
        code: 'WEBHOOK_SEND_FAILED',
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
    configuration: Partial<WebhookProviderConfig>;
  } {
    return {
      provider: 'webhook',
      status: 'active',
      configuration: {
        defaultTimeout: this.config.defaultTimeout,
        maxRetries: this.config.maxRetries,
        retryDelay: this.config.retryDelay,
        userAgent: this.config.userAgent
      }
    };
  }

  /**
   * Parse webhook URL and validate format
   */
  validateWebhookUrl(url: string): { isValid: boolean; error?: string } {
    try {
      const parsedUrl = new URL(url);

      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { isValid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
      }

      // Don't allow localhost in production
      if (process.env.NODE_ENV === 'production' &&
          (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1')) {
        return { isValid: false, error: 'Localhost URLs are not allowed in production' };
      }

      // Don't allow private IP ranges in production
      if (process.env.NODE_ENV === 'production') {
        const privateRanges = [
          /^10\./,
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
          /^192\.168\./
        ];

        if (privateRanges.some(range => range.test(parsedUrl.hostname))) {
          return { isValid: false, error: 'Private IP addresses are not allowed in production' };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Create webhook payload for specific event types
   */
  createEventPayload(
    eventType: string,
    data: any,
    organizationId?: string,
    metadata?: Record<string, any>
  ): WebhookPayload {
    return {
      event: eventType,
      data,
      timestamp: new Date(),
      organizationId,
      metadata: {
        provider: this.id,
        version: '1.0.0',
        ...metadata
      }
    };
  }
}