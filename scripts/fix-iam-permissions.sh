#!/bin/bash
# Fix IAM permissions for GitOps deployment

PROJECT_ID="aindustries-warehouse"
GITHUB_SA="github-actions-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUDRUN_SA="warehouse-app@${PROJECT_ID}.iam.gserviceaccount.com"

echo "🔐 Fixing IAM permissions for GitOps deployment..."

# Grant the GitHub Actions service account permission to act as the Cloud Run service account
echo "🔓 Granting iam.serviceAccounts.actAs permission..."
gcloud iam service-accounts add-iam-policy-binding $CLOUDRUN_SA \
  --member="serviceAccount:$GITHUB_SA" \
  --role="roles/iam.serviceAccountUser" \
  --project=$PROJECT_ID

# Also ensure Cloud Run Admin permission
echo "🚀 Ensuring Cloud Run Admin permission..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$GITHUB_SA" \
  --role="roles/run.admin"

# Grant access to Artifact Registry
echo "📦 Ensuring Artifact Registry access..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$GITHUB_SA" \
  --role="roles/artifactregistry.writer"

# Verify permissions
echo "✅ Verifying permissions..."
echo ""
echo "GitHub Actions service account roles:"
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$GITHUB_SA" \
  --format="table(bindings.role)"

echo ""
echo "Cloud Run service account IAM policy:"
gcloud iam service-accounts get-iam-policy $CLOUDRUN_SA \
  --format=json | jq '.bindings'

echo ""
echo "✅ IAM permissions fixed!"
echo ""
echo "🚀 You can now re-run the GitHub Actions workflow."