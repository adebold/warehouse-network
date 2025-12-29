/**
 * Cyclomatic Complexity Calculator
 * 
 * Calculates McCabe's cyclomatic complexity metric
 */

import { ASTNode } from '../../types';

export class CyclomaticComplexityCalculator {
  /**
   * Calculate cyclomatic complexity for a node
   */
  calculate(node: ASTNode): number {
    let complexity = 1; // Base complexity
    
    const visit = (node: ASTNode) => {
      // Decision points that increase complexity
      switch (node.type) {
        case 'IfStatement':
        case 'ConditionalExpression':
        case 'SwitchCase':
        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'WhileStatement':
        case 'DoWhileStatement':
          complexity++;
          break;
          
        case 'LogicalExpression':
          if (node.operator === '&&' || node.operator === '||') {
            complexity++;
          }
          break;
          
        case 'CatchClause':
          complexity++;
          break;
          
        case 'BinaryExpression':
          // Nullish coalescing operator
          if (node.operator === '??') {
            complexity++;
          }
          break;
          
        case 'OptionalMemberExpression':
        case 'OptionalCallExpression':
          // Optional chaining adds a branch
          complexity++;
          break;
      }
      
      // Recurse into children
      if (node.children) {
        node.children.forEach(visit);
      }
    };
    
    visit(node);
    return complexity;
  }

  /**
   * Calculate complexity for specific patterns
   */
  calculateForPattern(node: ASTNode, pattern: string): number {
    switch (pattern) {
      case 'switch':
        return this.calculateSwitchComplexity(node);
      case 'ternary-chain':
        return this.calculateTernaryChainComplexity(node);
      case 'logical-chain':
        return this.calculateLogicalChainComplexity(node);
      default:
        return this.calculate(node);
    }
  }

  /**
   * Calculate complexity for switch statements
   */
  private calculateSwitchComplexity(node: ASTNode): number {
    if (node.type !== 'SwitchStatement') {
      return 0;
    }
    
    let complexity = 0;
    const cases = node.children?.filter(child => child.type === 'SwitchCase') || [];
    
    // Each case adds complexity
    complexity += cases.length;
    
    // Check for fall-through cases
    for (const caseNode of cases) {
      const hasBreak = this.hasBreakStatement(caseNode);
      if (!hasBreak && caseNode !== cases[cases.length - 1]) {
        complexity++; // Fall-through adds complexity
      }
    }
    
    return complexity;
  }

  /**
   * Calculate complexity for chained ternary operators
   */
  private calculateTernaryChainComplexity(node: ASTNode): number {
    let complexity = 0;
    
    const countTernaries = (node: ASTNode) => {
      if (node.type === 'ConditionalExpression') {
        complexity++;
        
        // Check if consequent or alternate is also a ternary
        if (node.children) {
          node.children.forEach(countTernaries);
        }
      }
    };
    
    countTernaries(node);
    return complexity;
  }

  /**
   * Calculate complexity for logical expression chains
   */
  private calculateLogicalChainComplexity(node: ASTNode): number {
    let complexity = 0;
    
    const countLogical = (node: ASTNode) => {
      if (node.type === 'LogicalExpression') {
        complexity++;
        
        // Check nested logical expressions
        if (node.children) {
          node.children.forEach(countLogical);
        }
      }
    };
    
    countLogical(node);
    return complexity;
  }

  /**
   * Check if a node contains a break statement
   */
  private hasBreakStatement(node: ASTNode): boolean {
    if (node.type === 'BreakStatement') {
      return true;
    }
    
    if (node.children) {
      return node.children.some(child => this.hasBreakStatement(child));
    }
    
    return false;
  }

  /**
   * Get complexity thresholds
   */
  getThresholds() {
    return {
      low: 10,
      medium: 20,
      high: 30,
      veryHigh: 50
    };
  }

  /**
   * Get complexity level description
   */
  getComplexityLevel(complexity: number): string {
    const thresholds = this.getThresholds();
    
    if (complexity <= thresholds.low) {return 'Simple';}
    if (complexity <= thresholds.medium) {return 'Moderate';}
    if (complexity <= thresholds.high) {return 'Complex';}
    if (complexity <= thresholds.veryHigh) {return 'Very Complex';}
    return 'Extremely Complex';
  }
}