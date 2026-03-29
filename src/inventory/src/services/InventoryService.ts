import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  StockLevel,
  StockMovement,
  CreateMovementRequest,
  UpdateStockRequest,
  InventoryQuery,
  MovementQuery,
  MovementType,
  InventoryError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
  EventType,
  InventoryEvent
} from '../types';
import { EventPublisher } from './EventPublisher';
import { AuditService } from './AuditService';
import { Logger } from '../utils/logger';
import { validateMovement, validateStockUpdate } from '../validators/inventory';
import * as dayjs from 'dayjs';

export class InventoryService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventPublisher: EventPublisher,
    private auditService: AuditService,
    private logger: Logger
  ) {}

  // Core inventory operations
  async getStockLevel(sku: string, warehouse: string, location?: string): Promise<StockLevel | null> {
    const cacheKey = `stock:${sku}:${warehouse}${location ? `:${location}` : ''}`;

    try {
      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Query database
      const inventoryLevel = await this.prisma.inventoryLevel.findFirst({
        where: {
          sku: { skuCode: sku },
          warehouse: { code: warehouse },
          ...(location && { location: { locationCode: location } })
        },
        include: {
          sku: true,
          warehouse: true,
          location: true
        }
      });

      if (!inventoryLevel) {
        return null;
      }

      const stockLevel: StockLevel = {
        sku: inventoryLevel.sku.skuCode,
        warehouse: inventoryLevel.warehouse.code,
        location: inventoryLevel.location?.locationCode,
        onHand: inventoryLevel.onHand,
        reserved: inventoryLevel.reserved,
        available: inventoryLevel.available,
        inTransit: inventoryLevel.inTransit,
        lastUpdated: inventoryLevel.lastUpdated
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(stockLevel));

      return stockLevel;
    } catch (error) {
      this.logger.error('Failed to get stock level', { sku, warehouse, location, error });
      throw new InventoryError('Failed to retrieve stock level', 'STOCK_RETRIEVAL_ERROR', 500);
    }
  }

  async getAllStockLevels(query: InventoryQuery): Promise<{
    data: StockLevel[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        sku,
        warehouse,
        location,
        category,
        lowStock,
        includeReserved = true,
        page = 1,
        limit = 50
      } = query;

      const skip = (page - 1) * limit;

      const where: any = {
        sku: {
          active: true,
          ...(sku && { skuCode: { contains: sku, mode: 'insensitive' } }),
          ...(category && { category: { name: { contains: category, mode: 'insensitive' } } })
        },
        warehouse: {
          active: true,
          ...(warehouse && { code: warehouse })
        },
        ...(location && { location: { locationCode: location } }),
        ...(lowStock && {
          OR: [
            { available: { lte: { _field: 'minLevel' } } },
            { onHand: { lte: 10 } } // Default low stock threshold
          ]
        })
      };

      const [inventoryLevels, total] = await Promise.all([
        this.prisma.inventoryLevel.findMany({
          where,
          include: {
            sku: { include: { category: true } },
            warehouse: true,
            location: true
          },
          skip,
          take: limit,
          orderBy: [
            { sku: { skuCode: 'asc' } },
            { warehouse: { code: 'asc' } }
          ]
        }),
        this.prisma.inventoryLevel.count({ where })
      ]);

      const data: StockLevel[] = inventoryLevels.map(level => ({
        sku: level.sku.skuCode,
        warehouse: level.warehouse.code,
        location: level.location?.locationCode,
        onHand: level.onHand,
        reserved: includeReserved ? level.reserved : 0,
        available: level.available,
        inTransit: level.inTransit,
        lastUpdated: level.lastUpdated
      }));

      return {
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('Failed to get stock levels', { query, error });
      throw new InventoryError('Failed to retrieve stock levels', 'STOCK_QUERY_ERROR', 500);
    }
  }

  async recordMovement(movement: CreateMovementRequest, userId: string): Promise<StockMovement> {
    // Validate movement
    const validation = validateMovement(movement);
    if (!validation.isValid) {
      throw new ValidationError('Invalid movement data', validation.errors);
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      try {
        // Get SKU and warehouse
        const [sku, warehouse] = await Promise.all([
          tx.sKU.findUnique({ where: { skuCode: movement.sku } }),
          tx.warehouse.findUnique({ where: { code: movement.warehouse } })
        ]);

        if (!sku) {
          throw new NotFoundError('SKU', movement.sku);
        }
        if (!warehouse) {
          throw new NotFoundError('Warehouse', movement.warehouse);
        }

        // Get location if specified
        let location = null;
        if (movement.location) {
          location = await tx.location.findUnique({
            where: { locationCode: movement.location }
          });
          if (!location) {
            throw new NotFoundError('Location', movement.location);
          }
        }

        // Check stock availability for outbound movements
        if (this.isOutboundMovement(movement.type) && movement.quantity > 0) {
          const currentLevel = await tx.inventoryLevel.findFirst({
            where: {
              skuId: sku.id,
              warehouseId: warehouse.id,
              locationId: location?.id
            }
          });

          if (!currentLevel || currentLevel.available < movement.quantity) {
            throw new InsufficientStockError(
              movement.sku,
              movement.quantity,
              currentLevel?.available || 0
            );
          }
        }

        // Create stock movement record
        const stockMovement = await tx.stockMovement.create({
          data: {
            movementType: movement.type,
            skuId: sku.id,
            fromWarehouseId: this.isOutboundMovement(movement.type) ? warehouse.id : undefined,
            toWarehouseId: this.isInboundMovement(movement.type) ? warehouse.id : undefined,
            fromLocationId: this.isOutboundMovement(movement.type) ? location?.id : undefined,
            toLocationId: this.isInboundMovement(movement.type) ? location?.id : undefined,
            quantity: movement.quantity,
            unitCost: movement.unitCost,
            reason: movement.reason,
            userId,
            batchNumber: movement.batchNumber,
            serialNumbers: movement.serialNumbers || [],
            processed: false
          },
          include: {
            sku: true,
            fromWarehouse: true,
            toWarehouse: true,
            fromLocation: true,
            toLocation: true,
            user: true
          }
        });

        // Update inventory levels
        await this.updateInventoryLevel(tx, sku.id, warehouse.id, location?.id, movement);

        // Mark movement as processed
        await tx.stockMovement.update({
          where: { id: stockMovement.id },
          data: {
            processed: true,
            processedAt: new Date()
          }
        });

        return stockMovement;
      } catch (error) {
        this.logger.error('Transaction failed during movement recording', { movement, error });
        throw error;
      }
    });

    // Clear cache
    await this.clearStockCache(movement.sku, movement.warehouse, movement.location);

    // Create audit log
    await this.auditService.logAction(userId, 'RECORD_MOVEMENT', 'StockMovement', transaction.id, {
      movement: movement,
      result: 'SUCCESS'
    });

    // Publish event
    const event: InventoryEvent = {
      eventType: EventType.MOVEMENT_RECORDED,
      timestamp: new Date(),
      data: {
        movement: this.mapToStockMovement(transaction),
        user: { id: userId }
      },
      userId
    };
    await this.eventPublisher.publish('inventory.movement.recorded', event);

    this.logger.info('Stock movement recorded successfully', {
      movementId: transaction.id,
      sku: movement.sku,
      type: movement.type,
      quantity: movement.quantity
    });

    return this.mapToStockMovement(transaction);
  }

  async getMovements(query: MovementQuery): Promise<{
    data: StockMovement[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        sku,
        warehouse,
        type,
        userId,
        startDate,
        endDate,
        page = 1,
        limit = 50
      } = query;

      const skip = (page - 1) * limit;

      const where: any = {
        processed: true,
        ...(sku && { sku: { skuCode: sku } }),
        ...(warehouse && {
          OR: [
            { fromWarehouse: { code: warehouse } },
            { toWarehouse: { code: warehouse } }
          ]
        }),
        ...(type && { movementType: type }),
        ...(userId && { userId }),
        ...(startDate || endDate) && {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate })
          }
        }
      };

      const [movements, total] = await Promise.all([
        this.prisma.stockMovement.findMany({
          where,
          include: {
            sku: true,
            fromWarehouse: true,
            toWarehouse: true,
            fromLocation: true,
            toLocation: true,
            user: true
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.stockMovement.count({ where })
      ]);

      const data = movements.map(this.mapToStockMovement);

      return {
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('Failed to get movements', { query, error });
      throw new InventoryError('Failed to retrieve movements', 'MOVEMENT_QUERY_ERROR', 500);
    }
  }

  async updateStock(request: UpdateStockRequest, userId: string): Promise<void> {
    const validation = validateStockUpdate(request);
    if (!validation.isValid) {
      throw new ValidationError('Invalid stock update request', validation.errors);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const movement of request.movements) {
        await this.recordMovement(movement, userId);
      }
    });

    this.logger.info('Bulk stock update completed', {
      sku: request.sku,
      warehouse: request.warehouse,
      movementCount: request.movements.length
    });
  }

  async reserveStock(
    sku: string,
    warehouse: string,
    quantity: number,
    userId: string,
    location?: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [skuRecord, warehouseRecord] = await Promise.all([
        tx.sKU.findUnique({ where: { skuCode: sku } }),
        tx.warehouse.findUnique({ where: { code: warehouse } })
      ]);

      if (!skuRecord) throw new NotFoundError('SKU', sku);
      if (!warehouseRecord) throw new NotFoundError('Warehouse', warehouse);

      let locationRecord = null;
      if (location) {
        locationRecord = await tx.location.findUnique({
          where: { locationCode: location }
        });
        if (!locationRecord) throw new NotFoundError('Location', location);
      }

      const inventoryLevel = await tx.inventoryLevel.findFirst({
        where: {
          skuId: skuRecord.id,
          warehouseId: warehouseRecord.id,
          locationId: locationRecord?.id
        }
      });

      if (!inventoryLevel || inventoryLevel.available < quantity) {
        throw new InsufficientStockError(sku, quantity, inventoryLevel?.available || 0);
      }

      // Update reservation
      await tx.inventoryLevel.update({
        where: { id: inventoryLevel.id },
        data: {
          reserved: inventoryLevel.reserved + quantity,
          available: inventoryLevel.available - quantity
        }
      });
    });

    // Clear cache and publish event
    await this.clearStockCache(sku, warehouse, location);

    const event: InventoryEvent = {
      eventType: EventType.STOCK_UPDATED,
      timestamp: new Date(),
      data: { sku, warehouse, location, reservation: quantity },
      userId
    };
    await this.eventPublisher.publish('inventory.stock.updated', event);
  }

  async releaseReservation(
    sku: string,
    warehouse: string,
    quantity: number,
    userId: string,
    location?: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [skuRecord, warehouseRecord] = await Promise.all([
        tx.sKU.findUnique({ where: { skuCode: sku } }),
        tx.warehouse.findUnique({ where: { code: warehouse } })
      ]);

      if (!skuRecord) throw new NotFoundError('SKU', sku);
      if (!warehouseRecord) throw new NotFoundError('Warehouse', warehouse);

      let locationRecord = null;
      if (location) {
        locationRecord = await tx.location.findUnique({
          where: { locationCode: location }
        });
        if (!locationRecord) throw new NotFoundError('Location', location);
      }

      const inventoryLevel = await tx.inventoryLevel.findFirst({
        where: {
          skuId: skuRecord.id,
          warehouseId: warehouseRecord.id,
          locationId: locationRecord?.id
        }
      });

      if (!inventoryLevel || inventoryLevel.reserved < quantity) {
        throw new ValidationError(`Cannot release more than reserved quantity: ${inventoryLevel?.reserved || 0}`);
      }

      // Release reservation
      await tx.inventoryLevel.update({
        where: { id: inventoryLevel.id },
        data: {
          reserved: inventoryLevel.reserved - quantity,
          available: inventoryLevel.available + quantity
        }
      });
    });

    await this.clearStockCache(sku, warehouse, location);
  }

  // Private helper methods
  private async updateInventoryLevel(
    tx: any,
    skuId: string,
    warehouseId: string,
    locationId: string | undefined,
    movement: CreateMovementRequest
  ): Promise<void> {
    const currentLevel = await tx.inventoryLevel.findFirst({
      where: { skuId, warehouseId, locationId }
    });

    const quantityChange = this.calculateQuantityChange(movement.type, movement.quantity);

    if (!currentLevel) {
      // Create new inventory level
      await tx.inventoryLevel.create({
        data: {
          skuId,
          warehouseId,
          locationId,
          onHand: Math.max(0, quantityChange),
          reserved: 0,
          inTransit: 0,
          available: Math.max(0, quantityChange),
          lastUpdated: new Date()
        }
      });
    } else {
      // Update existing inventory level
      const newOnHand = Math.max(0, currentLevel.onHand + quantityChange);
      const newAvailable = Math.max(0, newOnHand - currentLevel.reserved);

      await tx.inventoryLevel.update({
        where: { id: currentLevel.id },
        data: {
          onHand: newOnHand,
          available: newAvailable,
          lastUpdated: new Date()
        }
      });
    }
  }

  private calculateQuantityChange(movementType: MovementType, quantity: number): number {
    switch (movementType) {
      case MovementType.RECEIPT:
      case MovementType.RETURN:
      case MovementType.FOUND:
      case MovementType.ADJUSTMENT:
        return Math.abs(quantity);

      case MovementType.SHIPMENT:
      case MovementType.DAMAGE:
      case MovementType.EXPIRED:
      case MovementType.LOST:
        return -Math.abs(quantity);

      case MovementType.TRANSFER:
      case MovementType.CYCLE_COUNT:
        return quantity; // Can be positive or negative

      default:
        return 0;
    }
  }

  private isInboundMovement(type: MovementType): boolean {
    return [
      MovementType.RECEIPT,
      MovementType.RETURN,
      MovementType.FOUND
    ].includes(type);
  }

  private isOutboundMovement(type: MovementType): boolean {
    return [
      MovementType.SHIPMENT,
      MovementType.DAMAGE,
      MovementType.EXPIRED,
      MovementType.LOST
    ].includes(type);
  }

  private mapToStockMovement(prismaMovement: any): StockMovement {
    return {
      id: prismaMovement.id,
      type: prismaMovement.movementType,
      sku: prismaMovement.sku.skuCode,
      warehouse: prismaMovement.fromWarehouse?.code || prismaMovement.toWarehouse?.code,
      location: prismaMovement.fromLocation?.locationCode || prismaMovement.toLocation?.locationCode,
      quantity: prismaMovement.quantity,
      unitCost: prismaMovement.unitCost ? Number(prismaMovement.unitCost) : undefined,
      reason: prismaMovement.reason,
      userId: prismaMovement.userId,
      timestamp: prismaMovement.createdAt,
      batchNumber: prismaMovement.batchNumber,
      serialNumber: prismaMovement.serialNumbers?.[0] // For backward compatibility
    };
  }

  private async clearStockCache(sku: string, warehouse: string, location?: string): Promise<void> {
    const patterns = [
      `stock:${sku}:${warehouse}`,
      `stock:${sku}:${warehouse}:*`
    ];

    if (location) {
      patterns.push(`stock:${sku}:${warehouse}:${location}`);
    }

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}