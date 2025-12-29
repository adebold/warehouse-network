/**
 * SQL Injection Detector
 * 
 * Detects potential SQL injection vulnerabilities
 */

import { ASTNode, CodeIssue } from '../../types';

export class SQLInjectionDetector {
  private dangerousFunctions = [
    'query',
    'exec',
    'execute',
    'raw',
    'runSql',
    'executeSql'
  ];

  private safePatterns = [
    /\?\s*,/, // Parameterized queries with ?
    /\$\d+/, // Parameterized queries with $1, $2
    /:[\w]+/, // Named parameters
  ];

  async detect(ast: ASTNode, content: string, filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    
    this.traverse(ast, (node) => {
      if (this.isSQLQuery(node)) {
        const issue = this.analyzeSQLQuery(node, content, filePath);
        if (issue) {
          issues.push(issue);
        }
      }
    });
    
    return issues;
  }

  /**
   * Check if node is a SQL query
   */
  private isSQLQuery(node: ASTNode): boolean {
    if (node.type !== 'CallExpression') {return false;}
    
    // Check function name
    const callee = node.callee;
    if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
      return this.dangerousFunctions.includes(callee.property.name);
    }
    
    if (callee?.type === 'Identifier') {
      return this.dangerousFunctions.includes(callee.name);
    }
    
    return false;
  }

  /**
   * Analyze SQL query for injection vulnerabilities
   */
  private analyzeSQLQuery(node: ASTNode, content: string, filePath: string): CodeIssue | null {
    const args = node.arguments || [];
    if (args.length === 0) {return null;}
    
    const queryArg = args[0];
    
    // Check for string concatenation
    if (this.hasStringConcatenation(queryArg)) {
      return this.createIssue({
        type: 'vulnerability',
        severity: 'critical',
        file: filePath,
        startLine: node.loc.start.line,
        endLine: node.loc.end.line,
        startColumn: node.loc.start.column,
        endColumn: node.loc.end.column,
        message: 'SQL query uses string concatenation, vulnerable to SQL injection',
        rule: 'sql-injection-concatenation',
        category: 'security',
        aiConfidence: 0.95,
        recommendation: {
          type: 'replace-conditional-with-polymorphism',
          description: 'Use parameterized queries instead of string concatenation',
          impact: 'high',
          effort: 'low',
          suggestedCode: this.generateParameterizedQuery(queryArg, content)
        }
      });
    }
    
    // Check for template literals with expressions
    if (queryArg.type === 'TemplateLiteral' && queryArg.expressions?.length > 0) {
      if (!this.isTemplateLiteralSafe(queryArg)) {
        return this.createIssue({
          type: 'vulnerability',
          severity: 'critical',
          file: filePath,
          startLine: node.loc.start.line,
          endLine: node.loc.end.line,
          startColumn: node.loc.start.column,
          endColumn: node.loc.end.column,
          message: 'SQL query uses template literals with expressions, potential SQL injection',
          rule: 'sql-injection-template',
          category: 'security',
          aiConfidence: 0.9,
          recommendation: {
            type: 'replace-conditional-with-polymorphism',
            description: 'Use parameterized queries with proper escaping',
            impact: 'high',
            effort: 'low'
          }
        });
      }
    }
    
    return null;
  }

  /**
   * Check if node has string concatenation
   */
  private hasStringConcatenation(node: ASTNode): boolean {
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      return true;
    }
    
    if (node.children) {
      return node.children.some(child => this.hasStringConcatenation(child));
    }
    
    return false;
  }

  /**
   * Check if template literal is safe
   */
  private isTemplateLiteralSafe(node: ASTNode): boolean {
    // Check if the template uses safe patterns
    const templateContent = this.extractTemplateContent(node);
    
    return this.safePatterns.some(pattern => pattern.test(templateContent));
  }

  /**
   * Extract template literal content
   */
  private extractTemplateContent(node: ASTNode): string {
    // Simplified extraction - in real implementation would be more complex
    return node.quasis?.map((q: any) => q.value?.raw || '').join('') || '';
  }

  /**
   * Generate parameterized query suggestion
   */
  private generateParameterizedQuery(queryNode: ASTNode, content: string): string {
    // Simple example - real implementation would be more sophisticated
    return `// Use parameterized query:\n` +
           `db.query('SELECT * FROM users WHERE id = ?', [userId])`;
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

  /**
   * Create issue helper
   */
  private createIssue(params: Omit<CodeIssue, 'id'>): CodeIssue {
    return {
      id: Math.random().toString(36).substr(2, 9),
      ...params
    };
  }
}