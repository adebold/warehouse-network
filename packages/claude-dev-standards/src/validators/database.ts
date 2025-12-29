/**
 * Database Validator - Validates database implementation
 * Ensures proper PostgreSQL usage, migrations, connection pooling, and no in-memory databases
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { glob } from 'glob';

import { ValidationResult } from '../types';
import { Logger } from '../utils/logger';

export interface DatabaseValidationOptions {
  requirePostgreSQL: boolean;
  requireRedis: boolean;
  requireMigrations: boolean;
  requireConnectionPooling: boolean;
  requireSSL: boolean;
  requireTransactions: boolean;
  bannedDatabases: string[];
}

export interface DatabaseValidationResult extends ValidationResult {
  issues: DatabaseIssue[];
  coverage: {
    hasPostgreSQL: boolean;
    hasRedis: boolean;
    hasMigrations: boolean;
    hasConnectionPooling: boolean;
    hasSSL: boolean;
    hasTransactions: boolean;
    hasBackupStrategy: boolean;
  };
  detectedDatabases: string[];
}

export interface DatabaseIssue {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line?: number;
  recommendation: string;
}

export class DatabaseValidator {
  private logger: Logger;
  private options: DatabaseValidationOptions;

  constructor(options?: Partial<DatabaseValidationOptions>) {
    this.logger = new Logger('DatabaseValidator');
    this.options = {
      requirePostgreSQL: true,
      requireRedis: true,
      requireMigrations: true,
      requireConnectionPooling: true,
      requireSSL: true,
      requireTransactions: true,
      bannedDatabases: [
        'sqlite:memory',
        ':memory:',
        'mongodb-memory-server',
        'mock-database',
        'in-memory'
      ],
      ...options
    };
  }

  /**
   * Validate database implementation
   */
  async validate(target: string): Promise<DatabaseValidationResult> {
    this.logger.info(`Validating database implementation for: ${target}`);
    
    const result: DatabaseValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      issues: [],
      coverage: {
        hasPostgreSQL: false,
        hasRedis: false,
        hasMigrations: false,
        hasConnectionPooling: false,
        hasSSL: false,
        hasTransactions: false,
        hasBackupStrategy: false
      },
      detectedDatabases: []
    };
    
    try {
      // Find all database-related files
      const files = await this.findDatabaseFiles(target);
      
      if (files.length === 0) {
        result.warnings.push('No database configuration files found');
      }
      
      // Check configuration files
      await this.checkDatabaseConfig(target, result);
      
      // Check each file
      for (const file of files) {
        await this.validateDatabaseFile(file, result);
      }
      
      // Check package.json for database dependencies
      await this.checkPackageDependencies(target, result);
      
      // Check migrations
      await this.checkMigrations(target, result);
      
      // Check coverage requirements
      this.checkCoverageRequirements(result);
      
      // Validate overall implementation
      result.valid = result.errors.length === 0;
      
    } catch (error) {
      this.logger.error('Database validation failed', error);
      result.valid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Find database-related files
   */
  private async findDatabaseFiles(target: string): Promise<string[]> {
    const patterns = [
      '**/database/**/*.{js,ts}',
      '**/db/**/*.{js,ts}',
      '**/models/**/*.{js,ts}',
      '**/entities/**/*.{js,ts}',
      '**/repositories/**/*.{js,ts}',
      '**/config/database*.{js,ts}',
      '**/knexfile.{js,ts}',
      '**/ormconfig*.{js,ts,json}',
      '**/*database*.config.{js,ts}',
      '**/prisma/**/*.prisma'
    ];
    
    const files = new Set<string>();
    
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: target,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      });
      matches.forEach(file => files.add(file));
    }
    
    return Array.from(files);
  }

  /**
   * Check database configuration
   */
  private async checkDatabaseConfig(target: string, result: DatabaseValidationResult) {
    // Check for .env or config files
    const configPatterns = [
      '.env',
      '.env.example',
      '.env.production',
      'config/database.js',
      'config/database.ts',
      'config.js',
      'config.ts'
    ];
    
    for (const pattern of configPatterns) {
      const configPath = path.join(target, pattern);
      
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        
        // Check for PostgreSQL
        if (content.includes('postgres://') || content.includes('postgresql://') || 
            content.includes('DB_HOST') || content.includes('POSTGRES_')) {
          result.coverage.hasPostgreSQL = true;
          result.detectedDatabases.push('PostgreSQL');
        }
        
        // Check for Redis
        if (content.includes('redis://') || content.includes('REDIS_')) {
          result.coverage.hasRedis = true;
          result.detectedDatabases.push('Redis');
        }
        
        // Check for SSL
        if (content.includes('sslmode=require') || content.includes('SSL_MODE') || 
            content.includes('rejectUnauthorized')) {
          result.coverage.hasSSL = true;
        }
        
        // Check for banned databases
        for (const banned of this.options.bannedDatabases) {
          if (content.includes(banned)) {
            result.errors.push(`Banned database detected: ${banned}`);
            result.issues.push({
              type: 'banned-database',
              severity: 'error',
              message: `In-memory or mock database "${banned}" detected`,
              file: configPath,
              recommendation: 'Use real PostgreSQL database instead of in-memory solutions'
            });
          }
        }
        
      } catch (error) {
        // Config file doesn't exist, continue
      }
    }
  }

  /**
   * Validate a single database file
   */
  private async validateDatabaseFile(filePath: string, result: DatabaseValidationResult) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      
      // Check for PostgreSQL usage
      if (content.includes('pg') || content.includes('postgres') || content.includes('PostgreSQL')) {
        result.coverage.hasPostgreSQL = true;
        
        // Check for connection pooling
        if (content.includes('Pool') || content.includes('pool:') || content.includes('poolSize')) {
          result.coverage.hasConnectionPooling = true;
        } else if (content.includes('Client') && !content.includes('Pool')) {
          result.warnings.push('PostgreSQL Client used without connection pooling');
          result.issues.push({
            type: 'no-connection-pooling',
            severity: 'warning',
            message: 'Database connections should use pooling',
            file: filePath,
            recommendation: 'Use pg.Pool instead of pg.Client for better performance'
          });
        }
      }
      
      // Check for transactions
      if (content.includes('BEGIN') || content.includes('transaction') || 
          content.includes('tx.') || content.includes('trx.')) {
        result.coverage.hasTransactions = true;
      }
      
      // Check for SQL injection vulnerabilities
      this.checkSQLInjection(content, filePath, result);
      
      // Check for hardcoded connection strings
      this.checkHardcodedConnections(content, filePath, result);
      
      // Check for proper error handling
      this.checkErrorHandling(content, filePath, result);
      
      // Check for banned patterns
      this.checkBannedPatterns(content, filePath, result);
      
    } catch (error) {
      this.logger.error(`Failed to validate database file: ${filePath}`, error);
    }
  }

  /**
   * Check for SQL injection vulnerabilities
   */
  private checkSQLInjection(content: string, filePath: string, result: DatabaseValidationResult) {
    // Check for string concatenation in queries
    const vulnerablePatterns = [
      /query\s*\([^)]*\+[^)]*\)/,
      /query\s*\([^)]*\$\{[^}]*\}[^)]*\)/,
      /query\s*\(`[^`]*\$\{[^}]*\}[^`]*`\)/,
      /execute\s*\([^)]*\+[^)]*\)/,
      /raw\s*\([^)]*\+[^)]*\)/
    ];
    
    for (const pattern of vulnerablePatterns) {
      if (pattern.test(content)) {
        result.errors.push('Potential SQL injection vulnerability detected');
        result.issues.push({
          type: 'sql-injection',
          severity: 'error',
          message: 'Unsafe query construction detected',
          file: filePath,
          recommendation: 'Use parameterized queries or query builders'
        });
        break;
      }
    }
  }

  /**
   * Check for hardcoded database connections
   */
  private checkHardcodedConnections(content: string, filePath: string, result: DatabaseValidationResult) {
    // Check for hardcoded connection strings
    const connectionPatterns = [
      /postgres:\/\/[^@]+@[^/]+\/\w+/,
      /mysql:\/\/[^@]+@[^/]+\/\w+/,
      /redis:\/\/[^@]+@[^:]+:\d+/,
      /mongodb:\/\/[^@]+@[^/]+\/\w+/
    ];
    
    for (const pattern of connectionPatterns) {
      const match = content.match(pattern);
      if (match && !content.includes('process.env') && !content.includes('config.')) {
        result.errors.push('Hardcoded database connection string detected');
        result.issues.push({
          type: 'hardcoded-connection',
          severity: 'error',
          message: 'Database connection string is hardcoded',
          file: filePath,
          recommendation: 'Use environment variables for database connections'
        });
        break;
      }
    }
    
    // Check for hardcoded credentials
    if (content.match(/password\s*[:=]\s*['"][^'"]+['"]/) && 
        !content.includes('process.env') && 
        !content.includes('config.')) {
      result.errors.push('Hardcoded database password detected');
      result.issues.push({
        type: 'hardcoded-password',
        severity: 'error',
        message: 'Database password is hardcoded',
        file: filePath,
        recommendation: 'Store database credentials in environment variables'
      });
    }
  }

  /**
   * Check for proper error handling
   */
  private checkErrorHandling(content: string, filePath: string, result: DatabaseValidationResult) {
    // Check if database operations have error handling
    if ((content.includes('.query(') || content.includes('.execute(')) && 
        !content.includes('catch') && !content.includes('try')) {
      result.warnings.push('Database operations without error handling detected');
      result.issues.push({
        type: 'no-error-handling',
        severity: 'warning',
        message: 'Database operations should have proper error handling',
        file: filePath,
        recommendation: 'Wrap database operations in try-catch blocks or use .catch()'
      });
    }
  }

  /**
   * Check for banned database patterns
   */
  private checkBannedPatterns(content: string, filePath: string, result: DatabaseValidationResult) {
    // Check for in-memory databases
    const inMemoryPatterns = [
      /new\s+Map\s*\(\).*\/\/.*database/i,
      /const\s+\w*[Dd]atabase\s*=\s*\{\}/,
      /const\s+\w*[Dd]b\s*=\s*\[\]/,
      /class\s+\w*Mock\w*[Dd]atabase/,
      /sqlite3?\.Database\s*\(['"]:memory:['"]\)/
    ];
    
    for (const pattern of inMemoryPatterns) {
      if (pattern.test(content)) {
        result.errors.push('In-memory database implementation detected');
        result.issues.push({
          type: 'in-memory-database',
          severity: 'error',
          message: 'In-memory database or mock detected',
          file: filePath,
          recommendation: 'Use real PostgreSQL database instead'
        });
        break;
      }
    }
    
    // Check for synchronous database operations
    if (content.includes('Sync(') && (content.includes('database') || content.includes('query'))) {
      result.warnings.push('Synchronous database operations detected');
      result.issues.push({
        type: 'sync-database-ops',
        severity: 'warning',
        message: 'Synchronous database operations can block the event loop',
        file: filePath,
        recommendation: 'Use async/await for all database operations'
      });
    }
  }

  /**
   * Check package.json for database dependencies
   */
  private async checkPackageDependencies(target: string, result: DatabaseValidationResult) {
    try {
      const packagePath = path.join(target, 'package.json');
      const packageContent = await fs.readFile(packagePath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      // Check for PostgreSQL
      if (allDeps.pg || allDeps.postgres || allDeps.postgresql || 
          allDeps.typeorm || allDeps.sequelize || allDeps.knex || allDeps['@prisma/client']) {
        result.coverage.hasPostgreSQL = true;
        
        // Check specific ORM features
        if (allDeps.typeorm || allDeps.sequelize || allDeps['@prisma/client']) {
          result.coverage.hasTransactions = true; // ORMs typically support transactions
        }
      }
      
      // Check for Redis
      if (allDeps.redis || allDeps.ioredis || allDeps['connect-redis']) {
        result.coverage.hasRedis = true;
      }
      
      // Check for banned packages
      const bannedPackages = [
        'sqlite3',
        'better-sqlite3',
        'mongodb-memory-server',
        'mock-knex',
        'pgmock'
      ];
      
      for (const banned of bannedPackages) {
        if (allDeps[banned]) {
          result.errors.push(`Banned package detected: ${banned}`);
          result.issues.push({
            type: 'banned-package',
            severity: 'error',
            message: `Package "${banned}" is not allowed in production`,
            file: 'package.json',
            recommendation: 'Remove mock/in-memory database packages'
          });
        }
      }
      
    } catch (error) {
      this.logger.debug('Could not read package.json', error);
    }
  }

  /**
   * Check for database migrations
   */
  private async checkMigrations(target: string, result: DatabaseValidationResult) {
    const migrationPatterns = [
      '**/migrations/**/*.{js,ts,sql}',
      '**/db/migrations/**/*.{js,ts,sql}',
      '**/database/migrations/**/*.{js,ts,sql}',
      '**/prisma/migrations/**',
      '**/knex/migrations/**/*.{js,ts}'
    ];
    
    let migrationFiles: string[] = [];
    
    for (const pattern of migrationPatterns) {
      const matches = await glob(pattern, {
        cwd: target,
        absolute: true,
        ignore: ['**/node_modules/**']
      });
      migrationFiles = migrationFiles.concat(matches);
    }
    
    if (migrationFiles.length > 0) {
      result.coverage.hasMigrations = true;
      
      // Check migration quality
      for (const file of migrationFiles) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          
          // Check for down/rollback migrations
          if (!content.includes('down') && !content.includes('rollback') && 
              !content.includes('revert')) {
            result.warnings.push('Migration without rollback detected');
            result.issues.push({
              type: 'no-rollback',
              severity: 'warning',
              message: 'Migration should include rollback logic',
              file,
              recommendation: 'Always implement down/rollback methods in migrations'
            });
          }
        } catch (error) {
          // Skip if can't read file
        }
      }
    }
  }

  /**
   * Check coverage requirements
   */
  private checkCoverageRequirements(result: DatabaseValidationResult) {
    const { coverage } = result;
    
    if (this.options.requirePostgreSQL && !coverage.hasPostgreSQL) {
      result.errors.push('PostgreSQL implementation required but not found');
      result.issues.push({
        type: 'missing-postgresql',
        severity: 'error',
        message: 'PostgreSQL database is required',
        file: 'project',
        recommendation: 'Implement PostgreSQL as the primary database'
      });
    }
    
    if (this.options.requireRedis && !coverage.hasRedis) {
      result.warnings.push('Redis implementation recommended but not found');
      result.issues.push({
        type: 'missing-redis',
        severity: 'warning',
        message: 'Redis is recommended for caching and sessions',
        file: 'project',
        recommendation: 'Add Redis for improved performance'
      });
    }
    
    if (this.options.requireMigrations && !coverage.hasMigrations) {
      result.errors.push('Database migrations required but not found');
      result.issues.push({
        type: 'missing-migrations',
        severity: 'error',
        message: 'Database migrations are required',
        file: 'project',
        recommendation: 'Implement database migrations for schema versioning'
      });
    }
    
    if (this.options.requireConnectionPooling && coverage.hasPostgreSQL && !coverage.hasConnectionPooling) {
      result.warnings.push('Connection pooling recommended but not found');
      result.issues.push({
        type: 'missing-pooling',
        severity: 'warning',
        message: 'Database connection pooling is recommended',
        file: 'project',
        recommendation: 'Use connection pooling for better performance'
      });
    }
    
    if (this.options.requireSSL && !coverage.hasSSL) {
      result.warnings.push('SSL/TLS encryption for database connections not configured');
      result.issues.push({
        type: 'missing-ssl',
        severity: 'warning',
        message: 'Database connections should use SSL/TLS',
        file: 'project',
        recommendation: 'Enable SSL for database connections in production'
      });
    }
    
    if (this.options.requireTransactions && !coverage.hasTransactions) {
      result.warnings.push('Database transactions not implemented');
      result.issues.push({
        type: 'missing-transactions',
        severity: 'warning',
        message: 'Database transactions ensure data integrity',
        file: 'project',
        recommendation: 'Use transactions for multi-step operations'
      });
    }
  }
}