/**
 * JavaScript Parser
 * 
 * Parses JavaScript and JSX files using Babel parser
 */

import { parse as babelParse, ParserOptions } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

import { ASTNode, Token } from '../types';

import { Parser, ParseResult, ParseError } from './base-parser';

export class JavaScriptParser extends Parser {
  private parserOptions: ParserOptions;

  constructor() {
    super();
    
    // Set up Babel parser options
    this.parserOptions = {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      allowSuperOutsideMethod: true,
      allowUndeclaredExports: true,
      createParenthesizedExpressions: true,
      errorRecovery: true,
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'asyncGenerators',
        'functionBind',
        'functionSent',
        'dynamicImport',
        'numericSeparator',
        'optionalChaining',
        'importMeta',
        'bigInt',
        'optionalCatchBinding',
        'throwExpressions',
        'pipelineOperator',
        'nullishCoalescingOperator',
        'exportExtensions',
        'functionSent',
        'partialApplication',
        'topLevelAwait',
        'importAssertions'
      ]
    };
  }

  async parse(content: string, filePath: string): Promise<ParseResult> {
    const preprocessed = this.preprocess(content);
    const errors: ParseError[] = [];

    try {
      // Parse with Babel
      const ast = babelParse(preprocessed, {
        ...this.parserOptions,
        sourceFilename: filePath,
        ranges: true,
        tokens: true
      });

      // Extract tokens
      const tokens = this.extractTokens(ast.tokens || []);

      // Convert to common AST format
      const normalizedAST = this.normalizeAST(ast);

      // Collect any parse errors
      if (ast.errors && ast.errors.length > 0) {
        errors.push(...this.convertBabelErrors(ast.errors));
      }

      return { ast: normalizedAST, tokens, errors };
    } catch (error: any) {
      // Handle Babel parse errors
      if (error.loc) {
        errors.push({
          message: error.message,
          line: error.loc.line,
          column: error.loc.column + 1,
          severity: 'error'
        });
      } else {
        const loc = this.extractLocation(error);
        errors.push(this.createError(
          error.message || 'Failed to parse JavaScript file',
          loc.line,
          loc.column
        ));
      }

      // Return minimal AST on error
      return {
        ast: this.createErrorAST(content),
        tokens: [],
        errors
      };
    }
  }

  tokenize(content: string): Token[] {
    try {
      const ast = babelParse(content, {
        ...this.parserOptions,
        tokens: true,
        ranges: true
      });

      return this.extractTokens(ast.tokens || []);
    } catch (error) {
      return [];
    }
  }

  validate(content: string): ParseError[] {
    const errors: ParseError[] = [];

    try {
      const ast = babelParse(content, {
        ...this.parserOptions,
        errorRecovery: true
      });

      if (ast.errors && ast.errors.length > 0) {
        errors.push(...this.convertBabelErrors(ast.errors));
      }
    } catch (error: any) {
      if (error.loc) {
        errors.push({
          message: error.message,
          line: error.loc.line,
          column: error.loc.column + 1,
          severity: 'error'
        });
      }
    }

    return errors;
  }

  getFeatures(): string[] {
    return [
      'javascript',
      'jsx',
      'es6-modules',
      'async-await',
      'generators',
      'decorators',
      'class-properties',
      'optional-chaining',
      'nullish-coalescing',
      'dynamic-import',
      'bigint',
      'private-fields'
    ];
  }

  protected normalizeAST(babelAST: any): ASTNode {
    return this.convertBabelNode(babelAST);
  }

  private convertBabelNode(node: t.Node): ASTNode {
    const astNode: ASTNode = {
      type: node.type,
      start: node.start || 0,
      end: node.end || 0,
      loc: node.loc ? {
        start: { 
          line: node.loc.start.line, 
          column: node.loc.start.column + 1 
        },
        end: { 
          line: node.loc.end.line, 
          column: node.loc.end.column + 1 
        }
      } : {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 }
      },
      children: []
    };

    // Add node-specific properties
    this.addNodeProperties(node, astNode);

    // Convert children
    const visitor = {
      enter: (path: any) => {
        if (path.node !== node) {
          astNode.children!.push(this.convertBabelNode(path.node));
          path.skip();
        }
      }
    };

    try {
      traverse(node, visitor, null, { node });
    } catch (error) {
      // Handle traverse errors silently
    }

    return astNode;
  }

  private addNodeProperties(node: t.Node, astNode: ASTNode) {
    if (t.isIdentifier(node)) {
      astNode.name = node.name;
    }

    if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
      astNode.name = node.id?.name;
      astNode.params = node.params.length;
      astNode.async = node.async;
      astNode.generator = node.generator;
    }

    if (t.isClassDeclaration(node) || t.isClassExpression(node)) {
      astNode.name = node.id?.name;
      astNode.members = node.body.body.length;
    }

    if (t.isVariableDeclaration(node)) {
      astNode.kind = node.kind;
      astNode.declarations = node.declarations.length;
    }

    if (t.isImportDeclaration(node)) {
      astNode.source = node.source.value;
      astNode.specifiers = node.specifiers.length;
    }

    if (t.isIfStatement(node)) {
      astNode.hasElse = !!node.alternate;
    }

    if (t.isForStatement(node) || t.isForInStatement(node) || t.isForOfStatement(node)) {
      astNode.loopType = node.type;
    }

    if (t.isObjectExpression(node)) {
      astNode.properties = node.properties.length;
    }

    if (t.isArrayExpression(node)) {
      astNode.elements = node.elements.length;
    }
  }

  private extractTokens(babelTokens: any[]): Token[] {
    return babelTokens.map(token => ({
      type: token.type.label || token.type,
      value: token.value || '',
      start: token.start,
      end: token.end,
      loc: token.loc ? {
        start: { 
          line: token.loc.start.line, 
          column: token.loc.start.column + 1 
        },
        end: { 
          line: token.loc.end.line, 
          column: token.loc.end.column + 1 
        }
      } : {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 }
      }
    }));
  }

  private convertBabelErrors(babelErrors: any[]): ParseError[] {
    return babelErrors.map(error => ({
      message: error.message || 'Parse error',
      line: error.loc?.line || 0,
      column: (error.loc?.column || 0) + 1,
      severity: 'error'
    }));
  }

  private createErrorAST(content: string): ASTNode {
    return {
      type: 'Program',
      start: 0,
      end: content.length,
      loc: {
        start: { line: 1, column: 1 },
        end: { line: content.split('\n').length, column: 1 }
      },
      children: []
    };
  }
}