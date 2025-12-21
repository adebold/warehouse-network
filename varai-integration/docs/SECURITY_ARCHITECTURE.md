# VARAi Platform - Enterprise Security Architecture

## Security Philosophy

**Zero Trust Architecture**: Never trust, always verify. Every request is authenticated, authorized, and audited.

## Security Layers

### 1. Frontend Security (React/Vite)

### 2. API Gateway / Middle Tier Security

### 3. Backend Security (Node.js/PostgreSQL)

### 4. Database Security

### 5. Infrastructure Security (Docker/K8s/GCP)

### 6. GitOps Security

### 7. Secrets Management

### 8. Monitoring & Incident Response

---

## 1. FRONTEND SECURITY

### Content Security Policy (CSP)

```typescript
// Strict CSP headers
const cspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"], // For Vite HMR in dev
  'style-src': ["'self'", "'unsafe-inline'"], // Tailwind requires inline
  'img-src': ["'self'", 'data:', 'https://cdn.varai.ai'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", 'https://api.varai.ai', 'wss://api.varai.ai'],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};
```

### XSS Protection

```typescript
// DOMPurify for all user-generated content
import DOMPurify from 'isomorphic-dompurify';

export const sanitizeHTML = (dirty: string): string => {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel']
  });
};

// React component wrapper
export const SafeHTML: React.FC<{ html: string }> = ({ html }) => {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHTML(html) }} />;
};
```

### CSRF Protection

```typescript
// Token-based CSRF protection
export const csrfMiddleware = () => {
  const token = sessionStorage.getItem('csrf-token');

  return {
    headers: {
      'X-CSRF-Token': token,
    },
  };
};

// Axios interceptor
axios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('csrf-token');
  if (token && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')) {
    config.headers['X-CSRF-Token'] = token;
  }
  return config;
});
```

### Secure Storage

```typescript
// Never store sensitive data in localStorage
// Use secure, httpOnly cookies for tokens

class SecureStorage {
  private static readonly ENCRYPTION_KEY = 'derived-from-session';

  // Only for non-sensitive data
  static encrypt(data: any): string {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    // Use Web Crypto API for encryption
    return encryptedData;
  }

  static decrypt(encrypted: string): any {
    // Decrypt using Web Crypto API
    return decryptedData;
  }
}

// Usage: Only store non-sensitive preferences
SecureStorage.set('theme', 'dark');
```

### Input Validation (Frontend)

```typescript
import { z } from 'zod';

// Schema validation
export const UserProfileSchema = z.object({
  email: z.string().email().max(255),
  name: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-zA-Z\s'-]+$/),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  website: z.string().url().optional(),
});

// React Hook Form integration
const { register, handleSubmit } = useForm({
  resolver: zodResolver(UserProfileSchema),
});
```

---

## 2. API GATEWAY / MIDDLE TIER SECURITY

### Rate Limiting

```typescript
// packages/api-gateway/src/middleware/rate-limit.ts
import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Tiered rate limiting
export const createRateLimiter = (windowMs: number, max: number) =>
  rateLimit({
    store: new RedisStore({
      client: redis,
      prefix: 'rl:',
    }),
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userId: req.user?.id,
      });
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: req.rateLimit?.resetTime,
      });
    },
  });

// Apply different limits per endpoint
app.use('/api/auth/login', createRateLimiter(15 * 60 * 1000, 5)); // 5 per 15min
app.use('/api/', createRateLimiter(60 * 1000, 100)); // 100 per minute
```

### JWT Authentication

```typescript
// packages/auth/src/jwt.ts
import jwt from 'jsonwebtoken';
import { webcrypto } from 'crypto';

export class JWTService {
  private static readonly ACCESS_TOKEN_EXPIRY = '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = '7d';
  private static readonly ROTATION_WINDOW = 30 * 24 * 60 * 60 * 1000; // 30 days

  // Use RS256 (asymmetric) not HS256
  private static privateKey = process.env.JWT_PRIVATE_KEY!;
  private static publicKey = process.env.JWT_PUBLIC_KEY!;

  static generateTokenPair(userId: string, role: string) {
    const jti = webcrypto.randomUUID();

    const accessToken = jwt.sign(
      {
        sub: userId,
        role,
        type: 'access',
        jti,
      },
      this.privateKey,
      {
        algorithm: 'RS256',
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
        issuer: 'varai.ai',
        audience: 'varai-api',
      }
    );

    const refreshToken = jwt.sign(
      {
        sub: userId,
        type: 'refresh',
        jti,
      },
      this.privateKey,
      {
        algorithm: 'RS256',
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
        issuer: 'varai.ai',
      }
    );

    return { accessToken, refreshToken, jti };
  }

  static verify(token: string): any {
    return jwt.verify(token, this.publicKey, {
      algorithms: ['RS256'],
      issuer: 'varai.ai',
      audience: 'varai-api',
    });
  }
}

// Token revocation with Redis
export class TokenRevocation {
  private redis: Redis;

  async revoke(jti: string, expiresIn: number) {
    await this.redis.setex(`revoked:${jti}`, expiresIn, '1');
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(`revoked:${jti}`)) === 1;
  }
}
```

### Request Validation & Sanitization

```typescript
// packages/api-gateway/src/middleware/validate.ts
import { z } from 'zod';
import createHttpError from 'http-errors';
import validator from 'validator';

export const validateRequest = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Sanitize all string inputs
      const sanitized = sanitizeObject(req.body);

      // Validate against schema
      req.body = await schema.parseAsync(sanitized);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(
          createHttpError(400, {
            message: 'Validation failed',
            errors: error.errors,
          })
        );
      } else {
        next(error);
      }
    }
  };
};

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return validator.escape(validator.trim(obj));
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      acc[key] = sanitizeObject(obj[key]);
      return acc;
    }, {} as any);
  }
  return obj;
}
```

### API Security Headers

```typescript
// packages/api-gateway/src/middleware/security-headers.ts
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
  frameguard: { action: 'deny' },
});
```

---

## 3. BACKEND SECURITY

### SQL Injection Prevention

```typescript
// packages/database/src/queries.ts
import { Prisma } from '@prisma/client';

// ALWAYS use parameterized queries
export class UserRepository {
  // ✅ CORRECT - Parameterized
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email }, // Prisma auto-escapes
    });
  }

  // ✅ CORRECT - Raw query with parameters
  async complexQuery(userId: string) {
    return prisma.$queryRaw`
      SELECT * FROM users 
      WHERE id = ${userId}
      AND deleted_at IS NULL
    `;
  }

  // ❌ NEVER DO THIS
  async dangerousQuery(userId: string) {
    return prisma.$queryRawUnsafe(
      `SELECT * FROM users WHERE id = '${userId}'` // VULNERABLE!
    );
  }
}
```

### Authentication Flow

```typescript
// packages/auth/src/auth-service.ts
import bcrypt from 'bcrypt';
import { z } from 'zod';

export class AuthService {
  private static readonly SALT_ROUNDS = 12;
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  async register(data: RegisterDTO) {
    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(data.password, this.SALT_ROUNDS);

    // Create user with hashed password
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        emailVerified: false,
        mfaEnabled: false,
      },
    });

    // Send verification email (async)
    await this.sendVerificationEmail(user.email);

    return { userId: user.id };
  }

  async login(email: string, password: string, ipAddress: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Use same timing for both cases to prevent user enumeration
      await bcrypt.hash(password, this.SALT_ROUNDS);
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenError('Account temporarily locked');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      await this.handleFailedLogin(user.id, ipAddress);
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      return { requiresMFA: true, userId: user.id };
    }

    // Reset failed attempts
    await this.resetFailedAttempts(user.id);

    // Generate tokens
    const { accessToken, refreshToken, jti } = JWTService.generateTokenPair(user.id, user.role);

    // Store refresh token hash
    await this.storeRefreshToken(user.id, jti, ipAddress);

    // Audit log
    await this.auditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      ipAddress,
      userAgent: req.headers['user-agent'],
    });

    return { accessToken, refreshToken };
  }

  private async handleFailedLogin(userId: string, ipAddress: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: { increment: 1 },
        lastFailedLogin: new Date(),
      },
    });

    // Lock account after max attempts
    if (user.failedLoginAttempts >= this.MAX_LOGIN_ATTEMPTS) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(Date.now() + this.LOCKOUT_DURATION),
        },
      });

      // Send security alert
      await this.sendSecurityAlert(userId, 'account_locked', ipAddress);
    }

    // Audit log
    await this.auditLog({
      userId,
      action: 'LOGIN_FAILED',
      ipAddress,
    });
  }
}
```

### Multi-Factor Authentication (MFA)

```typescript
// packages/auth/src/mfa-service.ts
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export class MFAService {
  async setupTOTP(userId: string) {
    const secret = speakeasy.generateSecret({
      name: `VARAi (${user.email})`,
      issuer: 'VARAi Platform',
    });

    // Store encrypted secret
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: await encrypt(secret.base32),
        mfaEnabled: false, // Not enabled until verified
      },
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes: await this.generateBackupCodes(userId),
    };
  }

  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    const secret = await decrypt(user.mfaSecret);

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1, // Allow 1 step before/after for clock drift
    });

    if (verified) {
      await prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
    }

    return verified;
  }

  private async generateBackupCodes(userId: string): Promise<string[]> {
    const codes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code = webcrypto.randomUUID().substring(0, 8);
      codes.push(code);

      await prisma.backupCode.create({
        data: {
          userId,
          codeHash: await bcrypt.hash(code, 10),
          used: false,
        },
      });
    }

    return codes;
  }
}
```

### Encryption at Rest

```typescript
// packages/encryption/src/crypto.ts
import { webcrypto } from 'crypto';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly SALT_LENGTH = 32;
  private static readonly TAG_LENGTH = 16;

  // Derive encryption key from master key
  private static async deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
    return (await scryptAsync(masterKey, salt, this.KEY_LENGTH)) as Buffer;
  }

  static async encrypt(plaintext: string): Promise<string> {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY!;

    // Generate random salt and IV
    const salt = randomBytes(this.SALT_LENGTH);
    const iv = randomBytes(this.IV_LENGTH);

    // Derive key
    const key = await this.deriveKey(masterKey, salt);

    // Encrypt
    const cipher = webcrypto.subtle.createCipheriv(this.ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    const tag = cipher.getAuthTag();

    // Combine salt + iv + tag + encrypted
    const combined = Buffer.concat([salt, iv, tag, encrypted]);

    return combined.toString('base64');
  }

  static async decrypt(ciphertext: string): Promise<string> {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY!;
    const combined = Buffer.from(ciphertext, 'base64');

    // Extract components
    const salt = combined.subarray(0, this.SALT_LENGTH);
    const iv = combined.subarray(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
    const tag = combined.subarray(
      this.SALT_LENGTH + this.IV_LENGTH,
      this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH
    );
    const encrypted = combined.subarray(this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH);

    // Derive key
    const key = await this.deriveKey(masterKey, salt);

    // Decrypt
    const decipher = webcrypto.subtle.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  }
}

// Usage in models
export class SensitiveDataRepository {
  async storePII(userId: string, data: PII) {
    await prisma.userData.create({
      data: {
        userId,
        ssnEncrypted: await EncryptionService.encrypt(data.ssn),
        creditCardEncrypted: await EncryptionService.encrypt(data.creditCard),
      },
    });
  }
}
```

---

## 4. DATABASE SECURITY

### Row-Level Security (PostgreSQL)

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_data ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY user_isolation ON users
  FOR ALL
  USING (id = current_setting('app.current_user_id')::uuid);

-- Policy: Admin can see all
CREATE POLICY admin_all_access ON users
  FOR ALL
  USING (
    current_setting('app.current_user_role') = 'admin'
  );

-- Policy: Support can only read
CREATE POLICY support_read_only ON customer_data
  FOR SELECT
  USING (
    current_setting('app.current_user_role') IN ('admin', 'support')
  );

-- Multi-tenant isolation
CREATE POLICY tenant_isolation ON orders
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  );
```

### Prisma Implementation

```typescript
// packages/database/src/client.ts
import { PrismaClient } from '@prisma/client';

export class SecurePrismaClient {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    // Log all queries for audit
    this.prisma.$on('query', (e) => {
      logger.debug('Database query', {
        query: e.query,
        params: e.params,
        duration: e.duration,
      });
    });
  }

  // Set RLS context before each query
  async withContext(userId: string, tenantId: string, role: string) {
    return this.prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await prisma.$transaction([
              prisma.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, TRUE)`,
              prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
              prisma.$executeRaw`SELECT set_config('app.current_user_role', ${role}, TRUE)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    });
  }
}

// Middleware usage
app.use(async (req, res, next) => {
  if (req.user) {
    req.db = await secureClient.withContext(req.user.id, req.user.tenantId, req.user.role);
  }
  next();
});
```

### Audit Logging

```sql
-- Audit log table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  tenant_id UUID,
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(100),
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  INDEX idx_audit_user (user_id, timestamp DESC),
  INDEX idx_audit_tenant (tenant_id, timestamp DESC),
  INDEX idx_audit_action (action, timestamp DESC)
);

-- Automatic audit triggers
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_log (
      user_id, action, table_name, record_id, old_values
    ) VALUES (
      current_setting('app.current_user_id')::uuid,
      'DELETE',
      TG_TABLE_NAME,
      OLD.id,
      row_to_json(OLD)
    );
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_log (
      user_id, action, table_name, record_id, old_values, new_values
    ) VALUES (
      current_setting('app.current_user_id')::uuid,
      'UPDATE',
      TG_TABLE_NAME,
      NEW.id,
      row_to_json(OLD),
      row_to_json(NEW)
    );
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_log (
      user_id, action, table_name, record_id, new_values
    ) VALUES (
      current_setting('app.current_user_id')::uuid,
      'INSERT',
      TG_TABLE_NAME,
      NEW.id,
      row_to_json(NEW)
    );
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply to sensitive tables
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

### Database Encryption

```sql
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypted columns
CREATE TABLE sensitive_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  ssn_encrypted BYTEA, -- Encrypted using pgp_sym_encrypt
  credit_card_encrypted BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Encryption functions
CREATE OR REPLACE FUNCTION encrypt_sensitive(plaintext TEXT)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(
    plaintext,
    current_setting('app.encryption_key')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_sensitive(ciphertext BYTEA)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    ciphertext,
    current_setting('app.encryption_key')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Database Backups

```bash
#!/bin/bash
# scripts/backup-database.sh

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_NAME="varai_production"

# Encrypted backup with pgp
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -U "${DB_USER}" \
  -Fc \
  "${DB_NAME}" | \
  gpg --encrypt --recipient "backup@varai.ai" \
  > "${BACKUP_DIR}/backup_${TIMESTAMP}.dump.gpg"

# Upload to GCS with encryption
gsutil -o "GSUtil:encryption_key=${GCS_ENCRYPTION_KEY}" \
  cp "${BACKUP_DIR}/backup_${TIMESTAMP}.dump.gpg" \
  "gs://varai-backups/db/"

# Verify backup
gsutil ls -L "gs://varai-backups/db/backup_${TIMESTAMP}.dump.gpg"

# Cleanup old backups (keep 30 days)
find "${BACKUP_DIR}" -name "*.dump.gpg" -mtime +30 -delete

echo "Backup completed: backup_${TIMESTAMP}.dump.gpg"
```

(Continued in next file...)
