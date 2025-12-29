#!/bin/bash

# Production rollback script with blue-green deployment support
set -euo pipefail

ENVIRONMENT=${1:-production}
TARGET_VERSION=${2:-}
REASON=${3:-"Manual rollback"}
DRY_RUN=${4:-false}

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-}
SERVICE_NAME="warehouse-network-${ENVIRONMENT}"
REGION="us-central1"
BACKUP_RETENTION_DAYS=7

# Validate inputs
if [ -z "$PROJECT_ID" ]; then
    echo "Error: GCP_PROJECT_ID environment variable is required"
    exit 1
fi

if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "staging" ]; then
    echo "Error: Environment must be 'production' or 'staging'"
    exit 1
fi

echo "🔄 Initiating rollback for $ENVIRONMENT environment"
echo "Target version: ${TARGET_VERSION:-latest working}"
echo "Reason: $REASON"
echo "Dry run: $DRY_RUN"
echo ""

# Set up logging
ROLLBACK_LOG="/tmp/rollback_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).log"
exec 1> >(tee -a "$ROLLBACK_LOG")
exec 2>&1

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check service health
check_service_health() {
    local service_url="$1"
    local max_attempts=10
    local attempt=1
    
    log "Checking service health: $service_url"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$service_url/health" > /dev/null; then
            log "✅ Service is healthy"
            return 0
        fi
        
        log "Attempt $attempt/$max_attempts failed, retrying in 10s..."
        sleep 10
        ((attempt++))
    done
    
    log "❌ Service health check failed after $max_attempts attempts"
    return 1
}

# Function to get current deployment info
get_current_deployment() {
    log "Getting current deployment information..."
    
    # Get current revision
    CURRENT_REVISION=$(gcloud run services describe "$SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="value(status.latestCreatedRevisionName)" 2>/dev/null || echo "")
    
    if [ -z "$CURRENT_REVISION" ]; then
        log "❌ Could not retrieve current revision"
        exit 1
    fi
    
    # Get current traffic allocation
    CURRENT_TRAFFIC=$(gcloud run services describe "$SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="table(status.traffic[].revisionName,status.traffic[].percent)" \
        --flatten="status.traffic[]" 2>/dev/null || echo "")
    
    log "Current revision: $CURRENT_REVISION"
    log "Current traffic allocation:"
    echo "$CURRENT_TRAFFIC"
}

# Function to get available rollback targets
get_rollback_targets() {
    log "Finding available rollback targets..."
    
    # Get recent revisions (last 10)
    AVAILABLE_REVISIONS=$(gcloud run revisions list \
        --service="$SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --limit=10 \
        --format="table(metadata.name,metadata.creationTimestamp,status.conditions[0].status)" \
        2>/dev/null || echo "")
    
    log "Available revisions for rollback:"
    echo "$AVAILABLE_REVISIONS"
}

# Function to backup current state
backup_current_state() {
    log "Creating backup of current deployment state..."
    
    local backup_file="/tmp/deployment_backup_$(date +%Y%m%d_%H%M%S).json"
    
    gcloud run services describe "$SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="json" > "$backup_file"
    
    log "Deployment state backed up to: $backup_file"
    
    # Store in cloud storage if configured
    if [ -n "${BACKUP_STORAGE_URL:-}" ]; then
        case "$BACKUP_STORAGE_URL" in
            gs://*)
                gsutil cp "$backup_file" "$BACKUP_STORAGE_URL/"
                ;;
            s3://*)
                aws s3 cp "$backup_file" "$BACKUP_STORAGE_URL/"
                ;;
        esac
        log "Backup uploaded to: $BACKUP_STORAGE_URL/"
    fi
    
    echo "$backup_file"
}

# Function to determine rollback target
determine_rollback_target() {
    if [ -n "$TARGET_VERSION" ]; then
        # Specific version requested
        ROLLBACK_TARGET="$SERVICE_NAME-$TARGET_VERSION"
        log "Using specified rollback target: $ROLLBACK_TARGET"
    else
        # Find previous working revision
        log "Determining previous working revision..."
        
        # Get last known good revision (excluding current)
        ROLLBACK_TARGET=$(gcloud run revisions list \
            --service="$SERVICE_NAME" \
            --platform managed \
            --region "$REGION" \
            --limit=5 \
            --format="value(metadata.name)" \
            --filter="metadata.name!=$CURRENT_REVISION AND status.conditions[0].status=True" | head -1)
        
        if [ -z "$ROLLBACK_TARGET" ]; then
            log "❌ Could not determine rollback target"
            exit 1
        fi
        
        log "Determined rollback target: $ROLLBACK_TARGET"
    fi
}

# Function to validate rollback target
validate_rollback_target() {
    log "Validating rollback target: $ROLLBACK_TARGET"
    
    # Check if revision exists and is ready
    REVISION_STATUS=$(gcloud run revisions describe "$ROLLBACK_TARGET" \
        --platform managed \
        --region "$REGION" \
        --format="value(status.conditions[0].status)" 2>/dev/null || echo "Unknown")
    
    if [ "$REVISION_STATUS" != "True" ]; then
        log "❌ Rollback target is not in a ready state: $REVISION_STATUS"
        exit 1
    fi
    
    log "✅ Rollback target is valid and ready"
}

# Function to perform database rollback
rollback_database() {
    if [ "$ENVIRONMENT" = "production" ]; then
        log "⚠️  Database rollback required for production"
        log "This should be done manually after careful review"
        log "Steps:"
        log "1. Review database changes since last deployment"
        log "2. Create backup of current database state"
        log "3. Run rollback migrations if safe to do so"
        log "4. Verify data integrity"
        
        read -p "Have you completed database rollback? (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            log "❌ Database rollback not confirmed, aborting"
            exit 1
        fi
    else
        log "Staging environment - skipping database rollback prompt"
    fi
}

# Function to perform gradual rollback
perform_gradual_rollback() {
    log "Starting gradual traffic rollback..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "🔍 DRY RUN: Would execute rollback commands"
        return 0
    fi
    
    # Step 1: Route 25% traffic to rollback target
    log "Step 1: Routing 25% traffic to rollback target..."
    gcloud run services update-traffic "$SERVICE_NAME" \
        --to-revisions="$ROLLBACK_TARGET=25,$CURRENT_REVISION=75" \
        --platform managed \
        --region "$REGION"
    
    sleep 60
    
    # Check health
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="value(status.url)")
    
    if ! check_service_health "$SERVICE_URL"; then
        log "❌ Health check failed at 25% traffic, aborting rollback"
        # Revert to original state
        gcloud run services update-traffic "$SERVICE_NAME" \
            --to-revisions="$CURRENT_REVISION=100" \
            --platform managed \
            --region "$REGION"
        exit 1
    fi
    
    # Step 2: Route 75% traffic to rollback target
    log "Step 2: Routing 75% traffic to rollback target..."
    gcloud run services update-traffic "$SERVICE_NAME" \
        --to-revisions="$ROLLBACK_TARGET=75,$CURRENT_REVISION=25" \
        --platform managed \
        --region "$REGION"
    
    sleep 120
    
    if ! check_service_health "$SERVICE_URL"; then
        log "❌ Health check failed at 75% traffic, aborting rollback"
        # Revert to original state
        gcloud run services update-traffic "$SERVICE_NAME" \
            --to-revisions="$CURRENT_REVISION=100" \
            --platform managed \
            --region "$REGION"
        exit 1
    fi
    
    # Step 3: Route 100% traffic to rollback target
    log "Step 3: Routing 100% traffic to rollback target..."
    gcloud run services update-traffic "$SERVICE_NAME" \
        --to-revisions="$ROLLBACK_TARGET=100" \
        --platform managed \
        --region "$REGION"
    
    sleep 60
    
    if ! check_service_health "$SERVICE_URL"; then
        log "❌ Health check failed at 100% traffic"
        log "⚠️  Manual intervention required"
        exit 1
    fi
    
    log "✅ Gradual rollback completed successfully"
}

# Function to cleanup old revisions
cleanup_old_revisions() {
    log "Cleaning up old revisions..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "🔍 DRY RUN: Would cleanup old revisions"
        return 0
    fi
    
    # Keep only recent revisions (based on retention policy)
    OLD_REVISIONS=$(gcloud run revisions list \
        --service="$SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="value(metadata.name)" \
        --filter="metadata.creationTimestamp<'$(date -d "$BACKUP_RETENTION_DAYS days ago" --iso-8601)'" \
        --sort-by="~metadata.creationTimestamp")
    
    if [ -n "$OLD_REVISIONS" ]; then
        echo "$OLD_REVISIONS" | while read -r revision; do
            if [ "$revision" != "$ROLLBACK_TARGET" ]; then
                log "Deleting old revision: $revision"
                gcloud run revisions delete "$revision" \
                    --platform managed \
                    --region "$REGION" \
                    --quiet || true
            fi
        done
    else
        log "No old revisions to cleanup"
    fi
}

# Function to send notifications
send_notifications() {
    local status="$1"
    local message="$2"
    
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🔄 Rollback $status: $message\"}" \
            "$SLACK_WEBHOOK_URL" || true
    fi
    
    # Log rollback event
    log "Rollback $status: $message"
}

# Main execution
main() {
    log "Starting rollback process..."
    
    # Authenticate with GCP
    gcloud auth activate-service-account --key-file="${GOOGLE_APPLICATION_CREDENTIALS:-/dev/null}" 2>/dev/null || true
    gcloud config set project "$PROJECT_ID"
    
    # Get current state
    get_current_deployment
    get_rollback_targets
    
    # Create backup
    BACKUP_FILE=$(backup_current_state)
    
    # Determine and validate rollback target
    determine_rollback_target
    validate_rollback_target
    
    # Confirm rollback
    if [ "$DRY_RUN" != "true" ]; then
        echo ""
        echo "⚠️  ROLLBACK CONFIRMATION"
        echo "Environment: $ENVIRONMENT"
        echo "Current revision: $CURRENT_REVISION"
        echo "Rollback target: $ROLLBACK_TARGET"
        echo "Reason: $REASON"
        echo "Backup location: $BACKUP_FILE"
        echo ""
        
        read -p "Proceed with rollback? (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            log "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    # Database rollback check
    rollback_database
    
    # Perform rollback
    send_notifications "STARTED" "Rollback initiated for $ENVIRONMENT environment"
    
    perform_gradual_rollback
    
    # Cleanup
    cleanup_old_revisions
    
    # Final verification
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --format="value(status.url)")
    
    if check_service_health "$SERVICE_URL"; then
        send_notifications "SUCCESS" "Rollback completed successfully for $ENVIRONMENT"
        log "🎉 Rollback completed successfully!"
        log "Service URL: $SERVICE_URL"
        log "Log file: $ROLLBACK_LOG"
    else
        send_notifications "FAILED" "Rollback completed but health check failed for $ENVIRONMENT"
        log "❌ Rollback completed but service is not healthy"
        exit 1
    fi
}

# Help function
show_help() {
    cat << EOF
Usage: $0 <environment> [target-version] [reason] [dry-run]

Arguments:
  environment     Environment to rollback (production|staging)
  target-version  Specific version to rollback to (optional)
  reason          Reason for rollback (optional)
  dry-run         Set to 'true' for dry run (optional)

Examples:
  $0 production                                    # Rollback to previous version
  $0 production v1.2.3 "Critical bug fix"         # Rollback to specific version
  $0 staging "" "Testing rollback" true           # Dry run rollback

Environment Variables:
  GCP_PROJECT_ID              Google Cloud Project ID
  GOOGLE_APPLICATION_CREDENTIALS  Service account key file
  SLACK_WEBHOOK_URL          Slack webhook for notifications (optional)
  BACKUP_STORAGE_URL         Cloud storage for backups (optional)

EOF
}

# Handle help
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    show_help
    exit 0
fi

# Execute main function
main "$@"