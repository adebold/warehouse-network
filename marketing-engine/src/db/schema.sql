-- Marketing Engine Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    roles TEXT[] DEFAULT '{"user"}',
    permissions TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(active);

-- Content table
CREATE TABLE content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_status CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived', 'scheduled'))
);

-- Indexes for content
CREATE INDEX idx_content_status ON content(status);
CREATE INDEX idx_content_created_by ON content(created_by);
CREATE INDEX idx_content_published_at ON content(published_at);
CREATE INDEX idx_content_scheduled_at ON content(scheduled_at);
CREATE INDEX idx_content_metadata ON content USING gin(metadata);

-- Content versions table
CREATE TABLE content_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    change_summary TEXT,
    CONSTRAINT uk_content_version UNIQUE (content_id, version)
);

-- Indexes for content versions
CREATE INDEX idx_content_versions_content_id ON content_versions(content_id);
CREATE INDEX idx_content_versions_created_at ON content_versions(created_at);

-- Channels table
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_channel_type CHECK (type IN ('email', 'sms', 'social_media', 'website', 'mobile_app', 'api', 'webhook')),
    CONSTRAINT chk_channel_status CHECK (status IN ('active', 'inactive', 'maintenance', 'error'))
);

-- Indexes for channels
CREATE INDEX idx_channels_type ON channels(type);
CREATE INDEX idx_channels_status ON channels(status);

-- Content channels relationship
CREATE TABLE content_channels (
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    published BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    external_id VARCHAR(255),
    PRIMARY KEY (content_id, channel_id)
);

-- Indexes for content channels
CREATE INDEX idx_content_channels_published ON content_channels(published);
CREATE INDEX idx_content_channels_published_at ON content_channels(published_at);

-- Analytics events table (partitioned by month)
CREATE TABLE analytics_events (
    id UUID DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL,
    channel_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT false,
    PRIMARY KEY (id, timestamp),
    CONSTRAINT chk_event_type CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'converted', 'bounced', 'complained', 'unsubscribed'))
) PARTITION BY RANGE (timestamp);

-- Create partitions for the next 12 months
DO $$
DECLARE
    start_date date;
    end_date date;
    partition_name text;
BEGIN
    FOR i IN 0..11 LOOP
        start_date := DATE_TRUNC('month', CURRENT_DATE + (i || ' months')::interval);
        end_date := DATE_TRUNC('month', start_date + '1 month'::interval);
        partition_name := 'analytics_events_' || TO_CHAR(start_date, 'YYYY_MM');
        
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I PARTITION OF analytics_events
            FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
    END LOOP;
END$$;

-- Indexes for analytics events
CREATE INDEX idx_analytics_events_content_id ON analytics_events(content_id);
CREATE INDEX idx_analytics_events_channel_id ON analytics_events(channel_id);
CREATE INDEX idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX idx_analytics_events_processed ON analytics_events(processed);
CREATE INDEX idx_analytics_events_metadata ON analytics_events USING gin(metadata);

-- Channel analytics aggregates table
CREATE TABLE channel_analytics (
    channel_id UUID PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
    sent_count BIGINT DEFAULT 0,
    delivered_count BIGINT DEFAULT 0,
    opened_count BIGINT DEFAULT 0,
    clicked_count BIGINT DEFAULT 0,
    conversion_count BIGINT DEFAULT 0,
    revenue DECIMAL(15, 2) DEFAULT 0,
    last_activity TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- KPIs table
CREATE TABLE kpis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    formula TEXT NOT NULL,
    unit VARCHAR(50) NOT NULL,
    target DECIMAL(15, 4),
    frequency VARCHAR(50) NOT NULL,
    dimensions TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_kpi_unit CHECK (unit IN ('percentage', 'currency', 'count', 'ratio', 'days', 'hours')),
    CONSTRAINT chk_kpi_frequency CHECK (frequency IN ('realtime', 'hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'))
);

-- KPI results table
CREATE TABLE kpi_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kpi_id UUID NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
    value DECIMAL(15, 4) NOT NULL,
    dimensions JSONB NOT NULL DEFAULT '{}',
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for KPI results
CREATE INDEX idx_kpi_results_kpi_id ON kpi_results(kpi_id);
CREATE INDEX idx_kpi_results_period ON kpi_results(period_start, period_end);
CREATE INDEX idx_kpi_results_calculated_at ON kpi_results(calculated_at);

-- Publish queue table
CREATE TABLE publish_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 5,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt TIMESTAMP WITH TIME ZONE,
    next_retry TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_queue_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

-- Indexes for publish queue
CREATE INDEX idx_publish_queue_status ON publish_queue(status);
CREATE INDEX idx_publish_queue_scheduled_at ON publish_queue(scheduled_at);
CREATE INDEX idx_publish_queue_priority ON publish_queue(priority DESC);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN DEFAULT false
);

-- Indexes for refresh tokens
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked);

-- Functions and triggers

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update timestamp trigger to relevant tables
CREATE TRIGGER update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_content_timestamp
    BEFORE UPDATE ON content
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_channels_timestamp
    BEFORE UPDATE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_kpis_timestamp
    BEFORE UPDATE ON kpis
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Function to update channel analytics
CREATE OR REPLACE FUNCTION update_channel_analytics(
    p_channel_id UUID,
    p_event_type VARCHAR(50),
    p_revenue DECIMAL DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO channel_analytics (channel_id, last_activity)
    VALUES (p_channel_id, CURRENT_TIMESTAMP)
    ON CONFLICT (channel_id) DO UPDATE
    SET
        sent_count = CASE WHEN p_event_type = 'sent' THEN channel_analytics.sent_count + 1 ELSE channel_analytics.sent_count END,
        delivered_count = CASE WHEN p_event_type = 'delivered' THEN channel_analytics.delivered_count + 1 ELSE channel_analytics.delivered_count END,
        opened_count = CASE WHEN p_event_type = 'opened' THEN channel_analytics.opened_count + 1 ELSE channel_analytics.opened_count END,
        clicked_count = CASE WHEN p_event_type = 'clicked' THEN channel_analytics.clicked_count + 1 ELSE channel_analytics.clicked_count END,
        conversion_count = CASE WHEN p_event_type = 'converted' THEN channel_analytics.conversion_count + 1 ELSE channel_analytics.conversion_count END,
        revenue = channel_analytics.revenue + p_revenue,
        last_activity = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;