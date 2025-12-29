/**
 * Change tracking API routes
 */

import { Router } from 'express';

import { db } from '../database/index.js';
import { gitIntegration } from '../integrations/git.js';
import * as metrics from '../monitoring/metrics.js';
import { authenticate } from '../security/auth.js';
import { ChangeType } from '../types/index.js';

export const changeRoutes = Router();

// All routes require authentication
changeRoutes.use(authenticate());

// List changes
changeRoutes.get('/', async (req, res, next) => {
  try {
    const {
      agentId,
      type,
      path,
      from,
      to,
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM change_events WHERE 1=1';
    const params: any[] = [];

    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    if (path) {
      params.push(`%${path}%`);
      query += ` AND path LIKE $${params.length}`;
    }

    if (from) {
      params.push(from);
      query += ` AND timestamp >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      query += ` AND timestamp <= $${params.length}`;
    }

    query += ' ORDER BY timestamp DESC';

    // Add pagination
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);

    // Get total count
    const countQuery = query.replace(/SELECT \*/, 'SELECT COUNT(*)').replace(/ORDER BY.*$/, '');
    const countParams = params.slice(0, -2);
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return res.json({
      changes: result.rows,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });

  } catch (error) {
    return next(error);
  }
});

// Get change by ID
changeRoutes.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM change_events WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Change not found' }
      });
    }

    return res.json(result.rows[0]);

  } catch (error) {
    return next(error);
  }
});

// Track change
changeRoutes.post('/', async (req, res, next) => {
  try {
    const { agentId, path, type, message } = req.body;

    // Validate required fields
    if (!agentId || !path || !type) {
      return res.status(400).json({
        error: { message: 'agentId, path, and type are required' }
      });
    }

    // Validate change type
    if (!Object.values(ChangeType).includes(type)) {
      return res.status(400).json({
        error: { message: 'Invalid change type' }
      });
    }

    const change = await gitIntegration.trackChange(
      agentId,
      path,
      type,
      message
    );

    // Update metrics
    metrics.changesTotal.inc({
      type,
      agent_type: 'api'
    });

    return res.status(201).json(change);

  } catch (error) {
    return next(error);
  }
});

// Get git status
changeRoutes.get('/git/status', async (req, res, next) => {
  try {
    const status = await gitIntegration.getGitStatus();
    return res.json(status);
  } catch (error) {
    return next(error);
  }
});

// Get commit history
changeRoutes.get('/git/commits', async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const commits = await gitIntegration.getCommitHistory(Number(limit));
    return res.json({ commits });
  } catch (error) {
    return next(error);
  }
});

// Create git commit
changeRoutes.post('/git/commit', async (req, res, next) => {
  try {
    const { message, files, agentId } = req.body;
    const user = (req as any).user;

    if (!message || !files || !Array.isArray(files)) {
      return res.status(400).json({
        error: { message: 'Message and files array are required' }
      });
    }

    const commitHash = await gitIntegration.createCommit(
      message,
      files,
      agentId || user.id
    );

    return res.json({
      success: true,
      commitHash
    });

  } catch (error) {
    return next(error);
  }
});

// Get change statistics
changeRoutes.get('/stats/summary', async (req, res, next) => {
  try {
    const { period = '24h', groupBy = 'type' } = req.query;

    // Convert period to interval
    const intervals: Record<string, string> = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };

    const interval = intervals[period as string] || '24 hours';

    let query: string;
    if (groupBy === 'type') {
      query = `
        SELECT 
          type,
          COUNT(*) as count,
          COUNT(DISTINCT agent_id) as unique_agents
        FROM change_events
        WHERE timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY type
        ORDER BY count DESC
      `;
    } else if (groupBy === 'agent') {
      query = `
        SELECT 
          agent_id,
          COUNT(*) as count,
          COUNT(DISTINCT type) as change_types,
          MAX(timestamp) as last_change
        FROM change_events
        WHERE timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY agent_id
        ORDER BY count DESC
        LIMIT 20
      `;
    } else if (groupBy === 'path') {
      query = `
        SELECT 
          path,
          COUNT(*) as count,
          COUNT(DISTINCT agent_id) as unique_agents,
          MAX(timestamp) as last_change
        FROM change_events
        WHERE timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY path
        ORDER BY count DESC
        LIMIT 50
      `;
    } else {
      return res.status(400).json({
        error: { message: 'Invalid groupBy parameter' }
      });
    }

    const result = await db.query(query);

    return res.json({
      period,
      groupBy,
      stats: result.rows
    });

  } catch (error) {
    return next(error);
  }
});

// Get change timeline
changeRoutes.get('/stats/timeline', async (req, res, next) => {
  try {
    const { period = '24h', interval = '1h' } = req.query;

    // Map period and interval to PostgreSQL intervals
    const periodMap: Record<string, string> = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };

    const intervalMap: Record<string, string> = {
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': '1 hour',
      '1d': '1 day'
    };

    const pgPeriod = periodMap[period as string] || '24 hours';
    const pgInterval = intervalMap[interval as string] || '1 hour';

    const query = `
      SELECT 
        DATE_TRUNC('${pgInterval}', timestamp) as time_bucket,
        COUNT(*) as changes,
        COUNT(DISTINCT agent_id) as active_agents,
        COUNT(DISTINCT path) as files_changed
      FROM change_events
      WHERE timestamp >= NOW() - INTERVAL '${pgPeriod}'
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;

    const result = await db.query(query);

    return res.json({
      period,
      interval,
      timeline: result.rows
    });

  } catch (error) {
    return next(error);
  }
});