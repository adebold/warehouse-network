/**
 * Metrics Calculator
 * 
 * Calculates file-level metrics from AST and analysis results
 */

import { ASTNode, FileMetrics, CodeIssue, Dependency } from '../types';

export class MetricsCalculator {
  /**
   * Calculate file metrics
   */
  async calculate(
    ast: ASTNode,
    content: string,
    issues: CodeIssue[],
    dependencies: Dependency[]
  ): Promise<FileMetrics> {
    const lines = this.countLines(content);
    const statements = this.countStatements(ast);
    const functions = this.countFunctions(ast);
    const classes = this.countClasses(ast);
    
    const complexity = this.calculateComplexity(ast, content);
    const coupling = this.calculateCoupling(ast, dependencies);
    const cohesion = this.calculateCohesion(ast);
    
    return {
      lines,
      statements,
      functions,
      classes,
      complexity,
      coupling,
      cohesion
    };
  }

  /**
   * Count lines (excluding empty lines and comments)
   */
  private countLines(content: string): number {
    const lines = content.split('\n');
    let count = 0;
    let inBlockComment = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Handle block comments
      if (trimmed.includes('/*')) {
        inBlockComment = true;
      }
      if (trimmed.includes('*/')) {
        inBlockComment = false;
        continue;
      }
      if (inBlockComment) {
        continue;
      }
      
      // Skip empty lines and single-line comments
      if (trimmed && !trimmed.startsWith('//')) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Count statements in AST
   */
  private countStatements(ast: ASTNode): number {
    let count = 0;
    
    const statementTypes = [
      'ExpressionStatement',
      'BlockStatement',
      'EmptyStatement',
      'DebuggerStatement',
      'WithStatement',
      'ReturnStatement',
      'LabeledStatement',
      'BreakStatement',
      'ContinueStatement',
      'IfStatement',
      'SwitchStatement',
      'ThrowStatement',
      'TryStatement',
      'WhileStatement',
      'DoWhileStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'VariableDeclaration',
      'FunctionDeclaration',
      'ClassDeclaration'
    ];
    
    this.traverse(ast, (node) => {
      if (statementTypes.includes(node.type)) {
        count++;
      }
    });
    
    return count;
  }

  /**
   * Count functions in AST
   */
  private countFunctions(ast: ASTNode): number {
    let count = 0;
    
    const functionTypes = [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'MethodDefinition',
      'ClassMethod'
    ];
    
    this.traverse(ast, (node) => {
      if (functionTypes.includes(node.type)) {
        count++;
      }
    });
    
    return count;
  }

  /**
   * Count classes in AST
   */
  private countClasses(ast: ASTNode): number {
    let count = 0;
    
    this.traverse(ast, (node) => {
      if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
        count++;
      }
    });
    
    return count;
  }

  /**
   * Calculate complexity metrics
   */
  private calculateComplexity(ast: ASTNode, content: string) {
    const cyclomatic = this.calculateCyclomaticComplexity(ast);
    const cognitive = this.calculateCognitiveComplexity(ast);
    const nesting = this.calculateMaxNesting(ast);
    const lineOfCode = this.countLines(content);
    
    return {
      cyclomatic,
      cognitive,
      nesting,
      lineOfCode
    };
  }

  /**
   * Calculate cyclomatic complexity for entire file
   */
  private calculateCyclomaticComplexity(ast: ASTNode): number {
    let complexity = 1; // Base complexity
    
    const decisionPoints = [
      'IfStatement',
      'ConditionalExpression',
      'SwitchCase',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'WhileStatement',
      'DoWhileStatement',
      'LogicalExpression',
      'CatchClause'
    ];
    
    this.traverse(ast, (node) => {
      if (decisionPoints.includes(node.type)) {
        complexity++;
      }
      
      // Special handling for logical operators
      if (node.type === 'LogicalExpression' && 
          (node.operator === '&&' || node.operator === '||')) {
        complexity++;
      }
    });
    
    return complexity;
  }

  /**
   * Calculate cognitive complexity
   */
  private calculateCognitiveComplexity(ast: ASTNode): number {
    let complexity = 0;
    
    const visit = (node: ASTNode, nestingLevel: number) => {
      const increment = this.getCognitiveIncrement(node, nestingLevel);
      complexity += increment;
      
      const newNestingLevel = this.increasesNesting(node) ? nestingLevel + 1 : nestingLevel;
      
      if (node.children) {
        node.children.forEach(child => visit(child, newNestingLevel));
      }
    };
    
    visit(ast, 0);
    return complexity;
  }

  /**
   * Get cognitive complexity increment
   */
  private getCognitiveIncrement(node: ASTNode, nestingLevel: number): number {
    const controlFlowTypes = [
      'IfStatement',
      'ConditionalExpression',
      'SwitchStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'WhileStatement',
      'DoWhileStatement',
      'CatchClause'
    ];
    
    if (controlFlowTypes.includes(node.type)) {
      return 1 + nestingLevel;
    }
    
    if (node.type === 'LogicalExpression') {
      return 1;
    }
    
    return 0;
  }

  /**
   * Check if node increases nesting
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
      'CatchClause'
    ];
    
    return nestingTypes.includes(node.type);
  }

  /**
   * Calculate maximum nesting level
   */
  private calculateMaxNesting(ast: ASTNode): number {
    let maxNesting = 0;
    
    const calculate = (node: ASTNode, currentNesting: number) => {
      if (this.increasesNesting(node)) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      }
      
      if (node.children) {
        node.children.forEach(child => calculate(child, currentNesting));
      }
    };
    
    calculate(ast, 0);
    return maxNesting;
  }

  /**
   * Calculate coupling metrics
   */
  private calculateCoupling(ast: ASTNode, dependencies: Dependency[]) {
    // Count unique external dependencies (efferent coupling)
    const externalDeps = new Set(
      dependencies
        .filter(dep => dep.isExternal)
        .map(dep => dep.name)
    );
    
    const efferent = externalDeps.size;
    
    // For afferent coupling, we'd need to analyze other files
    // For now, use a placeholder
    const afferent = 0;
    
    // Calculate instability (Ce / (Ca + Ce))
    const total = afferent + efferent;
    const instability = total > 0 ? efferent / total : 0;
    
    // Calculate abstractness (would need to count abstract classes/interfaces)
    const abstractness = this.calculateAbstractness(ast);
    
    return {
      afferent,
      efferent,
      instability: Math.round(instability * 100) / 100,
      abstractness: Math.round(abstractness * 100) / 100
    };
  }

  /**
   * Calculate abstractness
   */
  private calculateAbstractness(ast: ASTNode): number {
    let totalClasses = 0;
    let abstractClasses = 0;
    
    this.traverse(ast, (node) => {
      if (node.type === 'ClassDeclaration') {
        totalClasses++;
        
        // Check if class is abstract (simplified check)
        if (node.abstract || this.hasOnlyAbstractMethods(node)) {
          abstractClasses++;
        }
      }
    });
    
    return totalClasses > 0 ? abstractClasses / totalClasses : 0;
  }

  /**
   * Check if class has only abstract methods
   */
  private hasOnlyAbstractMethods(classNode: ASTNode): boolean {
    // Simplified implementation
    return false;
  }

  /**
   * Calculate cohesion (LCOM - Lack of Cohesion of Methods)
   */
  private calculateCohesion(ast: ASTNode): number {
    const classes = this.findClasses(ast);
    
    if (classes.length === 0) {
      return 1; // Perfect cohesion for non-OOP code
    }
    
    let totalCohesion = 0;
    
    for (const classNode of classes) {
      const cohesion = this.calculateClassCohesion(classNode);
      totalCohesion += cohesion;
    }
    
    return Math.round((totalCohesion / classes.length) * 100) / 100;
  }

  /**
   * Find all classes in AST
   */
  private findClasses(ast: ASTNode): ASTNode[] {
    const classes: ASTNode[] = [];
    
    this.traverse(ast, (node) => {
      if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
        classes.push(node);
      }
    });
    
    return classes;
  }

  /**
   * Calculate cohesion for a single class
   */
  private calculateClassCohesion(classNode: ASTNode): number {
    // Simplified LCOM calculation
    // In reality, would analyze method-field relationships
    const methods = this.countClassMethods(classNode);
    const fields = this.countClassFields(classNode);
    
    if (methods === 0 || fields === 0) {
      return 1; // Perfect cohesion
    }
    
    // Simple cohesion metric (inverse of LCOM)
    const ratio = fields / methods;
    return Math.min(1, ratio);
  }

  /**
   * Count methods in class
   */
  private countClassMethods(classNode: ASTNode): number {
    let count = 0;
    
    if (classNode.children) {
      classNode.children.forEach(child => {
        if (child.type === 'MethodDefinition') {
          count++;
        }
      });
    }
    
    return count;
  }

  /**
   * Count fields in class
   */
  private countClassFields(classNode: ASTNode): number {
    let count = 0;
    
    if (classNode.children) {
      classNode.children.forEach(child => {
        if (child.type === 'PropertyDefinition' || child.type === 'ClassProperty') {
          count++;
        }
      });
    }
    
    return count;
  }

  /**
   * Traverse AST
   */
  private traverse(node: ASTNode, visitor: (node: ASTNode) => void) {
    visitor(node);
    
    if (node.children) {
      node.children.forEach(child => this.traverse(child, visitor));
    }
  }
}