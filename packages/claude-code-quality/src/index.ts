/**
 * Claude Code Quality - AI-powered code analysis
 * 
 * Production-ready code quality analysis with machine learning,
 * AST parsing, and comprehensive metrics.
 */

export * from './types';
export * from './core/analyzer';
export * from './core/engine';
export * from './core/reporter';
export * from './analyzers';
export * from './models';
export * from './parsers';
export * from './detectors';
export * from './scoring';

// Main API
import { CodeQualityAnalyzer } from './core/analyzer';
import { CodeQualityConfig } from './types';

/**
 * Create a new code quality analyzer instance
 */
export function createAnalyzer(config?: Partial<CodeQualityConfig>) {
  return new CodeQualityAnalyzer(config);
}

/**
 * Analyze code quality with default settings
 */
export async function analyzeCode(paths: string[], config?: Partial<CodeQualityConfig>) {
  const analyzer = createAnalyzer(config);
  return analyzer.analyze(paths);
}

// Export default analyzer instance
export default createAnalyzer();