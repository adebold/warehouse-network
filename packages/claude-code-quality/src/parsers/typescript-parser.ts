/**
 * TypeScript Parser
 * 
 * Parses TypeScript and TSX files using TypeScript compiler API
 */

import * as ts from 'typescript';

import { ASTNode, Token, SourceLocation } from '../types';

import { Parser, ParseResult, ParseError } from './base-parser';

export class TypeScriptParser extends Parser {
  private compilerOptions: ts.CompilerOptions;

  constructor() {
    super();
    
    // Set up TypeScript compiler options
    this.compilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      allowJs: true,
      checkJs: false,
      noResolve: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      skipLibCheck: true
    };
  }

  async parse(content: string, filePath: string): Promise<ParseResult> {
    const preprocessed = this.preprocess(content);
    const errors: ParseError[] = [];

    try {
      // Create source file
      const sourceFile = ts.createSourceFile(
        filePath,
        preprocessed,
        ts.ScriptTarget.Latest,
        true,
        this.getScriptKind(filePath)
      );

      // Collect syntax errors
      const syntaxErrors = this.getSyntaxErrors(sourceFile);
      errors.push(...syntaxErrors);

      // Convert to common AST format
      const ast = this.normalizeAST(sourceFile);

      // Extract tokens
      const tokens = this.tokenize(preprocessed);

      return { ast, tokens, errors };
    } catch (error: any) {
      const loc = this.extractLocation(error);
      errors.push(this.createError(
        error.message || 'Failed to parse TypeScript file',
        loc.line,
        loc.column
      ));

      // Return minimal AST on error
      return {
        ast: this.createErrorAST(content),
        tokens: [],
        errors
      };
    }
  }

  tokenize(content: string): Token[] {
    const tokens: Token[] = [];
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      content
    );

    while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
      const token: Token = {
        type: ts.tokenToString(scanner.getToken()) || 'unknown',
        value: scanner.getTokenText(),
        start: scanner.getTokenPos(),
        end: scanner.getTextPos(),
        loc: this.getLocationForRange(content, scanner.getTokenPos(), scanner.getTextPos())
      };
      tokens.push(token);
    }

    return tokens;
  }

  validate(content: string): ParseError[] {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      content,
      ts.ScriptTarget.Latest,
      true
    );

    return this.getSyntaxErrors(sourceFile);
  }

  getFeatures(): string[] {
    return [
      'typescript',
      'tsx',
      'decorators',
      'interfaces',
      'enums',
      'generics',
      'async-await',
      'modules',
      'jsx'
    ];
  }

  protected normalizeAST(sourceFile: ts.SourceFile): ASTNode {
    const visitor = new ASTVisitor(sourceFile);
    return visitor.visit(sourceFile);
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    if (filePath.endsWith('.tsx')) {return ts.ScriptKind.TSX;}
    if (filePath.endsWith('.ts')) {return ts.ScriptKind.TS;}
    if (filePath.endsWith('.jsx')) {return ts.ScriptKind.JSX;}
    return ts.ScriptKind.JS;
  }

  private getSyntaxErrors(sourceFile: ts.SourceFile): ParseError[] {
    const errors: ParseError[] = [];
    const diagnostics = (sourceFile as any).parseDiagnostics || [];

    for (const diagnostic of diagnostics) {
      if (diagnostic.file && diagnostic.start !== undefined) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        
        errors.push({
          message,
          line: line + 1,
          column: character + 1,
          severity: 'error'
        });
      }
    }

    return errors;
  }

  private getLocationForRange(content: string, start: number, end: number): SourceLocation {
    const lines = content.substring(0, start).split('\n');
    const startLine = lines.length;
    const startColumn = lines[lines.length - 1].length + 1;

    const endLines = content.substring(0, end).split('\n');
    const endLine = endLines.length;
    const endColumn = endLines[endLines.length - 1].length + 1;

    return {
      start: { line: startLine, column: startColumn },
      end: { line: endLine, column: endColumn }
    };
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

/**
 * AST Visitor for converting TypeScript AST to common format
 */
class ASTVisitor {
  constructor(private sourceFile: ts.SourceFile) {}

  visit(node: ts.Node): ASTNode {
    const { line: startLine, character: startColumn } = 
      this.sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const { line: endLine, character: endColumn } = 
      this.sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const astNode: ASTNode = {
      type: ts.SyntaxKind[node.kind],
      start: node.getStart(),
      end: node.getEnd(),
      loc: {
        start: { line: startLine + 1, column: startColumn + 1 },
        end: { line: endLine + 1, column: endColumn + 1 }
      },
      children: []
    };

    // Add node-specific properties
    this.addNodeProperties(node, astNode);

    // Visit children
    node.forEachChild(child => {
      astNode.children!.push(this.visit(child));
    });

    return astNode;
  }

  private addNodeProperties(node: ts.Node, astNode: ASTNode) {
    // Add common properties
    if (ts.isIdentifier(node)) {
      astNode.name = node.text;
    }
    
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      astNode.name = node.name?.getText();
      astNode.params = node.parameters.length;
      astNode.async = !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));
    }
    
    if (ts.isClassDeclaration(node)) {
      astNode.name = node.name?.text;
      astNode.members = node.members.length;
    }
    
    if (ts.isVariableDeclaration(node)) {
      astNode.name = node.name.getText();
      astNode.kind = node.parent.flags & ts.NodeFlags.Const ? 'const' : 
                      node.parent.flags & ts.NodeFlags.Let ? 'let' : 'var';
    }
    
    if (ts.isImportDeclaration(node)) {
      astNode.source = (node.moduleSpecifier as ts.StringLiteral).text;
    }
    
    if (ts.isIfStatement(node)) {
      astNode.hasElse = !!node.elseStatement;
    }
    
    if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      astNode.loopType = ts.SyntaxKind[node.kind];
    }
  }
}