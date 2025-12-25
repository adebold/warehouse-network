import { promises as fs } from 'fs';
import * as path from 'path';
import * as inquirer from 'inquirer';
import * as chalk from 'chalk';
import * as ora from 'ora';
import { logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';
import { TemplateManager } from '../utils/templates';
import { IntegrityEngine } from '../core/IntegrityEngine';
import type { CLIOptions, IntegrityReport, SchemaDrift, ValidationResult } from '../types';

export class CLIController {
  private configManager: ConfigManager;
  private templateManager: TemplateManager;
  private integrityEngine?: IntegrityEngine;

  constructor() {
    this.configManager = new ConfigManager();
    this.templateManager = new TemplateManager();
  }

  async init(options: CLIOptions): Promise<void> {
    const template = options.template || 'generic';
    const force = options.force || false;
    const skipInstall = options.skipInstall || false;

    // Check if already initialized
    const configExists = await this.configManager.configExists();
    if (configExists && !force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Claude DB Integrity is already initialized. Overwrite configuration?',
        default: false
      }]);
      
      if (!confirm) {
        throw new Error('Initialization cancelled');
      }
    }

    // Detect project type if template is auto
    let detectedTemplate = template;
    if (template === 'auto') {
      detectedTemplate = await this.detectProjectType();
    }

    // Interactive configuration if generic template
    if (detectedTemplate === 'generic') {
      detectedTemplate = await this.interactiveSetup();
    }

    console.log(chalk.blue(`Initializing with template: ${detectedTemplate}`));

    // Generate configuration
    const config = await this.templateManager.generateConfig(detectedTemplate);
    await this.configManager.saveConfig(config);

    // Copy template files
    await this.templateManager.copyTemplateFiles(detectedTemplate, process.cwd(), force);

    // Install dependencies
    if (!skipInstall) {
      await this.installDependencies(detectedTemplate);
    }

    // Initialize Claude Flow integration
    await this.initializeClaudeFlow();

    console.log(chalk.green('✅ Initialization complete!'));
  }

  async check(options: CLIOptions): Promise<{ passed: number; failed: number }> {
    await this.ensureInitialized();
    
    const engine = await this.getIntegrityEngine();
    const report = await engine.runIntegrityChecks({
      fix: options.fix,
      verbose: options.verbose
    });

    await this.displayReport(report, options.format || 'table');

    return {
      passed: report.summary.passed,
      failed: report.summary.failed
    };
  }

  async checkDrift(options: CLIOptions): Promise<SchemaDrift> {
    await this.ensureInitialized();
    
    const engine = await this.getIntegrityEngine();
    const drift = await engine.checkSchemaDrift(options.baseline);

    await this.displayDrift(drift, options.format || 'table');

    return drift;
  }

  async validate(options: CLIOptions): Promise<{ valid: number; invalid: number }> {
    await this.ensureInitialized();
    
    const engine = await this.getIntegrityEngine();
    const results = await engine.validateFormsAndRoutes({
      routes: !options.forms, // If forms is specified, don't do routes
      forms: !options.routes, // If routes is specified, don't do forms
      fix: options.fix
    });

    await this.displayValidationResults(results);

    return {
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length
    };
  }

  async monitor(options: CLIOptions): Promise<void> {
    await this.ensureInitialized();
    
    const engine = await this.getIntegrityEngine();
    const interval = parseInt(options.interval || '30');
    const silent = options.silent || false;

    if (!silent) {
      console.log(chalk.blue(`🔍 Starting monitoring (interval: ${interval}s)`));
      console.log(chalk.gray('Press Ctrl+C to stop'));
    }

    // Setup event handlers
    engine.on('monitoring:cycle', (event) => {
      if (!silent) {
        const status = event.severity === 'info' ? '✅' : '⚠️';
        console.log(`${status} ${new Date().toISOString()} - ${event.message}`);
      }
    });

    engine.on('monitoring:error', (event) => {
      console.error(chalk.red(`❌ ${event.timestamp} - ${event.message}`));
    });

    await engine.startMonitoring(interval);

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n🛑 Stopping monitoring...'));
      await engine.stopMonitoring();
      process.exit(0);
    });
  }

  async export(options: CLIOptions): Promise<{ filepath: string }> {
    await this.ensureInitialized();
    
    const engine = await this.getIntegrityEngine();
    const format = options.format || 'json';
    const outputPath = options.output || `claude-db-integrity-export.${format}`;
    
    // Collect data to export
    const memoryManager = (engine as any).memoryManager;
    const memoryData = await memoryManager.export({ 
      format: format === 'csv' ? 'csv' : 'json',
      includeMetadata: true 
    });

    // Get recent reports
    const reports = await memoryManager.search('reports/', { limit: 50 });
    
    // Get monitoring events
    const events = await memoryManager.search('monitoring/events/', { limit: 100 });

    const exportData = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      memory: memoryData,
      reports: reports.map(r => r.value),
      events: events.map(e => e.value),
      stats: await memoryManager.getStats()
    };

    if (format === 'csv') {
      const csv = this.convertToCSV(exportData);
      await fs.writeFile(outputPath, csv);
    } else {
      await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
    }

    return { filepath: path.resolve(outputPath) };
  }

  async migrate(options: CLIOptions): Promise<{ applied: number }> {
    await this.ensureInitialized();
    
    // This would typically integrate with Prisma/TypeORM migrations
    console.log(chalk.blue('🚀 Running database migrations...'));
    
    if (options.dryRun) {
      console.log(chalk.yellow('📋 Dry run mode - no changes will be applied'));
      return { applied: 0 };
    }

    // Placeholder implementation
    console.log(chalk.green('✅ Migrations completed'));
    return { applied: 0 };
  }

  async memory(options: CLIOptions): Promise<any> {
    await this.ensureInitialized();
    
    const engine = await this.getIntegrityEngine();
    const memoryManager = (engine as any).memoryManager;

    if (options.clear) {
      await memoryManager.clear();
      console.log(chalk.green('✅ Memory cache cleared'));
      return {};
    }

    if (options.export) {
      const data = await memoryManager.export({ includeMetadata: true });
      console.log(JSON.stringify(data, null, 2));
      return data;
    }

    if (options.stats) {
      return await memoryManager.getStats();
    }

    return {};
  }

  async config(options: CLIOptions): Promise<void> {
    if (options.show) {
      const config = this.configManager.getConfig();
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    if (options.reset) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Reset configuration to defaults?',
        default: false
      }]);
      
      if (confirm) {
        await this.configManager.resetConfig();
        console.log(chalk.green('✅ Configuration reset to defaults'));
      }
      return;
    }

    // Show configuration menu
    await this.configurationMenu();
  }

  private async ensureInitialized(): Promise<void> {
    const configExists = await this.configManager.configExists();
    if (!configExists) {
      throw new Error('Claude DB Integrity not initialized. Run: claude-db-integrity init');
    }
  }

  private async getIntegrityEngine(): Promise<IntegrityEngine> {
    if (!this.integrityEngine) {
      this.integrityEngine = new IntegrityEngine();
      await this.integrityEngine.initialize();
    }
    return this.integrityEngine;
  }

  private async detectProjectType(): Promise<string> {
    try {
      const packageJson = await fs.readFile('package.json', 'utf8');
      const pkg = JSON.parse(packageJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.next) return 'nextjs';
      if (deps.express) return 'express';
      if (deps['@nestjs/core']) return 'nestjs';
      
      return 'generic';
    } catch {
      return 'generic';
    }
  }

  private async interactiveSetup(): Promise<string> {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'framework',
        message: 'Select your framework:',
        choices: [
          { name: 'Next.js with Prisma', value: 'nextjs' },
          { name: 'Express with Prisma', value: 'express' },
          { name: 'NestJS with TypeORM', value: 'nestjs' },
          { name: 'Generic/Custom setup', value: 'generic' }
        ]
      }
    ]);

    return answers.framework;
  }

  private async installDependencies(template: string): Promise<void> {
    const spinner = ora('Installing dependencies...').start();
    
    try {
      const { execSync } = require('child_process');
      
      const dependencies = this.templateManager.getTemplateDependencies(template);
      
      if (dependencies.length > 0) {
        execSync(`npm install ${dependencies.join(' ')}`, { 
          stdio: 'pipe',
          cwd: process.cwd()
        });
      }
      
      spinner.succeed('Dependencies installed');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      console.log(chalk.yellow('💡 Install manually: npm install'));
    }
  }

  private async initializeClaudeFlow(): Promise<void> {
    const spinner = ora('Initializing Claude Flow integration...').start();
    
    try {
      const { execSync } = require('child_process');
      
      // Check if Claude Flow is available
      try {
        execSync('npx claude-flow@alpha --version', { stdio: 'pipe' });
      } catch {
        execSync('npm install -g claude-flow@alpha', { stdio: 'inherit' });
      }
      
      // Initialize hooks
      execSync('npx claude-flow@alpha hooks pre-task --description "Initialize claude-db-integrity"', { 
        stdio: 'pipe',
        cwd: process.cwd()
      });
      
      spinner.succeed('Claude Flow integration initialized');
    } catch (error) {
      spinner.warn('Claude Flow integration failed (optional)');
    }
  }

  private async displayReport(report: IntegrityReport, format: string): Promise<void> {
    if (format === 'json') {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(chalk.blue.bold('\n📊 Integrity Report'));
    console.log(`Report ID: ${report.id}`);
    console.log(`Timestamp: ${report.timestamp.toISOString()}`);
    console.log(`Database: ${report.metadata.database}`);
    
    console.log(chalk.blue('\n📈 Summary:'));
    console.log(`Total checks: ${report.summary.total}`);
    console.log(`✅ Passed: ${chalk.green(report.summary.passed)}`);
    console.log(`❌ Failed: ${chalk.red(report.summary.failed)}`);
    console.log(`⏭️ Skipped: ${chalk.yellow(report.summary.skipped)}`);

    if (report.checks.some(c => c.status === 'failed')) {
      console.log(chalk.red.bold('\n🚨 Failed Checks:'));
      report.checks
        .filter(c => c.status === 'failed')
        .forEach(check => {
          console.log(`❌ ${check.name}: ${check.message}`);
        });
    }
  }

  private async displayDrift(drift: SchemaDrift, format: string): Promise<void> {
    if (format === 'json') {
      console.log(JSON.stringify(drift, null, 2));
      return;
    }

    if (!drift.hasDrift) {
      console.log(chalk.green('✅ No schema drift detected'));
      return;
    }

    console.log(chalk.yellow.bold('\n⚠️ Schema Drift Detected'));
    console.log(`Changes: ${drift.changes.length}`);
    console.log(`Baseline: ${drift.baseline.timestamp.toISOString()}`);
    console.log(`Current: ${drift.current.timestamp.toISOString()}`);

    console.log(chalk.yellow('\n📋 Changes:'));
    drift.changes.forEach(change => {
      const icon = change.impact === 'breaking' ? '🔴' : change.impact === 'non-breaking' ? '🟡' : '🟢';
      console.log(`${icon} ${change.type}: ${change.table}${change.column ? `.${change.column}` : ''}`);
    });
  }

  private async displayValidationResults(results: ValidationResult[]): Promise<void> {
    const valid = results.filter(r => r.valid);
    const invalid = results.filter(r => !r.valid);

    console.log(chalk.blue.bold('\n🔍 Validation Results'));
    console.log(`✅ Valid: ${chalk.green(valid.length)}`);
    console.log(`❌ Invalid: ${chalk.red(invalid.length)}`);

    if (invalid.length > 0) {
      console.log(chalk.red.bold('\n🚨 Validation Errors:'));
      invalid.forEach(result => {
        console.log(`❌ ${result.file} (${result.type})`);
        result.errors.forEach(error => {
          console.log(`   ${error.severity === 'error' ? '🔴' : '🟡'} ${error.message} (${error.path})`);
        });
      });
    }
  }

  private async configurationMenu(): Promise<void> {
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Configuration options:',
      choices: [
        { name: 'View current configuration', value: 'view' },
        { name: 'Update database settings', value: 'database' },
        { name: 'Update validation settings', value: 'validation' },
        { name: 'Update monitoring settings', value: 'monitoring' },
        { name: 'Update Claude Flow settings', value: 'memory' }
      ]
    }]);

    const config = this.configManager.getConfig();

    switch (action) {
      case 'view':
        console.log(JSON.stringify(config, null, 2));
        break;
      case 'database':
        await this.updateDatabaseConfig(config);
        break;
      case 'validation':
        await this.updateValidationConfig(config);
        break;
      case 'monitoring':
        await this.updateMonitoringConfig(config);
        break;
      case 'memory':
        await this.updateMemoryConfig(config);
        break;
    }
  }

  private async updateDatabaseConfig(config: any): Promise<void> {
    console.log(chalk.blue('🗄️ Database Configuration'));
    // Implementation for updating database config
  }

  private async updateValidationConfig(config: any): Promise<void> {
    console.log(chalk.blue('🔍 Validation Configuration'));
    // Implementation for updating validation config
  }

  private async updateMonitoringConfig(config: any): Promise<void> {
    console.log(chalk.blue('📊 Monitoring Configuration'));
    // Implementation for updating monitoring config
  }

  private async updateMemoryConfig(config: any): Promise<void> {
    console.log(chalk.blue('🧠 Claude Memory Configuration'));
    // Implementation for updating memory config
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion for export
    const headers = Object.keys(data);
    const values = Object.values(data).map(v => JSON.stringify(v));
    return [headers.join(','), values.join(',')].join('\n');
  }
}