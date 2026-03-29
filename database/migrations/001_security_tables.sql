-- Security Events Table
CREATE TABLE IF NOT EXISTS "SecurityEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- Security Alerts Table
CREATE TABLE IF NOT EXISTS "SecurityAlert" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "indicators" JSONB NOT NULL DEFAULT '[]',
    "affectedUsers" JSONB NOT NULL DEFAULT '[]',
    "ipAddresses" JSONB NOT NULL DEFAULT '[]',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "actionsTaken" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- Blocked IPs Table
CREATE TABLE IF NOT EXISTS "BlockedIP" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedBy" TEXT,
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BlockedIP_pkey" PRIMARY KEY ("id")
);

-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- Setup Codes Table (for time-limited setup codes)
CREATE TABLE IF NOT EXISTS "SetupCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'super_admin_setup',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "SetupCode_pkey" PRIMARY KEY ("id")
);

-- User Sessions Table (for tracking active sessions)
CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invalidated" BOOLEAN NOT NULL DEFAULT false,
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- Add columns to existing User table for security features
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "requires2FA" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastPasswordChange" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHistory" JSONB DEFAULT '[]';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockoutUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "SecurityEvent_type_idx" ON "SecurityEvent"("type");
CREATE INDEX IF NOT EXISTS "SecurityEvent_severity_idx" ON "SecurityEvent"("severity");
CREATE INDEX IF NOT EXISTS "SecurityEvent_userId_idx" ON "SecurityEvent"("userId");
CREATE INDEX IF NOT EXISTS "SecurityEvent_timestamp_idx" ON "SecurityEvent"("timestamp");
CREATE INDEX IF NOT EXISTS "SecurityEvent_ipAddress_idx" ON "SecurityEvent"("ipAddress");

CREATE INDEX IF NOT EXISTS "SecurityAlert_type_idx" ON "SecurityAlert"("type");
CREATE INDEX IF NOT EXISTS "SecurityAlert_severity_idx" ON "SecurityAlert"("severity");
CREATE INDEX IF NOT EXISTS "SecurityAlert_resolved_idx" ON "SecurityAlert"("resolved");
CREATE INDEX IF NOT EXISTS "SecurityAlert_timestamp_idx" ON "SecurityAlert"("timestamp");

CREATE INDEX IF NOT EXISTS "BlockedIP_ipAddress_idx" ON "BlockedIP"("ipAddress");
CREATE INDEX IF NOT EXISTS "BlockedIP_active_idx" ON "BlockedIP"("active");
CREATE INDEX IF NOT EXISTS "BlockedIP_expiresAt_idx" ON "BlockedIP"("expiresAt");

CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_token_idx" ON "RefreshToken"("token");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

CREATE INDEX IF NOT EXISTS "SetupCode_code_idx" ON "SetupCode"("code");
CREATE INDEX IF NOT EXISTS "SetupCode_expiresAt_idx" ON "SetupCode"("expiresAt");
CREATE INDEX IF NOT EXISTS "SetupCode_used_idx" ON "SetupCode"("used");

CREATE INDEX IF NOT EXISTS "UserSession_userId_idx" ON "UserSession"("userId");
CREATE INDEX IF NOT EXISTS "UserSession_sessionToken_idx" ON "UserSession"("sessionToken");
CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
CREATE INDEX IF NOT EXISTS "UserSession_invalidated_idx" ON "UserSession"("invalidated");

-- Create unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "SecurityAlert_alertId_key" ON "SecurityAlert"("alertId");
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_token_key" ON "RefreshToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "SetupCode_code_key" ON "SetupCode"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_sessionToken_key" ON "UserSession"("sessionToken");

-- Add foreign key constraints
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;