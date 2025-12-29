#!/bin/bash

# Blue-Green deployment strategy implementation
set -euo pipefail

ENVIRONMENT=${1:-production}
IMAGE_TAG=${2:-latest}
STRATEGY=${3:-gradual}
DRY_RUN=${4:-false}

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-}
BASE_SERVICE_NAME="warehouse-network-${ENVIRONMENT}"
REGION="us-central1"
HEALTH_CHECK_TIMEOUT=300
TRAFFIC_SWITCH_INTERVAL=60

# Validate inputs
if [ -z "$PROJECT_ID" ]; then
    echo "Error: GCP_PROJECT_ID environment variable is required"
    exit 1
fi

if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "staging" ]; then
    echo "Error: Environment must be 'production' or 'staging'"
    exit 1
fi

if [ "$STRATEGY" != "instant" ] && [ "$STRATEGY" != "gradual" ] && [ "$STRATEGY" != "canary" ]; then
    echo "Error: Strategy must be 'instant', 'gradual', or 'canary'"
    exit 1
fi

echo "🔄 Starting Blue-Green deployment"
echo "Environment: $ENVIRONMENT"
echo "Image tag: $IMAGE_TAG"
echo "Strategy: $STRATEGY"
echo "Dry run: $DRY_RUN"
echo ""

# Set up logging
DEPLOYMENT_LOG="/tmp/blue_green_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).log"
exec 1> >(tee -a "$DEPLOYMENT_LOG")
exec 2>&1

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check service health
check_service_health() {
    local service_url="$1"
    local max_attempts=${2:-30}
    local attempt=1
    
    log "Checking service health: $service_url"
    
    while [ $attempt -le $max_attempts ]; do
        local response_code=$(curl -sf -o /dev/null -w "%{http_code}" "$service_url/health" 2>/dev/null || echo "000")
        
        if [ "$response_code" = "200" ]; then
            log "✅ Service is healthy (HTTP $response_code)"
            return 0
        fi
        
        log "Attempt $attempt/$max_attempts: HTTP $response_code, retrying in 10s..."
        sleep 10
        ((attempt++))
    done
    
    log "❌ Service health check failed after $max_attempts attempts"
    return 1
}

# Function to run comprehensive service validation
validate_service() {
    local service_url="$1"
    local validation_timeout=${2:-180}
    
    log "Running comprehensive service validation..."
    
    # Basic health check
    if ! check_service_health "$service_url" 10; then
        return 1
    fi
    
    # API endpoints check
    local endpoints=("api" "api/health" "api/health/database" "api/health/redis")
    
    for endpoint in "${endpoints[@]}"; do
        log "Checking endpoint: /$endpoint"
        local response_code=$(curl -sf -o /dev/null -w "%{http_code}" "$service_url/$endpoint" 2>/dev/null || echo "000")
        
        if [ "$response_code" != "200" ]; then
            log "❌ Endpoint /$endpoint failed (HTTP $response_code)"
            return 1
        fi
    done
    
    # Performance check
    log "Running performance validation..."
    local response_times=()
    for i in {1..5}; do
        local start_time=$(date +%s.%N)
        if curl -sf "$service_url/health" > /dev/null 2>&1; then
            local end_time=$(date +%s.%N)
            local duration=$(echo "$end_time - $start_time" | bc)
            response_times+=("$duration")
        else
            log "❌ Performance test failed on attempt $i"
            return 1
        fi
    done
    
    # Calculate average response time
    local total=0
    for time in "${response_times[@]}"; do
        total=$(echo "$total + $time" | bc)
    done
    local avg_time=$(echo "scale=3; $total / ${#response_times[@]}" | bc)
    
    log "Average response time: ${avg_time}s"
    
    # Check if average response time is acceptable (< 2s)
    if (( $(echo "$avg_time > 2.0" | bc -l) )); then
        log "❌ Average response time too high: ${avg_time}s"
        return 1
    fi
    
    log "✅ Service validation completed successfully"
    return 0
}

# Function to determine current deployment slot
get_current_slot() {
    log "Determining current deployment slot..."
    
    # Check if main service exists
    if ! gcloud run services describe "$BASE_SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="value(metadata.name)" >/dev/null 2>&1; then
        
        log "Main service doesn't exist, this is initial deployment"
        echo "none"
        return 0
    fi
    
    # Get current traffic allocation
    local current_traffic=$(gcloud run services describe "$BASE_SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="csv[no-heading](status.traffic[].revisionName,status.traffic[].percent)" \
        --flatten="status.traffic[]" 2>/dev/null)
    
    if [[ $current_traffic == *"blue"* ]]; then
        echo "blue"
    elif [[ $current_traffic == *"green"* ]]; then
        echo "green"
    else
        echo "unknown"
    fi
}

# Function to get target slot
get_target_slot() {
    local current_slot="$1"
    
    case "$current_slot" in
        "blue")
            echo "green"
            ;;
        "green"|"none"|"unknown")
            echo "blue"
            ;;
        *)
            echo "blue"
            ;;
    esac
}

# Function to deploy to target slot
deploy_to_slot() {
    local slot="$1"
    local image_tag="$2"
    
    local slot_service_name="${BASE_SERVICE_NAME}-${slot}"
    local image_url="${REGISTRY}/${IMAGE_NAME}:${image_tag}"
    
    log "Deploying to $slot slot..."
    log "Service: $slot_service_name"
    log "Image: $image_url"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "🔍 DRY RUN: Would deploy to $slot slot"
        return 0
    fi
    
    # Deploy to slot (no traffic initially)
    gcloud run deploy "$slot_service_name" \
        --image "$image_url" \
        --platform managed \
        --region "$REGION" \
        --no-allow-unauthenticated \
        --set-env-vars NODE_ENV="$ENVIRONMENT" \
        --set-env-vars DATABASE_URL="${DATABASE_URL}" \
        --set-env-vars REDIS_URL="${REDIS_URL}" \
        --memory "${MEMORY:-2Gi}" \
        --cpu "${CPU:-2}" \
        --min-instances "${MIN_INSTANCES:-1}" \
        --max-instances "${MAX_INSTANCES:-100}" \
        --concurrency "${CONCURRENCY:-80}" \
        --timeout "${TIMEOUT:-300}" \
        --port 3000 \
        --no-traffic
    
    # Get service URL
    local service_url=$(gcloud run services describe "$slot_service_name" \
        --platform managed \
        --region "$REGION" \
        --format="value(status.url)")
    
    echo "$service_url"
}

# Function to switch traffic based on strategy
switch_traffic() {
    local target_slot="$1"
    local strategy="$2"
    local target_service="${BASE_SERVICE_NAME}-${target_slot}"
    
    log "Switching traffic using $strategy strategy..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "🔍 DRY RUN: Would switch traffic to $target_slot"
        return 0
    fi
    
    case "$strategy" in
        "instant")
            log "Instant traffic switch to $target_slot..."
            gcloud run services update-traffic "$BASE_SERVICE_NAME" \
                --to-revisions="$target_service=100" \
                --platform managed \
                --region "$REGION"
            ;;
            
        "gradual")
            log "Gradual traffic switch to $target_slot..."
            
            # 25%
            log "Switching 25% traffic to $target_slot..."
            gcloud run services update-traffic "$BASE_SERVICE_NAME" \
                --to-revisions="$target_service=25" \
                --platform managed \
                --region "$REGION"
            
            sleep $TRAFFIC_SWITCH_INTERVAL
            
            # Validate at 25%
            local main_service_url=$(gcloud run services describe "$BASE_SERVICE_NAME" \
                --platform managed \
                --region "$REGION" \
                --format="value(status.url)")
            
            if ! validate_service "$main_service_url" 60; then
                log "❌ Validation failed at 25% traffic, rolling back..."
                return 1
            fi
            
            # 50%
            log "Switching 50% traffic to $target_slot..."
            gcloud run services update-traffic "$BASE_SERVICE_NAME" \
                --to-revisions="$target_service=50" \
                --platform managed \
                --region "$REGION"
            
            sleep $TRAFFIC_SWITCH_INTERVAL
            
            if ! validate_service "$main_service_url" 60; then
                log "❌ Validation failed at 50% traffic, rolling back..."
                return 1
            fi
            
            # 100%
            log "Switching 100% traffic to $target_slot..."
            gcloud run services update-traffic "$BASE_SERVICE_NAME" \
                --to-revisions="$target_service=100" \
                --platform managed \
                --region "$REGION"
            ;;
            
        "canary")
            log "Canary traffic switch to $target_slot..."
            
            # 5%
            log "Switching 5% traffic to $target_slot (canary)..."
            gcloud run services update-traffic "$BASE_SERVICE_NAME" \
                --to-revisions="$target_service=5" \
                --platform managed \
                --region "$REGION"
            
            sleep $((TRAFFIC_SWITCH_INTERVAL * 2))
            
            # Extended validation for canary
            local main_service_url=$(gcloud run services describe "$BASE_SERVICE_NAME" \
                --platform managed \
                --region "$REGION" \
                --format="value(status.url)")
            
            if ! validate_service "$main_service_url" 120; then
                log "❌ Canary validation failed, rolling back..."
                return 1
            fi
            
            # 50%
            log "Promoting canary to 50% traffic..."
            gcloud run services update-traffic "$BASE_SERVICE_NAME" \
                --to-revisions="$target_service=50" \
                --platform managed \
                --region "$REGION"
            
            sleep $TRAFFIC_SWITCH_INTERVAL
            
            if ! validate_service "$main_service_url" 60; then
                log "❌ Validation failed at 50% traffic, rolling back..."
                return 1
            fi
            
            # 100%
            log "Completing canary promotion to 100%..."
            gcloud run services update-traffic "$BASE_SERVICE_NAME" \
                --to-revisions="$target_service=100" \
                --platform managed \
                --region "$REGION"
            ;;
    esac
    
    # Final validation
    local main_service_url=$(gcloud run services describe "$BASE_SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="value(status.url)")
    
    if ! validate_service "$main_service_url" 120; then
        log "❌ Final validation failed after traffic switch"
        return 1
    fi
    
    log "✅ Traffic switch completed successfully"
    return 0
}

# Function to cleanup old slot
cleanup_old_slot() {
    local old_slot="$1"
    
    if [ "$old_slot" = "none" ] || [ "$old_slot" = "unknown" ]; then
        log "No old slot to cleanup"
        return 0
    fi
    
    log "Cleaning up old slot: $old_slot"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "🔍 DRY RUN: Would cleanup old slot $old_slot"
        return 0
    fi
    
    local old_service="${BASE_SERVICE_NAME}-${old_slot}"
    
    # Delete old service
    gcloud run services delete "$old_service" \
        --platform managed \
        --region "$REGION" \
        --quiet || true
    
    log "Old slot cleanup completed"
}

# Function to rollback deployment
rollback_deployment() {
    local current_slot="$1"
    local target_slot="$2"
    
    log "⚠️  Rolling back deployment..."
    
    if [ "$current_slot" != "none" ] && [ "$current_slot" != "unknown" ]; then
        local current_service="${BASE_SERVICE_NAME}-${current_slot}"
        
        # Switch traffic back to current slot
        gcloud run services update-traffic "$BASE_SERVICE_NAME" \
            --to-revisions="$current_service=100" \
            --platform managed \
            --region "$REGION"
        
        log "Traffic rolled back to $current_slot slot"
        
        # Delete failed deployment
        local target_service="${BASE_SERVICE_NAME}-${target_slot}"
        gcloud run services delete "$target_service" \
            --platform managed \
            --region "$REGION" \
            --quiet || true
        
        log "Failed deployment cleaned up"
    else
        log "Cannot rollback - no previous deployment found"
    fi
}

# Function to send notifications
send_notifications() {
    local status="$1"
    local message="$2"
    
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        local color=""
        case "$status" in
            "SUCCESS") color="good" ;;
            "FAILED") color="danger" ;;
            "WARNING") color="warning" ;;
            *) color="#439FE0" ;;
        esac
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"Blue-Green Deployment $status\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Strategy\", \"value\": \"$STRATEGY\", \"short\": true},
                        {\"title\": \"Image Tag\", \"value\": \"$IMAGE_TAG\", \"short\": true}
                    ]
                }]
            }" \
            "$SLACK_WEBHOOK_URL" || true
    fi
    
    log "Deployment $status: $message"
}

# Main execution
main() {
    log "Starting Blue-Green deployment process..."
    
    # Set environment variables for deployment
    export REGISTRY="${REGISTRY:-ghcr.io}"
    export IMAGE_NAME="${IMAGE_NAME:-$GITHUB_REPOSITORY}"
    export DATABASE_URL="${DATABASE_URL:-}"
    export REDIS_URL="${REDIS_URL:-}"
    export MEMORY="${MEMORY:-2Gi}"
    export CPU="${CPU:-2}"
    export MIN_INSTANCES="${MIN_INSTANCES:-1}"
    export MAX_INSTANCES="${MAX_INSTANCES:-100}"
    export CONCURRENCY="${CONCURRENCY:-80}"
    export TIMEOUT="${TIMEOUT:-300}"
    
    # Authenticate with GCP
    gcloud auth activate-service-account --key-file="${GOOGLE_APPLICATION_CREDENTIALS:-/dev/null}" 2>/dev/null || true
    gcloud config set project "$PROJECT_ID"
    
    # Determine deployment slots
    current_slot=$(get_current_slot)
    target_slot=$(get_target_slot "$current_slot")
    
    log "Current slot: $current_slot"
    log "Target slot: $target_slot"
    
    # Send start notification
    send_notifications "STARTED" "Blue-Green deployment initiated. Deploying to $target_slot slot."
    
    # Deploy to target slot
    if ! target_service_url=$(deploy_to_slot "$target_slot" "$IMAGE_TAG"); then
        send_notifications "FAILED" "Failed to deploy to $target_slot slot"
        exit 1
    fi
    
    log "Target service URL: $target_service_url"
    
    # Validate target slot deployment
    if ! validate_service "$target_service_url"; then
        send_notifications "FAILED" "Target slot validation failed"
        cleanup_old_slot "$target_slot"
        exit 1
    fi
    
    # Switch traffic
    if ! switch_traffic "$target_slot" "$STRATEGY"; then
        send_notifications "FAILED" "Traffic switch failed, rolling back"
        rollback_deployment "$current_slot" "$target_slot"
        exit 1
    fi
    
    # Cleanup old slot
    cleanup_old_slot "$current_slot"
    
    # Final health check
    main_service_url=$(gcloud run services describe "$BASE_SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="value(status.url)")
    
    if validate_service "$main_service_url"; then
        send_notifications "SUCCESS" "Blue-Green deployment completed successfully. Active slot: $target_slot"
        log "🎉 Blue-Green deployment completed successfully!"
        log "Active slot: $target_slot"
        log "Service URL: $main_service_url"
        log "Deployment log: $DEPLOYMENT_LOG"
    else
        send_notifications "WARNING" "Deployment completed but final validation failed"
        log "⚠️  Deployment completed but final validation failed"
        exit 1
    fi
}

# Help function
show_help() {
    cat << EOF
Usage: $0 <environment> <image-tag> [strategy] [dry-run]

Arguments:
  environment  Environment to deploy (production|staging)
  image-tag    Image tag to deploy
  strategy     Deployment strategy (instant|gradual|canary) [default: gradual]
  dry-run      Set to 'true' for dry run [default: false]

Strategies:
  instant      Switch traffic immediately (fastest, highest risk)
  gradual      Switch traffic in steps: 25% -> 50% -> 100% (recommended)
  canary       Canary deployment: 5% -> 50% -> 100% (safest, slower)

Examples:
  $0 production v1.2.3                           # Gradual deployment
  $0 staging latest instant                      # Instant deployment to staging
  $0 production v1.2.3 canary                   # Canary deployment
  $0 production v1.2.3 gradual true             # Dry run

Environment Variables:
  GCP_PROJECT_ID                 Google Cloud Project ID (required)
  GOOGLE_APPLICATION_CREDENTIALS Service account key file
  REGISTRY                       Container registry [default: ghcr.io]
  IMAGE_NAME                     Image name [default: \$GITHUB_REPOSITORY]
  DATABASE_URL                   Database connection string
  REDIS_URL                      Redis connection string
  SLACK_WEBHOOK_URL             Slack webhook for notifications
  MEMORY                        Container memory [default: 2Gi]
  CPU                          Container CPU [default: 2]
  MIN_INSTANCES                Minimum instances [default: 1]
  MAX_INSTANCES                Maximum instances [default: 100]

EOF
}

# Handle help
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    show_help
    exit 0
fi

# Validate arguments
if [ $# -lt 2 ]; then
    echo "Error: Missing required arguments"
    show_help
    exit 1
fi

# Execute main function
main "$@"