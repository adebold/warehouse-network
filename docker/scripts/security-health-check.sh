#!/bin/sh
# Security Health Check Script for Warehouse Network Platform

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== Warehouse Network Security Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Function to check service health
check_service() {
    SERVICE=$1
    PORT=$2
    ENDPOINT=$3
    
    echo -n "Checking $SERVICE... "
    
    if curl -f -s -o /dev/null "${ENDPOINT}"; then
        echo -e "${GREEN}✓ HEALTHY${NC}"
        return 0
    else
        echo -e "${RED}✗ UNHEALTHY${NC}"
        return 1
    fi
}

# Function to check security headers
check_security_headers() {
    URL=$1
    echo "Checking security headers for $URL..."
    
    HEADERS=$(curl -s -I "$URL")
    
    # Check for important security headers
    check_header() {
        HEADER=$1
        if echo "$HEADERS" | grep -qi "$HEADER"; then
            echo -e "  ${GREEN}✓${NC} $HEADER present"
        else
            echo -e "  ${RED}✗${NC} $HEADER missing"
        fi
    }
    
    check_header "Strict-Transport-Security"
    check_header "X-Frame-Options"
    check_header "X-Content-Type-Options"
    check_header "Content-Security-Policy"
    check_header "X-XSS-Protection"
}

# Function to check rate limiting
check_rate_limiting() {
    ENDPOINT=$1
    LIMIT=$2
    
    echo "Testing rate limiting on $ENDPOINT (limit: $LIMIT requests)..."
    
    COUNT=0
    BLOCKED=false
    
    for i in $(seq 1 $((LIMIT + 5))); do
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT")
        
        if [ "$RESPONSE" = "429" ]; then
            BLOCKED=true
            COUNT=$i
            break
        fi
    done
    
    if [ "$BLOCKED" = true ]; then
        echo -e "  ${GREEN}✓${NC} Rate limiting active (blocked after $COUNT requests)"
    else
        echo -e "  ${RED}✗${NC} Rate limiting not working properly"
    fi
}

# Function to check CSRF protection
check_csrf_protection() {
    URL=$1
    
    echo "Checking CSRF protection..."
    
    # Try to make a POST request without CSRF token
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/api/test" -H "Content-Type: application/json" -d '{"test": true}')
    
    if [ "$RESPONSE" = "403" ] || [ "$RESPONSE" = "401" ]; then
        echo -e "  ${GREEN}✓${NC} CSRF protection active"
    else
        echo -e "  ${YELLOW}⚠${NC} CSRF protection may not be properly configured"
    fi
}

# Function to check authentication
check_authentication() {
    URL=$1
    
    echo "Checking authentication requirements..."
    
    # Try to access protected endpoint without auth
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/user/profile")
    
    if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "403" ]; then
        echo -e "  ${GREEN}✓${NC} Authentication required for protected endpoints"
    else
        echo -e "  ${RED}✗${NC} Protected endpoints accessible without authentication"
    fi
}

# Main health checks
echo "=== Service Health Checks ==="
check_service "Main Application" 3000 "http://localhost:3000/api/health"
check_service "PostgreSQL" 5433 "http://localhost:5433" || true
check_service "Redis" 6380 "http://localhost:6380" || true

echo ""
echo "=== Security Configuration Checks ==="

# Check security headers
check_security_headers "http://localhost:3000"

echo ""

# Check rate limiting
check_rate_limiting "http://localhost:3000/api/health" 10

echo ""

# Check CSRF protection
check_csrf_protection "http://localhost:3000"

echo ""

# Check authentication
check_authentication "http://localhost:3000"

echo ""
echo "=== Container Security Checks ==="

# Check if containers are running as non-root
echo "Checking container user privileges..."
for container in warehouse-app warehouse-postgres warehouse-redis; do
    USER_ID=$(docker exec $container id -u 2>/dev/null || echo "Container not running")
    
    if [ "$USER_ID" = "0" ]; then
        echo -e "  ${RED}✗${NC} $container running as root"
    elif [ "$USER_ID" = "Container not running" ]; then
        echo -e "  ${YELLOW}⚠${NC} $container not running"
    else
        echo -e "  ${GREEN}✓${NC} $container running as non-root (UID: $USER_ID)"
    fi
done

echo ""
echo "=== Security Scan Results ==="

# Run Trivy scan if available
if command -v trivy >/dev/null 2>&1; then
    echo "Running vulnerability scan with Trivy..."
    trivy image --severity HIGH,CRITICAL warehouse-app:latest --quiet || echo -e "  ${YELLOW}⚠${NC} Some vulnerabilities found"
else
    echo -e "  ${YELLOW}⚠${NC} Trivy not installed - skipping vulnerability scan"
fi

echo ""
echo "=== SSL/TLS Configuration ==="

# Check if HTTPS is properly configured
if [ -f "/etc/nginx/ssl/cert.pem" ]; then
    echo -e "  ${GREEN}✓${NC} SSL certificate found"
    
    # Check certificate expiration
    EXPIRY=$(openssl x509 -enddate -noout -in /etc/nginx/ssl/cert.pem 2>/dev/null | cut -d= -f2)
    echo "  Certificate expires: $EXPIRY"
else
    echo -e "  ${YELLOW}⚠${NC} SSL certificate not found (development environment)"
fi

echo ""
echo "=== Summary ==="
echo "Security health check completed at $(date)"
echo "Review any issues marked with ✗ or ⚠"