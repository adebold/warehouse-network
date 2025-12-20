#!/bin/bash

# Warehouse Network - Standalone Project Setup Script
# Creates a new GCP project with all necessary resources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🏢 Warehouse Network - Standalone Project Setup${NC}"
echo "=============================================="
echo ""

# Get user input
read -p "Enter project ID (e.g., warehouse-network-prod): " PROJECT_ID
read -p "Enter project name (e.g., Warehouse Network): " PROJECT_NAME
read -p "Enter billing account ID: " BILLING_ACCOUNT_ID
read -p "Enter your email: " USER_EMAIL

# Optional: Organization ID
read -p "Enter organization ID (press Enter to skip): " ORG_ID

echo ""
echo -e "${YELLOW}📋 Configuration Summary:${NC}"
echo "Project ID: ${PROJECT_ID}"
echo "Project Name: ${PROJECT_NAME}"
echo "Billing Account: ${BILLING_ACCOUNT_ID}"
echo "Admin Email: ${USER_EMAIL}"
echo "Organization: ${ORG_ID:-"None"}"
echo ""

read -p "Continue with setup? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Step 1: Create Project
echo ""
echo -e "${BLUE}📁 Step 1: Creating GCP Project...${NC}"
if [ -n "$ORG_ID" ]; then
    gcloud projects create ${PROJECT_ID} \
        --name="${PROJECT_NAME}" \
        --organization=${ORG_ID}
else
    gcloud projects create ${PROJECT_ID} \
        --name="${PROJECT_NAME}"
fi

# Set as active project
gcloud config set project ${PROJECT_ID}

# Step 2: Link Billing
echo ""
echo -e "${BLUE}💳 Step 2: Linking Billing Account...${NC}"
gcloud billing projects link ${PROJECT_ID} \
    --billing-account=${BILLING_ACCOUNT_ID}

# Step 3: Enable APIs
echo ""
echo -e "${BLUE}🔧 Step 3: Enabling Required APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    containerregistry.googleapis.com \
    artifactregistry.googleapis.com \
    sqladmin.googleapis.com \
    compute.googleapis.com \
    monitoring.googleapis.com \
    logging.googleapis.com \
    cloudresourcemanager.googleapis.com \
    secretmanager.googleapis.com

echo -e "${GREEN}✓ APIs enabled${NC}"

# Step 4: Create Artifact Registry
echo ""
echo -e "${BLUE}📦 Step 4: Creating Artifact Registry...${NC}"
gcloud artifacts repositories create warehouse-docker \
    --repository-format=docker \
    --location=us-central1 \
    --description="Docker repository for Warehouse Network"

# Step 5: Create Service Account
echo ""
echo -e "${BLUE}🔐 Step 5: Creating Service Account for CI/CD...${NC}"
SERVICE_ACCOUNT="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create github-actions \
    --display-name="GitHub Actions CI/CD" \
    --description="Service account for automated deployments"

# Assign necessary roles
ROLES=(
    "roles/run.admin"
    "roles/storage.admin"
    "roles/cloudbuild.builds.editor"
    "roles/iam.serviceAccountUser"
    "roles/artifactregistry.writer"
    "roles/logging.logWriter"
)

for role in "${ROLES[@]}"; do
    echo "Granting ${role}..."
    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="${role}"
done

# Step 6: Create Cloud SQL Instance
echo ""
echo -e "${BLUE}🗄️  Step 6: Creating Cloud SQL Instance...${NC}"
echo -e "${YELLOW}Note: This will create a small instance to minimize costs${NC}"

gcloud sql instances create warehouse-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --network=default \
    --no-assign-ip \
    --storage-size=10GB \
    --storage-type=HDD

# Create database
gcloud sql databases create warehouse \
    --instance=warehouse-db

# Generate secure password
DB_PASSWORD=$(openssl rand -base64 32)

# Create user
gcloud sql users create warehouse-app \
    --instance=warehouse-db \
    --password="${DB_PASSWORD}"

# Step 7: Set up Secret Manager
echo ""
echo -e "${BLUE}🔒 Step 7: Storing Secrets...${NC}"

# Store database password
echo -n "${DB_PASSWORD}" | gcloud secrets create db-password \
    --data-file=- \
    --replication-policy="automatic"

# Generate and store NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo -n "${NEXTAUTH_SECRET}" | gcloud secrets create nextauth-secret \
    --data-file=- \
    --replication-policy="automatic"

# Grant service account access to secrets
gcloud secrets add-iam-policy-binding db-password \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding nextauth-secret \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"

# Step 8: Create Budget Alert
echo ""
echo -e "${BLUE}💰 Step 8: Creating Budget Alerts...${NC}"
gcloud billing budgets create \
    --billing-account=${BILLING_ACCOUNT_ID} \
    --display-name="Warehouse Network Monthly Budget" \
    --budget-amount=100 \
    --threshold-rule=percent=50,basis=current-spend \
    --threshold-rule=percent=90,basis=current-spend \
    --threshold-rule=percent=100,basis=current-spend \
    --notification-channels=""

# Step 9: Create Service Account Key
echo ""
echo -e "${BLUE}🔑 Step 9: Creating Service Account Key...${NC}"
gcloud iam service-accounts keys create warehouse-github-key.json \
    --iam-account=${SERVICE_ACCOUNT}

# Step 10: Output Configuration
echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo -e "${BLUE}📋 Project Configuration:${NC}"
echo "========================"
echo "Project ID: ${PROJECT_ID}"
echo "Project Name: ${PROJECT_NAME}"
echo "Service Account: ${SERVICE_ACCOUNT}"
echo "Database Host: ${PROJECT_ID}:us-central1:warehouse-db"
echo "Artifact Registry: us-central1-docker.pkg.dev/${PROJECT_ID}/warehouse-docker"
echo ""
echo -e "${BLUE}🔐 GitHub Secrets to Configure:${NC}"
echo "=============================="
echo "GCP_PROJECT_ID: ${PROJECT_ID}"
echo "GCP_SA_KEY: (contents of warehouse-github-key.json)"
echo "DATABASE_URL: postgresql://warehouse-app:***@localhost/warehouse?host=/cloudsql/${PROJECT_ID}:us-central1:warehouse-db"
echo ""
echo -e "${YELLOW}⚠️  Important Next Steps:${NC}"
echo "1. Add the service account key to GitHub Secrets:"
echo "   gh secret set GCP_SA_KEY < warehouse-github-key.json"
echo ""
echo "2. Add other secrets to GitHub:"
echo "   gh secret set GCP_PROJECT_ID --body \"${PROJECT_ID}\""
echo ""
echo "3. Deploy the application:"
echo "   cd apps/web && ./deploy-hivemind.sh"
echo ""
echo "4. Delete the local service account key:"
echo "   rm warehouse-github-key.json"
echo ""
echo -e "${GREEN}🎉 Your Warehouse Network project is ready for deployment!${NC}"

# Save configuration
cat > warehouse-project-config.env << EOF
# Warehouse Network Project Configuration
# Generated on $(date)

PROJECT_ID=${PROJECT_ID}
PROJECT_NAME="${PROJECT_NAME}"
SERVICE_ACCOUNT=${SERVICE_ACCOUNT}
DATABASE_INSTANCE=${PROJECT_ID}:us-central1:warehouse-db
ARTIFACT_REGISTRY=us-central1-docker.pkg.dev/${PROJECT_ID}/warehouse-docker
REGION=us-central1
EOF

echo ""
echo -e "${BLUE}💾 Configuration saved to warehouse-project-config.env${NC}"