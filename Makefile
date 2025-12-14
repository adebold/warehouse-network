.PHONY: help dev staging prod build test clean

# Default environment
ENV ?= dev

help: ## Show this help message
	@echo "Usage: make [target] [ENV=dev|staging|prod]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Development commands
dev: ## Start development environment
	@echo "Starting development environment..."
	@cp .env.example .env 2>/dev/null || true
	@docker network create warehouse-network 2>/dev/null || true
	@docker-compose -f docker-compose.base.yml -f docker/dev/docker-compose.yml up -d
	@echo "Development environment is running at http://localhost:3000"
	@echo "PgAdmin is running at http://localhost:5050"
	@echo "MailHog is running at http://localhost:8025"

dev-logs: ## Show development logs
	@docker-compose -f docker-compose.base.yml -f docker/dev/docker-compose.yml logs -f

dev-shell: ## Open shell in development container
	@docker-compose -f docker-compose.base.yml -f docker/dev/docker-compose.yml exec app sh

dev-db-reset: ## Reset development database
	@docker-compose -f docker-compose.base.yml -f docker/dev/docker-compose.yml exec app sh -c "cd packages/db && pnpm prisma migrate reset --force"

# Staging commands
staging: ## Start staging environment
	@echo "Starting staging environment..."
	@docker network create warehouse-network 2>/dev/null || true
	@docker-compose -f docker-compose.base.yml -f docker/staging/docker-compose.yml up -d
	@echo "Staging environment is running"

staging-logs: ## Show staging logs
	@docker-compose -f docker-compose.base.yml -f docker/staging/docker-compose.yml logs -f

# Production commands
prod: ## Start production environment (local testing)
	@echo "Starting production environment..."
	@docker network create warehouse-network 2>/dev/null || true
	@docker-compose -f docker-compose.base.yml -f docker/prod/docker-compose.yml up -d
	@echo "Production environment is running"

prod-logs: ## Show production logs
	@docker-compose -f docker-compose.base.yml -f docker/prod/docker-compose.yml logs -f

# Build commands
build: ## Build Docker images
	@echo "Building Docker images..."
	@docker-compose -f docker-compose.base.yml build

build-prod: ## Build production Docker image
	@echo "Building production Docker image..."
	@docker build -t warehouse-network:latest .

# Database commands
db-migrate: ## Run database migrations
	@echo "Running database migrations..."
	@docker-compose -f docker-compose.base.yml -f docker/$(ENV)/docker-compose.yml exec app sh -c "cd packages/db && pnpm prisma migrate deploy"

db-seed: ## Seed database
	@echo "Seeding database..."
	@docker-compose -f docker-compose.base.yml -f docker/$(ENV)/docker-compose.yml exec app sh -c "cd packages/db && pnpm prisma db seed"

db-studio: ## Open Prisma Studio
	@echo "Opening Prisma Studio..."
	@docker-compose -f docker-compose.base.yml -f docker/$(ENV)/docker-compose.yml exec app sh -c "cd packages/db && pnpm prisma studio"

# Test commands
test: ## Run all tests
	@echo "Running tests..."
	@pnpm test

test-e2e: ## Run E2E tests
	@echo "Running E2E tests..."
	@cd apps/web && pnpm test-e2e

test-unit: ## Run unit tests
	@echo "Running unit tests..."
	@pnpm test:unit

# Utility commands
clean: ## Clean up Docker resources
	@echo "Cleaning up Docker resources..."
	@docker-compose -f docker-compose.base.yml -f docker/dev/docker-compose.yml down -v
	@docker-compose -f docker-compose.base.yml -f docker/staging/docker-compose.yml down -v
	@docker-compose -f docker-compose.base.yml -f docker/prod/docker-compose.yml down -v
	@docker system prune -af --volumes

stop: ## Stop all environments
	@echo "Stopping all environments..."
	@docker-compose -f docker-compose.base.yml -f docker/dev/docker-compose.yml down
	@docker-compose -f docker-compose.base.yml -f docker/staging/docker-compose.yml down
	@docker-compose -f docker-compose.base.yml -f docker/prod/docker-compose.yml down

ps: ## Show running containers
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

install: ## Install dependencies
	@echo "Installing dependencies..."
	@pnpm install

# Quick start for Docker Desktop
quick-start: ## Quick start for Docker Desktop
	@echo "🚀 Starting Warehouse Network on Docker Desktop..."
	@make dev
	@sleep 10
	@make db-migrate ENV=dev
	@make db-seed ENV=dev
	@echo ""
	@echo "✅ Warehouse Network is ready!"
	@echo "🌐 Application: http://localhost:3000"
	@echo "🗄️  PgAdmin: http://localhost:5050 (admin@warehouse.local / admin123)"
	@echo "📧 MailHog: http://localhost:8025"
	@echo ""
	@echo "📝 Default credentials:"
	@echo "   Super Admin: superadmin@example.com / password"
	@echo "   Operator Admin: operatoradmin@example.com / password"
	@echo "   Customer Admin: customeradmin@example.com / password"