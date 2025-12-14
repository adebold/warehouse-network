# GitOps & Docker Setup Guide

This guide explains the complete GitOps setup for the Warehouse Network platform, including Docker configurations for development, staging, and production environments.

## Overview

The platform uses a comprehensive GitOps approach with:
- **Docker** for containerization
- **Docker Compose** for local development and staging
- **Kubernetes** for production deployment
- **GitHub Actions** for CI/CD
- **Multiple environments**: dev, staging, production

## Quick Start with Docker Desktop

```bash
# Clone the repository
git clone https://github.com/adebold/warehouse-network.git
cd warehouse-network

# Quick start - this will:
# 1. Start all services
# 2. Run database migrations
# 3. Seed test data
make quick-start

# Access the application
open http://localhost:3000
```

## Project Structure

```
warehouse-network/
├── docker/
│   ├── dev/              # Development environment configs
│   ├── staging/          # Staging environment configs
│   └── prod/             # Production environment configs
├── k8s/
│   ├── base/             # Base Kubernetes manifests
│   └── overlays/         # Environment-specific overlays
├── .github/workflows/    # CI/CD pipelines
├── docker-compose.base.yml
├── Dockerfile
├── Makefile
└── .env.example
```

## Environments

### Development Environment

**Features:**
- Hot reloading
- PgAdmin for database management
- MailHog for email testing
- Volume mounts for code changes
- Exposed ports for debugging

**Services:**
- App (Next.js): http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- PgAdmin: http://localhost:5050
- MailHog: http://localhost:8025

**Commands:**
```bash
# Start development environment
make dev

# View logs
make dev-logs

# Open shell in app container
make dev-shell

# Reset database
make dev-db-reset
```

### Staging Environment

**Features:**
- Production-like configuration
- Nginx reverse proxy with SSL
- Prometheus & Grafana monitoring
- Multiple app replicas
- Resource limits

**Services:**
- App (3 replicas)
- Nginx load balancer
- Prometheus metrics
- Grafana dashboards

**Commands:**
```bash
# Start staging environment
make staging

# View logs
make staging-logs
```

### Production Environment

**Features:**
- Kubernetes deployment
- High availability
- Auto-scaling
- Database replication
- CDN integration
- Full monitoring stack

**Deployment:**
- Uses Kubernetes manifests in `k8s/` directory
- Deployed via GitHub Actions on tag push
- Automatic rollback on failure

## Database Management

```bash
# Run migrations
make db-migrate ENV=dev

# Seed database
make db-seed ENV=dev

# Open Prisma Studio
make db-studio ENV=dev
```

## CI/CD Pipeline

### Continuous Integration (CI)

Triggers on: Pull requests and pushes to main/develop

**Stages:**
1. **Lint** - ESLint and TypeScript checks
2. **Unit Tests** - Component and utility tests
3. **Integration Tests** - API and database tests
4. **E2E Tests** - Playwright browser tests
5. **Security Scan** - Trivy vulnerability scanning
6. **Build** - Docker image creation

### Continuous Deployment (CD)

**Develop → Staging:**
- Automatic deployment on push to develop branch
- Deploys to staging server via SSH
- Runs database migrations
- Health check verification

**Tags → Production:**
- Manual deployment via semantic version tags (v1.0.0)
- Kubernetes rolling update
- Automatic rollback on failure
- Sentry release tracking
- Slack notifications

## Security Considerations

1. **Secrets Management:**
   - Use GitHub Secrets for CI/CD
   - Kubernetes Secrets for production
   - Never commit `.env` files

2. **Network Security:**
   - All services in isolated Docker networks
   - SSL/TLS termination at Nginx
   - Firewall rules for production

3. **Image Security:**
   - Multi-stage builds for minimal images
   - Regular vulnerability scanning
   - Non-root user in containers

## Monitoring & Observability

### Development
- Docker logs
- Next.js dev server output

### Staging/Production
- **Prometheus**: Metrics collection
- **Grafana**: Dashboards and alerts
- **Sentry**: Error tracking
- **CloudWatch**: AWS infrastructure logs

## Common Tasks

### Adding Environment Variables

1. Add to `.env.example`
2. Update `docker-compose.base.yml`
3. Add to Kubernetes ConfigMap/Secret
4. Update CI/CD workflows

### Updating Dependencies

```bash
# Update all dependencies
pnpm update

# Rebuild images
make build

# Deploy updates
make dev
```

### Debugging

```bash
# Check container status
make ps

# View specific service logs
docker-compose -f docker-compose.base.yml -f docker/dev/docker-compose.yml logs -f app

# Execute commands in container
docker-compose -f docker-compose.base.yml -f docker/dev/docker-compose.yml exec app sh
```

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   ```bash
   # Check what's using the port
   lsof -i :3000
   ```

2. **Database connection issues:**
   ```bash
   # Check database is running
   docker ps | grep postgres
   
   # Test connection
   docker exec -it warehouse-network_postgres_1 psql -U warehouse
   ```

3. **Permission issues:**
   ```bash
   # Fix Docker socket permissions
   sudo chmod 666 /var/run/docker.sock
   ```

### Clean Start

```bash
# Remove all containers and volumes
make clean

# Fresh start
make quick-start
```

## Production Deployment

### Prerequisites
- Kubernetes cluster (EKS/GKE/AKS)
- Container registry access
- SSL certificates
- Monitoring stack

### Deployment Steps

1. **Build and push image:**
   ```bash
   docker build -t ghcr.io/adebold/warehouse-network:v1.0.0 .
   docker push ghcr.io/adebold/warehouse-network:v1.0.0
   ```

2. **Apply Kubernetes manifests:**
   ```bash
   kubectl apply -k k8s/overlays/prod
   ```

3. **Verify deployment:**
   ```bash
   kubectl get pods -n warehouse-network
   kubectl logs -f deployment/warehouse-app -n warehouse-network
   ```

## Best Practices

1. **Development:**
   - Use feature branches
   - Test locally before pushing
   - Keep containers lightweight

2. **Staging:**
   - Mirror production closely
   - Test migrations thoroughly
   - Monitor resource usage

3. **Production:**
   - Use semantic versioning
   - Implement gradual rollouts
   - Monitor all deployments
   - Have rollback plan ready

## Support

For issues or questions:
- Check logs first: `make dev-logs`
- Review this documentation
- Check GitHub Issues
- Contact DevOps team