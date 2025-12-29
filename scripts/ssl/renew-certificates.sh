#!/bin/bash
# Renew Let's Encrypt certificates for Warehouse Network

set -e

# Configuration
COMPOSE_FILE=${COMPOSE_FILE:-"docker-compose.yml"}
LOG_FILE="/var/log/letsencrypt/renewal.log"
MONITORING_WEBHOOK_URL=${MONITORING_WEBHOOK_URL:-""}

# Ensure log directory exists
mkdir -p $(dirname "$LOG_FILE")

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to send monitoring notification
notify_monitoring() {
    local status=$1
    local message=$2
    
    if [ ! -z "$MONITORING_WEBHOOK_URL" ]; then
        curl -s -X POST "$MONITORING_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"event\": \"certificate_renewal\",
                \"status\": \"$status\",
                \"message\": \"$message\",
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
            }" || true
    fi
}

log "Starting certificate renewal check..."

# Check if Docker Compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    log "ERROR: Docker Compose file not found: $COMPOSE_FILE"
    notify_monitoring "error" "Docker Compose file not found"
    exit 1
fi

# Run certificate renewal
if docker-compose -f "$COMPOSE_FILE" run --rm certbot renew --quiet --no-self-upgrade; then
    log "Certificate renewal check completed successfully"
    
    # Check if any certificates were actually renewed
    if docker-compose -f "$COMPOSE_FILE" run --rm certbot renew --dry-run 2>&1 | grep -q "Cert not yet due for renewal"; then
        log "No certificates were due for renewal"
    else
        log "Certificates were renewed, reloading Nginx..."
        
        # Reload Nginx
        if docker-compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload; then
            log "Nginx reloaded successfully"
            notify_monitoring "success" "Certificates renewed and Nginx reloaded"
        else
            log "ERROR: Failed to reload Nginx"
            notify_monitoring "error" "Certificates renewed but Nginx reload failed"
            exit 1
        fi
    fi
else
    log "ERROR: Certificate renewal failed"
    notify_monitoring "error" "Certificate renewal failed"
    exit 1
fi

# Update monitoring metrics
if [ -d "/var/lib/prometheus/textfile_collector" ]; then
    cat > /var/lib/prometheus/textfile_collector/ssl_renewal.prom << EOF
# HELP ssl_certificate_renewal_timestamp_seconds Timestamp of last certificate renewal check
# TYPE ssl_certificate_renewal_timestamp_seconds gauge
ssl_certificate_renewal_timestamp_seconds $(date +%s)

# HELP ssl_certificate_renewal_success Whether the last renewal check was successful
# TYPE ssl_certificate_renewal_success gauge
ssl_certificate_renewal_success 1
EOF
fi

log "Certificate renewal check completed"