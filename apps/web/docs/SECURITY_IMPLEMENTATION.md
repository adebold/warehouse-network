# Security Implementation Guide

This document outlines the security features implemented in the Warehouse Network platform.

## Overview

We've implemented comprehensive security measures to protect the application against common web vulnerabilities:

- **Rate Limiting** - Protect against brute force and DoS attacks
- **CSRF Protection** - Prevent cross-site request forgery
- **Security Headers** - Implement best practice HTTP headers
- **Password Policy** - Enforce strong password requirements
- **Session Security** - Secure session management

## Rate Limiting

### Implementation

Rate limiting is implemented using `express-rate-limit` with different configurations for different endpoint types:

#### Authentication Endpoints
- **Window**: 15 minutes
- **Max Requests**: 5 per IP
- **Endpoints**: `/api/auth/register`, `/api/auth/[...nextauth]`, `/api/auth/register-with-referral`

#### General API Endpoints
- **Window**: 15 minutes
- **Max Requests**: 100 per IP
- **Endpoints**: All other API routes

#### Password Reset
- **Window**: 1 hour
- **Max Requests**: 3 per IP
- **Endpoints**: Password reset endpoints (when implemented)

### Usage

```typescript
import { withAuthSecurity, withApiSecurity } from '@/lib/middleware/security';

// For authentication endpoints
export default withAuthSecurity(handler);

// For general API endpoints
export default withApiSecurity(handler);
```

## CSRF Protection

### Implementation

CSRF protection is implemented with secure tokens that must be included in all state-changing requests.

### Client-Side Usage

```typescript
import { useCSRFToken, fetchWithCSRF } from '@/hooks/useCSRFToken';

function MyComponent() {
  const { csrfToken } = useCSRFToken();

  const handleSubmit = async () => {
    const response = await fetchWithCSRF('/api/some-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }, csrfToken);
  };
}
```

### Server-Side Usage

```typescript
import { withCSRFProtection } from '@/lib/middleware/csrf';

export default withCSRFProtection(handler);
```

## Security Headers

The following security headers are automatically applied via Next.js middleware:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: [comprehensive policy]`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (production only)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Password Policy

Passwords must meet the following requirements (configurable via environment variables):

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Optional: special characters

### Configuration

```env
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SYMBOLS=false
```

## Environment Configuration

All security settings can be configured via environment variables. See `.env.example` for a complete list.

### Required in Production

- `NEXTAUTH_SECRET` - Must be a secure random string
- `DATABASE_URL` - Database connection string
- `NEXTAUTH_URL` - Application URL

### Security Configuration

```env
# Authentication
BCRYPT_ROUNDS=12
JWT_MAX_AGE=86400
SESSION_MAX_AGE=2592000

# Rate Limiting
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=5
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=100

# CSRF Protection
CSRF_PROTECTION_ENABLED=true
CSRF_TOKEN_LENGTH=32
CSRF_COOKIE_NAME=_csrf
CSRF_HEADER_NAME=x-csrf-token
```

## Session Security

Sessions are secured with:

- JWT tokens with configurable expiration
- HTTP-only cookies
- Secure flag in production
- SameSite attribute
- Custom session token names

## Best Practices

1. **Always use HTTPS in production**
2. **Keep dependencies updated** - Run `npm audit` regularly
3. **Use environment variables** - Never hardcode secrets
4. **Validate all inputs** - Use validation schemas
5. **Log security events** - Monitor for suspicious activity
6. **Regular security audits** - Test your implementation

## Testing Security

### Rate Limiting Test

```bash
# Test rate limiting (should fail after 5 attempts)
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"Test1234","name":"Test"}'
done
```

### CSRF Test

```bash
# Get CSRF token
curl http://localhost:3000/api/auth/csrf -c cookies.txt

# Use token in request
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: [token-from-response]" \
  -b cookies.txt \
  -d '{"email":"test@example.com","password":"Test1234","name":"Test"}'
```

## Monitoring

Security events are logged and can be monitored:

- Failed authentication attempts
- Rate limit violations
- CSRF token failures
- Invalid password attempts

## Future Enhancements

1. **Two-Factor Authentication (2FA)**
2. **Account lockout after failed attempts**
3. **IP-based allowlisting/blocklisting**
4. **Anomaly detection**
5. **Security event webhooks**
6. **Password history enforcement**

## Support

For security concerns or questions, please contact the security team or create a private issue in the repository.