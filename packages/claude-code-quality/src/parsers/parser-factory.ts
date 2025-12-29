/**
 * Parser Factory
 * 
 * Creates appropriate parsers for different file types
 */

import { Parser } from './base-parser';
import { CSharpParser } from './csharp-parser';
import { GoParser } from './go-parser';
import { JavaParser } from './java-parser';
import { JavaScriptParser } from './javascript-parser';
import { PythonParser } from './python-parser';
import { RustParser } from './rust-parser';
import { TypeScriptParser } from './typescript-parser';

export class ParserFactory {
  private parsers: Map<string, Parser>;

  constructor() {
    this.parsers = new Map();
    this.registerParsers();
  }

  /**
   * Register all available parsers
   */
  private registerParsers() {
    // TypeScript/JavaScript
    const tsParser = new TypeScriptParser();
    const jsParser = new JavaScriptParser();
    
    this.parsers.set('typescript', tsParser);
    this.parsers.set('ts', tsParser);
    this.parsers.set('tsx', tsParser);
    this.parsers.set('javascript', jsParser);
    this.parsers.set('js', jsParser);
    this.parsers.set('jsx', jsParser);
    this.parsers.set('mjs', jsParser);
    this.parsers.set('cjs', jsParser);
    
    // Other languages
    this.parsers.set('python', new PythonParser());
    this.parsers.set('py', new PythonParser());
    this.parsers.set('java', new JavaParser());
    this.parsers.set('go', new GoParser());
    this.parsers.set('rust', new RustParser());
    this.parsers.set('rs', new RustParser());
    this.parsers.set('csharp', new CSharpParser());
    this.parsers.set('cs', new CSharpParser());
  }

  /**
   * Get parser for a specific language
   */
  getParser(language: string): Parser {
    const parser = this.parsers.get(language.toLowerCase());
    
    if (!parser) {
      throw new Error(`No parser available for language: ${language}`);
    }
    
    return parser;
  }

  /**
   * Check if parser exists for language
   */
  hasParser(language: string): boolean {
    return this.parsers.has(language.toLowerCase());
  }

  /**
   * Get list of available parsers
   */
  getAvailableParsers(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Register custom parser
   */
  registerParser(language: string, parser: Parser) {
    this.parsers.set(language.toLowerCase(), parser);
  }
}