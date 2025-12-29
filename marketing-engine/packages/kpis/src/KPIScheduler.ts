import * as cron from 'node-cron';
import Bull from 'bull';
import { KPIService } from './KPIService';
import { logger } from './utils/logger';
import { config } from './config/config';
import { KPIFilters, AttributionModel } from './types/kpi.types';

interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export class KPIScheduler {
  private kpiService: KPIService;
  private jobs: Map<string, cron.ScheduledTask>;
  private queue: Bull.Queue;
  private static instance: KPIScheduler;

  private constructor() {
    this.kpiService = KPIService.getInstance();
    this.jobs = new Map();
    
    // Initialize Bull queue for job processing
    this.queue = new Bull('kpi-calculations', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });

    this.setupQueueProcessors();
  }

  public static getInstance(): KPIScheduler {
    if (!KPIScheduler.instance) {
      KPIScheduler.instance = new KPIScheduler();
    }
    return KPIScheduler.instance;
  }

  public async initialize(): Promise<void> {
    await this.kpiService.initialize();
    this.scheduleDefaultJobs();
    logger.info('KPI Scheduler initialized');
  }

  private scheduleDefaultJobs(): void {
    // Hourly calculations
    this.addJob({
      id: 'hourly-metrics',
      name: 'Hourly KPI Calculations',
      schedule: '0 * * * *', // Every hour
      enabled: true
    }, async () => {
      await this.calculateHourlyMetrics();
    });

    // Daily calculations at 2 AM
    this.addJob({
      id: 'daily-metrics',
      name: 'Daily KPI Calculations',
      schedule: '0 2 * * *', // 2 AM daily
      enabled: true
    }, async () => {
      await this.calculateDailyMetrics();
    });

    // Weekly calculations on Mondays at 3 AM
    this.addJob({
      id: 'weekly-metrics',
      name: 'Weekly KPI Calculations',
      schedule: '0 3 * * 1', // Monday 3 AM
      enabled: true
    }, async () => {
      await this.calculateWeeklyMetrics();
    });

    // Monthly calculations on 1st at 4 AM
    this.addJob({
      id: 'monthly-metrics',
      name: 'Monthly KPI Calculations',
      schedule: '0 4 1 * *', // 1st of month at 4 AM
      enabled: true
    }, async () => {
      await this.calculateMonthlyMetrics();
    });

    // Real-time critical metrics every 5 minutes
    this.addJob({
      id: 'realtime-metrics',
      name: 'Real-time KPI Updates',
      schedule: '*/5 * * * *', // Every 5 minutes
      enabled: true
    }, async () => {
      await this.calculateRealtimeMetrics();
    });
  }

  private addJob(
    job: ScheduledJob, 
    handler: () => Promise<void>
  ): void {
    if (this.jobs.has(job.id)) {
      this.removeJob(job.id);
    }

    const task = cron.schedule(job.schedule, async () => {
      if (!job.enabled) return;

      const startTime = Date.now();
      logger.info(`Starting scheduled job: ${job.name}`, { jobId: job.id });

      try {
        await handler();
        job.lastRun = new Date();
        
        const duration = Date.now() - startTime;
        logger.info(`Completed scheduled job: ${job.name}`, { 
          jobId: job.id, 
          duration 
        });
        
        // Track job execution metrics
        await this.queue.add('job-metric', {
          jobId: job.id,
          name: job.name,
          status: 'success',
          duration,
          timestamp: new Date()
        });
      } catch (error) {
        logger.error(`Failed scheduled job: ${job.name}`, { 
          jobId: job.id, 
          error 
        });
        
        // Track job failure
        await this.queue.add('job-metric', {
          jobId: job.id,
          name: job.name,
          status: 'failure',
          error: error.message,
          timestamp: new Date()
        });
      }
    }, {
      scheduled: false
    });

    this.jobs.set(job.id, task);
    
    if (job.enabled) {
      task.start();
    }
  }

  private removeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.stop();
      this.jobs.delete(jobId);
    }
  }

  private async calculateHourlyMetrics(): Promise<void> {
    const hourAgo = new Date();
    hourAgo.setHours(hourAgo.getHours() - 1);
    
    const filters: KPIFilters = {
      dateRange: {
        startDate: hourAgo,
        endDate: new Date()
      }
    };

    // Queue hourly calculations
    await Promise.all([
      this.queue.add('cost-per-lead', { filters }),
      this.queue.add('email-metrics', { filters }),
      this.queue.add('social-media-roi', { filters })
    ]);
  }

  private async calculateDailyMetrics(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const filters: KPIFilters = {
      dateRange: {
        startDate: yesterday,
        endDate: today
      }
    };

    // Queue daily calculations
    await Promise.all([
      this.queue.add('customer-acquisition-cost', { filters }),
      this.queue.add('channel-attribution', { 
        filters, 
        models: ['linear', 'last_touch', 'u_shaped'] 
      }),
      this.queue.add('churn-metrics', { filters }),
      this.queue.add('seo-performance', { filters })
    ]);
  }

  private async calculateWeeklyMetrics(): Promise<void> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const filters: KPIFilters = {
      dateRange: {
        startDate: weekAgo,
        endDate: new Date()
      },
      groupBy: 'week'
    };

    // Queue weekly calculations
    await Promise.all([
      this.queue.add('content-roi-ranking', { filters, limit: 50 }),
      this.queue.add('email-aggregate', { filters }),
      this.queue.add('social-content-analysis', { filters })
    ]);
  }

  private async calculateMonthlyMetrics(): Promise<void> {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(1);
    lastMonth.setHours(0, 0, 0, 0);
    
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const filters: KPIFilters = {
      dateRange: {
        startDate: lastMonth,
        endDate: thisMonth
      },
      groupBy: 'month'
    };

    // Queue monthly calculations
    await Promise.all([
      this.queue.add('mrr-calculation', { date: lastMonth }),
      this.queue.add('cohort-analysis', { filters }),
      this.queue.add('attribution-comparison', { filters }),
      this.queue.add('seo-opportunities', { filters })
    ]);
  }

  private async calculateRealtimeMetrics(): Promise<void> {
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
    
    const filters: KPIFilters = {
      dateRange: {
        startDate: fiveMinutesAgo,
        endDate: new Date()
      }
    };

    // Queue real-time calculations
    await this.queue.add('realtime-dashboard', { filters }, {
      priority: 1,
      removeOnComplete: true,
      removeOnFail: false
    });
  }

  private setupQueueProcessors(): void {
    // Cost Per Lead processor
    this.queue.process('cost-per-lead', async (job) => {
      const { filters } = job.data;
      return await this.kpiService.getCostPerLead(filters);
    });

    // Customer Acquisition Cost processor
    this.queue.process('customer-acquisition-cost', async (job) => {
      const { filters } = job.data;
      return await this.kpiService.getCustomerAcquisitionCost(filters);
    });

    // Channel Attribution processor
    this.queue.process('channel-attribution', async (job) => {
      const { filters, models } = job.data;
      const results = {};
      
      for (const model of models) {
        results[model] = await this.kpiService.getChannelAttribution(
          model as AttributionModel, 
          filters
        );
      }
      
      return results;
    });

    // MRR processor
    this.queue.process('mrr-calculation', async (job) => {
      const { date } = job.data;
      return await this.kpiService.getMRR(date);
    });

    // Content ROI ranking processor
    this.queue.process('content-roi-ranking', async (job) => {
      const { filters, limit } = job.data;
      return await this.kpiService.getTopContent(filters, limit);
    });

    // Email metrics processor
    this.queue.process('email-metrics', async (job) => {
      const { filters } = job.data;
      return await this.kpiService.getEmailAggregate(filters);
    });

    // Social Media ROI processor
    this.queue.process('social-media-roi', async (job) => {
      const { filters } = job.data;
      return await this.kpiService.getAllSocialPlatforms(filters);
    });

    // SEO performance processor
    this.queue.process('seo-performance', async (job) => {
      const { filters } = job.data;
      return await this.kpiService.getSEOMetrics(filters);
    });

    // Real-time dashboard processor
    this.queue.process('realtime-dashboard', async (job) => {
      const { filters } = job.data;
      return await this.kpiService.getDashboardData(filters);
    });

    // Job metrics processor
    this.queue.process('job-metric', async (job) => {
      // Store job execution metrics
      logger.debug('Job metric recorded', job.data);
    });
  }

  public async getJobStatus(): Promise<{
    jobs: ScheduledJob[];
    queueStats: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  }> {
    const jobList: ScheduledJob[] = [];
    
    this.jobs.forEach((task, id) => {
      jobList.push({
        id,
        name: id,
        schedule: '',
        enabled: true
      });
    });

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount()
    ]);

    return {
      jobs: jobList,
      queueStats: {
        waiting,
        active,
        completed,
        failed
      }
    };
  }

  public async runJob(jobId: string): Promise<void> {
    switch (jobId) {
      case 'hourly-metrics':
        await this.calculateHourlyMetrics();
        break;
      case 'daily-metrics':
        await this.calculateDailyMetrics();
        break;
      case 'weekly-metrics':
        await this.calculateWeeklyMetrics();
        break;
      case 'monthly-metrics':
        await this.calculateMonthlyMetrics();
        break;
      case 'realtime-metrics':
        await this.calculateRealtimeMetrics();
        break;
      default:
        throw new Error(`Unknown job ID: ${jobId}`);
    }
  }

  public pauseJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.stop();
      logger.info(`Job paused: ${jobId}`);
    }
  }

  public resumeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.start();
      logger.info(`Job resumed: ${jobId}`);
    }
  }

  public async shutdown(): Promise<void> {
    // Stop all cron jobs
    this.jobs.forEach((job) => job.stop());
    this.jobs.clear();

    // Close queue
    await this.queue.close();

    // Shutdown KPI service
    await this.kpiService.shutdown();

    logger.info('KPI Scheduler shut down successfully');
  }
}