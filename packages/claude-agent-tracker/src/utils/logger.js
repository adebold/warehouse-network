// Logger utility with structured logging
import winston from 'winston';
import fs from 'fs-extra';
import path from 'path';

class Logger {
  constructor() {
    this.logger = null;
    this.initialize();
  }

  initialize() {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), '.claude-agent-tracker', 'logs');
    fs.ensureDirSync(logsDir);

    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    // Console format for development
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'HH:mm:ss'
      }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        return log;
      })
    );

    // Create logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { 
        service: 'claude-agent-tracker',
        pid: process.pid
      },
      transports: [
        // Error logs
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        
        // Combined logs
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 10,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),

        // Console output (only in development)
        new winston.transports.Console({
          format: consoleFormat,
          silent: process.env.NODE_ENV === 'production' && !process.env.DEBUG
        })
      ],

      // Handle uncaught exceptions and rejections
      exceptionHandlers: [
        new winston.transports.File({
          filename: path.join(logsDir, 'exceptions.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ],

      rejectionHandlers: [
        new winston.transports.File({
          filename: path.join(logsDir, 'rejections.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ]
    });
  }

  // Structured logging methods
  info(message, meta = {}) {
    this.logger.info(message, { ...meta, component: this.getCallerComponent() });
  }

  error(message, error = null, meta = {}) {
    const logData = { ...meta, component: this.getCallerComponent() };
    
    if (error) {
      if (error instanceof Error) {
        logData.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
      } else {
        logData.error = error;
      }
    }

    this.logger.error(message, logData);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, { ...meta, component: this.getCallerComponent() });
  }

  debug(message, meta = {}) {
    this.logger.debug(message, { ...meta, component: this.getCallerComponent() });
  }

  verbose(message, meta = {}) {
    this.logger.verbose(message, { ...meta, component: this.getCallerComponent() });
  }

  // Agent-specific logging methods
  agentActivity(agentId, activity, metadata = {}) {
    this.info('Agent activity', {
      agentId,
      activity,
      metadata,
      category: 'agent-activity'
    });
  }

  codeChange(projectPath, filePath, changeType, metadata = {}) {
    this.info('Code change detected', {
      projectPath,
      filePath,
      changeType,
      metadata,
      category: 'code-change'
    });
  }

  taskUpdate(taskId, status, metadata = {}) {
    this.info('Task status update', {
      taskId,
      status,
      metadata,
      category: 'task-update'
    });
  }

  notification(type, channel, message, metadata = {}) {
    this.info('Notification sent', {
      notificationType: type,
      channel,
      message,
      metadata,
      category: 'notification'
    });
  }

  mcpRequest(toolName, parameters, duration, success = true) {
    const level = success ? 'info' : 'error';
    this.logger.log(level, 'MCP tool call', {
      toolName,
      parameters: this.sanitizeParameters(parameters),
      duration,
      success,
      category: 'mcp-request'
    });
  }

  performance(operation, duration, metadata = {}) {
    this.info('Performance metric', {
      operation,
      duration,
      metadata,
      category: 'performance'
    });
  }

  security(event, details, severity = 'medium') {
    const level = severity === 'high' ? 'error' : 'warn';
    this.logger.log(level, 'Security event', {
      securityEvent: event,
      details,
      severity,
      category: 'security'
    });
  }

  // Utility methods
  sanitizeParameters(params) {
    // Remove sensitive data from parameters
    const sensitive = ['password', 'token', 'key', 'secret', 'auth'];
    const sanitized = { ...params };
    
    for (const key in sanitized) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  getCallerComponent() {
    const stack = new Error().stack;
    const lines = stack.split('\n');
    
    // Find the first line that's not from this logger file
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('logger.js') && !line.includes('Logger')) {
        const match = line.match(/\/([^/]+)\.js:\d+:\d+/);
        if (match) {
          return match[1];
        }
      }
    }
    
    return 'unknown';
  }

  // Log analysis methods
  async getLogStats(timeframe = '24h') {
    const logsDir = path.join(process.cwd(), '.claude-agent-tracker', 'logs');
    const logFile = path.join(logsDir, 'combined.log');
    
    if (!await fs.pathExists(logFile)) {
      return { error: 'Log file not found' };
    }

    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const now = new Date();
      const timeLimit = this.parseTimeframe(timeframe);
      const cutoffTime = new Date(now.getTime() - timeLimit);

      const stats = {
        total: 0,
        byLevel: {},
        byCategory: {},
        byComponent: {},
        recentErrors: [],
        timeframe
      };

      for (const line of lines) {
        try {
          const log = JSON.parse(line);
          const logTime = new Date(log.timestamp);
          
          if (logTime < cutoffTime) continue;
          
          stats.total++;
          
          // Count by level
          stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
          
          // Count by category
          if (log.category) {
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
          }
          
          // Count by component
          if (log.component) {
            stats.byComponent[log.component] = (stats.byComponent[log.component] || 0) + 1;
          }
          
          // Collect recent errors
          if (log.level === 'error' && stats.recentErrors.length < 10) {
            stats.recentErrors.push({
              timestamp: log.timestamp,
              message: log.message,
              component: log.component,
              error: log.error
            });
          }
          
        } catch (parseError) {
          // Skip malformed log entries
          continue;
        }
      }

      return stats;
      
    } catch (error) {
      return { error: error.message };
    }
  }

  parseTimeframe(timeframe) {
    const units = {
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'w': 7 * 24 * 60 * 60 * 1000
    };

    const match = timeframe.match(/^(\d+)([hdw])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default to 24 hours
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }

  // Clean up old logs
  async cleanup(daysToKeep = 7) {
    const logsDir = path.join(process.cwd(), '.claude-agent-tracker', 'logs');
    
    try {
      const files = await fs.readdir(logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.remove(filePath);
          deletedCount++;
          this.info(`Deleted old log file: ${file}`);
        }
      }

      this.info(`Log cleanup completed: ${deletedCount} files deleted`);
      return { deletedCount };
      
    } catch (error) {
      this.error('Log cleanup failed', error);
      throw error;
    }
  }

  // Export logs for analysis
  async exportLogs(outputPath, format = 'json', timeframe = '24h') {
    const logsDir = path.join(process.cwd(), '.claude-agent-tracker', 'logs');
    const logFile = path.join(logsDir, 'combined.log');
    
    if (!await fs.pathExists(logFile)) {
      throw new Error('Log file not found');
    }

    const content = await fs.readFile(logFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    const now = new Date();
    const timeLimit = this.parseTimeframe(timeframe);
    const cutoffTime = new Date(now.getTime() - timeLimit);

    const logs = [];
    for (const line of lines) {
      try {
        const log = JSON.parse(line);
        const logTime = new Date(log.timestamp);
        
        if (logTime >= cutoffTime) {
          logs.push(log);
        }
      } catch (parseError) {
        continue;
      }
    }

    if (format === 'json') {
      await fs.writeJSON(outputPath, logs, { spaces: 2 });
    } else if (format === 'csv') {
      const csvContent = this.logsToCSV(logs);
      await fs.writeFile(outputPath, csvContent, 'utf-8');
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    this.info(`Exported ${logs.length} logs to ${outputPath}`);
    return { exported: logs.length, path: outputPath };
  }

  logsToCSV(logs) {
    if (logs.length === 0) return '';
    
    const headers = ['timestamp', 'level', 'message', 'component', 'category'];
    const rows = logs.map(log => [
      log.timestamp,
      log.level,
      `"${log.message.replace(/"/g, '""')}"`,
      log.component || '',
      log.category || ''
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }

  // Stream logs in real-time (for monitoring dashboards)
  createLogStream(callback, filters = {}) {
    const { level, component, category } = filters;
    
    const originalLog = this.logger.log.bind(this.logger);
    this.logger.log = function(logLevel, message, meta) {
      // Apply filters
      if (level && logLevel !== level) {
        return originalLog(logLevel, message, meta);
      }
      
      if (component && meta.component !== component) {
        return originalLog(logLevel, message, meta);
      }
      
      if (category && meta.category !== category) {
        return originalLog(logLevel, message, meta);
      }

      // Send to callback
      callback({
        level: logLevel,
        message,
        timestamp: new Date().toISOString(),
        ...meta
      });

      return originalLog(logLevel, message, meta);
    };

    // Return function to stop streaming
    return () => {
      this.logger.log = originalLog;
    };
  }

  // Set log level dynamically
  setLevel(level) {
    this.logger.level = level;
    this.info(`Log level changed to: ${level}`);
  }

  // Get current configuration
  getConfig() {
    return {
      level: this.logger.level,
      transports: this.logger.transports.map(t => ({
        name: t.constructor.name,
        level: t.level,
        filename: t.filename
      }))
    };
  }
}

// Create singleton instance
const logger = new Logger();

export { logger };
export default logger;