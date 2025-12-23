/**
 * GOAP (Goal-Oriented Action Planning) System Types
 * Enables autonomous agents to plan and execute warehouse operations
 */

export interface WorldState {
  [key: string]: any;
}

export interface Action {
  id: string;
  name: string;
  description: string;
  preconditions: WorldState;
  effects: WorldState;
  cost: number;
  priority?: number;
  execute: (worldState: WorldState, parameters?: any) => Promise<ActionResult>;
  validate?: (worldState: WorldState, parameters?: any) => boolean;
  parameters?: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  newWorldState: WorldState;
  message?: string;
  duration?: number;
  error?: string;
}

export interface Goal {
  id: string;
  name: string;
  description: string;
  targetState: WorldState;
  priority: number;
  deadline?: Date;
  requester?: string;
  context?: Record<string, any>;
}

export interface Plan {
  id: string;
  goal: Goal;
  actions: Action[];
  estimatedCost: number;
  estimatedDuration: number;
  createdAt: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
}

export interface PlanNode {
  action: Action;
  worldState: WorldState;
  cost: number;
  parent?: PlanNode;
  children?: PlanNode[];
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  capabilities: string[];
  currentPlan?: Plan;
  worldState: WorldState;
  isActive: boolean;
  location?: string;
  priority: number;
}

export enum AgentType {
  WAREHOUSE_MANAGER = 'warehouse_manager',
  INVENTORY_SPECIALIST = 'inventory_specialist',
  SHIPPING_AGENT = 'shipping_agent',
  RECEIVING_AGENT = 'receiving_agent',
  QUALITY_INSPECTOR = 'quality_inspector',
  MAINTENANCE_TECH = 'maintenance_tech',
  LOGISTICS_COORDINATOR = 'logistics_coordinator',
  AUTONOMOUS_ROBOT = 'autonomous_robot'
}

export interface PlannerConfig {
  maxDepth: number;
  timeoutMs: number;
  allowPartialPlans: boolean;
  costWeight: number;
  priorityWeight: number;
}

export interface ExecutionContext {
  agent: Agent;
  plan: Plan;
  currentActionIndex: number;
  startTime: Date;
  variables: Record<string, any>;
}

export interface PlannerResult {
  plan?: Plan;
  success: boolean;
  message: string;
  exploredNodes: number;
  planningTime: number;
}

// Warehouse-specific state keys
export const StateKeys = {
  // Inventory
  ITEM_QUANTITY: 'item_quantity',
  ITEM_LOCATION: 'item_location',
  ITEM_RESERVED: 'item_reserved',
  LOW_STOCK_ITEMS: 'low_stock_items',
  
  // Orders
  ORDER_STATUS: 'order_status',
  ORDER_PRIORITY: 'order_priority',
  ORDERS_IN_QUEUE: 'orders_in_queue',
  ORDERS_READY_TO_SHIP: 'orders_ready_to_ship',
  
  // Warehouse Operations
  DOCK_AVAILABLE: 'dock_available',
  TRUCK_ARRIVED: 'truck_arrived',
  STAFF_AVAILABLE: 'staff_available',
  EQUIPMENT_AVAILABLE: 'equipment_available',
  
  // Quality & Compliance
  ITEMS_NEED_INSPECTION: 'items_need_inspection',
  EXPIRED_ITEMS: 'expired_items',
  COMPLIANCE_CHECK_NEEDED: 'compliance_check_needed',
  
  // Maintenance
  EQUIPMENT_NEEDS_MAINTENANCE: 'equipment_needs_maintenance',
  MAINTENANCE_SCHEDULED: 'maintenance_scheduled',
  
  // Logistics
  ROUTES_OPTIMIZED: 'routes_optimized',
  SHIPMENTS_READY: 'shipments_ready',
  DELIVERY_SCHEDULED: 'delivery_scheduled'
} as const;

export type StateKey = typeof StateKeys[keyof typeof StateKeys];