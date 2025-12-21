# Cloud Run Deployment Guide

## Issue Resolution

The error "Container manifest type 'application/vnd.oci.image.index.v1+json' must support amd64/linux" occurs when Docker builds a multi-architecture image manifest instead of a single architecture image. Cloud Run only supports single architecture images.

## Solutions Provided

### 1. Simple Cloud Build (Recommended)

Use `cloudbuild-simple.yaml` - This avoids buildx complications:

```bash
gcloud builds submit --config=apps/web/cloudbuild-simple.yaml --substitutions=_SERVICE_NAME=warehouse-network-web
```

### 2. Buildx Cloud Build

Use `cloudbuild.yaml` - Explicitly specifies linux/amd64 platform:

```bash
gcloud builds submit --config=apps/web/cloudbuild.yaml --substitutions=_SERVICE_NAME=warehouse-network-web
```

### 3. Local Build & Deploy

Build locally with explicit platform:

```bash
# Build with explicit platform
docker build --platform linux/amd64 -t gcr.io/easyreno-poc-202512161545/warehouse-network-web:latest -f apps/web/Dockerfile.cloudrun apps/web

# Push to GCR
docker push gcr.io/easyreno-poc-202512161545/warehouse-network-web:latest

# Deploy to Cloud Run
gcloud run deploy warehouse-network-web \
  --image gcr.io/easyreno-poc-202512161545/warehouse-network-web:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --port 3000 \
  --set-env-vars NODE_ENV=production
```

## Environment Variables

Set these in Cloud Run or Secret Manager:

```yaml
DATABASE_URL: Your PostgreSQL connection string
NEXTAUTH_URL: https://your-service-url.run.app
NEXTAUTH_SECRET: Generate with `openssl rand -base64 32`
GOOGLE_CLIENT_ID: Your OAuth client ID
GOOGLE_CLIENT_SECRET: Your OAuth client secret
STRIPE_SECRET_KEY: Your Stripe secret key
STRIPE_WEBHOOK_SECRET: Your Stripe webhook secret
```

## Best Practices for Next.js on Cloud Run

### 1. Dockerfile Optimization

- Use multi-stage builds to reduce image size
- Explicitly set `--platform=linux/amd64` in FROM statements
- Use `node:18-alpine` for smaller images
- Copy only necessary files for production

### 2. Next.js Configuration

- Enable `output: 'standalone'` in next.config.js ✅ (already configured)
- Use `HOSTNAME: "0.0.0.0"` for Cloud Run compatibility
- Disable telemetry with `NEXT_TELEMETRY_DISABLED=1`

### 3. Cloud Run Settings

- Min instances: 0 (for cost optimization)
- Max instances: 100 (adjust based on load)
- Memory: 1Gi (minimum for Next.js + Prisma)
- CPU: 1 (can increase for better performance)
- Concurrency: 250 (default, adjust based on app)

### 4. Security Headers

✅ Already configured in next.config.js with comprehensive CSP and security headers

### 5. Database Connections

- Use Cloud SQL Proxy for secure connections
- Set connection pool limits appropriate for Cloud Run
- Use connection string with SSL enabled

### 6. Build Optimization

- Use `.dockerignore` to exclude unnecessary files
- Cache node_modules layer effectively
- Separate production and dev dependencies

## Monitoring & Debugging

### Check Build Logs

```bash
gcloud builds log <BUILD_ID>
```

### Check Service Logs

```bash
gcloud run services logs read warehouse-network-web --region us-central1
```

### Verify Image Architecture

```bash
docker manifest inspect gcr.io/easyreno-poc-202512161545/warehouse-network-web:latest
```

## Troubleshooting

### If builds still create multi-arch images:

1. Ensure Docker Desktop has "Use containerd for pulling and storing images" disabled
2. Clear Docker build cache: `docker builder prune -a`
3. Use the simple cloudbuild.yaml without buildx
4. Build locally with explicit platform flag

### If deployment fails:

1. Check Cloud Run logs for startup errors
2. Verify all environment variables are set
3. Ensure database is accessible from Cloud Run
4. Check memory/CPU limits are sufficient

## Cost Optimization

1. Set min-instances to 0 for development
2. Use Cloud CDN for static assets
3. Enable CPU boost for faster cold starts
4. Use regional services in same region as database
5. Monitor and adjust max-instances based on traffic
