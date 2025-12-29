/**
 * Agent API routes
 */

import { Router } from 'express';

import { agentManager } from '../agents/manager.js';
import * as metrics from '../monitoring/metrics.js';
import { traceAsync } from '../monitoring/tracing.js';
import { authenticate, authorize } from '../security/auth.js';
import { AgentConfig, AgentStatus, AgentType } from '../types/index.js';

export const agentRoutes = Router();

// All routes require authentication
agentRoutes.use(authenticate());

// List agents
agentRoutes.get('/', async (req, res, next) => {
  try {
    const { status, type, limit = 100, offset = 0 } = req.query;
    
    const agents = await agentManager.listAgents({
      status: status as AgentStatus,
      type: type as AgentType
    });

    // Pagination
    const paginatedAgents = agents.slice(
      Number(offset), 
      Number(offset) + Number(limit)
    );

    return res.json({
      agents: paginatedAgents,
      total: agents.length,
      limit: Number(limit),
      offset: Number(offset)
    });

    metrics.apiRequestsTotal.inc({
      method: 'GET',
      endpoint: '/api/agents',
      status_code: '200'
    });

  } catch (error) {
    return next(error);
  }
});

// Get agent by ID
agentRoutes.get('/:id', async (req, res, next) => {
  try {
    const agent = await agentManager.getAgent(req.params.id!);
    
    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found' }
      });
    }

    return res.json(agent);

  } catch (error) {
    return next(error);
  }
});

// Spawn new agent (requires admin role)
agentRoutes.post('/', authorize('admin'), async (req, res, next) => {
  return traceAsync('api.agents.spawn', async (span) => {
    try {
      const agentConfig: AgentConfig = {
        id: req.body.id,
        name: req.body.name,
        type: req.body.type,
        capabilities: req.body.capabilities || [],
        metadata: req.body.metadata || {},
        resources: req.body.resources,
        timeout: req.body.timeout
      };

      span.setAttributes({
        'agent.name': agentConfig.name,
        'agent.type': agentConfig.type
      });

      // Validate required fields
      if (!agentConfig.name || !agentConfig.type) {
        return res.status(400).json({
          error: { message: 'Name and type are required' }
        });
      }

      // Validate agent type
      if (!Object.values(AgentType).includes(agentConfig.type)) {
        return res.status(400).json({
          error: { message: 'Invalid agent type' }
        });
      }

      const agent = await agentManager.spawnAgent(agentConfig);
      
      return res.status(201).json(agent);

      metrics.apiRequestsTotal.inc({
        method: 'POST',
        endpoint: '/api/agents',
        status_code: '201'
      });

    } catch (error: any) {
      span.recordException(error);
      
      if (error.message.includes('Agent limit reached')) {
        return res.status(503).json({
          error: { message: error.message }
        });
      }
      
      return next(error);
    }
  });
});

// Update agent status
agentRoutes.patch('/:id/status', authorize('admin'), async (req, res, next) => {
  try {
    const { action } = req.body;
    const agentId = req.params.id!;

    if (!action || !['pause', 'resume', 'terminate'].includes(action)) {
      return res.status(400).json({
        error: { message: 'Invalid action. Must be: pause, resume, or terminate' }
      });
    }

    const agent = await agentManager.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found' }
      });
    }

    switch (action) {
      case 'pause':
        await agentManager.pauseAgent(agentId);
        break;
      case 'resume':
        await agentManager.resumeAgent(agentId);
        break;
      case 'terminate':
        await agentManager.terminateAgent(agentId, req.body.graceful !== false);
        break;
    }

    const updatedAgent = await agentManager.getAgent(agentId);
    return res.json(updatedAgent);

  } catch (error) {
    return next(error);
  }
});

// Get agent metrics
agentRoutes.get('/:id/metrics', async (req, res, next) => {
  try {
    const { from, to, interval = '5m' } = req.query;
    const agentId = req.params.id!;

    const agent = await agentManager.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found' }
      });
    }

    // In a real implementation, you would query time-series metrics
    // For now, return current metrics
    return res.json({
      agentId,
      metrics: agent.metrics,
      resources: agent.resources,
      period: {
        from: from || new Date(Date.now() - 3600000).toISOString(),
        to: to || new Date().toISOString(),
        interval
      }
    });

  } catch (error) {
    return next(error);
  }
});

// Get agent tasks
agentRoutes.get('/:id/tasks', async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const agentId = req.params.id!;

    const agent = await agentManager.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found' }
      });
    }

    let tasks = agent.tasks;
    
    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }

    // Sort by start time descending
    tasks.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    const paginatedTasks = tasks.slice(
      Number(offset),
      Number(offset) + Number(limit)
    );

    return res.json({
      tasks: paginatedTasks,
      total: tasks.length,
      limit: Number(limit),
      offset: Number(offset)
    });

  } catch (error) {
    return next(error);
  }
});

// Get agent errors
agentRoutes.get('/:id/errors', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const agentId = req.params.id!;

    const agent = await agentManager.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found' }
      });
    }

    // Sort by timestamp descending
    const errors = [...agent.errors].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    const paginatedErrors = errors.slice(
      Number(offset),
      Number(offset) + Number(limit)
    );

    return res.json({
      errors: paginatedErrors,
      total: errors.length,
      limit: Number(limit),
      offset: Number(offset)
    });

  } catch (error) {
    return next(error);
  }
});

// Send command to agent
agentRoutes.post('/:id/command', authorize('admin'), async (req, res, next) => {
  try {
    const { command, data } = req.body;
    const agentId = req.params.id!;

    if (!command) {
      return res.status(400).json({
        error: { message: 'Command is required' }
      });
    }

    const agent = await agentManager.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found' }
      });
    }

    // Send command via IPC
    const process = (agentManager as any).processes.get(agentId);
    if (!process) {
      return res.status(503).json({
        error: { message: 'Agent process not available' }
      });
    }

    process.send({ type: command, data });

    return res.json({
      success: true,
      command,
      agentId
    });

  } catch (error) {
    return next(error);
  }
});