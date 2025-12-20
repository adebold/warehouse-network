#!/bin/bash

# AI Dustires Warehouse Network Setup Script

echo "🚀 Setting up AI Dustires Warehouse Network..."

# Set project variables
export PROJECT_ID="aindustries-warehouse"
export REGION="us-central1"
export SERVICE_NAME="warehouse-frontend"

# Create project
echo "📦 Creating Google Cloud Project..."
gcloud projects create $PROJECT_ID --name="AI Dustires Warehouse"

# Set as active project
gcloud config set project $PROJECT_ID

# Enable APIs
echo "🔧 Enabling required APIs..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Create service account
echo "👤 Creating service account for GitHub Actions..."
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions CI/CD" \
  --project=$PROJECT_ID

# Grant permissions
echo "🔐 Granting permissions..."
for role in "roles/run.admin" "roles/storage.admin" "roles/cloudbuild.builds.builder" "roles/secretmanager.secretAccessor" "roles/artifactregistry.admin"; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role"
done

# Create service account key
echo "🔑 Creating service account key..."
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@$PROJECT_ID.iam.gserviceaccount.com

# Generate secrets
echo "🎲 Generating application secrets..."
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Update GitHub secrets
echo "📝 Updating GitHub secrets..."
gh secret set GCP_SA_KEY < github-actions-key.json
gh secret set GCP_PROJECT_ID --body "$PROJECT_ID"
gh secret set NEXTAUTH_SECRET --body "$NEXTAUTH_SECRET"
gh secret set NEXTAUTH_URL --body "https://warehouse.aidustires.co"

# Create initial deployment
echo "🚀 Deploying to Cloud Run..."
cd apps/web
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --project $PROJECT_ID

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Visit https://console.cloud.google.com/billing to enable billing"
echo "2. Your app will be at: https://$SERVICE_NAME-[hash].$REGION.run.app"
echo "3. Configure custom domain in Cloud Run console for warehouse.aidustires.co"