.PHONY: help install dev build test deploy clean

# Default target
help:
	@echo "Marketing Engine - Available Commands"
	@echo "===================================="
	@echo "make install      - Install dependencies"
	@echo "make dev         - Start development environment"
	@echo "make build       - Build all packages"
	@echo "make test        - Run all tests"
	@echo "make deploy-staging - Deploy to staging"
	@echo "make deploy-prod - Deploy to production"
	@echo "make clean       - Clean build artifacts"
	@echo ""
	@echo "Docker Commands:"
	@echo "make docker-up   - Start all services"
	@echo "make docker-down - Stop all services"
	@echo "make docker-logs - View service logs"
	@echo ""
	@echo "Database Commands:"
	@echo "make db-migrate  - Run migrations"
	@echo "make db-seed     - Seed database"
	@echo "make db-reset    - Reset database"

# Installation
install:
	npm ci
	npx husky install

# Development
dev:
	docker-compose up -d postgres redis
	npm run dev

dev-full:
	docker-compose up -d
	npm run dev

# Building
build:
	npm run build

build-docker:
	docker-compose build

# Testing
test:
	npm run test

test-integration:
	npm run test:integration

test-e2e:
	npm run test:e2e

test-all: test test-integration test-e2e

# Deployment
deploy-staging:
	./scripts/deploy/deploy-staging.sh

deploy-prod:
	./scripts/deploy/deploy-production.sh

rollback:
	./scripts/deploy/rollback.sh

# Docker
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-clean:
	docker-compose down -v
	docker system prune -f

# Database
db-migrate:
	npm run db:migrate

db-seed:
	npm run db:seed

db-reset:
	docker-compose exec postgres psql -U marketing -d marketing_engine -c "DROP SCHEMA IF EXISTS marketing CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS analytics CASCADE; DROP SCHEMA IF EXISTS audit CASCADE;"
	npm run db:migrate
	npm run db:seed

# Monitoring
monitoring-up:
	docker-compose up -d prometheus grafana elasticsearch kibana jaeger

monitoring-down:
	docker-compose stop prometheus grafana elasticsearch kibana jaeger

# Utilities
lint:
	npm run lint

format:
	npx prettier --write .

security-scan:
	npm run security:scan

clean:
	npm run clean
	rm -rf coverage .turbo .next dist

# Performance
perf-test:
	npm run performance:test

load-test:
	artillery run tests/load/scenarios.yml

# Logs
logs-api:
	docker-compose logs -f api-gateway

logs-event-bus:
	docker-compose logs -f event-bus

logs-db:
	docker-compose logs -f postgres

# Health checks
health-check:
	@curl -s http://localhost:3000/health | jq .

# Environment setup
env-setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo ".env file created from .env.example"; else echo ".env file already exists"; fi

# Quick start
quickstart: env-setup install docker-up db-migrate
	@echo "Marketing Engine is ready!"
	@echo "API Gateway: http://localhost:3000"
	@echo "Grafana: http://localhost:3001"
	@echo "Kibana: http://localhost:5601"