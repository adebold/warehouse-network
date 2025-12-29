#!/usr/bin/env node

/**
 * Database Integrity CLI for Warehouse Network
 * Provides commands for migration management, drift detection, schema validation, and memory bank logging
 */

const { program } = require('commander');
const { DatabaseIntegritySystem } = require('../../../packages/core/src/database-integrity');
const { MemoryHelpers } = require('../../../packages/core/src/database-integrity/memory-helpers');
const { ClaudeFlowIntegration } = require('../../../packages/core/src/database-integrity/claude-flow-integration');
const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const { format } = require('date-fns');
const { execSync } = require('child_process');
import { logger } from './utils/logger';

// Load configuration
const config = {
  database: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/warehouse_network',
    ssl: process.env.NODE_ENV === 'production',
    poolSize: 10,
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  migration: {
    migrationsDir: path.join(__dirname, '../../../packages/db/prisma/migrations'),
    tableName: '_migration_history',
    autoRun: false,
    validateChecksums: true,
    transactional: true
  },
  schema: {
    schemaFiles: [path.join(__dirname, '../../../packages/db/prisma/schema.prisma')],
    includeViews: true,
    includeIndexes: true,
    includeConstraints: true
  },
  validation: {
    enabled: true,
    routes: {
      apiDir: path.join(__dirname, '../pages/api'),
      patterns: ['**/*.ts', '**/*.js'],
      validatePagination: true,
      validateFilters: true
    },
    forms: {
      scanDirs: [
        path.join(__dirname, '../components'),
        path.join(__dirname, '../pages')
      ],
      filePatterns: ['**/*.tsx', '**/*.jsx'],
      frameworks: ['nextjs', 'react'],
      validateRequired: true,
      validateTypes: true
    },
    prismaModels: {
      validateRelations: true,
      validateEnums: true,
      validateDefaults: true
    }
  },
  drift: {
    enabled: true,
    autoFix: false,
    severity: 'HIGH'
  },
  prisma: {
    schemaPath: path.join(__dirname, '../../../packages/db/prisma/schema.prisma'),
    migrationsDir: path.join(__dirname, '../../../packages/db/prisma/migrations'),
    datasourceProvider: 'postgresql'
  }
};

// Initialize integrity system and Claude Flow memory helpers
const integritySystem = new DatabaseIntegritySystem(config);
const memoryHelpers = new MemoryHelpers({
  sessionId: `db-integrity-cli-${Date.now()}`,
  enableHooks: true,
  enableMemory: true
});
const claudeFlow = new ClaudeFlowIntegration();

// Global verbose flag
let verbose = false;

// Helper functions
function handleError(error) {
  logger.error(chalk.red('Error:'), error.message);
  if (error.details) {
    logger.error(chalk.gray('Details:'), error.details);
  }
  process.exit(1);
}

function displayTable(data, columns) {
  const table = new Table({
    head: columns.map(col => chalk.cyan(col)),
    style: { head: [], border: [] }
  });

  data.forEach(row => {
    table.push(columns.map(col => row[col] || ''));
  });

  logger.info(table.toString());
}

// Commands
program
  .name('db-integrity')
  .description('Database integrity management for Warehouse Network with memory bank logging')
  .version('1.0.0')
  .option('-v, --verbose', 'Show detailed logs and operations')
  .hook('preAction', (thisCommand) => {
    verbose = thisCommand.opts().verbose || false;
    if (verbose) {
      logger.info(chalk.gray('Verbose mode enabled'));
    }
  });

// Migration commands
program
  .command('migrate:status')
  .description('Show migration status')
  .action(async () => {
    const spinner = ora('Checking migration status...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.getMigrationStatus();
      
      if (!result.success) {
        spinner.fail('Failed to get migration status');
        handleError(result.error);
      }
      
      spinner.succeed('Migration status retrieved');
      
      if (result.data.length === 0) {
        logger.info(chalk.yellow('No migrations found'));
      } else {
        displayTable(result.data, ['id', 'name', 'status', 'executedAt']);
      }
      
      // Show recent logs if verbose
      if (verbose) {
        await showRecentLogs(integritySystem, 'MIGRATION', 5);
      }
    } catch (error) {
      spinner.fail('Failed to get migration status');
      handleError(error);
    }
  });

program
  .command('migrate:run')
  .description('Run pending migrations')
  .option('--dry-run', 'Show what would be executed without running')
  .option('--force', 'Force run migrations even if dangerous')
  .action(async (options) => {
    const spinner = ora('Running migrations...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.runPendingMigrations({
        dryRun: options.dryRun,
        force: options.force
      });
      
      if (!result.success) {
        spinner.fail('Failed to run migrations');
        handleError(result.error);
      }
      
      spinner.succeed(`${result.data.length} migrations executed`);
      
      if (result.data.length > 0) {
        displayTable(result.data, ['id', 'name', 'executionTime']);
      }
      
      // Show recent logs
      await showRecentLogs(integritySystem, 'MIGRATION', 5);
    } catch (error) {
      spinner.fail('Failed to run migrations');
      handleError(error);
    }
  });

program
  .command('migrate:prisma')
  .description('Run Prisma migrations')
  .option('--deploy', 'Run in production mode (migrate deploy)')
  .action(async (options) => {
    const spinner = ora('Running Prisma migrations...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.runPrismaMigrations(options.deploy);
      
      if (!result.success) {
        spinner.fail('Failed to run Prisma migrations');
        handleError(result.error);
      }
      
      spinner.succeed('Prisma migrations completed');
    } catch (error) {
      spinner.fail('Failed to run Prisma migrations');
      handleError(error);
    }
  });

// Drift detection commands
program
  .command('drift:detect')
  .description('Detect schema drifts')
  .option('--fix', 'Auto-fix detected drifts')
  .action(async (options) => {
    const spinner = ora('Detecting drifts...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.detectDrifts();
      
      if (!result.success) {
        spinner.fail('Failed to detect drifts');
        handleError(result.error);
      }
      
      spinner.succeed('Drift detection completed');
      
      if (result.data.drifts.length === 0) {
        logger.info(chalk.green('No drifts detected'));
        return;
      }
      
      logger.info(chalk.yellow(`Found ${result.data.drifts.length} drifts`));
      
      // Display drift summary
      logger.info('\n' + chalk.bold('Drift Summary:'));
      logger.info(`Total: ${result.data.summary.totalDrifts}`);
      logger.info(`Critical: ${result.data.summary.bySeverity.CRITICAL || 0}`);
      logger.info(`High: ${result.data.summary.bySeverity.HIGH || 0}`);
      logger.info(`Medium: ${result.data.summary.bySeverity.MEDIUM || 0}`);
      logger.info(`Low: ${result.data.summary.bySeverity.LOW || 0}`);
      
      // Display drifts
      logger.info('\n' + chalk.bold('Drifts:'));
      result.data.drifts.forEach(drift => {
        const severityColor = {
          CRITICAL: 'red',
          HIGH: 'yellow',
          MEDIUM: 'magenta',
          LOW: 'gray'
        }[drift.severity];
        
        logger.info(`\n${chalk[severityColor](`[${drift.severity}]`)} ${drift.type}`);
        logger.info(`Object: ${drift.object}`);
        logger.info(`Description: ${drift.description}`);
        if (drift.fixable) {
          logger.info(chalk.green('✓ Auto-fixable'));
        }
      });
      
      if (options.fix) {
        const fixSpinner = ora('Generating fix migrations...').start();
        const fixResult = await integritySystem.generatePrismaMigrationFromDrift(
          result.data,
          'auto_fix_drifts'
        );
        
        if (fixResult.success) {
          fixSpinner.succeed('Fix migrations generated');
          logger.info(chalk.green('Run "npm run migrate:prisma" to apply fixes'));
        } else {
          fixSpinner.fail('Failed to generate fix migrations');
        }
      }
    } catch (error) {
      spinner.fail('Failed to detect drifts');
      handleError(error);
    }
  });

program
  .command('drift:prisma')
  .description('Detect Prisma schema drifts')
  .action(async () => {
    const spinner = ora('Detecting Prisma drifts...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.detectPrismaSchemaDrift();
      
      if (!result.success) {
        spinner.fail('Failed to detect Prisma drifts');
        handleError(result.error);
      }
      
      spinner.succeed('Prisma drift detection completed');
      
      if (result.data.drifts.length === 0) {
        logger.info(chalk.green('Prisma schema is in sync with database'));
        return;
      }
      
      logger.info(chalk.yellow(`Found ${result.data.drifts.length} Prisma drifts`));
      
      result.data.drifts.forEach(drift => {
        logger.info(`\n${chalk.yellow('●')} ${drift.description}`);
        if (drift.prismaFix) {
          logger.info(chalk.gray('Suggested Prisma schema change:'));
          logger.info(chalk.cyan(drift.prismaFix));
        }
      });
    } catch (error) {
      spinner.fail('Failed to detect Prisma drifts');
      handleError(error);
    }
  });

// Validation commands
program
  .command('validate:forms')
  .description('Validate forms against Prisma models')
  .action(async () => {
    const spinner = ora('Validating forms...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.scanForms();
      
      if (!result.success) {
        spinner.fail('Failed to validate forms');
        handleError(result.error);
      }
      
      spinner.succeed('Form validation completed');
      
      const errors = result.data.filter(f => !f.validation.valid);
      if (errors.length === 0) {
        logger.info(chalk.green('All forms are valid'));
        return;
      }
      
      logger.info(chalk.yellow(`Found ${errors.length} forms with issues`));
      
      errors.forEach(form => {
        logger.info(`\n${chalk.bold(form.formName)}`);
        logger.info(`Framework: ${form.framework}`);
        logger.info(`Path: ${form.formPath}`);
        
        if (form.validation.errors.length > 0) {
          logger.info(chalk.red('Errors:'));
          form.validation.errors.forEach(err => {
            logger.info(`  - ${err.message}`);
          });
        }
        
        if (form.suggestions.length > 0) {
          logger.info(chalk.yellow('Suggestions:'));
          form.suggestions.forEach(sug => {
            logger.info(`  - ${sug.message}`);
          });
        }
      });
    } catch (error) {
      spinner.fail('Failed to validate forms');
      handleError(error);
    }
  });

program
  .command('validate:routes')
  .description('Validate API routes against database schema')
  .action(async () => {
    const spinner = ora('Validating routes...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.validateRoutes();
      
      if (!result.success) {
        spinner.fail('Failed to validate routes');
        handleError(result.error);
      }
      
      spinner.succeed('Route validation completed');
      
      const invalidRoutes = result.data.filter(r => !r.validation.valid);
      if (invalidRoutes.length === 0) {
        logger.info(chalk.green('All routes are valid'));
        return;
      }
      
      logger.info(chalk.yellow(`Found ${invalidRoutes.length} routes with issues`));
      
      invalidRoutes.forEach(route => {
        logger.info(`\n${chalk.bold(`${route.method} ${route.path}`)}`);
        
        route.validation.errors.forEach(err => {
          logger.info(chalk.red(`  ✗ ${err.message}`));
        });
        
        route.validation.warnings.forEach(warn => {
          logger.info(chalk.yellow(`  ⚠ ${warn.message}`));
        });
      });
    } catch (error) {
      spinner.fail('Failed to validate routes');
      handleError(error);
    }
  });

program
  .command('validate:warehouse')
  .description('Validate warehouse-specific integrity')
  .action(async () => {
    const spinner = ora('Validating warehouse integrity...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.validateWarehouseIntegrity();
      
      if (!result.success) {
        spinner.fail('Failed to validate warehouse integrity');
        handleError(result.error);
      }
      
      spinner.succeed('Warehouse validation completed');
      
      // Payment forms
      logger.info('\n' + chalk.bold('Payment Forms:'));
      const invalidPaymentForms = result.data.paymentForms.filter(f => !f.valid);
      if (invalidPaymentForms.length === 0) {
        logger.info(chalk.green('✓ All payment forms valid'));
      } else {
        invalidPaymentForms.forEach(form => {
          logger.info(`\n${chalk.yellow(form.formName)} (${form.model})`);
          if (form.missingFields.length > 0) {
            logger.info(chalk.red(`  Missing: ${form.missingFields.join(', ')}`));
          }
          if (form.typeMismatches.length > 0) {
            form.typeMismatches.forEach(tm => {
              logger.info(chalk.yellow(`  Type mismatch: ${tm.field} (expected ${tm.expectedType}, got ${tm.actualType})`));
            });
          }
        });
      }
      
      // Operation forms
      logger.info('\n' + chalk.bold('Operation Forms:'));
      const invalidOperationForms = result.data.operationForms.filter(f => !f.valid);
      if (invalidOperationForms.length === 0) {
        logger.info(chalk.green('✓ All operation forms valid'));
      } else {
        invalidOperationForms.forEach(form => {
          logger.info(`\n${chalk.yellow(form.formName)} (${form.model})`);
          if (form.missingFields.length > 0) {
            logger.info(chalk.red(`  Missing: ${form.missingFields.join(', ')}`));
          }
          if (form.typeMismatches.length > 0) {
            form.typeMismatches.forEach(tm => {
              logger.info(chalk.yellow(`  Type mismatch: ${tm.field} (expected ${tm.expectedType}, got ${tm.actualType})`));
            });
          }
        });
      }
      
      // API routes
      logger.info('\n' + chalk.bold('API Routes:'));
      const invalidRoutes = result.data.apiRoutes.filter(r => !r.valid);
      if (invalidRoutes.length === 0) {
        logger.info(chalk.green('✓ All API routes valid'));
      } else {
        invalidRoutes.forEach(route => {
          logger.info(`\n${chalk.yellow(`${route.method} ${route.route}`)}`);
          const invalidParams = [...route.queryParams, ...route.bodyParams].filter(p => !p.validInModel);
          invalidParams.forEach(param => {
            logger.info(chalk.red(`  Invalid param: ${param.param}`));
            if (param.suggestion) {
              logger.info(chalk.gray(`    → ${param.suggestion}`));
            }
          });
        });
      }
    } catch (error) {
      spinner.fail('Failed to validate warehouse integrity');
      handleError(error);
    }
  });

// Schema commands
program
  .command('schema:analyze')
  .description('Analyze database schema')
  .action(async () => {
    const spinner = ora('Analyzing schema...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.analyzeSchema();
      
      if (!result.success) {
        spinner.fail('Failed to analyze schema');
        handleError(result.error);
      }
      
      spinner.succeed('Schema analysis completed');
      
      logger.info(`\n${chalk.bold('Schema Summary:')}`);
      logger.info(`Version: ${result.data.version}`);
      logger.info(`Tables: ${result.data.tables.length}`);
      logger.info(`Indexes: ${result.data.indexes?.length || 0}`);
      logger.info(`Constraints: ${result.data.constraints?.length || 0}`);
      logger.info(`Enums: ${result.data.enums?.length || 0}`);
      logger.info(`Prisma Models: ${result.data.prismaModels?.length || 0}`);
      
      if (result.data.tables.length > 0) {
        logger.info(`\n${chalk.bold('Tables:')}`);
        result.data.tables.forEach(table => {
          logger.info(`  - ${table.name} (${table.columns.length} columns)`);
        });
      }
    } catch (error) {
      spinner.fail('Failed to analyze schema');
      handleError(error);
    }
  });

// Full integrity check
program
  .command('check')
  .description('Run full integrity check')
  .action(async () => {
    const spinner = ora('Running full integrity check...').start();
    
    try {
      await integritySystem.initialize();
      const result = await integritySystem.runFullIntegrityCheck();
      
      if (!result.success) {
        spinner.fail('Failed to run integrity check');
        handleError(result.error);
      }
      
      spinner.succeed('Integrity check completed');
      
      const summary = result.metadata;
      
      logger.info(`\n${chalk.bold('Integrity Check Results:')}`);
      logger.info(`Overall: ${summary.overallSuccess ? chalk.green('PASSED') : chalk.red('FAILED')}`);
      
      if (summary.issues.length > 0) {
        logger.info(`\n${chalk.yellow('Issues:')}`);
        summary.issues.forEach(issue => {
          logger.info(`  - ${issue}`);
        });
      }
      
      // Detailed results
      logger.info(`\n${chalk.bold('Component Status:')}`);
      logger.info(`Schema Analysis: ${result.data.schema.success ? chalk.green('✓') : chalk.red('✗')}`);
      logger.info(`Route Validation: ${result.data.routes.success ? chalk.green('✓') : chalk.red('✗')}`);
      logger.info(`Form Validation: ${result.data.forms.success ? chalk.green('✓') : chalk.red('✗')}`);
      logger.info(`Drift Detection: ${result.data.drifts.success ? chalk.green('✓') : chalk.red('✗')}`);
      logger.info(`Warehouse Validation: ${result.data.warehouse.success ? chalk.green('✓') : chalk.red('✗')}`);
    } catch (error) {
      spinner.fail('Failed to run integrity check');
      handleError(error);
    }
  });

// Claude Flow Memory Commands
program
  .command('logs:view')
  .description('View integrity logs from Claude Flow memory')
  .option('-l, --limit <number>', 'Number of logs to show', '20')
  .option('-c, --category <category>', 'Filter by category (VALIDATION, MIGRATION, DRIFT, etc.)')
  .option('--level <level>', 'Filter by level (DEBUG, INFO, WARNING, ERROR, CRITICAL)')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (options) => {
    const spinner = ora('Loading logs from Claude Flow memory...').start();
    
    try {
      await claudeFlow.initialize();
      const logs = await claudeFlow.getRecentLogs(
        parseInt(options.limit),
        options.category,
        options.level
      );
      
      spinner.succeed(`Retrieved ${logs.length} logs from Claude Flow memory`);
      
      if (options.format === 'json') {
        logger.info(JSON.stringify(logs, null, 2));
      } else {
        displayLogs(logs);
      }
    } catch (error) {
      spinner.fail('Failed to retrieve logs from Claude Flow memory');
      handleError(error);
    }
  });

program
  .command('logs:export')
  .description('Export integrity logs from Claude Flow memory')
  .option('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-f, --format <format>', 'Export format (json, csv)', 'json')
  .option('-o, --output <file>', 'Output file')
  .option('-c, --category <category>', 'Filter by category')
  .action(async (options) => {
    const spinner = ora('Exporting logs from Claude Flow memory...').start();
    
    try {
      await claudeFlow.initialize();
      
      const exportParams = {
        format: options.format,
        startDate: options.start ? new Date(options.start) : null,
        endDate: options.end ? new Date(options.end) : null,
        category: options.category
      };
      
      const logs = await claudeFlow.exportLogs(exportParams);
      
      if (options.output) {
        await fs.promises.writeFile(options.output, logs);
        spinner.succeed(`Logs exported to ${options.output}`);
      } else {
        spinner.succeed('Logs exported');
        logger.info(logs);
      }
    } catch (error) {
      spinner.fail('Failed to export logs from Claude Flow memory');
      handleError(error);
    }
  });

program
  .command('logs:stats')
  .description('Show log statistics from Claude Flow memory')
  .option('-d, --days <number>', 'Number of days to analyze', '7')
  .action(async (options) => {
    const spinner = ora('Analyzing logs from Claude Flow memory...').start();
    
    try {
      await memoryHelpers.initialize();
      
      const analytics = await memoryHelpers.getComprehensiveAnalytics(parseInt(options.days));
      
      spinner.succeed('Log analysis completed');
      
      logger.info('\n' + chalk.bold('Claude Flow Memory Analytics'));
      logger.info(`Period: Last ${options.days} days`);
      logger.info(`Total logs: ${analytics.overview.totalLogs}`);
      logger.info(`Error rate: ${chalk.red(analytics.overview.errorRate.toFixed(1))}%`);
      
      logger.info('\n' + chalk.bold('By Category:'));
      Object.entries(analytics.overview.categoryBreakdown).forEach(([cat, count]) => {
        logger.info(`  ${cat}: ${count}`);
      });
      
      logger.info('\n' + chalk.bold('By Level:'));
      Object.entries(analytics.overview.levelBreakdown).forEach(([level, count]) => {
        const color = {
          DEBUG: 'gray',
          INFO: 'blue',
          WARNING: 'yellow',
          ERROR: 'red',
          CRITICAL: 'magenta'
        }[level] || 'white';
        logger.info(`  ${chalk[color](level)}: ${count}`);
      });

      if (analytics.driftAnalysis.totalDrifts > 0) {
        logger.info('\n' + chalk.bold('Drift Analysis:'));
        logger.info(`Total drifts: ${analytics.driftAnalysis.totalDrifts}`);
        logger.info(`Fixable drifts: ${analytics.driftAnalysis.fixableCount}`);
      }

      if (analytics.migrationAnalysis.totalMigrations > 0) {
        logger.info('\n' + chalk.bold('Migration Analysis:'));
        logger.info(`Total migrations: ${analytics.migrationAnalysis.totalMigrations}`);
        logger.info(`Success rate: ${chalk.green(analytics.migrationAnalysis.successRate.toFixed(1))}%`);
        logger.info(`Avg execution time: ${analytics.migrationAnalysis.avgExecutionTime.toFixed(0)}ms`);
      }

      if (analytics.alerts && analytics.alerts.length > 0) {
        logger.info('\n' + chalk.bold('Active Alerts:'));
        analytics.alerts.forEach(alert => {
          const color = {
            CRITICAL: 'red',
            HIGH: 'yellow',
            MEDIUM: 'blue',
            LOW: 'gray'
          }[alert.severity] || 'white';
          logger.info(`  ${chalk[color](`[${alert.severity}]`)} ${alert.title}`);
        });
      }
    } catch (error) {
      spinner.fail('Failed to analyze logs from Claude Flow memory');
      handleError(error);
    }
  });

// Additional Claude Flow Memory Commands
program
  .command('memory:search')
  .description('Search across all memory namespaces')
  .option('-q, --query <query>', 'Search query', required=true)
  .option('-l, --limit <number>', 'Maximum results to return', '100')
  .action(async (options) => {
    const spinner = ora('Searching Claude Flow memory...').start();
    
    try {
      await memoryHelpers.initialize();
      
      const results = await memoryHelpers.globalSearch(options.query, parseInt(options.limit));
      
      spinner.succeed(`Found ${results.totalMatches} matches across all namespaces`);
      
      if (results.totalMatches === 0) {
        logger.info(chalk.yellow('No matches found'));
        return;
      }
      
      logger.info('\n' + chalk.bold('Search Results:'));
      
      Object.entries(results.results).forEach(([namespace, matches]) => {
        if (matches.length > 0) {
          logger.info(`\n${chalk.cyan(namespace.toUpperCase())} (${matches.length} matches):`);
          matches.slice(0, 5).forEach((match, index) => {
            logger.info(`  ${index + 1}. ${match.data.message || match.data.title || 'No message'}`);
            logger.info(`     ${chalk.gray(new Date(match.data.timestamp).toLocaleString())}`);
          });
          if (matches.length > 5) {
            logger.info(`     ${chalk.gray(`... and ${matches.length - 5} more`)}`);
          }
        }
      });
    } catch (error) {
      spinner.fail('Failed to search Claude Flow memory');
      handleError(error);
    }
  });

program
  .command('memory:cleanup')
  .description('Cleanup old data from Claude Flow memory')
  .option('--force', 'Force cleanup without confirmation')
  .action(async (options) => {
    if (!options.force) {
      logger.info(chalk.yellow('This will cleanup old data from Claude Flow memory namespaces.'));
      logger.info('Add --force to confirm this action.');
      return;
    }
    
    const spinner = ora('Cleaning up Claude Flow memory...').start();
    
    try {
      await claudeFlow.initialize();
      
      const results = await claudeFlow.cleanupMemory();
      
      spinner.succeed('Memory cleanup completed');
      
      logger.info('\n' + chalk.bold('Cleanup Results:'));
      logger.info(`Namespaces processed: ${results.namespacesCleared}`);
      logger.info(`Entries removed: ${results.entriesRemoved}`);
      
      if (results.errors.length > 0) {
        logger.info('\n' + chalk.yellow('Errors:'));
        results.errors.forEach(error => {
          logger.info(`  - ${error}`);
        });
      }
    } catch (error) {
      spinner.fail('Failed to cleanup Claude Flow memory');
      handleError(error);
    }
  });

program
  .command('memory:report')
  .description('Generate comprehensive memory analytics report')
  .option('-d, --days <number>', 'Number of days to analyze', '7')
  .option('-f, --format <format>', 'Report format (json, summary)', 'summary')
  .option('-o, --output <file>', 'Output file (optional)')
  .action(async (options) => {
    const spinner = ora('Generating comprehensive memory report...').start();
    
    try {
      await memoryHelpers.initialize();
      
      const report = await memoryHelpers.generateReport(parseInt(options.days), options.format);
      
      spinner.succeed('Report generated');
      
      if (options.output) {
        const content = typeof report === 'string' ? report : JSON.stringify(report, null, 2);
        await fs.promises.writeFile(options.output, content);
        logger.info(chalk.green(`Report saved to ${options.output}`));
      } else if (options.format === 'summary') {
        displayReportSummary(report);
      } else {
        logger.info(JSON.stringify(report, null, 2));
      }
    } catch (error) {
      spinner.fail('Failed to generate memory report');
      handleError(error);
    }
  });

program
  .command('alerts:list')
  .description('List active alerts from Claude Flow memory')
  .option('--severity <severity>', 'Filter by severity (LOW, MEDIUM, HIGH, CRITICAL)')
  .action(async (options) => {
    const spinner = ora('Loading alerts from Claude Flow memory...').start();
    
    try {
      await memoryHelpers.initialize();
      
      let alerts = await memoryHelpers.getActiveAlerts();
      
      if (options.severity) {
        alerts = alerts.filter(alert => alert.severity === options.severity.toUpperCase());
      }
      
      spinner.succeed(`Found ${alerts.length} active alerts`);
      
      if (alerts.length === 0) {
        logger.info(chalk.green('No active alerts'));
        return;
      }
      
      logger.info('\n' + chalk.bold('Active Alerts:'));
      alerts.forEach((alert, index) => {
        const color = {
          CRITICAL: 'red',
          HIGH: 'yellow',
          MEDIUM: 'blue',
          LOW: 'gray'
        }[alert.severity] || 'white';
        
        logger.info(`\n${index + 1}. ${chalk[color](`[${alert.severity}]`)} ${alert.title}`);
        logger.info(`   ${alert.description}`);
        logger.info(`   ${chalk.gray(new Date(alert.timestamp).toLocaleString())}`);
        if (alert.details && alert.details.component) {
          logger.info(`   Component: ${alert.details.component}`);
        }
      });
    } catch (error) {
      spinner.fail('Failed to load alerts');
      handleError(error);
    }
  });

// Helper function to display report summary
function displayReportSummary(report) {
  logger.info('\n' + chalk.bold('System Health Report'));
  logger.info(`Period: ${report.metadata.period}`);
  logger.info(`Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}`);
  
  const status = report.summary.status;
  const statusColor = {
    HEALTHY: 'green',
    WARNING: 'yellow',
    CRITICAL: 'red'
  }[status] || 'white';
  
  logger.info(`\nOverall Status: ${chalk[statusColor](status)}`);
  
  if (report.summary.issues.length > 0) {
    logger.info('\n' + chalk.bold('Issues:'));
    report.summary.issues.forEach(issue => {
      logger.info(`  - ${issue}`);
    });
  }
  
  if (report.summary.recommendations.length > 0) {
    logger.info('\n' + chalk.bold('Recommendations:'));
    report.summary.recommendations.forEach(rec => {
      logger.info(`  - ${rec}`);
    });
  }
  
  logger.info('\n' + chalk.bold('Analytics Summary:'));
  logger.info(`Total logs: ${report.analytics.overview.totalLogs}`);
  logger.info(`Error rate: ${report.analytics.overview.errorRate.toFixed(1)}%`);
  logger.info(`Total drifts: ${report.analytics.driftAnalysis.totalDrifts}`);
  logger.info(`Migration success rate: ${report.analytics.migrationAnalysis.successRate.toFixed(1)}%`);
  logger.info(`Active alerts: ${report.activeAlerts.length}`);
}

// Helper function to display logs
function displayLogs(logs) {
  if (logs.length === 0) {
    logger.info(chalk.yellow('No logs found'));
    return;
  }
  
  const table = new Table({
    head: ['Time', 'Category', 'Level', 'Message', 'Details'].map(h => chalk.cyan(h)),
    style: { head: [], border: [] },
    colWidths: [20, 15, 10, 50, 30],
    wordWrap: true
  });
  
  logs.forEach(log => {
    const levelColor = {
      DEBUG: 'gray',
      INFO: 'blue',
      WARNING: 'yellow',
      ERROR: 'red',
      CRITICAL: 'magenta'
    }[log.level] || 'white';
    
    table.push([
      format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      log.category,
      chalk[levelColor](log.level),
      log.message,
      log.metadata ? JSON.stringify(JSON.parse(log.metadata), null, 2).substring(0, 50) + '...' : ''
    ]);
  });
  
  logger.info(table.toString());
}

// Helper function to show recent logs after operations (using Claude Flow)
async function showRecentLogs(system, category, limit = 5) {
  if (!verbose) return;
  
  try {
    await claudeFlow.initialize();
    logger.info('\n' + chalk.gray('Recent logs from Claude Flow memory:'));
    const logs = await claudeFlow.getRecentLogs(limit, category);
    
    logs.forEach(log => {
      const levelColor = {
        DEBUG: 'gray',
        INFO: 'blue',
        WARNING: 'yellow',
        ERROR: 'red',
        CRITICAL: 'magenta'
      }[log.level] || 'white';
      
      logger.info(
        chalk.gray(format(new Date(log.timestamp), 'HH:mm:ss')) + ' ' +
        chalk[levelColor](`[${log.level}]`) + ' ' +
        log.message
      );
    });
  } catch (error) {
    logger.info(chalk.gray('Unable to load recent logs from Claude Flow memory'));
  }
}

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}