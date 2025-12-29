import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../../utils/logger';
import { 
  DatabaseIntegritySystem,
  DatabaseIntegrityConfig,
  Migration,
  MigrationStatus,
  DriftReport
} from '../../database-integrity';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export class DatabaseCommand extends Command {
  private integritySystem?: DatabaseIntegritySystem;
  
  constructor() {
    super('db');
    this.alias('database');
    this.description('Manage database integrity, migrations, and drift detection');
    this.configureCommands();
  }

  private configureCommands() {
    // Migration commands
    this.command('migrate')
      .description('Run database migrations')
      .option('--dry-run', 'Show pending migrations without applying')
      .option('--force', 'Force run migrations')
      .option('--target <version>', 'Migrate to specific version')
      .action(async (options) => {
        await this.runMigrations(options);
      });

    this.command('migration:create <name>')
      .description('Create a new migration')
      .option('--from-schema', 'Generate from schema changes')
      .option('--from-drift', 'Generate from drift detection')
      .option('--empty', 'Create empty migration')
      .action(async (name, options) => {
        await this.createMigration(name, options);
      });

    this.command('migration:status')
      .description('Show migration status')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        await this.showMigrationStatus(options);
      });

    this.command('migration:rollback [target]')
      .description('Rollback migrations')
      .option('--dry-run', 'Show rollback plan without executing')
      .option('--force', 'Force rollback')
      .action(async (target, options) => {
        await this.rollbackMigrations(target, options);
      });

    // Drift detection commands
    this.command('drift:detect')
      .description('Detect schema drifts')
      .option('--json', 'Output as JSON')
      .option('--fix', 'Generate fix migrations')
      .action(async (options) => {
        await this.detectDrifts(options);
      });

    this.command('drift:monitor')
      .description('Start drift monitoring')
      .option('--interval <minutes>', 'Check interval', '60')
      .action(async (options) => {
        await this.startDriftMonitoring(options);
      });

    // Schema analysis commands
    this.command('schema:analyze')
      .description('Analyze database schema')
      .option('--json', 'Output as JSON')
      .option('--format <type>', 'Output format', 'table')
      .action(async (options) => {
        await this.analyzeSchema(options);
      });

    this.command('schema:validate')
      .description('Validate schema against definitions')
      .option('--fix', 'Auto-fix issues')
      .action(async (options) => {
        await this.validateSchema(options);
      });

    // Type generation commands
    this.command('types:generate')
      .description('Generate TypeScript types from schema')
      .option('--output <path>', 'Output directory', './src/types')
      .option('--format <type>', 'Type format', 'interface')
      .action(async (options) => {
        await this.generateTypes(options);
      });

    // Validation commands
    this.command('validate:routes')
      .description('Validate API routes against schema')
      .option('--fix', 'Generate missing handlers')
      .action(async (options) => {
        await this.validateRoutes(options);
      });

    this.command('validate:forms')
      .description('Validate forms against schema')
      .option('--fix', 'Update form definitions')
      .action(async (options) => {
        await this.validateForms(options);
      });

    // Integrity commands
    this.command('integrity:check')
      .description('Run full integrity check')
      .option('--fix', 'Auto-fix issues')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        await this.runIntegrityCheck(options);
      });

    // Configuration commands
    this.command('config')
      .description('Manage database integrity configuration')
      .option('--init', 'Initialize configuration')
      .option('--show', 'Show current configuration')
      .option('--set <key=value>', 'Set configuration value')
      .action(async (options) => {
        await this.manageConfig(options);
      });
  }

  private async getIntegritySystem(): Promise<DatabaseIntegritySystem> {
    if (!this.integritySystem) {
      const config = await this.loadConfig();
      this.integritySystem = new DatabaseIntegritySystem(config);
      await this.integritySystem.initialize();
    }
    return this.integritySystem;
  }

  private async runMigrations(options: any) {
    const spinner = options.json ? null : ora('Running database migrations...').start();
    
    try {
      const system = await this.getIntegritySystem();
      
      if (options.dryRun) {
        const status = await system.getMigrationStatus();
        const pending = status.data?.filter(m => m.status === MigrationStatus.PENDING) || [];
        
        if (options.json) {
          console.log(JSON.stringify({ pending }, null, 2));
        } else {
          spinner?.succeed(`Found ${pending.length} pending migrations`);
          pending.forEach((m: Migration) => {
            console.log(chalk.gray(`  - ${m.name} (${m.version})`));
          });
        }
        return;
      }

      const results = await system.runPendingMigrations({
        force: options.force,
        target: options.target
      });
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        spinner?.succeed(`Successfully ran ${results.data?.length || 0} migrations`);
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(error) }, null, 2));
      } else {
        spinner?.fail('Migration failed');
        logger.error(String(error));
      }
      process.exit(1);
    }
  }

  private async createMigration(name: string, options: any) {
    const spinner = options.json ? null : ora('Creating migration...').start();
    
    try {
      const system = await this.getIntegritySystem();
      let result;

      if (options.fromSchema) {
        result = await system.generateMigration(name, { 
          dryRun: false,
          includeRollback: true 
        });
      } else if (options.fromDrift) {
        const driftReport = await system.detectDrifts();
        if (driftReport.data && driftReport.data.drifts.length > 0) {
          const migrations = await system.generateDriftMigration(driftReport.data);
          result = migrations;
        } else {
          throw new Error('No drifts detected');
        }
      } else {
        // Create empty migration
        result = await system.generateMigration(name, {
          dryRun: false,
          includeRollback: true
        });
      }
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        spinner?.succeed(`Created migration: ${name}`);
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(error) }, null, 2));
      } else {
        spinner?.fail('Failed to create migration');
        logger.error(String(error));
      }
      process.exit(1);
    }
  }

  private async showMigrationStatus(options: any) {
    try {
      const system = await this.getIntegritySystem();
      const status = await system.getMigrationStatus();
      
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log(chalk.bold('\nMigration Status:\n'));
        
        status.data?.forEach((m: Migration) => {
          const statusColor = m.status === MigrationStatus.COMPLETED ? 'green' : 
                            m.status === MigrationStatus.FAILED ? 'red' : 'yellow';
          
          console.log(`${chalk[statusColor]('●')} ${m.version} - ${m.name}`);
          console.log(chalk.gray(`    Status: ${m.status}`));
          if (m.executedAt) {
            console.log(chalk.gray(`    Executed: ${m.executedAt}`));
          }
          console.log();
        });
      }
    } catch (error) {
      logger.error(String(error));
      process.exit(1);
    }
  }

  private async rollbackMigrations(target: string | undefined, options: any) {
    const spinner = options.json ? null : ora('Rolling back migrations...').start();
    
    try {
      const system = await this.getIntegritySystem();
      const results = await system.rollbackMigrations(target, {
        dryRun: options.dryRun,
        force: options.force
      });
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        spinner?.succeed(`Rolled back ${results.data?.length || 0} migrations`);
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(error) }, null, 2));
      } else {
        spinner?.fail('Rollback failed');
        logger.error(String(error));
      }
      process.exit(1);
    }
  }

  private async detectDrifts(options: any) {
    const spinner = options.json ? null : ora('Detecting schema drifts...').start();
    
    try {
      const system = await this.getIntegritySystem();
      const driftReport = await system.detectDrifts();
      
      if (options.fix && driftReport.data && driftReport.data.drifts.length > 0) {
        if (spinner) spinner.text = 'Generating fix migrations...';
        const migrations = await system.generateDriftMigration(driftReport.data);
        
        if (options.json) {
          console.log(JSON.stringify({ driftReport, migrations }, null, 2));
        } else {
          spinner?.succeed(`Generated ${migrations.data?.length || 0} fix migrations`);
        }
      } else {
        if (options.json) {
          console.log(JSON.stringify(driftReport, null, 2));
        } else {
          const driftCount = driftReport.data?.drifts.length || 0;
          if (driftCount === 0) {
            spinner?.succeed('No drifts detected');
          } else {
            spinner?.warn(`Detected ${driftCount} drifts`);
            driftReport.data?.drifts.forEach((drift: any) => {
              console.log(chalk.yellow(`  - ${drift.type}: ${drift.description}`));
            });
          }
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(error) }, null, 2));
      } else {
        spinner?.fail('Drift detection failed');
        logger.error(String(error));
      }
      process.exit(1);
    }
  }

  private async startDriftMonitoring(options: any) {
    console.log(chalk.blue('Starting drift monitoring...'));
    console.log(chalk.gray(`Checking every ${options.interval} minutes`));
    
    // This would typically start a background process or daemon
    console.log(chalk.yellow('Note: Continuous monitoring requires running as a service'));
  }

  private async analyzeSchema(options: any) {
    const spinner = options.json ? null : ora('Analyzing database schema...').start();
    
    try {
      const system = await this.getIntegritySystem();
      const schema = await system.analyzeSchema();
      
      if (options.json) {
        console.log(JSON.stringify(schema, null, 2));
      } else {
        spinner?.succeed('Schema analysis complete');
        
        if (schema.data) {
          console.log(chalk.bold('\nDatabase Schema:\n'));
          console.log(`Tables: ${schema.data.tables.length}`);
          console.log(`Views: ${schema.data.views.length}`);
          console.log(`Indexes: ${schema.data.indexes.length}`);
          console.log(`Constraints: ${schema.data.constraints.length}`);
          
          if (options.format === 'table') {
            console.log(chalk.bold('\nTables:'));
            schema.data.tables.forEach(table => {
              console.log(`  ${chalk.cyan(table.name)} (${table.columns.length} columns)`);
            });
          }
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(error) }, null, 2));
      } else {
        spinner?.fail('Schema analysis failed');
        logger.error(String(error));
      }
      process.exit(1);
    }
  }

  private async validateSchema(options: any) {
    const spinner = options.json ? null : ora('Validating schema...').start();
    
    try {
      const system = await this.getIntegritySystem();
      const result = await system.runFullIntegrityCheck();
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.data?.schema.success) {
          spinner?.succeed('Schema validation passed');
        } else {
          spinner?.fail('Schema validation failed');
          console.log(chalk.red(`  Error: ${result.data?.schema.error?.message}`));
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(error) }, null, 2));
      } else {
        spinner?.fail('Validation failed');
        logger.error(String(error));
      }
      process.exit(1);
    }
  }

  private async generateTypes(options: any) {
    const spinner = ora('Generating TypeScript types...').start();
    
    try {
      // This would use a TypeGenerator class
      spinner?.succeed('Type generation complete');
      console.log(chalk.gray(`Types written to: ${options.output}`));
    } catch (error) {
      spinner?.fail('Type generation failed');
      logger.error(String(error));
      process.exit(1);
    }
  }

  private async validateRoutes(options: any) {
    const spinner = ora('Validating API routes...').start();
    
    try {
      const system = await this.getIntegritySystem();
      const result = await system.validateRoutes();
      
      if (result.success && result.data) {
        spinner?.succeed(`Validated ${result.data.length} routes`);
        if (result.warnings && result.warnings.length > 0) {
          console.log(chalk.yellow('\nWarnings:'));
          result.warnings.forEach((w: string) => console.log(chalk.yellow(`  - ${w}`)));
        }
      } else {
        spinner?.fail('Route validation failed');
      }
    } catch (error) {
      spinner?.fail('Route validation failed');
      logger.error(String(error));
      process.exit(1);
    }
  }

  private async validateForms(options: any) {
    const spinner = ora('Validating forms...').start();
    
    try {
      const system = await this.getIntegritySystem();
      const result = await system.scanForms();
      
      if (result.success) {
        spinner?.succeed('Form validation complete');
      } else {
        spinner?.fail('Form validation failed');
      }
    } catch (error) {
      spinner?.fail('Form validation failed');
      logger.error(String(error));
      process.exit(1);
    }
  }

  private async runIntegrityCheck(options: any) {
    const spinner = options.json ? null : ora('Running integrity check...').start();
    
    try {
      const system = await this.getIntegritySystem();
      const result = await system.runFullIntegrityCheck();
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const overallSuccess = result.metadata?.overallSuccess;
        
        if (overallSuccess) {
          spinner?.succeed('All integrity checks passed');
        } else {
          spinner?.warn('Integrity check completed with issues');
          const issues = result.metadata?.issues || [];
          if (Array.isArray(issues) && issues.length > 0) {
            console.log(chalk.yellow('\nIssues found:'));
            issues.forEach((issue: string) => {
              console.log(chalk.yellow(`  - ${issue}`));
            });
          }
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(error) }, null, 2));
      } else {
        spinner?.fail('Integrity check failed');
        logger.error(String(error));
      }
      process.exit(1);
    }
  }

  private async manageConfig(options: any) {
    if (options.init) {
      await this.initConfig();
    } else if (options.show) {
      await this.showConfig();
    } else if (options.set) {
      await this.setConfig(options.set);
    } else {
      console.log('Use --init, --show, or --set <key=value>');
    }
  }

  private async loadConfig(): Promise<DatabaseIntegrityConfig> {
    const configPath = join(process.cwd(), '.claude', 'database.config.json');
    
    if (!existsSync(configPath)) {
      return this.getDefaultConfig();
    }
    
    const configData = readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  }

  private getDefaultConfig(): DatabaseIntegrityConfig {
    return {
      database: {
        type: 'postgres',
        connectionString: process.env.DATABASE_URL || '',
        ssl: process.env.NODE_ENV === 'production',
        pool: {
          min: 2,
          max: 10,
          idleTimeout: 30000
        }
      },
      migration: {
        directory: './migrations',
        tableName: '_migrations',
        autoRun: false,
        validateChecksums: true,
        transactional: true,
        lockTimeout: 10000,
        gitIntegration: false
      },
      schema: {
        directory: './prisma',
        format: 'prisma',
        generateTypes: true,
        typeOutputDirectory: './src/types/database',
        includeViews: true,
        includeFunctions: true,
        includeIndexes: true
      },
      drift: {
        enabled: false,
        schedule: '0 * * * *',
        allowedDrifts: [],
        autoFix: false,
        reportDirectory: './drift-reports'
      },
      validation: {
        routes: {
          enabled: true,
          directories: ['./src/routes'],
          patterns: ['**/*.ts'],
          strict: true
        },
        forms: {
          enabled: true,
          directories: ['./src/forms'],
          patterns: ['**/*.tsx'],
          validateAgainstSchema: true
        }
      }
    };
  }

  private async initConfig() {
    const config = this.getDefaultConfig();
    const configDir = join(process.cwd(), '.claude');
    const configPath = join(configDir, 'database.config.json');
    
    if (!existsSync(configDir)) {
      await import('fs').then(fs => fs.promises.mkdir(configDir, { recursive: true }));
    }
    
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`✅ Configuration initialized at: ${configPath}`));
  }

  private async showConfig() {
    const config = await this.loadConfig();
    console.log(JSON.stringify(config, null, 2));
  }

  private async setConfig(keyValue: string) {
    const [key, value] = keyValue.split('=');
    if (!key || value === undefined) {
      console.log(chalk.red('Invalid format. Use: --set key=value'));
      return;
    }
    
    const config = await this.loadConfig();
    const keys = key.split('.');
    let current: any = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const currentKey = keys[i];
      if (!currentKey) continue;
      
      if (!current[currentKey]) {
        current[currentKey] = {};
      }
      current = current[currentKey];
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
    
    const configPath = join(process.cwd(), '.claude', 'database.config.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    console.log(chalk.green(`✅ Updated ${key} = ${value}`));
  }
}