# 🚀 Apply Changes Action Plan

## Current Status
- ✅ **Code Changes Applied**: All fixes committed and pushed
- ✅ **Site Live**: Running on old deployment at https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app
- ❌ **GitOps Blocked**: IAM permissions preventing new deployment

## Required Actions (In Order)

### 1. Fix IAM Permissions (BLOCKER)
```bash
# Authenticate
gcloud auth login

# Run fix script
./scripts/fix-iam-permissions.sh
```

### 2. Set Google Analytics ID
```bash
# Replace with your actual GA4 measurement ID
gh secret set NEXT_PUBLIC_GA_MEASUREMENT_ID -b "G-XXXXXXXXXX"

# Also update in Google Secret Manager
echo -n "G-XXXXXXXXXX" | gcloud secrets versions add GA_MEASUREMENT_ID \
  --data-file=- --project=aindustries-warehouse
```

### 3. Create Cloud SQL Database
```bash
# Run the setup script
./scripts/setup-google-secrets.sh

# This will:
# - Create Cloud SQL instance: warehouse-production-db
# - Create database: warehouse_network
# - Create user: warehouse
# - Store connection string in Secret Manager
```

### 4. Create Redis Instance
```bash
# Run the Redis setup
./scripts/setup-redis-memorystore.sh

# This will:
# - Create Memorystore Redis instance
# - Update REDIS_URL in Secret Manager
```

### 5. Trigger New Deployment
```bash
# Option 1: Empty commit
git commit --allow-empty -m "chore: trigger deployment with IAM fixes" && git push

# Option 2: Re-run workflow
gh run rerun 20434183594
```

### 6. Run Database Migrations
```bash
# Once deployed, run migrations
gcloud run jobs create migrate-db \
  --image us-central1-docker.pkg.dev/aindustries-warehouse/warehouse-docker/warehouse-platform-v2:latest \
  --command "npx" \
  --args "prisma,migrate,deploy" \
  --service-account warehouse-app@aindustries-warehouse.iam.gserviceaccount.com \
  --set-cloudsql-instances aindustries-warehouse:us-central1:warehouse-production-db \
  --region us-central1

gcloud run jobs execute migrate-db --region us-central1
```

## What Each Change Does

### ✅ Already Applied in Code:
1. **Dockerfile.gitops** - Fixed OpenSSL dependencies for Prisma
2. **GitOps workflow** - Updated to use new Dockerfile
3. **IAM fix script** - Automated permission grants
4. **Redis setup script** - Automated Memorystore creation
5. **Database setup script** - Automated Cloud SQL creation

### 🔧 Manual Setup Required:
1. **IAM Permissions** - One-time Google Cloud setup
2. **GA4 Measurement ID** - Get from Google Analytics console
3. **Cloud Resources** - Create actual database and Redis instances

## Verification Steps

### 1. Check IAM Permissions
```bash
gcloud iam service-accounts get-iam-policy \
  warehouse-app@aindustries-warehouse.iam.gserviceaccount.com
```

### 2. Check Secrets
```bash
gcloud secrets list --project=aindustries-warehouse
```

### 3. Check Deployment
```bash
gcloud run services describe warehouse-platform-v2 \
  --region=us-central1 --format='value(status.url)'
```

### 4. Check Health
```bash
curl https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app/api/health
```

## Expected Timeline
1. IAM Fix: 2 minutes
2. Set GA ID: 1 minute
3. Create Database: 5-10 minutes
4. Create Redis: 5-10 minutes
5. Deploy: 3 minutes
6. Migrations: 1 minute

**Total: ~25 minutes**

## Success Criteria
- [ ] GitOps workflow passes (green check)
- [ ] Health check returns 200 with database connected
- [ ] Google Analytics loads on production site
- [ ] No errors in Cloud Run logs
- [ ] Database migrations completed

## Support
If you encounter issues:
1. Check Cloud Run logs: `gcloud run logs read warehouse-platform-v2 --region=us-central1`
2. Review workflow logs: `gh run view --log`
3. Check IAM policies: `gcloud projects get-iam-policy aindustries-warehouse`

---

**Remember**: These are mostly one-time setup tasks. Once complete, all future deployments will be automatic via GitOps!