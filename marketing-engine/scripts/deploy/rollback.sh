#!/bin/bash
set -euo pipefail

# Rollback script for emergency situations

echo "⚠️  Starting rollback procedure..."

# Configuration
ENVIRONMENT="${1:-staging}"
CLUSTER_NAME="marketing-${ENVIRONMENT}"
SERVICE_NAME="marketing-engine"
REGION="${AWS_REGION:-us-east-1}"

# Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
    exit 1
}

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
fi

log "Environment: $ENVIRONMENT"

# Get current and previous task definitions
CURRENT_TASK_DEF=$(aws ecs describe-services \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME \
    --query 'services[0].taskDefinition' \
    --output text)

PREVIOUS_TASK_DEF=$(aws ecs describe-services \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME \
    --query 'services[0].deployments[1].taskDefinition' \
    --output text)

if [ -z "$PREVIOUS_TASK_DEF" ] || [ "$PREVIOUS_TASK_DEF" == "None" ]; then
    error "No previous task definition found for rollback"
fi

log "Current task definition: $CURRENT_TASK_DEF"
log "Rolling back to: $PREVIOUS_TASK_DEF"

# Confirm rollback
if [ -z "$FORCE_ROLLBACK" ]; then
    read -p "Are you sure you want to rollback? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Rollback cancelled"
        exit 0
    fi
fi

# Create incident record
INCIDENT_ID=$(uuidgen)
log "Creating incident record: $INCIDENT_ID"
aws dynamodb put-item \
    --table-name incidents \
    --item "{
        \"incident_id\": {\"S\": \"$INCIDENT_ID\"},
        \"timestamp\": {\"N\": \"$(date +%s)\"},
        \"type\": {\"S\": \"rollback\"},
        \"environment\": {\"S\": \"$ENVIRONMENT\"},
        \"initiated_by\": {\"S\": \"$USER\"},
        \"reason\": {\"S\": \"${ROLLBACK_REASON:-Manual rollback}\"
        }
    }"

# Perform rollback
log "Initiating rollback..."
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --task-definition $PREVIOUS_TASK_DEF \
    --force-new-deployment \
    --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100"

# Wait for rollback to complete
log "Waiting for rollback to stabilize..."
aws ecs wait services-stable \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME

# Verify health after rollback
log "Verifying service health..."
if [ "$ENVIRONMENT" == "production" ]; then
    HEALTH_URL="https://api.marketing-engine.com/health"
else
    HEALTH_URL="https://staging-api.marketing-engine.com/health"
fi

HEALTH_CHECK_PASSED=false
for i in {1..10}; do
    if curl -sf $HEALTH_URL > /dev/null; then
        HEALTH_CHECK_PASSED=true
        log "Health check passed!"
        break
    fi
    log "Health check attempt $i failed, retrying..."
    sleep 10
done

if [ "$HEALTH_CHECK_PASSED" != "true" ]; then
    error "Health check failed after rollback!"
fi

# Clear CDN cache
if [ "$ENVIRONMENT" == "production" ]; then
    log "Clearing CDN cache..."
    aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_PRODUCTION_ID \
        --paths "/*"
fi

# Update incident record
aws dynamodb update-item \
    --table-name incidents \
    --key "{\"incident_id\":{\"S\":\"$INCIDENT_ID\"}}" \
    --update-expression "SET #status = :status, completed_at = :timestamp" \
    --expression-attribute-names '{"#status":"status"}' \
    --expression-attribute-values "{\":status\":{\"S\":\"completed\"},\":timestamp\":{\"N\":\"$(date +%s)\"}}"

# Send notification
curl -X POST $SLACK_WEBHOOK_URL \
    -H 'Content-Type: application/json' \
    -d "{
        \"text\": \"⚠️ Rollback completed\",
        \"attachments\": [{
            \"color\": \"warning\",
            \"fields\": [
                {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                {\"title\": \"Incident ID\", \"value\": \"$INCIDENT_ID\", \"short\": true},
                {\"title\": \"Rolled back to\", \"value\": \"$PREVIOUS_TASK_DEF\", \"short\": false},
                {\"title\": \"Status\", \"value\": \"Service healthy\", \"short\": true}
            ]
        }]
    }"

log "✅ Rollback completed successfully!"
log "Incident ID: $INCIDENT_ID"
log "Please investigate the issue that caused the rollback"