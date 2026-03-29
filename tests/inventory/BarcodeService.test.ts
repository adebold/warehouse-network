import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { BarcodeService } from '../../src/inventory/src/services/BarcodeService';
import { InventoryService } from '../../src/inventory/src/services/InventoryService';
import { EventPublisher } from '../../src/inventory/src/services/EventPublisher';
import { AuditService } from '../../src/inventory/src/services/AuditService';
import { Logger } from '../../src/inventory/src/utils/logger';
import { BarcodeGenerator } from '../../src/inventory/src/utils/barcode';
import {
  ScanType,
  BarcodeFormat,
  ValidationError,
  NotFoundError
} from '../../src/inventory/src/types';

// Mock implementations
const mockPrisma = {
  barcode: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  },
  scanEvent: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn()
  },
  user: {
    findMany: jest.fn()
  }
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

const mockInventoryService = {
  getStockLevel: jest.fn(),
  recordMovement: jest.fn()
} as unknown as InventoryService;

const mockAuditService = {
  logAction: jest.fn()
} as unknown as AuditService;

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
} as unknown as Logger;

const mockBarcodeGenerator = {
  generateImage: jest.fn(),
  generateLabels: jest.fn()
} as unknown as BarcodeGenerator;

describe('BarcodeService', () => {
  let barcodeService: BarcodeService;

  beforeAll(() => {
    barcodeService = new BarcodeService(
      mockPrisma,
      mockRedis,
      mockEventPublisher,
      mockInventoryService,
      mockAuditService,
      mockLogger,
      mockBarcodeGenerator
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processScan', () => {
    const mockScanRequest = {
      barcodeCode: '123456789012',
      userId: 'user-123',
      warehouseId: 'WH001',
      locationId: 'A1-01',
      scanType: ScanType.RECEIVE,
      quantity: 10,
      metadata: { scanner: 'mobile-app' }
    };

    const mockBarcode = {
      id: 'barcode-123',
      code: '123456789012',
      format: BarcodeFormat.CODE128,
      active: true,
      sku: {
        skuCode: 'TEST-SKU-001',
        name: 'Test Product',
        category: { name: 'Electronics' },
        inventoryLevels: [
          {
            warehouse: { code: 'WH001' },
            location: { locationCode: 'A1-01' },
            onHand: 100,
            available: 90
          }
        ]
      }
    };

    it('should successfully process a receive scan', async () => {
      const mockScanEvent = {
        id: 'scan-123',
        barcodeId: 'barcode-123',
        userId: 'user-123',
        scanType: ScanType.RECEIVE,
        quantity: 10,
        processed: false,
        createdAt: new Date()
      };

      const mockStockLevel = {
        sku: 'TEST-SKU-001',
        warehouse: 'WH001',
        location: 'A1-01',
        onHand: 100,
        available: 90,
        reserved: 10,
        inTransit: 0,
        lastUpdated: new Date()
      };

      (mockPrisma.barcode.findUnique as jest.Mock).mockResolvedValue(mockBarcode);
      (mockPrisma.scanEvent.create as jest.Mock).mockResolvedValue(mockScanEvent);
      (mockPrisma.scanEvent.update as jest.Mock).mockResolvedValue({ ...mockScanEvent, processed: true });
      (mockInventoryService.getStockLevel as jest.Mock).mockResolvedValue(mockStockLevel);
      (mockInventoryService.recordMovement as jest.Mock).mockResolvedValue({});

      const result = await barcodeService.processScan(mockScanRequest);

      expect(result.success).toBe(true);
      expect(result.sku).toEqual(mockBarcode.sku);
      expect(result.stockLevel).toEqual(mockStockLevel);
      expect(result.message).toContain('Received 10 units');

      expect(mockPrisma.scanEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          barcodeId: 'barcode-123',
          userId: 'user-123',
          scanType: ScanType.RECEIVE,
          quantity: 10
        })
      });

      expect(mockInventoryService.recordMovement).toHaveBeenCalledWith({
        type: 'RECEIPT',
        sku: 'TEST-SKU-001',
        warehouse: 'WH001',
        location: 'A1-01',
        quantity: 10,
        reason: 'Barcode scan - receipt'
      }, 'user-123');

      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        'inventory.scan.processed',
        expect.any(Object)
      );
    });

    it('should handle unknown barcode', async () => {
      (mockPrisma.barcode.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.scanEvent.create as jest.Mock).mockResolvedValue({
        id: 'scan-unknown',
        barcodeId: '',
        userId: 'user-123',
        scanType: ScanType.RECEIVE,
        processed: true,
        createdAt: new Date()
      });

      const result = await barcodeService.processScan(mockScanRequest);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown barcode: 123456789012');
      expect(result.sku).toBeUndefined();

      expect(mockPrisma.scanEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          barcodeId: '',
          metadata: expect.objectContaining({
            unknownBarcode: '123456789012',
            error: 'Barcode not found in system'
          })
        })
      });
    });

    it('should throw ValidationError for invalid barcode format', async () => {
      const invalidScanRequest = {
        ...mockScanRequest,
        barcodeCode: '123' // Too short
      };

      await expect(barcodeService.processScan(invalidScanRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle inactive barcode', async () => {
      const inactiveBarcode = {
        ...mockBarcode,
        active: false
      };

      (mockPrisma.barcode.findUnique as jest.Mock).mockResolvedValue(inactiveBarcode);
      (mockPrisma.scanEvent.create as jest.Mock).mockResolvedValue({
        id: 'scan-inactive',
        barcodeId: '',
        userId: 'user-123',
        processed: true,
        createdAt: new Date()
      });

      const result = await barcodeService.processScan(mockScanRequest);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown barcode: 123456789012');
    });
  });

  describe('processBulkScans', () => {
    const mockBulkRequest = {
      scans: [
        { barcodeCode: '123456789012', quantity: 5 },
        { barcodeCode: '123456789013', quantity: 10 },
        { barcodeCode: 'INVALID', quantity: 1 } // This will fail
      ],
      userId: 'user-123',
      warehouseId: 'WH001',
      scanType: ScanType.RECEIVE,
      batchNumber: 'BATCH-001'
    };

    it('should process bulk scans and handle both successes and failures', async () => {
      // Mock processScan to return success for first two, failure for third
      const originalProcessScan = barcodeService.processScan;
      barcodeService.processScan = jest.fn()
        .mockResolvedValueOnce({
          success: true,
          message: 'Received 5 units',
          scanEvent: { id: 'scan-1' }
        })
        .mockResolvedValueOnce({
          success: true,
          message: 'Received 10 units',
          scanEvent: { id: 'scan-2' }
        })
        .mockRejectedValueOnce(new ValidationError('Invalid barcode format'));

      const result = await barcodeService.processBulkScans(mockBulkRequest);

      expect(result.success).toBe(false); // Not all succeeded
      expect(result.processed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        barcode: 'INVALID',
        error: 'Invalid barcode format'
      });

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        'user-123',
        'BULK_SCAN',
        'BarcodeService',
        expect.any(String),
        expect.objectContaining({
          totalItems: 3,
          processed: 2,
          failed: 1
        })
      );

      // Restore original method
      barcodeService.processScan = originalProcessScan;
    });
  });

  describe('generateBarcodeImage', () => {
    it('should generate barcode image', async () => {
      const mockBarcode = {
        id: 'barcode-123',
        code: '123456789012',
        format: BarcodeFormat.CODE128,
        sku: { name: 'Test Product' }
      };

      const mockImageData = Buffer.from('fake-image-data');

      (mockPrisma.barcode.findUnique as jest.Mock).mockResolvedValue(mockBarcode);
      (mockBarcodeGenerator.generateImage as jest.Mock).mockResolvedValue(mockImageData);

      const result = await barcodeService.generateBarcodeImage('123456789012', 'png', {
        width: 400,
        height: 200
      });

      expect(result).toEqual(mockImageData);

      expect(mockBarcodeGenerator.generateImage).toHaveBeenCalledWith(
        '123456789012',
        BarcodeFormat.CODE128,
        'png',
        expect.objectContaining({
          width: 400,
          height: 200,
          displayValue: 'Test Product'
        })
      );
    });

    it('should throw NotFoundError for non-existent barcode', async () => {
      (mockPrisma.barcode.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        barcodeService.generateBarcodeImage('nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('generateBarcodeLabels', () => {
    it('should generate barcode labels for multiple SKUs', async () => {
      const mockSkus = [
        {
          skuCode: 'TEST-SKU-001',
          name: 'Test Product 1',
          price: 10.99,
          barcodes: [
            { id: 'barcode-1', code: '123456789012', format: BarcodeFormat.CODE128, primary: true }
          ],
          category: { name: 'Electronics' }
        },
        {
          skuCode: 'TEST-SKU-002',
          name: 'Test Product 2',
          price: 15.99,
          barcodes: [
            { id: 'barcode-2', code: '123456789013', format: BarcodeFormat.CODE128, primary: true }
          ],
          category: { name: 'Electronics' }
        }
      ];

      const mockLabelData = Buffer.from('fake-pdf-data');

      (mockPrisma.sKU.findMany as jest.Mock).mockResolvedValue(mockSkus);
      (mockBarcodeGenerator.generateLabels as jest.Mock).mockResolvedValue(mockLabelData);

      const result = await barcodeService.generateBarcodeLabels(
        ['TEST-SKU-001', 'TEST-SKU-002'],
        {
          format: 'pdf',
          labelSize: 'medium',
          includeSkuInfo: true,
          includePrice: true,
          copies: 2
        }
      );

      expect(result).toEqual(mockLabelData);

      expect(mockPrisma.sKU.findMany).toHaveBeenCalledWith({
        where: { skuCode: { in: ['TEST-SKU-001', 'TEST-SKU-002'] } },
        include: expect.any(Object)
      });

      expect(mockBarcodeGenerator.generateLabels).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            sku: expect.objectContaining({ skuCode: 'TEST-SKU-001' }),
            includeSkuInfo: true,
            includePrice: true,
            copies: 2
          })
        ]),
        'pdf'
      );
    });

    it('should throw ValidationError when no valid SKUs found', async () => {
      (mockPrisma.sKU.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        barcodeService.generateBarcodeLabels(['NONEXISTENT-SKU'])
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getScanHistory', () => {
    it('should return paginated scan history with filters', async () => {
      const mockScanEvents = [
        {
          id: 'scan-1',
          barcodeId: 'barcode-1',
          userId: 'user-123',
          scanType: ScanType.RECEIVE,
          quantity: 10,
          processed: true,
          createdAt: new Date(),
          barcode: {
            sku: {
              skuCode: 'TEST-SKU-001',
              name: 'Test Product',
              category: { name: 'Electronics' }
            }
          },
          user: {
            id: 'user-123',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com'
          }
        }
      ];

      (mockPrisma.scanEvent.findMany as jest.Mock).mockResolvedValue(mockScanEvents);
      (mockPrisma.scanEvent.count as jest.Mock).mockResolvedValue(1);

      const result = await barcodeService.getScanHistory({
        userId: 'user-123',
        scanType: ScanType.RECEIVE,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        page: 1,
        limit: 50
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'scan-1',
        scanType: ScanType.RECEIVE,
        quantity: 10,
        processed: true
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);

      expect(mockPrisma.scanEvent.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          processed: true,
          userId: 'user-123',
          scanType: ScanType.RECEIVE,
          createdAt: {
            gte: new Date('2024-01-01'),
            lte: new Date('2024-01-31')
          }
        }),
        include: expect.any(Object),
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' }
      });
    });
  });

  describe('getScanStatistics', () => {
    it('should return comprehensive scan statistics', async () => {
      const mockScansByType = [
        { scanType: ScanType.RECEIVE, _count: { scanType: 50 } },
        { scanType: ScanType.PICK, _count: { scanType: 30 } },
        { scanType: ScanType.COUNT, _count: { scanType: 20 } }
      ];

      const mockScansByUser = [
        { userId: 'user-1', _count: { userId: 40 } },
        { userId: 'user-2', _count: { userId: 35 } },
        { userId: 'user-3', _count: { userId: 25 } }
      ];

      const mockTopScannedSkus = [
        { barcodeId: 'barcode-1', _count: { barcodeId: 30 } },
        { barcodeId: 'barcode-2', _count: { barcodeId: 25 } }
      ];

      const mockUsers = [
        { id: 'user-1', firstName: 'John', lastName: 'Doe' },
        { id: 'user-2', firstName: 'Jane', lastName: 'Smith' },
        { id: 'user-3', firstName: 'Bob', lastName: 'Wilson' }
      ];

      const mockBarcodes = [
        { id: 'barcode-1', sku: { skuCode: 'SKU-001', name: 'Product 1' } },
        { id: 'barcode-2', sku: { skuCode: 'SKU-002', name: 'Product 2' } }
      ];

      const mockScanEvents = [
        { createdAt: new Date('2024-01-01T10:30:00Z') },
        { createdAt: new Date('2024-01-01T14:15:00Z') },
        { createdAt: new Date('2024-01-01T16:45:00Z') }
      ];

      (mockPrisma.scanEvent.count as jest.Mock).mockResolvedValue(100);
      (mockPrisma.scanEvent.groupBy as jest.Mock)
        .mockResolvedValueOnce(mockScansByType)
        .mockResolvedValueOnce(mockScansByUser)
        .mockResolvedValueOnce(mockTopScannedSkus);
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (mockPrisma.barcode.findMany as jest.Mock).mockResolvedValue(mockBarcodes);
      (mockPrisma.scanEvent.findMany as jest.Mock).mockResolvedValue(mockScanEvents);

      const result = await barcodeService.getScanStatistics({
        warehouseId: 'WH001',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });

      expect(result.totalScans).toBe(100);
      expect(result.scansByType).toEqual({
        [ScanType.RECEIVE]: 50,
        [ScanType.PICK]: 30,
        [ScanType.COUNT]: 20,
        [ScanType.LOOKUP]: 0,
        [ScanType.MOVE]: 0
      });

      expect(result.scansByUser).toHaveLength(3);
      expect(result.scansByUser[0]).toEqual({
        userId: 'user-1',
        userName: 'John Doe',
        count: 40
      });

      expect(result.topScannedSkus).toHaveLength(2);
      expect(result.topScannedSkus[0]).toEqual({
        skuCode: 'SKU-001',
        skuName: 'Product 1',
        count: 30
      });

      expect(result.scansByHour).toHaveLength(24);
      expect(result.scansByHour[10].count).toBe(1); // 10:30 AM
      expect(result.scansByHour[14].count).toBe(1); // 2:15 PM
      expect(result.scansByHour[16].count).toBe(1); // 4:45 PM
    });
  });
});