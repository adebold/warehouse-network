#!/bin/bash
# Production build script for Warehouse Network Platform
# Optimized for CI/CD pipelines with caching and parallel builds

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_CACHE_DIR="${BUILD_CACHE_DIR:-/tmp/warehouse-build-cache}"
PARALLEL_JOBS="${PARALLEL_JOBS:-4}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Timer functions
start_timer() {
    START_TIME=$(date +%s)
}

end_timer() {
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "Duration: ${DURATION}s"
}

# Check dependencies
check_dependencies() {
    log_step "Checking build dependencies..."
    
    local deps=("node" "pnpm" "docker")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "$dep is not installed"
            exit 1
        fi
    done
    
    # Check Node version
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $NODE_VERSION -lt 18 ]]; then
        log_error "Node.js 18 or higher is required"
        exit 1
    fi
    
    log_info "Dependencies checked successfully"
}

# Setup build cache
setup_cache() {
    log_step "Setting up build cache..."
    
    mkdir -p "$BUILD_CACHE_DIR"/{node_modules,next,docker}
    
    # Restore node_modules cache if exists
    if [[ -d "$BUILD_CACHE_DIR/node_modules" ]]; then
        log_info "Restoring node_modules from cache"
        cp -r "$BUILD_CACHE_DIR/node_modules" "$PROJECT_ROOT/" || true
    fi
    
    # Restore .next cache if exists
    if [[ -d "$BUILD_CACHE_DIR/next" ]]; then
        log_info "Restoring .next cache"
        mkdir -p "$PROJECT_ROOT/apps/web/.next"
        cp -r "$BUILD_CACHE_DIR/next/"* "$PROJECT_ROOT/apps/web/.next/" || true
    fi
}

# Install dependencies
install_dependencies() {
    log_step "Installing dependencies..."
    start_timer
    
    cd "$PROJECT_ROOT"
    
    # Use frozen lockfile for reproducible builds
    pnpm install --frozen-lockfile --prefer-offline
    
    # Cache node_modules
    cp -r node_modules "$BUILD_CACHE_DIR/" || true
    
    end_timer
}

# Run quality checks
run_quality_checks() {
    log_step "Running quality checks..."
    start_timer
    
    cd "$PROJECT_ROOT"
    
    # Run checks in parallel
    (
        log_info "Running TypeScript check..."
        cd apps/web && pnpm run typecheck
    ) &
    
    (
        log_info "Running ESLint..."
        cd apps/web && pnpm run lint
    ) &
    
    (
        log_info "Running tests..."
        cd apps/web && pnpm run test --passWithNoTests
    ) &
    
    # Wait for all parallel jobs
    wait
    
    end_timer
}

# Build application
build_application() {
    log_step "Building Next.js application..."
    start_timer
    
    cd "$PROJECT_ROOT/apps/web"
    
    # Set production environment
    export NODE_ENV=production
    export NEXT_TELEMETRY_DISABLED=1
    
    # Generate Prisma client
    pnpm exec prisma generate
    
    # Build Next.js app with production config
    if [[ -f "next.config.production.js" ]]; then
        cp next.config.production.js next.config.js
    fi
    
    pnpm run build
    
    # Cache .next directory
    cp -r .next "$BUILD_CACHE_DIR/next/" || true
    
    end_timer
}

# Build Docker images
build_docker_images() {
    log_step "Building Docker images..."
    start_timer
    
    cd "$PROJECT_ROOT"
    
    # Enable BuildKit
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain
    
    # Build production image with cache
    docker build \
        --file Dockerfile.production \
        --cache-from warehouse-network:cache-deps \
        --cache-from warehouse-network:cache-builder \
        --cache-from warehouse-network:latest \
        --target deps \
        --tag warehouse-network:cache-deps \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        .
    
    docker build \
        --file Dockerfile.production \
        --cache-from warehouse-network:cache-deps \
        --cache-from warehouse-network:cache-builder \
        --cache-from warehouse-network:latest \
        --target builder \
        --tag warehouse-network:cache-builder \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        .
    
    docker build \
        --file Dockerfile.production \
        --cache-from warehouse-network:cache-deps \
        --cache-from warehouse-network:cache-builder \
        --cache-from warehouse-network:latest \
        --target runner \
        --tag warehouse-network:production \
        --tag warehouse-network:latest \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        .
    
    end_timer
}

# Generate build artifacts
generate_artifacts() {
    log_step "Generating build artifacts..."
    
    cd "$PROJECT_ROOT"
    
    # Create artifacts directory
    mkdir -p build-artifacts
    
    # Generate build info
    cat > build-artifacts/build-info.json <<EOF
{
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "gitCommit": "$(git rev-parse HEAD)",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD)",
  "nodeVersion": "$(node -v)",
  "pnpmVersion": "$(pnpm -v)",
  "dockerVersion": "$(docker -v)"
}
EOF
    
    # Copy important files
    cp .env.production build-artifacts/
    cp docker-compose.production.yml build-artifacts/
    
    # Export Docker images
    log_info "Exporting Docker images..."
    docker save warehouse-network:production | gzip > build-artifacts/warehouse-network-production.tar.gz
    
    # Generate deployment instructions
    cat > build-artifacts/DEPLOYMENT.md <<EOF
# Deployment Instructions

## Files included:
- warehouse-network-production.tar.gz: Docker image
- docker-compose.production.yml: Production compose file
- .env.production: Production environment template
- build-info.json: Build metadata

## Deployment steps:
1. Load Docker image: \`docker load < warehouse-network-production.tar.gz\`
2. Copy .env.production and fill in production values
3. Run deployment: \`docker-compose -f docker-compose.production.yml up -d\`
4. Check health: \`curl https://your-domain/health\`

## Build details:
$(cat build-artifacts/build-info.json | jq .)
EOF
    
    log_info "Build artifacts generated in ./build-artifacts/"
}

# Clean up
cleanup() {
    log_step "Cleaning up..."
    
    # Remove unnecessary files
    find "$PROJECT_ROOT" -name "*.log" -type f -delete
    find "$PROJECT_ROOT" -name ".DS_Store" -type f -delete
    
    # Prune Docker system
    docker system prune -f
}

# Main build flow
main() {
    log_info "Starting production build..."
    
    TOTAL_START=$(date +%s)
    
    # Execute build steps
    check_dependencies
    setup_cache
    install_dependencies
    run_quality_checks
    build_application
    build_docker_images
    generate_artifacts
    cleanup
    
    TOTAL_END=$(date +%s)
    TOTAL_DURATION=$((TOTAL_END - TOTAL_START))
    
    log_info "Production build completed successfully!"
    log_info "Total build time: ${TOTAL_DURATION}s"
    
    # Display next steps
    echo ""
    echo "Next steps:"
    echo "1. Review build artifacts in ./build-artifacts/"
    echo "2. Run deployment script: ./scripts/deploy-production.sh"
    echo "3. Monitor deployment at https://warehouse-network.com/health"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --cache-dir)
            BUILD_CACHE_DIR="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-tests     Skip running tests"
            echo "  --skip-docker    Skip Docker image build"
            echo "  --cache-dir DIR  Build cache directory"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main build
main