import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  ScanEvent,
  ScanType,
  BarcodeFormat,
  InventoryError,
  NotFoundError,
  ValidationError,
  EventType,
  InventoryEvent
} from '../types';
import { EventPublisher } from './EventPublisher';
import { InventoryService } from './InventoryService';
import { AuditService } from './AuditService';
import { Logger } from '../utils/logger';
import { BarcodeGenerator } from '../utils/barcode';

interface ScanRequest {
  barcodeCode: string;
  userId: string;
  warehouseId?: string;
  locationId?: string;
  scanType: ScanType;
  quantity?: number;
  metadata?: Record<string, any>;
}

interface ScanResult {
  success: boolean;
  sku?: any;
  stockLevel?: any;
  message: string;
  scanEvent: ScanEvent;
}

interface BulkScanRequest {
  scans: Array<{
    barcodeCode: string;
    quantity?: number;
    locationId?: string;
  }>;
  userId: string;
  warehouseId: string;
  scanType: ScanType;
  batchNumber?: string;
}

export class BarcodeService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventPublisher: EventPublisher,
    private inventoryService: InventoryService,
    private auditService: AuditService,
    private logger: Logger,
    private barcodeGenerator: BarcodeGenerator
  ) {}

  async processScan(scanRequest: ScanRequest): Promise<ScanResult> {
    try {
      // Validate barcode format
      if (!this.isValidBarcodeFormat(scanRequest.barcodeCode)) {
        throw new ValidationError('Invalid barcode format');
      }

      // Find barcode in database
      const barcode = await this.prisma.barcode.findUnique({
        where: { code: scanRequest.barcodeCode },
        include: {
          sku: {
            include: {
              category: true,
              inventoryLevels: {
                where: {
                  ...(scanRequest.warehouseId && {
                    warehouse: { code: scanRequest.warehouseId }
                  })
                },
                include: {
                  warehouse: true,
                  location: true
                }
              }
            }
          }
        }
      });

      if (!barcode || !barcode.active) {
        return await this.handleUnknownBarcode(scanRequest);
      }

      // Create scan event
      const scanEvent = await this.createScanEvent(scanRequest, barcode.id);

      // Get current stock level
      const stockLevel = await this.inventoryService.getStockLevel(
        barcode.sku.skuCode,
        scanRequest.warehouseId || '',
        scanRequest.locationId
      );

      // Process scan based on type
      const result = await this.processScanByType(scanRequest, barcode.sku, scanEvent);

      // Update scan event as processed
      await this.prisma.scanEvent.update({
        where: { id: scanEvent.id },
        data: {
          processed: true,
          processedAt: new Date()
        }
      });

      // Publish scan event
      const event: InventoryEvent = {
        eventType: EventType.SCAN_EVENT,
        timestamp: new Date(),
        data: {
          scanEvent,
          sku: barcode.sku,
          result
        },
        userId: scanRequest.userId
      };
      await this.eventPublisher.publish('inventory.scan.processed', event);

      this.logger.info('Barcode scan processed successfully', {
        barcodeCode: scanRequest.barcodeCode,
        scanType: scanRequest.scanType,
        skuCode: barcode.sku.skuCode,
        result: result.success
      });

      return {
        success: result.success,
        sku: barcode.sku,
        stockLevel,
        message: result.message,
        scanEvent
      };
    } catch (error) {
      this.logger.error('Failed to process barcode scan', { scanRequest, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to process barcode scan', 'BARCODE_SCAN_ERROR', 500);
    }
  }

  async processBulkScans(bulkRequest: BulkScanRequest): Promise<{
    success: boolean;
    processed: number;
    failed: number;
    results: ScanResult[];
    errors: Array<{ barcode: string; error: string }>;
  }> {
    const results: ScanResult[] = [];
    const errors: Array<{ barcode: string; error: string }> = [];
    let processed = 0;
    let failed = 0;

    try {
      // Process scans in batches to avoid overwhelming the database
      const batchSize = 50;
      const batches = this.chunkArray(bulkRequest.scans, batchSize);

      for (const batch of batches) {
        const batchPromises = batch.map(async (scan) => {
          try {
            const scanRequest: ScanRequest = {
              barcodeCode: scan.barcodeCode,
              userId: bulkRequest.userId,
              warehouseId: bulkRequest.warehouseId,
              locationId: scan.locationId,
              scanType: bulkRequest.scanType,
              quantity: scan.quantity || 1,
              metadata: {
                batchNumber: bulkRequest.batchNumber,
                bulkScan: true
              }
            };

            const result = await this.processScan(scanRequest);
            results.push(result);
            processed++;
            return result;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push({ barcode: scan.barcodeCode, error: errorMessage });
            failed++;
            this.logger.error('Bulk scan item failed', { barcode: scan.barcodeCode, error });
          }
        });

        await Promise.all(batchPromises);
      }

      // Create audit log for bulk operation
      await this.auditService.logAction(
        bulkRequest.userId,
        'BULK_SCAN',
        'BarcodeService',
        `bulk_${Date.now()}`,
        {
          totalItems: bulkRequest.scans.length,
          processed,
          failed,
          scanType: bulkRequest.scanType,
          warehouseId: bulkRequest.warehouseId
        }
      );

      this.logger.info('Bulk scan completed', {
        totalItems: bulkRequest.scans.length,
        processed,
        failed,
        userId: bulkRequest.userId
      });

      return {
        success: failed === 0,
        processed,
        failed,
        results,
        errors
      };
    } catch (error) {
      this.logger.error('Bulk scan operation failed', { bulkRequest, error });
      throw new InventoryError('Bulk scan operation failed', 'BULK_SCAN_ERROR', 500);
    }
  }

  async generateBarcodeImage(
    barcodeCode: string,
    format: 'svg' | 'png' = 'svg',
    options?: {
      width?: number;
      height?: number;
      includeText?: boolean;
      margin?: number;
    }
  ): Promise<Buffer | string> {
    try {
      const barcode = await this.prisma.barcode.findUnique({
        where: { code: barcodeCode },
        include: { sku: true }
      });

      if (!barcode) {
        throw new NotFoundError('Barcode', barcodeCode);
      }

      return await this.barcodeGenerator.generateImage(
        barcodeCode,
        barcode.format,
        format,
        {
          ...options,
          displayValue: barcode.sku.name
        }
      );
    } catch (error) {
      this.logger.error('Failed to generate barcode image', { barcodeCode, format, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to generate barcode image', 'BARCODE_IMAGE_ERROR', 500);
    }
  }

  async generateBarcodeLabels(
    skuCodes: string[],
    options: {
      format?: 'svg' | 'png' | 'pdf';
      labelSize?: 'small' | 'medium' | 'large';
      includeSkuInfo?: boolean;
      includePrice?: boolean;
      copies?: number;
    } = {}
  ): Promise<Buffer> {
    try {
      const {
        format = 'pdf',
        labelSize = 'medium',
        includeSkuInfo = true,
        includePrice = false,
        copies = 1
      } = options;

      // Get SKUs with their barcodes
      const skus = await this.prisma.sKU.findMany({
        where: {
          skuCode: { in: skuCodes }
        },
        include: {
          barcodes: {
            where: { active: true },
            orderBy: { primary: 'desc' }
          },
          category: true
        }
      });

      if (skus.length === 0) {
        throw new ValidationError('No valid SKUs found for label generation');
      }

      // Generate labels
      const labelData = skus.flatMap(sku => {
        const primaryBarcode = sku.barcodes.find(b => b.primary) || sku.barcodes[0];
        if (!primaryBarcode) return [];

        return Array(copies).fill({
          sku,
          barcode: primaryBarcode,
          includeSkuInfo,
          includePrice,
          labelSize
        });
      });

      return await this.barcodeGenerator.generateLabels(labelData, format);
    } catch (error) {
      this.logger.error('Failed to generate barcode labels', { skuCodes, options, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to generate barcode labels', 'LABEL_GENERATION_ERROR', 500);
    }
  }

  async getScanHistory(filters: {
    userId?: string;
    warehouseId?: string;
    skuCode?: string;
    scanType?: ScanType;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{
    data: ScanEvent[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        userId,
        warehouseId,
        skuCode,
        scanType,
        startDate,
        endDate,
        page = 1,
        limit = 50
      } = filters;

      const skip = (page - 1) * limit;

      const where: any = {
        processed: true,
        ...(userId && { userId }),
        ...(warehouseId && { warehouseId }),
        ...(scanType && { scanType }),
        ...(skuCode && {
          barcode: {
            sku: { skuCode }
          }
        }),
        ...(startDate || endDate) && {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate })
          }
        }
      };

      const [scanEvents, total] = await Promise.all([
        this.prisma.scanEvent.findMany({
          where,
          include: {
            barcode: {
              include: {
                sku: {
                  include: {
                    category: true
                  }
                }
              }
            },
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.scanEvent.count({ where })
      ]);

      const data = scanEvents.map(event => ({
        id: event.id,
        barcodeId: event.barcodeId,
        userId: event.userId,
        warehouseId: event.warehouseId,
        locationId: event.locationId,
        scanType: event.scanType,
        quantity: event.quantity,
        metadata: event.metadata,
        processed: event.processed,
        createdAt: event.createdAt
      }));

      return {
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('Failed to get scan history', { filters, error });
      throw new InventoryError('Failed to retrieve scan history', 'SCAN_HISTORY_ERROR', 500);
    }
  }

  async getScanStatistics(filters: {
    warehouseId?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalScans: number;
    scansByType: Record<ScanType, number>;
    scansByUser: Array<{ userId: string; userName: string; count: number }>;
    scansByHour: Array<{ hour: number; count: number }>;
    topScannedSkus: Array<{ skuCode: string; skuName: string; count: number }>;
  }> {
    try {
      const { warehouseId, userId, startDate, endDate } = filters;

      const where: any = {
        processed: true,
        ...(warehouseId && { warehouseId }),
        ...(userId && { userId }),
        ...(startDate || endDate) && {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate })
          }
        }
      };

      const [
        totalScans,
        scansByType,
        scansByUser,
        topScannedSkus
      ] = await Promise.all([
        this.prisma.scanEvent.count({ where }),
        this.prisma.scanEvent.groupBy({
          by: ['scanType'],
          where,
          _count: { scanType: true }
        }),
        this.prisma.scanEvent.groupBy({
          by: ['userId'],
          where,
          _count: { userId: true },
          orderBy: { _count: { userId: 'desc' } },
          take: 10
        }),
        this.prisma.scanEvent.groupBy({
          by: ['barcodeId'],
          where,
          _count: { barcodeId: true },
          orderBy: { _count: { barcodeId: 'desc' } },
          take: 10
        })
      ]);

      // Get user details for scansByUser
      const userIds = scansByUser.map(item => item.userId);
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true }
      });

      const userMap = new Map(users.map(user => [
        user.id,
        `${user.firstName} ${user.lastName}`
      ]));

      // Get SKU details for topScannedSkus
      const barcodeIds = topScannedSkus.map(item => item.barcodeId);
      const barcodes = await this.prisma.barcode.findMany({
        where: { id: { in: barcodeIds } },
        include: { sku: true }
      });

      const barcodeMap = new Map(barcodes.map(barcode => [
        barcode.id,
        { skuCode: barcode.sku.skuCode, skuName: barcode.sku.name }
      ]));

      // Get hourly distribution
      const scanEvents = await this.prisma.scanEvent.findMany({
        where,
        select: { createdAt: true }
      });

      const scansByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
      scanEvents.forEach(event => {
        const hour = new Date(event.createdAt).getHours();
        scansByHour[hour].count++;
      });

      return {
        totalScans: totalScans._count || totalScans,
        scansByType: Object.fromEntries(
          Object.values(ScanType).map(type => [
            type,
            scansByType.find(item => item.scanType === type)?._count.scanType || 0
          ])
        ) as Record<ScanType, number>,
        scansByUser: scansByUser.map(item => ({
          userId: item.userId,
          userName: userMap.get(item.userId) || 'Unknown User',
          count: item._count.userId
        })),
        scansByHour,
        topScannedSkus: topScannedSkus.map(item => ({
          skuCode: barcodeMap.get(item.barcodeId)?.skuCode || 'Unknown',
          skuName: barcodeMap.get(item.barcodeId)?.skuName || 'Unknown',
          count: item._count.barcodeId
        }))
      };
    } catch (error) {
      this.logger.error('Failed to get scan statistics', { filters, error });
      throw new InventoryError('Failed to retrieve scan statistics', 'SCAN_STATISTICS_ERROR', 500);
    }
  }

  // Private helper methods
  private async createScanEvent(scanRequest: ScanRequest, barcodeId: string): Promise<ScanEvent> {
    const scanEvent = await this.prisma.scanEvent.create({
      data: {
        barcodeId,
        userId: scanRequest.userId,
        warehouseId: scanRequest.warehouseId,
        locationId: scanRequest.locationId,
        scanType: scanRequest.scanType,
        quantity: scanRequest.quantity,
        metadata: scanRequest.metadata || {}
      }
    });

    return {
      id: scanEvent.id,
      barcodeId: scanEvent.barcodeId,
      userId: scanEvent.userId,
      warehouseId: scanEvent.warehouseId,
      locationId: scanEvent.locationId,
      scanType: scanEvent.scanType,
      quantity: scanEvent.quantity,
      metadata: scanEvent.metadata as Record<string, any>,
      processed: scanEvent.processed,
      createdAt: scanEvent.createdAt
    };
  }

  private async processScanByType(
    scanRequest: ScanRequest,
    sku: any,
    scanEvent: ScanEvent
  ): Promise<{ success: boolean; message: string }> {
    try {
      switch (scanRequest.scanType) {
        case ScanType.RECEIVE:
          return await this.processReceiveScan(scanRequest, sku);

        case ScanType.PICK:
          return await this.processPickScan(scanRequest, sku);

        case ScanType.COUNT:
          return await this.processCountScan(scanRequest, sku);

        case ScanType.MOVE:
          return await this.processMoveScan(scanRequest, sku);

        case ScanType.LOOKUP:
          return { success: true, message: `SKU: ${sku.name} (${sku.skuCode})` };

        default:
          return { success: true, message: 'Scan recorded' };
      }
    } catch (error) {
      this.logger.error('Failed to process scan by type', { scanRequest, error });
      return { success: false, message: error instanceof Error ? error.message : 'Processing failed' };
    }
  }

  private async processReceiveScan(scanRequest: ScanRequest, sku: any): Promise<{ success: boolean; message: string }> {
    if (!scanRequest.warehouseId) {
      throw new ValidationError('Warehouse ID required for receive scans');
    }

    await this.inventoryService.recordMovement({
      type: 'RECEIPT',
      sku: sku.skuCode,
      warehouse: scanRequest.warehouseId,
      location: scanRequest.locationId,
      quantity: scanRequest.quantity || 1,
      reason: 'Barcode scan - receipt'
    }, scanRequest.userId);

    return {
      success: true,
      message: `Received ${scanRequest.quantity || 1} units of ${sku.name}`
    };
  }

  private async processPickScan(scanRequest: ScanRequest, sku: any): Promise<{ success: boolean; message: string }> {
    if (!scanRequest.warehouseId) {
      throw new ValidationError('Warehouse ID required for pick scans');
    }

    await this.inventoryService.recordMovement({
      type: 'SHIPMENT',
      sku: sku.skuCode,
      warehouse: scanRequest.warehouseId,
      location: scanRequest.locationId,
      quantity: scanRequest.quantity || 1,
      reason: 'Barcode scan - pick'
    }, scanRequest.userId);

    return {
      success: true,
      message: `Picked ${scanRequest.quantity || 1} units of ${sku.name}`
    };
  }

  private async processCountScan(scanRequest: ScanRequest, sku: any): Promise<{ success: boolean; message: string }> {
    if (!scanRequest.warehouseId) {
      throw new ValidationError('Warehouse ID required for count scans');
    }

    // For cycle counting, we would typically compare scanned quantity with expected
    // For now, just record the count
    await this.inventoryService.recordMovement({
      type: 'CYCLE_COUNT',
      sku: sku.skuCode,
      warehouse: scanRequest.warehouseId,
      location: scanRequest.locationId,
      quantity: scanRequest.quantity || 0, // Could be adjustment
      reason: 'Barcode scan - cycle count'
    }, scanRequest.userId);

    return {
      success: true,
      message: `Counted ${scanRequest.quantity || 1} units of ${sku.name}`
    };
  }

  private async processMoveScan(scanRequest: ScanRequest, sku: any): Promise<{ success: boolean; message: string }> {
    // Move scans typically require from/to locations in metadata
    const fromLocation = scanRequest.metadata?.fromLocation;
    const toLocation = scanRequest.metadata?.toLocation || scanRequest.locationId;

    if (!fromLocation || !toLocation) {
      throw new ValidationError('From and to locations required for move scans');
    }

    // Record as internal transfer
    await this.inventoryService.recordMovement({
      type: 'TRANSFER',
      sku: sku.skuCode,
      warehouse: scanRequest.warehouseId || '',
      location: toLocation,
      quantity: scanRequest.quantity || 1,
      reason: `Move from ${fromLocation} to ${toLocation}`
    }, scanRequest.userId);

    return {
      success: true,
      message: `Moved ${scanRequest.quantity || 1} units from ${fromLocation} to ${toLocation}`
    };
  }

  private async handleUnknownBarcode(scanRequest: ScanRequest): Promise<ScanResult> {
    // Create scan event for unknown barcode
    const scanEvent = await this.prisma.scanEvent.create({
      data: {
        barcodeId: '', // No barcode ID for unknown codes
        userId: scanRequest.userId,
        warehouseId: scanRequest.warehouseId,
        locationId: scanRequest.locationId,
        scanType: scanRequest.scanType,
        quantity: scanRequest.quantity,
        metadata: {
          ...scanRequest.metadata,
          unknownBarcode: scanRequest.barcodeCode,
          error: 'Barcode not found in system'
        },
        processed: true,
        processedAt: new Date()
      }
    });

    return {
      success: false,
      message: `Unknown barcode: ${scanRequest.barcodeCode}`,
      scanEvent: {
        id: scanEvent.id,
        barcodeId: scanEvent.barcodeId,
        userId: scanEvent.userId,
        warehouseId: scanEvent.warehouseId,
        locationId: scanEvent.locationId,
        scanType: scanEvent.scanType,
        quantity: scanEvent.quantity,
        metadata: scanEvent.metadata as Record<string, any>,
        processed: scanEvent.processed,
        createdAt: scanEvent.createdAt
      }
    };
  }

  private isValidBarcodeFormat(barcode: string): boolean {
    // Basic validation - could be extended with specific format validation
    if (!barcode || barcode.length < 4) return false;

    // Check for common barcode patterns
    const patterns = [
      /^\d{12,14}$/, // EAN13, UPC-A
      /^[A-Z0-9]+$/, // Code128, Code39
      /^[\w\-\.]+$/ // General alphanumeric
    ];

    return patterns.some(pattern => pattern.test(barcode));
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}