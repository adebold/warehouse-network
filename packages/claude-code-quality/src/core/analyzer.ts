/**
 * Core Code Quality Analyzer
 * 
 * Main orchestration class that coordinates all analysis components
 */

import { EventEmitter } from 'events';

import { glob } from 'glob';
import pLimit from 'p-limit';

import { 
  CodeQualityConfig, 
  AnalysisResult, 
  FileAnalysisResult,
  CodeMetrics,
  AnalysisSummary,
  CodeIssue,
  AIInsights
} from '../types';
import { CacheManager } from '../utils/cache';
import { ConfigValidator } from '../utils/config-validator';
import { Logger } from '../utils/logger';

import { AIInsightsGenerator } from './ai-insights';
import { AnalysisEngine } from './engine';
import { MetricsAggregator } from './metrics-aggregator';


export class CodeQualityAnalyzer extends EventEmitter {
  private config: CodeQualityConfig;
  private engine: AnalysisEngine;
  private metricsAggregator: MetricsAggregator;
  private aiInsights: AIInsightsGenerator;
  private cache: CacheManager;
  private logger: Logger;

  constructor(config?: Partial<CodeQualityConfig>) {
    super();
    
    // Initialize with default config
    this.config = this.mergeWithDefaults(config);
    
    // Validate configuration
    ConfigValidator.validate(this.config);
    
    // Initialize components
    this.logger = new Logger('CodeQualityAnalyzer');
    this.cache = new CacheManager(this.config.modelConfig.cacheResults);
    this.engine = new AnalysisEngine(this.config);
    this.metricsAggregator = new MetricsAggregator();
    this.aiInsights = new AIInsightsGenerator(this.config);
    
    this.setupEventHandlers();
  }

  /**
   * Analyze code quality for given paths
   */
  async analyze(paths: string[]): Promise<AnalysisResult> {
    const startTime = Date.now();
    this.logger.info('Starting code quality analysis', { paths });
    
    try {
      // Resolve file paths
      const files = await this.resolveFiles(paths);
      this.logger.info(`Found ${files.length} files to analyze`);
      
      if (files.length === 0) {
        throw new Error('No files found to analyze');
      }
      
      // Check cache for previous results
      const cacheKey = this.cache.generateKey(files);
      const cachedResult = await this.cache.get<AnalysisResult>(cacheKey);
      
      if (cachedResult && !this.shouldInvalidateCache(cachedResult)) {
        this.logger.info('Returning cached analysis result');
        return cachedResult;
      }
      
      // Analyze files in parallel with concurrency limit
      const limit = pLimit(this.config.modelConfig.updateFrequency === 'realtime' ? 4 : 8);
      const fileResults = await Promise.all(
        files.map(file => limit(() => this.analyzeFile(file)))
      );
      
      // Aggregate metrics
      const metrics = await this.metricsAggregator.aggregate(fileResults);
      
      // Collect all issues
      const issues = fileResults.flatMap(result => result.issues);
      
      // Generate AI insights
      const aiInsights = await this.generateAIInsights(fileResults, metrics, issues);
      
      // Create summary
      const summary = this.createSummary(fileResults, issues);
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(issues, metrics);
      
      // Build final result
      const result: AnalysisResult = {
        timestamp: new Date(),
        duration: Date.now() - startTime,
        files: fileResults,
        summary,
        metrics,
        issues,
        recommendations,
        aiInsights
      };
      
      // Cache result
      await this.cache.set(cacheKey, result);
      
      // Emit completion event
      this.emit('analysis:complete', result);
      
      this.logger.info('Analysis completed successfully', {
        duration: result.duration,
        filesAnalyzed: result.files.length,
        issuesFound: result.issues.length
      });
      
      return result;
    } catch (error) {
      this.logger.error('Analysis failed', error);
      this.emit('analysis:error', error);
      throw error;
    }
  }

  /**
   * Analyze a single file
   */
  private async analyzeFile(filePath: string): Promise<FileAnalysisResult> {
    this.emit('file:start', filePath);
    
    try {
      const result = await this.engine.analyzeFile(filePath);
      this.emit('file:complete', filePath, result);
      return result;
    } catch (error) {
      this.emit('file:error', filePath, error);
      throw error;
    }
  }

  /**
   * Resolve file paths using glob patterns
   */
  private async resolveFiles(paths: string[]): Promise<string[]> {
    const allFiles = new Set<string>();
    
    for (const pattern of paths) {
      const files = await glob(pattern, {
        ignore: this.config.exclude,
        absolute: true
      });
      
      files.forEach(file => allFiles.add(file));
    }
    
    // Apply include patterns
    if (this.config.include.length > 0) {
      const includeSet = new Set<string>();
      
      for (const pattern of this.config.include) {
        const files = await glob(pattern, {
          ignore: this.config.exclude,
          absolute: true
        });
        
        files.forEach(file => includeSet.add(file));
      }
      
      // Keep only files that match include patterns
      return Array.from(allFiles).filter(file => includeSet.has(file));
    }
    
    return Array.from(allFiles);
  }

  /**
   * Generate AI insights from analysis results
   */
  private async generateAIInsights(
    files: FileAnalysisResult[],
    metrics: CodeMetrics,
    issues: CodeIssue[]
  ): Promise<AIInsights> {
    if (!this.config.enableAI) {
      return {
        patterns: [],
        predictions: [],
        recommendations: [],
        risks: []
      };
    }
    
    return this.aiInsights.generate(files, metrics, issues);
  }

  /**
   * Create analysis summary
   */
  private createSummary(files: FileAnalysisResult[], issues: CodeIssue[]): AnalysisSummary {
    const issuesBySeverity = issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const issuesByCategory = issues.reduce((acc, issue) => {
      acc[issue.category] = (acc[issue.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalFiles: files.length,
      totalIssues: issues.length,
      issuesBySeverity: issuesBySeverity as any,
      issuesByCategory: issuesByCategory as any,
      overallScore: this.calculateOverallScore(files, issues),
      trend: this.determineTrend()
    };
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallScore(files: FileAnalysisResult[], issues: CodeIssue[]): number {
    const severityWeights = {
      info: 0.1,
      warning: 0.3,
      error: 0.6,
      critical: 1.0
    };
    
    const totalWeight = issues.reduce((sum, issue) => {
      return sum + severityWeights[issue.severity];
    }, 0);
    
    const maxPossibleWeight = files.length * 10; // Assuming max 10 weighted issues per file
    const score = Math.max(0, 100 - (totalWeight / maxPossibleWeight) * 100);
    
    return Math.round(score * 10) / 10;
  }

  /**
   * Determine quality trend
   */
  private determineTrend(): 'improving' | 'stable' | 'declining' {
    // TODO: Implement trend analysis based on historical data
    return 'stable';
  }

  /**
   * Generate refactoring recommendations
   */
  private async generateRecommendations(issues: CodeIssue[], metrics: CodeMetrics) {
    const recommendations = [];
    
    // Extract recommendations from issues
    for (const issue of issues) {
      if (issue.recommendation) {
        recommendations.push(issue.recommendation);
      }
    }
    
    // Add high-level recommendations based on metrics
    if (metrics.complexity.cyclomatic > this.config.thresholds.complexity.cyclomatic) {
      recommendations.push({
        type: 'simplify-conditional' as const,
        description: 'High cyclomatic complexity detected. Consider breaking down complex methods.',
        impact: 'high' as const,
        effort: 'medium' as const
      });
    }
    
    return recommendations;
  }

  /**
   * Check if cache should be invalidated
   */
  private shouldInvalidateCache(cachedResult: AnalysisResult): boolean {
    const cacheAge = Date.now() - cachedResult.timestamp.getTime();
    const maxAge = 3600000; // 1 hour
    
    return cacheAge > maxAge;
  }

  /**
   * Merge user config with defaults
   */
  private mergeWithDefaults(userConfig?: Partial<CodeQualityConfig>): CodeQualityConfig {
    const defaults: CodeQualityConfig = {
      enableAI: true,
      enableSecurityScan: true,
      enablePerformanceAnalysis: true,
      enableDocumentationAnalysis: true,
      enableTestAnalysis: true,
      
      thresholds: {
        complexity: {
          cyclomatic: 10,
          cognitive: 15
        },
        maintainability: 60,
        testCoverage: 80,
        documentationCoverage: 70,
        securityScore: 85,
        performanceScore: 80
      },
      
      modelConfig: {
        enabledModels: ['pattern-detection', 'security-scan', 'performance'],
        confidenceThreshold: 0.7,
        cacheResults: true,
        updateFrequency: 'batch'
      },
      
      include: [],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      
      output: {
        format: 'json',
        includeRecommendations: true,
        includeMetrics: true,
        verbosity: 'normal'
      }
    };
    
    return { ...defaults, ...userConfig };
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers() {
    this.on('file:start', (file) => {
      this.logger.debug(`Analyzing file: ${file}`);
    });
    
    this.on('file:complete', (file, result) => {
      this.logger.debug(`File analysis complete: ${file}`, {
        issues: result.issues.length,
        complexity: result.metrics.complexity.cyclomatic
      });
    });
    
    this.on('file:error', (file, error) => {
      this.logger.error(`File analysis failed: ${file}`, error);
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CodeQualityConfig>) {
    this.config = { ...this.config, ...config };
    ConfigValidator.validate(this.config);
    
    // Update components with new config
    this.engine.updateConfig(this.config);
    this.aiInsights.updateConfig(this.config);
  }

  /**
   * Clear cache
   */
  async clearCache() {
    await this.cache.clear();
    this.logger.info('Cache cleared');
  }

  /**
   * Get current configuration
   */
  getConfig(): CodeQualityConfig {
    return { ...this.config };
  }
}