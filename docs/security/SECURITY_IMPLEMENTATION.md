# Security Implementation Guide

This document outlines the comprehensive security measures implemented in the Warehouse Network application.

## 🛡️ Security Patches Implemented

### 1. NextAuth.js Configuration Security
- **Enhanced session management** with database sessions
- **Secure cookie configuration** with `__Secure-` and `__Host-` prefixes
- **2FA integration** for super admin accounts
- **Rate limiting** on authentication endpoints
- **Account lockout** after failed login attempts
- **Audit logging** for all authentication events

### 2. Redis-based Rate Limiting System
- **Sliding window algorithm** for accurate rate limiting
- **Multiple rate limit tiers** (API, Auth, Registration, 2FA)
- **IP-based tracking** with automatic suspicious activity detection
- **Account lockout** integration
- **Configurable limits** per endpoint type

### 3. Two-Factor Authentication (2FA)
- **TOTP-based 2FA** using industry-standard libraries
- **QR code generation** for authenticator app setup
- **Backup codes** with secure hashing
- **Mandatory 2FA** for super admin accounts
- **Rate limiting** on 2FA verification attempts

### 4. CSRF Protection
- **Double submit cookie pattern** with secure token generation
- **HMAC-based tokens** with timestamp validation
- **Automatic token rotation** for enhanced security
- **SameSite cookie attributes** for additional protection

### 5. Content Security Policy (CSP)
- **Nonce-based script execution** for production
- **Strict CSP directives** with no unsafe-inline/eval in production
- **CSP violation reporting** with security monitoring
- **Environment-specific configurations**

### 6. Input Validation & Sanitization
- **Zod schema validation** for all API endpoints
- **XSS protection** with automatic content sanitization
- **SQL injection prevention** with pattern detection
- **File upload security** with type and size validation
- **Request size limiting** to prevent DoS attacks

### 7. Security Monitoring & Alerting
- **Comprehensive audit logging** with security event classification
- **Real-time threat detection** with pattern analysis
- **Automated alerting** for critical security events
- **Security metrics dashboard** for administrators
- **Incident response** workflows

## 🔧 Configuration

### Environment Variables

Copy `.env.security.example` to `.env.local` and configure:

```bash
# Critical Security Settings
NEXTAUTH_SECRET="your-secure-random-secret"
SUPER_ADMIN_CODE="your-super-admin-code"
CSRF_SECRET="your-csrf-secret"

# Redis Configuration (Required)
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD="your-redis-password"

# Security Monitoring
SECURITY_WEBHOOK_URL="your-alert-webhook-url"
```

### Database Migration

Run the security features migration:

```bash
npm run db:migrate
```

This adds tables for:
- User two-factor authentication
- Security alerts and incidents
- System metrics and monitoring
- Rate limiting and session management

## 🚀 Getting Started

### 1. Install Dependencies

All required security dependencies are included in `package.json`:

```bash
npm install
```

### 2. Configure Redis

Redis is required for rate limiting and session management:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or install locally
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu
```

### 3. Environment Setup

1. Copy the security environment template:
```bash
cp .env.security.example .env.local
```

2. Generate secure secrets:
```bash
# Generate NextAuth secret
openssl rand -base64 32

# Generate CSRF secret
openssl rand -base64 32
```

3. Configure your environment variables

### 4. Database Setup

1. Run migrations:
```bash
npm run db:migrate:deploy
```

2. Seed initial data:
```bash
npm run db:seed
```

### 5. Super Admin Setup

Create your first super admin account:

```bash
# Using the API endpoint
curl -X POST http://localhost:3000/api/admin/super/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "your-secure-password",
    "name": "Super Administrator",
    "adminCode": "your-super-admin-code"
  }'
```

## 📊 Security Monitoring

### Dashboard Access

Access the security dashboard at `/admin/security/dashboard` with super admin credentials.

### Key Metrics Tracked

- **Authentication Events**: Login attempts, failures, 2FA usage
- **Rate Limiting**: Blocked requests, suspicious IPs
- **Security Violations**: XSS attempts, SQL injection, CSP violations
- **User Activity**: Access patterns, privilege escalations

### Alert Types

1. **Critical**: SQL injection, privilege escalation, system breaches
2. **High**: Multiple failed logins, XSS attempts, unauthorized access
3. **Medium**: Rate limiting violations, unusual access patterns
4. **Low**: Normal security events, successful authentications

## 🔒 Security Features

### Authentication Security

```typescript
// Enhanced session configuration
session: {
  strategy: "database",
  maxAge: 24 * 60 * 60, // 24 hours
  updateAge: 60 * 60,   // 1 hour
}

// Secure cookie settings
cookies: {
  sessionToken: {
    name: "__Secure-next-auth.session-token",
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: true, // HTTPS only in production
    }
  }
}
```

### Rate Limiting

```typescript
// API rate limits
rateLimit: {
  api: { windowMs: 15 * 60 * 1000, max: 1000 },
  auth: { windowMs: 15 * 60 * 1000, max: 10 },
  registration: { windowMs: 60 * 60 * 1000, max: 5 },
  twoFactor: { windowMs: 15 * 60 * 1000, max: 10 },
}
```

### Content Security Policy

```typescript
// Production CSP configuration
csp: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'nonce-{NONCE}'"],
    styleSrc: ["'self'", "'nonce-{NONCE}'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
  }
}
```

## 🧪 Testing

### Security Testing

Run the security test suite:

```bash
# Unit tests for security functions
npm run test:security

# Integration tests for auth flows
npm run test:integration

# Penetration testing
npm run test:pentest
```

### Manual Security Checks

1. **Authentication Testing**:
   - Test login rate limiting
   - Verify 2FA enforcement
   - Check session security

2. **Input Validation Testing**:
   - XSS payload testing
   - SQL injection attempts
   - File upload security

3. **Authorization Testing**:
   - Role-based access control
   - Privilege escalation attempts
   - Cross-tenant data access

## 📋 Security Checklist

### Production Deployment

- [ ] All environment variables configured
- [ ] HTTPS enabled with valid certificates
- [ ] Redis instance secured and configured
- [ ] Database connections encrypted
- [ ] CSP headers enabled (not report-only)
- [ ] Security monitoring webhook configured
- [ ] Super admin 2FA enabled
- [ ] Rate limiting active
- [ ] Audit logging enabled

### Regular Maintenance

- [ ] Review security alerts weekly
- [ ] Update dependencies monthly
- [ ] Rotate secrets quarterly
- [ ] Security audit annually
- [ ] Backup recovery testing
- [ ] Penetration testing

## 🚨 Incident Response

### Security Alert Workflow

1. **Detection**: Automated monitoring systems detect threats
2. **Classification**: Alerts categorized by severity level
3. **Notification**: Critical alerts trigger immediate notifications
4. **Investigation**: Security team reviews and investigates
5. **Mitigation**: Implement appropriate countermeasures
6. **Recovery**: Restore normal operations
7. **Analysis**: Post-incident review and improvements

### Emergency Contacts

- **Security Team**: security@yourdomain.com
- **On-call Engineer**: +1-xxx-xxx-xxxx
- **Management Escalation**: management@yourdomain.com

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NextAuth.js Security Guide](https://next-auth.js.org/configuration/options#security)
- [Redis Security Checklist](https://redis.io/topics/security)
- [Content Security Policy Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

## 🔍 Security Tools Integration

### Recommended Tools

1. **SAST**: SonarQube, CodeQL
2. **DAST**: OWASP ZAP, Burp Suite
3. **Container Security**: Snyk, Trivy
4. **Infrastructure**: AWS Security Hub, Azure Security Center
5. **Monitoring**: Datadog, New Relic, Splunk

### CI/CD Security Pipeline

```yaml
# Example GitHub Actions security workflow
security-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - name: Run security audit
      run: npm audit --audit-level=high
    - name: SAST scan
      run: npm run security:scan
    - name: Dependency check
      run: npm run security:deps
```

---

**Note**: This security implementation provides enterprise-grade protection but should be regularly reviewed and updated based on emerging threats and security best practices.