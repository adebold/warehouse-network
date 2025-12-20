#!/bin/bash

# Quick Warehouse Project Setup
# Simplified version for immediate deployment

set -e

echo "🏢 Quick Warehouse Network Project Setup"
echo "======================================"
echo ""

# Configuration
PROJECT_ID="warehouse-network-$(date +%Y%m%d)"
PROJECT_NAME="Warehouse Network"
REGION="us-central1"

echo "Creating project: ${PROJECT_ID}"
echo ""

# Step 1: Create project (using current billing)
echo "📁 Creating GCP Project..."
gcloud projects create ${PROJECT_ID} --name="${PROJECT_NAME}"
gcloud config set project ${PROJECT_ID}

# Step 2: Get billing account from current config
echo "💳 Linking billing..."
BILLING_ACCOUNT=$(gcloud billing accounts list --format="value(name)" --limit=1)
if [ -n "$BILLING_ACCOUNT" ]; then
    gcloud billing projects link ${PROJECT_ID} --billing-account=${BILLING_ACCOUNT}
else
    echo "⚠️  No billing account found. Please link manually."
fi

# Step 3: Enable essential APIs
echo "🔧 Enabling APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# Step 4: Simple deployment
echo ""
echo "🚀 Ready for deployment!"
echo ""
echo "To deploy immediately:"
echo "  cd apps/web"
echo "  gcloud run deploy warehouse-frontend --source . --region ${REGION} --allow-unauthenticated"
echo ""
echo "Project ID: ${PROJECT_ID}"
echo "Region: ${REGION}"