const axios = require('axios');
const crypto = require('crypto');
const Queue = require('bull');
const logger = require('../../shared/utils/logger');
const Webhook = require('../models/Webhook');
const WebhookLog = require('../models/WebhookLog');

class WebhookDeliveryService {
  constructor(redisClient) {
    this.redisClient = redisClient;

    // Create Bull queue for webhook deliveries
    this.deliveryQueue = new Queue('webhook delivery', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 1, // We handle retries manually
      }
    });

    this.setupQueueProcessor();
  }

  /**
   * Setup Bull queue processor
   */
  setupQueueProcessor() {
    this.deliveryQueue.process('deliver', async (job) => {
      const { webhookId, eventType, payload, logId } = job.data;
      return this.processDelivery(webhookId, eventType, payload, logId);
    });

    this.deliveryQueue.on('completed', (job, result) => {
      logger.info('Webhook delivery completed', {
        jobId: job.id,
        webhookId: job.data.webhookId,
        success: result.success,
        duration: result.duration,
      });
    });

    this.deliveryQueue.on('failed', (job, err) => {
      logger.error('Webhook delivery job failed', {
        jobId: job.id,
        webhookId: job.data.webhookId,
        error: err.message,
      });
    });
  }

  /**
   * Deliver event to all subscribed webhooks
   */
  async deliverEvent(eventType, payload, sourceIP = null) {
    try {
      // Find all webhooks subscribed to this event
      const webhooks = await Webhook.findByEvent(eventType);

      logger.info(\`Delivering event \${eventType} to \${webhooks.length} webhooks\`);

      const deliveryPromises = webhooks.map(webhook => {
        // Check if webhook can receive this event
        if (!webhook.canReceiveEvent(eventType, sourceIP)) {
          return null;
        }

        return this.scheduleDelivery(webhook, eventType, payload);
      }).filter(Boolean);

      const results = await Promise.allSettled(deliveryPromises);

      // Log overall delivery stats
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      logger.info('Event delivery summary', {
        eventType,
        total: webhooks.length,
        scheduled: deliveryPromises.length,
        successful,
        failed,
      });

      return {
        eventType,
        webhooksNotified: webhooks.length,
        deliveriesScheduled: deliveryPromises.length,
        successful,
        failed,
      };

    } catch (error) {
      logger.error('Error delivering event:', error);
      throw error;
    }
  }

  /**
   * Schedule webhook delivery
   */
  async scheduleDelivery(webhook, eventType, payload, attemptNumber = 1) {
    try {
      // Create webhook log entry
      const webhookLog = new WebhookLog({
        webhook: webhook._id,
        event: eventType,
        payload,
        status: 'pending',
        attempts: attemptNumber,
      });

      await webhookLog.save();

      // Calculate delay for retry attempts
      let delay = 0;
      if (attemptNumber > 1) {
        delay = webhook.calculateRetryDelay(attemptNumber);
      }

      // Add job to queue
      const job = await this.deliveryQueue.add(
        'deliver',
        {
          webhookId: webhook._id.toString(),
          eventType,
          payload,
          logId: webhookLog._id.toString(),
          attemptNumber,
        },
        {
          delay,
          jobId: \`\${webhook._id}-\${webhookLog._id}-\${attemptNumber}\`,
        }
      );

      logger.info('Webhook delivery scheduled', {
        webhookId: webhook._id,
        eventType,
        attemptNumber,
        delay,
        jobId: job.id,
      });

      return job;

    } catch (error) {
      logger.error('Error scheduling webhook delivery:', error);
      throw error;
    }
  }

  /**
   * Process webhook delivery
   */
  async processDelivery(webhookId, eventType, payload, logId) {
    const startTime = Date.now();
    let webhookLog;

    try {
      // Get webhook and log
      const webhook = await Webhook.findById(webhookId);
      webhookLog = await WebhookLog.findById(logId);

      if (!webhook) {
        throw new Error(\`Webhook \${webhookId} not found\`);
      }

      if (!webhookLog) {
        throw new Error(\`Webhook log \${logId} not found\`);
      }

      // Check if webhook is still active
      if (!webhook.active) {
        await this.updateWebhookLog(webhookLog, 'failed', null, 'Webhook is inactive');
        return { success: false, reason: 'inactive' };
      }

      // Prepare request
      const requestPayload = this.preparePayload(payload, eventType);
      const signature = this.generateSignature(requestPayload, webhook.secret);
      const headers = this.prepareHeaders(webhook, signature, eventType);

      // Update log status to processing
      webhookLog.status = 'processing';
      await webhookLog.save();

      // Make HTTP request
      const response = await this.makeRequest(webhook.url, requestPayload, headers, webhook.timeout);

      const duration = Date.now() - startTime;

      // Update webhook log with response
      await this.updateWebhookLog(webhookLog, 'success', {
        statusCode: response.status,
        headers: response.headers,
        body: response.data,
        duration,
      });

      // Update webhook statistics
      webhook.updateStatistics(true, duration);
      await webhook.save();

      logger.info('Webhook delivered successfully', {
        webhookId,
        url: webhook.url,
        eventType,
        statusCode: response.status,
        duration,
      });

      return {
        success: true,
        statusCode: response.status,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Webhook delivery failed', {
        webhookId,
        eventType,
        error: error.message,
        duration,
      });

      // Update webhook log with error
      if (webhookLog) {
        const errorResponse = {
          statusCode: error.response?.status || 0,
          headers: error.response?.headers || {},
          body: error.response?.data || error.message,
          duration,
        };

        await this.updateWebhookLog(webhookLog, 'failed', errorResponse, error.message);
      }

      // Update webhook statistics
      const webhook = await Webhook.findById(webhookId);
      if (webhook) {
        webhook.updateStatistics(false, duration);
        await webhook.save();

        // Schedule retry if applicable
        if (webhook.shouldRetry(webhookLog.attempts + 1)) {
          await this.scheduleDelivery(webhook, eventType, payload, webhookLog.attempts + 1);
        }
      }

      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status || 0,
        duration,
      };
    }
  }

  /**
   * Prepare payload for delivery
   */
  preparePayload(payload, eventType) {
    return {
      id: crypto.randomUUID(),
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    };
  }

  /**
   * Generate HMAC signature for webhook security
   */
  generateSignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString, 'utf8')
      .digest('hex');
  }

  /**
   * Prepare HTTP headers for webhook request
   */
  prepareHeaders(webhook, signature, eventType) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'API-Platform-Webhook/1.0',
      'X-Webhook-Event': eventType,
      'X-Webhook-Signature-256': \`sha256=\${signature}\`,
      'X-Webhook-ID': webhook._id.toString(),
      'X-Webhook-Timestamp': Date.now().toString(),
    };

    // Add custom headers from webhook configuration
    webhook.headers.forEach(header => {
      headers[header.name] = header.value;
    });

    return headers;
  }

  /**
   * Make HTTP request to webhook endpoint
   */
  async makeRequest(url, payload, headers, timeout = 30000) {
    return axios({
      method: 'POST',
      url,
      data: payload,
      headers,
      timeout,
      validateStatus: (status) => status >= 200 && status < 300,
      maxRedirects: 3,
    });
  }

  /**
   * Update webhook log with response details
   */
  async updateWebhookLog(log, status, response = null, error = null) {
    log.status = status;

    if (response) {
      log.response = response;
    }

    if (error) {
      log.error = error;
    }

    log.deliveredAt = new Date();
    await log.save();
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(webhookId, testPayload = null) {
    try {
      const webhook = await Webhook.findById(webhookId);

      if (!webhook) {
        throw new Error('Webhook not found');
      }

      const payload = testPayload || {
        test: true,
        message: 'This is a test webhook delivery',
        timestamp: new Date().toISOString(),
      };

      const result = await this.scheduleDelivery(webhook, 'test.webhook', payload);

      return {
        success: true,
        message: 'Test webhook scheduled for delivery',
        jobId: result.id,
      };

    } catch (error) {
      logger.error('Error testing webhook:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get delivery statistics for a webhook
   */
  async getDeliveryStats(webhookId, timeRange = '7d') {
    try {
      const webhook = await Webhook.findById(webhookId);

      if (!webhook) {
        throw new Error('Webhook not found');
      }

      const endDate = new Date();
      const startDate = new Date();

      // Calculate start date based on time range
      switch (timeRange) {
        case '1h':
          startDate.setHours(startDate.getHours() - 1);
          break;
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get delivery logs for the time range
      const logs = await WebhookLog.find({
        webhook: webhookId,
        createdAt: { $gte: startDate, $lte: endDate },
      }).sort({ createdAt: -1 });

      // Calculate statistics
      const total = logs.length;
      const successful = logs.filter(log => log.status === 'success').length;
      const failed = logs.filter(log => log.status === 'failed').length;
      const pending = logs.filter(log => log.status === 'pending').length;

      const averageResponseTime = logs
        .filter(log => log.response?.duration)
        .reduce((sum, log) => sum + log.response.duration, 0) / (successful || 1);

      return {
        webhook: webhook._id,
        timeRange,
        startDate,
        endDate,
        statistics: {
          total,
          successful,
          failed,
          pending,
          successRate: total > 0 ? (successful / total) * 100 : 0,
          averageResponseTime: Math.round(averageResponseTime),
        },
        recentLogs: logs.slice(0, 10), // Last 10 logs
      };

    } catch (error) {
      logger.error('Error getting delivery stats:', error);
      throw error;
    }
  }

  /**
   * Cleanup old webhook logs
   */
  async cleanupOldLogs(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await WebhookLog.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      logger.info(\`Cleaned up \${result.deletedCount} old webhook logs\`);
      return result.deletedCount;

    } catch (error) {
      logger.error('Error cleaning up webhook logs:', error);
      throw error;
    }
  }
}

module.exports = WebhookDeliveryService;