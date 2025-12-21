# AI Dustires Warehouse Network Setup

## Account Details

- **Email**: alex@aidustires.co
- **Domain**: aidustires.co
- **Purpose**: Production deployment of Warehouse Network

## Setup Steps

### 1. Configure gcloud with new account

```bash
# Add the new account
gcloud auth login alex@aidustires.co

# Create new configuration
gcloud config configurations create aidustires
gcloud config set account alex@aidustires.co
```

### 2. Create GCP Project

```bash
# Set project name
export PROJECT_ID="aidustires-warehouse"

# Create project
gcloud projects create $PROJECT_ID --name="AI Dustires Warehouse"

# Set as active project
gcloud config set project $PROJECT_ID

# Enable billing (required for Cloud Run)
# Visit: https://console.cloud.google.com/billing
```

### 3. Enable Required APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### 4. Create Service Account for GitHub Actions

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions CI/CD" \
  --project=$PROJECT_ID

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"

# Create key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@$PROJECT_ID.iam.gserviceaccount.com
```

### 5. Configure GitHub Secrets

```bash
# Add GCP credentials
gh secret set GCP_SA_KEY < github-actions-key.json
gh secret set GCP_PROJECT_ID --body "$PROJECT_ID"

# Add application secrets
gh secret set NEXTAUTH_SECRET --body "$(openssl rand -base64 32)"
gh secret set NEXTAUTH_URL --body "https://warehouse.aidustires.co"
```

### 6. Deploy Application

```bash
cd apps/web
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project $PROJECT_ID
```

### 7. Configure Custom Domain

After deployment, set up custom domain:

1. Go to Cloud Run console
2. Click "Manage Custom Domains"
3. Add domain: warehouse.aidustires.co
4. Update DNS records as instructed

## Production URLs

- **Application**: https://warehouse.aidustires.co
- **Cloud Run**: https://warehouse-frontend-[hash].us-central1.run.app
