/**
 * Workflow Engine - Handles automated notification workflows with triggers and conditions
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from 'winston';
import { CronJob } from 'cron';
import {
  NotificationRequest,
  NotificationChannel,
  NotificationCategory,
  NotificationPriority,
  NotificationRecipient
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export interface WorkflowTrigger {
  id: string;
  name: string;
  type: 'event' | 'schedule' | 'condition';

  // Event trigger
  eventType?: string;
  eventFilters?: Record<string, any>;

  // Schedule trigger
  cronExpression?: string;

  // Condition trigger
  condition?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'exists';
    value: any;
  };
}

export interface WorkflowCondition {
  id: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'exists' | 'in' | 'not_in';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface WorkflowAction {
  id: string;
  type: 'send_notification' | 'delay' | 'escalate' | 'webhook' | 'update_field';

  // Notification action
  notification?: {
    templateId?: string;
    channels: NotificationChannel[];
    priority: NotificationPriority;
    category: NotificationCategory;
    recipients: WorkflowRecipient[];
    content?: string;
    subject?: string;
    variables?: Record<string, any>;
  };

  // Delay action
  delay?: {
    duration: number; // seconds
    unit: 'seconds' | 'minutes' | 'hours' | 'days';
  };

  // Escalation action
  escalation?: {
    level: number;
    recipients: WorkflowRecipient[];
    condition?: WorkflowCondition;
  };

  // Webhook action
  webhook?: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    body?: Record<string, any>;
  };

  // Field update action
  fieldUpdate?: {
    field: string;
    value: any;
    operation: 'set' | 'increment' | 'decrement' | 'append';
  };
}

export interface WorkflowRecipient {
  type: 'user' | 'role' | 'organization' | 'dynamic';
  id?: string;
  roleSlug?: string;
  organizationId?: string;
  dynamicQuery?: {
    field: string;
    operator: string;
    value: any;
  };
}

export interface NotificationWorkflow {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;

  // Workflow configuration
  isActive: boolean;
  priority: number;
  maxExecutions?: number;
  executionWindow?: {
    start: string; // HH:mm format
    end: string;   // HH:mm format
    timezone: string;
    days: number[]; // 0-6, Sunday = 0
  };

  // Workflow logic
  triggers: WorkflowTrigger[];
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];

  // Metadata
  tags?: string[];
  metadata?: Record<string, any>;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastExecuted?: Date;
  executionCount: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  organizationId?: string;

  // Execution details
  triggeredBy: string;
  triggerData: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  // Results
  actionsExecuted: number;
  actionResults: {
    actionId: string;
    status: 'success' | 'failed' | 'skipped';
    result?: any;
    error?: string;
    executedAt: Date;
  }[];

  // Timing
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // milliseconds
}

export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, NotificationWorkflow> = new Map();
  private scheduledJobs: Map<string, CronJob> = new Map();
  private logger: Logger;

  constructor(
    private redis: Redis,
    private notificationEngine: any // Reference to NotificationEngine
  ) {
    super();
    this.logger = createLogger('WorkflowEngine');
  }

  /**
   * Initialize workflow engine
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing workflow engine...');

      // Load workflows from Redis
      await this.loadWorkflows();

      // Setup event listeners
      this.setupEventListeners();

      // Start scheduled workflows
      await this.startScheduledWorkflows();

      this.logger.info('Workflow engine initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize workflow engine:', error);
      throw error;
    }
  }

  /**
   * Register a new workflow
   */
  async registerWorkflow(workflow: NotificationWorkflow): Promise<void> {
    try {
      // Validate workflow
      this.validateWorkflow(workflow);

      // Store workflow
      this.workflows.set(workflow.id, workflow);

      // Save to Redis
      await this.saveWorkflowToRedis(workflow);

      // Setup triggers
      await this.setupWorkflowTriggers(workflow);

      this.logger.info(`Workflow registered: ${workflow.id} - ${workflow.name}`);
      this.emit('workflow:registered', workflow);
    } catch (error) {
      this.logger.error(`Failed to register workflow ${workflow.id}:`, error);
      throw error;
    }
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(
    workflowId: string,
    triggerData: any,
    triggeredBy: string
  ): Promise<WorkflowExecution> {
    const execution: WorkflowExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workflowId,
      organizationId: triggerData.organizationId,
      triggeredBy,
      triggerData,
      status: 'pending',
      actionsExecuted: 0,
      actionResults: [],
      startedAt: new Date()
    };

    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      if (!workflow.isActive) {
        throw new Error(`Workflow is not active: ${workflowId}`);
      }

      // Check execution window
      if (!this.isInExecutionWindow(workflow)) {
        throw new Error(`Workflow execution outside allowed window: ${workflowId}`);
      }

      // Check max executions
      if (workflow.maxExecutions && workflow.executionCount >= workflow.maxExecutions) {
        throw new Error(`Workflow has reached maximum executions: ${workflowId}`);
      }

      this.logger.info(`Starting workflow execution: ${execution.id} for workflow ${workflowId}`);
      execution.status = 'running';
      await this.saveExecutionToRedis(execution);

      // Evaluate conditions
      if (workflow.conditions && workflow.conditions.length > 0) {
        const conditionsMet = await this.evaluateConditions(workflow.conditions, triggerData);
        if (!conditionsMet) {
          execution.status = 'completed';
          execution.completedAt = new Date();
          execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
          await this.saveExecutionToRedis(execution);

          this.logger.info(`Workflow conditions not met, skipping execution: ${execution.id}`);
          return execution;
        }
      }

      // Execute actions
      for (const action of workflow.actions) {
        try {
          const actionResult = await this.executeAction(action, triggerData, execution);

          execution.actionResults.push({
            actionId: action.id,
            status: 'success',
            result: actionResult,
            executedAt: new Date()
          });

          execution.actionsExecuted++;
        } catch (error) {
          this.logger.error(`Action ${action.id} failed in execution ${execution.id}:`, error);

          execution.actionResults.push({
            actionId: action.id,
            status: 'failed',
            error: error.message,
            executedAt: new Date()
          });
        }
      }

      // Complete execution
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();

      // Update workflow execution count and last executed time
      workflow.executionCount++;
      workflow.lastExecuted = new Date();
      await this.saveWorkflowToRedis(workflow);

      await this.saveExecutionToRedis(execution);

      this.logger.info(
        `Workflow execution completed: ${execution.id} - ${execution.actionsExecuted} actions executed in ${execution.duration}ms`
      );

      this.emit('workflow:executed', execution);
      return execution;
    } catch (error) {
      this.logger.error(`Workflow execution failed: ${execution.id}`, error);

      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.duration = execution.completedAt!.getTime() - execution.startedAt.getTime();

      await this.saveExecutionToRedis(execution);

      this.emit('workflow:failed', { execution, error });
      throw error;
    }
  }

  /**
   * Trigger workflow by event
   */
  async triggerByEvent(eventType: string, eventData: any): Promise<void> {
    const triggeredWorkflows: string[] = [];

    for (const workflow of this.workflows.values()) {
      if (!workflow.isActive) continue;

      for (const trigger of workflow.triggers) {
        if (trigger.type === 'event' && trigger.eventType === eventType) {
          // Check event filters
          if (trigger.eventFilters && !this.matchesFilters(eventData, trigger.eventFilters)) {
            continue;
          }

          try {
            await this.executeWorkflow(workflow.id, eventData, `event:${eventType}`);
            triggeredWorkflows.push(workflow.id);
          } catch (error) {
            this.logger.error(`Failed to execute workflow ${workflow.id} for event ${eventType}:`, error);
          }
        }
      }
    }

    if (triggeredWorkflows.length > 0) {
      this.logger.info(`Event ${eventType} triggered ${triggeredWorkflows.length} workflows`);
    }
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): NotificationWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * List all workflows
   */
  listWorkflows(organizationId?: string): NotificationWorkflow[] {
    const workflows = Array.from(this.workflows.values());

    if (organizationId) {
      return workflows.filter(w => w.organizationId === organizationId);
    }

    return workflows;
  }

  /**
   * Update workflow
   */
  async updateWorkflow(workflow: NotificationWorkflow): Promise<void> {
    await this.registerWorkflow(workflow);
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Remove scheduled jobs
      await this.removeScheduledWorkflow(workflow);

      // Remove from memory and Redis
      this.workflows.delete(workflowId);
      await this.redis.del(`workflow:${workflowId}`);

      this.logger.info(`Workflow deleted: ${workflowId}`);
      this.emit('workflow:deleted', workflowId);
    } catch (error) {
      this.logger.error(`Failed to delete workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Load workflows from Redis
   */
  private async loadWorkflows(): Promise<void> {
    try {
      const workflowKeys = await this.redis.keys('workflow:*');

      for (const key of workflowKeys) {
        const workflowData = await this.redis.get(key);
        if (workflowData) {
          const workflow = JSON.parse(workflowData) as NotificationWorkflow;
          this.workflows.set(workflow.id, workflow);
        }
      }

      this.logger.info(`Loaded ${this.workflows.size} workflows from Redis`);
    } catch (error) {
      this.logger.error('Failed to load workflows from Redis:', error);
    }
  }

  /**
   * Save workflow to Redis
   */
  private async saveWorkflowToRedis(workflow: NotificationWorkflow): Promise<void> {
    const key = `workflow:${workflow.id}`;
    await this.redis.setex(key, 86400 * 365, JSON.stringify(workflow)); // Keep for 1 year
  }

  /**
   * Save execution to Redis
   */
  private async saveExecutionToRedis(execution: WorkflowExecution): Promise<void> {
    const key = `workflow:execution:${execution.id}`;
    await this.redis.setex(key, 86400 * 30, JSON.stringify(execution)); // Keep for 30 days
  }

  /**
   * Setup workflow triggers
   */
  private async setupWorkflowTriggers(workflow: NotificationWorkflow): Promise<void> {
    for (const trigger of workflow.triggers) {
      if (trigger.type === 'schedule' && trigger.cronExpression) {
        await this.setupScheduledTrigger(workflow, trigger);
      }
    }
  }

  /**
   * Setup scheduled trigger
   */
  private async setupScheduledTrigger(workflow: NotificationWorkflow, trigger: WorkflowTrigger): Promise<void> {
    try {
      const jobId = `${workflow.id}_${trigger.id}`;

      // Remove existing job if exists
      if (this.scheduledJobs.has(jobId)) {
        this.scheduledJobs.get(jobId)!.destroy();
      }

      // Create new cron job
      const job = new CronJob(
        trigger.cronExpression!,
        async () => {
          try {
            await this.executeWorkflow(
              workflow.id,
              { trigger: trigger.id, scheduledAt: new Date() },
              `schedule:${trigger.cronExpression}`
            );
          } catch (error) {
            this.logger.error(`Scheduled workflow execution failed: ${workflow.id}`, error);
          }
        },
        null,
        true // Start immediately
      );

      this.scheduledJobs.set(jobId, job);
      this.logger.info(`Scheduled trigger setup for workflow ${workflow.id}: ${trigger.cronExpression}`);
    } catch (error) {
      this.logger.error(`Failed to setup scheduled trigger for workflow ${workflow.id}:`, error);
    }
  }

  /**
   * Start scheduled workflows
   */
  private async startScheduledWorkflows(): Promise<void> {
    for (const workflow of this.workflows.values()) {
      if (workflow.isActive) {
        await this.setupWorkflowTriggers(workflow);
      }
    }
  }

  /**
   * Remove scheduled workflow
   */
  private async removeScheduledWorkflow(workflow: NotificationWorkflow): Promise<void> {
    for (const trigger of workflow.triggers) {
      const jobId = `${workflow.id}_${trigger.id}`;
      if (this.scheduledJobs.has(jobId)) {
        this.scheduledJobs.get(jobId)!.destroy();
        this.scheduledJobs.delete(jobId);
      }
    }
  }

  /**
   * Execute workflow action
   */
  private async executeAction(action: WorkflowAction, triggerData: any, execution: WorkflowExecution): Promise<any> {
    switch (action.type) {
      case 'send_notification':
        return await this.executeSendNotificationAction(action, triggerData, execution);
      case 'delay':
        return await this.executeDelayAction(action);
      case 'escalate':
        return await this.executeEscalationAction(action, triggerData, execution);
      case 'webhook':
        return await this.executeWebhookAction(action, triggerData);
      case 'update_field':
        return await this.executeFieldUpdateAction(action, triggerData);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Execute send notification action
   */
  private async executeSendNotificationAction(
    action: WorkflowAction,
    triggerData: any,
    execution: WorkflowExecution
  ): Promise<any> {
    if (!action.notification) {
      throw new Error('Notification action configuration is missing');
    }

    const recipients = await this.resolveRecipients(action.notification.recipients, triggerData);

    const notificationRequest: NotificationRequest = {
      id: `workflow_${execution.id}_${action.id}`,
      templateId: action.notification.templateId,
      recipients,
      content: action.notification.content || 'Workflow notification',
      subject: action.notification.subject,
      channels: action.notification.channels,
      priority: action.notification.priority,
      category: action.notification.category,
      variables: {
        ...action.notification.variables,
        workflowId: execution.workflowId,
        executionId: execution.id,
        triggerData
      },
      metadata: {
        workflowId: execution.workflowId,
        executionId: execution.id,
        actionId: action.id
      }
    };

    return await this.notificationEngine.send(notificationRequest);
  }

  /**
   * Execute delay action
   */
  private async executeDelayAction(action: WorkflowAction): Promise<any> {
    if (!action.delay) {
      throw new Error('Delay action configuration is missing');
    }

    let delayMs = action.delay.duration;

    switch (action.delay.unit) {
      case 'minutes':
        delayMs *= 60;
        break;
      case 'hours':
        delayMs *= 60 * 60;
        break;
      case 'days':
        delayMs *= 60 * 60 * 24;
        break;
    }

    delayMs *= 1000; // Convert to milliseconds

    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Execute escalation action
   */
  private async executeEscalationAction(
    action: WorkflowAction,
    triggerData: any,
    execution: WorkflowExecution
  ): Promise<any> {
    // Escalation logic would be implemented here
    // This could involve creating higher-priority notifications
    // or notifying different recipients
    return { escalated: true };
  }

  /**
   * Execute webhook action
   */
  private async executeWebhookAction(action: WorkflowAction, triggerData: any): Promise<any> {
    // Webhook logic would be implemented here
    return { webhookSent: true };
  }

  /**
   * Execute field update action
   */
  private async executeFieldUpdateAction(action: WorkflowAction, triggerData: any): Promise<any> {
    // Field update logic would be implemented here
    return { fieldUpdated: true };
  }

  /**
   * Resolve recipients from workflow recipient configurations
   */
  private async resolveRecipients(
    workflowRecipients: WorkflowRecipient[],
    triggerData: any
  ): Promise<NotificationRecipient[]> {
    const recipients: NotificationRecipient[] = [];

    for (const wfRecipient of workflowRecipients) {
      switch (wfRecipient.type) {
        case 'user':
          if (wfRecipient.id) {
            recipients.push({
              id: wfRecipient.id,
              type: 'user',
              userId: wfRecipient.id
            });
          }
          break;
        case 'organization':
          if (wfRecipient.organizationId) {
            // Would resolve to all users in organization
            // Implementation would depend on your user management system
          }
          break;
        // Add more recipient type handling as needed
      }
    }

    return recipients;
  }

  /**
   * Evaluate workflow conditions
   */
  private async evaluateConditions(conditions: WorkflowCondition[], data: any): Promise<boolean> {
    if (conditions.length === 0) return true;

    let result = true;
    let currentOperator: 'AND' | 'OR' = 'AND';

    for (const condition of conditions) {
      const conditionResult = this.evaluateCondition(condition, data);

      if (currentOperator === 'AND') {
        result = result && conditionResult;
      } else {
        result = result || conditionResult;
      }

      currentOperator = condition.logicalOperator || 'AND';
    }

    return result;
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(condition: WorkflowCondition, data: any): boolean {
    const fieldValue = this.getFieldValue(data, condition.field);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return fieldValue === targetValue;
      case 'not_equals':
        return fieldValue !== targetValue;
      case 'greater_than':
        return fieldValue > targetValue;
      case 'less_than':
        return fieldValue < targetValue;
      case 'contains':
        return String(fieldValue).includes(String(targetValue));
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(fieldValue);
      case 'not_in':
        return !Array.isArray(targetValue) || !targetValue.includes(fieldValue);
      default:
        return false;
    }
  }

  /**
   * Get field value from nested object
   */
  private getFieldValue(obj: any, fieldPath: string): any {
    const keys = fieldPath.split('.');
    let value = obj;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Check if workflow can execute in current time window
   */
  private isInExecutionWindow(workflow: NotificationWorkflow): boolean {
    if (!workflow.executionWindow) return true;

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5); // HH:mm format

    // Check if current day is allowed
    if (!workflow.executionWindow.days.includes(currentDay)) {
      return false;
    }

    // Check time window
    const { start, end } = workflow.executionWindow;
    if (start <= end) {
      // Same day window
      return currentTime >= start && currentTime <= end;
    } else {
      // Overnight window
      return currentTime >= start || currentTime <= end;
    }
  }

  /**
   * Check if event data matches filters
   */
  private matchesFilters(eventData: any, filters: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filters)) {
      const eventValue = this.getFieldValue(eventData, key);
      if (eventValue !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Validate workflow configuration
   */
  private validateWorkflow(workflow: NotificationWorkflow): void {
    if (!workflow.id || !workflow.name) {
      throw new Error('Workflow must have id and name');
    }

    if (!workflow.triggers || workflow.triggers.length === 0) {
      throw new Error('Workflow must have at least one trigger');
    }

    if (!workflow.actions || workflow.actions.length === 0) {
      throw new Error('Workflow must have at least one action');
    }

    // Validate triggers
    for (const trigger of workflow.triggers) {
      if (trigger.type === 'schedule' && !trigger.cronExpression) {
        throw new Error(`Schedule trigger ${trigger.id} must have cronExpression`);
      }
      if (trigger.type === 'event' && !trigger.eventType) {
        throw new Error(`Event trigger ${trigger.id} must have eventType`);
      }
    }

    // Validate actions
    for (const action of workflow.actions) {
      if (action.type === 'send_notification' && !action.notification) {
        throw new Error(`Notification action ${action.id} must have notification configuration`);
      }
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen to notification engine events
    if (this.notificationEngine) {
      this.notificationEngine.on('notification:sent', (data: any) => {
        this.triggerByEvent('notification.sent', data);
      });

      this.notificationEngine.on('notification:failed', (data: any) => {
        this.triggerByEvent('notification.failed', data);
      });
    }
  }
}