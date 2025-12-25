/**
 * Prisma Schema Analyzer
 * Analyzes Prisma schema files and extracts model information
 */

import { PrismaConfig, DatabaseSchema, PrismaModel, PrismaField, PrismaIndex, IntegrityResult, IntegrityError } from '../types';
import { readFileSync } from 'fs';
import path from 'path';
import winston from 'winston';

export class PrismaSchemaAnalyzer {
  private config: PrismaConfig;
  private logger: winston.Logger;

  constructor(config: PrismaConfig) {
    this.config = config;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async analyzePrismaSchema(): Promise<IntegrityResult<DatabaseSchema>> {
    try {
      this.logger.info('Analyzing Prisma schema');

      // Read Prisma schema file
      const schemaPath = path.resolve(this.config.schemaPath);
      const schemaContent = readFileSync(schemaPath, 'utf8');

      // Parse the schema
      const models = this.parseSchema(schemaContent);

      // Create database schema representation
      const schema: DatabaseSchema = {
        version: this.extractSchemaVersion(schemaContent),
        timestamp: new Date(),
        tables: [], // Will be populated by regular schema analyzer
        prismaModels: models,
        enums: this.extractEnums(schemaContent)
      };

      this.logger.info(`Analyzed ${models.length} Prisma models`);
      return { success: true, data: schema };
    } catch (error) {
      this.logger.error('Failed to analyze Prisma schema', error);
      const integrityError: IntegrityError = {
        code: 'PRISMA_ANALYSIS_FAILED',
        message: 'Failed to analyze Prisma schema',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  private parseSchema(content: string): PrismaModel[] {
    const models: PrismaModel[] = [];
    
    // Regular expression to match Prisma models
    const modelRegex = /model\s+(\w+)\s*{([^}]*)}/gs;
    let match;

    while ((match = modelRegex.exec(content)) !== null) {
      const modelName = match[1];
      const modelContent = match[2];
      
      const model: PrismaModel = {
        name: modelName,
        dbName: this.extractDbName(modelContent),
        fields: this.parseFields(modelContent),
        uniqueIndexes: [],
        indexes: []
      };

      // Parse indexes and constraints
      const indexes = this.parseIndexes(modelContent, modelName);
      model.uniqueIndexes = indexes.filter(idx => idx.type === 'unique');
      model.indexes = indexes.filter(idx => idx.type === 'normal');
      
      // Find primary key
      model.primaryKey = indexes.find(idx => idx.type === 'id');

      models.push(model);
    }

    return models;
  }

  private parseFields(modelContent: string): PrismaField[] {
    const fields: PrismaField[] = [];
    const lines = modelContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('@@'));

    for (const line of lines) {
      if (!line || line.startsWith('//')) continue;

      const field = this.parseFieldLine(line);
      if (field) {
        fields.push(field);
      }
    }

    return fields;
  }

  private parseFieldLine(line: string): PrismaField | null {
    // Parse field definition: name Type modifiers
    const fieldMatch = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
    
    if (!fieldMatch) return null;

    const [, fieldName, fieldType, isList, isOptional, modifiers] = fieldMatch;
    
    const field: PrismaField = {
      name: fieldName,
      type: fieldType,
      isList: !!isList,
      isRequired: !isOptional && !modifiers.includes('@default'),
      isUnique: modifiers.includes('@unique'),
      isId: modifiers.includes('@id'),
      isReadOnly: false, // TODO: Detect from relations
      hasDefaultValue: modifiers.includes('@default'),
      documentation: this.extractDocumentation(modifiers)
    };

    // Parse default value
    if (field.hasDefaultValue) {
      const defaultMatch = modifiers.match(/@default\(([^)]+)\)/);
      if (defaultMatch) {
        field.default = this.parseDefaultValue(defaultMatch[1]);
      }
    }

    // Parse relation
    const relationMatch = modifiers.match(/@relation\(([^)]+)\)/);
    if (relationMatch) {
      const relationParams = this.parseRelationParams(relationMatch[1]);
      field.relationName = relationParams.name;
      field.relationFromFields = relationParams.fields;
      field.relationToFields = relationParams.references;
    }

    return field;
  }

  private parseIndexes(modelContent: string, modelName: string): PrismaIndex[] {
    const indexes: PrismaIndex[] = [];
    const lines = modelContent.split('\n').map(line => line.trim());

    // Check for @id fields
    const idFields = lines
      .filter(line => line.includes('@id'))
      .map(line => {
        const match = line.match(/^(\w+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];

    if (idFields.length > 0) {
      indexes.push({
        fields: idFields,
        type: 'id'
      });
    }

    // Parse composite keys and indexes
    for (const line of lines) {
      if (line.startsWith('@@id')) {
        const fields = this.extractFieldsFromDirective(line);
        if (fields.length > 0) {
          indexes.push({
            fields,
            type: 'id'
          });
        }
      } else if (line.startsWith('@@unique')) {
        const fields = this.extractFieldsFromDirective(line);
        if (fields.length > 0) {
          indexes.push({
            fields,
            type: 'unique'
          });
        }
      } else if (line.startsWith('@@index')) {
        const fields = this.extractFieldsFromDirective(line);
        if (fields.length > 0) {
          indexes.push({
            fields,
            type: 'normal'
          });
        }
      }
    }

    return indexes;
  }

  private extractFieldsFromDirective(line: string): string[] {
    const match = line.match(/\[([^\]]+)\]/);
    if (!match) return [];
    
    return match[1]
      .split(',')
      .map(field => field.trim())
      .filter(Boolean);
  }

  private extractDbName(modelContent: string): string | undefined {
    const match = modelContent.match(/@@map\("([^"]+)"\)/);
    return match ? match[1] : undefined;
  }

  private extractDocumentation(modifiers: string): string | undefined {
    const match = modifiers.match(/\/\/\/\s*(.+)$/);
    return match ? match[1].trim() : undefined;
  }

  private parseDefaultValue(defaultStr: string): any {
    defaultStr = defaultStr.trim();
    
    // Handle common Prisma defaults
    if (defaultStr === 'now()') return 'CURRENT_TIMESTAMP';
    if (defaultStr === 'cuid()') return 'cuid';
    if (defaultStr === 'uuid()') return 'uuid';
    if (defaultStr === 'autoincrement()') return 'autoincrement';
    if (defaultStr === 'true' || defaultStr === 'false') return defaultStr === 'true';
    if (/^\d+$/.test(defaultStr)) return parseInt(defaultStr);
    if (/^\d+\.\d+$/.test(defaultStr)) return parseFloat(defaultStr);
    if (defaultStr.startsWith('"') && defaultStr.endsWith('"')) {
      return defaultStr.slice(1, -1);
    }
    
    return defaultStr;
  }

  private parseRelationParams(params: string): any {
    const result: any = {};
    
    // Parse relation name
    const nameMatch = params.match(/"([^"]+)"/);
    if (nameMatch) {
      result.name = nameMatch[1];
    }
    
    // Parse fields
    const fieldsMatch = params.match(/fields:\s*\[([^\]]+)\]/);
    if (fieldsMatch) {
      result.fields = fieldsMatch[1]
        .split(',')
        .map(f => f.trim())
        .filter(Boolean);
    }
    
    // Parse references
    const referencesMatch = params.match(/references:\s*\[([^\]]+)\]/);
    if (referencesMatch) {
      result.references = referencesMatch[1]
        .split(',')
        .map(f => f.trim())
        .filter(Boolean);
    }
    
    return result;
  }

  private extractEnums(content: string): any[] {
    const enums: any[] = [];
    const enumRegex = /enum\s+(\w+)\s*{([^}]*)}/gs;
    let match;

    while ((match = enumRegex.exec(content)) !== null) {
      const enumName = match[1];
      const enumContent = match[2];
      
      const values = enumContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//'))
        .map(line => line.replace(/\s*\/\/.*$/, '').trim())
        .filter(Boolean);

      enums.push({
        name: enumName,
        values
      });
    }

    return enums;
  }

  private extractSchemaVersion(content: string): string {
    // Try to extract version from generator client
    const versionMatch = content.match(/generator\s+client\s*{[^}]*previewFeatures\s*=\s*\[([^\]]*)\]/s);
    if (versionMatch) {
      return `prisma-${versionMatch[1].replace(/["\s]/g, '')}`;
    }
    
    // Default version
    return 'prisma-latest';
  }

  async compareWithDatabase(dbSchema: DatabaseSchema): Promise<IntegrityResult<any>> {
    try {
      const differences: any[] = [];
      
      if (!dbSchema.prismaModels) {
        return { success: true, data: { differences: [] } };
      }

      // Compare models
      for (const prismaModel of dbSchema.prismaModels) {
        const dbTable = dbSchema.tables.find(
          t => t.name === (prismaModel.dbName || prismaModel.name.toLowerCase())
        );

        if (!dbTable) {
          differences.push({
            type: 'missing_table',
            model: prismaModel.name,
            message: `Table for model ${prismaModel.name} not found in database`
          });
          continue;
        }

        // Compare fields
        for (const field of prismaModel.fields) {
          const dbColumn = dbTable.columns.find(c => c.name === field.name);
          
          if (!dbColumn) {
            differences.push({
              type: 'missing_column',
              model: prismaModel.name,
              field: field.name,
              message: `Column ${field.name} not found in table ${dbTable.name}`
            });
          }
        }

        // Check for extra columns in database
        for (const column of dbTable.columns) {
          const prismaField = prismaModel.fields.find(f => f.name === column.name);
          
          if (!prismaField) {
            differences.push({
              type: 'extra_column',
              table: dbTable.name,
              column: column.name,
              message: `Column ${column.name} in table ${dbTable.name} not defined in Prisma schema`
            });
          }
        }
      }

      return {
        success: true,
        data: { differences }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'COMPARISON_FAILED',
          message: 'Failed to compare Prisma schema with database',
          details: error
        }
      };
    }
  }
}