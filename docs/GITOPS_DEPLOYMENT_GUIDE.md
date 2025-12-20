# GitOps Deployment Guide

## Overview

This guide covers the complete GitOps CI/CD pipeline for the Warehouse Network application, deploying to Google Cloud Platform using Cloud Run, Cloud SQL, and Redis.

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   GitHub Actions   │───▶│   Google Cloud      │───▶│   Production App    │
│   CI/CD Pipeline    │    │   Infrastructure    │    │   warehouse-network │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Security Scanning   │    │ Cloud SQL Postgres │    │ Health Monitoring   │
│ Quality Gates       │    │ Redis Cache        │    │ Performance Metrics │
│ Testing Suite       │    │ Secret Management  │    │ Auto-scaling       │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Prerequisites

### 1. Google Cloud Setup

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
gcloud auth login
gcloud config set project easyreno-demo-20251219144606
```

### 2. Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com
```

### 3. Create Service Account for GitHub Actions

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding easyreno-demo-20251219144606 \
  --member="serviceAccount:github-actions@easyreno-demo-20251219144606.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding easyreno-demo-20251219144606 \
  --member="serviceAccount:github-actions@easyreno-demo-20251219144606.iam.gserviceaccount.com" \
  --role="roles/sql.admin"

gcloud projects add-iam-policy-binding easyreno-demo-20251219144606 \
  --member="serviceAccount:github-actions@easyreno-demo-20251219144606.iam.gserviceaccount.com" \
  --role="roles/redis.admin"

gcloud projects add-iam-policy-binding easyreno-demo-20251219144606 \
  --member="serviceAccount:github-actions@easyreno-demo-20251219144606.iam.gserviceaccount.com" \
  --role="roles/secretmanager.admin"

gcloud projects add-iam-policy-binding easyreno-demo-20251219144606 \
  --member="serviceAccount:github-actions@easyreno-demo-20251219144606.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Generate key file
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@easyreno-demo-20251219144606.iam.gserviceaccount.com
```

### 4. Setup GitHub Secrets

In your GitHub repository, add the following secrets:

```bash
# Required secrets
GCP_SA_KEY=$(cat github-actions-key.json | base64)
DB_PASSWORD=$(openssl rand -base64 32)
NEXTAUTH_SECRET=$(openssl rand -base64 64)

# Optional secrets for production features
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

## Deployment Pipeline

### 1. Automated Testing

Every push and PR triggers:

```yaml
- Security scanning with Trivy
- Unit tests with Jest
- Integration tests with PostgreSQL/Redis
- Code coverage reporting
- Build validation
```

### 2. Infrastructure Provisioning

On main branch:

```bash
terraform init
terraform plan
terraform apply
```

Creates:
- Cloud SQL PostgreSQL database
- Redis instance
- Secret Manager secrets
- Cloud Run service
- IAM roles and permissions

### 3. Application Deployment

```yaml
- Build Docker image with multi-stage optimization
- Push to Google Container Registry
- Deploy to Cloud Run with:
  - 2 CPU cores, 2GB memory
  - Auto-scaling 1-100 instances
  - Health checks and monitoring
  - Environment-specific configuration
```

## Manual Deployment (Emergency)

If GitHub Actions is unavailable:

```bash
# 1. Build and push image
cd apps/web
docker build -f Dockerfile.production -t gcr.io/easyreno-demo-20251219144606/warehouse-network:manual .
docker push gcr.io/easyreno-demo-20251219144606/warehouse-network:manual

# 2. Deploy infrastructure
cd ../../terraform/environments/gcp-production
terraform init
terraform apply

# 3. Deploy application
gcloud run deploy warehouse-network-app \
  --image gcr.io/easyreno-demo-20251219144606/warehouse-network:manual \
  --region us-central1 \
  --allow-unauthenticated
```

## Environment Management

### Production Environment
- **URL**: https://warehouse-network-app-easyreno-demo-20251219144606.us-central1.run.app
- **Database**: Cloud SQL PostgreSQL 15
- **Cache**: Redis 7.0
- **Monitoring**: Cloud Monitoring + Logging

### Staging Environment (PR Previews)
- **URL**: https://warehouse-network-app-staging-pr-{number}-easyreno-demo-20251219144606.us-central1.run.app
- **Auto-cleanup**: On PR close
- **Resources**: Lower CPU/memory allocation

## Monitoring and Alerting

### Health Checks
```bash
# Application health
curl https://warehouse-network-app-easyreno-demo-20251219144606.us-central1.run.app/api/health

# Expected response
{
  "status": "healthy",
  "database": "connected",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Key Metrics
- Response time < 200ms
- Error rate < 1%
- Availability > 99.9%
- Database connections healthy
- Redis cache hit ratio > 80%

## Security Features

### Container Security
- Non-root user execution
- Minimal Alpine base image
- Security vulnerability scanning
- Regular dependency updates

### Application Security
- JWT authentication
- HTTPS enforcement
- Security headers (HSTS, CSP, etc.)
- SQL injection protection
- Rate limiting

### Infrastructure Security
- Private networking
- Encrypted storage
- Secret management
- IAM least privilege

## Troubleshooting

### Common Issues

1. **Build Failures**
```bash
# Check GitHub Actions logs
# Verify Docker build locally
docker build -f apps/web/Dockerfile.production .
```

2. **Database Connection Issues**
```bash
# Check Cloud SQL instance status
gcloud sql instances describe warehouse-network-production

# Test connection
gcloud sql connect warehouse-network-production --user=warehouse
```

3. **Redis Connection Issues**
```bash
# Check Redis instance
gcloud redis instances describe warehouse-network-production --region=us-central1
```

4. **Deployment Failures**
```bash
# Check Cloud Run logs
gcloud logs read --service=warehouse-network-app --limit=50
```

## Performance Optimization

### Docker Image Optimization
- Multi-stage builds
- Layer caching
- Minimal dependencies
- Security scanning

### Application Performance
- Next.js optimizations
- Database connection pooling
- Redis caching strategy
- CDN integration ready

### Infrastructure Performance
- Auto-scaling configuration
- CPU/Memory optimization
- Regional deployment
- Health check tuning

## Disaster Recovery

### Backup Strategy
- Automated database backups (7-day retention)
- Infrastructure as Code (Terraform)
- Container image versioning
- Configuration in Git

### Recovery Procedures
1. Infrastructure recovery via Terraform
2. Application deployment via GitHub Actions
3. Database restore from backup
4. DNS/Traffic routing update

## Cost Optimization

### Resource Management
- CPU idle scaling
- Memory optimization
- Auto-scaling thresholds
- Spot instance usage for builds

### Monitoring Costs
```bash
# Check current usage
gcloud billing accounts list
gcloud billing projects describe easyreno-demo-20251219144606
```

## Next Steps

1. **Set up monitoring dashboards**
2. **Configure alerting rules** 
3. **Implement Blue/Green deployments**
4. **Add performance testing**
5. **Set up disaster recovery testing**

---

This GitOps pipeline provides enterprise-grade deployment with:
✅ Automated testing and security scanning
✅ Infrastructure as Code with Terraform
✅ Container-based deployment with Docker
✅ Production-ready monitoring and alerting
✅ Proper secret management and security
✅ PR preview environments
✅ Rollback capabilities
✅ Cost optimization