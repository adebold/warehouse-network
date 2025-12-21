# Warehouse Network - Standalone Project Setup

## 🏢 Project Overview

Setting up Warehouse Network as an independent GCP project with its own P&L tracking.

## 🎯 Business Rationale

- **Independent P&L**: Track costs and revenue separately
- **Resource Isolation**: Dedicated resources and quotas
- **Billing Clarity**: Clear cost attribution
- **Access Control**: Independent IAM policies
- **Scalability**: Scale independently of other projects

## 📋 Setup Steps

### 1. Create New GCP Project

```bash
# Set project details
export PROJECT_NAME="warehouse-network"
export PROJECT_ID="warehouse-network-prod"
export BILLING_ACCOUNT_ID="<YOUR_BILLING_ACCOUNT_ID>"

# Create the project
gcloud projects create ${PROJECT_ID} \
  --name="${PROJECT_NAME}" \
  --organization=<ORG_ID>  # Optional if using organization

# Set as active project
gcloud config set project ${PROJECT_ID}

# Link billing account
gcloud billing projects link ${PROJECT_ID} \
  --billing-account=${BILLING_ACCOUNT_ID}
```

### 2. Enable Required APIs

```bash
# Enable all necessary APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  cloudresourcemanager.googleapis.com
```

### 3. Create Service Account for CI/CD

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions CI/CD" \
  --description="Service account for automated deployments"

# Assign roles
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
SERVICE_ACCOUNT="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"

# Cloud Run Admin
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.admin"

# Storage Admin (for artifacts)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.admin"

# Cloud Build Service Account User
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudbuild.builds.editor"

# Service Account User
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountUser"

# Create key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=${SERVICE_ACCOUNT}
```

### 4. Set Up Cloud SQL (PostgreSQL)

```bash
# Create Cloud SQL instance
gcloud sql instances create warehouse-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --network=default \
  --no-assign-ip

# Create database
gcloud sql databases create warehouse \
  --instance=warehouse-db

# Create user
gcloud sql users create warehouse-app \
  --instance=warehouse-db \
  --password=$(openssl rand -base64 32)
```

### 5. Configure GitHub Secrets

```bash
# Add secrets to GitHub repo
gh secret set GCP_PROJECT_ID --body "${PROJECT_ID}"
gh secret set GCP_SA_KEY < github-actions-key.json
gh secret set DATABASE_URL --body "postgresql://warehouse-app:PASSWORD@/warehouse?host=/cloudsql/${PROJECT_ID}:us-central1:warehouse-db"
gh secret set NEXTAUTH_SECRET --body "$(openssl rand -base64 32)"
gh secret set NEXTAUTH_URL --body "https://warehouse-network-prod.run.app"
```

### 6. Deploy Application

```bash
# Deploy using the hivemind script
cd apps/web
./deploy-hivemind.sh
```

## 💰 Cost Estimation

### Monthly Costs (Estimated)

- **Cloud Run**: $0-50 (with free tier)
- **Cloud SQL**: $10-50 (db-f1-micro)
- **Cloud Build**: $0-20 (300 free minutes)
- **Storage**: $0-10
- **Total**: ~$50-100/month

### Cost Optimization

1. Use Cloud Run minimum instances = 0
2. Schedule Cloud SQL to stop during off-hours
3. Enable Cloud CDN for static assets
4. Use committed use discounts for predictable workloads

## 📊 Monitoring & Reporting

### Set Up Budget Alerts

```bash
gcloud billing budgets create \
  --billing-account=${BILLING_ACCOUNT_ID} \
  --display-name="Warehouse Network Budget" \
  --budget-amount=100 \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

### P&L Tracking

1. Export billing data to BigQuery
2. Create Data Studio dashboard
3. Track:
   - Infrastructure costs
   - Per-transaction costs
   - Revenue (if applicable)
   - Profit margins

## 🔒 Security Best Practices

1. **Enable VPC Service Controls**
2. **Use Secret Manager for sensitive data**
3. **Enable Cloud Armor for DDoS protection**
4. **Configure Identity-Aware Proxy**
5. **Regular security scans**

## 🚀 Next Steps

1. **Custom Domain**: Map warehouse.yourdomain.com
2. **SSL Certificate**: Managed by Cloud Run
3. **CI/CD Pipeline**: GitHub Actions workflow
4. **Monitoring**: Set up alerts and dashboards
5. **Backup Strategy**: Automated Cloud SQL backups

## 📝 Quick Commands

```bash
# View project info
gcloud projects describe ${PROJECT_ID}

# View current costs
gcloud billing accounts list
gcloud alpha billing accounts budget list --billing-account=${BILLING_ACCOUNT_ID}

# Deploy updates
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated

# View logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50
```

## 🎯 Success Metrics

- **Deployment Time**: < 5 minutes
- **Cold Start**: < 3 seconds
- **Availability**: 99.9%
- **Monthly Cost**: < $100
- **Response Time**: < 200ms p95

---

This setup ensures Warehouse Network operates as an independent business unit with clear cost tracking and resource isolation.
