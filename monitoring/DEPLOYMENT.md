# Monitoring Stack Deployment Guide

## Quick Start

### 1. Prerequisites

Ensure you have the following installed:
- Docker & Docker Compose
- curl
- jq (for JSON processing)

### 2. Deploy the Stack

```bash
# Navigate to the monitoring directory
cd /Users/adebold/Documents/GitHub/warehouse-network/monitoring

# Start the monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# Or use the initialization script
./scripts/init-monitoring.sh
```

### 3. Verify Deployment

Check that all services are running:
```bash
docker-compose -f docker-compose.monitoring.yml ps
```

Expected output should show all services as "Up" or "healthy".

### 4. Access the Services

- **Grafana**: http://localhost:3001
  - Username: `admin`
  - Password: `admin123`
  
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093
- **Jaeger**: http://localhost:16686

### 5. Configure Application Metrics

Ensure your main application is exposing metrics at `/api/metrics`:

```bash
# Test the metrics endpoint
curl http://localhost:3000/api/metrics
```

You should see Prometheus-format metrics including warehouse-specific metrics.

## Environment Variables

Set these environment variables for full functionality:

```bash
# Grafana Configuration
export GRAFANA_ADMIN_USER=admin
export GRAFANA_ADMIN_PASSWORD=admin123

# Email/SMS Alerts
export SMTP_HOST=your-smtp-server.com
export SMTP_USERNAME=your-username
export SMTP_PASSWORD=your-password

# Slack Integration
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
export SLACK_DATABASE_WEBHOOK=https://hooks.slack.com/services/...
export SLACK_BUSINESS_WEBHOOK=https://hooks.slack.com/services/...
export SLACK_OPERATIONS_WEBHOOK=https://hooks.slack.com/services/...
export SLACK_PLATFORM_WEBHOOK=https://hooks.slack.com/services/...

# PagerDuty Integration
export PAGERDUTY_SERVICE_KEY=your-pagerduty-key

# Email Notifications
export CRITICAL_EMAIL=critical@warehouse-network.com
export DATABASE_TEAM_EMAIL=database@warehouse-network.com
export BUSINESS_TEAM_EMAIL=business@warehouse-network.com
export OPERATIONS_TEAM_EMAIL=operations@warehouse-network.com
```

## Production Considerations

### Security

1. **Change Default Passwords**:
   ```bash
   # Update in docker-compose.monitoring.yml
   GF_SECURITY_ADMIN_PASSWORD: your-secure-password
   ```

2. **Enable HTTPS**:
   - Configure reverse proxy (nginx/traefik)
   - Use SSL certificates
   - Enable secure cookies

3. **Network Security**:
   - Restrict access to monitoring ports
   - Use VPN or bastion host
   - Implement IP whitelisting

### High Availability

1. **Prometheus HA**:
   - Deploy multiple Prometheus instances
   - Use Thanos for long-term storage
   - Implement federation

2. **Grafana HA**:
   - Use external database (PostgreSQL)
   - Deploy multiple Grafana instances
   - Use shared storage for dashboards

### Scaling

1. **Storage**:
   - Monitor disk usage
   - Implement retention policies
   - Use object storage for long-term

2. **Performance**:
   - Tune scrape intervals
   - Use recording rules
   - Implement metric filtering

## Troubleshooting

### Common Issues

1. **Prometheus Not Scraping**:
   ```bash
   # Check targets
   curl http://localhost:9090/api/v1/targets
   
   # Check configuration
   docker exec warehouse-prometheus promtool check config /etc/prometheus/prometheus.yml
   ```

2. **Grafana Can't Connect to Prometheus**:
   ```bash
   # Test connectivity
   docker exec warehouse-grafana curl http://prometheus:9090/api/v1/query?query=up
   ```

3. **No Application Metrics**:
   ```bash
   # Verify metrics endpoint
   curl http://localhost:3000/api/metrics
   
   # Check application logs
   docker logs warehouse-app
   ```

### Log Collection

View logs for troubleshooting:
```bash
# All services
docker-compose -f docker-compose.monitoring.yml logs -f

# Specific service
docker-compose -f docker-compose.monitoring.yml logs -f prometheus
```

## Maintenance

### Regular Tasks

1. **Daily**:
   - Check for alerts
   - Review dashboard anomalies
   - Verify backup status

2. **Weekly**:
   - Review performance metrics
   - Update alert thresholds
   - Clean up old data

3. **Monthly**:
   - Update monitoring stack
   - Review retention policies
   - Test disaster recovery

### Backup

```bash
# Backup Prometheus data
docker run --rm -v monitoring_prometheus-data:/data \
  -v $(pwd)/backups:/backup alpine \
  tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /data

# Backup Grafana
docker run --rm -v monitoring_grafana-data:/data \
  -v $(pwd)/backups:/backup alpine \
  tar czf /backup/grafana-$(date +%Y%m%d).tar.gz /data
```

### Updates

```bash
# Update to latest versions
docker-compose -f docker-compose.monitoring.yml pull
docker-compose -f docker-compose.monitoring.yml up -d
```

## Support

For issues or questions:
1. Check logs: `docker-compose logs [service]`
2. Review documentation: `monitoring/README.md`
3. Test connectivity: Use provided troubleshooting commands
4. Contact the platform team

## Useful Commands

```bash
# Start monitoring stack
docker-compose -f monitoring/docker-compose.monitoring.yml up -d

# Stop monitoring stack
docker-compose -f monitoring/docker-compose.monitoring.yml down

# Update services
docker-compose -f monitoring/docker-compose.monitoring.yml pull
docker-compose -f monitoring/docker-compose.monitoring.yml up -d

# View logs
docker-compose -f monitoring/docker-compose.monitoring.yml logs -f [service]

# Clean everything (CAUTION: Deletes all data)
docker-compose -f monitoring/docker-compose.monitoring.yml down -v

# Test metrics endpoint
curl http://localhost:3000/api/metrics | head -20

# Query Prometheus
curl 'http://localhost:9090/api/v1/query?query=up'

# Check Grafana health
curl http://localhost:3001/api/health
```