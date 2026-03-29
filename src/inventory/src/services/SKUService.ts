import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  SKUDefinition,
  Barcode,
  BarcodeFormat,
  InventoryError,
  NotFoundError,
  DuplicateError,
  ValidationError
} from '../types';
import { EventPublisher } from './EventPublisher';
import { AuditService } from './AuditService';
import { Logger } from '../utils/logger';
import { BarcodeGenerator } from '../utils/barcode';
import { validateSKU } from '../validators/sku';
import * as crypto from 'crypto';

export class SKUService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventPublisher: EventPublisher,
    private auditService: AuditService,
    private logger: Logger,
    private barcodeGenerator: BarcodeGenerator
  ) {}

  async createSKU(skuDefinition: SKUDefinition, tenantId: string, userId: string): Promise<any> {
    // Validate SKU definition
    const validation = validateSKU(skuDefinition);
    if (!validation.isValid) {
      throw new ValidationError('Invalid SKU definition', validation.errors);
    }

    try {
      // Check if SKU code already exists
      const existingSKU = await this.prisma.sKU.findUnique({
        where: { skuCode: skuDefinition.skuCode }
      });

      if (existingSKU) {
        throw new DuplicateError('SKU', 'skuCode', skuDefinition.skuCode);
      }

      // Verify category exists if provided
      let category = null;
      if (skuDefinition.categoryId) {
        category = await this.prisma.category.findUnique({
          where: { id: skuDefinition.categoryId }
        });
        if (!category) {
          throw new NotFoundError('Category', skuDefinition.categoryId);
        }
      }

      const sku = await this.prisma.$transaction(async (tx) => {
        // Create SKU
        const newSKU = await tx.sKU.create({
          data: {
            tenantId,
            skuCode: skuDefinition.skuCode,
            name: skuDefinition.name,
            description: skuDefinition.description,
            categoryId: skuDefinition.categoryId,
            dimensions: skuDefinition.dimensions,
            cost: skuDefinition.cost,
            price: skuDefinition.price,
            attributes: skuDefinition.attributes || {},
            tags: skuDefinition.tags || []
          },
          include: {
            category: true,
            barcodes: true
          }
        });

        // Generate primary barcode
        const barcodeCode = await this.generateUniqueBarcode(skuDefinition.skuCode);
        await tx.barcode.create({
          data: {
            skuId: newSKU.id,
            code: barcodeCode,
            format: BarcodeFormat.CODE128,
            primary: true
          }
        });

        return newSKU;
      });

      // Clear any relevant caches
      await this.clearSKUCache(skuDefinition.skuCode);

      // Create audit log
      await this.auditService.logAction(userId, 'CREATE_SKU', 'SKU', sku.id, {
        skuDefinition,
        result: 'SUCCESS'
      });

      this.logger.info('SKU created successfully', {
        skuId: sku.id,
        skuCode: skuDefinition.skuCode
      });

      return sku;
    } catch (error) {
      this.logger.error('Failed to create SKU', { skuDefinition, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to create SKU', 'SKU_CREATION_ERROR', 500);
    }
  }

  async getSKU(skuCode: string): Promise<any | null> {
    const cacheKey = `sku:${skuCode}`;

    try {
      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Query database
      const sku = await this.prisma.sKU.findUnique({
        where: { skuCode },
        include: {
          category: true,
          barcodes: {
            where: { active: true },
            orderBy: { primary: 'desc' }
          },
          inventoryLevels: {
            include: {
              warehouse: true,
              location: true
            }
          },
          _count: {
            select: {
              stockMovements: true
            }
          }
        }
      });

      if (!sku) {
        return null;
      }

      // Cache for 30 minutes
      await this.redis.setex(cacheKey, 1800, JSON.stringify(sku));

      return sku;
    } catch (error) {
      this.logger.error('Failed to get SKU', { skuCode, error });
      throw new InventoryError('Failed to retrieve SKU', 'SKU_RETRIEVAL_ERROR', 500);
    }
  }

  async updateSKU(
    skuCode: string,
    updates: Partial<SKUDefinition>,
    userId: string
  ): Promise<any> {
    try {
      const existingSKU = await this.prisma.sKU.findUnique({
        where: { skuCode }
      });

      if (!existingSKU) {
        throw new NotFoundError('SKU', skuCode);
      }

      // Validate updates
      if (updates.categoryId) {
        const category = await this.prisma.category.findUnique({
          where: { id: updates.categoryId }
        });
        if (!category) {
          throw new NotFoundError('Category', updates.categoryId);
        }
      }

      const updatedSKU = await this.prisma.sKU.update({
        where: { skuCode },
        data: {
          ...(updates.name && { name: updates.name }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.categoryId && { categoryId: updates.categoryId }),
          ...(updates.dimensions && { dimensions: updates.dimensions }),
          ...(updates.cost !== undefined && { cost: updates.cost }),
          ...(updates.price !== undefined && { price: updates.price }),
          ...(updates.attributes && { attributes: updates.attributes }),
          ...(updates.tags && { tags: updates.tags })
        },
        include: {
          category: true,
          barcodes: true
        }
      });

      // Clear cache
      await this.clearSKUCache(skuCode);

      // Create audit log
      await this.auditService.logAction(userId, 'UPDATE_SKU', 'SKU', existingSKU.id, {
        before: existingSKU,
        after: updates,
        result: 'SUCCESS'
      });

      this.logger.info('SKU updated successfully', { skuCode, updates });

      return updatedSKU;
    } catch (error) {
      this.logger.error('Failed to update SKU', { skuCode, updates, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to update SKU', 'SKU_UPDATE_ERROR', 500);
    }
  }

  async deactivateSKU(skuCode: string, userId: string): Promise<void> {
    try {
      const sku = await this.prisma.sKU.findUnique({
        where: { skuCode },
        include: {
          inventoryLevels: true
        }
      });

      if (!sku) {
        throw new NotFoundError('SKU', skuCode);
      }

      // Check if there's active inventory
      const hasActiveInventory = sku.inventoryLevels.some(level => level.onHand > 0 || level.reserved > 0);
      if (hasActiveInventory) {
        throw new ValidationError(
          'Cannot deactivate SKU with active inventory. Please remove all stock first.'
        );
      }

      await this.prisma.sKU.update({
        where: { skuCode },
        data: { active: false }
      });

      // Clear cache
      await this.clearSKUCache(skuCode);

      // Create audit log
      await this.auditService.logAction(userId, 'DEACTIVATE_SKU', 'SKU', sku.id, {
        skuCode,
        result: 'SUCCESS'
      });

      this.logger.info('SKU deactivated successfully', { skuCode });
    } catch (error) {
      this.logger.error('Failed to deactivate SKU', { skuCode, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to deactivate SKU', 'SKU_DEACTIVATION_ERROR', 500);
    }
  }

  async generateBarcode(
    skuCode: string,
    format: BarcodeFormat = BarcodeFormat.CODE128,
    userId: string
  ): Promise<Barcode> {
    try {
      const sku = await this.prisma.sKU.findUnique({
        where: { skuCode }
      });

      if (!sku) {
        throw new NotFoundError('SKU', skuCode);
      }

      // Generate unique barcode
      const barcodeCode = await this.generateUniqueBarcode(skuCode, format);

      const barcode = await this.prisma.barcode.create({
        data: {
          skuId: sku.id,
          code: barcodeCode,
          format,
          primary: false // Additional barcodes are not primary
        }
      });

      // Clear SKU cache to include new barcode
      await this.clearSKUCache(skuCode);

      // Cache barcode lookup
      await this.redis.setex(`barcode:${barcodeCode}`, 3600, JSON.stringify({
        id: barcode.id,
        skuId: sku.id,
        skuCode: sku.skuCode,
        format: barcode.format,
        primary: barcode.primary
      }));

      // Create audit log
      await this.auditService.logAction(userId, 'GENERATE_BARCODE', 'Barcode', barcode.id, {
        skuCode,
        barcodeCode,
        format,
        result: 'SUCCESS'
      });

      this.logger.info('Barcode generated successfully', { skuCode, barcodeCode, format });

      return {
        id: barcode.id,
        skuId: sku.id,
        code: barcode.code,
        format: barcode.format,
        primary: barcode.primary,
        active: barcode.active,
        createdAt: barcode.createdAt
      };
    } catch (error) {
      this.logger.error('Failed to generate barcode', { skuCode, format, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to generate barcode', 'BARCODE_GENERATION_ERROR', 500);
    }
  }

  async validateBarcode(barcodeCode: string): Promise<any | null> {
    const cacheKey = `barcode:${barcodeCode}`;

    try {
      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const barcodeInfo = JSON.parse(cached);
        // Get full SKU info
        return await this.getSKU(barcodeInfo.skuCode);
      }

      // Query database
      const barcode = await this.prisma.barcode.findUnique({
        where: { code: barcodeCode },
        include: {
          sku: {
            include: {
              category: true,
              inventoryLevels: {
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
        return null;
      }

      // Cache barcode lookup for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify({
        id: barcode.id,
        skuId: barcode.sku.id,
        skuCode: barcode.sku.skuCode,
        format: barcode.format,
        primary: barcode.primary
      }));

      return barcode.sku;
    } catch (error) {
      this.logger.error('Failed to validate barcode', { barcodeCode, error });
      throw new InventoryError('Failed to validate barcode', 'BARCODE_VALIDATION_ERROR', 500);
    }
  }

  async searchSKUs(query: {
    search?: string;
    category?: string;
    active?: boolean;
    tags?: string[];
    page?: number;
    limit?: number;
  }): Promise<{
    data: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        search,
        category,
        active = true,
        tags,
        page = 1,
        limit = 50
      } = query;

      const skip = (page - 1) * limit;

      const where: any = {
        active,
        ...(search && {
          OR: [
            { skuCode: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } }
          ]
        }),
        ...(category && {
          category: { name: { contains: category, mode: 'insensitive' } }
        }),
        ...(tags && tags.length > 0 && {
          tags: { hasSome: tags }
        })
      };

      const [skus, total] = await Promise.all([
        this.prisma.sKU.findMany({
          where,
          include: {
            category: true,
            barcodes: {
              where: { active: true },
              orderBy: { primary: 'desc' }
            },
            _count: {
              select: {
                inventoryLevels: true,
                stockMovements: true
              }
            }
          },
          skip,
          take: limit,
          orderBy: [
            { name: 'asc' },
            { skuCode: 'asc' }
          ]
        }),
        this.prisma.sKU.count({ where })
      ]);

      return {
        data: skus,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('Failed to search SKUs', { query, error });
      throw new InventoryError('Failed to search SKUs', 'SKU_SEARCH_ERROR', 500);
    }
  }

  async getBarcodeImage(
    barcodeCode: string,
    format: 'svg' | 'png' = 'svg',
    options?: { width?: number; height?: number }
  ): Promise<Buffer | string> {
    try {
      const barcode = await this.prisma.barcode.findUnique({
        where: { code: barcodeCode }
      });

      if (!barcode) {
        throw new NotFoundError('Barcode', barcodeCode);
      }

      return await this.barcodeGenerator.generateImage(
        barcodeCode,
        barcode.format,
        format,
        options
      );
    } catch (error) {
      this.logger.error('Failed to generate barcode image', { barcodeCode, format, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to generate barcode image', 'BARCODE_IMAGE_ERROR', 500);
    }
  }

  // Private helper methods
  private async generateUniqueBarcode(
    skuCode: string,
    format: BarcodeFormat = BarcodeFormat.CODE128
  ): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      let barcodeCode: string;

      switch (format) {
        case BarcodeFormat.CODE128:
          barcodeCode = this.generateCode128(skuCode);
          break;
        case BarcodeFormat.EAN13:
          barcodeCode = this.generateEAN13();
          break;
        case BarcodeFormat.UPC_A:
          barcodeCode = this.generateUPCA();
          break;
        case BarcodeFormat.QR_CODE:
          barcodeCode = skuCode;
          break;
        default:
          barcodeCode = this.generateCode128(skuCode);
      }

      // Check if barcode already exists
      const existing = await this.prisma.barcode.findUnique({
        where: { code: barcodeCode }
      });

      if (!existing) {
        return barcodeCode;
      }

      attempts++;
    }

    throw new InventoryError(
      'Failed to generate unique barcode after maximum attempts',
      'BARCODE_GENERATION_FAILED',
      500
    );
  }

  private generateCode128(skuCode: string): string {
    // Simple Code128 generation with timestamp suffix
    const timestamp = Date.now().toString().slice(-6);
    const sanitizedSku = skuCode.replace(/[^A-Z0-9]/gi, '').slice(0, 8);
    return `${sanitizedSku}${timestamp}`;
  }

  private generateEAN13(): string {
    // Generate 12-digit number and calculate check digit
    let code = Math.floor(Math.random() * 999999999999).toString().padStart(12, '0');
    const checkDigit = this.calculateEAN13CheckDigit(code);
    return `${code}${checkDigit}`;
  }

  private generateUPCA(): string {
    // Generate 11-digit number and calculate check digit
    let code = Math.floor(Math.random() * 99999999999).toString().padStart(11, '0');
    const checkDigit = this.calculateUPCCheckDigit(code);
    return `${code}${checkDigit}`;
  }

  private calculateEAN13CheckDigit(code: string): number {
    let sum = 0;
    for (let i = 0; i < code.length; i++) {
      const digit = parseInt(code[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    return (10 - (sum % 10)) % 10;
  }

  private calculateUPCCheckDigit(code: string): number {
    let sum = 0;
    for (let i = 0; i < code.length; i++) {
      const digit = parseInt(code[i]);
      sum += i % 2 === 0 ? digit * 3 : digit;
    }
    return (10 - (sum % 10)) % 10;
  }

  private async clearSKUCache(skuCode: string): Promise<void> {
    const keys = await this.redis.keys(`sku:${skuCode}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}