#!/bin/bash
# Container Security Scanning Script

set -e

echo "=== Docker Security Scan for Warehouse Network ==="
echo "Starting security scan at $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to scan image with Trivy
scan_with_trivy() {
    IMAGE=$1
    echo -e "${BLUE}Scanning $IMAGE with Trivy...${NC}"
    
    # Pull latest vulnerability database
    trivy image --download-db-only
    
    # Scan for vulnerabilities
    trivy image "$IMAGE" \
        --severity HIGH,CRITICAL \
        --format table \
        --exit-code 0 \
        --no-progress
    
    # Generate JSON report for CI/CD
    trivy image "$IMAGE" \
        --severity HIGH,CRITICAL \
        --format json \
        --output "security-report-${IMAGE//\//-}.json" \
        --no-progress
    
    echo ""
}

# Function to check Docker daemon configuration
check_docker_daemon() {
    echo -e "${BLUE}Checking Docker daemon security configuration...${NC}"
    
    # Check if Docker daemon is running with security options
    if docker info | grep -q "Security Options"; then
        echo -e "${GREEN}✓${NC} Docker security options enabled:"
        docker info | grep -A 5 "Security Options" | tail -n +2
    else
        echo -e "${YELLOW}⚠${NC} No security options found in Docker daemon"
    fi
    
    echo ""
}

# Function to audit container configurations
audit_container() {
    CONTAINER=$1
    echo -e "${BLUE}Auditing container: $CONTAINER${NC}"
    
    # Check if container exists
    if ! docker ps -a --format "table {{.Names}}" | grep -q "^${CONTAINER}$"; then
        echo -e "${YELLOW}⚠${NC} Container $CONTAINER not found"
        return
    fi
    
    # Check user
    USER=$(docker exec "$CONTAINER" whoami 2>/dev/null || echo "unknown")
    if [ "$USER" = "root" ]; then
        echo -e "${RED}✗${NC} Running as root user"
    else
        echo -e "${GREEN}✓${NC} Running as non-root user: $USER"
    fi
    
    # Check capabilities
    echo -n "  Capabilities: "
    docker inspect "$CONTAINER" --format '{{.HostConfig.CapDrop}}' | grep -q "ALL" && \
        echo -e "${GREEN}✓${NC} All capabilities dropped" || \
        echo -e "${YELLOW}⚠${NC} Not all capabilities dropped"
    
    # Check read-only root filesystem
    READONLY=$(docker inspect "$CONTAINER" --format '{{.HostConfig.ReadonlyRootfs}}')
    echo -n "  Read-only filesystem: "
    if [ "$READONLY" = "true" ]; then
        echo -e "${GREEN}✓${NC} Enabled"
    else
        echo -e "${YELLOW}⚠${NC} Disabled"
    fi
    
    # Check security options
    SECCOMP=$(docker inspect "$CONTAINER" --format '{{index .HostConfig.SecurityOpt}}' | grep -c "seccomp" || true)
    echo -n "  Seccomp profile: "
    if [ "$SECCOMP" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} Applied"
    else
        echo -e "${YELLOW}⚠${NC} Not applied"
    fi
    
    # Check resource limits
    echo "  Resource limits:"
    MEMORY=$(docker inspect "$CONTAINER" --format '{{.HostConfig.Memory}}')
    CPU=$(docker inspect "$CONTAINER" --format '{{.HostConfig.CpuQuota}}')
    
    if [ "$MEMORY" != "0" ]; then
        echo -e "    Memory: ${GREEN}✓${NC} Limited"
    else
        echo -e "    Memory: ${YELLOW}⚠${NC} Unlimited"
    fi
    
    if [ "$CPU" != "0" ]; then
        echo -e "    CPU: ${GREEN}✓${NC} Limited"
    else
        echo -e "    CPU: ${YELLOW}⚠${NC} Unlimited"
    fi
    
    echo ""
}

# Function to check secrets management
check_secrets() {
    echo -e "${BLUE}Checking secrets management...${NC}"
    
    # Check for hardcoded secrets in images
    for image in $(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "warehouse|app"); do
        echo "Scanning $image for secrets..."
        
        # Create temporary container
        TEMP_CONTAINER="security-scan-$$"
        docker create --name "$TEMP_CONTAINER" "$image" >/dev/null 2>&1 || continue
        
        # Check for common secret patterns
        docker export "$TEMP_CONTAINER" | tar -t | grep -E "(\.env|config|secret|password|key)" | head -5 || true
        
        # Remove temporary container
        docker rm "$TEMP_CONTAINER" >/dev/null 2>&1
    done
    
    echo ""
}

# Function to generate security report
generate_report() {
    REPORT_FILE="docker-security-report-$(date +%Y%m%d-%H%M%S).html"
    
    cat > "$REPORT_FILE" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Docker Security Report - Warehouse Network</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; }
        .pass { color: green; }
        .fail { color: red; }
        .warning { color: orange; }
        .info { background: #f0f0f0; padding: 10px; margin: 10px 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Docker Security Report - Warehouse Network</h1>
    <div class="info">
        <strong>Generated:</strong> $(date)<br>
        <strong>Platform:</strong> $(uname -s) $(uname -r)
    </div>
    
    <h2>Container Security Audit Results</h2>
    <table>
        <tr>
            <th>Container</th>
            <th>User</th>
            <th>Capabilities</th>
            <th>Read-only FS</th>
            <th>Seccomp</th>
            <th>Memory Limit</th>
            <th>CPU Limit</th>
        </tr>
EOF

    # Add container audit results to report
    for container in warehouse-app warehouse-postgres warehouse-redis; do
        if docker ps -a --format "table {{.Names}}" | grep -q "^${container}$"; then
            USER=$(docker exec "$container" whoami 2>/dev/null || echo "N/A")
            CAPS=$(docker inspect "$container" --format '{{.HostConfig.CapDrop}}' | grep -q "ALL" && echo "✓" || echo "✗")
            READONLY=$(docker inspect "$container" --format '{{.HostConfig.ReadonlyRootfs}}' | grep -q "true" && echo "✓" || echo "✗")
            SECCOMP=$(docker inspect "$container" --format '{{index .HostConfig.SecurityOpt}}' | grep -q "seccomp" && echo "✓" || echo "✗")
            MEM=$(docker inspect "$container" --format '{{.HostConfig.Memory}}' | grep -qv "^0$" && echo "✓" || echo "✗")
            CPU=$(docker inspect "$container" --format '{{.HostConfig.CpuQuota}}' | grep -qv "^0$" && echo "✓" || echo "✗")
            
            echo "<tr><td>$container</td><td>$USER</td><td>$CAPS</td><td>$READONLY</td><td>$SECCOMP</td><td>$MEM</td><td>$CPU</td></tr>" >> "$REPORT_FILE"
        fi
    done
    
    cat >> "$REPORT_FILE" << EOF
    </table>
    
    <h2>Vulnerability Scan Summary</h2>
    <p>See individual JSON reports for detailed vulnerability information.</p>
    
    <h2>Recommendations</h2>
    <ul>
        <li>Always run containers as non-root users</li>
        <li>Drop all capabilities and add only required ones</li>
        <li>Use read-only root filesystems where possible</li>
        <li>Apply seccomp profiles to limit system calls</li>
        <li>Set resource limits for all containers</li>
        <li>Regularly update base images and dependencies</li>
        <li>Scan images for vulnerabilities before deployment</li>
        <li>Use Docker secrets or external secret management</li>
    </ul>
</body>
</html>
EOF

    echo -e "${GREEN}Security report generated: $REPORT_FILE${NC}"
}

# Main execution
echo "1. Checking Docker daemon configuration"
check_docker_daemon

echo "2. Scanning Docker images for vulnerabilities"
# Check if Trivy is installed
if command -v trivy >/dev/null 2>&1; then
    scan_with_trivy "warehouse-app:latest" || true
    scan_with_trivy "postgres:15-alpine" || true
    scan_with_trivy "redis:7-alpine" || true
    scan_with_trivy "nginx:alpine" || true
else
    echo -e "${YELLOW}⚠${NC} Trivy not installed. Install it with:"
    echo "  brew install aquasecurity/trivy/trivy (macOS)"
    echo "  or visit: https://aquasecurity.github.io/trivy/"
fi

echo "3. Auditing container configurations"
audit_container "warehouse-app"
audit_container "warehouse-postgres"
audit_container "warehouse-redis"
audit_container "warehouse-nginx"

echo "4. Checking secrets management"
check_secrets

echo "5. Generating security report"
generate_report

echo ""
echo -e "${GREEN}Security scan completed successfully!${NC}"
echo "Review the generated reports for detailed findings."