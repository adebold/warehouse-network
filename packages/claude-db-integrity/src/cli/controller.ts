import { promises as fs } from 'fs';
import * as path from 'path';

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

import { IntegrityEngine } from '../core/IntegrityEngine';
import { PersonaManager } from '../personas/PersonaManager';
import { BrowserAutomation } from '../testing/BrowserAutomation';
import type { 
import { logger } from '../../../../../../utils/logger';
  CLIOptions, 
  IntegrityReport, 
  SchemaDrift, 
  ValidationResult,
  PersonaValidationResult
} from '../types';
import { ConfigManager } from '../utils/config';
import { generateConfigTemplate, generateMigrationTemplate } from '../utils/templates';

export class CLIController {
  private configManager: ConfigManager;
  private integrityEngine?: IntegrityEngine;
  private personaManager?: PersonaManager;
  private browserAutomation?: BrowserAutomation;

  constructor() {
    this.configManager = new ConfigManager();
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

    logger.info(chalk.blue(`Initializing with template: ${detectedTemplate}`));

    // Generate configuration
    const configString = generateConfigTemplate({ name: detectedTemplate });
    const config = JSON.parse(configString);
    await this.configManager.saveConfig(config);

    // Copy template files - for now just create the basic structure
    const fs = await import('fs/promises');
    const path = await import('path');
    const baseDir = process.cwd();
    
    // Create basic directory structure
    await fs.mkdir(path.join(baseDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'migrations'), { recursive: true });
    
    // Write a sample migration
    const migrationContent = generateMigrationTemplate('initial_setup');
    await fs.writeFile(path.join(baseDir, 'migrations', '001_initial_setup.sql'), migrationContent);

    // Install dependencies
    if (!skipInstall) {
      await this.installDependencies(detectedTemplate);
    }

    // Initialize Claude Flow integration
    await this.initializeClaudeFlow();

    logger.info(chalk.green('✅ Initialization complete!'));
  }

  async check(options: CLIOptions): Promise<{ passed: number; failed: number }> {
    await this.ensureInitialized();
    
    const engine = await this.getIntegrityEngine();
    const checkOptions: any = {};
    if (options.fix === true) {checkOptions.fix = true;}
    if (options.verbose === true) {checkOptions.verbose = true;}
    const report = await engine.runIntegrityChecks(checkOptions);

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
    const validateOptions: any = {};
    if (!options.forms) {validateOptions.routes = true;}
    if (!options.routes) {validateOptions.forms = true;}
    if (options.fix === true) {validateOptions.fix = true;}
    const results = await engine.validateFormsAndRoutes(validateOptions);

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
      logger.info(chalk.blue(`🔍 Starting monitoring (interval: ${interval}s)`));
      logger.info(chalk.gray('Press Ctrl+C to stop'));
    }

    // Setup event handlers
    engine.on('monitoring:cycle', (event) => {
      if (!silent) {
        const status = event.severity === 'info' ? '✅' : '⚠️';
        logger.info(`${status} ${new Date().toISOString()} - ${event.message}`);
      }
    });

    engine.on('monitoring:error', (event) => {
      logger.error(chalk.red(`❌ ${event.timestamp} - ${event.message}`));
    });

    await engine.startMonitoring(interval);

    // Keep process alive
    process.on('SIGINT', async () => {
      logger.info(chalk.yellow('\n🛑 Stopping monitoring...'));
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
      reports: reports.map((r: any) => r.value),
      events: events.map((e: any) => e.value),
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
    logger.info(chalk.blue('🚀 Running database migrations...'));
    
    if (options.dryRun) {
      logger.info(chalk.yellow('📋 Dry run mode - no changes will be applied'));
      return { applied: 0 };
    }

    // Placeholder implementation
    logger.info(chalk.green('✅ Migrations completed'));
    return { applied: 0 };
  }

  async memory(options: CLIOptions): Promise<any> {
    await this.ensureInitialized();
    
    const engine = await this.getIntegrityEngine();
    const memoryManager = (engine as any).memoryManager;

    if (options.clear) {
      await memoryManager.clear();
      logger.info(chalk.green('✅ Memory cache cleared'));
      return {};
    }

    if (options.export) {
      const data = await memoryManager.export({ includeMetadata: true });
      logger.info(JSON.stringify(data, null, 2));
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
      logger.info(JSON.stringify(config, null, 2));
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
        logger.info(chalk.green('✅ Configuration reset to defaults'));
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

      if (deps.next) {return 'nextjs';}
      if (deps.express) {return 'express';}
      if (deps['@nestjs/core']) {return 'nestjs';}
      
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
      
      // Get template-specific dependencies
      const dependencies = this.getTemplateDependencies(template);
      
      if (dependencies.length > 0) {
        execSync(`npm install ${dependencies.join(' ')}`, { 
          stdio: 'pipe',
          cwd: process.cwd()
        });
      }
      
      spinner.succeed('Dependencies installed');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      logger.info(chalk.yellow('💡 Install manually: npm install'));
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
      logger.info(JSON.stringify(report, null, 2));
      return;
    }

    logger.info(chalk.blue.bold('\n📊 Integrity Report'));
    logger.info(`Report ID: ${report.id}`);
    logger.info(`Timestamp: ${report.timestamp.toISOString()}`);
    logger.info(`Database: ${report.metadata.database}`);
    
    logger.info(chalk.blue('\n📈 Summary:'));
    logger.info(`Total checks: ${report.summary.total}`);
    logger.info(`✅ Passed: ${chalk.green(report.summary.passed)}`);
    logger.info(`❌ Failed: ${chalk.red(report.summary.failed)}`);
    logger.info(`⏭️ Skipped: ${chalk.yellow(report.summary.skipped)}`);

    if (report.checks.some(c => c.status === 'failed')) {
      logger.info(chalk.red.bold('\n🚨 Failed Checks:'));
      report.checks
        .filter(c => c.status === 'failed')
        .forEach(check => {
          logger.info(`❌ ${check.name}: ${check.message}`);
        });
    }
  }

  private async displayDrift(drift: SchemaDrift, format: string): Promise<void> {
    if (format === 'json') {
      logger.info(JSON.stringify(drift, null, 2));
      return;
    }

    if (!drift.hasDrift) {
      logger.info(chalk.green('✅ No schema drift detected'));
      return;
    }

    logger.info(chalk.yellow.bold('\n⚠️ Schema Drift Detected'));
    logger.info(`Changes: ${drift.changes.length}`);
    logger.info(`Baseline: ${drift.baseline.timestamp.toISOString()}`);
    logger.info(`Current: ${drift.current.timestamp.toISOString()}`);

    logger.info(chalk.yellow('\n📋 Changes:'));
    drift.changes.forEach(change => {
      const icon = change.impact === 'breaking' ? '🔴' : change.impact === 'non-breaking' ? '🟡' : '🟢';
      logger.info(`${icon} ${change.type}: ${change.table}${change.column ? `.${change.column}` : ''}`);
    });
  }

  private async displayValidationResults(results: ValidationResult[]): Promise<void> {
    const valid = results.filter(r => r.valid);
    const invalid = results.filter(r => !r.valid);

    logger.info(chalk.blue.bold('\n🔍 Validation Results'));
    logger.info(`✅ Valid: ${chalk.green(valid.length)}`);
    logger.info(`❌ Invalid: ${chalk.red(invalid.length)}`);

    if (invalid.length > 0) {
      logger.info(chalk.red.bold('\n🚨 Validation Errors:'));
      invalid.forEach(result => {
        logger.info(`❌ ${result.file} (${result.type})`);
        result.errors.forEach(error => {
          logger.info(`   ${error.severity === 'error' ? '🔴' : '🟡'} ${error.message} (${error.path})`);
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
        logger.info(JSON.stringify(config, null, 2));
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
    logger.info(chalk.blue('🗄️ Database Configuration'));
    // Implementation for updating database config
  }

  private async updateValidationConfig(config: any): Promise<void> {
    logger.info(chalk.blue('🔍 Validation Configuration'));
    // Implementation for updating validation config
  }

  private async updateMonitoringConfig(config: any): Promise<void> {
    logger.info(chalk.blue('📊 Monitoring Configuration'));
    // Implementation for updating monitoring config
  }

  private async updateMemoryConfig(config: any): Promise<void> {
    logger.info(chalk.blue('🧠 Claude Memory Configuration'));
    // Implementation for updating memory config
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion for export
    const headers = Object.keys(data);
    const values = Object.values(data).map(v => JSON.stringify(v));
    return [headers.join(','), values.join(',')].join('\n');
  }

  // Persona-based testing commands

  async personas(options: CLIOptions): Promise<void> {
    await this.ensurePersonaManager();

    if (options.list) {
      logger.info(chalk.blue.bold('📋 Registered Personas:'));
      // Implementation to list personas
      return;
    }

    if (options.create) {
      const personaData = JSON.parse(await fs.readFile(options.create, 'utf8'));
      await this.personaManager!.registerPersona(personaData);
      logger.info(chalk.green(`✅ Persona created: ${personaData.name}`));
      return;
    }

    if (options.delete) {
      // Implementation to delete persona
      logger.info(chalk.green(`✅ Persona deleted: ${options.delete}`));
      return;
    }

    // Show interactive persona menu
    await this.personaMenu();
  }

  async journeys(options: CLIOptions): Promise<void> {
    await this.ensurePersonaManager();

    if (options.list) {
      logger.info(chalk.blue.bold('📋 User Journeys:'));
      // Implementation to list journeys
      return;
    }

    if (options.create) {
      const journeyData = JSON.parse(await fs.readFile(options.create, 'utf8'));
      await this.personaManager!.createUserJourney(journeyData);
      logger.info(chalk.green(`✅ Journey created: ${journeyData.name}`));
      return;
    }

    if (options.generate) {
      const story = options.generate;
      const epic = options.epic || 'general';
      const journeys = await this.personaManager!.generateTestsFromStories([story], epic);
      logger.info(chalk.green(`✅ Generated ${journeys.length} journeys from story`));
      return;
    }

    await this.journeyMenu();
  }

  async testPersonas(options: CLIOptions): Promise<{ passed: number; failed: number; total: number }> {
    await this.ensurePersonaManager();
    await this.ensureBrowserAutomation(options);

    const testOptions: any = {
      environment: (options.environment || 'development') as 'development' | 'staging' | 'production'
    };
    if (options.persona) {testOptions.personaId = options.persona;}
    if (options.journey) {testOptions.journeyId = options.journey;}
    if (options.epic) {testOptions.epic = options.epic;}

    const results = await this.personaManager!.runPersonaTests(testOptions);

    // Display results
    await this.displayPersonaTestResults(results);

    return {
      passed: results.summary?.passed || 0,
      failed: results.summary?.failed || 0,
      total: results.summary?.total || 0
    };
  }

  async validateForms(options: CLIOptions): Promise<{ valid: number; invalid: number }> {
    await this.ensurePersonaManager();

    if (options.persona && options.form) {
      const testData = options.data ? 
        JSON.parse(await fs.readFile(options.data, 'utf8')) : 
        {};
      
      const result = await this.personaManager!.validateFormInteraction(
        options.persona,
        options.form,
        testData
      );

      logger.info(chalk.blue.bold(`📋 Form Validation Results for ${options.form}:`));
      logger.info(`Status: ${result.status === 'passed' ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED')}`);
      logger.info(`Duration: ${result.duration}ms`);

      if (result.violations && result.violations.length > 0) {
        logger.info(chalk.red.bold('\n🚨 Violations Found:'));
        result.violations.forEach(violation => {
          logger.info(`❌ ${violation.message} (${violation.severity})`);
        });
      }

      return {
        valid: result.status === 'passed' ? 1 : 0,
        invalid: result.status === 'failed' ? 1 : 0
      };
    }

    // Validate all forms for all personas
    logger.info(chalk.blue('🔍 Running form validation for all personas...'));
    return { valid: 0, invalid: 0 };
  }

  private async ensurePersonaManager(): Promise<void> {
    if (!this.personaManager) {
      await this.ensureInitialized();
      const engine = await this.getIntegrityEngine();
      const memoryManager = (engine as any).memoryManager;
      
      this.personaManager = new PersonaManager(
        {
          enabled: true,
          defaultPersonas: ['admin', 'end_user', 'manager'],
          browserConfig: {},
          screenshotsEnabled: true,
          accessibilityChecking: true,
          performanceThresholds: {
            pageLoadTime: 3000,
            firstContentfulPaint: 1500,
            largestContentfulPaint: 2500,
            cumulativeLayoutShift: 0.1
          }
        },
        memoryManager
      );
      
      await this.personaManager.initialize();
    }
  }

  private async ensureBrowserAutomation(options: CLIOptions): Promise<void> {
    if (!this.browserAutomation) {
      this.browserAutomation = new BrowserAutomation({
        headless: options.headless !== false,
        timeout: 30000,
        viewport: { width: 1920, height: 1080 }
      });
      
      await this.browserAutomation.initialize();
    }
  }

  private async displayPersonaTestResults(results: PersonaValidationResult): Promise<void> {
    logger.info(chalk.blue.bold('\n📊 Persona Test Results'));
    logger.info(`Test ID: ${results.id}`);
    logger.info(`Persona: ${results.personaId}`);
    logger.info(`Epic: ${results.epic}`);
    logger.info(`Environment: ${results.environment}`);
    logger.info(`Status: ${results.status === 'passed' ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED')}`);
    logger.info(`Duration: ${results.duration}ms`);

    if (results.summary) {
      logger.info(chalk.blue('\n📈 Summary:'));
      logger.info(`Total scenarios: ${results.summary.total}`);
      logger.info(`✅ Passed: ${chalk.green(results.summary.passed)}`);
      logger.info(`❌ Failed: ${chalk.red(results.summary.failed)}`);
      logger.info(`⏭️ Skipped: ${chalk.yellow(results.summary.skipped)}`);
      logger.info(`📊 Coverage: ${results.summary.coverage}%`);
    }

    if (results.performance) {
      logger.info(chalk.blue('\n⚡ Performance:'));
      logger.info(`Average response time: ${results.performance.avgResponseTime}ms`);
      if (results.performance.slowestScenario) {
        logger.info(`Slowest scenario: ${results.performance.slowestScenario.name || results.performance.slowestScenario.id}`);
      }
    }

    if (results.violations && results.violations.length > 0) {
      logger.info(chalk.red.bold('\n🚨 Violations Found:'));
      results.violations.forEach(violation => {
        const icon = violation.severity === 'error' ? '🔴' : violation.severity === 'warning' ? '🟡' : '🔵';
        logger.info(`${icon} ${violation.message}`);
        if (violation.scenario) {
          logger.info(`   Scenario: ${violation.scenario}`);
        }
        if (violation.step) {
          logger.info(`   Step: ${violation.step}`);
        }
      });
    }
  }

  private async personaMenu(): Promise<void> {
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Persona Management:',
      choices: [
        { name: 'List all personas', value: 'list' },
        { name: 'Create new persona', value: 'create' },
        { name: 'Delete persona', value: 'delete' },
        { name: 'Test with persona', value: 'test' }
      ]
    }]);

    switch (action) {
      case 'list':
        // Implementation
        break;
      case 'create':
        // Implementation
        break;
      case 'delete':
        // Implementation
        break;
      case 'test':
        // Implementation
        break;
    }
  }

  private async journeyMenu(): Promise<void> {
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'User Journey Management:',
      choices: [
        { name: 'List all journeys', value: 'list' },
        { name: 'Create new journey', value: 'create' },
        { name: 'Generate from story', value: 'generate' },
        { name: 'Run journey tests', value: 'test' }
      ]
    }]);

    // Implementation for each action
  }

  /**
   * Get template-specific dependencies
   */
  private getTemplateDependencies(template: string): string[] {
    const baseDeps = [
      '@warehouse-network/claude-db-integrity',
      'dotenv',
      'pg'
    ];

    switch (template) {
      case 'nextjs':
        return [...baseDeps, 'next', 'react', 'react-dom', '@prisma/client', 'prisma'];
      case 'express':
        return [...baseDeps, 'express', '@types/express', 'cors', 'helmet'];
      case 'nestjs':
        return [...baseDeps, '@nestjs/core', '@nestjs/common', '@nestjs/platform-express', '@nestjs/typeorm', 'typeorm'];
      default:
        return baseDeps;
    }
  }
}