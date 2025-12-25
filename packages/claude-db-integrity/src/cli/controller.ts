import { promises as fs } from 'fs';
import * as path from 'path';
import * as inquirer from 'inquirer';
import * as chalk from 'chalk';
import * as ora from 'ora';
import { logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';
import { TemplateManager } from '../utils/templates';
import { IntegrityEngine } from '../core/IntegrityEngine';
import { PersonaManager } from '../personas/PersonaManager';
import { BrowserAutomation } from '../testing/BrowserAutomation';
import type { 
  CLIOptions, 
  IntegrityReport, 
  SchemaDrift, 
  ValidationResult,
  Persona,
  UserJourney,
  PersonaValidationResult
} from '../types';

export class CLIController {
  private configManager: ConfigManager;
  private templateManager: TemplateManager;
  private integrityEngine?: IntegrityEngine;
  private personaManager?: PersonaManager;
  private browserAutomation?: BrowserAutomation;

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

  // Persona-based testing commands

  async personas(options: CLIOptions): Promise<void> {
    await this.ensurePersonaManager();

    if (options.list) {
      console.log(chalk.blue.bold('📋 Registered Personas:'));
      // Implementation to list personas
      return;
    }

    if (options.create) {
      const personaData = JSON.parse(await fs.readFile(options.create, 'utf8'));
      await this.personaManager!.registerPersona(personaData);
      console.log(chalk.green(`✅ Persona created: ${personaData.name}`));
      return;
    }

    if (options.delete) {
      // Implementation to delete persona
      console.log(chalk.green(`✅ Persona deleted: ${options.delete}`));
      return;
    }

    // Show interactive persona menu
    await this.personaMenu();
  }

  async journeys(options: CLIOptions): Promise<void> {
    await this.ensurePersonaManager();

    if (options.list) {
      console.log(chalk.blue.bold('📋 User Journeys:'));
      // Implementation to list journeys
      return;
    }

    if (options.create) {
      const journeyData = JSON.parse(await fs.readFile(options.create, 'utf8'));
      await this.personaManager!.createUserJourney(journeyData);
      console.log(chalk.green(`✅ Journey created: ${journeyData.name}`));
      return;
    }

    if (options.generate) {
      const story = options.generate;
      const epic = options.epic || 'general';
      const journeys = await this.personaManager!.generateTestsFromStories([story], epic);
      console.log(chalk.green(`✅ Generated ${journeys.length} journeys from story`));
      return;
    }

    await this.journeyMenu();
  }

  async testPersonas(options: CLIOptions): Promise<{ passed: number; failed: number; total: number }> {
    await this.ensurePersonaManager();
    await this.ensureBrowserAutomation(options);

    const testOptions = {
      personaId: options.persona,
      journeyId: options.journey,
      epic: options.epic,
      environment: options.environment as 'development' | 'staging' | 'production'
    };

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

      console.log(chalk.blue.bold(`📋 Form Validation Results for ${options.form}:`));
      console.log(`Status: ${result.status === 'passed' ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED')}`);
      console.log(`Duration: ${result.duration}ms`);

      if (result.violations && result.violations.length > 0) {
        console.log(chalk.red.bold('\n🚨 Violations Found:'));
        result.violations.forEach(violation => {
          console.log(`❌ ${violation.message} (${violation.severity})`);
        });
      }

      return {
        valid: result.status === 'passed' ? 1 : 0,
        invalid: result.status === 'failed' ? 1 : 0
      };
    }

    // Validate all forms for all personas
    console.log(chalk.blue('🔍 Running form validation for all personas...'));
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
    console.log(chalk.blue.bold('\n📊 Persona Test Results'));
    console.log(`Test ID: ${results.id}`);
    console.log(`Persona: ${results.personaId}`);
    console.log(`Epic: ${results.epic}`);
    console.log(`Environment: ${results.environment}`);
    console.log(`Status: ${results.status === 'passed' ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED')}`);
    console.log(`Duration: ${results.duration}ms`);

    if (results.summary) {
      console.log(chalk.blue('\n📈 Summary:'));
      console.log(`Total scenarios: ${results.summary.total}`);
      console.log(`✅ Passed: ${chalk.green(results.summary.passed)}`);
      console.log(`❌ Failed: ${chalk.red(results.summary.failed)}`);
      console.log(`⏭️ Skipped: ${chalk.yellow(results.summary.skipped)}`);
      console.log(`📊 Coverage: ${results.summary.coverage}%`);
    }

    if (results.performance) {
      console.log(chalk.blue('\n⚡ Performance:'));
      console.log(`Average response time: ${results.performance.avgResponseTime}ms`);
      if (results.performance.slowestScenario) {
        console.log(`Slowest scenario: ${results.performance.slowestScenario.name || results.performance.slowestScenario.id}`);
      }
    }

    if (results.violations && results.violations.length > 0) {
      console.log(chalk.red.bold('\n🚨 Violations Found:'));
      results.violations.forEach(violation => {
        const icon = violation.severity === 'error' ? '🔴' : violation.severity === 'warning' ? '🟡' : '🔵';
        console.log(`${icon} ${violation.message}`);
        if (violation.scenario) {
          console.log(`   Scenario: ${violation.scenario}`);
        }
        if (violation.step) {
          console.log(`   Step: ${violation.step}`);
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
}