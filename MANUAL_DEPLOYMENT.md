# Manual GCP Deployment Steps

Since automated deployment requires elevated permissions, here are the manual steps:

## 1. Setup Project in GCP Console

Go to [Google Cloud Console](https://console.cloud.google.com) and:

### A. Create/Select Project

1. Create a new project or use existing: `warehouse-network-app`
2. Enable billing on the project
3. Note your PROJECT_ID

### B. Enable APIs

Navigate to APIs & Services > Library and enable:

- Cloud Run API
- Cloud Build API
- Cloud SQL Admin API
- Memorystore for Redis API
- Secret Manager API
- Artifact Registry API

## 2. Create Cloud SQL Instance

```bash
# In Cloud Console > SQL:
# - Create PostgreSQL 15 instance
# - Name: warehouse-network-db
# - Region: us-central1
# - Machine type: db-f1-micro (shared core)
# - Storage: 10GB SSD
# - Private IP: Enable
# - Database: warehouse_network
```

## 3. Create Redis Instance

```bash
# In Cloud Console > Memorystore > Redis:
# - Instance ID: warehouse-network-redis
# - Region: us-central1
# - Tier: Basic
# - Capacity: 1GB
# - Version: 7.0
```

## 4. Create Secrets

Go to Secret Manager and create:

```bash
# Secret: nextauth-secret
# Value: $(openssl rand -base64 32)

# Secret: db-password
# Value: [secure password for postgres user]

# Secret: stripe-secret-key (optional)
# Value: sk_test_...

# Secret: sendgrid-api-key (optional)
# Value: SG....
```

## 5. Build and Deploy

### Option A: Using Cloud Shell

1. Open Cloud Shell in your project
2. Clone your repository:

```bash
git clone https://github.com/your-username/warehouse-network.git
cd warehouse-network
```

3. Build the image:

```bash
gcloud builds submit --tag gcr.io/[PROJECT-ID]/warehouse-network-web:latest apps/web/
```

4. Deploy to Cloud Run:

```bash
gcloud run deploy warehouse-network-web \
  --image gcr.io/[PROJECT-ID]/warehouse-network-web:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --add-cloudsql-instances [PROJECT-ID]:us-central1:warehouse-network-db \
  --set-env-vars "NODE_ENV=production,DATABASE_URL=postgresql://postgres:[DB_PASSWORD]@localhost:5432/warehouse_network?host=/cloudsql/[PROJECT-ID]:us-central1:warehouse-network-db,NEXTAUTH_URL=https://warehouse-network-web-[hash].a.run.app,REDIS_URL=redis://[REDIS_IP]:6379"
```

### Option B: Using Dockerfile Locally

1. Set up gcloud authentication with application default:

```bash
gcloud auth application-default login
```

2. Configure Docker to use gcloud:

```bash
gcloud auth configure-docker
```

3. Build and push:

```bash
docker build -t gcr.io/[PROJECT-ID]/warehouse-network-web:latest -f apps/web/Dockerfile .
docker push gcr.io/[PROJECT-ID]/warehouse-network-web:latest
```

4. Deploy using Cloud Console:
   - Go to Cloud Run
   - Create Service
   - Select the pushed container image
   - Configure environment variables

## 6. Environment Variables Needed

```
NODE_ENV=production
DATABASE_URL=postgresql://postgres:[PASSWORD]@localhost:5432/warehouse_network?host=/cloudsql/[PROJECT-ID]:us-central1:warehouse-network-db
DIRECT_URL=postgresql://postgres:[PASSWORD]@localhost:5432/warehouse_network?host=/cloudsql/[PROJECT-ID]:us-central1:warehouse-network-db
NEXTAUTH_URL=https://[YOUR-CLOUD-RUN-URL]
NEXTAUTH_SECRET=[FROM_SECRET_MANAGER]
REDIS_URL=redis://[REDIS_IP]:6379
```

## 7. Run Database Migrations

After deployment, run migrations:

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe warehouse-network-web --region=us-central1 --format="value(status.url)")

# Run migrations via Cloud Run job or exec into container
gcloud run jobs create migration-job \
  --image gcr.io/[PROJECT-ID]/warehouse-network-web:latest \
  --region us-central1 \
  --command="npx,prisma,migrate,deploy"
```

## 8. Test Deployment

1. Visit your Cloud Run service URL
2. Check health endpoint: `[URL]/api/health`
3. Test authentication: `[URL]/login`

## Cost Optimization Tips

1. **Keep min-instances = 0** for scale-to-zero
2. **Use db-f1-micro** for Cloud SQL (cheapest)
3. **Basic Redis tier** for caching only
4. **Set request timeout** to 300 seconds max
5. **Monitor usage** with Cloud Monitoring

## Troubleshooting

1. **Check logs**: `gcloud run services logs read warehouse-network-web --region=us-central1`
2. **Health check**: Visit `/api/health` endpoint
3. **Database connectivity**: Verify Cloud SQL proxy is working
4. **Redis connection**: Check VPC connectivity

Your total monthly cost should be around $35-45 for low traffic.
