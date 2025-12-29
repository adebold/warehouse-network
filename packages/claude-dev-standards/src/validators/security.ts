/**
 * Security Validator - Validates security implementation
 * Ensures proper security headers, input validation, rate limiting, and vulnerability prevention
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

import { glob } from 'glob';

import { ValidationResult } from '../types';
import { Logger } from '../utils/logger';

export interface SecurityValidationOptions {
  requireHelmet: boolean;
  requireCORS: boolean;
  requireRateLimit: boolean;
  requireCSRF: boolean;
  requireInputValidation: boolean;
  requireSecurityHeaders: string[];
  bannedFunctions: string[];
  maxVulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface SecurityValidationResult extends ValidationResult {
  issues: SecurityIssue[];
  coverage: {
    hasHelmet: boolean;
    hasCORS: boolean;
    hasRateLimit: boolean;
    hasCSRF: boolean;
    hasInputValidation: boolean;
    hasSecurityHeaders: boolean;
    hasContentSecurityPolicy: boolean;
    hasHTTPS: boolean;
  };
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface SecurityIssue {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line?: number;
  recommendation: string;
}

export class SecurityValidator {
  private logger: Logger;
  private options: SecurityValidationOptions;

  constructor(options?: Partial<SecurityValidationOptions>) {
    this.logger = new Logger('SecurityValidator');
    this.options = {
      requireHelmet: true,
      requireCORS: true,
      requireRateLimit: true,
      requireCSRF: true,
      requireInputValidation: true,
      requireSecurityHeaders: [
        'X-Frame-Options',
        'X-Content-Type-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy'
      ],
      bannedFunctions: [
        'eval',
        'Function',
        'setTimeout(.*string',
        'setInterval(.*string',
        'innerHTML',
        'outerHTML',
        'document.write',
        'document.writeln'
      ],
      maxVulnerabilities: {
        critical: 0,
        high: 0,
        medium: 2,
        low: 5
      },
      ...options
    };
  }

  /**
   * Validate security implementation
   */
  async validate(target: string): Promise<SecurityValidationResult> {
    this.logger.info(`Validating security for: ${target}`);
    
    const result: SecurityValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      issues: [],
      coverage: {
        hasHelmet: false,
        hasCORS: false,
        hasRateLimit: false,
        hasCSRF: false,
        hasInputValidation: false,
        hasSecurityHeaders: false,
        hasContentSecurityPolicy: false,
        hasHTTPS: false
      },
      vulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    };
    
    try {
      // Run npm audit
      await this.runSecurityAudit(target, result);
      
      // Find security-related files
      const files = await this.findSecurityFiles(target);
      
      // Check middleware and security configuration
      for (const file of files) {
        await this.validateSecurityFile(file, result);
      }
      
      // Check package dependencies
      await this.checkSecurityDependencies(target, result);
      
      // Check for common vulnerabilities in all source files
      await this.scanForVulnerabilities(target, result);
      
      // Check coverage requirements
      this.checkCoverageRequirements(result);
      
      // Validate overall implementation
      result.valid = result.errors.length === 0;
      
    } catch (error) {
      this.logger.error('Security validation failed', error);
      result.valid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Run npm audit for security vulnerabilities
   */
  private async runSecurityAudit(target: string, result: SecurityValidationResult) {
    try {
      execSync('npm audit --json', {
        cwd: target,
        stdio: 'pipe'
      });
    } catch (error) {
      // npm audit exits with non-zero when vulnerabilities are found
      if (error.stdout) {
        try {
          const auditResult = JSON.parse(error.stdout.toString());
          
          if (auditResult.metadata && auditResult.metadata.vulnerabilities) {
            const vulns = auditResult.metadata.vulnerabilities;
            result.vulnerabilities = {
              critical: vulns.critical || 0,
              high: vulns.high || 0,
              medium: vulns.medium || 0,
              low: vulns.low || 0
            };
            
            // Check against thresholds
            for (const [severity, count] of Object.entries(result.vulnerabilities)) {
              const max = this.options.maxVulnerabilities[severity as keyof typeof this.options.maxVulnerabilities];
              if (count > max) {
                result.errors.push(`Too many ${severity} vulnerabilities: ${count} (max: ${max})`);
                result.issues.push({
                  type: 'npm-vulnerabilities',
                  severity: 'error',
                  message: `${count} ${severity} vulnerabilities found`,
                  file: 'package.json',
                  recommendation: `Run 'npm audit fix' to resolve vulnerabilities`
                });
              }
            }
          }
        } catch (parseError) {
          this.logger.debug('Could not parse npm audit results', parseError);
        }
      }
    }
  }

  /**
   * Find security-related files
   */
  private async findSecurityFiles(target: string): Promise<string[]> {
    const patterns = [
      '**/middleware/**/*.{js,ts}',
      '**/security/**/*.{js,ts}',
      '**/config/security*.{js,ts}',
      '**/app.{js,ts}',
      '**/server.{js,ts}',
      '**/index.{js,ts}',
      '**/main.{js,ts}'
    ];
    
    const files = new Set<string>();
    
    for (const pattern of patterns) {
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
   * Validate security configuration in files
   */
  private async validateSecurityFile(filePath: string, result: SecurityValidationResult) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check for Helmet
      if (content.includes('helmet') || content.includes('Helmet')) {
        result.coverage.hasHelmet = true;
        
        // Check if properly configured
        if (content.includes('helmet({') || content.includes('helmet.contentSecurityPolicy')) {
          result.coverage.hasContentSecurityPolicy = true;
        }
      }
      
      // Check for CORS
      if (content.includes('cors') || content.includes('CORS')) {
        result.coverage.hasCORS = true;
        
        // Check for proper CORS configuration
        if (content.includes('origin: true') || content.includes('origin: "*"')) {
          result.warnings.push('CORS configured with wildcard origin');
          result.issues.push({
            type: 'cors-wildcard',
            severity: 'warning',
            message: 'CORS allows all origins',
            file: filePath,
            recommendation: 'Configure CORS with specific allowed origins'
          });
        }
      }
      
      // Check for rate limiting
      if (content.includes('rate-limit') || content.includes('rateLimit') || 
          content.includes('express-rate-limit')) {
        result.coverage.hasRateLimit = true;
      }
      
      // Check for CSRF protection
      if (content.includes('csrf') || content.includes('CSRF') || content.includes('csurf')) {
        result.coverage.hasCSRF = true;
      }
      
      // Check for input validation
      if (content.includes('joi') || content.includes('express-validator') || 
          content.includes('validator') || content.includes('yup') || 
          content.includes('zod')) {
        result.coverage.hasInputValidation = true;
      }
      
      // Check for security headers
      for (const header of this.options.requireSecurityHeaders) {
        if (content.includes(header)) {
          result.coverage.hasSecurityHeaders = true;
          break;
        }
      }
      
      // Check for HTTPS enforcement
      if (content.includes('https') || content.includes('requireHTTPS') || 
          content.includes('forceSSL')) {
        result.coverage.hasHTTPS = true;
      }
      
    } catch (error) {
      this.logger.error(`Failed to validate security file: ${filePath}`, error);
    }
  }

  /**
   * Check security-related dependencies
   */
  private async checkSecurityDependencies(target: string, result: SecurityValidationResult) {
    try {
      const packagePath = path.join(target, 'package.json');
      const packageContent = await fs.readFile(packagePath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      // Check for security packages
      const securityPackages = {
        helmet: result.coverage.hasHelmet,
        cors: result.coverage.hasCORS,
        'express-rate-limit': result.coverage.hasRateLimit,
        csurf: result.coverage.hasCSRF,
        joi: result.coverage.hasInputValidation,
        'express-validator': result.coverage.hasInputValidation,
        validator: result.coverage.hasInputValidation
      };
      
      // Update coverage based on package.json
      for (const [pkg, _] of Object.entries(securityPackages)) {
        if (allDeps[pkg]) {
          switch (pkg) {
            case 'helmet':
              result.coverage.hasHelmet = true;
              break;
            case 'cors':
              result.coverage.hasCORS = true;
              break;
            case 'express-rate-limit':
              result.coverage.hasRateLimit = true;
              break;
            case 'csurf':
              result.coverage.hasCSRF = true;
              break;
            case 'joi':
            case 'express-validator':
            case 'validator':
              result.coverage.hasInputValidation = true;
              break;
          }
        }
      }
      
      // Check for known vulnerable packages
      const vulnerablePackages = [
        'event-stream',
        'flatmap-stream',
        'eslint-scope',
        'bootstrap@3'
      ];
      
      for (const vuln of vulnerablePackages) {
        if (allDeps[vuln] || vuln.split('@').length > 1 && allDeps[vuln.split('@')[0]]) {
          result.errors.push(`Known vulnerable package detected: ${vuln}`);
          result.issues.push({
            type: 'vulnerable-package',
            severity: 'error',
            message: `Package ${vuln} has known vulnerabilities`,
            file: 'package.json',
            recommendation: 'Update or replace the vulnerable package'
          });
        }
      }
      
    } catch (error) {
      this.logger.debug('Could not check security dependencies', error);
    }
  }

  /**
   * Scan source files for common vulnerabilities
   */
  private async scanForVulnerabilities(target: string, result: SecurityValidationResult) {
    const sourceFiles = await glob('**/*.{js,jsx,ts,tsx}', {
      cwd: target,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.test.*', '**/*.spec.*']
    });
    
    for (const file of sourceFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        
        // Check for banned functions
        for (const banned of this.options.bannedFunctions) {
          const regex = new RegExp(banned, 'g');
          const matches = content.match(regex);
          
          if (matches) {
            result.warnings.push(`Potentially dangerous function used: ${banned}`);
            result.issues.push({
              type: 'dangerous-function',
              severity: 'warning',
              message: `Use of ${banned} detected`,
              file,
              recommendation: this.getRecommendationForBannedFunction(banned)
            });
          }
        }
        
        // Check for hardcoded secrets
        this.checkForSecrets(content, file, result);
        
        // Check for XSS vulnerabilities
        this.checkForXSS(content, file, result);
        
        // Check for path traversal
        this.checkForPathTraversal(content, file, result);
        
        // Check for command injection
        this.checkForCommandInjection(content, file, result);
        
      } catch (error) {
        this.logger.debug(`Could not scan file: ${file}`, error);
      }
    }
  }

  /**
   * Check for hardcoded secrets
   */
  private checkForSecrets(content: string, file: string, result: SecurityValidationResult) {
    const secretPatterns = [
      /['"]?[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]['"]?\s*[:=]\s*['"][A-Za-z0-9+/]{20,}['"]/,
      /['"]?[Ss][Ee][Cc][Rr][Ee][Tt][_-]?[Kk][Ee][Yy]['"]?\s*[:=]\s*['"][A-Za-z0-9+/]{20,}['"]/,
      /['"]?[Aa][Cc][Cc][Ee][Ss][Ss][_-]?[Tt][Oo][Kk][Ee][Nn]['"]?\s*[:=]\s*['"][A-Za-z0-9+/]{20,}['"]/,
      /['"]?[Pp][Rr][Ii][Vv][Aa][Tt][Ee][_-]?[Kk][Ee][Yy]['"]?\s*[:=]\s*['"]-----BEGIN/
    ];
    
    for (const pattern of secretPatterns) {
      if (pattern.test(content) && !content.includes('process.env')) {
        result.errors.push('Hardcoded secret or API key detected');
        result.issues.push({
          type: 'hardcoded-secret',
          severity: 'error',
          message: 'Potential hardcoded secret detected',
          file,
          recommendation: 'Store secrets in environment variables'
        });
        break;
      }
    }
  }

  /**
   * Check for XSS vulnerabilities
   */
  private checkForXSS(content: string, file: string, result: SecurityValidationResult) {
    const xssPatterns = [
      /\.innerHTML\s*=\s*[^'"]/,
      /\.outerHTML\s*=\s*[^'"]/,
      /document\.write\s*\(/,
      /\$\([^)]+\)\.html\s*\(/,
      /v-html\s*=/,
      /dangerouslySetInnerHTML/
    ];
    
    for (const pattern of xssPatterns) {
      if (pattern.test(content)) {
        // Check if it's sanitized
        if (!content.includes('sanitize') && !content.includes('escape') && 
            !content.includes('DOMPurify')) {
          result.warnings.push('Potential XSS vulnerability');
          result.issues.push({
            type: 'xss-vulnerability',
            severity: 'warning',
            message: 'Unsafe HTML injection detected',
            file,
            recommendation: 'Sanitize user input before rendering HTML'
          });
          break;
        }
      }
    }
  }

  /**
   * Check for path traversal vulnerabilities
   */
  private checkForPathTraversal(content: string, file: string, result: SecurityValidationResult) {
    const pathPatterns = [
      /path\.join\s*\([^)]*req\.(body|query|params)/,
      /readFile\s*\([^)]*req\.(body|query|params)/,
      /createReadStream\s*\([^)]*req\.(body|query|params)/
    ];
    
    for (const pattern of pathPatterns) {
      if (pattern.test(content)) {
        if (!content.includes('path.resolve') && !content.includes('normalize')) {
          result.errors.push('Potential path traversal vulnerability');
          result.issues.push({
            type: 'path-traversal',
            severity: 'error',
            message: 'Unsafe path construction from user input',
            file,
            recommendation: 'Validate and sanitize file paths from user input'
          });
          break;
        }
      }
    }
  }

  /**
   * Check for command injection vulnerabilities
   */
  private checkForCommandInjection(content: string, file: string, result: SecurityValidationResult) {
    const cmdPatterns = [
      /exec\s*\([^)]*\$\{/,
      /execSync\s*\([^)]*\+/,
      /spawn\s*\([^,]+,\s*\[[^\]]*\$\{/,
      /system\s*\(/
    ];
    
    for (const pattern of cmdPatterns) {
      if (pattern.test(content)) {
        result.errors.push('Potential command injection vulnerability');
        result.issues.push({
          type: 'command-injection',
          severity: 'error',
          message: 'Unsafe command execution with user input',
          file,
          recommendation: 'Avoid executing system commands with user input'
        });
        break;
      }
    }
  }

  /**
   * Get recommendation for banned function
   */
  private getRecommendationForBannedFunction(func: string): string {
    const recommendations: Record<string, string> = {
      'eval': 'Use Function constructor or better design patterns',
      'Function': 'Refactor code to avoid dynamic code execution',
      'innerHTML': 'Use textContent or a sanitization library',
      'outerHTML': 'Use DOM methods or virtual DOM',
      'document.write': 'Use DOM manipulation methods instead',
      'setTimeout(.*string': 'Pass a function reference instead of a string',
      'setInterval(.*string': 'Pass a function reference instead of a string'
    };
    
    return recommendations[func] || 'Consider safer alternatives';
  }

  /**
   * Check coverage requirements
   */
  private checkCoverageRequirements(result: SecurityValidationResult) {
    const { coverage } = result;
    
    if (this.options.requireHelmet && !coverage.hasHelmet) {
      result.errors.push('Helmet.js required but not found');
      result.issues.push({
        type: 'missing-helmet',
        severity: 'error',
        message: 'Helmet.js is required for security headers',
        file: 'project',
        recommendation: 'Install and configure helmet for security headers'
      });
    }
    
    if (this.options.requireCORS && !coverage.hasCORS) {
      result.errors.push('CORS configuration required but not found');
      result.issues.push({
        type: 'missing-cors',
        severity: 'error',
        message: 'CORS must be properly configured',
        file: 'project',
        recommendation: 'Configure CORS with appropriate origins'
      });
    }
    
    if (this.options.requireRateLimit && !coverage.hasRateLimit) {
      result.errors.push('Rate limiting required but not found');
      result.issues.push({
        type: 'missing-rate-limit',
        severity: 'error',
        message: 'Rate limiting is required to prevent abuse',
        file: 'project',
        recommendation: 'Implement rate limiting on all API endpoints'
      });
    }
    
    if (this.options.requireCSRF && !coverage.hasCSRF) {
      result.warnings.push('CSRF protection recommended but not found');
      result.issues.push({
        type: 'missing-csrf',
        severity: 'warning',
        message: 'CSRF protection is recommended',
        file: 'project',
        recommendation: 'Implement CSRF tokens for state-changing operations'
      });
    }
    
    if (this.options.requireInputValidation && !coverage.hasInputValidation) {
      result.errors.push('Input validation required but not found');
      result.issues.push({
        type: 'missing-input-validation',
        severity: 'error',
        message: 'Input validation is required',
        file: 'project',
        recommendation: 'Use validation libraries like Joi or express-validator'
      });
    }
    
    if (!coverage.hasHTTPS) {
      result.warnings.push('HTTPS enforcement not found');
      result.issues.push({
        type: 'missing-https',
        severity: 'warning',
        message: 'HTTPS should be enforced in production',
        file: 'project',
        recommendation: 'Redirect all HTTP traffic to HTTPS'
      });
    }
  }
}