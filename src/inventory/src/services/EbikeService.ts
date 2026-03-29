import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  BikeModel,
  PartCompatibility,
  CompatibilityType,
  InventoryError,
  NotFoundError,
  DuplicateError,
  ValidationError
} from '../types';
import { EventPublisher } from './EventPublisher';
import { AuditService } from './AuditService';
import { Logger } from '../utils/logger';
import { InventoryService } from './InventoryService';

interface ServiceRequest {
  bikeModel: string;
  serviceType: 'maintenance' | 'repair' | 'upgrade' | 'recall';
  partsNeeded: Array<{
    partSku: string;
    quantity: number;
    required: boolean;
  }>;
  scheduledDate?: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  customerInfo?: {
    id: string;
    name: string;
    contact: string;
  };
  notes?: string;
}

interface ServiceAppointment {
  id: string;
  serviceRequest: ServiceRequest;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  assignedTechnician?: string;
  estimatedDuration: number; // in minutes
  actualDuration?: number;
  partsAllocated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface WarrantyItem {
  serialNumber: string;
  skuCode: string;
  purchaseDate: Date;
  warrantyPeriod: number; // in months
  customer?: {
    id: string;
    name: string;
    contact: string;
  };
}

interface WarrantyStatus {
  isValid: boolean;
  expirationDate: Date;
  remainingDays: number;
  claimHistory: Array<{
    claimId: string;
    date: Date;
    type: string;
    status: string;
    amount?: number;
  }>;
}

interface CompatibilityMatrix {
  bikeModel: string;
  compatibleParts: Array<{
    partSku: string;
    partName: string;
    category: string;
    compatibilityType: CompatibilityType;
    fitmentNotes?: string;
    installationDifficulty: 'easy' | 'medium' | 'hard' | 'professional';
  }>;
  incompatibleParts: Array<{
    partSku: string;
    reason: string;
  }>;
}

interface BikeModelSpecification {
  general: {
    manufacturer: string;
    modelYear: number;
    category: string;
    msrp?: number;
    weight?: number;
    maxLoad?: number;
  };
  drivetrain: {
    motor?: {
      type: string;
      power: number; // watts
      torque?: number; // Nm
      placement: 'hub' | 'mid-drive';
    };
    battery?: {
      capacity: number; // Wh
      voltage: number;
      chemistry: string;
      range?: number; // km
    };
    transmission: {
      type: string;
      speeds: number;
      brand?: string;
    };
  };
  components: {
    brakes: {
      type: string;
      brand?: string;
      rotorSize?: number;
    };
    suspension: {
      front?: {
        type: string;
        travel?: number; // mm
      };
      rear?: {
        type: string;
        travel?: number; // mm
      };
    };
    wheels: {
      size: string;
      rimMaterial?: string;
      tireType?: string;
    };
  };
}

export class EbikeService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventPublisher: EventPublisher,
    private auditService: AuditService,
    private logger: Logger,
    private inventoryService: InventoryService
  ) {}

  async createBikeModel(
    modelDefinition: {
      modelCode: string;
      name: string;
      manufacturer: string;
      modelYear: number;
      category: string;
      specifications?: BikeModelSpecification;
    },
    tenantId: string,
    userId: string
  ): Promise<BikeModel> {
    try {
      // Check if model already exists
      const existingModel = await this.prisma.bikeModel.findUnique({
        where: { modelCode: modelDefinition.modelCode }
      });

      if (existingModel) {
        throw new DuplicateError('BikeModel', 'modelCode', modelDefinition.modelCode);
      }

      const bikeModel = await this.prisma.bikeModel.create({
        data: {
          tenantId,
          modelCode: modelDefinition.modelCode,
          name: modelDefinition.name,
          manufacturer: modelDefinition.manufacturer,
          modelYear: modelDefinition.modelYear,
          category: modelDefinition.category,
          specifications: modelDefinition.specifications || {}
        }
      });

      // Cache the model
      await this.cacheBikeModel(bikeModel);

      // Create audit log
      await this.auditService.logAction(userId, 'CREATE_BIKE_MODEL', 'BikeModel', bikeModel.id, {
        modelDefinition,
        result: 'SUCCESS'
      });

      this.logger.info('Bike model created', {
        modelId: bikeModel.id,
        modelCode: modelDefinition.modelCode,
        manufacturer: modelDefinition.manufacturer
      });

      return {
        id: bikeModel.id,
        modelCode: bikeModel.modelCode,
        name: bikeModel.name,
        manufacturer: bikeModel.manufacturer,
        modelYear: bikeModel.modelYear,
        category: bikeModel.category,
        specifications: bikeModel.specifications as any
      };
    } catch (error) {
      this.logger.error('Failed to create bike model', { modelDefinition, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to create bike model', 'BIKE_MODEL_CREATION_ERROR', 500);
    }
  }

  async linkCompatibleParts(
    bikeModelCode: string,
    partCompatibilities: Array<{
      partSku: string;
      compatibilityType: CompatibilityType;
      notes?: string;
    }>,
    userId: string
  ): Promise<void> {
    try {
      // Validate bike model exists
      const bikeModel = await this.prisma.bikeModel.findUnique({
        where: { modelCode: bikeModelCode }
      });

      if (!bikeModel) {
        throw new NotFoundError('BikeModel', bikeModelCode);
      }

      // Validate all parts exist
      const partSkus = partCompatibilities.map(p => p.partSku);
      const parts = await this.prisma.sKU.findMany({
        where: { skuCode: { in: partSkus } }
      });

      const foundSkus = new Set(parts.map(p => p.skuCode));
      const missingSkus = partSkus.filter(sku => !foundSkus.has(sku));

      if (missingSkus.length > 0) {
        throw new ValidationError(`Parts not found: ${missingSkus.join(', ')}`);
      }

      // Create part compatibility records
      const compatibilityData = partCompatibilities.map(comp => {
        const part = parts.find(p => p.skuCode === comp.partSku)!;
        return {
          bikeModelId: bikeModel.id,
          partSkuId: part.id,
          compatibilityType: comp.compatibilityType,
          notes: comp.notes
        };
      });

      await this.prisma.partCompatibility.createMany({
        data: compatibilityData,
        skipDuplicates: true
      });

      // Clear compatibility cache
      await this.clearCompatibilityCache(bikeModelCode);

      // Create audit log
      await this.auditService.logAction(userId, 'LINK_COMPATIBLE_PARTS', 'PartCompatibility', bikeModel.id, {
        bikeModelCode,
        partCount: partCompatibilities.length,
        parts: partCompatibilities,
        result: 'SUCCESS'
      });

      this.logger.info('Parts linked to bike model', {
        bikeModelCode,
        partCount: partCompatibilities.length
      });
    } catch (error) {
      this.logger.error('Failed to link compatible parts', { bikeModelCode, partCompatibilities, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to link compatible parts', 'PARTS_LINKING_ERROR', 500);
    }
  }

  async getCompatibleParts(
    bikeModelCode: string,
    partCategory?: string,
    compatibilityType?: CompatibilityType
  ): Promise<CompatibilityMatrix> {
    try {
      const cacheKey = `compatibility:${bikeModelCode}:${partCategory || 'all'}:${compatibilityType || 'all'}`;

      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get bike model
      const bikeModel = await this.prisma.bikeModel.findUnique({
        where: { modelCode: bikeModelCode }
      });

      if (!bikeModel) {
        throw new NotFoundError('BikeModel', bikeModelCode);
      }

      // Get compatible parts
      const compatibilities = await this.prisma.partCompatibility.findMany({
        where: {
          bikeModelId: bikeModel.id,
          ...(compatibilityType && { compatibilityType })
        },
        include: {
          partSku: {
            include: {
              category: true
            }
          }
        }
      });

      const compatibleParts = compatibilities
        .filter(comp => !partCategory || comp.partSku.category?.name === partCategory)
        .filter(comp => comp.compatibilityType !== CompatibilityType.NOT_COMPATIBLE)
        .map(comp => ({
          partSku: comp.partSku.skuCode,
          partName: comp.partSku.name,
          category: comp.partSku.category?.name || 'Uncategorized',
          compatibilityType: comp.compatibilityType,
          fitmentNotes: comp.notes,
          installationDifficulty: this.getInstallationDifficulty(comp.partSku.category?.name)
        }));

      const incompatibleParts = compatibilities
        .filter(comp => comp.compatibilityType === CompatibilityType.NOT_COMPATIBLE)
        .map(comp => ({
          partSku: comp.partSku.skuCode,
          reason: comp.notes || 'Not compatible with this model'
        }));

      const matrix: CompatibilityMatrix = {
        bikeModel: bikeModelCode,
        compatibleParts,
        incompatibleParts
      };

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(matrix));

      return matrix;
    } catch (error) {
      this.logger.error('Failed to get compatible parts', { bikeModelCode, partCategory, compatibilityType, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to get compatible parts', 'COMPATIBILITY_RETRIEVAL_ERROR', 500);
    }
  }

  async validatePartCompatibility(bikeModelCode: string, partSku: string): Promise<{
    compatible: boolean;
    compatibilityType?: CompatibilityType;
    notes?: string;
    alternativeParts?: string[];
  }> {
    try {
      const [bikeModel, part] = await Promise.all([
        this.prisma.bikeModel.findUnique({ where: { modelCode: bikeModelCode } }),
        this.prisma.sKU.findUnique({ where: { skuCode: partSku } })
      ]);

      if (!bikeModel) {
        throw new NotFoundError('BikeModel', bikeModelCode);
      }
      if (!part) {
        throw new NotFoundError('Part', partSku);
      }

      const compatibility = await this.prisma.partCompatibility.findUnique({
        where: {
          bikeModelId_partSkuId: {
            bikeModelId: bikeModel.id,
            partSkuId: part.id
          }
        }
      });

      if (!compatibility) {
        // Check for alternative compatible parts in the same category
        const alternatives = await this.getAlternativeParts(bikeModel.id, part.categoryId);

        return {
          compatible: false,
          alternativeParts: alternatives
        };
      }

      return {
        compatible: compatibility.compatibilityType !== CompatibilityType.NOT_COMPATIBLE,
        compatibilityType: compatibility.compatibilityType,
        notes: compatibility.notes
      };
    } catch (error) {
      this.logger.error('Failed to validate part compatibility', { bikeModelCode, partSku, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to validate part compatibility', 'COMPATIBILITY_VALIDATION_ERROR', 500);
    }
  }

  async scheduleService(request: ServiceRequest, userId: string): Promise<ServiceAppointment> {
    try {
      // Validate bike model exists
      const bikeModel = await this.prisma.bikeModel.findUnique({
        where: { modelCode: request.bikeModel }
      });

      if (!bikeModel) {
        throw new NotFoundError('BikeModel', request.bikeModel);
      }

      // Validate and check availability of required parts
      const partsAvailability = await this.checkPartsAvailability(request.partsNeeded);
      const allRequiredPartsAvailable = request.partsNeeded
        .filter(p => p.required)
        .every(p => {
          const availability = partsAvailability.find(a => a.partSku === p.partSku);
          return availability && availability.available >= p.quantity;
        });

      // Estimate service duration based on service type and parts
      const estimatedDuration = this.estimateServiceDuration(request);

      const appointment: ServiceAppointment = {
        id: `SA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        serviceRequest: request,
        status: 'scheduled',
        estimatedDuration,
        partsAllocated: allRequiredPartsAvailable,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Reserve parts if available
      if (allRequiredPartsAvailable) {
        await this.reserveServiceParts(request.partsNeeded, userId);
      }

      // Store appointment (in a real system, this would be in the database)
      await this.redis.setex(
        `service_appointment:${appointment.id}`,
        86400 * 30, // 30 days
        JSON.stringify(appointment)
      );

      // Create audit log
      await this.auditService.logAction(userId, 'SCHEDULE_SERVICE', 'ServiceAppointment', appointment.id, {
        request,
        partsAllocated: allRequiredPartsAvailable,
        estimatedDuration,
        result: 'SUCCESS'
      });

      this.logger.info('Service appointment scheduled', {
        appointmentId: appointment.id,
        bikeModel: request.bikeModel,
        serviceType: request.serviceType,
        partsAllocated: allRequiredPartsAvailable
      });

      return appointment;
    } catch (error) {
      this.logger.error('Failed to schedule service', { request, error });
      if (error instanceof InventoryError) {
        throw error;
      }
      throw new InventoryError('Failed to schedule service', 'SERVICE_SCHEDULING_ERROR', 500);
    }
  }

  async trackWarranty(item: WarrantyItem): Promise<WarrantyStatus> {
    try {
      const cacheKey = `warranty:${item.serialNumber}`;

      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate warranty expiration
      const expirationDate = new Date(item.purchaseDate);
      expirationDate.setMonth(expirationDate.getMonth() + item.warrantyPeriod);

      const now = new Date();
      const isValid = now <= expirationDate;
      const remainingDays = Math.max(0, Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      // Get warranty claim history (mock data for this implementation)
      const claimHistory = await this.getWarrantyClaimHistory(item.serialNumber);

      const warrantyStatus: WarrantyStatus = {
        isValid,
        expirationDate,
        remainingDays,
        claimHistory
      };

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(warrantyStatus));

      this.logger.info('Warranty status checked', {
        serialNumber: item.serialNumber,
        skuCode: item.skuCode,
        isValid,
        remainingDays
      });

      return warrantyStatus;
    } catch (error) {
      this.logger.error('Failed to track warranty', { item, error });
      throw new InventoryError('Failed to track warranty', 'WARRANTY_TRACKING_ERROR', 500);
    }
  }

  async getBikeModelsByCategory(category: string): Promise<BikeModel[]> {
    try {
      const cacheKey = `bike_models:category:${category}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const models = await this.prisma.bikeModel.findMany({
        where: {
          category: category,
          active: true
        },
        orderBy: [
          { manufacturer: 'asc' },
          { modelYear: 'desc' },
          { name: 'asc' }
        ]
      });

      const bikeModels = models.map(model => ({
        id: model.id,
        modelCode: model.modelCode,
        name: model.name,
        manufacturer: model.manufacturer,
        modelYear: model.modelYear,
        category: model.category,
        specifications: model.specifications as any
      }));

      // Cache for 30 minutes
      await this.redis.setex(cacheKey, 1800, JSON.stringify(bikeModels));

      return bikeModels;
    } catch (error) {
      this.logger.error('Failed to get bike models by category', { category, error });
      throw new InventoryError('Failed to get bike models by category', 'BIKE_MODEL_RETRIEVAL_ERROR', 500);
    }
  }

  async getPopularUpgrades(bikeModelCode: string): Promise<Array<{
    partSku: string;
    partName: string;
    category: string;
    upgradeType: 'performance' | 'comfort' | 'aesthetic' | 'functionality';
    popularity: number; // 0-1 scale
    averageCost: number;
    installationDifficulty: string;
  }>> {
    try {
      const compatibleParts = await this.getCompatibleParts(bikeModelCode);

      // Mock popularity data based on part categories
      const upgradeCategories = [
        { category: 'Battery', upgradeType: 'performance', popularity: 0.8 },
        { category: 'Suspension', upgradeType: 'comfort', popularity: 0.7 },
        { category: 'Brakes', upgradeType: 'performance', popularity: 0.6 },
        { category: 'Lighting', upgradeType: 'functionality', popularity: 0.5 },
        { category: 'Saddle', upgradeType: 'comfort', popularity: 0.4 },
        { category: 'Grips', upgradeType: 'comfort', popularity: 0.3 }
      ];

      const popularUpgrades = compatibleParts.compatibleParts
        .filter(part => {
          const categoryMatch = upgradeCategories.find(cat =>
            part.category.toLowerCase().includes(cat.category.toLowerCase())
          );
          return categoryMatch && part.compatibilityType === CompatibilityType.RECOMMENDED;
        })
        .map(part => {
          const categoryMatch = upgradeCategories.find(cat =>
            part.category.toLowerCase().includes(cat.category.toLowerCase())
          );

          return {
            partSku: part.partSku,
            partName: part.partName,
            category: part.category,
            upgradeType: categoryMatch?.upgradeType || 'functionality',
            popularity: categoryMatch?.popularity || 0.2,
            averageCost: this.estimatePartCost(part.category),
            installationDifficulty: part.installationDifficulty
          };
        })
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 10);

      return popularUpgrades as any;
    } catch (error) {
      this.logger.error('Failed to get popular upgrades', { bikeModelCode, error });
      throw new InventoryError('Failed to get popular upgrades', 'UPGRADES_RETRIEVAL_ERROR', 500);
    }
  }

  // Private helper methods
  private async cacheBikeModel(model: any): Promise<void> {
    const cacheKey = `bike_model:${model.modelCode}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(model));
  }

  private async clearCompatibilityCache(bikeModelCode: string): Promise<void> {
    const keys = await this.redis.keys(`compatibility:${bikeModelCode}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private getInstallationDifficulty(category?: string): 'easy' | 'medium' | 'hard' | 'professional' {
    if (!category) return 'medium';

    const difficultyMap: Record<string, 'easy' | 'medium' | 'hard' | 'professional'> = {
      'accessories': 'easy',
      'grips': 'easy',
      'pedals': 'easy',
      'saddle': 'easy',
      'lights': 'easy',
      'brakes': 'medium',
      'chain': 'medium',
      'cassette': 'medium',
      'derailleur': 'hard',
      'suspension': 'hard',
      'motor': 'professional',
      'battery': 'medium',
      'controller': 'professional',
      'frame': 'professional'
    };

    const categoryLower = category.toLowerCase();
    const matchedKey = Object.keys(difficultyMap).find(key =>
      categoryLower.includes(key)
    );

    return matchedKey ? difficultyMap[matchedKey] : 'medium';
  }

  private async getAlternativeParts(bikeModelId: string, categoryId?: string): Promise<string[]> {
    if (!categoryId) return [];

    const alternatives = await this.prisma.partCompatibility.findMany({
      where: {
        bikeModelId,
        compatibilityType: { in: [CompatibilityType.COMPATIBLE, CompatibilityType.RECOMMENDED] },
        partSku: {
          categoryId
        }
      },
      include: {
        partSku: true
      },
      take: 5
    });

    return alternatives.map(alt => alt.partSku.skuCode);
  }

  private async checkPartsAvailability(partsNeeded: Array<{ partSku: string; quantity: number }>): Promise<Array<{
    partSku: string;
    available: number;
    reserved: number;
  }>> {
    const availability = [];

    for (const part of partsNeeded) {
      const stockLevel = await this.inventoryService.getStockLevel(part.partSku, '');

      availability.push({
        partSku: part.partSku,
        available: stockLevel?.available || 0,
        reserved: stockLevel?.reserved || 0
      });
    }

    return availability;
  }

  private estimateServiceDuration(request: ServiceRequest): number {
    const baseDurations = {
      maintenance: 60,
      repair: 120,
      upgrade: 90,
      recall: 45
    };

    let duration = baseDurations[request.serviceType] || 60;

    // Add time for each part
    duration += request.partsNeeded.length * 15; // 15 minutes per part

    // Adjust for priority
    if (request.priority === 'urgent') {
      duration = Math.ceil(duration * 1.2); // 20% more time for urgent jobs
    }

    return duration;
  }

  private async reserveServiceParts(partsNeeded: Array<{ partSku: string; quantity: number }>, userId: string): Promise<void> {
    for (const part of partsNeeded) {
      await this.inventoryService.reserveStock(
        part.partSku,
        '', // Default warehouse - in production, this would be configurable
        part.quantity,
        userId
      );
    }
  }

  private async getWarrantyClaimHistory(serialNumber: string): Promise<Array<{
    claimId: string;
    date: Date;
    type: string;
    status: string;
    amount?: number;
  }>> {
    // Mock warranty claim history
    // In a real implementation, this would query a warranty claims database
    return [
      {
        claimId: `WC-${serialNumber}-001`,
        date: new Date('2023-06-15'),
        type: 'Battery Replacement',
        status: 'Approved',
        amount: 299.99
      }
    ];
  }

  private estimatePartCost(category: string): number {
    const costMap: Record<string, number> = {
      'battery': 500,
      'motor': 800,
      'brakes': 150,
      'suspension': 300,
      'chain': 50,
      'cassette': 80,
      'saddle': 100,
      'grips': 30,
      'lights': 75,
      'accessories': 25
    };

    const categoryLower = category.toLowerCase();
    const matchedKey = Object.keys(costMap).find(key =>
      categoryLower.includes(key)
    );

    return matchedKey ? costMap[matchedKey] : 100;
  }
}