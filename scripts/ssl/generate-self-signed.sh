#!/bin/bash
# Generate self-signed SSL certificates for development

set -e

# Configuration
SSL_DIR="./docker/nginx/ssl/self-signed"
DOMAIN=${DOMAIN:-"localhost"}
DAYS=${DAYS:-365}
KEY_SIZE=${KEY_SIZE:-2048}

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Create SSL directory
echo_info "Creating SSL directory..."
mkdir -p "$SSL_DIR"

# Check if certificates already exist
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo_warn "Self-signed certificates already exist"
    read -p "Do you want to regenerate them? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

# Generate private key
echo_info "Generating private key..."
openssl genrsa -out "$SSL_DIR/key.pem" $KEY_SIZE

# Generate certificate signing request
echo_info "Generating certificate signing request..."
openssl req -new -key "$SSL_DIR/key.pem" -out "$SSL_DIR/csr.pem" \
    -subj "/C=US/ST=State/L=City/O=Warehouse Network/OU=Development/CN=$DOMAIN"

# Generate self-signed certificate
echo_info "Generating self-signed certificate..."
openssl x509 -req -days $DAYS -in "$SSL_DIR/csr.pem" \
    -signkey "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
    -extensions v3_ca \
    -extfile <(cat <<EOF
[v3_ca]
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = *.$DOMAIN
DNS.3 = localhost
DNS.4 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
)

# Generate Diffie-Hellman parameters
echo_info "Generating Diffie-Hellman parameters (this may take a while)..."
openssl dhparam -out "$SSL_DIR/dhparam.pem" 2048

# Clean up CSR
rm -f "$SSL_DIR/csr.pem"

# Set appropriate permissions
chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"
chmod 644 "$SSL_DIR/dhparam.pem"

echo_info "Self-signed certificates generated successfully!"
echo_info "Certificate location: $SSL_DIR/cert.pem"
echo_info "Private key location: $SSL_DIR/key.pem"
echo_info "DH params location: $SSL_DIR/dhparam.pem"

# Display certificate information
echo_info "Certificate details:"
openssl x509 -in "$SSL_DIR/cert.pem" -noout -text | grep -E "(Subject:|DNS:|Not After)"

# Create trust script for macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    cat > "$SSL_DIR/trust-cert-macos.sh" << 'EOF'
#!/bin/bash
# Trust self-signed certificate on macOS

CERT_PATH="$(dirname "$0")/cert.pem"

echo "Adding certificate to macOS keychain..."
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CERT_PATH"
echo "Certificate trusted successfully!"
echo "You may need to restart your browser for changes to take effect."
EOF
    chmod +x "$SSL_DIR/trust-cert-macos.sh"
    
    echo_info "To trust this certificate on macOS, run:"
    echo_info "  $SSL_DIR/trust-cert-macos.sh"
fi

# Create trust instructions for other platforms
cat > "$SSL_DIR/TRUST_CERTIFICATE.md" << 'EOF'
# Trusting Self-Signed Certificates

## macOS
Run the provided script:
```bash
./trust-cert-macos.sh
```

## Linux (Ubuntu/Debian)
```bash
sudo cp cert.pem /usr/local/share/ca-certificates/warehouse-network.crt
sudo update-ca-certificates
```

## Linux (CentOS/RHEL/Fedora)
```bash
sudo cp cert.pem /etc/pki/ca-trust/source/anchors/warehouse-network.crt
sudo update-ca-trust
```

## Windows
1. Double-click on cert.pem
2. Click "Install Certificate"
3. Select "Local Machine"
4. Select "Place all certificates in the following store"
5. Browse and select "Trusted Root Certification Authorities"
6. Complete the wizard

## Browsers
Most browsers will use the system certificate store, but some may require manual import:
- Chrome: Settings → Privacy and security → Security → Manage certificates
- Firefox: Settings → Privacy & Security → Certificates → View Certificates → Import
EOF

echo_info "Trust instructions saved to: $SSL_DIR/TRUST_CERTIFICATE.md"