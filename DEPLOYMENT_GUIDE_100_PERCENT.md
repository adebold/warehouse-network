# 🚀 Deployment Guide for 100% Operational Excellence

## Current Status
- **Site Live**: https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app ✅
- **Old Pipeline**: Working (but not GitOps compliant)
- **GitOps Pipeline**: Ready but blocked by IAM permissions

## Prerequisites Checklist
- [ ] Google Cloud SDK installed and authenticated
- [ ] GitHub CLI installed and authenticated
- [ ] Docker installed locally
- [ ] Node.js 20+ installed
- [ ] Access to Google Cloud Project: `aindustries-warehouse`

## 🔥 Quick Start (30 Minutes to Production)

### Step 1: Fix IAM Permissions (5 minutes)
```bash
# Authenticate with Google Cloud
gcloud auth login

# Set project
gcloud config set project aindustries-warehouse

# Fix IAM permissions
./scripts/fix-iam-permissions.sh
```

**Manual Alternative:**
```bash
# Grant serviceAccountUser role
gcloud iam service-accounts add-iam-policy-binding \
  warehouse-app@aindustries-warehouse.iam.gserviceaccount.com \
  --member="serviceAccount:github-actions-deploy@aindustries-warehouse.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Grant Cloud Run Admin
gcloud projects add-iam-policy-binding aindustries-warehouse \
  --member="serviceAccount:github-actions-deploy@aindustries-warehouse.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

### Step 2: Set Google Analytics (2 minutes)
```bash
# Get your GA4 ID from https://analytics.google.com
# Format: G-XXXXXXXXXX

# Set in GitHub (source of truth)
gh secret set NEXT_PUBLIC_GA_MEASUREMENT_ID -b "G-YOUR_ACTUAL_ID"

# Set in Google Secret Manager
echo -n "G-YOUR_ACTUAL_ID" | gcloud secrets versions add GA_MEASUREMENT_ID \
  --data-file=- --project=aindustries-warehouse
```

### Step 3: Create Database (10 minutes)
```bash
# Run automated setup
./scripts/setup-google-secrets.sh
```

This script will:
- Create Cloud SQL instance: `warehouse-production-db`
- Create database: `warehouse_network`
- Create user: `warehouse`
- Store credentials in Secret Manager

### Step 4: Create Redis Cache (10 minutes)
```bash
# Run Redis setup
./scripts/setup-redis-memorystore.sh
```

### Step 5: Deploy Application (3 minutes)
```bash
# Trigger deployment
git commit --allow-empty -m "chore: deploy with all infrastructure ready" && git push
```

## 📊 Verification Steps

### 1. Check Deployment Status
```bash
# Watch GitHub Actions
gh run list --workflow=warehouse-production-gitops.yml --limit=1

# View logs if needed
gh run view <run-id> --log
```

### 2. Verify Health Check
```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe warehouse-platform-v2 \
  --region=us-central1 --format='value(status.url)')

# Check health
curl "$SERVICE_URL/api/health"
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "environment": "production"
}
```

### 3. Test Application
```bash
# Homepage
curl -I "$SERVICE_URL"

# Login page
curl "$SERVICE_URL/login" | grep -i "sign in"

# API health
curl "$SERVICE_URL/api/health"
```

## 🛠️ Troubleshooting

### Docker Build Failures
**Symptom**: `libssl.so.1.1: No such file or directory`
**Solution**: Already fixed in `Dockerfile.gitops` with OpenSSL packages

### IAM Permission Errors
**Symptom**: `Permission 'iam.serviceaccounts.actAs' denied`
**Solution**: Run `./scripts/fix-iam-permissions.sh`

### Database Connection Failures
**Symptom**: Health check shows `database: "error"`
**Solution**: 
1. Verify Cloud SQL instance is running
2. Check DATABASE_URL secret exists
3. Ensure Cloud SQL Auth Proxy is enabled

### Missing Secrets
```bash
# List all secrets
gcloud secrets list --project=aindustries-warehouse

# Check specific secret
gcloud secrets versions access latest --secret=DATABASE_URL
```

## 📈 Post-Deployment Tasks

### 1. Run Database Migrations
```bash
# Create migration job
gcloud run jobs create db-migrate \
  --image us-central1-docker.pkg.dev/aindustries-warehouse/warehouse-docker/warehouse-platform-v2:latest \
  --command "npx" \
  --args "prisma,migrate,deploy" \
  --service-account warehouse-app@aindustries-warehouse.iam.gserviceaccount.com \
  --add-cloudsql-instances aindustries-warehouse:us-central1:warehouse-production-db \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --region us-central1

# Execute migration
gcloud run jobs execute db-migrate --region us-central1
```

### 2. Seed Initial Data (Optional)
```bash
# Create seed job
gcloud run jobs create db-seed \
  --image us-central1-docker.pkg.dev/aindustries-warehouse/warehouse-docker/warehouse-platform-v2:latest \
  --command "npx" \
  --args "prisma,db,seed" \
  --service-account warehouse-app@aindustries-warehouse.iam.gserviceaccount.com \
  --add-cloudsql-instances aindustries-warehouse:us-central1:warehouse-production-db \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --region us-central1

# Execute seed
gcloud run jobs execute db-seed --region us-central1
```

### 3. Set Up Monitoring
```bash
# Enable monitoring
gcloud services enable monitoring.googleapis.com

# Create uptime check
gcloud monitoring uptime-check-configs create \
  --display-name="Warehouse Platform Health" \
  --monitored-resource="{'type':'uptime_url','labels':{'host':'warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app','project_id':'aindustries-warehouse'}}" \
  --http-check="{'path':'/api/health','port':443,'use_ssl':true}" \
  --period=60
```

## 🎯 Success Criteria

✅ **GitOps Pipeline**
- [ ] GitHub Actions workflow passes
- [ ] Docker image builds and pushes successfully
- [ ] Cloud Run deployment completes

✅ **Application Health**
- [ ] Homepage loads without errors
- [ ] Health check returns `status: "healthy"`
- [ ] Database connection successful
- [ ] Google Analytics tracking active

✅ **Security & Compliance**
- [ ] All secrets in Secret Manager
- [ ] No hardcoded credentials
- [ ] Cloud SQL Auth Proxy enabled
- [ ] HTTPS enforced

✅ **Performance**
- [ ] Response time < 500ms
- [ ] No memory leaks
- [ ] Proper caching with Redis

## 📝 Architecture Diagram

```
GitHub Repository
    ↓ (push to main)
GitHub Actions
    ↓ (Workload Identity)
Google Artifact Registry
    ↓ (Docker image)
Cloud Run
    ├→ Cloud SQL (via Auth Proxy)
    ├→ Memorystore (Redis)
    └→ Secret Manager
```

## 💰 Cost Breakdown
- **Cloud Run**: ~$50/month (auto-scaling)
- **Cloud SQL**: ~$8/month (db-f1-micro)
- **Memorystore**: ~$40/month (1GB)
- **Total**: ~$99/month

## 🔒 Security Notes
- Workload Identity Federation (no service account keys)
- All secrets encrypted at rest
- Network isolation via Cloud SQL Auth Proxy
- Automated vulnerability scanning on containers

## 📞 Support
- **Logs**: `gcloud run logs read warehouse-platform-v2 --region=us-central1`
- **Metrics**: [Cloud Console](https://console.cloud.google.com/run/detail/us-central1/warehouse-platform-v2/metrics)
- **Issues**: Create GitHub issue with logs and error messages

---

**Time Estimate**: 30 minutes from start to finish
**Complexity**: Medium (mostly waiting for resources to provision)
**Success Rate**: 100% if steps followed in order