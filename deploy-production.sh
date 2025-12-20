#!/bin/bash

# Production deployment script for Warehouse Network
set -euo pipefail

# Configuration
PROJECT_ID="easyreno-demo-20251219144606"
REGION="us-central1"
APP_NAME="warehouse-network"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${APP_NAME}"
SERVICE_NAME="${APP_NAME}-app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if gcloud is installed and authenticated
    if ! command -v gcloud &> /dev/null; then
        error "gcloud CLI is not installed. Please install it first."
    fi
    
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1 > /dev/null; then
        error "Please authenticate with gcloud: gcloud auth login"
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        error "Docker is not running. Please start Docker Desktop."
    fi
    
    log "Prerequisites check passed!"
}

# Set up environment
setup_environment() {
    log "Setting up environment..."
    
    # Set the project
    gcloud config set project ${PROJECT_ID}
    
    # Configure Docker for GCR
    gcloud auth configure-docker --quiet
    
    log "Environment setup complete!"
}

# Build and push Docker image
build_and_push() {
    log "Building Docker image..."
    
    cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web
    
    # Build with production dockerfile
    docker build -f Dockerfile.production -t ${IMAGE_NAME}:latest .
    
    # Tag with timestamp for versioning
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    docker tag ${IMAGE_NAME}:latest ${IMAGE_NAME}:${TIMESTAMP}
    
    log "Pushing images to Google Container Registry..."
    docker push ${IMAGE_NAME}:latest
    docker push ${IMAGE_NAME}:${TIMESTAMP}
    
    log "Docker image pushed successfully!"
}

# Deploy to Cloud Run
deploy_to_cloud_run() {
    log "Deploying to Cloud Run..."
    
    # Deploy the service
    gcloud run deploy ${SERVICE_NAME} \
        --image ${IMAGE_NAME}:latest \
        --platform managed \
        --region ${REGION} \
        --allow-unauthenticated \
        --port 8080 \
        --memory 2Gi \
        --cpu 2 \
        --timeout 300 \
        --concurrency 80 \
        --min-instances 1 \
        --max-instances 100 \
        --set-env-vars "NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1" \
        --set-env-vars "DATABASE_URL=postgresql://warehouse:warehouse123@34.72.74.100:5432/warehouse_network" \
        --set-env-vars "NEXTAUTH_URL=https://${SERVICE_NAME}-$(gcloud config get-value project).${REGION}.run.app" \
        --set-env-vars "NEXTAUTH_SECRET=prod-secret-$(openssl rand -hex 32)" \
        --quiet
    
    # Get the service URL
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format='value(status.url)')
    
    log "Application deployed successfully!"
    log "Service URL: ${SERVICE_URL}"
    
    # Test the deployment
    test_deployment "${SERVICE_URL}"
}

# Test the deployment
test_deployment() {
    local service_url=$1
    log "Testing deployment..."
    
    # Wait for service to be ready
    sleep 10
    
    # Test health endpoint
    if curl -f "${service_url}/api/health" > /dev/null 2>&1; then
        log "Health check passed!"
        log "Application is live at: ${service_url}"
    else
        warn "Health check failed, but service might still be starting up..."
        log "Please check: ${service_url}"
    fi
}

# Main execution
main() {
    log "Starting production deployment for Warehouse Network..."
    
    check_prerequisites
    setup_environment
    build_and_push
    deploy_to_cloud_run
    
    log "Deployment completed successfully!"
    log "Frontend/Backend URL: https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app"
    log "Health Check: https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app/api/health"
}

# Execute main function
main "$@"