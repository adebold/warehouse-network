import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export interface CSPConfig {
  nonce?: string
  development?: boolean
  reportUri?: string
  reportOnly?: boolean
}

/**
 * Generate a cryptographically secure nonce for inline scripts/styles
 */
export function generateCSPNonce(): string {
  return crypto.randomBytes(16).toString('base64')
}

/**
 * Build Content Security Policy header value
 */
export function buildCSPHeader(config: CSPConfig = {}): string {
  const { nonce, development = false, reportUri, reportOnly = false } = config

  // Base directives for production
  const directives = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      nonce ? `'nonce-${nonce}'` : null,
      "'strict-dynamic'",
      development ? "'unsafe-eval'" : null,
      // Allow trusted external scripts
      'https://accounts.google.com',
      'https://www.gstatic.com',
      'https://cdn.jsdelivr.net',
    ].filter(Boolean),
    'style-src': [
      "'self'",
      nonce ? `'nonce-${nonce}'` : null,
      "'unsafe-inline'", // Required for styled-components and CSS-in-JS
      'https://fonts.googleapis.com',
    ].filter(Boolean),
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https:',
      // Allow images from OAuth providers
      'https://lh3.googleusercontent.com',
      'https://avatars.githubusercontent.com',
    ],
    'font-src': [
      "'self'",
      'https://fonts.gstatic.com',
      'data:',
    ],
    'connect-src': [
      "'self'",
      'https://api.github.com',
      'https://accounts.google.com',
      development ? 'ws://localhost:*' : null,
      development ? 'http://localhost:*' : null,
    ].filter(Boolean),
    'frame-src': [
      "'self'",
      'https://accounts.google.com',
    ],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': development ? null : [],
  }

  // Add report URI if provided
  if (reportUri) {
    directives['report-uri'] = [reportUri]
    directives['report-to'] = ['csp-endpoint']
  }

  // Build the CSP string
  const cspString = Object.entries(directives)
    .filter(([_, values]) => values !== null && values.length > 0)
    .map(([directive, values]) => {
      if (values.length === 0) {
        return directive
      }
      return `${directive} ${values.join(' ')}`
    })
    .join('; ')

  return cspString
}

/**
 * Apply CSP headers to response
 */
export function applyCSPHeaders(
  request: NextRequest,
  response: NextResponse,
  config: CSPConfig = {}
): NextResponse {
  const nonce = generateCSPNonce()
  const cspConfig = {
    ...config,
    nonce,
    development: process.env.NODE_ENV === 'development',
    reportUri: process.env.CSP_REPORT_URI,
  }

  const cspHeader = buildCSPHeader(cspConfig)
  const headerName = cspConfig.reportOnly
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy'

  response.headers.set(headerName, cspHeader)

  // Set nonce in a custom header for the app to use
  response.headers.set('X-CSP-Nonce', nonce)

  // Additional security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '0') // Disabled as CSP is more effective
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  )

  // HSTS for HTTPS
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  return response
}

/**
 * Get nonce for inline scripts/styles in React components
 */
export function getCSPNonce(request: NextRequest): string | undefined {
  // In a real implementation, you'd need to store and retrieve the nonce
  // This is a simplified version
  return request.headers.get('x-csp-nonce') || undefined
}

/**
 * CSP violation report handler
 */
export interface CSPViolationReport {
  'document-uri': string
  referrer: string
  'violated-directive': string
  'effective-directive': string
  'original-policy': string
  disposition: string
  'blocked-uri': string
  'line-number': number
  'column-number': number
  'source-file': string
  'status-code': number
  'script-sample': string
}

export function handleCSPViolation(
  report: CSPViolationReport,
  request: NextRequest
): void {
  // Log CSP violations for analysis
  console.warn('CSP Violation:', {
    violatedDirective: report['violated-directive'],
    blockedUri: report['blocked-uri'],
    documentUri: report['document-uri'],
    sourceFile: report['source-file'],
    lineNumber: report['line-number'],
    userAgent: request.headers.get('user-agent'),
    timestamp: new Date().toISOString(),
  })

  // In production, you might want to send this to a monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Send to monitoring service
    // await sendToMonitoring(report, request)
  }
}

/**
 * Strict CSP for high-security pages (admin, auth)
 */
export function getStrictCSPConfig(nonce?: string): CSPConfig {
  return {
    nonce,
    development: false,
    reportUri: process.env.CSP_REPORT_URI,
    reportOnly: false,
  }
}

/**
 * CSP directive builder for dynamic content
 */
export class CSPBuilder {
  private directives: Record<string, Set<string>> = {}

  constructor(baseConfig: Record<string, string[]> = {}) {
    Object.entries(baseConfig).forEach(([directive, sources]) => {
      this.directives[directive] = new Set(sources)
    })
  }

  addSource(directive: string, source: string): this {
    if (!this.directives[directive]) {
      this.directives[directive] = new Set()
    }
    this.directives[directive].add(source)
    return this
  }

  removeSource(directive: string, source: string): this {
    if (this.directives[directive]) {
      this.directives[directive].delete(source)
    }
    return this
  }

  build(): string {
    return Object.entries(this.directives)
      .filter(([_, sources]) => sources.size > 0)
      .map(([directive, sources]) => `${directive} ${Array.from(sources).join(' ')}`)
      .join('; ')
  }
}

/**
 * Check if CSP is properly configured
 */
export function validateCSPConfiguration(): {
  valid: boolean
  issues: string[]
} {
  const issues: string[] = []

  if (!process.env.CSP_REPORT_URI) {
    issues.push('CSP_REPORT_URI environment variable not set')
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.NEXTAUTH_URL?.startsWith('https://')) {
      issues.push('NEXTAUTH_URL should use HTTPS in production')
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}