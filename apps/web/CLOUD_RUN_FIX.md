# Cloud Run Architecture Fix - Quick Reference

## Problem
Cloud Run rejects multi-architecture Docker images with error:
```
Container manifest type 'application/vnd.oci.image.index.v1+json' must support amd64/linux
```

## Root Cause
Docker buildx creates multi-platform images by default, but Cloud Run only accepts single architecture (linux/amd64) images.

## Solutions

### Option 1: Simple Cloud Build (RECOMMENDED)
```bash
cd apps/web
gcloud builds submit --config=cloudbuild-simple.yaml
```

### Option 2: Local Build with Platform Flag
```bash
cd apps/web
docker build --platform linux/amd64 -t gcr.io/easyreno-poc-202512161545/warehouse-network-web:latest -f Dockerfile.cloudrun .
docker push gcr.io/easyreno-poc-202512161545/warehouse-network-web:latest
gcloud run deploy warehouse-network-web --image gcr.io/easyreno-poc-202512161545/warehouse-network-web:latest --region us-central1
```

### Option 3: Use Deployment Script
```bash
cd apps/web
./scripts/deploy-cloud-run.sh
```

## Key Changes Made

1. **cloudbuild-simple.yaml**: Uses standard docker build without buildx
2. **cloudbuild.yaml**: Uses buildx with explicit --platform=linux/amd64
3. **Dockerfile.cloudrun**: Adds --platform=linux/amd64 to FROM statements
4. **.dockerignore**: Optimizes build by excluding unnecessary files
5. **deploy-cloud-run.sh**: Interactive deployment script

## Files Created
- `cloudbuild-simple.yaml` - Simple build config (recommended)
- `cloudbuild.yaml` - Buildx config with platform flag
- `Dockerfile.cloudrun` - Optimized Dockerfile with explicit platform
- `.dockerignore` - Excludes unnecessary files from build
- `scripts/deploy-cloud-run.sh` - Interactive deployment script
- `CLOUD_RUN_DEPLOYMENT.md` - Comprehensive deployment guide

## Quick Test
```bash
# Verify image architecture after build
docker manifest inspect gcr.io/easyreno-poc-202512161545/warehouse-network-web:latest | grep architecture
# Should show only "amd64" not multiple architectures
```