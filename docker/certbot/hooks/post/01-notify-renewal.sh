#!/bin/bash
# Notify about successful certificate renewal

DOMAIN=$RENEWED_DOMAINS
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Log renewal
echo "[$TIMESTAMP] Certificate renewed for domain: $DOMAIN" >> /var/log/letsencrypt/renewal.log

# Send notification (configure your notification service)
# Example: Send to monitoring system
if [ ! -z "$MONITORING_WEBHOOK_URL" ]; then
    curl -X POST "$MONITORING_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d '{
            "event": "certificate_renewed",
            "domain": "'$DOMAIN'",
            "timestamp": "'$TIMESTAMP'",
            "status": "success"
        }'
fi

# Update certificate monitoring metrics
echo "certificate_renewal_timestamp{domain=\"$DOMAIN\"} $(date +%s)" > /var/lib/prometheus/textfile_collector/ssl_renewal.prom