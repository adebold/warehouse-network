/**
 * Event batching for efficient API calls
 */

import { Logger } from '../core/logger';

export interface BatcherOptions<T> {
  batchSize: number;
  flushInterval: number;
  onBatch: (batch: T[]) => Promise<void>;
  logger: Logger;
}

export interface BatcherMetrics {
  totalEvents: number;
  totalBatches: number;
  pendingEvents: number;
  lastFlush: Date | null;
}

export class EventBatcher<T> {
  private readonly options: BatcherOptions<T>;
  private readonly logger: Logger;
  private batch: T[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private metrics: BatcherMetrics = {
    totalEvents: 0,
    totalBatches: 0,
    pendingEvents: 0,
    lastFlush: null
  };
  private isShuttingDown = false;

  constructor(options: BatcherOptions<T>) {
    this.options = options;
    this.logger = options.logger.child({ component: 'EventBatcher' });
  }

  /**
   * Add event to batch
   */
  async add(event: T): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Batcher is shutting down');
    }

    this.batch.push(event);
    this.metrics.totalEvents++;
    this.metrics.pendingEvents = this.batch.length;

    // Flush if batch size reached
    if (this.batch.length >= this.options.batchSize) {
      await this.flush();
    } else {
      // Reset flush timer
      this.scheduleFlush();
    }
  }

  /**
   * Schedule automatic flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(async () => {
      try {
        await this.flush();
      } catch (error) {
        this.logger.error('Auto-flush failed', error);
      }
    }, this.options.flushInterval);
  }

  /**
   * Flush current batch
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const currentBatch = [...this.batch];
    this.batch = [];
    this.metrics.pendingEvents = 0;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      await this.options.onBatch(currentBatch);
      this.metrics.totalBatches++;
      this.metrics.lastFlush = new Date();
      
      this.logger.debug('Batch flushed', {
        batchSize: currentBatch.length
      });
    } catch (error) {
      // Re-add events to batch on failure
      this.batch.unshift(...currentBatch);
      this.metrics.pendingEvents = this.batch.length;
      throw error;
    }
  }

  /**
   * Shutdown batcher
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();
    
    this.logger.info('Batcher shutdown', this.metrics);
  }

  /**
   * Get batcher metrics
   */
  getMetrics(): BatcherMetrics {
    return { ...this.metrics };
  }
}