# GCP Native Analytics & Monitoring Setup

## Current State
- Google Analytics configured with placeholder ID: `G-WAREHOUSE2024`
- GA not working in production (invalid measurement ID)
- GCP native monitoring services are already enabled

## Available GCP Analytics Services

### 1. Cloud Monitoring (Enabled ✓)
```bash
# View application metrics
gcloud monitoring dashboards list
gcloud monitoring metrics list --filter="resource.type=cloud_run_revision"
```

### 2. Cloud Logging (Enabled ✓)
```bash
# View application logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=warehouse-platform-v2" --limit=50

# Create log-based metrics
gcloud logging metrics create user_registrations \
  --description="Count of user registrations" \
  --log-filter='jsonPayload.event="user_registration"'
```

### 3. Cloud Trace (Enabled ✓)
```bash
# View performance traces
gcloud trace list --filter="cloud_run"
```

### 4. Google Analytics API (Enabled ✓)
For web analytics, you need a real GA4 property.

## Recommended Approach

### Option 1: Use GCP Operations Suite (Recommended)
Add OpenTelemetry to your Next.js app:

```typescript
// lib/monitoring.ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';

const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new BatchSpanProcessor(new TraceExporter())
);
provider.register();
```

### Option 2: Fix Google Analytics
1. Create a real GA4 property at https://analytics.google.com
2. Get the measurement ID (format: G-XXXXXXXXXX)
3. Update the Cloud Run service:
```bash
gcloud run services update warehouse-platform-v2 \
  --update-env-vars NEXT_PUBLIC_GA_MEASUREMENT_ID=G-REAL_ID_HERE \
  --region=us-central1
```

### Option 3: Use GCP Analytics Hub
For data warehouse analytics:
```bash
# Create Analytics Hub data exchange
gcloud analytics-hub data-exchanges create warehouse-metrics \
  --location=us-central1 \
  --description="Warehouse platform metrics"
```

## Quick Implementation for Cloud Monitoring

### 1. Add Custom Metrics
```typescript
// pages/api/metrics.ts
import { MetricServiceClient } from '@google-cloud/monitoring';

const client = new MetricServiceClient();

export async function recordMetric(name: string, value: number) {
  const projectId = process.env.PROJECT_ID;
  const request = {
    name: client.projectPath(projectId),
    timeSeries: [{
      metric: {
        type: `custom.googleapis.com/warehouse/${name}`,
      },
      points: [{
        value: { int64Value: value },
        interval: {
          endTime: {
            seconds: Date.now() / 1000,
          },
        },
      }],
    }],
  };
  await client.createTimeSeries(request);
}
```

### 2. Track User Events
```typescript
// Track registration
await recordMetric('user_registrations', 1);

// Track searches
await recordMetric('warehouse_searches', 1);
```

### 3. Create Dashboard
```bash
# Create monitoring dashboard
gcloud monitoring dashboards create --config-from-file=monitoring-dashboard.yaml
```

## Environment Variables to Add

```yaml
# For Cloud Run
GOOGLE_CLOUD_PROJECT: aindustries-warehouse
GOOGLE_APPLICATION_CREDENTIALS: (automatically set by Cloud Run)
ENABLE_CLOUD_TRACE: true
ENABLE_CLOUD_MONITORING: true
```

## Next Steps

1. **Immediate**: Fix GA by using a real measurement ID or disable it
2. **Better**: Implement Cloud Monitoring for server-side metrics
3. **Best**: Use OpenTelemetry for full observability (traces, metrics, logs)

## Useful Commands

```bash
# View current metrics
gcloud monitoring metrics list --filter="metric.type=cloud_run"

# View service logs
gcloud logging read "resource.labels.service_name=warehouse-platform-v2" --limit=10

# Check service health
gcloud run services describe warehouse-platform-v2 --region=us-central1 --format="value(status.conditions[0].message)"
```