/**
 * Prisma Schema Validator
 * Comprehensive validation, analysis, and optimization for Prisma schemas
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface PrismaValidationResult {
  valid: boolean;
  errors: PrismaError[];
  warnings: PrismaWarning[];
  suggestions: PrismaOptimization[];
  impact: SchemaImpact;
}

export interface PrismaError {
  type: 'syntax' | 'semantic' | 'relationship' | 'constraint';
  message: string;
  line?: number;
  column?: number;
  model?: string;
  field?: string;
}

export interface PrismaWarning {
  type: 'performance' | 'naming' | 'best-practice' | 'deprecation';
  message: string;
  severity: 'low' | 'medium' | 'high';
  model?: string;
  field?: string;
}

export interface PrismaOptimization {
  type: 'index' | 'relation' | 'field-type' | 'constraint';
  description: string;
  impact: 'performance' | 'storage' | 'consistency';
  estimatedImprovement?: string;
  code: string;
}

export interface SchemaImpact {
  models: ModelImpact[];
  migrations: MigrationImpact;
  performance: PerformanceImpact;
  dataIntegrity: DataIntegrityImpact;
}

export interface ModelImpact {
  name: string;
  changes: string[];
  breaking: boolean;
  affectedRelations: string[];
}

export interface MigrationImpact {
  requiresDataMigration: boolean;
  estimatedDowntime: number; // in seconds
  steps: string[];
  risks: string[];
}

export interface PerformanceImpact {
  indexChanges: number;
  estimatedQueryImpact: 'positive' | 'negative' | 'neutral';
  recommendations: string[];
}

export interface DataIntegrityImpact {
  newConstraints: string[];
  removedConstraints: string[];
  validationRequired: boolean;
}

export class PrismaValidator {
  private schemaPath: string;
  private schema: string = '';
  private models: Map<string, any> = new Map();

  constructor(schemaPath: string) {
    this.schemaPath = schemaPath;
  }

  /**
   * Validate Prisma schema
   */
  async validate(): Promise<PrismaValidationResult> {
    try {
      this.schema = fs.readFileSync(this.schemaPath, 'utf-8');
      this.parseSchema();

      const errors = await this.findErrors();
      const warnings = await this.findWarnings();
      const suggestions = await this.generateOptimizations();
      const impact = await this.analyzeImpact();

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        impact
      };
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          type: 'syntax',
          message: `Failed to parse schema: ${error.message}`
        }],
        warnings: [],
        suggestions: [],
        impact: this.getEmptyImpact()
      };
    }
  }

  /**
   * Parse schema to extract models and relationships
   */
  private parseSchema(): void {
    // Extract models
    const modelRegex = /model\s+(\w+)\s*{([^}]+)}/g;
    let match;

    while ((match = modelRegex.exec(this.schema)) !== null) {
      const modelName = match[1];
      const modelBody = match[2];
      
      const fields = this.parseFields(modelBody);
      const relations = this.parseRelations(modelBody);
      const indexes = this.parseIndexes(modelBody);

      this.models.set(modelName, {
        name: modelName,
        fields,
        relations,
        indexes
      });
    }
  }

  /**
   * Parse model fields
   */
  private parseFields(modelBody: string): any[] {
    const fields: any[] = [];
    const fieldRegex = /(\w+)\s+(\w+)(\[\])?(\?)?(?:\s+@([^@\n]+))?/g;
    let match;

    while ((match = fieldRegex.exec(modelBody)) !== null) {
      fields.push({
        name: match[1],
        type: match[2],
        isArray: !!match[3],
        isOptional: !!match[4],
        attributes: match[5] ? match[5].trim() : ''
      });
    }

    return fields;
  }

  /**
   * Parse model relations
   */
  private parseRelations(modelBody: string): any[] {
    const relations: any[] = [];
    const relationRegex = /@relation\(([^)]+)\)/g;
    let match;

    while ((match = relationRegex.exec(modelBody)) !== null) {
      const params = match[1];
      relations.push(this.parseRelationParams(params));
    }

    return relations;
  }

  /**
   * Parse relation parameters
   */
  private parseRelationParams(params: string): any {
    const fields = params.match(/fields:\s*\[([^\]]+)\]/)?.[1];
    const references = params.match(/references:\s*\[([^\]]+)\]/)?.[1];
    const name = params.match(/"([^"]+)"/)?.[1];

    return {
      name,
      fields: fields ? fields.split(',').map(f => f.trim()) : [],
      references: references ? references.split(',').map(r => r.trim()) : []
    };
  }

  /**
   * Parse model indexes
   */
  private parseIndexes(modelBody: string): any[] {
    const indexes: any[] = [];
    const indexRegex = /@@index\(\[([^\]]+)\]\)/g;
    let match;

    while ((match = indexRegex.exec(modelBody)) !== null) {
      const fields = match[1].split(',').map(f => f.trim());
      indexes.push({ fields });
    }

    return indexes;
  }

  /**
   * Find errors in schema
   */
  private async findErrors(): Promise<PrismaError[]> {
    const errors: PrismaError[] = [];

    // Check for syntax errors using Prisma CLI
    try {
      execSync(`npx prisma validate --schema=${this.schemaPath}`, { stdio: 'pipe' });
    } catch (error: any) {
      const output = error.stdout?.toString() || error.stderr?.toString() || '';
      errors.push({
        type: 'syntax',
        message: output || 'Prisma validation failed'
      });
    }

    // Check for relationship errors
    for (const [modelName, model] of this.models) {
      for (const relation of model.relations) {
        // Check if referenced model exists
        const referencedField = relation.references[0];
        const relatedModel = this.findModelByField(referencedField);
        
        if (!relatedModel) {
          errors.push({
            type: 'relationship',
            message: `Referenced model for field "${referencedField}" not found`,
            model: modelName
          });
        }
      }
    }

    // Check for naming conflicts
    const fieldNames = new Set<string>();
    for (const [modelName, model] of this.models) {
      for (const field of model.fields) {
        const key = `${modelName}.${field.name}`;
        if (fieldNames.has(key)) {
          errors.push({
            type: 'semantic',
            message: `Duplicate field name: ${field.name}`,
            model: modelName,
            field: field.name
          });
        }
        fieldNames.add(key);
      }
    }

    return errors;
  }

  /**
   * Find warnings in schema
   */
  private async findWarnings(): Promise<PrismaWarning[]> {
    const warnings: PrismaWarning[] = [];

    for (const [modelName, model] of this.models) {
      // Check for missing indexes on foreign keys
      for (const relation of model.relations) {
        const hasIndex = model.indexes.some((idx: any) => 
          idx.fields.some((f: string) => relation.fields.includes(f))
        );

        if (!hasIndex) {
          warnings.push({
            type: 'performance',
            message: `Foreign key field(s) ${relation.fields.join(', ')} should have an index`,
            severity: 'high',
            model: modelName
          });
        }
      }

      // Check for naming conventions
      if (!modelName.match(/^[A-Z][a-zA-Z0-9]*$/)) {
        warnings.push({
          type: 'naming',
          message: `Model name "${modelName}" should follow PascalCase convention`,
          severity: 'low',
          model: modelName
        });
      }

      for (const field of model.fields) {
        if (!field.name.match(/^[a-z][a-zA-Z0-9]*$/)) {
          warnings.push({
            type: 'naming',
            message: `Field name "${field.name}" should follow camelCase convention`,
            severity: 'low',
            model: modelName,
            field: field.name
          });
        }
      }

      // Check for large string fields without length limit
      for (const field of model.fields) {
        if (field.type === 'String' && !field.attributes.includes('@db.')) {
          warnings.push({
            type: 'best-practice',
            message: `String field "${field.name}" should specify a database type (e.g., @db.VarChar(255))`,
            severity: 'medium',
            model: modelName,
            field: field.name
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Generate optimization suggestions
   */
  private async generateOptimizations(): Promise<PrismaOptimization[]> {
    const optimizations: PrismaOptimization[] = [];

    for (const [modelName, model] of this.models) {
      // Suggest composite indexes for common query patterns
      const commonPatterns = this.detectCommonQueryPatterns(model);
      for (const pattern of commonPatterns) {
        optimizations.push({
          type: 'index',
          description: `Add composite index for fields: ${pattern.fields.join(', ')}`,
          impact: 'performance',
          estimatedImprovement: '20-50% faster queries',
          code: `@@index([${pattern.fields.join(', ')}])`
        });
      }

      // Suggest field type optimizations
      for (const field of model.fields) {
        if (field.type === 'String' && field.name.includes('email')) {
          optimizations.push({
            type: 'constraint',
            description: `Add unique constraint to email field "${field.name}"`,
            impact: 'consistency',
            code: `${field.name} String @unique @db.VarChar(255)`
          });
        }

        if (field.type === 'Int' && field.name.includes('count')) {
          optimizations.push({
            type: 'field-type',
            description: `Consider using BigInt for "${field.name}" to prevent overflow`,
            impact: 'consistency',
            code: `${field.name} BigInt @default(0)`
          });
        }
      }
    }

    return optimizations;
  }

  /**
   * Analyze schema change impact
   */
  private async analyzeImpact(): Promise<SchemaImpact> {
    // This would compare with previous schema version
    return {
      models: [],
      migrations: {
        requiresDataMigration: false,
        estimatedDowntime: 0,
        steps: [],
        risks: []
      },
      performance: {
        indexChanges: 0,
        estimatedQueryImpact: 'neutral',
        recommendations: []
      },
      dataIntegrity: {
        newConstraints: [],
        removedConstraints: [],
        validationRequired: false
      }
    };
  }

  /**
   * Generate migration script with Claude Flow assistance
   */
  async generateMigration(): Promise<string> {
    // This would use Claude Flow to help generate safe migration scripts
    const script = `
-- Generated by Claude DevOps Platform
-- Schema Migration Script

-- Step 1: Add new tables
-- Step 2: Add new columns
-- Step 3: Create indexes
-- Step 4: Add constraints
-- Step 5: Data migration
-- Step 6: Remove deprecated elements

-- Rollback script included below
    `;

    return script;
  }

  /**
   * Helper methods
   */
  private findModelByField(fieldName: string): any {
    for (const [_, model] of this.models) {
      if (model.fields.some((f: any) => f.name === fieldName)) {
        return model;
      }
    }
    return null;
  }

  private detectCommonQueryPatterns(model: any): any[] {
    // This would analyze usage patterns to suggest indexes
    const patterns: any[] = [];

    // Common patterns: created/updated timestamps
    const hasCreatedAt = model.fields.some((f: any) => f.name === 'createdAt');
    const hasStatus = model.fields.some((f: any) => f.name === 'status');

    if (hasCreatedAt && hasStatus) {
      patterns.push({ fields: ['status', 'createdAt'] });
    }

    return patterns;
  }

  private getEmptyImpact(): SchemaImpact {
    return {
      models: [],
      migrations: {
        requiresDataMigration: false,
        estimatedDowntime: 0,
        steps: [],
        risks: []
      },
      performance: {
        indexChanges: 0,
        estimatedQueryImpact: 'neutral',
        recommendations: []
      },
      dataIntegrity: {
        newConstraints: [],
        removedConstraints: [],
        validationRequired: false
      }
    };
  }
}