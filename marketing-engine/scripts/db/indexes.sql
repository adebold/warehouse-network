-- Performance-critical indexes for Marketing Engine

-- Auth schema indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON auth.users USING btree (email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON auth.users USING btree (verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON auth.users USING btree (reset_token) WHERE reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_active ON auth.users USING btree (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON auth.sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth.sessions USING hash (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth.sessions USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON auth.sessions USING btree (expires_at) WHERE expires_at > CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON auth.api_keys USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON auth.api_keys USING hash (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON auth.api_keys USING btree (is_active) WHERE is_active = true;

-- Marketing schema indexes
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON marketing.organizations USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_orgs_active ON marketing.organizations USING btree (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_campaigns_org ON marketing.campaigns USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON marketing.campaigns USING btree (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON marketing.campaigns USING btree (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON marketing.campaigns USING btree (organization_id, status) 
    WHERE status IN ('active', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_contacts_org_email ON marketing.contacts USING btree (organization_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON marketing.contacts USING btree (organization_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contacts_score ON marketing.contacts USING btree (organization_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON marketing.contacts USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_search ON marketing.contacts USING gin (
    to_tsvector('english', 
        COALESCE(email, '') || ' ' || 
        COALESCE(first_name, '') || ' ' || 
        COALESCE(last_name, '') || ' ' || 
        COALESCE(company, '')
    )
);

CREATE INDEX IF NOT EXISTS idx_lists_org ON marketing.lists USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lists_type ON marketing.lists USING btree (type);
CREATE INDEX IF NOT EXISTS idx_lists_active ON marketing.lists USING btree (organization_id, is_active) WHERE is_active = true;

-- Analytics schema indexes
CREATE INDEX IF NOT EXISTS idx_events_org_campaign ON analytics.events USING btree (organization_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON analytics.events USING btree (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON analytics.events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_events_contact ON analytics.events USING btree (contact_id);
CREATE INDEX IF NOT EXISTS idx_events_channel ON analytics.events USING btree (channel);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_campaign_analysis ON analytics.events 
    USING btree (campaign_id, event_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_contact_timeline ON analytics.events 
    USING btree (contact_id, timestamp DESC);

-- Audit schema indexes
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit.logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit.logs USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit.logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit.logs USING btree (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit.logs USING btree (action);

-- Partial indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_running ON marketing.campaigns 
    USING btree (organization_id, start_date, end_date) 
    WHERE status = 'active' AND CURRENT_TIMESTAMP BETWEEN start_date AND end_date;

CREATE INDEX IF NOT EXISTS idx_contacts_unsubscribed ON marketing.contacts 
    USING btree (organization_id) 
    WHERE status = 'unsubscribed';

-- BRIN indexes for time-series data (more efficient for large tables)
CREATE INDEX IF NOT EXISTS idx_events_timestamp_brin ON analytics.events 
    USING brin (timestamp) WITH (pages_per_range = 128);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp_brin ON audit.logs 
    USING brin (created_at) WITH (pages_per_range = 128);

-- Create statistics for query optimization
CREATE STATISTICS IF NOT EXISTS stats_campaigns_org_status ON organization_id, status FROM marketing.campaigns;
CREATE STATISTICS IF NOT EXISTS stats_events_org_type ON organization_id, event_type FROM analytics.events;
CREATE STATISTICS IF NOT EXISTS stats_contacts_org_status ON organization_id, status FROM marketing.contacts;

-- Analyze tables to update statistics
ANALYZE auth.users;
ANALYZE auth.sessions;
ANALYZE marketing.organizations;
ANALYZE marketing.campaigns;
ANALYZE marketing.contacts;
ANALYZE analytics.events;
ANALYZE audit.logs;