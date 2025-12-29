#!/bin/bash

# Database Integrity Verification Script
# This script checks and verifies the database integrity for the Warehouse Network platform

set -e

echo "🔍 Database Integrity Verification Script"
echo "========================================"
echo ""

# Configuration
DB_CONTAINER="warehouse-postgres"
DB_USER="${DB_USER:-warehouse}"
DB_NAME="${DB_NAME:-warehouse_network}"

# Function to execute SQL queries
exec_sql() {
    docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "$1"
}

# Function to count results
count_sql() {
    docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "$1" | tr -d ' '
}

echo "1. Checking Database Connection..."
if docker exec $DB_CONTAINER pg_isready -U $DB_USER -d $DB_NAME > /dev/null 2>&1; then
    echo "✅ Database is accessible"
else
    echo "❌ Cannot connect to database"
    exit 1
fi

echo ""
echo "2. Counting Tables..."
TOTAL_TABLES=$(count_sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
echo "📊 Total tables in database: $TOTAL_TABLES"

if [ "$TOTAL_TABLES" -lt "44" ]; then
    echo "⚠️  Warning: Expected 44 tables, found $TOTAL_TABLES"
    echo "   Missing tables need to be created via migrations"
else
    echo "✅ All expected tables are present"
fi

echo ""
echo "3. Checking Core Tables..."
CORE_TABLES=(
    "Platform"
    "Operator"
    "User"
    "Warehouse"
    "Customer"
    "Skid"
    "ReleaseRequest"
    "Quote"
    "RFQ"
)

for table in "${CORE_TABLES[@]}"; do
    if exec_sql "\dt \"$table\"" > /dev/null 2>&1; then
        COUNT=$(count_sql "SELECT COUNT(*) FROM \"$table\";")
        echo "✅ $table exists (rows: $COUNT)"
    else
        echo "❌ $table is missing"
    fi
done

echo ""
echo "4. Checking AI Assistant Tables..."
AI_TABLES=(
    "Lead"
    "AIInteraction"
    "SearchHistory"
    "Notification"
    "WarehouseFeature"
    "WarehouseImage"
)

AI_MISSING=0
for table in "${AI_TABLES[@]}"; do
    if docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = '$table' AND table_schema = 'public';" | grep -q 1; then
        echo "✅ $table exists"
    else
        echo "❌ $table is missing"
        AI_MISSING=$((AI_MISSING + 1))
    fi
done

if [ $AI_MISSING -gt 0 ]; then
    echo "⚠️  $AI_MISSING AI Assistant tables are missing"
fi

echo ""
echo "5. Checking Database Integrity Tables..."
INTEGRITY_TABLES=(
    "IntegrityLog"
    "IntegritySnapshot"
    "IntegrityAlert"
    "IntegrityMetric"
)

INTEGRITY_MISSING=0
for table in "${INTEGRITY_TABLES[@]}"; do
    if docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = '$table' AND table_schema = 'public';" | grep -q 1; then
        echo "✅ $table exists"
    else
        echo "❌ $table is missing"
        INTEGRITY_MISSING=$((INTEGRITY_MISSING + 1))
    fi
done

if [ $INTEGRITY_MISSING -gt 0 ]; then
    echo "⚠️  $INTEGRITY_MISSING Integrity monitoring tables are missing"
fi

echo ""
echo "6. Checking Foreign Key Constraints..."
FK_COUNT=$(count_sql "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';")
echo "📊 Total foreign key constraints: $FK_COUNT"

echo ""
echo "7. Checking for Orphaned Records..."
exec_sql "
SELECT 'Checking for orphaned records...' as status;
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ No orphaned OperatorUsers'
        ELSE '❌ Found ' || COUNT(*) || ' orphaned OperatorUsers'
    END as result
FROM \"OperatorUser\" ou
LEFT JOIN \"Operator\" o ON ou.\"operatorId\" = o.id
WHERE o.id IS NULL
UNION ALL
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ No orphaned Warehouses'
        ELSE '❌ Found ' || COUNT(*) || ' orphaned Warehouses'
    END
FROM \"Warehouse\" w
LEFT JOIN \"Operator\" o ON w.\"operatorId\" = o.id
WHERE o.id IS NULL
UNION ALL
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ No orphaned Skids'
        ELSE '❌ Found ' || COUNT(*) || ' orphaned Skids'
    END
FROM \"Skid\" s
LEFT JOIN \"Customer\" c ON s.\"customerId\" = c.id
WHERE c.id IS NULL;"

echo ""
echo "8. Checking Enum Types..."
ENUM_COUNT=$(count_sql "SELECT COUNT(DISTINCT t.typname) FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public';")
echo "📊 Total enum types: $ENUM_COUNT"
if [ "$ENUM_COUNT" -eq "19" ]; then
    echo "✅ All expected enum types are present"
else
    echo "⚠️  Expected 19 enum types, found $ENUM_COUNT"
fi

echo ""
echo "9. Checking Recent Migrations..."
exec_sql "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"

echo ""
echo "========================================"
echo "📋 Summary:"
echo ""

if [ $AI_MISSING -eq 0 ] && [ $INTEGRITY_MISSING -eq 0 ] && [ "$TOTAL_TABLES" -eq "44" ]; then
    echo "✅ Database integrity check PASSED"
    echo "   All tables, constraints, and relationships are properly configured"
else
    echo "⚠️  Database integrity check found issues:"
    echo "   - Missing tables: $((AI_MISSING + INTEGRITY_MISSING)) tables need to be created"
    echo "   - Run 'cd apps/web && npx prisma migrate deploy' to apply pending migrations"
    echo "   - After migrations, run this script again to verify"
fi

echo ""
echo "For detailed report, see: docs/database-integrity-report.md"
echo ""