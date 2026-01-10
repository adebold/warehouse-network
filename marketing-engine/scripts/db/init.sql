-- Marketing Engine Database Schema
-- Production-ready PostgreSQL schema with proper constraints and indexes

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS marketing;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS audit;

-- Set search path
SET search_path TO marketing, auth, analytics, audit, public;

-- Users table
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    verification_expires_at TIMESTAMPTZ,
    reset_token VARCHAR(255),
    reset_expires_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_valid CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Roles table
CREATE TABLE IF NOT EXISTS auth.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE IF NOT EXISTS auth.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource, action)
);

-- User roles junction table
CREATE TABLE IF NOT EXISTS auth.user_roles (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES auth.roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES auth.users(id),
    PRIMARY KEY (user_id, role_id)
);

-- Role permissions junction table
CREATE TABLE IF NOT EXISTS auth.role_permissions (
    role_id UUID REFERENCES auth.roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES auth.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Sessions table
CREATE TABLE IF NOT EXISTS auth.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE IF NOT EXISTS auth.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '[]'::jsonb,
    rate_limit INTEGER DEFAULT 1000,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Organizations table
CREATE TABLE IF NOT EXISTS marketing.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    logo_url VARCHAR(500),
    website VARCHAR(500),
    industry VARCHAR(100),
    size VARCHAR(50),
    timezone VARCHAR(50) DEFAULT 'UTC',
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Organization members
CREATE TABLE IF NOT EXISTS marketing.organization_members (
    organization_id UUID REFERENCES marketing.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, user_id)
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS marketing.campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES marketing.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    budget_amount DECIMAL(12, 2),
    budget_currency VARCHAR(3) DEFAULT 'USD',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    target_audience JSONB DEFAULT '{}'::jsonb,
    goals JSONB DEFAULT '[]'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_dates CHECK (end_date > start_date),
    CONSTRAINT valid_budget CHECK (budget_amount >= 0)
);

-- Channels table
CREATE TABLE IF NOT EXISTS marketing.channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    icon VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    configuration_schema JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Campaign channels junction table
CREATE TABLE IF NOT EXISTS marketing.campaign_channels (
    campaign_id UUID REFERENCES marketing.campaigns(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES marketing.channels(id) ON DELETE CASCADE,
    configuration JSONB DEFAULT '{}'::jsonb,
    budget_allocation DECIMAL(5, 2),
    is_active BOOLEAN DEFAULT true,
    PRIMARY KEY (campaign_id, channel_id),
    CONSTRAINT valid_allocation CHECK (budget_allocation >= 0 AND budget_allocation <= 100)
);

-- Contacts table
CREATE TABLE IF NOT EXISTS marketing.contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES marketing.organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    company VARCHAR(255),
    job_title VARCHAR(255),
    source VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    tags TEXT[],
    custom_fields JSONB DEFAULT '{}'::jsonb,
    preferences JSONB DEFAULT '{}'::jsonb,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, email)
);

-- Lists table
CREATE TABLE IF NOT EXISTS marketing.lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES marketing.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'static',
    criteria JSONB,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- List contacts junction table
CREATE TABLE IF NOT EXISTS marketing.list_contacts (
    list_id UUID REFERENCES marketing.lists(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES marketing.contacts(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (list_id, contact_id)
);

-- Events table (for event sourcing)
CREATE TABLE IF NOT EXISTS marketing.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(100) NOT NULL,
    source VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES marketing.organizations(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES marketing.campaigns(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES marketing.contacts(id),
    event_type VARCHAR(100) NOT NULL,
    channel VARCHAR(50),
    properties JSONB DEFAULT '{}'::jsonb,
    context JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit.logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    organization_id UUID REFERENCES marketing.organizations(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON marketing.organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON marketing.campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON marketing.contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON marketing.lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create partitioning for high-volume tables
-- Analytics events partitioned by month
CREATE TABLE IF NOT EXISTS analytics.events_2024_01 PARTITION OF analytics.events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS analytics.events_2024_02 PARTITION OF analytics.events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Add more partitions as needed...

-- Insert default data
INSERT INTO auth.roles (name, description) VALUES
    ('admin', 'Full system access'),
    ('manager', 'Manage campaigns and teams'),
    ('editor', 'Create and edit content'),
    ('viewer', 'Read-only access')
ON CONFLICT (name) DO NOTHING;

INSERT INTO marketing.channels (name, type, icon) VALUES
    ('Email', 'email', 'mail'),
    ('SMS', 'sms', 'message-square'),
    ('Facebook', 'social', 'facebook'),
    ('Instagram', 'social', 'instagram'),
    ('Twitter', 'social', 'twitter'),
    ('LinkedIn', 'social', 'linkedin'),
    ('Google Ads', 'ads', 'google'),
    ('Facebook Ads', 'ads', 'facebook')
ON CONFLICT (name) DO NOTHING;

-- Grant permissions
GRANT ALL ON SCHEMA marketing TO marketing;
GRANT ALL ON SCHEMA auth TO marketing;
GRANT ALL ON SCHEMA analytics TO marketing;
GRANT ALL ON SCHEMA audit TO marketing;
GRANT ALL ON ALL TABLES IN SCHEMA marketing TO marketing;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO marketing;
GRANT ALL ON ALL TABLES IN SCHEMA analytics TO marketing;
GRANT ALL ON ALL TABLES IN SCHEMA audit TO marketing;
GRANT ALL ON ALL SEQUENCES IN SCHEMA marketing TO marketing;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO marketing;
GRANT ALL ON ALL SEQUENCES IN SCHEMA analytics TO marketing;
GRANT ALL ON ALL SEQUENCES IN SCHEMA audit TO marketing;