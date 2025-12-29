/**
 * Configuration Validator
 * 
 * Validates code quality configuration
 */

import Joi from 'joi';

import { CodeQualityConfig } from '../types';

import { Logger } from './logger';

export class ConfigValidator {
  private static logger = new Logger('ConfigValidator');

  private static schema = Joi.object({
    enableAI: Joi.boolean().required(),
    enableSecurityScan: Joi.boolean().required(),
    enablePerformanceAnalysis: Joi.boolean().required(),
    enableDocumentationAnalysis: Joi.boolean().required(),
    enableTestAnalysis: Joi.boolean().required(),
    
    thresholds: Joi.object({
      complexity: Joi.object({
        cyclomatic: Joi.number().min(1).max(50).required(),
        cognitive: Joi.number().min(1).max(100).required()
      }).required(),
      maintainability: Joi.number().min(0).max(100).required(),
      testCoverage: Joi.number().min(0).max(100).required(),
      documentationCoverage: Joi.number().min(0).max(100).required(),
      securityScore: Joi.number().min(0).max(100).required(),
      performanceScore: Joi.number().min(0).max(100).required()
    }).required(),
    
    modelConfig: Joi.object({
      enabledModels: Joi.array().items(Joi.string()).required(),
      confidenceThreshold: Joi.number().min(0).max(1).required(),
      cacheResults: Joi.boolean().required(),
      updateFrequency: Joi.string().valid('realtime', 'batch', 'manual').required()
    }).required(),
    
    include: Joi.array().items(Joi.string()).required(),
    exclude: Joi.array().items(Joi.string()).required(),
    
    output: Joi.object({
      format: Joi.string().valid('json', 'html', 'markdown', 'terminal').required(),
      includeRecommendations: Joi.boolean().required(),
      includeMetrics: Joi.boolean().required(),
      verbosity: Joi.string().valid('minimal', 'normal', 'detailed').required()
    }).required()
  });

  /**
   * Validate configuration
   */
  static validate(config: CodeQualityConfig): void {
    const { error, value } = this.schema.validate(config, {
      abortEarly: false,
      allowUnknown: false
    });

    if (error) {
      const details = error.details.map(d => d.message).join(', ');
      throw new Error(`Invalid configuration: ${details}`);
    }

    // Additional business logic validation
    this.validateBusinessRules(value);
    
    this.logger.debug('Configuration validated successfully');
  }

  /**
   * Validate business rules
   */
  private static validateBusinessRules(config: CodeQualityConfig) {
    // Check that at least one analysis is enabled
    const analysisEnabled = 
      config.enableSecurityScan ||
      config.enablePerformanceAnalysis ||
      config.enableDocumentationAnalysis ||
      config.enableTestAnalysis;
    
    if (!analysisEnabled) {
      this.logger.warn('No analysis features enabled');
    }

    // Check that AI models match enabled features
    if (config.enableAI && config.modelConfig.enabledModels.length === 0) {
      throw new Error('AI enabled but no models specified');
    }

    // Validate threshold relationships
    if (config.thresholds.complexity.cyclomatic > config.thresholds.complexity.cognitive) {
      this.logger.warn('Cyclomatic complexity threshold is higher than cognitive complexity threshold');
    }

    // Check include/exclude patterns
    if (config.include.length === 0 && config.exclude.length === 0) {
      this.logger.warn('No include or exclude patterns specified - will analyze all files');
    }
  }

  /**
   * Merge configurations with validation
   */
  static merge(base: CodeQualityConfig, override: Partial<CodeQualityConfig>): CodeQualityConfig {
    const merged = this.deepMerge(base, override);
    this.validate(merged);
    return merged;
  }

  /**
   * Deep merge objects
   */
  private static deepMerge(target: any, source: any): any {
    const output = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          output[key] = this.deepMerge(target[key] || {}, source[key]);
        } else {
          output[key] = source[key];
        }
      }
    }
    
    return output;
  }

  /**
   * Validate partial configuration
   */
  static validatePartial(config: Partial<CodeQualityConfig>): void {
    const partialSchema = this.schema.fork(
      Object.keys(this.schema.describe().keys),
      (schema) => schema.optional()
    );

    const { error } = partialSchema.validate(config, {
      abortEarly: false,
      allowUnknown: false
    });

    if (error) {
      const details = error.details.map(d => d.message).join(', ');
      throw new Error(`Invalid partial configuration: ${details}`);
    }
  }

  /**
   * Get default configuration
   */
  static getDefault(): CodeQualityConfig {
    return {
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
  }
}