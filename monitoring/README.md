# Warehouse Network Monitoring Stack

## Overview

This monitoring stack provides comprehensive observability for the Warehouse Network platform using industry-standard tools:

- **Prometheus**: Time-series metrics database
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **Jaeger**: Distributed tracing
- **AlertManager**: Alert management and routing
- **Various Exporters**: For collecting metrics from different services

## Quick Start

### Starting the Monitoring Stack

```bash
# Start the monitoring stack
docker-compose -f monitoring/docker-compose.monitoring.yml up -d

# Check status
docker-compose -f monitoring/docker-compose.monitoring.yml ps

# View logs
docker-compose -f monitoring/docker-compose.monitoring.yml logs -f
```

### Accessing Services

- **Grafana**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093
- **Jaeger**: http://localhost:16686
- **Loki**: http://localhost:3100

## Architecture

### Metrics Collection Flow

```
Application -> Prometheus Exporters -> Prometheus -> Grafana
     |                                      |
     +-> Custom Metrics (/api/metrics)      +-> AlertManager
```

### Log Collection Flow

```
Application Logs -> Promtail -> Loki -> Grafana
Container Logs  ->
System Logs     ->
```

### Trace Collection Flow

```
Application -> OpenTelemetry -> Jaeger -> Grafana
```

## Metrics

### System Metrics
- CPU usage
- Memory usage
- Disk I/O
- Network I/O
- Container metrics

### Application Metrics
- HTTP request rate
- Response time percentiles
- Error rates
- Active connections

### Business KPIs
- Total warehouses
- Active users
- Pending orders
- Revenue metrics
- Inventory turnover
- Storage utilization

### Database Metrics
- PostgreSQL connections
- Query performance
- Transaction rate
- Database size
- Redis operations
- Cache hit rate

## Dashboards

### Pre-configured Dashboards

1. **System Overview**
   - Overall system health
   - Resource utilization
   - Application performance
   - Error tracking

2. **Business KPIs**
   - Warehouse metrics
   - Order processing
   - Revenue tracking
   - User activity

3. **Database Monitoring**
   - PostgreSQL performance
   - Redis performance
   - Connection pools
   - Query analysis

4. **Container Monitoring**
   - Docker metrics
   - Resource limits
   - Container health

## Alerting

### Alert Categories

1. **Critical Alerts**
   - Service down
   - Database unreachable
   - High error rate
   - SSL certificate expiry

2. **Warning Alerts**
   - High resource usage
   - Slow queries
   - Cache misses
   - Low disk space

3. **Business Alerts**
   - Low warehouse availability
   - High pending orders
   - Low inventory turnover

### Alert Routing

Alerts are routed based on severity and team:
- Critical: PagerDuty, Email, Slack
- Database: Database team Slack channel
- Business: Business team email
- Platform: Platform team Slack channel

## Custom Metrics Implementation

### Adding Custom Metrics

1. Define metrics in `/apps/web/src/lib/metrics.ts`:
```typescript
export const myCustomMetric = new Counter({
  name: 'warehouse_custom_metric_total',
  help: 'Description of the metric',
  labelNames: ['label1', 'label2'],
});
```

2. Use the metric in your code:
```typescript
import { myCustomMetric } from '@/lib/metrics';

myCustomMetric.labels('value1', 'value2').inc();
```

### Metric Naming Convention

Follow Prometheus naming conventions:
- Use lowercase with underscores
- Start with application prefix: `warehouse_`
- End with unit suffix: `_total`, `_seconds`, `_bytes`
- Be descriptive but concise

## Troubleshooting

### Common Issues

1. **Prometheus not scraping metrics**
   - Check target status in Prometheus UI
   - Verify network connectivity
   - Check application logs

2. **Grafana dashboards showing "No Data"**
   - Verify Prometheus datasource
   - Check metric names
   - Ensure time range is correct

3. **Alerts not firing**
   - Check AlertManager configuration
   - Verify alert rules syntax
   - Check inhibition rules

### Debug Commands

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Test AlertManager
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{"labels":{"alertname":"test"}}]'

# Query metrics directly
curl http://localhost:3000/api/metrics

# Check Loki logs
curl "http://localhost:3100/loki/api/v1/query_range?query={job=\"warehouse-app\"}"
```

## Maintenance

### Regular Tasks

1. **Weekly**
   - Review dashboard usage
   - Check alert noise ratio
   - Update alert thresholds

2. **Monthly**
   - Review metric cardinality
   - Clean up unused metrics
   - Update documentation

3. **Quarterly**
   - Review retention policies
   - Optimize queries
   - Plan capacity

### Backup and Recovery

```bash
# Backup Prometheus data
docker run --rm -v prometheus-data:/data \
  -v $(pwd):/backup alpine \
  tar czf /backup/prometheus-backup.tar.gz /data

# Backup Grafana dashboards
curl -X GET http://admin:admin123@localhost:3001/api/dashboards/db/system-overview \
  > dashboards/system-overview-backup.json
```

## Performance Tuning

### Prometheus Optimization
- Adjust retention period based on needs
- Use recording rules for expensive queries
- Implement proper label cardinality

### Grafana Optimization
- Use variables to reduce queries
- Implement query caching
- Optimize dashboard refresh rates

### Loki Optimization
- Configure appropriate retention
- Use label selectors efficiently
- Implement log sampling for high volume

## Security

### Access Control
- Change default passwords
- Implement RBAC in Grafana
- Use TLS for external access
- Restrict Prometheus access

### Sensitive Data
- Avoid logging sensitive information
- Use label filters for PII
- Implement data retention policies
- Encrypt data at rest

## Integration Guide

### Adding New Services

1. Add exporter to docker-compose
2. Configure Prometheus scrape job
3. Create Grafana dashboard
4. Set up relevant alerts

### Example: Adding a New Microservice

```yaml
# In prometheus.yml
- job_name: 'my-new-service'
  static_configs:
    - targets: ['my-service:8080']
  metrics_path: /metrics
```

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Loki Documentation](https://grafana.com/docs/loki/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)

## Support

For issues or questions:
1. Check this documentation
2. Review service logs
3. Contact the platform team
4. Create an issue in the repository