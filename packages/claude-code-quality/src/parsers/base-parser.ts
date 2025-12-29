/**
 * Base Parser Interface
 * 
 * Abstract base class for all language parsers
 */

import { ASTNode, Token } from '../types';

export interface ParseResult {
  ast: ASTNode;
  tokens: Token[];
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}

export abstract class Parser {
  /**
   * Parse source code into AST
   */
  abstract parse(content: string, filePath: string): Promise<ParseResult>;

  /**
   * Extract tokens from source code
   */
  abstract tokenize(content: string): Token[];

  /**
   * Validate syntax without full parsing
   */
  abstract validate(content: string): ParseError[];

  /**
   * Get language-specific features
   */
  abstract getFeatures(): string[];

  /**
   * Preprocess content before parsing
   */
  protected preprocess(content: string): string {
    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    // Normalize line endings
    return content.replace(/\r\n/g, '\n');
  }

  /**
   * Create error object
   */
  protected createError(
    message: string, 
    line: number, 
    column: number,
    severity: 'error' | 'warning' = 'error'
  ): ParseError {
    return { message, line, column, severity };
  }

  /**
   * Extract location from error
   */
  protected extractLocation(error: any): { line: number; column: number } {
    // Handle different error formats
    if (error.loc) {
      return { 
        line: error.loc.line || error.loc.start?.line || 0,
        column: error.loc.column || error.loc.start?.column || 0
      };
    }
    
    if (error.line !== undefined) {
      return { line: error.line, column: error.column || 0 };
    }
    
    // Try to extract from message
    const match = error.message?.match(/\((\d+):(\d+)\)/);
    if (match) {
      return { line: parseInt(match[1]), column: parseInt(match[2]) };
    }
    
    return { line: 0, column: 0 };
  }

  /**
   * Convert language-specific AST to common format
   */
  protected abstract normalizeAST(ast: any): ASTNode;
}