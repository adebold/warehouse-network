/**
 * Agent Manager Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

import { agentManager } from '../../src/agents/manager.js';
import { db, initializeDatabase } from '../../src/database/index.js';
import { redis } from '../../src/database/redis.js';
import { AgentType, AgentStatus, TaskStatus } from '../../src/types/index.js';

describe('AgentManager Integration', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await redis.connect();
  });

  afterAll(async () => {
    await agentManager.shutdown();
    await db.close();
    await redis.close();
  });

  beforeEach(async () => {
    // Clean up any existing agents
    await db.query('DELETE FROM agents');
    await redis.invalidatePattern('agent:*');
  });

  describe('Agent Lifecycle', () => {
    it('should spawn a new agent', async () => {
      const agent = await agentManager.spawnAgent({
        name: 'Test Agent',
        type: AgentType.CODER,
        capabilities: ['javascript', 'typescript'],
        metadata: { test: true }
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBe('Test Agent');
      expect(agent.type).toBe(AgentType.CODER);
      expect(agent.status).toBe(AgentStatus.ACTIVE);
      expect(agent.pid).toBeGreaterThan(0);
      expect(agent.capabilities).toEqual(['javascript', 'typescript']);
      expect(agent.metadata.test).toBe(true);
    });

    it('should retrieve an agent by ID', async () => {
      const spawned = await agentManager.spawnAgent({
        name: 'Retrieve Test',
        type: AgentType.TESTER
      });

      const retrieved = await agentManager.getAgent(spawned.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(spawned.id);
      expect(retrieved?.name).toBe('Retrieve Test');
    });

    it('should list agents with filters', async () => {
      // Spawn multiple agents
      await agentManager.spawnAgent({
        name: 'Coder 1',
        type: AgentType.CODER
      });

      await agentManager.spawnAgent({
        name: 'Tester 1',
        type: AgentType.TESTER
      });

      const coder2 = await agentManager.spawnAgent({
        name: 'Coder 2',
        type: AgentType.CODER
      });

      // Pause one agent
      await agentManager.pauseAgent(coder2.id);

      // List all
      const allAgents = await agentManager.listAgents();
      expect(allAgents).toHaveLength(3);

      // List by type
      const coders = await agentManager.listAgents({ type: AgentType.CODER });
      expect(coders).toHaveLength(2);

      // List by status
      const activeAgents = await agentManager.listAgents({ status: AgentStatus.ACTIVE });
      expect(activeAgents).toHaveLength(2);
    });

    it('should pause and resume an agent', async () => {
      const agent = await agentManager.spawnAgent({
        name: 'Pause Test',
        type: AgentType.ANALYZER
      });

      expect(agent.status).toBe(AgentStatus.ACTIVE);

      // Pause
      await agentManager.pauseAgent(agent.id);
      const paused = await agentManager.getAgent(agent.id);
      expect(paused?.status).toBe(AgentStatus.PAUSED);

      // Resume
      await agentManager.resumeAgent(agent.id);
      const resumed = await agentManager.getAgent(agent.id);
      expect(resumed?.status).toBe(AgentStatus.ACTIVE);
    });

    it('should terminate an agent gracefully', async () => {
      const agent = await agentManager.spawnAgent({
        name: 'Terminate Test',
        type: AgentType.COORDINATOR
      });

      await agentManager.terminateAgent(agent.id, true);
      
      const terminated = await agentManager.getAgent(agent.id);
      expect(terminated).toBeNull();

      // Check database
      const result = await db.query(
        'SELECT status FROM agents WHERE id = $1',
        [agent.id]
      );
      expect(result.rows[0].status).toBe(AgentStatus.TERMINATED);
    });

    it('should enforce agent limits', async () => {
      // Spawn up to the limit
      const limit = 10; // Default from config
      const promises: Promise<any>[] = [];

      for (let i = 0; i < limit; i++) {
        promises.push(
          agentManager.spawnAgent({
            name: `Agent ${i}`,
            type: AgentType.CODER
          })
        );
      }

      await Promise.all(promises);

      // Try to spawn one more
      await expect(
        agentManager.spawnAgent({
          name: 'Over Limit',
          type: AgentType.CODER
        })
      ).rejects.toThrow('Agent limit reached');
    });
  });

  describe('Task Management', () => {
    let testAgent: any;

    beforeEach(async () => {
      testAgent = await agentManager.spawnAgent({
        name: 'Task Test Agent',
        type: AgentType.CODER
      });
    });

    it('should track task lifecycle', async () => {
      // Simulate task start
      await (agentManager as any).handleTaskStarted(testAgent, {
        id: 'task-1',
        type: 'code_analysis',
        description: 'Analyze code quality',
        priority: 'high'
      });

      // Check task was added
      const agentWithTask = await agentManager.getAgent(testAgent.id);
      expect(agentWithTask?.tasks).toHaveLength(1);
      expect(agentWithTask?.tasks[0].status).toBe(TaskStatus.RUNNING);

      // Simulate task completion
      await (agentManager as any).handleTaskCompleted(testAgent, {
        id: 'task-1',
        result: { issues: 0, suggestions: 3 }
      });

      // Check task was completed
      const agentAfterCompletion = await agentManager.getAgent(testAgent.id);
      const task = agentAfterCompletion?.tasks[0];
      expect(task?.status).toBe(TaskStatus.COMPLETED);
      expect(task?.duration).toBeGreaterThan(0);
      expect(task?.result).toEqual({ issues: 0, suggestions: 3 });
    });

    it('should update agent metrics', async () => {
      // Update metrics
      await (agentManager as any).updateAgentMetrics(testAgent, {
        resources: {
          cpu: 45.5,
          memory: 72.3,
          disk: 12.8,
          network: {
            bytesIn: 1024000,
            bytesOut: 512000,
            requestsIn: 100,
            requestsOut: 50
          }
        },
        metrics: {
          tasksCompleted: 10,
          tasksFailed: 2
        }
      });

      // Check metrics were stored
      const result = await db.query(
        'SELECT * FROM agent_metrics WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT 1',
        [testAgent.id]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].cpu_usage).toBe(45.5);
      expect(result.rows[0].memory_usage).toBe(72.3);
    });
  });

  describe('Error Handling', () => {
    it('should record agent errors', async () => {
      const agent = await agentManager.spawnAgent({
        name: 'Error Test',
        type: AgentType.TESTER
      });

      // Record an error
      await (agentManager as any).recordError(
        agent.id,
        'runtime',
        new Error('Test error message')
      );

      // Check error was recorded
      const result = await db.query(
        'SELECT * FROM agent_errors WHERE agent_id = $1',
        [agent.id]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].type).toBe('runtime');
      expect(result.rows[0].message).toBe('Test error message');
    });

    it('should handle agent crashes', async () => {
      const agent = await agentManager.spawnAgent({
        name: 'Crash Test',
        type: AgentType.CODER,
        metadata: { autoRestart: false }
      });

      // Simulate crash
      const process = (agentManager as any).processes.get(agent.id);
      process?.kill('SIGKILL');

      // Wait for exit handler
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check agent status
      const crashed = await agentManager.getAgent(agent.id);
      expect(crashed?.status).toBe(AgentStatus.TERMINATED);

      // Check error was recorded
      const errors = await db.query(
        'SELECT * FROM agent_errors WHERE agent_id = $1',
        [agent.id]
      );
      expect(errors.rows).toHaveLength(1);
      expect(errors.rows[0].message).toContain('exited unexpectedly');
    });
  });

  describe('Performance', () => {
    it('should spawn multiple agents concurrently', async () => {
      const count = 5;
      const start = Date.now();

      const promises = Array.from({ length: count }, (_, i) => 
        agentManager.spawnAgent({
          name: `Concurrent ${i}`,
          type: AgentType.CODER
        })
      );

      const agents = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(agents).toHaveLength(count);
      agents.forEach(agent => {
        expect(agent.status).toBe(AgentStatus.ACTIVE);
      });

      // Should be reasonably fast for concurrent spawning
      expect(duration).toBeLessThan(count * 1000);
    });

    it('should handle high-frequency metrics updates', async () => {
      const agent = await agentManager.spawnAgent({
        name: 'Metrics Test',
        type: AgentType.ANALYZER
      });

      const updateCount = 100;
      const updates: Promise<any>[] = [];

      for (let i = 0; i < updateCount; i++) {
        updates.push(
          (agentManager as any).updateAgentMetrics(agent, {
            resources: {
              cpu: Math.random() * 100,
              memory: Math.random() * 100,
              disk: 0,
              network: {
                bytesIn: i * 1000,
                bytesOut: i * 500,
                requestsIn: i,
                requestsOut: i
              }
            }
          })
        );
      }

      await Promise.all(updates);

      // Check all metrics were recorded
      const result = await db.query(
        'SELECT COUNT(*) as count FROM agent_metrics WHERE agent_id = $1',
        [agent.id]
      );

      expect(parseInt(result.rows[0].count)).toBe(updateCount);
    });
  });
});