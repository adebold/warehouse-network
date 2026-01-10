#!/bin/bash
set -euo pipefail

# Deployment script for staging environment

echo "🚀 Starting deployment to staging environment..."

# Configuration
ENVIRONMENT="staging"
CLUSTER_NAME="marketing-staging"
SERVICE_NAME="marketing-engine"
REGION="${AWS_REGION:-us-east-1}"
ECR_REPOSITORY="${ECR_REPOSITORY:-marketing-engine}"
VERSION="${VERSION:-latest}"

# Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
    exit 1
}

# Check prerequisites
command -v aws >/dev/null 2>&1 || error "AWS CLI is required but not installed"
command -v docker >/dev/null 2>&1 || error "Docker is required but not installed"
command -v jq >/dev/null 2>&1 || error "jq is required but not installed"

# Validate AWS credentials
aws sts get-caller-identity >/dev/null 2>&1 || error "AWS credentials not configured"

log "Environment: $ENVIRONMENT"
log "Version: $VERSION"

# Build and push Docker images
log "Building Docker images..."
docker-compose build \
    --build-arg NODE_ENV=production \
    --build-arg VERSION=$VERSION

# Get ECR login token
log "Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY

# Tag and push images
SERVICES=("api-gateway" "event-bus" "scheduler")
for service in "${SERVICES[@]}"; do
    log "Pushing $service image..."
    docker tag marketing-engine_$service:latest $ECR_REPOSITORY/$service:$VERSION
    docker tag marketing-engine_$service:latest $ECR_REPOSITORY/$service:staging
    docker push $ECR_REPOSITORY/$service:$VERSION
    docker push $ECR_REPOSITORY/$service:staging
done

# Update ECS task definitions
log "Updating ECS task definitions..."
for service in "${SERVICES[@]}"; do
    TASK_DEF_ARN=$(aws ecs register-task-definition \
        --cli-input-json file://deploy/task-definitions/$service-staging.json \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    log "Updated task definition for $service: $TASK_DEF_ARN"
done

# Update services
log "Updating ECS services..."
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --desired-count 2 \
    --force-new-deployment \
    --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
    --health-check-grace-period-seconds 60

# Wait for deployment to complete
log "Waiting for deployment to stabilize..."
aws ecs wait services-stable \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME

# Run database migrations
log "Running database migrations..."
aws ecs run-task \
    --cluster $CLUSTER_NAME \
    --task-definition marketing-migrations:latest \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-staging],securityGroups=[sg-staging],assignPublicIp=ENABLED}"

# Health check
log "Running health checks..."
HEALTH_URL="https://staging-api.marketing-engine.com/health"
for i in {1..30}; do
    if curl -sf $HEALTH_URL > /dev/null; then
        log "Health check passed!"
        break
    fi
    if [ $i -eq 30 ]; then
        error "Health check failed after 30 attempts"
    fi
    log "Health check attempt $i failed, retrying..."
    sleep 10
done

# Clear CDN cache
log "Clearing CDN cache..."
aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_STAGING_ID \
    --paths "/*"

# Send deployment notification
log "Sending deployment notification..."
curl -X POST $SLACK_WEBHOOK_URL \
    -H 'Content-Type: application/json' \
    -d "{
        \"text\": \"✅ Staging deployment completed\",
        \"attachments\": [{
            \"color\": \"good\",
            \"fields\": [
                {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                {\"title\": \"Version\", \"value\": \"$VERSION\", \"short\": true},
                {\"title\": \"Services\", \"value\": \"${SERVICES[*]}\", \"short\": false}
            ]
        }]
    }"

log "✅ Deployment to staging completed successfully!"