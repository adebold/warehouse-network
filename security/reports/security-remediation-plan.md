# 🛠️ Security Remediation Action Plan - Skidspace.com Platform

**Plan Generated:** March 24, 2026
**Based on:** Comprehensive Security Assessment Report
**Priority:** URGENT - Critical vulnerabilities identified
**Estimated Timeline:** 0-90 days

---

## 🚨 IMMEDIATE ACTIONS (0-7 days) - CRITICAL

### 1. **Authentication Bypass Fix** ⚡ CRITICAL
**Issue:** `allowDangerousEmailAccountLinking: true` enables account takeover
**Impact:** Complete platform compromise possible
**Timeline:** 24-48 hours

**Action Steps:**
```typescript
// File: /apps/web/src/auth.ts
// BEFORE (VULNERABLE):
GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  allowDangerousEmailAccountLinking: true, // ❌ REMOVE THIS
}),

// AFTER (SECURE):
GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  allowDangerousEmailAccountLinking: false, // ✅ SECURE
}),
```

**Testing Required:**
1. Verify OAuth flows work correctly
2. Test email verification process
3. Confirm account linking security

**Risk if Delayed:** Platform-wide account takeover attacks

### 2. **Rate Limiting Implementation** ⚡ CRITICAL
**Issue:** No actual rate limiting implemented (placeholder only)
**Impact:** API abuse, DoS attacks, credential brute forcing
**Timeline:** 3-5 days

**Implementation Plan:**

**Step 1: Install Redis and dependencies**
```bash
npm install redis ioredis @upstash/redis rate-limiter-flexible
```

**Step 2: Create rate limiting middleware**
```typescript
// File: /apps/web/src/lib/rate-limiter.ts
import { RateLimiterRedis } from 'rate-limiter-flexible'
import Redis from 'ioredis'

const redisClient = new Redis(process.env.REDIS_URL!)

export const authRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'auth_limit',
  points: 5, // Number of attempts
  duration: 900, // Per 15 minutes
  execEvenly: true
})

export const apiRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'api_limit',
  points: 100, // Number of requests
  duration: 3600, // Per hour
  execEvenly: true
})
```

**Step 3: Update middleware**
```typescript
// File: /apps/web/src/middleware.ts
import { authRateLimiter, apiRateLimiter } from '@/lib/rate-limiter'

export async function middleware(request: NextRequest) {
  const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown'

  // Rate limit authentication endpoints
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    try {
      await authRateLimiter.consume(clientIP)
    } catch (rejRes) {
      return NextResponse.json(
        { error: 'Too many authentication attempts' },
        { status: 429 }
      )
    }
  }

  // Rate limit API endpoints
  if (request.nextUrl.pathname.startsWith('/api/')) {
    try {
      await apiRateLimiter.consume(clientIP)
    } catch (rejRes) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }
  }

  // Rest of middleware...
}
```

### 3. **Super Admin Setup Security** ⚡ CRITICAL
**Issue:** Single setup key vulnerability
**Impact:** Platform takeover if key compromised
**Timeline:** 2-3 days

**Enhanced Security Implementation:**
```typescript
// File: /apps/web/src/app/api/admin/super/setup/route.ts
export async function POST(request: NextRequest) {
  const clientIP = request.ip || request.headers.get('x-forwarded-for')

  // 1. IP Restriction Check
  const allowedIPs = process.env.SUPER_ADMIN_ALLOWED_IPS?.split(',') || []
  if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
    return NextResponse.json({ error: 'Access denied from this IP' }, { status: 403 })
  }

  // 2. Rate Limiting (5 attempts per hour)
  try {
    await superAdminSetupLimiter.consume(clientIP)
  } catch {
    return NextResponse.json({ error: 'Too many setup attempts' }, { status: 429 })
  }

  // 3. Enhanced validation with multiple factors
  const setupSecret = process.env.SUPER_ADMIN_SETUP_SECRET
  const timestamp = request.headers.get('x-timestamp')
  const signature = request.headers.get('x-signature')

  // Verify timestamp (must be within 5 minutes)
  const now = Date.now()
  if (!timestamp || Math.abs(now - parseInt(timestamp)) > 300000) {
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 403 })
  }

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', setupSecret)
    .update(`${timestamp}:${validatedData.setupKey}`)
    .digest('hex')

  if (signature !== expectedSignature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // Rest of setup logic...
}
```

---

## 🟡 HIGH PRIORITY (1-4 weeks)

### 4. **CSRF Protection Implementation**
**Timeline:** 5-7 days

**Implementation:**
```typescript
// File: /apps/web/src/lib/csrf.ts
import crypto from 'crypto'
import { cookies } from 'next/headers'

export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function validateCSRFToken(token: string, sessionToken: string): boolean {
  const cookieStore = cookies()
  const csrfCookie = cookieStore.get('csrf-token')

  return csrfCookie?.value === token && token.length === 64
}

// Middleware update
export function withCSRF(handler: any) {
  return async (req: NextRequest) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfToken = req.headers.get('x-csrf-token')
      const session = await auth()

      if (!csrfToken || !validateCSRFToken(csrfToken, session?.user?.id)) {
        return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
      }
    }

    return handler(req)
  }
}
```

### 5. **Enhanced Input Validation**
**Timeline:** 3-5 days

**XSS Prevention:**
```typescript
// File: /apps/web/src/lib/sanitization.ts
import DOMPurify from 'isomorphic-dompurify'

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: []
  })
}

export function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

// Update registration schema
const registerSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .transform(sanitizeText),
  email: z.string()
    .email('Invalid email address')
    .refine(email => !email.includes('<'), 'Invalid email format'),
  password: z.string()
    .min(14, 'Password must be at least 14 characters') // Updated to match policy
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/, 'Password must meet complexity requirements'),
  // ... rest of schema
})
```

### 6. **Session Security Enhancement**
**Timeline:** 4-6 days

**JWT Configuration Update:**
```typescript
// File: /apps/web/src/auth.ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  // ... other config

  session: {
    strategy: "jwt",
    maxAge: 60 * 60, // 1 hour instead of 30 days
  },

  jwt: {
    maxAge: 60 * 60, // 1 hour
  },

  callbacks: {
    async jwt({ token, user, account }) {
      // Add token refresh logic
      if (user) {
        token.iat = Math.floor(Date.now() / 1000)
        token.exp = Math.floor(Date.now() / 1000) + 3600 // 1 hour
      }

      // Check if token needs refresh (within 10 minutes of expiry)
      if (token.exp && (token.exp - Math.floor(Date.now() / 1000)) < 600) {
        // Trigger refresh
        token.iat = Math.floor(Date.now() / 1000)
        token.exp = Math.floor(Date.now() / 1000) + 3600
      }

      return token
    }
  }
})
```

---

## 🟢 MEDIUM PRIORITY (4-12 weeks)

### 7. **Content Security Policy Implementation**
**Timeline:** 1-2 weeks

```typescript
// File: /apps/web/src/middleware.ts
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' blob: data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://api.github.com https://accounts.google.com;
  frame-src 'self' https://accounts.google.com;
`.replace(/\s{2,}/g, ' ').trim()

response.headers.set('Content-Security-Policy', cspHeader)
```

### 8. **Database Security Hardening**
**Timeline:** 2-3 weeks

**Enhanced Prisma Configuration:**
```typescript
// File: /apps/web/src/lib/prisma.ts
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?sslmode=require&connect_timeout=30'
    }
  }
})

// Add query logging middleware for security monitoring
prisma.$use(async (params, next) => {
  const start = Date.now()
  const result = await next(params)
  const end = Date.now()

  // Log slow queries and potential injection attempts
  if (end - start > 1000 || JSON.stringify(params).includes('--')) {
    console.warn('Suspicious database query:', {
      model: params.model,
      action: params.action,
      duration: end - start,
      args: params.args
    })
  }

  return result
})
```

### 9. **Advanced Monitoring and Alerting**
**Timeline:** 3-4 weeks

**Security Event Monitoring:**
```typescript
// File: /apps/web/src/lib/security-monitor.ts
export class SecurityMonitor {
  static async logSecurityEvent(event: {
    type: 'auth_failure' | 'privilege_escalation' | 'suspicious_activity'
    userId?: string
    ip: string
    details: any
  }) {
    await prisma.securityEvent.create({
      data: {
        type: event.type,
        userId: event.userId,
        ip: event.ip,
        details: event.details,
        severity: this.calculateSeverity(event),
        timestamp: new Date()
      }
    })

    // Real-time alerting for critical events
    if (this.isCritical(event)) {
      await this.sendSecurityAlert(event)
    }
  }

  private static isCritical(event: any): boolean {
    return event.type === 'privilege_escalation' ||
           (event.type === 'auth_failure' && event.details.attemptCount > 5)
  }
}
```

---

## 📋 Testing and Validation Plan

### Security Testing Pipeline
**Timeline:** 2-3 weeks to implement

1. **Automated Security Tests**
   ```typescript
   // Add to CI/CD pipeline
   scripts: {
     "security:test": "npm run test:security && npm run audit && npm run scan",
     "test:security": "jest --testPathPattern=security",
     "audit": "npm audit --audit-level=moderate",
     "scan": "snyk test"
   }
   ```

2. **Penetration Testing Schedule**
   - Internal testing: Monthly
   - External testing: Quarterly
   - Bug bounty program: Consider after initial fixes

3. **Security Regression Testing**
   - Automated tests for each vulnerability
   - Pre-deployment security checks
   - Continuous monitoring

---

## 📊 Implementation Timeline

| Week | Priority | Task | Owner | Status |
|------|----------|------|-------|---------|
| 1 | 🚨 CRITICAL | Fix authentication bypass | DevOps | ⏳ Pending |
| 1 | 🚨 CRITICAL | Implement rate limiting | Backend | ⏳ Pending |
| 1 | 🚨 CRITICAL | Secure super admin setup | Security | ⏳ Pending |
| 2 | 🟡 HIGH | CSRF protection | Frontend | ⏳ Pending |
| 2 | 🟡 HIGH | Input validation | Backend | ⏳ Pending |
| 3 | 🟡 HIGH | Session security | Backend | ⏳ Pending |
| 4-6 | 🟢 MEDIUM | CSP implementation | Frontend | ⏳ Pending |
| 6-8 | 🟢 MEDIUM | Database hardening | Database | ⏳ Pending |
| 8-12 | 🟢 MEDIUM | Monitoring setup | DevOps | ⏳ Pending |

---

## 💰 Resource Requirements

### Team Requirements
- **Security Engineer:** 1 FTE for 3 months
- **Backend Developer:** 0.5 FTE for 6 weeks
- **Frontend Developer:** 0.3 FTE for 4 weeks
- **DevOps Engineer:** 0.4 FTE for 8 weeks

### Infrastructure Requirements
- **Redis Instance:** For rate limiting ($50-200/month)
- **Security Monitoring Tools:** SIEM solution ($500-2000/month)
- **SSL Certificates:** Wildcard SSL ($100-300/year)
- **Security Scanning:** Commercial tools ($200-500/month)

### Total Estimated Cost: $15,000-40,000 for complete implementation

---

## ✅ Success Metrics

### Security KPIs
1. **Vulnerability Count:** Reduce from 15 to <3 critical/high
2. **Security Test Coverage:** Achieve >95%
3. **Authentication Failures:** <1% of legitimate attempts
4. **API Response Time:** <200ms with rate limiting
5. **Security Incident Response:** <1 hour for critical issues

### Compliance Metrics
1. **SOC 2 Type II:** Ready for audit within 6 months
2. **ISO 27001:** Compliance gap analysis complete
3. **GDPR:** Automated data handling workflows

---

## 🚨 Risk Assessment

### Implementation Risks
1. **Service Disruption:** Rate limiting may affect legitimate users
2. **User Experience:** Additional security measures may slow workflows
3. **Integration Issues:** OAuth changes may break existing flows

### Mitigation Strategies
1. **Gradual Rollout:** Implement changes incrementally
2. **User Communication:** Notify users of security improvements
3. **Rollback Plan:** Prepare quick rollback procedures
4. **Monitoring:** Real-time monitoring during deployments

---

## 📞 Escalation Plan

### Critical Issues (0-4 hours)
**Contact:** Security Team Lead
**Backup:** CTO
**Communication:** Immediate Slack alert + Email

### High Priority Issues (4-24 hours)
**Contact:** Development Team Lead
**Backup:** Security Team Lead
**Communication:** Slack alert

### Standard Issues (1-7 days)
**Contact:** Project Manager
**Communication:** Weekly security review

---

**Plan Approved By:** Security Assessment Team
**Next Review:** April 7, 2026 (2 weeks)
**Emergency Contact:** security@skidspace.com

*This remediation plan is classified as CONFIDENTIAL and should only be distributed to authorized personnel involved in the security improvement project.*