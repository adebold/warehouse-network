-- Marketing Automation Database Schema
-- PostgreSQL 13+

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create schema
CREATE SCHEMA IF NOT EXISTS marketing;
SET search_path TO marketing, public;

-- Campaigns table
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('google_ads', 'facebook', 'linkedin', 'twitter', 'instagram')),
    budget_allocated DECIMAL(10,2) NOT NULL,
    budget_spent DECIMAL(10,2) DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    target_roas DECIMAL(5,2) NOT NULL,
    target_cpa DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'draft')),
    last_optimization TIMESTAMP,
    optimization_status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT budget_check CHECK (budget_spent <= budget_allocated)
);

-- Campaign performance metrics
CREATE TABLE campaign_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    cost DECIMAL(10,2) DEFAULT 0,
    roas DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN cost > 0 THEN revenue / cost ELSE 0 END) STORED,
    cpa DECIMAL(10,2) GENERATED ALWAYS AS (CASE WHEN conversions > 0 THEN cost / conversions ELSE 0 END) STORED,
    ctr DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN impressions > 0 THEN (clicks::DECIMAL / impressions * 100) ELSE 0 END) STORED,
    conversion_rate DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN clicks > 0 THEN (conversions::DECIMAL / clicks * 100) ELSE 0 END) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, date)
);

-- Leads table
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    company VARCHAR(255),
    job_title VARCHAR(255),
    industry VARCHAR(100),
    company_size INTEGER,
    source VARCHAR(100),
    campaign_id UUID REFERENCES campaigns(id),
    lead_score INTEGER DEFAULT 0,
    qualification VARCHAR(20) DEFAULT 'cold' CHECK (qualification IN ('cold', 'warm', 'hot', 'qualified', 'disqualified')),
    nurture_status VARCHAR(20) DEFAULT 'active' CHECK (nurture_status IN ('active', 'paused', 'completed', 'opted_out')),
    nurture_stage VARCHAR(50) DEFAULT 'awareness',
    sequence_position INTEGER DEFAULT 0,
    next_action_date TIMESTAMP,
    last_engagement TIMESTAMP,
    last_email_sent TIMESTAMP,
    email_opens INTEGER DEFAULT 0,
    link_clicks INTEGER DEFAULT 0,
    content_downloads INTEGER DEFAULT 0,
    demo_requested BOOLEAN DEFAULT FALSE,
    pricing_page_views INTEGER DEFAULT 0,
    revenue_attributed DECIMAL(10,2) DEFAULT 0,
    acquisition_cost DECIMAL(10,2) DEFAULT 0,
    salesforce_contact_id VARCHAR(255),
    hubspot_contact_id VARCHAR(255),
    assigned_sales_rep VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email templates
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name VARCHAR(255) UNIQUE NOT NULL,
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    template_type VARCHAR(50) NOT NULL,
    nurture_stage VARCHAR(50),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email analytics
CREATE TABLE email_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    email_template VARCHAR(255),
    campaign_id UUID REFERENCES campaigns(id),
    sent_at TIMESTAMP NOT NULL,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    unsubscribed_at TIMESTAMP,
    bounced BOOLEAN DEFAULT FALSE,
    sequence_position INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content queue for multi-channel publishing
CREATE TABLE content_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content JSONB NOT NULL,
    channels TEXT[] NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed', 'cancelled')),
    ab_test_variants JSONB,
    selected_variant VARCHAR(50),
    facebook_page_id VARCHAR(255),
    linkedin_org_urn VARCHAR(255),
    instagram_account_id VARCHAR(255),
    force_publish BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content performance tracking
CREATE TABLE content_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID REFERENCES content_queue(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50),
    published_at TIMESTAMP NOT NULL,
    status VARCHAR(20),
    response_data JSONB,
    reach INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    engagement_total INTEGER DEFAULT 0,
    engagement_rate DECIMAL(5,2),
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social media accounts
CREATE TABLE social_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_id VARCHAR(255) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    brand_mentions TEXT[],
    hashtags TEXT[],
    facebook_page_id VARCHAR(255),
    linkedin_org_urn VARCHAR(255),
    instagram_account_id VARCHAR(255),
    recent_post_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social analytics
CREATE TABLE social_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP NOT NULL,
    platform VARCHAR(50) NOT NULL,
    metrics JSONB NOT NULL,
    sentiment_data JSONB,
    competitor_data JSONB,
    hashtag_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content calendar
CREATE TABLE content_calendar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content JSONB NOT NULL,
    platforms TEXT[] NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    optimized_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'published', 'cancelled')),
    optimization_applied BOOLEAN DEFAULT FALSE,
    optimization_details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics reports
CREATE TABLE analytics_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'custom')),
    date_range_start TIMESTAMP NOT NULL,
    date_range_end TIMESTAMP NOT NULL,
    kpis JSONB NOT NULL,
    executive_summary JSONB,
    dashboard_config JSONB,
    generated_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Budget optimization logs
CREATE TABLE budget_optimization_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    optimization_id VARCHAR(255) NOT NULL,
    campaign_id UUID REFERENCES campaigns(id),
    campaign_name VARCHAR(255),
    platform VARCHAR(50),
    current_budget DECIMAL(10,2),
    recommended_budget DECIMAL(10,2),
    final_budget DECIMAL(10,2),
    budget_change_percentage DECIMAL(5,2),
    bid_adjustment DECIMAL(5,2),
    performance_score INTEGER,
    actions JSONB,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optimization reports
CREATE TABLE optimization_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id VARCHAR(255) UNIQUE NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    summary_data JSONB,
    projections JSONB,
    recommendations JSONB,
    generated_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workflow errors
CREATE TABLE workflow_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_name VARCHAR(255) NOT NULL,
    error_message TEXT NOT NULL,
    error_data JSONB,
    lead_id UUID REFERENCES leads(id),
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Error logs with recovery tracking
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_id VARCHAR(255) UNIQUE NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    workflow_name VARCHAR(255),
    workflow_id VARCHAR(255),
    execution_id VARCHAR(255),
    node_name VARCHAR(255),
    error_message TEXT,
    error_stack TEXT,
    error_category VARCHAR(50),
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    affected_systems TEXT[],
    retry_count INTEGER DEFAULT 0,
    recovery_action VARCHAR(100),
    recovery_status VARCHAR(50),
    recovery_action_taken JSONB,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_platform ON campaigns(platform);
CREATE INDEX idx_campaign_performance_date ON campaign_performance(campaign_id, date);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_qualification ON leads(qualification);
CREATE INDEX idx_leads_nurture_status ON leads(nurture_status);
CREATE INDEX idx_leads_next_action ON leads(next_action_date) WHERE nurture_status = 'active';
CREATE INDEX idx_email_analytics_lead ON email_analytics(lead_id, sent_at);
CREATE INDEX idx_content_queue_status ON content_queue(status, scheduled_time);
CREATE INDEX idx_content_performance_channel ON content_performance(channel, published_at);
CREATE INDEX idx_social_analytics_timestamp ON social_analytics(platform, timestamp);
CREATE INDEX idx_error_logs_severity ON error_logs(severity, timestamp);
CREATE INDEX idx_error_logs_category ON error_logs(error_category, timestamp);

-- Full text search indexes
CREATE INDEX idx_leads_search ON leads USING gin(
    to_tsvector('english', coalesce(first_name, '') || ' ' || 
    coalesce(last_name, '') || ' ' || 
    coalesce(company, '') || ' ' || 
    coalesce(email, ''))
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_content_queue_updated_at BEFORE UPDATE ON content_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_social_accounts_updated_at BEFORE UPDATE ON social_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_content_calendar_updated_at BEFORE UPDATE ON content_calendar
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for reporting
CREATE VIEW v_campaign_summary AS
SELECT 
    c.id,
    c.name,
    c.platform,
    c.budget_allocated,
    c.budget_spent,
    c.budget_allocated - c.budget_spent as budget_remaining,
    c.start_date,
    c.end_date,
    c.target_roas,
    c.target_cpa,
    c.status,
    COUNT(DISTINCT p.date) as days_active,
    SUM(p.impressions) as total_impressions,
    SUM(p.clicks) as total_clicks,
    SUM(p.conversions) as total_conversions,
    SUM(p.revenue) as total_revenue,
    AVG(p.roas) as avg_roas,
    AVG(p.cpa) as avg_cpa,
    AVG(p.ctr) as avg_ctr,
    AVG(p.conversion_rate) as avg_conversion_rate
FROM campaigns c
LEFT JOIN campaign_performance p ON c.id = p.campaign_id
GROUP BY c.id;

CREATE VIEW v_lead_funnel AS
SELECT 
    nurture_stage,
    qualification,
    COUNT(*) as lead_count,
    AVG(lead_score) as avg_lead_score,
    SUM(revenue_attributed) as total_revenue,
    AVG(acquisition_cost) as avg_acquisition_cost
FROM leads
WHERE nurture_status = 'active'
GROUP BY nurture_stage, qualification;

-- Permissions
GRANT ALL ON SCHEMA marketing TO marketing_user;
GRANT ALL ON ALL TABLES IN SCHEMA marketing TO marketing_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA marketing TO marketing_user;