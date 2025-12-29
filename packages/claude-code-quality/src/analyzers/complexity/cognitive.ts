/**
 * Cognitive Complexity Calculator
 * 
 * Calculates cognitive complexity based on SonarSource methodology
 */

import { ASTNode } from '../../types';

export class CognitiveComplexityCalculator {
  /**
   * Calculate cognitive complexity for a node
   */
  calculate(node: ASTNode): number {
    let complexity = 0;
    
    const visit = (node: ASTNode, nestingLevel: number) => {
      const increment = this.getIncrement(node, nestingLevel);
      complexity += increment;
      
      // Determine new nesting level for children
      const newNestingLevel = this.increasesNesting(node) ? nestingLevel + 1 : nestingLevel;
      
      // Recurse into children
      if (node.children) {
        node.children.forEach(child => visit(child, newNestingLevel));
      }
    };
    
    visit(node, 0);
    return complexity;
  }

  /**
   * Get complexity increment for a node
   */
  private getIncrement(node: ASTNode, nestingLevel: number): number {
    let increment = 0;
    
    // Basic increment for control flow structures
    switch (node.type) {
      case 'IfStatement':
        increment = 1 + nestingLevel;
        
        // Check for else-if chains
        if (node.children) {
          const elseClause = node.children.find(child => child.type === 'BlockStatement' && child === node.alternate);
          if (elseClause?.children?.[0]?.type === 'IfStatement') {
            increment = 1; // else-if doesn't add nesting
          }
        }
        break;
        
      case 'ConditionalExpression':
        increment = 1 + nestingLevel;
        break;
        
      case 'SwitchStatement':
        increment = 1 + nestingLevel;
        break;
        
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
        increment = 1 + nestingLevel;
        break;
        
      case 'CatchClause':
        increment = 1 + nestingLevel;
        break;
        
      case 'LogicalExpression':
        if (node.operator === '&&' || node.operator === '||') {
          // Check if part of a chain
          const isChain = this.isPartOfLogicalChain(node);
          if (!isChain) {
            increment = 1;
          }
        }
        break;
        
      case 'BinaryExpression':
        if (node.operator === '??') {
          increment = 1;
        }
        break;
        
      case 'BreakStatement':
      case 'ContinueStatement':
        if (node.label) {
          increment = 1; // Labeled breaks/continues add complexity
        }
        break;
        
      case 'CallExpression':
        // Recursive calls add complexity
        if (this.isRecursiveCall(node)) {
          increment = 1;
        }
        break;
    }
    
    return increment;
  }

  /**
   * Check if node increases nesting level
   */
  private increasesNesting(node: ASTNode): boolean {
    const nestingTypes = [
      'IfStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'WhileStatement',
      'DoWhileStatement',
      'SwitchStatement',
      'TryStatement',
      'CatchClause',
      'ConditionalExpression'
    ];
    
    return nestingTypes.includes(node.type);
  }

  /**
   * Check if logical expression is part of a chain
   */
  private isPartOfLogicalChain(node: ASTNode): boolean {
    // Check if parent is also a logical expression with same operator
    const parent = node.parent;
    if (parent?.type === 'LogicalExpression' && parent.operator === node.operator) {
      return true;
    }
    
    // Check if any child is a logical expression with same operator
    if (node.children) {
      return node.children.some(child => 
        child.type === 'LogicalExpression' && child.operator === node.operator
      );
    }
    
    return false;
  }

  /**
   * Check if call is recursive
   */
  private isRecursiveCall(node: ASTNode): boolean {
    // Find the enclosing function
    let current = node.parent;
    let functionName: string | undefined;
    
    while (current) {
      if (current.type === 'FunctionDeclaration' || 
          current.type === 'FunctionExpression' ||
          current.type === 'MethodDefinition') {
        functionName = current.name;
        break;
      }
      current = current.parent;
    }
    
    if (!functionName) {return false;}
    
    // Check if the call matches the function name
    if (node.callee?.type === 'Identifier' && node.callee.name === functionName) {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate cognitive complexity for specific patterns
   */
  calculateForPattern(node: ASTNode, pattern: string): number {
    switch (pattern) {
      case 'nested-ternary':
        return this.calculateNestedTernaryComplexity(node);
      case 'callback-hell':
        return this.calculateCallbackComplexity(node);
      case 'promise-chain':
        return this.calculatePromiseChainComplexity(node);
      default:
        return this.calculate(node);
    }
  }

  /**
   * Calculate complexity for nested ternary operators
   */
  private calculateNestedTernaryComplexity(node: ASTNode): number {
    let complexity = 0;
    let depth = 0;
    
    const visit = (node: ASTNode, currentDepth: number) => {
      if (node.type === 'ConditionalExpression') {
        complexity += 1 + currentDepth;
        depth = Math.max(depth, currentDepth);
        
        if (node.children) {
          node.children.forEach(child => visit(child, currentDepth + 1));
        }
      }
    };
    
    visit(node, 0);
    
    // Add penalty for deep nesting
    if (depth > 2) {
      complexity += (depth - 2) * 2;
    }
    
    return complexity;
  }

  /**
   * Calculate complexity for callback patterns
   */
  private calculateCallbackComplexity(node: ASTNode): number {
    let complexity = 0;
    let callbackDepth = 0;
    
    const visit = (node: ASTNode, depth: number) => {
      if (node.type === 'CallExpression' && 
          node.arguments?.some(arg => 
            arg.type === 'FunctionExpression' || 
            arg.type === 'ArrowFunctionExpression'
          )) {
        callbackDepth = Math.max(callbackDepth, depth);
        complexity += depth;
        
        // Visit callback functions
        node.arguments?.forEach(arg => {
          if (arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression') {
            if (arg.children) {
              arg.children.forEach(child => visit(child, depth + 1));
            }
          }
        });
      } else if (node.children) {
        node.children.forEach(child => visit(child, depth));
      }
    };
    
    visit(node, 1);
    
    // Add penalty for deep callback nesting
    if (callbackDepth > 3) {
      complexity += (callbackDepth - 3) * 3;
    }
    
    return complexity;
  }

  /**
   * Calculate complexity for promise chains
   */
  private calculatePromiseChainComplexity(node: ASTNode): number {
    let complexity = 0;
    let chainLength = 0;
    
    const visit = (node: ASTNode) => {
      if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
        const methodName = node.callee.property?.name;
        if (methodName === 'then' || methodName === 'catch' || methodName === 'finally') {
          chainLength++;
          complexity++;
          
          // Check for complex handlers
          if (node.arguments?.[0]?.body?.children?.length > 5) {
            complexity += 2;
          }
        }
      }
      
      if (node.children) {
        node.children.forEach(visit);
      }
    };
    
    visit(node);
    
    // Add penalty for long chains
    if (chainLength > 5) {
      complexity += chainLength - 5;
    }
    
    return complexity;
  }

  /**
   * Get complexity thresholds
   */
  getThresholds() {
    return {
      low: 15,
      medium: 25,
      high: 40,
      veryHigh: 60
    };
  }

  /**
   * Get complexity level description
   */
  getComplexityLevel(complexity: number): string {
    const thresholds = this.getThresholds();
    
    if (complexity <= thresholds.low) {return 'Simple to understand';}
    if (complexity <= thresholds.medium) {return 'Somewhat complex';}
    if (complexity <= thresholds.high) {return 'Complex';}
    if (complexity <= thresholds.veryHigh) {return 'Very complex';}
    return 'Extremely complex';
  }
}