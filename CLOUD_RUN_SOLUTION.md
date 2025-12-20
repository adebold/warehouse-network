# Cloud Run Deployment Solution

## Problem Summary

The main issue preventing deployment is the Docker image architecture incompatibility. The error "Container manifest type 'application/vnd.oci.image.index.v1+json' must support amd64/linux" occurs because the image was built for multiple architectures or with an incompatible manifest format.

## Working Solution

### Option 1: Local Development with Cloud SQL Proxy (Recommended for Now)

Since the application works locally, you can use it with production data:

```bash
# 1. Install Cloud SQL Proxy
curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.darwin.amd64
chmod +x cloud_sql_proxy

# 2. Create Cloud SQL instance
gcloud sql instances create warehouse-db \
  --tier=db-f1-micro \
  --region=us-central1 \
  --project=easyreno-poc-202512161545

# 3. Create database
gcloud sql databases create warehouse_network \
  --instance=warehouse-db \
  --project=easyreno-poc-202512161545

# 4. Set password for postgres user
gcloud sql users set-password postgres \
  --instance=warehouse-db \
  --password=your-secure-password \
  --project=easyreno-poc-202512161545

# 5. Run Cloud SQL Proxy
./cloud_sql_proxy -instances=easyreno-poc-202512161545:us-central1:warehouse-db=tcp:5432 &

# 6. Update .env.local
DATABASE_URL="postgresql://postgres:your-secure-password@localhost:5432/warehouse_network"

# 7. Run migrations
npx prisma migrate deploy

# 8. Start the app
npm run dev
```

### Option 2: Deploy Using App Engine (Alternative)

App Engine handles builds automatically and doesn't have the same manifest issues:

```bash
# 1. Create app.yaml
cat > app.yaml << 'EOF'
runtime: nodejs18
env: standard

instance_class: F2

env_variables:
  NODE_ENV: "production"

automatic_scaling:
  min_instances: 0
  max_instances: 2

handlers:
- url: /.*
  script: auto
  secure: always
EOF

# 2. Deploy to App Engine
gcloud app deploy --project=easyreno-poc-202512161545
```

### Option 3: Fix Cloud Run Deployment (When Ready)

To properly deploy to Cloud Run, follow these steps:

```bash
# 1. Clean build environment
rm -rf .next node_modules
npm install
npm run build

# 2. Create a working Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY .next ./.next
COPY public ./public
COPY prisma ./prisma
COPY next.config.js ./

# Generate Prisma Client
RUN npx prisma generate

# Expose port
ENV PORT 8080
EXPOSE 8080

# Run the application
CMD ["npm", "start"]
EOF

# 3. Build with Cloud Build (proper architecture)
gcloud builds submit \
  --tag gcr.io/easyreno-poc-202512161545/warehouse-app:latest \
  --timeout=30m

# 4. Deploy to Cloud Run
gcloud run deploy warehouse-app \
  --image gcr.io/easyreno-poc-202512161545/warehouse-app:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --set-env-vars NODE_ENV=production
```

## Current Status

- ✅ Application works perfectly locally
- ✅ All features implemented (design system, payment controls, tests)
- ✅ Authentication fixed with bcryptjs
- ⚠️ Cloud Run deployment blocked by Docker manifest issue
- 🔄 Multiple deployment attempts in progress

## Immediate Next Steps

1. **Use Local Development**: The app is fully functional locally. You can use it with Cloud SQL Proxy for production data access.

2. **Wait for Build Completion**: The `warehouse-final` deployment is currently building. Check status with:
   ```bash
   gcloud run services list --region us-central1
   ```

3. **Monitor Builds**: Check build progress:
   ```bash
   gcloud builds list --limit 5
   ```

## Production Checklist

- [ ] Set up Cloud SQL instance
- [ ] Configure Cloud SQL Proxy for local development
- [ ] Create production database and run migrations
- [ ] Set up environment variables (NEXTAUTH_SECRET, DATABASE_URL, etc.)
- [ ] Configure custom domain (optional)
- [ ] Set up monitoring and alerts
- [ ] Configure backups

## Cost Optimization

- **Local Development + Cloud SQL**: ~$7-10/month (just database)
- **App Engine**: ~$20-30/month (with autoscaling)
- **Cloud Run**: ~$5-10/month (when working)

## Support Resources

- [Cloud Run Troubleshooting](https://cloud.google.com/run/docs/troubleshooting)
- [Cloud SQL Proxy Setup](https://cloud.google.com/sql/docs/mysql/sql-proxy)
- [App Engine Node.js Guide](https://cloud.google.com/appengine/docs/standard/nodejs/)