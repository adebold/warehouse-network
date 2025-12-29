/**
 * AI Insights Generator
 * 
 * Generates AI-powered insights from analysis results
 */

import { AnomalyDetector } from '../models/anomaly-detector';
import { PatternDetectorModel } from '../models/pattern-detector';
import { RefactoringSuggester } from '../models/refactoring-suggester';
import { 
  FileAnalysisResult, 
  CodeMetrics, 
  CodeIssue,
  AIInsights,
  DetectedPattern,
  QualityPrediction,
  StrategicRecommendation,
  RiskAssessment,
  CodeQualityConfig
} from '../types';
import { Logger } from '../utils/logger';

export class AIInsightsGenerator {
  private config: CodeQualityConfig;
  private patternDetector: PatternDetectorModel;
  private anomalyDetector: AnomalyDetector;
  private refactoringSuggester: RefactoringSuggester;
  private logger: Logger;

  constructor(config: CodeQualityConfig) {
    this.config = config;
    this.logger = new Logger('AIInsightsGenerator');
    
    this.patternDetector = new PatternDetectorModel();
    this.anomalyDetector = new AnomalyDetector();
    this.refactoringSuggester = new RefactoringSuggester();
  }

  /**
   * Generate AI insights
   */
  async generate(
    files: FileAnalysisResult[],
    metrics: CodeMetrics,
    issues: CodeIssue[]
  ): Promise<AIInsights> {
    this.logger.info('Generating AI insights');
    
    try {
      // Initialize models if needed
      await Promise.all([
        this.patternDetector.initialize(),
        this.anomalyDetector.initialize(),
        this.refactoringSuggester.initialize()
      ]);
      
      // Generate insights in parallel
      const [patterns, predictions, recommendations, risks] = await Promise.all([
        this.detectPatterns(files),
        this.generatePredictions(metrics, issues),
        this.generateStrategicRecommendations(files, metrics, issues),
        this.assessRisks(files, metrics, issues)
      ]);
      
      return {
        patterns,
        predictions,
        recommendations,
        risks
      };
    } catch (error) {
      this.logger.error('Failed to generate AI insights', error);
      
      // Return empty insights on error
      return {
        patterns: [],
        predictions: [],
        recommendations: [],
        risks: []
      };
    }
  }

  /**
   * Detect code patterns
   */
  private async detectPatterns(files: FileAnalysisResult[]): Promise<DetectedPattern[]> {
    const allPatterns: DetectedPattern[] = [];
    
    // Detect patterns in each file
    for (const file of files) {
      if (file.ast) {
        const patterns = await this.patternDetector.detect(file.ast);
        allPatterns.push(...patterns);
      }
    }
    
    // Aggregate and rank patterns
    return this.aggregatePatterns(allPatterns);
  }

  /**
   * Generate quality predictions
   */
  private async generatePredictions(
    metrics: CodeMetrics,
    issues: CodeIssue[]
  ): Promise<QualityPrediction[]> {
    const predictions: QualityPrediction[] = [];
    
    // Predict complexity growth
    predictions.push({
      metric: 'Cyclomatic Complexity',
      currentValue: metrics.complexity.cyclomatic,
      predictedValue: this.predictComplexityGrowth(metrics.complexity.cyclomatic, issues),
      timeframe: '3 months',
      confidence: 0.75,
      factors: [
        'Current growth rate',
        'Number of high-complexity functions',
        'Code duplication patterns'
      ]
    });
    
    // Predict technical debt
    predictions.push({
      metric: 'Technical Debt',
      currentValue: metrics.debt.score,
      predictedValue: this.predictTechnicalDebt(metrics, issues),
      timeframe: '6 months',
      confidence: 0.7,
      factors: [
        'Issue accumulation rate',
        'Code quality trend',
        'Refactoring frequency'
      ]
    });
    
    // Predict maintainability
    predictions.push({
      metric: 'Maintainability Index',
      currentValue: metrics.complexity.maintainabilityIndex,
      predictedValue: this.predictMaintainability(metrics, issues),
      timeframe: '3 months',
      confidence: 0.8,
      factors: [
        'Code complexity growth',
        'Documentation coverage',
        'Test coverage trends'
      ]
    });
    
    return predictions;
  }

  /**
   * Generate strategic recommendations
   */
  private async generateStrategicRecommendations(
    files: FileAnalysisResult[],
    metrics: CodeMetrics,
    issues: CodeIssue[]
  ): Promise<StrategicRecommendation[]> {
    const recommendations: StrategicRecommendation[] = [];
    
    // Analyze issue patterns
    const issuePatterns = this.analyzeIssuePatterns(issues);
    
    // High complexity recommendation
    if (metrics.complexity.cyclomatic > 15) {
      recommendations.push({
        priority: 'high',
        category: 'Architecture',
        title: 'Reduce Code Complexity',
        description: 'Your codebase has high cyclomatic complexity. Consider breaking down complex functions and modules.',
        estimatedImpact: '30% reduction in bug density',
        estimatedEffort: '2-3 weeks',
        steps: [
          'Identify functions with complexity > 10',
          'Extract methods from complex conditionals',
          'Implement strategy pattern for complex switches',
          'Create smaller, focused modules'
        ]
      });
    }
    
    // Security recommendation
    const securityIssues = issues.filter(i => i.category === 'security');
    if (securityIssues.length > 5) {
      recommendations.push({
        priority: 'critical',
        category: 'Security',
        title: 'Security Hardening Required',
        description: `Found ${securityIssues.length} security vulnerabilities that need immediate attention.`,
        estimatedImpact: 'Prevent potential security breaches',
        estimatedEffort: '1-2 weeks',
        steps: [
          'Fix all SQL injection vulnerabilities',
          'Implement input validation',
          'Update authentication mechanisms',
          'Add security headers and CORS configuration'
        ]
      });
    }
    
    // Performance recommendation
    if (metrics.quality.performance < 70) {
      recommendations.push({
        priority: 'medium',
        category: 'Performance',
        title: 'Performance Optimization Needed',
        description: 'Performance score indicates potential bottlenecks in the codebase.',
        estimatedImpact: '40% improvement in response times',
        estimatedEffort: '1-2 weeks',
        steps: [
          'Profile application to identify bottlenecks',
          'Implement caching strategies',
          'Optimize database queries',
          'Add lazy loading for heavy components'
        ]
      });
    }
    
    // Test coverage recommendation
    if (metrics.coverage.test < 70) {
      recommendations.push({
        priority: 'medium',
        category: 'Testing',
        title: 'Improve Test Coverage',
        description: 'Low test coverage increases the risk of bugs and regressions.',
        estimatedImpact: '50% reduction in production bugs',
        estimatedEffort: '2-3 weeks',
        steps: [
          'Identify untested critical paths',
          'Write unit tests for core business logic',
          'Add integration tests for APIs',
          'Implement automated E2E tests'
        ]
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Assess risks
   */
  private async assessRisks(
    files: FileAnalysisResult[],
    metrics: CodeMetrics,
    issues: CodeIssue[]
  ): Promise<RiskAssessment[]> {
    const risks: RiskAssessment[] = [];
    
    // Security risk
    const securityScore = metrics.quality.security;
    if (securityScore < 70) {
      risks.push({
        category: 'Security',
        level: securityScore < 50 ? 'critical' : 'high',
        description: 'Multiple security vulnerabilities detected that could lead to data breaches',
        likelihood: 0.7,
        impact: 0.9,
        mitigationStrategies: [
          'Conduct security audit',
          'Implement security best practices',
          'Regular dependency updates',
          'Security training for developers'
        ]
      });
    }
    
    // Maintainability risk
    if (metrics.complexity.maintainabilityIndex < 50) {
      risks.push({
        category: 'Maintainability',
        level: 'high',
        description: 'Code complexity is making the system difficult to maintain and extend',
        likelihood: 0.8,
        impact: 0.7,
        mitigationStrategies: [
          'Refactor complex modules',
          'Improve documentation',
          'Establish coding standards',
          'Regular code reviews'
        ]
      });
    }
    
    // Technical debt risk
    if (metrics.debt.score < 50) {
      risks.push({
        category: 'Technical Debt',
        level: 'medium',
        description: 'Accumulated technical debt is slowing down development',
        likelihood: 0.9,
        impact: 0.6,
        mitigationStrategies: [
          'Allocate time for refactoring',
          'Prioritize debt reduction',
          'Automate repetitive tasks',
          'Improve development practices'
        ]
      });
    }
    
    // Dependency risk
    const anomalies = await this.anomalyDetector.detectAnomalies(files);
    if (anomalies.length > 0) {
      risks.push({
        category: 'Dependencies',
        level: 'medium',
        description: 'Unusual patterns detected in dependency usage',
        likelihood: 0.5,
        impact: 0.5,
        mitigationStrategies: [
          'Review dependency usage',
          'Update outdated packages',
          'Remove unused dependencies',
          'Implement dependency policies'
        ]
      });
    }
    
    return risks;
  }

  /**
   * Aggregate patterns
   */
  private aggregatePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
    const patternMap = new Map<string, DetectedPattern>();
    
    for (const pattern of patterns) {
      const existing = patternMap.get(pattern.name);
      if (existing) {
        existing.occurrences += pattern.occurrences;
        existing.confidence = Math.max(existing.confidence, pattern.confidence);
      } else {
        patternMap.set(pattern.name, { ...pattern });
      }
    }
    
    return Array.from(patternMap.values())
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10); // Top 10 patterns
  }

  /**
   * Analyze issue patterns
   */
  private analyzeIssuePatterns(issues: CodeIssue[]) {
    const patterns = new Map<string, number>();
    
    issues.forEach(issue => {
      const key = `${issue.type}-${issue.category}`;
      patterns.set(key, (patterns.get(key) || 0) + 1);
    });
    
    return patterns;
  }

  /**
   * Predict complexity growth
   */
  private predictComplexityGrowth(current: number, issues: CodeIssue[]): number {
    // Simple linear projection based on issue density
    const complexityIssues = issues.filter(i => i.rule.includes('complexity'));
    const growthRate = 0.1 + (complexityIssues.length * 0.02);
    
    return Math.round(current * (1 + growthRate) * 10) / 10;
  }

  /**
   * Predict technical debt
   */
  private predictTechnicalDebt(metrics: CodeMetrics, issues: CodeIssue[]): number {
    const currentDebt = metrics.debt.score;
    const issueGrowthFactor = issues.length / 100;
    
    return Math.max(0, currentDebt - (issueGrowthFactor * 10));
  }

  /**
   * Predict maintainability
   */
  private predictMaintainability(metrics: CodeMetrics, issues: CodeIssue[]): number {
    const current = metrics.complexity.maintainabilityIndex;
    const maintainabilityIssues = issues.filter(i => i.category === 'maintainability');
    const declineFactor = maintainabilityIssues.length * 0.5;
    
    return Math.max(0, current - declineFactor);
  }

  /**
   * Update configuration
   */
  updateConfig(config: CodeQualityConfig) {
    this.config = config;
  }
}