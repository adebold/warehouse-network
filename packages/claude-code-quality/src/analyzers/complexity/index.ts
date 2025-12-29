/**
 * Complexity Analyzer
 * 
 * Calculates various complexity metrics including cyclomatic and cognitive complexity
 */

import { ASTNode, CodeIssue, CodeQualityConfig, ComplexityMetrics } from '../../types';
import { BaseAnalyzer } from '../base-analyzer';

import { CognitiveComplexityCalculator } from './cognitive';
import { CyclomaticComplexityCalculator } from './cyclomatic';
import { HalsteadCalculator } from './halstead';
import { MaintainabilityIndexCalculator } from './maintainability';

export class ComplexityAnalyzer extends BaseAnalyzer {
  private cyclomaticCalculator: CyclomaticComplexityCalculator;
  private cognitiveCalculator: CognitiveComplexityCalculator;
  private halsteadCalculator: HalsteadCalculator;
  private maintainabilityCalculator: MaintainabilityIndexCalculator;

  constructor(config: CodeQualityConfig) {
    super(config);
    
    this.cyclomaticCalculator = new CyclomaticComplexityCalculator();
    this.cognitiveCalculator = new CognitiveComplexityCalculator();
    this.halsteadCalculator = new HalsteadCalculator();
    this.maintainabilityCalculator = new MaintainabilityIndexCalculator();
  }

  async analyze(ast: ASTNode, content: string, filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    
    // Analyze functions and methods
    const functions = this.findFunctions(ast);
    
    for (const func of functions) {
      const metrics = await this.analyzeFunction(func, content);
      
      // Check cyclomatic complexity threshold
      if (metrics.cyclomatic > this.config.thresholds.complexity.cyclomatic) {
        issues.push(this.createIssue({
          type: 'maintainability',
          severity: this.getSeverity(metrics.cyclomatic, this.config.thresholds.complexity.cyclomatic),
          file: filePath,
          startLine: func.loc.start.line,
          endLine: func.loc.end.line,
          startColumn: func.loc.start.column,
          endColumn: func.loc.end.column,
          message: `Function '${func.name || 'anonymous'}' has a cyclomatic complexity of ${metrics.cyclomatic} (threshold: ${this.config.thresholds.complexity.cyclomatic})`,
          rule: 'cyclomatic-complexity',
          category: 'maintainability',
          recommendation: {
            type: 'extract-method',
            description: 'Consider breaking down this function into smaller, more focused functions',
            impact: 'high',
            effort: 'medium'
          }
        }));
      }
      
      // Check cognitive complexity threshold
      if (metrics.cognitive > this.config.thresholds.complexity.cognitive) {
        issues.push(this.createIssue({
          type: 'maintainability',
          severity: this.getSeverity(metrics.cognitive, this.config.thresholds.complexity.cognitive),
          file: filePath,
          startLine: func.loc.start.line,
          endLine: func.loc.end.line,
          startColumn: func.loc.start.column,
          endColumn: func.loc.end.column,
          message: `Function '${func.name || 'anonymous'}' has a cognitive complexity of ${metrics.cognitive} (threshold: ${this.config.thresholds.complexity.cognitive})`,
          rule: 'cognitive-complexity',
          category: 'maintainability',
          recommendation: {
            type: 'simplify-conditional',
            description: 'Simplify nested conditionals and control flow structures',
            impact: 'high',
            effort: 'medium'
          }
        }));
      }
      
      // Check for deeply nested code
      if (metrics.nesting > 4) {
        issues.push(this.createIssue({
          type: 'maintainability',
          severity: 'warning',
          file: filePath,
          startLine: func.loc.start.line,
          endLine: func.loc.end.line,
          startColumn: func.loc.start.column,
          endColumn: func.loc.end.column,
          message: `Function '${func.name || 'anonymous'}' has a nesting level of ${metrics.nesting} (recommended: <= 4)`,
          rule: 'max-nesting-depth',
          category: 'maintainability',
          recommendation: {
            type: 'extract-method',
            description: 'Extract nested logic into separate functions',
            impact: 'medium',
            effort: 'low'
          }
        }));
      }
    }
    
    // Analyze file-level complexity
    const fileMetrics = await this.analyzeFile(ast, content);
    
    // Check maintainability index
    if (fileMetrics.maintainabilityIndex < this.config.thresholds.maintainability) {
      issues.push(this.createIssue({
        type: 'maintainability',
        severity: 'warning',
        file: filePath,
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: 1,
        message: `File has a low maintainability index of ${fileMetrics.maintainabilityIndex.toFixed(1)} (threshold: ${this.config.thresholds.maintainability})`,
        rule: 'maintainability-index',
        category: 'maintainability',
        recommendation: {
          type: 'extract-class',
          description: 'Consider splitting this file into smaller, more focused modules',
          impact: 'high',
          effort: 'high'
        }
      }));
    }
    
    return issues;
  }

  /**
   * Analyze complexity metrics for a function
   */
  private async analyzeFunction(func: ASTNode, content: string): Promise<ComplexityMetrics> {
    const functionContent = content.substring(func.start, func.end);
    
    return {
      cyclomatic: this.cyclomaticCalculator.calculate(func),
      cognitive: this.cognitiveCalculator.calculate(func),
      nesting: this.calculateMaxNesting(func),
      lineOfCode: this.countLinesOfCode(functionContent)
    };
  }

  /**
   * Analyze file-level complexity metrics
   */
  private async analyzeFile(ast: ASTNode, content: string) {
    const halstead = this.halsteadCalculator.calculate(ast, content);
    const loc = this.countLinesOfCode(content);
    const cyclomaticTotal = this.calculateTotalCyclomaticComplexity(ast);
    
    const maintainabilityIndex = this.maintainabilityCalculator.calculate(
      halstead.volume,
      cyclomaticTotal,
      loc
    );
    
    return {
      halstead,
      maintainabilityIndex,
      totalCyclomatic: cyclomaticTotal,
      linesOfCode: loc
    };
  }

  /**
   * Find all functions in the AST
   */
  private findFunctions(ast: ASTNode): ASTNode[] {
    const functions: ASTNode[] = [];
    
    const visit = (node: ASTNode) => {
      if (this.isFunction(node)) {
        functions.push(node);
      }
      
      if (node.children) {
        node.children.forEach(visit);
      }
    };
    
    visit(ast);
    return functions;
  }

  /**
   * Check if node is a function
   */
  private isFunction(node: ASTNode): boolean {
    const functionTypes = [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'MethodDefinition',
      'ClassMethod',
      'ObjectMethod'
    ];
    
    return functionTypes.includes(node.type);
  }

  /**
   * Calculate maximum nesting depth
   */
  private calculateMaxNesting(node: ASTNode): number {
    let maxNesting = 0;
    
    const calculateNesting = (node: ASTNode, currentNesting: number) => {
      const nestingTypes = [
        'IfStatement',
        'ForStatement',
        'ForInStatement',
        'ForOfStatement',
        'WhileStatement',
        'DoWhileStatement',
        'SwitchStatement',
        'TryStatement',
        'WithStatement'
      ];
      
      if (nestingTypes.includes(node.type)) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      }
      
      if (node.children) {
        node.children.forEach(child => calculateNesting(child, currentNesting));
      }
    };
    
    calculateNesting(node, 0);
    return maxNesting;
  }

  /**
   * Count lines of code (excluding comments and empty lines)
   */
  private countLinesOfCode(content: string): number {
    const lines = content.split('\n');
    let count = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Calculate total cyclomatic complexity for file
   */
  private calculateTotalCyclomaticComplexity(ast: ASTNode): number {
    const functions = this.findFunctions(ast);
    let total = 1; // Base complexity
    
    for (const func of functions) {
      total += this.cyclomaticCalculator.calculate(func) - 1;
    }
    
    return total;
  }

  /**
   * Get severity based on threshold excess
   */
  private getSeverity(value: number, threshold: number): 'warning' | 'error' | 'critical' {
    const ratio = value / threshold;
    
    if (ratio >= 2) {return 'critical';}
    if (ratio >= 1.5) {return 'error';}
    return 'warning';
  }
}