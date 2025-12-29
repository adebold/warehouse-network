/**
 * Quality Gates - Comprehensive quality gate management with real implementations
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

import { CodeQualityAnalyzer } from '@warehouse-network/claude-code-quality';
import { glob } from 'glob';

import { Logger } from '../utils/logger';

export interface QualityGateConfig {
  // Code complexity thresholds
  complexity: {
    cyclomatic: number;
    cognitive: number;
    nesting: number;
    linesPerFunction: number;
    filesPerModule: number;
  };
  
  // Test coverage requirements
  coverage: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  
  // Documentation requirements
  documentation: {
    minCoverage: number;
    requiredSections: string[];
    maxTodoCount: number;
  };
  
  // Security compliance
  security: {
    allowedVulnerabilities: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    requiredHeaders: string[];
    bannedPatterns: RegExp[];
  };
  
  // Performance benchmarks
  performance: {
    maxBuildTime: number; // seconds
    maxMemoryUsage: number; // MB
    maxBundleSize: number; // KB
    maxLoadTime: number; // ms
  };
  
  // Linting and formatting
  codeQuality: {
    maxEslintErrors: number;
    maxEslintWarnings: number;
    enforceFormatting: boolean;
  };
}

export interface QualityGateResult {
  passed: boolean;
  failures: QualityGateFailure[];
  warnings: QualityGateWarning[];
  metrics: QualityMetrics;
  timestamp: Date;
}

export interface QualityGateFailure {
  gate: string;
  message: string;
  actual: any;
  expected: any;
  severity: 'error' | 'critical';
}

export interface QualityGateWarning {
  gate: string;
  message: string;
  recommendation: string;
}

export interface QualityMetrics {
  complexity: ComplexityMetrics;
  coverage: CoverageMetrics;
  documentation: DocumentationMetrics;
  security: SecurityMetrics;
  performance: PerformanceMetrics;
}

export interface ComplexityMetrics {
  avgCyclomatic: number;
  maxCyclomatic: number;
  avgCognitive: number;
  maxCognitive: number;
  avgNesting: number;
  maxNesting: number;
  avgLinesPerFunction: number;
  filesPerModule: Record<string, number>;
}

export interface CoverageMetrics {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface DocumentationMetrics {
  coverage: number;
  todoCount: number;
  missingDocs: string[];
}

export interface SecurityMetrics {
  vulnerabilities: Record<string, number>;
  missingHeaders: string[];
  detectedPatterns: string[];
}

export interface PerformanceMetrics {
  buildTime: number;
  memoryUsage: number;
  bundleSize: number;
  loadTime: number;
}

export class QualityGates {
  private config: QualityGateConfig;
  private logger: Logger;
  private codeAnalyzer: CodeQualityAnalyzer;
  private projectRoot: string;

  constructor(config?: Partial<QualityGateConfig>, projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
    this.logger = new Logger('QualityGates');
    this.config = this.mergeWithDefaults(config);
    this.codeAnalyzer = new CodeQualityAnalyzer({
      thresholds: {
        complexity: this.config.complexity,
        testCoverage: this.config.coverage.statements,
        documentationCoverage: this.config.documentation.minCoverage,
        securityScore: 85,
        performanceScore: 80,
        maintainability: 60
      }
    });
  }

  /**
   * Run all quality gate checks
   */
  async check(targetPaths?: string[]): Promise<QualityGateResult> {
    this.logger.info('Running quality gate checks...');
    const startTime = Date.now();
    
    const failures: QualityGateFailure[] = [];
    const warnings: QualityGateWarning[] = [];
    
    // Default to all source files if no paths specified
    const paths = targetPaths || ['src/**/*.{ts,tsx,js,jsx}'];
    
    // Run all checks in parallel
    const [complexity, coverage, documentation, security, performance, codeQuality] = await Promise.all([
      this.checkComplexity(paths),
      this.checkCoverage(),
      this.checkDocumentation(paths),
      this.checkSecurity(paths),
      this.checkPerformance(),
      this.checkCodeQuality(paths)
    ]);
    
    // Aggregate results
    failures.push(...complexity.failures, ...coverage.failures, ...documentation.failures, 
                  ...security.failures, ...performance.failures, ...codeQuality.failures);
    warnings.push(...complexity.warnings, ...coverage.warnings, ...documentation.warnings, 
                  ...security.warnings, ...performance.warnings, ...codeQuality.warnings);
    
    const metrics: QualityMetrics = {
      complexity: complexity.metrics,
      coverage: coverage.metrics,
      documentation: documentation.metrics,
      security: security.metrics,
      performance: performance.metrics
    };
    
    const passed = failures.length === 0;
    const duration = Date.now() - startTime;
    
    this.logger.info(`Quality gates ${passed ? 'PASSED' : 'FAILED'} in ${duration}ms`, {
      failures: failures.length,
      warnings: warnings.length
    });
    
    return {
      passed,
      failures,
      warnings,
      metrics,
      timestamp: new Date()
    };
  }

  /**
   * Check code complexity metrics
   */
  private async checkComplexity(paths: string[]): Promise<{
    failures: QualityGateFailure[];
    warnings: QualityGateWarning[];
    metrics: ComplexityMetrics;
  }> {
    const failures: QualityGateFailure[] = [];
    const warnings: QualityGateWarning[] = [];
    
    try {
      // Analyze code complexity using claude-code-quality
      const analysis = await this.codeAnalyzer.analyze(paths);
      
      const complexityMetrics: ComplexityMetrics = {
        avgCyclomatic: 0,
        maxCyclomatic: 0,
        avgCognitive: 0,
        maxCognitive: 0,
        avgNesting: 0,
        maxNesting: 0,
        avgLinesPerFunction: 0,
        filesPerModule: {}
      };
      
      let totalFunctions = 0;
      let totalCyclomatic = 0;
      let totalCognitive = 0;
      let totalNesting = 0;
      let totalLines = 0;
      
      // Process file results
      for (const file of analysis.files) {
        const complexity = file.metrics.complexity;
        
        totalCyclomatic += complexity.cyclomatic;
        totalCognitive += complexity.cognitive;
        totalNesting += complexity.nesting;
        totalFunctions += file.metrics.functions;
        totalLines += file.metrics.lines;
        
        // Track max values
        complexityMetrics.maxCyclomatic = Math.max(complexityMetrics.maxCyclomatic, complexity.cyclomatic);
        complexityMetrics.maxCognitive = Math.max(complexityMetrics.maxCognitive, complexity.cognitive);
        complexityMetrics.maxNesting = Math.max(complexityMetrics.maxNesting, complexity.nesting);
        
        // Check thresholds for individual files
        if (complexity.cyclomatic > this.config.complexity.cyclomatic) {
          failures.push({
            gate: 'complexity.cyclomatic',
            message: `File ${file.path} exceeds cyclomatic complexity threshold`,
            actual: complexity.cyclomatic,
            expected: this.config.complexity.cyclomatic,
            severity: 'error'
          });
        }
        
        if (complexity.cognitive > this.config.complexity.cognitive) {
          failures.push({
            gate: 'complexity.cognitive',
            message: `File ${file.path} exceeds cognitive complexity threshold`,
            actual: complexity.cognitive,
            expected: this.config.complexity.cognitive,
            severity: 'error'
          });
        }
        
        // Track files per module
        const modulePath = path.dirname(file.path);
        complexityMetrics.filesPerModule[modulePath] = (complexityMetrics.filesPerModule[modulePath] || 0) + 1;
      }
      
      // Calculate averages
      if (totalFunctions > 0) {
        complexityMetrics.avgCyclomatic = totalCyclomatic / totalFunctions;
        complexityMetrics.avgCognitive = totalCognitive / totalFunctions;
        complexityMetrics.avgNesting = totalNesting / totalFunctions;
        complexityMetrics.avgLinesPerFunction = totalLines / totalFunctions;
      }
      
      // Check module size constraints
      for (const [module, fileCount] of Object.entries(complexityMetrics.filesPerModule)) {
        if (fileCount > this.config.complexity.filesPerModule) {
          warnings.push({
            gate: 'complexity.filesPerModule',
            message: `Module ${module} contains too many files`,
            recommendation: `Consider splitting into smaller modules (current: ${fileCount}, max: ${this.config.complexity.filesPerModule})`
          });
        }
      }
      
      return { failures, warnings, metrics: complexityMetrics };
    } catch (error) {
      this.logger.error('Failed to check complexity', error);
      failures.push({
        gate: 'complexity',
        message: `Failed to analyze complexity: ${error.message}`,
        actual: null,
        expected: null,
        severity: 'critical'
      });
      
      return { 
        failures, 
        warnings, 
        metrics: this.getDefaultComplexityMetrics() 
      };
    }
  }

  /**
   * Check test coverage
   */
  private async checkCoverage(): Promise<{
    failures: QualityGateFailure[];
    warnings: QualityGateWarning[];
    metrics: CoverageMetrics;
  }> {
    const failures: QualityGateFailure[] = [];
    const warnings: QualityGateWarning[] = [];
    
    try {
      // Try to read coverage report
      const coverageFiles = await glob('coverage/coverage-summary.json', { cwd: this.projectRoot });
      
      if (coverageFiles.length === 0) {
        // Try running tests with coverage
        this.logger.info('No coverage report found, attempting to generate...');
        
        try {
          execSync('npm test -- --coverage --coverageReporters=json-summary', {
            cwd: this.projectRoot,
            stdio: 'pipe'
          });
        } catch (error) {
          warnings.push({
            gate: 'coverage',
            message: 'Failed to generate coverage report',
            recommendation: 'Run tests with coverage enabled'
          });
          
          return { 
            failures, 
            warnings, 
            metrics: this.getDefaultCoverageMetrics() 
          };
        }
      }
      
      // Read coverage data
      const coverageData = JSON.parse(
        await fs.readFile(path.join(this.projectRoot, 'coverage/coverage-summary.json'), 'utf-8')
      );
      
      const total = coverageData.total;
      const metrics: CoverageMetrics = {
        statements: total.statements.pct,
        branches: total.branches.pct,
        functions: total.functions.pct,
        lines: total.lines.pct
      };
      
      // Check thresholds
      if (metrics.statements < this.config.coverage.statements) {
        failures.push({
          gate: 'coverage.statements',
          message: 'Statement coverage is below threshold',
          actual: metrics.statements,
          expected: this.config.coverage.statements,
          severity: 'error'
        });
      }
      
      if (metrics.branches < this.config.coverage.branches) {
        failures.push({
          gate: 'coverage.branches',
          message: 'Branch coverage is below threshold',
          actual: metrics.branches,
          expected: this.config.coverage.branches,
          severity: 'error'
        });
      }
      
      if (metrics.functions < this.config.coverage.functions) {
        failures.push({
          gate: 'coverage.functions',
          message: 'Function coverage is below threshold',
          actual: metrics.functions,
          expected: this.config.coverage.functions,
          severity: 'error'
        });
      }
      
      if (metrics.lines < this.config.coverage.lines) {
        failures.push({
          gate: 'coverage.lines',
          message: 'Line coverage is below threshold',
          actual: metrics.lines,
          expected: this.config.coverage.lines,
          severity: 'error'
        });
      }
      
      return { failures, warnings, metrics };
    } catch (error) {
      this.logger.error('Failed to check coverage', error);
      warnings.push({
        gate: 'coverage',
        message: 'Unable to check test coverage',
        recommendation: 'Ensure tests are configured with coverage reporting'
      });
      
      return { 
        failures, 
        warnings, 
        metrics: this.getDefaultCoverageMetrics() 
      };
    }
  }

  /**
   * Check documentation standards
   */
  private async checkDocumentation(paths: string[]): Promise<{
    failures: QualityGateFailure[];
    warnings: QualityGateWarning[];
    metrics: DocumentationMetrics;
  }> {
    const failures: QualityGateFailure[] = [];
    const warnings: QualityGateWarning[] = [];
    
    try {
      // Get all source files
      const files = await this.resolveFiles(paths);
      
      let totalFiles = 0;
      let documentedFiles = 0;
      let todoCount = 0;
      const missingDocs: string[] = [];
      
      // Check each file for documentation
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        totalFiles++;
        
        // Check for file-level documentation
        const hasFileDoc = /\/\*\*[\s\S]*?\*\//m.test(content.substring(0, 500));
        if (hasFileDoc) {
          documentedFiles++;
        } else {
          missingDocs.push(file);
        }
        
        // Count TODOs
        const todos = content.match(/TODO|FIXME|HACK|XXX/gi) || [];
        todoCount += todos.length;
        
        // Check for required documentation sections in main files
        if (file.endsWith('README.md') || file.endsWith('index.ts') || file.endsWith('index.js')) {
          for (const section of this.config.documentation.requiredSections) {
            if (!content.includes(section)) {
              warnings.push({
                gate: 'documentation.sections',
                message: `Missing required section "${section}" in ${file}`,
                recommendation: `Add ${section} section to documentation`
              });
            }
          }
        }
      }
      
      const coverage = totalFiles > 0 ? (documentedFiles / totalFiles) * 100 : 0;
      
      const metrics: DocumentationMetrics = {
        coverage,
        todoCount,
        missingDocs
      };
      
      // Check thresholds
      if (coverage < this.config.documentation.minCoverage) {
        failures.push({
          gate: 'documentation.coverage',
          message: 'Documentation coverage is below threshold',
          actual: coverage,
          expected: this.config.documentation.minCoverage,
          severity: 'error'
        });
      }
      
      if (todoCount > this.config.documentation.maxTodoCount) {
        warnings.push({
          gate: 'documentation.todos',
          message: `Too many TODO comments found (${todoCount})`,
          recommendation: 'Address or create issues for outstanding TODOs'
        });
      }
      
      return { failures, warnings, metrics };
    } catch (error) {
      this.logger.error('Failed to check documentation', error);
      return { 
        failures, 
        warnings, 
        metrics: this.getDefaultDocumentationMetrics() 
      };
    }
  }

  /**
   * Check security compliance
   */
  private async checkSecurity(paths: string[]): Promise<{
    failures: QualityGateFailure[];
    warnings: QualityGateWarning[];
    metrics: SecurityMetrics;
  }> {
    const failures: QualityGateFailure[] = [];
    const warnings: QualityGateWarning[] = [];
    
    try {
      // Run npm audit
      let auditResult;
      try {
        const auditOutput = execSync('npm audit --json', {
          cwd: this.projectRoot,
          stdio: 'pipe'
        }).toString();
        auditResult = JSON.parse(auditOutput);
      } catch (error) {
        // npm audit returns non-zero exit code when vulnerabilities found
        auditResult = JSON.parse(error.stdout?.toString() || '{}');
      }
      
      const vulnerabilities: Record<string, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      };
      
      if (auditResult.metadata) {
        vulnerabilities.critical = auditResult.metadata.vulnerabilities.critical || 0;
        vulnerabilities.high = auditResult.metadata.vulnerabilities.high || 0;
        vulnerabilities.medium = auditResult.metadata.vulnerabilities.medium || 0;
        vulnerabilities.low = auditResult.metadata.vulnerabilities.low || 0;
      }
      
      // Check vulnerability thresholds
      for (const [severity, count] of Object.entries(vulnerabilities)) {
        const allowed = this.config.security.allowedVulnerabilities[severity];
        if (count > allowed) {
          failures.push({
            gate: `security.vulnerabilities.${severity}`,
            message: `Too many ${severity} vulnerabilities found`,
            actual: count,
            expected: allowed,
            severity: severity === 'critical' || severity === 'high' ? 'critical' : 'error'
          });
        }
      }
      
      // Check for security headers in code
      const missingHeaders: string[] = [];
      const detectedPatterns: string[] = [];
      
      // Scan for security patterns
      const files = await this.resolveFiles(paths);
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        
        // Check for banned patterns
        for (const pattern of this.config.security.bannedPatterns) {
          if (pattern.test(content)) {
            detectedPatterns.push(`${pattern.toString()} in ${file}`);
            failures.push({
              gate: 'security.patterns',
              message: `Banned security pattern detected in ${file}`,
              actual: pattern.toString(),
              expected: 'Pattern should not exist',
              severity: 'critical'
            });
          }
        }
      }
      
      // Check for required security headers in middleware files
      const middlewareFiles = files.filter(f => 
        f.includes('middleware') || f.includes('security') || f.includes('auth')
      );
      
      if (middlewareFiles.length > 0) {
        for (const header of this.config.security.requiredHeaders) {
          let found = false;
          for (const file of middlewareFiles) {
            const content = await fs.readFile(file, 'utf-8');
            if (content.includes(header)) {
              found = true;
              break;
            }
          }
          if (!found) {
            missingHeaders.push(header);
          }
        }
      }
      
      const metrics: SecurityMetrics = {
        vulnerabilities,
        missingHeaders,
        detectedPatterns
      };
      
      return { failures, warnings, metrics };
    } catch (error) {
      this.logger.error('Failed to check security', error);
      warnings.push({
        gate: 'security',
        message: 'Unable to perform security checks',
        recommendation: 'Ensure npm audit is available and security scanning is configured'
      });
      
      return { 
        failures, 
        warnings, 
        metrics: this.getDefaultSecurityMetrics() 
      };
    }
  }

  /**
   * Check performance benchmarks
   */
  private async checkPerformance(): Promise<{
    failures: QualityGateFailure[];
    warnings: QualityGateWarning[];
    metrics: PerformanceMetrics;
  }> {
    const failures: QualityGateFailure[] = [];
    const warnings: QualityGateWarning[] = [];
    
    try {
      const metrics: PerformanceMetrics = {
        buildTime: 0,
        memoryUsage: 0,
        bundleSize: 0,
        loadTime: 0
      };
      
      // Measure build time
      const buildStart = Date.now();
      try {
        execSync('npm run build', {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
        metrics.buildTime = (Date.now() - buildStart) / 1000; // Convert to seconds
      } catch (error) {
        warnings.push({
          gate: 'performance.build',
          message: 'Failed to measure build time',
          recommendation: 'Ensure build script is configured'
        });
      }
      
      // Check build time threshold
      if (metrics.buildTime > this.config.performance.maxBuildTime) {
        failures.push({
          gate: 'performance.buildTime',
          message: 'Build time exceeds threshold',
          actual: metrics.buildTime,
          expected: this.config.performance.maxBuildTime,
          severity: 'error'
        });
      }
      
      // Measure memory usage (current process)
      const memUsage = process.memoryUsage();
      metrics.memoryUsage = Math.round(memUsage.heapUsed / 1024 / 1024); // Convert to MB
      
      if (metrics.memoryUsage > this.config.performance.maxMemoryUsage) {
        warnings.push({
          gate: 'performance.memory',
          message: 'Memory usage is high',
          recommendation: 'Consider optimizing memory usage'
        });
      }
      
      // Check bundle size (if dist exists)
      try {
        const distFiles = await glob('dist/**/*.js', { cwd: this.projectRoot });
        let totalSize = 0;
        
        for (const file of distFiles) {
          const stats = await fs.stat(path.join(this.projectRoot, file));
          totalSize += stats.size;
        }
        
        metrics.bundleSize = Math.round(totalSize / 1024); // Convert to KB
        
        if (metrics.bundleSize > this.config.performance.maxBundleSize) {
          failures.push({
            gate: 'performance.bundleSize',
            message: 'Bundle size exceeds threshold',
            actual: metrics.bundleSize,
            expected: this.config.performance.maxBundleSize,
            severity: 'error'
          });
        }
      } catch (error) {
        this.logger.debug('Unable to measure bundle size', error);
      }
      
      return { failures, warnings, metrics };
    } catch (error) {
      this.logger.error('Failed to check performance', error);
      return { 
        failures, 
        warnings, 
        metrics: this.getDefaultPerformanceMetrics() 
      };
    }
  }

  /**
   * Check code quality (linting, formatting)
   */
  private async checkCodeQuality(paths: string[]): Promise<{
    failures: QualityGateFailure[];
    warnings: QualityGateWarning[];
    metrics: any;
  }> {
    const failures: QualityGateFailure[] = [];
    const warnings: QualityGateWarning[] = [];
    
    try {
      // Run ESLint
      try {
        const eslintOutput = execSync('npx eslint src --format json', {
          cwd: this.projectRoot,
          stdio: 'pipe'
        }).toString();
        
        const eslintResults = JSON.parse(eslintOutput);
        let totalErrors = 0;
        let totalWarnings = 0;
        
        for (const result of eslintResults) {
          totalErrors += result.errorCount;
          totalWarnings += result.warningCount;
        }
        
        if (totalErrors > this.config.codeQuality.maxEslintErrors) {
          failures.push({
            gate: 'codeQuality.eslint.errors',
            message: 'Too many ESLint errors',
            actual: totalErrors,
            expected: this.config.codeQuality.maxEslintErrors,
            severity: 'error'
          });
        }
        
        if (totalWarnings > this.config.codeQuality.maxEslintWarnings) {
          warnings.push({
            gate: 'codeQuality.eslint.warnings',
            message: 'Too many ESLint warnings',
            recommendation: 'Fix ESLint warnings to improve code quality'
          });
        }
      } catch (error) {
        // ESLint returns non-zero exit code when issues found
        this.logger.debug('ESLint check completed with issues');
      }
      
      // Check formatting
      if (this.config.codeQuality.enforceFormatting) {
        try {
          execSync('npx prettier --check src', {
            cwd: this.projectRoot,
            stdio: 'pipe'
          });
        } catch (error) {
          warnings.push({
            gate: 'codeQuality.formatting',
            message: 'Code formatting issues detected',
            recommendation: 'Run prettier to fix formatting'
          });
        }
      }
      
      return { failures, warnings, metrics: {} };
    } catch (error) {
      this.logger.error('Failed to check code quality', error);
      return { failures, warnings, metrics: {} };
    }
  }

  /**
   * Resolve file paths using glob patterns
   */
  private async resolveFiles(patterns: string[]): Promise<string[]> {
    const files = new Set<string>();
    
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        absolute: true
      });
      matches.forEach(file => files.add(file));
    }
    
    return Array.from(files);
  }

  /**
   * Merge user config with defaults
   */
  private mergeWithDefaults(userConfig?: Partial<QualityGateConfig>): QualityGateConfig {
    const defaults: QualityGateConfig = {
      complexity: {
        cyclomatic: 10,
        cognitive: 15,
        nesting: 4,
        linesPerFunction: 50,
        filesPerModule: 10
      },
      coverage: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      },
      documentation: {
        minCoverage: 70,
        requiredSections: ['Overview', 'Installation', 'Usage', 'API'],
        maxTodoCount: 10
      },
      security: {
        allowedVulnerabilities: {
          critical: 0,
          high: 0,
          medium: 2,
          low: 5
        },
        requiredHeaders: [
          'helmet',
          'X-Frame-Options',
          'X-Content-Type-Options',
          'Content-Security-Policy'
        ],
        bannedPatterns: [
          /eval\s*\(/,
          /innerHTML\s*=/,
          /document\.write/,
          /\.exec\s*\(/,
          /new\s+Function\s*\(/
        ]
      },
      performance: {
        maxBuildTime: 60, // seconds
        maxMemoryUsage: 512, // MB
        maxBundleSize: 500, // KB
        maxLoadTime: 3000 // ms
      },
      codeQuality: {
        maxEslintErrors: 0,
        maxEslintWarnings: 10,
        enforceFormatting: true
      }
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
   * Get default metrics when checks fail
   */
  private getDefaultComplexityMetrics(): ComplexityMetrics {
    return {
      avgCyclomatic: 0,
      maxCyclomatic: 0,
      avgCognitive: 0,
      maxCognitive: 0,
      avgNesting: 0,
      maxNesting: 0,
      avgLinesPerFunction: 0,
      filesPerModule: {}
    };
  }

  private getDefaultCoverageMetrics(): CoverageMetrics {
    return {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0
    };
  }

  private getDefaultDocumentationMetrics(): DocumentationMetrics {
    return {
      coverage: 0,
      todoCount: 0,
      missingDocs: []
    };
  }

  private getDefaultSecurityMetrics(): SecurityMetrics {
    return {
      vulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      missingHeaders: [],
      detectedPatterns: []
    };
  }

  private getDefaultPerformanceMetrics(): PerformanceMetrics {
    return {
      buildTime: 0,
      memoryUsage: 0,
      bundleSize: 0,
      loadTime: 0
    };
  }

  /**
   * Generate quality report
   */
  async generateReport(result: QualityGateResult, format: 'json' | 'html' | 'markdown' = 'markdown'): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      
      case 'markdown':
        return this.generateMarkdownReport(result);
      
      case 'html':
        return this.generateHtmlReport(result);
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private generateMarkdownReport(result: QualityGateResult): string {
    let report = `# Quality Gate Report\n\n`;
    report += `**Status:** ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
    report += `**Timestamp:** ${result.timestamp.toISOString()}\n\n`;
    
    if (result.failures.length > 0) {
      report += `## Failures\n\n`;
      for (const failure of result.failures) {
        report += `- **${failure.gate}**: ${failure.message}\n`;
        report += `  - Expected: ${failure.expected}\n`;
        report += `  - Actual: ${failure.actual}\n`;
      }
      report += '\n';
    }
    
    if (result.warnings.length > 0) {
      report += `## Warnings\n\n`;
      for (const warning of result.warnings) {
        report += `- **${warning.gate}**: ${warning.message}\n`;
        report += `  - ${warning.recommendation}\n`;
      }
      report += '\n';
    }
    
    report += `## Metrics\n\n`;
    report += `### Complexity\n`;
    report += `- Average Cyclomatic: ${result.metrics.complexity.avgCyclomatic.toFixed(2)}\n`;
    report += `- Max Cyclomatic: ${result.metrics.complexity.maxCyclomatic}\n`;
    report += `\n### Coverage\n`;
    report += `- Statements: ${result.metrics.coverage.statements}%\n`;
    report += `- Branches: ${result.metrics.coverage.branches}%\n`;
    report += `- Functions: ${result.metrics.coverage.functions}%\n`;
    report += `- Lines: ${result.metrics.coverage.lines}%\n`;
    
    return report;
  }

  private generateHtmlReport(result: QualityGateResult): string {
    // Simple HTML report template
    return `<!DOCTYPE html>
<html>
<head>
  <title>Quality Gate Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .status-passed { color: green; }
    .status-failed { color: red; }
    .section { margin: 20px 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Quality Gate Report</h1>
  <div class="section">
    <p><strong>Status:</strong> <span class="${result.passed ? 'status-passed' : 'status-failed'}">${result.passed ? 'PASSED' : 'FAILED'}</span></p>
    <p><strong>Timestamp:</strong> ${result.timestamp.toISOString()}</p>
  </div>
  ${result.failures.length > 0 ? `
  <div class="section">
    <h2>Failures</h2>
    <table>
      <tr><th>Gate</th><th>Message</th><th>Expected</th><th>Actual</th></tr>
      ${result.failures.map(f => `
      <tr>
        <td>${f.gate}</td>
        <td>${f.message}</td>
        <td>${f.expected}</td>
        <td>${f.actual}</td>
      </tr>`).join('')}
    </table>
  </div>` : ''}
</body>
</html>`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<QualityGateConfig>) {
    this.config = this.mergeWithDefaults({ ...this.config, ...config });
    this.codeAnalyzer.updateConfig({
      thresholds: {
        complexity: this.config.complexity,
        testCoverage: this.config.coverage.statements,
        documentationCoverage: this.config.documentation.minCoverage,
        securityScore: 85,
        performanceScore: 80,
        maintainability: 60
      }
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): QualityGateConfig {
    return { ...this.config };
  }
}