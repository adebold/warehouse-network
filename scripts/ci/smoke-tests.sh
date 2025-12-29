#!/bin/bash

# Smoke tests for deployment validation
set -euo pipefail

SERVICE_URL=${1:-}
TIMEOUT=${2:-300}
RETRY_INTERVAL=${3:-10}

if [ -z "$SERVICE_URL" ]; then
    echo "Usage: $0 <service-url> [timeout] [retry-interval]"
    echo "Example: $0 https://warehouse-network-staging.run.app 300 10"
    exit 1
fi

echo "🔍 Running smoke tests for: $SERVICE_URL"
echo "Timeout: ${TIMEOUT}s, Retry interval: ${RETRY_INTERVAL}s"

# Test counter
TESTS_PASSED=0
TESTS_TOTAL=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    ((TESTS_TOTAL++))
    echo -n "Testing $test_name... "
    
    if eval "$test_command"; then
        echo "✅ PASS"
        ((TESTS_PASSED++))
        return 0
    else
        echo "❌ FAIL"
        return 1
    fi
}

# Helper function to wait for service
wait_for_service() {
    local url="$1"
    local timeout="$2"
    local start_time=$(date +%s)
    
    echo "⏳ Waiting for service to be ready..."
    
    while true; do
        if curl -sf "$url/health" > /dev/null 2>&1; then
            echo "✅ Service is ready"
            return 0
        fi
        
        current_time=$(date +%s)
        elapsed=$((current_time - start_time))
        
        if [ $elapsed -ge $timeout ]; then
            echo "❌ Service did not become ready within ${timeout}s"
            return 1
        fi
        
        sleep $RETRY_INTERVAL
    done
}

# Wait for service to be ready
wait_for_service "$SERVICE_URL" "$TIMEOUT"

echo "🧪 Starting smoke tests..."

# Test 1: Health Check
run_test "Health endpoint" "curl -sf '$SERVICE_URL/health'"

# Test 2: API Root
run_test "API root endpoint" "curl -sf '$SERVICE_URL/api'"

# Test 3: Response time check
run_test "Response time < 2s" "timeout 2s curl -sf '$SERVICE_URL/health'"

# Test 4: Security headers
run_test "Security headers present" "
    curl -sf -I '$SERVICE_URL/health' | grep -i 'x-frame-options\|x-content-type-options\|x-xss-protection'
"

# Test 5: CORS headers
run_test "CORS headers configured" "
    curl -sf -H 'Origin: https://example.com' -I '$SERVICE_URL/api' | grep -i 'access-control'
"

# Test 6: Database connectivity (via API)
run_test "Database connectivity" "
    curl -sf '$SERVICE_URL/api/health/database' | grep -i 'healthy\|ok'
"

# Test 7: Redis connectivity (via API)
run_test "Redis connectivity" "
    curl -sf '$SERVICE_URL/api/health/redis' | grep -i 'healthy\|ok'
"

# Test 8: Authentication endpoint
run_test "Auth endpoint responds" "
    curl -sf -X POST '$SERVICE_URL/api/auth/login' \
        -H 'Content-Type: application/json' \
        -d '{\"email\":\"test@example.com\",\"password\":\"invalid\"}' | \
        grep -v '5[0-9][0-9]'
"

# Test 9: API versioning
run_test "API version header" "
    curl -sf -I '$SERVICE_URL/api' | grep -i 'x-api-version'
"

# Test 10: Rate limiting headers
run_test "Rate limiting configured" "
    curl -sf -I '$SERVICE_URL/api' | grep -i 'x-ratelimit'
"

# Test 11: Environment-specific config
run_test "Environment config loaded" "
    curl -sf '$SERVICE_URL/api/config' | grep -i 'environment'
"

# Test 12: Metrics endpoint (if available)
if curl -sf "$SERVICE_URL/metrics" > /dev/null 2>&1; then
    run_test "Metrics endpoint" "curl -sf '$SERVICE_URL/metrics' | grep -i 'warehouse'"
else
    echo "⏭️  Skipping metrics test (endpoint not available)"
fi

# Test 13: Static file serving (if applicable)
if curl -sf "$SERVICE_URL/favicon.ico" > /dev/null 2>&1; then
    run_test "Static file serving" "curl -sf '$SERVICE_URL/favicon.ico'"
else
    echo "⏭️  Skipping static file test"
fi

# Test 14: Error handling
run_test "404 error handling" "
    response=\$(curl -sf -w '%{http_code}' '$SERVICE_URL/nonexistent' -o /dev/null)
    [ \"\$response\" = \"404\" ]
"

# Test 15: JSON response format
run_test "JSON response format" "
    curl -sf '$SERVICE_URL/api/health' | jq . > /dev/null
"

# Performance Tests
echo ""
echo "📊 Running performance checks..."

# Test response time distribution
echo -n "Response time analysis... "
response_times=$(for i in {1..5}; do
    curl -sf -w "%{time_total}" -o /dev/null "$SERVICE_URL/health"
    echo
done)

avg_time=$(echo "$response_times" | awk '{sum+=$1} END {print sum/NR}')
max_time=$(echo "$response_times" | sort -n | tail -1)

echo "Avg: ${avg_time}s, Max: ${max_time}s"

if (( $(echo "$avg_time < 1.0" | bc -l) )); then
    echo "✅ Average response time acceptable"
    ((TESTS_PASSED++))
else
    echo "⚠️  Average response time high: ${avg_time}s"
fi
((TESTS_TOTAL++))

# Memory usage check (if metrics available)
if curl -sf "$SERVICE_URL/metrics" > /dev/null 2>&1; then
    echo -n "Memory usage check... "
    memory_usage=$(curl -sf "$SERVICE_URL/metrics" | grep "process_resident_memory_bytes" | awk '{print $2}')
    if [ -n "$memory_usage" ] && [ "$memory_usage" -lt 1073741824 ]; then # < 1GB
        echo "✅ Memory usage normal"
        ((TESTS_PASSED++))
    else
        echo "⚠️  High memory usage detected"
    fi
    ((TESTS_TOTAL++))
fi

# Summary
echo ""
echo "📋 Test Summary"
echo "==============="
echo "Tests passed: $TESTS_PASSED"
echo "Tests total: $TESTS_TOTAL"
echo "Success rate: $(( (TESTS_PASSED * 100) / TESTS_TOTAL ))%"

if [ "$TESTS_PASSED" -eq "$TESTS_TOTAL" ]; then
    echo "🎉 All smoke tests passed!"
    exit 0
elif [ "$TESTS_PASSED" -ge $(( (TESTS_TOTAL * 80) / 100 )) ]; then
    echo "⚠️  Most tests passed (>80%), deployment may proceed with caution"
    exit 0
else
    echo "❌ Too many tests failed, deployment should be reviewed"
    exit 1
fi