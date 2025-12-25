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
  console.error(chalk.red('Error:'), error.message);
  if (error.details) {
    console.error(chalk.gray('Details:'), error.details);
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

  console.log(table.toString());
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
      console.log(chalk.gray('Verbose mode enabled'));
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
        console.log(chalk.yellow('No migrations found'));
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
        console.log(chalk.green('No drifts detected'));
        return;
      }
      
      console.log(chalk.yellow(`Found ${result.data.drifts.length} drifts`));
      
      // Display drift summary
      console.log('\n' + chalk.bold('Drift Summary:'));
      console.log(`Total: ${result.data.summary.totalDrifts}`);
      console.log(`Critical: ${result.data.summary.bySeverity.CRITICAL || 0}`);
      console.log(`High: ${result.data.summary.bySeverity.HIGH || 0}`);
      console.log(`Medium: ${result.data.summary.bySeverity.MEDIUM || 0}`);
      console.log(`Low: ${result.data.summary.bySeverity.LOW || 0}`);
      
      // Display drifts
      console.log('\n' + chalk.bold('Drifts:'));
      result.data.drifts.forEach(drift => {
        const severityColor = {
          CRITICAL: 'red',
          HIGH: 'yellow',
          MEDIUM: 'magenta',
          LOW: 'gray'
        }[drift.severity];
        
        console.log(`\n${chalk[severityColor](`[${drift.severity}]`)} ${drift.type}`);
        console.log(`Object: ${drift.object}`);
        console.log(`Description: ${drift.description}`);
        if (drift.fixable) {
          console.log(chalk.green('✓ Auto-fixable'));
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
          console.log(chalk.green('Run "npm run migrate:prisma" to apply fixes'));
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
        console.log(chalk.green('Prisma schema is in sync with database'));
        return;
      }
      
      console.log(chalk.yellow(`Found ${result.data.drifts.length} Prisma drifts`));
      
      result.data.drifts.forEach(drift => {
        console.log(`\n${chalk.yellow('●')} ${drift.description}`);
        if (drift.prismaFix) {
          console.log(chalk.gray('Suggested Prisma schema change:'));
          console.log(chalk.cyan(drift.prismaFix));
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
        console.log(chalk.green('All forms are valid'));
        return;
      }
      
      console.log(chalk.yellow(`Found ${errors.length} forms with issues`));
      
      errors.forEach(form => {
        console.log(`\n${chalk.bold(form.formName)}`);
        console.log(`Framework: ${form.framework}`);
        console.log(`Path: ${form.formPath}`);
        
        if (form.validation.errors.length > 0) {
          console.log(chalk.red('Errors:'));
          form.validation.errors.forEach(err => {
            console.log(`  - ${err.message}`);
          });
        }
        
        if (form.suggestions.length > 0) {
          console.log(chalk.yellow('Suggestions:'));
          form.suggestions.forEach(sug => {
            console.log(`  - ${sug.message}`);
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
        console.log(chalk.green('All routes are valid'));
        return;
      }
      
      console.log(chalk.yellow(`Found ${invalidRoutes.length} routes with issues`));
      
      invalidRoutes.forEach(route => {
        console.log(`\n${chalk.bold(`${route.method} ${route.path}`)}`);
        
        route.validation.errors.forEach(err => {
          console.log(chalk.red(`  ✗ ${err.message}`));
        });
        
        route.validation.warnings.forEach(warn => {
          console.log(chalk.yellow(`  ⚠ ${warn.message}`));
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
      console.log('\n' + chalk.bold('Payment Forms:'));
      const invalidPaymentForms = result.data.paymentForms.filter(f => !f.valid);
      if (invalidPaymentForms.length === 0) {
        console.log(chalk.green('✓ All payment forms valid'));
      } else {
        invalidPaymentForms.forEach(form => {
          console.log(`\n${chalk.yellow(form.formName)} (${form.model})`);
          if (form.missingFields.length > 0) {
            console.log(chalk.red(`  Missing: ${form.missingFields.join(', ')}`));
          }
          if (form.typeMismatches.length > 0) {
            form.typeMismatches.forEach(tm => {
              console.log(chalk.yellow(`  Type mismatch: ${tm.field} (expected ${tm.expectedType}, got ${tm.actualType})`));
            });
          }
        });
      }
      
      // Operation forms
      console.log('\n' + chalk.bold('Operation Forms:'));
      const invalidOperationForms = result.data.operationForms.filter(f => !f.valid);
      if (invalidOperationForms.length === 0) {
        console.log(chalk.green('✓ All operation forms valid'));
      } else {
        invalidOperationForms.forEach(form => {
          console.log(`\n${chalk.yellow(form.formName)} (${form.model})`);
          if (form.missingFields.length > 0) {
            console.log(chalk.red(`  Missing: ${form.missingFields.join(', ')}`));
          }
          if (form.typeMismatches.length > 0) {
            form.typeMismatches.forEach(tm => {
              console.log(chalk.yellow(`  Type mismatch: ${tm.field} (expected ${tm.expectedType}, got ${tm.actualType})`));
            });
          }
        });
      }
      
      // API routes
      console.log('\n' + chalk.bold('API Routes:'));
      const invalidRoutes = result.data.apiRoutes.filter(r => !r.valid);
      if (invalidRoutes.length === 0) {
        console.log(chalk.green('✓ All API routes valid'));
      } else {
        invalidRoutes.forEach(route => {
          console.log(`\n${chalk.yellow(`${route.method} ${route.route}`)}`);
          const invalidParams = [...route.queryParams, ...route.bodyParams].filter(p => !p.validInModel);
          invalidParams.forEach(param => {
            console.log(chalk.red(`  Invalid param: ${param.param}`));
            if (param.suggestion) {
              console.log(chalk.gray(`    → ${param.suggestion}`));
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
      
      console.log(`\n${chalk.bold('Schema Summary:')}`);
      console.log(`Version: ${result.data.version}`);
      console.log(`Tables: ${result.data.tables.length}`);
      console.log(`Indexes: ${result.data.indexes?.length || 0}`);
      console.log(`Constraints: ${result.data.constraints?.length || 0}`);
      console.log(`Enums: ${result.data.enums?.length || 0}`);
      console.log(`Prisma Models: ${result.data.prismaModels?.length || 0}`);
      
      if (result.data.tables.length > 0) {
        console.log(`\n${chalk.bold('Tables:')}`);
        result.data.tables.forEach(table => {
          console.log(`  - ${table.name} (${table.columns.length} columns)`);
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
      
      console.log(`\n${chalk.bold('Integrity Check Results:')}`);
      console.log(`Overall: ${summary.overallSuccess ? chalk.green('PASSED') : chalk.red('FAILED')}`);
      
      if (summary.issues.length > 0) {
        console.log(`\n${chalk.yellow('Issues:')}`);
        summary.issues.forEach(issue => {
          console.log(`  - ${issue}`);
        });
      }
      
      // Detailed results
      console.log(`\n${chalk.bold('Component Status:')}`);
      console.log(`Schema Analysis: ${result.data.schema.success ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`Route Validation: ${result.data.routes.success ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`Form Validation: ${result.data.forms.success ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`Drift Detection: ${result.data.drifts.success ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`Warehouse Validation: ${result.data.warehouse.success ? chalk.green('✓') : chalk.red('✗')}`);
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
        console.log(JSON.stringify(logs, null, 2));
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
        console.log(logs);
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
      
      console.log('\n' + chalk.bold('Claude Flow Memory Analytics'));
      console.log(`Period: Last ${options.days} days`);
      console.log(`Total logs: ${analytics.overview.totalLogs}`);
      console.log(`Error rate: ${chalk.red(analytics.overview.errorRate.toFixed(1))}%`);
      
      console.log('\n' + chalk.bold('By Category:'));
      Object.entries(analytics.overview.categoryBreakdown).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
      
      console.log('\n' + chalk.bold('By Level:'));
      Object.entries(analytics.overview.levelBreakdown).forEach(([level, count]) => {
        const color = {
          DEBUG: 'gray',
          INFO: 'blue',
          WARNING: 'yellow',
          ERROR: 'red',
          CRITICAL: 'magenta'
        }[level] || 'white';
        console.log(`  ${chalk[color](level)}: ${count}`);
      });

      if (analytics.driftAnalysis.totalDrifts > 0) {
        console.log('\n' + chalk.bold('Drift Analysis:'));
        console.log(`Total drifts: ${analytics.driftAnalysis.totalDrifts}`);
        console.log(`Fixable drifts: ${analytics.driftAnalysis.fixableCount}`);
      }

      if (analytics.migrationAnalysis.totalMigrations > 0) {
        console.log('\n' + chalk.bold('Migration Analysis:'));
        console.log(`Total migrations: ${analytics.migrationAnalysis.totalMigrations}`);
        console.log(`Success rate: ${chalk.green(analytics.migrationAnalysis.successRate.toFixed(1))}%`);
        console.log(`Avg execution time: ${analytics.migrationAnalysis.avgExecutionTime.toFixed(0)}ms`);
      }

      if (analytics.alerts && analytics.alerts.length > 0) {
        console.log('\n' + chalk.bold('Active Alerts:'));
        analytics.alerts.forEach(alert => {
          const color = {
            CRITICAL: 'red',
            HIGH: 'yellow',
            MEDIUM: 'blue',
            LOW: 'gray'
          }[alert.severity] || 'white';
          console.log(`  ${chalk[color](`[${alert.severity}]`)} ${alert.title}`);
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
        console.log(chalk.yellow('No matches found'));
        return;
      }
      
      console.log('\n' + chalk.bold('Search Results:'));
      
      Object.entries(results.results).forEach(([namespace, matches]) => {
        if (matches.length > 0) {
          console.log(`\n${chalk.cyan(namespace.toUpperCase())} (${matches.length} matches):`);
          matches.slice(0, 5).forEach((match, index) => {
            console.log(`  ${index + 1}. ${match.data.message || match.data.title || 'No message'}`);
            console.log(`     ${chalk.gray(new Date(match.data.timestamp).toLocaleString())}`);
          });
          if (matches.length > 5) {
            console.log(`     ${chalk.gray(`... and ${matches.length - 5} more`)}`);
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
      console.log(chalk.yellow('This will cleanup old data from Claude Flow memory namespaces.'));
      console.log('Add --force to confirm this action.');
      return;
    }
    
    const spinner = ora('Cleaning up Claude Flow memory...').start();
    
    try {
      await claudeFlow.initialize();
      
      const results = await claudeFlow.cleanupMemory();
      
      spinner.succeed('Memory cleanup completed');
      
      console.log('\n' + chalk.bold('Cleanup Results:'));
      console.log(`Namespaces processed: ${results.namespacesCleared}`);
      console.log(`Entries removed: ${results.entriesRemoved}`);
      
      if (results.errors.length > 0) {
        console.log('\n' + chalk.yellow('Errors:'));
        results.errors.forEach(error => {
          console.log(`  - ${error}`);
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
        console.log(chalk.green(`Report saved to ${options.output}`));
      } else if (options.format === 'summary') {
        displayReportSummary(report);
      } else {
        console.log(JSON.stringify(report, null, 2));
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
        console.log(chalk.green('No active alerts'));
        return;
      }
      
      console.log('\n' + chalk.bold('Active Alerts:'));
      alerts.forEach((alert, index) => {
        const color = {
          CRITICAL: 'red',
          HIGH: 'yellow',
          MEDIUM: 'blue',
          LOW: 'gray'
        }[alert.severity] || 'white';
        
        console.log(`\n${index + 1}. ${chalk[color](`[${alert.severity}]`)} ${alert.title}`);
        console.log(`   ${alert.description}`);
        console.log(`   ${chalk.gray(new Date(alert.timestamp).toLocaleString())}`);
        if (alert.details && alert.details.component) {
          console.log(`   Component: ${alert.details.component}`);
        }
      });
    } catch (error) {
      spinner.fail('Failed to load alerts');
      handleError(error);
    }
  });

// Helper function to display report summary
function displayReportSummary(report) {
  console.log('\n' + chalk.bold('System Health Report'));
  console.log(`Period: ${report.metadata.period}`);
  console.log(`Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}`);
  
  const status = report.summary.status;
  const statusColor = {
    HEALTHY: 'green',
    WARNING: 'yellow',
    CRITICAL: 'red'
  }[status] || 'white';
  
  console.log(`\nOverall Status: ${chalk[statusColor](status)}`);
  
  if (report.summary.issues.length > 0) {
    console.log('\n' + chalk.bold('Issues:'));
    report.summary.issues.forEach(issue => {
      console.log(`  - ${issue}`);
    });
  }
  
  if (report.summary.recommendations.length > 0) {
    console.log('\n' + chalk.bold('Recommendations:'));
    report.summary.recommendations.forEach(rec => {
      console.log(`  - ${rec}`);
    });
  }
  
  console.log('\n' + chalk.bold('Analytics Summary:'));
  console.log(`Total logs: ${report.analytics.overview.totalLogs}`);
  console.log(`Error rate: ${report.analytics.overview.errorRate.toFixed(1)}%`);
  console.log(`Total drifts: ${report.analytics.driftAnalysis.totalDrifts}`);
  console.log(`Migration success rate: ${report.analytics.migrationAnalysis.successRate.toFixed(1)}%`);
  console.log(`Active alerts: ${report.activeAlerts.length}`);
}

// Helper function to display logs
function displayLogs(logs) {
  if (logs.length === 0) {
    console.log(chalk.yellow('No logs found'));
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
  
  console.log(table.toString());
}

// Helper function to show recent logs after operations (using Claude Flow)
async function showRecentLogs(system, category, limit = 5) {
  if (!verbose) return;
  
  try {
    await claudeFlow.initialize();
    console.log('\n' + chalk.gray('Recent logs from Claude Flow memory:'));
    const logs = await claudeFlow.getRecentLogs(limit, category);
    
    logs.forEach(log => {
      const levelColor = {
        DEBUG: 'gray',
        INFO: 'blue',
        WARNING: 'yellow',
        ERROR: 'red',
        CRITICAL: 'magenta'
      }[log.level] || 'white';
      
      console.log(
        chalk.gray(format(new Date(log.timestamp), 'HH:mm:ss')) + ' ' +
        chalk[levelColor](`[${log.level}]`) + ' ' +
        log.message
      );
    });
  } catch (error) {
    console.log(chalk.gray('Unable to load recent logs from Claude Flow memory'));
  }
}

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}