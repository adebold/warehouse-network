#!/bin/bash
# Production deployment script for Warehouse Network Platform
# This script handles the complete production deployment process

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-production}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-300}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Pre-flight checks
preflight_checks() {
    log_info "Running pre-flight checks..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check environment file
    if [[ ! -f "$PROJECT_ROOT/.env.production" ]]; then
        log_error "Production environment file not found: .env.production"
        exit 1
    fi
    
    # Check required environment variables
    local required_vars=(
        "DATABASE_URL"
        "NEXTAUTH_SECRET"
        "JWT_SECRET"
        "STRIPE_SECRET_KEY"
    )
    
    source "$PROJECT_ROOT/.env.production"
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable not set: $var"
            exit 1
        fi
    done
    
    log_info "Pre-flight checks passed"
}

# Build production images
build_images() {
    log_info "Building production images..."
    
    cd "$PROJECT_ROOT"
    
    # Enable BuildKit for better caching
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    
    # Build with production Dockerfile
    docker build \
        --file Dockerfile.production \
        --target runner \
        --cache-from warehouse-network:latest \
        --cache-from warehouse-network:builder \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        --tag warehouse-network:${IMAGE_TAG} \
        --tag warehouse-network:latest \
        .
    
    if [[ -n "$DOCKER_REGISTRY" ]]; then
        log_info "Tagging for registry: $DOCKER_REGISTRY"
        docker tag warehouse-network:${IMAGE_TAG} ${DOCKER_REGISTRY}/warehouse-network:${IMAGE_TAG}
        docker tag warehouse-network:latest ${DOCKER_REGISTRY}/warehouse-network:latest
    fi
    
    log_info "Images built successfully"
}

# Push images to registry
push_images() {
    if [[ -z "$DOCKER_REGISTRY" ]]; then
        log_warn "No Docker registry configured, skipping push"
        return
    fi
    
    log_info "Pushing images to registry..."
    
    docker push ${DOCKER_REGISTRY}/warehouse-network:${IMAGE_TAG}
    docker push ${DOCKER_REGISTRY}/warehouse-network:latest
    
    log_info "Images pushed successfully"
}

# Database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    cd "$PROJECT_ROOT"
    
    # Run migrations using a temporary container
    docker run --rm \
        --env-file .env.production \
        --network warehouse-network \
        warehouse-network:${IMAGE_TAG} \
        sh -c "cd apps/web && npx prisma migrate deploy"
    
    log_info "Migrations completed successfully"
}

# Deploy services
deploy_services() {
    log_info "Deploying services..."
    
    cd "$PROJECT_ROOT"
    
    # Copy production environment file
    cp .env.production .env
    
    # Deploy with zero-downtime using rolling updates
    docker-compose -f docker-compose.production.yml up -d \
        --remove-orphans \
        --scale app=2
    
    log_info "Services deployed successfully"
}

# Health check
health_check() {
    log_info "Running health checks..."
    
    local start_time=$(date +%s)
    local timeout=$HEALTH_CHECK_TIMEOUT
    local health_endpoint="http://localhost/health"
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [[ $elapsed -gt $timeout ]]; then
            log_error "Health check timeout after ${timeout} seconds"
            return 1
        fi
        
        if curl -sf "$health_endpoint" > /dev/null; then
            log_info "Health check passed"
            return 0
        fi
        
        log_info "Waiting for service to be healthy... (${elapsed}s/${timeout}s)"
        sleep 5
    done
}

# Smoke tests
run_smoke_tests() {
    log_info "Running smoke tests..."
    
    # Test main page
    if ! curl -sf http://localhost/ > /dev/null; then
        log_error "Failed to load main page"
        return 1
    fi
    
    # Test API endpoint
    if ! curl -sf http://localhost/api/health > /dev/null; then
        log_error "Failed to reach API health endpoint"
        return 1
    fi
    
    # Test static assets
    if ! curl -sf http://localhost/_next/static/ > /dev/null; then
        log_error "Failed to load static assets"
        return 1
    fi
    
    log_info "Smoke tests passed"
}

# Rollback function
rollback() {
    log_error "Deployment failed, rolling back..."
    
    cd "$PROJECT_ROOT"
    
    # Restore previous version
    docker-compose -f docker-compose.production.yml down
    docker tag warehouse-network:previous warehouse-network:latest
    docker-compose -f docker-compose.production.yml up -d --scale app=2
    
    log_info "Rollback completed"
}

# Cleanup old images
cleanup_old_images() {
    log_info "Cleaning up old images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Keep only the last 3 versions
    docker images warehouse-network --format "{{.Tag}}" | \
        grep -v latest | \
        sort -V | \
        head -n -3 | \
        xargs -I {} docker rmi warehouse-network:{} 2>/dev/null || true
    
    log_info "Cleanup completed"
}

# Main deployment flow
main() {
    log_info "Starting production deployment..."
    log_info "Environment: $DEPLOYMENT_ENV"
    log_info "Image tag: $IMAGE_TAG"
    
    # Set trap for rollback on error
    trap rollback ERR
    
    # Tag current version as previous for rollback
    docker tag warehouse-network:latest warehouse-network:previous 2>/dev/null || true
    
    # Execute deployment steps
    preflight_checks
    build_images
    push_images
    run_migrations
    deploy_services
    
    # Wait for services to be ready
    sleep 10
    
    # Verify deployment
    if health_check && run_smoke_tests; then
        log_info "Deployment completed successfully!"
        cleanup_old_images
        
        # Remove rollback trap
        trap - ERR
        
        # Show deployment info
        echo ""
        log_info "Deployment Summary:"
        echo "  - Environment: $DEPLOYMENT_ENV"
        echo "  - Image tag: $IMAGE_TAG"
        echo "  - URL: https://warehouse-network.com"
        echo ""
        
        exit 0
    else
        log_error "Deployment verification failed"
        rollback
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            DEPLOYMENT_ENV="$2"
            shift 2
            ;;
        --tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --registry)
            DOCKER_REGISTRY="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --env ENV         Deployment environment (default: production)"
            echo "  --tag TAG         Docker image tag (default: latest)"
            echo "  --registry URL    Docker registry URL"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main deployment
main