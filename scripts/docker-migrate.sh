#!/bin/bash

# Script to apply Prisma migrations to Docker PostgreSQL
echo "🚀 Applying Prisma migrations to Docker PostgreSQL..."

# Set the Docker PostgreSQL connection URL
export DATABASE_URL="postgresql://warehouse:warehouse123@localhost:5433/warehouse_network"

# Navigate to the web app directory
cd apps/web

# Deploy migrations
echo "📦 Deploying migrations..."
npx prisma migrate deploy

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Verify table count
echo "✅ Verifying migration..."
docker exec warehouse-postgres psql -U warehouse -d warehouse_network -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"

# List all tables
echo "📋 All tables in database:"
docker exec warehouse-postgres psql -U warehouse -d warehouse_network -c "\dt"

echo "✨ Migration completed!"