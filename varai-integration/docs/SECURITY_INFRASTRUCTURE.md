# VARAi Platform - Security Architecture (Part 2)

## 5. INFRASTRUCTURE SECURITY

### Docker Security

```dockerfile
# docker/secure-base.Dockerfile
# Multi-stage build with security hardening

# Build stage
FROM node:20-alpine AS builder

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install dependencies with integrity checking
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production \
    --no-audit \
    --no-fund \
    --ignore-scripts

# Copy source
COPY --chown=nodejs:nodejs . .

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install security updates
RUN apk upgrade --no-cache && \
    apk add --no-cache \
    dumb-init \
    curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy only necessary files
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Remove unnecessary files
RUN rm -rf /tmp/* /var/cache/apk/*

# Set read-only root filesystem
# Actual implementation in docker-compose or k8s

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

# Security labels
LABEL security.scan="trivy" \
      security.signed="cosign"
```

### Docker Compose Security

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    image: varai/api:${VERSION}
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: true
    tmpfs:
      - /tmp
      - /var/run
    user: '1001:1001'
    environment:
      NODE_ENV: production
    secrets:
      - db_password
      - jwt_private_key
      - encryption_master_key
    networks:
      - backend
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3

  postgres:
    image: postgres:15-alpine
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
      - /var/run/postgresql
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
      POSTGRES_INITDB_ARGS: '--auth-host=scram-sha-256'
    volumes:
      - postgres_data:/var/lib/postgresql/data:rw
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    secrets:
      - db_password
    networks:
      - backend
    command:
      - 'postgres'
      - '-c'
      - 'ssl=on'
      - '-c'
      - 'ssl_cert_file=/etc/ssl/certs/server.crt'
      - '-c'
      - 'ssl_key_file=/etc/ssl/private/server.key'

networks:
  backend:
    driver: bridge
    internal: true
  frontend:
    driver: bridge

secrets:
  db_password:
    external: true
  jwt_private_key:
    external: true
  encryption_master_key:
    external: true

volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: none
      o: bind,encryption
      device: /encrypted/postgres
```

### Kubernetes Security

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: varai-api
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: varai-api
  template:
    metadata:
      labels:
        app: varai-api
      annotations:
        seccomp.security.alpha.kubernetes.io/pod: 'runtime/default'
    spec:
      serviceAccountName: varai-api-sa
      automountServiceAccountToken: true

      # Security Context
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault

      containers:
        - name: api
          image: gcr.io/varai-platform/api:v1.0.0
          imagePullPolicy: Always

          # Container Security Context
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1001
            capabilities:
              drop:
                - ALL
              add:
                - NET_BIND_SERVICE

          # Resource Limits
          resources:
            requests:
              memory: '1Gi'
              cpu: '500m'
            limits:
              memory: '2Gi'
              cpu: '2000m'

          # Probes
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5

          # Environment from Secrets
          envFrom:
            - secretRef:
                name: varai-api-secrets

          # Volume Mounts
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: cache
              mountPath: /app/.cache

      # Volumes
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir: {}

      # Node Affinity & Tolerations
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchExpressions:
                  - key: app
                    operator: In
                    values:
                      - varai-api
              topologyKey: kubernetes.io/hostname

---
# Network Policy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: varai-api-netpol
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: varai-api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: production
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443 # HTTPS for external APIs

---
# Pod Security Policy
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  hostNetwork: false
  hostIPC: false
  hostPID: false
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  supplementalGroups:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
  readOnlyRootFilesystem: true
```

### GCP Security Configuration

```typescript
// terraform/gcp-security.tf
resource "google_project_iam_custom_role" "varai_app_role" {
  role_id     = "varaiAppRole"
  title       = "VARAi Application Role"
  description = "Minimal permissions for VARAi applications"

  permissions = [
    "storage.objects.get",
    "storage.objects.create",
    "cloudtrace.traces.patch",
    "logging.logEntries.create"
  ]
}

# VPC with Private Google Access
resource "google_compute_network" "varai_vpc" {
  name                    = "varai-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "private_subnet" {
  name          = "varai-private-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = "us-central1"
  network       = google_compute_network.varai_vpc.id

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Cloud Armor (DDoS Protection & WAF)
resource "google_compute_security_policy" "varai_policy" {
  name = "varai-security-policy"

  # Rate limiting
  rule {
    action   = "rate_based_ban"
    priority = "1000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"

      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }

      ban_duration_sec = 600
    }
  }

  # SQL Injection protection
  rule {
    action   = "deny(403)"
    priority = "2000"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
  }

  # XSS protection
  rule {
    action   = "deny(403)"
    priority = "3000"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
  }

  # Default allow
  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}

# Cloud KMS for encryption keys
resource "google_kms_key_ring" "varai_keyring" {
  name     = "varai-keyring"
  location = "us-central1"
}

resource "google_kms_crypto_key" "database_key" {
  name     = "database-encryption-key"
  key_ring = google_kms_key_ring.varai_keyring.id

  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

# Secret Manager
resource "google_secret_manager_secret" "db_password" {
  secret_id = "database-password"

  replication {
    automatic = true
  }

  labels = {
    environment = "production"
    managed_by  = "terraform"
  }
}
```

---

## 6. GITOPS SECURITY

### GitHub Actions Security

```yaml
# .github/workflows/secure-ci.yml
name: Secure CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

# Restrict permissions
permissions:
  contents: read
  security-events: write
  packages: write

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for better scanning

      # Verify commit signatures
      - name: Verify GPG signatures
        run: |
          git verify-commit HEAD || {
            echo "❌ Unsigned commit detected"
            exit 1
          }

      # Secret scanning
      - name: Gitleaks Secret Scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # SAST - Static Application Security Testing
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/nodejs
            p/typescript
            p/react

      # Dependency vulnerability scanning
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

      # License compliance
      - name: FOSSA License Scan
        uses: fossas/fossa-action@main
        with:
          api-key: ${{ secrets.FOSSA_API_KEY }}

      # Container scanning
      - name: Build image for scanning
        run: docker build -t varai/api:${{ github.sha }} .

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: varai/api:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

      # Sign container image
      - name: Install Cosign
        uses: sigstore/cosign-installer@v3

      - name: Sign container image
        run: |
          cosign sign --key env://COSIGN_KEY varai/api:${{ github.sha }}
        env:
          COSIGN_KEY: ${{ secrets.COSIGN_PRIVATE_KEY }}
          COSIGN_PASSWORD: ${{ secrets.COSIGN_PASSWORD }}

      # SBOM Generation
      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: varai/api:${{ github.sha }}
          format: spdx-json
          output-file: sbom.spdx.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v3
        with:
          name: sbom
          path: sbom.spdx.json

  build-and-deploy:
    needs: security-scan
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    # OIDC for keyless authentication to GCP
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - name: Build and push
        run: |
          docker build -t gcr.io/varai-platform/api:${{ github.sha }} .
          docker push gcr.io/varai-platform/api:${{ github.sha }}

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy varai-api \
            --image gcr.io/varai-platform/api:${{ github.sha }} \
            --region us-central1 \
            --platform managed \
            --no-allow-unauthenticated \
            --service-account varai-api@varai-platform.iam.gserviceaccount.com \
            --vpc-connector varai-vpc-connector \
            --set-env-vars NODE_ENV=production
```

### Branch Protection Rules

```yaml
# .github/branch-protection.json
{
  'required_status_checks':
    { 'strict': true, 'contexts': ['security-scan', 'unit-tests', 'integration-tests', 'build'] },
  'enforce_admins': true,
  'required_pull_request_reviews':
    {
      'dismissal_restrictions': { 'users': [], 'teams': ['security-team'] },
      'dismiss_stale_reviews': true,
      'require_code_owner_reviews': true,
      'required_approving_review_count': 2,
    },
  'required_signatures': true,
  'restrictions': { 'users': [], 'teams': ['platform-team'], 'apps': [] },
}
```

### CODEOWNERS

```
# .github/CODEOWNERS

# Security-sensitive files require security team approval
**/secrets/** @varai/security-team
**/auth/** @varai/security-team
**/*.key @varai/security-team
**/.env* @varai/security-team

# Infrastructure requires platform team approval
/terraform/** @varai/platform-team @varai/security-team
/k8s/** @varai/platform-team
/.github/workflows/** @varai/platform-team

# Database migrations require DBA approval
**/migrations/** @varai/dba-team @varai/platform-team

# API changes require API team approval
/packages/api-gateway/** @varai/api-team
/apps/api-server/** @varai/api-team
```

### Git Commit Signing

```bash
# scripts/setup-commit-signing.sh
#!/bin/bash

echo "🔐 Setting up GPG commit signing..."

# Generate GPG key
gpg --full-generate-key

# Get key ID
KEY_ID=$(gpg --list-secret-keys --keyid-format LONG | grep sec | awk '{print $2}' | cut -d'/' -f2)

# Configure Git
git config --global user.signingkey $KEY_ID
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# Add to GitHub
echo "Add this public key to GitHub:"
gpg --armor --export $KEY_ID

echo "✅ GPG signing configured"
```

---

## 7. SECRETS MANAGEMENT

### Google Secret Manager Integration

```typescript
// packages/secrets/src/secret-manager.ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export class SecretManager {
  private client: SecretManagerServiceClient;
  private projectId: string;
  private cache: Map<string, { value: string; expires: number }>;

  constructor() {
    this.client = new SecretManagerServiceClient();
    this.projectId = process.env.GCP_PROJECT_ID!;
    this.cache = new Map();
  }

  async getSecret(secretName: string): Promise<string> {
    // Check cache first (TTL: 5 minutes)
    const cached = this.cache.get(secretName);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    // Fetch from Secret Manager
    const name = `projects/${this.projectId}/secrets/${secretName}/versions/latest`;

    const [version] = await this.client.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString();

    if (!payload) {
      throw new Error(`Secret ${secretName} not found`);
    }

    // Cache for 5 minutes
    this.cache.set(secretName, {
      value: payload,
      expires: Date.now() + 5 * 60 * 1000,
    });

    return payload;
  }

  async rotateSecret(secretName: string, newValue: string): Promise<void> {
    const parent = `projects/${this.projectId}/secrets/${secretName}`;

    // Add new version
    await this.client.addSecretVersion({
      parent,
      payload: {
        data: Buffer.from(newValue, 'utf8'),
      },
    });

    // Invalidate cache
    this.cache.delete(secretName);

    // Audit log
    logger.info('Secret rotated', { secretName });
  }

  async destroySecretVersion(secretName: string, version: string): Promise<void> {
    const name = `projects/${this.projectId}/secrets/${secretName}/versions/${version}`;

    await this.client.destroySecretVersion({ name });

    logger.warn('Secret version destroyed', { secretName, version });
  }
}

// Singleton instance
export const secretManager = new SecretManager();
```

### Environment Variable Loading

```typescript
// packages/config/src/env.ts
import { z } from 'zod';
import { secretManager } from '@varai/secrets';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_PUBLIC_KEY: z.string(),
  JWT_PRIVATE_KEY: z.string(),
  ENCRYPTION_MASTER_KEY: z.string().min(32),
  GCP_PROJECT_ID: z.string(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export async function loadEnvironment(): Promise<Env> {
  // Load from Secret Manager in production
  if (process.env.NODE_ENV === 'production') {
    const secrets = await Promise.all([
      secretManager.getSecret('database-url'),
      secretManager.getSecret('redis-url'),
      secretManager.getSecret('jwt-private-key'),
      secretManager.getSecret('jwt-public-key'),
      secretManager.getSecret('encryption-master-key'),
    ]);

    process.env.DATABASE_URL = secrets[0];
    process.env.REDIS_URL = secrets[1];
    process.env.JWT_PRIVATE_KEY = secrets[2];
    process.env.JWT_PUBLIC_KEY = secrets[3];
    process.env.ENCRYPTION_MASTER_KEY = secrets[4];
  }

  // Validate environment
  const env = EnvSchema.parse(process.env);

  // Never log secrets
  logger.info('Environment loaded', {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
  });

  return env;
}
```

### Secret Rotation

```typescript
// scripts/rotate-secrets.ts
import { secretManager } from '@varai/secrets';
import { webcrypto } from 'crypto';

async function rotateJWTKeys() {
  console.log('🔄 Rotating JWT keys...');

  // Generate new RSA key pair
  const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  // Export keys
  const publicKeyPem = await exportPublicKey(publicKey);
  const privateKeyPem = await exportPrivateKey(privateKey);

  // Store new keys
  await secretManager.rotateSecret('jwt-public-key', publicKeyPem);
  await secretManager.rotateSecret('jwt-private-key', privateKeyPem);

  console.log('✅ JWT keys rotated');
}

async function rotateEncryptionKey() {
  console.log('🔄 Rotating encryption key...');

  // Generate new encryption key
  const newKey = webcrypto.randomBytes(32).toString('base64');

  // This requires re-encrypting all sensitive data
  // Should be done during maintenance window

  await secretManager.rotateSecret('encryption-master-key', newKey);

  console.log('✅ Encryption key rotated');
  console.log('⚠️  WARNING: Re-encrypt all sensitive data!');
}

// Run rotation
(async () => {
  await rotateJWTKeys();
  // await rotateEncryptionKey(); // Manual trigger only
})();
```

(Continued in monitoring file...)
