#!/bin/bash

# Warehouse Network Platform - Comprehensive Test Suite Runner
# This script runs all test types and generates a comprehensive report

set -e

echo "🚀 Starting Warehouse Network Comprehensive Test Suite"
echo "=================================================="

# Set environment variables
export NODE_ENV=test
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/warehouse_test"
export BASE_URL="http://localhost:3000"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create test results directory
TEST_RESULTS_DIR="test-results-$(date +%Y%m%d-%H%M%S)"
mkdir -p $TEST_RESULTS_DIR

echo -e "\n${YELLOW}📁 Test results will be saved to: $TEST_RESULTS_DIR${NC}\n"

# Function to run test and capture results
run_test() {
    local test_name=$1
    local test_command=$2
    local output_file="$TEST_RESULTS_DIR/${test_name}-output.txt"
    
    echo -e "🧪 Running ${test_name}..."
    
    if $test_command > "$output_file" 2>&1; then
        echo -e "${GREEN}✅ ${test_name} passed${NC}"
        echo "PASS" > "$TEST_RESULTS_DIR/${test_name}-status.txt"
    else
        echo -e "${RED}❌ ${test_name} failed${NC}"
        echo "FAIL" > "$TEST_RESULTS_DIR/${test_name}-status.txt"
        echo -e "${YELLOW}Check $output_file for details${NC}"
    fi
}

# 1. Setup test database
echo -e "\n${YELLOW}📦 Setting up test database...${NC}"
cd apps/web
npx prisma@5.7.0 migrate reset --force --skip-seed
npx prisma@5.7.0 migrate deploy
npx prisma@5.7.0 db seed
cd ../..

# 2. Start test server in background
echo -e "\n${YELLOW}🌐 Starting test server...${NC}"
cd apps/web && npm run dev > "$TEST_RESULTS_DIR/server.log" 2>&1 &
SERVER_PID=$!
cd ../..

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 10

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null; then
    echo -e "${RED}❌ Server failed to start${NC}"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✅ Server is running${NC}"

# 3. Run Unit Tests
echo -e "\n${YELLOW}🧩 Running Unit Tests...${NC}"
run_test "unit-tests" "cd apps/web && npm run test:unit"

# 4. Run Integration Tests
echo -e "\n${YELLOW}🔗 Running Integration Tests...${NC}"
run_test "integration-tests" "cd apps/web && npx playwright test --project=integration"

# 5. Run Persona Tests
echo -e "\n${YELLOW}👥 Running Persona-based Tests...${NC}"
run_test "super-admin-tests" "cd apps/web && npx playwright test --project=super-admin"
run_test "operator-admin-tests" "cd apps/web && npx playwright test --project=operator-admin"
run_test "warehouse-staff-tests" "cd apps/web && npx playwright test --project=warehouse-staff"
run_test "customer-admin-tests" "cd apps/web && npx playwright test --project=customer-admin"
run_test "customer-user-tests" "cd apps/web && npx playwright test --project=customer-user"

# 6. Run HTML/CSS Audit
echo -e "\n${YELLOW}🎨 Running HTML/CSS Audit...${NC}"
run_test "html-css-audit" "cd apps/web && npx playwright test --project=html-css-audit"

# 7. Run Visual Regression Tests
echo -e "\n${YELLOW}📸 Running Visual Regression Tests...${NC}"
run_test "visual-regression" "cd apps/web && npx playwright test --project=visual-regression"

# 8. Run Mobile Tests
echo -e "\n${YELLOW}📱 Running Mobile Tests...${NC}"
run_test "mobile-tests" "cd apps/web && npx playwright test --project=mobile-chrome --project=mobile-safari"

# 9. Run Accessibility Tests
echo -e "\n${YELLOW}♿ Running Accessibility Tests...${NC}"
run_test "accessibility-tests" "cd apps/web && npx playwright test --project=accessibility"

# 10. Run Performance Tests
echo -e "\n${YELLOW}⚡ Running Performance Tests...${NC}"
run_test "performance-tests" "cd apps/web && npx playwright test --project=performance"

# 11. Run Security Scan
echo -e "\n${YELLOW}🔒 Running Security Scan...${NC}"
run_test "security-scan" "cd apps/web && npm audit"

# 12. Run Lighthouse CI
echo -e "\n${YELLOW}🏠 Running Lighthouse Analysis...${NC}"
if command -v lighthouse &> /dev/null; then
    lighthouse http://localhost:3000 \
        --output html \
        --output-path "$TEST_RESULTS_DIR/lighthouse-report.html" \
        --chrome-flags="--headless" \
        --quiet
    echo -e "${GREEN}✅ Lighthouse analysis complete${NC}"
else
    echo -e "${YELLOW}⚠️  Lighthouse not installed, skipping...${NC}"
fi

# Generate Test Summary Report
echo -e "\n${YELLOW}📊 Generating Test Summary Report...${NC}"

cat > "$TEST_RESULTS_DIR/test-summary.md" << EOF
# Warehouse Network Platform - Test Summary Report
Generated on: $(date)

## Test Results Overview

| Test Type | Status |
|-----------|--------|
EOF

# Add test results to summary
for test_file in $TEST_RESULTS_DIR/*-status.txt; do
    if [ -f "$test_file" ]; then
        test_name=$(basename "$test_file" -status.txt)
        test_status=$(cat "$test_file")
        if [ "$test_status" = "PASS" ]; then
            echo "| $test_name | ✅ PASS |" >> "$TEST_RESULTS_DIR/test-summary.md"
        else
            echo "| $test_name | ❌ FAIL |" >> "$TEST_RESULTS_DIR/test-summary.md"
        fi
    fi
done

# Add performance metrics if available
if [ -f "$TEST_RESULTS_DIR/performance-tests-output.txt" ]; then
    echo -e "\n## Performance Metrics\n" >> "$TEST_RESULTS_DIR/test-summary.md"
    grep -E "(LCP|FID|CLS|TTFB)" "$TEST_RESULTS_DIR/performance-tests-output.txt" >> "$TEST_RESULTS_DIR/test-summary.md" || true
fi

# Add coverage report if available
if [ -d "apps/web/coverage" ]; then
    echo -e "\n## Code Coverage\n" >> "$TEST_RESULTS_DIR/test-summary.md"
    echo "Coverage report available at: apps/web/coverage/lcov-report/index.html" >> "$TEST_RESULTS_DIR/test-summary.md"
fi

echo -e "${GREEN}✅ Test summary report generated${NC}"

# Cleanup
echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
kill $SERVER_PID 2>/dev/null || true

# Display summary
echo -e "\n${GREEN}=================================================="
echo "✨ Comprehensive Test Suite Complete!"
echo "==================================================\n${NC}"

# Count passed and failed tests
PASSED=$(grep -l "PASS" $TEST_RESULTS_DIR/*-status.txt 2>/dev/null | wc -l || echo 0)
FAILED=$(grep -l "FAIL" $TEST_RESULTS_DIR/*-status.txt 2>/dev/null | wc -l || echo 0)

echo -e "Results Summary:"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo -e "\n📁 Full results available in: $TEST_RESULTS_DIR"
echo -e "📊 View summary: $TEST_RESULTS_DIR/test-summary.md"

# Exit with failure if any tests failed
if [ "$FAILED" -gt 0 ]; then
    exit 1
fi

exit 0