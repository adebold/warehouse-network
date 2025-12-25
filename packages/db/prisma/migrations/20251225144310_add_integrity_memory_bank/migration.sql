-- CreateEnum for IntegrityLogCategory
CREATE TYPE "IntegrityLogCategory" AS ENUM ('VALIDATION', 'MIGRATION', 'DRIFT_DETECTION', 'SCHEMA_ANALYSIS', 'FORM_VALIDATION', 'ROUTE_VALIDATION', 'PERFORMANCE', 'ERROR', 'AUDIT', 'MAINTENANCE');

-- CreateEnum for IntegrityLogLevel
CREATE TYPE "IntegrityLogLevel" AS ENUM ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum for SnapshotType
CREATE TYPE "SnapshotType" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ON_DEMAND', 'PRE_MIGRATION', 'POST_MIGRATION');

-- CreateEnum for IntegrityAlertType
CREATE TYPE "IntegrityAlertType" AS ENUM ('DRIFT_DETECTED', 'VALIDATION_FAILURE', 'MIGRATION_ERROR', 'PERFORMANCE_DEGRADATION', 'SCHEMA_MISMATCH', 'DATA_CORRUPTION', 'SECURITY_ISSUE', 'MAINTENANCE_REQUIRED');

-- CreateEnum for IntegrityAlertSeverity
CREATE TYPE "IntegrityAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum for IntegrityAlertStatus
CREATE TYPE "IntegrityAlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum for IntegrityMetricType
CREATE TYPE "IntegrityMetricType" AS ENUM ('VALIDATION_TIME', 'MIGRATION_TIME', 'DRIFT_CHECK_TIME', 'ERROR_RATE', 'SUCCESS_RATE', 'MEMORY_USAGE', 'CPU_USAGE', 'THROUGHPUT', 'LATENCY');

-- CreateTable IntegrityLog
CREATE TABLE "IntegrityLog" (
    "id" TEXT NOT NULL,
    "category" "IntegrityLogCategory" NOT NULL,
    "level" "IntegrityLogLevel" NOT NULL,
    "operation" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "metadata" JSONB,
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "stackTrace" TEXT,
    "userId" TEXT,
    "correlationId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable IntegritySnapshot
CREATE TABLE "IntegritySnapshot" (
    "id" TEXT NOT NULL,
    "snapshotType" "SnapshotType" NOT NULL,
    "schemaHash" TEXT NOT NULL,
    "modelCount" INTEGER NOT NULL,
    "fieldCount" INTEGER NOT NULL,
    "relationCount" INTEGER NOT NULL,
    "indexCount" INTEGER NOT NULL,
    "enumCount" INTEGER NOT NULL,
    "validationsPassed" INTEGER NOT NULL,
    "validationsFailed" INTEGER NOT NULL,
    "driftDetected" BOOLEAN NOT NULL DEFAULT false,
    "driftDetails" JSONB,
    "performanceMetrics" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegritySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable IntegrityAlert
CREATE TABLE "IntegrityAlert" (
    "id" TEXT NOT NULL,
    "alertType" "IntegrityAlertType" NOT NULL,
    "severity" "IntegrityAlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedModels" TEXT[],
    "affectedFields" TEXT[],
    "details" JSONB,
    "status" "IntegrityAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable IntegrityMetric
CREATE TABLE "IntegrityMetric" (
    "id" TEXT NOT NULL,
    "metricType" "IntegrityMetricType" NOT NULL,
    "component" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "tags" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrityMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for IntegrityLog
CREATE INDEX "IntegrityLog_category_timestamp_idx" ON "IntegrityLog"("category", "timestamp");
CREATE INDEX "IntegrityLog_level_timestamp_idx" ON "IntegrityLog"("level", "timestamp");
CREATE INDEX "IntegrityLog_component_timestamp_idx" ON "IntegrityLog"("component", "timestamp");
CREATE INDEX "IntegrityLog_correlationId_idx" ON "IntegrityLog"("correlationId");

-- CreateIndex for IntegritySnapshot
CREATE INDEX "IntegritySnapshot_snapshotType_timestamp_idx" ON "IntegritySnapshot"("snapshotType", "timestamp");
CREATE INDEX "IntegritySnapshot_driftDetected_timestamp_idx" ON "IntegritySnapshot"("driftDetected", "timestamp");

-- CreateIndex for IntegrityAlert
CREATE INDEX "IntegrityAlert_alertType_status_idx" ON "IntegrityAlert"("alertType", "status");
CREATE INDEX "IntegrityAlert_severity_status_idx" ON "IntegrityAlert"("severity", "status");
CREATE INDEX "IntegrityAlert_createdAt_idx" ON "IntegrityAlert"("createdAt");

-- CreateIndex for IntegrityMetric
CREATE INDEX "IntegrityMetric_metricType_timestamp_idx" ON "IntegrityMetric"("metricType", "timestamp");
CREATE INDEX "IntegrityMetric_component_timestamp_idx" ON "IntegrityMetric"("component", "timestamp");
CREATE INDEX "IntegrityMetric_name_timestamp_idx" ON "IntegrityMetric"("name", "timestamp");