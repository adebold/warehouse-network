/**
 * World State Manager - Handles state transitions and validations
 * Manages warehouse world state for GOAP planning
 */

import { WorldState, Action, Goal, StateKeys } from './types';
import { logger } from '../utils/logger';

export class StateManager {
  
  /**
   * Check if an action can be executed in the current world state
   */
  canExecuteAction(worldState: WorldState, action: Action): boolean {
    try {
      // Check if custom validation exists
      if (action.validate) {
        return action.validate(worldState, action.parameters);
      }

      // Check preconditions
      for (const [key, value] of Object.entries(action.preconditions)) {
        if (!this.checkCondition(worldState, key, value)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error(`Error checking action ${action.id}:`, error);
      return false;
    }
  }

  /**
   * Apply an action's effects to the world state
   */
  applyAction(worldState: WorldState, action: Action): WorldState {
    const newState = this.deepClone(worldState);

    // Apply effects
    for (const [key, value] of Object.entries(action.effects)) {
      this.applyEffect(newState, key, value);
    }

    return newState;
  }

  /**
   * Check if a goal is satisfied in the current world state
   */
  isGoalSatisfied(worldState: WorldState, goal: Goal): boolean {
    try {
      for (const [key, value] of Object.entries(goal.targetState)) {
        if (!this.checkCondition(worldState, key, value)) {
          return false;
        }
      }
      return true;
    } catch (error) {
      logger.error(`Error checking goal ${goal.id}:`, error);
      return false;
    }
  }

  /**
   * Calculate heuristic distance between current state and goal state
   */
  calculateDistance(currentState: WorldState, goalState: WorldState): number {
    let distance = 0;
    
    for (const [key, goalValue] of Object.entries(goalState)) {
      const currentValue = currentState[key];
      
      if (currentValue === undefined) {
        distance += 10; // High penalty for missing values
      } else if (typeof goalValue === 'number' && typeof currentValue === 'number') {
        distance += Math.abs(goalValue - currentValue);
      } else if (typeof goalValue === 'boolean' && typeof currentValue === 'boolean') {
        distance += goalValue === currentValue ? 0 : 1;
      } else if (Array.isArray(goalValue) && Array.isArray(currentValue)) {
        distance += this.calculateArrayDistance(currentValue, goalValue);
      } else if (typeof goalValue === 'object' && typeof currentValue === 'object') {
        distance += this.calculateObjectDistance(currentValue, goalValue);
      } else {
        distance += String(goalValue) === String(currentValue) ? 0 : 1;
      }
    }

    return distance;
  }

  /**
   * Normalize state for consistent comparison
   */
  normalizeState(state: WorldState): WorldState {
    const normalized: WorldState = {};
    
    for (const [key, value] of Object.entries(state)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          normalized[key] = this.normalizeState(value);
        } else {
          normalized[key] = value;
        }
      }
    }

    return normalized;
  }

  /**
   * Merge multiple world states
   */
  mergeStates(...states: WorldState[]): WorldState {
    return states.reduce((merged, state) => ({ ...merged, ...state }), {});
  }

  /**
   * Get warehouse-specific state snapshot
   */
  getWarehouseSnapshot(): WorldState {
    return {
      [StateKeys.ITEM_QUANTITY]: {},
      [StateKeys.ITEM_LOCATION]: {},
      [StateKeys.ITEM_RESERVED]: {},
      [StateKeys.ORDER_STATUS]: {},
      [StateKeys.DOCK_AVAILABLE]: true,
      [StateKeys.STAFF_AVAILABLE]: true,
      [StateKeys.EQUIPMENT_AVAILABLE]: true,
      [StateKeys.ORDERS_IN_QUEUE]: [],
      [StateKeys.LOW_STOCK_ITEMS]: [],
      [StateKeys.ITEMS_NEED_INSPECTION]: [],
      [StateKeys.EQUIPMENT_NEEDS_MAINTENANCE]: [],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate state integrity
   */
  validateState(state: WorldState): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required warehouse state keys
    const requiredKeys = [
      StateKeys.ITEM_QUANTITY,
      StateKeys.ORDER_STATUS,
      StateKeys.DOCK_AVAILABLE
    ];

    for (const key of requiredKeys) {
      if (!(key in state)) {
        errors.push(`Missing required state key: ${key}`);
      }
    }

    // Validate data types
    if (state[StateKeys.DOCK_AVAILABLE] !== undefined && typeof state[StateKeys.DOCK_AVAILABLE] !== 'boolean') {
      errors.push(`${StateKeys.DOCK_AVAILABLE} must be boolean`);
    }

    if (state[StateKeys.ORDERS_IN_QUEUE] !== undefined && !Array.isArray(state[StateKeys.ORDERS_IN_QUEUE])) {
      errors.push(`${StateKeys.ORDERS_IN_QUEUE} must be array`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check a single condition against the world state
   */
  private checkCondition(worldState: WorldState, key: string, expectedValue: any): boolean {
    const actualValue = worldState[key];

    if (expectedValue === null || expectedValue === undefined) {
      return actualValue === expectedValue;
    }

    if (typeof expectedValue === 'object' && expectedValue.operator) {
      return this.checkOperatorCondition(actualValue, expectedValue);
    }

    if (Array.isArray(expectedValue)) {
      return Array.isArray(actualValue) && this.arraysEqual(actualValue, expectedValue);
    }

    return actualValue === expectedValue;
  }

  /**
   * Check operator-based conditions (>, <, >=, <=, etc.)
   */
  private checkOperatorCondition(actualValue: any, condition: any): boolean {
    const { operator, value } = condition;

    switch (operator) {
      case '>':
        return actualValue > value;
      case '<':
        return actualValue < value;
      case '>=':
        return actualValue >= value;
      case '<=':
        return actualValue <= value;
      case '!=':
        return actualValue !== value;
      case 'contains':
        return Array.isArray(actualValue) && actualValue.includes(value);
      case 'not_contains':
        return Array.isArray(actualValue) && !actualValue.includes(value);
      case 'exists':
        return actualValue !== undefined && actualValue !== null;
      case 'not_exists':
        return actualValue === undefined || actualValue === null;
      default:
        return actualValue === value;
    }
  }

  /**
   * Apply an effect to the world state
   */
  private applyEffect(state: WorldState, key: string, value: any): void {
    if (typeof value === 'object' && value.operation) {
      this.applyOperationEffect(state, key, value);
    } else {
      state[key] = value;
    }
  }

  /**
   * Apply operation-based effects (increment, decrement, push, etc.)
   */
  private applyOperationEffect(state: WorldState, key: string, effect: any): void {
    const { operation, value } = effect;
    
    switch (operation) {
      case 'increment':
        state[key] = (state[key] || 0) + (value || 1);
        break;
      case 'decrement':
        state[key] = (state[key] || 0) - (value || 1);
        break;
      case 'push':
        if (!Array.isArray(state[key])) {state[key] = [];}
        state[key].push(value);
        break;
      case 'remove':
        if (Array.isArray(state[key])) {
          state[key] = state[key].filter((item: any) => item !== value);
        }
        break;
      case 'toggle':
        state[key] = !state[key];
        break;
      case 'merge':
        if (typeof state[key] === 'object' && typeof value === 'object') {
          state[key] = { ...state[key], ...value };
        } else {
          state[key] = value;
        }
        break;
      default:
        state[key] = value;
    }
  }

  /**
   * Calculate distance between arrays
   */
  private calculateArrayDistance(current: any[], target: any[]): number {
    const maxLength = Math.max(current.length, target.length);
    let distance = Math.abs(current.length - target.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (i >= current.length || i >= target.length) {
        distance += 1;
      } else if (current[i] !== target[i]) {
        distance += 1;
      }
    }
    
    return distance;
  }

  /**
   * Calculate distance between objects
   */
  private calculateObjectDistance(current: any, target: any): number {
    const allKeys = new Set([...Object.keys(current), ...Object.keys(target)]);
    let distance = 0;
    
    for (const key of allKeys) {
      if (!(key in current)) {distance += 1;}
      else if (!(key in target)) {distance += 1;}
      else if (current[key] !== target[key]) {distance += 1;}
    }
    
    return distance;
  }

  /**
   * Deep clone object
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Check if arrays are equal
   */
  private arraysEqual(a: any[], b: any[]): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
  }
}