/**
 * Task API routes
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../database/index.js';
import { redis } from '../database/redis.js';
import { logger } from '../monitoring/logger.js';
import * as metrics from '../monitoring/metrics.js';
import { authenticate } from '../security/auth.js';
import { Task, TaskStatus, TaskPriority } from '../types/index.js';

export const taskRoutes = Router();

// All routes require authentication
taskRoutes.use(authenticate());

// List tasks
taskRoutes.get('/', async (req, res, next) => {
  try {
    const { 
      status, 
      priority, 
      agentId,
      from,
      to,
      limit = 100,
      offset = 0,
      sort = 'start_time',
      order = 'desc'
    } = req.query;

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      query += ` AND priority = $${params.length}`;
    }

    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }

    if (from) {
      params.push(from);
      query += ` AND start_time >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      query += ` AND start_time <= $${params.length}`;
    }

    // Add sorting
    const allowedSorts = ['start_time', 'end_time', 'duration', 'priority'];
    const sortField = allowedSorts.includes(sort as string) ? sort : 'start_time';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortField} ${sortOrder}`;

    // Add pagination
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);

    // Get total count
    const countQuery = query.replace(/SELECT \*/, 'SELECT COUNT(*)').replace(/LIMIT.*$/, '');
    const countParams = params.slice(0, -2); // Remove limit and offset
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return res.json({
      tasks: result.rows,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });

  } catch (error) {
    return next(error);
  }
});

// Get task by ID
taskRoutes.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM tasks WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Task not found' }
      });
    }

    return res.json(result.rows[0]);

  } catch (error) {
    return next(error);
  }
});

// Create task
taskRoutes.post('/', async (req, res, next) => {
  try {
    const task: Partial<Task> = {
      id: uuidv4(),
      agentId: req.body.agentId,
      type: req.body.type,
      description: req.body.description,
      status: TaskStatus.PENDING,
      priority: req.body.priority || TaskPriority.MEDIUM,
      startTime: new Date(),
      dependencies: req.body.dependencies || []
    };

    // Validate required fields
    if (!task.type || !task.description) {
      return res.status(400).json({
        error: { message: 'Type and description are required' }
      });
    }

    // Validate priority
    if (!Object.values(TaskPriority).includes(task.priority!)) {
      return res.status(400).json({
        error: { message: 'Invalid priority' }
      });
    }

    // Insert task
    await db.query(`
      INSERT INTO tasks 
      (id, agent_id, type, description, status, priority, dependencies)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      task.id, task.agentId, task.type, task.description,
      task.status, task.priority, task.dependencies
    ]);

    // Update metrics
    if (task.priority) {
      metrics.taskQueueSize.inc({ priority: task.priority });
    }

    // Cache task for quick access
    await redis.set(`task:${task.id}`, task, 3600);

    // If agent is assigned, send task to agent
    if (task.agentId) {
      // This would send the task to the agent via IPC
      // For now, we'll just log it
      logger.info('Task assigned to agent', {
        taskId: task.id,
        agentId: task.agentId
      });
    }

    return res.status(201).json(task);

  } catch (error) {
    return next(error);
  }
});

// Update task
taskRoutes.patch('/:id', async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const updates: any = {};
    const allowedUpdates = ['status', 'priority', 'agent_id', 'result', 'error'];

    // Build update query dynamically
    const setClauses: string[] = [];
    const params: any[] = [taskId];
    let paramCount = 2;

    for (const field of allowedUpdates) {
      if (req.body.hasOwnProperty(field)) {
        setClauses.push(`${field} = $${paramCount}`);
        params.push(req.body[field]);
        updates[field] = req.body[field];
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        error: { message: 'No valid fields to update' }
      });
    }

    // Handle status changes
    if (updates.status) {
      if (!Object.values(TaskStatus).includes(updates.status)) {
        return res.status(400).json({
          error: { message: 'Invalid status' }
        });
      }

      // If completing or failing, set end time and calculate duration
      if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(updates.status)) {
        setClauses.push(`end_time = CURRENT_TIMESTAMP`);
        setClauses.push(`duration = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time))`);
      }
    }

    const query = `
      UPDATE tasks 
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Task not found' }
      });
    }

    const updatedTask = result.rows[0];

    // Update metrics
    if (updates.status === TaskStatus.COMPLETED || updates.status === TaskStatus.FAILED) {
      const agentType = updatedTask.agent_id ? 'assigned' : 'unassigned';
      
      metrics.tasksTotal.inc({
        agent_type: agentType,
        task_type: updatedTask.type,
        status: updates.status === TaskStatus.COMPLETED ? 'completed' : 'failed'
      });

      if (updatedTask.duration) {
        metrics.taskDuration.observe(
          { 
            agent_type: agentType,
            task_type: updatedTask.type,
            status: updates.status === TaskStatus.COMPLETED ? 'completed' : 'failed'
          },
          updatedTask.duration
        );
      }

      metrics.taskQueueSize.dec({ priority: updatedTask.priority });
    }

    // Clear cache
    await redis.delete(`task:${taskId}`);

    return res.json(updatedTask);

  } catch (error) {
    return next(error);
  }
});

// Delete task
taskRoutes.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Task not found' }
      });
    }

    const deletedTask = result.rows[0];

    // Update metrics
    if (deletedTask.status === TaskStatus.PENDING || deletedTask.status === TaskStatus.QUEUED) {
      metrics.taskQueueSize.dec({ priority: deletedTask.priority });
    }

    // Clear cache
    await redis.delete(`task:${req.params.id}`);

    return res.json({ 
      success: true,
      deleted: deletedTask
    });

  } catch (error) {
    return next(error);
  }
});

// Get task artifacts
taskRoutes.get('/:id/artifacts', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM task_artifacts WHERE task_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    return res.json({
      artifacts: result.rows
    });

  } catch (error) {
    return next(error);
  }
});

// Add task artifact
taskRoutes.post('/:id/artifacts', async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const { type, path, size, hash, metadata } = req.body;

    // Validate task exists
    const taskResult = await db.query(
      'SELECT id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Task not found' }
      });
    }

    // Validate required fields
    if (!type || !path || !size || !hash) {
      return res.status(400).json({
        error: { message: 'Type, path, size, and hash are required' }
      });
    }

    const artifactId = uuidv4();

    await db.query(`
      INSERT INTO task_artifacts 
      (id, task_id, type, path, size, hash, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [artifactId, taskId, type, path, size, hash, metadata || {}]);

    return res.status(201).json({
      id: artifactId,
      taskId,
      type,
      path,
      size,
      hash,
      metadata
    });

  } catch (error) {
    return next(error);
  }
});

// Get task queue statistics
taskRoutes.get('/queue/stats', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT 
        status,
        priority,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time))) as avg_age_seconds
      FROM tasks
      WHERE status IN ($1, $2, $3)
      GROUP BY status, priority
      ORDER BY status, priority
    `, [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.RUNNING]);

    const stats = result.rows.reduce((acc: any, row: any) => {
      if (!acc[row.status]) {
        acc[row.status] = {};
      }
      acc[row.status][row.priority] = {
        count: parseInt(row.count),
        avgAgeSeconds: parseFloat(row.avg_age_seconds) || 0
      };
      return acc;
    }, {});

    return res.json({ queueStats: stats });

  } catch (error) {
    return next(error);
  }
});