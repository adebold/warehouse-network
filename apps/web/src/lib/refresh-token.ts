import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from './prisma'

export interface RefreshToken {
  id: string
  userId: string
  token: string
  expiresAt: Date
  createdAt: Date
  lastUsedAt?: Date
  deviceInfo?: string
  ipAddress?: string
  userAgent?: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/**
 * Generate a secure refresh token
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Create a new refresh token for a user
 */
export async function createRefreshToken(
  userId: string,
  request: NextRequest,
  deviceInfo?: string
): Promise<RefreshToken> {
  const token = generateRefreshToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const refreshToken = await prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt,
      deviceInfo: deviceInfo || 'Unknown',
      ipAddress: request.headers.get('x-forwarded-for') || request.ip || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    },
  })

  return refreshToken
}

/**
 * Verify and consume a refresh token
 */
export async function verifyRefreshToken(
  token: string,
  request: NextRequest
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  try {
    const refreshToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!refreshToken) {
      return { valid: false, error: 'Invalid refresh token' }
    }

    if (refreshToken.expiresAt < new Date()) {
      // Clean up expired token
      await prisma.refreshToken.delete({
        where: { id: refreshToken.id },
      })
      return { valid: false, error: 'Refresh token expired' }
    }

    // Check for suspicious activity (IP or user agent changes)
    const currentIP = request.headers.get('x-forwarded-for') || request.ip
    const currentUserAgent = request.headers.get('user-agent')

    if (refreshToken.ipAddress !== currentIP) {
      // Log suspicious activity but don't necessarily reject
      console.warn('Refresh token used from different IP:', {
        userId: refreshToken.userId,
        originalIP: refreshToken.ipAddress,
        currentIP,
      })
    }

    // Update last used timestamp
    await prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { lastUsedAt: new Date() },
    })

    return { valid: true, userId: refreshToken.userId }
  } catch (error) {
    console.error('Refresh token verification error:', error)
    return { valid: false, error: 'Token verification failed' }
  }
}

/**
 * Rotate refresh token (create new one and invalidate old)
 */
export async function rotateRefreshToken(
  oldToken: string,
  request: NextRequest
): Promise<{ success: boolean; newToken?: RefreshToken; error?: string }> {
  try {
    const verification = await verifyRefreshToken(oldToken, request)

    if (!verification.valid || !verification.userId) {
      return { success: false, error: verification.error }
    }

    // Delete the old token
    await prisma.refreshToken.delete({
      where: { token: oldToken },
    })

    // Create a new token
    const newToken = await createRefreshToken(verification.userId, request)

    return { success: true, newToken }
  } catch (error) {
    console.error('Token rotation error:', error)
    return { success: false, error: 'Token rotation failed' }
  }
}

/**
 * Revoke all refresh tokens for a user (useful for logout all devices)
 */
export async function revokeAllRefreshTokens(userId: string): Promise<number> {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: { userId },
    })

    return result.count
  } catch (error) {
    console.error('Error revoking refresh tokens:', error)
    return 0
  }
}

/**
 * Revoke specific refresh token
 */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  try {
    await prisma.refreshToken.delete({
      where: { token },
    })

    return true
  } catch (error) {
    console.error('Error revoking refresh token:', error)
    return false
  }
}

/**
 * Clean up expired refresh tokens (run as scheduled job)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })

    console.log(`Cleaned up ${result.count} expired refresh tokens`)
    return result.count
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error)
    return 0
  }
}

/**
 * Get active refresh tokens for a user
 */
export async function getUserRefreshTokens(userId: string): Promise<RefreshToken[]> {
  try {
    const tokens = await prisma.refreshToken.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return tokens
  } catch (error) {
    console.error('Error fetching user refresh tokens:', error)
    return []
  }
}

/**
 * Detect suspicious token usage patterns
 */
export async function detectSuspiciousTokenUsage(
  userId: string
): Promise<{ suspicious: boolean; reasons: string[] }> {
  const reasons: string[] = []

  try {
    const recentTokens = await prisma.refreshToken.findMany({
      where: {
        userId,
        createdAt: {
          gt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    })

    // Check for too many tokens from different IPs
    const uniqueIPs = new Set(recentTokens.map(t => t.ipAddress))
    if (uniqueIPs.size > 5) {
      reasons.push(`Too many different IP addresses (${uniqueIPs.size})`)
    }

    // Check for too many tokens in general
    if (recentTokens.length > 10) {
      reasons.push(`Too many refresh tokens created (${recentTokens.length})`)
    }

    // Check for rapid token creation
    const tokensLastHour = recentTokens.filter(
      t => t.createdAt > new Date(Date.now() - 60 * 60 * 1000)
    )
    if (tokensLastHour.length > 3) {
      reasons.push(`Rapid token creation (${tokensLastHour.length} in last hour)`)
    }

    return {
      suspicious: reasons.length > 0,
      reasons,
    }
  } catch (error) {
    console.error('Error detecting suspicious token usage:', error)
    return { suspicious: false, reasons: [] }
  }
}

/**
 * Set secure refresh token cookie
 */
export function setRefreshTokenCookie(
  response: NextResponse,
  token: string,
  maxAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): NextResponse {
  response.cookies.set('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: Math.floor(maxAge / 1000),
    path: '/',
  })

  return response
}

/**
 * Clear refresh token cookie
 */
export function clearRefreshTokenCookie(response: NextResponse): NextResponse {
  response.cookies.delete('refresh_token')
  return response
}

/**
 * Get refresh token from cookie
 */
export function getRefreshTokenFromCookie(request: NextRequest): string | null {
  return request.cookies.get('refresh_token')?.value || null
}

/**
 * Middleware helper to handle automatic token refresh
 */
export async function handleTokenRefresh(
  request: NextRequest
): Promise<{ shouldRefresh: boolean; newTokens?: TokenPair; error?: string }> {
  const refreshToken = getRefreshTokenFromCookie(request)

  if (!refreshToken) {
    return { shouldRefresh: false }
  }

  const verification = await verifyRefreshToken(refreshToken, request)

  if (!verification.valid || !verification.userId) {
    return { shouldRefresh: false, error: verification.error }
  }

  // Check if user session is close to expiring (within 5 minutes)
  const authCookie = request.cookies.get('next-auth.session-token')?.value ||
                     request.cookies.get('__Secure-next-auth.session-token')?.value

  if (!authCookie) {
    return { shouldRefresh: true }
  }

  // In a real implementation, you'd decode the JWT to check expiration
  // For now, we'll assume refresh is needed based on cookie presence
  return { shouldRefresh: true }
}