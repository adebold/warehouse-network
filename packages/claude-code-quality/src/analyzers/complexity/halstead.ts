/**
 * Halstead Metrics Calculator
 * 
 * Calculates software science metrics
 */

import { ASTNode, HalsteadMetrics } from '../../types';

export class HalsteadCalculator {
  /**
   * Calculate Halstead metrics for AST
   */
  calculate(ast: ASTNode, content: string): HalsteadMetrics {
    const operators = new Map<string, number>();
    const operands = new Map<string, number>();
    
    this.extractOperatorsAndOperands(ast, operators, operands);
    
    // Calculate metrics
    const n1 = operators.size; // Unique operators
    const n2 = operands.size; // Unique operands
    const N1 = Array.from(operators.values()).reduce((a, b) => a + b, 0); // Total operators
    const N2 = Array.from(operands.values()).reduce((a, b) => a + b, 0); // Total operands
    
    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const calculatedLength = n1 * Math.log2(n1) + n2 * Math.log2(n2);
    const volume = length * Math.log2(vocabulary || 1);
    const difficulty = (n1 / 2) * (n2 > 0 ? N2 / n2 : 0);
    const effort = difficulty * volume;
    const time = effort / 18; // Seconds (18 = Stroud number)
    const bugs = volume / 3000; // Estimated bugs (3000 = average bugs per volume)
    
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
   * Extract operators and operands from AST
   */
  private extractOperatorsAndOperands(
    node: ASTNode,
    operators: Map<string, number>,
    operands: Map<string, number>
  ) {
    // Handle operators
    if (this.isOperator(node)) {
      const op = this.getOperatorSymbol(node);
      operators.set(op, (operators.get(op) || 0) + 1);
    }
    
    // Handle operands
    if (this.isOperand(node)) {
      const operand = this.getOperandValue(node);
      operands.set(operand, (operands.get(operand) || 0) + 1);
    }
    
    // Recurse into children
    if (node.children) {
      node.children.forEach(child => 
        this.extractOperatorsAndOperands(child, operators, operands)
      );
    }
  }

  /**
   * Check if node is an operator
   */
  private isOperator(node: ASTNode): boolean {
    const operatorTypes = [
      'BinaryExpression',
      'UnaryExpression',
      'UpdateExpression',
      'AssignmentExpression',
      'LogicalExpression',
      'ConditionalExpression',
      'CallExpression',
      'NewExpression',
      'MemberExpression',
      'IfStatement',
      'ForStatement',
      'WhileStatement',
      'DoWhileStatement',
      'SwitchStatement',
      'ReturnStatement',
      'ThrowStatement',
      'TryStatement',
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'ClassDeclaration',
      'VariableDeclaration'
    ];
    
    return operatorTypes.includes(node.type);
  }

  /**
   * Check if node is an operand
   */
  private isOperand(node: ASTNode): boolean {
    const operandTypes = [
      'Identifier',
      'Literal',
      'StringLiteral',
      'NumericLiteral',
      'BooleanLiteral',
      'NullLiteral',
      'RegExpLiteral',
      'TemplateLiteral'
    ];
    
    return operandTypes.includes(node.type);
  }

  /**
   * Get operator symbol
   */
  private getOperatorSymbol(node: ASTNode): string {
    // Map node types to operator symbols
    const typeToOperator: Record<string, string> = {
      'BinaryExpression': node.operator || '+',
      'UnaryExpression': node.operator || '!',
      'UpdateExpression': node.operator || '++',
      'AssignmentExpression': node.operator || '=',
      'LogicalExpression': node.operator || '&&',
      'ConditionalExpression': '?:',
      'CallExpression': '()',
      'NewExpression': 'new',
      'MemberExpression': '.',
      'IfStatement': 'if',
      'ForStatement': 'for',
      'WhileStatement': 'while',
      'DoWhileStatement': 'do-while',
      'SwitchStatement': 'switch',
      'ReturnStatement': 'return',
      'ThrowStatement': 'throw',
      'TryStatement': 'try',
      'FunctionDeclaration': 'function',
      'FunctionExpression': 'function',
      'ArrowFunctionExpression': '=>',
      'ClassDeclaration': 'class',
      'VariableDeclaration': node.kind || 'var'
    };
    
    return typeToOperator[node.type] || node.type;
  }

  /**
   * Get operand value
   */
  private getOperandValue(node: ASTNode): string {
    if (node.type === 'Identifier') {
      return node.name || 'identifier';
    }
    
    if (node.type === 'Literal' || node.type.endsWith('Literal')) {
      // For literals, use type as value to avoid counting every unique literal
      if (typeof node.value === 'string') {return 'string';}
      if (typeof node.value === 'number') {return 'number';}
      if (typeof node.value === 'boolean') {return 'boolean';}
      if (node.value === null) {return 'null';}
      return 'literal';
    }
    
    return node.type;
  }

  /**
   * Calculate metrics for specific scope
   */
  calculateForScope(node: ASTNode): HalsteadMetrics {
    // Extract only from this node and its children
    const operators = new Map<string, number>();
    const operands = new Map<string, number>();
    
    this.extractOperatorsAndOperands(node, operators, operands);
    
    return this.computeMetrics(operators, operands);
  }

  /**
   * Compute metrics from operators and operands
   */
  private computeMetrics(
    operators: Map<string, number>,
    operands: Map<string, number>
  ): HalsteadMetrics {
    const n1 = operators.size;
    const n2 = operands.size;
    const N1 = Array.from(operators.values()).reduce((a, b) => a + b, 0);
    const N2 = Array.from(operands.values()).reduce((a, b) => a + b, 0);
    
    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const calculatedLength = n1 > 0 && n2 > 0 ? 
      n1 * Math.log2(n1) + n2 * Math.log2(n2) : 0;
    const volume = vocabulary > 0 ? length * Math.log2(vocabulary) : 0;
    const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
    const effort = difficulty * volume;
    const time = effort / 18;
    const bugs = volume / 3000;
    
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
}