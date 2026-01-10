#!/bin/bash

# Monitoring Stack Initialization Script
# This script sets up the monitoring stack and loads initial configurations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORING_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$MONITORING_DIR")"

echo "🚀 Initializing Warehouse Network Monitoring Stack"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p "$MONITORING_DIR"/{prometheus/rules,grafana/{dashboards,provisioning},alertmanager,loki,promtail}

# Check if docker-compose file exists
if [ ! -f "$MONITORING_DIR/docker-compose.monitoring.yml" ]; then
    echo "❌ Error: docker-compose.monitoring.yml not found!"
    exit 1
fi

# Set proper permissions for Prometheus and Grafana data directories
echo "🔒 Setting permissions..."
if [ -d "/var/lib/docker/volumes/monitoring_prometheus-data" ]; then
    sudo chown -R 65534:65534 /var/lib/docker/volumes/monitoring_prometheus-data 2>/dev/null || true
fi

if [ -d "/var/lib/docker/volumes/monitoring_grafana-data" ]; then
    sudo chown -R 472:472 /var/lib/docker/volumes/monitoring_grafana-data 2>/dev/null || true
fi

# Start the monitoring stack
echo "🐳 Starting monitoring stack..."
cd "$MONITORING_DIR"
docker-compose -f docker-compose.monitoring.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🏥 Checking service health..."

check_service() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|301\|302"; then
            echo "✅ $service is healthy"
            return 0
        fi
        echo "⏳ Waiting for $service... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    echo "❌ $service failed to start"
    return 1
}

# Check each service
check_service "Prometheus" "http://localhost:9090/-/healthy"
check_service "Grafana" "http://localhost:3001/api/health"
check_service "AlertManager" "http://localhost:9093/-/healthy"
check_service "Loki" "http://localhost:3100/ready"

# Configure Grafana API key for automation (optional)
echo "🔑 Setting up Grafana API..."
GRAFANA_API_KEY=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"name":"monitoring-init","role":"Admin"}' \
    http://admin:admin123@localhost:3001/api/auth/keys 2>/dev/null | jq -r '.key' || echo "")

if [ -n "$GRAFANA_API_KEY" ]; then
    echo "✅ Grafana API key created"
    echo "export GRAFANA_API_KEY=$GRAFANA_API_KEY" > "$MONITORING_DIR/.env.monitoring"
else
    echo "⚠️  Could not create Grafana API key (may already exist)"
fi

# Import dashboards
echo "📊 Importing dashboards..."
for dashboard in "$MONITORING_DIR/grafana/dashboards"/*.json; do
    if [ -f "$dashboard" ]; then
        dashboard_name=$(basename "$dashboard" .json)
        echo "  📈 Importing $dashboard_name..."
        
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $GRAFANA_API_KEY" \
            -d @"$dashboard" \
            http://localhost:3001/api/dashboards/db || echo "  ⚠️  Dashboard may already exist"
    fi
done

# Create notification channels (example for Slack)
echo "📢 Setting up notification channels..."
if [ -n "${SLACK_WEBHOOK_URL}" ]; then
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $GRAFANA_API_KEY" \
        -d '{
            "name": "Slack Alerts",
            "type": "slack",
            "settings": {
                "url": "'${SLACK_WEBHOOK_URL}'",
                "recipient": "#alerts",
                "uploadImage": true
            }
        }' \
        http://localhost:3001/api/alert-notifications
fi

# Display access information
echo ""
echo "✅ Monitoring stack initialized successfully!"
echo ""
echo "📊 Access URLs:"
echo "  - Grafana:      http://localhost:3001 (admin/admin123)"
echo "  - Prometheus:   http://localhost:9090"
echo "  - AlertManager: http://localhost:9093"
echo "  - Jaeger:       http://localhost:16686"
echo ""
echo "📈 Available Dashboards:"
echo "  - System Overview"
echo "  - Business KPIs"
echo "  - Database Monitoring"
echo ""
echo "🔧 Useful Commands:"
echo "  - View logs:    docker-compose -f monitoring/docker-compose.monitoring.yml logs -f"
echo "  - Stop stack:   docker-compose -f monitoring/docker-compose.monitoring.yml down"
echo "  - Clean data:   docker-compose -f monitoring/docker-compose.monitoring.yml down -v"
echo ""

# Test metric endpoint
echo "🧪 Testing application metrics endpoint..."
if curl -s http://localhost:3000/api/metrics | grep -q "warehouse_"; then
    echo "✅ Application metrics are being exposed"
else
    echo "⚠️  Application metrics endpoint not responding (ensure main app is running)"
fi

echo ""
echo "🎉 Monitoring stack is ready to use!"