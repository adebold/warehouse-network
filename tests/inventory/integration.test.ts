import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { InventoryService } from '../../src/inventory/src/services/InventoryService';
import { SKUService } from '../../src/inventory/src/services/SKUService';
import { BarcodeService } from '../../src/inventory/src/services/BarcodeService';
import { ReorderService } from '../../src/inventory/src/services/ReorderService';
import { ForecastingService } from '../../src/inventory/src/services/ForecastingService';
import { EbikeService } from '../../src/inventory/src/services/EbikeService';
import { EventPublisher } from '../../src/inventory/src/services/EventPublisher';
import { AuditService } from '../../src/inventory/src/services/AuditService';
import { Logger } from '../../src/inventory/src/utils/logger';
import { BarcodeGenerator } from '../../src/inventory/src/utils/barcode';
import {
  MovementType,
  ScanType,
  BarcodeFormat,
  CompatibilityType,
  AlertStatus
} from '../../src/inventory/src/types';

/**
 * Integration tests for the inventory management system
 * Tests the interaction between multiple services to ensure end-to-end functionality
 */
describe('Inventory Management System Integration Tests', () => {
  let inventoryService: InventoryService;
  let skuService: SKUService;
  let barcodeService: BarcodeService;
  let reorderService: ReorderService;
  let forecastingService: ForecastingService;
  let ebikeService: EbikeService;

  // Mock services
  let mockPrisma: any;
  let mockRedis: any;
  let mockEventPublisher: any;
  let mockAuditService: any;
  let mockLogger: any;
  let mockBarcodeGenerator: any;

  beforeAll(() => {
    // Initialize mocks
    mockPrisma = {
      $transaction: jest.fn(),
      sKU: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn()
      },
      warehouse: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn()
      },
      inventoryLevel: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn()
      },
      stockMovement: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn()
      },
      barcode: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn()
      },
      scanEvent: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn()
      },
      reorderRule: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn()
      },
      reorderAlert: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn()
      },
      bikeModel: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn()
      },
      partCompatibility: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn()
      },
      demandForecast: {
        createMany: jest.fn(),
        findMany: jest.fn()
      },
      user: {
        findMany: jest.fn()
      }
    };

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn()
    };

    mockEventPublisher = {
      publish: jest.fn()
    };

    mockAuditService = {
      logAction: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockBarcodeGenerator = {
      generateImage: jest.fn(),
      generateLabels: jest.fn()
    };

    // Initialize services
    inventoryService = new InventoryService(
      mockPrisma,
      mockRedis,
      mockEventPublisher,
      mockAuditService,
      mockLogger
    );

    skuService = new SKUService(
      mockPrisma,
      mockRedis,
      mockEventPublisher,
      mockAuditService,
      mockLogger,
      mockBarcodeGenerator
    );

    barcodeService = new BarcodeService(
      mockPrisma,
      mockRedis,
      mockEventPublisher,
      inventoryService,
      mockAuditService,
      mockLogger,
      mockBarcodeGenerator
    );

    reorderService = new ReorderService(
      mockPrisma,
      mockRedis,
      mockEventPublisher,
      mockAuditService,
      {} as any, // NotificationService mock
      mockLogger
    );

    forecastingService = new ForecastingService(
      mockPrisma,
      mockRedis,
      mockEventPublisher,
      mockAuditService,
      mockLogger
    );

    ebikeService = new EbikeService(
      mockPrisma,
      mockRedis,
      mockEventPublisher,
      mockAuditService,
      mockLogger,
      inventoryService
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Product Lifecycle', () => {
    it('should handle complete product lifecycle from creation to sale', async () => {
      // Step 1: Create SKU
      const skuDefinition = {
        skuCode: 'BIKE-FRAME-001',
        name: 'Mountain Bike Frame - Large',
        description: 'Aluminum mountain bike frame, size large',
        cost: 150.00,
        price: 299.99,
        attributes: {
          size: 'Large',
          material: 'Aluminum',
          color: 'Black'
        }
      };

      const mockSKU = {
        id: 'sku-123',
        ...skuDefinition,
        tenantId: 'tenant-123',
        createdAt: new Date()
      };

      // Mock SKU creation
      mockPrisma.sKU.findUnique.mockResolvedValue(null); // No existing SKU
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          sKU: {
            create: jest.fn().mockResolvedValue(mockSKU)
          },
          barcode: {
            create: jest.fn().mockResolvedValue({
              id: 'barcode-123',
              code: 'BIKEFRAME001123',
              format: BarcodeFormat.CODE128,
              primary: true
            })
          }
        });
      });

      mockRedis.get.mockResolvedValue(null);

      const createdSKU = await skuService.createSKU(skuDefinition, 'tenant-123', 'user-123');

      expect(createdSKU).toMatchObject({
        skuCode: 'BIKE-FRAME-001',
        name: 'Mountain Bike Frame - Large'
      });

      // Step 2: Receive inventory
      const receiptMovement = {
        type: MovementType.RECEIPT,
        sku: 'BIKE-FRAME-001',
        warehouse: 'WH001',
        location: 'A1-01',
        quantity: 100,
        unitCost: 150.00,
        reason: 'Initial stock receipt'
      };

      const mockWarehouse = { id: 'wh-123', code: 'WH001', name: 'Main Warehouse' };
      const mockLocation = { id: 'loc-123', locationCode: 'A1-01' };
      const mockMovement = {
        id: 'movement-123',
        movementType: MovementType.RECEIPT,
        quantity: 100,
        createdAt: new Date(),
        sku: mockSKU,
        toWarehouse: mockWarehouse,
        toLocation: mockLocation,
        user: { id: 'user-123' }
      };

      // Mock inventory receipt
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(mockLocation) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'level-123',
              onHand: 100,
              available: 100,
              reserved: 0
            })
          },
          stockMovement: {
            create: jest.fn().mockResolvedValue(mockMovement),
            update: jest.fn().mockResolvedValue({ ...mockMovement, processed: true })
          }
        });
      });

      mockRedis.keys.mockResolvedValue([]);

      const recordedMovement = await inventoryService.recordMovement(receiptMovement, 'user-123');

      expect(recordedMovement).toMatchObject({
        type: MovementType.RECEIPT,
        quantity: 100,
        sku: 'BIKE-FRAME-001'
      });

      // Step 3: Set up reorder rule
      const reorderRule = {
        skuId: 'BIKE-FRAME-001',
        warehouseId: 'WH001',
        reorderLevel: 20,
        reorderQuantity: 50,
        leadTimeDays: 14,
        safetyStock: 10
      };

      mockPrisma.sKU.findUnique.mockResolvedValue(mockSKU);
      mockPrisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrisma.reorderRule.findUnique.mockResolvedValue(null);
      mockPrisma.reorderRule.create.mockResolvedValue({
        id: 'rule-123',
        ...reorderRule,
        tenantId: 'tenant-123'
      });

      const createdRule = await reorderService.createReorderRule('tenant-123', reorderRule, 'user-123');

      expect(createdRule).toMatchObject({
        skuId: 'BIKE-FRAME-001',
        warehouseId: 'WH001',
        reorderLevel: 20
      });

      // Step 4: Scan barcode and pick items
      const scanRequest = {
        barcodeCode: 'BIKEFRAME001123',
        userId: 'user-123',
        warehouseId: 'WH001',
        locationId: 'A1-01',
        scanType: ScanType.PICK,
        quantity: 5
      };

      const mockBarcode = {
        id: 'barcode-123',
        code: 'BIKEFRAME001123',
        active: true,
        sku: mockSKU
      };

      mockPrisma.barcode.findUnique.mockResolvedValue(mockBarcode);
      mockPrisma.scanEvent.create.mockResolvedValue({
        id: 'scan-123',
        barcodeId: 'barcode-123',
        userId: 'user-123',
        scanType: ScanType.PICK,
        quantity: 5,
        processed: false,
        createdAt: new Date()
      });

      mockPrisma.scanEvent.update.mockResolvedValue({
        processed: true,
        processedAt: new Date()
      });

      // Mock inventory service for barcode scan
      inventoryService.getStockLevel = jest.fn().mockResolvedValue({
        sku: 'BIKE-FRAME-001',
        warehouse: 'WH001',
        onHand: 95,
        available: 95,
        reserved: 0
      });

      inventoryService.recordMovement = jest.fn().mockResolvedValue({
        id: 'movement-pick',
        type: MovementType.SHIPMENT,
        quantity: 5
      });

      const scanResult = await barcodeService.processScan(scanRequest);

      expect(scanResult.success).toBe(true);
      expect(scanResult.message).toContain('Picked 5 units');
      expect(inventoryService.recordMovement).toHaveBeenCalledWith({
        type: 'SHIPMENT',
        sku: 'BIKE-FRAME-001',
        warehouse: 'WH001',
        location: 'A1-01',
        quantity: 5,
        reason: 'Barcode scan - pick'
      }, 'user-123');

      // Verify all audit logs were created
      expect(mockAuditService.logAction).toHaveBeenCalledTimes(4); // SKU creation, movement, reorder rule, scan
      expect(mockEventPublisher.publish).toHaveBeenCalledTimes(3); // Movement, scan events
    });
  });

  describe('E-bike Parts Compatibility Integration', () => {
    it('should handle bike model creation and parts compatibility', async () => {
      // Step 1: Create bike model
      const bikeModel = {
        modelCode: 'TREK-EBIKE-2024',
        name: 'Trek PowerFly 5',
        manufacturer: 'Trek',
        modelYear: 2024,
        category: 'electric-mountain',
        specifications: {
          motor: {
            type: 'Bosch Performance Line CX',
            power: 625,
            torque: 85
          },
          battery: {
            capacity: 625,
            voltage: 36,
            range: 80
          }
        }
      };

      const mockBikeModel = {
        id: 'bike-123',
        ...bikeModel,
        tenantId: 'tenant-123',
        active: true,
        createdAt: new Date()
      };

      mockPrisma.bikeModel.findUnique.mockResolvedValue(null);
      mockPrisma.bikeModel.create.mockResolvedValue(mockBikeModel);
      mockRedis.setex.mockResolvedValue('OK');

      const createdModel = await ebikeService.createBikeModel(bikeModel, 'tenant-123', 'user-123');

      expect(createdModel).toMatchObject({
        modelCode: 'TREK-EBIKE-2024',
        manufacturer: 'Trek'
      });

      // Step 2: Create compatible parts
      const batteryPart = {
        skuCode: 'BOSCH-BATTERY-625',
        name: 'Bosch PowerPack 625Wh',
        description: '625Wh battery for Bosch systems',
        cost: 400.00,
        price: 799.99
      };

      const motorPart = {
        skuCode: 'BOSCH-MOTOR-CX',
        name: 'Bosch Performance Line CX Motor',
        description: '85Nm mid-drive motor',
        cost: 600.00,
        price: 1299.99
      };

      // Mock parts creation
      const mockBatteryPart = {
        id: 'battery-sku-123',
        ...batteryPart,
        tenantId: 'tenant-123'
      };

      const mockMotorPart = {
        id: 'motor-sku-123',
        ...motorPart,
        tenantId: 'tenant-123'
      };

      mockPrisma.sKU.findUnique
        .mockResolvedValueOnce(null) // Battery doesn't exist
        .mockResolvedValueOnce(null); // Motor doesn't exist

      mockPrisma.$transaction
        .mockImplementationOnce(async (callback) => {
          return await callback({
            sKU: { create: jest.fn().mockResolvedValue(mockBatteryPart) },
            barcode: { create: jest.fn().mockResolvedValue({}) }
          });
        })
        .mockImplementationOnce(async (callback) => {
          return await callback({
            sKU: { create: jest.fn().mockResolvedValue(mockMotorPart) },
            barcode: { create: jest.fn().mockResolvedValue({}) }
          });
        });

      await skuService.createSKU(batteryPart, 'tenant-123', 'user-123');
      await skuService.createSKU(motorPart, 'tenant-123', 'user-123');

      // Step 3: Link parts compatibility
      const partCompatibilities = [
        {
          partSku: 'BOSCH-BATTERY-625',
          compatibilityType: CompatibilityType.RECOMMENDED,
          notes: 'OEM battery for this model'
        },
        {
          partSku: 'BOSCH-MOTOR-CX',
          compatibilityType: CompatibilityType.COMPATIBLE,
          notes: 'Factory installed motor'
        }
      ];

      mockPrisma.bikeModel.findUnique.mockResolvedValue(mockBikeModel);
      mockPrisma.sKU.findMany.mockResolvedValue([mockBatteryPart, mockMotorPart]);
      mockPrisma.partCompatibility.createMany.mockResolvedValue({ count: 2 });
      mockRedis.keys.mockResolvedValue([]);

      await ebikeService.linkCompatibleParts('TREK-EBIKE-2024', partCompatibilities, 'user-123');

      // Step 4: Query compatible parts
      const mockCompatibilities = [
        {
          bikeModelId: 'bike-123',
          partSkuId: 'battery-sku-123',
          compatibilityType: CompatibilityType.RECOMMENDED,
          notes: 'OEM battery for this model',
          partSku: {
            skuCode: 'BOSCH-BATTERY-625',
            name: 'Bosch PowerPack 625Wh',
            category: { name: 'Battery' }
          }
        },
        {
          bikeModelId: 'bike-123',
          partSkuId: 'motor-sku-123',
          compatibilityType: CompatibilityType.COMPATIBLE,
          notes: 'Factory installed motor',
          partSku: {
            skuCode: 'BOSCH-MOTOR-CX',
            name: 'Bosch Performance Line CX Motor',
            category: { name: 'Motor' }
          }
        }
      ];

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.bikeModel.findUnique.mockResolvedValue(mockBikeModel);
      mockPrisma.partCompatibility.findMany.mockResolvedValue(mockCompatibilities);
      mockRedis.setex.mockResolvedValue('OK');

      const compatibilityMatrix = await ebikeService.getCompatibleParts('TREK-EBIKE-2024');

      expect(compatibilityMatrix.bikeModel).toBe('TREK-EBIKE-2024');
      expect(compatibilityMatrix.compatibleParts).toHaveLength(2);
      expect(compatibilityMatrix.compatibleParts[0]).toMatchObject({
        partSku: 'BOSCH-BATTERY-625',
        compatibilityType: CompatibilityType.RECOMMENDED,
        category: 'Battery'
      });

      // Step 5: Validate specific part compatibility
      mockPrisma.partCompatibility.findUnique.mockResolvedValue(mockCompatibilities[0]);

      const validation = await ebikeService.validatePartCompatibility('TREK-EBIKE-2024', 'BOSCH-BATTERY-625');

      expect(validation.compatible).toBe(true);
      expect(validation.compatibilityType).toBe(CompatibilityType.RECOMMENDED);
      expect(validation.notes).toBe('OEM battery for this model');
    });
  });

  describe('Reorder and Forecasting Integration', () => {
    it('should trigger reorder alerts based on stock levels and generate forecasts', async () => {
      // Setup: Create inventory scenario with low stock
      const mockSKU = {
        id: 'sku-123',
        skuCode: 'CHAIN-TOOL-001',
        name: 'Bike Chain Tool'
      };

      const mockWarehouse = {
        id: 'wh-123',
        code: 'WH001',
        name: 'Main Warehouse'
      };

      const mockReorderRule = {
        id: 'rule-123',
        skuId: 'sku-123',
        warehouseId: 'wh-123',
        reorderLevel: 25,
        reorderQuantity: 100,
        leadTimeDays: 7,
        safetyStock: 10,
        active: true,
        sku: mockSKU,
        warehouse: mockWarehouse
      };

      const mockInventoryLevel = {
        id: 'level-123',
        skuId: 'sku-123',
        warehouseId: 'wh-123',
        onHand: 15, // Below reorder level
        reserved: 5,
        available: 10
      };

      // Step 1: Check for reorder alerts
      mockPrisma.reorderRule.findMany.mockResolvedValue([mockReorderRule]);
      mockPrisma.inventoryLevel.findFirst.mockResolvedValue(mockInventoryLevel);
      mockPrisma.reorderAlert.findFirst.mockResolvedValue(null); // No existing alert
      mockPrisma.reorderAlert.create.mockResolvedValue({
        id: 'alert-123',
        reorderRuleId: 'rule-123',
        skuId: 'sku-123',
        warehouseId: 'wh-123',
        currentLevel: 10,
        reorderLevel: 25,
        suggestedQty: 100,
        status: AlertStatus.PENDING,
        createdAt: new Date()
      });

      mockPrisma.reorderRule.update.mockResolvedValue(mockReorderRule);

      const alerts = await reorderService.checkReorderAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        skuId: mockSKU.skuCode,
        warehouseId: mockWarehouse.code,
        currentLevel: 10,
        reorderLevel: 25,
        status: AlertStatus.PENDING
      });

      // Step 2: Generate demand forecast for the item
      const forecastRequest = {
        sku: 'CHAIN-TOOL-001',
        warehouse: 'WH001',
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-04-30'),
        includeSeasonality: true,
        includeExternalFactors: false
      };

      // Mock historical data
      const mockHistoricalData = Array.from({ length: 60 }, (_, i) => ({
        id: `movement-${i}`,
        skuId: 'sku-123',
        fromWarehouseId: 'wh-123',
        movementType: 'SHIPMENT',
        quantity: Math.floor(Math.random() * 10) + 1,
        createdAt: new Date(Date.now() - (60 - i) * 24 * 60 * 60 * 1000),
        processed: true
      }));

      mockPrisma.sKU.findUnique.mockResolvedValue(mockSKU);
      mockPrisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      mockPrisma.stockMovement.findMany.mockResolvedValue(mockHistoricalData);
      mockPrisma.demandForecast.createMany.mockResolvedValue({ count: 60 });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const forecast = await forecastingService.generateForecast(forecastRequest, 'user-123');

      expect(forecast.sku).toBe('CHAIN-TOOL-001');
      expect(forecast.warehouse).toBe('WH001');
      expect(forecast.forecasts.length).toBeGreaterThan(0);
      expect(forecast.accuracy).toBeGreaterThan(0.5);

      // Step 3: Calculate optimal reorder point based on forecast
      mockPrisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: 180 } // Total demand over period
      });

      mockPrisma.stockMovement.findMany.mockResolvedValue(
        mockHistoricalData.slice(-30) // Last 30 days for variability calculation
      );

      const reorderCalculation = await reorderService.calculateReorderPoint('CHAIN-TOOL-001', 'WH001');

      expect(reorderCalculation.sku).toBe('CHAIN-TOOL-001');
      expect(reorderCalculation.warehouse).toBe('WH001');
      expect(reorderCalculation.reorderLevel).toBeGreaterThan(0);
      expect(reorderCalculation.calculation.method).toBe('statistical');

      // Verify integration: forecast should inform reorder calculations
      expect(mockPrisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            skuId: 'sku-123',
            fromWarehouseId: 'wh-123'
          })
        })
      );
    });
  });

  describe('Multi-Warehouse Transfer Integration', () => {
    it('should handle inter-warehouse transfers with tracking', async () => {
      // Setup: Two warehouses with different stock levels
      const sourceWarehouse = { id: 'wh-source', code: 'WH-NYC', name: 'New York Warehouse' };
      const targetWarehouse = { id: 'wh-target', code: 'WH-LA', name: 'Los Angeles Warehouse' };
      const mockSKU = { id: 'sku-123', skuCode: 'TIRE-ROAD-001', name: 'Road Bike Tire' };

      // Step 1: Check source warehouse inventory
      const sourceInventory = {
        id: 'level-source',
        skuId: 'sku-123',
        warehouseId: 'wh-source',
        onHand: 100,
        reserved: 10,
        available: 90
      };

      mockPrisma.inventoryLevel.findFirst
        .mockResolvedValueOnce(sourceInventory) // Source check
        .mockResolvedValueOnce(null); // Target doesn't have inventory yet

      // Step 2: Record outbound movement from source
      const outboundMovement = {
        type: MovementType.TRANSFER,
        sku: 'TIRE-ROAD-001',
        warehouse: 'WH-NYC',
        quantity: 20,
        reason: 'Transfer to WH-LA'
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(sourceWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(null) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(sourceInventory),
            update: jest.fn().mockResolvedValue({
              ...sourceInventory,
              onHand: 80,
              available: 70
            })
          },
          stockMovement: {
            create: jest.fn().mockResolvedValue({
              id: 'movement-out',
              movementType: MovementType.TRANSFER,
              quantity: 20,
              sku: mockSKU,
              fromWarehouse: sourceWarehouse,
              createdAt: new Date()
            }),
            update: jest.fn()
          }
        });
      });

      mockRedis.keys.mockResolvedValue([]);

      const outboundResult = await inventoryService.recordMovement(outboundMovement, 'user-123');

      expect(outboundResult.type).toBe(MovementType.TRANSFER);
      expect(outboundResult.quantity).toBe(20);

      // Step 3: Record inbound movement to target
      const inboundMovement = {
        type: MovementType.TRANSFER,
        sku: 'TIRE-ROAD-001',
        warehouse: 'WH-LA',
        quantity: 20,
        reason: 'Transfer from WH-NYC'
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(targetWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(null) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(null), // No existing inventory
            create: jest.fn().mockResolvedValue({
              id: 'level-target',
              skuId: 'sku-123',
              warehouseId: 'wh-target',
              onHand: 20,
              available: 20,
              reserved: 0
            })
          },
          stockMovement: {
            create: jest.fn().mockResolvedValue({
              id: 'movement-in',
              movementType: MovementType.TRANSFER,
              quantity: 20,
              sku: mockSKU,
              toWarehouse: targetWarehouse,
              createdAt: new Date()
            }),
            update: jest.fn()
          }
        });
      });

      const inboundResult = await inventoryService.recordMovement(inboundMovement, 'user-123');

      expect(inboundResult.type).toBe(MovementType.TRANSFER);
      expect(inboundResult.quantity).toBe(20);

      // Step 4: Verify inventory levels across both warehouses
      mockRedis.get.mockResolvedValue(null);

      // Mock updated inventory levels after transfer
      mockPrisma.inventoryLevel.findFirst
        .mockResolvedValueOnce({
          sku: { skuCode: 'TIRE-ROAD-001' },
          warehouse: { code: 'WH-NYC' },
          location: null,
          onHand: 80,
          reserved: 10,
          available: 70,
          inTransit: 0,
          lastUpdated: new Date()
        })
        .mockResolvedValueOnce({
          sku: { skuCode: 'TIRE-ROAD-001' },
          warehouse: { code: 'WH-LA' },
          location: null,
          onHand: 20,
          reserved: 0,
          available: 20,
          inTransit: 0,
          lastUpdated: new Date()
        });

      const sourceLevel = await inventoryService.getStockLevel('TIRE-ROAD-001', 'WH-NYC');
      const targetLevel = await inventoryService.getStockLevel('TIRE-ROAD-001', 'WH-LA');

      expect(sourceLevel?.onHand).toBe(80);
      expect(sourceLevel?.available).toBe(70);
      expect(targetLevel?.onHand).toBe(20);
      expect(targetLevel?.available).toBe(20);

      // Verify both movements were recorded with proper audit trail
      expect(mockAuditService.logAction).toHaveBeenCalledTimes(2);
      expect(mockEventPublisher.publish).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle batch operations efficiently', async () => {
      const startTime = Date.now();

      // Simulate bulk barcode scanning
      const bulkScanRequest = {
        scans: Array.from({ length: 100 }, (_, i) => ({
          barcodeCode: `BULK-ITEM-${String(i).padStart(3, '0')}`,
          quantity: Math.floor(Math.random() * 10) + 1
        })),
        userId: 'user-123',
        warehouseId: 'WH001',
        scanType: ScanType.RECEIVE,
        batchNumber: 'BATCH-BULK-001'
      };

      // Mock successful processing for all scans
      const mockBarcode = {
        id: 'barcode-bulk',
        active: true,
        sku: {
          skuCode: 'BULK-ITEM',
          name: 'Bulk Test Item',
          inventoryLevels: []
        }
      };

      mockPrisma.barcode.findUnique.mockResolvedValue(mockBarcode);
      mockPrisma.scanEvent.create.mockResolvedValue({
        id: 'scan-bulk',
        processed: false,
        createdAt: new Date()
      });
      mockPrisma.scanEvent.update.mockResolvedValue({ processed: true });

      // Mock inventory service calls
      inventoryService.getStockLevel = jest.fn().mockResolvedValue({
        sku: 'BULK-ITEM',
        warehouse: 'WH001',
        onHand: 1000,
        available: 1000
      });

      inventoryService.recordMovement = jest.fn().mockResolvedValue({
        id: 'movement-bulk',
        type: MovementType.RECEIPT
      });

      const result = await barcodeService.processBulkScans(bulkScanRequest);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(result.processed).toBe(100);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);

      // Should process 100 items in reasonable time (< 5 seconds for mocked operations)
      expect(processingTime).toBeLessThan(5000);

      // Verify batch processing was properly audited
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        'user-123',
        'BULK_SCAN',
        'BarcodeService',
        expect.any(String),
        expect.objectContaining({
          totalItems: 100,
          processed: 100,
          failed: 0
        })
      );
    });

    it('should handle concurrent operations without conflicts', async () => {
      // Simulate concurrent stock reservations
      const mockSKU = { id: 'sku-concurrent', skuCode: 'CONCURRENT-TEST' };
      const mockWarehouse = { id: 'wh-concurrent', code: 'WH001' };
      const mockInventoryLevel = {
        id: 'level-concurrent',
        onHand: 100,
        reserved: 0,
        available: 100
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          sKU: { findUnique: jest.fn().mockResolvedValue(mockSKU) },
          warehouse: { findUnique: jest.fn().mockResolvedValue(mockWarehouse) },
          location: { findUnique: jest.fn().mockResolvedValue(null) },
          inventoryLevel: {
            findFirst: jest.fn().mockResolvedValue(mockInventoryLevel),
            update: jest.fn().mockImplementation((params) => {
              // Simulate optimistic concurrency control
              return Promise.resolve({
                ...mockInventoryLevel,
                reserved: mockInventoryLevel.reserved + params.data.reserved,
                available: mockInventoryLevel.available - params.data.reserved
              });
            })
          }
        });
      });

      mockRedis.keys.mockResolvedValue([]);

      // Simulate 10 concurrent reservation attempts
      const reservationPromises = Array.from({ length: 10 }, (_, i) =>
        inventoryService.reserveStock('CONCURRENT-TEST', 'WH001', 5, `user-${i}`)
      );

      const results = await Promise.allSettled(reservationPromises);

      // All reservations should succeed (mocked scenario)
      const successfulReservations = results.filter(r => r.status === 'fulfilled');
      expect(successfulReservations.length).toBe(10);

      // Verify transactions were used for each reservation
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(10);
    });
  });
});