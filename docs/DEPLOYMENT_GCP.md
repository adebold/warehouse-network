# Google Cloud Run Deployment Guide

This guide walks you through deploying the Warehouse Network application to Google Cloud Run with Cloud SQL (PostgreSQL) and Memorystore (Redis).

## Prerequisites

1. Google Cloud Account with billing enabled
2. `gcloud` CLI installed and configured
3. Docker installed locally
4. Project cloned and working locally

## Quick Start

```bash
# Set your project ID
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"

# Run the deployment script
./scripts/deploy-gcp.sh
```

## Manual Deployment Steps

### 1. Set Up Google Cloud Project

```bash
# Set project
gcloud config set project ${GCP_PROJECT_ID}

# Enable required APIs
gcloud services enable \
    cloudrun.googleapis.com \
    cloudbuild.googleapis.com \
    sqladmin.googleapis.com \
    redis.googleapis.com \
    secretmanager.googleapis.com
```

### 2. Create Cloud SQL Instance

```bash
# Create PostgreSQL instance
gcloud sql instances create warehouse-network-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=${GCP_REGION} \
    --network=default \
    --no-assign-ip

# Create database
gcloud sql databases create warehouse_network \
    --instance=warehouse-network-db

# Set password
gcloud sql users set-password postgres \
    --instance=warehouse-network-db \
    --password=YOUR_SECURE_PASSWORD
```

### 3. Create Redis Instance

```bash
gcloud redis instances create warehouse-network-redis \
    --size=1 \
    --region=${GCP_REGION} \
    --tier=basic \
    --redis-version=redis_7_0
```

### 4. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create warehouse-network-sa \
    --display-name="Warehouse Network Service Account"

# Grant permissions
gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
    --member="serviceAccount:warehouse-network-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"
```

### 5. Build and Deploy

```bash
# Submit build
gcloud builds submit --config=cloudbuild.yaml

# Or deploy directly
gcloud run deploy warehouse-network-web \
    --source . \
    --region=${GCP_REGION} \
    --allow-unauthenticated \
    --service-account=warehouse-network-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com \
    --add-cloudsql-instances=YOUR_CLOUD_SQL_CONNECTION_NAME
```

## Environment Variables

Create these secrets in Secret Manager:

```bash
# Create secrets
echo "your-nextauth-secret" | gcloud secrets create nextauth-secret --data-file=-
echo "your-db-password" | gcloud secrets create db-password --data-file=-
echo "sk_test_..." | gcloud secrets create stripe-secret-key --data-file=-
```

## Monitoring

```bash
# View logs
gcloud run services logs read warehouse-network-web --region=${GCP_REGION}

# View metrics
gcloud monitoring dashboards list

# SSH into container (for debugging)
gcloud run services describe warehouse-network-web --region=${GCP_REGION}
```

## Cost Optimization

1. **Cloud Run**: 
   - Set min instances to 0 for scale-to-zero
   - Use CPU allocation only during request processing
   - Set appropriate memory limits (1Gi is usually sufficient)

2. **Cloud SQL**:
   - Use db-f1-micro for development/small workloads
   - Enable automatic storage increase
   - Set up backups during low-traffic hours

3. **Redis**:
   - Use basic tier for caching only
   - Set appropriate eviction policies
   - Monitor memory usage

## Security Best Practices

1. Use Secret Manager for all sensitive values
2. Enable VPC connector for private communication
3. Set up Cloud Armor for DDoS protection
4. Use least privilege for service accounts
5. Enable audit logging

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check Cloud SQL proxy is enabled
   - Verify connection string format
   - Check service account permissions

2. **High Memory Usage**
   - Review Next.js build output size
   - Optimize Docker image layers
   - Check for memory leaks in application

3. **Cold Start Issues**
   - Set min instances to 1
   - Optimize application startup time
   - Use lighter base images

## Updating the Application

```bash
# Update environment variables
gcloud run services update warehouse-network-web \
    --region=${GCP_REGION} \
    --set-env-vars KEY=VALUE

# Deploy new version
gcloud builds submit --config=cloudbuild.yaml

# Rollback if needed
gcloud run services update warehouse-network-web \
    --region=${GCP_REGION} \
    --tag=previous
```

## Backup and Disaster Recovery

1. **Database Backups**:
   ```bash
   gcloud sql backups create --instance=warehouse-network-db
   ```

2. **Export Data**:
   ```bash
   gcloud sql export sql warehouse-network-db \
       gs://your-backup-bucket/backup.sql \
       --database=warehouse_network
   ```

3. **Restore from Backup**:
   ```bash
   gcloud sql backups restore BACKUP_ID \
       --restore-instance=warehouse-network-db
   ```