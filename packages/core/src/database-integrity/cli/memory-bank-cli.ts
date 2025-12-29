#!/usr/bin/env node

import { IntegrityLogCategory, IntegrityLogLevel } from '@warehouse-network/db';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { format, subDays } from 'date-fns';

import { memoryBank } from '../memory-bank/memory-bank';
import { logger } from '../../../../../../../../utils/logger';

const program = new Command();

program
  .name('memory-bank')
  .description('CLI for database integrity memory bank management')
  .version('1.0.0');

// View logs command
program
  .command('logs')
  .description('View recent integrity logs')
  .option('-c, --category <category>', 'Filter by category')
  .option('-l, --level <level>', 'Filter by level')
  .option('-d, --days <days>', 'Number of days to look back', '7')
  .option('-s, --search <query>', 'Search in log messages')
  .option('--limit <limit>', 'Maximum number of logs to display', '50')
  .action(async (options) => {
    try {
      const startDate = subDays(new Date(), parseInt(options.days));
      
      const result = await memoryBank.searchLogs({
        category: options.category as IntegrityLogCategory,
        level: options.level as IntegrityLogLevel,
        startDate,
        searchText: options.search,
        limit: parseInt(options.limit)
      });

      if (result.logs.length === 0) {
        logger.info(chalk.yellow('No logs found matching the criteria'));
        return;
      }

      const table = new Table({
        head: ['Time', 'Level', 'Category', 'Component', 'Message', 'Duration'],
        colWidths: [20, 10, 20, 20, 50, 10],
        wordWrap: true
      });

      result.logs.forEach(log => {
        const levelColor = getLevelColor(log.level);
        table.push([
          format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
          levelColor(log.level),
          log.category,
          log.component,
          log.message,
          log.duration ? `${log.duration}ms` : '-'
        ]);
      });

      logger.info(table.toString());
      logger.info(chalk.gray(`\nShowing ${result.logs.length} of ${result.total} total logs`));
    } catch (error) {
      logger.error(chalk.red('Error fetching logs:'), error);
      process.exit(1);
    }
  });

// Search logs command
program
  .command('search <query>')
  .description('Search logs by message content')
  .option('-d, --days <days>', 'Number of days to look back', '30')
  .action(async (query, options) => {
    try {
      const startDate = subDays(new Date(), parseInt(options.days));
      
      const result = await memoryBank.searchLogs({
        startDate,
        searchText: query,
        limit: 100
      });

      if (result.logs.length === 0) {
        logger.info(chalk.yellow('No logs found matching the search query'));
        return;
      }

      logger.info(chalk.green(`Found ${result.total} logs matching "${query}":\n`));

      result.logs.forEach(log => {
        const levelColor = getLevelColor(log.level);
        logger.info(
          chalk.gray(format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')) +
          ' ' +
          levelColor(`[${log.level}]`) +
          ' ' +
          chalk.cyan(`[${log.component}]`) +
          ' ' +
          log.message
        );
        
        if (log.errorCode) {
          logger.info(chalk.red(`  Error: ${log.errorCode}`));
        }
      });
    } catch (error) {
      logger.error(chalk.red('Error searching logs:'), error);
      process.exit(1);
    }
  });

// Export logs command
program
  .command('export')
  .description('Export logs to file')
  .option('-f, --format <format>', 'Export format (json|csv)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .option('-c, --category <category>', 'Filter by category')
  .option('-d, --days <days>', 'Number of days to export', '30')
  .action(async (options) => {
    try {
      const startDate = subDays(new Date(), parseInt(options.days));
      const outputFile = options.output || `integrity-logs-${format(new Date(), 'yyyy-MM-dd')}.${options.format}`;
      
      logger.info(chalk.blue('Exporting logs...'));
      
      const data = await memoryBank.exportLogs({
        format: options.format,
        startDate,
        category: options.category as IntegrityLogCategory
      });

      const fs = await import('fs/promises');
      await fs.writeFile(outputFile, data);
      
      logger.info(chalk.green(`✓ Logs exported to ${outputFile}`));
    } catch (error) {
      logger.error(chalk.red('Error exporting logs:'), error);
      process.exit(1);
    }
  });

// Analytics command
program
  .command('analytics')
  .description('View integrity analytics and insights')
  .option('-d, --days <days>', 'Number of days to analyze', '7')
  .action(async (options) => {
    try {
      const analytics = await memoryBank.getAnalytics(parseInt(options.days));
      
      logger.info(chalk.bold('\n📊 Database Integrity Analytics\n'));
      
      // Health Score
      const healthColor = analytics.summary.healthScore >= 80 ? chalk.green : 
                        analytics.summary.healthScore >= 60 ? chalk.yellow : 
                        chalk.red;
      logger.info(chalk.bold('Health Score: ') + healthColor(`${analytics.summary.healthScore}%`));
      
      // Log Statistics
      logger.info(chalk.bold('\n📋 Log Statistics:'));
      logger.info(`  Total Logs: ${analytics.logs.totalLogs}`);
      logger.info(`  Error Rate: ${chalk.red((analytics.logs.errorRate * 100).toFixed(2) + '%')}`);
      logger.info(`  Success Rate: ${chalk.green((analytics.logs.successRate * 100).toFixed(2) + '%')}`);
      logger.info(`  Avg Duration: ${analytics.logs.avgDuration.toFixed(0)}ms`);
      
      // Logs by Category
      logger.info(chalk.bold('\n📁 Logs by Category:'));
      Object.entries(analytics.logs.logsByCategory).forEach(([category, count]) => {
        logger.info(`  ${category}: ${count}`);
      });
      
      // Alert Summary
      logger.info(chalk.bold('\n🚨 Alert Summary:'));
      logger.info(`  Total Alerts: ${analytics.alerts.totalAlerts}`);
      logger.info(`  Active Alerts: ${chalk.yellow(analytics.alerts.activeAlerts)}`);
      if (analytics.alerts.unacknowledgedCritical > 0) {
        logger.info(chalk.red(`  Unacknowledged Critical: ${analytics.alerts.unacknowledgedCritical}`));
      }
      
      // Top Errors
      if (analytics.logs.topErrors.length > 0) {
        logger.info(chalk.bold('\n❌ Top Errors:'));
        analytics.logs.topErrors.slice(0, 5).forEach((error, idx) => {
          logger.info(`  ${idx + 1}. ${error.errorCode} (${error.count} occurrences)`);
          logger.info(chalk.gray(`     ${error.message}`));
        });
      }
      
      // Recommendations
      if (analytics.summary.recommendations.length > 0) {
        logger.info(chalk.bold('\n💡 Recommendations:'));
        analytics.summary.recommendations.forEach((rec, idx) => {
          logger.info(`  ${idx + 1}. ${rec}`);
        });
      }
    } catch (error) {
      logger.error(chalk.red('Error generating analytics:'), error);
      process.exit(1);
    }
  });

// Cleanup command
program
  .command('cleanup')
  .description('Run retention policy cleanup')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .action(async (options) => {
    try {
      if (options.dryRun) {
        logger.info(chalk.yellow('🔍 Dry run mode - no data will be deleted'));
        
        const stats = await memoryBank.retentionManager.getRetentionStats();
        logger.info(chalk.bold('\nCurrent retention statistics:'));
        logger.info(JSON.stringify(stats, null, 2));
      } else {
        logger.info(chalk.blue('🧹 Running retention cleanup...'));
        
        const results = await memoryBank.runRetentionCleanup();
        
        logger.info(chalk.green('\n✓ Cleanup completed:'));
        logger.info(`  Logs deleted: ${results.logsDeleted}`);
        logger.info(`  Snapshots deleted: ${results.snapshotsDeleted}`);
        logger.info(`  Alerts deleted: ${results.alertsDeleted}`);
        logger.info(`  Metrics deleted: ${results.metricsDeleted}`);
      }
    } catch (error) {
      logger.error(chalk.red('Error running cleanup:'), error);
      process.exit(1);
    }
  });

// Alerts command
program
  .command('alerts')
  .description('View active integrity alerts')
  .option('-s, --status <status>', 'Filter by status (active|acknowledged|resolved)', 'active')
  .option('-v, --severity <severity>', 'Filter by severity')
  .action(async (options) => {
    try {
      const alerts = await memoryBank.getAlerts({
        status: options.status,
        severity: options.severity,
        limit: 50
      });

      if (alerts.length === 0) {
        logger.info(chalk.yellow('No alerts found matching the criteria'));
        return;
      }

      const table = new Table({
        head: ['Created', 'Severity', 'Type', 'Title', 'Status'],
        colWidths: [20, 10, 25, 50, 15],
        wordWrap: true
      });

      alerts.forEach(alert => {
        const severityColor = getSeverityColor(alert.severity);
        table.push([
          format(new Date(alert.createdAt), 'yyyy-MM-dd HH:mm:ss'),
          severityColor(alert.severity),
          alert.alertType,
          alert.title,
          alert.status
        ]);
      });

      logger.info(table.toString());
    } catch (error) {
      logger.error(chalk.red('Error fetching alerts:'), error);
      process.exit(1);
    }
  });

// Helper functions
function getLevelColor(level: IntegrityLogLevel) {
  switch (level) {
    case IntegrityLogLevel.DEBUG:
      return chalk.gray;
    case IntegrityLogLevel.INFO:
      return chalk.blue;
    case IntegrityLogLevel.WARNING:
      return chalk.yellow;
    case IntegrityLogLevel.ERROR:
      return chalk.red;
    case IntegrityLogLevel.CRITICAL:
      return chalk.bgRed.white;
    default:
      return chalk.white;
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'LOW':
      return chalk.green;
    case 'MEDIUM':
      return chalk.yellow;
    case 'HIGH':
      return chalk.red;
    case 'CRITICAL':
      return chalk.bgRed.white;
    default:
      return chalk.white;
  }
}

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}