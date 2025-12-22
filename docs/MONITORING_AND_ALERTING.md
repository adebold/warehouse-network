# 📊 Monitoring and Alerting Configuration

## Overview
This guide sets up comprehensive monitoring for the warehouse platform to ensure 100% operational excellence.

## 1. Enable Required APIs

```bash
gcloud services enable \
  monitoring.googleapis.com \
  logging.googleapis.com \
  cloudtrace.googleapis.com \
  clouderrorreporting.googleapis.com \
  --project=aindustries-warehouse
```

## 2. Uptime Monitoring

### Create Health Check Monitor
```bash
# Basic health check
gcloud monitoring uptime-check-configs create warehouse-health \
  --display-name="Warehouse Platform Health Check" \
  --monitored-resource="{
    'type': 'uptime_url',
    'labels': {
      'host': 'warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app',
      'project_id': 'aindustries-warehouse'
    }
  }" \
  --http-check="{
    'path': '/api/health',
    'port': 443,
    'request_method': 'GET',
    'use_ssl': true,
    'validate_ssl': true
  }" \
  --period=60 \
  --timeout=10s
```

### Create Homepage Monitor
```bash
gcloud monitoring uptime-check-configs create warehouse-homepage \
  --display-name="Warehouse Homepage Monitor" \
  --monitored-resource="{
    'type': 'uptime_url',
    'labels': {
      'host': 'warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app',
      'project_id': 'aindustries-warehouse'
    }
  }" \
  --http-check="{
    'path': '/',
    'port': 443,
    'use_ssl': true,
    'validate_ssl': true
  }" \
  --period=300 \
  --timeout=10s \
  --content-matchers="{
    'content': 'Warehouse Network'
  }"
```

## 3. Alert Policies

### High Error Rate Alert
```bash
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="High Error Rate - Warehouse Platform" \
  --condition="{
    'display_name': '5xx Error Rate > 1%',
    'condition_threshold': {
      'filter': 'resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"warehouse-platform-v2\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"',
      'comparison': 'COMPARISON_GT',
      'threshold_value': 0.01,
      'duration': '60s',
      'aggregations': [{
        'alignment_period': '60s',
        'per_series_aligner': 'ALIGN_RATE'
      }]
    }
  }"
```

### High CPU Usage Alert
```bash
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="High CPU Usage - Warehouse Platform" \
  --condition="{
    'display_name': 'CPU Utilization > 80%',
    'condition_threshold': {
      'filter': 'resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"warehouse-platform-v2\" AND metric.type=\"run.googleapis.com/container/cpu/utilizations\"',
      'comparison': 'COMPARISON_GT',
      'threshold_value': 0.8,
      'duration': '300s',
      'aggregations': [{
        'alignment_period': '60s',
        'per_series_aligner': 'ALIGN_MEAN'
      }]
    }
  }"
```

### Database Connection Failure Alert
```bash
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="Database Connection Failed" \
  --condition="{
    'display_name': 'Database Disconnected',
    'condition_threshold': {
      'filter': 'resource.type=\"cloud_run_revision\" AND jsonPayload.database=\"disconnected\"',
      'comparison': 'COMPARISON_GT',
      'threshold_value': 0,
      'duration': '60s'
    }
  }"
```

### Memory Usage Alert
```bash
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="High Memory Usage - Warehouse Platform" \
  --condition="{
    'display_name': 'Memory Usage > 90%',
    'condition_threshold': {
      'filter': 'resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"warehouse-platform-v2\" AND metric.type=\"run.googleapis.com/container/memory/utilizations\"',
      'comparison': 'COMPARISON_GT',
      'threshold_value': 0.9,
      'duration': '300s'
    }
  }"
```

## 4. Create Notification Channels

### Email Notification
```bash
gcloud alpha monitoring channels create \
  --display-name="CTO Email Alerts" \
  --type=email \
  --channel-labels=email_address=cto@aindustries.co
```

### SMS Notification (Optional)
```bash
gcloud alpha monitoring channels create \
  --display-name="Critical SMS Alerts" \
  --type=sms \
  --channel-labels=number=+1234567890
```

### Slack Notification (Optional)
```bash
gcloud alpha monitoring channels create \
  --display-name="Engineering Slack" \
  --type=slack \
  --channel-labels=url=YOUR_SLACK_WEBHOOK_URL
```

## 5. Custom Dashboard

Create a monitoring dashboard JSON:

```json
{
  "displayName": "Warehouse Platform Dashboard",
  "dashboardFilters": [],
  "gridLayout": {
    "widgets": [
      {
        "title": "Request Rate",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"warehouse-platform-v2\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_RATE"
                }
              }
            }
          }]
        }
      },
      {
        "title": "Response Time (95th percentile)",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"warehouse-platform-v2\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_PERCENTILE_95"
                }
              }
            }
          }]
        }
      },
      {
        "title": "Error Rate",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"warehouse-platform-v2\" metric.label.\"response_code_class\"=\"5xx\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_RATE"
                }
              }
            }
          }]
        }
      },
      {
        "title": "Active Instances",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"run.googleapis.com/container/instance_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"warehouse-platform-v2\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_MEAN"
                }
              }
            }
          }]
        }
      }
    ]
  }
}
```

Apply the dashboard:
```bash
# Save the JSON to dashboard.json
gcloud monitoring dashboards create --config-from-file=dashboard.json
```

## 6. Log-Based Metrics

### Create Error Log Metric
```bash
gcloud logging metrics create warehouse_errors \
  --description="Count of error logs from warehouse platform" \
  --log-filter='resource.labels.service_name="warehouse-platform-v2"
    severity>=ERROR'
```

### Create Slow Query Metric
```bash
gcloud logging metrics create slow_queries \
  --description="Database queries taking over 1 second" \
  --log-filter='resource.labels.service_name="warehouse-platform-v2"
    jsonPayload.query_time>1000'
```

## 7. SLO Configuration

### Define SLO for Availability
```yaml
displayName: "Warehouse Platform Availability"
serviceLevelIndicator:
  windowsBased:
    windowPeriod: 86400s  # 1 day
    goodTotalRatioThreshold:
      totalServiceFilter: 'metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
        resource.labels.service_name="warehouse-platform-v2"'
      goodServiceFilter: 'metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
        resource.labels.service_name="warehouse-platform-v2"
        metric.labels.response_code_class!="5xx"'
      threshold: 0.999  # 99.9% availability
```

### Define SLO for Latency
```yaml
displayName: "Warehouse Platform Latency"
serviceLevelIndicator:
  windowsBased:
    windowPeriod: 86400s
    goodTotalRatioThreshold:
      totalServiceFilter: 'metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
        resource.labels.service_name="warehouse-platform-v2"'
      goodServiceFilter: 'metric.type="run.googleapis.com/request_latencies"
        resource.type="cloud_run_revision"
        resource.labels.service_name="warehouse-platform-v2"
        metric.value_distribution<500'  # Under 500ms
      threshold: 0.95  # 95% of requests under 500ms
```

## 8. Application Performance Monitoring

Add to your application code:

```javascript
// lib/monitoring.ts
import { CloudTrace } from '@google-cloud/trace-agent';
import { ErrorReporting } from '@google-cloud/error-reporting';

// Initialize tracing
const trace = CloudTrace.start();

// Initialize error reporting
const errors = new ErrorReporting();

// Custom metrics
export function recordMetric(name: string, value: number, labels = {}) {
  console.log(JSON.stringify({
    metric: name,
    value,
    labels,
    timestamp: new Date().toISOString()
  }));
}

// Usage in your app
recordMetric('user_registration', 1, { plan: 'premium' });
recordMetric('api_call_duration', responseTime, { endpoint: '/api/quotes' });
```

## 9. Runbook for Alerts

### High Error Rate Response
1. Check Cloud Run logs: `gcloud run logs read warehouse-platform-v2 --limit=50`
2. Check error patterns in logs
3. Verify database connectivity
4. Check recent deployments
5. Rollback if needed: `gcloud run services update-traffic warehouse-platform-v2 --to-revisions=PREVIOUS_REVISION=100`

### High CPU Usage Response
1. Check current traffic: View dashboard
2. Check for infinite loops or heavy computations
3. Scale up if needed: `gcloud run services update warehouse-platform-v2 --max-instances=20`
4. Investigate code optimization opportunities

### Database Connection Failure Response
1. Check Cloud SQL status: `gcloud sql instances describe warehouse-production-db`
2. Verify Cloud SQL Auth Proxy is running
3. Check DATABASE_URL secret
4. Restart Cloud SQL if needed

## 10. Monthly Review Checklist

- [ ] Review error rates and trends
- [ ] Check SLO compliance
- [ ] Analyze slow queries
- [ ] Review resource usage and costs
- [ ] Update alert thresholds if needed
- [ ] Archive old logs
- [ ] Review and update runbooks

## Success Metrics

- **Availability**: > 99.9%
- **Error Rate**: < 1%
- **Response Time**: p95 < 500ms
- **Alert Response**: < 5 minutes
- **MTTR**: < 30 minutes

## Cost Estimate

- Monitoring: ~$10/month
- Logging: ~$5/month (depends on volume)
- Uptime checks: ~$1/month
- **Total**: ~$16/month

This comprehensive monitoring ensures you're immediately notified of any issues and have the data needed to maintain 100% operational excellence.