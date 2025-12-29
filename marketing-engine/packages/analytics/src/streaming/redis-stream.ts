/**
 * Redis Streams implementation for real-time event processing
 */

import Redis from 'ioredis';
import { Logger } from '../core/logger';
import { AnalyticsConfig } from '../core/config';
import { AnalyticsEvent } from '../core/types';

export interface RedisStreamOptions {
  config: AnalyticsConfig['redis'];
  logger: Logger;
}

export interface StreamMessage {
  id: string;
  data: AnalyticsEvent;
  timestamp: number;
}

export class RedisStreamProcessor {
  private readonly redis: Redis;
  private readonly consumerRedis: Redis;
  private readonly config: AnalyticsConfig['redis'];
  private readonly logger: Logger;
  private readonly consumerId: string;
  private isProcessing: boolean = false;
  private processingInterval?: NodeJS.Timeout;

  constructor(options: RedisStreamOptions) {
    this.config = options.config;
    this.logger = options.logger.child({ component: 'RedisStreamProcessor' });
    this.consumerId = `consumer-${process.pid}-${Date.now()}`;

    // Redis client for writing
    this.redis = new Redis(this.config.url, {
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      maxRetriesPerRequest: this.config.maxRetries,
      retryStrategy: this.config.retryStrategy
    });

    // Separate Redis client for consuming (blocking operations)
    this.consumerRedis = new Redis(this.config.url, {
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      maxRetriesPerRequest: this.config.maxRetries,
      retryStrategy: this.config.retryStrategy
    });

    this.setupRedisHandlers();
  }

  /**
   * Setup Redis event handlers
   */
  private setupRedisHandlers(): void {
    this.redis.on('error', (error) => {
      this.logger.error('Redis error', error);
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected');
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    this.consumerRedis.on('error', (error) => {
      this.logger.error('Consumer Redis error', error);
    });
  }

  /**
   * Add event to stream
   */
  async addEvent(event: AnalyticsEvent): Promise<string> {
    try {
      const streamKey = this.config.streamKey;
      const data = {
        eventId: event.eventId,
        eventData: JSON.stringify(event),
        timestamp: Date.now().toString()
      };

      const messageId = await this.redis.xadd(
        streamKey,
        '*', // Auto-generate ID
        ...Object.entries(data).flat()
      );

      this.logger.debug('Event added to stream', {
        eventId: event.eventId,
        messageId,
        streamKey
      });

      return messageId;
    } catch (error) {
      this.logger.error('Failed to add event to stream', error, {
        eventId: event.eventId
      });
      throw error;
    }
  }

  /**
   * Start consuming events from stream
   */
  async startConsumer(
    handler: (events: StreamMessage[]) => Promise<void>,
    batchSize: number = 100,
    blockTimeout: number = 5000
  ): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Consumer already running');
    }

    this.isProcessing = true;
    const streamKey = this.config.streamKey;
    const consumerGroup = this.config.consumerGroup;

    // Create consumer group if it doesn't exist
    try {
      await this.redis.xgroup(
        'CREATE',
        streamKey,
        consumerGroup,
        '$', // Start from new messages
        'MKSTREAM'
      );
      this.logger.info('Consumer group created', { consumerGroup });
    } catch (error: any) {
      if (!error.message.includes('BUSYGROUP')) {
        throw error;
      }
      // Group already exists
    }

    // Start processing loop
    this.logger.info('Starting stream consumer', {
      consumerId: this.consumerId,
      consumerGroup,
      batchSize
    });

    while (this.isProcessing) {
      try {
        // Read messages from stream
        const messages = await this.consumerRedis.xreadgroup(
          'GROUP',
          consumerGroup,
          this.consumerId,
          'BLOCK',
          blockTimeout,
          'COUNT',
          batchSize,
          'STREAMS',
          streamKey,
          '>' // Read only new messages
        );

        if (!messages || messages.length === 0) {
          continue; // No messages, continue loop
        }

        const streamMessages = this.parseStreamMessages(messages);
        
        if (streamMessages.length > 0) {
          this.logger.debug('Processing stream messages', {
            count: streamMessages.length
          });

          // Process messages
          await handler(streamMessages);

          // Acknowledge processed messages
          await this.acknowledgeMessages(
            streamKey,
            consumerGroup,
            streamMessages.map(m => m.id)
          );
        }

        // Process pending messages
        await this.processPendingMessages(
          streamKey,
          consumerGroup,
          handler,
          batchSize
        );
      } catch (error) {
        this.logger.error('Error in consumer loop', error);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Process pending messages (failed/unacknowledged)
   */
  private async processPendingMessages(
    streamKey: string,
    consumerGroup: string,
    handler: (events: StreamMessage[]) => Promise<void>,
    batchSize: number
  ): Promise<void> {
    try {
      const pending = await this.redis.xpending(
        streamKey,
        consumerGroup,
        '-',
        '+',
        batchSize
      );

      if (!pending || pending.length === 0) {
        return;
      }

      const messageIds = pending.map((p: any) => p[0]);
      
      // Claim old messages
      const claimed = await this.redis.xclaim(
        streamKey,
        consumerGroup,
        this.consumerId,
        30000, // 30 seconds idle time
        ...messageIds
      );

      if (claimed && claimed.length > 0) {
        const streamMessages = this.parseClaimedMessages(claimed);
        
        this.logger.info('Processing pending messages', {
          count: streamMessages.length
        });

        await handler(streamMessages);
        await this.acknowledgeMessages(
          streamKey,
          consumerGroup,
          streamMessages.map(m => m.id)
        );
      }
    } catch (error) {
      this.logger.error('Error processing pending messages', error);
    }
  }

  /**
   * Parse stream messages
   */
  private parseStreamMessages(messages: any[]): StreamMessage[] {
    const streamMessages: StreamMessage[] = [];

    for (const [stream, entries] of messages) {
      for (const [id, fields] of entries) {
        try {
          const data: any = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }

          streamMessages.push({
            id,
            data: JSON.parse(data.eventData),
            timestamp: parseInt(data.timestamp)
          });
        } catch (error) {
          this.logger.error('Failed to parse stream message', error, { id });
        }
      }
    }

    return streamMessages;
  }

  /**
   * Parse claimed messages
   */
  private parseClaimedMessages(messages: any[]): StreamMessage[] {
    const streamMessages: StreamMessage[] = [];

    for (const [id, fields] of messages) {
      try {
        const data: any = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }

        streamMessages.push({
          id,
          data: JSON.parse(data.eventData),
          timestamp: parseInt(data.timestamp)
        });
      } catch (error) {
        this.logger.error('Failed to parse claimed message', error, { id });
      }
    }

    return streamMessages;
  }

  /**
   * Acknowledge processed messages
   */
  private async acknowledgeMessages(
    streamKey: string,
    consumerGroup: string,
    messageIds: string[]
  ): Promise<void> {
    try {
      const acked = await this.redis.xack(
        streamKey,
        consumerGroup,
        ...messageIds
      );

      this.logger.debug('Messages acknowledged', {
        count: acked,
        total: messageIds.length
      });
    } catch (error) {
      this.logger.error('Failed to acknowledge messages', error);
    }
  }

  /**
   * Stop consumer
   */
  async stopConsumer(): Promise<void> {
    this.isProcessing = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.logger.info('Stream consumer stopped', {
      consumerId: this.consumerId
    });
  }

  /**
   * Get stream statistics
   */
  async getStreamStats(): Promise<any> {
    try {
      const streamKey = this.config.streamKey;
      const consumerGroup = this.config.consumerGroup;

      const [info, groups] = await Promise.all([
        this.redis.xinfo('STREAM', streamKey),
        this.redis.xinfo('GROUPS', streamKey)
      ]);

      // Parse xinfo response
      const stats: any = {
        length: 0,
        radixTreeKeys: 0,
        radixTreeNodes: 0,
        groups: [],
        firstEntry: null,
        lastEntry: null
      };

      // Parse stream info
      for (let i = 0; i < info.length; i += 2) {
        const key = info[i];
        const value = info[i + 1];
        
        switch (key) {
          case 'length':
            stats.length = value;
            break;
          case 'radix-tree-keys':
            stats.radixTreeKeys = value;
            break;
          case 'radix-tree-nodes':
            stats.radixTreeNodes = value;
            break;
          case 'first-entry':
            stats.firstEntry = value ? { id: value[0], data: value[1] } : null;
            break;
          case 'last-entry':
            stats.lastEntry = value ? { id: value[0], data: value[1] } : null;
            break;
        }
      }

      // Parse groups info
      stats.groups = groups.map((group: any) => {
        const groupInfo: any = {};
        for (let i = 0; i < group.length; i += 2) {
          groupInfo[group[i]] = group[i + 1];
        }
        return groupInfo;
      });

      return stats;
    } catch (error) {
      this.logger.error('Failed to get stream stats', error);
      throw error;
    }
  }

  /**
   * Trim stream to maintain size
   */
  async trimStream(maxLength: number = 100000): Promise<number> {
    try {
      const trimmed = await this.redis.xtrim(
        this.config.streamKey,
        'MAXLEN',
        '~', // Approximate trimming for performance
        maxLength
      );

      this.logger.debug('Stream trimmed', {
        trimmed,
        maxLength
      });

      return trimmed;
    } catch (error) {
      this.logger.error('Failed to trim stream', error);
      throw error;
    }
  }

  /**
   * Shutdown Redis connections
   */
  async shutdown(): Promise<void> {
    await this.stopConsumer();
    
    await Promise.all([
      this.redis.quit(),
      this.consumerRedis.quit()
    ]);

    this.logger.info('Redis stream processor shut down');
  }
}