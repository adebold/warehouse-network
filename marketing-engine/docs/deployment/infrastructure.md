# Infrastructure Requirements

## Overview

This guide outlines the production infrastructure requirements for deploying Marketing Engine at scale. All recommendations follow cloud-native best practices and are designed for high availability, security, and performance.

## Minimum Production Requirements

### Compute Resources

| Component | CPU | Memory | Storage | Instances |
|-----------|-----|--------|---------|-----------|
| API Servers | 4 vCPU | 16 GB | 50 GB SSD | 3 (minimum) |
| Background Workers | 2 vCPU | 8 GB | 20 GB SSD | 2 (minimum) |
| Analytics Engine | 8 vCPU | 32 GB | 100 GB SSD | 2 |
| PostgreSQL Primary | 8 vCPU | 32 GB | 500 GB SSD | 1 |
| PostgreSQL Replicas | 4 vCPU | 16 GB | 500 GB SSD | 2 |
| Redis Cluster | 4 vCPU | 16 GB | 50 GB SSD | 3 |
| TimescaleDB | 8 vCPU | 64 GB | 1 TB SSD | 2 |

### Network Requirements

- **Bandwidth**: Minimum 1 Gbps between services
- **Load Balancer**: Application Load Balancer with SSL termination
- **CDN**: Global CDN for static assets and API caching
- **VPC**: Isolated network with private subnets
- **NAT Gateway**: For outbound internet access from private subnets

## Cloud Provider Configurations

### AWS Architecture

```yaml
# CloudFormation template excerpt
Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsHostnames: true
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: marketing-engine-vpc

  PublicSubnetA:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [0, !GetAZs ""]
      CidrBlock: 10.0.1.0/24
      MapPublicIpOnLaunch: true

  PrivateSubnetA:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [0, !GetAZs ""]
      CidrBlock: 10.0.10.0/24

  ApplicationLoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Type: application
      Scheme: internet-facing
      SecurityGroups:
        - !Ref ALBSecurityGroup
      Subnets:
        - !Ref PublicSubnetA
        - !Ref PublicSubnetB

  ECSCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: marketing-engine-cluster
      CapacityProviders:
        - FARGATE
        - FARGATE_SPOT
      DefaultCapacityProviderStrategy:
        - CapacityProvider: FARGATE
          Weight: 1
          Base: 2
        - CapacityProvider: FARGATE_SPOT
          Weight: 4

  RDSCluster:
    Type: AWS::RDS::DBCluster
    Properties:
      Engine: aurora-postgresql
      EngineVersion: "15.3"
      MasterUsername: !Ref DBUsername
      MasterUserPassword: !Ref DBPassword
      DatabaseName: marketing_engine
      DBClusterParameterGroupName: !Ref DBClusterParameterGroup
      VpcSecurityGroupIds:
        - !Ref DatabaseSecurityGroup
      DBSubnetGroupName: !Ref DBSubnetGroup
      BackupRetentionPeriod: 30
      PreferredBackupWindow: "03:00-04:00"
      PreferredMaintenanceWindow: "sun:04:00-sun:05:00"
      EnableCloudwatchLogsExports:
        - postgresql
```

### Google Cloud Platform

```yaml
# Terraform configuration
provider "google" {
  project = var.project_id
  region  = var.region
}

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "marketing-engine-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "private" {
  name          = "private-subnet"
  ip_cidr_range = "10.0.10.0/24"
  network       = google_compute_network.vpc.id
  region        = var.region
  
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }
  
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/16"
  }
}

# GKE Cluster
resource "google_container_cluster" "primary" {
  name     = "marketing-engine-cluster"
  location = var.region

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.private.name

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  addons_config {
    horizontal_pod_autoscaling {
      disabled = false
    }
    
    http_load_balancing {
      disabled = false
    }
    
    network_policy_config {
      disabled = false
    }
  }
}

# Node Pool
resource "google_container_node_pool" "primary_nodes" {
  name       = "primary-node-pool"
  location   = var.region
  cluster    = google_container_cluster.primary.name
  node_count = 3

  autoscaling {
    min_node_count = 3
    max_node_count = 10
  }

  node_config {
    preemptible  = false
    machine_type = "n1-standard-4"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env  = "production"
      tier = "api"
    }

    tags = ["marketing-engine", "api"]
  }
}

# Cloud SQL
resource "google_sql_database_instance" "postgres" {
  name             = "marketing-engine-postgres"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-custom-8-32768"
    
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
    }

    database_flags {
      name  = "max_connections"
      value = "200"
    }

    database_flags {
      name  = "shared_buffers"
      value = "8388608"
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    maintenance_window {
      day          = 7  # Sunday
      hour         = 4  # 4 AM
      update_track = "stable"
    }
  }
}
```

### Azure Configuration

```yaml
# ARM Template
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "location": {
      "type": "string",
      "defaultValue": "[resourceGroup().location]"
    }
  },
  "resources": [
    {
      "type": "Microsoft.Network/virtualNetworks",
      "apiVersion": "2021-02-01",
      "name": "marketing-engine-vnet",
      "location": "[parameters('location')]",
      "properties": {
        "addressSpace": {
          "addressPrefixes": ["10.0.0.0/16"]
        },
        "subnets": [
          {
            "name": "api-subnet",
            "properties": {
              "addressPrefix": "10.0.1.0/24"
            }
          },
          {
            "name": "database-subnet",
            "properties": {
              "addressPrefix": "10.0.10.0/24"
            }
          }
        ]
      }
    },
    {
      "type": "Microsoft.ContainerService/managedClusters",
      "apiVersion": "2021-03-01",
      "name": "marketing-engine-aks",
      "location": "[parameters('location')]",
      "properties": {
        "dnsPrefix": "marketing-engine",
        "agentPoolProfiles": [
          {
            "name": "apipool",
            "count": 3,
            "vmSize": "Standard_DS3_v2",
            "mode": "System",
            "enableAutoScaling": true,
            "minCount": 3,
            "maxCount": 10
          }
        ],
        "networkProfile": {
          "networkPlugin": "azure",
          "serviceCidr": "10.2.0.0/16",
          "dnsServiceIP": "10.2.0.10"
        }
      }
    },
    {
      "type": "Microsoft.DBforPostgreSQL/flexibleServers",
      "apiVersion": "2021-06-01",
      "name": "marketing-engine-postgres",
      "location": "[parameters('location')]",
      "sku": {
        "name": "Standard_D8ds_v4",
        "tier": "GeneralPurpose"
      },
      "properties": {
        "version": "15",
        "storageProfile": {
          "storageMB": 524288,
          "backupRetentionDays": 30,
          "geoRedundantBackup": "Enabled"
        },
        "highAvailability": {
          "mode": "ZoneRedundant"
        }
      }
    }
  ]
}
```

## Container Orchestration

### Kubernetes Configuration

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: marketing-engine
  labels:
    name: marketing-engine
    environment: production

---
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: marketing-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
      - name: api
        image: marketingengine/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-credentials
              key: url
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
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
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api-server
  namespace: marketing-engine
spec:
  selector:
    app: api-server
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: marketing-engine
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - api.marketingengine.io
    secretName: api-tls
  rules:
  - host: api.marketingengine.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-server
            port:
              number: 80

---
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server-hpa
  namespace: marketing-engine
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Docker Configuration

```dockerfile
# Multi-stage build for API server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm ci --only=development

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
```

## Database Architecture

### PostgreSQL Configuration

```sql
-- Performance tuning parameters
ALTER SYSTEM SET shared_buffers = '8GB';
ALTER SYSTEM SET effective_cache_size = '24GB';
ALTER SYSTEM SET maintenance_work_mem = '2GB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET min_wal_size = '2GB';
ALTER SYSTEM SET max_wal_size = '8GB';
ALTER SYSTEM SET max_worker_processes = 8;
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;
ALTER SYSTEM SET max_parallel_maintenance_workers = 4;

-- Connection pooling
ALTER SYSTEM SET max_connections = 200;

-- Logging
ALTER SYSTEM SET log_checkpoints = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_duration = on;
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET log_temp_files = 0;

-- Reload configuration
SELECT pg_reload_conf();
```

### Redis Cluster Configuration

```conf
# redis.conf
port 6379
bind 0.0.0.0
protected-mode yes
requirepass ${REDIS_PASSWORD}
maxmemory 8gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data

# AOF
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no

# Cluster
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
cluster-require-full-coverage yes

# Performance
tcp-backlog 511
timeout 300
tcp-keepalive 300
```

### TimescaleDB Setup

```sql
-- Create TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create analytics tables
CREATE TABLE metrics (
    time TIMESTAMPTZ NOT NULL,
    metric_name TEXT NOT NULL,
    channel TEXT,
    campaign_id UUID,
    value DOUBLE PRECISION,
    metadata JSONB
);

-- Convert to hypertable
SELECT create_hypertable('metrics', 'time');

-- Create indexes
CREATE INDEX idx_metrics_metric_time ON metrics (metric_name, time DESC);
CREATE INDEX idx_metrics_channel_time ON metrics (channel, time DESC);
CREATE INDEX idx_metrics_campaign ON metrics (campaign_id, time DESC);

-- Compression policy
ALTER TABLE metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'metric_name,channel',
    timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy (compress data older than 30 days)
SELECT add_compression_policy('metrics', INTERVAL '30 days');

-- Continuous aggregates
CREATE MATERIALIZED VIEW hourly_metrics
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS hour,
    metric_name,
    channel,
    campaign_id,
    avg(value) as avg_value,
    sum(value) as sum_value,
    count(*) as count
FROM metrics
GROUP BY hour, metric_name, channel, campaign_id;

-- Refresh policy
SELECT add_continuous_aggregate_policy('hourly_metrics',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Retention policy (keep raw data for 90 days)
SELECT add_retention_policy('metrics', INTERVAL '90 days');
```

## Monitoring Stack

### Prometheus Configuration

```yaml
# prometheus.yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'api-servers'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
            - marketing-engine
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: api-server
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace

  - job_name: 'node-exporter'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - source_labels: [__address__]
        regex: '(.*):10250'
        replacement: '${1}:9100'
        target_label: __address__

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
    "title": "Marketing Engine - Production Overview",
    "panels": [
      {
        "title": "API Request Rate",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (method, status)"
          }
        ]
      },
      {
        "title": "Response Time P95",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Database Connections",
        "targets": [
          {
            "expr": "pg_stat_activity_count"
          }
        ]
      },
      {
        "title": "Redis Memory Usage",
        "targets": [
          {
            "expr": "redis_memory_used_bytes / redis_memory_max_bytes * 100"
          }
        ]
      }
    ]
  }
}
```

## Security Infrastructure

### Network Security

```yaml
# Network policies
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-server-netpol
  namespace: marketing-engine
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: marketing-engine
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

### Secrets Management

```yaml
# Sealed Secrets example
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: database-credentials
  namespace: marketing-engine
spec:
  encryptedData:
    url: AgBvKp1... # Encrypted DATABASE_URL
    username: AgCmXy2... # Encrypted username
    password: AgDnZa3... # Encrypted password
```

## Backup Strategy

### Database Backups

```bash
#!/bin/bash
# backup.sh

# PostgreSQL backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
S3_BUCKET="s3://marketing-engine-backups/postgres"

# Perform backup
pg_dump $DATABASE_URL | gzip > "$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"

# Upload to S3
aws s3 cp "$BACKUP_DIR/backup_$TIMESTAMP.sql.gz" "$S3_BUCKET/"

# Clean old local backups (keep 7 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

# Verify backup
if [ $? -eq 0 ]; then
    echo "Backup successful: backup_$TIMESTAMP.sql.gz"
    # Send success notification
else
    echo "Backup failed!"
    # Send alert
fi
```

### Disaster Recovery

```yaml
# DR Configuration
disaster_recovery:
  rpo: 1h  # Recovery Point Objective
  rto: 4h  # Recovery Time Objective
  
  backup_schedule:
    full: "0 2 * * 0"  # Weekly full backup
    incremental: "0 * * * *"  # Hourly incremental
    
  replication:
    postgres:
      type: streaming
      lag_alert: 60s
    redis:
      type: master-slave
      slaves: 2
      
  failover:
    automatic: true
    health_check_interval: 10s
    failure_threshold: 3
```

## Performance Optimization

### CDN Configuration

```nginx
# CDN cache rules
location ~* \.(jpg|jpeg|gif|png|svg|js|css|mp3|ogg|mpe?g|avi|zip|gz|bz2?|rar|ico|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header X-Cache-Status $upstream_cache_status;
}

location /api/ {
    proxy_pass http://api-backend;
    proxy_cache api_cache;
    proxy_cache_valid 200 1m;
    proxy_cache_valid 404 1m;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;
    proxy_cache_lock on;
    add_header X-Cache-Status $upstream_cache_status;
}
```

### Load Testing

```yaml
# k6 load test configuration
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '5m', target: 100 },   // Ramp up
    { duration: '10m', target: 100 },  // Stay at 100 users
    { duration: '5m', target: 500 },   // Ramp up to 500
    { duration: '10m', target: 500 },  // Stay at 500
    { duration: '5m', target: 1000 },  // Peak load
    { duration: '10m', target: 1000 }, // Sustain peak
    { duration: '10m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],   // Error rate under 1%
  },
};

export default function () {
  let response = http.get('https://api.marketingengine.io/v1/health');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

## Cost Optimization

### Resource Recommendations by Traffic

| Monthly Traffic | API Servers | Workers | Database | Cache | Estimated Cost |
|----------------|-------------|---------|----------|-------|----------------|
| < 1M requests | 2 × t3.large | 1 × t3.medium | db.t3.large | cache.t3.medium | ~$500/mo |
| 1-10M requests | 3 × c5.xlarge | 2 × c5.large | db.r5.xlarge | cache.r5.large | ~$2,000/mo |
| 10-50M requests | 5 × c5.2xlarge | 4 × c5.xlarge | db.r5.2xlarge | cache.r5.xlarge | ~$5,000/mo |
| 50M+ requests | Auto-scaling | Auto-scaling | Aurora Serverless v2 | ElastiCache | ~$10,000+/mo |

## Support

For infrastructure support:
- Documentation: https://docs.marketingengine.io/infrastructure
- DevOps Team: devops@marketingengine.io
- Emergency: +1-xxx-xxx-xxxx (24/7)