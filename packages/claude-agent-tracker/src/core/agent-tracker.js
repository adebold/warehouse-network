// Agent Tracker - Core module for tracking AI agent activities
import { Database } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';

export class AgentTracker {
  constructor() {
    this.db = new Database();
    this.activeAgents = new Map();
    this.taskPlans = new Map();
    this.initializeDatabase();
  }

  async initializeDatabase() {
    await this.db.initialize();
    
    // Create tables for agent tracking
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS agent_activities (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        activity TEXT NOT NULL,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        duration INTEGER,
        status TEXT DEFAULT 'active',
        project_path TEXT,
        tags TEXT
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS agent_metrics (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        context TEXT
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS task_plans (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        assigned_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        estimated_duration INTEGER,
        actual_duration INTEGER,
        progress INTEGER DEFAULT 0,
        dependencies TEXT,
        milestones TEXT,
        notes TEXT
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
        session_end DATETIME,
        total_activities INTEGER DEFAULT 0,
        total_changes INTEGER DEFAULT 0,
        efficiency_score REAL,
        collaboration_score REAL
      )
    `);
  }

  /**
   * Track agent activity
   */
  async trackActivity(activityData) {
    const {
      agentId,
      activity,
      metadata = {},
      timestamp,
      duration,
      projectPath,
      tags = []
    } = activityData;

    const activityId = uuid();
    const activityRecord = {
      id: activityId,
      agent_id: agentId,
      activity,
      metadata: JSON.stringify(metadata),
      timestamp: timestamp || new Date().toISOString(),
      duration,
      project_path: projectPath,
      tags: JSON.stringify(tags)
    };

    await this.db.query(`
      INSERT INTO agent_activities 
      (id, agent_id, activity, metadata, timestamp, duration, project_path, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, Object.values(activityRecord));

    // Update active agents map
    this.updateActiveAgent(agentId, activity);

    // Calculate and store metrics
    await this.updateAgentMetrics(agentId, activity, metadata);

    logger.info(`Activity tracked: ${agentId} - ${activity}`);
    
    return {
      activityId,
      ...activityRecord
    };
  }

  /**
   * Update active agent information
   */
  updateActiveAgent(agentId, activity) {
    const agent = this.activeAgents.get(agentId) || {
      id: agentId,
      lastActivity: null,
      activitiesCount: 0,
      sessionStart: new Date(),
      currentTasks: []
    };

    agent.lastActivity = activity;
    agent.activitiesCount++;
    agent.lastSeen = new Date();

    this.activeAgents.set(agentId, agent);
  }

  /**
   * Create task plan
   */
  async createTaskPlan(taskData) {
    const taskId = uuid();
    const {
      description,
      priority,
      estimatedDuration,
      dependencies = [],
      assignedAgent,
      milestones = [],
      createdAt
    } = taskData;

    const taskPlan = {
      id: taskId,
      description,
      priority,
      status: 'pending',
      assigned_agent: assignedAgent,
      created_at: createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      estimated_duration: estimatedDuration,
      progress: 0,
      dependencies: JSON.stringify(dependencies),
      milestones: JSON.stringify(milestones)
    };

    await this.db.query(`
      INSERT INTO task_plans 
      (id, description, priority, status, assigned_agent, created_at, 
       estimated_duration, dependencies, milestones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      taskPlan.id,
      taskPlan.description,
      taskPlan.priority,
      taskPlan.status,
      taskPlan.assigned_agent,
      taskPlan.created_at,
      taskPlan.estimated_duration,
      taskPlan.dependencies,
      taskPlan.milestones
    ]);

    this.taskPlans.set(taskId, taskPlan);

    logger.info(`Task plan created: ${taskId} - ${description}`);
    
    return taskPlan;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(updateData) {
    const {
      taskId,
      status,
      progress,
      notes,
      blockers = [],
      completedMilestones = [],
      updatedAt
    } = updateData;

    const updateFields = {
      status,
      progress,
      notes,
      updated_at: updatedAt || new Date().toISOString()
    };

    // If task is completed, calculate actual duration
    if (status === 'completed') {
      const task = await this.getTaskById(taskId);
      if (task) {
        const startTime = new Date(task.created_at);
        const endTime = new Date(updateFields.updated_at);
        updateFields.actual_duration = Math.floor((endTime - startTime) / 1000);
      }
    }

    const setClause = Object.keys(updateFields)
      .map(key => `${key} = ?`)
      .join(', ');

    await this.db.query(`
      UPDATE task_plans 
      SET ${setClause}
      WHERE id = ?
    `, [...Object.values(updateFields), taskId]);

    // Log blockers and completed milestones
    if (blockers.length > 0) {
      await this.trackActivity({
        agentId: 'system',
        activity: 'task_blocked',
        metadata: { taskId, blockers },
        tags: ['task_management', 'blockers']
      });
    }

    if (completedMilestones.length > 0) {
      await this.trackActivity({
        agentId: 'system',
        activity: 'milestones_completed',
        metadata: { taskId, completedMilestones },
        tags: ['task_management', 'milestones']
      });
    }

    logger.info(`Task ${taskId} updated to status: ${status}`);
    
    const updatedTask = await this.getTaskById(taskId);
    return updatedTask;
  }

  /**
   * Get task by ID
   */
  async getTaskById(taskId) {
    const result = await this.db.query(
      'SELECT * FROM task_plans WHERE id = ?',
      [taskId]
    );
    
    return result[0] || null;
  }

  /**
   * Update agent metrics
   */
  async updateAgentMetrics(agentId, activity, metadata) {
    const metrics = this.calculateMetrics(activity, metadata);
    
    for (const [metricType, value] of Object.entries(metrics)) {
      const metricId = uuid();
      
      await this.db.query(`
        INSERT INTO agent_metrics (id, agent_id, metric_type, value, context)
        VALUES (?, ?, ?, ?, ?)
      `, [metricId, agentId, metricType, value, JSON.stringify(metadata)]);
    }
  }

  /**
   * Calculate metrics from activity
   */
  calculateMetrics(activity, metadata) {
    const metrics = {};

    // Productivity metrics
    if (activity.includes('complete') || activity.includes('finish')) {
      metrics.productivity = 1.0;
    } else if (activity.includes('start') || activity.includes('begin')) {
      metrics.productivity = 0.5;
    }

    // Efficiency metrics based on time
    if (metadata.duration) {
      const expectedDuration = metadata.expectedDuration || 3600; // 1 hour default
      metrics.efficiency = Math.min(expectedDuration / metadata.duration, 2.0);
    }

    // Accuracy metrics
    if (metadata.errorCount !== undefined) {
      metrics.accuracy = Math.max(0, 1.0 - (metadata.errorCount * 0.1));
    }

    // Collaboration metrics
    if (activity.includes('review') || activity.includes('collaborate')) {
      metrics.collaboration = 1.0;
    }

    return metrics;
  }

  /**
   * Get agent metrics
   */
  async getMetrics(options = {}) {
    const {
      agentId,
      metric = 'all',
      timeframe = 'last_day'
    } = options;

    let whereClause = '';
    let params = [];

    if (agentId) {
      whereClause += 'WHERE agent_id = ?';
      params.push(agentId);
    }

    // Add timeframe filter
    const timeFilter = this.getTimeFilter(timeframe);
    if (timeFilter) {
      whereClause += (whereClause ? ' AND ' : 'WHERE ') + timeFilter.clause;
      params.push(...timeFilter.params);
    }

    let metricFilter = '';
    if (metric !== 'all') {
      metricFilter = (whereClause ? ' AND ' : 'WHERE ') + 'metric_type = ?';
      params.push(metric);
    }

    const results = await this.db.query(`
      SELECT 
        agent_id,
        metric_type,
        AVG(value) as avg_value,
        MAX(value) as max_value,
        MIN(value) as min_value,
        COUNT(*) as count
      FROM agent_metrics 
      ${whereClause}${metricFilter}
      GROUP BY agent_id, metric_type
      ORDER BY agent_id, metric_type
    `, params);

    return this.formatMetrics(results);
  }

  /**
   * Format metrics for display
   */
  formatMetrics(results) {
    const formatted = {};

    for (const row of results) {
      const agentId = row.agent_id;
      if (!formatted[agentId]) {
        formatted[agentId] = {};
      }

      formatted[agentId][row.metric_type] = {
        average: parseFloat(row.avg_value.toFixed(3)),
        maximum: parseFloat(row.max_value.toFixed(3)),
        minimum: parseFloat(row.min_value.toFixed(3)),
        count: row.count
      };
    }

    return formatted;
  }

  /**
   * Get active agents
   */
  async getActiveAgents() {
    const activities = await this.db.query(`
      SELECT 
        agent_id,
        COUNT(*) as activity_count,
        MAX(timestamp) as last_activity,
        MIN(timestamp) as first_activity
      FROM agent_activities 
      WHERE timestamp > datetime('now', '-1 day')
      GROUP BY agent_id
      ORDER BY last_activity DESC
    `);

    return activities.map(activity => ({
      agentId: activity.agent_id,
      activityCount: activity.activity_count,
      lastActivity: activity.last_activity,
      firstActivity: activity.first_activity,
      isActive: new Date(activity.last_activity) > new Date(Date.now() - 3600000), // Active within last hour
      ...this.activeAgents.get(activity.agent_id)
    }));
  }

  /**
   * Get active tasks
   */
  async getActiveTasks() {
    const tasks = await this.db.query(`
      SELECT * FROM task_plans 
      WHERE status IN ('pending', 'in_progress', 'blocked')
      ORDER BY priority DESC, created_at ASC
    `);

    return tasks.map(task => ({
      ...task,
      dependencies: JSON.parse(task.dependencies || '[]'),
      milestones: JSON.parse(task.milestones || '[]')
    }));
  }

  /**
   * Get metrics dashboard data
   */
  async getMetricsDashboard() {
    const dashboard = {
      summary: await this.getSummaryMetrics(),
      activeAgents: await this.getActiveAgents(),
      activeTasks: await this.getActiveTasks(),
      recentActivities: await this.getRecentActivities(),
      productivity: await this.getProductivityMetrics()
    };

    return dashboard;
  }

  /**
   * Get summary metrics
   */
  async getSummaryMetrics() {
    const [totalAgents] = await this.db.query(`
      SELECT COUNT(DISTINCT agent_id) as count 
      FROM agent_activities 
      WHERE timestamp > datetime('now', '-1 day')
    `);

    const [totalActivities] = await this.db.query(`
      SELECT COUNT(*) as count 
      FROM agent_activities 
      WHERE timestamp > datetime('now', '-1 day')
    `);

    const [activeTasks] = await this.db.query(`
      SELECT COUNT(*) as count 
      FROM task_plans 
      WHERE status IN ('pending', 'in_progress')
    `);

    const [completedTasks] = await this.db.query(`
      SELECT COUNT(*) as count 
      FROM task_plans 
      WHERE status = 'completed' 
      AND updated_at > datetime('now', '-1 day')
    `);

    return {
      activeAgents: totalAgents.count,
      totalActivities: totalActivities.count,
      activeTasks: activeTasks.count,
      completedTasksToday: completedTasks.count
    };
  }

  /**
   * Get recent activities
   */
  async getRecentActivities(limit = 20) {
    const activities = await this.db.query(`
      SELECT * FROM agent_activities 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [limit]);

    return activities.map(activity => ({
      ...activity,
      metadata: JSON.parse(activity.metadata || '{}'),
      tags: JSON.parse(activity.tags || '[]')
    }));
  }

  /**
   * Get productivity metrics
   */
  async getProductivityMetrics() {
    const metrics = await this.db.query(`
      SELECT 
        DATE(timestamp) as date,
        agent_id,
        COUNT(*) as activities,
        AVG(CASE WHEN metric_type = 'productivity' THEN value END) as avg_productivity
      FROM agent_activities a
      LEFT JOIN agent_metrics m ON a.agent_id = m.agent_id 
      WHERE a.timestamp > datetime('now', '-7 days')
      GROUP BY DATE(timestamp), agent_id
      ORDER BY date DESC, avg_productivity DESC
    `);

    return metrics;
  }

  /**
   * Get time filter for SQL queries
   */
  getTimeFilter(timeframe) {
    switch (timeframe) {
      case 'last_hour':
        return {
          clause: "timestamp > datetime('now', '-1 hour')",
          params: []
        };
      case 'last_day':
        return {
          clause: "timestamp > datetime('now', '-1 day')",
          params: []
        };
      case 'last_week':
        return {
          clause: "timestamp > datetime('now', '-7 days')",
          params: []
        };
      case 'last_month':
        return {
          clause: "timestamp > datetime('now', '-30 days')",
          params: []
        };
      default:
        return null;
    }
  }
}