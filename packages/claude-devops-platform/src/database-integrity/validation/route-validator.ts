/**
 * Route Validator
 * Validates API routes against database schema and generates route stubs
 */

import {
  ApiRoute,
  DatabaseSchema,
  Table,
  HttpMethod,
  DatabaseOperation,
  IntegrityResult,
  IntegrityError,
  IntegrityEventType,
  ValidationConfig,
  RouteParameter,
  RequestBody
} from '../types';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import glob from 'globby';
import { parse as parseAST } from '@babel/parser';
import traverse from '@babel/traverse';
import { z } from 'zod';
import { format } from 'prettier';

export class RouteValidator extends EventEmitter {
  private schema: DatabaseSchema;
  private config: ValidationConfig['routes'];
  private routes: Map<string, ApiRoute> = new Map();

  constructor(schema: DatabaseSchema, config: ValidationConfig['routes']) {
    super();
    this.schema = schema;
    this.config = config;
  }

  /**
   * Scan and validate all API routes
   */
  async validate(): Promise<IntegrityResult<ApiRoute[]>> {
    try {
      if (!this.config.enabled) {
        return { 
          success: true, 
          data: [], 
          metadata: { message: 'Route validation disabled' } 
        };
      }

      // Scan for route files
      const routeFiles = await this.scanRouteFiles();

      // Extract routes from files
      for (const file of routeFiles) {
        const routes = await this.extractRoutesFromFile(file);
        for (const route of routes) {
          this.routes.set(`${route.method} ${route.path}`, route);
        }
      }

      // Validate routes against schema
      const validationResults = await this.validateRoutesAgainstSchema();

      // Generate missing route stubs
      const missingRoutes = await this.generateMissingRoutes();

      const allRoutes = Array.from(this.routes.values());

      this.emit('event', {
        type: IntegrityEventType.ROUTE_SYNCED,
        timestamp: new Date(),
        source: 'RouteValidator',
        data: {
          total: allRoutes.length,
          valid: validationResults.valid.length,
          invalid: validationResults.invalid.length,
          missing: missingRoutes.length
        }
      });

      return {
        success: true,
        data: allRoutes,
        warnings: validationResults.warnings,
        metadata: {
          validRoutes: validationResults.valid,
          invalidRoutes: validationResults.invalid,
          missingRoutes: missingRoutes
        }
      };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'ROUTE_VALIDATION_FAILED',
        message: 'Failed to validate routes',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Scan for route files
   */
  private async scanRouteFiles(): Promise<string[]> {
    const patterns = this.config.patterns.length > 0 
      ? this.config.patterns 
      : ['**/routes/**/*.{js,ts}', '**/api/**/*.{js,ts}', '**/controllers/**/*.{js,ts}'];

    const files = await glob(patterns, {
      cwd: process.cwd(),
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });

    // Add custom directories
    for (const dir of this.config.directories) {
      const dirFiles = await glob(path.join(dir, '**/*.{js,ts}'), {
        absolute: true,
        ignore: ['**/node_modules/**']
      });
      files.push(...dirFiles);
    }

    return [...new Set(files)];
  }

  /**
   * Extract routes from a file
   */
  private async extractRoutesFromFile(filepath: string): Promise<ApiRoute[]> {
    const content = await fs.readFile(filepath, 'utf-8');
    const routes: ApiRoute[] = [];

    try {
      const ast = parseAST(content, {
        sourceType: 'module',
        plugins: ['typescript', 'decorators-legacy']
      });

      traverse(ast, {
        // Express route pattern: app.get('/path', handler)
        CallExpression(nodePath) {
          const node = nodePath.node;
          const callee = node.callee;

          // Check for route method calls
          if (callee.type === 'MemberExpression' && 
              callee.property.type === 'Identifier') {
            const method = callee.property.name.toUpperCase();
            
            if (Object.values(HttpMethod).includes(method as HttpMethod)) {
              const route = extractExpressRoute(node, method as HttpMethod, filepath);
              if (route) routes.push(route);
            }
          }
        },

        // Decorator pattern: @Get('/path')
        Decorator(nodePath) {
          const node = nodePath.node;
          if (node.expression.type === 'CallExpression' && 
              node.expression.callee.type === 'Identifier') {
            const method = node.expression.callee.name.toUpperCase();
            
            if (Object.values(HttpMethod).includes(method as HttpMethod)) {
              const route = extractDecoratorRoute(node, method as HttpMethod, filepath);
              if (route) routes.push(route);
            }
          }
        }
      });
    } catch (error) {
      this.emit('warning', `Failed to parse route file: ${filepath}`);
    }

    return routes;

    // Helper function to extract Express-style routes
    function extractExpressRoute(node: any, method: HttpMethod, filepath: string): ApiRoute | null {
      if (node.arguments.length < 2) return null;

      const pathArg = node.arguments[0];
      if (pathArg.type !== 'StringLiteral') return null;

      const path = pathArg.value;
      const handler = node.arguments[node.arguments.length - 1];
      
      const route: ApiRoute = {
        path,
        method,
        handler: filepath,
        parameters: extractRouteParameters(path),
        database: extractDatabaseOperations(handler),
        responses: []
      };

      return route;
    }

    // Helper function to extract decorator-style routes
    function extractDecoratorRoute(node: any, method: HttpMethod, filepath: string): ApiRoute | null {
      const expr = node.expression;
      if (!expr.arguments || expr.arguments.length === 0) return null;

      const pathArg = expr.arguments[0];
      if (pathArg.type !== 'StringLiteral') return null;

      const path = pathArg.value;
      
      const route: ApiRoute = {
        path,
        method,
        handler: filepath,
        parameters: extractRouteParameters(path),
        database: [],
        responses: []
      };

      return route;
    }

    // Extract route parameters from path
    function extractRouteParameters(routePath: string): RouteParameter[] {
      const params: RouteParameter[] = [];
      const paramRegex = /:(\w+)/g;
      let match;

      while ((match = paramRegex.exec(routePath)) !== null) {
        params.push({
          name: match[1],
          in: 'path',
          type: 'string',
          required: true
        });
      }

      return params;
    }

    // Extract database operations from handler
    function extractDatabaseOperations(handler: any): DatabaseOperation[] {
      const operations: DatabaseOperation[] = [];

      traverse(handler, {
        CallExpression(nodePath) {
          const node = nodePath.node;
          const callee = node.callee;

          // Look for common database patterns
          if (callee.type === 'MemberExpression' && 
              callee.property.type === 'Identifier') {
            const method = callee.property.name;
            const obj = callee.object;

            // Prisma patterns
            if (obj.type === 'MemberExpression' && 
                obj.property.type === 'Identifier') {
              const table = obj.property.name;
              
              switch (method) {
                case 'findUnique':
                case 'findFirst':
                case 'findMany':
                  operations.push({ type: 'select', table });
                  break;
                case 'create':
                  operations.push({ type: 'insert', table });
                  break;
                case 'update':
                case 'updateMany':
                  operations.push({ type: 'update', table });
                  break;
                case 'delete':
                case 'deleteMany':
                  operations.push({ type: 'delete', table });
                  break;
              }
            }

            // SQL query patterns
            if (method === 'query' || method === 'execute') {
              // Try to extract SQL from arguments
              if (node.arguments.length > 0) {
                const sqlArg = node.arguments[0];
                if (sqlArg.type === 'StringLiteral' || 
                    sqlArg.type === 'TemplateLiteral') {
                  const sql = sqlArg.type === 'StringLiteral' 
                    ? sqlArg.value 
                    : sqlArg.quasis.map((q: any) => q.value.raw).join('');
                  
                  const operation = extractSQLOperation(sql);
                  if (operation) operations.push(operation);
                }
              }
            }
          }
        }
      }, handler.scope, handler);

      return operations;
    }

    // Extract operation from SQL string
    function extractSQLOperation(sql: string): DatabaseOperation | null {
      const normalized = sql.trim().toUpperCase();
      
      if (normalized.startsWith('SELECT')) {
        const tableMatch = normalized.match(/FROM\s+(\w+)/);
        return tableMatch ? { type: 'select', table: tableMatch[1].toLowerCase() } : null;
      }
      
      if (normalized.startsWith('INSERT')) {
        const tableMatch = normalized.match(/INTO\s+(\w+)/);
        return tableMatch ? { type: 'insert', table: tableMatch[1].toLowerCase() } : null;
      }
      
      if (normalized.startsWith('UPDATE')) {
        const tableMatch = normalized.match(/UPDATE\s+(\w+)/);
        return tableMatch ? { type: 'update', table: tableMatch[1].toLowerCase() } : null;
      }
      
      if (normalized.startsWith('DELETE')) {
        const tableMatch = normalized.match(/FROM\s+(\w+)/);
        return tableMatch ? { type: 'delete', table: tableMatch[1].toLowerCase() } : null;
      }

      return null;
    }
  }

  /**
   * Validate routes against database schema
   */
  private async validateRoutesAgainstSchema(): Promise<{
    valid: ApiRoute[];
    invalid: ApiRoute[];
    warnings: string[];
  }> {
    const valid: ApiRoute[] = [];
    const invalid: ApiRoute[] = [];
    const warnings: string[] = [];

    for (const route of this.routes.values()) {
      let isValid = true;
      const routeWarnings: string[] = [];

      // Validate database operations
      for (const operation of route.database || []) {
        if (operation.table) {
          const table = this.schema.tables.find(t => t.name === operation.table);
          
          if (!table) {
            isValid = false;
            routeWarnings.push(`Table '${operation.table}' not found in schema`);
          } else {
            // Validate columns if specified
            if (operation.columns) {
              for (const column of operation.columns) {
                if (!table.columns.find(c => c.name === column)) {
                  routeWarnings.push(`Column '${column}' not found in table '${table.name}'`);
                }
              }
            }
          }
        }
      }

      // Validate path parameters against schema
      for (const param of route.parameters) {
        if (param.in === 'path' && param.name.endsWith('Id')) {
          const tableName = param.name.replace('Id', '');
          const table = this.schema.tables.find(t => 
            t.name.toLowerCase() === tableName.toLowerCase() ||
            t.name.toLowerCase() === tableName.toLowerCase() + 's'
          );

          if (!table) {
            routeWarnings.push(`Path parameter '${param.name}' doesn't match any table`);
          }
        }
      }

      if (isValid) {
        valid.push(route);
      } else {
        invalid.push(route);
      }

      warnings.push(...routeWarnings.map(w => `${route.method} ${route.path}: ${w}`));
    }

    return { valid, invalid, warnings };
  }

  /**
   * Generate missing routes for tables
   */
  private async generateMissingRoutes(): Promise<ApiRoute[]> {
    const missingRoutes: ApiRoute[] = [];
    
    // For each table, check if CRUD routes exist
    for (const table of this.schema.tables) {
      const baseRoutes = this.generateCRUDRoutes(table);
      
      for (const baseRoute of baseRoutes) {
        const exists = Array.from(this.routes.values()).some(r => 
          r.method === baseRoute.method && 
          this.pathsMatch(r.path, baseRoute.path)
        );

        if (!exists) {
          missingRoutes.push(baseRoute);
          
          // Generate route stub file
          if (this.config.strict) {
            await this.generateRouteStub(table, baseRoute);
          }
        }
      }
    }

    return missingRoutes;
  }

  /**
   * Generate CRUD routes for a table
   */
  private generateCRUDRoutes(table: Table): ApiRoute[] {
    const routes: ApiRoute[] = [];
    const resourceName = this.toKebabCase(this.pluralize(table.name));
    const singularName = this.toKebabCase(table.name);
    const primaryKey = table.primaryKey?.columns[0] || 'id';

    // GET all
    routes.push({
      path: `/api/${resourceName}`,
      method: HttpMethod.GET,
      handler: `routes/${resourceName}.ts`,
      parameters: [
        { name: 'page', in: 'query', type: 'number', required: false },
        { name: 'limit', in: 'query', type: 'number', required: false },
        { name: 'sort', in: 'query', type: 'string', required: false },
        { name: 'filter', in: 'query', type: 'string', required: false }
      ],
      database: [{ type: 'select', table: table.name }],
      responses: [
        { status: 200, contentType: 'application/json' },
        { status: 401, contentType: 'application/json' },
        { status: 500, contentType: 'application/json' }
      ]
    });

    // GET by ID
    routes.push({
      path: `/api/${resourceName}/:${primaryKey}`,
      method: HttpMethod.GET,
      handler: `routes/${resourceName}.ts`,
      parameters: [
        { name: primaryKey, in: 'path', type: 'string', required: true }
      ],
      database: [{ type: 'select', table: table.name }],
      responses: [
        { status: 200, contentType: 'application/json' },
        { status: 404, contentType: 'application/json' },
        { status: 500, contentType: 'application/json' }
      ]
    });

    // POST create
    routes.push({
      path: `/api/${resourceName}`,
      method: HttpMethod.POST,
      handler: `routes/${resourceName}.ts`,
      parameters: [],
      requestBody: {
        contentType: 'application/json',
        required: true,
        schema: this.generateCreateSchema(table)
      },
      database: [{ type: 'insert', table: table.name }],
      responses: [
        { status: 201, contentType: 'application/json' },
        { status: 400, contentType: 'application/json' },
        { status: 401, contentType: 'application/json' },
        { status: 500, contentType: 'application/json' }
      ]
    });

    // PUT update
    routes.push({
      path: `/api/${resourceName}/:${primaryKey}`,
      method: HttpMethod.PUT,
      handler: `routes/${resourceName}.ts`,
      parameters: [
        { name: primaryKey, in: 'path', type: 'string', required: true }
      ],
      requestBody: {
        contentType: 'application/json',
        required: true,
        schema: this.generateUpdateSchema(table)
      },
      database: [{ type: 'update', table: table.name }],
      responses: [
        { status: 200, contentType: 'application/json' },
        { status: 400, contentType: 'application/json' },
        { status: 404, contentType: 'application/json' },
        { status: 500, contentType: 'application/json' }
      ]
    });

    // DELETE
    routes.push({
      path: `/api/${resourceName}/:${primaryKey}`,
      method: HttpMethod.DELETE,
      handler: `routes/${resourceName}.ts`,
      parameters: [
        { name: primaryKey, in: 'path', type: 'string', required: true }
      ],
      database: [{ type: 'delete', table: table.name }],
      responses: [
        { status: 204, contentType: 'application/json' },
        { status: 404, contentType: 'application/json' },
        { status: 500, contentType: 'application/json' }
      ]
    });

    return routes;
  }

  /**
   * Generate route stub file
   */
  private async generateRouteStub(table: Table, route: ApiRoute): Promise<void> {
    const resourceName = this.toKebabCase(this.pluralize(table.name));
    const modelName = this.toPascalCase(table.name);
    const routeDir = path.join(process.cwd(), 'routes');
    const routeFile = path.join(routeDir, `${resourceName}.ts`);

    // Skip if file already exists
    if (await fs.pathExists(routeFile)) {
      return;
    }

    const content = `/**
 * Auto-generated route stub for ${modelName}
 * Generated by Claude DevOps Platform
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ${modelName} } from '../types/database';

// Validation schemas
${this.generateValidationSchemas(table)}

// GET /api/${resourceName}
export async function get${this.toPascalCase(this.pluralize(table.name))}(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = 1, limit = 10, sort, filter } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [items, total] = await Promise.all([
      prisma.${this.toCamelCase(table.name)}.findMany({
        skip,
        take,
        orderBy: sort ? { [String(sort)]: 'asc' } : undefined,
        where: filter ? JSON.parse(String(filter)) : undefined
      }),
      prisma.${this.toCamelCase(table.name)}.count()
    ]);

    res.json({
      data: items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/${resourceName}/:id
export async function get${modelName}ById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    
    const item = await prisma.${this.toCamelCase(table.name)}.findUnique({
      where: { id }
    });

    if (!item) {
      res.status(404).json({ error: '${modelName} not found' });
      return;
    }

    res.json({ data: item });
  } catch (error) {
    next(error);
  }
}

// POST /api/${resourceName}
export async function create${modelName}(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validatedData = Create${modelName}Schema.parse(req.body);
    
    const item = await prisma.${this.toCamelCase(table.name)}.create({
      data: validatedData
    });

    res.status(201).json({ data: item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    next(error);
  }
}

// PUT /api/${resourceName}/:id
export async function update${modelName}(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const validatedData = Update${modelName}Schema.parse(req.body);
    
    const item = await prisma.${this.toCamelCase(table.name)}.update({
      where: { id },
      data: validatedData
    });

    res.json({ data: item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    next(error);
  }
}

// DELETE /api/${resourceName}/:id
export async function delete${modelName}(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    
    await prisma.${this.toCamelCase(table.name)}.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
`;

    await fs.ensureDir(routeDir);
    const formatted = await format(content, {
      parser: 'typescript',
      singleQuote: true,
      semi: true,
      trailingComma: 'es5'
    });
    
    await fs.writeFile(routeFile, formatted);
  }

  /**
   * Generate validation schemas for a table
   */
  private generateValidationSchemas(table: Table): string {
    let schemas = '';

    // Create schema
    schemas += `const Create${this.toPascalCase(table.name)}Schema = z.object({\n`;
    for (const column of table.columns) {
      if (!column.autoIncrement && column.name !== 'created_at' && column.name !== 'updated_at') {
        const zodType = this.mapToZodType(column);
        schemas += `  ${column.name}: ${zodType},\n`;
      }
    }
    schemas += '});\n\n';

    // Update schema
    schemas += `const Update${this.toPascalCase(table.name)}Schema = z.object({\n`;
    for (const column of table.columns) {
      if (!column.autoIncrement && !column.primaryKey && 
          column.name !== 'created_at' && column.name !== 'updated_at') {
        const zodType = this.mapToZodType(column);
        schemas += `  ${column.name}: ${zodType}.optional(),\n`;
      }
    }
    schemas += '});\n';

    return schemas;
  }

  /**
   * Generate create schema for table
   */
  private generateCreateSchema(table: Table): z.ZodSchema {
    const shape: Record<string, z.ZodSchema> = {};

    for (const column of table.columns) {
      if (!column.autoIncrement && column.name !== 'created_at' && column.name !== 'updated_at') {
        shape[column.name] = this.getZodSchema(column);
      }
    }

    return z.object(shape);
  }

  /**
   * Generate update schema for table
   */
  private generateUpdateSchema(table: Table): z.ZodSchema {
    const shape: Record<string, z.ZodSchema> = {};

    for (const column of table.columns) {
      if (!column.autoIncrement && !column.primaryKey && 
          column.name !== 'created_at' && column.name !== 'updated_at') {
        shape[column.name] = this.getZodSchema(column).optional();
      }
    }

    return z.object(shape);
  }

  /**
   * Map column to Zod schema
   */
  private getZodSchema(column: Column): z.ZodSchema {
    const type = column.type.toLowerCase();
    let schema: z.ZodSchema;

    if (type.includes('int') || type.includes('serial')) {
      schema = z.number().int();
    } else if (type.includes('numeric') || type.includes('decimal') || 
               type.includes('float') || type.includes('double')) {
      schema = z.number();
    } else if (type.includes('bool')) {
      schema = z.boolean();
    } else if (type.includes('json')) {
      schema = z.record(z.unknown());
    } else if (type.includes('date') || type.includes('time')) {
      schema = z.string().datetime();
    } else if (type.includes('uuid')) {
      schema = z.string().uuid();
    } else {
      schema = z.string();
      
      if (type.includes('varchar')) {
        const lengthMatch = type.match(/\((\d+)\)/);
        if (lengthMatch) {
          schema = (schema as z.ZodString).max(parseInt(lengthMatch[1]));
        }
      }
    }

    if (column.nullable) {
      schema = schema.nullable();
    }

    return schema;
  }

  /**
   * Map column to Zod type string
   */
  private mapToZodType(column: Column): string {
    const type = column.type.toLowerCase();
    let zodType: string;

    if (type.includes('int') || type.includes('serial')) {
      zodType = 'z.number().int()';
    } else if (type.includes('numeric') || type.includes('decimal') || 
               type.includes('float') || type.includes('double')) {
      zodType = 'z.number()';
    } else if (type.includes('bool')) {
      zodType = 'z.boolean()';
    } else if (type.includes('json')) {
      zodType = 'z.record(z.unknown())';
    } else if (type.includes('date') || type.includes('time')) {
      zodType = 'z.string().datetime()';
    } else if (type.includes('uuid')) {
      zodType = 'z.string().uuid()';
    } else {
      zodType = 'z.string()';
      
      if (type.includes('varchar')) {
        const lengthMatch = type.match(/\((\d+)\)/);
        if (lengthMatch) {
          zodType = `z.string().max(${lengthMatch[1]})`;
        }
      }
    }

    if (column.nullable) {
      zodType += '.nullable()';
    }

    return zodType;
  }

  /**
   * Check if paths match (accounting for parameters)
   */
  private pathsMatch(path1: string, path2: string): boolean {
    const segments1 = path1.split('/').filter(Boolean);
    const segments2 = path2.split('/').filter(Boolean);

    if (segments1.length !== segments2.length) {
      return false;
    }

    for (let i = 0; i < segments1.length; i++) {
      const seg1 = segments1[i];
      const seg2 = segments2[i];

      // Skip parameter segments
      if (seg1.startsWith(':') || seg2.startsWith(':')) {
        continue;
      }

      if (seg1 !== seg2) {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert to kebab case
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  /**
   * Convert to camel case
   */
  private toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  /**
   * Convert to pascal case
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[_-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Pluralize a word (simple version)
   */
  private pluralize(word: string): string {
    if (word.endsWith('y')) {
      return word.slice(0, -1) + 'ies';
    }
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('ch') || word.endsWith('sh')) {
      return word + 'es';
    }
    return word + 's';
  }
}