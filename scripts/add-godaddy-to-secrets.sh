#!/bin/bash
set -euo pipefail

# Add GoDaddy API credentials to Google Cloud Secret Manager
echo "🔐 Adding GoDaddy API credentials to Google Cloud Secret Manager..."

PROJECT_ID="aindustries-warehouse"

# Create secrets for GoDaddy API
echo "Creating GODADDY_API_KEY secret..."
echo -n "9EJVgVNkYjE_XJekSwP5BkT928AwmWPeNc" | gcloud secrets create GODADDY_API_KEY \
    --data-file=- \
    --project="${PROJECT_ID}" \
    --replication-policy="automatic" \
    || echo "Secret GODADDY_API_KEY already exists"

echo "Creating GODADDY_API_SECRET secret..."
echo -n "6AdQmkB2aurJNJrbUerTzW" | gcloud secrets create GODADDY_API_SECRET \
    --data-file=- \
    --project="${PROJECT_ID}" \
    --replication-policy="automatic" \
    || echo "Secret GODADDY_API_SECRET already exists"

# Grant service account access
SERVICE_ACCOUNT="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Granting access to service account..."
gcloud secrets add-iam-policy-binding GODADDY_API_KEY \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}"

gcloud secrets add-iam-policy-binding GODADDY_API_SECRET \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}"

# Also update NEXTAUTH_URL
echo "Updating NEXTAUTH_URL to use skidspace.com..."
echo -n "https://skidspace.com" | gcloud secrets versions add NEXTAUTH_URL \
    --data-file=- \
    --project="${PROJECT_ID}" \
    || echo "Failed to update NEXTAUTH_URL - may need to create it first"

echo "✅ Secrets added successfully!"
echo ""
echo "📋 Secrets available in Google Cloud:"
echo "- GODADDY_API_KEY"
echo "- GODADDY_API_SECRET"
echo "- NEXTAUTH_URL (updated to https://skidspace.com)"