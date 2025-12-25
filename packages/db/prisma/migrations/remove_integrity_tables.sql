-- Remove custom integrity database tables since we now use Claude Flow memory
-- This migration removes the tables created in 20251225144310_add_integrity_memory_bank

-- Drop tables in correct order (considering dependencies)
DROP TABLE IF EXISTS "IntegrityMetric";
DROP TABLE IF EXISTS "IntegrityAlert";  
DROP TABLE IF EXISTS "IntegritySnapshot";
DROP TABLE IF EXISTS "IntegrityLog";

-- Drop related indexes (will be dropped automatically with tables, but explicit for clarity)
-- IntegrityLog indexes
DROP INDEX IF EXISTS "IntegrityLog_category_timestamp_idx";
DROP INDEX IF EXISTS "IntegrityLog_level_timestamp_idx"; 
DROP INDEX IF EXISTS "IntegrityLog_component_timestamp_idx";
DROP INDEX IF EXISTS "IntegrityLog_correlationId_idx";

-- IntegritySnapshot indexes
DROP INDEX IF EXISTS "IntegritySnapshot_snapshotType_timestamp_idx";
DROP INDEX IF EXISTS "IntegritySnapshot_driftDetected_timestamp_idx";

-- IntegrityAlert indexes  
DROP INDEX IF EXISTS "IntegrityAlert_alertType_status_idx";
DROP INDEX IF EXISTS "IntegrityAlert_severity_status_idx";
DROP INDEX IF EXISTS "IntegrityAlert_createdAt_idx";

-- IntegrityMetric indexes
DROP INDEX IF EXISTS "IntegrityMetric_metricType_timestamp_idx";
DROP INDEX IF EXISTS "IntegrityMetric_component_timestamp_idx";
DROP INDEX IF EXISTS "IntegrityMetric_name_timestamp_idx";

-- Drop custom enums
DROP TYPE IF EXISTS "IntegrityMetricType";
DROP TYPE IF EXISTS "IntegrityAlertStatus";
DROP TYPE IF EXISTS "IntegrityAlertSeverity";
DROP TYPE IF EXISTS "IntegrityAlertType";
DROP TYPE IF EXISTS "SnapshotType";
DROP TYPE IF EXISTS "IntegrityLogLevel";
DROP TYPE IF EXISTS "IntegrityLogCategory";

-- Note: Data is now stored in Claude Flow memory namespaces:
-- - db-integrity/logs (general operation logs)
-- - db-integrity/drift (drift detection results)  
-- - db-integrity/migrations (migration history)
-- - db-integrity/validations (form/route validation results)
-- - db-integrity/analytics (performance metrics)
-- - db-integrity/alerts (system alerts)
-- - db-integrity/snapshots (schema snapshots)
-- - db-integrity/metrics (performance metrics)