#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║        VARAi Platform - Security-First Setup              ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

command -v node >/dev/null 2>&1 || { echo -e "${RED}❌ Node.js is not installed${NC}"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo -e "${RED}❌ pnpm is not installed${NC}"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker is not installed${NC}"; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo -e "${RED}❌ gcloud CLI is not installed${NC}"; exit 1; }
command -v gpg >/dev/null 2>&1 || { echo -e "${RED}❌ GPG is not installed${NC}"; exit 1; }

echo -e "${GREEN}✅ All prerequisites installed${NC}\n"

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
pnpm install --frozen-lockfile
echo -e "${GREEN}✅ Dependencies installed${NC}\n"

# Generate encryption keys
echo -e "${YELLOW}🔐 Generating encryption keys...${NC}"
mkdir -p .secrets

if [ ! -f .secrets/encryption-master-key ]; then
  openssl rand -base64 32 > .secrets/encryption-master-key
  echo -e "${GREEN}✅ Encryption master key generated${NC}"
fi

if [ ! -f .secrets/jwt-private.key ]; then
  openssl genrsa -out .secrets/jwt-private.key 2048
  openssl rsa -in .secrets/jwt-private.key -pubout -out .secrets/jwt-public.key
  echo -e "${GREEN}✅ JWT keys generated${NC}"
fi
echo ""

# Create environment files
echo -e "${YELLOW}📝 Creating environment files...${NC}"

if [ ! -f .env.local ]; then
  cat > .env.local << 'EOF'
# VARAi Platform - Development Environment

# Node
NODE_ENV=development
LOG_LEVEL=debug

# Database
DB_USER=varai
DB_PASSWORD=dev_password_change_me
DATABASE_URL=postgresql://varai:dev_password_change_me@localhost:5432/varai_dev?schema=public

# Redis
REDIS_PASSWORD=dev_redis_password_change_me
REDIS_URL=redis://:dev_redis_password_change_me@localhost:6379

# JWT Keys (loaded from files)
JWT_PRIVATE_KEY=$(cat .secrets/jwt-private.key)
JWT_PUBLIC_KEY=$(cat .secrets/jwt-public.key)

# Encryption
ENCRYPTION_MASTER_KEY=$(cat .secrets/encryption-master-key)

# API
PORT=3000
CORS_ORIGIN=http://localhost:4200

# GCP (optional in development)
GCP_PROJECT_ID=varai-dev
GOOGLE_APPLICATION_CREDENTIALS=

# Optional: Development tools
PGADMIN_EMAIL=admin@varai.local
PGADMIN_PASSWORD=admin
EOF
  
  echo -e "${GREEN}✅ Environment file created (.env.local)${NC}"
fi
echo ""

# Set up Git hooks
echo -e "${YELLOW}🪝 Setting up Git hooks...${NC}"

# Pre-commit hook for security checks
mkdir -p .git/hooks
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

echo "🔍 Running security checks..."

# Check for secrets
echo "  Checking for secrets..."
pnpm gitleaks detect --source . --verbose --no-git || {
  echo "❌ Secrets detected! Please remove them before committing."
  exit 1
}

# Run linting
echo "  Running linters..."
pnpm nx affected --target=lint --base=HEAD~1 || {
  echo "❌ Linting failed! Please fix errors before committing."
  exit 1
}

echo "✅ All checks passed!"
EOF

chmod +x .git/hooks/pre-commit
echo -e "${GREEN}✅ Git hooks configured${NC}\n"

# Initialize database
echo -e "${YELLOW}🗄️  Initializing database...${NC}"

# Start PostgreSQL if not running
docker-compose up -d postgres redis

# Wait for PostgreSQL to be ready
echo "  Waiting for PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U varai > /dev/null 2>&1; do
  sleep 1
done

# Run migrations
pnpm nx run database:migrate || echo -e "${YELLOW}⚠️  Database migrations not yet set up${NC}"
echo -e "${GREEN}✅ Database initialized${NC}\n"

# Generate self-signed certificates for local development
echo -e "${YELLOW}🔒 Generating SSL certificates for local development...${NC}"
mkdir -p .secrets/ssl

if [ ! -f .secrets/ssl/localhost.crt ]; then
  openssl req -x509 -newkey rsa:4096 -keyout .secrets/ssl/localhost.key -out .secrets/ssl/localhost.crt -days 365 -nodes -subj "/CN=localhost"
  echo -e "${GREEN}✅ SSL certificates generated${NC}"
fi
echo ""

# Security configuration checklist
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║                Setup Complete! 🎉                         ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}📋 Next Steps:${NC}\n"

echo "1. Review and update .env.local with your configuration"
echo "2. Configure GCP credentials (if using cloud services):"
echo "   ${BLUE}gcloud auth application-default login${NC}"
echo ""
echo "3. Start development environment:"
echo "   ${BLUE}docker-compose up -d${NC}"
echo "   ${BLUE}pnpm dev${NC}"
echo ""
echo "4. Access the applications:"
echo "   • Frontend:  ${GREEN}http://localhost:4200${NC}"
echo "   • API:       ${GREEN}http://localhost:3000${NC}"
echo "   • Admin:     ${GREEN}http://localhost:4201${NC}"
echo "   • pgAdmin:   ${GREEN}http://localhost:5050${NC} (with dev-tools profile)"
echo ""
echo "5. Run security checks before committing:"
echo "   ${BLUE}pnpm security:check${NC}"
echo ""

echo -e "${YELLOW}📚 Documentation:${NC}"
echo "   • Security Architecture:    ${BLUE}docs/SECURITY_ARCHITECTURE.md${NC}"
echo "   • Implementation Guide:     ${BLUE}docs/SECURITY_IMPLEMENTATION.md${NC}"
echo "   • Monitoring & Response:    ${BLUE}docs/SECURITY_MONITORING.md${NC}"
echo ""

echo -e "${YELLOW}🔐 Important Security Reminders:${NC}"
echo "   ⚠️  Never commit .secrets/ directory"
echo "   ⚠️  Always use Secret Manager in production"
echo "   ⚠️  Enable GPG commit signing: ${BLUE}git config commit.gpgsign true${NC}"
echo "   ⚠️  Review security checklist before every deploy"
echo ""

echo -e "${GREEN}Happy secure coding! 🚀🔒${NC}"
