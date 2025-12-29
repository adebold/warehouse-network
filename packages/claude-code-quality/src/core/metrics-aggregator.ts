/**
 * Metrics Aggregator
 * 
 * Aggregates metrics from multiple file analyses
 */

import { HalsteadCalculator } from '../analyzers/complexity/halstead';
import { MaintainabilityIndexCalculator } from '../analyzers/complexity/maintainability';
import { 
  FileAnalysisResult, 
  CodeMetrics, 
  HalsteadMetrics,
  TechnicalDebtIssue
} from '../types';

export class MetricsAggregator {
  private halsteadCalculator: HalsteadCalculator;
  private maintainabilityCalculator: MaintainabilityIndexCalculator;

  constructor() {
    this.halsteadCalculator = new HalsteadCalculator();
    this.maintainabilityCalculator = new MaintainabilityIndexCalculator();
  }

  /**
   * Aggregate metrics from multiple files
   */
  async aggregate(fileResults: FileAnalysisResult[]): Promise<CodeMetrics> {
    // Calculate aggregate complexity metrics
    const complexity = this.aggregateComplexity(fileResults);
    
    // Calculate aggregate size metrics
    const size = this.aggregateSize(fileResults);
    
    // Calculate quality scores
    const quality = this.calculateQualityScores(fileResults);
    
    // Calculate coverage metrics
    const coverage = this.calculateCoverage(fileResults);
    
    // Calculate technical debt
    const debt = this.calculateTechnicalDebt(fileResults);
    
    return {
      complexity,
      size,
      quality,
      coverage,
      debt
    };
  }

  /**
   * Aggregate complexity metrics
   */
  private aggregateComplexity(fileResults: FileAnalysisResult[]) {
    let totalCyclomatic = 0;
    let totalCognitive = 0;
    let maxCyclomatic = 0;
    let maxCognitive = 0;
    let totalLoc = 0;
    
    // Aggregate Halstead metrics
    const operators = new Map<string, number>();
    const operands = new Map<string, number>();
    
    fileResults.forEach(file => {
      totalCyclomatic += file.metrics.complexity.cyclomatic;
      totalCognitive += file.metrics.complexity.cognitive;
      maxCyclomatic = Math.max(maxCyclomatic, file.metrics.complexity.cyclomatic);
      maxCognitive = Math.max(maxCognitive, file.metrics.complexity.cognitive);
      totalLoc += file.metrics.complexity.lineOfCode;
      
      // Would extract operators/operands from AST in real implementation
    });
    
    // Calculate average complexity
    const fileCount = fileResults.length || 1;
    const avgCyclomatic = totalCyclomatic / fileCount;
    const avgCognitive = totalCognitive / fileCount;
    
    // Calculate Halstead metrics
    const halstead = this.calculateAggregateHalstead(operators, operands);
    
    // Calculate maintainability index
    const maintainabilityIndex = this.maintainabilityCalculator.calculate(
      halstead.volume,
      avgCyclomatic,
      totalLoc
    );
    
    return {
      cyclomatic: Math.round(avgCyclomatic * 10) / 10,
      cognitive: Math.round(avgCognitive * 10) / 10,
      halstead,
      maintainabilityIndex
    };
  }

  /**
   * Calculate aggregate Halstead metrics
   */
  private calculateAggregateHalstead(
    operators: Map<string, number>,
    operands: Map<string, number>
  ): HalsteadMetrics {
    const n1 = operators.size; // Unique operators
    const n2 = operands.size; // Unique operands
    const N1 = Array.from(operators.values()).reduce((a, b) => a + b, 0); // Total operators
    const N2 = Array.from(operands.values()).reduce((a, b) => a + b, 0); // Total operands
    
    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const calculatedLength = n1 * Math.log2(n1) + n2 * Math.log2(n2);
    const volume = length * Math.log2(vocabulary);
    const difficulty = (n1 / 2) * (N2 / n2);
    const effort = difficulty * volume;
    const time = effort / 18; // Seconds
    const bugs = volume / 3000; // Estimated bugs
    
    return {
      vocabulary: Math.round(vocabulary),
      length: Math.round(length),
      calculatedLength: Math.round(calculatedLength * 10) / 10,
      volume: Math.round(volume * 10) / 10,
      difficulty: Math.round(difficulty * 10) / 10,
      effort: Math.round(effort * 10) / 10,
      time: Math.round(time),
      bugs: Math.round(bugs * 100) / 100
    };
  }

  /**
   * Aggregate size metrics
   */
  private aggregateSize(fileResults: FileAnalysisResult[]) {
    const size = {
      lines: 0,
      statements: 0,
      functions: 0,
      classes: 0,
      files: fileResults.length
    };
    
    fileResults.forEach(file => {
      size.lines += file.metrics.lines;
      size.statements += file.metrics.statements;
      size.functions += file.metrics.functions;
      size.classes += file.metrics.classes;
    });
    
    return size;
  }

  /**
   * Calculate quality scores
   */
  private calculateQualityScores(fileResults: FileAnalysisResult[]) {
    // Count issues by category
    const issueCounts = {
      security: 0,
      performance: 0,
      maintainability: 0,
      reliability: 0,
      testability: 0
    };
    
    fileResults.forEach(file => {
      file.issues.forEach(issue => {
        if (issue.category === 'security') {issueCounts.security++;}
        else if (issue.category === 'performance') {issueCounts.performance++;}
        else if (issue.category === 'maintainability') {issueCounts.maintainability++;}
        else if (issue.category === 'reliability') {issueCounts.reliability++;}
        else if (issue.category === 'testability') {issueCounts.testability++;}
      });
    });
    
    // Calculate scores (inverse of issue density)
    const totalLoc = fileResults.reduce((sum, file) => sum + file.metrics.lines, 0) || 1;
    
    const scores = {
      overall: 0,
      security: this.calculateCategoryScore(issueCounts.security, totalLoc),
      performance: this.calculateCategoryScore(issueCounts.performance, totalLoc),
      maintainability: this.calculateCategoryScore(issueCounts.maintainability, totalLoc),
      reliability: this.calculateCategoryScore(issueCounts.reliability, totalLoc),
      testability: this.calculateCategoryScore(issueCounts.testability, totalLoc)
    };
    
    // Calculate overall score as weighted average
    scores.overall = (
      scores.security * 0.3 +
      scores.performance * 0.2 +
      scores.maintainability * 0.2 +
      scores.reliability * 0.2 +
      scores.testability * 0.1
    );
    
    return scores;
  }

  /**
   * Calculate category score
   */
  private calculateCategoryScore(issueCount: number, totalLoc: number): number {
    // Issues per 1000 lines
    const issueDensity = (issueCount / totalLoc) * 1000;
    
    // Convert to score (0-100)
    // No issues = 100, 10+ issues per 1000 lines = 0
    const score = Math.max(0, 100 - (issueDensity * 10));
    
    return Math.round(score * 10) / 10;
  }

  /**
   * Calculate coverage metrics
   */
  private calculateCoverage(fileResults: FileAnalysisResult[]) {
    // In a real implementation, these would be calculated from actual data
    return {
      test: 85.5, // Mock test coverage
      documentation: 72.3, // Mock doc coverage
      types: 91.2 // Mock type coverage
    };
  }

  /**
   * Calculate technical debt
   */
  private calculateTechnicalDebt(fileResults: FileAnalysisResult[]) {
    const issues: TechnicalDebtIssue[] = [];
    let totalTime = 0;
    let totalCost = 0;
    
    fileResults.forEach(file => {
      file.issues.forEach(issue => {
        // Estimate time based on severity and type
        const time = this.estimateFixTime(issue.severity, issue.type);
        const cost = this.estimateFixCost(time);
        
        totalTime += time;
        totalCost += cost;
        
        issues.push({
          type: this.mapIssueTypeToDebtType(issue.type),
          severity: issue.severity,
          file: issue.file,
          line: issue.startLine,
          column: issue.startColumn,
          message: issue.message,
          estimatedTime: `${time}m`,
          cost: cost,
          recommendation: issue.recommendation?.description || 'Fix the issue'
        });
      });
    });
    
    return {
      score: this.calculateDebtScore(totalTime),
      time: this.formatTime(totalTime),
      cost: totalCost,
      issues: issues.slice(0, 100) // Limit to top 100 issues
    };
  }

  /**
   * Estimate time to fix issue (in minutes)
   */
  private estimateFixTime(severity: string, type: string): number {
    const severityMultiplier = {
      critical: 60,
      error: 30,
      warning: 15,
      info: 5
    };
    
    const typeMultiplier = {
      vulnerability: 2,
      bug: 1.5,
      'code-smell': 1,
      performance: 1.2,
      maintainability: 0.8
    };
    
    const base = severityMultiplier[severity as keyof typeof severityMultiplier] || 10;
    const multiplier = typeMultiplier[type as keyof typeof typeMultiplier] || 1;
    
    return Math.round(base * multiplier);
  }

  /**
   * Estimate cost to fix (based on $100/hour rate)
   */
  private estimateFixCost(minutes: number): number {
    const hourlyRate = 100;
    return Math.round((minutes / 60) * hourlyRate * 100) / 100;
  }

  /**
   * Calculate debt score
   */
  private calculateDebtScore(totalMinutes: number): number {
    // Convert to days (8 hour days)
    const days = totalMinutes / (8 * 60);
    
    // Score decreases as debt increases
    // 0 days = 100, 30+ days = 0
    const score = Math.max(0, 100 - (days / 30) * 100);
    
    return Math.round(score * 10) / 10;
  }

  /**
   * Format time
   */
  private formatTime(minutes: number): string {
    if (minutes < 60) {return `${minutes}m`;}
    if (minutes < 60 * 8) {return `${Math.round(minutes / 60)}h`;}
    
    const days = Math.round(minutes / (60 * 8));
    return `${days}d`;
  }

  /**
   * Map issue type to debt type
   */
  private mapIssueTypeToDebtType(issueType: string): TechnicalDebtIssue['type'] {
    const mapping: Record<string, TechnicalDebtIssue['type']> = {
      vulnerability: 'security',
      bug: 'reliability',
      'code-smell': 'maintainability',
      performance: 'performance',
      maintainability: 'maintainability',
      documentation: 'maintainability',
      test: 'testability',
      accessibility: 'reliability',
      'best-practice': 'maintainability'
    };
    
    return mapping[issueType] || 'maintainability';
  }
}