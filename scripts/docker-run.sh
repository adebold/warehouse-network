#!/bin/bash

# Docker run script for warehouse-network
set -e

# Configuration
ENVIRONMENT=${1:-dev}
COMPOSE_FILE=""
ENV_FILE=".env.local"

case $ENVIRONMENT in
  dev|development)
    COMPOSE_FILE="docker/dev/docker-compose.yml"
    ENV_FILE=".env.development"
    ;;
  staging)
    COMPOSE_FILE="docker/staging/docker-compose.yml"
    ENV_FILE=".env.staging"
    ;;
  prod|production)
    COMPOSE_FILE="docker/prod/docker-compose.yml"
    ENV_FILE=".env.production"
    ;;
  *)
    echo "❌ Invalid environment: $ENVIRONMENT"
    echo "Valid options: dev, staging, prod"
    exit 1
    ;;
esac

echo "🐳 Starting warehouse-network in $ENVIRONMENT mode..."
echo "📁 Using compose file: $COMPOSE_FILE"
echo "🔧 Environment file: $ENV_FILE"

# Check if environment file exists
if [[ ! -f $ENV_FILE ]]; then
  echo "⚠️  Environment file $ENV_FILE not found!"
  echo "📝 Creating from example..."
  cp .env.example $ENV_FILE
  echo "✏️  Please edit $ENV_FILE with your configuration"
fi

# Create necessary volumes
docker volume create warehouse-postgres-data 2>/dev/null || true
docker volume create warehouse-redis-data 2>/dev/null || true
docker volume create warehouse-uploads 2>/dev/null || true

# Run database migrations if in development
if [[ $ENVIRONMENT == "dev" || $ENVIRONMENT == "development" ]]; then
  echo "🗃️  Running database migrations..."
  docker-compose -f $COMPOSE_FILE run --rm app sh -c "cd apps/web && bunx prisma migrate deploy"
fi

# Start services
echo "🚀 Starting services..."
docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d

echo ""
echo "✅ Services started successfully!"
echo "🌐 Application: http://localhost:3000"
echo "🗄️  Database: localhost:5432"
echo "📊 Redis: localhost:6379"
echo ""
echo "📋 Useful commands:"
echo "   View logs: docker-compose -f $COMPOSE_FILE logs -f"
echo "   Stop services: docker-compose -f $COMPOSE_FILE down"
echo "   Reset data: docker-compose -f $COMPOSE_FILE down -v"