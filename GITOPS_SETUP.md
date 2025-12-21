# GitOps CI/CD Pipeline Setup

## Architecture Overview

This warehouse network application uses a comprehensive GitOps CI/CD pipeline with multiple environments:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Development │    │   Staging   │    │ Production  │
│   (develop) │────│ (staging)   │────│   (main)    │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Auto Deploy │    │Auto Deploy +│    │Manual Approval│
│             │    │Integration  │    │+ GitOps     │
│             │    │Tests        │    │Updates      │
└─────────────┘    └─────────────┘    └─────────────┘
```

## Environment Structure

### 1. Development Environment
- **Trigger**: Push to `develop` branch
- **Auto-deploy**: Yes
- **Database**: Local PostgreSQL
- **Features**: Hot reload, debugging enabled
- **URL**: `https://warehouse-dev-[project].us-central1.run.app`

### 2. Staging Environment
- **Trigger**: Push to `staging` branch
- **Auto-deploy**: Yes (with integration tests)
- **Database**: Staging PostgreSQL
- **Features**: Production-like, with enhanced logging
- **URL**: `https://warehouse-staging-[project].us-central1.run.app`

### 3. Production Environment
- **Trigger**: Push to `main` branch
- **Auto-deploy**: Manual approval required
- **Database**: Production PostgreSQL
- **Features**: Optimized, secure, monitored
- **URL**: `https://warehouse.ai-industries.com`

## Quick Start

### 1. Clone and Setup
```bash
git clone https://github.com/adebold/warehouse-network.git
cd warehouse-network
```

### 2. Local Development
```bash
cd docker/dev
cp .env.example .env
docker-compose up
```

Access:
- App: http://localhost:3000
- Database Admin: http://localhost:8080

### 3. Required Secrets

Configure in GitHub Settings → Secrets and variables → Actions:

```bash
# Google Cloud Projects (separate for each environment)
GCP_PROJECT_ID_DEV=warehouse-dev-[id]
GCP_PROJECT_ID_STAGING=warehouse-staging-[id]
GCP_PROJECT_ID_PROD=warehouse-prod-[id]

# Service Account Keys (JSON format)
GCP_SA_KEY_DEV={"type": "service_account"...}
GCP_SA_KEY_STAGING={"type": "service_account"...}
GCP_SA_KEY_PROD={"type": "service_account"...}

# Environment Variables
DATABASE_URL_DEV=postgresql://...
DATABASE_URL_STAGING=postgresql://...
DATABASE_URL_PROD=postgresql://...
```

### 4. Environment Protection Rules

In GitHub Settings → Environments:

**Development:**
- No protection rules (auto-deploy)

**Staging:**
- Auto-deploy with integration tests

**Production:**
- Required reviewers (minimum 1)
- Restrict pushes to protected branches
- Wait timer: 5 minutes

## CI/CD Pipeline Features

### ✅ Continuous Integration
- Automated testing (unit, integration, e2e)
- Code quality checks (ESLint, Prettier)
- Type checking (TypeScript)
- Security scanning (Trivy)
- Dependency vulnerability checks

### ✅ Multi-Environment Deployments
- Environment-specific Docker builds
- Automated staging deployments
- Manual production approvals
- Health check verification

### ✅ GitOps Operations
- Automated rollbacks
- Blue-green deployments
- Canary releases (production)
- Infrastructure as code

### ✅ Monitoring & Observability
- Application health checks
- Performance monitoring
- Error tracking
- Deployment notifications

## Deployment Workflow

### Development Workflow
1. Create feature branch from `develop`
2. Make changes and push
3. Create PR to `develop`
4. After merge, auto-deploy to dev environment

### Staging Workflow
1. Create PR from `develop` to `staging`
2. After merge, auto-deploy to staging
3. Run integration tests
4. Manual testing and validation

### Production Workflow
1. Create PR from `staging` to `main`
2. After merge, await manual approval
3. Deploy to production with monitoring
4. Create release tag
5. Update GitOps repository

## Rollback Procedures

### Automatic Rollbacks
- Health check failures trigger automatic rollback
- Failed deployments revert to previous version

### Manual Rollbacks
```bash
# Via GitHub Actions
1. Go to Actions → Rollback Deployment
2. Select environment and target revision
3. Approve and monitor rollback

# Via CLI
gcloud run services update-traffic warehouse-prod \
  --region=us-central1 \
  --to-revisions=PREVIOUS_REVISION=100
```

## Security Best Practices

### Container Security
- Multi-stage Docker builds
- Non-root user execution
- Minimal base images (Alpine Linux)
- Regular security scanning

### Environment Security
- Separate GCP projects per environment
- IAM least-privilege access
- Environment-specific service accounts
- Secret management via Google Secret Manager

### Pipeline Security
- Branch protection rules
- Required code reviews
- Signed commits (optional)
- Automated vulnerability scanning

## Monitoring & Alerts

### Health Checks
- Application: `/api/health`
- Database connectivity
- External service dependencies

### Performance Monitoring
- Response time tracking
- Error rate monitoring
- Resource utilization

### Alerting
- Deployment failures
- Health check failures
- Performance degradation
- Security vulnerabilities

## Troubleshooting

### Common Issues

**1. Build Failures**
```bash
# Check build logs
gh run list --limit 5
gh run view [run-id] --log
```

**2. Deployment Failures**
```bash
# Check Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50
```

**3. Permission Issues**
```bash
# Verify service account permissions
gcloud projects get-iam-policy [project-id]
```

### Support Contacts
- DevOps Team: devops@ai-industries.com
- Platform Team: platform@ai-industries.com
- On-call: pager@ai-industries.com

## Next Steps

1. **Set up monitoring dashboard** (Grafana/DataDog)
2. **Configure alerting** (PagerDuty/Slack)
3. **Implement backup strategies**
4. **Set up disaster recovery**
5. **Create runbooks for common operations**

---

**Last Updated**: December 2025
**Version**: 1.0.0
**Maintainer**: AI Industries DevOps Team