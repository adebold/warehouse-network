# CI/CD Deployment Guide for Warehouse Network

## Current Status

✅ **GitHub Actions CI/CD Pipeline**: Set up and ready
✅ **Cloud Run Service**: Created and accessible  
❌ **Automated Deployment**: Blocked by GCP authentication policies

## The Challenge

Your organization has policies preventing service account key creation, which blocks automated deployments from GitHub Actions to GCP.

## Solution: Semi-Automated CI/CD

### 1. GitHub Actions (Automated Part)

- ✅ Runs tests
- ✅ Builds Docker images
- ✅ Validates code quality
- ✅ Creates deployment artifacts

### 2. Manual Deployment Trigger

Since we can't authenticate GitHub Actions with GCP, we use a hybrid approach:

#### Option A: Cloud Shell Deployment (Recommended)

```bash
# In Google Cloud Shell (already authenticated)
git clone https://github.com/adebold/warehouse-network.git
cd warehouse-network/apps/web

# Deploy with one command
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project easyreno-demo-20251219144606
```

#### Option B: Local Deployment with gcloud CLI

```bash
# On your Mac (already authenticated)
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web

# Deploy directly (Cloud Build handles architecture differences)
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

## Why This Works

1. **Architecture Handling**: Cloud Build automatically builds for linux/amd64
2. **No Local Docker Needed**: Cloud Build handles everything
3. **CI/CD Benefits**: Still get automated testing and validation
4. **Security**: No service account keys needed

## Deployment Workflow

1. **Push to GitHub** → Triggers CI pipeline
2. **CI validates** → Tests pass, code is ready
3. **Manual deploy** → Run gcloud command when ready
4. **Service updates** → Cloud Run serves new version

## Setting Up Workload Identity (Future Enhancement)

To fully automate deployments, ask your GCP admin to:

1. Create Workload Identity Pool:

```bash
gcloud iam workload-identity-pools create github-pool \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

2. Configure OIDC provider for GitHub
3. Grant permissions to GitHub Actions

This would enable fully automated deployments without service account keys.

## Current Live Services

- **Frontend**: https://warehouse-frontend-1078962111758.us-central1.run.app
- **Backend**: https://easyreno-backend-1078962111758.us-central1.run.app

## Next Steps

1. Run the deployment command in Cloud Shell or locally
2. Your Next.js app will be built and deployed
3. The URL will remain the same, but will serve your actual application
