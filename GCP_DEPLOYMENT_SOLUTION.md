# 🚀 Google Cloud Run Deployment Solution

## Current Status

- Project: `warehouse-adebold-202512191452`
- Region: `us-central1`
- Issue: Cloud Build failing due to Next.js complexity

## Solution: Local Build + Deploy

### Step 1: Build Docker Image Locally

```bash
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web

# Build the image locally where it works
docker build -t gcr.io/warehouse-adebold-202512191452/warehouse-app .
```

### Step 2: Configure Docker for GCR

```bash
gcloud auth configure-docker
```

### Step 3: Push to Container Registry

```bash
docker push gcr.io/warehouse-adebold-202512191452/warehouse-app
```

### Step 4: Deploy Pre-built Image

```bash
gcloud run deploy warehouse-app \
    --image gcr.io/warehouse-adebold-202512191452/warehouse-app \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --set-env-vars "NODE_ENV=production"
```

## Alternative: Simplified Deployment

### Option 1: Use App Engine

```bash
cd apps/web
gcloud app deploy
```

### Option 2: Deploy API Only

Create a simple Express API that connects to your Next.js frontend:

```bash
# Use minimal-app.js as starting point
gcloud run deploy warehouse-api \
    --source . \
    --region us-central1
```

### Option 3: Use Google Cloud Build with Buildpacks

```bash
gcloud run deploy warehouse-app \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated
```

## Environment Variables Needed

```bash
gcloud run services update warehouse-app \
    --set-env-vars DATABASE_URL=postgresql://... \
    --set-env-vars NEXTAUTH_URL=https://... \
    --set-env-vars NEXTAUTH_SECRET=...
```

## Quick Test

To verify Cloud Run works:

```bash
cd apps/web
chmod +x test-gcp-minimal.sh
./test-gcp-minimal.sh
```

## Database Setup

```bash
# Create Cloud SQL instance
gcloud sql instances create warehouse-db \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=us-central1

# Create database
gcloud sql databases create warehouse_network --instance=warehouse-db
```

## Monitoring

- Build Logs: https://console.cloud.google.com/cloud-build/builds?project=warehouse-adebold-202512191452
- Cloud Run: https://console.cloud.google.com/run?project=warehouse-adebold-202512191452

## Cost Estimate

- Cloud Run: ~$5-10/month (with scale-to-zero)
- Cloud SQL: ~$7-10/month (db-f1-micro)
- Total: ~$15-20/month
