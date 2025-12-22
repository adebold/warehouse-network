# Production Setup for 100% Operational Excellence

## Prerequisites

- Google Cloud Project: `aindustries-warehouse`
- GitHub repository with Actions enabled
- gcloud CLI installed and authenticated
- GitHub CLI (gh) installed

## 1. Google Analytics Setup

### Step 1: Get your GA4 Measurement ID
1. Go to [Google Analytics](https://analytics.google.com)
2. Admin → Data Streams → Select your web stream
3. Copy the Measurement ID (format: `G-XXXXXXXXXX`)

### Step 2: Set GitHub Secret
```bash
# Set the GA4 measurement ID as source of truth
gh secret set NEXT_PUBLIC_GA_MEASUREMENT_ID -b "G-YOUR_ACTUAL_ID"

# Also update in Google Secret Manager for GitOps
echo -n "G-YOUR_ACTUAL_ID" | gcloud secrets versions add GA_MEASUREMENT_ID \
  --data-file=- \
  --project=aindustries-warehouse
```

## 2. Database Setup (Cloud SQL)

Run the automated setup script:
```bash
./scripts/setup-google-secrets.sh
```

Or manually:
```bash
# Create Cloud SQL instance
gcloud sql instances create warehouse-production-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=warehouse-admin-2024 \
  --project=aindustries-warehouse

# Create database and user
gcloud sql databases create warehouse_network \
  --instance=warehouse-production-db
  
gcloud sql users create warehouse \
  --instance=warehouse-production-db \
  --password=warehouse-prod-2024
```

## 3. Redis Setup (Memorystore)

Run the automated setup script:
```bash
./scripts/setup-redis-memorystore.sh
```

## 4. Run Database Migrations

```bash
# Set up production environment
export DATABASE_URL="postgresql://warehouse:warehouse-prod-2024@/warehouse_network?host=/cloudsql/aindustries-warehouse:us-central1:warehouse-production-db"

# Run migrations
cd apps/web
npx prisma migrate deploy
npx prisma db seed
```

## 5. Verify Deployment

### Check GitHub Actions
```bash
# View latest GitOps workflow runs
gh run list --workflow=warehouse-production-gitops.yml --limit=5

# Watch a specific run
gh run watch <run-id>
```

### Check Cloud Run Service
```bash
# Get service URL
gcloud run services describe warehouse-platform-v2 \
  --region=us-central1 \
  --format='value(status.url)'

# Check service logs
gcloud run services logs read warehouse-platform-v2 \
  --region=us-central1 \
  --limit=50
```

### Verify Health Check
```bash
SERVICE_URL=$(gcloud run services describe warehouse-platform-v2 \
  --region=us-central1 \
  --format='value(status.url)')
  
curl -f "$SERVICE_URL/api/health"
```

## 6. Production Checklist

### ✅ Infrastructure
- [ ] Cloud SQL instance created
- [ ] Redis Memorystore instance created
- [ ] Workload Identity Federation configured
- [ ] Service accounts with proper permissions

### ✅ Secrets Management
- [ ] Google Secret Manager secrets created
- [ ] GitHub secrets configured (GA measurement ID)
- [ ] Service account has access to secrets

### ✅ Database
- [ ] Database created and accessible
- [ ] Migrations run successfully
- [ ] Cloud SQL Auth Proxy enabled

### ✅ Deployment
- [ ] GitOps workflow runs successfully
- [ ] Docker image builds and pushes
- [ ] Cloud Run service deployed
- [ ] Health checks passing

### ✅ Analytics
- [ ] Google Analytics measurement ID configured
- [ ] Analytics loading on production site
- [ ] Events tracking properly

## 7. Troubleshooting

### Docker Build Failures
- Check `Dockerfile.gitops` exists in `apps/web`
- Ensure all dependencies are listed in `package.json`
- Verify npm scripts are defined

### Database Connection Issues
- Verify Cloud SQL instance is running
- Check Cloud SQL Auth Proxy is enabled
- Ensure service account has Cloud SQL Client role
- Verify DATABASE_URL secret format

### Secret Access Issues
- Check service account permissions
- Verify secret exists: `gcloud secrets list`
- Test access: `gcloud secrets versions access latest --secret=DATABASE_URL`

### Health Check Failures
- Check database connectivity
- Verify environment variables are set
- Review Cloud Run logs for errors

## 8. Monitoring Setup

### Enable Cloud Monitoring
```bash
gcloud services enable monitoring.googleapis.com \
  --project=aindustries-warehouse
```

### Set Up Alerts
```bash
# CPU utilization alert
gcloud alpha monitoring policies create \
  --notification-channels=<channel-id> \
  --display-name="High CPU Usage" \
  --condition-display-name="CPU > 80%" \
  --condition-metric-type="run.googleapis.com/container/cpu/utilizations"
```

### View Metrics
- Go to [Cloud Console](https://console.cloud.google.com)
- Navigate to Cloud Run → warehouse-platform-v2 → Metrics

## 9. Backup and Disaster Recovery

### Enable Automated Backups
```bash
gcloud sql instances patch warehouse-production-db \
  --backup-start-time=02:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7
```

### Manual Backup
```bash
gcloud sql backups create \
  --instance=warehouse-production-db \
  --description="Manual backup $(date +%Y-%m-%d)"
```

## 10. Cost Optimization

### Set Budget Alerts
```bash
gcloud billing budgets create \
  --billing-account=<billing-account-id> \
  --display-name="Warehouse Platform Budget" \
  --budget-amount=100USD \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90
```

### Review Resource Usage
- Cloud Run: Adjust min/max instances
- Cloud SQL: Consider smaller tier if underutilized
- Memorystore: Monitor memory usage

## Summary

This setup provides:
- ✅ Secure GitOps deployment with Workload Identity
- ✅ Managed database with automated backups
- ✅ Redis caching for performance
- ✅ Proper secret management
- ✅ Health monitoring and alerts
- ✅ Analytics tracking
- ✅ 100% operational excellence as expected by a CTO

For ongoing operations, monitor:
- GitHub Actions for deployment status
- Cloud Run metrics for performance
- Cloud SQL for database health
- Budget alerts for cost control