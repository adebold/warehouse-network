#!/bin/bash
# Script to create Docker secrets for production deployment

set -e

echo "=== Creating Docker Secrets for Warehouse Network ==="
echo ""

# Function to generate secure random passwords
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

# Function to create or update a Docker secret
create_secret() {
    SECRET_NAME=$1
    SECRET_VALUE=$2
    
    # Check if secret exists
    if docker secret ls | grep -q "$SECRET_NAME"; then
        echo "Removing existing secret: $SECRET_NAME"
        docker secret rm "$SECRET_NAME" >/dev/null
    fi
    
    # Create new secret
    echo "$SECRET_VALUE" | docker secret create "$SECRET_NAME" -
    echo "✓ Created secret: $SECRET_NAME"
}

# Check if running in swarm mode
if ! docker info | grep -q "Swarm: active"; then
    echo "Error: Docker is not in swarm mode"
    echo "Initialize swarm with: docker swarm init"
    exit 1
fi

echo "Generating secure passwords..."
DB_PASSWORD=$(generate_password)
REDIS_PASSWORD=$(generate_password)
JWT_SECRET=$(generate_password)
NEXTAUTH_SECRET=$(generate_password)

echo ""
echo "Creating Docker secrets..."

# Database secrets
create_secret "warehouse_db_user" "warehouse"
create_secret "warehouse_db_password" "$DB_PASSWORD"
create_secret "warehouse_database_url" "postgresql://warehouse:${DB_PASSWORD}@postgres:5432/warehouse_network"

# Redis secrets
create_secret "warehouse_redis_password" "$REDIS_PASSWORD"
create_secret "warehouse_redis_url" "redis://:${REDIS_PASSWORD}@redis:6379"

# Authentication secrets
create_secret "warehouse_jwt_secret" "$JWT_SECRET"
create_secret "warehouse_nextauth_secret" "$NEXTAUTH_SECRET"

# Stripe secrets (placeholders - replace with actual values)
create_secret "warehouse_stripe_secret_key" "sk_live_your_stripe_secret_key"
create_secret "warehouse_stripe_webhook_secret" "whsec_your_webhook_secret"

# Monitoring secrets (placeholders - replace with actual values)
create_secret "warehouse_sentry_dsn" "https://your-sentry-dsn@sentry.io/project-id"

echo ""
echo "=== Secrets Created Successfully ==="
echo ""
echo "IMPORTANT: Save these generated passwords securely!"
echo "Database Password: $DB_PASSWORD"
echo "Redis Password: $REDIS_PASSWORD"
echo "JWT Secret: $JWT_SECRET"
echo "NextAuth Secret: $NEXTAUTH_SECRET"
echo ""
echo "To list all secrets: docker secret ls"
echo "To inspect a secret: docker secret inspect <secret_name>"
echo ""
echo "Remember to update Stripe and Sentry secrets with actual values!"