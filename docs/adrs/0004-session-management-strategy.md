# ADR-0004: Session Management Strategy for Skidspace Platform

## Status
**Accepted** - Date: 2026-03-23

## Context
The Skidspace platform requires robust session management to support multiple user types across different tenants, devices, and access patterns. The system must handle concurrent sessions, tenant isolation, security requirements, and optimal user experience.

## Decision
**Selected: Hybrid Session Strategy with JWT + Database Session Store**

## Rationale

### Requirements Analysis
- **Multi-Device Support**: Users accessing from web, mobile, and API clients
- **Tenant Isolation**: Session data must be tenant-scoped
- **Security**: Secure token handling with revocation capabilities
- **Performance**: Fast session validation (< 10ms)
- **Scalability**: Support for 10K+ concurrent sessions
- **Mobile Experience**: Offline-capable authentication

### Alternative Strategies Evaluated

#### 1. Pure Database Sessions (Rejected)
```typescript
// Traditional session store approach
interface DatabaseSession {
  id: string
  userId: string
  tenantId: string
  data: Record<string, any>
  expiresAt: Date
}
```

**Pros:**
- Complete server control
- Easy revocation
- Detailed audit trail

**Cons:**
- **Database load**: Every request requires DB query
- **Scalability issues**: Database bottleneck at scale
- **Mobile unfriendly**: Requires online validation

#### 2. Pure JWT Tokens (Rejected)
```typescript
// Stateless JWT approach
interface JWTPayload {
  userId: string
  tenantId: string
  role: string
  exp: number
}
```

**Pros:**
- No database lookup
- Mobile friendly
- Horizontal scaling

**Cons:**
- **Cannot revoke**: Tokens valid until expiration
- **Size limitations**: Limited payload capacity
- **Security concerns**: Token theft impact

#### 3. Hybrid Approach (Selected)
Combines JWT benefits with database session control

## Architecture Design

### 1. Session Token Structure

```typescript
// JWT Access Token (short-lived: 15 minutes)
interface AccessTokenPayload {
  sub: string // User ID
  tenant: string // Tenant ID
  role: string // Primary role
  permissions: string[] // Core permissions
  sessionId: string // Database session reference
  iat: number // Issued at
  exp: number // Expires at (15 minutes)
  jti: string // JWT ID for revocation
}

// Refresh Token (long-lived: 30 days)
interface RefreshTokenPayload {
  sub: string // User ID
  sessionId: string // Database session reference
  iat: number // Issued at
  exp: number // Expires at (30 days)
  jti: string // JWT ID for revocation
}

// Database Session Record
interface SessionRecord {
  id: string // Session ID
  userId: string
  tenantId: string
  refreshTokenJti: string
  accessTokenJti: string
  deviceInfo: {
    userAgent: string
    ipAddress: string
    deviceId?: string
    platform: string
  }
  metadata: {
    loginMethod: 'credentials' | 'oauth' | 'sso'
    lastActivity: Date
    permissions: Record<string, any>
    preferences: Record<string, any>
  }
  status: 'active' | 'revoked' | 'expired'
  createdAt: Date
  expiresAt: Date
  lastAccessedAt: Date
}
```

### 2. Database Schema

```sql
-- Sessions table with tenant isolation
CREATE TABLE platform.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,

    -- Token management
    refresh_token_jti VARCHAR(255) UNIQUE NOT NULL,
    access_token_jti VARCHAR(255),

    -- Device and location tracking
    device_fingerprint VARCHAR(255),
    ip_address INET NOT NULL,
    user_agent TEXT,
    device_info JSONB NOT NULL DEFAULT '{}',

    -- Session metadata
    login_method VARCHAR(50) NOT NULL,
    permissions_cache JSONB NOT NULL DEFAULT '{}',
    user_preferences JSONB NOT NULL DEFAULT '{}',

    -- Session lifecycle
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES platform.users(id),
    revoke_reason VARCHAR(255),

    CONSTRAINT chk_session_status CHECK (status IN ('active', 'revoked', 'expired')),
    CONSTRAINT chk_expires_at CHECK (expires_at > created_at)
);

-- Indexes for performance
CREATE INDEX idx_sessions_user_tenant_active
ON platform.sessions(user_id, tenant_id, status)
WHERE status = 'active';

CREATE INDEX idx_sessions_refresh_token
ON platform.sessions(refresh_token_jti)
WHERE status = 'active';

CREATE INDEX idx_sessions_device_fingerprint
ON platform.sessions(device_fingerprint, ip_address);

CREATE INDEX idx_sessions_last_accessed
ON platform.sessions(last_accessed_at)
WHERE status = 'active';

-- Revoked tokens table for JWT blacklisting
CREATE TABLE platform.revoked_tokens (
    jti VARCHAR(255) PRIMARY KEY,
    token_type VARCHAR(20) NOT NULL, -- 'access' or 'refresh'
    user_id UUID NOT NULL REFERENCES platform.users(id),
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL, -- Original token expiration
    reason VARCHAR(255)
);

-- Cleanup old revoked tokens
CREATE INDEX idx_revoked_tokens_expires_at
ON platform.revoked_tokens(expires_at);

-- Session activity logging
CREATE TABLE platform.session_activities (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES platform.sessions(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- 'login', 'logout', 'token_refresh', 'permission_check'
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Monthly partitions for session activities
CREATE TABLE platform.session_activities_2026_03
PARTITION OF platform.session_activities
FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

### 3. Session Service Implementation

```typescript
// lib/auth/session-service.ts
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { Redis } from 'ioredis'

export class SessionService {
  private redis: Redis
  private accessTokenExpiry = 15 * 60 // 15 minutes
  private refreshTokenExpiry = 30 * 24 * 60 * 60 // 30 days
  private jwtSecret: string
  private jwtRefreshSecret: string

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!)
    this.jwtSecret = process.env.JWT_SECRET!
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET!
  }

  async createSession(
    userId: string,
    tenantId: string,
    deviceInfo: {
      userAgent: string
      ipAddress: string
      deviceId?: string
      platform: string
    },
    loginMethod: string,
    permissions: Record<string, any>
  ): Promise<{
    accessToken: string
    refreshToken: string
    sessionId: string
    expiresAt: Date
  }> {
    const sessionId = crypto.randomUUID()
    const accessTokenJti = crypto.randomUUID()
    const refreshTokenJti = crypto.randomUUID()

    const expiresAt = new Date(Date.now() + this.refreshTokenExpiry * 1000)

    // Create database session record
    const session = await prisma.sessions.create({
      data: {
        id: sessionId,
        userId,
        tenantId,
        refreshTokenJti,
        accessTokenJti,
        deviceFingerprint: this.generateDeviceFingerprint(deviceInfo),
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        deviceInfo,
        loginMethod,
        permissionsCache: permissions,
        userPreferences: {},
        status: 'active',
        expiresAt,
        lastAccessedAt: new Date()
      }
    })

    // Generate JWT tokens
    const accessToken = await this.generateAccessToken(
      userId,
      tenantId,
      sessionId,
      accessTokenJti,
      permissions
    )

    const refreshToken = await this.generateRefreshToken(
      userId,
      sessionId,
      refreshTokenJti
    )

    // Cache session data in Redis
    await this.cacheSessionData(sessionId, {
      userId,
      tenantId,
      permissions,
      deviceInfo,
      expiresAt
    })

    // Log session creation
    await this.logSessionActivity(sessionId, 'login', deviceInfo.ipAddress, deviceInfo.userAgent)

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresAt
    }
  }

  async validateAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as AccessTokenPayload

      // Check if token is blacklisted
      if (await this.isTokenRevoked(payload.jti)) {
        return null
      }

      // Update last accessed time
      await this.updateSessionAccess(payload.sessionId)

      return payload
    } catch (error) {
      return null
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string
    expiresAt: Date
  } | null> {
    try {
      const payload = jwt.verify(refreshToken, this.jwtRefreshSecret) as RefreshTokenPayload

      // Check if refresh token is blacklisted
      if (await this.isTokenRevoked(payload.jti)) {
        return null
      }

      // Get session from database
      const session = await prisma.sessions.findUnique({
        where: {
          id: payload.sessionId,
          refreshTokenJti: payload.jti,
          status: 'active'
        },
        include: {
          user: {
            include: {
              tenantUsers: {
                where: { tenantId: session?.tenantId },
                include: { tenant: true }
              }
            }
          }
        }
      })

      if (!session || session.expiresAt < new Date()) {
        return null
      }

      // Generate new access token
      const newAccessTokenJti = crypto.randomUUID()
      const newAccessToken = await this.generateAccessToken(
        session.userId,
        session.tenantId!,
        session.id,
        newAccessTokenJti,
        session.permissionsCache
      )

      // Update session with new access token JTI
      await prisma.sessions.update({
        where: { id: session.id },
        data: {
          accessTokenJti: newAccessTokenJti,
          lastAccessedAt: new Date()
        }
      })

      // Log token refresh
      await this.logSessionActivity(session.id, 'token_refresh', session.ipAddress)

      return {
        accessToken: newAccessToken,
        expiresAt: new Date(Date.now() + this.accessTokenExpiry * 1000)
      }

    } catch (error) {
      return null
    }
  }

  async revokeSession(
    sessionId: string,
    revokedBy?: string,
    reason?: string
  ): Promise<boolean> {
    try {
      const session = await prisma.sessions.findUnique({
        where: { id: sessionId, status: 'active' }
      })

      if (!session) return false

      // Mark session as revoked
      await prisma.sessions.update({
        where: { id: sessionId },
        data: {
          status: 'revoked',
          revokedAt: new Date(),
          revokedBy,
          revokeReason: reason
        }
      })

      // Blacklist tokens
      await this.revokeTokens(session.refreshTokenJti, session.accessTokenJti)

      // Remove from cache
      await this.clearSessionCache(sessionId)

      // Log session revocation
      await this.logSessionActivity(sessionId, 'logout', session.ipAddress)

      return true
    } catch (error) {
      console.error('Error revoking session:', error)
      return false
    }
  }

  async revokeAllUserSessions(
    userId: string,
    tenantId?: string,
    exceptSessionId?: string
  ): Promise<number> {
    const whereClause = {
      userId,
      status: 'active' as const,
      ...(tenantId && { tenantId }),
      ...(exceptSessionId && { id: { not: exceptSessionId } })
    }

    const sessions = await prisma.sessions.findMany({
      where: whereClause,
      select: {
        id: true,
        refreshTokenJti: true,
        accessTokenJti: true
      }
    })

    if (sessions.length === 0) return 0

    // Mark sessions as revoked
    await prisma.sessions.updateMany({
      where: whereClause,
      data: {
        status: 'revoked',
        revokedAt: new Date(),
        revokeReason: 'All sessions revoked'
      }
    })

    // Blacklist all tokens
    for (const session of sessions) {
      await this.revokeTokens(session.refreshTokenJti, session.accessTokenJti)
      await this.clearSessionCache(session.id)
    }

    return sessions.length
  }

  private async generateAccessToken(
    userId: string,
    tenantId: string,
    sessionId: string,
    jti: string,
    permissions: Record<string, any>
  ): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: userId,
      tenant: tenantId,
      role: permissions.role || 'user',
      permissions: this.extractCorePermissions(permissions),
      sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.accessTokenExpiry,
      jti
    }

    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
      issuer: 'skidspace.com',
      audience: 'skidspace-api'
    })
  }

  private async generateRefreshToken(
    userId: string,
    sessionId: string,
    jti: string
  ): Promise<string> {
    const payload: RefreshTokenPayload = {
      sub: userId,
      sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.refreshTokenExpiry,
      jti
    }

    return jwt.sign(payload, this.jwtRefreshSecret, {
      algorithm: 'HS256',
      issuer: 'skidspace.com',
      audience: 'skidspace-refresh'
    })
  }

  private generateDeviceFingerprint(deviceInfo: {
    userAgent: string
    ipAddress: string
    deviceId?: string
  }): string {
    return crypto
      .createHash('sha256')
      .update(`${deviceInfo.userAgent}:${deviceInfo.ipAddress}:${deviceInfo.deviceId || ''}`)
      .digest('hex')
  }

  private extractCorePermissions(permissions: Record<string, any>): string[] {
    // Extract most commonly used permissions for JWT payload
    const corePerms: string[] = []

    if (permissions.warehouses?.includes('read')) corePerms.push('warehouses:read')
    if (permissions.warehouses?.includes('write')) corePerms.push('warehouses:write')
    if (permissions.inventory?.includes('read')) corePerms.push('inventory:read')
    if (permissions.inventory?.includes('write')) corePerms.push('inventory:write')
    if (permissions.orders?.includes('read')) corePerms.push('orders:read')
    if (permissions.orders?.includes('write')) corePerms.push('orders:write')

    return corePerms.slice(0, 10) // Limit to avoid JWT size issues
  }

  private async cacheSessionData(
    sessionId: string,
    data: any,
    ttl = this.accessTokenExpiry
  ): Promise<void> {
    await this.redis.setex(
      `session:${sessionId}`,
      ttl,
      JSON.stringify(data)
    )
  }

  private async clearSessionCache(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`)
  }

  private async updateSessionAccess(sessionId: string): Promise<void> {
    // Update database (batched for performance)
    await prisma.sessions.update({
      where: { id: sessionId },
      data: { lastAccessedAt: new Date() }
    })
  }

  private async isTokenRevoked(jti: string): Promise<boolean> {
    const revoked = await prisma.revokedTokens.findUnique({
      where: { jti },
      select: { jti: true }
    })
    return !!revoked
  }

  private async revokeTokens(
    refreshTokenJti: string,
    accessTokenJti?: string
  ): Promise<void> {
    const tokensToRevoke = [
      {
        jti: refreshTokenJti,
        tokenType: 'refresh',
        expiresAt: new Date(Date.now() + this.refreshTokenExpiry * 1000)
      }
    ]

    if (accessTokenJti) {
      tokensToRevoke.push({
        jti: accessTokenJti,
        tokenType: 'access',
        expiresAt: new Date(Date.now() + this.accessTokenExpiry * 1000)
      })
    }

    await prisma.revokedTokens.createMany({
      data: tokensToRevoke.map(token => ({
        ...token,
        userId: '', // Will be filled by trigger or separate query
        reason: 'Session revoked'
      }))
    })
  }

  private async logSessionActivity(
    sessionId: string,
    activityType: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await prisma.sessionActivities.create({
      data: {
        sessionId,
        activityType,
        ipAddress,
        userAgent,
        metadata: metadata || {},
        createdAt: new Date()
      }
    })
  }

  // Security monitoring methods
  async detectSuspiciousActivity(userId: string): Promise<{
    issuspicious: boolean
    reasons: string[]
  }> {
    const activeSessions = await prisma.sessions.findMany({
      where: {
        userId,
        status: 'active',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const reasons: string[] = []

    // Check for multiple locations
    const uniqueIPs = new Set(activeSessions.map(s => s.ipAddress))
    if (uniqueIPs.size > 5) {
      reasons.push('Multiple IP addresses detected')
    }

    // Check for unusual device patterns
    const deviceFingerprints = new Set(activeSessions.map(s => s.deviceFingerprint))
    if (deviceFingerprints.size > 3) {
      reasons.push('Multiple device fingerprints detected')
    }

    // Check for rapid session creation
    if (activeSessions.length > 10) {
      reasons.push('High number of concurrent sessions')
    }

    return {
      issuspicious: reasons.length > 0,
      reasons
    }
  }

  // Cleanup expired sessions
  async cleanupExpiredSessions(): Promise<void> {
    const expiredSessions = await prisma.sessions.findMany({
      where: {
        OR: [
          { expiresAt: { lte: new Date() } },
          {
            lastAccessedAt: {
              lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days inactive
            }
          }
        ],
        status: 'active'
      },
      select: {
        id: true,
        refreshTokenJti: true,
        accessTokenJti: true
      }
    })

    if (expiredSessions.length > 0) {
      // Mark as expired
      await prisma.sessions.updateMany({
        where: {
          id: { in: expiredSessions.map(s => s.id) }
        },
        data: {
          status: 'expired',
          revokedAt: new Date(),
          revokeReason: 'Automatic cleanup - expired'
        }
      })

      // Blacklist tokens
      for (const session of expiredSessions) {
        await this.revokeTokens(session.refreshTokenJti, session.accessTokenJti)
        await this.clearSessionCache(session.id)
      }
    }

    // Clean up old revoked tokens
    await prisma.revokedTokens.deleteMany({
      where: {
        expiresAt: { lte: new Date() }
      }
    })
  }
}

export const sessionService = new SessionService()
```

## Security Implementation

### 1. Token Security Measures

```typescript
// JWT Security Configuration
const jwtConfig = {
  algorithms: ['HS256'], // Single algorithm to prevent algorithm confusion
  issuer: 'skidspace.com',
  audience: ['skidspace-api', 'skidspace-web'],

  // Security options
  clockTolerance: 5, // 5 second clock skew tolerance
  ignoreExpiration: false,
  ignoreNotBefore: false,

  // Token signing options
  expiresIn: '15m', // Access tokens
  refreshExpiresIn: '30d', // Refresh tokens

  // Secure headers
  header: {
    alg: 'HS256',
    typ: 'JWT'
  }
}

// Token rotation strategy
async function rotateRefreshToken(
  oldRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const payload = jwt.verify(oldRefreshToken, jwtRefreshSecret)

  if (!payload) return null

  // Revoke old refresh token immediately
  await revokeToken(payload.jti)

  // Generate new token pair
  return await generateTokenPair(payload.sub, payload.sessionId)
}
```

### 2. Device Trust System

```typescript
// Device trust scoring
interface DeviceTrust {
  deviceId: string
  fingerprint: string
  trustScore: number // 0-100
  lastVerified: Date
  riskFactors: string[]
}

async function calculateDeviceTrust(
  deviceInfo: DeviceInfo,
  userId: string
): Promise<DeviceTrust> {
  let trustScore = 50 // Base trust
  const riskFactors: string[] = []

  // Check device history
  const deviceHistory = await getDeviceHistory(deviceInfo.fingerprint, userId)

  if (deviceHistory.length > 0) {
    trustScore += 20 // Known device bonus
  } else {
    riskFactors.push('New device')
  }

  // Check IP reputation
  const ipReputation = await checkIPReputation(deviceInfo.ipAddress)
  if (ipReputation.isVPN || ipReputation.isTor) {
    trustScore -= 30
    riskFactors.push('VPN/Proxy detected')
  }

  // Check geolocation consistency
  if (deviceHistory.length > 0) {
    const locationConsistency = await checkLocationConsistency(
      deviceInfo.ipAddress,
      deviceHistory
    )
    if (!locationConsistency) {
      trustScore -= 20
      riskFactors.push('Unusual location')
    }
  }

  // Browser/app consistency
  const userAgentConsistency = await checkUserAgentConsistency(
    deviceInfo.userAgent,
    deviceHistory
  )
  if (!userAgentConsistency) {
    trustScore -= 10
    riskFactors.push('Browser/app change')
  }

  return {
    deviceId: deviceInfo.deviceId || deviceInfo.fingerprint,
    fingerprint: deviceInfo.fingerprint,
    trustScore: Math.max(0, Math.min(100, trustScore)),
    lastVerified: new Date(),
    riskFactors
  }
}
```

### 3. Session Hijacking Prevention

```typescript
// Session binding to device characteristics
async function validateSessionBinding(
  sessionId: string,
  currentRequest: {
    ipAddress: string
    userAgent: string
    deviceFingerprint: string
  }
): Promise<boolean> {
  const session = await getSession(sessionId)
  if (!session) return false

  // Strict IP binding for high-security tenants
  if (session.tenant?.securityLevel === 'high') {
    if (session.ipAddress !== currentRequest.ipAddress) {
      await flagSecurityEvent('IP_CHANGE_DETECTED', {
        sessionId,
        originalIP: session.ipAddress,
        newIP: currentRequest.ipAddress
      })
      return false
    }
  }

  // Device fingerprint consistency
  if (session.deviceFingerprint !== currentRequest.deviceFingerprint) {
    const similarityScore = calculateFingerprintSimilarity(
      session.deviceFingerprint,
      currentRequest.deviceFingerprint
    )

    if (similarityScore < 0.8) {
      await flagSecurityEvent('DEVICE_FINGERPRINT_MISMATCH', {
        sessionId,
        originalFingerprint: session.deviceFingerprint,
        newFingerprint: currentRequest.deviceFingerprint,
        similarityScore
      })
      return false
    }
  }

  return true
}

// Rate limiting for session creation
const sessionCreationLimiter = {
  perIP: new Map<string, { count: number; resetTime: number }>(),
  perUser: new Map<string, { count: number; resetTime: number }>(),

  async checkLimit(
    ipAddress: string,
    userId?: string
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now()
    const windowMs = 15 * 60 * 1000 // 15 minutes
    const maxAttemptsPerIP = 10
    const maxAttemptsPerUser = 5

    // Check IP limit
    const ipData = this.perIP.get(ipAddress) || { count: 0, resetTime: now + windowMs }
    if (now > ipData.resetTime) {
      ipData.count = 0
      ipData.resetTime = now + windowMs
    }

    if (ipData.count >= maxAttemptsPerIP) {
      return { allowed: false, remaining: 0 }
    }

    // Check user limit if provided
    if (userId) {
      const userData = this.perUser.get(userId) || { count: 0, resetTime: now + windowMs }
      if (now > userData.resetTime) {
        userData.count = 0
        userData.resetTime = now + windowMs
      }

      if (userData.count >= maxAttemptsPerUser) {
        return { allowed: false, remaining: 0 }
      }

      userData.count++
      this.perUser.set(userId, userData)
    }

    ipData.count++
    this.perIP.set(ipAddress, ipData)

    return {
      allowed: true,
      remaining: Math.min(
        maxAttemptsPerIP - ipData.count,
        userId ? maxAttemptsPerUser - (this.perUser.get(userId)?.count || 0) : maxAttemptsPerIP
      )
    }
  }
}
```

## Performance Optimization

### 1. Session Cache Strategy

```typescript
// Multi-layer caching
class SessionCache {
  private redisClient: Redis
  private localCache = new Map<string, { data: any; expiry: number }>()
  private localCacheSize = 1000

  async get(sessionId: string): Promise<SessionData | null> {
    // Layer 1: Local cache (fastest)
    const localData = this.localCache.get(sessionId)
    if (localData && Date.now() < localData.expiry) {
      return localData.data
    }

    // Layer 2: Redis cache
    const redisData = await this.redisClient.get(`session:${sessionId}`)
    if (redisData) {
      const sessionData = JSON.parse(redisData)
      this.setLocalCache(sessionId, sessionData)
      return sessionData
    }

    // Layer 3: Database fallback
    const dbSession = await prisma.sessions.findUnique({
      where: { id: sessionId, status: 'active' },
      include: {
        user: {
          include: {
            tenantUsers: {
              include: { tenant: true }
            }
          }
        }
      }
    })

    if (dbSession) {
      const sessionData = this.transformDbSession(dbSession)
      await this.set(sessionId, sessionData)
      return sessionData
    }

    return null
  }

  async set(sessionId: string, data: SessionData, ttl = 900): Promise<void> {
    // Update Redis
    await this.redisClient.setex(
      `session:${sessionId}`,
      ttl,
      JSON.stringify(data)
    )

    // Update local cache
    this.setLocalCache(sessionId, data, ttl)
  }

  private setLocalCache(sessionId: string, data: any, ttl = 900): void {
    // LRU eviction if cache full
    if (this.localCache.size >= this.localCacheSize) {
      const firstKey = this.localCache.keys().next().value
      this.localCache.delete(firstKey)
    }

    this.localCache.set(sessionId, {
      data,
      expiry: Date.now() + ttl * 1000
    })
  }
}
```

### 2. Database Connection Optimization

```sql
-- Session-specific database optimizations
-- Partitioning sessions by creation date
CREATE TABLE platform.sessions_2026_03
PARTITION OF platform.sessions
FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Automated partition management
CREATE OR REPLACE FUNCTION create_monthly_session_partition()
RETURNS VOID AS $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
BEGIN
    start_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'sessions_' || TO_CHAR(start_date, 'YYYY_MM');

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS platform.%I
        PARTITION OF platform.sessions
        FOR VALUES FROM (%L) TO (%L)
    ', partition_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;

-- Automated cleanup of old sessions
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS VOID AS $$
BEGIN
    -- Delete sessions older than 90 days
    DELETE FROM platform.sessions
    WHERE created_at < CURRENT_DATE - INTERVAL '90 days'
      AND status IN ('revoked', 'expired');

    -- Archive old session activities
    DELETE FROM platform.session_activities
    WHERE created_at < CURRENT_DATE - INTERVAL '6 months';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup
SELECT cron.schedule('cleanup-sessions', '0 2 * * *', 'SELECT cleanup_old_sessions()');
```

## Mobile and Offline Support

### 1. Offline Token Management

```typescript
// Mobile session management
class MobileSessionManager {
  private storage: AsyncStorage

  async storeTokens(tokens: {
    accessToken: string
    refreshToken: string
    expiresAt: Date
  }): Promise<void> {
    await this.storage.multiSet([
      ['@skidspace:access_token', tokens.accessToken],
      ['@skidspace:refresh_token', tokens.refreshToken],
      ['@skidspace:expires_at', tokens.expiresAt.toISOString()],
    ])
  }

  async getValidAccessToken(): Promise<string | null> {
    try {
      const [accessToken, expiresAt] = await this.storage.multiGet([
        '@skidspace:access_token',
        '@skidspace:expires_at'
      ])

      if (!accessToken[1] || !expiresAt[1]) return null

      const expiry = new Date(expiresAt[1])
      const now = new Date()

      // Check if token expires within next 5 minutes
      if (expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
        // Attempt refresh
        return await this.refreshTokens()
      }

      return accessToken[1]
    } catch (error) {
      console.error('Error getting access token:', error)
      return null
    }
  }

  private async refreshTokens(): Promise<string | null> {
    try {
      const refreshToken = await this.storage.getItem('@skidspace:refresh_token')
      if (!refreshToken) return null

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken })
      })

      if (!response.ok) {
        await this.clearTokens()
        return null
      }

      const tokens = await response.json()
      await this.storeTokens(tokens)

      return tokens.accessToken
    } catch (error) {
      console.error('Token refresh failed:', error)
      await this.clearTokens()
      return null
    }
  }

  async clearTokens(): Promise<void> {
    await this.storage.multiRemove([
      '@skidspace:access_token',
      '@skidspace:refresh_token',
      '@skidspace:expires_at'
    ])
  }
}
```

## Monitoring and Alerting

### 1. Session Analytics

```typescript
// Session monitoring service
class SessionMonitoringService {
  async trackSessionMetrics(): Promise<void> {
    const metrics = await Promise.all([
      this.getActiveSessionCount(),
      this.getSessionCreationRate(),
      this.getAverageSessionDuration(),
      this.getFailedLoginAttempts(),
      this.getSuspiciousActivityCount()
    ])

    await this.recordMetrics({
      activeSessionCount: metrics[0],
      sessionCreationRate: metrics[1],
      averageSessionDuration: metrics[2],
      failedLoginAttempts: metrics[3],
      suspiciousActivityCount: metrics[4],
      timestamp: new Date()
    })
  }

  private async getActiveSessionCount(): Promise<number> {
    return await prisma.sessions.count({
      where: { status: 'active' }
    })
  }

  private async getSessionCreationRate(): Promise<number> {
    const since = new Date(Date.now() - 60 * 60 * 1000) // Last hour
    return await prisma.sessions.count({
      where: {
        createdAt: { gte: since },
        status: 'active'
      }
    })
  }

  async generateSecurityReport(): Promise<SecurityReport> {
    const report = {
      timestamp: new Date(),
      summary: {
        totalActiveSessions: await this.getActiveSessionCount(),
        suspiciousActivities: await this.getSuspiciousActivities(),
        multiLocationLogins: await this.getMultiLocationLogins(),
        expiredTokenCleanup: await this.getExpiredTokenCount()
      },
      recommendations: await this.generateRecommendations()
    }

    return report
  }

  private async generateRecommendations(): Promise<string[]> {
    const recommendations: string[] = []

    const suspiciousCount = await this.getSuspiciousActivityCount()
    if (suspiciousCount > 100) {
      recommendations.push('High suspicious activity detected - review security policies')
    }

    const oldSessionCount = await prisma.sessions.count({
      where: {
        lastAccessedAt: {
          lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        },
        status: 'active'
      }
    })

    if (oldSessionCount > 1000) {
      recommendations.push('Large number of inactive sessions - run cleanup process')
    }

    return recommendations
  }
}
```

## Future Enhancements

### 1. Advanced Security Features
- **Behavioral Analytics**: ML-based anomaly detection
- **Zero Trust Architecture**: Continuous verification
- **Adaptive Authentication**: Risk-based authentication
- **Decentralized Identity**: Self-sovereign identity support

### 2. Performance Improvements
- **Session Clustering**: Distributed session management
- **GraphQL Subscriptions**: Real-time session status
- **Edge Computing**: Regional session validation
- **Quantum-Resistant Crypto**: Future-proof security

### 3. Compliance Features
- **GDPR Compliance**: Automated data retention
- **SOC2 Controls**: Enhanced audit trails
- **HIPAA Support**: Healthcare-grade security
- **Financial Services**: PCI-DSS level controls

## Success Metrics

### Performance KPIs
- **Session Validation Latency**: < 10ms p95
- **Token Refresh Time**: < 50ms p95
- **Cache Hit Ratio**: > 95%
- **Database Query Reduction**: 80% fewer queries

### Security KPIs
- **Session Hijacking Prevention**: 100% detection
- **Suspicious Activity Detection**: < 30 second alert time
- **Token Compromise Response**: < 5 minute revocation
- **False Positive Rate**: < 1% for security alerts

### User Experience KPIs
- **Seamless Authentication**: 99.9% success rate
- **Mobile Token Refresh**: < 100ms background refresh
- **Cross-Device Sync**: < 2 second propagation
- **Session Recovery**: 95% success after network issues

## Conclusion

The hybrid session management strategy provides enterprise-grade security with optimal user experience across all platforms. The combination of JWT efficiency with database-backed security controls ensures scalability while maintaining comprehensive audit capabilities.

**Decision Confidence**: High (95%)
**Implementation Timeline**: 4-5 weeks
**Security Audit**: Required before production
**Review Date**: 2026-06-23 (3-month review)