# Skidspace Production Deployment Guide

This guide provides step-by-step instructions for deploying Skidspace to production with complete security setup, credential management, and monitoring.

## 🚀 Quick Start

```bash
# 1. Generate production credentials
cd scripts && node generate-super-admin-credentials.js ../credentials

# 2. Upload to GCP Secret Manager
node gcp-secret-manager.js upload your-project-id

# 3. Initialize production database
node init-production-database.js

# 4. Deploy with Docker
cd ../deployment && docker-compose -f docker-compose.production.yml up -d
```

## 📋 Prerequisites

### System Requirements

- **Server**: Linux (Ubuntu 20.04+ recommended)
- **CPU**: Minimum 2 cores, 4 cores recommended
- **RAM**: Minimum 4GB, 8GB recommended
- **Storage**: 50GB+ SSD storage
- **Network**: Static IP with ports 80, 443 available

### Required Software

```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js (for scripts)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install gcloud CLI (for secret management)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

### GCP Project Setup

1. **Create GCP Project**
   ```bash
   gcloud projects create your-project-id
   gcloud config set project your-project-id
   ```

2. **Enable Required APIs**
   ```bash
   gcloud services enable secretmanager.googleapis.com
   gcloud services enable sqladmin.googleapis.com
   gcloud services enable storage.googleapis.com
   ```

3. **Create Service Account**
   ```bash
   gcloud iam service-accounts create skidspace-prod \
     --description="Skidspace production service account" \
     --display-name="Skidspace Production"

   gcloud projects add-iam-policy-binding your-project-id \
     --member="serviceAccount:skidspace-prod@your-project-id.iam.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"

   gcloud iam service-accounts keys create service-account.json \
     --iam-account=skidspace-prod@your-project-id.iam.gserviceaccount.com
   ```

## 🔐 Credential Generation and Management

### Step 1: Generate Production Credentials

```bash
cd scripts

# Install dependencies
npm install

# Generate secure credentials
node generate-super-admin-credentials.js ../credentials

# Review generated credentials
ls -la ../credentials/
```

This generates:
- ✅ Super admin user credentials (email, password, 2FA)
- ✅ System security keys (NextAuth, encryption, JWT)
- ✅ Database credentials (admin and read-only users)
- ✅ API keys and session secrets
- ✅ Environment templates
- ✅ GCP setup scripts

### Step 2: Store Credentials in GCP Secret Manager

```bash
# Set your project ID
export GCP_PROJECT_ID="your-project-id"

# Upload all credentials to Secret Manager
node gcp-secret-manager.js upload $GCP_PROJECT_ID ../credentials/super-admin-credentials-*.json

# Verify secrets were created
node gcp-secret-manager.js list $GCP_PROJECT_ID
```

### Step 3: Set Up IAM Permissions

```bash
# Grant service account access to secrets
node gcp-secret-manager.js iam $GCP_PROJECT_ID skidspace-prod@your-project-id.iam.gserviceaccount.com
```

## 🗄️ Database Setup

### Option A: GCP Cloud SQL (Recommended)

1. **Create Cloud SQL Instance**
   ```bash
   gcloud sql instances create skidspace-prod \
     --database-version=POSTGRES_14 \
     --tier=db-g1-small \
     --region=us-central1 \
     --storage-type=SSD \
     --storage-size=50GB \
     --backup-start-time=02:00 \
     --maintenance-window-day=SUN \
     --maintenance-window-hour=03 \
     --enable-bin-log \
     --deletion-protection
   ```

2. **Create Database and Users**
   ```bash
   # Create database
   gcloud sql databases create skidspace_prod --instance=skidspace-prod

   # Set admin password (use generated credential)
   gcloud sql users set-password postgres --host=% --instance=skidspace-prod \
     --password=$(gcloud secrets versions access latest --secret=skidspace-prod-db-password)

   # Create read-only user
   gcloud sql users create readonly_user --host=% --instance=skidspace-prod \
     --password=$(gcloud secrets versions access latest --secret=skidspace-prod-db-read-password)
   ```

3. **Configure Connection**
   ```bash
   # Get connection name
   gcloud sql instances describe skidspace-prod --format="value(connectionName)"

   # Update environment with connection details
   export DATABASE_URL="postgresql://postgres:PASSWORD@/skidspace_prod?host=/cloudsql/CONNECTION_NAME"
   ```

### Option B: Self-Hosted PostgreSQL

If using the Docker Compose setup, PostgreSQL will be automatically configured.

### Step 4: Initialize Database Schema

```bash
cd scripts

# Initialize production database with schema, roles, and super admin
node init-production-database.js ../credentials/super-admin-credentials-*.json
```

This sets up:
- ✅ Platform organization
- ✅ Role hierarchy and permissions
- ✅ Super admin user with full privileges
- ✅ System configuration
- ✅ Audit logging

## 🌐 Domain and SSL Setup

### Step 1: DNS Configuration

```bash
# Point your domain to your server IP
# A record: yourdomain.com -> YOUR_SERVER_IP
# A record: www.yourdomain.com -> YOUR_SERVER_IP
# A record: api.yourdomain.com -> YOUR_SERVER_IP
```

### Step 2: SSL Certificates with Let's Encrypt

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificates
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

### Step 3: Configure NGINX

```bash
# Create NGINX configuration
mkdir -p deployment/nginx/conf.d

# Copy SSL certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/* deployment/nginx/ssl/
```

## 🐳 Docker Deployment

### Step 1: Prepare Environment

```bash
cd deployment

# Create required directories
mkdir -p data/{postgres,redis,uploads} logs/{app,nginx,redis} backups/postgres

# Set proper permissions
sudo chown -R 1001:1001 data/uploads
sudo chown -R 999:999 data/redis
sudo chown -R 70:70 data/postgres
```

### Step 2: Configure Environment Variables

```bash
# Create production environment file
cp production.env.template .env.production

# Update with your values
nano .env.production

# Set required variables
export GCP_PROJECT_ID="your-project-id"
export APP_VERSION="1.0.0"
export NEXTAUTH_URL="https://yourdomain.com"
export DB_NAME="skidspace_prod"
export DB_USER="postgres"
```

### Step 3: Retrieve Secrets from GCP

```bash
# Create script to load secrets
cat > load-secrets.sh << 'EOF'
#!/bin/bash
export DATABASE_PASSWORD=$(gcloud secrets versions access latest --secret=skidspace-prod-db-password)
export NEXTAUTH_SECRET=$(gcloud secrets versions access latest --secret=skidspace-prod-nextauth-secret)
export SUPER_ADMIN_SETUP_KEY=$(gcloud secrets versions access latest --secret=skidspace-prod-setup-key)
export ENCRYPTION_KEY=$(gcloud secrets versions access latest --secret=skidspace-prod-encryption-key)
export JWT_SIGNING_KEY=$(gcloud secrets versions access latest --secret=skidspace-prod-jwt-signing-key)
export GOOGLE_CLIENT_ID="your-google-oauth-client-id"
export GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
export GITHUB_CLIENT_ID="your-github-oauth-client-id"
export GITHUB_CLIENT_SECRET="your-github-oauth-client-secret"
EOF

chmod +x load-secrets.sh
source load-secrets.sh
```

### Step 4: Deploy Application

```bash
# Build and deploy
docker-compose -f docker-compose.production.yml up -d

# Check status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f app
```

## 🔍 Health Checks and Monitoring

### Step 1: Verify Deployment

```bash
# Check application health
curl https://yourdomain.com/api/health

# Check database connectivity
curl https://yourdomain.com/api/health/db

# Check super admin setup
curl https://yourdomain.com/api/admin/super/setup
```

### Step 2: Enable Monitoring (Optional)

```bash
# Start monitoring stack
docker-compose -f docker-compose.production.yml --profile monitoring up -d

# Access Grafana
open http://your-server-ip:3001 # admin / admin123

# Access Prometheus
open http://your-server-ip:9090
```

### Step 3: Set Up Alerts

```bash
# Install monitoring tools
sudo apt-get install htop iotop nethogs

# Set up logrotate
sudo tee /etc/logrotate.d/skidspace << 'EOF'
/path/to/skidspace/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker-compose -f /path/to/docker-compose.production.yml kill -s USR1 nginx
    endscript
}
EOF
```

## 🛡️ Security Hardening

### Step 1: Firewall Configuration

```bash
# Install and configure UFW
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443

# Limit SSH attempts
sudo ufw limit ssh
```

### Step 2: System Security

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install security updates automatically
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Configure fail2ban
sudo apt-get install fail2ban
sudo systemctl enable fail2ban
```

### Step 3: Container Security

```bash
# Scan images for vulnerabilities
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v $HOME/Library/Caches:/root/.cache/ aquasec/trivy:latest \
  image skidspace:latest

# Set up automatic security updates
sudo tee /etc/cron.daily/docker-security-updates << 'EOF'
#!/bin/bash
docker system prune -af
docker-compose -f /path/to/docker-compose.production.yml pull
docker-compose -f /path/to/docker-compose.production.yml up -d
EOF

sudo chmod +x /etc/cron.daily/docker-security-updates
```

## 📊 Backup and Disaster Recovery

### Step 1: Database Backups

The Docker Compose configuration includes automated PostgreSQL backups. They run daily at 2 AM and are retained for 30 days.

### Step 2: File Backups

```bash
# Set up rsync backup to GCS
sudo tee /etc/cron.daily/file-backup << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf /tmp/skidspace-files-$DATE.tar.gz \
  /path/to/skidspace/data/uploads \
  /path/to/skidspace/logs

gsutil cp /tmp/skidspace-files-$DATE.tar.gz gs://your-backup-bucket/files/
rm /tmp/skidspace-files-$DATE.tar.gz

# Clean old backups (keep 30 days)
gsutil ls gs://your-backup-bucket/files/ | head -n -30 | gsutil -m rm -I
EOF

sudo chmod +x /etc/cron.daily/file-backup
```

### Step 3: Disaster Recovery Plan

1. **Database Recovery**
   ```bash
   # Restore from backup
   gunzip -c backup.sql.gz | docker exec -i skidspace-postgres psql -U postgres -d skidspace_prod
   ```

2. **Application Recovery**
   ```bash
   # Pull latest image and restart
   docker-compose -f docker-compose.production.yml pull
   docker-compose -f docker-compose.production.yml up -d
   ```

## 🧪 Testing Production Setup

### Step 1: Super Admin Login Test

1. Visit `https://yourdomain.com/admin/setup`
2. Use generated super admin credentials:
   - Email: (from credential summary)
   - Password: (from credential summary)
   - Setup Key: (from credential summary)

### Step 2: System Function Tests

```bash
# Run health checks
curl -f https://yourdomain.com/api/health || echo "Health check failed"
curl -f https://yourdomain.com/api/health/db || echo "Database check failed"

# Test authentication
curl -X POST https://yourdomain.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'
```

### Step 3: Performance Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Basic load test
ab -n 100 -c 10 https://yourdomain.com/api/health

# API endpoint test
ab -n 50 -c 5 -H "Authorization: Bearer YOUR_TOKEN" https://yourdomain.com/api/organizations
```

## 📈 Monitoring and Maintenance

### Daily Tasks

```bash
# Check system resources
df -h
free -h
docker stats --no-stream

# Check logs for errors
docker-compose -f docker-compose.production.yml logs --tail=100 app | grep ERROR

# Verify backups
ls -la backups/postgres/
```

### Weekly Tasks

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade

# Restart services for updates
docker-compose -f docker-compose.production.yml restart

# Check SSL certificate expiry
openssl x509 -in /etc/letsencrypt/live/yourdomain.com/cert.pem -noout -dates
```

### Monthly Tasks

```bash
# Security audit
sudo apt-get install lynis
sudo lynis audit system

# Backup verification
# Restore a backup to staging and verify functionality

# Performance review
# Analyze logs, metrics, and user feedback
```

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Check database status
   docker-compose logs postgres

   # Test connection
   docker exec -it skidspace-postgres psql -U postgres -d skidspace_prod -c "SELECT 1;"
   ```

2. **SSL Certificate Issues**
   ```bash
   # Check certificate validity
   openssl x509 -in deployment/nginx/ssl/fullchain.pem -text -noout

   # Renew certificates
   sudo certbot renew --nginx
   ```

3. **Memory Issues**
   ```bash
   # Check memory usage
   docker stats

   # Increase swap if needed
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

### Emergency Procedures

1. **Service Recovery**
   ```bash
   # Stop all services
   docker-compose -f docker-compose.production.yml down

   # Start in safe mode (app only)
   docker-compose -f docker-compose.production.yml up -d postgres redis
   docker-compose -f docker-compose.production.yml up app
   ```

2. **Database Recovery**
   ```bash
   # Stop app to prevent connections
   docker-compose -f docker-compose.production.yml stop app

   # Restore from latest backup
   # (commands depend on backup type and location)

   # Restart app
   docker-compose -f docker-compose.production.yml start app
   ```

## 📞 Support and Maintenance

### Log Locations

- Application logs: `logs/app/`
- NGINX logs: `logs/nginx/`
- Database logs: `docker-compose logs postgres`
- System logs: `/var/log/syslog`

### Key Configuration Files

- Environment: `deployment/.env.production`
- Docker Compose: `deployment/docker-compose.production.yml`
- NGINX: `deployment/nginx/conf.d/`
- SSL Certificates: `deployment/nginx/ssl/`

### Emergency Contacts

- **System Administrator**: [your-email]
- **Database Administrator**: [dba-email]
- **Security Team**: [security-email]

## ✅ Post-Deployment Checklist

- [ ] Super admin login working
- [ ] Database connectivity verified
- [ ] SSL certificates installed and valid
- [ ] Monitoring systems active
- [ ] Backup systems configured
- [ ] Security hardening complete
- [ ] Performance testing passed
- [ ] Documentation updated
- [ ] Team notified of deployment

## 🔄 Updates and Maintenance

### Updating the Application

```bash
# 1. Build new image
docker build -t skidspace:new-version .

# 2. Test in staging
docker-compose -f docker-compose.staging.yml up -d

# 3. Deploy to production
export APP_VERSION=new-version
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d

# 4. Verify deployment
curl https://yourdomain.com/api/health
```

### Security Updates

```bash
# Monthly security review
sudo apt list --upgradable
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}"

# Update base images
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d
```

This production deployment guide ensures a secure, scalable, and maintainable Skidspace installation. Follow the steps carefully and adapt the configuration to your specific requirements.