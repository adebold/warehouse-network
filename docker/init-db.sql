-- Initialize database for warehouse network
-- This script runs when the PostgreSQL container is first created

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set up replication user for production (only if not exists)
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'replicator') THEN

      CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replication_password';
   END IF;
END
$do$;

-- Grant necessary permissions
GRANT CONNECT ON DATABASE warehouse_network TO replicator;

-- Create indexes for better performance
-- These will be created after Prisma migrations run
-- Add this to a post-migration script:
/*
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_skids_warehouse_status ON skids(warehouse_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_rfq_status ON quotes(rfq_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operators_platform ON operators(platform_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_warehouses_operator ON warehouses(operator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_skids_customer ON skids(customer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_operator ON operator_ledger_entries(operator_id);
*/

-- Performance tuning for development
-- Adjust these for production based on available resources
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET min_wal_size = '1GB';
ALTER SYSTEM SET max_wal_size = '4GB';