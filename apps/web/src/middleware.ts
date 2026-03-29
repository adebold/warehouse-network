import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import {
  rateLimit,
  getClientIdentifier,
  getRateLimitConfig,
  detectSuspiciousActivity,
  recordViolation
} from '@/lib/rate-limit'
import { csrfProtectionMiddleware, createCSRFResponse } from '@/lib/csrf'
import { applyCSPHeaders } from '@/lib/csp'
import {
  logSecurityEvent,
  analyzeRequest,
  securityMonitor,
  anomalyDetector
} from '@/lib/security-monitoring'

// Define route protection patterns
const protectedRoutes = [
  '/dashboard',
  '/admin',
  '/organizations',
  '/warehouses',
  '/users',
  '/settings',
  '/api/protected'
]

const publicRoutes = [
  '/',
  '/auth',
  '/api/auth',
  '/api/public'
]

const superAdminRoutes = [
  '/admin/super',
  '/admin/organizations',
  '/admin/system',
  '/api/admin/super'
]

const organizationRoutes = [
  '/organizations',
  '/warehouses',
  '/users',
  '/settings'
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const clientId = getClientIdentifier(request)

  // Check if IP is blocked
  const isBlocked = await checkBlockedIP(request)
  if (isBlocked) {
    return new NextResponse('Access Denied', { status: 403 })
  }

  // Analyze request for threats
  const threatAnalysis = analyzeRequest(request)
  if (threatAnalysis.threatScore > 0.7) {
    await logSecurityEvent(
      'suspicious_activity',
      'high',
      request,
      {
        threatScore: threatAnalysis.threatScore,
        indicators: threatAnalysis.indicators
      }
    )
    return new NextResponse('Suspicious Request Detected', { status: 403 })
  }

  // Apply rate limiting
  const rateLimitConfig = getRateLimitConfig(pathname)
  const rateLimitResult = await rateLimit(clientId, rateLimitConfig)

  if (!rateLimitResult.success) {
    // Check for suspicious activity patterns
    const isSuspicious = await detectSuspiciousActivity(clientId, rateLimitConfig)
    if (isSuspicious) {
      await recordViolation(clientId)
      await logSecurityEvent(
        'rate_limit_exceeded',
        'medium',
        request,
        { suspiciousActivity: true, attempts: rateLimitConfig.maxRequests }
      )
    }

    const response = new NextResponse('Rate limit exceeded', { status: 429 })
    response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString())
    response.headers.set('X-RateLimit-Remaining', '0')
    response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString())
    response.headers.set('Retry-After', '60')

    return response
  }

  // CSRF Protection for state-changing requests
  const csrfError = csrfProtectionMiddleware(request)
  if (csrfError) {
    await logSecurityEvent('csrf_violation', 'medium', request)
    return csrfError
  }

  const session = await auth()

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Redirect unauthenticated users to sign-in
  if (!session?.user) {
    // Log authentication failure for monitoring
    await logSecurityEvent(
      'authentication_failure',
      'low',
      request,
      { reason: 'no_session', path: pathname }
    )

    const signInUrl = new URL('/auth/signin', request.url)
    signInUrl.searchParams.set('callbackUrl', request.url)
    return NextResponse.redirect(signInUrl)
  }

  // Check for user-specific anomalies
  const anomalies = await anomalyDetector.detectAccessAnomalies(session.user.id)
  if (anomalies.length > 0) {
    await logSecurityEvent(
      'data_access_anomaly',
      'medium',
      request,
      { anomalies, userId: session.user.id }
    )
  }

  // Handle super admin routes
  if (superAdminRoutes.some(route => pathname.startsWith(route))) {
    const isSuperAdmin = session.user.roles?.some(role =>
      role.slug === 'super-admin' || role.slug === 'platform-admin'
    )

    if (!isSuperAdmin) {
      await logSecurityEvent(
        'privilege_escalation_attempt',
        'high',
        request,
        { attemptedRoute: pathname, userId: session.user.id }
      )
      return NextResponse.redirect(new URL('/auth/unauthorized', request.url))
    }

    // Check if 2FA is required for super admin
    const requires2FA = await check2FARequirement(session.user.id)
    if (requires2FA && !session.user.twoFactorVerified) {
      return NextResponse.redirect(new URL('/auth/2fa', request.url))
    }
  }

  // Handle organization-specific routes
  if (organizationRoutes.some(route => pathname.startsWith(route))) {
    if (!session.user.organizationId) {
      return NextResponse.redirect(new URL('/auth/setup-organization', request.url))
    }
  }

  // Multi-tenant subdomain handling
  const host = request.headers.get('host')
  if (host && host !== 'localhost:3000' && host !== 'skidspace.com') {
    const subdomain = host.split('.')[0]

    // Skip if it's a common subdomain
    if (!['www', 'api', 'admin', 'app'].includes(subdomain)) {
      // Find organization by subdomain
      try {
        const organization = await prisma.organization.findUnique({
          where: { domain: subdomain }
        })

        if (organization) {
          // Check if user belongs to this organization
          if (session.user.organizationId !== organization.id) {
            return NextResponse.redirect(new URL('/auth/wrong-organization', request.url))
          }

          // Add organization context to headers
          const response = NextResponse.next()
          response.headers.set('x-organization-id', organization.id)
          response.headers.set('x-organization-slug', organization.slug)
          return response
        } else {
          // Organization not found for subdomain
          return NextResponse.redirect(new URL('/auth/organization-not-found', request.url))
        }
      } catch (error) {
        console.error('Error checking organization subdomain:', error)
        return NextResponse.redirect(new URL('/auth/error', request.url))
      }
    }
  }

  // Create response and apply comprehensive security headers
  let response = NextResponse.next()

  // Apply Content Security Policy and other security headers
  response = applyCSPHeaders(request, response, {
    development: process.env.NODE_ENV === 'development',
    reportUri: process.env.CSP_REPORT_URI,
  })

  // Apply CSRF protection response headers
  response = createCSRFResponse(request, response)

  // Add user context to headers for API routes
  if (pathname.startsWith('/api/')) {
    response.headers.set('x-user-id', session.user.id)
    if (session.user.organizationId) {
      response.headers.set('x-user-organization-id', session.user.organizationId)
    }
  }

  // Set rate limiting headers
  response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString())
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())
  response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString())

  // Log successful authentication if applicable
  if (session?.user) {
    await logSecurityEvent(
      'authentication_success',
      'low',
      request,
      { userId: session.user.id }
    )
  }

  return response
}

// Helper functions
async function checkBlockedIP(request: NextRequest): Promise<boolean> {
  const ip = request.headers.get('x-forwarded-for') || request.ip
  if (!ip) return false

  try {
    const blockedIP = await prisma.blockedIP.findFirst({
      where: {
        ipAddress: ip,
        OR: [
          { permanent: true },
          {
            permanent: false,
            expiresAt: { gt: new Date() }
          }
        ]
      }
    })

    return !!blockedIP
  } catch (error) {
    console.error('Error checking blocked IP:', error)
    return false
  }
}

async function check2FARequirement(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: { role: true }
        }
      }
    })

    if (!user) return false

    // Check if user is super admin
    const isSuperAdmin = user.userRoles.some(
      userRole => userRole.role.slug === 'super-admin'
    )

    // Super admin requires 2FA
    return isSuperAdmin && !user.twoFactorEnabled
  } catch (error) {
    console.error('Error checking 2FA requirement:', error)
    return false
  }
}

export const config = {
  // Match all paths except static files and API auth routes
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}