import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { InventoryService } from '../../src/inventory/src/services/InventoryService';
import { EventPublisher } from '../../src/inventory/src/services/EventPublisher';
import { AuditService } from '../../src/inventory/src/services/AuditService';
import { Logger } from '../../src/inventory/src/utils/logger';
import {
  MovementType,
  CreateMovementRequest,
  UpdateStockRequest,
  InsufficientStockError,
  NotFoundError,
  ValidationError
} from '../../src/inventory/src/types';

// Mock implementations
const mockPrisma = {
  sKU: {
    findUnique: jest.fn(),
    findMany: jest.fn()
  },
  warehouse: {
    findUnique: jest.fn()
  },
  location: {
    findUnique: jest.fn()
  },
  inventoryLevel: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  stockMovement: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  $transaction: jest.fn()
} as unknown as PrismaClient;

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn()
} as unknown as Redis;

const mockEventPublisher = {
  publish: jest.fn()
} as unknown as EventPublisher;

const mockAuditService = {
  logAction: jest.fn()
} as unknown as AuditService;

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
} as unknown as Logger;

describe('InventoryService', () => {
  let inventoryService: InventoryService;

  beforeAll(() => {
    inventoryService = new InventoryService(
      mockPrisma,
      mockRedis,
      mockEventPublisher,
      mockAuditService,
      mockLogger
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStockLevel', () => {
    it('should return cached stock level if available', async () => {
      const mockStockLevel = {
        sku: 'TEST-SKU-001',
        warehouse: 'WH001',
        location: 'A1-01',
        onHand: 100,
        reserved: 10,
        available: 90,
        inTransit: 5,
        lastUpdated: new Date()
      };

      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockStockLevel));

      const result = await inventoryService.getStockLevel('TEST-SKU-001', 'WH001', 'A1-01');

      expect(result).toEqual(mockStockLevel);
      expect(mockRedis.get).toHaveBeenCalledWith('stock:TEST-SKU-001:WH001:A1-01');
      expect(mockPrisma.inventoryLevel.findFirst).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not in cache', async () => {
      const mockInventoryLevel = {
        sku: { skuCode: 'TEST-SKU-001' },
        warehouse: { code: 'WH001' },
        location: { locationCode: 'A1-01' },
        onHand: 100,
        reserved: 10,
        available: 90,
        inTransit: 5,
        lastUpdated: new Date()
      };

      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.inventoryLevel.findFirst as jest.Mock).mockResolvedValue(mockInventoryLevel);

      const result = await inventoryService.getStockLevel('TEST-SKU-001', 'WH001', 'A1-01');

      expect(result).toMatchObject({
        sku: 'TEST-SKU-001',
        warehouse: 'WH001',
        location: 'A1-01',
        onHand: 100,
        reserved: 10,
        available: 90,
        inTransit: 5
      });

      expect(mockPrisma.inventoryLevel.findFirst).toHaveBeenCalledWith({
        where: {
          sku: { skuCode: 'TEST-SKU-001' },
          warehouse: { code: 'WH001' },
          location: { locationCode: 'A1-01' }
        },
        include: {
          sku: true,
          warehouse: true,
          location: true
        }
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'stock:TEST-SKU-001:WH001:A1-01',
        300,
        expect.any(String)
      );
    });

    it('should return null if inventory level not found', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.inventoryLevel.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await inventoryService.getStockLevel('NONEXISTENT-SKU', 'WH001');

      expect(result).toBeNull();
    });
  });

  describe('recordMovement', () => {
    const mockMovement: CreateMovementRequest = {
      type: MovementType.RECEIPT,
      sku: 'TEST-SKU-001',
      warehouse: 'WH001',
      location: 'A1-01',
      quantity: 50,
      unitCost: 10.00,
      reason: 'Purchase order receipt'
    };

    const mockSKU = { id: 'sku-123', skuCode: 'TEST-SKU-001', name: 'Test Product' };
    const mockWarehouse = { id: 'wh-123', code: 'WH001', name: 'Main Warehouse' };
    const mockLocation = { id: 'loc-123', locationCode: 'A1-01' };

    it('should successfully record an inbound movement', async () => {
      const mockStockMovement = {
        id: 'movement-123',
        movementType: MovementType.RECEIPT,
        quantity: 50,
        createdAt: new Date(),
        sku: mockSKU,
        fromWarehouse: null,
        toWarehouse: mockWarehouse,
        fromLocation: null,
        toLocation: mockLocation,
        user: { id: 'user-123' }
      };

      const mockInventoryLevel = {
        id: 'level-123',
        onHand: 100,
        reserved: 0,
        available: 100
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(mockLocation) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(mockInventoryLevel),
            update: jest.fn().mockResolvedValue(mockInventoryLevel)
          },
          stockMovement: {
            create: jest.fn().mockResolvedValue(mockStockMovement),
            update: jest.fn().mockResolvedValue(mockStockMovement)
          }
        });
      });

      (mockRedis.keys as jest.Mock).mockResolvedValue([]);

      const result = await inventoryService.recordMovement(mockMovement, 'user-123');

      expect(result).toMatchObject({
        id: 'movement-123',
        type: MovementType.RECEIPT,
        quantity: 50,
        sku: 'TEST-SKU-001',
        warehouse: 'WH001'
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        'user-123',
        'RECORD_MOVEMENT',
        'StockMovement',
        'movement-123',
        expect.any(Object)
      );
      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        'inventory.movement.recorded',
        expect.any(Object)
      );
    });

    it('should throw InsufficientStockError for outbound movement without enough stock', async () => {
      const outboundMovement = {
        ...mockMovement,
        type: MovementType.SHIPMENT,
        quantity: 150 // More than available
      };

      const mockInventoryLevel = {
        id: 'level-123',
        onHand: 100,
        reserved: 0,
        available: 100
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(mockLocation) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(mockInventoryLevel)
          }
        });
      });

      await expect(
        inventoryService.recordMovement(outboundMovement, 'user-123')
      ).rejects.toThrow(InsufficientStockError);
    });

    it('should throw NotFoundError for invalid SKU', async () => {
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(null) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) }
        });
      });

      await expect(
        inventoryService.recordMovement(mockMovement, 'user-123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for invalid warehouse', async () => {
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(null) }
        });
      });

      await expect(
        inventoryService.recordMovement(mockMovement, 'user-123')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getAllStockLevels', () => {
    it('should return paginated stock levels with filters', async () => {
      const mockInventoryLevels = [
        {
          sku: { skuCode: 'TEST-SKU-001', category: { name: 'Electronics' } },
          warehouse: { code: 'WH001' },
          location: { locationCode: 'A1-01' },
          onHand: 100,
          reserved: 10,
          available: 90,
          inTransit: 5,
          lastUpdated: new Date()
        },
        {
          sku: { skuCode: 'TEST-SKU-002', category: { name: 'Electronics' } },
          warehouse: { code: 'WH001' },
          location: { locationCode: 'A1-02' },
          onHand: 50,
          reserved: 5,
          available: 45,
          inTransit: 0,
          lastUpdated: new Date()
        }
      ];

      (mockPrisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue(mockInventoryLevels);
      (mockPrisma.inventoryLevel.count as jest.Mock).mockResolvedValue(2);

      const result = await inventoryService.getAllStockLevels({
        warehouse: 'WH001',
        category: 'Electronics',
        page: 1,
        limit: 50
      });

      expect(result).toEqual({
        data: expect.arrayContaining([
          expect.objectContaining({
            sku: 'TEST-SKU-001',
            warehouse: 'WH001',
            onHand: 100,
            available: 90
          }),
          expect.objectContaining({
            sku: 'TEST-SKU-002',
            warehouse: 'WH001',
            onHand: 50,
            available: 45
          })
        ]),
        total: 2,
        page: 1,
        totalPages: 1
      });

      expect(mockPrisma.inventoryLevel.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          sku: expect.objectContaining({
            active: true,
            category: { name: { contains: 'Electronics', mode: 'insensitive' } }
          }),
          warehouse: expect.objectContaining({
            active: true,
            code: 'WH001'
          })
        }),
        include: expect.any(Object),
        skip: 0,
        take: 50,
        orderBy: expect.any(Array)
      });
    });

    it('should filter low stock items', async () => {
      const query = { lowStock: true };

      await inventoryService.getAllStockLevels(query);

      expect(mockPrisma.inventoryLevel.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { available: { lte: { _field: 'minLevel' } } },
            { onHand: { lte: 10 } }
          ])
        }),
        include: expect.any(Object),
        skip: 0,
        take: 50,
        orderBy: expect.any(Array)
      });
    });
  });

  describe('reserveStock', () => {
    it('should successfully reserve stock', async () => {
      const mockSKU = { id: 'sku-123', skuCode: 'TEST-SKU-001' };
      const mockWarehouse = { id: 'wh-123', code: 'WH001' };
      const mockLocation = { id: 'loc-123', locationCode: 'A1-01' };
      const mockInventoryLevel = {
        id: 'level-123',
        onHand: 100,
        reserved: 10,
        available: 90
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(mockLocation) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(mockInventoryLevel),
            update: jest.fn().mockResolvedValue({
              ...mockInventoryLevel,
              reserved: 20,
              available: 80
            })
          }
        });
      });

      (mockRedis.keys as jest.Mock).mockResolvedValue([]);

      await inventoryService.reserveStock('TEST-SKU-001', 'WH001', 10, 'user-123', 'A1-01');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        'inventory.stock.updated',
        expect.objectContaining({
          data: expect.objectContaining({
            reservation: 10
          })
        })
      );
    });

    it('should throw InsufficientStockError when trying to reserve more than available', async () => {
      const mockSKU = { id: 'sku-123', skuCode: 'TEST-SKU-001' };
      const mockWarehouse = { id: 'wh-123', code: 'WH001' };
      const mockInventoryLevel = {
        id: 'level-123',
        onHand: 100,
        reserved: 10,
        available: 90
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(null) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(mockInventoryLevel)
          }
        });
      });

      await expect(
        inventoryService.reserveStock('TEST-SKU-001', 'WH001', 100, 'user-123')
      ).rejects.toThrow(InsufficientStockError);
    });
  });

  describe('releaseReservation', () => {
    it('should successfully release reservation', async () => {
      const mockSKU = { id: 'sku-123', skuCode: 'TEST-SKU-001' };
      const mockWarehouse = { id: 'wh-123', code: 'WH001' };
      const mockInventoryLevel = {
        id: 'level-123',
        onHand: 100,
        reserved: 20,
        available: 80
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(null) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(mockInventoryLevel),
            update: jest.fn().mockResolvedValue({
              ...mockInventoryLevel,
              reserved: 10,
              available: 90
            })
          }
        });
      });

      (mockRedis.keys as jest.Mock).mockResolvedValue([]);

      await inventoryService.releaseReservation('TEST-SKU-001', 'WH001', 10, 'user-123');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw ValidationError when trying to release more than reserved', async () => {
      const mockSKU = { id: 'sku-123', skuCode: 'TEST-SKU-001' };
      const mockWarehouse = { id: 'wh-123', code: 'WH001' };
      const mockInventoryLevel = {
        id: 'level-123',
        onHand: 100,
        reserved: 5, // Only 5 reserved
        available: 95
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(null) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(mockInventoryLevel)
          }
        });
      });

      await expect(
        inventoryService.releaseReservation('TEST-SKU-001', 'WH001', 10, 'user-123') // Trying to release 10
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getMovements', () => {
    it('should return movement history with filters', async () => {
      const mockMovements = [
        {
          id: 'movement-1',
          movementType: MovementType.RECEIPT,
          quantity: 50,
          createdAt: new Date(),
          sku: { skuCode: 'TEST-SKU-001' },
          fromWarehouse: null,
          toWarehouse: { code: 'WH001' },
          fromLocation: null,
          toLocation: { locationCode: 'A1-01' },
          user: { id: 'user-123' },
          unitCost: 10.00,
          reason: 'Purchase order',
          userId: 'user-123',
          batchNumber: null,
          serialNumbers: []
        }
      ];

      (mockPrisma.stockMovement.findMany as jest.Mock).mockResolvedValue(mockMovements);
      (mockPrisma.stockMovement.count as jest.Mock).mockResolvedValue(1);

      const result = await inventoryService.getMovements({
        sku: 'TEST-SKU-001',
        type: MovementType.RECEIPT,
        page: 1,
        limit: 50
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'movement-1',
        type: MovementType.RECEIPT,
        quantity: 50,
        sku: 'TEST-SKU-001',
        warehouse: 'WH001'
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should filter movements by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await inventoryService.getMovements({
        startDate,
        endDate,
        page: 1,
        limit: 50
      });

      expect(mockPrisma.stockMovement.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          processed: true,
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        }),
        include: expect.any(Object),
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' }
      });
    });
  });

  describe('updateStock', () => {
    it('should process bulk stock updates', async () => {
      const updateRequest: UpdateStockRequest = {
        sku: 'TEST-SKU-001',
        warehouse: 'WH001',
        movements: [
          {
            type: MovementType.RECEIPT,
            sku: 'TEST-SKU-001',
            warehouse: 'WH001',
            quantity: 50,
            reason: 'Bulk update 1'
          },
          {
            type: MovementType.ADJUSTMENT,
            sku: 'TEST-SKU-001',
            warehouse: 'WH001',
            quantity: -5,
            reason: 'Damage adjustment'
          }
        ]
      };

      // Mock the recordMovement calls
      const originalRecordMovement = inventoryService.recordMovement;
      inventoryService.recordMovement = jest.fn().mockResolvedValue({
        id: 'movement-123',
        type: MovementType.RECEIPT,
        quantity: 50,
        sku: 'TEST-SKU-001',
        warehouse: 'WH001',
        userId: 'user-123',
        timestamp: new Date()
      });

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      await inventoryService.updateStock(updateRequest, 'user-123');

      expect(inventoryService.recordMovement).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bulk stock update completed',
        expect.objectContaining({
          sku: 'TEST-SKU-001',
          warehouse: 'WH001',
          movementCount: 2
        })
      );

      // Restore original method
      inventoryService.recordMovement = originalRecordMovement;
    });
  });
});