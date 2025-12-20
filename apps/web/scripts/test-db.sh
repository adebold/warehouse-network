#!/bin/bash

# Test Database Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load test environment variables
export $(cat .env.test | grep -v '^#' | xargs)

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to check if postgres is running
check_postgres() {
    if ! docker ps | grep -q warehouse-postgres-test; then
        print_error "Test PostgreSQL container is not running"
        return 1
    fi
    print_status "Test PostgreSQL is running"
    return 0
}

# Function to start test database
start_test_db() {
    echo "Starting test database..."
    
    # Start test postgres container
    docker run -d \
        --name warehouse-postgres-test \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=warehouse_test \
        -p 5433:5432 \
        postgres:15-alpine
    
    # Start test redis container
    docker run -d \
        --name warehouse-redis-test \
        -p 6380:6379 \
        redis:7-alpine
    
    # Wait for postgres to be ready
    echo "Waiting for PostgreSQL to be ready..."
    sleep 5
    
    print_status "Test database containers started"
}

# Function to stop test database
stop_test_db() {
    echo "Stopping test database..."
    docker stop warehouse-postgres-test warehouse-redis-test 2>/dev/null || true
    docker rm warehouse-postgres-test warehouse-redis-test 2>/dev/null || true
    print_status "Test database containers stopped"
}

# Function to reset test database
reset_test_db() {
    echo "Resetting test database..."
    
    # Drop and recreate database
    docker exec warehouse-postgres-test psql -U postgres -c "DROP DATABASE IF EXISTS warehouse_test;"
    docker exec warehouse-postgres-test psql -U postgres -c "CREATE DATABASE warehouse_test;"
    
    print_status "Test database reset"
}

# Function to run migrations
run_migrations() {
    echo "Running Prisma migrations..."
    
    # Generate Prisma client
    npx prisma generate --schema=./prisma/schema.prisma
    
    # Push schema to test database
    DATABASE_URL=$DATABASE_URL npx prisma db push --skip-generate
    
    print_status "Migrations applied"
}

# Function to seed test data
seed_test_data() {
    echo "Seeding test data..."
    
    # Run test seeder
    DATABASE_URL=$DATABASE_URL npx tsx prisma/seed-test.ts
    
    print_status "Test data seeded"
}

# Function to run full test setup
setup_tests() {
    echo "🚀 Setting up test environment..."
    
    # Check if containers exist
    if docker ps -a | grep -q warehouse-postgres-test; then
        print_warning "Test containers already exist. Removing..."
        stop_test_db
    fi
    
    start_test_db
    sleep 5
    run_migrations
    seed_test_data
    
    echo ""
    print_status "Test environment is ready!"
    echo ""
    echo "📋 Test Credentials:"
    echo "  Admin: admin@test.com / admin123"
    echo "  Operator: operator@test.com / operator123"
    echo "  Customer: customer@test.com / customer123"
    echo ""
    echo "🔗 Connection Details:"
    echo "  PostgreSQL: postgresql://postgres:postgres@localhost:5433/warehouse_test"
    echo "  Redis: redis://localhost:6380"
}

# Function to run tests with proper environment
run_tests() {
    echo "🧪 Running tests..."
    
    # Check if test database is running
    if ! check_postgres; then
        print_error "Test database is not running. Run './scripts/test-db.sh setup' first"
        exit 1
    fi
    
    # Run tests based on argument
    case "$1" in
        "unit")
            print_status "Running unit tests..."
            npm run test
            ;;
        "integration")
            print_status "Running integration tests..."
            npm run test:integration
            ;;
        "e2e")
            print_status "Running E2E tests..."
            npm run test:e2e
            ;;
        "all")
            print_status "Running all tests..."
            npm run test:all
            ;;
        *)
            print_status "Running all tests..."
            npm run test:all
            ;;
    esac
}

# Main script logic
case "$1" in
    "start")
        start_test_db
        ;;
    "stop")
        stop_test_db
        ;;
    "reset")
        reset_test_db
        run_migrations
        seed_test_data
        ;;
    "setup")
        setup_tests
        ;;
    "seed")
        seed_test_data
        ;;
    "test")
        run_tests "$2"
        ;;
    "clean")
        stop_test_db
        print_status "Test environment cleaned up"
        ;;
    *)
        echo "Test Database Management Script"
        echo ""
        echo "Usage: $0 {start|stop|reset|setup|seed|test|clean}"
        echo ""
        echo "Commands:"
        echo "  start  - Start test database containers"
        echo "  stop   - Stop test database containers"
        echo "  reset  - Reset database and re-run migrations/seeds"
        echo "  setup  - Complete setup (start, migrate, seed)"
        echo "  seed   - Run test data seeder"
        echo "  test   - Run tests (unit|integration|e2e|all)"
        echo "  clean  - Stop and remove all test containers"
        exit 1
        ;;
esac