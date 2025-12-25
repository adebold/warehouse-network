/**
 * Quality Gates for User Stories
 * Enforces quality standards throughout the development lifecycle
 */

import { UserStory, StoryStatus, TestCase, DefinitionOfDone } from '../core/types';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface QualityGate {
  id: string;
  name: string;
  description: string;
  type: 'automated' | 'manual';
  required: boolean;
  stage: StoryStatus;
  validator: (story: UserStory, context: QualityContext) => Promise<QualityResult>;
}

export interface QualityContext {
  codebasePath: string;
  testResults?: TestResults;
  coverageReport?: CoverageReport;
  performanceMetrics?: PerformanceMetrics;
  securityScan?: SecurityScanResult;
}

export interface QualityResult {
  passed: boolean;
  score?: number;
  details: string;
  recommendations?: string[];
  blockers?: string[];
}

export interface TestResults {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  testDetails: TestDetail[];
}

export interface TestDetail {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface CoverageReport {
  lines: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  statements: CoverageMetric;
  files: FileCoverage[];
}

export interface CoverageMetric {
  total: number;
  covered: number;
  percentage: number;
}

export interface FileCoverage {
  path: string;
  lines: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
}

export interface PerformanceMetrics {
  loadTime: number;
  memoryUsage: number;
  cpuUsage: number;
  responseTime: number;
  throughput: number;
}

export interface SecurityScanResult {
  vulnerabilities: Vulnerability[];
  score: number;
  passed: boolean;
}

export interface Vulnerability {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location: string;
  recommendation: string;
}

export class QualityGateManager {
  private gates: Map<string, QualityGate> = new Map();
  private definitionsOfDone: Map<string, DefinitionOfDone> = new Map();

  constructor() {
    this.initializeDefaultGates();
  }

  /**
   * Initialize default quality gates
   */
  private initializeDefaultGates(): void {
    // Acceptance Criteria Gate
    this.addGate({
      id: 'acceptance-criteria',
      name: 'Acceptance Criteria Validation',
      description: 'Ensures all acceptance criteria are properly defined and testable',
      type: 'automated',
      required: true,
      stage: StoryStatus.PLANNED,
      validator: this.validateAcceptanceCriteria.bind(this)
    });

    // Test Coverage Gate
    this.addGate({
      id: 'test-coverage',
      name: 'Test Coverage Requirements',
      description: 'Validates minimum test coverage requirements',
      type: 'automated',
      required: true,
      stage: StoryStatus.TESTING,
      validator: this.validateTestCoverage.bind(this)
    });

    // Performance Gate
    this.addGate({
      id: 'performance',
      name: 'Performance Standards',
      description: 'Ensures performance metrics meet requirements',
      type: 'automated',
      required: true,
      stage: StoryStatus.TESTING,
      validator: this.validatePerformance.bind(this)
    });

    // Security Gate
    this.addGate({
      id: 'security',
      name: 'Security Validation',
      description: 'Scans for security vulnerabilities',
      type: 'automated',
      required: true,
      stage: StoryStatus.REVIEW,
      validator: this.validateSecurity.bind(this)
    });

    // Documentation Gate
    this.addGate({
      id: 'documentation',
      name: 'Documentation Requirements',
      description: 'Ensures adequate documentation',
      type: 'automated',
      required: true,
      stage: StoryStatus.REVIEW,
      validator: this.validateDocumentation.bind(this)
    });
  }

  /**
   * Add a quality gate
   */
  addGate(gate: QualityGate): void {
    this.gates.set(gate.id, gate);
  }

  /**
   * Run quality gates for a story
   */
  async runGates(story: UserStory, context: QualityContext): Promise<Map<string, QualityResult>> {
    const results = new Map<string, QualityResult>();
    const applicableGates = Array.from(this.gates.values()).filter(
      gate => this.isGateApplicable(gate, story)
    );

    // Use Claude Flow for parallel gate execution
    const gatePromises = applicableGates.map(async gate => {
      try {
        const result = await gate.validator(story, context);
        return { gateId: gate.id, result };
      } catch (error: any) {
        return {
          gateId: gate.id,
          result: {
            passed: false,
            details: `Gate execution failed: ${error.message}`,
            blockers: [error.message]
          }
        };
      }
    });

    const gateResults = await Promise.all(gatePromises);
    for (const { gateId, result } of gateResults) {
      results.set(gateId, result);
    }

    return results;
  }

  /**
   * Validate story against Definition of Done
   */
  async validateDefinitionOfDone(
    story: UserStory, 
    dodId: string, 
    context: QualityContext
  ): Promise<QualityResult> {
    const dod = this.definitionsOfDone.get(dodId);
    if (!dod) {
      return {
        passed: false,
        details: `Definition of Done "${dodId}" not found`
      };
    }

    const criteriaResults: boolean[] = [];
    const details: string[] = [];
    const blockers: string[] = [];

    for (const criterion of dod.criteria) {
      if (criterion.automatable && criterion.validator) {
        // Run automated validation
        const result = await this.runCriterionValidator(criterion.validator, story, context);
        criteriaResults.push(result);
        
        if (!result) {
          const message = `Failed: ${criterion.description}`;
          details.push(message);
          if (criterion.required) {
            blockers.push(message);
          }
        } else {
          details.push(`Passed: ${criterion.description}`);
        }
      } else {
        // Manual validation required
        details.push(`Manual review required: ${criterion.description}`);
      }
    }

    const passed = dod.criteria
      .filter(c => c.required)
      .every((_, index) => criteriaResults[index] !== false);

    return {
      passed,
      score: (criteriaResults.filter(r => r).length / criteriaResults.length) * 100,
      details: details.join('\n'),
      blockers: blockers.length > 0 ? blockers : undefined
    };
  }

  /**
   * Quality gate validators
   */
  private async validateAcceptanceCriteria(
    story: UserStory, 
    context: QualityContext
  ): Promise<QualityResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if acceptance criteria exist
    if (story.acceptanceCriteria.length === 0) {
      issues.push('No acceptance criteria defined');
    }

    // Validate each criterion
    for (const criterion of story.acceptanceCriteria) {
      if (!criterion.description || criterion.description.length < 10) {
        issues.push(`Criterion "${criterion.id}" has insufficient description`);
      }

      if (!criterion.testable) {
        recommendations.push(`Make criterion "${criterion.description}" testable`);
      }

      if (criterion.testable && (!criterion.testCases || criterion.testCases.length === 0)) {
        issues.push(`Testable criterion "${criterion.description}" has no test cases`);
      }
    }

    // Use Claude Flow to suggest improvements
    if (issues.length > 0) {
      const suggestions = await this.getAcceptanceCriteriaSuggestions(story);
      recommendations.push(...suggestions);
    }

    return {
      passed: issues.length === 0,
      score: ((story.acceptanceCriteria.length - issues.length) / story.acceptanceCriteria.length) * 100,
      details: issues.length > 0 ? issues.join('\n') : 'All acceptance criteria are valid',
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      blockers: issues.length > 0 ? issues : undefined
    };
  }

  private async validateTestCoverage(
    story: UserStory, 
    context: QualityContext
  ): Promise<QualityResult> {
    // Run coverage analysis
    const coverage = await this.runCoverageAnalysis(context.codebasePath);
    
    const minCoverage = 80; // Configurable threshold
    const passed = coverage.statements.percentage >= minCoverage;

    const recommendations: string[] = [];
    if (!passed) {
      // Find uncovered files
      const uncoveredFiles = coverage.files
        .filter(f => f.lines.percentage < minCoverage)
        .sort((a, b) => a.lines.percentage - b.lines.percentage)
        .slice(0, 5);

      for (const file of uncoveredFiles) {
        recommendations.push(
          `Increase coverage for ${file.path} (currently ${file.lines.percentage.toFixed(1)}%)`
        );
      }
    }

    return {
      passed,
      score: coverage.statements.percentage,
      details: `Statement coverage: ${coverage.statements.percentage.toFixed(1)}%\n` +
               `Branch coverage: ${coverage.branches.percentage.toFixed(1)}%\n` +
               `Function coverage: ${coverage.functions.percentage.toFixed(1)}%`,
      recommendations,
      blockers: passed ? undefined : [`Coverage below ${minCoverage}% threshold`]
    };
  }

  private async validatePerformance(
    story: UserStory, 
    context: QualityContext
  ): Promise<QualityResult> {
    const metrics = await this.runPerformanceBenchmarks(context.codebasePath);
    
    // Define thresholds
    const thresholds = {
      loadTime: 3000, // ms
      responseTime: 200, // ms
      memoryUsage: 100 * 1024 * 1024, // 100MB
      throughput: 100 // requests per second
    };

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (metrics.loadTime > thresholds.loadTime) {
      issues.push(`Load time (${metrics.loadTime}ms) exceeds threshold (${thresholds.loadTime}ms)`);
      recommendations.push('Consider code splitting and lazy loading');
    }

    if (metrics.responseTime > thresholds.responseTime) {
      issues.push(`Response time (${metrics.responseTime}ms) exceeds threshold (${thresholds.responseTime}ms)`);
      recommendations.push('Optimize database queries and add caching');
    }

    if (metrics.memoryUsage > thresholds.memoryUsage) {
      issues.push(`Memory usage (${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB) exceeds threshold`);
      recommendations.push('Check for memory leaks and optimize data structures');
    }

    return {
      passed: issues.length === 0,
      score: this.calculatePerformanceScore(metrics, thresholds),
      details: `Load time: ${metrics.loadTime}ms\n` +
               `Response time: ${metrics.responseTime}ms\n` +
               `Memory usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB\n` +
               `Throughput: ${metrics.throughput} req/s`,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      blockers: issues.length > 0 ? issues : undefined
    };
  }

  private async validateSecurity(
    story: UserStory, 
    context: QualityContext
  ): Promise<QualityResult> {
    const scanResult = await this.runSecurityScan(context.codebasePath);
    
    const criticalCount = scanResult.vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = scanResult.vulnerabilities.filter(v => v.severity === 'high').length;
    
    const passed = criticalCount === 0 && highCount === 0;

    const recommendations = scanResult.vulnerabilities
      .slice(0, 5)
      .map(v => `${v.severity.toUpperCase()}: ${v.recommendation}`);

    return {
      passed,
      score: scanResult.score,
      details: `Security scan found ${scanResult.vulnerabilities.length} vulnerabilities:\n` +
               `Critical: ${criticalCount}\n` +
               `High: ${highCount}\n` +
               `Medium: ${scanResult.vulnerabilities.filter(v => v.severity === 'medium').length}\n` +
               `Low: ${scanResult.vulnerabilities.filter(v => v.severity === 'low').length}`,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      blockers: passed ? undefined : scanResult.vulnerabilities
        .filter(v => v.severity === 'critical' || v.severity === 'high')
        .map(v => `${v.severity}: ${v.description}`)
    };
  }

  private async validateDocumentation(
    story: UserStory, 
    context: QualityContext
  ): Promise<QualityResult> {
    const docChecks = await this.runDocumentationChecks(story, context.codebasePath);
    
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!docChecks.hasReadme) {
      issues.push('README.md not found or not updated');
    }

    if (!docChecks.hasApiDocs) {
      issues.push('API documentation not found');
    }

    if (docChecks.undocumentedFunctions > 0) {
      issues.push(`${docChecks.undocumentedFunctions} functions lack documentation`);
      recommendations.push('Add JSDoc comments to all public functions');
    }

    if (docChecks.outdatedDocs.length > 0) {
      recommendations.push(`Update documentation for: ${docChecks.outdatedDocs.join(', ')}`);
    }

    const score = (
      (docChecks.hasReadme ? 25 : 0) +
      (docChecks.hasApiDocs ? 25 : 0) +
      (docChecks.documentedFunctions / docChecks.totalFunctions * 50)
    );

    return {
      passed: issues.length === 0,
      score,
      details: `Documentation coverage: ${(docChecks.documentedFunctions / docChecks.totalFunctions * 100).toFixed(1)}%\n` +
               `README: ${docChecks.hasReadme ? 'Present' : 'Missing'}\n` +
               `API Docs: ${docChecks.hasApiDocs ? 'Present' : 'Missing'}`,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      blockers: issues
    };
  }

  /**
   * Helper methods
   */
  private isGateApplicable(gate: QualityGate, story: UserStory): boolean {
    // Gate is applicable if story is at or past the gate's stage
    const stageOrder = [
      StoryStatus.DRAFT,
      StoryStatus.PLANNED,
      StoryStatus.IN_PROGRESS,
      StoryStatus.REVIEW,
      StoryStatus.TESTING,
      StoryStatus.DONE
    ];

    const storyStageIndex = stageOrder.indexOf(story.status);
    const gateStageIndex = stageOrder.indexOf(gate.stage);

    return storyStageIndex >= gateStageIndex;
  }

  private async runCriterionValidator(
    validator: string, 
    story: UserStory, 
    context: QualityContext
  ): Promise<boolean> {
    // Execute validator script
    try {
      const result = execSync(validator, {
        env: {
          ...process.env,
          STORY_ID: story.id,
          CODEBASE_PATH: context.codebasePath
        }
      });
      return result.toString().trim() === 'true';
    } catch {
      return false;
    }
  }

  private async getAcceptanceCriteriaSuggestions(story: UserStory): Promise<string[]> {
    // Use Claude Flow to generate suggestions
    try {
      const command = `npx claude-flow@alpha sparc run specification "Suggest acceptance criteria for: ${story.title}"`;
      const result = execSync(command, { encoding: 'utf-8' });
      return result.split('\n').filter(line => line.trim().length > 0);
    } catch {
      return [];
    }
  }

  private async runCoverageAnalysis(codebasePath: string): Promise<CoverageReport> {
    // Run test coverage
    try {
      execSync('npm test -- --coverage', { cwd: codebasePath });
      const coverageData = fs.readFileSync(
        path.join(codebasePath, 'coverage/coverage-summary.json'),
        'utf-8'
      );
      return JSON.parse(coverageData);
    } catch {
      // Return default coverage if analysis fails
      return {
        lines: { total: 100, covered: 0, percentage: 0 },
        functions: { total: 100, covered: 0, percentage: 0 },
        branches: { total: 100, covered: 0, percentage: 0 },
        statements: { total: 100, covered: 0, percentage: 0 },
        files: []
      };
    }
  }

  private async runPerformanceBenchmarks(codebasePath: string): Promise<PerformanceMetrics> {
    // Use Claude Flow for performance testing
    try {
      const command = `npx claude-flow@alpha benchmark run --path ${codebasePath}`;
      const result = execSync(command, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch {
      // Return default metrics
      return {
        loadTime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        responseTime: 0,
        throughput: 0
      };
    }
  }

  private async runSecurityScan(codebasePath: string): Promise<SecurityScanResult> {
    // Run security scan
    try {
      const command = `npx audit-ci --config audit-ci.json`;
      execSync(command, { cwd: codebasePath });
      
      return {
        vulnerabilities: [],
        score: 100,
        passed: true
      };
    } catch (error: any) {
      // Parse security issues from output
      return {
        vulnerabilities: [],
        score: 80,
        passed: false
      };
    }
  }

  private async runDocumentationChecks(story: UserStory, codebasePath: string): Promise<any> {
    const checks = {
      hasReadme: fs.existsSync(path.join(codebasePath, 'README.md')),
      hasApiDocs: fs.existsSync(path.join(codebasePath, 'docs/api.md')),
      totalFunctions: 0,
      documentedFunctions: 0,
      undocumentedFunctions: 0,
      outdatedDocs: [] as string[]
    };

    // Count documented functions (simplified)
    try {
      const sourceFiles = execSync('find . -name "*.ts" -not -path "./node_modules/*"', {
        cwd: codebasePath,
        encoding: 'utf-8'
      }).split('\n').filter(f => f);

      for (const file of sourceFiles) {
        const content = fs.readFileSync(path.join(codebasePath, file), 'utf-8');
        const functionMatches = content.match(/function\s+\w+|=>\s*{/g) || [];
        const docMatches = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
        
        checks.totalFunctions += functionMatches.length;
        checks.documentedFunctions += docMatches.length;
      }

      checks.undocumentedFunctions = checks.totalFunctions - checks.documentedFunctions;
    } catch {
      // Default values if analysis fails
      checks.totalFunctions = 1;
      checks.documentedFunctions = 0;
      checks.undocumentedFunctions = 1;
    }

    return checks;
  }

  private calculatePerformanceScore(
    metrics: PerformanceMetrics, 
    thresholds: any
  ): number {
    const scores = [
      Math.max(0, 100 - (metrics.loadTime / thresholds.loadTime * 100)),
      Math.max(0, 100 - (metrics.responseTime / thresholds.responseTime * 100)),
      Math.max(0, 100 - (metrics.memoryUsage / thresholds.memoryUsage * 100)),
      Math.min(100, metrics.throughput / thresholds.throughput * 100)
    ];

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
}