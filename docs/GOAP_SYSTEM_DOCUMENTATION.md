# 🧠 GOAP System Documentation

## Goal-Oriented Action Planning for Warehouse Operations

### Overview

The GOAP (Goal-Oriented Action Planning) system enables autonomous agents to plan and execute complex warehouse operations by automatically determining the optimal sequence of actions needed to achieve specific goals.

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GOAP System   │    │    Planner      │    │   Executor      │
│   (Orchestrator)│────│   (A* Search)   │────│ (Action Runner) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │ State Manager   │              │
         └──────────────│  (World State)  │──────────────┘
                        └─────────────────┘
                                 │
                    ┌─────────────────────────────┐
                    │        Actions Library      │
                    │  • Inventory Management     │
                    │  • Order Processing         │
                    │  • Quality Control          │
                    │  • Maintenance              │
                    │  • Shipping & Logistics     │
                    └─────────────────────────────┘
```

## 🎯 Core Components

### 1. GOAP System (src/goap/index.ts)
Main orchestrator that coordinates all system components.

```typescript
const goapSystem = new GOAPSystem({
  maxPlanningDepth: 10,
  planningTimeoutMs: 30000,
  executionTimeoutMs: 300000,
  enableLogging: true
});

await goapSystem.start();
```

### 2. State Manager (src/goap/state-manager.ts)
Manages world state transitions and validations.

```typescript
const stateManager = new StateManager();
const worldState = stateManager.getWarehouseSnapshot();
```

### 3. Planner (src/goap/planner.ts)
Uses A* algorithm to find optimal action sequences.

```typescript
const planner = new GOAPPlanner(stateManager);
const result = await planner.plan(goal, worldState, actions);
```

### 4. Executor (src/goap/executor.ts)
Executes planned action sequences with error handling.

```typescript
const executor = new GOAPExecutor(stateManager);
const result = await executor.executePlan(plan, agent, worldState);
```

## 🤖 Agent Types

### Available Agent Types
- **Warehouse Manager**: Overall coordination and optimization
- **Inventory Specialist**: Stock management and receiving
- **Shipping Agent**: Order fulfillment and logistics
- **Receiving Agent**: Inbound processing
- **Quality Inspector**: Quality control and compliance
- **Maintenance Tech**: Equipment maintenance
- **Logistics Coordinator**: Route optimization
- **Autonomous Robot**: Automated material handling

### Creating Agents

```typescript
// Create individual agents
const manager = WarehouseAgents.createWarehouseManager('mgr-001', 'John Manager');

// Create complete warehouse team
const team = WarehouseAgents.createWarehouseTeam('warehouse-001');
```

## 🎯 Goals and Actions

### Goal Definition

```typescript
const goal: Goal = {
  id: 'fulfill-orders-001',
  name: 'Fulfill Customer Orders',
  description: 'Process pending customer orders',
  targetState: {
    [StateKeys.ORDERS_IN_QUEUE]: { operator: '<', value: 5 },
    [StateKeys.ORDERS_READY_TO_SHIP]: { operator: '>', value: 10 }
  },
  priority: 9,
  deadline: new Date(Date.now() + 3600000), // 1 hour
  context: { type: 'order_fulfillment', urgent: true }
};
```

### Available Actions

#### Inventory Actions
- **receive_inventory**: Process incoming shipments
- **move_inventory**: Relocate items within warehouse
- **check_inventory_levels**: Audit stock quantities

#### Order Actions
- **pick_order**: Pick items for customer orders
- **pack_order**: Package picked items
- **schedule_shipment**: Schedule for shipping

#### Quality Actions
- **inspect_items**: Quality control inspection
- **compliance_check**: Regulatory compliance

#### Maintenance Actions
- **perform_maintenance**: Equipment servicing
- **schedule_maintenance**: Plan maintenance windows

## 🔄 World State

### State Keys
The system tracks various warehouse states:

```typescript
const StateKeys = {
  // Inventory
  ITEM_QUANTITY: 'item_quantity',
  ITEM_LOCATION: 'item_location',
  LOW_STOCK_ITEMS: 'low_stock_items',
  
  // Orders
  ORDER_STATUS: 'order_status',
  ORDERS_IN_QUEUE: 'orders_in_queue',
  ORDERS_READY_TO_SHIP: 'orders_ready_to_ship',
  
  // Operations
  DOCK_AVAILABLE: 'dock_available',
  STAFF_AVAILABLE: 'staff_available',
  EQUIPMENT_AVAILABLE: 'equipment_available'
};
```

### State Conditions
Actions can use complex state conditions:

```typescript
// Simple equality
{ [StateKeys.DOCK_AVAILABLE]: true }

// Operators
{ [StateKeys.ORDERS_IN_QUEUE]: { operator: '>', value: 5 } }

// Array operations
{ [StateKeys.LOW_STOCK_ITEMS]: { operator: 'contains', value: 'item-123' } }
```

## 🚀 Usage Examples

### Basic Setup

```typescript
import { GOAPSystem, WarehouseAgents } from './src/goap';

// Initialize system
const system = new GOAPSystem();
await system.start();

// Create warehouse team
const team = system.createWarehouseTeam('warehouse-001');

// Define goal
const goal = {
  id: 'process-orders',
  name: 'Process Pending Orders',
  targetState: { orders_in_queue: [] },
  priority: 8
};

// Assign goal
const assignment = await system.assignGoal(goal);

// Execute plan
if (assignment?.plan) {
  await system.executePlan(assignment.agent.id);
}
```

### Advanced Scenario

```typescript
// Emergency response scenario
const emergencyGoal = {
  id: 'emergency-response',
  name: 'Handle Critical Shortage',
  targetState: {
    [StateKeys.LOW_STOCK_ITEMS]: { operator: '<', value: 2 },
    [StateKeys.ORDERS_IN_QUEUE]: []
  },
  priority: 10,
  deadline: new Date(Date.now() + 1800000), // 30 minutes
  context: { type: 'emergency_response', severity: 'critical' }
};

const result = await system.assignGoal(emergencyGoal);
```

## 📊 Monitoring and Metrics

### System Status

```typescript
const status = system.getStatus();
console.log(`Active Agents: ${status.activeAgents}`);
console.log(`Running Plans: ${status.runningPlans}`);
console.log(`Completed Plans: ${status.completedPlans}`);
```

### Agent Performance

```typescript
const agents = system.getAgents();
agents.forEach(agent => {
  console.log(`${agent.name}: ${agent.isActive ? 'Active' : 'Inactive'}`);
  console.log(`  Capabilities: ${agent.capabilities.join(', ')}`);
  console.log(`  Priority: ${agent.priority}`);
});
```

### Plan Execution

```typescript
const plans = system.getActivePlans();
plans.forEach(plan => {
  console.log(`Plan: ${plan.goal.name}`);
  console.log(`Status: ${plan.status}`);
  console.log(`Actions: ${plan.actions.length}`);
  console.log(`Estimated Cost: ${plan.estimatedCost}`);
});
```

## 🧪 Testing

### Run Tests
```bash
# Run all GOAP tests
npm run test:goap

# Run warehouse simulation
npm run simulate:warehouse
```

### Test Components
```typescript
import { runGOAPTests } from './src/goap/test-runner';

await runGOAPTests();
```

## 🔧 Configuration

### System Configuration
```typescript
const config = {
  maxPlanningDepth: 12,        // Maximum action sequence length
  planningTimeoutMs: 45000,    // Planning timeout
  executionTimeoutMs: 600000,  // Execution timeout
  enableLogging: true,         // Enable console logging
  enableMetrics: true          // Enable performance metrics
};
```

### Planner Configuration
```typescript
const plannerConfig = {
  maxDepth: 10,
  timeoutMs: 30000,
  allowPartialPlans: true,
  costWeight: 1.0,
  priorityWeight: 0.5
};
```

## 🎭 Real-World Scenarios

### Scenario 1: Order Rush
```typescript
// Black Friday scenario with order surge
const rushGoal = {
  id: 'handle-order-rush',
  name: 'Handle Order Rush',
  targetState: {
    orders_in_queue: { operator: '<', value: 20 },
    orders_ready_to_ship: { operator: '>', value: 100 }
  },
  priority: 10,
  context: { type: 'peak_demand', event: 'black_friday' }
};
```

### Scenario 2: Supply Chain Disruption
```typescript
// Handle supplier delays and stock shortages
const disruptionGoal = {
  id: 'supply-disruption',
  name: 'Manage Supply Disruption',
  targetState: {
    low_stock_items: [],
    alternative_suppliers_contacted: true,
    emergency_reorder_placed: true
  },
  priority: 9,
  context: { type: 'supply_chain_disruption', severity: 'moderate' }
};
```

### Scenario 3: Equipment Failure
```typescript
// Respond to critical equipment failure
const equipmentGoal = {
  id: 'equipment-failure',
  name: 'Handle Equipment Failure',
  targetState: {
    equipment_needs_maintenance: [],
    backup_equipment_deployed: true,
    operations_resumed: true
  },
  priority: 10,
  context: { type: 'equipment_failure', equipment: 'main_conveyor' }
};
```

## 🔍 Troubleshooting

### Common Issues

1. **Planning Timeout**
   - Reduce `maxPlanningDepth`
   - Simplify goal conditions
   - Increase `planningTimeoutMs`

2. **No Suitable Agent**
   - Check agent capabilities
   - Verify agent availability
   - Review goal requirements

3. **Action Execution Failure**
   - Validate world state
   - Check action preconditions
   - Review error logs

### Debug Mode
```typescript
const system = new GOAPSystem({
  enableLogging: true,
  enableMetrics: true
});

// Monitor execution in real-time
system.onPlanExecution((event) => {
  console.log(`Action: ${event.action.name}, Status: ${event.status}`);
});
```

## 📈 Performance Optimization

### Best Practices
1. **Limit Planning Depth**: Keep action sequences under 12 steps
2. **Optimize Actions**: Minimize action costs and execution time
3. **Agent Specialization**: Use specialized agents for specific tasks
4. **State Management**: Keep world state minimal and focused
5. **Concurrent Planning**: Allow multiple agents to plan simultaneously

### Metrics Monitoring
- Average planning time: < 5 seconds
- Action execution time: < 30 seconds per action
- Plan success rate: > 85%
- System throughput: > 10 goals per minute

## 🚀 Future Enhancements

### Planned Features
- **Machine Learning Integration**: Learn from execution patterns
- **Dynamic Action Generation**: Create actions based on context
- **Multi-Warehouse Coordination**: Cross-warehouse optimization
- **Predictive Planning**: Anticipate future scenarios
- **Real-time Adaptation**: Adjust plans during execution

### Integration Opportunities
- **IoT Sensors**: Real-time warehouse monitoring
- **ERP Systems**: Business system integration
- **Robotics APIs**: Direct robot control
- **Supply Chain APIs**: External coordination

---

## 📚 API Reference

### Core Classes
- `GOAPSystem`: Main system orchestrator
- `GOAPPlanner`: A* planning algorithm
- `GOAPExecutor`: Plan execution engine
- `StateManager`: World state management
- `WarehouseActions`: Action library
- `WarehouseAgents`: Agent factory

### Key Interfaces
- `Goal`: Goal specification
- `Action`: Action definition
- `Agent`: Agent configuration
- `Plan`: Execution plan
- `WorldState`: System state

For detailed API documentation, see TypeScript definitions in each module.