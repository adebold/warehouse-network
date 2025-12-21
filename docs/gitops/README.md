# GitOps Setup for Warehouse Network

This document describes the complete GitOps setup for the Warehouse Network application.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Workflows](#workflows)
- [Deployment Process](#deployment-process)
- [Security](#security)
- [Monitoring](#monitoring)
- [Disaster Recovery](#disaster-recovery)
- [Best Practices](#best-practices)

## Overview

Our GitOps implementation follows industry best practices with:

- **Continuous Integration**: Automated testing, security scanning, and quality gates
- **Continuous Deployment**: Automated deployments to staging and production
- **Infrastructure as Code**: Terraform for cloud resources, Kubernetes manifests for applications
- **Security First**: Multiple layers of security scanning and secret management
- **Observability**: Comprehensive monitoring and alerting

## Architecture

### Components

1. **GitHub Actions**: CI/CD orchestration
2. **AWS EKS**: Kubernetes hosting
3. **GitHub Container Registry**: Docker image storage
4. **Terraform**: Infrastructure provisioning
5. **Kustomize**: Kubernetes manifest management
6. **Prometheus/Grafana**: Monitoring stack
7. **AWS CloudWatch**: Log aggregation

### Environments

- **Development**: Local development with Docker Compose
- **Staging**: Pre-production environment for testing
- **Production**: Blue-green deployment for zero-downtime releases

## Prerequisites

### Tools Required

```bash
# Install required tools
brew install gh terraform kubectl kustomize helm aws-cli

# Configure GitHub CLI
gh auth login

# Configure AWS CLI
aws configure
```

### AWS Resources

- EKS Cluster
- RDS PostgreSQL
- ElastiCache Redis
- S3 Buckets
- CloudFront Distribution
- Route 53 Hosted Zone

## Initial Setup

### 1. Set up GitHub Secrets

Run the setup script:

```bash
./scripts/setup-secrets.sh
```

This will configure:

- AWS credentials
- Slack webhooks
- API tokens
- Monitoring credentials

### 2. Initialize Terraform

```bash
# Initialize backend
cd terraform/environments/production
terraform init

# Create infrastructure
terraform plan
terraform apply
```

### 3. Configure Kubernetes

```bash
# Update kubeconfig
aws eks update-kubeconfig --name warehouse-network-prod

# Install ingress controller
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# Install cert-manager
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

# Install monitoring stack
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f monitoring/prometheus/values.yaml
```

## Workflows

### CI Pipeline

Triggered on every push and PR:

1. **Quality Gates**: Linting, formatting, type checking
2. **Security Scanning**: Trivy, OWASP, npm audit
3. **Testing**: Unit, integration, and E2E tests
4. **Build**: Application and Docker image builds
5. **Analysis**: SonarQube code quality analysis

### CD Pipelines

#### Staging Deployment

Triggered on push to `develop`:

1. Deploy to staging EKS cluster
2. Run smoke tests
3. Execute integration tests
4. Send Slack notifications

#### Production Deployment

Triggered on release creation:

1. Pre-deployment checks
2. Manual approval (optional)
3. Blue-green deployment
4. Health verification
5. Post-deployment tasks

### Security Pipeline

Runs daily and on every PR:

1. CodeQL analysis
2. Dependency review
3. Secret scanning
4. Container vulnerability scanning
5. Infrastructure security checks
6. License compliance

### Emergency Rollback

Manual workflow for rapid rollback:

1. Validate rollback parameters
2. Request approval
3. Execute rollback (blue-green switch)
4. Verify health
5. Create incident report

## Deployment Process

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature

# Create PR
gh pr create --base develop

# After review and merge, automatic deployment to staging
```

### Release Process

```bash
# Create release branch
git checkout -b release/v1.2.0 develop

# Update version
npm version minor

# Create PR to main
gh pr create --base main

# After merge, create release
gh release create v1.2.0 --generate-notes

# Automatic deployment to production
```

## Security

### Secret Management

- GitHub Secrets for CI/CD
- AWS Secrets Manager for application secrets
- Kubernetes secrets for runtime configuration

### Security Scanning

- **SAST**: CodeQL, SonarQube
- **Dependency Scanning**: Dependabot, npm audit, OWASP
- **Container Scanning**: Trivy, Grype
- **Secret Scanning**: TruffleHog, Gitleaks
- **Infrastructure**: Checkov, tfsec

### Access Control

- Branch protection rules
- Environment protection rules
- RBAC in Kubernetes
- IAM roles for AWS resources

## Monitoring

### Metrics

- Application metrics via Prometheus
- Infrastructure metrics via CloudWatch
- Custom business metrics

### Alerts

Configured alerts for:

- Application downtime
- High error rates
- Performance degradation
- Resource exhaustion
- Security incidents

### Dashboards

- Grafana dashboards for application monitoring
- CloudWatch dashboards for infrastructure
- GitHub Insights for CI/CD metrics

## Disaster Recovery

### Backup Strategy

- **Database**: Daily automated backups with 30-day retention
- **Application State**: S3 backup of configurations
- **Infrastructure**: Terraform state in S3 with versioning

### Recovery Procedures

1. **Application Failure**: Automatic rollback via blue-green deployment
2. **Database Failure**: Restore from automated backups
3. **Infrastructure Failure**: Rebuild from Terraform
4. **Complete Disaster**: Multi-region failover (if configured)

## Best Practices

### Git Workflow

- Feature branches from `develop`
- PR reviews required
- Squash and merge to maintain clean history
- Semantic commit messages

### Security

- Never commit secrets
- Regular dependency updates
- Security scanning on every PR
- Least privilege access

### Performance

- Resource limits on all containers
- Horizontal pod autoscaling
- CDN for static assets
- Database query optimization

### Monitoring

- Instrument all critical paths
- Set up meaningful alerts
- Regular review of metrics
- Incident post-mortems

## Troubleshooting

### Common Issues

1. **Deployment Failures**

   ```bash
   # Check pod status
   kubectl get pods -n warehouse-network
   kubectl describe pod <pod-name> -n warehouse-network
   kubectl logs <pod-name> -n warehouse-network
   ```

2. **Secret Issues**

   ```bash
   # Verify secrets exist
   kubectl get secrets -n warehouse-network
   gh secret list
   ```

3. **Infrastructure Issues**
   ```bash
   # Check Terraform state
   terraform state list
   terraform state show <resource>
   ```

### Support

- Internal Wiki: `https://wiki.warehouse-network.com/gitops`
- Slack: `#devops-support`
- On-call: Check PagerDuty schedule
