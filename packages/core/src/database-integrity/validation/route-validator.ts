/**
 * Route Validator
 * Validates API routes against database schema
 */

import { readFileSync } from 'fs';
import path from 'path';

import { IntegrityLogCategory, IntegrityLogLevel, IntegrityMetricType } from '@warehouse-network/db';
import { glob } from 'glob';
import winston from 'winston';

import { memoryBank } from '../memory-bank/memory-bank';
import {
  DatabaseSchema,
  ApiRoute,
  RouteValidationConfig,
  IntegrityResult,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  DatabaseOperation
} from '../types';

export class RouteValidator {
  private schema: DatabaseSchema;
  private config: RouteValidationConfig;
  private logger: winston.Logger;

  constructor(schema: DatabaseSchema, config: RouteValidationConfig) {
    this.schema = schema;
    this.config = config;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async validate(): Promise<IntegrityResult<ApiRoute[]>> {
    const correlationId = memoryBank.setCorrelationId();
    const startTime = Date.now();
    
    try {
      this.logger.info('Validating API routes');
      
      await memoryBank.log({
        category: IntegrityLogCategory.ROUTE_VALIDATION,
        level: IntegrityLogLevel.INFO,
        operation: 'validate',
        component: 'RouteValidator',
        message: 'Starting route validation',
        metadata: { 
          apiDir: this.config.apiDir,
          patterns: this.config.patterns
        },
        success: true,
        correlationId
      });
      
      const routes = await this.scanRoutes();
      const validatedRoutes: ApiRoute[] = [];

      for (const route of routes) {
        const validation = await this.validateRoute(route);
        route.validation = validation;
        validatedRoutes.push(route);
      }

      const invalidRoutes = validatedRoutes.filter(r => !r.validation?.valid);
      
      this.logger.info(`Validated ${validatedRoutes.length} routes, ${invalidRoutes.length} have issues`);
      
      // Log validation results
      await memoryBank.log({
        category: IntegrityLogCategory.ROUTE_VALIDATION,
        level: invalidRoutes.length > 0 ? IntegrityLogLevel.WARNING : IntegrityLogLevel.INFO,
        operation: 'validate',
        component: 'RouteValidator',
        message: `Validated ${validatedRoutes.length} routes, ${invalidRoutes.length} have validation issues`,
        details: {
          totalRoutes: validatedRoutes.length,
          invalidRoutes: invalidRoutes.length,
          validRoutes: validatedRoutes.length - invalidRoutes.length,
          routesByMethod: validatedRoutes.reduce((acc, r) => {
            acc[r.method] = (acc[r.method] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        },
        duration: Date.now() - startTime,
        success: true,
        correlationId
      });
      
      // Record metric
      await memoryBank.recordMetric({
        metricType: IntegrityMetricType.VALIDATION_TIME,
        component: 'RouteValidator',
        name: 'route_validation_duration',
        value: Date.now() - startTime,
        unit: 'ms'
      });
      
      // Log individual route issues
      for (const invalidRoute of invalidRoutes) {
        if (invalidRoute.validation) {
          await memoryBank.log({
            category: IntegrityLogCategory.ROUTE_VALIDATION,
            level: IntegrityLogLevel.WARNING,
            operation: 'validateRoute',
            component: 'RouteValidator',
            message: `Route validation failed: ${invalidRoute.method} ${invalidRoute.path}`,
            details: {
              route: invalidRoute.path,
              method: invalidRoute.method,
              errors: invalidRoute.validation.errors,
              warnings: invalidRoute.validation.warnings
            },
            success: false,
            correlationId
          });
        }
      }
      
      return {
        success: true,
        data: validatedRoutes,
        warnings: invalidRoutes.length > 0 
          ? [`${invalidRoutes.length} routes have validation issues`]
          : undefined
      };
    } catch (error) {
      this.logger.error('Failed to validate routes', error);
      
      await memoryBank.log({
        category: IntegrityLogCategory.ROUTE_VALIDATION,
        level: IntegrityLogLevel.ERROR,
        operation: 'validate',
        component: 'RouteValidator',
        message: 'Failed to validate routes',
        duration: Date.now() - startTime,
        success: false,
        error: error as Error,
        correlationId
      });
      
      return {
        success: false,
        error: {
          code: 'ROUTE_VALIDATION_FAILED',
          message: 'Failed to validate API routes',
          details: error
        }
      };
    }
  }

  private async scanRoutes(): Promise<ApiRoute[]> {
    const routes: ApiRoute[] = [];
    
    for (const pattern of this.config.patterns) {
      const files = await glob(path.join(this.config.apiDir, pattern));
      
      for (const file of files) {
        const fileRoutes = await this.extractRoutesFromFile(file);
        routes.push(...fileRoutes);
      }
    }
    
    return routes;
  }

  private async extractRoutesFromFile(filePath: string): Promise<ApiRoute[]> {
    const routes: ApiRoute[] = [];
    const content = readFileSync(filePath, 'utf8');
    
    // Extract relative path for route
    const relativePath = path.relative(this.config.apiDir, filePath);
    const routePath = '/' + relativePath
      .replace(/\.(ts|js|tsx|jsx)$/, '')
      .replace(/index$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1'); // Convert [id] to :id

    // Extract HTTP methods
    const methods = this.extractHttpMethods(content);
    
    for (const method of methods) {
      const route: ApiRoute = {
        path: routePath,
        method,
        handler: filePath,
        operations: this.extractDatabaseOperations(content, method)
      };
      
      // Extract parameters
      route.parameters = this.extractParameters(content, routePath);
      
      // Extract body schema
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        route.body = this.extractBodySchema(content);
      }
      
      routes.push(route);
    }
    
    return routes;
  }

  private extractHttpMethods(content: string): Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'> {
    const methods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'> = [];
    
    // Next.js API routes
    if (content.includes('export default')) {
      // Check for method checks
      const methodChecks = [
        { pattern: /req\.method\s*===?\s*['"]GET['"]/, method: 'GET' as const },
        { pattern: /req\.method\s*===?\s*['"]POST['"]/, method: 'POST' as const },
        { pattern: /req\.method\s*===?\s*['"]PUT['"]/, method: 'PUT' as const },
        { pattern: /req\.method\s*===?\s*['"]PATCH['"]/, method: 'PATCH' as const },
        { pattern: /req\.method\s*===?\s*['"]DELETE['"]/, method: 'DELETE' as const }
      ];
      
      for (const check of methodChecks) {
        if (check.pattern.test(content)) {
          methods.push(check.method);
        }
      }
      
      // If no specific methods found, assume all
      if (methods.length === 0) {
        methods.push('GET', 'POST', 'PUT', 'DELETE');
      }
    }
    
    // Express-style routes
    const expressPatterns = [
      { pattern: /router\.(get|post|put|patch|delete)\(/gi, method: null },
      { pattern: /app\.(get|post|put|patch|delete)\(/gi, method: null }
    ];
    
    for (const pattern of expressPatterns) {
      let match;
      while ((match = pattern.pattern.exec(content)) !== null) {
        const method = match[1].toUpperCase() as any;
        if (!methods.includes(method)) {
          methods.push(method);
        }
      }
    }
    
    return methods.length > 0 ? methods : ['GET'];
  }

  private extractDatabaseOperations(content: string, method: string): DatabaseOperation[] {
    const operations: DatabaseOperation[] = [];
    
    // Prisma operations
    const prismaPatterns = [
      { pattern: /prisma\.(\w+)\.(findMany|findFirst|findUnique)/g, type: 'select' },
      { pattern: /prisma\.(\w+)\.create/g, type: 'insert' },
      { pattern: /prisma\.(\w+)\.(update|updateMany)/g, type: 'update' },
      { pattern: /prisma\.(\w+)\.(delete|deleteMany)/g, type: 'delete' },
      { pattern: /prisma\.(\w+)\.upsert/g, type: 'upsert' }
    ];
    
    for (const { pattern, type } of prismaPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        operations.push({
          type: type as any,
          table: match[1].toLowerCase()
        });
      }
    }
    
    // Extract query fields
    const includePattern = /include:\s*{([^}]+)}/g;
    let includeMatch;
    while ((includeMatch = includePattern.exec(content)) !== null) {
      const includes = includeMatch[1].match(/(\w+):/g);
      if (includes) {
        for (const include of includes) {
          const relation = include.replace(':', '').trim();
          operations.push({
            type: 'select',
            table: relation.toLowerCase(),
            joins: [relation]
          });
        }
      }
    }
    
    return operations;
  }

  private extractParameters(content: string, routePath: string): any[] {
    const parameters: any[] = [];
    
    // Extract path parameters from route
    const pathParams = routePath.match(/:(\w+)/g);
    if (pathParams) {
      for (const param of pathParams) {
        parameters.push({
          name: param.substring(1),
          in: 'path',
          type: 'string',
          required: true
        });
      }
    }
    
    // Extract query parameters
    const queryPattern = /req\.query\.(\w+)/g;
    let match;
    while ((match = queryPattern.exec(content)) !== null) {
      const paramName = match[1];
      if (!parameters.find(p => p.name === paramName)) {
        parameters.push({
          name: paramName,
          in: 'query',
          type: 'string',
          required: false
        });
      }
    }
    
    return parameters;
  }

  private extractBodySchema(content: string): any {
    // Simple extraction - in production, use proper AST parsing
    const schemaPattern = /const\s+schema\s*=\s*z\.object\(({[^}]+})\)/;
    const match = content.match(schemaPattern);
    
    if (match) {
      return {
        type: 'object',
        schema: match[1]
      };
    }
    
    return {
      type: 'object'
    };
  }

  private async validateRoute(route: ApiRoute): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: any[] = [];
    
    // Validate database operations
    for (const operation of route.operations || []) {
      const table = this.schema.tables.find(t => t.name === operation.table);
      
      if (!table) {
        errors.push({
          type: 'invalid_table',
          table: operation.table,
          message: `Table '${operation.table}' not found in database schema`,
          severity: 'error',
          code: 'TABLE_NOT_FOUND'
        });
      } else {
        // Validate columns if specified
        if (operation.columns) {
          for (const column of operation.columns) {
            if (!table.columns.find(c => c.name === column)) {
              warnings.push({
                type: 'invalid_column',
                table: operation.table,
                field: column,
                message: `Column '${column}' not found in table '${operation.table}'`,
                code: 'COLUMN_NOT_FOUND'
              });
            }
          }
        }
      }
    }
    
    // Validate query parameters
    if (this.config.validateFilters && route.parameters) {
      for (const param of route.parameters.filter(p => p.in === 'query')) {
        this.validateQueryParameter(param, route, warnings, suggestions);
      }
    }
    
    // Validate pagination
    if (this.config.validatePagination && route.method === 'GET') {
      this.validatePagination(route, warnings, suggestions);
    }
    
    // Apply custom rules
    if (this.config.customRules) {
      for (const rule of this.config.customRules) {
        const result = rule.apply(route, this.schema);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
        suggestions.push(...result.suggestions);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  private validateQueryParameter(
    param: any,
    route: ApiRoute,
    warnings: ValidationWarning[],
    suggestions: any[]
  ): void {
    // Common filter parameters
    const commonFilters = ['limit', 'offset', 'page', 'pageSize', 'sort', 'order'];
    
    if (!commonFilters.includes(param.name)) {
      // Check if it's a valid column for filtering
      const tables = route.operations?.map(op => op.table) || [];
      let found = false;
      
      for (const tableName of tables) {
        const table = this.schema.tables.find(t => t.name === tableName);
        if (table && table.columns.find(c => c.name === param.name)) {
          found = true;
          break;
        }
      }
      
      if (!found && tables.length > 0) {
        warnings.push({
          type: 'invalid_filter',
          field: param.name,
          message: `Query parameter '${param.name}' does not match any column in accessed tables`,
          code: 'INVALID_FILTER_PARAM',
          suggestion: 'Consider removing unused query parameters'
        });
      }
    }
  }

  private validatePagination(
    route: ApiRoute,
    warnings: ValidationWarning[],
    suggestions: any[]
  ): void {
    const params = route.parameters?.map(p => p.name) || [];
    const hasLimit = params.includes('limit') || params.includes('pageSize');
    const hasOffset = params.includes('offset') || params.includes('page');
    
    if (route.operations?.some(op => op.type === 'select')) {
      if (!hasLimit) {
        warnings.push({
          type: 'missing_pagination',
          message: 'GET endpoint with SELECT operation should implement pagination',
          code: 'MISSING_PAGINATION',
          suggestion: 'Add limit/offset or page/pageSize parameters'
        });
      }
    }
  }
}