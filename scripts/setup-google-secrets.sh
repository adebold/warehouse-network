#!/bin/bash
# Setup script for Google Secret Manager secrets
# This script should be run once to configure production secrets

PROJECT_ID="aindustries-warehouse"
INSTANCE_NAME="warehouse-production-db"
REGION="us-central1"

echo "🔐 Setting up Google Secret Manager for production..."

# Enable required APIs
echo "📡 Enabling required Google Cloud APIs..."
gcloud services enable secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project=$PROJECT_ID

# Create Cloud SQL instance if it doesn't exist
echo "🗄️ Checking Cloud SQL instance..."
if ! gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID &>/dev/null; then
  echo "Creating Cloud SQL instance..."
  gcloud sql instances create $INSTANCE_NAME \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=$REGION \
    --root-password=warehouse-admin-2024 \
    --database-flags=cloudsql.enable_auth_proxy=on \
    --project=$PROJECT_ID
    
  # Create database
  gcloud sql databases create warehouse_network \
    --instance=$INSTANCE_NAME \
    --project=$PROJECT_ID
    
  # Create user
  gcloud sql users create warehouse \
    --instance=$INSTANCE_NAME \
    --password=warehouse-prod-2024 \
    --project=$PROJECT_ID
fi

# Get connection name
CONNECTION_NAME=$(gcloud sql instances describe $INSTANCE_NAME \
  --project=$PROJECT_ID \
  --format="value(connectionName)")

echo "📝 Cloud SQL Connection Name: $CONNECTION_NAME"

# Create secrets in Secret Manager
echo "🔒 Creating secrets in Google Secret Manager..."

# Database URL with Cloud SQL proxy format
DATABASE_URL="postgresql://warehouse:warehouse-prod-2024@localhost:5432/warehouse_network?host=/cloudsql/$CONNECTION_NAME"
echo -n "$DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=- --project=$PROJECT_ID 2>/dev/null || \
  echo -n "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL --data-file=- --project=$PROJECT_ID

# Redis URL (using Google Memorystore)
REDIS_URL="redis://10.0.0.3:6379"
echo -n "$REDIS_URL" | gcloud secrets create REDIS_URL --data-file=- --project=$PROJECT_ID 2>/dev/null || \
  echo -n "$REDIS_URL" | gcloud secrets versions add REDIS_URL --data-file=- --project=$PROJECT_ID

# NextAuth Secret
NEXTAUTH_SECRET=$(openssl rand -hex 32)
echo -n "$NEXTAUTH_SECRET" | gcloud secrets create NEXTAUTH_SECRET --data-file=- --project=$PROJECT_ID 2>/dev/null || \
  echo -n "$NEXTAUTH_SECRET" | gcloud secrets versions add NEXTAUTH_SECRET --data-file=- --project=$PROJECT_ID

# Google Analytics Measurement ID
GA_MEASUREMENT_ID="G-YOUR_ACTUAL_ID"  # Replace with actual ID
echo -n "$GA_MEASUREMENT_ID" | gcloud secrets create GA_MEASUREMENT_ID --data-file=- --project=$PROJECT_ID 2>/dev/null || \
  echo -n "$GA_MEASUREMENT_ID" | gcloud secrets versions add GA_MEASUREMENT_ID --data-file=- --project=$PROJECT_ID

# Grant access to service account
echo "🔓 Granting secret access to service account..."
SERVICE_ACCOUNT="warehouse-app@$PROJECT_ID.iam.gserviceaccount.com"

for SECRET in DATABASE_URL REDIS_URL NEXTAUTH_SECRET GA_MEASUREMENT_ID; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudsql.client"

echo "✅ Secret Manager setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update GA_MEASUREMENT_ID in Secret Manager with actual Google Analytics ID"
echo "2. Set up Redis instance (Google Memorystore) and update REDIS_URL"
echo "3. Run database migrations: npm run db:migrate:prod"
echo "4. Deploy using GitOps workflow: git push to main branch"
echo ""
echo "🔍 To verify secrets:"
echo "gcloud secrets list --project=$PROJECT_ID"
echo ""
echo "🔍 To update a secret (e.g., GA_MEASUREMENT_ID):"
echo "echo -n 'G-XXXXXXXXXX' | gcloud secrets versions add GA_MEASUREMENT_ID --data-file=- --project=$PROJECT_ID"