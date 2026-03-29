/**
 * Content Security Policy (CSP) Implementation
 * Configures and manages CSP headers for the application
 */

import { SecurityConfig } from './config';

export interface CSPConfig {
  nonce?: string;
  reportOnly?: boolean;
  reportUri?: string;
}

export class CSPManager {
  private config: typeof SecurityConfig.csp;

  constructor() {
    this.config = SecurityConfig.csp;
  }

  /**
   * Generate CSP header string with dynamic nonce
   */
  generateCSPHeader(options: CSPConfig = {}): string {
    const { nonce, reportOnly = false } = options;
    const directives = { ...this.config.directives };

    // Replace nonce placeholder
    if (nonce) {
      if (directives.scriptSrc) {
        directives.scriptSrc = directives.scriptSrc.map(src =>
          src.replace('{NONCE}', nonce)
        );
      }

      if (directives.styleSrc) {
        directives.styleSrc = directives.styleSrc.map(src =>
          src.replace('{NONCE}', nonce)
        );
      }
    }

    // Environment-specific adjustments
    if (process.env.NODE_ENV === 'development') {
      // Allow unsafe-inline and unsafe-eval for development
      if (directives.scriptSrc && !directives.scriptSrc.includes("'unsafe-inline'")) {
        directives.scriptSrc.push("'unsafe-inline'");
      }
      if (directives.scriptSrc && !directives.scriptSrc.includes("'unsafe-eval'")) {
        directives.scriptSrc.push("'unsafe-eval'");
      }
    } else {
      // Production: Remove unsafe directives
      if (directives.scriptSrc) {
        directives.scriptSrc = directives.scriptSrc.filter(src =>
          !src.includes('unsafe-inline') && !src.includes('unsafe-eval')
        );
      }
    }

    // Add report-uri if specified
    if (options.reportUri) {
      directives.reportUri = [options.reportUri];
    }

    // Convert directives object to CSP string
    const cspString = Object.entries(directives)
      .filter(([_, value]) => value !== false && value !== undefined)
      .map(([key, value]) => {
        if (key === 'upgradeInsecureRequests') {
          return value ? 'upgrade-insecure-requests' : '';
        }

        const directive = key.replace(/([A-Z])/g, '-$1').toLowerCase();

        if (Array.isArray(value)) {
          return `${directive} ${value.join(' ')}`;
        } else {
          return `${directive} ${value}`;
        }
      })
      .filter(Boolean)
      .join('; ');

    return cspString;
  }

  /**
   * Get CSP header name based on report-only mode
   */
  getCSPHeaderName(reportOnly = false): string {
    return reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
  }

  /**
   * Validate CSP configuration
   */
  validateConfig(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for unsafe directives in production
    if (process.env.NODE_ENV === 'production') {
      if (this.config.directives.scriptSrc?.includes("'unsafe-inline'")) {
        issues.push('unsafe-inline detected in script-src for production');
      }

      if (this.config.directives.scriptSrc?.includes("'unsafe-eval'")) {
        issues.push('unsafe-eval detected in script-src for production');
      }

      if (!this.config.directives.upgradeInsecureRequests) {
        issues.push('upgrade-insecure-requests should be enabled in production');
      }
    }

    // Check for missing essential directives
    if (!this.config.directives.defaultSrc) {
      issues.push('default-src directive is missing');
    }

    if (!this.config.directives.scriptSrc) {
      issues.push('script-src directive is missing');
    }

    if (!this.config.directives.objectSrc?.includes("'none'")) {
      issues.push('object-src should be set to none for security');
    }

    if (!this.config.directives.baseUri?.includes("'self'")) {
      issues.push('base-uri should be restricted to self');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Generate nonce for inline scripts/styles
   */
  generateNonce(): string {
    if (typeof crypto !== 'undefined' && crypto.randomBytes) {
      return crypto.randomBytes(16).toString('base64');
    } else {
      // Fallback for environments without crypto
      const array = new Uint8Array(16);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(array);
      } else {
        // Last resort fallback
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
      }
      return btoa(String.fromCharCode(...array));
    }
  }

  /**
   * Create CSP middleware for Next.js
   */
  createMiddleware(options: Partial<CSPConfig> = {}) {
    return (req: any, res: any, next: any) => {
      const nonce = this.generateNonce();
      const cspHeader = this.generateCSPHeader({ nonce, ...options });
      const headerName = this.getCSPHeaderName(options.reportOnly);

      res.setHeader(headerName, cspHeader);
      res.setHeader('X-Content-Security-Policy-Nonce', nonce);

      // Make nonce available in request for server-side rendering
      req.cspNonce = nonce;

      next();
    };
  }

  /**
   * Get nonce for server-side rendering
   */
  getNonceFromRequest(req: any): string | undefined {
    return req.cspNonce || req.headers['x-content-security-policy-nonce'];
  }
}

// Export singleton instance
export const cspManager = new CSPManager();

/**
 * CSP violation report handler
 */
export interface CSPViolationReport {
  'csp-report': {
    'document-uri': string;
    referrer: string;
    'violated-directive': string;
    'effective-directive': string;
    'original-policy': string;
    disposition: string;
    'blocked-uri': string;
    'status-code': number;
    'script-sample': string;
  };
}

/**
 * Handle CSP violation reports
 */
export async function handleCSPViolation(
  report: CSPViolationReport,
  clientIP?: string
): Promise<void> {
  try {
    const violation = report['csp-report'];

    console.warn('CSP Violation Detected:', {
      documentUri: violation['document-uri'],
      violatedDirective: violation['violated-directive'],
      blockedUri: violation['blocked-uri'],
      clientIP,
    });

    // Log to security monitoring system
    const { logSecurityEvent } = await import('./monitoring');

    await logSecurityEvent('csp_violation', 'medium', {
      ipAddress: clientIP,
      details: {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        effectiveDirective: violation['effective-directive'],
        blockedUri: violation['blocked-uri'],
        scriptSample: violation['script-sample'],
        statusCode: violation['status-code'],
      },
    });

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i,
      /data:/i,
      /eval\(/i,
      /Function\(/i,
      /<script/i,
      /on\w+\s*=/i,
    ];

    const isSuspicious = suspiciousPatterns.some(pattern =>
      pattern.test(violation['blocked-uri'] || '') ||
      pattern.test(violation['script-sample'] || '')
    );

    if (isSuspicious) {
      await logSecurityEvent('suspicious_csp_violation', 'high', {
        ipAddress: clientIP,
        details: violation,
      });
    }
  } catch (error) {
    console.error('Failed to handle CSP violation:', error);
  }
}

/**
 * CSP utilities
 */
export const CSPUtils = {
  /**
   * Check if a URL is allowed by CSP directive
   */
  isUrlAllowed(url: string, directive: string[]): boolean {
    if (directive.includes("'self'")) {
      try {
        const urlObj = new URL(url);
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        if (urlObj.origin === currentOrigin) {
          return true;
        }
      } catch {
        // Invalid URL
      }
    }

    if (directive.includes("'none'")) {
      return false;
    }

    // Check if URL matches any allowed patterns
    return directive.some(pattern => {
      if (pattern.startsWith('https://')) {
        return url.startsWith(pattern);
      }
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(url);
      }
      return false;
    });
  },

  /**
   * Sanitize inline script for CSP
   */
  sanitizeInlineScript(script: string): string {
    // Remove potentially dangerous constructs
    return script
      .replace(/eval\s*\(/g, '// eval removed //(')
      .replace(/Function\s*\(/g, '// Function removed //(')
      .replace(/setTimeout\s*\(\s*["']/g, '// setTimeout with string removed //')
      .replace(/setInterval\s*\(\s*["']/g, '// setInterval with string removed //');
  },

  /**
   * Generate script tag with nonce
   */
  createNonceScript(script: string, nonce: string): string {
    return `<script nonce="${nonce}">${script}</script>`;
  },

  /**
   * Generate style tag with nonce
   */
  createNonceStyle(css: string, nonce: string): string {
    return `<style nonce="${nonce}">${css}</style>`;
  },
};