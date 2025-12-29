/**
 * Auth Validator - Validates authentication implementation
 * Ensures proper JWT implementation, secure token handling, and no hardcoded credentials
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { glob } from 'glob';

import { ValidationResult } from '../types';
import { Logger } from '../utils/logger';

export interface AuthValidationOptions {
  requireJWT: boolean;
  requireRefreshTokens: boolean;
  requireSecureStorage: boolean;
  requirePasswordHashing: boolean;
  requireRBAC: boolean;
  minPasswordComplexity: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };
}

export interface AuthValidationResult extends ValidationResult {
  issues: AuthIssue[];
  coverage: {
    hasAuthentication: boolean;
    hasAuthorization: boolean;
    hasJWT: boolean;
    hasRefreshTokens: boolean;
    hasPasswordHashing: boolean;
    hasRBAC: boolean;
    hasSecureStorage: boolean;
  };
}

export interface AuthIssue {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line?: number;
  recommendation: string;
}

export class AuthValidator {
  private logger: Logger;
  private options: AuthValidationOptions;

  constructor(options?: Partial<AuthValidationOptions>) {
    this.logger = new Logger('AuthValidator');
    this.options = {
      requireJWT: true,
      requireRefreshTokens: true,
      requireSecureStorage: true,
      requirePasswordHashing: true,
      requireRBAC: true,
      minPasswordComplexity: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      },
      ...options
    };
  }

  /**
   * Validate authentication implementation
   */
  async validate(target: string): Promise<AuthValidationResult> {
    this.logger.info(`Validating authentication for: ${target}`);
    
    const result: AuthValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      issues: [],
      coverage: {
        hasAuthentication: false,
        hasAuthorization: false,
        hasJWT: false,
        hasRefreshTokens: false,
        hasPasswordHashing: false,
        hasRBAC: false,
        hasSecureStorage: false
      }
    };
    
    try {
      // Find all relevant files
      const files = await this.findAuthFiles(target);
      
      if (files.length === 0) {
        result.valid = false;
        result.errors.push('No authentication files found');
        result.issues.push({
          type: 'missing-auth',
          severity: 'error',
          message: 'No authentication implementation found',
          file: target,
          recommendation: 'Implement authentication using JWT with refresh tokens'
        });
        return result;
      }
      
      // Check each file
      for (const file of files) {
        await this.validateAuthFile(file, result);
      }
      
      // Check coverage requirements
      this.checkCoverageRequirements(result);
      
      // Validate overall implementation
      result.valid = result.errors.length === 0;
      
    } catch (error) {
      this.logger.error('Auth validation failed', error);
      result.valid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Find authentication-related files
   */
  private async findAuthFiles(target: string): Promise<string[]> {
    const patterns = [
      '**/auth/**/*.{js,ts}',
      '**/authentication/**/*.{js,ts}',
      '**/middleware/auth*.{js,ts}',
      '**/middleware/jwt*.{js,ts}',
      '**/services/auth*.{js,ts}',
      '**/controllers/auth*.{js,ts}',
      '**/routes/auth*.{js,ts}',
      '**/config/auth*.{js,ts}',
      '**/security/**/*.{js,ts}'
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
   * Validate a single auth file
   */
  private async validateAuthFile(filePath: string, result: AuthValidationResult) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      
      // Check for JWT usage
      if (this.options.requireJWT) {
        if (content.includes('jsonwebtoken') || content.includes('jwt')) {
          result.coverage.hasJWT = true;
          
          // Check for proper JWT implementation
          if (!content.includes('verify') && !content.includes('decode')) {
            result.issues.push({
              type: 'jwt-no-verification',
              severity: 'error',
              message: 'JWT tokens used but no verification found',
              file: filePath,
              recommendation: 'Always verify JWT tokens before trusting them'
            });
          }
          
          // Check for secret key security
          if (content.match(/secret\s*[:=]\s*['"][^'"]+['"]/)) {
            result.errors.push('Hardcoded JWT secret detected');
            result.issues.push({
              type: 'hardcoded-secret',
              severity: 'error',
              message: 'JWT secret is hardcoded',
              file: filePath,
              recommendation: 'Store secrets in environment variables'
            });
          }
        }
      }
      
      // Check for refresh tokens
      if (this.options.requireRefreshTokens) {
        if (content.includes('refreshToken') || content.includes('refresh_token')) {
          result.coverage.hasRefreshTokens = true;
          
          // Check for secure storage
          if (!content.includes('httpOnly') && (content.includes('cookie') || content.includes('res.cookie'))) {
            result.warnings.push('Refresh tokens may not be stored securely');
            result.issues.push({
              type: 'insecure-token-storage',
              severity: 'warning',
              message: 'Refresh tokens should be stored in httpOnly cookies',
              file: filePath,
              recommendation: 'Use httpOnly cookies for refresh token storage'
            });
          }
        }
      }
      
      // Check for password hashing
      if (content.includes('bcrypt') || content.includes('argon2') || content.includes('scrypt')) {
        result.coverage.hasPasswordHashing = true;
        
        // Check for proper salt rounds
        const saltRounds = content.match(/saltRounds?\s*[:=]\s*(\d+)/);
        if (saltRounds && parseInt(saltRounds[1]) < 10) {
          result.warnings.push('Low salt rounds for password hashing');
          result.issues.push({
            type: 'weak-hashing',
            severity: 'warning',
            message: `Salt rounds too low: ${saltRounds[1]}`,
            file: filePath,
            recommendation: 'Use at least 10 salt rounds for bcrypt'
          });
        }
      }
      
      // Check for plain text passwords
      if (content.match(/password\s*[:=]\s*['"][^'"]+['"]/) && 
          !content.includes('process.env') &&
          !content.includes('config.')) {
        result.errors.push('Hardcoded password detected');
        result.issues.push({
          type: 'hardcoded-password',
          severity: 'error',
          message: 'Plain text password found',
          file: filePath,
          recommendation: 'Never store passwords in code'
        });
      }
      
      // Check for RBAC
      if (content.includes('role') || content.includes('permission') || content.includes('rbac')) {
        result.coverage.hasRBAC = true;
        
        // Check for proper role checking
        if (!content.includes('hasRole') && !content.includes('hasPermission') && !content.includes('authorize')) {
          result.warnings.push('RBAC implementation may be incomplete');
        }
      }
      
      // Check for authentication middleware
      if (content.includes('authenticate') || content.includes('isAuthenticated') || content.includes('requireAuth')) {
        result.coverage.hasAuthentication = true;
      }
      
      // Check for authorization
      if (content.includes('authorize') || content.includes('isAuthorized') || content.includes('checkPermission')) {
        result.coverage.hasAuthorization = true;
      }
      
      // Check for secure storage practices
      if (content.includes('SESSION_SECRET') || content.includes('JWT_SECRET')) {
        if (content.includes('process.env')) {
          result.coverage.hasSecureStorage = true;
        }
      }
      
      // Check for common vulnerabilities
      this.checkAuthVulnerabilities(content, filePath, result);
      
    } catch (error) {
      this.logger.error(`Failed to validate auth file: ${filePath}`, error);
    }
  }

  /**
   * Check for common authentication vulnerabilities
   */
  private checkAuthVulnerabilities(content: string, filePath: string, result: AuthValidationResult) {
    // Check for timing attacks
    if (content.includes('===') && content.includes('password') && !content.includes('bcrypt.compare')) {
      result.warnings.push('Potential timing attack vulnerability');
      result.issues.push({
        type: 'timing-attack',
        severity: 'warning',
        message: 'Direct password comparison may be vulnerable to timing attacks',
        file: filePath,
        recommendation: 'Use bcrypt.compare() or similar constant-time comparison'
      });
    }
    
    // Check for session fixation
    if (content.includes('session') && !content.includes('regenerate')) {
      result.warnings.push('Session fixation vulnerability possible');
      result.issues.push({
        type: 'session-fixation',
        severity: 'warning',
        message: 'Sessions should be regenerated after login',
        file: filePath,
        recommendation: 'Call req.session.regenerate() after successful login'
      });
    }
    
    // Check for CSRF protection
    if ((content.includes('POST') || content.includes('PUT') || content.includes('DELETE')) &&
        !content.includes('csrf') && !content.includes('CSRF')) {
      result.warnings.push('CSRF protection may be missing');
    }
    
    // Check for rate limiting
    if ((content.includes('login') || content.includes('signin')) &&
        !content.includes('rateLimit') && !content.includes('rate-limit')) {
      result.warnings.push('Rate limiting not found on authentication endpoints');
      result.issues.push({
        type: 'no-rate-limiting',
        severity: 'warning',
        message: 'Authentication endpoints should have rate limiting',
        file: filePath,
        recommendation: 'Implement rate limiting to prevent brute force attacks'
      });
    }
    
    // Check for SQL injection in auth queries
    if (content.match(/query\s*\([^)]*\+[^)]*\)/) || 
        content.match(/query\s*\([^)]*\$\{[^}]*\}[^)]*\)/)) {
      result.errors.push('Potential SQL injection in authentication');
      result.issues.push({
        type: 'sql-injection',
        severity: 'error',
        message: 'Unsafe query construction detected',
        file: filePath,
        recommendation: 'Use parameterized queries or an ORM'
      });
    }
  }

  /**
   * Check coverage requirements
   */
  private checkCoverageRequirements(result: AuthValidationResult) {
    const { coverage } = result;
    
    if (this.options.requireJWT && !coverage.hasJWT) {
      result.errors.push('JWT implementation required but not found');
      result.issues.push({
        type: 'missing-jwt',
        severity: 'error',
        message: 'JWT authentication is required',
        file: 'project',
        recommendation: 'Implement JWT-based authentication'
      });
    }
    
    if (this.options.requireRefreshTokens && !coverage.hasRefreshTokens) {
      result.errors.push('Refresh token implementation required but not found');
      result.issues.push({
        type: 'missing-refresh-tokens',
        severity: 'error',
        message: 'Refresh tokens are required',
        file: 'project',
        recommendation: 'Implement refresh token rotation for better security'
      });
    }
    
    if (this.options.requirePasswordHashing && !coverage.hasPasswordHashing) {
      result.errors.push('Password hashing required but not found');
      result.issues.push({
        type: 'missing-password-hashing',
        severity: 'error',
        message: 'Password hashing is required',
        file: 'project',
        recommendation: 'Use bcrypt or argon2 for password hashing'
      });
    }
    
    if (this.options.requireRBAC && !coverage.hasRBAC) {
      result.warnings.push('RBAC implementation recommended but not found');
      result.issues.push({
        type: 'missing-rbac',
        severity: 'warning',
        message: 'Role-based access control is recommended',
        file: 'project',
        recommendation: 'Implement RBAC for fine-grained access control'
      });
    }
    
    if (!coverage.hasAuthentication) {
      result.errors.push('No authentication middleware found');
    }
    
    if (!coverage.hasAuthorization) {
      result.warnings.push('Authorization checks not found');
    }
  }

  /**
   * Generate authentication report
   */
  async generateReport(result: AuthValidationResult): Promise<string> {
    let report = `# Authentication Validation Report\n\n`;
    report += `**Status:** ${result.valid ? '✅ PASSED' : '❌ FAILED'}\n\n`;
    
    report += `## Coverage\n\n`;
    report += `- JWT Implementation: ${result.coverage.hasJWT ? '✅' : '❌'}\n`;
    report += `- Refresh Tokens: ${result.coverage.hasRefreshTokens ? '✅' : '❌'}\n`;
    report += `- Password Hashing: ${result.coverage.hasPasswordHashing ? '✅' : '❌'}\n`;
    report += `- RBAC: ${result.coverage.hasRBAC ? '✅' : '❌'}\n`;
    report += `- Secure Storage: ${result.coverage.hasSecureStorage ? '✅' : '❌'}\n\n`;
    
    if (result.issues.length > 0) {
      report += `## Issues Found\n\n`;
      
      const errors = result.issues.filter(i => i.severity === 'error');
      if (errors.length > 0) {
        report += `### Errors\n\n`;
        errors.forEach(issue => {
          report += `- **${issue.type}**: ${issue.message}\n`;
          report += `  - File: ${issue.file}\n`;
          report += `  - Recommendation: ${issue.recommendation}\n\n`;
        });
      }
      
      const warnings = result.issues.filter(i => i.severity === 'warning');
      if (warnings.length > 0) {
        report += `### Warnings\n\n`;
        warnings.forEach(issue => {
          report += `- **${issue.type}**: ${issue.message}\n`;
          report += `  - File: ${issue.file}\n`;
          report += `  - Recommendation: ${issue.recommendation}\n\n`;
        });
      }
    }
    
    return report;
  }
}