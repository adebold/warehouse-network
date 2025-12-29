/**
 * Validation Engine - Core validation system that orchestrates all validators
 * Provides comprehensive validation across code quality, security, testing, and standards
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

import { CodeQualityAnalyzer } from '@warehouse-network/claude-code-quality';

import { QualityGates } from '../cicd/quality-gates';
import { StandardsConfig, ValidationResult } from '../types';
import { Logger } from '../utils/logger';
import { AuthValidator } from '../validators/auth';
import { DatabaseValidator } from '../validators/database';
import { LoggingValidator } from '../validators/logging';
import { MockValidator } from '../validators/mocks';
import { SecurityValidator } from '../validators/security';
import { TestingValidator } from '../validators/testing';


export interface ValidationEngineConfig {
  standards: StandardsConfig;
  validators: {
    mocks: boolean;
    auth: boolean;
    database: boolean;
    security: boolean;
    testing: boolean;
    logging: boolean;
    qualityGates: boolean;
    codeQuality: boolean;
  };
  parallel: boolean;
  failFast: boolean;
  reportFormat: 'json' | 'markdown' | 'html';
  outputDir?: string;
}

export interface ValidationReport {
  timestamp: Date;
  duration: number;
  target: string;
  passed: boolean;
  summary: ValidationSummary;
  results: Record<string, ValidationResult>;
  qualityMetrics?: any;
  recommendations: string[];
}

export interface ValidationSummary {
  totalValidators: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  warnings: number;
  criticalIssues: string[];
}

export class ValidationEngine extends EventEmitter {
  private config: ValidationEngineConfig;
  private logger: Logger;
  private validators: Map<string, any>;
  private qualityGates: QualityGates;
  private codeAnalyzer: CodeQualityAnalyzer;

  constructor(config?: Partial<ValidationEngineConfig>) {
    super();
    this.logger = new Logger('ValidationEngine');
    this.config = this.mergeWithDefaults(config);
    this.validators = new Map();
    
    // Initialize validators based on config
    this.initializeValidators();
    
    // Initialize quality gates
    this.qualityGates = new QualityGates();
    
    // Initialize code analyzer
    this.codeAnalyzer = new CodeQualityAnalyzer();
    
    this.setupEventHandlers();
  }

  /**
   * Validate a target (file, directory, or project)
   */
  async validate(target: string): Promise<ValidationReport> {
    this.logger.info(`Starting validation for: ${target}`);
    const startTime = Date.now();
    
    this.emit('validation:start', target);
    
    const report: ValidationReport = {
      timestamp: new Date(),
      duration: 0,
      target,
      passed: true,
      summary: {
        totalValidators: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: 0,
        warnings: 0,
        criticalIssues: []
      },
      results: {},
      recommendations: []
    };
    
    try {
      // Verify target exists
      const targetStats = await fs.stat(target).catch(() => null);
      if (!targetStats) {
        throw new Error(`Target not found: ${target}`);
      }
      
      // Get enabled validators
      const enabledValidators = this.getEnabledValidators();
      report.summary.totalValidators = enabledValidators.length;
      
      // Run validations
      const validationPromises = enabledValidators.map(async ([name, validator]) => {
        this.emit('validator:start', name);
        
        try {
          const result = await this.runValidator(name, validator, target);
          this.emit('validator:complete', name, result);
          return { name, result };
        } catch (error) {
          this.logger.error(`Validator ${name} failed`, error);
          this.emit('validator:error', name, error);
          
          if (this.config.failFast) {
            throw error;
          }
          
          return {
            name,
            result: {
              valid: false,
              errors: [`Validator failed: ${error.message}`],
              warnings: []
            }
          };
        }
      });
      
      // Execute validations (parallel or sequential)
      const validationResults = this.config.parallel
        ? await Promise.all(validationPromises)
        : await this.runSequential(validationPromises);
      
      // Process results
      for (const { name, result } of validationResults) {
        report.results[name] = result;
        
        if (result.valid) {
          report.summary.passed++;
        } else {
          report.summary.failed++;
          report.passed = false;
        }
        
        report.summary.errors += result.errors.length;
        report.summary.warnings += result.warnings.length;
        
        // Identify critical issues
        if (!result.valid && this.isCriticalValidator(name)) {
          report.summary.criticalIssues.push(
            `${name}: ${result.errors.join(', ')}`
          );
        }
      }
      
      // Run quality gates if enabled
      if (this.config.validators.qualityGates) {
        this.emit('qualitygates:start');
        
        try {
          const qualityResult = await this.qualityGates.check([target]);
          report.qualityMetrics = qualityResult;
          
          if (!qualityResult.passed) {
            report.passed = false;
            report.summary.criticalIssues.push(
              `Quality gates failed: ${  qualityResult.failures
                .map(f => f.message)
                .join(', ')}`
            );
          }
          
          this.emit('qualitygates:complete', qualityResult);
        } catch (error) {
          this.logger.error('Quality gates check failed', error);
          this.emit('qualitygates:error', error);
        }
      }
      
      // Run code quality analysis if enabled
      if (this.config.validators.codeQuality) {
        this.emit('codeanalysis:start');
        
        try {
          const analysisResult = await this.codeAnalyzer.analyze([target]);
          
          // Add code quality results to report
          report.results['codeQuality'] = {
            valid: analysisResult.summary.overallScore >= 70,
            errors: analysisResult.issues
              .filter(i => i.severity === 'error' || i.severity === 'critical')
              .map(i => i.message),
            warnings: analysisResult.issues
              .filter(i => i.severity === 'warning')
              .map(i => i.message)
          };
          
          // Add AI-powered recommendations
          if (analysisResult.aiInsights?.recommendations) {
            report.recommendations.push(
              ...analysisResult.aiInsights.recommendations
                .map(r => r.description)
            );
          }
          
          this.emit('codeanalysis:complete', analysisResult);
        } catch (error) {
          this.logger.error('Code analysis failed', error);
          this.emit('codeanalysis:error', error);
        }
      }
      
      // Generate recommendations
      report.recommendations.push(...this.generateRecommendations(report));
      
      // Calculate duration
      report.duration = Date.now() - startTime;
      
      // Save report if output directory specified
      if (this.config.outputDir) {
        await this.saveReport(report);
      }
      
      this.emit('validation:complete', report);
      
      this.logger.info(`Validation completed in ${report.duration}ms`, {
        passed: report.passed,
        errors: report.summary.errors,
        warnings: report.summary.warnings
      });
      
    } catch (error) {
      this.logger.error('Validation failed', error);
      report.passed = false;
      report.summary.criticalIssues.push(`Validation error: ${error.message}`);
      report.duration = Date.now() - startTime;
      
      this.emit('validation:error', error);
    }
    
    return report;
  }

  /**
   * Initialize validators based on configuration
   */
  private initializeValidators() {
    const { validators } = this.config;
    
    if (validators.mocks) {
      this.validators.set('mocks', new MockValidator({
        strictMode: this.config.standards.noMocks,
        allowInTests: false
      }));
    }
    
    if (validators.auth) {
      this.validators.set('auth', new AuthValidator());
    }
    
    if (validators.database) {
      this.validators.set('database', new DatabaseValidator());
    }
    
    if (validators.security) {
      this.validators.set('security', new SecurityValidator());
    }
    
    if (validators.testing) {
      this.validators.set('testing', new TestingValidator());
    }
    
    if (validators.logging) {
      this.validators.set('logging', new LoggingValidator());
    }
  }

  /**
   * Get enabled validators
   */
  private getEnabledValidators(): Array<[string, any]> {
    return Array.from(this.validators.entries());
  }

  /**
   * Run a single validator
   */
  private async runValidator(name: string, validator: any, target: string): Promise<ValidationResult> {
    this.logger.debug(`Running validator: ${name}`);
    
    // All validators should have a validate method
    if (typeof validator.validate !== 'function') {
      throw new Error(`Validator ${name} does not have a validate method`);
    }
    
    const result = await validator.validate(target);
    
    // Ensure result has required properties
    if (!result || typeof result.valid !== 'boolean') {
      throw new Error(`Validator ${name} returned invalid result`);
    }
    
    return {
      valid: result.valid,
      errors: result.errors || [],
      warnings: result.warnings || []
    };
  }

  /**
   * Run promises sequentially
   */
  private async runSequential<T>(promises: Promise<T>[]): Promise<T[]> {
    const results: T[] = [];
    
    for (const promise of promises) {
      results.push(await promise);
    }
    
    return results;
  }

  /**
   * Check if validator is critical
   */
  private isCriticalValidator(name: string): boolean {
    const criticalValidators = ['mocks', 'security', 'database', 'auth'];
    return criticalValidators.includes(name);
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(report: ValidationReport): string[] {
    const recommendations: string[] = [];
    
    // Check for specific failure patterns
    if (report.results.mocks && !report.results.mocks.valid) {
      recommendations.push(
        'Replace all mock implementations with production-ready services',
        'Implement real PostgreSQL database connections',
        'Use actual authentication services instead of hardcoded credentials'
      );
    }
    
    if (report.results.security && !report.results.security.valid) {
      recommendations.push(
        'Implement proper security headers using Helmet.js',
        'Add input validation and sanitization',
        'Enable rate limiting on all API endpoints',
        'Implement CSRF protection'
      );
    }
    
    if (report.results.database && !report.results.database.valid) {
      recommendations.push(
        'Set up database migrations using a migration tool',
        'Implement connection pooling for better performance',
        'Add database transaction support for data integrity',
        'Enable SSL for database connections in production'
      );
    }
    
    if (report.results.testing && report.results.testing.warnings.length > 0) {
      recommendations.push(
        'Increase test coverage to at least 80%',
        'Add integration tests for critical paths',
        'Implement end-to-end tests for user workflows'
      );
    }
    
    if (report.summary.warnings > 10) {
      recommendations.push(
        'Address warnings to improve code quality',
        'Consider running auto-fix tools for common issues'
      );
    }
    
    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Save validation report
   */
  private async saveReport(report: ValidationReport) {
    try {
      const outputDir = this.config.outputDir!;
      await fs.mkdir(outputDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `validation-report-${timestamp}.${this.config.reportFormat}`;
      const filePath = path.join(outputDir, filename);
      
      let content: string;
      
      switch (this.config.reportFormat) {
        case 'json':
          content = JSON.stringify(report, null, 2);
          break;
        
        case 'markdown':
          content = this.generateMarkdownReport(report);
          break;
        
        case 'html':
          content = this.generateHtmlReport(report);
          break;
        
        default:
          throw new Error(`Unsupported format: ${this.config.reportFormat}`);
      }
      
      await fs.writeFile(filePath, content, 'utf-8');
      this.logger.info(`Report saved to: ${filePath}`);
      
    } catch (error) {
      this.logger.error('Failed to save report', error);
    }
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(report: ValidationReport): string {
    let markdown = `# Validation Report\n\n`;
    markdown += `**Target:** ${report.target}\n`;
    markdown += `**Status:** ${report.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
    markdown += `**Timestamp:** ${report.timestamp.toISOString()}\n`;
    markdown += `**Duration:** ${report.duration}ms\n\n`;
    
    markdown += `## Summary\n\n`;
    markdown += `- Total Validators: ${report.summary.totalValidators}\n`;
    markdown += `- Passed: ${report.summary.passed}\n`;
    markdown += `- Failed: ${report.summary.failed}\n`;
    markdown += `- Errors: ${report.summary.errors}\n`;
    markdown += `- Warnings: ${report.summary.warnings}\n\n`;
    
    if (report.summary.criticalIssues.length > 0) {
      markdown += `## Critical Issues\n\n`;
      report.summary.criticalIssues.forEach(issue => {
        markdown += `- ❌ ${issue}\n`;
      });
      markdown += '\n';
    }
    
    markdown += `## Validation Results\n\n`;
    for (const [name, result] of Object.entries(report.results)) {
      const icon = result.valid ? '✅' : '❌';
      markdown += `### ${icon} ${name}\n\n`;
      
      if (result.errors.length > 0) {
        markdown += `**Errors:**\n`;
        result.errors.forEach(error => {
          markdown += `- ${error}\n`;
        });
        markdown += '\n';
      }
      
      if (result.warnings.length > 0) {
        markdown += `**Warnings:**\n`;
        result.warnings.forEach(warning => {
          markdown += `- ${warning}\n`;
        });
        markdown += '\n';
      }
    }
    
    if (report.recommendations.length > 0) {
      markdown += `## Recommendations\n\n`;
      report.recommendations.forEach(rec => {
        markdown += `- ${rec}\n`;
      });
    }
    
    return markdown;
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(report: ValidationReport): string {
    const statusClass = report.passed ? 'status-passed' : 'status-failed';
    const statusText = report.passed ? 'PASSED' : 'FAILED';
    const statusIcon = report.passed ? '✅' : '❌';
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>Validation Report - ${report.target}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 { margin-top: 20px; }
    .status-passed { color: #28a745; }
    .status-failed { color: #dc3545; }
    .summary-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .validator-result {
      border: 1px solid #dee2e6;
      padding: 15px;
      margin: 10px 0;
      border-radius: 5px;
    }
    .validator-passed { border-left: 4px solid #28a745; }
    .validator-failed { border-left: 4px solid #dc3545; }
    .error-list, .warning-list {
      margin: 10px 0;
      padding-left: 20px;
    }
    .error-item { color: #dc3545; }
    .warning-item { color: #ffc107; }
    .recommendations {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 5px;
      margin-top: 20px;
    }
    .critical-issues {
      background: #ffebee;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>Validation Report</h1>
  
  <div class="summary-card">
    <h2>${statusIcon} Status: <span class="${statusClass}">${statusText}</span></h2>
    <p><strong>Target:</strong> ${report.target}</p>
    <p><strong>Timestamp:</strong> ${report.timestamp.toISOString()}</p>
    <p><strong>Duration:</strong> ${report.duration}ms</p>
    
    <h3>Summary</h3>
    <ul>
      <li>Total Validators: ${report.summary.totalValidators}</li>
      <li>Passed: ${report.summary.passed}</li>
      <li>Failed: ${report.summary.failed}</li>
      <li>Errors: ${report.summary.errors}</li>
      <li>Warnings: ${report.summary.warnings}</li>
    </ul>
  </div>
  
  ${report.summary.criticalIssues.length > 0 ? `
  <div class="critical-issues">
    <h3>❌ Critical Issues</h3>
    <ul>
      ${report.summary.criticalIssues.map(issue => `<li>${issue}</li>`).join('')}
    </ul>
  </div>
  ` : ''}
  
  <h2>Validation Results</h2>
  ${Object.entries(report.results).map(([name, result]) => `
  <div class="validator-result ${result.valid ? 'validator-passed' : 'validator-failed'}">
    <h3>${result.valid ? '✅' : '❌'} ${name}</h3>
    
    ${result.errors.length > 0 ? `
    <div class="error-list">
      <strong>Errors:</strong>
      <ul>
        ${result.errors.map(error => `<li class="error-item">${error}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    ${result.warnings.length > 0 ? `
    <div class="warning-list">
      <strong>Warnings:</strong>
      <ul>
        ${result.warnings.map(warning => `<li class="warning-item">${warning}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
  </div>
  `).join('')}
  
  ${report.recommendations.length > 0 ? `
  <div class="recommendations">
    <h2>💡 Recommendations</h2>
    <ul>
      ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
    </ul>
  </div>
  ` : ''}
</body>
</html>`;
  }

  /**
   * Merge user config with defaults
   */
  private mergeWithDefaults(userConfig?: Partial<ValidationEngineConfig>): ValidationEngineConfig {
    const defaults: ValidationEngineConfig = {
      standards: {
        standards: 'strict',
        noMocks: true,
        productionReady: true
      },
      validators: {
        mocks: true,
        auth: true,
        database: true,
        security: true,
        testing: true,
        logging: true,
        qualityGates: true,
        codeQuality: true
      },
      parallel: true,
      failFast: false,
      reportFormat: 'markdown',
      outputDir: undefined
    };
    
    return this.deepMerge(defaults, userConfig || {});
  }

  /**
   * Deep merge configuration objects
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
   * Setup event handlers
   */
  private setupEventHandlers() {
    this.on('validation:start', (target) => {
      this.logger.debug(`Validation started for: ${target}`);
    });
    
    this.on('validator:start', (name) => {
      this.logger.debug(`Running validator: ${name}`);
    });
    
    this.on('validator:complete', (name, result) => {
      this.logger.debug(`Validator ${name} completed`, {
        valid: result.valid,
        errors: result.errors.length,
        warnings: result.warnings.length
      });
    });
    
    this.on('validator:error', (name, error) => {
      this.logger.error(`Validator ${name} failed`, error);
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ValidationEngineConfig>) {
    this.config = this.mergeWithDefaults({ ...this.config, ...config });
    
    // Reinitialize validators if needed
    if (config.validators) {
      this.validators.clear();
      this.initializeValidators();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ValidationEngineConfig {
    return { ...this.config };
  }

  /**
   * Enable specific validators
   */
  enableValidators(...names: string[]) {
    for (const name of names) {
      if (name in this.config.validators) {
        this.config.validators[name as keyof typeof this.config.validators] = true;
      }
    }
    this.initializeValidators();
  }

  /**
   * Disable specific validators
   */
  disableValidators(...names: string[]) {
    for (const name of names) {
      if (name in this.config.validators) {
        this.config.validators[name as keyof typeof this.config.validators] = false;
        this.validators.delete(name);
      }
    }
  }

  /**
   * Get list of available validators
   */
  getAvailableValidators(): string[] {
    return Object.keys(this.config.validators);
  }

  /**
   * Get list of enabled validators
   */
  getEnabledValidatorNames(): string[] {
    return Object.entries(this.config.validators)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name);
  }
}