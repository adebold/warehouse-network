#!/bin/bash

# PostgreSQL backup script for Docker container
# This script creates daily backups and maintains retention policy

set -e

BACKUP_DIR="/backups"
BACKUP_NAME="warehouse_backup_$(date +%Y%m%d_%H%M%S).sql"
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p $BACKUP_DIR

echo "Starting backup at $(date)"

# Create backup
pg_dump -h postgres -U $PGUSER -d $PGDATABASE > "$BACKUP_DIR/$BACKUP_NAME"

# Compress backup
gzip "$BACKUP_DIR/$BACKUP_NAME"

echo "Backup completed: ${BACKUP_NAME}.gz"

# Clean up old backups
find $BACKUP_DIR -name "warehouse_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup retention cleanup completed"
echo "Available backups:"
ls -la $BACKUP_DIR/

# Optional: Upload to cloud storage (uncomment and configure as needed)
# aws s3 cp "$BACKUP_DIR/${BACKUP_NAME}.gz" s3://your-backup-bucket/
# gsutil cp "$BACKUP_DIR/${BACKUP_NAME}.gz" gs://your-backup-bucket/