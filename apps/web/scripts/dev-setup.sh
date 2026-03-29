#!/bin/bash

# Development Setup Script for Skidspace Authentication System
# This script sets up the development environment

set -e

echo "🚀 Setting up Skidspace Authentication System for development..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please install Node.js 18 or higher."
    exit 1
fi

echo "✅ Node.js version $NODE_VERSION detected"

# Check if Docker is installed and running
if command -v docker &> /dev/null; then
    if docker info >/dev/null 2>&1; then
        echo "✅ Docker is installed and running"
        DOCKER_AVAILABLE=true
    else
        echo "⚠️  Docker is installed but not running"
        DOCKER_AVAILABLE=false
    fi
else
    echo "⚠️  Docker is not installed"
    DOCKER_AVAILABLE=false
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Set up environment file
if [ ! -f .env.local ]; then
    echo "🔧 Creating environment file..."
    cp .env.local .env.local
    echo "⚠️  Please update .env.local with your configuration values"
else
    echo "✅ Environment file already exists"
fi

# Start Docker services if available
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo "🐳 Starting Docker services..."
    docker-compose up -d postgres redis

    # Wait for PostgreSQL to be ready
    echo "⏳ Waiting for PostgreSQL to be ready..."
    until docker-compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
        sleep 1
    done
    echo "✅ PostgreSQL is ready"

    # Set up database
    echo "🗄️  Setting up database..."
    npx prisma generate
    npx prisma db push --force-reset
    npx prisma db seed

    echo "✅ Database setup complete"
else
    echo "⚠️  Docker not available. Please set up PostgreSQL manually and update DATABASE_URL in .env.local"
    echo "   You can use the following command to start a PostgreSQL container manually:"
    echo "   docker run --name skidspace-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=skidspace_dev -p 5432:5432 -d postgres:16-alpine"
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Update .env.local with your configuration"
echo "   2. Run 'npm run dev' to start the development server"
echo "   3. Visit http://localhost:3000 to access the application"
echo ""

if [ "$DOCKER_AVAILABLE" = true ]; then
    echo "🔗 Available services:"
    echo "   - Application: http://localhost:3000"
    echo "   - Database Admin: http://localhost:8080 (adminer)"
    echo "   - PostgreSQL: localhost:5432"
    echo "   - Redis: localhost:6379"
    echo ""
fi

echo "🔐 Default super admin credentials (after seeding):"
echo "   Email: superadmin@skidspace.com"
echo "   Password: SuperAdmin123!"
echo "   Setup URL: http://localhost:3000/admin/setup"
echo ""
echo "📚 For more information, see README.md"