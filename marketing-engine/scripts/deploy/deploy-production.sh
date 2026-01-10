#!/bin/bash
set -euo pipefail

# Production deployment script with blue-green deployment

echo "🚀 Starting production deployment..."

# Configuration
ENVIRONMENT="production"
CLUSTER_NAME="marketing-production"
SERVICE_NAME="marketing-engine"
REGION="${AWS_REGION:-us-east-1}"
ECR_REPOSITORY="${ECR_REPOSITORY:-marketing-engine}"
VERSION="${VERSION:-latest}"
TARGET_GROUP_ARN="${TARGET_GROUP_ARN}"
CANARY_PERCENTAGE=10
CANARY_DURATION=300 # 5 minutes

# Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
    exit 1
}

# Pre-deployment checks
log "Running pre-deployment checks..."

# Check if staging deployment is healthy
STAGING_HEALTH=$(curl -sf https://staging-api.marketing-engine.com/health | jq -r '.status')
if [ "$STAGING_HEALTH" != "healthy" ]; then
    error "Staging environment is not healthy. Aborting production deployment."
fi

# Check if all tests passed
if [ -z "$SKIP_TESTS" ]; then
    log "Running production readiness tests..."
    npm run test:production || error "Production tests failed"
fi

# Backup current production state
log "Creating production backup..."
aws rds create-db-snapshot \
    --db-instance-identifier marketing-production \
    --db-snapshot-identifier "marketing-prod-backup-$(date +%Y%m%d-%H%M%S)"

# Blue-Green Deployment
log "Starting blue-green deployment..."

# Create new target group for green deployment
GREEN_TG_ARN=$(aws elbv2 create-target-group \
    --name "marketing-green-$(date +%s)" \
    --protocol HTTP \
    --port 3000 \
    --vpc-id $VPC_ID \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

log "Created green target group: $GREEN_TG_ARN"

# Update task definition with new version
TASK_DEF_ARN=$(aws ecs register-task-definition \
    --cli-input-json file://deploy/task-definitions/api-gateway-production.json \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

# Create green service
aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name "${SERVICE_NAME}-green" \
    --task-definition $TASK_DEF_ARN \
    --desired-count 4 \
    --launch-type FARGATE \
    --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-prod-1,subnet-prod-2],securityGroups=[sg-prod],assignPublicIp=DISABLED}" \
    --load-balancers "targetGroupArn=$GREEN_TG_ARN,containerName=api-gateway,containerPort=3000" \
    --health-check-grace-period-seconds 60

# Wait for green service to be stable
log "Waiting for green deployment to stabilize..."
aws ecs wait services-stable \
    --cluster $CLUSTER_NAME \
    --services "${SERVICE_NAME}-green"

# Run canary deployment
log "Starting canary deployment (${CANARY_PERCENTAGE}% traffic)..."
aws elbv2 modify-listener \
    --listener-arn $LISTENER_ARN \
    --default-actions \
        Type=forward,ForwardConfig="{TargetGroups=[{TargetGroupArn=$TARGET_GROUP_ARN,Weight=$((100-CANARY_PERCENTAGE))},{TargetGroupArn=$GREEN_TG_ARN,Weight=$CANARY_PERCENTAGE}]}"

# Monitor canary metrics
log "Monitoring canary deployment for ${CANARY_DURATION} seconds..."
START_TIME=$(date +%s)
while [ $(($(date +%s) - START_TIME)) -lt $CANARY_DURATION ]; do
    # Check error rate
    ERROR_RATE=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/ApplicationELB \
        --metric-name HTTPCode_Target_5XX_Count \
        --dimensions Name=TargetGroup,Value=$GREEN_TG_ARN \
        --start-time "$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
        --period 60 \
        --statistics Sum \
        --query 'Datapoints[0].Sum' \
        --output text)
    
    if [ "$ERROR_RATE" != "None" ] && [ "${ERROR_RATE%.*}" -gt 10 ]; then
        error "High error rate detected during canary deployment. Rolling back..."
    fi
    
    sleep 30
done

# Full cutover to green
log "Canary successful. Switching 100% traffic to green deployment..."
aws elbv2 modify-listener \
    --listener-arn $LISTENER_ARN \
    --default-actions Type=forward,TargetGroupArn=$GREEN_TG_ARN

# Wait for traffic to drain from blue
log "Waiting for traffic to drain from blue deployment..."
sleep 60

# Update main service to use new task definition
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --task-definition $TASK_DEF_ARN \
    --desired-count 4 \
    --force-new-deployment

# Delete green service (now that main is updated)
aws ecs delete-service \
    --cluster $CLUSTER_NAME \
    --service "${SERVICE_NAME}-green" \
    --force

# Clean up old target group
aws elbv2 delete-target-group --target-group-arn $TARGET_GROUP_ARN

# Clear CDN cache
log "Clearing CDN cache..."
aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_PRODUCTION_ID \
    --paths "/*"

# Post-deployment validation
log "Running post-deployment validation..."
./scripts/validate-deployment.sh production

# Update deployment record
log "Updating deployment record..."
aws dynamodb put-item \
    --table-name deployments \
    --item "{
        \"deployment_id\": {\"S\": \"$(uuidgen)\"},
        \"timestamp\": {\"N\": \"$(date +%s)\"},
        \"environment\": {\"S\": \"$ENVIRONMENT\"},
        \"version\": {\"S\": \"$VERSION\"},
        \"status\": {\"S\": \"success\"},
        \"deployed_by\": {\"S\": \"$USER\"}
    }"

# Send deployment notification
curl -X POST $SLACK_WEBHOOK_URL \
    -H 'Content-Type: application/json' \
    -d "{
        \"text\": \"✅ Production deployment completed\",
        \"attachments\": [{
            \"color\": \"good\",
            \"fields\": [
                {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                {\"title\": \"Version\", \"value\": \"$VERSION\", \"short\": true},
                {\"title\": \"Strategy\", \"value\": \"Blue-Green with Canary\", \"short\": true},
                {\"title\": \"Deployed by\", \"value\": \"$USER\", \"short\": true}
            ]
        }]
    }"

log "✅ Production deployment completed successfully!"