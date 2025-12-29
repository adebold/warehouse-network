/**
 * GOAP Plan Executor - Executes planned action sequences
 * Handles real-time execution with error recovery and monitoring
 */

import { StateManager } from './state-manager';
import { Plan, ExecutionContext, Action, Agent, WorldState, ActionResult } from './types';
import { logger } from '../utils/logger';

export interface ExecutionResult {
  success: boolean;
  plan: Plan;
  executedActions: Action[];
  finalWorldState: WorldState;
  totalDuration: number;
  message: string;
  errors?: string[];
}

export interface ExecutionOptions {
  retryOnFailure: boolean;
  maxRetries: number;
  continueOnError: boolean;
  timeoutMs: number;
  onActionStart?: (action: Action, context: ExecutionContext) => void;
  onActionComplete?: (action: Action, result: ActionResult, context: ExecutionContext) => void;
  onPlanComplete?: (result: ExecutionResult) => void;
}

export class GOAPExecutor {
  private stateManager: StateManager;
  private isExecuting: boolean = false;
  private currentExecution?: ExecutionContext;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Execute a GOAP plan with the specified agent
   */
  async executePlan(
    plan: Plan,
    agent: Agent,
    currentWorldState: WorldState,
    options: Partial<ExecutionOptions> = {}
  ): Promise<ExecutionResult> {
    
    const config: ExecutionOptions = {
      retryOnFailure: true,
      maxRetries: 3,
      continueOnError: false,
      timeoutMs: 300000, // 5 minutes
      ...options
    };

    if (this.isExecuting) {
      throw new Error('Executor is already running a plan');
    }

    this.isExecuting = true;
    const startTime = Date.now();
    const executedActions: Action[] = [];
    const errors: string[] = [];
    let worldState = { ...currentWorldState };

    // Create execution context
    const context: ExecutionContext = {
      agent,
      plan,
      currentActionIndex: 0,
      startTime: new Date(),
      variables: {}
    };

    this.currentExecution = context;

    try {
      // Update plan status
      plan.status = 'executing';
      
      logger.info(`🤖 Agent ${agent.name} starting plan execution: ${plan.goal.name}`);
      logger.info(`📋 Plan contains ${plan.actions.length} actions`);

      // Execute each action in sequence
      for (let i = 0; i < plan.actions.length; i++) {
        if (Date.now() - startTime > config.timeoutMs) {
          throw new Error('Plan execution timeout');
        }

        const action = plan.actions[i];
        context.currentActionIndex = i;
        
        logger.info(`⚡ Executing action ${i + 1}/${plan.actions.length}: ${action.name}`);
        
        // Call pre-action hook
        config.onActionStart?.(action, context);

        // Validate action can still be executed
        if (!this.stateManager.canExecuteAction(worldState, action)) {
          const error = `Action ${action.name} preconditions not met`;
          errors.push(error);
          logger.error(`❌ ${error}`);
          
          if (!config.continueOnError) {
            break;
          }
          continue;
        }

        // Execute action with retry logic
        let actionResult: ActionResult | null = null;
        let retryCount = 0;

        while (retryCount <= config.maxRetries && !actionResult?.success) {
          try {
            if (retryCount > 0) {
              logger.info(`🔄 Retrying action ${action.name} (attempt ${retryCount + 1})`);
              await this.delay(1000 * retryCount); // Exponential backoff
            }

            actionResult = await this.executeActionSafely(action, worldState, agent);
            
          } catch (error) {
            logger.error(`❌ Action execution error:`, error);
            actionResult = {
              success: false,
              newWorldState: worldState,
              error: String(error)
            };
          }

          if (!actionResult.success && config.retryOnFailure) {
            retryCount++;
          } else {
            break;
          }
        }

        // Handle action result
        if (actionResult.success) {
          worldState = actionResult.newWorldState;
          executedActions.push(action);
          logger.info(`✅ Action completed: ${actionResult.message}`);
        } else {
          const error = `Action ${action.name} failed: ${actionResult.error}`;
          errors.push(error);
          logger.error(`❌ ${error}`);
          
          if (!config.continueOnError) {
            break;
          }
        }

        // Call post-action hook
        config.onActionComplete?.(action, actionResult, context);
        
        // Update agent's world state
        agent.worldState = worldState;
      }

      // Determine final result
      const allActionsExecuted = executedActions.length === plan.actions.length;
      const hasErrors = errors.length > 0;
      const success = allActionsExecuted && !hasErrors;

      // Update plan status
      plan.status = success ? 'completed' : 'failed';

      const result: ExecutionResult = {
        success,
        plan,
        executedActions,
        finalWorldState: worldState,
        totalDuration: Date.now() - startTime,
        message: success 
          ? `Plan executed successfully. ${executedActions.length} actions completed.`
          : `Plan execution failed. ${executedActions.length}/${plan.actions.length} actions completed.`,
        errors: hasErrors ? errors : undefined
      };

      logger.info(`🏁 Plan execution ${success ? 'completed' : 'failed'}: ${result.message}`);

      // Call completion hook
      config.onPlanComplete?.(result);

      return result;

    } catch (error) {
      plan.status = 'failed';
      const errorMessage = `Plan execution error: ${error}`;
      logger.error(`💥 ${errorMessage}`);

      return {
        success: false,
        plan,
        executedActions,
        finalWorldState: worldState,
        totalDuration: Date.now() - startTime,
        message: errorMessage,
        errors: [errorMessage]
      };
    } finally {
      this.isExecuting = false;
      this.currentExecution = undefined;
    }
  }

  /**
   * Execute a single action safely with error handling
   */
  private async executeActionSafely(
    action: Action,
    worldState: WorldState,
    agent: Agent
  ): Promise<ActionResult> {
    try {
      // Pre-execution validation
      const validation = this.stateManager.validateState(worldState);
      if (!validation.valid) {
        throw new Error(`Invalid world state: ${validation.errors.join(', ')}`);
      }

      // Execute the action
      const result = await Promise.race([
        action.execute(worldState, action.parameters),
        this.createTimeoutPromise(30000) // 30 second action timeout
      ]);

      // Validate result
      if (!result || typeof result !== 'object') {
        throw new Error('Action returned invalid result');
      }

      if (!result.hasOwnProperty('success')) {
        throw new Error('Action result missing success field');
      }

      // Validate new world state
      if (result.success && result.newWorldState) {
        const newStateValidation = this.stateManager.validateState(result.newWorldState);
        if (!newStateValidation.valid) {
          logger.warn('Action produced invalid world state:', newStateValidation.errors);
          // Continue but log warning
        }
      }

      return result;

    } catch (error) {
      logger.error(`Action ${action.name} execution error:`, error);
      return {
        success: false,
        newWorldState: worldState,
        error: String(error)
      };
    }
  }

  /**
   * Create a timeout promise for action execution
   */
  private createTimeoutPromise(timeoutMs: number): Promise<ActionResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Action execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Pause execution (can be resumed)
   */
  pause(): void {
    if (this.currentExecution) {
      logger.info('⏸️ Plan execution paused');
      // Implementation would set a pause flag checked in execution loop
    }
  }

  /**
   * Cancel current execution
   */
  cancel(): void {
    if (this.currentExecution) {
      this.currentExecution.plan.status = 'cancelled';
      this.isExecuting = false;
      logger.info('🛑 Plan execution cancelled');
    }
  }

  /**
   * Get current execution status
   */
  getStatus(): {
    isExecuting: boolean;
    currentPlan?: Plan;
    currentAction?: Action;
    progress?: number;
  } {
    if (!this.isExecuting || !this.currentExecution) {
      return { isExecuting: false };
    }

    const context = this.currentExecution;
    const progress = context.plan.actions.length > 0 
      ? (context.currentActionIndex / context.plan.actions.length) * 100 
      : 0;

    return {
      isExecuting: true,
      currentPlan: context.plan,
      currentAction: context.plan.actions[context.currentActionIndex],
      progress
    };
  }

  /**
   * Get execution metrics
   */
  getMetrics(): {
    totalExecutions: number;
    successfulExecutions: number;
    averageExecutionTime: number;
    mostUsedActions: { action: string; count: number }[];
  } {
    // This would be implemented with persistent metrics storage
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      averageExecutionTime: 0,
      mostUsedActions: []
    };
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}