/**
 * Base Analyzer
 * 
 * Abstract base class for all analyzers
 */

import { v4 as uuidv4 } from 'crypto';

import { ASTNode, CodeIssue, CodeQualityConfig } from '../types';

export abstract class BaseAnalyzer {
  protected config: CodeQualityConfig;

  constructor(config: CodeQualityConfig) {
    this.config = config;
  }

  /**
   * Analyze AST and return issues
   */
  abstract analyze(ast: ASTNode, content: string, filePath: string): Promise<CodeIssue[]>;

  /**
   * Update configuration
   */
  updateConfig(config: CodeQualityConfig) {
    this.config = config;
  }

  /**
   * Create a code issue
   */
  protected createIssue(params: Omit<CodeIssue, 'id' | 'aiConfidence'>): CodeIssue {
    return {
      id: this.generateIssueId(),
      aiConfidence: 1.0, // Default confidence for rule-based analyzers
      ...params
    };
  }

  /**
   * Generate unique issue ID
   */
  private generateIssueId(): string {
    return uuidv4();
  }

  /**
   * Traverse AST with visitor pattern
   */
  protected traverse(node: ASTNode, visitor: (node: ASTNode) => void) {
    visitor(node);
    
    if (node.children) {
      node.children.forEach(child => {
        // Set parent reference for easier traversal
        child.parent = node;
        this.traverse(child, visitor);
      });
    }
  }

  /**
   * Find nodes by type
   */
  protected findNodesByType(ast: ASTNode, type: string | string[]): ASTNode[] {
    const types = Array.isArray(type) ? type : [type];
    const nodes: ASTNode[] = [];
    
    this.traverse(ast, (node) => {
      if (types.includes(node.type)) {
        nodes.push(node);
      }
    });
    
    return nodes;
  }

  /**
   * Get parent node of specific type
   */
  protected getParentOfType(node: ASTNode, type: string): ASTNode | null {
    let current = node.parent;
    
    while (current) {
      if (current.type === type) {
        return current;
      }
      current = current.parent;
    }
    
    return null;
  }

  /**
   * Extract text from source code
   */
  protected extractText(content: string, start: number, end: number): string {
    return content.substring(start, end);
  }

  /**
   * Get line from source code
   */
  protected getLine(content: string, lineNumber: number): string {
    const lines = content.split('\n');
    return lines[lineNumber - 1] || '';
  }

  /**
   * Count occurrences of pattern in content
   */
  protected countOccurrences(content: string, pattern: string | RegExp): number {
    if (typeof pattern === 'string') {
      return content.split(pattern).length - 1;
    }
    
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  /**
   * Check if node is inside specific context
   */
  protected isInsideContext(node: ASTNode, contextType: string): boolean {
    return !!this.getParentOfType(node, contextType);
  }

  /**
   * Get function or method name
   */
  protected getFunctionName(node: ASTNode): string {
    if (node.name) {return node.name;}
    
    // Check for variable assignment
    const parent = node.parent;
    if (parent?.type === 'VariableDeclarator' && parent.id?.name) {
      return parent.id.name;
    }
    
    // Check for property assignment
    if (parent?.type === 'AssignmentExpression' && parent.left?.type === 'MemberExpression') {
      return parent.left.property?.name || 'anonymous';
    }
    
    // Check for object method
    if (parent?.type === 'Property' && parent.key?.name) {
      return parent.key.name;
    }
    
    return 'anonymous';
  }

  /**
   * Calculate AI confidence based on various factors
   */
  protected calculateConfidence(factors: {
    patternMatch?: number;
    contextMatch?: number;
    severity?: number;
    frequency?: number;
  }): number {
    const weights = {
      patternMatch: 0.4,
      contextMatch: 0.3,
      severity: 0.2,
      frequency: 0.1
    };
    
    let confidence = 0;
    
    if (factors.patternMatch !== undefined) {
      confidence += factors.patternMatch * weights.patternMatch;
    }
    
    if (factors.contextMatch !== undefined) {
      confidence += factors.contextMatch * weights.contextMatch;
    }
    
    if (factors.severity !== undefined) {
      confidence += factors.severity * weights.severity;
    }
    
    if (factors.frequency !== undefined) {
      confidence += factors.frequency * weights.frequency;
    }
    
    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Warm up any ML models or heavy resources
   */
  async warmUp(): Promise<void> {
    // Override in subclasses if needed
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Override in subclasses if needed
  }
}