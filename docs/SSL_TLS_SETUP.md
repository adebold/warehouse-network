# SSL/TLS Setup Guide for Warehouse Network

This guide provides comprehensive instructions for setting up SSL/TLS with Let's Encrypt for the Warehouse Network platform.

## Overview

The SSL/TLS configuration includes:
- **Let's Encrypt** certificates for production
- **Self-signed** certificates for development
- **Automatic renewal** with certbot
- **Security headers** and HSTS
- **Certificate monitoring** and alerts
- **OCSP stapling** for performance

## Prerequisites

- Domain name pointing to your server
- Port 80 and 443 open in firewall
- Docker and Docker Compose installed
- Email address for Let's Encrypt notifications

## Quick Start

### 1. Development Setup (Self-Signed)

For local development with self-signed certificates:

```bash
# Generate self-signed certificates
./scripts/ssl/generate-self-signed.sh

# Start services with SSL
docker-compose -f docker-compose.ssl.yml up -d

# Trust the certificate (macOS)
./docker/nginx/ssl/self-signed/trust-cert-macos.sh
```

### 2. Production Setup (Let's Encrypt)

For production with Let's Encrypt certificates:

```bash
# Set environment variables
export DOMAIN_NAME="your-domain.com"
export LETSENCRYPT_EMAIL="admin@your-domain.com"

# Initialize Let's Encrypt
./scripts/ssl/init-letsencrypt.sh

# Start services with SSL
docker-compose -f docker-compose.ssl.yml up -d
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Domain Configuration
DOMAIN_NAME=your-domain.com
LETSENCRYPT_EMAIL=admin@your-domain.com

# SSL Configuration
FORCE_SSL=true
SECURE_COOKIES=true
SESSION_COOKIE_SECURE=true

# Certificate Monitoring
SSL_WARNING_DAYS=30
SSL_CRITICAL_DAYS=7
MONITORING_WEBHOOK_URL=https://your-monitoring-service.com/webhook

# Let's Encrypt Staging (for testing)
LETSENCRYPT_STAGING=0  # Set to 1 for staging
```

### Nginx Configuration

The SSL configuration is split into two files:

1. **Production** (`docker/nginx/conf.d/ssl.conf`):
   - Let's Encrypt certificates
   - Strong SSL ciphers
   - HSTS with preload
   - OCSP stapling
   - Security headers

2. **Development** (`docker/nginx/conf.d/dev-ssl.conf`):
   - Self-signed certificates
   - Relaxed security for local development

### Security Headers

The production configuration includes:

```nginx
# HSTS (2 years, including subdomains)
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

# Prevent clickjacking
X-Frame-Options: DENY

# Prevent MIME type sniffing
X-Content-Type-Options: nosniff

# Enable XSS protection
X-XSS-Protection: 1; mode=block

# Referrer policy
Referrer-Policy: strict-origin-when-cross-origin

# Permissions policy
Permissions-Policy: geolocation=(), microphone=(), camera=()

# Content Security Policy
Content-Security-Policy: [comprehensive policy]

# Certificate Transparency
Expect-CT: max-age=86400, enforce
```

## Certificate Management

### Initial Setup

```bash
# Check if ports are available
sudo lsof -i :80
sudo lsof -i :443

# Initialize certificates
./scripts/ssl/init-letsencrypt.sh

# Verify certificates
./scripts/ssl/check-certificates.sh
```

### Manual Renewal

```bash
# Renew certificates manually
./scripts/ssl/renew-certificates.sh

# Force renewal
docker-compose run --rm certbot renew --force-renewal
```

### Automatic Renewal

Certificates are automatically renewed via:
1. **Cron job** (added by init script)
2. **Docker service** (runs every 12 hours)

Check renewal status:
```bash
# View renewal logs
docker-compose logs certbot

# Check cron job
crontab -l | grep renew
```

## Certificate Monitoring

### Built-in Monitoring

The `ssl-monitor` service checks certificates every 6 hours:

```bash
# View monitoring logs
docker-compose logs ssl-monitor

# Check certificate status
docker-compose exec ssl-monitor /scripts/check-certificates.sh
```

### Prometheus Metrics

SSL metrics are exported to `/var/lib/prometheus/textfile_collector/`:

- `ssl_certificate_expiry_days` - Days until expiration
- `ssl_certificate_valid` - Certificate validity (0/1)
- `ssl_certificate_renewal_timestamp_seconds` - Last renewal check

### Webhook Notifications

Configure `MONITORING_WEBHOOK_URL` to receive alerts:

```json
{
  "event": "certificate_renewal",
  "status": "success|error",
  "message": "Details about the event",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Troubleshooting

### Common Issues

1. **Certificate not found**
   ```bash
   # Check certificate files
   ls -la ./docker/certbot/conf/live/${DOMAIN_NAME}/
   
   # Regenerate certificates
   ./scripts/ssl/init-letsencrypt.sh
   ```

2. **Nginx not reloading**
   ```bash
   # Manually reload Nginx
   docker-compose exec nginx nginx -s reload
   
   # Check Nginx configuration
   docker-compose exec nginx nginx -t
   ```

3. **Rate limiting**
   ```bash
   # Use staging environment for testing
   export LETSENCRYPT_STAGING=1
   ./scripts/ssl/init-letsencrypt.sh
   ```

4. **Domain verification failed**
   ```bash
   # Check DNS resolution
   dig +short your-domain.com
   
   # Test HTTP challenge
   curl http://your-domain.com/.well-known/acme-challenge/test
   ```

### Debug Commands

```bash
# View certificate details
openssl x509 -in docker/certbot/conf/live/${DOMAIN_NAME}/cert.pem -text -noout

# Test SSL connection
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Check OCSP status
openssl ocsp -no_nonce \
  -issuer docker/certbot/conf/live/${DOMAIN_NAME}/chain.pem \
  -cert docker/certbot/conf/live/${DOMAIN_NAME}/cert.pem \
  -url $(openssl x509 -ocsp_uri -noout -in docker/certbot/conf/live/${DOMAIN_NAME}/cert.pem)

# Test SSL configuration
curl -I https://your-domain.com
```

## Security Best Practices

1. **Use strong ciphers** - Only TLS 1.2+ with secure ciphers
2. **Enable HSTS** - Prevent protocol downgrade attacks
3. **OCSP stapling** - Improve performance and privacy
4. **Regular monitoring** - Check expiration dates
5. **Backup certificates** - Keep secure backups
6. **Restrict permissions** - 600 for private keys
7. **Update regularly** - Keep certbot and Nginx updated

## Production Checklist

- [ ] Domain DNS configured correctly
- [ ] Firewall rules allow ports 80 and 443
- [ ] Environment variables set in `.env`
- [ ] Certificates obtained successfully
- [ ] Automatic renewal configured
- [ ] Monitoring alerts configured
- [ ] Security headers verified
- [ ] HTTPS redirect working
- [ ] HSTS enabled
- [ ] Certificate backup created

## Additional Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)
- [Security Headers Scanner](https://securityheaders.com/)