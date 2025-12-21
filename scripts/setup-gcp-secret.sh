#!/bin/bash

echo "Setting up GCP Service Account for GitHub Actions..."

# Project ID
PROJECT_ID="aindustries-warehouse"
SA_NAME="github-actions-deploy"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "1. Make sure you're authenticated with the correct GCP account:"
echo "   gcloud auth login"
echo ""

echo "2. Set the correct project:"
echo "   gcloud config set project ${PROJECT_ID}"
echo ""

echo "3. Create service account (if it doesn't exist):"
echo "   gcloud iam service-accounts create ${SA_NAME} \\"
echo "     --description=\"Service account for GitHub Actions deployment\" \\"
echo "     --display-name=\"GitHub Actions Deploy\""
echo ""

echo "4. Grant necessary permissions:"
echo "   gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
echo "     --member=\"serviceAccount:${SA_EMAIL}\" \\"
echo "     --role=\"roles/run.admin\""
echo ""
echo "   gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
echo "     --member=\"serviceAccount:${SA_EMAIL}\" \\"
echo "     --role=\"roles/storage.admin\""
echo ""
echo "   gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
echo "     --member=\"serviceAccount:${SA_EMAIL}\" \\"
echo "     --role=\"roles/artifactregistry.admin\""
echo ""

echo "5. Create and download the service account key:"
echo "   gcloud iam service-accounts keys create ./gcp-key.json \\"
echo "     --iam-account=${SA_EMAIL}"
echo ""

echo "6. Base64 encode the key for GitHub Secret:"
echo "   base64 -i ./gcp-key.json | pbcopy"
echo ""

echo "7. Create GitHub secret:"
echo "   gh secret set GCP_SA_KEY --body \"\$(base64 -i ./gcp-key.json)\""
echo ""

echo "8. Clean up the local key file:"
echo "   rm ./gcp-key.json"
echo ""

echo "Then your deployment should work!"