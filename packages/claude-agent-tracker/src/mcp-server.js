// Claude Agent Tracker MCP Server
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgentTracker } from './core/agent-tracker.js';
import { ChangeTracker } from './core/change-tracker.js';
import { ReportGenerator } from './core/report-generator.js';
import { NotificationManager } from './core/notification-manager.js';
import { logger } from './utils/logger.js';

/**
 * Claude Agent Tracker MCP Server
 * Internal server for tracking AI agent activities, changes, and reporting
 */
class ClaudeAgentTrackerServer {
  constructor() {
    this.server = new Server(
      {
        name: 'claude-agent-tracker',
        version: '1.0.0',
        description: 'Track AI agent activities and generate change reports'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.agentTracker = new AgentTracker();
    this.changeTracker = new ChangeTracker();
    this.reportGenerator = new ReportGenerator();
    this.notificationManager = new NotificationManager();

    this.setupHandlers();
  }

  setupHandlers() {
    // Tool handlers
    this.server.setRequestHandler('tools/list', () => ({
      tools: [
        {
          name: 'track_agent_activity',
          description: 'Track AI agent activities and tasks',
          inputSchema: {
            type: 'object',
            properties: {
              agentId: { type: 'string' },
              activity: { type: 'string' },
              metadata: { type: 'object' },
              timestamp: { type: 'string' }
            },
            required: ['agentId', 'activity']
          }
        },
        {
          name: 'track_code_changes',
          description: 'Track and analyze code changes',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              changeType: { 
                type: 'string', 
                enum: ['create', 'modify', 'delete', 'refactor'] 
              },
              files: { 
                type: 'array', 
                items: { type: 'string' } 
              },
              impact: { 
                type: 'string', 
                enum: ['low', 'medium', 'high', 'critical'] 
              },
              agentId: { type: 'string' }
            },
            required: ['projectPath', 'changeType', 'files']
          }
        },
        {
          name: 'generate_change_report',
          description: 'Generate comprehensive change reports',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              timeframe: { 
                type: 'string', 
                enum: ['last_hour', 'last_day', 'last_week', 'last_month', 'custom'] 
              },
              format: { 
                type: 'string', 
                enum: ['json', 'markdown', 'html', 'pdf'] 
              },
              includeMetrics: { type: 'boolean' },
              customStart: { type: 'string' },
              customEnd: { type: 'string' }
            },
            required: ['projectPath', 'timeframe', 'format']
          }
        },
        {
          name: 'get_agent_metrics',
          description: 'Get performance metrics for AI agents',
          inputSchema: {
            type: 'object',
            properties: {
              agentId: { type: 'string' },
              metric: { 
                type: 'string', 
                enum: ['productivity', 'accuracy', 'efficiency', 'collaboration', 'all'] 
              },
              timeframe: { type: 'string' }
            }
          }
        },
        {
          name: 'setup_monitoring',
          description: 'Setup continuous monitoring for projects',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              watchPatterns: { 
                type: 'array', 
                items: { type: 'string' } 
              },
              notifications: {
                type: 'object',
                properties: {
                  email: { type: 'boolean' },
                  slack: { type: 'boolean' },
                  webhook: { type: 'string' }
                }
              },
              thresholds: {
                type: 'object',
                properties: {
                  codeChurn: { type: 'number' },
                  errorRate: { type: 'number' },
                  testCoverage: { type: 'number' }
                }
              }
            },
            required: ['projectPath']
          }
        },
        {
          name: 'analyze_impact',
          description: 'Analyze impact of proposed or completed changes',
          inputSchema: {
            type: 'object',
            properties: {
              changes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    file: { type: 'string' },
                    changeType: { type: 'string' },
                    linesAdded: { type: 'number' },
                    linesDeleted: { type: 'number' }
                  }
                }
              },
              projectPath: { type: 'string' },
              analysisType: { 
                type: 'string', 
                enum: ['risk', 'complexity', 'dependencies', 'security', 'performance'] 
              }
            },
            required: ['changes', 'projectPath', 'analysisType']
          }
        },
        {
          name: 'create_task_plan',
          description: 'Create and track task execution plans',
          inputSchema: {
            type: 'object',
            properties: {
              taskDescription: { type: 'string' },
              priority: { 
                type: 'string', 
                enum: ['low', 'medium', 'high', 'critical'] 
              },
              estimatedDuration: { type: 'number' },
              dependencies: { 
                type: 'array', 
                items: { type: 'string' } 
              },
              assignedAgent: { type: 'string' },
              milestones: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    deadline: { type: 'string' }
                  }
                }
              }
            },
            required: ['taskDescription', 'priority']
          }
        },
        {
          name: 'update_task_status',
          description: 'Update task status and progress',
          inputSchema: {
            type: 'object',
            properties: {
              taskId: { type: 'string' },
              status: { 
                type: 'string', 
                enum: ['pending', 'in_progress', 'blocked', 'completed', 'cancelled'] 
              },
              progress: { type: 'number', minimum: 0, maximum: 100 },
              notes: { type: 'string' },
              blockers: { 
                type: 'array', 
                items: { type: 'string' } 
              },
              completedMilestones: { 
                type: 'array', 
                items: { type: 'string' } 
              }
            },
            required: ['taskId', 'status']
          }
        }
      ]
    }));

    // Resource handlers
    this.server.setRequestHandler('resources/list', () => ({
      resources: [
        {
          uri: 'claude-tracker://agents',
          name: 'Active Agents',
          description: 'List of currently active AI agents'
        },
        {
          uri: 'claude-tracker://changes/recent',
          name: 'Recent Changes',
          description: 'Recent code and project changes'
        },
        {
          uri: 'claude-tracker://metrics/dashboard',
          name: 'Metrics Dashboard',
          description: 'Real-time metrics and performance data'
        },
        {
          uri: 'claude-tracker://reports/latest',
          name: 'Latest Reports',
          description: 'Most recent change and activity reports'
        },
        {
          uri: 'claude-tracker://tasks/active',
          name: 'Active Tasks',
          description: 'Currently active tasks and their status'
        }
      ]
    }));

    // Tool call handlers
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'track_agent_activity':
            return await this.handleTrackAgentActivity(args);
          
          case 'track_code_changes':
            return await this.handleTrackCodeChanges(args);
          
          case 'generate_change_report':
            return await this.handleGenerateChangeReport(args);
          
          case 'get_agent_metrics':
            return await this.handleGetAgentMetrics(args);
          
          case 'setup_monitoring':
            return await this.handleSetupMonitoring(args);
          
          case 'analyze_impact':
            return await this.handleAnalyzeImpact(args);
          
          case 'create_task_plan':
            return await this.handleCreateTaskPlan(args);
          
          case 'update_task_status':
            return await this.handleUpdateTaskStatus(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Tool call error for ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });

    // Resource read handlers
    this.server.setRequestHandler('resources/read', async (request) => {
      const { uri } = request.params;
      
      try {
        switch (uri) {
          case 'claude-tracker://agents':
            return await this.getActiveAgents();
          
          case 'claude-tracker://changes/recent':
            return await this.getRecentChanges();
          
          case 'claude-tracker://metrics/dashboard':
            return await this.getMetricsDashboard();
          
          case 'claude-tracker://reports/latest':
            return await this.getLatestReports();
          
          case 'claude-tracker://tasks/active':
            return await this.getActiveTasks();
          
          default:
            throw new Error(`Unknown resource: ${uri}`);
        }
      } catch (error) {
        logger.error(`Resource read error for ${uri}:`, error);
        throw error;
      }
    });
  }

  // Tool handlers
  async handleTrackAgentActivity(args) {
    const { agentId, activity, metadata = {}, timestamp } = args;
    
    const result = await this.agentTracker.trackActivity({
      agentId,
      activity,
      metadata: {
        ...metadata,
        source: 'mcp-call',
        timestamp: timestamp || new Date().toISOString()
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: `Activity tracked for agent ${agentId}: ${activity}`
        }
      ]
    };
  }

  async handleTrackCodeChanges(args) {
    const { projectPath, changeType, files, impact = 'medium', agentId } = args;
    
    const changes = await this.changeTracker.trackChanges({
      projectPath,
      changeType,
      files,
      impact,
      agentId,
      timestamp: new Date().toISOString()
    });

    // Trigger notifications if impact is high/critical
    if (impact === 'high' || impact === 'critical') {
      await this.notificationManager.sendAlert({
        type: 'high_impact_change',
        projectPath,
        changeType,
        files,
        impact,
        agentId
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: `Tracked ${changeType} changes in ${files.length} files with ${impact} impact`
        },
        {
          type: 'text',
          text: JSON.stringify(changes, null, 2)
        }
      ]
    };
  }

  async handleGenerateChangeReport(args) {
    const { 
      projectPath, 
      timeframe, 
      format, 
      includeMetrics = true,
      customStart,
      customEnd 
    } = args;
    
    const reportOptions = {
      projectPath,
      timeframe,
      format,
      includeMetrics,
      customTimeframe: timeframe === 'custom' ? {
        start: customStart,
        end: customEnd
      } : null
    };

    const report = await this.reportGenerator.generateReport(reportOptions);
    
    return {
      content: [
        {
          type: 'text',
          text: `Change report generated for ${projectPath}`
        },
        {
          type: 'text',
          text: report.summary
        }
      ]
    };
  }

  async handleGetAgentMetrics(args) {
    const { agentId, metric = 'all', timeframe = 'last_day' } = args;
    
    const metrics = await this.agentTracker.getMetrics({
      agentId,
      metric,
      timeframe
    });

    return {
      content: [
        {
          type: 'text',
          text: `Agent metrics for ${agentId || 'all agents'}`
        },
        {
          type: 'text',
          text: JSON.stringify(metrics, null, 2)
        }
      ]
    };
  }

  async handleSetupMonitoring(args) {
    const { 
      projectPath, 
      watchPatterns = ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
      notifications = {},
      thresholds = {}
    } = args;

    const monitoringId = await this.changeTracker.setupMonitoring({
      projectPath,
      watchPatterns,
      notifications,
      thresholds
    });

    return {
      content: [
        {
          type: 'text',
          text: `Monitoring setup for ${projectPath} with ID: ${monitoringId}`
        }
      ]
    };
  }

  async handleAnalyzeImpact(args) {
    const { changes, projectPath, analysisType } = args;
    
    const analysis = await this.changeTracker.analyzeImpact({
      changes,
      projectPath,
      analysisType
    });

    return {
      content: [
        {
          type: 'text',
          text: `Impact analysis (${analysisType}) completed`
        },
        {
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }
      ]
    };
  }

  async handleCreateTaskPlan(args) {
    const {
      taskDescription,
      priority,
      estimatedDuration,
      dependencies = [],
      assignedAgent,
      milestones = []
    } = args;

    const taskPlan = await this.agentTracker.createTaskPlan({
      description: taskDescription,
      priority,
      estimatedDuration,
      dependencies,
      assignedAgent,
      milestones,
      createdAt: new Date().toISOString()
    });

    return {
      content: [
        {
          type: 'text',
          text: `Task plan created with ID: ${taskPlan.id}`
        },
        {
          type: 'text',
          text: JSON.stringify(taskPlan, null, 2)
        }
      ]
    };
  }

  async handleUpdateTaskStatus(args) {
    const {
      taskId,
      status,
      progress,
      notes,
      blockers = [],
      completedMilestones = []
    } = args;

    const updatedTask = await this.agentTracker.updateTaskStatus({
      taskId,
      status,
      progress,
      notes,
      blockers,
      completedMilestones,
      updatedAt: new Date().toISOString()
    });

    return {
      content: [
        {
          type: 'text',
          text: `Task ${taskId} updated to status: ${status}`
        },
        {
          type: 'text',
          text: JSON.stringify(updatedTask, null, 2)
        }
      ]
    };
  }

  // Resource handlers
  async getActiveAgents() {
    const agents = await this.agentTracker.getActiveAgents();
    
    return {
      contents: [
        {
          uri: 'claude-tracker://agents',
          mimeType: 'application/json',
          text: JSON.stringify(agents, null, 2)
        }
      ]
    };
  }

  async getRecentChanges() {
    const changes = await this.changeTracker.getRecentChanges();
    
    return {
      contents: [
        {
          uri: 'claude-tracker://changes/recent',
          mimeType: 'application/json',
          text: JSON.stringify(changes, null, 2)
        }
      ]
    };
  }

  async getMetricsDashboard() {
    const dashboard = await this.agentTracker.getMetricsDashboard();
    
    return {
      contents: [
        {
          uri: 'claude-tracker://metrics/dashboard',
          mimeType: 'application/json',
          text: JSON.stringify(dashboard, null, 2)
        }
      ]
    };
  }

  async getLatestReports() {
    const reports = await this.reportGenerator.getLatestReports();
    
    return {
      contents: [
        {
          uri: 'claude-tracker://reports/latest',
          mimeType: 'application/json',
          text: JSON.stringify(reports, null, 2)
        }
      ]
    };
  }

  async getActiveTasks() {
    const tasks = await this.agentTracker.getActiveTasks();
    
    return {
      contents: [
        {
          uri: 'claude-tracker://tasks/active',
          mimeType: 'application/json',
          text: JSON.stringify(tasks, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Claude Agent Tracker MCP Server running');
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ClaudeAgentTrackerServer();
  server.run().catch((error) => {
    logger.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}

export { ClaudeAgentTrackerServer };