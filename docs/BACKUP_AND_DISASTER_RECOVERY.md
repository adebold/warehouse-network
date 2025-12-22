# 🛡️ Backup and Disaster Recovery Plan

## Overview
This plan ensures business continuity with automated backups, quick recovery procedures, and minimal data loss for the warehouse platform.

## Recovery Objectives
- **RTO (Recovery Time Objective)**: 15 minutes
- **RPO (Recovery Point Objective)**: 24 hours
- **Uptime Target**: 99.9%

## 1. Database Backup Configuration

### Enable Automated Backups
```bash
# Configure Cloud SQL automated backups
gcloud sql instances patch warehouse-production-db \
  --backup-start-time=02:00 \
  --backup-location=us-central1 \
  --enable-point-in-time-recovery \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7 \
  --project=aindustries-warehouse
```

### Create On-Demand Backup
```bash
# Manual backup before major changes
gcloud sql backups create \
  --instance=warehouse-production-db \
  --description="Pre-deployment backup $(date +%Y-%m-%d)" \
  --project=aindustries-warehouse
```

### List Backups
```bash
gcloud sql backups list \
  --instance=warehouse-production-db \
  --project=aindustries-warehouse
```

## 2. Application Code Backup

### Automated Git Backup
```yaml
# .github/workflows/backup.yml
name: Code Backup
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Mirror to backup repository
        env:
          BACKUP_REPO: ${{ secrets.BACKUP_REPO_URL }}
        run: |
          git remote add backup $BACKUP_REPO
          git push backup --all --force
          git push backup --tags --force
```

## 3. Secrets and Configuration Backup

### Export Secrets
```bash
#!/bin/bash
# scripts/backup-secrets.sh

PROJECT_ID="aindustries-warehouse"
BACKUP_BUCKET="gs://warehouse-platform-backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup bucket if it doesn't exist
gsutil mb -p $PROJECT_ID -c STANDARD -l us-central1 $BACKUP_BUCKET 2>/dev/null

# Backup secrets
echo "Backing up secrets..."
for SECRET in $(gcloud secrets list --project=$PROJECT_ID --format="value(name)"); do
  gcloud secrets versions access latest --secret=$SECRET --project=$PROJECT_ID > /tmp/$SECRET.txt
  gsutil cp /tmp/$SECRET.txt $BACKUP_BUCKET/secrets/$DATE/$SECRET.txt
  rm /tmp/$SECRET.txt
done

# Backup service accounts
echo "Backing up service accounts..."
gcloud iam service-accounts list --project=$PROJECT_ID --format=json | \
  gsutil cp - $BACKUP_BUCKET/iam/$DATE/service-accounts.json

echo "✅ Backup completed: $BACKUP_BUCKET/$DATE"
```

## 4. Container Image Backup

### Enable Vulnerability Scanning
```bash
gcloud container images scan \
  us-central1-docker.pkg.dev/aindustries-warehouse/warehouse-docker/warehouse-platform-v2:latest
```

### Tag Production Images
```bash
# Tag stable releases
docker tag $REGISTRY/$IMAGE:$SHA $REGISTRY/$IMAGE:stable-$(date +%Y%m%d)
docker push $REGISTRY/$IMAGE:stable-$(date +%Y%m%d)
```

## 5. Disaster Recovery Procedures

### Scenario 1: Database Corruption/Loss

**Detection**: Health check shows database disconnected
**Recovery Steps**:
```bash
# 1. List available backups
gcloud sql backups list --instance=warehouse-production-db

# 2. Create new instance from backup
gcloud sql instances create warehouse-recovery-db \
  --backup-id=BACKUP_ID \
  --backup-instance=warehouse-production-db \
  --tier=db-f1-micro \
  --region=us-central1

# 3. Update DATABASE_URL secret
CONNECTION_NAME=$(gcloud sql instances describe warehouse-recovery-db --format="value(connectionName)")
NEW_URL="postgresql://warehouse:password@localhost:5432/warehouse_network?host=/cloudsql/$CONNECTION_NAME"
echo -n "$NEW_URL" | gcloud secrets versions add DATABASE_URL --data-file=-

# 4. Restart Cloud Run service
gcloud run services update warehouse-platform-v2 --region=us-central1

# 5. Verify recovery
curl https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app/api/health
```

### Scenario 2: Application Failure

**Detection**: 5xx errors, service unavailable
**Recovery Steps**:
```bash
# 1. Check recent revisions
gcloud run revisions list --service=warehouse-platform-v2 --region=us-central1

# 2. Rollback to previous version
gcloud run services update-traffic warehouse-platform-v2 \
  --to-revisions=PREVIOUS_REVISION_NAME=100 \
  --region=us-central1

# 3. Investigate failure
gcloud run logs read warehouse-platform-v2 --region=us-central1 --limit=100
```

### Scenario 3: Region Outage

**Detection**: Complete service unavailability
**Recovery Steps**:
```bash
# 1. Deploy to backup region (us-east1)
gcloud run deploy warehouse-platform-v2-dr \
  --image=$LATEST_IMAGE \
  --region=us-east1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest"

# 2. Update DNS (if using custom domain)
# Point domain to new Cloud Run URL

# 3. Notify users of temporary URL
echo "Service available at: $(gcloud run services describe warehouse-platform-v2-dr --region=us-east1 --format='value(status.url)')"
```

### Scenario 4: Complete Project Loss

**Detection**: Google Cloud project inaccessible
**Recovery Steps**:
```bash
# 1. Create new project
gcloud projects create warehouse-platform-recovery --name="Warehouse Recovery"

# 2. Enable billing
gcloud billing projects link warehouse-platform-recovery --billing-account=BILLING_ACCOUNT_ID

# 3. Restore from backups
./scripts/restore-from-backup.sh warehouse-platform-recovery

# 4. Update GitHub Actions secrets
gh secret set GOOGLE_CLOUD_PROJECT -b "warehouse-platform-recovery"

# 5. Redeploy
git push origin main
```

## 6. Automated Recovery Testing

### Monthly Disaster Recovery Drill
```yaml
# .github/workflows/dr-test.yml
name: DR Test
on:
  schedule:
    - cron: '0 9 1 * *'  # First day of month at 9 AM
  workflow_dispatch:

jobs:
  dr-test:
    runs-on: ubuntu-latest
    steps:
      - name: Create test database from backup
        run: |
          gcloud sql instances create dr-test-db \
            --backup-id=$(gcloud sql backups list --instance=warehouse-production-db --limit=1 --format="value(id)") \
            --backup-instance=warehouse-production-db \
            --tier=db-f1-micro \
            --region=us-central1
      
      - name: Test connectivity
        run: |
          # Test database connection
          gcloud sql connect dr-test-db --user=warehouse
      
      - name: Cleanup
        if: always()
        run: |
          gcloud sql instances delete dr-test-db --quiet
```

## 7. Data Retention Policy

| Data Type | Retention Period | Backup Frequency |
|-----------|-----------------|------------------|
| Database | 30 days | Daily |
| Logs | 90 days | Continuous |
| Container Images | 90 days | Per deployment |
| Secrets | 365 days | Weekly |
| Monitoring Data | 180 days | Continuous |

## 8. Recovery Validation Checklist

After any recovery operation:
- [ ] Health check passes
- [ ] Database connectivity verified
- [ ] User authentication working
- [ ] Critical business functions tested
- [ ] Performance metrics normal
- [ ] No data corruption detected
- [ ] Monitoring alerts cleared

## 9. Communication Plan

### During Incident
1. Update status page
2. Notify key stakeholders via email
3. Post updates every 30 minutes

### Template
```
Subject: [INCIDENT] Warehouse Platform Service Disruption

Status: Investigating | Recovering | Resolved
Impact: [Description of impact]
Start Time: [Timestamp]
Current Action: [What's being done]
ETA: [Estimated resolution time]
Next Update: [Time of next update]
```

## 10. Post-Incident Review

After each incident:
1. Document timeline of events
2. Identify root cause
3. Calculate actual RTO/RPO
4. Update runbooks
5. Implement preventive measures

## Cost Breakdown

- Database backups: ~$5/month
- Storage (backups): ~$10/month
- DR testing: ~$2/month
- **Total**: ~$17/month

## Key Contacts

- **On-Call Engineer**: Via PagerDuty
- **Google Cloud Support**: 1-877-355-5787
- **Database Admin**: dba@aindustries.co
- **CTO**: cto@aindustries.co

---

This plan ensures rapid recovery from any disaster while maintaining data integrity and minimizing business impact.