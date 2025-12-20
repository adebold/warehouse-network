#!/bin/bash
set -euo pipefail

# Production deployment script for Google Cloud Platform
# Following enterprise best practices

echo "🚀 Enterprise GCP Deployment Process"
echo "===================================="

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-warehouse-adebold-202512191452}"
SERVICE_NAME="${SERVICE_NAME:-warehouse-app}"
REGION="${REGION:-us-central1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Validate prerequisites
validate_prerequisites() {
    print_status "Validating prerequisites..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running"
        exit 1
    fi
    
    # Check if gcloud is configured
    if ! gcloud config get-value project >/dev/null 2>&1; then
        print_error "gcloud is not configured"
        exit 1
    fi
    
    # Verify project
    if [[ "$(gcloud config get-value project)" != "${PROJECT_ID}" ]]; then
        print_warning "Setting project to ${PROJECT_ID}"
        gcloud config set project "${PROJECT_ID}"
    fi
    
    print_status "Prerequisites validated ✓"
}

# Build Docker image
build_image() {
    print_status "Building Docker image: ${FULL_IMAGE}"
    
    cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web
    
    # Build with BuildKit for better performance
    DOCKER_BUILDKIT=1 docker build \
        --file Dockerfile.production \
        --tag "${FULL_IMAGE}" \
        --tag "${IMAGE_NAME}:latest" \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg VCS_REF="${IMAGE_TAG}" \
        --progress plain \
        .
    
    if [ $? -eq 0 ]; then
        print_status "Docker build successful ✓"
    else
        print_error "Docker build failed"
        exit 1
    fi
}

# Push image to GCR
push_image() {
    print_status "Pushing image to Google Container Registry..."
    
    # Configure docker for GCR
    gcloud auth configure-docker --quiet
    
    # Push versioned image
    docker push "${FULL_IMAGE}"
    
    # Push latest tag
    docker push "${IMAGE_NAME}:latest"
    
    if [ $? -eq 0 ]; then
        print_status "Image pushed successfully ✓"
    else
        print_error "Failed to push image"
        exit 1
    fi
}

# Deploy to Cloud Run
deploy_to_cloud_run() {
    print_status "Deploying to Cloud Run (${ENVIRONMENT})..."
    
    # Set deployment parameters based on environment
    if [[ "${ENVIRONMENT}" == "production" ]]; then
        MEMORY="2Gi"
        CPU="2"
        MIN_INSTANCES="1"
        MAX_INSTANCES="100"
        CONCURRENCY="1000"
    else
        MEMORY="1Gi"
        CPU="1"
        MIN_INSTANCES="0"
        MAX_INSTANCES="10"
        CONCURRENCY="100"
    fi
    
    # Deploy service
    gcloud run deploy "${SERVICE_NAME}" \
        --image "${FULL_IMAGE}" \
        --region "${REGION}" \
        --platform managed \
        --allow-unauthenticated \
        --memory "${MEMORY}" \
        --cpu "${CPU}" \
        --min-instances "${MIN_INSTANCES}" \
        --max-instances "${MAX_INSTANCES}" \
        --concurrency "${CONCURRENCY}" \
        --timeout 300 \
        --set-env-vars "NODE_ENV=${ENVIRONMENT}" \
        --set-env-vars "APP_VERSION=${IMAGE_TAG}" \
        --labels "environment=${ENVIRONMENT},version=${IMAGE_TAG}" \
        --tag "${IMAGE_TAG}"
    
    if [ $? -eq 0 ]; then
        print_status "Deployment successful ✓"
    else
        print_error "Deployment failed"
        exit 1
    fi
}

# Get service URL
get_service_url() {
    SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
        --region="${REGION}" \
        --format="value(status.url)")
    
    print_status "Service URL: ${SERVICE_URL}"
}

# Run smoke tests
run_smoke_tests() {
    print_status "Running smoke tests..."
    
    # Wait for service to be ready
    sleep 10
    
    # Test health endpoint
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/health")
    
    if [[ "${HTTP_CODE}" == "200" ]]; then
        print_status "Health check passed ✓"
    else
        print_error "Health check failed (HTTP ${HTTP_CODE})"
        exit 1
    fi
}

# Main deployment flow
main() {
    print_status "Starting deployment process..."
    print_status "Environment: ${ENVIRONMENT}"
    print_status "Project: ${PROJECT_ID}"
    print_status "Service: ${SERVICE_NAME}"
    print_status "Region: ${REGION}"
    print_status "Version: ${IMAGE_TAG}"
    echo ""
    
    validate_prerequisites
    build_image
    push_image
    deploy_to_cloud_run
    get_service_url
    run_smoke_tests
    
    echo ""
    print_status "🎉 Deployment completed successfully!"
    print_status "Application is running at: ${SERVICE_URL}"
    print_status "Version deployed: ${IMAGE_TAG}"
    
    # Tag the deployment in git
    git tag -a "deploy-${ENVIRONMENT}-${IMAGE_TAG}" -m "Deployed ${IMAGE_TAG} to ${ENVIRONMENT}"
}

# Execute main function
main "$@"