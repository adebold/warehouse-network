/**
 * Analysis Engine
 * 
 * Coordinates all analyzers and detectors for a single file
 */

import * as fs from 'fs/promises';

import { ComplexityAnalyzer } from '../analyzers/complexity';
import { DependencyAnalyzer } from '../analyzers/dependency';
import { DocumentationAnalyzer } from '../analyzers/documentation';
import { PerformanceAnalyzer } from '../analyzers/performance';
import { SecurityAnalyzer } from '../analyzers/security';
import { CodeSmellDetector } from '../analyzers/smells';
import { TestingAnalyzer } from '../analyzers/testing';
import { ParserFactory } from '../parsers/parser-factory';
import { 
  FileAnalysisResult, 
  CodeQualityConfig,
  CodeIssue
} from '../types';
import { FileTypeDetector } from '../utils/file-type';
import { Logger } from '../utils/logger';

import { MetricsCalculator } from './metrics-calculator';

export class AnalysisEngine {
  private config: CodeQualityConfig;
  private logger: Logger;
  private parserFactory: ParserFactory;
  private complexityAnalyzer: ComplexityAnalyzer;
  private securityAnalyzer: SecurityAnalyzer;
  private performanceAnalyzer: PerformanceAnalyzer;
  private documentationAnalyzer: DocumentationAnalyzer;
  private testingAnalyzer: TestingAnalyzer;
  private codeSmellDetector: CodeSmellDetector;
  private dependencyAnalyzer: DependencyAnalyzer;
  private metricsCalculator: MetricsCalculator;

  constructor(config: CodeQualityConfig) {
    this.config = config;
    this.logger = new Logger('AnalysisEngine');
    
    // Initialize components
    this.parserFactory = new ParserFactory();
    this.complexityAnalyzer = new ComplexityAnalyzer(config);
    this.securityAnalyzer = new SecurityAnalyzer(config);
    this.performanceAnalyzer = new PerformanceAnalyzer(config);
    this.documentationAnalyzer = new DocumentationAnalyzer(config);
    this.testingAnalyzer = new TestingAnalyzer(config);
    this.codeSmellDetector = new CodeSmellDetector(config);
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.metricsCalculator = new MetricsCalculator();
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath: string): Promise<FileAnalysisResult> {
    this.logger.debug(`Analyzing file: ${filePath}`);
    
    try {
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Detect language
      const language = FileTypeDetector.detectLanguage(filePath);
      
      if (!language) {
        this.logger.warn(`Unable to detect language for file: ${filePath}`);
        return this.createEmptyResult(filePath, 'unknown');
      }
      
      // Parse file
      const parser = this.parserFactory.getParser(language);
      const { ast, tokens, errors } = await parser.parse(content, filePath);
      
      if (errors.length > 0) {
        this.logger.warn(`Parse errors in file ${filePath}:`, errors);
      }
      
      // Initialize issues array
      const issues: CodeIssue[] = [];
      
      // Run analyzers in parallel
      const [
        complexityIssues,
        securityIssues,
        performanceIssues,
        documentationIssues,
        testingIssues,
        codeSmells
      ] = await Promise.all([
        this.complexityAnalyzer.analyze(ast, content, filePath),
        this.config.enableSecurityScan ? 
          this.securityAnalyzer.analyze(ast, content, filePath) : [],
        this.config.enablePerformanceAnalysis ? 
          this.performanceAnalyzer.analyze(ast, content, filePath) : [],
        this.config.enableDocumentationAnalysis ? 
          this.documentationAnalyzer.analyze(ast, content, filePath) : [],
        this.config.enableTestAnalysis ? 
          this.testingAnalyzer.analyze(ast, content, filePath) : [],
        this.codeSmellDetector.analyze(ast, content, filePath)
      ]);
      
      // Combine all issues
      issues.push(
        ...complexityIssues,
        ...securityIssues,
        ...performanceIssues,
        ...documentationIssues,
        ...testingIssues,
        ...codeSmells
      );
      
      // Analyze dependencies
      const dependencies = await this.dependencyAnalyzer.analyze(ast, content);
      
      // Calculate file metrics
      const metrics = await this.metricsCalculator.calculate(
        ast,
        content,
        issues,
        dependencies
      );
      
      // Filter issues based on confidence threshold
      const filteredIssues = this.config.enableAI ? 
        issues.filter(issue => issue.aiConfidence >= this.config.modelConfig.confidenceThreshold) :
        issues;
      
      return {
        path: filePath,
        language,
        metrics,
        issues: filteredIssues,
        ast,
        tokens,
        dependencies
      };
      
    } catch (error) {
      this.logger.error(`Failed to analyze file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Create empty result for unsupported files
   */
  private createEmptyResult(filePath: string, language: string): FileAnalysisResult {
    return {
      path: filePath,
      language,
      metrics: {
        lines: 0,
        statements: 0,
        functions: 0,
        classes: 0,
        complexity: {
          cyclomatic: 0,
          cognitive: 0,
          nesting: 0,
          lineOfCode: 0
        },
        coupling: {
          afferent: 0,
          efferent: 0,
          instability: 0,
          abstractness: 0
        },
        cohesion: 0
      },
      issues: []
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: CodeQualityConfig) {
    this.config = config;
    
    // Update all analyzers
    this.complexityAnalyzer.updateConfig(config);
    this.securityAnalyzer.updateConfig(config);
    this.performanceAnalyzer.updateConfig(config);
    this.documentationAnalyzer.updateConfig(config);
    this.testingAnalyzer.updateConfig(config);
    this.codeSmellDetector.updateConfig(config);
  }

  /**
   * Warm up ML models
   */
  async warmUp() {
    this.logger.info('Warming up analysis engine');
    
    await Promise.all([
      this.securityAnalyzer.warmUp(),
      this.performanceAnalyzer.warmUp(),
      this.codeSmellDetector.warmUp()
    ]);
    
    this.logger.info('Analysis engine ready');
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      parsersAvailable: this.parserFactory.getAvailableParsers(),
      analyzersEnabled: {
        complexity: true,
        security: this.config.enableSecurityScan,
        performance: this.config.enablePerformanceAnalysis,
        documentation: this.config.enableDocumentationAnalysis,
        testing: this.config.enableTestAnalysis,
        codeSmells: true
      }
    };
  }
}