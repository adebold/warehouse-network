/**
 * GOAP System Main Entry Point
 * Orchestrates the complete Goal-Oriented Action Planning system for warehouse operations
 */

import { WarehouseActions } from './actions/warehouse-actions';
import { WarehouseAgents } from './agents/warehouse-agents';
import { GOAPExecutor } from './executor';
import { GOAPPlanner } from './planner';
import { StateManager } from './state-manager';
import { Agent, Goal, WorldState, Plan, StateKeys } from './types';
import { logger } from '../utils/logger';

export interface GOAPSystemConfig {
  maxPlanningDepth: number;
  planningTimeoutMs: number;
  executionTimeoutMs: number;
  enableLogging: boolean;
  enableMetrics: boolean;
}

export interface SystemStatus {
  activeAgents: number;
  runningPlans: number;
  completedPlans: number;
  systemUptime: number;
  lastUpdate: Date;
}

/**
 * Main GOAP System Orchestrator
 */
export class GOAPSystem {
  private stateManager: StateManager;
  private planner: GOAPPlanner;
  private executor: GOAPExecutor;
  private agents: Map<string, Agent> = new Map();
  private activePlans: Map<string, Plan> = new Map();
  private worldState: WorldState;
  private config: GOAPSystemConfig;
  private systemStartTime: Date;
  private isRunning: boolean = false;

  constructor(config: Partial<GOAPSystemConfig> = {}) {
    this.config = {
      maxPlanningDepth: 10,
      planningTimeoutMs: 30000,
      executionTimeoutMs: 300000,
      enableLogging: true,
      enableMetrics: true,
      ...config
    };

    this.systemStartTime = new Date();
    this.stateManager = new StateManager();
    this.planner = new GOAPPlanner(this.stateManager, {
      maxDepth: this.config.maxPlanningDepth,
      timeoutMs: this.config.planningTimeoutMs
    });
    this.executor = new GOAPExecutor(this.stateManager);
    this.worldState = this.stateManager.getWarehouseSnapshot();
  }

  /**
   * Initialize and start the GOAP system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('GOAP system is already running');
    }

    this.log('🚀 Starting GOAP System...');
    this.isRunning = true;
    
    // Start monitoring loop
    this.startMonitoringLoop();
    
    this.log('✅ GOAP System started successfully');
  }

  /**
   * Stop the GOAP system
   */
  async stop(): Promise<void> {
    this.log('🛑 Stopping GOAP System...');
    this.isRunning = false;
    
    // Cancel any running plans
    for (const plan of this.activePlans.values()) {
      if (plan.status === 'executing') {
        plan.status = 'cancelled';
      }
    }
    
    this.log('✅ GOAP System stopped');
  }

  /**
   * Add an agent to the system
   */
  addAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    agent.worldState = { ...this.worldState };
    
    this.log(`🤖 Added agent: ${agent.name} (${agent.type})`);
  }

  /**
   * Remove an agent from the system
   */
  removeAgent(agentId: string): boolean {
    const removed = this.agents.delete(agentId);
    if (removed) {
      this.log(`🗑️ Removed agent: ${agentId}`);
    }
    return removed;
  }

  /**
   * Create and add a complete warehouse team
   */
  createWarehouseTeam(warehouseId: string): Agent[] {
    const team = WarehouseAgents.createWarehouseTeam(warehouseId);
    team.forEach(agent => this.addAgent(agent));
    
    this.log(`👥 Created warehouse team for ${warehouseId}: ${team.length} agents`);
    return team;
  }

  /**
   * Assign a goal to the most suitable agent
   */
  async assignGoal(goal: Goal): Promise<{ agent: Agent; plan?: Plan } | null> {
    try {
      // Find the best agent for this goal
      const suitableAgent = this.findBestAgent(goal);
      
      if (!suitableAgent) {
        this.log(`❌ No suitable agent found for goal: ${goal.name}`);
        return null;
      }

      this.log(`🎯 Assigning goal "${goal.name}" to agent ${suitableAgent.name}`);

      // Create a plan for the goal
      const availableActions = WarehouseActions.getActionsForCapabilities(suitableAgent.capabilities);
      const plannerResult = await this.planner.plan(goal, suitableAgent.worldState, availableActions);

      if (!plannerResult.success || !plannerResult.plan) {
        this.log(`❌ Failed to create plan for goal: ${plannerResult.message}`);
        return { agent: suitableAgent };
      }

      // Assign the plan to the agent
      suitableAgent.currentPlan = plannerResult.plan;
      this.activePlans.set(plannerResult.plan.id, plannerResult.plan);

      this.log(`📋 Created plan with ${plannerResult.plan.actions.length} actions`);
      return { agent: suitableAgent, plan: plannerResult.plan };

    } catch (error) {
      this.log(`💥 Error assigning goal: ${error}`);
      return null;
    }
  }

  /**
   * Execute an agent's current plan
   */
  async executePlan(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    
    if (!agent || !agent.currentPlan) {
      this.log(`❌ No plan to execute for agent: ${agentId}`);
      return false;
    }

    try {
      this.log(`⚡ Starting plan execution for agent: ${agent.name}`);
      
      const result = await this.executor.executePlan(
        agent.currentPlan,
        agent,
        agent.worldState,
        {
          timeoutMs: this.config.executionTimeoutMs,
          onActionComplete: (action, result, context) => {
            this.log(`✅ Action completed: ${action.name} - ${result.message}`);
            // Update world state
            if (result.success) {
              this.updateWorldState(result.newWorldState);
            }
          },
          onPlanComplete: (result) => {
            this.log(`🏁 Plan execution completed: ${result.message}`);
            // Clean up
            agent.currentPlan = undefined;
            this.activePlans.delete(result.plan.id);
          }
        }
      );

      return result.success;

    } catch (error) {
      this.log(`💥 Plan execution error: ${error}`);
      return false;
    }
  }

  /**
   * Update the global world state
   */
  updateWorldState(newState: WorldState): void {
    this.worldState = { ...this.worldState, ...newState };
    
    // Propagate to all agents
    for (const agent of this.agents.values()) {
      agent.worldState = { ...this.worldState };
    }
    
    // Update agent priorities based on new state
    WarehouseAgents.updateAgentPriorities(Array.from(this.agents.values()), this.worldState);
  }

  /**
   * Get system status
   */
  getStatus(): SystemStatus {
    return {
      activeAgents: this.agents.size,
      runningPlans: Array.from(this.activePlans.values()).filter(p => p.status === 'executing').length,
      completedPlans: Array.from(this.activePlans.values()).filter(p => p.status === 'completed').length,
      systemUptime: Date.now() - this.systemStartTime.getTime(),
      lastUpdate: new Date()
    };
  }

  /**
   * Get current world state
   */
  getWorldState(): WorldState {
    return { ...this.worldState };
  }

  /**
   * Get all agents
   */
  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get active plans
   */
  getActivePlans(): Plan[] {
    return Array.from(this.activePlans.values());
  }

  /**
   * Process common warehouse scenarios automatically
   */
  async processWarehouseScenarios(): Promise<void> {
    const scenarios = this.detectScenarios();
    
    for (const scenario of scenarios) {
      await this.assignGoal(scenario.goal);
    }
  }

  /**
   * Find the best agent for a given goal
   */
  private findBestAgent(goal: Goal): Agent | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.isActive && !agent.currentPlan);

    if (availableAgents.length === 0) {return null;}

    // Score agents based on capabilities and priority
    const scoredAgents = availableAgents.map(agent => ({
      agent,
      score: this.calculateAgentScore(agent, goal)
    }));

    scoredAgents.sort((a, b) => b.score - a.score);
    
    return scoredAgents[0]?.agent || null;
  }

  /**
   * Calculate how suitable an agent is for a goal
   */
  private calculateAgentScore(agent: Agent, goal: Goal): number {
    let score = agent.priority;
    
    // Bonus for relevant capabilities
    const goalType = goal.context?.type || '';
    
    switch (goalType) {
      case 'order_fulfillment':
        if (agent.capabilities.includes('order_fulfillment')) {score += 5;}
        if (agent.capabilities.includes('shipping')) {score += 3;}
        break;
      case 'inventory_optimization':
        if (agent.capabilities.includes('inventory_management')) {score += 5;}
        if (agent.capabilities.includes('receiving')) {score += 3;}
        break;
      case 'quality_assurance':
        if (agent.capabilities.includes('quality_control')) {score += 5;}
        if (agent.capabilities.includes('inspection')) {score += 3;}
        break;
      case 'equipment_maintenance':
        if (agent.capabilities.includes('maintenance')) {score += 5;}
        if (agent.capabilities.includes('repair')) {score += 3;}
        break;
    }
    
    return score;
  }

  /**
   * Detect common warehouse scenarios that need attention
   */
  private detectScenarios(): { scenario: string; goal: Goal }[] {
    const scenarios: { scenario: string; goal: Goal }[] = [];
    
    // Low stock scenario
    const lowStockItems = this.worldState[StateKeys.LOW_STOCK_ITEMS] || [];
    if (Array.isArray(lowStockItems) && lowStockItems.length > 0) {
      scenarios.push({
        scenario: 'low_stock',
        goal: {
          id: `restock_${Date.now()}`,
          name: 'Restock Low Inventory',
          description: 'Address low stock items',
          targetState: { [StateKeys.LOW_STOCK_ITEMS]: [] },
          priority: 9
        }
      });
    }
    
    // Orders waiting scenario
    const ordersInQueue = this.worldState[StateKeys.ORDERS_IN_QUEUE] || [];
    if (Array.isArray(ordersInQueue) && ordersInQueue.length > 5) {
      scenarios.push({
        scenario: 'order_backlog',
        goal: {
          id: `process_orders_${Date.now()}`,
          name: 'Process Order Backlog',
          description: 'Clear order queue',
          targetState: { [StateKeys.ORDERS_IN_QUEUE]: [] },
          priority: 10
        }
      });
    }
    
    return scenarios;
  }

  /**
   * Start the monitoring loop
   */
  private startMonitoringLoop(): void {
    const monitoringInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(monitoringInterval);
        return;
      }

      try {
        // Process automatic scenarios
        await this.processWarehouseScenarios();
        
        // Execute plans for agents that have them
        for (const agent of this.agents.values()) {
          if (agent.currentPlan && agent.currentPlan.status === 'pending') {
            this.executePlan(agent.id).catch(error => {
              this.log(`❌ Error executing plan for ${agent.name}: ${error}`);
            });
          }
        }
      } catch (error) {
        this.log(`❌ Monitoring loop error: ${error}`);
      }
    }, 5000); // Monitor every 5 seconds
  }

  /**
   * Logging utility
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      logger.info(`[GOAP] ${new Date().toISOString()} - ${message}`);
    }
  }
}

// Export all types and classes
export * from './types';
export { GOAPPlanner } from './planner';
export { GOAPExecutor } from './executor';
export { StateManager } from './state-manager';
export { WarehouseActions } from './actions/warehouse-actions';
export { WarehouseAgents } from './agents/warehouse-agents';