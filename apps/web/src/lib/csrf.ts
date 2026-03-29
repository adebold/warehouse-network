import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export interface CSRFConfig {
  cookieName: string
  headerName: string
  tokenLength: number
  sameSite: 'strict' | 'lax' | 'none'
  secure: boolean
  httpOnly: boolean
}

const defaultConfig: CSRFConfig = {
  cookieName: '_csrf_token',
  headerName: 'x-csrf-token',
  tokenLength: 32,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: false, // Must be false so client can read it
}

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(length: number = defaultConfig.tokenLength): string {
  return crypto.randomBytes(length).toString('hex')
}

/**
 * Verify CSRF token from request
 */
export function verifyCSRFToken(
  request: NextRequest,
  config: CSRFConfig = defaultConfig
): boolean {
  const cookieToken = request.cookies.get(config.cookieName)?.value
  const headerToken = request.headers.get(config.headerName)

  if (!cookieToken || !headerToken) {
    return false
  }

  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(cookieToken, 'hex'),
    Buffer.from(headerToken, 'hex')
  )
}

/**
 * Set CSRF token in response cookies
 */
export function setCSRFToken(
  response: NextResponse,
  token?: string,
  config: CSRFConfig = defaultConfig
): NextResponse {
  const csrfToken = token || generateCSRFToken(config.tokenLength)

  response.cookies.set(config.cookieName, csrfToken, {
    httpOnly: config.httpOnly,
    secure: config.secure,
    sameSite: config.sameSite,
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })

  // Also set in header for easy client access
  response.headers.set('x-csrf-token', csrfToken)

  return response
}

/**
 * Check if request needs CSRF protection
 */
export function requiresCSRFProtection(request: NextRequest): boolean {
  const { method, pathname } = request

  // Only protect state-changing methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return false
  }

  // Skip auth endpoints (they use their own protection)
  if (pathname.startsWith('/api/auth/')) {
    return false
  }

  // Skip public endpoints
  if (pathname.startsWith('/api/public/')) {
    return false
  }

  // Skip webhook endpoints
  if (pathname.includes('/webhook')) {
    return false
  }

  return true
}

/**
 * Enhanced CSRF protection with double-submit cookie pattern
 */
export function enhancedCSRFProtection(request: NextRequest): {
  valid: boolean
  reason?: string
} {
  if (!requiresCSRFProtection(request)) {
    return { valid: true }
  }

  const cookieToken = request.cookies.get(defaultConfig.cookieName)?.value
  const headerToken = request.headers.get(defaultConfig.headerName)

  if (!cookieToken) {
    return { valid: false, reason: 'CSRF cookie missing' }
  }

  if (!headerToken) {
    return { valid: false, reason: 'CSRF header missing' }
  }

  if (cookieToken.length !== defaultConfig.tokenLength * 2) {
    return { valid: false, reason: 'Invalid CSRF cookie format' }
  }

  if (headerToken.length !== defaultConfig.tokenLength * 2) {
    return { valid: false, reason: 'Invalid CSRF header format' }
  }

  try {
    // Use constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(cookieToken, 'hex'),
      Buffer.from(headerToken, 'hex')
    )

    if (!isValid) {
      return { valid: false, reason: 'CSRF token mismatch' }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, reason: 'CSRF token validation error' }
  }
}

/**
 * Create CSRF-protected response
 */
export function createCSRFResponse(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  // Always set a fresh CSRF token for the next request
  const freshToken = generateCSRFToken()
  return setCSRFToken(response, freshToken)
}

/**
 * Middleware function for CSRF protection
 */
export function csrfProtectionMiddleware(request: NextRequest): NextResponse | null {
  const protection = enhancedCSRFProtection(request)

  if (!protection.valid) {
    console.warn(`CSRF protection failed: ${protection.reason}`, {
      method: request.method,
      pathname: request.nextUrl.pathname,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.ip,
    })

    return new NextResponse(
      JSON.stringify({
        error: 'CSRF protection failed',
        reason: protection.reason,
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }

  return null // Continue processing
}

/**
 * Generate CSRF token for API responses
 */
export function getCSRFTokenForAPI(): string {
  return generateCSRFToken()
}

/**
 * Validate origin header for additional CSRF protection
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host = request.headers.get('host')

  if (!origin && !referer) {
    return false
  }

  const allowedOrigins = [
    process.env.NEXTAUTH_URL,
    `https://${host}`,
    `http://${host}`, // Allow for development
  ].filter(Boolean)

  if (origin) {
    return allowedOrigins.some(allowed => origin === allowed)
  }

  if (referer) {
    const refererOrigin = new URL(referer).origin
    return allowedOrigins.some(allowed => refererOrigin === allowed)
  }

  return false
}