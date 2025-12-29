#!/bin/bash
# Check SSL certificate status and expiration dates

set -e

# Configuration
DOMAIN=${DOMAIN_NAME:-"localhost"}
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/cert.pem"
WARNING_DAYS=${WARNING_DAYS:-30}
CRITICAL_DAYS=${CRITICAL_DAYS:-7}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check certificate expiration
check_cert_expiration() {
    local cert_file=$1
    local domain=$2
    
    if [ ! -f "$cert_file" ]; then
        echo_error "Certificate file not found: $cert_file"
        return 1
    fi
    
    # Get expiration date
    expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
    expiry_epoch=$(date -d "$expiry_date" +%s)
    current_epoch=$(date +%s)
    days_until_expiry=$(( ($expiry_epoch - $current_epoch) / 86400 ))
    
    echo_info "Certificate for $domain:"
    echo "  Expires: $expiry_date"
    echo "  Days until expiry: $days_until_expiry"
    
    # Check expiration status
    if [ $days_until_expiry -lt 0 ]; then
        echo_error "Certificate has EXPIRED!"
        return 2
    elif [ $days_until_expiry -lt $CRITICAL_DAYS ]; then
        echo_error "Certificate expires in $days_until_expiry days (CRITICAL)"
        return 3
    elif [ $days_until_expiry -lt $WARNING_DAYS ]; then
        echo_warn "Certificate expires in $days_until_expiry days (WARNING)"
        return 4
    else
        echo_info "Certificate is valid for $days_until_expiry more days"
        return 0
    fi
}

# Function to check certificate details
check_cert_details() {
    local cert_file=$1
    
    echo_info "Certificate details:"
    
    # Subject
    subject=$(openssl x509 -subject -noout -in "$cert_file" | sed 's/subject=/  Subject: /')
    echo "$subject"
    
    # Issuer
    issuer=$(openssl x509 -issuer -noout -in "$cert_file" | sed 's/issuer=/  Issuer: /')
    echo "$issuer"
    
    # Serial number
    serial=$(openssl x509 -serial -noout -in "$cert_file" | sed 's/serial=/  Serial: /')
    echo "$serial"
    
    # Signature algorithm
    sig_alg=$(openssl x509 -text -noout -in "$cert_file" | grep "Signature Algorithm" | head -1 | sed 's/.*Signature Algorithm: /  Signature Algorithm: /')
    echo "$sig_alg"
    
    # Subject Alternative Names
    echo "  Subject Alternative Names:"
    openssl x509 -text -noout -in "$cert_file" | grep -A1 "Subject Alternative Name" | tail -1 | sed 's/,/\n/g' | sed 's/^/    /'
}

# Function to check certificate chain
check_cert_chain() {
    local cert_file=$1
    local chain_file="${cert_file%/*}/chain.pem"
    
    if [ -f "$chain_file" ]; then
        echo_info "Certificate chain validation:"
        if openssl verify -CAfile "$chain_file" "$cert_file" > /dev/null 2>&1; then
            echo_info "  Certificate chain is valid"
        else
            echo_error "  Certificate chain validation failed"
        fi
    fi
}

# Function to check OCSP status
check_ocsp_status() {
    local cert_file=$1
    local chain_file="${cert_file%/*}/chain.pem"
    
    echo_info "Checking OCSP status..."
    
    # Get OCSP responder URL
    ocsp_url=$(openssl x509 -ocsp_uri -noout -in "$cert_file" 2>/dev/null)
    
    if [ -n "$ocsp_url" ]; then
        echo "  OCSP Responder: $ocsp_url"
        
        if [ -f "$chain_file" ]; then
            # Check OCSP status
            response=$(openssl ocsp -no_nonce \
                -issuer "$chain_file" \
                -cert "$cert_file" \
                -url "$ocsp_url" \
                -header "HOST=$(echo $ocsp_url | sed 's|.*//\([^/]*\).*|\1|')" 2>&1)
            
            if echo "$response" | grep -q "good"; then
                echo_info "  OCSP Status: Good"
            elif echo "$response" | grep -q "revoked"; then
                echo_error "  OCSP Status: REVOKED"
            else
                echo_warn "  OCSP Status: Unknown"
            fi
        fi
    else
        echo "  No OCSP responder URL found"
    fi
}

# Main execution
echo_info "SSL Certificate Status Check"
echo_info "============================"

# Check if running in Docker
if [ -f /.dockerenv ]; then
    # Inside Docker container
    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/cert.pem"
else
    # Outside Docker, check local path
    CERT_PATH="./docker/certbot/conf/live/$DOMAIN/cert.pem"
fi

# Check certificate expiration
check_cert_expiration "$CERT_PATH" "$DOMAIN"
exit_code=$?

echo ""

# Check certificate details
check_cert_details "$CERT_PATH"

echo ""

# Check certificate chain
check_cert_chain "$CERT_PATH"

echo ""

# Check OCSP status
check_ocsp_status "$CERT_PATH"

# Generate Prometheus metrics if directory exists
if [ -d "/var/lib/prometheus/textfile_collector" ]; then
    cat > /var/lib/prometheus/textfile_collector/ssl_certificate.prom << EOF
# HELP ssl_certificate_expiry_days Number of days until SSL certificate expires
# TYPE ssl_certificate_expiry_days gauge
ssl_certificate_expiry_days{domain="$DOMAIN"} $days_until_expiry

# HELP ssl_certificate_valid Whether the SSL certificate is valid (1) or not (0)
# TYPE ssl_certificate_valid gauge
ssl_certificate_valid{domain="$DOMAIN"} $([ $exit_code -eq 0 ] && echo 1 || echo 0)
EOF
fi

exit $exit_code