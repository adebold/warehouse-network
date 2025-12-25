#!/usr/bin/env node

import { Command } from 'commander';
import { memoryBank } from '../memory-bank/memory-bank';
import { IntegrityLogCategory, IntegrityLogLevel } from '@warehouse-network/db';
import { format, subDays } from 'date-fns';
import chalk from 'chalk';
import Table from 'cli-table3';

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
        console.log(chalk.yellow('No logs found matching the criteria'));
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

      console.log(table.toString());
      console.log(chalk.gray(`\nShowing ${result.logs.length} of ${result.total} total logs`));
    } catch (error) {
      console.error(chalk.red('Error fetching logs:'), error);
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
        console.log(chalk.yellow('No logs found matching the search query'));
        return;
      }

      console.log(chalk.green(`Found ${result.total} logs matching "${query}":\n`));

      result.logs.forEach(log => {
        const levelColor = getLevelColor(log.level);
        console.log(
          chalk.gray(format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')) +
          ' ' +
          levelColor(`[${log.level}]`) +
          ' ' +
          chalk.cyan(`[${log.component}]`) +
          ' ' +
          log.message
        );
        
        if (log.errorCode) {
          console.log(chalk.red(`  Error: ${log.errorCode}`));
        }
      });
    } catch (error) {
      console.error(chalk.red('Error searching logs:'), error);
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
      
      console.log(chalk.blue('Exporting logs...'));
      
      const data = await memoryBank.exportLogs({
        format: options.format,
        startDate,
        category: options.category as IntegrityLogCategory
      });

      const fs = await import('fs/promises');
      await fs.writeFile(outputFile, data);
      
      console.log(chalk.green(`✓ Logs exported to ${outputFile}`));
    } catch (error) {
      console.error(chalk.red('Error exporting logs:'), error);
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
      
      console.log(chalk.bold('\n📊 Database Integrity Analytics\n'));
      
      // Health Score
      const healthColor = analytics.summary.healthScore >= 80 ? chalk.green : 
                        analytics.summary.healthScore >= 60 ? chalk.yellow : 
                        chalk.red;
      console.log(chalk.bold('Health Score: ') + healthColor(`${analytics.summary.healthScore}%`));
      
      // Log Statistics
      console.log(chalk.bold('\n📋 Log Statistics:'));
      console.log(`  Total Logs: ${analytics.logs.totalLogs}`);
      console.log(`  Error Rate: ${chalk.red((analytics.logs.errorRate * 100).toFixed(2) + '%')}`);
      console.log(`  Success Rate: ${chalk.green((analytics.logs.successRate * 100).toFixed(2) + '%')}`);
      console.log(`  Avg Duration: ${analytics.logs.avgDuration.toFixed(0)}ms`);
      
      // Logs by Category
      console.log(chalk.bold('\n📁 Logs by Category:'));
      Object.entries(analytics.logs.logsByCategory).forEach(([category, count]) => {
        console.log(`  ${category}: ${count}`);
      });
      
      // Alert Summary
      console.log(chalk.bold('\n🚨 Alert Summary:'));
      console.log(`  Total Alerts: ${analytics.alerts.totalAlerts}`);
      console.log(`  Active Alerts: ${chalk.yellow(analytics.alerts.activeAlerts)}`);
      if (analytics.alerts.unacknowledgedCritical > 0) {
        console.log(chalk.red(`  Unacknowledged Critical: ${analytics.alerts.unacknowledgedCritical}`));
      }
      
      // Top Errors
      if (analytics.logs.topErrors.length > 0) {
        console.log(chalk.bold('\n❌ Top Errors:'));
        analytics.logs.topErrors.slice(0, 5).forEach((error, idx) => {
          console.log(`  ${idx + 1}. ${error.errorCode} (${error.count} occurrences)`);
          console.log(chalk.gray(`     ${error.message}`));
        });
      }
      
      // Recommendations
      if (analytics.summary.recommendations.length > 0) {
        console.log(chalk.bold('\n💡 Recommendations:'));
        analytics.summary.recommendations.forEach((rec, idx) => {
          console.log(`  ${idx + 1}. ${rec}`);
        });
      }
    } catch (error) {
      console.error(chalk.red('Error generating analytics:'), error);
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
        console.log(chalk.yellow('🔍 Dry run mode - no data will be deleted'));
        
        const stats = await memoryBank.retentionManager.getRetentionStats();
        console.log(chalk.bold('\nCurrent retention statistics:'));
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log(chalk.blue('🧹 Running retention cleanup...'));
        
        const results = await memoryBank.runRetentionCleanup();
        
        console.log(chalk.green('\n✓ Cleanup completed:'));
        console.log(`  Logs deleted: ${results.logsDeleted}`);
        console.log(`  Snapshots deleted: ${results.snapshotsDeleted}`);
        console.log(`  Alerts deleted: ${results.alertsDeleted}`);
        console.log(`  Metrics deleted: ${results.metricsDeleted}`);
      }
    } catch (error) {
      console.error(chalk.red('Error running cleanup:'), error);
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
        console.log(chalk.yellow('No alerts found matching the criteria'));
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

      console.log(table.toString());
    } catch (error) {
      console.error(chalk.red('Error fetching alerts:'), error);
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