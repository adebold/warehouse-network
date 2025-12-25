/**
 * Warehouse Route Validator
 * Validates warehouse-specific API routes
 */

import {
  DatabaseSchema,
  IntegrityResult,
  ApiRouteValidation,
  ParamValidation
} from '../types';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import path from 'path';
import winston from 'winston';

export class WarehouseRouteValidator {
  private schema: DatabaseSchema;
  private logger: winston.Logger;
  
  // Warehouse-specific models and their expected routes
  private warehouseModels = {
    customer: ['create', 'read', 'update', 'list', 'lock', 'unlock'],
    deposit: ['create', 'read', 'list', 'refund'],
    quote: ['create', 'read', 'update', 'accept', 'reject'],
    skid: ['create', 'read', 'update', 'list', 'transfer', 'release'],
    receivingOrder: ['create', 'read', 'update', 'list', 'complete'],
    releaseRequest: ['create', 'read', 'approve', 'reject', 'list'],
    warehouse: ['create', 'read', 'update', 'list', 'activate', 'deactivate'],
    operator: ['create', 'read', 'update', 'list', 'approve', 'suspend'],
    payout: ['create', 'process', 'list', 'cancel']
  };

  constructor(schema: DatabaseSchema) {
    this.schema = schema;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async validateWarehouseRoutes(): Promise<IntegrityResult<ApiRouteValidation[]>> {
    try {
      this.logger.info('Validating warehouse-specific routes');
      
      const validations: ApiRouteValidation[] = [];
      
      // Scan API routes
      const apiRoutes = await this.scanApiRoutes();
      
      // Validate each route
      for (const route of apiRoutes) {
        const validation = this.validateRoute(route);
        if (validation) {
          validations.push(validation);
        }
      }
      
      // Check for missing required routes
      const missingRoutes = this.checkMissingRoutes(apiRoutes);
      validations.push(...missingRoutes);
      
      this.logger.info(`Validated ${validations.length} warehouse routes`);
      return { success: true, data: validations };
    } catch (error) {
      this.logger.error('Failed to validate warehouse routes', error);
      return {
        success: false,
        error: {
          code: 'WAREHOUSE_ROUTE_VALIDATION_FAILED',
          message: 'Failed to validate warehouse routes',
          details: error
        }
      };
    }
  }

  private async scanApiRoutes(): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];
    
    // Scan Next.js API routes
    const apiDir = path.join(process.cwd(), 'apps/web/pages/api');
    const patterns = ['**/*.ts', '**/*.js'];
    
    for (const pattern of patterns) {
      const files = await glob(path.join(apiDir, pattern));
      
      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        const relativePath = path.relative(apiDir, file);
        const routePath = '/api/' + relativePath
          .replace(/\.(ts|js)$/, '')
          .replace(/\[([^\]]+)\]/g, ':$1')
          .replace(/index$/, '');
        
        const methods = this.extractMethods(content);
        
        routes.push({
          path: routePath,
          file,
          content,
          methods
        });
      }
    }
    
    return routes;
  }

  private extractMethods(content: string): string[] {
    const methods: string[] = [];
    
    // Check for method handlers
    const patterns = [
      /req\.method\s*===?\s*['"](\w+)['"]/g,
      /case\s+['"](\w+)['"]/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        if (!methods.includes(method)) {
          methods.push(method);
        }
      }
    }
    
    return methods.length > 0 ? methods : ['GET', 'POST'];
  }

  private validateRoute(route: RouteInfo): ApiRouteValidation | null {
    // Determine which model this route is for
    const model = this.detectModel(route.path);
    if (!model) return null;
    
    // Extract query and body parameters
    const queryParams = this.extractQueryParams(route.content);
    const bodyParams = this.extractBodyParams(route.content);
    
    // Validate parameters against schema
    const queryValidations = this.validateParams(queryParams, model, 'query');
    const bodyValidations = this.validateParams(bodyParams, model, 'body');
    
    const allValidations = [...queryValidations, ...bodyValidations];
    const isValid = allValidations.every(v => v.validInModel);
    
    return {
      route: route.path,
      method: route.methods.join(', '),
      model,
      queryParams: queryValidations,
      bodyParams: bodyValidations,
      valid: isValid
    };
  }

  private detectModel(routePath: string): string | null {
    for (const model of Object.keys(this.warehouseModels)) {
      if (routePath.toLowerCase().includes(model.toLowerCase())) {
        return model;
      }
    }
    
    // Check plural forms
    const pluralMap: Record<string, string> = {
      customers: 'customer',
      deposits: 'deposit',
      quotes: 'quote',
      skids: 'skid',
      'receiving-orders': 'receivingOrder',
      'release-requests': 'releaseRequest',
      warehouses: 'warehouse',
      operators: 'operator',
      payouts: 'payout'
    };
    
    for (const [plural, model] of Object.entries(pluralMap)) {
      if (routePath.toLowerCase().includes(plural)) {
        return model;
      }
    }
    
    return null;
  }

  private extractQueryParams(content: string): string[] {
    const params: Set<string> = new Set();
    
    // Patterns to extract query parameters
    const patterns = [
      /req\.query\.(\w+)/g,
      /query\.(\w+)/g,
      /searchParams\.get\(['"](\w+)['"]\)/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        params.add(match[1]);
      }
    }
    
    return Array.from(params);
  }

  private extractBodyParams(content: string): string[] {
    const params: Set<string> = new Set();
    
    // Patterns to extract body parameters
    const patterns = [
      /req\.body\.(\w+)/g,
      /body\.(\w+)/g,
      /const\s+{\s*([^}]+)\s*}\s*=\s*req\.body/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (pattern === patterns[2]) {
          // Extract destructured params
          const destructured = match[1].split(',').map(p => p.trim());
          destructured.forEach(p => {
            const paramName = p.split(':')[0].trim();
            params.add(paramName);
          });
        } else {
          params.add(match[1]);
        }
      }
    }
    
    return Array.from(params);
  }

  private validateParams(params: string[], modelName: string, type: 'query' | 'body'): ParamValidation[] {
    const validations: ParamValidation[] = [];
    
    // Find the corresponding Prisma model
    const prismaModel = this.schema.prismaModels?.find(m => 
      m.name.toLowerCase() === modelName.toLowerCase()
    );
    
    if (!prismaModel) {
      // If no Prisma model found, check database tables
      const table = this.schema.tables.find(t => 
        t.name.toLowerCase() === modelName.toLowerCase()
      );
      
      if (table) {
        for (const param of params) {
          const column = table.columns.find(c => c.name === param);
          validations.push({
            param,
            type: column?.type || 'unknown',
            required: column ? !column.nullable : false,
            validInModel: !!column,
            suggestion: column ? undefined : this.getSuggestion(param, table.columns.map(c => c.name))
          });
        }
      }
    } else {
      // Validate against Prisma model
      for (const param of params) {
        const field = prismaModel.fields.find(f => f.name === param);
        
        validations.push({
          param,
          type: field?.type || 'unknown',
          required: field ? field.isRequired : false,
          validInModel: !!field,
          suggestion: field ? undefined : this.getSuggestion(param, prismaModel.fields.map(f => f.name))
        });
      }
    }
    
    return validations;
  }

  private getSuggestion(param: string, validFields: string[]): string | undefined {
    // Simple similarity check
    const similar = validFields.find(f => 
      f.toLowerCase().includes(param.toLowerCase()) ||
      param.toLowerCase().includes(f.toLowerCase())
    );
    
    if (similar) {
      return `Did you mean '${similar}'?`;
    }
    
    // Check for common naming variations
    const variations: Record<string, string[]> = {
      'customer_id': ['customerId', 'customer'],
      'warehouse_id': ['warehouseId', 'warehouse'],
      'operator_id': ['operatorId', 'operator'],
      'created_at': ['createdAt', 'created'],
      'updated_at': ['updatedAt', 'updated']
    };
    
    for (const [key, values] of Object.entries(variations)) {
      if (param === key || values.includes(param)) {
        const valid = validFields.find(f => f === key || values.includes(f));
        if (valid) {
          return `Use '${valid}' instead`;
        }
      }
    }
    
    return undefined;
  }

  private checkMissingRoutes(existingRoutes: RouteInfo[]): ApiRouteValidation[] {
    const missingRoutes: ApiRouteValidation[] = [];
    
    for (const [model, expectedOperations] of Object.entries(this.warehouseModels)) {
      for (const operation of expectedOperations) {
        const routePattern = this.getRoutePattern(model, operation);
        const exists = existingRoutes.some(r => this.matchesRoute(r.path, routePattern));
        
        if (!exists) {
          missingRoutes.push({
            route: routePattern,
            method: this.getMethodForOperation(operation),
            model,
            queryParams: [],
            bodyParams: [],
            valid: false
          });
        }
      }
    }
    
    return missingRoutes;
  }

  private getRoutePattern(model: string, operation: string): string {
    const baseRoute = `/api/${this.pluralize(model)}`;
    
    switch (operation) {
      case 'create':
        return baseRoute;
      case 'read':
        return `${baseRoute}/:id`;
      case 'update':
        return `${baseRoute}/:id`;
      case 'list':
        return baseRoute;
      case 'delete':
        return `${baseRoute}/:id`;
      default:
        return `${baseRoute}/:id/${operation}`;
    }
  }

  private getMethodForOperation(operation: string): string {
    const methodMap: Record<string, string> = {
      'create': 'POST',
      'read': 'GET',
      'update': 'PUT',
      'list': 'GET',
      'delete': 'DELETE',
      'approve': 'POST',
      'reject': 'POST',
      'complete': 'POST',
      'cancel': 'POST',
      'process': 'POST',
      'lock': 'POST',
      'unlock': 'POST',
      'activate': 'POST',
      'deactivate': 'POST',
      'suspend': 'POST',
      'transfer': 'POST',
      'release': 'POST',
      'refund': 'POST',
      'accept': 'POST'
    };
    
    return methodMap[operation] || 'POST';
  }

  private pluralize(model: string): string {
    const irregulars: Record<string, string> = {
      'receivingOrder': 'receiving-orders',
      'releaseRequest': 'release-requests'
    };
    
    return irregulars[model] || `${model}s`;
  }

  private matchesRoute(actual: string, pattern: string): boolean {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/:\w+/g, '[^/]+')
      .replace(/\//g, '\\/');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(actual);
  }
}

interface RouteInfo {
  path: string;
  file: string;
  content: string;
  methods: string[];
}