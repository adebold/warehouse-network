# VARAi Platform - Enterprise Security-First Monorepo

> **Production-ready, security-hardened platform template for enterprise AI applications**

## 🎯 What You Get

A complete, security-first development platform with:

- ✅ **Multi-layered security** - Frontend, API, Backend, Database, Infrastructure
- ✅ **Zero-trust architecture** - Every request authenticated, authorized, and audited
- ✅ **Automated security scanning** - SAST, dependency, container, and secret scanning
- ✅ **SOC 2 & GDPR ready** - Built-in compliance controls
- ✅ **Enterprise monitoring** - Real-time threat detection and incident response
- ✅ **CI/CD hardened** - Signed commits, image signing, SBOM generation
- ✅ **Production tested** - Battle-tested patterns from 15M+ user platforms

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Security Layers                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend (React/Vite)                                       │
│  ├── Content Security Policy (CSP)                           │
│  ├── XSS Protection (DOMPurify)                             │
│  ├── CSRF Tokens                                             │
│  └── Secure Storage (Web Crypto API)                        │
│                                                              │
│  API Gateway (Express)                                       │
│  ├── Rate Limiting (Redis)                                   │
│  ├── Request Validation (Zod)                               │
│  ├── JWT Authentication (RS256)                             │
│  └── Security Headers (Helmet)                              │
│                                                              │
│  Backend (Node.js/PostgreSQL)                                │
│  ├── Row-Level Security (RLS)                               │
│  ├── Parameterized Queries (Prisma)                         │
│  ├── Encryption at Rest (AES-256-GCM)                       │
│  └── Audit Logging (PostgreSQL Triggers)                    │
│                                                              │
│  Infrastructure (GCP/K8s)                                    │
│  ├── Network Policies                                        │
│  ├── Cloud Armor WAF                                         │
│  ├── Secret Manager                                          │
│  └── Container Security (Trivy, Cosign)                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start (10 minutes)

### Prerequisites

```bash
# Required
- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- gcloud CLI
- git with GPG signing

# Optional
- GitHub CLI (gh)
- kubectl
- Terraform
```

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/varai/platform.git
cd platform

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
./scripts/setup.sh
```

### 2. Configure Secrets

```bash
# Generate encryption keys
openssl rand -base64 32 > .secrets/encryption-master-key
openssl genrsa -out .secrets/jwt-private.key 2048
openssl rsa -in .secrets/jwt-private.key -pubout -out .secrets/jwt-public.key

# Store in Secret Manager (production)
gcloud secrets create encryption-master-key --data-file .secrets/encryption-master-key
gcloud secrets create jwt-private-key --data-file .secrets/jwt-private.key
gcloud secrets create jwt-public-key --data-file .secrets/jwt-public.key
```

### 3. Start Development Environment

```bash
# Start all services with Docker Compose
docker-compose up -d

# Or start individual apps
pnpm dev

# Access:
# - Frontend: http://localhost:4200
# - API: http://localhost:3000
# - Admin: http://localhost:4201
```

### 4. Run Security Checks

```bash
# Full security scan
pnpm security:check

# Individual scans
pnpm security:sast        # Static analysis
pnpm security:deps        # Dependency vulnerabilities
pnpm security:secrets     # Secret scanning
pnpm security:containers  # Container scanning
```

## 📁 Project Structure

```
varai-platform/
├── .github/
│   ├── workflows/          # CI/CD pipelines
│   │   ├── ci.yml         # Main CI pipeline
│   │   ├── security.yml   # Security scanning
│   │   └── deploy.yml     # Deployment
│   └── CODEOWNERS         # Code review requirements
│
├── apps/
│   ├── enterprise-platform/  # Main B2B application
│   ├── admin-dashboard/      # Internal admin tools
│   └── api-server/           # Backend API
│
├── packages/
│   ├── auth/              # Authentication & authorization
│   ├── encryption/        # Encryption utilities
│   ├── security/          # Security middleware
│   ├── logging/           # Structured logging
│   ├── monitoring/        # Metrics & alerting
│   ├── database/          # Database client & migrations
│   ├── ui/                # Shared UI components
│   ├── config/            # Shared configs (ESLint, TS, etc.)
│   └── types/             # Shared TypeScript types
│
├── docker/
│   ├── base.Dockerfile    # Base image
│   ├── app.Dockerfile     # Frontend apps
│   └── api.Dockerfile     # Backend API
│
├── k8s/                   # Kubernetes manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
│
├── terraform/             # Infrastructure as Code
│   ├── main.tf
│   ├── vpc.tf
│   └── gke.tf
│
├── scripts/
│   ├── setup.sh           # Initial setup
│   ├── deploy.sh          # Deployment script
│   ├── rotate-secrets.ts  # Secret rotation
│   └── backup-db.sh       # Database backup
│
├── docs/
│   ├── SECURITY_ARCHITECTURE.md
│   ├── SECURITY_INFRASTRUCTURE.md
│   ├── SECURITY_MONITORING.md
│   └── SECURITY_IMPLEMENTATION.md
│
├── docker-compose.yml     # Local development
├── nx.json                # Nx configuration
├── package.json           # Root package.json
└── pnpm-workspace.yaml    # pnpm workspaces
```

## 🛡️ Security Features

### Authentication & Authorization

- ✅ JWT with RS256 (asymmetric keys)
- ✅ Refresh token rotation
- ✅ Multi-factor authentication (TOTP)
- ✅ Role-based access control (RBAC)
- ✅ Session management with Redis
- ✅ Token revocation list
- ✅ Account lockout after failed attempts

### Data Protection

- ✅ Encryption at rest (AES-256-GCM)
- ✅ Encryption in transit (TLS 1.3)
- ✅ Row-level security (PostgreSQL RLS)
- ✅ Parameterized queries (SQL injection prevention)
- ✅ Input validation (Zod schemas)
- ✅ Output sanitization (DOMPurify)
- ✅ Sensitive data masking in logs

### Infrastructure Security

- ✅ Non-root containers
- ✅ Read-only root filesystem
- ✅ Security contexts (K8s)
- ✅ Network policies
- ✅ Cloud Armor WAF
- ✅ DDoS protection
- ✅ VPC with private subnets

### Monitoring & Response

- ✅ Real-time threat detection
- ✅ Brute force protection
- ✅ Credential stuffing detection
- ✅ Anomaly detection
- ✅ Automated incident response
- ✅ Security event logging
- ✅ Audit trail (immutable)

### Compliance

- ✅ SOC 2 controls implemented
- ✅ GDPR compliance (data export/deletion)
- ✅ Automated audit reports
- ✅ Access reviews (quarterly)
- ✅ Security training materials
- ✅ Incident response playbooks

## 📊 Development Workflow

### Creating a New Feature

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes...

# Run tests and security checks
pnpm test
pnpm security:check

# Commit (GPG signed)
git commit -S -m "feat: add new feature"

# Push and create PR
git push origin feature/my-feature
gh pr create
```

### Adding a New Package

```bash
# Generate new package
pnpm nx g @nx/node:library my-package --directory=packages/my-package

# Install dependencies
cd packages/my-package
pnpm add <dependencies>

# Build and test
pnpm nx build my-package
pnpm nx test my-package
```

### Running Security Scans

```bash
# Before every commit
pnpm security:check

# Before every deploy
pnpm security:full

# Scheduled (CI/CD runs daily)
# - Dependency updates
# - Security patches
# - Vulnerability scanning
```

## 🔧 Configuration

### Environment Variables

**Development (.env.local)**

```bash
NODE_ENV=development
DATABASE_URL=postgresql://dev:dev@localhost:5432/varai_dev
REDIS_URL=redis://localhost:6379
LOG_LEVEL=debug
```

**Production (Secret Manager)**

```bash
DATABASE_URL=<secret>
REDIS_URL=<secret>
JWT_PRIVATE_KEY=<secret>
JWT_PUBLIC_KEY=<secret>
ENCRYPTION_MASTER_KEY=<secret>
```

### Security Headers

All apps include comprehensive security headers:

```typescript
{
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': '...',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()'
}
```

## 📈 Monitoring

### Dashboards

Access monitoring dashboards:

- **Security Dashboard**: https://console.cloud.google.com/monitoring/dashboards/security
- **Application Dashboard**: https://console.cloud.google.com/monitoring/dashboards/app
- **Infrastructure Dashboard**: https://console.cloud.google.com/monitoring/dashboards/infra

### Alerts

Critical alerts are sent to:

- PagerDuty (Security incidents)
- Slack #security-alerts
- Email (security@varai.ai)

### Metrics

Key security metrics tracked:

- Failed login attempts
- Rate limit violations
- Security incidents
- Vulnerability count
- Time to patch

## 🚨 Incident Response

### Emergency Procedures

**Account Compromise:**

```bash
# Revoke all sessions
pnpm incident:revoke-sessions <userId>

# Lock account
pnpm incident:lock-account <userId> "Security incident"

# Investigate
pnpm incident:audit <userId>
```

**Data Breach:**

```bash
# Enable circuit breaker
pnpm incident:circuit-breaker <service> "Data breach containment"

# Create forensic snapshot
pnpm incident:snapshot <instance-id>

# Generate incident report
pnpm incident:report <incident-id>
```

**DDoS Attack:**

```bash
# Already automated via Cloud Armor
# Manual override if needed:
gcloud compute security-policies update varai-policy \
  --enable-rate-based-ban
```

### Contact Information

- **Security Team**: security@varai.ai
- **PagerDuty**: +1-XXX-XXX-XXXX
- **On-call**: See PagerDuty schedule

## 🎓 Training Resources

### Required Reading

1. OWASP Top 10 (https://owasp.org/Top10/)
2. Security Implementation Guide (docs/SECURITY_IMPLEMENTATION.md)
3. Incident Response Playbooks (docs/playbooks/)

### Training Videos

- [ ] Secure Coding Best Practices (1 hour)
- [ ] Threat Detection & Response (45 min)
- [ ] GDPR & SOC 2 Compliance (30 min)

### Practice Scenarios

- [ ] Account compromise simulation
- [ ] Data breach response
- [ ] Security audit preparation

## 📝 Contributing

### Security Guidelines

1. **Never commit secrets** - Use Secret Manager
2. **Always validate inputs** - Use Zod schemas
3. **Sanitize outputs** - Use DOMPurify
4. **Parameterize queries** - Use Prisma
5. **Log security events** - Use SecurityLogger
6. **Test security** - Write security tests

### Code Review Checklist

Before approving PRs:

- [ ] No hardcoded secrets
- [ ] All inputs validated
- [ ] Parameterized queries
- [ ] Security headers present
- [ ] Error handling proper
- [ ] Tests include security scenarios
- [ ] Documentation updated

## 📄 License

Proprietary - © 2025 VARAi Inc.

## 🆘 Support

- **Documentation**: docs/
- **Issues**: GitHub Issues
- **Security**: security@varai.ai (PGP key available)
- **Enterprise Support**: enterprise@varai.ai

---

Built with ❤️ and 🔒 by the VARAi team
