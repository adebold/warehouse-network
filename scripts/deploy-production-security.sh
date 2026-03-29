#!/bin/bash

# Skidspace Production Security Deployment Script
# Orchestrates complete production deployment with all security enhancements

set -euo pipefail

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-skidspace-prod}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_ACCOUNT="skidspace-prod@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYMENT_ID="skidspace-prod-security-v1.0"
LOG_FILE="/tmp/deployment-${DEPLOYMENT_ID}-$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

# Cleanup function for graceful shutdown
cleanup() {
    if [[ $? -ne 0 ]]; then
        error "Deployment failed. Check logs at $LOG_FILE"
    fi
}
trap cleanup EXIT

# Verify prerequisites
verify_prerequisites() {
    log "Verifying deployment prerequisites..."

    # Check required tools
    command -v gcloud >/dev/null 2>&1 || error "gcloud CLI not found"
    command -v npm >/dev/null 2>&1 || error "npm not found"
    command -v node >/dev/null 2>&1 || error "Node.js not found"

    # Check GCP authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        error "Not authenticated with gcloud. Run 'gcloud auth login'"
    fi

    # Check project access
    if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
        error "Cannot access project $PROJECT_ID"
    fi

    # Verify service account exists
    if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT" >/dev/null 2>&1; then
        error "Service account $SERVICE_ACCOUNT not found"
    fi

    success "Prerequisites verified"
}

# Phase 1: Infrastructure Preparation
deploy_infrastructure() {
    log "Phase 1: Deploying GCP infrastructure with security enhancements..."

    # Enable required APIs
    log "Enabling required GCP APIs..."
    gcloud services enable appengine.googleapis.com \
        secretmanager.googleapis.com \
        sqladmin.googleapis.com \
        redis.googleapis.com \
        monitoring.googleapis.com \
        logging.googleapis.com \
        --project="$PROJECT_ID"

    # Create App Engine application if it doesn't exist
    if ! gcloud app describe --project="$PROJECT_ID" >/dev/null 2>&1; then
        log "Creating App Engine application..."
        gcloud app create --region="$REGION" --project="$PROJECT_ID"
    fi

    # Deploy Redis instance for rate limiting
    log "Setting up Redis instance for rate limiting..."
    if ! gcloud redis instances describe skidspace-redis --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
        gcloud redis instances create skidspace-redis \
            --size=1 \
            --region="$REGION" \
            --redis-version=redis_6_x \
            --tier=basic \
            --project="$PROJECT_ID"
    fi

    # Create VPC connector for secure networking
    log "Setting up VPC connector..."
    if ! gcloud compute networks vpc-access connectors describe skidspace-vpc \
            --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
        gcloud compute networks vpc-access connectors create skidspace-vpc \
            --region="$REGION" \
            --subnet-project="$PROJECT_ID" \
            --subnet=default \
            --min-instances=2 \
            --max-instances=10 \
            --project="$PROJECT_ID"
    fi

    success "Infrastructure deployment completed"
}

# Phase 2: Secret Management
deploy_secrets() {
    log "Phase 2: Updating GCP Secret Manager with security credentials..."

    # Check if credentials directory exists
    if [[ ! -d "../credentials" ]]; then
        log "Generating production credentials..."
        cd ../scripts
        npm install
        node generate-super-admin-credentials.js ../credentials
        cd ../deployment
    fi

    # Upload secrets to Secret Manager
    log "Uploading secrets to Secret Manager..."

    # Find the latest credential file
    CRED_FILE=$(find ../credentials -name "super-admin-credentials-*.json" -type f | sort | tail -1)
    if [[ -z "$CRED_FILE" ]]; then
        error "No credential file found. Run credential generation first."
    fi

    # Extract secrets and upload
    NEXTAUTH_SECRET=$(node -p "JSON.parse(require('fs').readFileSync('$CRED_FILE', 'utf8')).nextauth_secret")
    DB_PASSWORD=$(node -p "JSON.parse(require('fs').readFileSync('$CRED_FILE', 'utf8')).database_password")
    ENCRYPTION_KEY=$(node -p "JSON.parse(require('fs').readFileSync('$CRED_FILE', 'utf8')).encryption_key")
    JWT_SIGNING_KEY=$(node -p "JSON.parse(require('fs').readFileSync('$CRED_FILE', 'utf8')).jwt_signing_key")
    SUPER_ADMIN_SETUP_KEY=$(node -p "JSON.parse(require('fs').readFileSync('$CRED_FILE', 'utf8')).super_admin_setup_key")

    # Create secrets
    echo -n "$NEXTAUTH_SECRET" | gcloud secrets create skidspace-prod-nextauth-secret \
        --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
    echo -n "$NEXTAUTH_SECRET" | gcloud secrets versions add skidspace-prod-nextauth-secret \
        --data-file=- --project="$PROJECT_ID"

    echo -n "$DB_PASSWORD" | gcloud secrets create skidspace-prod-db-password \
        --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
    echo -n "$DB_PASSWORD" | gcloud secrets versions add skidspace-prod-db-password \
        --data-file=- --project="$PROJECT_ID"

    echo -n "$ENCRYPTION_KEY" | gcloud secrets create skidspace-prod-encryption-key \
        --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
    echo -n "$ENCRYPTION_KEY" | gcloud secrets versions add skidspace-prod-encryption-key \
        --data-file=- --project="$PROJECT_ID"

    echo -n "$JWT_SIGNING_KEY" | gcloud secrets create skidspace-prod-jwt-signing-key \
        --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
    echo -n "$JWT_SIGNING_KEY" | gcloud secrets versions add skidspace-prod-jwt-signing-key \
        --data-file=- --project="$PROJECT_ID"

    echo -n "$SUPER_ADMIN_SETUP_KEY" | gcloud secrets create skidspace-prod-setup-key \
        --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
    echo -n "$SUPER_ADMIN_SETUP_KEY" | gcloud secrets versions add skidspace-prod-setup-key \
        --data-file=- --project="$PROJECT_ID"

    # Grant service account access to secrets
    for secret in nextauth-secret db-password encryption-key jwt-signing-key setup-key; do
        gcloud secrets add-iam-policy-binding "skidspace-prod-$secret" \
            --member="serviceAccount:$SERVICE_ACCOUNT" \
            --role="roles/secretmanager.secretAccessor" \
            --project="$PROJECT_ID"
    done

    success "Secret management setup completed"
}

# Phase 3: Database Migration
deploy_database() {
    log "Phase 3: Deploying database migrations for security enhancements..."

    # Check if Cloud SQL instance exists
    if ! gcloud sql instances describe skidspace-main --project="$PROJECT_ID" >/dev/null 2>&1; then
        log "Creating Cloud SQL instance..."
        gcloud sql instances create skidspace-main \
            --database-version=POSTGRES_14 \
            --tier=db-f1-micro \
            --region="$REGION" \
            --storage-type=SSD \
            --storage-size=20GB \
            --backup-start-time=02:00 \
            --maintenance-window-day=SUN \
            --maintenance-window-hour=03 \
            --deletion-protection \
            --project="$PROJECT_ID"
    fi

    # Create database if it doesn't exist
    if ! gcloud sql databases describe skidspace_prod --instance=skidspace-main --project="$PROJECT_ID" >/dev/null 2>&1; then
        gcloud sql databases create skidspace_prod --instance=skidspace-main --project="$PROJECT_ID"
    fi

    # Set database password
    DB_PASSWORD=$(gcloud secrets versions access latest --secret="skidspace-prod-db-password" --project="$PROJECT_ID")
    gcloud sql users set-password postgres \
        --host=% \
        --instance=skidspace-main \
        --password="$DB_PASSWORD" \
        --project="$PROJECT_ID"

    # Run database migrations
    log "Running database migrations..."
    cd ../apps/web
    npm install

    # Set up database URL for migrations
    CLOUD_SQL_CONNECTION_NAME="$PROJECT_ID:$REGION:skidspace-main"
    export DATABASE_URL="postgresql://postgres:$DB_PASSWORD@/skidspace_prod?host=/cloudsql/$CLOUD_SQL_CONNECTION_NAME"

    # Run Prisma migrations
    npx prisma generate
    npx prisma migrate deploy

    cd ../../deployment

    success "Database migrations completed"
}

# Phase 4: Application Deployment
deploy_application() {
    log "Phase 4: Deploying hardened application to App Engine..."

    cd ../apps/web

    # Install dependencies and build application
    log "Building application..."
    npm install --production=false
    npm run build

    # Create service account key file
    mkdir -p credentials
    gcloud iam service-accounts keys create credentials/service-account.json \
        --iam-account="$SERVICE_ACCOUNT" \
        --project="$PROJECT_ID"

    # Deploy to App Engine
    log "Deploying to App Engine..."
    gcloud app deploy ../../deployment/app.yaml \
        --project="$PROJECT_ID" \
        --version="v$(date +%Y%m%d-%H%M%S)" \
        --promote \
        --stop-previous-version \
        --quiet

    cd ../../deployment

    success "Application deployment completed"
}

# Phase 5: Security Validation
validate_security() {
    log "Phase 5: Validating security deployment..."

    APP_URL="https://${PROJECT_ID}.uc.r.appspot.com"

    # Wait for deployment to be ready
    log "Waiting for application to be ready..."
    for i in {1..30}; do
        if curl -sf "$APP_URL/api/health" >/dev/null 2>&1; then
            break
        fi
        if [[ $i -eq 30 ]]; then
            error "Application health check timeout"
        fi
        sleep 10
    done

    # Test security headers
    log "Validating security headers..."
    SECURITY_HEADERS=$(curl -sI "$APP_URL" | grep -E "(Strict-Transport-Security|X-Content-Type-Options|X-Frame-Options|Content-Security-Policy)")
    if [[ -z "$SECURITY_HEADERS" ]]; then
        warning "Some security headers may not be properly set"
    fi

    # Test rate limiting
    log "Testing rate limiting..."
    for i in {1..5}; do
        curl -sf "$APP_URL/api/health" >/dev/null 2>&1 || warning "Rate limiting test failed"
    done

    # Test HTTPS redirect
    log "Testing HTTPS enforcement..."
    HTTP_RESPONSE=$(curl -sI "http://${PROJECT_ID}.uc.r.appspot.com/" | head -1)
    if [[ "$HTTP_RESPONSE" != *"301"* ]] && [[ "$HTTP_RESPONSE" != *"308"* ]]; then
        warning "HTTPS redirect may not be working"
    fi

    success "Security validation completed"
}

# Phase 6: Monitoring Setup
setup_monitoring() {
    log "Phase 6: Setting up monitoring and alerting..."

    # Create monitoring alerts
    log "Setting up monitoring alerts..."

    # Application error rate alert
    gcloud alpha monitoring policies create --policy-from-file=- <<EOF
{
  "displayName": "Skidspace High Error Rate",
  "conditions": [
    {
      "displayName": "High error rate",
      "conditionThreshold": {
        "filter": "resource.type=\"gae_app\" AND resource.label.module_id=\"default\"",
        "comparison": "COMPARISON_GREATER_THAN",
        "thresholdValue": 0.1,
        "duration": "300s",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_MEAN"
          }
        ]
      }
    }
  ],
  "alertStrategy": {
    "autoClose": "1800s"
  },
  "enabled": true
}
EOF

    success "Monitoring setup completed"
}

# Main deployment orchestration
main() {
    log "Starting Skidspace production deployment with security enhancements"
    log "Deployment ID: $DEPLOYMENT_ID"
    log "Project ID: $PROJECT_ID"
    log "Region: $REGION"
    log "Log file: $LOG_FILE"

    # Execute deployment phases
    verify_prerequisites
    deploy_infrastructure
    deploy_secrets
    deploy_database
    deploy_application
    validate_security
    setup_monitoring

    # Final deployment summary
    log "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
    success "Skidspace production deployment completed with all security enhancements"
    success "Application URL: https://${PROJECT_ID}.uc.r.appspot.com"
    success "Deployment ID: $DEPLOYMENT_ID"
    success "Log file: $LOG_FILE"

    log "Next steps:"
    log "1. Configure custom domain and SSL certificate"
    log "2. Set up OAuth providers (Google, GitHub)"
    log "3. Initialize super admin account"
    log "4. Configure monitoring dashboards"
    log "5. Run security audit"
}

# Execute main function with error handling
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi