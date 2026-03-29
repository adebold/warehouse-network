import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  ReorderRule,
  ReorderAlert,
  AlertStatus,
  ReorderCalculation,
  InventoryError,
  NotFoundError,
  ValidationError,
  EventType,
  InventoryEvent
} from '../types';
import { EventPublisher } from './EventPublisher';
import { AuditService } from './AuditService';
import { Logger } from '../utils/logger';
import { NotificationService } from './NotificationService';
import * as dayjs from 'dayjs';

export class ReorderService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventPublisher: EventPublisher,
    private auditService: AuditService,
    private notificationService: NotificationService,
    private logger: Logger
  ) {}

  async createReorderRule(
    tenantId: string,
    rule: Omit<ReorderRule, 'id'>,
    userId: string
  ): Promise<ReorderRule> {
    try {
      // Validate SKU and warehouse exist
      const [sku, warehouse] = await Promise.all([
        this.prisma.sKU.findUnique({
          where: { skuCode: rule.skuId }
        }),
        this.prisma.warehouse.findUnique({
          where: { code: rule.warehouseId }
        })
      ]);

      if (!sku) {
        throw new NotFoundError('SKU', rule.skuId);
      }
      if (!warehouse) {
        throw new NotFoundError('Warehouse', rule.warehouseId);
      }

      // Check if rule already exists
      const existingRule = await this.prisma.reorderRule.findUnique({
        where: {
          skuId_warehouseId: {
            skuId: sku.id,
            warehouseId: warehouse.id
          }
        }
      });

      if (existingRule) {
        throw new ValidationError(
          `Reorder rule already exists for SKU ${rule.skuId} in warehouse ${rule.warehouseId}`
        );
      }

      const reorderRule = await this.prisma.reorderRule.create({
        data: {
          tenantId,
          skuId: sku.id,
          warehouseId: warehouse.id,
          reorderLevel: rule.reorderLevel,
          reorderQuantity: rule.reorderQuantity,
          leadTimeDays: rule.leadTimeDays,
          safetyStock: rule.safetyStock,
          supplierId: rule.supplierId
        }
      });

      // Create audit log
      await this.auditService.logAction(userId, 'CREATE_REORDER_RULE', 'ReorderRule', reorderRule.id, {
        rule,
        result: 'SUCCESS'
      });

      this.logger.info('Reorder rule created', {
        ruleId: reorderRule.id,
        sku: rule.skuId,
        warehouse: rule.warehouseId
      });

      return {
        id: reorderRule.id,
        skuId: rule.skuId,
        warehouseId: rule.warehouseId,
        reorderLevel: reorderRule.reorderLevel,
        reorderQuantity: reorderRule.reorderQuantity,
        leadTimeDays: reorderRule.leadTimeDays,
        safetyStock: reorderRule.safetyStock,
        supplierId: reorderRule.supplierId,
        active: reorderRule.active
      };
    } catch (error) {
      this.logger.error('Failed to create reorder rule', { rule, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to create reorder rule', 'REORDER_RULE_CREATION_ERROR', 500);
    }
  }

  async updateReorderRule(
    ruleId: string,
    updates: Partial<ReorderRule>,
    userId: string
  ): Promise<ReorderRule> {
    try {
      const existingRule = await this.prisma.reorderRule.findUnique({
        where: { id: ruleId },
        include: {
          sku: true,
          warehouse: true
        }
      });

      if (!existingRule) {
        throw new NotFoundError('ReorderRule', ruleId);
      }

      const updatedRule = await this.prisma.reorderRule.update({
        where: { id: ruleId },
        data: {
          ...(updates.reorderLevel !== undefined && { reorderLevel: updates.reorderLevel }),
          ...(updates.reorderQuantity !== undefined && { reorderQuantity: updates.reorderQuantity }),
          ...(updates.leadTimeDays !== undefined && { leadTimeDays: updates.leadTimeDays }),
          ...(updates.safetyStock !== undefined && { safetyStock: updates.safetyStock }),
          ...(updates.supplierId !== undefined && { supplierId: updates.supplierId }),
          ...(updates.active !== undefined && { active: updates.active })
        },
        include: {
          sku: true,
          warehouse: true
        }
      });

      // Create audit log
      await this.auditService.logAction(userId, 'UPDATE_REORDER_RULE', 'ReorderRule', ruleId, {
        before: existingRule,
        after: updates,
        result: 'SUCCESS'
      });

      this.logger.info('Reorder rule updated', { ruleId, updates });

      return {
        id: updatedRule.id,
        skuId: updatedRule.sku.skuCode,
        warehouseId: updatedRule.warehouse.code,
        reorderLevel: updatedRule.reorderLevel,
        reorderQuantity: updatedRule.reorderQuantity,
        leadTimeDays: updatedRule.leadTimeDays,
        safetyStock: updatedRule.safetyStock,
        supplierId: updatedRule.supplierId,
        active: updatedRule.active
      };
    } catch (error) {
      this.logger.error('Failed to update reorder rule', { ruleId, updates, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to update reorder rule', 'REORDER_RULE_UPDATE_ERROR', 500);
    }
  }

  async calculateReorderPoint(sku: string, warehouse: string): Promise<ReorderCalculation> {
    try {
      const [skuRecord, warehouseRecord] = await Promise.all([
        this.prisma.sKU.findUnique({ where: { skuCode: sku } }),
        this.prisma.warehouse.findUnique({ where: { code: warehouse } })
      ]);

      if (!skuRecord) throw new NotFoundError('SKU', sku);
      if (!warehouseRecord) throw new NotFoundError('Warehouse', warehouse);

      // Get current inventory level
      const inventoryLevel = await this.prisma.inventoryLevel.findFirst({
        where: {
          skuId: skuRecord.id,
          warehouseId: warehouseRecord.id
        }
      });

      // Get existing reorder rule
      const reorderRule = await this.prisma.reorderRule.findUnique({
        where: {
          skuId_warehouseId: {
            skuId: skuRecord.id,
            warehouseId: warehouseRecord.id
          }
        }
      });

      // Calculate average demand over last 90 days
      const averageDemand = await this.calculateAverageDemand(skuRecord.id, warehouseRecord.id, 90);

      // Get lead time (from rule or default)
      const leadTime = reorderRule?.leadTimeDays || 7;

      // Calculate safety stock (statistical or from rule)
      const safetyStock = reorderRule?.safetyStock || await this.calculateSafetyStock(
        skuRecord.id,
        warehouseRecord.id,
        averageDemand,
        leadTime
      );

      // Calculate reorder level: (Average demand × Lead time) + Safety stock
      const reorderLevel = Math.ceil((averageDemand * leadTime) + safetyStock);

      // Calculate reorder quantity (Economic Order Quantity or fixed)
      const reorderQuantity = reorderRule?.reorderQuantity || await this.calculateEOQ(
        skuRecord.id,
        averageDemand,
        Number(skuRecord.cost || 0)
      );

      const calculation: ReorderCalculation = {
        sku,
        warehouse,
        currentLevel: inventoryLevel?.onHand || 0,
        reorderLevel,
        reorderQuantity,
        leadTime,
        safetyStock,
        averageDemand,
        calculation: {
          method: reorderRule ? 'fixed' : 'statistical',
          factors: {
            averageDemand,
            leadTime,
            safetyStock,
            currentLevel: inventoryLevel?.onHand || 0,
            demandVariability: await this.calculateDemandVariability(skuRecord.id, warehouseRecord.id)
          }
        }
      };

      return calculation;
    } catch (error) {
      this.logger.error('Failed to calculate reorder point', { sku, warehouse, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to calculate reorder point', 'REORDER_CALCULATION_ERROR', 500);
    }
  }

  async checkReorderAlerts(): Promise<ReorderAlert[]> {
    try {
      // Get all active reorder rules
      const reorderRules = await this.prisma.reorderRule.findMany({
        where: { active: true },
        include: {
          sku: true,
          warehouse: true
        }
      });

      const alerts: ReorderAlert[] = [];

      for (const rule of reorderRules) {
        // Get current inventory level
        const inventoryLevel = await this.prisma.inventoryLevel.findFirst({
          where: {
            skuId: rule.skuId,
            warehouseId: rule.warehouseId
          }
        });

        const currentLevel = inventoryLevel?.available || 0;

        // Check if reorder level is reached
        if (currentLevel <= rule.reorderLevel) {
          // Check if alert already exists and is not dismissed
          const existingAlert = await this.prisma.reorderAlert.findFirst({
            where: {
              reorderRuleId: rule.id,
              status: { notIn: [AlertStatus.DISMISSED] },
              createdAt: {
                gte: dayjs().subtract(24, 'hours').toDate() // Don't create duplicate alerts within 24 hours
              }
            }
          });

          if (!existingAlert) {
            const alert = await this.prisma.reorderAlert.create({
              data: {
                reorderRuleId: rule.id,
                skuId: rule.skuId,
                warehouseId: rule.warehouseId,
                currentLevel,
                reorderLevel: rule.reorderLevel,
                suggestedQty: rule.reorderQuantity
              }
            });

            // Update last triggered timestamp
            await this.prisma.reorderRule.update({
              where: { id: rule.id },
              data: { lastTriggered: new Date() }
            });

            const reorderAlert: ReorderAlert = {
              id: alert.id,
              reorderRuleId: rule.id,
              skuId: rule.sku.skuCode,
              warehouseId: rule.warehouse.code,
              currentLevel,
              reorderLevel: rule.reorderLevel,
              suggestedQuantity: rule.reorderQuantity,
              status: AlertStatus.PENDING,
              acknowledged: false,
              createdAt: alert.createdAt
            };

            alerts.push(reorderAlert);

            // Send notification
            await this.sendReorderNotification(reorderAlert, rule);

            // Publish event
            const event: InventoryEvent = {
              eventType: EventType.REORDER_ALERT,
              timestamp: new Date(),
              data: reorderAlert
            };
            await this.eventPublisher.publish('inventory.reorder.alert', event);

            this.logger.info('Reorder alert created', {
              alertId: alert.id,
              sku: rule.sku.skuCode,
              warehouse: rule.warehouse.code,
              currentLevel,
              reorderLevel: rule.reorderLevel
            });
          }
        }
      }

      return alerts;
    } catch (error) {
      this.logger.error('Failed to check reorder alerts', { error });
      throw new InventoryError('Failed to check reorder alerts', 'REORDER_ALERT_CHECK_ERROR', 500);
    }
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    try {
      const alert = await this.prisma.reorderAlert.findUnique({
        where: { id: alertId }
      });

      if (!alert) {
        throw new NotFoundError('ReorderAlert', alertId);
      }

      await this.prisma.reorderAlert.update({
        where: { id: alertId },
        data: {
          acknowledged: true,
          acknowledgedBy: userId,
          acknowledgedAt: new Date()
        }
      });

      // Create audit log
      await this.auditService.logAction(userId, 'ACKNOWLEDGE_REORDER_ALERT', 'ReorderAlert', alertId, {
        result: 'SUCCESS'
      });

      this.logger.info('Reorder alert acknowledged', { alertId, userId });
    } catch (error) {
      this.logger.error('Failed to acknowledge alert', { alertId, userId, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to acknowledge alert', 'ALERT_ACKNOWLEDGE_ERROR', 500);
    }
  }

  async updateAlertStatus(alertId: string, status: AlertStatus, userId: string): Promise<void> {
    try {
      const alert = await this.prisma.reorderAlert.findUnique({
        where: { id: alertId }
      });

      if (!alert) {
        throw new NotFoundError('ReorderAlert', alertId);
      }

      await this.prisma.reorderAlert.update({
        where: { id: alertId },
        data: { status }
      });

      // Create audit log
      await this.auditService.logAction(userId, 'UPDATE_ALERT_STATUS', 'ReorderAlert', alertId, {
        previousStatus: alert.status,
        newStatus: status,
        result: 'SUCCESS'
      });

      this.logger.info('Alert status updated', { alertId, status, userId });
    } catch (error) {
      this.logger.error('Failed to update alert status', { alertId, status, userId, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to update alert status', 'ALERT_STATUS_UPDATE_ERROR', 500);
    }
  }

  async getActiveAlerts(warehouseCode?: string): Promise<ReorderAlert[]> {
    try {
      const where: any = {
        status: { notIn: [AlertStatus.DISMISSED] }
      };

      if (warehouseCode) {
        where.warehouse = { code: warehouseCode };
      }

      const alerts = await this.prisma.reorderAlert.findMany({
        where,
        include: {
          reorderRule: {
            include: {
              sku: true,
              warehouse: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return alerts.map(alert => ({
        id: alert.id,
        reorderRuleId: alert.reorderRuleId,
        skuId: alert.reorderRule.sku.skuCode,
        warehouseId: alert.reorderRule.warehouse.code,
        currentLevel: alert.currentLevel,
        reorderLevel: alert.reorderLevel,
        suggestedQuantity: alert.suggestedQty,
        status: alert.status,
        acknowledged: alert.acknowledged,
        createdAt: alert.createdAt
      }));
    } catch (error) {
      this.logger.error('Failed to get active alerts', { warehouseCode, error });
      throw new InventoryError('Failed to get active alerts', 'ALERT_RETRIEVAL_ERROR', 500);
    }
  }

  // Private helper methods
  private async calculateAverageDemand(
    skuId: string,
    warehouseId: string,
    days: number
  ): Promise<number> {
    const startDate = dayjs().subtract(days, 'days').toDate();

    const movements = await this.prisma.stockMovement.aggregate({
      where: {
        skuId,
        fromWarehouseId: warehouseId,
        movementType: { in: ['SHIPMENT', 'TRANSFER'] },
        createdAt: { gte: startDate },
        processed: true
      },
      _sum: {
        quantity: true
      }
    });

    const totalDemand = movements._sum.quantity || 0;
    return totalDemand / days;
  }

  private async calculateSafetyStock(
    skuId: string,
    warehouseId: string,
    averageDemand: number,
    leadTime: number
  ): Promise<number> {
    const demandVariability = await this.calculateDemandVariability(skuId, warehouseId);

    // Safety stock = Z-score × √(Lead time) × Standard deviation of demand
    // Using Z-score of 1.65 for 95% service level
    const zScore = 1.65;
    const safetyStock = Math.ceil(zScore * Math.sqrt(leadTime) * demandVariability);

    return Math.max(safetyStock, Math.ceil(averageDemand * 0.1)); // Minimum 10% of average demand
  }

  private async calculateDemandVariability(skuId: string, warehouseId: string): Promise<number> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        skuId,
        fromWarehouseId: warehouseId,
        movementType: { in: ['SHIPMENT', 'TRANSFER'] },
        createdAt: { gte: dayjs().subtract(90, 'days').toDate() },
        processed: true
      },
      select: {
        quantity: true,
        createdAt: true
      }
    });

    if (movements.length < 2) return 1;

    // Group by day and calculate daily demand
    const dailyDemand = new Map<string, number>();
    movements.forEach(movement => {
      const date = dayjs(movement.createdAt).format('YYYY-MM-DD');
      const current = dailyDemand.get(date) || 0;
      dailyDemand.set(date, current + movement.quantity);
    });

    const demands = Array.from(dailyDemand.values());
    const mean = demands.reduce((sum, demand) => sum + demand, 0) / demands.length;

    const variance = demands.reduce((sum, demand) => sum + Math.pow(demand - mean, 2), 0) / demands.length;
    return Math.sqrt(variance);
  }

  private async calculateEOQ(skuId: string, annualDemand: number, unitCost: number): Promise<number> {
    // Economic Order Quantity formula: √((2 × Annual demand × Order cost) / Holding cost per unit per year)
    // Using default values: Order cost = $50, Holding cost = 20% of unit cost
    const orderCost = 50;
    const holdingCostRate = 0.2;
    const holdingCost = unitCost * holdingCostRate;

    if (holdingCost === 0) return Math.ceil(annualDemand * 30); // 30 days supply

    const eoq = Math.sqrt((2 * annualDemand * 365 * orderCost) / holdingCost);
    return Math.max(Math.ceil(eoq), 1);
  }

  private async sendReorderNotification(alert: ReorderAlert, rule: any): Promise<void> {
    try {
      const message = {
        title: 'Reorder Alert',
        body: `Stock level for ${rule.sku.name} (${alert.skuId}) at ${rule.warehouse.name} has reached reorder point. Current: ${alert.currentLevel}, Reorder Level: ${alert.reorderLevel}`,
        data: {
          type: 'reorder_alert',
          alertId: alert.id,
          skuId: alert.skuId,
          warehouseId: alert.warehouseId,
          currentLevel: alert.currentLevel.toString(),
          reorderLevel: alert.reorderLevel.toString(),
          suggestedQuantity: alert.suggestedQuantity.toString()
        }
      };

      // Send to warehouse managers and inventory managers
      const users = await this.prisma.user.findMany({
        where: {
          tenantId: rule.tenantId,
          role: { in: ['ADMIN', 'MANAGER'] },
          active: true
        }
      });

      for (const user of users) {
        await this.notificationService.sendNotification(user.id, 'reorder_alert', message);
      }
    } catch (error) {
      this.logger.error('Failed to send reorder notification', { alert, error });
      // Don't throw error as notification failure shouldn't prevent alert creation
    }
  }
}