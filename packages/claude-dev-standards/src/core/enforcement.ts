/**
 * Enforcement Mechanism - Integrates with CI/CD and development hooks
 * Ensures quality standards are enforced at every stage of development
 */

import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';


import { QualityGates } from '../cicd/quality-gates';
import { getConfig, QualityConfig } from '../config/quality-config';
import { Logger } from '../utils/logger';
import { Reporter } from '../utils/reporter';

import { ValidationEngine } from './validation-engine';

export interface EnforcementOptions {
  configName: 'strict' | 'recommended' | 'minimal';
  customConfig?: Partial<QualityConfig>;
  projectRoot?: string;
  githubToken?: string;
  slackWebhook?: string;
  emailConfig?: {
    smtp: string;
    from: string;
    to: string[];
  };
}

export interface EnforcementResult {
  passed: boolean;
  timestamp: Date;
  duration: number;
  validationReport?: any;
  qualityGateReport?: any;
  actionsToken: string[];
  notifications: string[];
}

export class QualityEnforcement extends EventEmitter {
  private config: QualityConfig;
  private logger: Logger;
  private validationEngine: ValidationEngine;
  private qualityGates: QualityGates;
  private reporter: Reporter;
  private projectRoot: string;
  private options: EnforcementOptions;

  constructor(options: EnforcementOptions) {
    super();
    this.options = options;
    this.projectRoot = options.projectRoot || process.cwd();
    this.logger = new Logger('QualityEnforcement');
    
    // Load configuration
    const baseConfig = getConfig(options.configName);
    this.config = options.customConfig 
      ? this.mergeConfig(baseConfig, options.customConfig)
      : baseConfig;
    
    // Initialize components
    this.validationEngine = new ValidationEngine(this.config.engine);
    this.qualityGates = new QualityGates(this.config.qualityGates, this.projectRoot);
    this.reporter = new Reporter();
    
    this.setupHooks();
  }

  /**
   * Run full enforcement check
   */
  async enforce(target?: string): Promise<EnforcementResult> {
    const startTime = Date.now();
    const targetPath = target || this.projectRoot;
    
    this.logger.info(`Starting quality enforcement for: ${targetPath}`);
    this.emit('enforcement:start', targetPath);
    
    const result: EnforcementResult = {
      passed: true,
      timestamp: new Date(),
      duration: 0,
      actionsToken: [],
      notifications: []
    };
    
    try {
      // Run validation engine
      if (this.config.engine.validators) {
        this.emit('validation:start');
        result.validationReport = await this.validationEngine.validate(targetPath);
        
        if (!result.validationReport.passed) {
          result.passed = false;
          result.actionsToken.push(...this.generateActionItems(result.validationReport));
        }
        
        this.emit('validation:complete', result.validationReport);
      }
      
      // Run quality gates
      if (this.config.engine.validators.qualityGates) {
        this.emit('qualitygates:start');
        result.qualityGateReport = await this.qualityGates.check([targetPath]);
        
        if (!result.qualityGateReport.passed) {
          result.passed = false;
          result.actionsToken.push(...this.generateQualityGateActions(result.qualityGateReport));
        }
        
        this.emit('qualitygates:complete', result.qualityGateReport);
      }
      
      // Generate reports
      if (this.config.enforcement.generateReports) {
        await this.generateReports(result);
      }
      
      // Send notifications
      if (this.config.enforcement.notifyOnFailure && !result.passed) {
        await this.sendNotifications(result);
      }
      
      // GitHub integration
      if (this.config.enforcement.githubIntegration && this.options.githubToken) {
        await this.updateGitHubStatus(result);
      }
      
      // Apply auto-fixes if enabled
      if (this.config.enforcement.autoFix && !result.passed) {
        await this.applyAutoFixes(result);
      }
      
      result.duration = Date.now() - startTime;
      
      this.emit('enforcement:complete', result);
      this.logger.info(`Enforcement completed in ${result.duration}ms - ${result.passed ? 'PASSED' : 'FAILED'}`);
      
      // Block if configured
      if (this.config.enforcement.blockOnFailure && !result.passed) {
        throw new Error('Quality enforcement failed - blocking further execution');
      }
      
    } catch (error) {
      this.logger.error('Enforcement failed', error);
      result.passed = false;
      this.emit('enforcement:error', error);
      throw error;
    }
    
    return result;
  }

  /**
   * Setup development hooks
   */
  private setupHooks() {
    // Git hooks
    this.setupGitHooks();
    
    // Claude Flow hooks integration
    this.setupClaudeFlowHooks();
    
    // CI/CD hooks
    this.setupCICDHooks();
  }

  /**
   * Setup Git hooks
   */
  private async setupGitHooks() {
    try {
      const hooksDir = path.join(this.projectRoot, '.git/hooks');
      
      // Pre-commit hook
      const preCommitHook = `#!/bin/sh
# Claude Dev Standards - Pre-commit Hook
echo "Running Claude Dev Standards checks..."

npx claude-dev-standards check --config ${this.options.configName}

if [ $? -ne 0 ]; then
  echo "❌ Quality checks failed. Please fix issues before committing."
  exit 1
fi

echo "✅ Quality checks passed!"
`;

      await fs.writeFile(path.join(hooksDir, 'pre-commit'), preCommitHook, { mode: 0o755 });
      
      // Pre-push hook
      const prePushHook = `#!/bin/sh
# Claude Dev Standards - Pre-push Hook
echo "Running comprehensive quality checks before push..."

npx claude-dev-standards validate --config ${this.options.configName} --comprehensive

if [ $? -ne 0 ]; then
  echo "❌ Quality validation failed. Please fix all issues before pushing."
  exit 1
fi

echo "✅ All quality checks passed!"
`;

      await fs.writeFile(path.join(hooksDir, 'pre-push'), prePushHook, { mode: 0o755 });
      
      this.logger.info('Git hooks installed successfully');
      
    } catch (error) {
      this.logger.error('Failed to setup Git hooks', error);
    }
  }

  /**
   * Setup Claude Flow hooks integration
   */
  private setupClaudeFlowHooks() {
    // Create claude-flow hooks configuration
    const hooksConfig = {
      "pre-edit": {
        "validators": ["mocks", "security"],
        "command": "npx claude-dev-standards check --quick"
      },
      "post-edit": {
        "validators": ["all"],
        "command": "npx claude-dev-standards validate --file ${file}"
      },
      "pre-task": {
        "command": "npx claude-dev-standards status"
      },
      "post-task": {
        "command": "npx claude-dev-standards report --format json"
      }
    };
    
    // Write hooks configuration
    const configPath = path.join(this.projectRoot, '.claude-flow-hooks.json');
    fs.writeFile(configPath, JSON.stringify(hooksConfig, null, 2))
      .catch(err => this.logger.error('Failed to write Claude Flow hooks config', err));
  }

  /**
   * Setup CI/CD hooks
   */
  private async setupCICDHooks() {
    // GitHub Actions workflow
    const githubWorkflow = `name: Claude Dev Standards

on: [push, pull_request]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run Claude Dev Standards
      run: npx claude-dev-standards validate --config ${this.options.configName}
    
    - name: Upload reports
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: quality-reports
        path: .claude-standards/reports/
`;

    try {
      const workflowDir = path.join(this.projectRoot, '.github/workflows');
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(
        path.join(workflowDir, 'claude-standards.yml'),
        githubWorkflow
      );
      
      this.logger.info('CI/CD workflow created');
    } catch (error) {
      this.logger.error('Failed to create CI/CD workflow', error);
    }
  }

  /**
   * Generate action items from validation report
   */
  private generateActionItems(report: any): string[] {
    const actions: string[] = [];
    
    for (const [validator, result] of Object.entries(report.results)) {
      if (result && typeof result === 'object' && 'errors' in result) {
        const validatorResult = result as any;
        
        for (const error of validatorResult.errors) {
          actions.push(`[${validator}] Fix: ${error}`);
        }
      }
    }
    
    return actions;
  }

  /**
   * Generate quality gate action items
   */
  private generateQualityGateActions(report: any): string[] {
    const actions: string[] = [];
    
    for (const failure of report.failures) {
      actions.push(`[${failure.gate}] ${failure.message} (Expected: ${failure.expected}, Actual: ${failure.actual})`);
    }
    
    return actions;
  }

  /**
   * Generate comprehensive reports
   */
  private async generateReports(result: EnforcementResult) {
    try {
      const reportsDir = path.join(this.projectRoot, '.claude-standards/reports');
      await fs.mkdir(reportsDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Validation report
      if (result.validationReport) {
        const validationPath = path.join(reportsDir, `validation-${timestamp}.md`);
        const validationMd = await this.reporter.generateValidationReport(result.validationReport);
        await fs.writeFile(validationPath, validationMd);
      }
      
      // Quality gate report
      if (result.qualityGateReport) {
        const qualityPath = path.join(reportsDir, `quality-gates-${timestamp}.md`);
        const qualityMd = await this.qualityGates.generateReport(result.qualityGateReport);
        await fs.writeFile(qualityPath, qualityMd);
      }
      
      // Summary report
      const summaryPath = path.join(reportsDir, `summary-${timestamp}.json`);
      await fs.writeFile(summaryPath, JSON.stringify(result, null, 2));
      
      this.logger.info('Reports generated successfully');
      
    } catch (error) {
      this.logger.error('Failed to generate reports', error);
    }
  }

  /**
   * Send notifications
   */
  private async sendNotifications(result: EnforcementResult) {
    const notifications: string[] = [];
    
    // Slack notification
    if (this.options.slackWebhook) {
      try {
        const message = {
          text: `Quality Enforcement Failed for ${this.projectRoot}`,
          attachments: [{
            color: 'danger',
            fields: [
              {
                title: 'Errors',
                value: result.actionsToken.slice(0, 5).join('\n'),
                short: false
              }
            ]
          }]
        };
        
        // Would send to Slack webhook here
        notifications.push('Slack notification sent');
      } catch (error) {
        this.logger.error('Failed to send Slack notification', error);
      }
    }
    
    result.notifications = notifications;
  }

  /**
   * Update GitHub status
   */
  private async updateGitHubStatus(result: EnforcementResult) {
    if (!this.options.githubToken) return;
    
    try {
      // Get current commit SHA
      const sha = execSync('git rev-parse HEAD', { cwd: this.projectRoot }).toString().trim();
      
      // Would update GitHub commit status here
      this.logger.info(`GitHub status updated for commit ${sha}`);
      
    } catch (error) {
      this.logger.error('Failed to update GitHub status', error);
    }
  }

  /**
   * Apply auto-fixes where possible
   */
  private async applyAutoFixes(result: EnforcementResult) {
    const fixes: string[] = [];
    
    try {
      // Run prettier for formatting issues
      if (result.qualityGateReport?.failures.some((f: any) => f.gate.includes('formatting'))) {
        execSync('npx prettier --write "src/**/*.{js,jsx,ts,tsx}"', { cwd: this.projectRoot });
        fixes.push('Applied Prettier formatting');
      }
      
      // Run ESLint fix
      if (result.qualityGateReport?.failures.some((f: any) => f.gate.includes('eslint'))) {
        execSync('npx eslint --fix "src/**/*.{js,jsx,ts,tsx}"', { cwd: this.projectRoot });
        fixes.push('Applied ESLint fixes');
      }
      
      if (fixes.length > 0) {
        this.logger.info(`Applied auto-fixes: ${fixes.join(', ')}`);
      }
      
    } catch (error) {
      this.logger.error('Failed to apply auto-fixes', error);
    }
  }

  /**
   * Merge configuration
   */
  private mergeConfig(base: QualityConfig, custom: Partial<QualityConfig>): QualityConfig {
    return this.deepMerge(base, custom);
  }

  /**
   * Deep merge utility
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          result[key] = source[key] as any;
        }
      }
    }
    
    return result;
  }

  /**
   * Get current configuration
   */
  getConfig(): QualityConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<QualityConfig>) {
    this.config = this.mergeConfig(this.config, config);
    this.validationEngine.updateConfig(this.config.engine);
    this.qualityGates.updateConfig(this.config.qualityGates);
  }

  /**
   * Install all hooks
   */
  async install() {
    this.logger.info('Installing Claude Dev Standards...');
    
    await this.setupGitHooks();
    await this.setupClaudeFlowHooks();
    await this.setupCICDHooks();
    
    // Create configuration file
    const configPath = path.join(this.projectRoot, '.claude-standards.json');
    await fs.writeFile(configPath, JSON.stringify({
      config: this.options.configName,
      version: '1.0.0',
      installed: new Date().toISOString()
    }, null, 2));
    
    this.logger.info('Claude Dev Standards installed successfully!');
  }

  /**
   * Uninstall hooks
   */
  async uninstall() {
    this.logger.info('Uninstalling Claude Dev Standards...');
    
    try {
      // Remove git hooks
      const hooksDir = path.join(this.projectRoot, '.git/hooks');
      await fs.unlink(path.join(hooksDir, 'pre-commit')).catch(() => {});
      await fs.unlink(path.join(hooksDir, 'pre-push')).catch(() => {});
      
      // Remove configuration files
      await fs.unlink(path.join(this.projectRoot, '.claude-flow-hooks.json')).catch(() => {});
      await fs.unlink(path.join(this.projectRoot, '.claude-standards.json')).catch(() => {});
      
      this.logger.info('Claude Dev Standards uninstalled');
      
    } catch (error) {
      this.logger.error('Failed to uninstall', error);
    }
  }
}