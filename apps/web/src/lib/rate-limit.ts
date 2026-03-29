import { NextRequest } from 'next/server'
import Redis from 'ioredis'

// Redis client singleton
let redis: Redis | null = null

function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    })
  }
  return redis
}

export interface RateLimitConfig {
  windowSize: number // in seconds
  maxRequests: number
  keyPrefix?: string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetTime: number
  error?: string
}

/**
 * Sliding window rate limiter using Redis
 */
export async function rateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const redis = getRedisClient()
    const key = `${config.keyPrefix || 'rate_limit'}:${identifier}`
    const now = Date.now()
    const window = config.windowSize * 1000 // convert to milliseconds
    const windowStart = now - window

    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline()

    // Remove expired entries
    pipeline.zremrangebyscore(key, '-inf', windowStart)

    // Count current requests in window
    pipeline.zcard(key)

    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`)

    // Set expiration
    pipeline.expire(key, config.windowSize + 1)

    const results = await pipeline.exec()

    if (!results) {
      throw new Error('Redis pipeline failed')
    }

    const currentCount = (results[1][1] as number) + 1 // +1 for the request we just added

    const isAllowed = currentCount <= config.maxRequests
    const remaining = Math.max(0, config.maxRequests - currentCount)
    const resetTime = Math.ceil((now + window) / 1000)

    if (!isAllowed) {
      // Remove the request we just added since it's rejected
      await redis.zpopmax(key)
    }

    return {
      success: isAllowed,
      limit: config.maxRequests,
      remaining,
      resetTime,
    }
  } catch (error) {
    console.error('Rate limit error:', error)
    return {
      success: true, // Fail open for availability
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetTime: Math.ceil((Date.now() + config.windowSize * 1000) / 1000),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get client identifier for rate limiting
 */
export function getClientIdentifier(request: NextRequest): string {
  // Try to get user ID from session if available
  const userId = request.headers.get('x-user-id')
  if (userId) {
    return `user:${userId}`
  }

  // Fallback to IP address
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return `ip:${ip}`
}

/**
 * Progressive rate limiting based on endpoint sensitivity
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig {
  // Authentication endpoints - very strict
  if (pathname.includes('/api/auth/')) {
    return {
      windowSize: 60, // 1 minute
      maxRequests: 5,
      keyPrefix: 'auth_rate_limit'
    }
  }

  // Admin endpoints - strict
  if (pathname.includes('/api/admin/')) {
    return {
      windowSize: 60, // 1 minute
      maxRequests: 10,
      keyPrefix: 'admin_rate_limit'
    }
  }

  // API endpoints - moderate
  if (pathname.startsWith('/api/')) {
    return {
      windowSize: 60, // 1 minute
      maxRequests: 60,
      keyPrefix: 'api_rate_limit'
    }
  }

  // General endpoints - lenient
  return {
    windowSize: 60, // 1 minute
    maxRequests: 100,
    keyPrefix: 'general_rate_limit'
  }
}

/**
 * Check for suspicious patterns that might indicate an attack
 */
export async function detectSuspiciousActivity(
  identifier: string,
  config: RateLimitConfig
): Promise<boolean> {
  try {
    const redis = getRedisClient()
    const key = `${config.keyPrefix || 'rate_limit'}:${identifier}`
    const now = Date.now()
    const window = config.windowSize * 1000

    // Check for burst patterns (many requests in short time)
    const burstWindow = 10000 // 10 seconds
    const burstStart = now - burstWindow
    const burstCount = await redis.zcount(key, burstStart, now)

    // Consider it suspicious if more than 50% of rate limit in burst window
    if (burstCount > config.maxRequests * 0.5) {
      return true
    }

    // Check for consistent high-frequency requests
    const recentActivity = await redis.zrangebyscore(
      key,
      now - window,
      now,
      'WITHSCORES'
    )

    if (recentActivity.length >= config.maxRequests * 0.8) {
      // Check if requests are evenly distributed (bot-like behavior)
      const scores = recentActivity
        .filter((_, index) => index % 2 === 1)
        .map(Number)

      if (scores.length >= 5) {
        const intervals = scores.slice(1).map((score, i) => score - scores[i])
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const variance = intervals.reduce((sum, interval) =>
          sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length

        // Low variance indicates regular, bot-like behavior
        if (variance < avgInterval * 0.1) {
          return true
        }
      }
    }

    return false
  } catch (error) {
    console.error('Suspicious activity detection error:', error)
    return false
  }
}

/**
 * Exponential backoff rate limiting for repeated violations
 */
export async function getBackoffMultiplier(identifier: string): Promise<number> {
  try {
    const redis = getRedisClient()
    const violationKey = `violations:${identifier}`
    const violations = await redis.get(violationKey)

    if (!violations) {
      return 1
    }

    const violationCount = parseInt(violations, 10)
    return Math.min(Math.pow(2, violationCount), 32) // Max 32x multiplier
  } catch (error) {
    console.error('Backoff calculation error:', error)
    return 1
  }
}

/**
 * Record rate limit violation
 */
export async function recordViolation(identifier: string): Promise<void> {
  try {
    const redis = getRedisClient()
    const violationKey = `violations:${identifier}`
    await redis.incr(violationKey)
    await redis.expire(violationKey, 3600) // Reset violations after 1 hour
  } catch (error) {
    console.error('Violation recording error:', error)
  }
}