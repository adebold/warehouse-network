/**
 * Warehouse-Specific GOAP Actions Library
 * Defines all actions that autonomous agents can perform in warehouse operations
 */

import { Action, WorldState, ActionResult, StateKeys } from '../types';

export class WarehouseActions {
  
  /**
   * Get all available warehouse actions
   */
  static getAllActions(): Action[] {
    return [
      ...this.getInventoryActions(),
      ...this.getOrderActions(),
      ...this.getShippingActions(),
      ...this.getMaintenanceActions(),
      ...this.getQualityActions(),
      ...this.getLogisticsActions()
    ];
  }

  /**
   * Inventory Management Actions
   */
  static getInventoryActions(): Action[] {
    return [
      {
        id: 'receive_inventory',
        name: 'Receive Inventory',
        description: 'Process incoming inventory shipment',
        preconditions: {
          [StateKeys.DOCK_AVAILABLE]: true,
          [StateKeys.STAFF_AVAILABLE]: true,
          [StateKeys.TRUCK_ARRIVED]: true
        },
        effects: {
          [StateKeys.ITEM_QUANTITY]: { operation: 'increment', value: 1 },
          [StateKeys.TRUCK_ARRIVED]: false,
          [StateKeys.ITEMS_NEED_INSPECTION]: { operation: 'push', value: 'new_items' }
        },
        cost: 5,
        priority: 8,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            // Simulate inventory receiving process
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const itemId = params?.itemId || `item_${Date.now()}`;
            const quantity = params?.quantity || 1;
            
            const newState = { ...worldState };
            newState[StateKeys.ITEM_QUANTITY] = {
              ...newState[StateKeys.ITEM_QUANTITY],
              [itemId]: (newState[StateKeys.ITEM_QUANTITY]?.[itemId] || 0) + quantity
            };
            
            return {
              success: true,
              newWorldState: newState,
              message: `Received ${quantity} units of ${itemId}`,
              duration: 2000
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to receive inventory: ${error}`
            };
          }
        }
      },

      {
        id: 'move_inventory',
        name: 'Move Inventory',
        description: 'Relocate inventory items within warehouse',
        preconditions: {
          [StateKeys.STAFF_AVAILABLE]: true,
          [StateKeys.EQUIPMENT_AVAILABLE]: true
        },
        effects: {
          [StateKeys.ITEM_LOCATION]: { operation: 'merge', value: {} }
        },
        cost: 3,
        priority: 5,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            const { itemId, fromLocation, toLocation } = params || {};
            
            if (!itemId || !fromLocation || !toLocation) {
              throw new Error('Missing required parameters');
            }

            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const newState = { ...worldState };
            newState[StateKeys.ITEM_LOCATION] = {
              ...newState[StateKeys.ITEM_LOCATION],
              [itemId]: toLocation
            };
            
            return {
              success: true,
              newWorldState: newState,
              message: `Moved ${itemId} from ${fromLocation} to ${toLocation}`,
              duration: 1500
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to move inventory: ${error}`
            };
          }
        }
      },

      {
        id: 'check_inventory_levels',
        name: 'Check Inventory Levels',
        description: 'Audit current inventory quantities',
        preconditions: {
          [StateKeys.STAFF_AVAILABLE]: true
        },
        effects: {
          [StateKeys.LOW_STOCK_ITEMS]: []
        },
        cost: 2,
        priority: 6,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const minThreshold = params?.threshold || 10;
            const itemQuantities = worldState[StateKeys.ITEM_QUANTITY] || {};
            const lowStockItems = Object.entries(itemQuantities)
              .filter(([_, quantity]) => Number(quantity) < minThreshold)
              .map(([itemId]) => itemId);
            
            const newState = { ...worldState };
            newState[StateKeys.LOW_STOCK_ITEMS] = lowStockItems;
            
            return {
              success: true,
              newWorldState: newState,
              message: `Found ${lowStockItems.length} low stock items`,
              duration: 1000
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to check inventory: ${error}`
            };
          }
        }
      }
    ];
  }

  /**
   * Order Processing Actions
   */
  static getOrderActions(): Action[] {
    return [
      {
        id: 'pick_order',
        name: 'Pick Order',
        description: 'Pick items for customer order',
        preconditions: {
          [StateKeys.STAFF_AVAILABLE]: true,
          [StateKeys.ORDERS_IN_QUEUE]: { operator: '>', value: 0 }
        },
        effects: {
          [StateKeys.ORDER_STATUS]: 'picked',
          [StateKeys.ITEM_RESERVED]: { operation: 'increment', value: 1 }
        },
        cost: 4,
        priority: 9,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            const orderId = params?.orderId || worldState[StateKeys.ORDERS_IN_QUEUE]?.[0];
            
            if (!orderId) {
              throw new Error('No order to pick');
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const newState = { ...worldState };
            newState[StateKeys.ORDER_STATUS] = {
              ...newState[StateKeys.ORDER_STATUS],
              [orderId]: 'picked'
            };
            
            return {
              success: true,
              newWorldState: newState,
              message: `Order ${orderId} picked successfully`,
              duration: 3000
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to pick order: ${error}`
            };
          }
        }
      },

      {
        id: 'pack_order',
        name: 'Pack Order',
        description: 'Package picked items for shipping',
        preconditions: {
          [StateKeys.ORDER_STATUS]: 'picked',
          [StateKeys.STAFF_AVAILABLE]: true
        },
        effects: {
          [StateKeys.ORDER_STATUS]: 'packed'
        },
        cost: 3,
        priority: 8,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            const orderId = params?.orderId;
            
            if (!orderId) {
              throw new Error('Order ID required for packing');
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const newState = { ...worldState };
            newState[StateKeys.ORDER_STATUS] = {
              ...newState[StateKeys.ORDER_STATUS],
              [orderId]: 'packed'
            };
            
            return {
              success: true,
              newWorldState: newState,
              message: `Order ${orderId} packed successfully`,
              duration: 2000
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to pack order: ${error}`
            };
          }
        }
      }
    ];
  }

  /**
   * Shipping and Logistics Actions
   */
  static getShippingActions(): Action[] {
    return [
      {
        id: 'schedule_shipment',
        name: 'Schedule Shipment',
        description: 'Schedule packed orders for shipping',
        preconditions: {
          [StateKeys.ORDER_STATUS]: 'packed',
          [StateKeys.DOCK_AVAILABLE]: true
        },
        effects: {
          [StateKeys.ORDERS_READY_TO_SHIP]: { operation: 'push', value: 'order' },
          [StateKeys.DELIVERY_SCHEDULED]: true
        },
        cost: 2,
        priority: 7,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            const orderId = params?.orderId;
            const deliveryDate = params?.deliveryDate || new Date(Date.now() + 86400000).toISOString();
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const newState = { ...worldState };
            newState[StateKeys.ORDERS_READY_TO_SHIP] = [
              ...(newState[StateKeys.ORDERS_READY_TO_SHIP] || []),
              orderId
            ];
            newState[StateKeys.DELIVERY_SCHEDULED] = true;
            
            return {
              success: true,
              newWorldState: newState,
              message: `Shipment scheduled for ${orderId} on ${deliveryDate}`,
              duration: 1000
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to schedule shipment: ${error}`
            };
          }
        }
      },

      {
        id: 'optimize_routes',
        name: 'Optimize Delivery Routes',
        description: 'Calculate optimal delivery routes',
        preconditions: {
          [StateKeys.ORDERS_READY_TO_SHIP]: { operator: '>', value: 0 }
        },
        effects: {
          [StateKeys.ROUTES_OPTIMIZED]: true
        },
        cost: 4,
        priority: 6,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            const ordersToRoute = worldState[StateKeys.ORDERS_READY_TO_SHIP] || [];
            
            await new Promise(resolve => setTimeout(resolve, 2500));
            
            const newState = { ...worldState };
            newState[StateKeys.ROUTES_OPTIMIZED] = true;
            
            return {
              success: true,
              newWorldState: newState,
              message: `Routes optimized for ${ordersToRoute.length} shipments`,
              duration: 2500
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to optimize routes: ${error}`
            };
          }
        }
      }
    ];
  }

  /**
   * Maintenance Actions
   */
  static getMaintenanceActions(): Action[] {
    return [
      {
        id: 'perform_maintenance',
        name: 'Perform Equipment Maintenance',
        description: 'Conduct scheduled equipment maintenance',
        preconditions: {
          [StateKeys.EQUIPMENT_NEEDS_MAINTENANCE]: { operator: '>', value: 0 },
          [StateKeys.STAFF_AVAILABLE]: true
        },
        effects: {
          [StateKeys.EQUIPMENT_NEEDS_MAINTENANCE]: { operation: 'remove', value: 'equipment' },
          [StateKeys.EQUIPMENT_AVAILABLE]: true
        },
        cost: 6,
        priority: 7,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            const equipmentId = params?.equipmentId;
            
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            const newState = { ...worldState };
            const maintenanceList = newState[StateKeys.EQUIPMENT_NEEDS_MAINTENANCE] || [];
            newState[StateKeys.EQUIPMENT_NEEDS_MAINTENANCE] = maintenanceList.filter(
              (id: string) => id !== equipmentId
            );
            
            return {
              success: true,
              newWorldState: newState,
              message: `Maintenance completed for ${equipmentId}`,
              duration: 4000
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to perform maintenance: ${error}`
            };
          }
        }
      }
    ];
  }

  /**
   * Quality Control Actions
   */
  static getQualityActions(): Action[] {
    return [
      {
        id: 'inspect_items',
        name: 'Inspect Items',
        description: 'Perform quality inspection on items',
        preconditions: {
          [StateKeys.ITEMS_NEED_INSPECTION]: { operator: '>', value: 0 },
          [StateKeys.STAFF_AVAILABLE]: true
        },
        effects: {
          [StateKeys.ITEMS_NEED_INSPECTION]: { operation: 'remove', value: 'items' }
        },
        cost: 3,
        priority: 8,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            const itemBatch = params?.itemBatch || 'unknown_batch';
            
            await new Promise(resolve => setTimeout(resolve, 2500));
            
            const newState = { ...worldState };
            const inspectionList = newState[StateKeys.ITEMS_NEED_INSPECTION] || [];
            newState[StateKeys.ITEMS_NEED_INSPECTION] = inspectionList.filter(
              (batch: string) => batch !== itemBatch
            );
            
            return {
              success: true,
              newWorldState: newState,
              message: `Quality inspection completed for ${itemBatch}`,
              duration: 2500
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to inspect items: ${error}`
            };
          }
        }
      }
    ];
  }

  /**
   * Logistics Coordination Actions
   */
  static getLogisticsActions(): Action[] {
    return [
      {
        id: 'coordinate_resources',
        name: 'Coordinate Resources',
        description: 'Allocate staff and equipment efficiently',
        preconditions: {
          [StateKeys.ORDERS_IN_QUEUE]: { operator: '>', value: 0 }
        },
        effects: {
          [StateKeys.STAFF_AVAILABLE]: true,
          [StateKeys.EQUIPMENT_AVAILABLE]: true
        },
        cost: 2,
        priority: 5,
        execute: async (worldState: WorldState, params?: any): Promise<ActionResult> => {
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const newState = { ...worldState };
            newState[StateKeys.STAFF_AVAILABLE] = true;
            newState[StateKeys.EQUIPMENT_AVAILABLE] = true;
            
            return {
              success: true,
              newWorldState: newState,
              message: 'Resources coordinated successfully',
              duration: 1000
            };
          } catch (error) {
            return {
              success: false,
              newWorldState: worldState,
              error: `Failed to coordinate resources: ${error}`
            };
          }
        }
      }
    ];
  }

  /**
   * Get actions filtered by agent capabilities
   */
  static getActionsForCapabilities(capabilities: string[]): Action[] {
    const allActions = this.getAllActions();
    
    return allActions.filter(action => {
      // Map action types to required capabilities
      const actionCapabilityMap: { [key: string]: string[] } = {
        'receive_inventory': ['receiving', 'inventory_management'],
        'move_inventory': ['inventory_management', 'equipment_operation'],
        'pick_order': ['order_fulfillment', 'inventory_management'],
        'pack_order': ['packaging', 'order_fulfillment'],
        'schedule_shipment': ['shipping', 'logistics'],
        'optimize_routes': ['logistics', 'route_planning'],
        'perform_maintenance': ['maintenance', 'equipment_operation'],
        'inspect_items': ['quality_control', 'inspection'],
        'coordinate_resources': ['management', 'coordination']
      };
      
      const requiredCapabilities = actionCapabilityMap[action.id] || [];
      return requiredCapabilities.length === 0 || 
             requiredCapabilities.some(cap => capabilities.includes(cap));
    });
  }
}