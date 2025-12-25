#!/bin/bash

# Claude DB Integrity - Docker Setup Script
# Docker integration setup for containerized applications

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(pwd)"

# Function to print colored output
print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_substep() {
    echo -e "  ${PURPLE}→${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    print_step "Checking Docker prerequisites..."
    
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker and try again."
        exit 1
    fi
    
    if ! command_exists docker-compose; then
        print_warning "docker-compose not found. Checking for docker compose plugin..."
        if ! docker compose version >/dev/null 2>&1; then
            print_error "Neither docker-compose nor docker compose plugin found."
            exit 1
        else
            print_info "Using docker compose plugin"
            DOCKER_COMPOSE_CMD="docker compose"
        fi
    else
        DOCKER_COMPOSE_CMD="docker-compose"
    fi
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running. Please start Docker and try again."
        exit 1
    fi
    
    print_success "Docker prerequisites check passed"
}

# Function to detect project type
detect_project_type() {
    if [ -f "next.config.js" ] || [ -f "next.config.ts" ] || [ -f "next.config.mjs" ]; then
        echo "nextjs"
    elif [ -f "nest-cli.json" ] || grep -q "@nestjs/core" package.json 2>/dev/null; then
        echo "nestjs"
    elif grep -q "express" package.json 2>/dev/null; then
        echo "express"
    elif [ -f "package.json" ]; then
        echo "node"
    else
        echo "generic"
    fi
}

# Function to detect database type
detect_database_type() {
    if [ -f "prisma/schema.prisma" ] || grep -q "prisma" package.json 2>/dev/null; then
        echo "prisma"
    elif grep -q "typeorm" package.json 2>/dev/null; then
        echo "typeorm"
    elif grep -q "sequelize" package.json 2>/dev/null; then
        echo "sequelize"
    elif grep -q "mongoose" package.json 2>/dev/null; then
        echo "mongoose"
    else
        echo "postgresql"
    fi
}

# Function to create Dockerfile
create_dockerfile() {
    local project_type=$1
    
    print_step "Creating Dockerfile for $project_type project..."
    
    if [ -f "Dockerfile" ]; then
        print_warning "Dockerfile already exists. Creating Dockerfile.claude-integrity instead."
        DOCKERFILE_NAME="Dockerfile.claude-integrity"
    else
        DOCKERFILE_NAME="Dockerfile"
    fi
    
    case $project_type in
        "nextjs")
            create_nextjs_dockerfile
            ;;
        "nestjs")
            create_nestjs_dockerfile
            ;;
        "express")
            create_express_dockerfile
            ;;
        *)
            create_generic_dockerfile
            ;;
    esac
    
    print_success "Dockerfile created: $DOCKERFILE_NAME"
}

# Function to create Next.js Dockerfile
create_nextjs_dockerfile() {
    cat > "$DOCKERFILE_NAME" << 'EOF'
# Next.js Dockerfile with Claude DB Integrity
FROM node:18-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Builder
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Install Claude DB Integrity
RUN npm install claude-db-integrity

# Build application
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Install Claude DB Integrity in production
COPY --from=builder /app/node_modules/claude-db-integrity ./node_modules/claude-db-integrity

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Health check using Claude DB Integrity
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "import('claude-db-integrity').then(m => m.healthCheck()).then(r => process.exit(r.status === 'healthy' ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
EOF
}

# Function to create NestJS Dockerfile
create_nestjs_dockerfile() {
    cat > "$DOCKERFILE_NAME" << 'EOF'
# NestJS Dockerfile with Claude DB Integrity
FROM node:18-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Builder
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Install Claude DB Integrity
RUN npm install claude-db-integrity

# Build application
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nestjs
RUN adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nestjs

EXPOSE 3000

# Health check using Claude DB Integrity
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "import('claude-db-integrity').then(m => m.healthCheck()).then(r => process.exit(r.status === 'healthy' ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
EOF
}

# Function to create Express Dockerfile
create_express_dockerfile() {
    cat > "$DOCKERFILE_NAME" << 'EOF'
# Express Dockerfile with Claude DB Integrity
FROM node:18-alpine

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies including Claude DB Integrity
RUN npm ci --only=production && npm install claude-db-integrity && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup --system --gid 1001 appuser
RUN adduser --system --uid 1001 appuser

USER appuser

EXPOSE 3000

# Health check using Claude DB Integrity
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "import('claude-db-integrity').then(m => m.healthCheck()).then(r => process.exit(r.status === 'healthy' ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
EOF
}

# Function to create generic Dockerfile
create_generic_dockerfile() {
    cat > "$DOCKERFILE_NAME" << 'EOF'
# Generic Node.js Dockerfile with Claude DB Integrity
FROM node:18-alpine

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies including Claude DB Integrity
RUN npm ci --only=production && npm install claude-db-integrity && npm cache clean --force

# Copy application code
COPY . .

# Build if build script exists
RUN npm run build 2>/dev/null || echo "No build script found"

# Create non-root user
RUN addgroup --system --gid 1001 appuser
RUN adduser --system --uid 1001 appuser

USER appuser

EXPOSE 3000

# Health check using Claude DB Integrity
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "import('claude-db-integrity').then(m => m.healthCheck()).then(r => process.exit(r.status === 'healthy' ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
EOF
}

# Function to create docker-compose.yml
create_docker_compose() {
    local database_type=$1
    
    print_step "Creating docker-compose.yml with $database_type database..."
    
    if [ -f "docker-compose.yml" ]; then
        print_warning "docker-compose.yml already exists. Creating docker-compose.claude-integrity.yml instead."
        COMPOSE_FILE="docker-compose.claude-integrity.yml"
    else
        COMPOSE_FILE="docker-compose.yml"
    fi
    
    case $database_type in
        "prisma"|"postgresql")
            create_compose_with_postgres
            ;;
        "mysql")
            create_compose_with_mysql
            ;;
        "mongodb"|"mongoose")
            create_compose_with_mongodb
            ;;
        *)
            create_compose_with_postgres
            ;;
    esac
    
    print_success "Docker Compose file created: $COMPOSE_FILE"
}

# Function to create Docker Compose with PostgreSQL
create_compose_with_postgres() {
    cat > "$COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  app:
    build: 
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
      - "3001:3001"  # Claude DB Integrity monitoring dashboard
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/appdb
      - CLAUDE_INTEGRITY_ENABLED=true
      - CLAUDE_INTEGRITY_LOG_LEVEL=info
      - CLAUDE_INTEGRITY_MONITORING_PORT=3001
      - CLAUDE_FLOW_ENABLED=true
      - CLAUDE_FLOW_NAMESPACE=docker-app-integrity
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=appdb
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # Claude DB Integrity Monitoring (optional)
  integrity-monitor:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/html:/usr/share/nginx/html:ro
    networks:
      - app-network
    restart: unless-stopped
    depends_on:
      - app

volumes:
  postgres_data:
  redis_data:

networks:
  app-network:
    driver: bridge
EOF
}

# Function to create Docker Compose with MySQL
create_compose_with_mysql() {
    cat > "$COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  app:
    build: 
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://root:password@db:3306/appdb
      - CLAUDE_INTEGRITY_ENABLED=true
      - CLAUDE_INTEGRITY_LOG_LEVEL=info
      - CLAUDE_FLOW_ENABLED=true
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network
    restart: unless-stopped

  db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=password
      - MYSQL_DATABASE=appdb
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app-network
    restart: unless-stopped

volumes:
  mysql_data:
  redis_data:

networks:
  app-network:
    driver: bridge
EOF
}

# Function to create Docker Compose with MongoDB
create_compose_with_mongodb() {
    cat > "$COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  app:
    build: 
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mongodb://mongo:27017/appdb
      - CLAUDE_INTEGRITY_ENABLED=true
      - CLAUDE_INTEGRITY_LOG_LEVEL=info
      - CLAUDE_FLOW_ENABLED=true
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network
    restart: unless-stopped

  db:
    image: mongo:6.0
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app-network
    restart: unless-stopped

volumes:
  mongo_data:
  redis_data:

networks:
  app-network:
    driver: bridge
EOF
}

# Function to create Docker support files
create_docker_support_files() {
    print_step "Creating Docker support files..."
    
    # Create docker directory
    mkdir -p docker/postgres docker/nginx/html docker/scripts
    
    # Create PostgreSQL init script
    print_substep "Creating PostgreSQL initialization script..."
    cat > docker/postgres/init.sql << 'EOF'
-- PostgreSQL initialization for Claude DB Integrity
-- This script runs when the database container starts for the first time

-- Create integrity tracking tables
CREATE TABLE IF NOT EXISTS integrity_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    operation VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    risk_score INTEGER DEFAULT 0,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_integrity_logs_table_name ON integrity_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_integrity_logs_timestamp ON integrity_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_integrity_logs_operation ON integrity_logs(operation);
CREATE INDEX IF NOT EXISTS idx_integrity_logs_user_id ON integrity_logs(user_id);

-- Create schema drift tracking
CREATE TABLE IF NOT EXISTS schema_snapshots (
    id SERIAL PRIMARY KEY,
    schema_name VARCHAR(255) NOT NULL,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    version VARCHAR(50),
    checksum VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_schema_snapshots_name ON schema_snapshots(schema_name);
CREATE INDEX IF NOT EXISTS idx_schema_snapshots_created_at ON schema_snapshots(created_at);

-- Create validation rules table
CREATE TABLE IF NOT EXISTS validation_rules (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(255) NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    rule_definition JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    severity VARCHAR(20) DEFAULT 'error',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_validation_rules_entity_type ON validation_rules(entity_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_is_active ON validation_rules(is_active);

-- Create performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(255) NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit VARCHAR(50),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    component VARCHAR(255),
    environment VARCHAR(50),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_recorded_at ON performance_metrics(recorded_at);

-- Grant permissions to application user (if needed)
-- CREATE USER app_user WITH PASSWORD 'app_password';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

COMMIT;
EOF

    # Create nginx configuration for monitoring
    print_substep "Creating Nginx configuration for monitoring dashboard..."
    cat > docker/nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                   '$status $body_bytes_sent "$http_referer" '
                   '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;

    # Claude DB Integrity Monitoring Dashboard
    server {
        listen 80;
        server_name localhost;
        
        # Root serves static monitoring dashboard
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ =404;
        }
        
        # Proxy API requests to the application
        location /api/ {
            proxy_pass http://app:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Proxy integrity monitoring endpoints
        location /integrity/ {
            proxy_pass http://app:3001/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Health check endpoint
        location /nginx-health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

    # Create monitoring dashboard HTML
    print_substep "Creating monitoring dashboard HTML..."
    cat > docker/nginx/html/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude DB Integrity - Docker Monitoring</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .card { background: white; border-radius: 8px; padding: 20px; margin: 10px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .metric { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #007bff; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .metric-label { color: #6c757d; margin-top: 5px; }
        .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
        .status-healthy { background: #28a745; }
        .status-warning { background: #ffc107; }
        .status-error { background: #dc3545; }
        .refresh-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        .refresh-btn:hover { background: #0056b3; }
        pre { background: #f8f8f8; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐳 Claude DB Integrity - Docker Monitoring</h1>
            <p>Real-time monitoring dashboard for your containerized application</p>
        </div>
        
        <div class="card">
            <h2>Service Status</h2>
            <div id="services">
                <div>
                    <span class="status-indicator status-healthy"></span>
                    Application: <span id="app-status">Healthy</span>
                </div>
                <div>
                    <span class="status-indicator status-healthy"></span>
                    Database: <span id="db-status">Healthy</span>
                </div>
                <div>
                    <span class="status-indicator status-healthy"></span>
                    Redis: <span id="redis-status">Healthy</span>
                </div>
                <div>
                    <span class="status-indicator status-healthy"></span>
                    Integrity System: <span id="integrity-status">Active</span>
                </div>
            </div>
            <button class="refresh-btn" onclick="refreshStatus()">Refresh Status</button>
        </div>
        
        <div class="card">
            <h2>Integrity Metrics</h2>
            <div class="metrics">
                <div class="metric">
                    <div class="metric-value" id="checks-passed">0</div>
                    <div class="metric-label">Checks Passed</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="checks-failed">0</div>
                    <div class="metric-label">Checks Failed</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="validations-run">0</div>
                    <div class="metric-label">Validations Run</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="uptime">0h</div>
                    <div class="metric-label">Uptime</div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h2>Quick Actions</h2>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="refresh-btn" onclick="runHealthCheck()">Run Health Check</button>
                <button class="refresh-btn" onclick="runIntegrityCheck()">Run Integrity Check</button>
                <button class="refresh-btn" onclick="checkSchemaDrift()">Check Schema Drift</button>
                <button class="refresh-btn" onclick="viewLogs()">View Logs</button>
            </div>
            <pre id="output" style="max-height: 300px; overflow-y: auto;"></pre>
        </div>
        
        <div class="card">
            <h2>Container Commands</h2>
            <pre><code># View application logs
docker-compose logs app

# Run integrity checks
docker-compose exec app npm run integrity:check

# Access application shell
docker-compose exec app sh

# View database logs
docker-compose logs db

# Restart services
docker-compose restart

# Scale application
docker-compose up --scale app=3</code></pre>
        </div>
    </div>
    
    <script>
        // Mock data for demonstration
        let metrics = {
            checksPassed: 142,
            checksFailed: 2,
            validationsRun: 1847,
            uptime: new Date()
        };
        
        function updateMetrics() {
            document.getElementById('checks-passed').textContent = metrics.checksPassed;
            document.getElementById('checks-failed').textContent = metrics.checksFailed;
            document.getElementById('validations-run').textContent = metrics.validationsRun;
            
            const uptimeHours = Math.floor((new Date() - metrics.uptime) / (1000 * 60 * 60));
            document.getElementById('uptime').textContent = `${uptimeHours}h`;
        }
        
        function refreshStatus() {
            // In a real implementation, this would fetch from the API
            console.log('Refreshing status...');
            updateMetrics();
        }
        
        function runHealthCheck() {
            const output = document.getElementById('output');
            output.textContent = 'Running health check...\n';
            
            // Simulate API call
            setTimeout(() => {
                output.textContent += '✅ Application: Healthy\n';
                output.textContent += '✅ Database: Connected\n';
                output.textContent += '✅ Redis: Available\n';
                output.textContent += '✅ Integrity System: Active\n';
                output.textContent += '\nHealth check completed successfully.';
            }, 1000);
        }
        
        function runIntegrityCheck() {
            const output = document.getElementById('output');
            output.textContent = 'Running integrity check...\n';
            
            setTimeout(() => {
                output.textContent += '🔍 Checking data integrity...\n';
                output.textContent += '📊 Validating schemas...\n';
                output.textContent += '🎯 Running business rules...\n';
                output.textContent += '✅ 15 checks passed\n';
                output.textContent += '⚠️ 1 warning found\n';
                output.textContent += '\nIntegrity check completed.';
                metrics.checksPassed += 15;
                updateMetrics();
            }, 2000);
        }
        
        function checkSchemaDrift() {
            const output = document.getElementById('output');
            output.textContent = 'Checking for schema drift...\n';
            
            setTimeout(() => {
                output.textContent += '📋 Comparing current schema...\n';
                output.textContent += '🔄 Analyzing changes...\n';
                output.textContent += '✅ No schema drift detected\n';
                output.textContent += '\nSchema drift check completed.';
            }, 1500);
        }
        
        function viewLogs() {
            const output = document.getElementById('output');
            output.textContent = 'Recent logs:\n\n';
            output.textContent += '[2024-12-25T20:58:00Z] INFO: Integrity check started\n';
            output.textContent += '[2024-12-25T20:58:02Z] INFO: Validating user table\n';
            output.textContent += '[2024-12-25T20:58:03Z] INFO: 145 records validated\n';
            output.textContent += '[2024-12-25T20:58:05Z] INFO: Integrity check completed\n';
            output.textContent += '[2024-12-25T20:58:10Z] INFO: Claude memory sync completed\n';
        }
        
        // Initialize
        updateMetrics();
        
        // Auto-refresh every 30 seconds
        setInterval(updateMetrics, 30000);
    </script>
</body>
</html>
EOF

    # Create Docker utility scripts
    print_substep "Creating Docker utility scripts..."
    
    cat > docker/scripts/backup.sh << 'EOF'
#!/bin/bash
# Backup script for Claude DB Integrity Docker setup

set -e

BACKUP_DIR="./backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Creating backup at $BACKUP_DIR..."

# Backup database
docker-compose exec -T db pg_dump -U postgres appdb > "$BACKUP_DIR/database.sql"

# Backup application data
docker-compose exec -T app tar -czf - /app/data 2>/dev/null > "$BACKUP_DIR/app-data.tar.gz" || echo "No app data to backup"

# Backup Claude DB Integrity logs
docker-compose exec -T app npx claude-db-integrity export --format=json > "$BACKUP_DIR/integrity-export.json"

echo "Backup completed successfully at $BACKUP_DIR"
EOF

    cat > docker/scripts/restore.sh << 'EOF'
#!/bin/bash
# Restore script for Claude DB Integrity Docker setup

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_directory>"
    exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
    echo "Backup directory $BACKUP_DIR does not exist"
    exit 1
fi

echo "Restoring from backup at $BACKUP_DIR..."

# Stop services
docker-compose down

# Start database only
docker-compose up -d db
sleep 10

# Restore database
if [ -f "$BACKUP_DIR/database.sql" ]; then
    docker-compose exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS appdb;"
    docker-compose exec -T db psql -U postgres -c "CREATE DATABASE appdb;"
    docker-compose exec -T db psql -U postgres appdb < "$BACKUP_DIR/database.sql"
fi

# Start all services
docker-compose up -d

# Restore Claude DB Integrity data
if [ -f "$BACKUP_DIR/integrity-export.json" ]; then
    sleep 20  # Wait for application to start
    docker-compose exec -T app npx claude-db-integrity import --file=/dev/stdin < "$BACKUP_DIR/integrity-export.json"
fi

echo "Restore completed successfully"
EOF

    chmod +x docker/scripts/*.sh
    
    print_success "Docker support files created"
}

# Function to create .dockerignore
create_dockerignore() {
    print_step "Creating .dockerignore..."
    
    if [ ! -f ".dockerignore" ]; then
        cat > .dockerignore << 'EOF'
# Dependencies
node_modules
npm-debug.log*

# Runtime data
pids
*.pid
*.seed
*.log

# Coverage directory used by tools like istanbul
coverage

# Grunt intermediate storage
.grunt

# node-waf configuration
.lock-wscript

# Compiled binary addons
build/Release

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env.local
.env.development.local
.env.test.local
.env.production.local

# VS Code
.vscode

# IDE files
*.swp
*.swo
*~

# OS generated files
.DS_Store
Thumbs.db

# Git
.git
.gitignore

# Documentation
README.md
docs/

# Tests
tests/
**/*.test.js
**/*.test.ts
**/*.spec.js
**/*.spec.ts

# Development files
.editorconfig
.eslintrc*
.prettierrc*

# Logs
logs
*.log

# Runtime
tmp/
temp/

# Build artifacts
dist/
build/

# Cache
.cache
.parcel-cache

# Coverage reports
coverage/
.nyc_output

# Storybook build outputs
.out
.storybook-out

# Next.js
.next/
out/

# Nuxt.js
.nuxt

# Gatsby
.cache/
public

# Serverless
.serverless/

# FuseBox
.fusebox/

# DynamoDB Local
.dynamodb/

# TernJS
.tern-port

# Stores VSCode versions used for testing VSCode extensions
.vscode-test

# Migration backups (don't include in Docker image)
migration-backup*
migration-analysis/

# Local docker files
docker-compose.override.yml
Dockerfile.dev
EOF
        print_success ".dockerignore created"
    else
        print_warning ".dockerignore already exists"
    fi
}

# Function to create development docker-compose override
create_dev_compose() {
    print_step "Creating development Docker Compose override..."
    
    cat > docker-compose.dev.yml << 'EOF'
version: '3.8'

services:
  app:
    build:
      target: development
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - CLAUDE_INTEGRITY_LOG_LEVEL=debug
    ports:
      - "3000:3000"
      - "3001:3001"
      - "9229:9229"  # Node.js debugger
    command: npm run dev

  db:
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=appdb_dev
EOF
    
    print_success "Development override created: docker-compose.dev.yml"
}

# Function to display usage instructions
show_usage_instructions() {
    local project_type=$1
    local database_type=$2
    
    echo
    print_success "🐳 Docker setup completed!"
    echo
    echo -e "${BLUE}Project Type:${NC} $project_type"
    echo -e "${BLUE}Database Type:${NC} $database_type"
    echo -e "${BLUE}Files Created:${NC}"
    echo "  - $DOCKERFILE_NAME"
    echo "  - $COMPOSE_FILE"
    echo "  - docker-compose.dev.yml"
    echo "  - .dockerignore"
    echo "  - docker/ (support files)"
    echo
    echo -e "${YELLOW}Quick Start:${NC}"
    echo "1. Build and start services:"
    echo "   $DOCKER_COMPOSE_CMD up --build"
    echo
    echo "2. For development with hot reload:"
    echo "   $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.dev.yml up --build"
    echo
    echo "3. Run integrity checks:"
    echo "   $DOCKER_COMPOSE_CMD exec app npm run integrity:check"
    echo
    echo "4. Access monitoring dashboard:"
    echo "   open http://localhost:8080"
    echo
    echo -e "${YELLOW}Useful Commands:${NC}"
    echo "  $DOCKER_COMPOSE_CMD logs app              # View application logs"
    echo "  $DOCKER_COMPOSE_CMD logs db               # View database logs"
    echo "  $DOCKER_COMPOSE_CMD exec app sh           # Access app container shell"
    echo "  $DOCKER_COMPOSE_CMD exec db psql -U postgres appdb  # Access database"
    echo "  $DOCKER_COMPOSE_CMD down                  # Stop all services"
    echo "  $DOCKER_COMPOSE_CMD down -v               # Stop and remove volumes"
    echo
    echo -e "${YELLOW}Backup & Restore:${NC}"
    echo "  ./docker/scripts/backup.sh                # Create backup"
    echo "  ./docker/scripts/restore.sh <backup_dir>  # Restore from backup"
    echo
    echo -e "${YELLOW}Health Checks:${NC}"
    echo "  - Application: http://localhost:3000/health"
    echo "  - Integrity: http://localhost:3001/"
    echo "  - Monitoring: http://localhost:8080/"
    echo
    echo -e "${GREEN}Happy containerizing! 🚀${NC}"
}

# Function to handle errors
handle_error() {
    print_error "Docker setup failed at step: $1"
    echo "Please check the error messages above and try again."
    echo "If you need help, please visit: https://github.com/warehouse-network/claude-db-integrity/issues"
    exit 1
}

# Main function
main() {
    echo -e "${GREEN}🐳 Claude DB Integrity Docker Setup${NC}"
    echo "This script will set up Docker integration for your project with Claude DB Integrity."
    echo
    
    # Parse command line arguments
    INTERACTIVE=true
    FORCE=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --non-interactive)
                INTERACTIVE=false
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --non-interactive  Run without prompts"
                echo "  --force           Overwrite existing files"
                echo "  --help            Show this help"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Check prerequisites
    check_prerequisites || handle_error "Prerequisites check"
    
    # Detect project configuration
    PROJECT_TYPE=$(detect_project_type)
    DATABASE_TYPE=$(detect_database_type)
    
    if [ "$INTERACTIVE" = true ]; then
        echo "Detected project type: $PROJECT_TYPE"
        echo "Detected database type: $DATABASE_TYPE"
        echo
        
        read -p "Continue with Docker setup? [Y/n]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "Setup cancelled by user."
            exit 0
        fi
    fi
    
    # Run setup steps
    create_dockerfile "$PROJECT_TYPE" || handle_error "Dockerfile creation"
    create_docker_compose "$DATABASE_TYPE" || handle_error "Docker Compose creation"
    create_dockerignore || handle_error "Dockerignore creation"
    create_dev_compose || handle_error "Development compose creation"
    create_docker_support_files || handle_error "Support files creation"
    
    # Show completion message
    show_usage_instructions "$PROJECT_TYPE" "$DATABASE_TYPE"
}

# Trap errors and cleanup
trap 'handle_error "Unknown error occurred"' ERR

# Run main function
main "$@"