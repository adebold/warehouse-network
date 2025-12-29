/**
 * Agent worker process
 */

import os from 'os';

import { logger } from '../monitoring/logger.js';

interface WorkerConfig {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  metadata?: Record<string, any>;
}

class AgentWorker {
  private config: WorkerConfig;
  private paused = false;
  private tasks: Map<string, any> = new Map();
  private metricsInterval?: NodeJS.Timeout;

  constructor() {
    this.config = JSON.parse(process.env.AGENT_CONFIG || '{}');
    this.setupHandlers();
    this.startMetricsReporting();
  }

  private setupHandlers(): void {
    // Handle IPC messages
    process.on('message', (message: any) => {
      this.handleMessage(message);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'health':
        this.sendMessage({ type: 'health', data: { status: 'ok' } });
        break;

      case 'pause':
        this.paused = true;
        logger.info('Agent paused', { agentId: this.config.id });
        break;

      case 'resume':
        this.paused = false;
        logger.info('Agent resumed', { agentId: this.config.id });
        break;

      case 'shutdown':
        this.shutdown();
        break;

      case 'task':
        if (!this.paused) {
          this.executeTask(message.data);
        }
        break;

      default:
        logger.warn('Unknown message type', { type: message.type });
    }
  }

  private async executeTask(taskData: any): Promise<void> {
    const taskId = taskData.id;
    this.tasks.set(taskId, taskData);

    try {
      // Notify task started
      this.sendMessage({
        type: 'task:started',
        data: {
          id: taskId,
          type: taskData.type,
          description: taskData.description,
          priority: taskData.priority
        }
      });

      // Simulate task execution based on type
      const result = await this.performTask(taskData);

      // Notify task completed
      this.sendMessage({
        type: 'task:completed',
        data: {
          id: taskId,
          result
        }
      });

    } catch (error) {
      // Notify task failed
      this.sendMessage({
        type: 'task:failed',
        data: {
          id: taskId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    } finally {
      this.tasks.delete(taskId);
    }
  }

  private async performTask(taskData: any): Promise<any> {
    // This is where actual agent logic would go
    // For now, we'll simulate different task types

    switch (taskData.type) {
      case 'code_analysis':
        return this.analyzeCode(taskData);

      case 'test_execution':
        return this.runTests(taskData);

      case 'build':
        return this.executeBuild(taskData);

      case 'deploy':
        return this.executeDeploy(taskData);

      default:
        // Generic task execution
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5000));
        return { success: true, timestamp: new Date() };
    }
  }

  private async analyzeCode(taskData: any): Promise<any> {
    // Simulate code analysis
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      files: taskData.files || [],
      issues: Math.floor(Math.random() * 10),
      suggestions: ['Consider refactoring', 'Add more tests'],
      timestamp: new Date()
    };
  }

  private async runTests(taskData: any): Promise<any> {
    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, 3000));
    return {
      total: 100,
      passed: 95,
      failed: 5,
      coverage: 85.5,
      timestamp: new Date()
    };
  }

  private async executeBuild(taskData: any): Promise<any> {
    // Simulate build process
    await new Promise(resolve => setTimeout(resolve, 5000));
    return {
      success: true,
      artifacts: ['dist/bundle.js', 'dist/bundle.css'],
      size: 1024 * 1024 * 2.5, // 2.5MB
      timestamp: new Date()
    };
  }

  private async executeDeploy(taskData: any): Promise<any> {
    // Simulate deployment
    await new Promise(resolve => setTimeout(resolve, 4000));
    return {
      success: true,
      environment: taskData.environment || 'production',
      url: 'https://app.example.com',
      timestamp: new Date()
    };
  }

  private startMetricsReporting(): void {
    this.metricsInterval = setInterval(() => {
      const loadAvg = os.loadavg()[0];
      const cpuUsage = loadAvg !== undefined ? loadAvg * 100 / os.cpus().length : 0;
      const memoryUsage = (1 - os.freemem() / os.totalmem()) * 100;

      this.sendMessage({
        type: 'metrics',
        data: {
          resources: {
            cpu: cpuUsage,
            memory: memoryUsage,
            network: {
              bytesIn: Math.floor(Math.random() * 1000000),
              bytesOut: Math.floor(Math.random() * 1000000),
              requestsIn: Math.floor(Math.random() * 100),
              requestsOut: Math.floor(Math.random() * 100)
            }
          },
          metrics: {
            activeTasks: this.tasks.size
          }
        }
      });
    }, 5000);
  }

  private sendMessage(message: any): void {
    if (process.send) {
      process.send(message);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('Agent shutting down', { agentId: this.config.id });

    // Clear intervals
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Wait for active tasks to complete
    const timeout = setTimeout(() => {
      logger.warn('Shutdown timeout, forcing exit', { agentId: this.config.id });
      process.exit(0);
    }, 10000);

    while (this.tasks.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    clearTimeout(timeout);
    process.exit(0);
  }

  start(): void {
    logger.info('Agent worker started', {
      agentId: this.config.id,
      name: this.config.name,
      type: this.config.type
    });

    // Send ready signal
    this.sendMessage({ type: 'ready' });
  }
}

// Start the worker
const worker = new AgentWorker();
worker.start();