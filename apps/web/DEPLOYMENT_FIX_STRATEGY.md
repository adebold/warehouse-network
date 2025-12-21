# Warehouse Network Deployment Strategy

## Current Status

The warehouse app deployment is encountering issues with Docker builds and Cloud Run deployment. The main problems are:

1. Platform compatibility issues (Mac ARM64 to Linux AMD64)
2. Complex multi-stage builds failing
3. Next.js standalone build issues

## Deployment Options

### Option 1: Quick Simple Deployment (RECOMMENDED FOR IMMEDIATE FIX)

Use the simplified Express app in `quick-deploy/` directory:

```bash
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web/quick-deploy

# Create simple Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
EOF

# Deploy directly to Cloud Run
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --project warehouse-network-20251220
```

### Option 2: Fix Production Build (LONG-TERM SOLUTION)

Fix the Next.js production build:

1. **Update Dockerfile.production** to remove platform flags:

```dockerfile
FROM node:20-alpine AS deps
# Remove --platform flags throughout
```

2. **Simplify the build process**:

```bash
# Use Cloud Build with buildpacks
gcloud builds submit \
  --config cloudbuild.yaml \
  --project warehouse-network-20251220
```

### Option 3: Use GitHub Actions Workflow

The GitHub Actions workflow is already configured and should work:

1. **Ensure secrets are set**:
   - `GCP_SA_KEY_WAREHOUSE` must be configured in GitHub secrets

2. **Trigger deployment**:
   ```bash
   git add .
   git commit -m "fix: trigger warehouse deployment"
   git push origin main
   ```

## Immediate Action Plan

1. **Deploy Quick Solution Now**:

   ```bash
   cd apps/web/quick-deploy
   gcloud run deploy warehouse-frontend --source . --region us-central1 --allow-unauthenticated --port 8080
   ```

2. **Verify Deployment**:

   ```bash
   gcloud run services describe warehouse-frontend --region us-central1 --format 'value(status.url)'
   ```

3. **Test Health Endpoint**:
   ```bash
   curl https://warehouse-frontend-467296114824.us-central1.run.app/api/health
   ```

## Key Files

- **Quick Deploy**: `/apps/web/quick-deploy/index.js` - Simple Express app
- **Production Dockerfile**: `/apps/web/Dockerfile.production` - Needs platform flag fixes
- **GitHub Workflow**: `/.github/workflows/warehouse-production.yml` - Automated deployment
- **Cloud Build**: `/apps/web/cloudbuild.yaml` - GCP build configuration

## Project Details

- **Project ID**: warehouse-network-20251220
- **Service Name**: warehouse-frontend
- **Region**: us-central1
- **Registry**: us-central1-docker.pkg.dev
- **Expected URL**: https://warehouse-frontend-467296114824.us-central1.run.app

## Recommendations

1. Use Option 1 for immediate deployment
2. Fix Dockerfile.production platform issues for long-term
3. Ensure GitHub Actions has proper service account key
4. Consider using Cloud Build buildpacks for simpler deployments
