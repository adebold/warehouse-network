# Warehouse App Gmail & GCP Setup Guide

## Steps to Create Dedicated Warehouse App Account

### 1. Create Gmail Account
- **Email**: warehouseapp2024@gmail.com (or similar)
- **Purpose**: Dedicated account for warehouse application deployment

### 2. Set Up Google Cloud Project
After creating the Gmail account:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project: "warehouse-network-prod"
3. Enable required APIs:
   ```bash
   gcloud services enable run.googleapis.com \
     cloudbuild.googleapis.com \
     containerregistry.googleapis.com \
     sqladmin.googleapis.com
   ```

### 3. Create Service Account for GitHub Actions
```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions CI/CD"

# Grant permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Create and download key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@PROJECT_ID.iam.gserviceaccount.com
```

### 4. Configure GitHub Secrets
Add these secrets to your GitHub repository:

```bash
# Add GCP credentials
gh secret set GCP_SA_KEY < github-actions-key.json

# Add project ID
gh secret set GCP_PROJECT_ID --body "warehouse-network-prod"

# Add other secrets
gh secret set NEXTAUTH_SECRET --body "$(openssl rand -base64 32)"
```

### 5. Update GitHub Actions Workflow
The deploy-gcp.yml workflow will now work with proper authentication:

```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    credentials_json: ${{ secrets.GCP_SA_KEY }}
```

## Benefits
- ✅ No organizational policy restrictions
- ✅ Full control over service accounts
- ✅ Automated CI/CD deployment
- ✅ Clean production environment
- ✅ Free tier eligibility ($300 credit)

## Quick Deploy Command
Once set up, deployment is automatic on push to main, or manual:
```bash
gh workflow run deploy-gcp.yml
```

---

This approach gives you full control without organizational restrictions!