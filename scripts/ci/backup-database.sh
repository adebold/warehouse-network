#!/bin/bash

# Database backup script for CI/CD deployments
set -euo pipefail

ENVIRONMENT=${1:-staging}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="warehouse_${ENVIRONMENT}_${TIMESTAMP}"

# Validate required environment variables
if [ -z "${DATABASE_URL:-}" ]; then
    echo "Error: DATABASE_URL environment variable is required"
    exit 1
fi

if [ -z "${BACKUP_STORAGE_URL:-}" ]; then
    echo "Error: BACKUP_STORAGE_URL environment variable is required"
    exit 1
fi

# Parse database URL
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*\/\/.*@\(.*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*\/\/\(.*\)@.*/\1/p' | cut -d':' -f1)
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*\/\/.*:\(.*\)@.*/\1/p')

echo "Creating database backup for environment: $ENVIRONMENT"
echo "Database: $DB_NAME"
echo "Timestamp: $TIMESTAMP"

# Create backup directory
BACKUP_DIR="/tmp/db-backups"
mkdir -p $BACKUP_DIR

# Set PostgreSQL password
export PGPASSWORD="$DB_PASS"

# Create database dump
echo "Creating database dump..."
pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --verbose \
    --clean \
    --no-owner \
    --no-privileges \
    --format=custom \
    --file="$BACKUP_DIR/${BACKUP_NAME}.dump"

# Compress backup
echo "Compressing backup..."
gzip "$BACKUP_DIR/${BACKUP_NAME}.dump"

# Calculate checksum
CHECKSUM=$(sha256sum "$BACKUP_DIR/${BACKUP_NAME}.dump.gz" | cut -d' ' -f1)
echo "Backup checksum: $CHECKSUM"

# Create metadata file
cat > "$BACKUP_DIR/${BACKUP_NAME}.meta" <<EOF
{
  "environment": "$ENVIRONMENT",
  "timestamp": "$TIMESTAMP",
  "database": "$DB_NAME",
  "checksum": "$CHECKSUM",
  "size": $(stat -f%z "$BACKUP_DIR/${BACKUP_NAME}.dump.gz" 2>/dev/null || stat -c%s "$BACKUP_DIR/${BACKUP_NAME}.dump.gz"),
  "created_by": "ci_pipeline",
  "git_commit": "${GITHUB_SHA:-unknown}"
}
EOF

# Upload to backup storage
echo "Uploading backup to storage..."
case "$BACKUP_STORAGE_URL" in
    gs://*)
        # Google Cloud Storage
        gsutil cp "$BACKUP_DIR/${BACKUP_NAME}.dump.gz" "$BACKUP_STORAGE_URL/"
        gsutil cp "$BACKUP_DIR/${BACKUP_NAME}.meta" "$BACKUP_STORAGE_URL/"
        ;;
    s3://*)
        # AWS S3
        aws s3 cp "$BACKUP_DIR/${BACKUP_NAME}.dump.gz" "$BACKUP_STORAGE_URL/"
        aws s3 cp "$BACKUP_DIR/${BACKUP_NAME}.meta" "$BACKUP_STORAGE_URL/"
        ;;
    *)
        echo "Error: Unsupported backup storage URL: $BACKUP_STORAGE_URL"
        exit 1
        ;;
esac

# Clean up local files
rm -rf "$BACKUP_DIR"

# Verify backup exists in storage
echo "Verifying backup upload..."
case "$BACKUP_STORAGE_URL" in
    gs://*)
        gsutil ls "$BACKUP_STORAGE_URL/${BACKUP_NAME}.dump.gz" > /dev/null
        ;;
    s3://*)
        aws s3 ls "$BACKUP_STORAGE_URL/${BACKUP_NAME}.dump.gz" > /dev/null
        ;;
esac

echo "✅ Database backup completed successfully"
echo "Backup location: $BACKUP_STORAGE_URL/${BACKUP_NAME}.dump.gz"
echo "Metadata: $BACKUP_STORAGE_URL/${BACKUP_NAME}.meta"
echo "Checksum: $CHECKSUM"

# Set output for GitHub Actions
if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "backup-name=${BACKUP_NAME}" >> $GITHUB_OUTPUT
    echo "backup-checksum=${CHECKSUM}" >> $GITHUB_OUTPUT
    echo "backup-location=${BACKUP_STORAGE_URL}/${BACKUP_NAME}.dump.gz" >> $GITHUB_OUTPUT
fi