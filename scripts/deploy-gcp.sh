#!/bin/bash

# Google Cloud Run Deployment Script
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"your-project-id"}
REGION=${GCP_REGION:-"us-central1"}
SERVICE_NAME="warehouse-network-web"
DB_INSTANCE_NAME="warehouse-network-db"
REDIS_INSTANCE_NAME="warehouse-network-redis"

echo -e "${BLUE}🚀 Starting Google Cloud Run deployment...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed. Please install it first.${NC}"
    echo "Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not authenticated. Running gcloud auth login...${NC}"
    gcloud auth login
fi

# Set project
echo -e "${BLUE}Setting project to: ${PROJECT_ID}${NC}"
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo -e "${BLUE}Enabling required Google Cloud APIs...${NC}"
gcloud services enable \
    cloudrun.googleapis.com \
    cloudbuild.googleapis.com \
    sqladmin.googleapis.com \
    redis.googleapis.com \
    secretmanager.googleapis.com \
    artifactregistry.googleapis.com \
    containerregistry.googleapis.com

# Create service account if it doesn't exist
SERVICE_ACCOUNT="warehouse-network-sa"
if ! gcloud iam service-accounts describe ${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com &> /dev/null; then
    echo -e "${BLUE}Creating service account...${NC}"
    gcloud iam service-accounts create ${SERVICE_ACCOUNT} \
        --display-name="Warehouse Network Service Account"
    
    # Grant necessary permissions
    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/cloudsql.client"
    
    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/redis.editor"
fi

# Check if Cloud SQL instance exists
if ! gcloud sql instances describe ${DB_INSTANCE_NAME} --region=${REGION} &> /dev/null; then
    echo -e "${YELLOW}⚠️  Cloud SQL instance not found. Creating...${NC}"
    gcloud sql instances create ${DB_INSTANCE_NAME} \
        --database-version=POSTGRES_15 \
        --tier=db-f1-micro \
        --region=${REGION} \
        --network=default \
        --no-assign-ip \
        --database-flags=max_connections=100
    
    # Create database
    gcloud sql databases create warehouse_network \
        --instance=${DB_INSTANCE_NAME}
    
    # Set root password
    gcloud sql users set-password postgres \
        --instance=${DB_INSTANCE_NAME} \
        --password=$(openssl rand -base64 32)
fi

# Check if Redis instance exists
if ! gcloud redis instances describe ${REDIS_INSTANCE_NAME} --region=${REGION} &> /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Redis instance not found. Creating...${NC}"
    gcloud redis instances create ${REDIS_INSTANCE_NAME} \
        --size=1 \
        --region=${REGION} \
        --tier=basic \
        --redis-version=redis_7_0
fi

# Create secrets if they don't exist
echo -e "${BLUE}Creating/updating secrets...${NC}"

# Function to create or update secret
create_or_update_secret() {
    local SECRET_NAME=$1
    local SECRET_VALUE=$2
    
    if gcloud secrets describe ${SECRET_NAME} &> /dev/null; then
        echo "${SECRET_VALUE}" | gcloud secrets versions add ${SECRET_NAME} --data-file=-
    else
        echo "${SECRET_VALUE}" | gcloud secrets create ${SECRET_NAME} --data-file=-
        # Grant access to service account
        gcloud secrets add-iam-policy-binding ${SECRET_NAME} \
            --member="serviceAccount:${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
            --role="roles/secretmanager.secretAccessor"
    fi
}

# Generate secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 32)

create_or_update_secret "nextauth-secret" "${NEXTAUTH_SECRET}"
create_or_update_secret "db-password" "${DB_PASSWORD}"
create_or_update_secret "stripe-secret-key" "sk_test_your_stripe_key"
create_or_update_secret "stripe-webhook-secret" "whsec_your_webhook_secret"
create_or_update_secret "sendgrid-api-key" "SG.your_sendgrid_key"

# Update database password
gcloud sql users set-password postgres \
    --instance=${DB_INSTANCE_NAME} \
    --password=${DB_PASSWORD}

# Build and deploy
echo -e "${BLUE}Building and deploying to Cloud Run...${NC}"

# Get Cloud SQL connection name
CLOUD_SQL_CONNECTION=$(gcloud sql instances describe ${DB_INSTANCE_NAME} --format="value(connectionName)")

# Get Redis host
REDIS_HOST=$(gcloud redis instances describe ${REDIS_INSTANCE_NAME} --region=${REGION} --format="value(host)")

# Deploy using Cloud Build
gcloud builds submit \
    --config=cloudbuild.yaml \
    --substitutions=_REGION=${REGION},_DB_PASSWORD=${DB_PASSWORD},_CLOUD_SQL_CONNECTION_NAME=${CLOUD_SQL_CONNECTION},_REDIS_HOST=${REDIS_HOST}

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format="value(status.url)")

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Update your domain DNS to point to the Cloud Run service"
echo "2. Configure Stripe webhooks to use: ${SERVICE_URL}/api/stripe/webhook"
echo "3. Set up Cloud Scheduler for periodic tasks if needed"
echo "4. Monitor logs: gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "- View logs: gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --tail=50"
echo "- Update env vars: gcloud run services update ${SERVICE_NAME} --region=${REGION} --set-env-vars KEY=VALUE"
echo "- Scale service: gcloud run services update ${SERVICE_NAME} --region=${REGION} --min-instances=1 --max-instances=10"