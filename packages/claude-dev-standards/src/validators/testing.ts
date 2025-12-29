/**
 * Testing Validator - Validates testing implementation
 * Ensures proper test coverage, testing practices, and no skipped tests in production
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

import { glob } from 'glob';

import { ValidationResult } from '../types';
import { Logger } from '../utils/logger';

export interface TestingValidationOptions {
  minCoverage: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  requireUnitTests: boolean;
  requireIntegrationTests: boolean;
  requireE2ETests: boolean;
  maxSkippedTests: number;
  requireTestDocumentation: boolean;
  testFilePatterns: string[];
}

export interface TestingValidationResult extends ValidationResult {
  issues: TestingIssue[];
  coverage: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  testStats: {
    totalTests: number;
    passingTests: number;
    failingTests: number;
    skippedTests: number;
    testFiles: number;
  };
  testTypes: {
    hasUnitTests: boolean;
    hasIntegrationTests: boolean;
    hasE2ETests: boolean;
  };
}

export interface TestingIssue {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line?: number;
  recommendation: string;
}

export class TestingValidator {
  private logger: Logger;
  private options: TestingValidationOptions;

  constructor(options?: Partial<TestingValidationOptions>) {
    this.logger = new Logger('TestingValidator');
    this.options = {
      minCoverage: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      },
      requireUnitTests: true,
      requireIntegrationTests: true,
      requireE2ETests: true,
      maxSkippedTests: 0,
      requireTestDocumentation: true,
      testFilePatterns: [
        '**/*.test.{js,jsx,ts,tsx}',
        '**/*.spec.{js,jsx,ts,tsx}',
        '**/test/**/*.{js,jsx,ts,tsx}',
        '**/tests/**/*.{js,jsx,ts,tsx}',
        '**/__tests__/**/*.{js,jsx,ts,tsx}'
      ],
      ...options
    };
  }

  /**
   * Validate testing implementation
   */
  async validate(target: string): Promise<TestingValidationResult> {
    this.logger.info(`Validating testing for: ${target}`);
    
    const result: TestingValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      issues: [],
      coverage: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0
      },
      testStats: {
        totalTests: 0,
        passingTests: 0,
        failingTests: 0,
        skippedTests: 0,
        testFiles: 0
      },
      testTypes: {
        hasUnitTests: false,
        hasIntegrationTests: false,
        hasE2ETests: false
      }
    };
    
    try {
      // Check if tests exist
      const testFiles = await this.findTestFiles(target);
      result.testStats.testFiles = testFiles.length;
      
      if (testFiles.length === 0) {
        result.errors.push('No test files found');
        result.issues.push({
          type: 'no-tests',
          severity: 'error',
          message: 'No test files found in the project',
          file: 'project',
          recommendation: 'Add unit tests, integration tests, and E2E tests'
        });
        return result;
      }
      
      // Analyze test files
      for (const file of testFiles) {
        await this.analyzeTestFile(file, result);
      }
      
      // Try to get coverage report
      await this.checkTestCoverage(target, result);
      
      // Try to run tests and get results
      await this.runTestsAndAnalyze(target, result);
      
      // Check test types
      await this.checkTestTypes(testFiles, result);
      
      // Check requirements
      this.checkTestingRequirements(result);
      
      // Validate overall implementation
      result.valid = result.errors.length === 0;
      
    } catch (error) {
      this.logger.error('Testing validation failed', error);
      result.valid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Find test files in the project
   */
  private async findTestFiles(target: string): Promise<string[]> {
    const files = new Set<string>();
    
    for (const pattern of this.options.testFilePatterns) {
      const matches = await glob(pattern, {
        cwd: target,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      });
      matches.forEach(file => files.add(file));
    }
    
    return Array.from(files);
  }

  /**
   * Analyze a test file for quality and practices
   */
  private async analyzeTestFile(filePath: string, result: TestingValidationResult) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      
      // Count tests (rough estimation)
      const testMatches = content.match(/\b(it|test|describe|suite)\s*\(/g) || [];
      const skipMatches = content.match(/\.(skip|only)\s*\(/g) || [];
      
      result.testStats.totalTests += testMatches.length;
      result.testStats.skippedTests += skipMatches.length;
      
      // Check for skipped tests
      if (skipMatches.length > 0) {
        result.warnings.push(`Skipped tests found in ${fileName}`);
        result.issues.push({
          type: 'skipped-tests',
          severity: 'warning',
          message: `${skipMatches.length} skipped tests found`,
          file: filePath,
          recommendation: 'Remove or fix skipped tests before production'
        });
      }
      
      // Check for .only tests
      if (content.includes('.only(')) {
        result.errors.push('Tests with .only() found');
        result.issues.push({
          type: 'only-tests',
          severity: 'error',
          message: 'Tests are set to run exclusively with .only()',
          file: filePath,
          recommendation: 'Remove .only() to run all tests'
        });
      }
      
      // Check for proper assertions
      if (!content.includes('expect') && !content.includes('assert') && 
          !content.includes('should')) {
        result.warnings.push(`No assertions found in ${fileName}`);
        result.issues.push({
          type: 'no-assertions',
          severity: 'warning',
          message: 'Test file has no clear assertions',
          file: filePath,
          recommendation: 'Add proper assertions to validate behavior'
        });
      }
      
      // Check for test documentation
      if (this.options.requireTestDocumentation) {
        const hasDescriptions = /describe\s*\(['"][^'"]+['"]/.test(content) ||
                               /it\s*\(['"][^'"]+['"]/.test(content);
        
        if (!hasDescriptions) {
          result.warnings.push('Tests lack descriptive names');
          result.issues.push({
            type: 'poor-test-descriptions',
            severity: 'warning',
            message: 'Tests should have clear, descriptive names',
            file: filePath,
            recommendation: 'Use descriptive test names that explain what is being tested'
          });
        }
      }
      
      // Check for common testing anti-patterns
      this.checkTestingAntiPatterns(content, filePath, result);
      
    } catch (error) {
      this.logger.error(`Failed to analyze test file: ${filePath}`, error);
    }
  }

  /**
   * Check for testing anti-patterns
   */
  private checkTestingAntiPatterns(content: string, filePath: string, result: TestingValidationResult) {
    // Check for hardcoded timeouts
    if (content.match(/setTimeout\s*\([^,]+,\s*\d{4,}/)) {
      result.warnings.push('Long timeouts detected in tests');
      result.issues.push({
        type: 'long-timeouts',
        severity: 'warning',
        message: 'Tests contain long setTimeout delays',
        file: filePath,
        recommendation: 'Use proper async handling instead of long timeouts'
      });
    }
    
    // Check for console.log in tests
    if (content.includes('console.log')) {
      result.warnings.push('Console.log found in tests');
      result.issues.push({
        type: 'console-in-tests',
        severity: 'warning',
        message: 'Console statements should be removed from tests',
        file: filePath,
        recommendation: 'Remove console statements or use proper test reporters'
      });
    }
    
    // Check for hardcoded test data
    if (content.match(/password\s*[:=]\s*['"]test['"]/) ||
        content.match(/apiKey\s*[:=]\s*['"]test['"]/) ||
        content.match(/localhost:\d{4}/)) {
      result.warnings.push('Hardcoded test data detected');
      result.issues.push({
        type: 'hardcoded-test-data',
        severity: 'warning',
        message: 'Tests contain hardcoded credentials or URLs',
        file: filePath,
        recommendation: 'Use environment variables or test configuration files'
      });
    }
    
    // Check for missing error handling in tests
    if (content.includes('async') && !content.includes('catch') && 
        !content.includes('rejects') && !content.includes('throws')) {
      result.warnings.push('Async tests without error handling');
      result.issues.push({
        type: 'no-error-testing',
        severity: 'warning',
        message: 'Async tests should handle errors',
        file: filePath,
        recommendation: 'Test both success and error cases'
      });
    }
  }

  /**
   * Check test coverage
   */
  private async checkTestCoverage(target: string, result: TestingValidationResult) {
    // Try to find coverage report
    const coverageFiles = await glob('coverage/coverage-summary.json', {
      cwd: target,
      absolute: true
    });
    
    if (coverageFiles.length === 0) {
      // Try to generate coverage
      try {
        this.logger.info('Attempting to generate coverage report...');
        execSync('npm test -- --coverage --coverageReporters=json-summary', {
          cwd: target,
          stdio: 'pipe',
          timeout: 60000 // 1 minute timeout
        });
      } catch (error) {
        this.logger.debug('Could not generate coverage', error);
        result.warnings.push('Coverage report not available');
        result.issues.push({
          type: 'no-coverage-report',
          severity: 'warning',
          message: 'Test coverage report not found',
          file: 'project',
          recommendation: 'Configure test runner to generate coverage reports'
        });
        return;
      }
    }
    
    // Read coverage data
    try {
      const coveragePath = path.join(target, 'coverage/coverage-summary.json');
      const coverageData = JSON.parse(
        await fs.readFile(coveragePath, 'utf-8')
      );
      
      const total = coverageData.total;
      result.coverage = {
        statements: total.statements.pct,
        branches: total.branches.pct,
        functions: total.functions.pct,
        lines: total.lines.pct
      };
      
      // Check coverage thresholds
      for (const [metric, value] of Object.entries(result.coverage)) {
        const threshold = this.options.minCoverage[metric as keyof typeof this.options.minCoverage];
        if (value < threshold) {
          result.errors.push(`${metric} coverage (${value}%) is below threshold (${threshold}%)`);
          result.issues.push({
            type: 'low-coverage',
            severity: 'error',
            message: `${metric} coverage is ${value}%, minimum required is ${threshold}%`,
            file: 'project',
            recommendation: `Increase test coverage for ${metric}`
          });
        }
      }
      
    } catch (error) {
      this.logger.debug('Could not read coverage data', error);
    }
  }

  /**
   * Run tests and analyze results
   */
  private async runTestsAndAnalyze(target: string, result: TestingValidationResult) {
    try {
      // Try to run tests
      const testOutput = execSync('npm test -- --json', {
        cwd: target,
        stdio: 'pipe',
        timeout: 120000 // 2 minute timeout
      }).toString();
      
      // Try to parse test results
      try {
        const testResults = JSON.parse(testOutput);
        
        if (testResults.numTotalTests) {
          result.testStats.totalTests = testResults.numTotalTests;
          result.testStats.passingTests = testResults.numPassedTests || 0;
          result.testStats.failingTests = testResults.numFailedTests || 0;
          result.testStats.skippedTests = testResults.numPendingTests || 0;
        }
        
        if (result.testStats.failingTests > 0) {
          result.errors.push(`${result.testStats.failingTests} tests are failing`);
          result.issues.push({
            type: 'failing-tests',
            severity: 'error',
            message: `${result.testStats.failingTests} tests are currently failing`,
            file: 'project',
            recommendation: 'Fix all failing tests before deployment'
          });
        }
        
      } catch (parseError) {
        this.logger.debug('Could not parse test results', parseError);
      }
      
    } catch (error) {
      // Tests failed to run or failed
      if (error.status === 1) {
        result.errors.push('Tests are failing');
        result.issues.push({
          type: 'test-failure',
          severity: 'error',
          message: 'Test suite is not passing',
          file: 'project',
          recommendation: 'Fix all test failures'
        });
      } else {
        this.logger.debug('Could not run tests', error);
      }
    }
  }

  /**
   * Check for different types of tests
   */
  private async checkTestTypes(testFiles: string[], result: TestingValidationResult) {
    for (const file of testFiles) {
      const content = await fs.readFile(file, 'utf-8');
      const filePath = file.toLowerCase();
      
      // Check for unit tests
      if (filePath.includes('unit') || filePath.includes('.unit.') ||
          content.includes('unit test') || !content.includes('request(')) {
        result.testTypes.hasUnitTests = true;
      }
      
      // Check for integration tests
      if (filePath.includes('integration') || filePath.includes('.integration.') ||
          content.includes('integration test') || content.includes('supertest') ||
          content.includes('request(app)')) {
        result.testTypes.hasIntegrationTests = true;
      }
      
      // Check for E2E tests
      if (filePath.includes('e2e') || filePath.includes('.e2e.') ||
          content.includes('e2e test') || content.includes('puppeteer') ||
          content.includes('playwright') || content.includes('cypress') ||
          content.includes('selenium')) {
        result.testTypes.hasE2ETests = true;
      }
    }
  }

  /**
   * Check testing requirements
   */
  private checkTestingRequirements(result: TestingValidationResult) {
    // Check for required test types
    if (this.options.requireUnitTests && !result.testTypes.hasUnitTests) {
      result.errors.push('Unit tests required but not found');
      result.issues.push({
        type: 'missing-unit-tests',
        severity: 'error',
        message: 'Unit tests are required',
        file: 'project',
        recommendation: 'Add unit tests for individual functions and components'
      });
    }
    
    if (this.options.requireIntegrationTests && !result.testTypes.hasIntegrationTests) {
      result.errors.push('Integration tests required but not found');
      result.issues.push({
        type: 'missing-integration-tests',
        severity: 'error',
        message: 'Integration tests are required',
        file: 'project',
        recommendation: 'Add integration tests for API endpoints and database operations'
      });
    }
    
    if (this.options.requireE2ETests && !result.testTypes.hasE2ETests) {
      result.warnings.push('E2E tests recommended but not found');
      result.issues.push({
        type: 'missing-e2e-tests',
        severity: 'warning',
        message: 'End-to-end tests are recommended',
        file: 'project',
        recommendation: 'Add E2E tests for critical user journeys'
      });
    }
    
    // Check skipped tests threshold
    if (result.testStats.skippedTests > this.options.maxSkippedTests) {
      result.errors.push(`Too many skipped tests: ${result.testStats.skippedTests}`);
      result.issues.push({
        type: 'excessive-skipped-tests',
        severity: 'error',
        message: `${result.testStats.skippedTests} tests are skipped (max: ${this.options.maxSkippedTests})`,
        file: 'project',
        recommendation: 'Fix or remove skipped tests'
      });
    }
    
    // Warn if no tests are actually running
    if (result.testStats.totalTests > 0 && result.testStats.passingTests === 0 && 
        result.testStats.failingTests === 0) {
      result.warnings.push('Tests exist but none are running');
      result.issues.push({
        type: 'tests-not-running',
        severity: 'warning',
        message: 'Test files exist but tests are not executing',
        file: 'project',
        recommendation: 'Check test configuration and runner setup'
      });
    }
  }
}