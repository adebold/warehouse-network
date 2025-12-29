/**
 * Agent lifecycle management
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

import { v4 as uuidv4 } from 'uuid';

import config from '../config/index.js';
import { db } from '../database/index.js';
import { redis } from '../database/redis.js';
import { logger } from '../monitoring/logger.js';
import * as metrics from '../monitoring/metrics.js';
import { traceAsync } from '../monitoring/tracing.js';
import { 
  Agent, AgentConfig, AgentStatus, AgentType, 
  Task, TaskStatus, AgentError, ErrorType 
} from '../types/index.js';

export class AgentManager extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.setupIntervals();
  }

  private setupIntervals(): void {
    // Health check interval
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      config.agents.healthCheckInterval
    );

    // Cleanup interval
    this.cleanupInterval = setInterval(
      () => this.performCleanup(),
      config.agents.cleanupInterval
    );
  }

  async spawnAgent(agentConfig: AgentConfig): Promise<Agent> {
    return traceAsync('agent.spawn', async (span) => {
      span.setAttributes({
        'agent.type': agentConfig.type,
        'agent.name': agentConfig.name
      });

      const startTime = Date.now();
      const agentId = agentConfig.id || uuidv4();

      try {
        // Check if we've reached the agent limit
        if (this.agents.size >= config.agents.maxAgents) {
          throw new Error(`Agent limit reached (${config.agents.maxAgents})`);
        }

        // Create agent record
        const agent: Agent = {
          id: agentId,
          name: agentConfig.name,
          type: agentConfig.type,
          status: AgentStatus.SPAWNING,
          capabilities: agentConfig.capabilities,
          startTime: new Date(),
          lastActivity: new Date(),
          metrics: {
            tasksCompleted: 0,
            tasksFailed: 0,
            averageTaskDuration: 0,
            cpuUsage: 0,
            memoryUsage: 0,
            networkIO: { bytesIn: 0, bytesOut: 0, requestsIn: 0, requestsOut: 0 }
          },
          tasks: [],
          errors: [],
          resources: {
            cpu: 0,
            memory: 0,
            disk: 0,
            network: { bytesIn: 0, bytesOut: 0, requestsIn: 0, requestsOut: 0 },
            ...(agentConfig.resources && { limits: agentConfig.resources })
          },
          metadata: agentConfig.metadata || {}
        };

        // Store in memory
        this.agents.set(agentId, agent);

        // Persist to database
        await db.query(`
          INSERT INTO agents (id, name, type, status, capabilities, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [agentId, agent.name, agent.type, agent.status, agent.capabilities, agent.metadata]);

        // Cache in Redis
        await redis.set(`agent:${agentId}`, agent, 3600);

        // Spawn the actual process
        const process = await this.spawnProcess(agent, agentConfig);
        this.processes.set(agentId, process);

        // Update status
        agent.status = AgentStatus.ACTIVE;
        if (process.pid) {
          agent.pid = process.pid;
        }
        await this.updateAgentStatus(agent);

        // Emit spawn event
        this.emit('agent:spawned', agent);

        // Record metrics
        const duration = (Date.now() - startTime) / 1000;
        metrics.agentSpawnDuration.observe(
          { type: agent.type, status: 'success' },
          duration
        );
        metrics.agentsTotal.inc({ status: agent.status, type: agent.type });

        logger.info('Agent spawned successfully', {
          agentId,
          name: agent.name,
          type: agent.type,
          pid: process.pid,
          duration
        });

        return agent;

      } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        metrics.agentSpawnDuration.observe(
          { type: agentConfig.type, status: 'error' },
          duration
        );
        
        logger.error('Failed to spawn agent', {
          agentId,
          name: agentConfig.name,
          type: agentConfig.type,
          error
        });

        // Clean up on error
        this.agents.delete(agentId);
        await this.recordError(agentId, ErrorType.SPAWN, error as Error);
        
        throw error;
      }
    });
  }

  private async spawnProcess(agent: Agent, agentConfig: AgentConfig): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      // Prepare agent environment
      const env = {
        ...process.env,
        AGENT_ID: agent.id,
        AGENT_NAME: agent.name,
        AGENT_TYPE: agent.type,
        AGENT_CONFIG: JSON.stringify(agentConfig)
      };

      // Spawn agent process
      const agentScript = `${process.cwd()}/src/agents/worker.js`;
      const proc = spawn('node', [agentScript], {
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });

      // Handle process events
      proc.on('error', (error) => {
        logger.error('Agent process error', { agentId: agent.id, error });
        reject(error);
      });

      proc.on('exit', (code, signal) => {
        logger.info('Agent process exited', { agentId: agent.id, code, signal });
        this.handleAgentExit(agent.id, code, signal);
      });

      // Handle IPC messages
      proc.on('message', (message: any) => {
        this.handleAgentMessage(agent.id, message);
      });

      // Handle stdout/stderr
      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          logger.debug('Agent stdout', { agentId: agent.id, data: data.toString() });
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          logger.error('Agent stderr', { agentId: agent.id, data: data.toString() });
        });
      }

      // Set spawn timeout
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('Agent spawn timeout'));
      }, agentConfig.timeout || config.agents.spawnTimeout);

      // Wait for ready signal
      proc.once('message', (message: any) => {
        if (message.type === 'ready') {
          clearTimeout(timeout);
          resolve(proc);
        }
      });
    });
  }

  async getAgent(agentId: string): Promise<Agent | undefined> {
    // Check memory first
    let agent = this.agents.get(agentId);
    if (agent) {return agent;}

    // Check Redis cache
    const cachedAgent = await redis.get<Agent>(`agent:${agentId}`);
    if (cachedAgent) {
      this.agents.set(agentId, cachedAgent);
      return cachedAgent;
    }

    // Load from database
    const result = await db.query<any>(`
      SELECT id, name, type, status, pid, capabilities, 
             start_time, last_activity, metadata
      FROM agents WHERE id = $1
    `, [agentId]);

    if (result.rows.length === 0) {return undefined;}

    const row = result.rows[0];
    agent = {
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      pid: row.pid,
      capabilities: row.capabilities,
      startTime: row.start_time,
      lastActivity: row.last_activity,
      metadata: row.metadata,
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageTaskDuration: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        networkIO: { bytesIn: 0, bytesOut: 0, requestsIn: 0, requestsOut: 0 }
      },
      tasks: [],
      errors: [],
      resources: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: { bytesIn: 0, bytesOut: 0, requestsIn: 0, requestsOut: 0 }
      }
    };

    // Cache and return
    this.agents.set(agentId, agent);
    await redis.set(`agent:${agentId}`, agent, 3600);
    
    return agent;
  }

  async listAgents(filter?: { status?: AgentStatus; type?: AgentType }): Promise<Agent[]> {
    let query = 'SELECT * FROM agents WHERE 1=1';
    const params: any[] = [];

    if (filter?.status) {
      params.push(filter.status);
      query += ` AND status = $${params.length}`;
    }

    if (filter?.type) {
      params.push(filter.type);
      query += ` AND type = $${params.length}`;
    }

    query += ' ORDER BY start_time DESC';

    const result = await db.query(query, params);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      pid: row.pid,
      capabilities: row.capabilities || [],
      startTime: row.start_time,
      lastActivity: row.last_activity,
      metadata: row.metadata || {},
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageTaskDuration: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        networkIO: { bytesIn: 0, bytesOut: 0, requestsIn: 0, requestsOut: 0 }
      },
      tasks: [],
      errors: [],
      resources: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: { bytesIn: 0, bytesOut: 0, requestsIn: 0, requestsOut: 0 }
      }
    }));
  }

  async terminateAgent(agentId: string, graceful = true): Promise<void> {
    return traceAsync('agent.terminate', async (span) => {
      span.setAttributes({
        'agent.id': agentId,
        'agent.graceful': graceful
      });

      const agent = await this.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      try {
        // Update status
        agent.status = AgentStatus.TERMINATING;
        await this.updateAgentStatus(agent);

        // Terminate process
        const process = this.processes.get(agentId);
        if (process) {
          if (graceful) {
            process.send({ type: 'shutdown' });
            
            // Wait for graceful shutdown
            await new Promise((resolve) => {
              const timeout = setTimeout(() => {
                process.kill('SIGKILL');
                resolve(null);
              }, 10000);

              process.once('exit', () => {
                clearTimeout(timeout);
                resolve(null);
              });
            });
          } else {
            process.kill('SIGKILL');
          }
        }

        // Clean up
        this.agents.delete(agentId);
        this.processes.delete(agentId);
        await redis.delete(`agent:${agentId}`);

        // Update database
        agent.status = AgentStatus.TERMINATED;
        await db.query(
          'UPDATE agents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [agent.status, agentId]
        );

        // Record lifetime metrics
        const lifetime = (Date.now() - agent.startTime.getTime()) / 1000;
        metrics.agentLifetime.observe({ type: agent.type }, lifetime);
        metrics.agentsTotal.dec({ status: AgentStatus.ACTIVE, type: agent.type });

        // Emit event
        this.emit('agent:terminated', agent);

        logger.info('Agent terminated', {
          agentId,
          graceful,
          lifetime
        });

      } catch (error) {
        logger.error('Failed to terminate agent', { agentId, error });
        throw error;
      }
    });
  }

  async pauseAgent(agentId: string): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {throw new Error(`Agent ${agentId} not found`);}

    const process = this.processes.get(agentId);
    if (process) {
      process.send({ type: 'pause' });
    }

    agent.status = AgentStatus.PAUSED;
    await this.updateAgentStatus(agent);
    this.emit('agent:paused', agent);
  }

  async resumeAgent(agentId: string): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {throw new Error(`Agent ${agentId} not found`);}

    const process = this.processes.get(agentId);
    if (process) {
      process.send({ type: 'resume' });
    }

    agent.status = AgentStatus.ACTIVE;
    await this.updateAgentStatus(agent);
    this.emit('agent:resumed', agent);
  }

  private async updateAgentStatus(agent: Agent): Promise<void> {
    agent.lastActivity = new Date();
    
    await db.query(`
      UPDATE agents 
      SET status = $1, last_activity = $2, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3
    `, [agent.status, agent.lastActivity, agent.id]);
    
    await redis.set(`agent:${agent.id}`, agent, 3600);
  }

  private async handleAgentMessage(agentId: string, message: any): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {return;}

    switch (message.type) {
      case 'metrics':
        await this.updateAgentMetrics(agent, message.data);
        break;
      
      case 'task:started':
        await this.handleTaskStarted(agent, message.data);
        break;
      
      case 'task:completed':
        await this.handleTaskCompleted(agent, message.data);
        break;
      
      case 'task:failed':
        await this.handleTaskFailed(agent, message.data);
        break;
      
      case 'error':
        await this.recordError(agentId, ErrorType.RUNTIME, message.data);
        break;
      
      case 'log':
        logger.info('Agent log', { agentId, ...message.data });
        break;
      
      default:
        this.emit(`agent:message:${message.type}`, { agentId, data: message.data });
    }
  }

  private async updateAgentMetrics(agent: Agent, metricsData: any): Promise<void> {
    agent.resources = metricsData.resources || agent.resources;
    agent.metrics = { ...agent.metrics, ...metricsData.metrics };
    
    // Store metrics in time-series table
    await db.query(`
      INSERT INTO agent_metrics 
      (agent_id, cpu_usage, memory_usage, network_in, network_out, custom_metrics)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      agent.id,
      agent.resources.cpu,
      agent.resources.memory,
      agent.resources.network.bytesIn,
      agent.resources.network.bytesOut,
      metricsData.custom || {}
    ]);

    // Update Prometheus metrics
    metrics.recordAgentMetrics(agent);
    
    await this.updateAgentStatus(agent);
  }

  private async handleTaskStarted(agent: Agent, taskData: any): Promise<void> {
    const task: Task = {
      id: taskData.id || uuidv4(),
      agentId: agent.id,
      type: taskData.type,
      description: taskData.description,
      status: TaskStatus.RUNNING,
      priority: taskData.priority,
      startTime: new Date(),
      dependencies: taskData.dependencies
    };

    agent.tasks.push(task);
    
    await db.query(`
      INSERT INTO tasks 
      (id, agent_id, type, description, status, priority, dependencies)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      task.id, task.agentId, task.type, task.description,
      task.status, task.priority, task.dependencies
    ]);

    this.emit('task:started', { agent, task });
  }

  private async handleTaskCompleted(agent: Agent, taskData: any): Promise<void> {
    const task = agent.tasks.find(t => t.id === taskData.id);
    if (!task) {return;}

    task.status = TaskStatus.COMPLETED;
    task.endTime = new Date();
    task.duration = (task.endTime.getTime() - task.startTime.getTime()) / 1000;
    task.result = taskData.result;

    agent.metrics.tasksCompleted++;
    const totalDuration = agent.metrics.averageTaskDuration * (agent.metrics.tasksCompleted - 1);
    agent.metrics.averageTaskDuration = (totalDuration + task.duration) / agent.metrics.tasksCompleted;

    await db.query(`
      UPDATE tasks 
      SET status = $1, end_time = $2, duration = $3, result = $4 
      WHERE id = $5
    `, [task.status, task.endTime, task.duration, task.result, task.id]);

    // Update metrics
    metrics.tasksTotal.inc({ 
      agent_type: agent.type, 
      task_type: task.type, 
      status: 'completed' 
    });
    metrics.taskDuration.observe(
      { agent_type: agent.type, task_type: task.type, status: 'completed' },
      task.duration
    );

    this.emit('task:completed', { agent, task });
    await this.updateAgentStatus(agent);
  }

  private async handleTaskFailed(agent: Agent, taskData: any): Promise<void> {
    const task = agent.tasks.find(t => t.id === taskData.id);
    if (!task) {return;}

    task.status = TaskStatus.FAILED;
    task.endTime = new Date();
    task.duration = (task.endTime.getTime() - task.startTime.getTime()) / 1000;
    task.error = taskData.error;

    agent.metrics.tasksFailed++;

    await db.query(`
      UPDATE tasks 
      SET status = $1, end_time = $2, duration = $3, error = $4 
      WHERE id = $5
    `, [task.status, task.endTime, task.duration, task.error, task.id]);

    // Update metrics
    metrics.tasksTotal.inc({ 
      agent_type: agent.type, 
      task_type: task.type, 
      status: 'failed' 
    });
    metrics.taskDuration.observe(
      { agent_type: agent.type, task_type: task.type, status: 'failed' },
      task.duration
    );

    this.emit('task:failed', { agent, task });
    await this.recordError(agent.id, ErrorType.TASK, new Error(task.error!));
    await this.updateAgentStatus(agent);
  }

  private async handleAgentExit(agentId: string, code: number | null, signal: string | null): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {return;}

    const wasActive = agent.status === AgentStatus.ACTIVE;
    agent.status = AgentStatus.TERMINATED;
    
    this.agents.delete(agentId);
    this.processes.delete(agentId);

    await this.updateAgentStatus(agent);

    if (wasActive && (code !== 0 || signal)) {
      // Unexpected exit
      await this.recordError(
        agentId, 
        ErrorType.RUNTIME, 
        new Error(`Agent exited unexpectedly: code=${code}, signal=${signal}`)
      );

      // Attempt restart if configured
      if (agent.metadata.autoRestart && agent.errors.length <= config.agents.maxRetries) {
        logger.info('Attempting to restart agent', { agentId });
        setTimeout(() => {
          this.spawnAgent({
            id: agentId,
            name: agent.name,
            type: agent.type,
            capabilities: agent.capabilities,
            metadata: agent.metadata
          }).catch(err => {
            logger.error('Failed to restart agent', { agentId, error: err });
          });
        }, 5000);
      }
    }

    this.emit('agent:exited', { agent, code, signal });
  }

  private async recordError(agentId: string, type: ErrorType, error: Error): Promise<void> {
    const errorRecord: AgentError = {
      id: uuidv4(),
      agentId,
      timestamp: new Date(),
      type,
      message: error.message,
      ...(error.stack && { stack: error.stack }),
      context: {}
    };

    await db.query(`
      INSERT INTO agent_errors 
      (id, agent_id, type, message, stack, context)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      errorRecord.id, errorRecord.agentId, errorRecord.type,
      errorRecord.message, errorRecord.stack, errorRecord.context
    ]);

    metrics.errorsTotal.inc({ type, agent_type: 'unknown' });
    
    const agent = await this.getAgent(agentId);
    if (agent) {
      agent.errors.push(errorRecord);
      metrics.errorsTotal.inc({ type, agent_type: agent.type });
    }

    this.emit('agent:error', errorRecord);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [agentId, agent] of this.agents) {
      try {
        const process = this.processes.get(agentId);
        if (!process || !process.pid) {
          agent.status = AgentStatus.ERROR;
          await this.updateAgentStatus(agent);
          continue;
        }

        // Send health check ping
        process.send({ type: 'health' });

        // Check for timeout
        const lastActivity = agent.lastActivity.getTime();
        const now = Date.now();
        const timeout = agent.metadata.timeout || config.agents.defaultTimeout;

        if (now - lastActivity > timeout) {
          logger.warn('Agent timeout detected', { agentId, timeout });
          await this.terminateAgent(agentId);
        }

      } catch (error) {
        logger.error('Health check failed', { agentId, error });
      }
    }
  }

  private async performCleanup(): Promise<void> {
    // Clean up terminated agents from database
    await db.query(`
      DELETE FROM agents 
      WHERE status = $1 AND updated_at < NOW() - INTERVAL '1 day'
    `, [AgentStatus.TERMINATED]);

    // Clean up old metrics
    await db.query(`
      DELETE FROM agent_metrics 
      WHERE timestamp < NOW() - INTERVAL '7 days'
    `);

    // Clean up completed tasks
    await db.query(`
      DELETE FROM tasks 
      WHERE status IN ($1, $2) AND end_time < NOW() - INTERVAL '3 days'
    `, [TaskStatus.COMPLETED, TaskStatus.CANCELLED]);

    // Clean up errors
    await db.query(`
      DELETE FROM agent_errors 
      WHERE timestamp < NOW() - INTERVAL '30 days'
    `);

    logger.debug('Cleanup performed');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down agent manager');

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Terminate all agents
    const terminatePromises = Array.from(this.agents.keys()).map(
      agentId => this.terminateAgent(agentId, true).catch(err => {
        logger.error('Error terminating agent during shutdown', { agentId, error: err });
      })
    );

    await Promise.all(terminatePromises);
    
    logger.info('Agent manager shutdown complete');
  }
}

// Singleton instance
export const agentManager = new AgentManager();