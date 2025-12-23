/**
 * GOAP Service - Integration layer between GOAP system and web application
 */

import { 
  GOAPSystem, 
  Goal, 
  Agent, 
  Plan, 
  AgentType, 
  WarehouseAgents,
  SystemStatus 
} from '../../../../src/goap';
import { PrismaClient } from '@prisma/client';

// Global GOAP system instance
let goapSystemInstance: GOAPSystem | null = null;

export interface GOAPServiceConfig {
  enablePersistence: boolean;
  enableMetrics: boolean;
  maxConcurrentPlans: number;
}

export interface AgentFilter {
  warehouseId?: string;
  type?: AgentType;
  active?: boolean;
}

export interface CreateAgentRequest {
  type: AgentType;
  name: string;
  warehouseId: string;
  capabilities?: string[];
}

export interface AssignGoalOptions {
  warehouseId?: string;
  specificAgentId?: string;
}

class GOAPService {
  private goapSystem: GOAPSystem | null = null;
  private prisma: PrismaClient;
  private config: GOAPServiceConfig;
  private initialized = false;

  constructor() {
    this.prisma = new PrismaClient();
    this.config = {
      enablePersistence: true,
      enableMetrics: true,
      maxConcurrentPlans: 50
    };
  }

  /**
   * Initialize the GOAP system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('🚀 Initializing GOAP system...');

      this.goapSystem = new GOAPSystem({
        maxPlanningDepth: 12,
        planningTimeoutMs: 45000,
        executionTimeoutMs: 600000,
        enableLogging: process.env.NODE_ENV === 'development',
        enableMetrics: this.config.enableMetrics
      });

      await this.goapSystem.start();
      
      // Load existing agents and plans from database
      await this.loadPersistedData();
      
      this.initialized = true;
      console.log('✅ GOAP system initialized');

    } catch (error) {
      console.error('❌ GOAP system initialization failed:', error);
      throw error;
    }
  }

  /**
   * Ensure system is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<SystemStatus & { initialized: boolean }> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    const status = this.goapSystem.getStatus();
    
    return {
      ...status,
      initialized: this.initialized
    };
  }

  /**
   * Get agents with optional filtering
   */
  async getAgents(filter: AgentFilter = {}): Promise<Agent[]> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    let agents = this.goapSystem.getAgents();

    // Apply filters
    if (filter.warehouseId) {
      agents = agents.filter(agent => agent.id.includes(filter.warehouseId!));
    }

    if (filter.type) {
      agents = agents.filter(agent => agent.type === filter.type);
    }

    if (filter.active !== undefined) {
      agents = agents.filter(agent => agent.isActive === filter.active);
    }

    return agents;
  }

  /**
   * Create a new agent
   */
  async createAgent(request: CreateAgentRequest): Promise<Agent> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    const agentId = `${request.warehouseId}_${request.type}_${Date.now()}`;
    
    let agent: Agent;

    // Create agent based on type
    switch (request.type) {
      case AgentType.WAREHOUSE_MANAGER:
        agent = WarehouseAgents.createWarehouseManager(agentId, request.name);
        break;
      case AgentType.INVENTORY_SPECIALIST:
        agent = WarehouseAgents.createInventorySpecialist(agentId, request.name);
        break;
      case AgentType.SHIPPING_AGENT:
        agent = WarehouseAgents.createShippingAgent(agentId, request.name);
        break;
      case AgentType.RECEIVING_AGENT:
        agent = WarehouseAgents.createReceivingAgent(agentId, request.name);
        break;
      case AgentType.QUALITY_INSPECTOR:
        agent = WarehouseAgents.createQualityInspector(agentId, request.name);
        break;
      case AgentType.MAINTENANCE_TECH:
        agent = WarehouseAgents.createMaintenanceTech(agentId, request.name);
        break;
      case AgentType.LOGISTICS_COORDINATOR:
        agent = WarehouseAgents.createLogisticsCoordinator(agentId, request.name);
        break;
      case AgentType.AUTONOMOUS_ROBOT:
        agent = WarehouseAgents.createAutonomousRobot(agentId, request.name);
        break;
      default:
        throw new Error(`Unsupported agent type: ${request.type}`);
    }

    // Override capabilities if provided
    if (request.capabilities) {
      agent.capabilities = request.capabilities;
    }

    this.goapSystem.addAgent(agent);

    // Persist to database if enabled
    if (this.config.enablePersistence) {
      await this.persistAgent(agent, request.warehouseId);
    }

    return agent;
  }

  /**
   * Create a complete warehouse team
   */
  async createWarehouseTeam(warehouseId: string): Promise<Agent[]> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    const team = this.goapSystem.createWarehouseTeam(warehouseId);

    // Persist team to database if enabled
    if (this.config.enablePersistence) {
      await Promise.all(team.map(agent => this.persistAgent(agent, warehouseId)));
    }

    return team;
  }

  /**
   * Assign a goal to an agent
   */
  async assignGoal(goal: Goal, options: AssignGoalOptions = {}): Promise<{ agent: Agent; plan?: Plan } | null> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    const assignment = await this.goapSystem.assignGoal(goal);

    // Persist goal and plan if enabled
    if (assignment && this.config.enablePersistence) {
      await this.persistGoal(goal, assignment, options.warehouseId);
    }

    return assignment;
  }

  /**
   * Execute a plan for an agent
   */
  async executePlan(agentId: string): Promise<boolean> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    return await this.goapSystem.executePlan(agentId);
  }

  /**
   * Get active plans
   */
  async getActivePlans(): Promise<Plan[]> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    return this.goapSystem.getActivePlans();
  }

  /**
   * Update world state
   */
  async updateWorldState(newState: any): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    this.goapSystem.updateWorldState(newState);
  }

  /**
   * Get current world state
   */
  async getWorldState(): Promise<any> {
    await this.ensureInitialized();
    
    if (!this.goapSystem) {
      throw new Error('GOAP system not initialized');
    }

    return this.goapSystem.getWorldState();
  }

  /**
   * Get GOAP metrics
   */
  async getMetrics(): Promise<any> {
    // Implementation would include performance metrics, success rates, etc.
    return {
      totalGoalsAssigned: 0,
      successfulPlans: 0,
      averagePlanningTime: 0,
      averageExecutionTime: 0,
      agentUtilization: 0
    };
  }

  /**
   * Persist agent to database
   */
  private async persistAgent(agent: Agent, warehouseId: string): Promise<void> {
    try {
      // This would integrate with your actual database schema
      console.log(`Persisting agent ${agent.id} for warehouse ${warehouseId}`);
      // Implementation depends on your database schema
    } catch (error) {
      console.error('Failed to persist agent:', error);
    }
  }

  /**
   * Persist goal and plan to database
   */
  private async persistGoal(goal: Goal, assignment: any, warehouseId?: string): Promise<void> {
    try {
      // This would integrate with your actual database schema
      console.log(`Persisting goal ${goal.id} and plan for warehouse ${warehouseId}`);
      // Implementation depends on your database schema
    } catch (error) {
      console.error('Failed to persist goal:', error);
    }
  }

  /**
   * Load persisted data from database
   */
  private async loadPersistedData(): Promise<void> {
    try {
      // Load agents and restore them to the GOAP system
      console.log('Loading persisted GOAP data...');
      // Implementation depends on your database schema
    } catch (error) {
      console.error('Failed to load persisted data:', error);
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.goapSystem) {
      await this.goapSystem.stop();
    }
    await this.prisma.$disconnect();
    this.initialized = false;
  }
}

// Create singleton instance
export const goapService = new GOAPService();

// Initialize on startup
if (typeof window === 'undefined') {
  // Server-side only
  goapService.initialize().catch(console.error);
}

export default goapService;