// Notification Manager - Handle alerts and notifications for agent activities
import { Database } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';
import { logger } from '../../../../../../utils/logger';

export class NotificationManager {
  constructor() {
    this.db = new Database();
    this.subscriptions = new Map();
    this.webhooks = new Map();
    this.initializeDatabase();
  }

  async initializeDatabase() {
    await this.db.initialize();
    
    // Create tables for notification management
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS notification_channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        configuration TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS notification_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        conditions TEXT NOT NULL,
        actions TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_triggered DATETIME,
        trigger_count INTEGER DEFAULT 0
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS sent_notifications (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        event_data TEXT NOT NULL,
        status TEXT DEFAULT 'sent',
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        error_message TEXT,
        FOREIGN KEY (rule_id) REFERENCES notification_rules(id),
        FOREIGN KEY (channel_id) REFERENCES notification_channels(id)
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS alert_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject_template TEXT NOT NULL,
        body_template TEXT NOT NULL,
        format TEXT DEFAULT 'text',
        variables TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Add notification channel
   */
  async addChannel(channelData) {
    const {
      name,
      type, // email, slack, webhook, console
      configuration
    } = channelData;

    const channelId = uuid();
    
    await this.db.query(`
      INSERT INTO notification_channels 
      (id, name, type, configuration)
      VALUES (?, ?, ?, ?)
    `, [
      channelId,
      name,
      type,
      JSON.stringify(configuration)
    ]);

    logger.info(`Notification channel added: ${name} (${type})`);
    
    return {
      id: channelId,
      name,
      type,
      configuration
    };
  }

  /**
   * Add notification rule
   */
  async addRule(ruleData) {
    const {
      name,
      description,
      conditions, // { event: 'change', impact: 'high', agent: 'specific-agent' }
      actions, // [{ channel: 'channel-id', template: 'template-id' }]
      priority = 'medium'
    } = ruleData;

    const ruleId = uuid();
    
    await this.db.query(`
      INSERT INTO notification_rules 
      (id, name, description, conditions, actions, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      ruleId,
      name,
      description,
      JSON.stringify(conditions),
      JSON.stringify(actions),
      priority
    ]);

    logger.info(`Notification rule added: ${name}`);
    
    return {
      id: ruleId,
      name,
      description,
      conditions,
      actions,
      priority
    };
  }

  /**
   * Send alert
   */
  async sendAlert(alertData) {
    const {
      type, // high_impact_change, task_blocked, agent_error, etc.
      projectPath,
      agentId,
      message,
      metadata = {},
      priority = 'medium'
    } = alertData;

    // Find matching rules
    const matchingRules = await this.findMatchingRules({
      event: type,
      projectPath,
      agentId,
      priority,
      ...metadata
    });

    const results = [];

    for (const rule of matchingRules) {
      try {
        const actions = JSON.parse(rule.actions);
        
        for (const action of actions) {
          const result = await this.executeAction(action, {
            type,
            message,
            metadata,
            agentId,
            projectPath,
            priority,
            rule: rule.name,
            timestamp: new Date().toISOString()
          });
          
          results.push(result);
        }

        // Update rule statistics
        await this.updateRuleStats(rule.id);
        
      } catch (error) {
        logger.error(`Failed to execute rule ${rule.name}:`, error);
        results.push({
          ruleId: rule.id,
          status: 'error',
          error: error.message
        });
      }
    }

    logger.info(`Alert sent: ${type} - ${results.length} notifications processed`);
    
    return {
      type,
      message,
      processedRules: results.length,
      results
    };
  }

  /**
   * Find matching notification rules
   */
  async findMatchingRules(eventData) {
    const rules = await this.db.query(`
      SELECT * FROM notification_rules 
      WHERE enabled = 1
      ORDER BY priority DESC
    `);

    const matching = [];

    for (const rule of rules) {
      const conditions = JSON.parse(rule.conditions);
      
      if (this.matchesConditions(eventData, conditions)) {
        matching.push(rule);
      }
    }

    return matching;
  }

  /**
   * Check if event matches rule conditions
   */
  matchesConditions(eventData, conditions) {
    for (const [key, value] of Object.entries(conditions)) {
      if (eventData[key] === undefined) {
        continue; // Skip undefined fields
      }

      if (Array.isArray(value)) {
        if (!value.includes(eventData[key])) {
          return false;
        }
      } else if (typeof value === 'string' && value.includes('*')) {
        // Wildcard matching
        const pattern = new RegExp(value.replace(/\*/g, '.*'));
        if (!pattern.test(eventData[key])) {
          return false;
        }
      } else if (eventData[key] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute notification action
   */
  async executeAction(action, eventData) {
    const { channel: channelId, template: templateId, immediate = true } = action;
    
    // Get channel configuration
    const [channel] = await this.db.query(`
      SELECT * FROM notification_channels 
      WHERE id = ? AND enabled = 1
    `, [channelId]);

    if (!channel) {
      throw new Error(`Channel not found or disabled: ${channelId}`);
    }

    // Prepare message
    let message = eventData.message;
    let subject = `Alert: ${eventData.type}`;

    if (templateId) {
      const template = await this.getTemplate(templateId);
      if (template) {
        subject = this.renderTemplate(template.subject_template, eventData);
        message = this.renderTemplate(template.body_template, eventData);
      }
    }

    // Send notification based on channel type
    const config = JSON.parse(channel.configuration);
    let result;

    switch (channel.type) {
      case 'email':
        result = await this.sendEmail(config, subject, message, eventData);
        break;
      case 'slack':
        result = await this.sendSlack(config, subject, message, eventData);
        break;
      case 'webhook':
        result = await this.sendWebhook(config, { subject, message, ...eventData });
        break;
      case 'console':
        result = this.sendConsole(subject, message, eventData);
        break;
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`);
    }

    // Record notification
    const notificationId = uuid();
    await this.db.query(`
      INSERT INTO sent_notifications 
      (id, rule_id, channel_id, event_data, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      notificationId,
      action.ruleId || 'manual',
      channelId,
      JSON.stringify(eventData),
      result.status,
      result.error || null
    ]);

    // Update channel last used
    await this.db.query(`
      UPDATE notification_channels 
      SET last_used = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [channelId]);

    return {
      notificationId,
      channelId,
      channelName: channel.name,
      channelType: channel.type,
      ...result
    };
  }

  /**
   * Send email notification
   */
  async sendEmail(config, subject, message, eventData) {
    // This would require an email service like nodemailer
    // For now, return a mock result
    logger.info(`EMAIL: ${subject} -> ${config.to || 'default@example.com'}`);
    logger.info(`Content: ${message}`);
    
    return {
      status: 'sent',
      method: 'email',
      recipient: config.to || 'default@example.com'
    };
  }

  /**
   * Send Slack notification
   */
  async sendSlack(config, subject, message, eventData) {
    try {
      // This would require slack webhook integration
      const payload = {
        text: subject,
        attachments: [{
          color: this.getSlackColor(eventData.priority),
          title: subject,
          text: message,
          fields: [
            {
              title: 'Agent',
              value: eventData.agentId || 'N/A',
              short: true
            },
            {
              title: 'Project',
              value: eventData.projectPath || 'N/A',
              short: true
            },
            {
              title: 'Timestamp',
              value: eventData.timestamp,
              short: true
            }
          ]
        }]
      };

      logger.info(`SLACK: ${subject} -> ${config.channel || '#alerts'}`);
      logger.info(`Payload: ${JSON.stringify(payload, null, 2)}`);
      
      return {
        status: 'sent',
        method: 'slack',
        channel: config.channel || '#alerts'
      };
      
    } catch (error) {
      return {
        status: 'error',
        method: 'slack',
        error: error.message
      };
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhook(config, data) {
    try {
      // This would require HTTP client like axios
      logger.info(`WEBHOOK: ${config.url}`);
      logger.info(`Data: ${JSON.stringify(data, null, 2)}`);
      
      return {
        status: 'sent',
        method: 'webhook',
        url: config.url
      };
      
    } catch (error) {
      return {
        status: 'error',
        method: 'webhook',
        error: error.message
      };
    }
  }

  /**
   * Send console notification
   */
  sendConsole(subject, message, eventData) {
    const priority = eventData.priority || 'medium';
    const color = this.getConsoleColor(priority);
    
    logger.info(`\n🔔 ${color}${subject}\x1b[0m`);
    logger.info(`📝 ${message}`);
    logger.info(`🤖 Agent: ${eventData.agentId || 'N/A'}`);
    logger.info(`📁 Project: ${eventData.projectPath || 'N/A'}`);
    logger.info(`⏰ Time: ${eventData.timestamp}\n`);
    
    return {
      status: 'sent',
      method: 'console'
    };
  }

  /**
   * Get Slack color based on priority
   */
  getSlackColor(priority) {
    const colors = {
      'critical': 'danger',
      'high': 'warning',
      'medium': 'good',
      'low': '#36a64f'
    };
    return colors[priority] || 'good';
  }

  /**
   * Get console color based on priority
   */
  getConsoleColor(priority) {
    const colors = {
      'critical': '\x1b[91m', // Bright red
      'high': '\x1b[93m',     // Bright yellow
      'medium': '\x1b[94m',   // Bright blue
      'low': '\x1b[92m'       // Bright green
    };
    return colors[priority] || '\x1b[94m';
  }

  /**
   * Render template with variables
   */
  renderTemplate(template, data) {
    let result = template;
    
    // Replace variables
    for (const [key, value] of Object.entries(data)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(placeholder, value || 'N/A');
    }

    // Replace common functions
    result = result.replace(/{{now}}/g, new Date().toISOString());
    result = result.replace(/{{date}}/g, new Date().toLocaleDateString());
    result = result.replace(/{{time}}/g, new Date().toLocaleTimeString());
    
    return result;
  }

  /**
   * Create alert template
   */
  async createTemplate(templateData) {
    const {
      name,
      subjectTemplate,
      bodyTemplate,
      format = 'text',
      variables = []
    } = templateData;

    const templateId = uuid();
    
    await this.db.query(`
      INSERT INTO alert_templates 
      (id, name, subject_template, body_template, format, variables)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      templateId,
      name,
      subjectTemplate,
      bodyTemplate,
      format,
      JSON.stringify(variables)
    ]);

    logger.info(`Alert template created: ${name}`);
    
    return {
      id: templateId,
      name,
      subjectTemplate,
      bodyTemplate,
      format,
      variables
    };
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId) {
    const [template] = await this.db.query(`
      SELECT * FROM alert_templates 
      WHERE id = ?
    `, [templateId]);

    if (!template) {
      return null;
    }

    return {
      ...template,
      variables: JSON.parse(template.variables || '[]')
    };
  }

  /**
   * Update rule statistics
   */
  async updateRuleStats(ruleId) {
    await this.db.query(`
      UPDATE notification_rules 
      SET last_triggered = CURRENT_TIMESTAMP,
          trigger_count = trigger_count + 1
      WHERE id = ?
    `, [ruleId]);
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(limit = 50, channelId = null) {
    let query = `
      SELECT 
        sn.*,
        nr.name as rule_name,
        nc.name as channel_name,
        nc.type as channel_type
      FROM sent_notifications sn
      LEFT JOIN notification_rules nr ON sn.rule_id = nr.id
      LEFT JOIN notification_channels nc ON sn.channel_id = nc.id
    `;
    
    let params = [];
    
    if (channelId) {
      query += ' WHERE sn.channel_id = ?';
      params.push(channelId);
    }
    
    query += ' ORDER BY sn.sent_at DESC LIMIT ?';
    params.push(limit);

    const notifications = await this.db.query(query, params);
    
    return notifications.map(notification => ({
      ...notification,
      event_data: JSON.parse(notification.event_data || '{}')
    }));
  }

  /**
   * Get channel statistics
   */
  async getChannelStats() {
    const stats = await this.db.query(`
      SELECT 
        nc.id,
        nc.name,
        nc.type,
        nc.enabled,
        COUNT(sn.id) as total_notifications,
        MAX(sn.sent_at) as last_notification
      FROM notification_channels nc
      LEFT JOIN sent_notifications sn ON nc.id = sn.channel_id
      GROUP BY nc.id
      ORDER BY total_notifications DESC
    `);

    return stats;
  }

  /**
   * Test notification channel
   */
  async testChannel(channelId) {
    const testData = {
      type: 'test',
      message: 'This is a test notification from Claude Agent Tracker',
      agentId: 'test-agent',
      projectPath: 'test-project',
      priority: 'low',
      timestamp: new Date().toISOString()
    };

    return await this.executeAction(
      { channel: channelId, immediate: true },
      testData
    );
  }

  /**
   * Subscribe to real-time notifications
   */
  subscribe(subscriptionId, callback) {
    this.subscriptions.set(subscriptionId, callback);
    return subscriptionId;
  }

  /**
   * Unsubscribe from notifications
   */
  unsubscribe(subscriptionId) {
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Broadcast to subscribers
   */
  broadcast(event) {
    for (const [id, callback] of this.subscriptions.entries()) {
      try {
        callback(event);
      } catch (error) {
        logger.error(`Error in subscription ${id}:`, error);
      }
    }
  }

  /**
   * Setup default notification rules
   */
  async setupDefaults() {
    // High impact changes
    await this.addRule({
      name: 'High Impact Changes',
      description: 'Alert on high and critical impact code changes',
      conditions: {
        event: 'track_code_changes',
        impact: ['high', 'critical']
      },
      actions: [
        { channel: 'console' }
      ],
      priority: 'high'
    });

    // Task failures
    await this.addRule({
      name: 'Task Failures',
      description: 'Alert when tasks are blocked or fail',
      conditions: {
        event: 'update_task_status',
        status: ['blocked', 'failed']
      },
      actions: [
        { channel: 'console' }
      ],
      priority: 'medium'
    });

    // Agent errors
    await this.addRule({
      name: 'Agent Errors',
      description: 'Alert on agent errors or exceptions',
      conditions: {
        event: '*error*'
      },
      actions: [
        { channel: 'console' }
      ],
      priority: 'critical'
    });

    logger.info('Default notification rules created');
  }
}