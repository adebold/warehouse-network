-- Migration: Add security features tables
-- Description: Adds tables for 2FA, security alerts, metrics, and session management

-- User Two-Factor Authentication table
CREATE TABLE IF NOT EXISTS "UserTwoFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backupCodes" TEXT[],
    "setupAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTwoFactor_pkey" PRIMARY KEY ("id")
);

-- Security Alerts table
CREATE TABLE IF NOT EXISTS "SecurityAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'acknowledged', 'resolved')),
    "assignedTo" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- System Metrics table for storing security and performance metrics
CREATE TABLE IF NOT EXISTS "SystemMetric" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemMetric_pkey" PRIMARY KEY ("id")
);

-- Session Blacklist table for tracking invalidated sessions
CREATE TABLE IF NOT EXISTS "SessionBlacklist" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "blacklistedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionBlacklist_pkey" PRIMARY KEY ("id")
);

-- Rate Limit Entries table for persistent rate limiting
CREATE TABLE IF NOT EXISTS "RateLimitEntry" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
);

-- Failed Login Attempts table
CREATE TABLE IF NOT EXISTS "FailedLoginAttempt" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL, -- IP address or email
    "type" TEXT NOT NULL CHECK ("type" IN ('ip', 'email', 'user')),
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailedLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- Add unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "UserTwoFactor_userId_key" ON "UserTwoFactor"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemMetric_key_key" ON "SystemMetric"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "SessionBlacklist_sessionToken_key" ON "SessionBlacklist"("sessionToken");
CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitEntry_identifier_category_key" ON "RateLimitEntry"("identifier", "category");
CREATE UNIQUE INDEX IF NOT EXISTS "FailedLoginAttempt_identifier_type_key" ON "FailedLoginAttempt"("identifier", "type");

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "SecurityAlert_status_severity_idx" ON "SecurityAlert"("status", "severity");
CREATE INDEX IF NOT EXISTS "SecurityAlert_type_lastSeen_idx" ON "SecurityAlert"("type", "lastSeen");
CREATE INDEX IF NOT EXISTS "SystemMetric_category_createdAt_idx" ON "SystemMetric"("category", "createdAt");
CREATE INDEX IF NOT EXISTS "SessionBlacklist_userId_idx" ON "SessionBlacklist"("userId");
CREATE INDEX IF NOT EXISTS "SessionBlacklist_expiresAt_idx" ON "SessionBlacklist"("expiresAt");
CREATE INDEX IF NOT EXISTS "RateLimitEntry_windowEnd_idx" ON "RateLimitEntry"("windowEnd");
CREATE INDEX IF NOT EXISTS "FailedLoginAttempt_lockedUntil_idx" ON "FailedLoginAttempt"("lockedUntil");

-- Add foreign key constraints
ALTER TABLE "UserTwoFactor"
ADD CONSTRAINT "UserTwoFactor_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionBlacklist"
ADD CONSTRAINT "SessionBlacklist_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update existing User table to add security fields if they don't exist
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "securityScore" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "riskLevel" TEXT DEFAULT 'low' CHECK ("riskLevel" IN ('low', 'medium', 'high', 'critical'));

-- Update existing AuditLog table to add security-specific fields if they don't exist
ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
ADD COLUMN IF NOT EXISTS "sessionId" TEXT,
ADD COLUMN IF NOT EXISTS "severity" TEXT DEFAULT 'low' CHECK ("severity" IN ('low', 'medium', 'high', 'critical'));

-- Add indexes for audit log security queries
CREATE INDEX IF NOT EXISTS "AuditLog_ipAddress_createdAt_idx" ON "AuditLog"("ipAddress", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_severity_idx" ON "AuditLog"("action", "severity");
CREATE INDEX IF NOT EXISTS "AuditLog_sessionId_idx" ON "AuditLog"("sessionId");

-- Create function to clean up expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_security_data()
RETURNS void AS $$
BEGIN
    -- Clean up expired session blacklist entries
    DELETE FROM "SessionBlacklist" WHERE "expiresAt" < NOW();

    -- Clean up old rate limit entries (older than 24 hours)
    DELETE FROM "RateLimitEntry" WHERE "windowEnd" < NOW() - INTERVAL '24 hours';

    -- Clean up old failed login attempts (older than 24 hours and not locked)
    DELETE FROM "FailedLoginAttempt"
    WHERE "lastAttempt" < NOW() - INTERVAL '24 hours'
    AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW());

    -- Clean up old system metrics (older than 90 days)
    DELETE FROM "SystemMetric"
    WHERE "createdAt" < NOW() - INTERVAL '90 days'
    AND "category" = 'security';
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers for all tables with updatedAt columns
CREATE TRIGGER update_user_two_factor_updated_at
    BEFORE UPDATE ON "UserTwoFactor"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_alert_updated_at
    BEFORE UPDATE ON "SecurityAlert"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_metric_updated_at
    BEFORE UPDATE ON "SystemMetric"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limit_entry_updated_at
    BEFORE UPDATE ON "RateLimitEntry"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_failed_login_attempt_updated_at
    BEFORE UPDATE ON "FailedLoginAttempt"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();