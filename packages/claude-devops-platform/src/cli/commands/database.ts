import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../../utils/logger';
import { DatabaseIntegrityManager } from '../../core/database/database-integrity';
import { MigrationManager } from '../../core/database/migration-manager';
import { DriftDetector } from '../../core/database/drift-detector';
import { SchemaAnalyzer } from '../../core/database/schema-analyzer';
import { TypeGenerator } from '../../core/database/type-generator';
import { ValidationEngine } from '../../core/database/validation-engine';
import { DriftMonitor } from '../../core/database/drift-monitor';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export class DatabaseCommand extends Command {
  constructor() {
    super('db');
    this.alias('database');
    this.description('Manage database integrity, migrations, and drift detection');

    // Migration commands
    const migrateCmd = new Command('migrate')
      .description('Run pending database migrations')
      .option('--dry-run', 'Show what would be migrated without applying changes')
      .option('--json', 'Output in JSON format')
      .option('--force', 'Force migration even with warnings')
      .action(async (options) => {
        await this.runMigrations(options);
      });

    migrateCmd
      .command('create <name>')
      .description('Create a new migration file')
      .option('--sql', 'Generate SQL migration instead of TypeScript')
      .option('--template <template>', 'Use a specific template (table, index, constraint)')
      .action(async (name, options) => {
        await this.createMigration(name, options);
      });

    migrateCmd
      .command('status')
      .description('Show migration status and history')
      .option('--json', 'Output in JSON format')
      .option('--verbose', 'Show detailed migration information')
      .action(async (options) => {
        await this.showMigrationStatus(options);
      });

    migrateCmd
      .command('rollback [steps]')
      .description('Rollback database migrations')
      .option('--dry-run', 'Show what would be rolled back without applying changes')
      .option('--json', 'Output in JSON format')
      .action(async (steps = '1', options) => {
        await this.rollbackMigrations(parseInt(steps), options);
      });

    this.addCommand(migrateCmd);

    // Drift commands
    const driftCmd = new Command('drift')
      .description('Detect and fix database schema drift');

    driftCmd
      .command('check')
      .description('Check for database schema drift')
      .option('--json', 'Output in JSON format')
      .option('--detailed', 'Show detailed drift analysis')
      .option('--schema <schema>', 'Check specific schema only')
      .action(async (options) => {
        await this.checkDrift(options);
      });

    driftCmd
      .command('fix')
      .description('Generate migrations to fix detected drift')
      .option('--dry-run', 'Show what would be fixed without creating migrations')
      .option('--json', 'Output in JSON format')
      .option('--auto-approve', 'Auto-approve generated migrations')
      .action(async (options) => {
        await this.fixDrift(options);
      });

    this.addCommand(driftCmd);

    // Schema commands
    const schemaCmd = new Command('schema')
      .description('Analyze and manage database schema');

    schemaCmd
      .command('analyze')
      .description('Analyze current database schema')
      .option('--json', 'Output in JSON format')
      .option('--performance', 'Include performance analysis')
      .option('--suggestions', 'Include optimization suggestions')
      .action(async (options) => {
        await this.analyzeSchema(options);
      });

    schemaCmd
      .command('types')
      .description('Generate TypeScript types from database schema')
      .option('--output <path>', 'Output file path', './src/types/database.ts')
      .option('--json', 'Output in JSON format')
      .option('--enums', 'Generate enums for constraint values')
      .option('--interfaces', 'Generate interfaces instead of types')
      .action(async (options) => {
        await this.generateTypes(options);
      });

    this.addCommand(schemaCmd);

    // Validation commands
    const validateCmd = new Command('validate')
      .description('Validate database consistency with application code');

    validateCmd
      .command('routes')
      .description('Validate API routes against database schema')
      .option('--json', 'Output in JSON format')
      .option('--fix', 'Attempt to fix validation errors')
      .option('--strict', 'Enable strict validation mode')
      .action(async (options) => {
        await this.validateRoutes(options);
      });

    validateCmd
      .command('forms')
      .description('Validate frontend forms against database constraints')
      .option('--json', 'Output in JSON format')
      .option('--fix', 'Generate form validation rules')
      .option('--framework <framework>', 'Target framework (react, vue, angular)', 'react')
      .action(async (options) => {
        await this.validateForms(options);
      });

    this.addCommand(validateCmd);

    // Monitor command
    this
      .command('monitor')
      .description('Start real-time database drift monitoring')
      .option('--interval <seconds>', 'Check interval in seconds', '60')
      .option('--webhook <url>', 'Webhook URL for drift notifications')
      .option('--json', 'Output in JSON format')
      .option('--daemon', 'Run as daemon process')
      .action(async (options) => {
        await this.startMonitoring(options);
      });

    // Config command
    this
      .command('config')
      .description('Generate or update database integrity configuration')
      .option('--init', 'Initialize new configuration')
      .option('--update', 'Update existing configuration')
      .option('--validate', 'Validate configuration file')
      .action(async (options) => {
        await this.manageConfig(options);
      });
  }

  private async runMigrations(options: any) {
    const spinner = options.json ? null : ora('Running database migrations...').start();
    
    try {
      const config = await this.loadConfig();
      const migrationManager = new MigrationManager(config.database);
      
      if (options.dryRun) {
        const pending = await migrationManager.getPendingMigrations();
        
        if (options.json) {
          console.log(JSON.stringify({ pending }, null, 2));
        } else {
          spinner?.succeed(`Found ${pending.length} pending migrations`);
          pending.forEach(m => {
            console.log(chalk.gray(`  - ${m.name} (${m.version})`));
          });
        }
        return;
      }

      const results = await migrationManager.runMigrations({ force: options.force });
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        spinner?.succeed(`Successfully ran ${results.applied.length} migrations`);
        
        if (results.warnings.length > 0) {
          console.log(chalk.yellow('\nWarnings:'));
          results.warnings.forEach(w => console.log(chalk.yellow(`  - ${w}`)));
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Migration failed');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async createMigration(name: string, options: any) {
    const spinner = ora(`Creating migration: ${name}...`).start();
    
    try {
      const config = await this.loadConfig();
      const migrationManager = new MigrationManager(config.database);
      
      const migration = await migrationManager.createMigration(name, {
        sql: options.sql,
        template: options.template,
      });
      
      spinner.succeed(`Created migration: ${migration.filename}`);
      console.log(chalk.gray(`Location: ${migration.path}`));
      
      if (!options.sql) {
        console.log(chalk.blue('\nNext steps:'));
        console.log(chalk.gray('  1. Edit the migration file'));
        console.log(chalk.gray('  2. Run: claude-platform db migrate'));
      }
    } catch (error) {
      spinner.fail('Failed to create migration');
      logger.error(error.message);
      process.exit(1);
    }
  }

  private async showMigrationStatus(options: any) {
    const spinner = options.json ? null : ora('Checking migration status...').start();
    
    try {
      const config = await this.loadConfig();
      const migrationManager = new MigrationManager(config.database);
      
      const status = await migrationManager.getMigrationStatus();
      
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        spinner?.succeed('Migration status retrieved');
        
        console.log(chalk.bold('\nApplied Migrations:'));
        status.applied.forEach(m => {
          console.log(chalk.green(`  ✓ ${m.name} (${m.appliedAt})`));
        });
        
        if (status.pending.length > 0) {
          console.log(chalk.bold('\nPending Migrations:'));
          status.pending.forEach(m => {
            console.log(chalk.yellow(`  ○ ${m.name}`));
          });
        }
        
        console.log(chalk.gray(`\nTotal: ${status.applied.length} applied, ${status.pending.length} pending`));
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Failed to get migration status');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async rollbackMigrations(steps: number, options: any) {
    const spinner = options.json ? null : ora(`Rolling back ${steps} migration(s)...`).start();
    
    try {
      const config = await this.loadConfig();
      const migrationManager = new MigrationManager(config.database);
      
      if (options.dryRun) {
        const toRollback = await migrationManager.getMigrationsToRollback(steps);
        
        if (options.json) {
          console.log(JSON.stringify({ toRollback }, null, 2));
        } else {
          spinner?.succeed(`Would rollback ${toRollback.length} migrations`);
          toRollback.forEach(m => {
            console.log(chalk.gray(`  - ${m.name} (${m.version})`));
          });
        }
        return;
      }

      const results = await migrationManager.rollbackMigrations(steps);
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        spinner?.succeed(`Successfully rolled back ${results.rolledBack.length} migrations`);
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Rollback failed');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async checkDrift(options: any) {
    const spinner = options.json ? null : ora('Checking for schema drift...').start();
    
    try {
      const config = await this.loadConfig();
      const driftDetector = new DriftDetector(config.database);
      
      const drift = await driftDetector.detectDrift({
        schema: options.schema,
        detailed: options.detailed,
      });
      
      if (options.json) {
        console.log(JSON.stringify(drift, null, 2));
      } else {
        spinner?.succeed('Drift detection complete');
        
        if (drift.hasDrift) {
          console.log(chalk.red('\n⚠️  Schema drift detected!\n'));
          
          if (drift.tables.added.length > 0) {
            console.log(chalk.yellow('Added Tables:'));
            drift.tables.added.forEach(t => console.log(chalk.gray(`  + ${t}`)));
          }
          
          if (drift.tables.removed.length > 0) {
            console.log(chalk.yellow('Removed Tables:'));
            drift.tables.removed.forEach(t => console.log(chalk.gray(`  - ${t}`)));
          }
          
          if (drift.tables.modified.length > 0) {
            console.log(chalk.yellow('Modified Tables:'));
            drift.tables.modified.forEach(t => console.log(chalk.gray(`  ~ ${t.name}`)));
          }
          
          console.log(chalk.blue('\nRun "claude-platform db drift:fix" to generate fix migrations'));
        } else {
          console.log(chalk.green('\n✓ No schema drift detected'));
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Drift detection failed');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async fixDrift(options: any) {
    const spinner = options.json ? null : ora('Generating drift fix migrations...').start();
    
    try {
      const config = await this.loadConfig();
      const driftDetector = new DriftDetector(config.database);
      
      const migrations = await driftDetector.generateFixMigrations({
        dryRun: options.dryRun,
        autoApprove: options.autoApprove,
      });
      
      if (options.json) {
        console.log(JSON.stringify(migrations, null, 2));
      } else {
        spinner?.succeed(`Generated ${migrations.length} fix migrations`);
        
        migrations.forEach(m => {
          console.log(chalk.gray(`  - ${m.name}: ${m.description}`));
        });
        
        if (!options.dryRun) {
          console.log(chalk.blue('\nRun "claude-platform db migrate" to apply fixes'));
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Failed to generate fix migrations');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async analyzeSchema(options: any) {
    const spinner = options.json ? null : ora('Analyzing database schema...').start();
    
    try {
      const config = await this.loadConfig();
      const analyzer = new SchemaAnalyzer(config.database);
      
      const analysis = await analyzer.analyze({
        includePerformance: options.performance,
        includeSuggestions: options.suggestions,
      });
      
      if (options.json) {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        spinner?.succeed('Schema analysis complete');
        
        console.log(chalk.bold('\nDatabase Schema Summary:'));
        console.log(chalk.gray(`  Tables: ${analysis.tableCount}`));
        console.log(chalk.gray(`  Columns: ${analysis.columnCount}`));
        console.log(chalk.gray(`  Indexes: ${analysis.indexCount}`));
        console.log(chalk.gray(`  Constraints: ${analysis.constraintCount}`));
        
        if (options.performance && analysis.performanceIssues.length > 0) {
          console.log(chalk.yellow('\nPerformance Issues:'));
          analysis.performanceIssues.forEach(issue => {
            console.log(chalk.yellow(`  ⚠️  ${issue.description}`));
            console.log(chalk.gray(`     Table: ${issue.table}`));
            console.log(chalk.gray(`     Severity: ${issue.severity}`));
          });
        }
        
        if (options.suggestions && analysis.suggestions.length > 0) {
          console.log(chalk.blue('\nOptimization Suggestions:'));
          analysis.suggestions.forEach(s => {
            console.log(chalk.blue(`  💡 ${s.description}`));
            console.log(chalk.gray(`     Impact: ${s.impact}`));
          });
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Schema analysis failed');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async generateTypes(options: any) {
    const spinner = options.json ? null : ora('Generating TypeScript types...').start();
    
    try {
      const config = await this.loadConfig();
      const generator = new TypeGenerator(config.database);
      
      const types = await generator.generate({
        enums: options.enums,
        interfaces: options.interfaces,
      });
      
      if (options.json) {
        console.log(JSON.stringify({ types, outputPath: options.output }, null, 2));
      } else {
        writeFileSync(options.output, types);
        spinner?.succeed(`Generated types at ${options.output}`);
        
        console.log(chalk.gray('\nGenerated:'));
        console.log(chalk.gray(`  - ${types.split('export').length - 1} type definitions`));
        if (options.enums) {
          console.log(chalk.gray(`  - Enum types for constraints`));
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Type generation failed');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async validateRoutes(options: any) {
    const spinner = options.json ? null : ora('Validating API routes...').start();
    
    try {
      const config = await this.loadConfig();
      const validator = new ValidationEngine(config.database);
      
      const results = await validator.validateRoutes({
        fix: options.fix,
        strict: options.strict,
      });
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        spinner?.succeed('Route validation complete');
        
        const errorCount = results.errors.length;
        const warningCount = results.warnings.length;
        
        if (errorCount === 0 && warningCount === 0) {
          console.log(chalk.green('\n✓ All routes are valid'));
        } else {
          if (errorCount > 0) {
            console.log(chalk.red(`\n❌ Found ${errorCount} errors:`));
            results.errors.forEach(e => {
              console.log(chalk.red(`  - ${e.route}: ${e.message}`));
            });
          }
          
          if (warningCount > 0) {
            console.log(chalk.yellow(`\n⚠️  Found ${warningCount} warnings:`));
            results.warnings.forEach(w => {
              console.log(chalk.yellow(`  - ${w.route}: ${w.message}`));
            });
          }
          
          if (options.fix && results.fixed.length > 0) {
            console.log(chalk.blue(`\n✅ Fixed ${results.fixed.length} issues`));
          }
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Route validation failed');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async validateForms(options: any) {
    const spinner = options.json ? null : ora('Validating frontend forms...').start();
    
    try {
      const config = await this.loadConfig();
      const validator = new ValidationEngine(config.database);
      
      const results = await validator.validateForms({
        fix: options.fix,
        framework: options.framework,
      });
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        spinner?.succeed('Form validation complete');
        
        const issueCount = results.issues.length;
        
        if (issueCount === 0) {
          console.log(chalk.green('\n✓ All forms match database constraints'));
        } else {
          console.log(chalk.yellow(`\n⚠️  Found ${issueCount} form validation issues:`));
          results.issues.forEach(issue => {
            console.log(chalk.yellow(`  - ${issue.form}: ${issue.field}`));
            console.log(chalk.gray(`    ${issue.message}`));
          });
          
          if (options.fix) {
            console.log(chalk.blue(`\n✅ Generated validation rules at: ${results.rulesPath}`));
          }
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        spinner?.fail('Form validation failed');
        logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async startMonitoring(options: any) {
    if (!options.daemon && !options.json) {
      console.log(chalk.bold('Starting database drift monitoring...\n'));
    }
    
    try {
      const config = await this.loadConfig();
      const monitor = new DriftMonitor(config.database);
      
      monitor.on('drift-detected', (drift) => {
        if (options.json) {
          console.log(JSON.stringify({ type: 'drift', timestamp: new Date(), drift }, null, 2));
        } else {
          console.log(chalk.red(`\n[${new Date().toISOString()}] Drift detected!`));
          console.log(chalk.gray(JSON.stringify(drift, null, 2)));
        }
        
        if (options.webhook) {
          // Send webhook notification
          fetch(options.webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'drift', drift, timestamp: new Date() }),
          }).catch(err => logger.error('Webhook failed:', err));
        }
      });
      
      monitor.on('check-complete', (result) => {
        if (options.json) {
          console.log(JSON.stringify({ type: 'check', timestamp: new Date(), result }, null, 2));
        } else if (!options.daemon) {
          process.stdout.write(chalk.gray('.'));
        }
      });
      
      await monitor.start({
        interval: parseInt(options.interval) * 1000,
        daemon: options.daemon,
      });
      
      if (!options.daemon) {
        console.log(chalk.gray(`Monitoring every ${options.interval} seconds. Press Ctrl+C to stop.`));
      }
      
      // Keep process alive
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\nStopping monitor...'));
        await monitor.stop();
        process.exit(0);
      });
      
    } catch (error) {
      logger.error('Monitoring failed:', error.message);
      process.exit(1);
    }
  }

  private async manageConfig(options: any) {
    const configPath = join(process.cwd(), 'database-integrity.config.js');
    
    if (options.init) {
      if (existsSync(configPath)) {
        logger.error('Configuration already exists. Use --update to modify.');
        process.exit(1);
      }
      
      const template = `module.exports = {
  database: {
    // Database connection configuration
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'myapp',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production',
    },
    
    // Migration settings
    migrations: {
      directory: './migrations',
      tableName: 'migrations',
      extension: '.ts',
      template: null,
    },
    
    // Drift detection settings
    drift: {
      ignoreTables: ['migrations', 'sessions'],
      ignoreColumns: ['created_at', 'updated_at'],
      checkInterval: 3600000, // 1 hour
      autoFix: false,
    },
    
    // Schema analysis settings
    schema: {
      performanceThresholds: {
        missingIndexRowCount: 10000,
        tableSize: 1000000,
      },
      namingConventions: {
        table: 'snake_case',
        column: 'snake_case',
        constraint: 'snake_case',
      },
    },
    
    // Validation settings
    validation: {
      routes: {
        directories: ['./src/api', './src/routes'],
        frameworks: ['express', 'fastify', 'koa'],
      },
      forms: {
        directories: ['./src/components', './src/pages'],
        frameworks: ['react', 'vue', 'angular'],
      },
    },
    
    // Monitoring settings
    monitoring: {
      enabled: process.env.NODE_ENV === 'production',
      webhooks: [],
      slackChannel: process.env.SLACK_DRIFT_CHANNEL,
      emailAlerts: process.env.DRIFT_ALERT_EMAIL,
    },
  },
  
  // Environment-specific overrides
  environments: {
    development: {
      database: {
        connection: {
          database: 'myapp_dev',
        },
      },
    },
    test: {
      database: {
        connection: {
          database: 'myapp_test',
        },
      },
    },
    production: {
      database: {
        connection: {
          ssl: { rejectUnauthorized: false },
        },
        drift: {
          autoFix: false,
          checkInterval: 300000, // 5 minutes
        },
      },
    },
  },
};`;
      
      writeFileSync(configPath, template);
      logger.success('Created database-integrity.config.js');
      console.log(chalk.gray('Edit this file to configure your database settings.'));
      
    } else if (options.update) {
      // Interactive config update (future feature)
      logger.info('Interactive configuration update coming soon!');
      
    } else if (options.validate) {
      if (!existsSync(configPath)) {
        logger.error('Configuration file not found. Run --init to create one.');
        process.exit(1);
      }
      
      try {
        const config = require(configPath);
        // Basic validation
        if (!config.database || !config.database.connection) {
          throw new Error('Missing database connection configuration');
        }
        logger.success('Configuration is valid');
      } catch (error) {
        logger.error('Configuration validation failed:', error.message);
        process.exit(1);
      }
    } else {
      this.outputHelp();
    }
  }

  private async loadConfig() {
    const configPath = join(process.cwd(), 'database-integrity.config.js');
    
    if (!existsSync(configPath)) {
      throw new Error('Configuration not found. Run "claude-platform db config --init" to create one.');
    }
    
    const config = require(configPath);
    const env = process.env.NODE_ENV || 'development';
    
    // Merge environment-specific config
    if (config.environments && config.environments[env]) {
      return this.deepMerge(config, { database: config.environments[env].database });
    }
    
    return config;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}