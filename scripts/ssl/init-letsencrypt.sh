#!/bin/bash
# Initialize Let's Encrypt certificates for Warehouse Network

set -e

# Configuration
DOMAIN=${DOMAIN_NAME:-"example.com"}
EMAIL=${LETSENCRYPT_EMAIL:-"admin@example.com"}
STAGING=${LETSENCRYPT_STAGING:-0}
DATA_PATH="./docker/certbot"
NGINX_CONTAINER="warehouse-nginx"
CERTBOT_CONTAINER="warehouse-certbot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root (required for Docker)
if [[ $EUID -ne 0 ]] && ! groups | grep -q docker; then
   echo_error "This script must be run as root or by a user in the docker group"
   exit 1
fi

# Create required directories
echo_info "Creating required directories..."
mkdir -p "$DATA_PATH/conf"
mkdir -p "$DATA_PATH/www"
mkdir -p "$DATA_PATH/lib"

# Check if certificates already exist
if [ -d "$DATA_PATH/conf/live/$DOMAIN" ]; then
    echo_warn "Existing certificates found for $DOMAIN"
    read -p "Do you want to continue and potentially overwrite them? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Download recommended TLS parameters
echo_info "Downloading recommended TLS parameters..."
if [ ! -e "$DATA_PATH/conf/options-ssl-nginx.conf" ]; then
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$DATA_PATH/conf/options-ssl-nginx.conf"
fi

# Generate Diffie-Hellman parameters if they don't exist
if [ ! -e "$DATA_PATH/conf/ssl-dhparams.pem" ]; then
    echo_info "Generating Diffie-Hellman parameters..."
    openssl dhparam -out "$DATA_PATH/conf/ssl-dhparams.pem" 2048
fi

# Create temporary self-signed certificate for initial Nginx startup
echo_info "Creating temporary self-signed certificate..."
path="/etc/letsencrypt/live/$DOMAIN"
mkdir -p "$DATA_PATH/conf/live/$DOMAIN"
docker run --rm \
    -v "${PWD}/$DATA_PATH/conf:/etc/letsencrypt" \
    --entrypoint openssl \
    certbot/certbot \
    req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$path/privkey.pem" \
    -out "$path/fullchain.pem" \
    -subj "/CN=$DOMAIN"

# Start Nginx with temporary certificate
echo_info "Starting Nginx with temporary certificate..."
docker-compose up -d nginx

# Wait for Nginx to be ready
echo_info "Waiting for Nginx to be ready..."
sleep 5

# Delete temporary certificate
echo_info "Deleting temporary certificate..."
docker run --rm \
    -v "${PWD}/$DATA_PATH/conf:/etc/letsencrypt" \
    --entrypoint rm \
    certbot/certbot \
    -rf "/etc/letsencrypt/live/$DOMAIN"

# Request Let's Encrypt certificate
echo_info "Requesting Let's Encrypt certificate..."
staging_arg=""
if [ $STAGING -eq 1 ]; then
    staging_arg="--staging"
    echo_warn "Using Let's Encrypt staging server"
fi

docker run --rm \
    -v "${PWD}/$DATA_PATH/conf:/etc/letsencrypt" \
    -v "${PWD}/$DATA_PATH/www:/var/www/certbot" \
    -v "${PWD}/$DATA_PATH/lib:/var/lib/letsencrypt" \
    certbot/certbot \
    certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    $staging_arg \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

# Check if certificate was obtained successfully
if [ ! -d "$DATA_PATH/conf/live/$DOMAIN" ]; then
    echo_error "Failed to obtain certificate"
    exit 1
fi

# Reload Nginx with new certificate
echo_info "Reloading Nginx with new certificate..."
docker-compose exec nginx nginx -s reload

echo_info "Certificate successfully obtained for $DOMAIN"
echo_info "Certificate files are located at: $DATA_PATH/conf/live/$DOMAIN/"

# Set up automatic renewal
echo_info "Setting up automatic renewal..."
cat > ./scripts/ssl/renew-certificates.sh << 'EOF'
#!/bin/bash
# Renew Let's Encrypt certificates

docker-compose run --rm certbot renew --quiet --no-self-upgrade --post-hook "docker-compose exec -T nginx nginx -s reload"
EOF

chmod +x ./scripts/ssl/renew-certificates.sh

# Add cron job for automatic renewal
echo_info "Adding cron job for automatic renewal..."
(crontab -l 2>/dev/null; echo "0 0,12 * * * cd $(pwd) && ./scripts/ssl/renew-certificates.sh >> /var/log/letsencrypt-renewal.log 2>&1") | crontab -

echo_info "Setup complete! Your site is now secured with Let's Encrypt SSL certificates."
echo_info "Certificates will be automatically renewed via cron job."