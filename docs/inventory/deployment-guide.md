# Inventory Management System - Deployment Guide

## Overview
This guide provides comprehensive instructions for deploying the Inventory Management System in production environments, including infrastructure setup, configuration, monitoring, and maintenance procedures.

## System Requirements

### Minimum Hardware Requirements

#### Production Environment
- **CPU**: 8 cores (Intel Xeon or AMD EPYC)
- **Memory**: 32 GB RAM
- **Storage**: 500 GB SSD (primary), 2 TB HDD (backups)
- **Network**: 1 Gbps network interface

#### High Availability Environment
- **CPU**: 16 cores per node (3+ nodes)
- **Memory**: 64 GB RAM per node
- **Storage**: 1 TB NVMe SSD per node, shared storage for backups
- **Network**: 10 Gbps network with redundancy

### Software Requirements
- **Operating System**: Ubuntu 22.04 LTS or CentOS 8+
- **Container Runtime**: Docker 24.0+ or Podman 4.0+
- **Orchestration**: Kubernetes 1.28+ (recommended) or Docker Compose
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7.0+
- **Message Queue**: Apache Kafka 3.4+ (optional for real-time features)

## Infrastructure Architecture

### Production Architecture Diagram
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   API Gateway   │    │   Web Frontend  │
│   (HAProxy/Nginx│    │   (Kong/Envoy)  │    │   (React/Next)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Inventory API   │    │ Barcode API     │    │ Forecasting API │
│ (Node.js)       │    │ (Node.js)       │    │ (Node.js)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ PostgreSQL      │    │ Redis Cache     │    │ InfluxDB        │
│ (Primary DB)    │    │ (Session/Cache) │    │ (Time Series)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ PG Read Replica │    │ Redis Cluster   │    │ Kafka Cluster   │
│ (Read Scaling)  │    │ (HA Cache)      │    │ (Event Stream)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Deployment Options

### Option 1: Kubernetes Deployment (Recommended)

#### Prerequisites
1. Kubernetes cluster (EKS, GKE, AKS, or self-managed)
2. kubectl configured with cluster access
3. Helm 3.0+ installed
4. Container registry access (Docker Hub, ECR, GCR)

#### Step 1: Create Namespace
```bash
kubectl create namespace inventory-system
kubectl config set-context --current --namespace=inventory-system
```

#### Step 2: Deploy Dependencies
```yaml
# postgres-deployment.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15
        env:
        - name: POSTGRES_DB
          value: inventory
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-service
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
```

```yaml
# redis-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        volumeMounts:
        - name: redis-data
          mountPath: /data
      volumes:
      - name: redis-data
        persistentVolumeClaim:
          claimName: redis-pvc
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

#### Step 3: Create Secrets
```bash
kubectl create secret generic postgres-secret \
  --from-literal=username=inventory_user \
  --from-literal=password=your-secure-password

kubectl create secret generic app-secrets \
  --from-literal=database-url="postgresql://inventory_user:your-secure-password@postgres-service:5432/inventory" \
  --from-literal=redis-url="redis://redis-service:6379" \
  --from-literal=jwt-secret="your-jwt-secret"
```

#### Step 4: Deploy Application
```yaml
# inventory-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: inventory-service
  labels:
    app: inventory-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: inventory-service
  template:
    metadata:
      labels:
        app: inventory-service
    spec:
      containers:
      - name: inventory-service
        image: warehouse-network/inventory-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: redis-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: inventory-service
spec:
  selector:
    app: inventory-service
  ports:
  - port: 80
    targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: inventory-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.warehouse-network.com
    secretName: inventory-tls
  rules:
  - host: api.warehouse-network.com
    http:
      paths:
      - path: /v1/inventory
        pathType: Prefix
        backend:
          service:
            name: inventory-service
            port:
              number: 80
```

#### Step 5: Deploy Using Helm (Alternative)
```bash
# Add Helm repository
helm repo add warehouse-network https://charts.warehouse-network.com
helm repo update

# Install with custom values
helm install inventory-system warehouse-network/inventory \
  --namespace inventory-system \
  --set database.host=postgres-service \
  --set database.password=your-secure-password \
  --set redis.host=redis-service \
  --set image.tag=latest \
  --set replicas=3
```

### Option 2: Docker Compose Deployment

#### Step 1: Create Environment File
```bash
# .env
NODE_ENV=production
DATABASE_URL=postgresql://inventory_user:secure_password@postgres:5432/inventory
REDIS_URL=redis://redis:6379
JWT_SECRET=your-jwt-secret-here
KAFKA_BROKERS=kafka:9092

# Database credentials
POSTGRES_USER=inventory_user
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=inventory
```

#### Step 2: Create Docker Compose File
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    depends_on:
      - zookeeper
    volumes:
      - kafka_data:/var/lib/kafka/data
    restart: unless-stopped

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    volumes:
      - zookeeper_data:/var/lib/zookeeper/data
    restart: unless-stopped

  inventory-service:
    image: warehouse-network/inventory-service:latest
    environment:
      - NODE_ENV=${NODE_ENV}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - KAFKA_BROKERS=${KAFKA_BROKERS}
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      kafka:
        condition: service_started
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 1G
          cpus: '0.5'

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl
    depends_on:
      - inventory-service
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  kafka_data:
  zookeeper_data:
```

#### Step 3: Deploy with Docker Compose
```bash
# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f inventory-service
```

## Configuration

### Environment Variables

#### Application Configuration
```bash
# Core settings
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@host:port/dbname
DATABASE_POOL_SIZE=20
DATABASE_TIMEOUT=30000

# Cache
REDIS_URL=redis://host:port
REDIS_KEY_PREFIX=inventory:
REDIS_TTL=3600

# Security
JWT_SECRET=your-256-bit-secret
JWT_EXPIRES_IN=24h
CORS_ORIGIN=https://warehouse-network.com

# Features
ENABLE_REAL_TIME=true
ENABLE_FORECASTING=true
ENABLE_BARCODE_SCANNING=true
ENABLE_MULTI_WAREHOUSE=true

# External Services
KAFKA_BROKERS=kafka1:9092,kafka2:9092
INFLUXDB_URL=http://influxdb:8086
INFLUXDB_TOKEN=your-token
INFLUXDB_ORG=warehouse-network
INFLUXDB_BUCKET=inventory-metrics

# Monitoring
PROMETHEUS_METRICS_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_ENABLED=true
```

#### Database Configuration
```sql
-- Create optimized database configuration
-- postgresql.conf adjustments for inventory workload

# Memory settings
shared_buffers = 2GB                    # 25% of RAM
effective_cache_size = 6GB              # 75% of RAM
work_mem = 256MB                        # For sort/hash operations
maintenance_work_mem = 512MB             # For maintenance operations

# Connection settings
max_connections = 200                    # Based on expected load
shared_preload_libraries = 'pg_stat_statements'

# Checkpoint settings
checkpoint_timeout = 15min
checkpoint_completion_target = 0.7
wal_buffers = 64MB

# Query planner
random_page_cost = 1.1                   # SSD optimization
effective_io_concurrency = 200           # SSD optimization

# Logging
log_statement = 'mod'                    # Log modifications
log_duration = on
log_min_duration_statement = 1000       # Log slow queries (1s+)
```

## Database Setup and Migration

### Initial Database Setup
```bash
# Run database migrations
docker exec inventory-service npm run db:migrate

# Seed initial data
docker exec inventory-service npm run db:seed

# Create database indexes
docker exec inventory-service npm run db:index
```

### Migration Scripts
```sql
-- Initial schema migration
-- migrations/001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create indexes for performance
CREATE INDEX CONCURRENTLY idx_inventory_levels_sku_warehouse
ON inventory_levels(sku_id, warehouse_id);

CREATE INDEX CONCURRENTLY idx_stock_movements_sku_date
ON stock_movements(sku_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_stock_movements_warehouse_date
ON stock_movements(from_warehouse_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_barcodes_code
ON barcodes(code) WHERE active = true;

CREATE INDEX CONCURRENTLY idx_reorder_rules_active
ON reorder_rules(sku_id, warehouse_id) WHERE active = true;

-- Partial indexes for performance
CREATE INDEX CONCURRENTLY idx_inventory_levels_low_stock
ON inventory_levels(sku_id) WHERE available <= min_level;

CREATE INDEX CONCURRENTLY idx_stock_movements_processed
ON stock_movements(created_at DESC) WHERE processed = true;
```

## Monitoring and Observability

### Prometheus Metrics
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'inventory-service'
    static_configs:
      - targets: ['inventory-service:9090']
    scrape_interval: 30s
    metrics_path: /metrics

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### Grafana Dashboards
```json
{
  "dashboard": {
    "title": "Inventory System Monitoring",
    "panels": [
      {
        "title": "API Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Database Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "pg_stat_activity_count",
            "legendFormat": "Active connections"
          }
        ]
      },
      {
        "title": "Redis Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "redis_memory_used_bytes",
            "legendFormat": "Memory used"
          }
        ]
      }
    ]
  }
}
```

### Application Logging
```javascript
// Winston logger configuration
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'inventory-service',
    environment: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.File({
      filename: '/var/log/inventory/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: '/var/log/inventory/combined.log'
    })
  ]
});

// Add console transport for non-production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

## Backup and Disaster Recovery

### Database Backup Strategy
```bash
#!/bin/bash
# backup-database.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
DB_NAME="inventory"

# Create backup directory
mkdir -p $BACKUP_DIR

# Full database backup
pg_dump -h postgres-service -U inventory_user -d $DB_NAME \
  --verbose --format=custom --compress=9 \
  > $BACKUP_DIR/inventory_backup_$DATE.dump

# Incremental backup using WAL-E or similar
# wal-e backup-push $BACKUP_DIR/wal_$DATE

# Clean old backups (keep last 30 days)
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete

echo "Backup completed: inventory_backup_$DATE.dump"
```

### Automated Backup with CronJob (Kubernetes)
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: postgres-backup
            image: postgres:15
            env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: password
            command:
            - /bin/bash
            - -c
            - |
              DATE=$(date +%Y%m%d_%H%M%S)
              pg_dump -h postgres-service -U inventory_user inventory \
                --format=custom --compress=9 > /backup/inventory_$DATE.dump
              # Upload to cloud storage
              aws s3 cp /backup/inventory_$DATE.dump s3://warehouse-backups/postgres/
            volumeMounts:
            - name: backup-storage
              mountPath: /backup
          volumes:
          - name: backup-storage
            persistentVolumeClaim:
              claimName: backup-pvc
          restartPolicy: OnFailure
```

### Disaster Recovery Procedures
```bash
# Database restoration
pg_restore -h postgres-service -U inventory_user -d inventory \
  --clean --if-exists --verbose \
  /backups/inventory_backup_20240325_020000.dump

# Redis data restoration
redis-cli --rdb /backups/redis_backup.rdb

# Application state verification
kubectl exec -it inventory-service-pod -- npm run health-check
```

## Security Configuration

### SSL/TLS Setup
```nginx
# nginx SSL configuration
server {
    listen 443 ssl http2;
    server_name api.warehouse-network.com;

    ssl_certificate /etc/ssl/certs/warehouse-network.crt;
    ssl_certificate_key /etc/ssl/private/warehouse-network.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location / {
        proxy_pass http://inventory-service;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Network Security
```yaml
# Kubernetes NetworkPolicy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: inventory-network-policy
spec:
  podSelector:
    matchLabels:
      app: inventory-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx-ingress
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
```

## Performance Tuning

### Application Performance
```javascript
// Node.js performance optimizations
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Restart worker
  });
} else {
  require('./app.js');
  console.log(`Worker ${process.pid} started`);
}
```

### Database Performance Tuning
```sql
-- Query optimization
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM inventory_levels
WHERE sku_id = 'sku-123' AND warehouse_id = 'wh-456';

-- Create covering indexes
CREATE INDEX idx_inventory_covering
ON inventory_levels(sku_id, warehouse_id)
INCLUDE (on_hand, reserved, available);

-- Partition large tables
CREATE TABLE stock_movements_2024 PARTITION OF stock_movements
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

## Troubleshooting

### Common Issues

#### High Memory Usage
```bash
# Check memory usage
kubectl top pods -n inventory-system

# Analyze Node.js heap
kubectl exec -it inventory-service-pod -- node --inspect --port=9229 app.js

# Redis memory analysis
kubectl exec -it redis-pod -- redis-cli --bigkeys
```

#### Database Connection Issues
```bash
# Check connection pool
kubectl logs inventory-service-pod | grep "connection pool"

# Monitor active connections
kubectl exec -it postgres-pod -- psql -U inventory_user -c "
SELECT count(*) as connections, state
FROM pg_stat_activity
GROUP BY state;"
```

#### Performance Issues
```bash
# Check slow queries
kubectl exec -it postgres-pod -- psql -U inventory_user -c "
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"

# Monitor API performance
curl -w "@curl-format.txt" -o /dev/null -s "https://api.warehouse-network.com/health"
```

## Maintenance Procedures

### Regular Maintenance Tasks
```bash
#!/bin/bash
# maintenance.sh - Run weekly maintenance

echo "Starting maintenance tasks..."

# Database maintenance
kubectl exec postgres-pod -- psql -U inventory_user -c "
VACUUM ANALYZE;
REINDEX DATABASE inventory;
"

# Clear old audit logs (keep 90 days)
kubectl exec inventory-service-pod -- npm run cleanup:audit-logs -- --days=90

# Update statistics
kubectl exec postgres-pod -- psql -U inventory_user -c "
UPDATE pg_stat_statements_reset();
"

echo "Maintenance completed"
```

### Rolling Updates
```bash
# Update application
kubectl set image deployment/inventory-service \
  inventory-service=warehouse-network/inventory-service:v2.1.0

# Monitor rollout
kubectl rollout status deployment/inventory-service

# Rollback if needed
kubectl rollout undo deployment/inventory-service
```

This deployment guide provides comprehensive instructions for production deployment of the inventory management system. Follow the appropriate section based on your infrastructure choice and requirements.