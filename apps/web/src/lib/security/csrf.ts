/**
 * CSRF Protection Implementation
 * Double Submit Cookie pattern with secure token generation
 */

import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { SecurityConfig } from './config';

export interface CSRFOptions {
  secret: string;
  cookieName: string;
  headerName: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    maxAge: number;
  };
}

export class CSRFProtection {
  private secret: string;
  private options: CSRFOptions;

  constructor(options?: Partial<CSRFOptions>) {
    this.options = {
      ...SecurityConfig.csrf,
      ...options,
    } as CSRFOptions;
    this.secret = this.options.secret;
  }

  /**
   * Generate a secure CSRF token
   */
  generateToken(sessionId: string = ''): string {
    const timestamp = Date.now().toString();
    const random = randomBytes(16).toString('hex');
    const payload = `${sessionId}:${timestamp}:${random}`;

    // Create HMAC signature
    const hmac = createHmac('sha256', this.secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');

    // Combine payload and signature
    const token = Buffer.from(`${payload}:${signature}`).toString('base64url');
    return token;
  }

  /**
   * Verify CSRF token
   */
  verifyToken(token: string, sessionId: string = ''): boolean {
    try {
      if (!token) return false;

      // Decode token
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const parts = decoded.split(':');

      if (parts.length !== 4) return false;

      const [tokenSessionId, timestamp, random, signature] = parts;

      // Check session ID match
      if (sessionId && tokenSessionId !== sessionId) return false;

      // Check token age (max 24 hours)
      const tokenTime = parseInt(timestamp);
      const maxAge = this.options.cookieOptions.maxAge;

      if (Date.now() - tokenTime > maxAge) return false;

      // Verify signature
      const payload = `${tokenSessionId}:${timestamp}:${random}`;
      const hmac = createHmac('sha256', this.secret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex');

      // Use timing-safe comparison
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      return signatureBuffer.length === expectedBuffer.length &&
             timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      console.error('CSRF token verification error:', error);
      return false;
    }
  }

  /**
   * Extract CSRF token from request headers
   */
  extractTokenFromHeaders(headers: Record<string, string | string[]>): string | null {
    const headerValue = headers[this.options.headerName.toLowerCase()];
    return Array.isArray(headerValue) ? headerValue[0] : headerValue || null;
  }

  /**
   * Extract CSRF token from cookies
   */
  extractTokenFromCookies(cookies: Record<string, string>): string | null {
    return cookies[this.options.cookieName] || null;
  }

  /**
   * Create CSRF cookie value
   */
  createCookieValue(token: string): string {
    const cookieOptions = this.options.cookieOptions;
    const attributes: string[] = [];

    if (cookieOptions.httpOnly) attributes.push('HttpOnly');
    if (cookieOptions.secure) attributes.push('Secure');
    if (cookieOptions.sameSite) attributes.push(`SameSite=${cookieOptions.sameSite}`);
    if (cookieOptions.maxAge) attributes.push(`Max-Age=${Math.floor(cookieOptions.maxAge / 1000)}`);

    return `${this.options.cookieName}=${token}; ${attributes.join('; ')}; Path=/`;
  }

  /**
   * Validate request for CSRF protection
   */
  validateRequest(
    method: string,
    headers: Record<string, string | string[]>,
    cookies: Record<string, string>,
    sessionId?: string
  ): { valid: boolean; error?: string } {
    // Safe methods don't need CSRF protection
    if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method.toUpperCase())) {
      return { valid: true };
    }

    // Extract tokens
    const headerToken = this.extractTokenFromHeaders(headers);
    const cookieToken = this.extractTokenFromCookies(cookies);

    if (!headerToken || !cookieToken) {
      return {
        valid: false,
        error: 'CSRF token missing from request',
      };
    }

    // Double submit cookie validation
    if (headerToken !== cookieToken) {
      return {
        valid: false,
        error: 'CSRF token mismatch between header and cookie',
      };
    }

    // Verify token integrity
    if (!this.verifyToken(headerToken, sessionId)) {
      return {
        valid: false,
        error: 'Invalid CSRF token',
      };
    }

    return { valid: true };
  }
}

// Create singleton instance
export const csrfProtection = new CSRFProtection();

/**
 * Next.js middleware for CSRF protection
 */
export function createCSRFMiddleware() {
  return async (req: any, res: any, next?: any) => {
    const method = req.method;
    const headers = req.headers;
    const cookies = req.cookies || {};
    const sessionId = req.session?.user?.id;

    // Skip CSRF for API auth routes
    if (req.url?.startsWith('/api/auth/')) {
      return next ? next() : { valid: true };
    }

    const validation = csrfProtection.validateRequest(method, headers, cookies, sessionId);

    if (!validation.valid) {
      if (res) {
        return res.status(403).json({
          error: 'Forbidden',
          message: validation.error,
        });
      }
      return validation;
    }

    // Generate new token for safe methods
    if (['GET', 'HEAD'].includes(method.toUpperCase())) {
      const newToken = csrfProtection.generateToken(sessionId);

      if (res) {
        // Set CSRF token in cookie
        res.setHeader('Set-Cookie', csrfProtection.createCookieValue(newToken));

        // Also send token in response header for client-side access
        res.setHeader('X-CSRF-Token', newToken);
      }
    }

    return next ? next() : { valid: true, token: csrfProtection.generateToken(sessionId) };
  };
}

/**
 * Utility to get CSRF token for client-side use
 */
export function getCSRFToken(sessionId?: string): string {
  return csrfProtection.generateToken(sessionId);
}