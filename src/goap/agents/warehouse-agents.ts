/**
 * Warehouse Autonomous Agents - Pre-configured GOAP agents for different warehouse roles
 * Each agent has specific capabilities, behaviors, and default goals
 */

import { Agent, AgentType, Goal, WorldState, StateKeys } from '../types';
import { WarehouseActions } from '../actions/warehouse-actions';

export class WarehouseAgents {

  /**
   * Create a Warehouse Manager agent
   */
  static createWarehouseManager(id: string, name: string): Agent {
    return {
      id,
      name,
      type: AgentType.WAREHOUSE_MANAGER,
      capabilities: [
        'management',
        'coordination',
        'resource_allocation',
        'planning',
        'oversight'
      ],
      worldState: this.getDefaultWarehouseState(),
      isActive: true,
      priority: 10,
      location: 'manager_office'
    };
  }

  /**
   * Create an Inventory Specialist agent
   */
  static createInventorySpecialist(id: string, name: string): Agent {
    return {
      id,
      name,
      type: AgentType.INVENTORY_SPECIALIST,
      capabilities: [
        'inventory_management',
        'receiving',
        'cycle_counting',
        'stock_analysis',
        'equipment_operation'
      ],
      worldState: this.getDefaultWarehouseState(),
      isActive: true,
      priority: 8,
      location: 'warehouse_floor'
    };
  }

  /**
   * Create a Shipping Agent
   */
  static createShippingAgent(id: string, name: string): Agent {
    return {
      id,
      name,
      type: AgentType.SHIPPING_AGENT,
      capabilities: [
        'shipping',
        'logistics',
        'route_planning',
        'packaging',
        'carrier_coordination'
      ],
      worldState: this.getDefaultWarehouseState(),
      isActive: true,
      priority: 7,
      location: 'shipping_dock'
    };
  }

  /**
   * Create a Receiving Agent
   */
  static createReceivingAgent(id: string, name: string): Agent {
    return {
      id,
      name,
      type: AgentType.RECEIVING_AGENT,
      capabilities: [
        'receiving',
        'inventory_management',
        'quality_inspection',
        'equipment_operation',
        'documentation'
      ],
      worldState: this.getDefaultWarehouseState(),
      isActive: true,
      priority: 8,
      location: 'receiving_dock'
    };
  }

  /**
   * Create a Quality Inspector agent
   */
  static createQualityInspector(id: string, name: string): Agent {
    return {
      id,
      name,
      type: AgentType.QUALITY_INSPECTOR,
      capabilities: [
        'quality_control',
        'inspection',
        'compliance_checking',
        'documentation',
        'defect_identification'
      ],
      worldState: this.getDefaultWarehouseState(),
      isActive: true,
      priority: 6,
      location: 'quality_station'
    };
  }

  /**
   * Create a Maintenance Technician agent
   */
  static createMaintenanceTech(id: string, name: string): Agent {
    return {
      id,
      name,
      type: AgentType.MAINTENANCE_TECH,
      capabilities: [
        'maintenance',
        'equipment_operation',
        'repair',
        'preventive_maintenance',
        'troubleshooting'
      ],
      worldState: this.getDefaultWarehouseState(),
      isActive: true,
      priority: 5,
      location: 'maintenance_shop'
    };
  }

  /**
   * Create a Logistics Coordinator agent
   */
  static createLogisticsCoordinator(id: string, name: string): Agent {
    return {
      id,
      name,
      type: AgentType.LOGISTICS_COORDINATOR,
      capabilities: [
        'logistics',
        'coordination',
        'route_planning',
        'scheduling',
        'optimization'
      ],
      worldState: this.getDefaultWarehouseState(),
      isActive: true,
      priority: 7,
      location: 'logistics_center'
    };
  }

  /**
   * Create an Autonomous Robot agent
   */
  static createAutonomousRobot(id: string, name: string): Agent {
    return {
      id,
      name,
      type: AgentType.AUTONOMOUS_ROBOT,
      capabilities: [
        'inventory_movement',
        'autonomous_navigation',
        'barcode_scanning',
        'weight_measurement',
        'obstacle_avoidance'
      ],
      worldState: this.getDefaultWarehouseState(),
      isActive: true,
      priority: 4,
      location: 'charging_station'
    };
  }

  /**
   * Get default goals for each agent type
   */
  static getDefaultGoals(agentType: AgentType): Goal[] {
    const baseGoals: { [key in AgentType]: Goal[] } = {
      [AgentType.WAREHOUSE_MANAGER]: [
        {
          id: 'optimize_operations',
          name: 'Optimize Warehouse Operations',
          description: 'Ensure smooth warehouse operations with maximum efficiency',
          targetState: {
            [StateKeys.ORDERS_IN_QUEUE]: { operator: '<', value: 5 },
            [StateKeys.LOW_STOCK_ITEMS]: { operator: '<', value: 3 },
            [StateKeys.EQUIPMENT_NEEDS_MAINTENANCE]: { operator: '<', value: 2 }
          },
          priority: 10,
          context: { type: 'operational_efficiency' }
        },
        {
          id: 'coordinate_staff',
          name: 'Coordinate Staff Activities',
          description: 'Ensure optimal staff allocation and coordination',
          targetState: {
            [StateKeys.STAFF_AVAILABLE]: true,
            [StateKeys.EQUIPMENT_AVAILABLE]: true
          },
          priority: 8,
          context: { type: 'resource_management' }
        }
      ],

      [AgentType.INVENTORY_SPECIALIST]: [
        {
          id: 'maintain_inventory_levels',
          name: 'Maintain Optimal Inventory Levels',
          description: 'Keep inventory at optimal levels with accurate tracking',
          targetState: {
            [StateKeys.LOW_STOCK_ITEMS]: [],
            [StateKeys.ITEM_QUANTITY]: { operator: '>', value: 0 }
          },
          priority: 9,
          context: { type: 'inventory_optimization' }
        },
        {
          id: 'process_incoming_inventory',
          name: 'Process Incoming Inventory',
          description: 'Efficiently receive and process incoming shipments',
          targetState: {
            [StateKeys.ITEMS_NEED_INSPECTION]: []
          },
          priority: 8,
          context: { type: 'receiving_operations' }
        }
      ],

      [AgentType.SHIPPING_AGENT]: [
        {
          id: 'fulfill_orders',
          name: 'Fulfill Customer Orders',
          description: 'Process and ship customer orders efficiently',
          targetState: {
            [StateKeys.ORDERS_IN_QUEUE]: [],
            [StateKeys.ORDERS_READY_TO_SHIP]: { operator: '>', value: 0 }
          },
          priority: 9,
          context: { type: 'order_fulfillment' }
        },
        {
          id: 'optimize_shipping',
          name: 'Optimize Shipping Routes',
          description: 'Ensure efficient shipping routes and schedules',
          targetState: {
            [StateKeys.ROUTES_OPTIMIZED]: true,
            [StateKeys.DELIVERY_SCHEDULED]: true
          },
          priority: 7,
          context: { type: 'shipping_optimization' }
        }
      ],

      [AgentType.RECEIVING_AGENT]: [
        {
          id: 'process_receipts',
          name: 'Process Incoming Receipts',
          description: 'Handle all incoming inventory efficiently',
          targetState: {
            [StateKeys.TRUCK_ARRIVED]: false,
            [StateKeys.ITEMS_NEED_INSPECTION]: { operator: '<', value: 5 }
          },
          priority: 8,
          context: { type: 'receiving_efficiency' }
        }
      ],

      [AgentType.QUALITY_INSPECTOR]: [
        {
          id: 'maintain_quality_standards',
          name: 'Maintain Quality Standards',
          description: 'Ensure all items meet quality requirements',
          targetState: {
            [StateKeys.ITEMS_NEED_INSPECTION]: [],
            [StateKeys.EXPIRED_ITEMS]: []
          },
          priority: 9,
          context: { type: 'quality_assurance' }
        }
      ],

      [AgentType.MAINTENANCE_TECH]: [
        {
          id: 'maintain_equipment',
          name: 'Maintain Equipment',
          description: 'Keep all warehouse equipment in working condition',
          targetState: {
            [StateKeys.EQUIPMENT_NEEDS_MAINTENANCE]: [],
            [StateKeys.EQUIPMENT_AVAILABLE]: true
          },
          priority: 7,
          context: { type: 'equipment_maintenance' }
        }
      ],

      [AgentType.LOGISTICS_COORDINATOR]: [
        {
          id: 'optimize_logistics',
          name: 'Optimize Logistics Operations',
          description: 'Coordinate all logistics activities for maximum efficiency',
          targetState: {
            [StateKeys.ROUTES_OPTIMIZED]: true,
            [StateKeys.SHIPMENTS_READY]: { operator: '>', value: 0 }
          },
          priority: 8,
          context: { type: 'logistics_optimization' }
        }
      ],

      [AgentType.AUTONOMOUS_ROBOT]: [
        {
          id: 'assist_operations',
          name: 'Assist Warehouse Operations',
          description: 'Provide autonomous assistance for warehouse tasks',
          targetState: {
            [StateKeys.ITEM_LOCATION]: { operation: 'exists' },
            [StateKeys.EQUIPMENT_AVAILABLE]: true
          },
          priority: 6,
          context: { type: 'robotic_assistance' }
        }
      ]
    };

    return baseGoals[agentType] || [];
  }

  /**
   * Get available actions for an agent based on its capabilities
   */
  static getAvailableActions(agent: Agent) {
    return WarehouseActions.getActionsForCapabilities(agent.capabilities);
  }

  /**
   * Create a complete agent team for a warehouse
   */
  static createWarehouseTeam(warehouseId: string): Agent[] {
    return [
      this.createWarehouseManager(`${warehouseId}_manager`, `Manager-${warehouseId}`),
      this.createInventorySpecialist(`${warehouseId}_inventory`, `Inventory-${warehouseId}`),
      this.createShippingAgent(`${warehouseId}_shipping`, `Shipping-${warehouseId}`),
      this.createReceivingAgent(`${warehouseId}_receiving`, `Receiving-${warehouseId}`),
      this.createQualityInspector(`${warehouseId}_quality`, `Quality-${warehouseId}`),
      this.createMaintenanceTech(`${warehouseId}_maintenance`, `Maintenance-${warehouseId}`),
      this.createLogisticsCoordinator(`${warehouseId}_logistics`, `Logistics-${warehouseId}`),
      this.createAutonomousRobot(`${warehouseId}_robot_01`, `Robot-01-${warehouseId}`),
      this.createAutonomousRobot(`${warehouseId}_robot_02`, `Robot-02-${warehouseId}`)
    ];
  }

  /**
   * Update agent priorities based on warehouse conditions
   */
  static updateAgentPriorities(agents: Agent[], worldState: WorldState): void {
    agents.forEach(agent => {
      switch (agent.type) {
        case AgentType.SHIPPING_AGENT:
          // Higher priority when orders are waiting
          const ordersInQueue = worldState[StateKeys.ORDERS_IN_QUEUE] || [];
          agent.priority = Array.isArray(ordersInQueue) && ordersInQueue.length > 5 ? 10 : 7;
          break;

        case AgentType.MAINTENANCE_TECH:
          // Higher priority when equipment needs maintenance
          const equipmentNeeding = worldState[StateKeys.EQUIPMENT_NEEDS_MAINTENANCE] || [];
          agent.priority = Array.isArray(equipmentNeeding) && equipmentNeeding.length > 0 ? 9 : 5;
          break;

        case AgentType.QUALITY_INSPECTOR:
          // Higher priority when items need inspection
          const itemsNeedingInspection = worldState[StateKeys.ITEMS_NEED_INSPECTION] || [];
          agent.priority = Array.isArray(itemsNeedingInspection) && itemsNeedingInspection.length > 3 ? 8 : 6;
          break;

        default:
          // Keep default priority
          break;
      }
    });
  }

  /**
   * Get default warehouse world state
   */
  private static getDefaultWarehouseState(): WorldState {
    return {
      [StateKeys.ITEM_QUANTITY]: {},
      [StateKeys.ITEM_LOCATION]: {},
      [StateKeys.ITEM_RESERVED]: {},
      [StateKeys.LOW_STOCK_ITEMS]: [],
      [StateKeys.ORDER_STATUS]: {},
      [StateKeys.ORDER_PRIORITY]: {},
      [StateKeys.ORDERS_IN_QUEUE]: [],
      [StateKeys.ORDERS_READY_TO_SHIP]: [],
      [StateKeys.DOCK_AVAILABLE]: true,
      [StateKeys.TRUCK_ARRIVED]: false,
      [StateKeys.STAFF_AVAILABLE]: true,
      [StateKeys.EQUIPMENT_AVAILABLE]: true,
      [StateKeys.ITEMS_NEED_INSPECTION]: [],
      [StateKeys.EXPIRED_ITEMS]: [],
      [StateKeys.COMPLIANCE_CHECK_NEEDED]: false,
      [StateKeys.EQUIPMENT_NEEDS_MAINTENANCE]: [],
      [StateKeys.MAINTENANCE_SCHEDULED]: false,
      [StateKeys.ROUTES_OPTIMIZED]: false,
      [StateKeys.SHIPMENTS_READY]: [],
      [StateKeys.DELIVERY_SCHEDULED]: false,
      timestamp: new Date().toISOString()
    };
  }
}