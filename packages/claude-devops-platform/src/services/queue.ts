import Bull, { Queue, Job, JobOptions } from 'bull';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import { config } from '../config';
import { MetricsCollector } from '../utils/metrics';

export interface QueueConfig {
  name: string;
  redisUrl?: string;
  defaultJobOptions?: JobOptions;
  concurrency?: number;
}

export interface JobResult {
  jobId: string;
  result?: any;
  error?: string;
  completedAt: Date;
}

export type JobProcessor<T = any> = (job: Job<T>) => Promise<any>;

export class QueueService {
  private static instance: QueueService;
  private queues: Map<string, Queue> = new Map();
  private processors: Map<string, JobProcessor> = new Map();
  private redis: Redis;

  private constructor() {
    const redisOptions: any = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
    
    if (config.redis?.password) {
      redisOptions.password = config.redis.password;
    }
    
    this.redis = new Redis(config.redis?.url || 'redis://localhost:6379', redisOptions);
  }

  public static async initialize(): Promise<QueueService> {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
      await QueueService.instance.setupDefaultQueues();
    }
    return QueueService.instance;
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      throw new Error('QueueService not initialized. Call initialize() first.');
    }
    return QueueService.instance;
  }

  private async setupDefaultQueues(): Promise<void> {
    // Create default queues
    const defaultQueues = [
      { name: 'pipeline-execution', concurrency: 5 },
      { name: 'deployment', concurrency: 3 },
      { name: 'docker-build', concurrency: 2 },
      { name: 'terraform-operation', concurrency: 2 },
      { name: 'monitoring-alert', concurrency: 10 },
      { name: 'notification', concurrency: 20 },
    ];

    for (const queueConfig of defaultQueues) {
      await this.createQueue(queueConfig);
    }

    logger.info('Default queues initialized');
  }

  public async createQueue(queueConfig: QueueConfig): Promise<Queue> {
    if (this.queues.has(queueConfig.name)) {
      return this.queues.get(queueConfig.name)!;
    }

    const redisConfig: any = {
      host: this.redis.options.host,
      port: this.redis.options.port as number,
    };
    
    if (this.redis.options.password) {
      redisConfig.password = this.redis.options.password;
    }
    
    const queue = new Bull(queueConfig.name, {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        ...queueConfig.defaultJobOptions,
      },
    });

    // Set up event handlers
    this.setupQueueEventHandlers(queue);

    // Store queue
    this.queues.set(queueConfig.name, queue);

    // Set up processor if concurrency is specified
    if (queueConfig.concurrency && this.processors.has(queueConfig.name)) {
      const processor = this.processors.get(queueConfig.name)!;
      queue.process(queueConfig.concurrency, processor);
    }

    logger.info('Queue created', { queue: queueConfig.name });
    return queue;
  }

  public registerProcessor<T = any>(queueName: string, processor: JobProcessor<T>): void {
    this.processors.set(queueName, processor);

    // If queue already exists, set up the processor
    const queue = this.queues.get(queueName);
    if (queue) {
      queue.process(processor);
    }

    logger.info('Registered processor for queue', { queue: queueName });
  }

  public async addJob<T = any>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const queue = await this.getOrCreateQueue(queueName);
    const job = await queue.add(data, options);

    logger.info('Job added to queue', {
      queue: queueName,
      jobId: job.id,
      delay: options?.delay,
      priority: options?.priority,
    });

    MetricsCollector.recordQueueOperation('job_added', queueName);
    return job;
  }

  public async addBulkJobs<T = any>(
    queueName: string,
    jobs: Array<{ data: T; opts?: JobOptions }>
  ): Promise<Job<T>[]> {
    const queue = await this.getOrCreateQueue(queueName);
    const addedJobs = await queue.addBulk(jobs);

    logger.info('Bulk jobs added to queue', {
      queue: queueName,
      count: jobs.length,
    });

    MetricsCollector.recordQueueOperation('bulk_jobs_added', queueName, jobs.length);
    return addedJobs;
  }

  public async getJob<T = any>(queueName: string, jobId: string): Promise<Job<T> | null> {
    const queue = await this.getOrCreateQueue(queueName);
    return await queue.getJob(jobId);
  }

  public async getJobs<T = any>(
    queueName: string,
    types: ('completed' | 'waiting' | 'active' | 'delayed' | 'failed' | 'paused')[],
    start = 0,
    end = 100
  ): Promise<Job<T>[]> {
    const queue = await this.getOrCreateQueue(queueName);
    return await queue.getJobs(types, start, end);
  }

  public async getJobCounts(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const queue = await this.getOrCreateQueue(queueName);
    const counts = await queue.getJobCounts();
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: (counts as any).paused || 0,
    };
  }

  public async pauseQueue(queueName: string, isLocal = false): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause(isLocal);
    logger.info('Queue paused', { queue: queueName, isLocal });
  }

  public async resumeQueue(queueName: string, isLocal = false): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume(isLocal);
    logger.info('Queue resumed', { queue: queueName, isLocal });
  }

  public async emptyQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.empty();
    logger.info('Queue emptied', { queue: queueName });
  }

  public async removeJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.remove();
      logger.info('Job removed', { queue: queueName, jobId });
    }
  }

  public async retryJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job && (await job.isFailed())) {
      await job.retry();
      logger.info('Job retried', { queue: queueName, jobId });
    }
  }

  public async promoteJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job && (await job.isDelayed())) {
      await job.promote();
      logger.info('Job promoted', { queue: queueName, jobId });
    }
  }

  // Scheduled jobs
  public async scheduleJob<T = any>(
    queueName: string,
    data: T,
    cronExpression: string,
    options?: JobOptions
  ): Promise<void> {
    const queue = await this.getOrCreateQueue(queueName);
    
    await queue.add(data, {
      ...options,
      repeat: {
        cron: cronExpression,
        tz: options?.repeat?.tz || 'UTC',
      },
    });

    logger.info('Scheduled job created', {
      queue: queueName,
      cron: cronExpression,
    });
  }

  public async removeRepeatable(
    queueName: string,
    cronExpression: string,
    options?: { tz?: string }
  ): Promise<void> {
    const queue = await this.getOrCreateQueue(queueName);
    
    await queue.removeRepeatable({
      cron: cronExpression,
      tz: options?.tz || 'UTC',
    });

    logger.info('Repeatable job removed', {
      queue: queueName,
      cron: cronExpression,
    });
  }

  public async getRepeatableJobs(queueName: string): Promise<any[]> {
    const queue = await this.getOrCreateQueue(queueName);
    return await queue.getRepeatableJobs();
  }

  // Queue metrics
  public async getQueueMetrics(queueName: string): Promise<{
    throughput: number;
    errorRate: number;
    avgProcessingTime: number;
    queueLength: number;
    activeJobs: number;
  }> {
    const queue = await this.getOrCreateQueue(queueName);
    const counts = await queue.getJobCounts();
    
    // Get completed and failed jobs from last hour
    const oneHourAgo = Date.now() - 3600000;
    const completedJobs = await queue.getJobs(['completed'], 0, 1000);
    const failedJobs = await queue.getJobs(['failed'], 0, 1000);
    
    const recentCompleted = completedJobs.filter(job => 
      job.finishedOn && job.finishedOn > oneHourAgo
    );
    
    const recentFailed = failedJobs.filter(job => 
      job.finishedOn && job.finishedOn > oneHourAgo
    );
    
    // Calculate metrics
    const throughput = recentCompleted.length; // jobs per hour
    const errorRate = recentCompleted.length > 0
      ? recentFailed.length / (recentCompleted.length + recentFailed.length)
      : 0;
    
    const avgProcessingTime = recentCompleted.reduce((sum, job) => {
      const processingTime = job.finishedOn! - job.processedOn!;
      return sum + processingTime;
    }, 0) / (recentCompleted.length || 1);
    
    return {
      throughput,
      errorRate,
      avgProcessingTime,
      queueLength: counts.waiting + counts.delayed,
      activeJobs: counts.active,
    };
  }

  // Health check
  public async healthCheck(): Promise<{
    healthy: boolean;
    queues: Array<{
      name: string;
      healthy: boolean;
      metrics: any;
    }>;
  }> {
    const queueHealthChecks = await Promise.all(
      Array.from(this.queues.entries()).map(async ([name, queue]) => {
        try {
          const counts = await queue.getJobCounts();
          const metrics = await this.getQueueMetrics(name);
          
          return {
            name,
            healthy: true,
            metrics: {
              ...counts,
              ...metrics,
            },
          };
        } catch (error) {
          logger.error(`Health check failed for queue ${name}:`, error instanceof Error ? error : new Error(String(error)));
          return {
            name,
            healthy: false,
            metrics: null,
          };
        }
      })
    );
    
    const allHealthy = queueHealthChecks.every(check => check.healthy);
    
    return {
      healthy: allHealthy,
      queues: queueHealthChecks,
    };
  }

  // Cleanup
  public async cleanOldJobs(queueName: string, gracePeriod: number = 86400000): Promise<number> {
    const queue = await this.getOrCreateQueue(queueName);
    const cutoffTime = Date.now() - gracePeriod;
    
    const completedJobs = await queue.getJobs(['completed'], 0, 10000);
    const failedJobs = await queue.getJobs(['failed'], 0, 10000);
    
    const jobsToRemove = [...completedJobs, ...failedJobs].filter(job =>
      job.finishedOn && job.finishedOn < cutoffTime
    );
    
    await Promise.all(jobsToRemove.map(job => job.remove()));
    
    logger.info('Cleaned old jobs', {
      queue: queueName,
      removed: jobsToRemove.length,
    });
    
    return jobsToRemove.length;
  }

  public async cleanAllQueues(gracePeriod?: number): Promise<void> {
    const cleanupResults = await Promise.all(
      Array.from(this.queues.keys()).map(queueName =>
        this.cleanOldJobs(queueName, gracePeriod)
      )
    );
    
    const totalRemoved = cleanupResults.reduce((sum, count) => sum + count, 0);
    logger.info('Cleaned all queues', { totalRemoved });
  }

  // Shutdown
  public async shutdown(): Promise<void> {
    logger.info('Shutting down queue service...');
    
    // Close all queues
    await Promise.all(
      Array.from(this.queues.values()).map(queue => queue.close())
    );
    
    // Close Redis connection
    await this.redis.quit();
    
    logger.info('Queue service shutdown complete');
  }

  // Helper methods
  private async getOrCreateQueue(queueName: string): Promise<Queue> {
    if (!this.queues.has(queueName)) {
      return await this.createQueue({ name: queueName });
    }
    return this.queues.get(queueName)!;
  }

  private setupQueueEventHandlers(queue: Queue): void {
    queue.on('completed', (job, result) => {
      logger.debug('Job completed', {
        queue: queue.name,
        jobId: job.id,
        duration: job.finishedOn! - job.processedOn!,
      });
      MetricsCollector.recordQueueOperation('job_completed', queue.name);
    });

    queue.on('failed', (job, err) => {
      logger.error('Job failed', {
        queue: queue.name,
        jobId: job.id,
        error: err.message,
        attempts: job.attemptsMade,
      });
      MetricsCollector.recordQueueOperation('job_failed', queue.name);
    });

    queue.on('active', (job) => {
      logger.debug('Job active', {
        queue: queue.name,
        jobId: job.id,
      });
      MetricsCollector.recordQueueOperation('job_active', queue.name);
    });

    queue.on('stalled', (job) => {
      logger.warn('Job stalled', {
        queue: queue.name,
        jobId: job.id,
      });
      MetricsCollector.recordQueueOperation('job_stalled', queue.name);
    });

    queue.on('error', (error) => {
      logger.error('Queue error', {
        queue: queue.name,
        error: error.message,
      });
    });

    queue.on('waiting', (jobId) => {
      logger.debug('Job waiting', {
        queue: queue.name,
        jobId,
      });
    });

    queue.on('drained', () => {
      logger.debug('Queue drained', { queue: queue.name });
    });
  }

  // Advanced features
  public async createRateLimitedQueue(
    queueName: string,
    maxJobs: number,
    duration: number
  ): Promise<Queue> {
    const redisConfig: any = {
      host: this.redis.options.host,
      port: this.redis.options.port as number,
    };
    
    if (this.redis.options.password) {
      redisConfig.password = this.redis.options.password;
    }

    const queue = new Bull(queueName, {
      redis: redisConfig,
      limiter: {
        max: maxJobs,
        duration,
      },
    } as any);

    // Set up event handlers
    this.setupQueueEventHandlers(queue);

    // Store queue
    this.queues.set(queueName, queue);

    logger.info('Rate limited queue created', { queue: queueName, maxJobs, duration });
    return queue;
  }

  public async createPriorityQueue(queueName: string): Promise<Queue> {
    const queue = await this.createQueue({ name: queueName });
    
    // Process high priority jobs first
    queue.process('high', 2, async (job) => {
      const processor = this.processors.get(queueName);
      if (processor) {
        return await processor(job);
      }
      throw new Error(`No processor registered for queue ${queueName}`);
    });
    
    // Process normal priority jobs
    queue.process('normal', 3, async (job) => {
      const processor = this.processors.get(queueName);
      if (processor) {
        return await processor(job);
      }
      throw new Error(`No processor registered for queue ${queueName}`);
    });
    
    // Process low priority jobs
    queue.process('low', 1, async (job) => {
      const processor = this.processors.get(queueName);
      if (processor) {
        return await processor(job);
      }
      throw new Error(`No processor registered for queue ${queueName}`);
    });
    
    return queue;
  }

  public async moveJobBetweenQueues(
    sourceQueue: string,
    targetQueue: string,
    jobId: string
  ): Promise<Job> {
    const job = await this.getJob(sourceQueue, jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in queue ${sourceQueue}`);
    }
    
    // Add job to target queue
    const newJob = await this.addJob(targetQueue, job.data, job.opts);
    
    // Remove from source queue
    await job.remove();
    
    logger.info('Job moved between queues', {
      from: sourceQueue,
      to: targetQueue,
      jobId,
      newJobId: newJob.id,
    });
    
    return newJob;
  }

  // Dead letter queue support
  public async setupDeadLetterQueue(
    queueName: string,
    maxFailures: number = 3
  ): Promise<void> {
    const mainQueue = await this.getOrCreateQueue(queueName);
    const dlqName = `${queueName}-dlq`;
    const dlQueue = await this.createQueue({ name: dlqName });
    
    // Override the failed event handler
    mainQueue.on('failed', async (job, err) => {
      if (job.attemptsMade >= maxFailures) {
        // Move to dead letter queue
        await this.addJob(dlqName, {
          originalQueue: queueName,
          originalJobId: job.id,
          data: job.data,
          error: err.message,
          failedAt: new Date(),
          attempts: job.attemptsMade,
        });
        
        logger.warn('Job moved to dead letter queue', {
          queue: queueName,
          jobId: job.id,
          error: err.message,
        });
      }
    });
  }
}