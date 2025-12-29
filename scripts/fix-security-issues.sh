#!/bin/bash

# Security Fix Script for Warehouse Network Platform
# Generated: December 29, 2024

set -e

echo "🔐 Starting security fixes for warehouse-network platform..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
if ! command_exists npm; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Backing up current package-lock.json files${NC}"
find . -name "package-lock.json" -not -path "*/node_modules/*" -exec cp {} {}.backup \;

echo -e "${YELLOW}Step 2: Running npm audit fix in root${NC}"
npm audit fix --force 2>/dev/null || {
    echo -e "${RED}Root audit fix failed, trying without force${NC}"
    npm audit fix
}

echo -e "${YELLOW}Step 3: Updating critical packages${NC}"

# Update Kubernetes client in devops platform
echo "Updating @kubernetes/client-node..."
cd packages/claude-devops-platform 2>/dev/null && {
    npm uninstall @kubernetes/client-node
    npm install @kubernetes/client-node@latest
    cd ../..
}

# Update OpenTelemetry packages
echo "Updating OpenTelemetry packages..."
OPENTELEMETRY_PACKAGES=(
    "@opentelemetry/sdk-node"
    "@opentelemetry/exporter-trace-otlp-http"
    "@opentelemetry/auto-instrumentations-node"
    "@opentelemetry/instrumentation-express"
    "@opentelemetry/instrumentation-http"
)

for package in "${OPENTELEMETRY_PACKAGES[@]}"; do
    echo "Checking for $package..."
    if npm ls "$package" 2>/dev/null | grep -q "$package"; then
        echo "Updating $package to latest..."
        npm update "$package" --workspace-root
    fi
done

echo -e "${YELLOW}Step 4: Fixing workspace vulnerabilities${NC}"

# Fix apps/web
echo "Fixing apps/web..."
cd apps/web 2>/dev/null && {
    npm audit fix
    cd ../..
}

echo -e "${YELLOW}Step 5: Removing deprecated packages${NC}"

# Check if packages exist before trying to remove them
DEPRECATED_PACKAGES=("request" "graceful-shutdown" "artillery")

for pkg in "${DEPRECATED_PACKAGES[@]}"; do
    if npm ls "$pkg" 2>/dev/null | grep -q "$pkg"; then
        echo "Removing deprecated package: $pkg"
        npm uninstall "$pkg" --workspace-root 2>/dev/null || echo "Could not remove $pkg"
    fi
done

echo -e "${YELLOW}Step 6: Updating Prisma Client${NC}"
npm update @prisma/client --workspace-root

echo -e "${YELLOW}Step 7: Running final audit${NC}"
npm audit

echo ""
echo -e "${GREEN}Security fix process completed!${NC}"
echo ""
echo "⚠️  Important Notes:"
echo "1. Review the changes in package-lock.json before committing"
echo "2. Test all functionality, especially Kubernetes operations"
echo "3. Run 'npm test' in all workspaces"
echo "4. Backup files are saved as package-lock.json.backup"
echo ""
echo "To restore backups if needed:"
echo "find . -name 'package-lock.json.backup' -exec sh -c 'mv {} ${1%.backup}' _ {} \;"