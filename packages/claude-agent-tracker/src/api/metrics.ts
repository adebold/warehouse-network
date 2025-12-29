/**
 * Metrics API routes
 */

import { Router } from 'express';

import { db } from '../database/index.js';
import { register } from '../monitoring/metrics.js';
import { authenticate } from '../security/auth.js';

export const metricsRoutes = Router();

// Prometheus metrics endpoint (no auth required for scrapers)
metricsRoutes.get('/prometheus', async (req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    return next(error);
  }
});

// All other routes require authentication
metricsRoutes.use(authenticate());

// Get agent metrics over time
metricsRoutes.get('/agents/:id', async (req, res, next) => {
  try {
    const { 
      from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      to = new Date().toISOString(),
      interval = '5m'
    } = req.query;

    const agentId = req.params.id;

    // Map interval to PostgreSQL date_trunc
    const intervalMap: Record<string, string> = {
      '1m': 'minute',
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': 'hour',
      '1d': 'day'
    };

    const pgInterval = intervalMap[interval as string] || 'hour';

    const query = `
      SELECT 
        DATE_TRUNC('${pgInterval}', timestamp) as time_bucket,
        AVG(cpu_usage) as avg_cpu,
        MAX(cpu_usage) as max_cpu,
        AVG(memory_usage) as avg_memory,
        MAX(memory_usage) as max_memory,
        SUM(network_in) as total_network_in,
        SUM(network_out) as total_network_out,
        SUM(tasks_completed) as tasks_completed,
        SUM(tasks_failed) as tasks_failed
      FROM agent_metrics
      WHERE agent_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;

    const result = await db.query(query, [agentId, from, to]);

    return res.json({
      agentId,
      period: { from, to, interval },
      metrics: result.rows
    });

  } catch (error) {
    return next(error);
  }
});

// Get aggregate metrics for all agents
metricsRoutes.get('/agents', async (req, res, next) => {
  try {
    const {
      from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      to = new Date().toISOString(),
      groupBy = 'type'
    } = req.query;

    let query: string;
    if (groupBy === 'type') {
      query = `
        SELECT 
          a.type,
          COUNT(DISTINCT a.id) as agent_count,
          AVG(m.cpu_usage) as avg_cpu,
          AVG(m.memory_usage) as avg_memory,
          SUM(m.tasks_completed) as total_tasks_completed,
          SUM(m.tasks_failed) as total_tasks_failed
        FROM agents a
        JOIN agent_metrics m ON a.id = m.agent_id
        WHERE m.timestamp >= $1 AND m.timestamp <= $2
        GROUP BY a.type
        ORDER BY total_tasks_completed DESC
      `;
    } else {
      query = `
        SELECT 
          a.id,
          a.name,
          a.type,
          AVG(m.cpu_usage) as avg_cpu,
          AVG(m.memory_usage) as avg_memory,
          SUM(m.tasks_completed) as total_tasks_completed,
          SUM(m.tasks_failed) as total_tasks_failed
        FROM agents a
        JOIN agent_metrics m ON a.id = m.agent_id
        WHERE m.timestamp >= $1 AND m.timestamp <= $2
        GROUP BY a.id, a.name, a.type
        ORDER BY total_tasks_completed DESC
        LIMIT 50
      `;
    }

    const result = await db.query(query, [from, to]);

    return res.json({
      period: { from, to },
      groupBy,
      metrics: result.rows
    });

  } catch (error) {
    return next(error);
  }
});

// Get task metrics
metricsRoutes.get('/tasks', async (req, res, next) => {
  try {
    const {
      from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      to = new Date().toISOString(),
      groupBy = 'type'
    } = req.query;

    let query: string;
    if (groupBy === 'type') {
      query = `
        SELECT 
          type,
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
          AVG(duration) FILTER (WHERE duration IS NOT NULL) as avg_duration,
          MAX(duration) FILTER (WHERE duration IS NOT NULL) as max_duration,
          MIN(duration) FILTER (WHERE duration IS NOT NULL) as min_duration,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration) FILTER (WHERE duration IS NOT NULL) as median_duration,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) FILTER (WHERE duration IS NOT NULL) as p95_duration
        FROM tasks
        WHERE start_time >= $1 AND start_time <= $2
        GROUP BY type
        ORDER BY total_count DESC
      `;
    } else if (groupBy === 'status') {
      query = `
        SELECT 
          status,
          COUNT(*) as count,
          AVG(duration) FILTER (WHERE duration IS NOT NULL) as avg_duration
        FROM tasks
        WHERE start_time >= $1 AND start_time <= $2
        GROUP BY status
        ORDER BY count DESC
      `;
    } else if (groupBy === 'priority') {
      query = `
        SELECT 
          priority,
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
          AVG(duration) FILTER (WHERE duration IS NOT NULL) as avg_duration
        FROM tasks
        WHERE start_time >= $1 AND start_time <= $2
        GROUP BY priority
        ORDER BY 
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END
      `;
    } else {
      return res.status(400).json({
        error: { message: 'Invalid groupBy parameter' }
      });
    }

    const result = await db.query(query, [from, to]);

    return res.json({
      period: { from, to },
      groupBy,
      metrics: result.rows
    });

  } catch (error) {
    return next(error);
  }
});

// Get system metrics
metricsRoutes.get('/system', async (req, res, next) => {
  try {
    // Get current system state
    const [agentCount, taskCount, dbSize] = await Promise.all([
      db.query('SELECT COUNT(*) as count, status FROM agents GROUP BY status'),
      db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('pending', 'queued', 'running')) as active
        FROM tasks
      `),
      db.query(`
        SELECT 
          pg_database_size(current_database()) as db_size,
          pg_size_pretty(pg_database_size(current_database())) as db_size_pretty
      `)
    ]);

    // Get recent activity
    const recentActivity = await db.query(`
      SELECT 
        DATE_TRUNC('hour', timestamp) as hour,
        COUNT(DISTINCT agent_id) as active_agents,
        SUM(tasks_completed) as tasks_completed,
        SUM(tasks_failed) as tasks_failed
      FROM agent_metrics
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
      GROUP BY hour
      ORDER BY hour DESC
      LIMIT 24
    `);

    return res.json({
      system: {
        agents: agentCount.rows.reduce((acc: any, row: any) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        tasks: {
          total: parseInt(taskCount.rows[0].total),
          active: parseInt(taskCount.rows[0].active)
        },
        database: {
          size: parseInt(dbSize.rows[0].db_size),
          sizePretty: dbSize.rows[0].db_size_pretty
        }
      },
      recentActivity: recentActivity.rows
    });

  } catch (error) {
    return next(error);
  }
});

// Get custom metric values
metricsRoutes.get('/custom/:metric', async (req, res, next) => {
  try {
    const { metric } = req.params;
    const {
      from = new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      to = new Date().toISOString(),
      agentId
    } = req.query;

    let query = `
      SELECT 
        agent_id,
        timestamp,
        custom_metrics->$1 as value
      FROM agent_metrics
      WHERE timestamp >= $2 AND timestamp <= $3
        AND custom_metrics ? $1
    `;
    const params = [metric, from, to];

    if (agentId) {
      query += ' AND agent_id = $4';
      params.push(agentId as string);
    }

    query += ' ORDER BY timestamp ASC';

    const result = await db.query(query, params);

    return res.json({
      metric,
      period: { from, to },
      agentId,
      values: result.rows
    });

  } catch (error) {
    return next(error);
  }
});