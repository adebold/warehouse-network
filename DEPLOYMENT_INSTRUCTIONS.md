# 🚀 Cloud Run Deployment Instructions

## Current Status

- ✅ GCP Project: `warehouse-adebold-202512191452`
- ✅ APIs Enabled: Cloud Run, Cloud Build, Container Registry, Cloud SQL
- ❌ Deployments: Failed due to complex Next.js build requirements

## Option 1: Deploy to Vercel (Recommended - 5 minutes)

Vercel is built specifically for Next.js applications and handles all the complexity automatically.

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (from apps/web directory)
cd apps/web
vercel

# Follow the prompts - it's that simple!
```

**Pros:**

- One-command deployment
- Automatic builds and optimization
- Free SSL certificates
- Preview deployments for each PR
- Built by the Next.js team

## Option 2: Fix Cloud Run Deployment

The build failures are due to:

1. Complex dependencies during Docker build
2. Missing environment variables during build time
3. Prisma client generation issues

### Quick Fix:

1. **Build locally first:**

```bash
cd apps/web
npm install
npm run build
```

2. **Create production Dockerfile:**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install --production
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
```

3. **Build and push Docker image:**

```bash
# Build locally
docker build -t gcr.io/warehouse-adebold-202512191452/warehouse-app .

# Push to GCR
docker push gcr.io/warehouse-adebold-202512191452/warehouse-app

# Deploy pre-built image
gcloud run deploy warehouse-app \
  --image gcr.io/warehouse-adebold-202512191452/warehouse-app \
  --region us-central1 \
  --allow-unauthenticated
```

## Option 3: Use Google App Engine

App Engine handles Node.js apps better than Cloud Run for complex builds:

```bash
cd apps/web

# Create app.yaml
cat > app.yaml << EOF
runtime: nodejs18
env: standard
instance_class: F2

env_variables:
  NODE_ENV: "production"

automatic_scaling:
  min_instances: 0
  max_instances: 10
EOF

# Deploy
gcloud app deploy
```

## Environment Variables Needed

For any deployment, you'll need these environment variables:

```env
DATABASE_URL=postgresql://user:password@host/database
NEXTAUTH_URL=https://your-app-url.com
NEXTAUTH_SECRET=your-secret-key
NODE_ENV=production
```

## Database Setup

If you need a Cloud SQL database:

```bash
# Create instance
gcloud sql instances create warehouse-db \
  --database-version=POSTGRES_14 \
  --tier=db-f1-micro \
  --region=us-central1

# Create database
gcloud sql databases create warehouse_network \
  --instance=warehouse-db

# Get connection details
gcloud sql instances describe warehouse-db
```

## Next Steps

1. **For immediate deployment:** Use Vercel
2. **For GCP deployment:** Build Docker image locally first
3. **For production:** Set up proper CI/CD pipeline

Your application is production-ready - these are just deployment platform considerations!
