/**
 * GOAP Planner - Core planning algorithm using A* pathfinding
 * Creates optimal action sequences to achieve warehouse goals
 */

import { StateManager } from './state-manager';
import { Action, Goal, WorldState, Plan, PlanNode, PlannerConfig, PlannerResult } from './types';

export class GOAPPlanner {
  private stateManager: StateManager;
  private config: PlannerConfig;

  constructor(stateManager: StateManager, config: Partial<PlannerConfig> = {}) {
    this.stateManager = stateManager;
    this.config = {
      maxDepth: config.maxDepth || 10,
      timeoutMs: config.timeoutMs || 30000,
      allowPartialPlans: config.allowPartialPlans || true,
      costWeight: config.costWeight || 1.0,
      priorityWeight: config.priorityWeight || 0.5,
      ...config
    };
  }

  /**
   * Plan a sequence of actions to achieve a goal using A* algorithm
   */
  async plan(
    goal: Goal,
    currentState: WorldState,
    availableActions: Action[]
  ): Promise<PlannerResult> {
    const startTime = Date.now();
    let exploredNodes = 0;

    try {
      // Check if goal is already satisfied
      if (this.stateManager.isGoalSatisfied(currentState, goal)) {
        return {
          plan: {
            id: this.generateId(),
            goal,
            actions: [],
            estimatedCost: 0,
            estimatedDuration: 0,
            createdAt: new Date(),
            status: 'pending'
          },
          success: true,
          message: 'Goal already satisfied',
          exploredNodes: 0,
          planningTime: Date.now() - startTime
        };
      }

      // Initialize A* search
      const openList: PlanNode[] = [];
      const closedList: Set<string> = new Set();

      // Create root node
      const rootNode: PlanNode = {
        action: {
          id: 'root',
          name: 'Start',
          description: 'Initial state',
          preconditions: {},
          effects: {},
          cost: 0,
          execute: async () => ({ success: true, newWorldState: currentState })
        },
        worldState: currentState,
        cost: 0
      };

      openList.push(rootNode);

      while (openList.length > 0 && Date.now() - startTime < this.config.timeoutMs) {
        // Get node with lowest cost (A*)
        openList.sort((a, b) => this.calculateHeuristic(a, goal) - this.calculateHeuristic(b, goal));
        const currentNode = openList.shift()!;
        
        const stateKey = this.getStateKey(currentNode.worldState);
        if (closedList.has(stateKey)) {continue;}
        closedList.add(stateKey);
        
        exploredNodes++;

        // Check if we've reached the goal
        if (this.stateManager.isGoalSatisfied(currentNode.worldState, goal)) {
          const plan = this.buildPlan(goal, currentNode);
          return {
            plan,
            success: true,
            message: `Plan found with ${plan.actions.length} actions`,
            exploredNodes,
            planningTime: Date.now() - startTime
          };
        }

        // Don't expand beyond max depth
        if (this.getDepth(currentNode) >= this.config.maxDepth) {continue;}

        // Expand node with available actions
        for (const action of availableActions) {
          if (this.stateManager.canExecuteAction(currentNode.worldState, action)) {
            const newState = this.stateManager.applyAction(currentNode.worldState, action);
            const newNode: PlanNode = {
              action,
              worldState: newState,
              cost: currentNode.cost + action.cost,
              parent: currentNode
            };

            const newStateKey = this.getStateKey(newState);
            if (!closedList.has(newStateKey)) {
              openList.push(newNode);
            }
          }
        }
      }

      // No complete plan found
      if (this.config.allowPartialPlans && openList.length > 0) {
        // Return best partial plan
        const bestNode = openList.reduce((best, node) => 
          this.calculateHeuristic(node, goal) < this.calculateHeuristic(best, goal) ? node : best
        );
        
        const partialPlan = this.buildPlan(goal, bestNode);
        return {
          plan: partialPlan,
          success: false,
          message: `Partial plan found with ${partialPlan.actions.length} actions`,
          exploredNodes,
          planningTime: Date.now() - startTime
        };
      }

      return {
        success: false,
        message: 'No plan found within constraints',
        exploredNodes,
        planningTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        message: `Planning error: ${error}`,
        exploredNodes,
        planningTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate heuristic cost for A* (estimated cost to goal)
   */
  private calculateHeuristic(node: PlanNode, goal: Goal): number {
    const actualCost = node.cost * this.config.costWeight;
    const heuristicCost = this.stateManager.calculateDistance(node.worldState, goal.targetState);
    const priorityBonus = (1 / goal.priority) * this.config.priorityWeight;
    
    return actualCost + heuristicCost - priorityBonus;
  }

  /**
   * Build final plan from goal node by backtracking
   */
  private buildPlan(goal: Goal, goalNode: PlanNode): Plan {
    const actions: Action[] = [];
    let currentNode = goalNode;

    // Backtrack to build action sequence
    while (currentNode.parent) {
      actions.unshift(currentNode.action);
      currentNode = currentNode.parent;
    }

    const estimatedCost = actions.reduce((total, action) => total + action.cost, 0);
    const estimatedDuration = actions.length * 60; // Rough estimate: 1 minute per action

    return {
      id: this.generateId(),
      goal,
      actions,
      estimatedCost,
      estimatedDuration,
      createdAt: new Date(),
      status: 'pending'
    };
  }

  /**
   * Get depth of node in search tree
   */
  private getDepth(node: PlanNode): number {
    let depth = 0;
    let current = node;
    while (current.parent) {
      depth++;
      current = current.parent;
    }
    return depth;
  }

  /**
   * Create unique key for world state (for duplicate detection)
   */
  private getStateKey(state: WorldState): string {
    return JSON.stringify(this.stateManager.normalizeState(state));
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update planner configuration
   */
  updateConfig(config: Partial<PlannerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): PlannerConfig {
    return { ...this.config };
  }
}