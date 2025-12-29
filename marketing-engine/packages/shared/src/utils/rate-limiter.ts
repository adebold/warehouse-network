import PQueue from 'p-queue';
import NodeCache from 'node-cache';
import { RateLimitConfig, RateLimitStatus } from '@marketing-engine/core/interfaces/channel.interface';
import { Logger } from 'winston';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private queue: PQueue;
  private cache: NodeCache;
  private config: RateLimitConfig;
  private logger: Logger;
  private bucketKey: string;

  constructor(config: RateLimitConfig, logger: Logger, bucketKey: string) {
    this.config = config;
    this.logger = logger;
    this.bucketKey = bucketKey;
    
    this.queue = new PQueue({
      concurrency: config.maxConcurrent || 5,
      interval: config.windowMs,
      intervalCap: config.maxRequests
    });

    this.cache = new NodeCache({
      stdTTL: Math.ceil(config.windowMs / 1000),
      checkperiod: 60
    });
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(async () => {
      await this.checkRateLimit();
      
      try {
        const result = await fn();
        this.incrementCounter();
        return result;
      } catch (error) {
        // Don't count failed requests against rate limit
        throw error;
      }
    });
  }

  private async checkRateLimit(): Promise<void> {
    const bucket = this.getBucket();
    
    if (bucket.count >= this.config.maxRequests) {
      const waitTime = bucket.resetAt - Date.now();
      if (waitTime > 0) {
        this.logger.warn(`Rate limit exceeded for ${this.bucketKey}. Waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Reset bucket after waiting
        this.resetBucket();
      }
    }
  }

  private getBucket(): RateLimitBucket {
    const cached = this.cache.get<RateLimitBucket>(this.bucketKey);
    
    if (cached) {
      return cached;
    }

    const newBucket: RateLimitBucket = {
      count: 0,
      resetAt: Date.now() + this.config.windowMs
    };

    this.cache.set(this.bucketKey, newBucket);
    return newBucket;
  }

  private incrementCounter(): void {
    const bucket = this.getBucket();
    bucket.count++;
    this.cache.set(this.bucketKey, bucket);
  }

  private resetBucket(): void {
    const newBucket: RateLimitBucket = {
      count: 0,
      resetAt: Date.now() + this.config.windowMs
    };
    this.cache.set(this.bucketKey, newBucket);
  }

  getStatus(): RateLimitStatus {
    const bucket = this.getBucket();
    const remaining = Math.max(0, this.config.maxRequests - bucket.count);
    
    return {
      remaining,
      total: this.config.maxRequests,
      resetsAt: new Date(bucket.resetAt),
      isLimited: remaining === 0
    };
  }

  async waitForAvailability(): Promise<void> {
    const status = this.getStatus();
    
    if (status.isLimited) {
      const waitTime = status.resetsAt.getTime() - Date.now();
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getPendingCount(): number {
    return this.queue.pending;
  }

  clear(): void {
    this.queue.clear();
    this.cache.flushAll();
  }
}