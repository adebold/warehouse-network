import { createAnalyzer, CodeQualityAnalyzer } from '@claude-ai/code-quality';
import type { 
  AnalysisReport, 
  CodeQualityConfig, 
  QualityScore,
  SecurityIssue,
  ComplexityMetrics,
  DuplicationReport,
  TestCoverageReport,
  PerformanceMetrics
} from '@claude-ai/code-quality';
import { logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';
import { Database } from '../database';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs-extra';

export interface CodeQualityCheck {
  id: string;
  projectId: string;
  commitHash?: string;
  branch?: string;
  report: AnalysisReport;
  score: QualityScore;
  timestamp: Date;
  passed: boolean;
  blockers: QualityBlocker[];
}

export interface QualityBlocker {
  type: 'security' | 'complexity' | 'coverage' | 'duplication' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  file?: string;
  line?: number;
  recommendation: string;
}

export interface QualityGateConfig {
  enableSecurity: boolean;
  enableComplexity: boolean;
  enableCoverage: boolean;
  enableDuplication: boolean;
  enablePerformance: boolean;
  thresholds: QualityThresholds;
  customRules?: CustomQualityRule[];
}

export interface QualityThresholds {
  minQualityScore: number;
  maxCyclomaticComplexity: number;
  maxCognitiveComplexity: number;
  minTestCoverage: number;
  maxDuplicationPercentage: number;
  maxSecurityIssues: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  performance: {
    maxBundleSize: number; // KB
    maxLoadTime: number; // ms
    maxMemoryUsage: number; // MB
  };
}

export interface CustomQualityRule {
  id: string;
  name: string;
  description: string;
  validator: (report: AnalysisReport) => Promise<boolean>;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

export interface QualityTrend {
  projectId: string;
  period: 'day' | 'week' | 'month';
  metrics: TrendMetric[];
}

export interface TrendMetric {
  date: Date;
  qualityScore: number;
  securityScore: number;
  complexityScore: number;
  coverageScore: number;
  performanceScore: number;
}

export interface QualityReport {
  summary: {
    overallScore: number;
    passed: boolean;
    totalBlockers: number;
    improvements: string[];
    degradations: string[];
  };
  details: {
    security: SecurityReport;
    complexity: ComplexityReport;
    coverage: CoverageReport;
    duplication: DuplicationSummary;
    performance: PerformanceSummary;
  };
  recommendations: string[];
  trends?: QualityTrend;
}

export interface SecurityReport {
  score: number;
  issues: SecurityIssue[];
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface ComplexityReport {
  score: number;
  files: FileComplexity[];
  summary: {
    avgCyclomatic: number;
    avgCognitive: number;
    maxCyclomatic: number;
    maxCognitive: number;
  };
}

export interface FileComplexity {
  path: string;
  cyclomatic: number;
  cognitive: number;
  maintainability: number;
}

export interface CoverageReport {
  score: number;
  summary: TestCoverageReport;
  uncoveredFiles: string[];
}

export interface DuplicationSummary {
  percentage: number;
  blocks: number;
  lines: number;
  files: string[];
}

export interface PerformanceSummary {
  score: number;
  bundleSize: number;
  loadTime: number;
  memoryUsage: number;
  optimizations: string[];
}

export class CodeQualityService {
  private static instance: CodeQualityService;
  private analyzer: CodeQualityAnalyzer;
  private qualityGates: Map<string, QualityGateConfig> = new Map();
  
  private defaultThresholds: QualityThresholds = {
    minQualityScore: 7.0,
    maxCyclomaticComplexity: 10,
    maxCognitiveComplexity: 15,
    minTestCoverage: 80,
    maxDuplicationPercentage: 3,
    maxSecurityIssues: {
      critical: 0,
      high: 0,
      medium: 5,
      low: 10
    },
    performance: {
      maxBundleSize: 500, // 500KB
      maxLoadTime: 3000, // 3 seconds
      maxMemoryUsage: 100 // 100MB
    }
  };

  private constructor() {
    this.analyzer = createAnalyzer({
      enableAI: true,
      enableSecurity: true,
      enableComplexity: true,
      enableDuplication: true,
      enableTestAnalysis: true,
      parallel: true,
      cacheEnabled: true,
      aiModel: 'claude-3-opus'
    });
  }

  public static getInstance(): CodeQualityService {
    if (!CodeQualityService.instance) {
      CodeQualityService.instance = new CodeQualityService();
    }
    return CodeQualityService.instance;
  }

  /**
   * Configure quality gates for a project
   */
  public configureQualityGate(projectId: string, config: Partial<QualityGateConfig>): void {
    const existingConfig = this.qualityGates.get(projectId) || this.getDefaultQualityGate();
    const mergedConfig: QualityGateConfig = {
      ...existingConfig,
      ...config,
      thresholds: {
        ...existingConfig.thresholds,
        ...(config.thresholds || {})
      }
    };
    
    this.qualityGates.set(projectId, mergedConfig);
    logger.info('Configured quality gate', { projectId, config: mergedConfig });
  }

  /**
   * Analyze code quality for pre-deployment check
   */
  public async analyzeForDeployment(
    projectPath: string,
    projectId: string,
    options?: {
      commitHash?: string;
      branch?: string;
      compareWithBaseline?: boolean;
    }
  ): Promise<CodeQualityCheck> {
    const checkId = uuidv4();
    const startTime = Date.now();
    
    try {
      logger.info('Starting pre-deployment code quality analysis', {
        checkId,
        projectId,
        projectPath,
        ...options
      });

      // Run comprehensive analysis
      const report = await this.analyzer.analyze([projectPath]);
      
      // Get quality gate configuration
      const qualityGate = this.qualityGates.get(projectId) || this.getDefaultQualityGate();
      
      // Evaluate quality gates
      const blockers = await this.evaluateQualityGates(report, qualityGate);
      const passed = blockers.filter(b => 
        b.severity === 'critical' || b.severity === 'high'
      ).length === 0;

      // Calculate overall score
      const score = this.calculateQualityScore(report);

      // Compare with baseline if requested
      let baselineComparison;
      if (options?.compareWithBaseline) {
        baselineComparison = await this.compareWithBaseline(projectId, report);
      }

      // Create quality check record
      const check: CodeQualityCheck = {
        id: checkId,
        projectId,
        commitHash: options?.commitHash,
        branch: options?.branch,
        report,
        score,
        timestamp: new Date(),
        passed,
        blockers
      };

      // Save to database
      await this.saveQualityCheck(check);

      // Record metrics
      MetricsCollector.recordQualityCheck({
        projectId,
        score: score.overall,
        passed,
        duration: Date.now() - startTime,
        blockersCount: blockers.length
      });

      logger.info('Code quality analysis completed', {
        checkId,
        passed,
        score: score.overall,
        blockers: blockers.length,
        duration: Date.now() - startTime
      });

      return check;
    } catch (error) {
      logger.error('Code quality analysis failed', { error, checkId, projectId });
      throw error;
    }
  }

  /**
   * Generate quality report for deployment
   */
  public async generateDeploymentReport(check: CodeQualityCheck): Promise<QualityReport> {
    const { report, score, blockers } = check;
    
    // Get previous check for comparison
    const previousCheck = await this.getPreviousCheck(check.projectId);
    
    // Calculate improvements and degradations
    const improvements: string[] = [];
    const degradations: string[] = [];
    
    if (previousCheck) {
      const comparison = this.compareChecks(previousCheck, check);
      improvements.push(...comparison.improvements);
      degradations.push(...comparison.degradations);
    }

    // Generate recommendations using AI
    const recommendations = await this.generateAIRecommendations(report, blockers);

    // Get quality trends
    const trends = await this.getQualityTrends(check.projectId, 'week');

    return {
      summary: {
        overallScore: score.overall,
        passed: check.passed,
        totalBlockers: blockers.length,
        improvements,
        degradations
      },
      details: {
        security: this.generateSecurityReport(report),
        complexity: this.generateComplexityReport(report),
        coverage: this.generateCoverageReport(report),
        duplication: this.generateDuplicationReport(report),
        performance: this.generatePerformanceReport(report)
      },
      recommendations,
      trends
    };
  }

  /**
   * Check if deployment should be allowed based on quality
   */
  public async canDeploy(
    projectId: string,
    projectPath: string,
    options?: {
      force?: boolean;
      ignoreBlockers?: string[];
    }
  ): Promise<{ allowed: boolean; reason?: string; check?: CodeQualityCheck }> {
    try {
      const check = await this.analyzeForDeployment(projectPath, projectId);
      
      if (options?.force) {
        logger.warn('Deployment forced despite quality issues', {
          projectId,
          blockers: check.blockers.length
        });
        return { allowed: true, check };
      }

      // Filter out ignored blockers
      const activeBlockers = check.blockers.filter(b => 
        !options?.ignoreBlockers?.includes(b.type)
      );

      const criticalBlockers = activeBlockers.filter(b => b.severity === 'critical');
      const highBlockers = activeBlockers.filter(b => b.severity === 'high');

      if (criticalBlockers.length > 0) {
        return {
          allowed: false,
          reason: `Deployment blocked: ${criticalBlockers.length} critical quality issues found`,
          check
        };
      }

      if (highBlockers.length > 0) {
        return {
          allowed: false,
          reason: `Deployment blocked: ${highBlockers.length} high-severity quality issues found`,
          check
        };
      }

      const qualityGate = this.qualityGates.get(projectId) || this.getDefaultQualityGate();
      if (check.score.overall < qualityGate.thresholds.minQualityScore) {
        return {
          allowed: false,
          reason: `Deployment blocked: Quality score ${check.score.overall.toFixed(1)} below threshold ${qualityGate.thresholds.minQualityScore}`,
          check
        };
      }

      return { allowed: true, check };
    } catch (error) {
      logger.error('Failed to check deployment quality', { error, projectId });
      return {
        allowed: false,
        reason: 'Failed to analyze code quality'
      };
    }
  }

  /**
   * Monitor quality trends
   */
  public async getQualityTrends(
    projectId: string,
    period: 'day' | 'week' | 'month'
  ): Promise<QualityTrend> {
    const query = `
      SELECT 
        date_trunc($2, timestamp) as date,
        AVG((score->>'overall')::float) as quality_score,
        AVG((score->>'security')::float) as security_score,
        AVG((score->>'complexity')::float) as complexity_score,
        AVG((score->>'coverage')::float) as coverage_score,
        AVG((score->>'performance')::float) as performance_score
      FROM code_quality_checks
      WHERE project_id = $1
        AND timestamp >= NOW() - INTERVAL '1 ${period}'
      GROUP BY date
      ORDER BY date ASC
    `;

    const result = await Database.query(query, [projectId, period]);
    
    const metrics: TrendMetric[] = result.rows.map(row => ({
      date: row.date,
      qualityScore: row.quality_score || 0,
      securityScore: row.security_score || 0,
      complexityScore: row.complexity_score || 0,
      coverageScore: row.coverage_score || 0,
      performanceScore: row.performance_score || 0
    }));

    return {
      projectId,
      period,
      metrics
    };
  }

  /**
   * Set up rollback triggers based on quality degradation
   */
  public async setupRollbackTriggers(
    projectId: string,
    deploymentId: string,
    thresholds: {
      maxQualityDrop: number;
      maxNewBlockers: number;
      maxSecurityIssues: number;
    }
  ): Promise<void> {
    try {
      await Database.query(`
        INSERT INTO quality_rollback_triggers 
        (project_id, deployment_id, thresholds, active)
        VALUES ($1, $2, $3, true)
      `, [projectId, deploymentId, JSON.stringify(thresholds)]);

      logger.info('Set up quality rollback triggers', {
        projectId,
        deploymentId,
        thresholds
      });
    } catch (error) {
      logger.error('Failed to setup rollback triggers', { error, projectId });
      throw error;
    }
  }

  /**
   * Check if rollback is needed based on quality
   */
  public async checkRollbackNeeded(
    projectId: string,
    deploymentId: string,
    currentPath: string
  ): Promise<{ needed: boolean; reason?: string }> {
    try {
      // Get rollback triggers
      const triggerResult = await Database.query(`
        SELECT thresholds FROM quality_rollback_triggers
        WHERE project_id = $1 AND deployment_id = $2 AND active = true
      `, [projectId, deploymentId]);

      if (triggerResult.rows.length === 0) {
        return { needed: false };
      }

      const thresholds = triggerResult.rows[0].thresholds;

      // Get pre-deployment quality
      const preDeployResult = await Database.query(`
        SELECT * FROM code_quality_checks
        WHERE project_id = $1 AND timestamp < (
          SELECT created_at FROM deployments WHERE id = $2
        )
        ORDER BY timestamp DESC
        LIMIT 1
      `, [projectId, deploymentId]);

      if (preDeployResult.rows.length === 0) {
        return { needed: false };
      }

      const preDeployCheck = preDeployResult.rows[0];
      
      // Analyze current quality
      const currentCheck = await this.analyzeForDeployment(currentPath, projectId);

      // Check quality drop
      const qualityDrop = preDeployCheck.score.overall - currentCheck.score.overall;
      if (qualityDrop > thresholds.maxQualityDrop) {
        return {
          needed: true,
          reason: `Quality score dropped by ${qualityDrop.toFixed(1)} points`
        };
      }

      // Check new blockers
      const newBlockers = currentCheck.blockers.length - preDeployCheck.blockers.length;
      if (newBlockers > thresholds.maxNewBlockers) {
        return {
          needed: true,
          reason: `${newBlockers} new quality blockers introduced`
        };
      }

      // Check security issues
      const securityIssues = currentCheck.blockers.filter(b => 
        b.type === 'security' && (b.severity === 'critical' || b.severity === 'high')
      ).length;
      
      if (securityIssues > thresholds.maxSecurityIssues) {
        return {
          needed: true,
          reason: `${securityIssues} critical security issues detected`
        };
      }

      return { needed: false };
    } catch (error) {
      logger.error('Failed to check rollback need', { error, projectId });
      return {
        needed: true,
        reason: 'Failed to verify quality, rollback recommended'
      };
    }
  }

  /**
   * Private helper methods
   */
  private getDefaultQualityGate(): QualityGateConfig {
    return {
      enableSecurity: true,
      enableComplexity: true,
      enableCoverage: true,
      enableDuplication: true,
      enablePerformance: true,
      thresholds: this.defaultThresholds
    };
  }

  private async evaluateQualityGates(
    report: AnalysisReport,
    config: QualityGateConfig
  ): Promise<QualityBlocker[]> {
    const blockers: QualityBlocker[] = [];

    // Security checks
    if (config.enableSecurity && report.security) {
      const securityBlockers = this.evaluateSecurityGates(report.security, config.thresholds);
      blockers.push(...securityBlockers);
    }

    // Complexity checks
    if (config.enableComplexity && report.complexity) {
      const complexityBlockers = this.evaluateComplexityGates(report.complexity, config.thresholds);
      blockers.push(...complexityBlockers);
    }

    // Coverage checks
    if (config.enableCoverage && report.testCoverage) {
      const coverageBlockers = this.evaluateCoverageGates(report.testCoverage, config.thresholds);
      blockers.push(...coverageBlockers);
    }

    // Duplication checks
    if (config.enableDuplication && report.duplication) {
      const duplicationBlockers = this.evaluateDuplicationGates(report.duplication, config.thresholds);
      blockers.push(...duplicationBlockers);
    }

    // Performance checks
    if (config.enablePerformance && report.performance) {
      const performanceBlockers = this.evaluatePerformanceGates(report.performance, config.thresholds);
      blockers.push(...performanceBlockers);
    }

    // Custom rules
    if (config.customRules) {
      for (const rule of config.customRules) {
        const passed = await rule.validator(report);
        if (!passed) {
          blockers.push({
            type: 'complexity',
            severity: rule.severity,
            description: rule.message,
            recommendation: `Fix ${rule.name}: ${rule.description}`
          });
        }
      }
    }

    return blockers;
  }

  private evaluateSecurityGates(
    security: any,
    thresholds: QualityThresholds
  ): QualityBlocker[] {
    const blockers: QualityBlocker[] = [];
    const issues = security.issues || [];
    
    const counts = {
      critical: issues.filter((i: any) => i.severity === 'critical').length,
      high: issues.filter((i: any) => i.severity === 'high').length,
      medium: issues.filter((i: any) => i.severity === 'medium').length,
      low: issues.filter((i: any) => i.severity === 'low').length
    };

    if (counts.critical > thresholds.maxSecurityIssues.critical) {
      blockers.push({
        type: 'security',
        severity: 'critical',
        description: `${counts.critical} critical security vulnerabilities found`,
        recommendation: 'Fix all critical security issues before deployment'
      });
    }

    if (counts.high > thresholds.maxSecurityIssues.high) {
      blockers.push({
        type: 'security',
        severity: 'high',
        description: `${counts.high} high-severity security vulnerabilities found`,
        recommendation: 'Address high-severity security issues'
      });
    }

    return blockers;
  }

  private evaluateComplexityGates(
    complexity: ComplexityMetrics,
    thresholds: QualityThresholds
  ): QualityBlocker[] {
    const blockers: QualityBlocker[] = [];
    
    if (complexity.cyclomatic > thresholds.maxCyclomaticComplexity) {
      blockers.push({
        type: 'complexity',
        severity: 'high',
        description: `Cyclomatic complexity ${complexity.cyclomatic} exceeds threshold ${thresholds.maxCyclomaticComplexity}`,
        recommendation: 'Refactor complex functions to improve maintainability'
      });
    }

    if (complexity.cognitive > thresholds.maxCognitiveComplexity) {
      blockers.push({
        type: 'complexity',
        severity: 'medium',
        description: `Cognitive complexity ${complexity.cognitive} exceeds threshold ${thresholds.maxCognitiveComplexity}`,
        recommendation: 'Simplify complex logic and nested structures'
      });
    }

    return blockers;
  }

  private evaluateCoverageGates(
    coverage: TestCoverageReport,
    thresholds: QualityThresholds
  ): QualityBlocker[] {
    const blockers: QualityBlocker[] = [];
    
    const coveragePercent = coverage.line?.percentage || 0;
    if (coveragePercent < thresholds.minTestCoverage) {
      blockers.push({
        type: 'coverage',
        severity: 'high',
        description: `Test coverage ${coveragePercent.toFixed(1)}% below threshold ${thresholds.minTestCoverage}%`,
        recommendation: 'Add more tests to achieve minimum coverage requirements'
      });
    }

    return blockers;
  }

  private evaluateDuplicationGates(
    duplication: DuplicationReport,
    thresholds: QualityThresholds
  ): QualityBlocker[] {
    const blockers: QualityBlocker[] = [];
    
    const duplicationPercent = (duplication.duplicatedLines / duplication.totalLines) * 100;
    if (duplicationPercent > thresholds.maxDuplicationPercentage) {
      blockers.push({
        type: 'duplication',
        severity: 'medium',
        description: `Code duplication ${duplicationPercent.toFixed(1)}% exceeds threshold ${thresholds.maxDuplicationPercentage}%`,
        recommendation: 'Refactor duplicated code into reusable components'
      });
    }

    return blockers;
  }

  private evaluatePerformanceGates(
    performance: PerformanceMetrics,
    thresholds: QualityThresholds
  ): QualityBlocker[] {
    const blockers: QualityBlocker[] = [];
    
    if (performance.bundleSize && performance.bundleSize > thresholds.performance.maxBundleSize * 1024) {
      blockers.push({
        type: 'performance',
        severity: 'medium',
        description: `Bundle size ${(performance.bundleSize / 1024).toFixed(1)}KB exceeds threshold ${thresholds.performance.maxBundleSize}KB`,
        recommendation: 'Optimize bundle size through code splitting and tree shaking'
      });
    }

    if (performance.loadTime && performance.loadTime > thresholds.performance.maxLoadTime) {
      blockers.push({
        type: 'performance',
        severity: 'high',
        description: `Load time ${performance.loadTime}ms exceeds threshold ${thresholds.performance.maxLoadTime}ms`,
        recommendation: 'Improve performance through lazy loading and optimization'
      });
    }

    return blockers;
  }

  private calculateQualityScore(report: AnalysisReport): QualityScore {
    // Calculate component scores
    const securityScore = this.calculateSecurityScore(report.security);
    const complexityScore = this.calculateComplexityScore(report.complexity);
    const coverageScore = this.calculateCoverageScore(report.testCoverage);
    const duplicationScore = this.calculateDuplicationScore(report.duplication);
    const performanceScore = this.calculatePerformanceScore(report.performance);

    // Calculate overall score (weighted average)
    const weights = {
      security: 0.3,
      complexity: 0.2,
      coverage: 0.2,
      duplication: 0.15,
      performance: 0.15
    };

    const overall = (
      securityScore * weights.security +
      complexityScore * weights.complexity +
      coverageScore * weights.coverage +
      duplicationScore * weights.duplication +
      performanceScore * weights.performance
    );

    return {
      overall,
      security: securityScore,
      complexity: complexityScore,
      coverage: coverageScore,
      duplication: duplicationScore,
      performance: performanceScore
    };
  }

  private calculateSecurityScore(security: any): number {
    if (!security || !security.issues) return 10;
    
    const issues = security.issues;
    const criticalCount = issues.filter((i: any) => i.severity === 'critical').length;
    const highCount = issues.filter((i: any) => i.severity === 'high').length;
    const mediumCount = issues.filter((i: any) => i.severity === 'medium').length;
    const lowCount = issues.filter((i: any) => i.severity === 'low').length;

    // Deduct points based on severity
    let score = 10;
    score -= criticalCount * 2;
    score -= highCount * 1;
    score -= mediumCount * 0.5;
    score -= lowCount * 0.1;

    return Math.max(0, score);
  }

  private calculateComplexityScore(complexity: ComplexityMetrics | undefined): number {
    if (!complexity) return 10;
    
    // Score based on cyclomatic and cognitive complexity
    let score = 10;
    
    if (complexity.cyclomatic > 20) score -= 3;
    else if (complexity.cyclomatic > 10) score -= 1.5;
    else if (complexity.cyclomatic > 5) score -= 0.5;

    if (complexity.cognitive > 30) score -= 3;
    else if (complexity.cognitive > 15) score -= 1.5;
    else if (complexity.cognitive > 8) score -= 0.5;

    return Math.max(0, score);
  }

  private calculateCoverageScore(coverage: TestCoverageReport | undefined): number {
    if (!coverage) return 5; // Middle score if no coverage data
    
    const linePercent = coverage.line?.percentage || 0;
    return Math.min(10, linePercent / 10);
  }

  private calculateDuplicationScore(duplication: DuplicationReport | undefined): number {
    if (!duplication) return 10;
    
    const duplicationPercent = (duplication.duplicatedLines / duplication.totalLines) * 100;
    
    if (duplicationPercent === 0) return 10;
    if (duplicationPercent < 3) return 9;
    if (duplicationPercent < 5) return 7;
    if (duplicationPercent < 10) return 5;
    return Math.max(0, 10 - duplicationPercent / 2);
  }

  private calculatePerformanceScore(performance: PerformanceMetrics | undefined): number {
    if (!performance) return 7; // Default score if no performance data
    
    let score = 10;
    
    // Bundle size scoring (assuming KB)
    if (performance.bundleSize) {
      const sizeInKB = performance.bundleSize / 1024;
      if (sizeInKB > 1000) score -= 3;
      else if (sizeInKB > 500) score -= 1.5;
      else if (sizeInKB > 200) score -= 0.5;
    }

    // Load time scoring
    if (performance.loadTime) {
      if (performance.loadTime > 5000) score -= 3;
      else if (performance.loadTime > 3000) score -= 1.5;
      else if (performance.loadTime > 1000) score -= 0.5;
    }

    return Math.max(0, score);
  }

  private async generateAIRecommendations(
    report: AnalysisReport,
    blockers: QualityBlocker[]
  ): Promise<string[]> {
    const recommendations: string[] = [];
    
    // Group blockers by type
    const blockersByType = blockers.reduce((acc, blocker) => {
      if (!acc[blocker.type]) acc[blocker.type] = [];
      acc[blocker.type].push(blocker);
      return acc;
    }, {} as Record<string, QualityBlocker[]>);

    // Generate type-specific recommendations
    for (const [type, typeBlockers] of Object.entries(blockersByType)) {
      switch (type) {
        case 'security':
          recommendations.push(
            '🔒 Security: Run "npm audit fix" to automatically fix vulnerabilities',
            '🔒 Security: Review and update dependencies to latest secure versions',
            '🔒 Security: Implement security headers and input validation'
          );
          break;
        
        case 'complexity':
          recommendations.push(
            '🧩 Complexity: Extract complex functions into smaller, focused units',
            '🧩 Complexity: Use design patterns to simplify architecture',
            '🧩 Complexity: Consider using composition over inheritance'
          );
          break;
        
        case 'coverage':
          recommendations.push(
            '🧪 Testing: Add unit tests for uncovered critical paths',
            '🧪 Testing: Implement integration tests for API endpoints',
            '🧪 Testing: Use test-driven development for new features'
          );
          break;
        
        case 'duplication':
          recommendations.push(
            '📋 Duplication: Create shared utilities for common functionality',
            '📋 Duplication: Use DRY principle - Don\'t Repeat Yourself',
            '📋 Duplication: Consider creating abstract base classes'
          );
          break;
        
        case 'performance':
          recommendations.push(
            '⚡ Performance: Implement code splitting for large bundles',
            '⚡ Performance: Use lazy loading for non-critical components',
            '⚡ Performance: Optimize images and static assets'
          );
          break;
      }
    }

    // Add AI-generated insights if available
    if (report.aiInsights?.recommendations) {
      recommendations.push(...report.aiInsights.recommendations);
    }

    return recommendations.slice(0, 10); // Limit to top 10 recommendations
  }

  private compareChecks(previous: CodeQualityCheck, current: CodeQualityCheck) {
    const improvements: string[] = [];
    const degradations: string[] = [];

    // Compare scores
    if (current.score.overall > previous.score.overall) {
      improvements.push(`Quality score improved by ${(current.score.overall - previous.score.overall).toFixed(1)} points`);
    } else if (current.score.overall < previous.score.overall) {
      degradations.push(`Quality score decreased by ${(previous.score.overall - current.score.overall).toFixed(1)} points`);
    }

    // Compare blocker counts
    const prevCritical = previous.blockers.filter(b => b.severity === 'critical').length;
    const currCritical = current.blockers.filter(b => b.severity === 'critical').length;
    
    if (currCritical < prevCritical) {
      improvements.push(`Fixed ${prevCritical - currCritical} critical issues`);
    } else if (currCritical > prevCritical) {
      degradations.push(`${currCritical - prevCritical} new critical issues introduced`);
    }

    return { improvements, degradations };
  }

  private generateSecurityReport(report: AnalysisReport): SecurityReport {
    const security = report.security || { issues: [] };
    const issues = security.issues || [];
    
    return {
      score: this.calculateSecurityScore(security),
      issues,
      vulnerabilities: {
        critical: issues.filter((i: any) => i.severity === 'critical').length,
        high: issues.filter((i: any) => i.severity === 'high').length,
        medium: issues.filter((i: any) => i.severity === 'medium').length,
        low: issues.filter((i: any) => i.severity === 'low').length
      }
    };
  }

  private generateComplexityReport(report: AnalysisReport): ComplexityReport {
    const complexity = report.complexity || {};
    const fileMetrics = report.fileMetrics || [];
    
    const files: FileComplexity[] = fileMetrics.map((f: any) => ({
      path: f.path,
      cyclomatic: f.complexity?.cyclomatic || 0,
      cognitive: f.complexity?.cognitive || 0,
      maintainability: f.maintainability || 0
    }));

    const avgCyclomatic = files.length > 0 
      ? files.reduce((sum, f) => sum + f.cyclomatic, 0) / files.length 
      : 0;
    
    const avgCognitive = files.length > 0
      ? files.reduce((sum, f) => sum + f.cognitive, 0) / files.length
      : 0;

    return {
      score: this.calculateComplexityScore(complexity),
      files: files.sort((a, b) => b.cyclomatic - a.cyclomatic).slice(0, 10),
      summary: {
        avgCyclomatic,
        avgCognitive,
        maxCyclomatic: Math.max(...files.map(f => f.cyclomatic), 0),
        maxCognitive: Math.max(...files.map(f => f.cognitive), 0)
      }
    };
  }

  private generateCoverageReport(report: AnalysisReport): CoverageReport {
    const coverage = report.testCoverage || {};
    const fileMetrics = report.fileMetrics || [];
    
    const uncoveredFiles = fileMetrics
      .filter((f: any) => !f.testCoverage || f.testCoverage.line.percentage < 50)
      .map((f: any) => f.path);

    return {
      score: this.calculateCoverageScore(coverage),
      summary: coverage,
      uncoveredFiles
    };
  }

  private generateDuplicationReport(report: AnalysisReport): DuplicationSummary {
    const duplication = report.duplication || {
      duplicatedLines: 0,
      totalLines: 1,
      blocks: []
    };

    const percentage = (duplication.duplicatedLines / duplication.totalLines) * 100;
    const affectedFiles = [...new Set(duplication.blocks?.map((b: any) => b.file) || [])];

    return {
      percentage,
      blocks: duplication.blocks?.length || 0,
      lines: duplication.duplicatedLines,
      files: affectedFiles
    };
  }

  private generatePerformanceReport(report: AnalysisReport): PerformanceSummary {
    const performance = report.performance || {};
    
    const optimizations: string[] = [];
    
    if (performance.bundleSize && performance.bundleSize > 500 * 1024) {
      optimizations.push('Consider code splitting to reduce bundle size');
    }
    
    if (performance.loadTime && performance.loadTime > 3000) {
      optimizations.push('Implement lazy loading for better initial load performance');
    }

    if (performance.unusedExports && performance.unusedExports.length > 0) {
      optimizations.push(`Remove ${performance.unusedExports.length} unused exports`);
    }

    return {
      score: this.calculatePerformanceScore(performance),
      bundleSize: performance.bundleSize || 0,
      loadTime: performance.loadTime || 0,
      memoryUsage: performance.memoryUsage || 0,
      optimizations
    };
  }

  private async saveQualityCheck(check: CodeQualityCheck): Promise<void> {
    await Database.query(`
      INSERT INTO code_quality_checks 
      (id, project_id, commit_hash, branch, report, score, timestamp, passed, blockers)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      check.id,
      check.projectId,
      check.commitHash,
      check.branch,
      JSON.stringify(check.report),
      JSON.stringify(check.score),
      check.timestamp,
      check.passed,
      JSON.stringify(check.blockers)
    ]);
  }

  private async getPreviousCheck(projectId: string): Promise<CodeQualityCheck | null> {
    const result = await Database.query(`
      SELECT * FROM code_quality_checks
      WHERE project_id = $1
      ORDER BY timestamp DESC
      LIMIT 1 OFFSET 1
    `, [projectId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      projectId: row.project_id,
      commitHash: row.commit_hash,
      branch: row.branch,
      report: row.report,
      score: row.score,
      timestamp: row.timestamp,
      passed: row.passed,
      blockers: row.blockers
    };
  }

  private async compareWithBaseline(projectId: string, report: AnalysisReport): Promise<any> {
    // Get baseline from main branch
    const baselineResult = await Database.query(`
      SELECT report FROM code_quality_checks
      WHERE project_id = $1 AND branch = 'main'
      ORDER BY timestamp DESC
      LIMIT 1
    `, [projectId]);

    if (baselineResult.rows.length === 0) return null;

    const baseline = baselineResult.rows[0].report;
    
    // Compare metrics
    return {
      scoreChange: this.calculateQualityScore(report).overall - this.calculateQualityScore(baseline).overall,
      newIssues: report.security?.issues.length - baseline.security?.issues.length,
      complexityChange: (report.complexity?.cyclomatic || 0) - (baseline.complexity?.cyclomatic || 0),
      coverageChange: (report.testCoverage?.line?.percentage || 0) - (baseline.testCoverage?.line?.percentage || 0)
    };
  }
}