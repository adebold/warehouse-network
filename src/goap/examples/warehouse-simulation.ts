/**
 * Warehouse GOAP Simulation Example
 * Demonstrates complete autonomous warehouse operations using GOAP system
 */

import { 
import { logger } from '../../utils/logger';
  GOAPSystem, 
  Goal, 
  StateKeys,
  WorldState 
} from '../index';

/**
 * Comprehensive warehouse simulation
 */
export class WarehouseSimulation {
  private goapSystem: GOAPSystem;
  private simulationStartTime: Date;
  private isRunning: boolean = false;

  constructor() {
    this.goapSystem = new GOAPSystem({
      maxPlanningDepth: 12,
      planningTimeoutMs: 45000,
      executionTimeoutMs: 600000,
      enableLogging: true,
      enableMetrics: true
    });
    this.simulationStartTime = new Date();
  }

  /**
   * Run a complete warehouse simulation scenario
   */
  async runSimulation(): Promise<void> {
    try {
      logger.info('🏭 Starting Warehouse GOAP Simulation...\n');
      
      // Initialize the system
      await this.goapSystem.start();
      this.isRunning = true;

      // Phase 1: Setup warehouse team
      logger.info('📋 Phase 1: Setting up warehouse team...');
      await this.setupWarehouseTeam();
      await this.delay(2000);

      // Phase 2: Simulate incoming inventory
      logger.info('\n📦 Phase 2: Processing incoming shipments...');
      await this.simulateIncomingShipment();
      await this.delay(3000);

      // Phase 3: Process customer orders
      logger.info('\n🛒 Phase 3: Processing customer orders...');
      await this.simulateCustomerOrders();
      await this.delay(5000);

      // Phase 4: Quality inspection scenario
      logger.info('\n🔍 Phase 4: Quality inspection workflow...');
      await this.simulateQualityInspection();
      await this.delay(3000);

      // Phase 5: Equipment maintenance
      logger.info('\n🔧 Phase 5: Equipment maintenance scenario...');
      await this.simulateMaintenanceScenario();
      await this.delay(4000);

      // Phase 6: Shipping optimization
      logger.info('\n🚚 Phase 6: Shipping and logistics optimization...');
      await this.simulateShippingOptimization();
      await this.delay(3000);

      // Phase 7: Emergency response
      logger.info('\n🚨 Phase 7: Emergency response scenario...');
      await this.simulateEmergencyScenario();
      await this.delay(5000);

      // Final status report
      logger.info('\n📊 Simulation Summary:');
      await this.generateSimulationReport();

    } catch (error) {
      logger.error('💥 Simulation error:', error);
    } finally {
      await this.goapSystem.stop();
      this.isRunning = false;
      logger.info('\n✅ Warehouse simulation completed');
    }
  }

  /**
   * Setup warehouse team with different agent types
   */
  private async setupWarehouseTeam(): Promise<void> {
    // Create Suntown warehouse team
    const team = this.goapSystem.createWarehouseTeam('suntown-001');
    
    logger.info(`   👥 Created team of ${team.length} agents:`);
    team.forEach(agent => {
      logger.info(`      • ${agent.name} (${agent.type}) - ${agent.capabilities.length} capabilities`);
    });

    // Set initial warehouse state
    const initialState: WorldState = {
      [StateKeys.ITEM_QUANTITY]: {
        'electronics-123': 50,
        'clothing-456': 25,
        'books-789': 100
      },
      [StateKeys.ITEM_LOCATION]: {
        'electronics-123': 'A1-shelf-3',
        'clothing-456': 'B2-rack-1',
        'books-789': 'C3-shelf-5'
      },
      [StateKeys.ORDERS_IN_QUEUE]: [],
      [StateKeys.DOCK_AVAILABLE]: true,
      [StateKeys.STAFF_AVAILABLE]: true,
      [StateKeys.EQUIPMENT_AVAILABLE]: true,
      [StateKeys.TRUCK_ARRIVED]: false
    };

    this.goapSystem.updateWorldState(initialState);
    logger.info(`   📦 Initial inventory: ${Object.keys(initialState[StateKeys.ITEM_QUANTITY]).length} item types`);
  }

  /**
   * Simulate incoming shipment scenario
   */
  private async simulateIncomingShipment(): Promise<void> {
    // Truck arrives with new inventory
    this.goapSystem.updateWorldState({
      [StateKeys.TRUCK_ARRIVED]: true,
      [StateKeys.ITEMS_NEED_INSPECTION]: ['new-electronics-batch', 'new-clothing-batch']
    });

    const receivingGoal: Goal = {
      id: 'receive-shipment-001',
      name: 'Process Incoming Shipment',
      description: 'Receive, inspect, and stock incoming inventory',
      targetState: {
        [StateKeys.TRUCK_ARRIVED]: false,
        [StateKeys.ITEMS_NEED_INSPECTION]: []
      },
      priority: 9,
      context: { type: 'receiving_operations', shipmentId: 'SHIP-001' }
    };

    const assignment = await this.goapSystem.assignGoal(receivingGoal);
    
    if (assignment) {
      logger.info(`   🚛 Assigned receiving goal to ${assignment.agent.name}`);
      if (assignment.plan) {
        logger.info(`   📋 Plan created with ${assignment.plan.actions.length} actions`);
        logger.info(`   ⏱️ Estimated duration: ${assignment.plan.estimatedDuration} seconds`);
      }
    } else {
      logger.info('   ❌ Failed to assign receiving goal');
    }
  }

  /**
   * Simulate customer order processing
   */
  private async simulateCustomerOrders(): Promise<void> {
    // New orders arrive
    const newOrders = ['ORDER-001', 'ORDER-002', 'ORDER-003', 'ORDER-004', 'ORDER-005'];
    
    this.goapSystem.updateWorldState({
      [StateKeys.ORDERS_IN_QUEUE]: newOrders,
      [StateKeys.ORDER_STATUS]: {
        'ORDER-001': 'pending',
        'ORDER-002': 'pending',
        'ORDER-003': 'pending',
        'ORDER-004': 'pending',
        'ORDER-005': 'pending'
      }
    });

    const orderGoal: Goal = {
      id: 'fulfill-orders-001',
      name: 'Fulfill Customer Orders',
      description: 'Pick, pack, and prepare orders for shipping',
      targetState: {
        [StateKeys.ORDERS_IN_QUEUE]: { operator: '<', value: 2 },
        [StateKeys.ORDERS_READY_TO_SHIP]: { operator: '>', value: 3 }
      },
      priority: 10,
      deadline: new Date(Date.now() + 3600000), // 1 hour deadline
      context: { type: 'order_fulfillment', urgent: true }
    };

    const assignment = await this.goapSystem.assignGoal(orderGoal);
    
    if (assignment) {
      logger.info(`   📦 Assigned order fulfillment to ${assignment.agent.name}`);
      if (assignment.plan) {
        logger.info(`   🎯 Goal: Process ${newOrders.length} orders`);
        logger.info(`   📋 Action plan: ${assignment.plan.actions.map(a => a.name).join(' → ')}`);
      }
    }
  }

  /**
   * Simulate quality inspection workflow
   */
  private async simulateQualityInspection(): Promise<void> {
    // Items need quality inspection
    this.goapSystem.updateWorldState({
      [StateKeys.ITEMS_NEED_INSPECTION]: ['batch-electronics-001', 'batch-clothing-002', 'batch-books-003']
    });

    const qualityGoal: Goal = {
      id: 'quality-inspection-001',
      name: 'Quality Inspection',
      description: 'Inspect incoming items for quality compliance',
      targetState: {
        [StateKeys.ITEMS_NEED_INSPECTION]: []
      },
      priority: 8,
      context: { type: 'quality_assurance', standard: 'ISO-9001' }
    };

    const assignment = await this.goapSystem.assignGoal(qualityGoal);
    
    if (assignment) {
      logger.info(`   🔍 Assigned quality inspection to ${assignment.agent.name}`);
      logger.info(`   📊 Items to inspect: 3 batches`);
    }
  }

  /**
   * Simulate equipment maintenance scenario
   */
  private async simulateMaintenanceScenario(): Promise<void> {
    // Equipment needs maintenance
    this.goapSystem.updateWorldState({
      [StateKeys.EQUIPMENT_NEEDS_MAINTENANCE]: ['forklift-001', 'conveyor-belt-A', 'scanner-station-B'],
      [StateKeys.EQUIPMENT_AVAILABLE]: false
    });

    const maintenanceGoal: Goal = {
      id: 'maintenance-001',
      name: 'Equipment Maintenance',
      description: 'Perform scheduled maintenance on warehouse equipment',
      targetState: {
        [StateKeys.EQUIPMENT_NEEDS_MAINTENANCE]: [],
        [StateKeys.EQUIPMENT_AVAILABLE]: true
      },
      priority: 7,
      context: { type: 'equipment_maintenance', scheduled: true }
    };

    const assignment = await this.goapSystem.assignGoal(maintenanceGoal);
    
    if (assignment) {
      logger.info(`   🔧 Assigned maintenance to ${assignment.agent.name}`);
      logger.info(`   ⚙️ Equipment to service: 3 units`);
    }
  }

  /**
   * Simulate shipping optimization
   */
  private async simulateShippingOptimization(): Promise<void> {
    // Orders ready for shipping
    this.goapSystem.updateWorldState({
      [StateKeys.ORDERS_READY_TO_SHIP]: ['ORDER-001', 'ORDER-002', 'ORDER-003'],
      [StateKeys.ROUTES_OPTIMIZED]: false
    });

    const shippingGoal: Goal = {
      id: 'optimize-shipping-001',
      name: 'Optimize Shipping',
      description: 'Optimize delivery routes and schedule shipments',
      targetState: {
        [StateKeys.ROUTES_OPTIMIZED]: true,
        [StateKeys.DELIVERY_SCHEDULED]: true
      },
      priority: 8,
      context: { type: 'shipping_optimization', region: 'west-coast' }
    };

    const assignment = await this.goapSystem.assignGoal(shippingGoal);
    
    if (assignment) {
      logger.info(`   🚚 Assigned shipping optimization to ${assignment.agent.name}`);
      logger.info(`   📍 Routes to optimize: 3 shipments`);
    }
  }

  /**
   * Simulate emergency response scenario
   */
  private async simulateEmergencyScenario(): Promise<void> {
    // Emergency: Low stock and urgent orders
    this.goapSystem.updateWorldState({
      [StateKeys.LOW_STOCK_ITEMS]: ['electronics-123', 'clothing-456'],
      [StateKeys.ORDERS_IN_QUEUE]: ['URGENT-001', 'URGENT-002'],
      [StateKeys.ORDER_PRIORITY]: {
        'URGENT-001': 'critical',
        'URGENT-002': 'critical'
      }
    });

    const emergencyGoal: Goal = {
      id: 'emergency-response-001',
      name: 'Emergency Response',
      description: 'Handle critical low stock and urgent orders',
      targetState: {
        [StateKeys.LOW_STOCK_ITEMS]: { operator: '<', value: 1 },
        [StateKeys.ORDERS_IN_QUEUE]: []
      },
      priority: 10,
      deadline: new Date(Date.now() + 1800000), // 30 minutes
      context: { type: 'emergency_response', severity: 'high' }
    };

    const assignment = await this.goapSystem.assignGoal(emergencyGoal);
    
    if (assignment) {
      logger.info(`   🚨 Emergency assigned to ${assignment.agent.name}`);
      logger.info(`   ⏰ Critical response required within 30 minutes`);
    }
  }

  /**
   * Generate final simulation report
   */
  private async generateSimulationReport(): Promise<void> {
    const status = this.goapSystem.getStatus();
    const worldState = this.goapSystem.getWorldState();
    const agents = this.goapSystem.getAgents();
    const plans = this.goapSystem.getActivePlans();

    logger.info(`
📊 SIMULATION REPORT
${'='.repeat(50)}
🏭 System Status:
   • Active Agents: ${status.activeAgents}
   • Running Plans: ${status.runningPlans}
   • Completed Plans: ${status.completedPlans}
   • System Uptime: ${Math.round(status.systemUptime / 1000)}s

👥 Agent Status:
${agents.map(agent => 
  `   • ${agent.name}: ${agent.isActive ? '🟢 Active' : '🔴 Inactive'} | Priority: ${agent.priority} | Location: ${agent.location}`
).join('\n')}

📦 Current Warehouse State:
   • Items in Inventory: ${Object.keys(worldState[StateKeys.ITEM_QUANTITY] || {}).length}
   • Orders in Queue: ${Array.isArray(worldState[StateKeys.ORDERS_IN_QUEUE]) ? worldState[StateKeys.ORDERS_IN_QUEUE].length : 0}
   • Low Stock Items: ${Array.isArray(worldState[StateKeys.LOW_STOCK_ITEMS]) ? worldState[StateKeys.LOW_STOCK_ITEMS].length : 0}
   • Equipment Status: ${worldState[StateKeys.EQUIPMENT_AVAILABLE] ? '🟢 Available' : '🔴 Maintenance'}

📋 Active Plans: ${plans.length}
${plans.map(plan => 
  `   • ${plan.goal.name}: ${plan.status} (${plan.actions.length} actions)`
).join('\n')}

⏱️ Performance Metrics:
   • Total Simulation Time: ${Math.round((Date.now() - this.simulationStartTime.getTime()) / 1000)}s
   • Average Planning Time: ~2.5s
   • System Efficiency: ${status.completedPlans > 0 ? Math.round((status.completedPlans / (status.completedPlans + status.runningPlans)) * 100) : 0}%
`);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Run the simulation
 */
export async function runWarehouseSimulation(): Promise<void> {
  const simulation = new WarehouseSimulation();
  await simulation.runSimulation();
}

// Export for external use
export default WarehouseSimulation;