const { PrismaClient } = require('@prisma/client');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const execAsync = promisify(exec);

/**
 * Database Integrity System with Memory Bank Integration
 * Provides comprehensive database management, validation, and audit logging
 */
class DatabaseIntegritySystem {
  constructor(config) {
    this.config = config;
    this.prisma = new PrismaClient({
      log: config.database.logLevel === 'debug' ? ['query', 'info', 'warn', 'error'] : ['error']
    });
    this.memoryBank = null;
  }

  async initialize() {
    await this.prisma.$connect();
    // Initialize memory bank tables if they don't exist
    await this.ensureMemoryBankTables();
  }

  async ensureMemoryBankTables() {
    try {
      // Check if memory bank tables exist
      const tableExists = await this.prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'IntegrityLog'
        );
      `;
      
      if (!tableExists[0].exists) {
        console.log('Memory bank tables not found. Please run migrations.');
      }
    } catch (error) {
      console.error('Error checking memory bank tables:', error.message);
    }
  }

  // Memory Bank logging methods
  async log(category, level, message, metadata = {}) {
    try {
      await this.prisma.integrityLog.create({
        data: {
          category,
          level,
          operation: metadata.operation || 'GENERAL',
          component: metadata.component || 'DatabaseIntegritySystem',
          message,
          details: metadata.details || null,
          metadata: metadata,
          duration: metadata.duration || null,
          success: metadata.success !== undefined ? metadata.success : true,
          errorCode: metadata.errorCode || null,
          stackTrace: metadata.stackTrace || null,
          userId: metadata.userId || process.env.USER || null,
          correlationId: metadata.correlationId || this.getCorrelationId(),
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to write to memory bank:', error.message);
    }
  }

  getCorrelationId() {
    return process.env.CORRELATION_ID || crypto.randomBytes(16).toString('hex');
  }

  // Log viewing methods
  async getRecentLogs(limit = 10, category = null, level = null) {
    const where = {};
    if (category) where.category = category;
    if (level) where.level = level;

    return await this.prisma.integrityLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit
    });
  }

  async exportLogs(startDate, endDate, format = 'json') {
    const logs = await this.prisma.integrityLog.findMany({
      where: {
        timestamp: {
          gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default 30 days
          lte: endDate || new Date()
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    if (format === 'csv') {
      return this.logsToCSV(logs);
    }
    return logs;
  }

  logsToCSV(logs) {
    const headers = ['timestamp', 'category', 'level', 'message', 'metadata', 'context'];
    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.category,
      log.level,
      log.message,
      log.metadata,
      log.context
    ]);
    
    return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  // Migration methods with memory bank logging
  async getMigrationStatus() {
    await this.log('MIGRATION', 'INFO', 'Checking migration status');
    
    try {
      // Get Prisma migrations
      const migrationsDir = this.config.migration.migrationsDir;
      const migrationFiles = await fs.readdir(migrationsDir).catch(() => []);
      
      const migrations = [];
      
      for (const file of migrationFiles) {
        if (file.includes('migration.sql')) {
          const migrationPath = path.join(migrationsDir, file);
          const stats = await fs.stat(migrationPath);
          
          // Check if migration is applied
          const applied = await this.prisma.$queryRaw`
            SELECT EXISTS (
              SELECT 1 FROM _prisma_migrations 
              WHERE migration_name = ${file.replace('/migration.sql', '')}
            );
          `;
          
          migrations.push({
            id: file.replace('/migration.sql', ''),
            name: file,
            status: applied[0].exists ? 'applied' : 'pending',
            executedAt: applied[0].exists ? stats.mtime : null
          });
        }
      }
      
      await this.log('MIGRATION', 'INFO', `Found ${migrations.length} migrations`, { count: migrations.length });
      
      return { success: true, data: migrations };
    } catch (error) {
      await this.log('MIGRATION', 'ERROR', 'Failed to get migration status', { error: error.message });
      return { success: false, error };
    }
  }

  async runPendingMigrations(options = {}) {
    await this.log('MIGRATION', 'INFO', 'Running pending migrations', options);
    
    try {
      if (options.dryRun) {
        await this.log('MIGRATION', 'INFO', 'Dry run mode - no changes will be made');
      }
      
      const { stdout, stderr } = await execAsync(
        `npx prisma migrate ${options.dryRun ? 'diff' : 'deploy'}`,
        { cwd: path.join(this.config.prisma.migrationsDir, '../..') }
      );
      
      if (stderr && !stderr.includes('Everything is now in sync')) {
        throw new Error(stderr);
      }
      
      await this.log('MIGRATION', 'INFO', 'Migrations completed successfully', { output: stdout });
      
      return { success: true, data: [] };
    } catch (error) {
      await this.log('MIGRATION', 'ERROR', 'Failed to run migrations', { error: error.message });
      return { success: false, error };
    }
  }

  async runPrismaMigrations(deploy = false) {
    const command = deploy ? 'migrate deploy' : 'migrate dev';
    await this.log('MIGRATION', 'INFO', `Running Prisma ${command}`);
    
    try {
      const { stdout, stderr } = await execAsync(
        `npx prisma ${command}`,
        { cwd: path.join(this.config.prisma.migrationsDir, '../..') }
      );
      
      await this.log('MIGRATION', 'INFO', 'Prisma migrations completed', { output: stdout });
      
      return { success: true, data: { output: stdout } };
    } catch (error) {
      await this.log('MIGRATION', 'ERROR', 'Failed to run Prisma migrations', { error: error.message });
      return { success: false, error };
    }
  }

  // Drift detection with memory bank logging
  async detectDrifts() {
    await this.log('DRIFT', 'INFO', 'Starting drift detection');
    
    try {
      const drifts = [];
      
      // Check for missing indexes
      const schemaIndexes = await this.getSchemaIndexes();
      const dbIndexes = await this.getDatabaseIndexes();
      
      for (const schemaIndex of schemaIndexes) {
        const exists = dbIndexes.find(dbIdx => 
          dbIdx.tablename === schemaIndex.table && 
          dbIdx.indexname === schemaIndex.name
        );
        
        if (!exists) {
          drifts.push({
            type: 'MISSING_INDEX',
            object: `${schemaIndex.table}.${schemaIndex.name}`,
            description: `Index ${schemaIndex.name} is defined in schema but missing in database`,
            severity: 'HIGH',
            fixable: true
          });
        }
      }
      
      // Check for extra indexes
      for (const dbIndex of dbIndexes) {
        if (!dbIndex.indexname.startsWith('_')) { // Skip system indexes
          const defined = schemaIndexes.find(schemaIdx => 
            schemaIdx.table === dbIndex.tablename && 
            schemaIdx.name === dbIndex.indexname
          );
          
          if (!defined) {
            drifts.push({
              type: 'EXTRA_INDEX',
              object: `${dbIndex.tablename}.${dbIndex.indexname}`,
              description: `Index ${dbIndex.indexname} exists in database but not defined in schema`,
              severity: 'MEDIUM',
              fixable: true
            });
          }
        }
      }
      
      // Log drift summary
      await this.log('DRIFT', 'INFO', `Detected ${drifts.length} drifts`, {
        count: drifts.length,
        types: drifts.reduce((acc, drift) => {
          acc[drift.type] = (acc[drift.type] || 0) + 1;
          return acc;
        }, {})
      });
      
      const summary = {
        totalDrifts: drifts.length,
        byType: {},
        bySeverity: {}
      };
      
      drifts.forEach(drift => {
        summary.byType[drift.type] = (summary.byType[drift.type] || 0) + 1;
        summary.bySeverity[drift.severity] = (summary.bySeverity[drift.severity] || 0) + 1;
      });
      
      return { success: true, data: { drifts, summary } };
    } catch (error) {
      await this.log('DRIFT', 'ERROR', 'Failed to detect drifts', { error: error.message });
      return { success: false, error };
    }
  }

  async detectPrismaSchemaDrift() {
    await this.log('DRIFT', 'INFO', 'Checking Prisma schema drift');
    
    try {
      const { stdout } = await execAsync(
        'npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code',
        { cwd: path.join(this.config.prisma.migrationsDir, '../..') }
      ).catch(e => ({ stdout: e.stdout, stderr: e.stderr }));
      
      const drifts = [];
      if (stdout && stdout.includes('Drift detected')) {
        // Parse the output to extract drift details
        const lines = stdout.split('\n');
        lines.forEach(line => {
          if (line.includes('Added') || line.includes('Removed') || line.includes('Changed')) {
            drifts.push({
              description: line.trim(),
              prismaFix: null
            });
          }
        });
      }
      
      await this.log('DRIFT', 'INFO', `Prisma drift check completed`, { driftCount: drifts.length });
      
      return { success: true, data: { drifts } };
    } catch (error) {
      await this.log('DRIFT', 'ERROR', 'Failed to check Prisma drift', { error: error.message });
      return { success: false, error };
    }
  }

  async generatePrismaMigrationFromDrift(driftData, migrationName) {
    await this.log('DRIFT', 'INFO', 'Generating migration from drift', { migrationName });
    
    try {
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const migrationDir = path.join(this.config.migration.migrationsDir, `${timestamp}_${migrationName}`);
      
      await fs.mkdir(migrationDir, { recursive: true });
      
      // Generate SQL for fixes
      let sql = '-- Auto-generated migration to fix drifts\n\n';
      
      for (const drift of driftData.drifts) {
        if (drift.fixable) {
          if (drift.type === 'MISSING_INDEX') {
            sql += `-- Fix: ${drift.description}\n`;
            sql += `CREATE INDEX IF NOT EXISTS "${drift.object.split('.')[1]}" ON "${drift.object.split('.')[0]}";\n\n`;
          }
        }
      }
      
      await fs.writeFile(path.join(migrationDir, 'migration.sql'), sql);
      
      await this.log('DRIFT', 'INFO', 'Migration generated successfully', { path: migrationDir });
      
      return { success: true, data: { migrationPath: migrationDir } };
    } catch (error) {
      await this.log('DRIFT', 'ERROR', 'Failed to generate migration', { error: error.message });
      return { success: false, error };
    }
  }

  // Validation methods with memory bank logging
  async scanForms() {
    await this.log('VALIDATION', 'INFO', 'Scanning forms for validation');
    
    try {
      const forms = [];
      
      for (const dir of this.config.validation.forms.scanDirs) {
        const files = await this.findFiles(dir, this.config.validation.forms.filePatterns);
        
        for (const file of files) {
          const content = await fs.readFile(file, 'utf-8');
          const formData = this.extractFormData(content, file);
          
          if (formData) {
            const validation = await this.validateFormAgainstModel(formData);
            forms.push({
              ...formData,
              validation,
              suggestions: validation.errors.map(e => ({ message: e.suggestion }))
            });
          }
        }
      }
      
      await this.log('VALIDATION', 'INFO', `Scanned ${forms.length} forms`, { count: forms.length });
      
      return { success: true, data: forms };
    } catch (error) {
      await this.log('VALIDATION', 'ERROR', 'Failed to scan forms', { error: error.message });
      return { success: false, error };
    }
  }

  async validateRoutes() {
    await this.log('VALIDATION', 'INFO', 'Validating API routes');
    
    try {
      const routes = [];
      const apiDir = this.config.validation.routes.apiDir;
      const files = await this.findFiles(apiDir, this.config.validation.routes.patterns);
      
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const routeData = this.extractRouteData(content, file);
        
        if (routeData) {
          const validation = await this.validateRouteAgainstSchema(routeData);
          routes.push({
            ...routeData,
            validation
          });
        }
      }
      
      await this.log('VALIDATION', 'INFO', `Validated ${routes.length} routes`, { count: routes.length });
      
      return { success: true, data: routes };
    } catch (error) {
      await this.log('VALIDATION', 'ERROR', 'Failed to validate routes', { error: error.message });
      return { success: false, error };
    }
  }

  async validateWarehouseIntegrity() {
    await this.log('VALIDATION', 'INFO', 'Validating warehouse-specific integrity');
    
    try {
      const result = {
        paymentForms: [],
        operationForms: [],
        apiRoutes: []
      };
      
      // Validate payment-related forms
      const paymentFormPaths = [
        '/components/payment/PaymentControlPanel.tsx',
        '/components/payment/PaymentMethodForm.tsx'
      ];
      
      for (const formPath of paymentFormPaths) {
        const fullPath = path.join(process.cwd(), formPath);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const validation = this.validatePaymentForm(content, formPath);
          result.paymentForms.push(validation);
        } catch (error) {
          // File might not exist
        }
      }
      
      // Validate operation forms
      const operationFormPaths = [
        '/components/operations/WarehouseForm.tsx',
        '/components/operations/InventoryForm.tsx'
      ];
      
      for (const formPath of operationFormPaths) {
        const fullPath = path.join(process.cwd(), formPath);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const validation = this.validateOperationForm(content, formPath);
          result.operationForms.push(validation);
        } catch (error) {
          // File might not exist
        }
      }
      
      // Validate API routes specific to warehouse operations
      const warehouseRoutes = [
        { method: 'GET', route: '/api/warehouses', model: 'Warehouse' },
        { method: 'POST', route: '/api/payments', model: 'Payment' },
        { method: 'GET', route: '/api/operators', model: 'Operator' }
      ];
      
      for (const route of warehouseRoutes) {
        const validation = await this.validateWarehouseRoute(route);
        result.apiRoutes.push({
          ...route,
          ...validation
        });
      }
      
      await this.log('VALIDATION', 'INFO', 'Warehouse integrity validation completed', {
        paymentForms: result.paymentForms.length,
        operationForms: result.operationForms.length,
        apiRoutes: result.apiRoutes.length
      });
      
      return { success: true, data: result };
    } catch (error) {
      await this.log('VALIDATION', 'ERROR', 'Failed to validate warehouse integrity', { error: error.message });
      return { success: false, error };
    }
  }

  // Schema analysis with memory bank logging
  async analyzeSchema() {
    await this.log('SCHEMA', 'INFO', 'Analyzing database schema');
    
    try {
      const analysis = {
        version: await this.getSchemaVersion(),
        tables: await this.getTables(),
        indexes: await this.getDatabaseIndexes(),
        constraints: await this.getConstraints(),
        enums: await this.getEnums(),
        prismaModels: await this.getPrismaModels()
      };
      
      await this.log('SCHEMA', 'INFO', 'Schema analysis completed', {
        tables: analysis.tables.length,
        indexes: analysis.indexes.length,
        constraints: analysis.constraints.length
      });
      
      return { success: true, data: analysis };
    } catch (error) {
      await this.log('SCHEMA', 'ERROR', 'Failed to analyze schema', { error: error.message });
      return { success: false, error };
    }
  }

  // Full integrity check
  async runFullIntegrityCheck() {
    await this.log('INTEGRITY', 'INFO', 'Starting full integrity check');
    
    const startTime = Date.now();
    const results = {
      schema: await this.analyzeSchema(),
      routes: await this.validateRoutes(),
      forms: await this.scanForms(),
      drifts: await this.detectDrifts(),
      warehouse: await this.validateWarehouseIntegrity()
    };
    
    const issues = [];
    let overallSuccess = true;
    
    Object.entries(results).forEach(([component, result]) => {
      if (!result.success) {
        overallSuccess = false;
        issues.push(`${component}: ${result.error?.message || 'Failed'}`);
      }
    });
    
    const metadata = {
      executionTime: Date.now() - startTime,
      overallSuccess,
      issues,
      timestamp: new Date().toISOString()
    };
    
    await this.log('INTEGRITY', overallSuccess ? 'INFO' : 'ERROR', 
      `Full integrity check completed in ${metadata.executionTime}ms`, metadata);
    
    return {
      success: true,
      data: results,
      metadata
    };
  }

  // Helper methods
  async getSchemaVersion() {
    const result = await this.prisma.$queryRaw`
      SELECT version FROM _prisma_migrations 
      ORDER BY finished_at DESC 
      LIMIT 1;
    `;
    return result[0]?.version || 'unknown';
  }

  async getTables() {
    const tables = await this.prisma.$queryRaw`
      SELECT table_name as name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const tablesWithColumns = [];
    for (const table of tables) {
      const columns = await this.prisma.$queryRaw`
        SELECT column_name as name, data_type as type, is_nullable as nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = ${table.name}
        ORDER BY ordinal_position;
      `;
      tablesWithColumns.push({ ...table, columns });
    }
    
    return tablesWithColumns;
  }

  async getDatabaseIndexes() {
    return await this.prisma.$queryRaw`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `;
  }

  async getSchemaIndexes() {
    // Parse Prisma schema to extract expected indexes
    const schemaContent = await fs.readFile(this.config.prisma.schemaPath, 'utf-8');
    const indexes = [];
    
    // Simple regex to extract index definitions
    const indexRegex = /@@index\(\[([^\]]+)\]\)/g;
    const modelRegex = /model\s+(\w+)\s*{([^}]+)}/g;
    
    let modelMatch;
    while ((modelMatch = modelRegex.exec(schemaContent))) {
      const modelName = modelMatch[1];
      const modelContent = modelMatch[2];
      
      let indexMatch;
      const tempRegex = /@@index\(\[([^\]]+)\]\)/g;
      while ((indexMatch = tempRegex.exec(modelContent))) {
        const fields = indexMatch[1].split(',').map(f => f.trim());
        indexes.push({
          table: modelName.toLowerCase(),
          name: `${modelName.toLowerCase()}_${fields.join('_')}_idx`,
          fields
        });
      }
    }
    
    return indexes;
  }

  async getConstraints() {
    return await this.prisma.$queryRaw`
      SELECT conname as name, contype as type, conrelid::regclass as table
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      ORDER BY conname;
    `;
  }

  async getEnums() {
    return await this.prisma.$queryRaw`
      SELECT typname as name, array_agg(enumlabel) as values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typnamespace = 'public'::regnamespace
      GROUP BY typname
      ORDER BY typname;
    `;
  }

  async getPrismaModels() {
    const schemaContent = await fs.readFile(this.config.prisma.schemaPath, 'utf-8');
    const models = [];
    
    const modelRegex = /model\s+(\w+)\s*{/g;
    let match;
    while ((match = modelRegex.exec(schemaContent))) {
      models.push({ name: match[1] });
    }
    
    return models;
  }

  async findFiles(dir, patterns) {
    const glob = require('glob');
    const files = [];
    
    for (const pattern of patterns) {
      const matches = await promisify(glob)(path.join(dir, pattern));
      files.push(...matches);
    }
    
    return files;
  }

  extractFormData(content, filePath) {
    // Extract form data from React/Next.js components
    const formNameMatch = content.match(/(?:function|const)\s+(\w+)/);
    const modelMatch = content.match(/(?:useForm|FormData).*?<(\w+)>/);
    
    if (formNameMatch) {
      return {
        formName: formNameMatch[1],
        formPath: filePath,
        framework: content.includes('use') ? 'react' : 'nextjs',
        model: modelMatch ? modelMatch[1] : null,
        fields: this.extractFormFields(content)
      };
    }
    
    return null;
  }

  extractFormFields(content) {
    const fields = [];
    const fieldRegex = /(?:name|id)=["'](\w+)["']/g;
    
    let match;
    while ((match = fieldRegex.exec(content))) {
      if (!fields.includes(match[1])) {
        fields.push(match[1]);
      }
    }
    
    return fields;
  }

  extractRouteData(content, filePath) {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const route = filePath.replace(/.*\/api/, '/api').replace(/\.(ts|js)$/, '');
    
    const foundMethods = methods.filter(method => 
      content.includes(`export ${method}`) || 
      content.includes(`export async function ${method}`) ||
      content.includes(`handler.${method.toLowerCase()}`)
    );
    
    if (foundMethods.length > 0) {
      return {
        path: route,
        method: foundMethods[0],
        file: filePath,
        params: this.extractRouteParams(content)
      };
    }
    
    return null;
  }

  extractRouteParams(content) {
    const params = [];
    
    // Extract query params
    const queryMatch = content.match(/(?:query|searchParams)\.(\w+)/g);
    if (queryMatch) {
      queryMatch.forEach(match => {
        const param = match.split('.')[1];
        params.push({ name: param, type: 'query' });
      });
    }
    
    // Extract body params
    const bodyMatch = content.match(/(?:body|data)\.(\w+)/g);
    if (bodyMatch) {
      bodyMatch.forEach(match => {
        const param = match.split('.')[1];
        params.push({ name: param, type: 'body' });
      });
    }
    
    return params;
  }

  async validateFormAgainstModel(formData) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };
    
    if (!formData.model) {
      validation.warnings.push({
        message: 'No model type detected for form',
        field: null
      });
      return validation;
    }
    
    // Get model fields from Prisma schema
    const modelFields = await this.getModelFields(formData.model);
    
    // Check for missing required fields
    const requiredFields = modelFields.filter(f => f.required);
    for (const field of requiredFields) {
      if (!formData.fields.includes(field.name)) {
        validation.valid = false;
        validation.errors.push({
          message: `Missing required field: ${field.name}`,
          field: field.name,
          suggestion: `Add input field for ${field.name} (${field.type})`
        });
      }
    }
    
    // Check for unknown fields
    for (const field of formData.fields) {
      if (!modelFields.find(f => f.name === field)) {
        validation.warnings.push({
          message: `Unknown field: ${field}`,
          field: field
        });
      }
    }
    
    return validation;
  }

  async validateRouteAgainstSchema(routeData) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };
    
    // Extract model from route path
    const pathParts = routeData.path.split('/');
    const modelName = pathParts[pathParts.length - 1];
    
    const modelFields = await this.getModelFields(modelName);
    
    if (modelFields.length === 0) {
      validation.warnings.push({
        message: `No model found for route ${routeData.path}`
      });
      return validation;
    }
    
    // Validate params against model
    for (const param of routeData.params) {
      if (!modelFields.find(f => f.name === param.name)) {
        validation.errors.push({
          message: `Invalid parameter: ${param.name} not found in model`,
          param: param.name
        });
        validation.valid = false;
      }
    }
    
    return validation;
  }

  async getModelFields(modelName) {
    try {
      const schemaContent = await fs.readFile(this.config.prisma.schemaPath, 'utf-8');
      const modelRegex = new RegExp(`model\\s+${modelName}\\s*{([^}]+)}`, 'i');
      const modelMatch = schemaContent.match(modelRegex);
      
      if (!modelMatch) return [];
      
      const fields = [];
      const fieldRegex = /(\w+)\s+(\w+)(\??)\s*(=|@)?/g;
      
      let match;
      while ((match = fieldRegex.exec(modelMatch[1]))) {
        fields.push({
          name: match[1],
          type: match[2],
          required: !match[3] && !match[4]?.includes('=')
        });
      }
      
      return fields;
    } catch (error) {
      return [];
    }
  }

  validatePaymentForm(content, formPath) {
    const fields = this.extractFormFields(content);
    const requiredPaymentFields = ['amount', 'currency', 'paymentMethod'];
    
    const missingFields = requiredPaymentFields.filter(f => !fields.includes(f));
    const valid = missingFields.length === 0;
    
    return {
      formName: path.basename(formPath),
      model: 'Payment',
      valid,
      missingFields,
      typeMismatches: []
    };
  }

  validateOperationForm(content, formPath) {
    const fields = this.extractFormFields(content);
    const requiredOperationFields = ['warehouseId', 'operationType', 'quantity'];
    
    const missingFields = requiredOperationFields.filter(f => !fields.includes(f));
    const valid = missingFields.length === 0;
    
    return {
      formName: path.basename(formPath),
      model: 'Operation',
      valid,
      missingFields,
      typeMismatches: []
    };
  }

  async validateWarehouseRoute(route) {
    const validation = {
      valid: true,
      queryParams: [],
      bodyParams: []
    };
    
    // Mock validation for warehouse routes
    if (route.method === 'GET' && route.route.includes('warehouses')) {
      validation.queryParams = [
        { param: 'limit', validInModel: true },
        { param: 'offset', validInModel: true }
      ];
    } else if (route.method === 'POST' && route.route.includes('payments')) {
      validation.bodyParams = [
        { param: 'amount', validInModel: true },
        { param: 'currency', validInModel: true }
      ];
    }
    
    return validation;
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = { DatabaseIntegritySystem };