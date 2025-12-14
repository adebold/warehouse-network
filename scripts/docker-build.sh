#!/bin/bash

# Docker build script for warehouse-network
set -e

echo "🐳 Building Docker containers..."

# Build arguments
BUILD_TAG=${1:-latest}
BUILD_ENV=${2:-development}

echo "📦 Building image with tag: $BUILD_TAG"
echo "🌍 Environment: $BUILD_ENV"

# Build the main application image
docker build \
  --build-arg NODE_ENV=$BUILD_ENV \
  --tag warehouse-network:$BUILD_TAG \
  --file Dockerfile \
  .

echo "✅ Build completed successfully!"
echo "🚀 To run the application:"
echo "   docker-compose -f docker/dev/docker-compose.yml up -d"