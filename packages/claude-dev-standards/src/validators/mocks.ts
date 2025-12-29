/**
 * Mock Validator - Prevents use of mocks in production code
 * Enforces the "NO MOCKS" policy by detecting and blocking mock patterns
 */

import * as fs from 'fs/promises';

import { glob } from 'glob';

import { ValidationResult } from '../types';
import { Logger } from '../utils/logger';

export interface MockPattern {
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
  category: string;
}

export interface MockValidationOptions {
  excludePaths?: string[];
  allowInTests?: boolean;
  customPatterns?: MockPattern[];
  strictMode?: boolean;
}

export interface MockValidationResult extends ValidationResult {
  violations: MockViolation[];
  stats: {
    filesScanned: number;
    violationsFound: number;
    violationsBySeverity: Record<string, number>;
    violationsByCategory: Record<string, number>;
  };
}

export interface MockViolation {
  file: string;
  line: number;
  column: number;
  pattern: string;
  message: string;
  severity: 'error' | 'warning';
  category: string;
  context: string;
  suggestion: string;
}

export class MockValidator {
  private logger: Logger;
  private options: MockValidationOptions;
  private patterns: MockPattern[];

  constructor(options: MockValidationOptions = {}) {
    this.logger = new Logger('MockValidator');
    this.options = {
      excludePaths: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**'
      ],
      allowInTests: true,
      strictMode: true,
      ...options
    };
    
    // Initialize patterns with both default and custom patterns
    this.patterns = this.getDefaultPatterns().concat(options.customPatterns || []);
  }

  /**
   * Validate a file or directory for mock usage
   */
  async validate(target: string): Promise<MockValidationResult> {
    this.logger.info(`Validating ${target} for mock usage...`);
    const startTime = Date.now();
    
    const result: MockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      violations: [],
      stats: {
        filesScanned: 0,
        violationsFound: 0,
        violationsBySeverity: { error: 0, warning: 0 },
        violationsByCategory: {}
      }
    };
    
    try {
      // Determine if target is file or directory
      const stats = await fs.stat(target).catch(() => null);
      
      if (!stats) {
        throw new Error(`Target not found: ${target}`);
      }
      
      const files = stats.isDirectory() 
        ? await this.getFilesToValidate(target)
        : [target];
      
      // Validate each file
      for (const file of files) {
        const fileViolations = await this.validateFile(file);
        result.violations.push(...fileViolations);
        result.stats.filesScanned++;
      }
      
      // Process violations
      for (const violation of result.violations) {
        result.stats.violationsFound++;
        result.stats.violationsBySeverity[violation.severity]++;
        result.stats.violationsByCategory[violation.category] = 
          (result.stats.violationsByCategory[violation.category] || 0) + 1;
        
        if (violation.severity === 'error') {
          result.errors.push(violation.message);
          result.valid = false;
        } else {
          result.warnings.push(violation.message);
        }
      }
      
      const duration = Date.now() - startTime;
      this.logger.info(`Mock validation completed in ${duration}ms`, {
        filesScanned: result.stats.filesScanned,
        violations: result.stats.violationsFound,
        valid: result.valid
      });
      
    } catch (error) {
      this.logger.error('Mock validation failed', error);
      result.valid = false;
      result.errors.push(`Validation failed: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Validate a single file
   */
  private async validateFile(filePath: string): Promise<MockViolation[]> {
    const violations: MockViolation[] = [];
    
    try {
      // Skip if in test file and tests are allowed
      if (this.options.allowInTests && this.isTestFile(filePath)) {
        return violations;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Check each pattern
      for (const pattern of this.patterns) {
        const matches = this.findPatternMatches(content, pattern.pattern);
        
        for (const match of matches) {
          const lineNumber = this.getLineNumber(content, match.index);
          const columnNumber = this.getColumnNumber(content, match.index);
          const context = this.getContext(lines, lineNumber - 1);
          
          violations.push({
            file: filePath,
            line: lineNumber,
            column: columnNumber,
            pattern: pattern.pattern.toString(),
            message: `${pattern.message} at line ${lineNumber}`,
            severity: pattern.severity,
            category: pattern.category,
            context,
            suggestion: this.getSuggestion(pattern.category, match[0])
          });
        }
      }
      
      // Additional checks for specific file types
      if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        violations.push(...await this.validateJavaScriptFile(filePath, content, lines));
      }
      
    } catch (error) {
      this.logger.error(`Failed to validate file: ${filePath}`, error);
    }
    
    return violations;
  }

  /**
   * Validate JavaScript/TypeScript specific patterns
   */
  private async validateJavaScriptFile(filePath: string, content: string, lines: string[]): Promise<MockViolation[]> {
    const violations: MockViolation[] = [];
    
    // Check for test doubles in non-test files
    const testDoubleImports = [
      /import.*from\s+['"](sinon|jest|vitest|enzyme|@testing-library)['"]/, 
      /require\s*\(['"](sinon|jest|vitest|enzyme|@testing-library)['"]\)/,
      /import\s*{[^}]*mock[^}]*}\s*from/i,
      /import\s*{[^}]*stub[^}]*}\s*from/i,
      /import\s*{[^}]*spy[^}]*}\s*from/i
    ];
    
    for (const pattern of testDoubleImports) {
      const matches = this.findPatternMatches(content, pattern);
      for (const match of matches) {
        const lineNumber = this.getLineNumber(content, match.index);
        violations.push({
          file: filePath,
          line: lineNumber,
          column: this.getColumnNumber(content, match.index),
          pattern: pattern.toString(),
          message: `Test library imported in production code at line ${lineNumber}`,
          severity: 'error',
          category: 'test-library',
          context: lines[lineNumber - 1],
          suggestion: 'Remove test library imports from production code'
        });
      }
    }
    
    // Check for mock implementations
    const mockImplementationPatterns = [
      /class\s+\w*Mock\w*/,
      /class\s+\w*Stub\w*/,
      /class\s+\w*Fake\w*/,
      /function\s+\w*[Mm]ock\w*/,
      /const\s+\w*[Mm]ock\w*\s*=\s*\{/,
      /export\s+const\s+create\w*Mock/i
    ];
    
    for (const pattern of mockImplementationPatterns) {
      const matches = this.findPatternMatches(content, pattern);
      for (const match of matches) {
        const lineNumber = this.getLineNumber(content, match.index);
        violations.push({
          file: filePath,
          line: lineNumber,
          column: this.getColumnNumber(content, match.index),
          pattern: pattern.toString(),
          message: `Mock implementation detected at line ${lineNumber}`,
          severity: 'error',
          category: 'mock-implementation',
          context: this.getContext(lines, lineNumber - 1),
          suggestion: 'Replace mock with real implementation'
        });
      }
    }
    
    return violations;
  }

  /**
   * Get default mock patterns
   */
  private getDefaultPatterns(): MockPattern[] {
    return [
      // Mock frameworks and utilities
      {
        pattern: /jest\.mock\s*\(/,
        message: 'Jest mock usage detected',
        severity: 'error',
        category: 'mock-framework'
      },
      {
        pattern: /vi\.mock\s*\(/,
        message: 'Vitest mock usage detected',
        severity: 'error',
        category: 'mock-framework'
      },
      {
        pattern: /sinon\.(stub|mock|spy|fake)\s*\(/,
        message: 'Sinon test double detected',
        severity: 'error',
        category: 'mock-framework'
      },
      {
        pattern: /td\.(replace|when|verify)\s*\(/,
        message: 'testdouble.js usage detected',
        severity: 'error',
        category: 'mock-framework'
      },
      
      // Mock method calls
      {
        pattern: /\.mockImplementation\s*\(/,
        message: 'Mock implementation detected',
        severity: 'error',
        category: 'mock-method'
      },
      {
        pattern: /\.mockReturnValue\s*\(/,
        message: 'Mock return value detected',
        severity: 'error',
        category: 'mock-method'
      },
      {
        pattern: /\.mockResolvedValue\s*\(/,
        message: 'Mock resolved value detected',
        severity: 'error',
        category: 'mock-method'
      },
      {
        pattern: /\.mockRejectedValue\s*\(/,
        message: 'Mock rejected value detected',
        severity: 'error',
        category: 'mock-method'
      },
      
      // In-memory databases
      {
        pattern: /sqlite3?\s*\.\s*Database\s*\(['"]:memory:['"]\)/,
        message: 'In-memory SQLite database detected',
        severity: 'error',
        category: 'mock-database'
      },
      {
        pattern: /new\s+Map\s*\(\).*\/\/.*database/i,
        message: 'In-memory Map used as database',
        severity: 'error',
        category: 'mock-database'
      },
      {
        pattern: /mongodb-memory-server/,
        message: 'MongoDB memory server detected',
        severity: 'error',
        category: 'mock-database'
      },
      
      // Fake authentication
      {
        pattern: /const\s+users\s*=\s*\[\s*{[^}]*password\s*:[^}]*}\s*\]/,
        message: 'Hardcoded user credentials detected',
        severity: 'error',
        category: 'mock-auth'
      },
      {
        pattern: /if\s*\(.*password\s*===\s*['"][^'"]+['"]\)/,
        message: 'Hardcoded password check detected',
        severity: 'error',
        category: 'mock-auth'
      },
      {
        pattern: /return\s+{\s*token\s*:\s*['"]fake.*token['"]\s*}/i,
        message: 'Fake token generation detected',
        severity: 'error',
        category: 'mock-auth'
      },
      
      // Stub responses
      {
        pattern: /return\s+{[^}]*\/\/\s*TODO:?\s*real\s+implementation/i,
        message: 'Stub implementation with TODO detected',
        severity: 'error',
        category: 'stub-implementation'
      },
      {
        pattern: /throw\s+new\s+Error\s*\(['"]not\s+implemented['"]\)/i,
        message: 'Not implemented error detected',
        severity: 'warning',
        category: 'stub-implementation'
      },
      {
        pattern: /return\s+Promise\.resolve\s*\(\s*{[^}]*dummy[^}]*}\s*\)/i,
        message: 'Dummy data in Promise detected',
        severity: 'error',
        category: 'mock-data'
      },
      
      // Mock services
      {
        pattern: /class\s+\w*Service\s*{[^}]*\/\/\s*mock/i,
        message: 'Mock service class detected',
        severity: 'error',
        category: 'mock-service'
      },
      {
        pattern: /export\s+const\s+\w*Service\s*=\s*{[^}]*mock[^}]*}/i,
        message: 'Mock service object detected',
        severity: 'error',
        category: 'mock-service'
      },
      
      // Placeholder data
      {
        pattern: /['"]Lorem\s+ipsum['"]|['"]placeholder['"]|['"]dummy['"]|['"]fake['"]|['"]test['"]\s*:/i,
        message: 'Placeholder/dummy data detected',
        severity: 'warning',
        category: 'mock-data'
      },
      
      // Console.log in production
      {
        pattern: /console\.(log|debug|info|warn|error)\s*\(/,
        message: 'Console statement detected (use proper logging)',
        severity: this.options.strictMode ? 'error' : 'warning',
        category: 'improper-logging'
      },
      
      // Synchronous I/O in production
      {
        pattern: /fs\.\w*Sync\s*\(/,
        message: 'Synchronous file system operation detected',
        severity: 'error',
        category: 'sync-operation'
      },
      {
        pattern: /execSync\s*\(/,
        message: 'Synchronous process execution detected',
        severity: 'warning',
        category: 'sync-operation'
      }
    ];
  }

  /**
   * Get files to validate based on patterns
   */
  private async getFilesToValidate(directory: string): Promise<string[]> {
    const files = await glob('**/*.{js,jsx,ts,tsx,mjs,cjs}', {
      cwd: directory,
      absolute: true,
      ignore: this.options.excludePaths
    });
    
    return files;
  }

  /**
   * Find all matches of a pattern in content
   */
  private findPatternMatches(content: string, pattern: RegExp): RegExpExecArray[] {
    const matches: RegExpExecArray[] = [];
    const regex = new RegExp(pattern, 'gm');
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(content)) !== null) {
      matches.push(match);
    }
    
    return matches;
  }

  /**
   * Get line number for a character index
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Get column number for a character index
   */
  private getColumnNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    return lines[lines.length - 1].length + 1;
  }

  /**
   * Get context lines around a violation
   */
  private getContext(lines: string[], lineIndex: number, contextLines: number = 2): string {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    
    return lines.slice(start, end)
      .map((line, i) => {
        const lineNum = start + i + 1;
        const marker = lineNum === lineIndex + 1 ? '>' : ' ';
        return `${marker} ${lineNum}: ${line}`;
      })
      .join('\n');
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /__tests__/,
      /tests?\//,
      /\.e2e\.[jt]sx?$/,
      /\.integration\.[jt]sx?$/
    ];
    
    return testPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Get suggestion based on category
   */
  private getSuggestion(category: string, matchedText: string): string {
    const suggestions: Record<string, string> = {
      'mock-framework': 'Remove mock frameworks and implement real services with proper database connections',
      'mock-method': 'Replace mock methods with actual implementations connected to real services',
      'mock-database': 'Use a real PostgreSQL or Redis database instead of in-memory stores',
      'mock-auth': 'Implement proper JWT authentication with secure token generation and validation',
      'stub-implementation': 'Complete the implementation with production-ready code',
      'mock-service': 'Implement the actual service with real business logic and data persistence',
      'mock-data': 'Use real data from database or external services instead of placeholder data',
      'improper-logging': 'Use Winston or similar production logging framework with proper log levels',
      'sync-operation': 'Use asynchronous operations to avoid blocking the event loop',
      'test-library': 'Move test utilities to test directories only'
    };
    
    return suggestions[category] || 'Replace with production-ready implementation';
  }

  /**
   * Generate validation report
   */
  async generateReport(result: MockValidationResult, format: 'json' | 'markdown' | 'html' = 'markdown'): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      
      case 'markdown':
        return this.generateMarkdownReport(result);
      
      case 'html':
        return this.generateHtmlReport(result);
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private generateMarkdownReport(result: MockValidationResult): string {
    let report = `# Mock Validation Report\n\n`;
    report += `**Status:** ${result.valid ? '✅ PASSED' : '❌ FAILED'}\n`;
    report += `**Files Scanned:** ${result.stats.filesScanned}\n`;
    report += `**Violations Found:** ${result.stats.violationsFound}\n\n`;
    
    if (result.violations.length > 0) {
      report += `## Violations\n\n`;
      
      // Group by severity
      const byCategory = result.violations.reduce((acc, v) => {
        if (!acc[v.category]) acc[v.category] = [];
        acc[v.category].push(v);
        return acc;
      }, {} as Record<string, MockViolation[]>);
      
      for (const [category, violations] of Object.entries(byCategory)) {
        report += `### ${category}\n\n`;
        for (const violation of violations) {
          report += `- **${violation.file}:${violation.line}** - ${violation.message}\n`;
          report += `  - Suggestion: ${violation.suggestion}\n`;
          report += `  \`\`\`\n${violation.context}\n  \`\`\`\n`;
        }
        report += '\n';
      }
    }
    
    report += `## Summary\n\n`;
    report += `- Errors: ${result.stats.violationsBySeverity.error}\n`;
    report += `- Warnings: ${result.stats.violationsBySeverity.warning}\n`;
    
    return report;
  }

  private generateHtmlReport(result: MockValidationResult): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Mock Validation Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .status-passed { color: green; }
    .status-failed { color: red; }
    .violation { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
    .violation-error { background-color: #ffebee; }
    .violation-warning { background-color: #fff3e0; }
    .code-context { background-color: #f5f5f5; padding: 10px; margin: 5px 0; }
    pre { margin: 0; }
  </style>
</head>
<body>
  <h1>Mock Validation Report</h1>
  <p><strong>Status:</strong> <span class="${result.valid ? 'status-passed' : 'status-failed'}">${result.valid ? 'PASSED' : 'FAILED'}</span></p>
  <p><strong>Files Scanned:</strong> ${result.stats.filesScanned}</p>
  <p><strong>Violations Found:</strong> ${result.stats.violationsFound}</p>
  
  ${result.violations.length > 0 ? `
  <h2>Violations</h2>
  ${result.violations.map(v => `
  <div class="violation violation-${v.severity}">
    <h3>${v.file}:${v.line}</h3>
    <p><strong>Message:</strong> ${v.message}</p>
    <p><strong>Category:</strong> ${v.category}</p>
    <p><strong>Suggestion:</strong> ${v.suggestion}</p>
    <div class="code-context">
      <pre>${v.context}</pre>
    </div>
  </div>`).join('')}
  ` : '<p>No violations found!</p>'}
</body>
</html>`;
  }

  /**
   * Update validator options
   */
  updateOptions(options: Partial<MockValidationOptions>) {
    this.options = { ...this.options, ...options };
    if (options.customPatterns) {
      this.patterns = this.getDefaultPatterns().concat(options.customPatterns);
    }
  }

  /**
   * Get current options
   */
  getOptions(): MockValidationOptions {
    return { ...this.options };
  }
}