-- Personal Brand Marketing Automation Database Schema
-- Content Creator & Influencer Platform

CREATE DATABASE IF NOT EXISTS personal_brand_marketing;
\c personal_brand_marketing;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Custom types
CREATE TYPE platform_type AS ENUM ('youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'facebook', 'pinterest', 'twitch', 'threads', 'blog', 'podcast', 'newsletter');
CREATE TYPE content_type AS ENUM ('video', 'image', 'carousel', 'story', 'reel', 'short', 'article', 'podcast_episode', 'live_stream', 'newsletter');
CREATE TYPE content_status AS ENUM ('draft', 'scheduled', 'published', 'archived');
CREATE TYPE monetization_type AS ENUM ('ad_revenue', 'sponsorship', 'affiliate', 'product_sale', 'course_sale', 'membership', 'donation', 'consulting', 'speaking');
CREATE TYPE engagement_type AS ENUM ('like', 'comment', 'share', 'save', 'click', 'view', 'subscribe', 'follow');

-- Creators table (main account)
CREATE TABLE creators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    bio TEXT,
    website_url VARCHAR(500),
    
    -- Branding
    profile_image_url VARCHAR(500),
    banner_image_url VARCHAR(500),
    brand_colors JSONB DEFAULT '[]'::jsonb,
    brand_fonts JSONB DEFAULT '{}'::jsonb,
    
    -- Settings
    timezone VARCHAR(100) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'en',
    content_categories JSONB DEFAULT '[]'::jsonb,
    target_audience JSONB DEFAULT '{}'::jsonb,
    
    -- Monetization settings
    stripe_account_id VARCHAR(255),
    paypal_email VARCHAR(255),
    payment_threshold DECIMAL(10, 2) DEFAULT 100.00,
    tax_info JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Platform accounts
CREATE TABLE platform_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    platform platform_type NOT NULL,
    platform_user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    
    -- Authentication
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    
    -- Platform-specific data
    profile_url VARCHAR(500),
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    total_posts INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT false,
    
    -- Analytics access
    analytics_connected BOOLEAN DEFAULT false,
    analytics_credentials JSONB,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(creator_id, platform, platform_user_id)
);

-- Content library
CREATE TABLE content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    
    -- Content details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    content_type content_type NOT NULL,
    status content_status DEFAULT 'draft',
    
    -- Files and media
    media_urls JSONB DEFAULT '[]'::jsonb,
    thumbnail_url VARCHAR(500),
    file_size_mb DECIMAL(10, 2),
    duration_seconds INTEGER,
    
    -- Content data
    transcript TEXT,
    captions JSONB DEFAULT '{}'::jsonb,
    hashtags JSONB DEFAULT '[]'::jsonb,
    mentions JSONB DEFAULT '[]'::jsonb,
    
    -- AI optimization
    ai_generated BOOLEAN DEFAULT false,
    ai_suggestions JSONB DEFAULT '{}'::jsonb,
    seo_score INTEGER,
    
    -- Scheduling
    scheduled_for TIMESTAMP,
    published_at TIMESTAMP,
    
    -- Performance predictions
    predicted_views INTEGER,
    predicted_engagement_rate DECIMAL(5, 2),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Content publishing records
CREATE TABLE content_publications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    platform_account_id UUID NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
    
    -- Platform-specific IDs
    platform_content_id VARCHAR(255),
    platform_url VARCHAR(500),
    
    -- Publishing details
    published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'published',
    
    -- Platform-specific fields
    platform_fields JSONB DEFAULT '{}'::jsonb,
    
    -- Cross-promotion
    is_cross_promotion BOOLEAN DEFAULT false,
    original_platform platform_type,
    
    UNIQUE(content_id, platform_account_id)
);

-- Analytics data
CREATE TABLE analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_account_id UUID REFERENCES platform_accounts(id) ON DELETE CASCADE,
    content_publication_id UUID REFERENCES content_publications(id) ON DELETE CASCADE,
    
    -- Metrics
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    
    -- Platform-specific metrics
    impressions INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    profile_visits INTEGER DEFAULT 0,
    website_clicks INTEGER DEFAULT 0,
    
    -- Engagement
    engagement_rate DECIMAL(5, 2),
    avg_watch_time_seconds INTEGER,
    completion_rate DECIMAL(5, 2),
    
    -- Audience
    unique_viewers INTEGER DEFAULT 0,
    returning_viewers INTEGER DEFAULT 0,
    new_followers INTEGER DEFAULT 0,
    unfollows INTEGER DEFAULT 0,
    
    -- Demographics
    audience_demographics JSONB DEFAULT '{}'::jsonb,
    
    snapshot_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_content_or_account CHECK (
        (platform_account_id IS NOT NULL AND content_publication_id IS NULL) OR
        (platform_account_id IS NULL AND content_publication_id IS NOT NULL)
    )
);

-- Audience members
CREATE TABLE audience_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    
    -- Identity (may not have all)
    email VARCHAR(255),
    phone VARCHAR(50),
    
    -- Platform identities
    platform_identities JSONB DEFAULT '{}'::jsonb, -- {"youtube": "channel_id", "instagram": "user_id"}
    
    -- Profile
    display_name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    location VARCHAR(255),
    
    -- Engagement metrics
    first_interaction_at TIMESTAMP,
    last_interaction_at TIMESTAMP,
    total_interactions INTEGER DEFAULT 0,
    
    -- Segmentation
    tags JSONB DEFAULT '[]'::jsonb,
    segments JSONB DEFAULT '[]'::jsonb,
    vip_status BOOLEAN DEFAULT false,
    
    -- Value metrics
    lifetime_value DECIMAL(10, 2) DEFAULT 0,
    referral_count INTEGER DEFAULT 0,
    
    -- Preferences
    preferred_content_types content_type[],
    preferred_platforms platform_type[],
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_email_per_creator UNIQUE (creator_id, email)
);

-- Engagement tracking
CREATE TABLE engagements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_publication_id UUID REFERENCES content_publications(id) ON DELETE CASCADE,
    audience_member_id UUID REFERENCES audience_members(id) ON DELETE CASCADE,
    
    -- Engagement details
    type engagement_type NOT NULL,
    platform platform_type NOT NULL,
    
    -- Context
    comment_text TEXT,
    share_message TEXT,
    
    -- Response
    creator_replied BOOLEAN DEFAULT false,
    reply_text TEXT,
    replied_at TIMESTAMP,
    
    -- Metadata
    is_automated_response BOOLEAN DEFAULT false,
    sentiment_score DECIMAL(3, 2), -- -1 to 1
    
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sponsorships and brand deals
CREATE TABLE sponsorships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    
    -- Brand details
    brand_name VARCHAR(255) NOT NULL,
    brand_contact_email VARCHAR(255),
    brand_contact_name VARCHAR(255),
    
    -- Campaign details
    campaign_name VARCHAR(255) NOT NULL,
    campaign_brief TEXT,
    
    -- Deliverables
    deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Compensation
    flat_fee DECIMAL(10, 2),
    performance_bonus JSONB DEFAULT '{}'::jsonb,
    affiliate_commission_rate DECIMAL(5, 2),
    product_value DECIMAL(10, 2),
    
    -- Terms
    contract_start_date DATE NOT NULL,
    contract_end_date DATE NOT NULL,
    exclusivity_period_days INTEGER,
    usage_rights TEXT,
    
    -- Tracking
    promo_code VARCHAR(50),
    tracking_links JSONB DEFAULT '[]'::jsonb,
    
    -- Status
    status VARCHAR(50) DEFAULT 'negotiating',
    signed_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Performance
    total_revenue_generated DECIMAL(10, 2) DEFAULT 0,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sponsorship content mapping
CREATE TABLE sponsorship_content (
    sponsorship_id UUID NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    
    -- Performance tracking
    views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    revenue_generated DECIMAL(10, 2) DEFAULT 0,
    
    PRIMARY KEY (sponsorship_id, content_id)
);

-- Revenue tracking
CREATE TABLE revenue_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    
    -- Transaction details
    type monetization_type NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Source
    platform platform_type,
    sponsorship_id UUID REFERENCES sponsorships(id),
    content_id UUID REFERENCES content(id),
    
    -- Details
    description TEXT,
    external_transaction_id VARCHAR(255),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    paid_out BOOLEAN DEFAULT false,
    payout_id VARCHAR(255),
    
    -- Dates
    earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Content templates
CREATE TABLE content_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    
    -- Template info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content_type content_type NOT NULL,
    
    -- Template data
    structure JSONB NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    
    -- Usage
    times_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Automation workflows
CREATE TABLE automation_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    
    -- Workflow details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(100) NOT NULL,
    trigger_config JSONB NOT NULL,
    
    -- Actions
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP,
    times_triggered INTEGER DEFAULT 0,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Email list
CREATE TABLE email_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    audience_member_id UUID REFERENCES audience_members(id),
    
    -- Contact
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    subscribed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at TIMESTAMP,
    
    -- Preferences
    frequency_preference VARCHAR(50) DEFAULT 'weekly',
    content_preferences JSONB DEFAULT '[]'::jsonb,
    
    -- Engagement
    emails_sent INTEGER DEFAULT 0,
    emails_opened INTEGER DEFAULT 0,
    links_clicked INTEGER DEFAULT 0,
    
    -- Source
    source VARCHAR(100),
    signup_incentive VARCHAR(255),
    
    UNIQUE(creator_id, email)
);

-- Campaigns
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    
    -- Campaign info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL, -- 'growth', 'monetization', 'engagement', etc
    
    -- Timeline
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Goals
    goals JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Strategy
    strategies JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Budget
    budget DECIMAL(10, 2),
    spent DECIMAL(10, 2) DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'draft',
    
    -- Results
    results JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Content calendar
CREATE TABLE content_calendar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE CASCADE,
    
    -- Scheduling
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    platforms platform_type[] NOT NULL,
    
    -- Planning
    content_idea TEXT,
    notes TEXT,
    
    -- Status
    is_tentative BOOLEAN DEFAULT false,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern JSONB,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance benchmarks
CREATE TABLE performance_benchmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    
    -- Benchmark period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Metrics
    avg_views_per_content INTEGER,
    avg_engagement_rate DECIMAL(5, 2),
    follower_growth_rate DECIMAL(5, 2),
    
    -- By platform
    platform_metrics JSONB DEFAULT '{}'::jsonb,
    
    -- By content type
    content_type_metrics JSONB DEFAULT '{}'::jsonb,
    
    -- Revenue
    total_revenue DECIMAL(10, 2),
    revenue_per_content DECIMAL(10, 2),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_creators_username ON creators(username);
CREATE INDEX idx_platform_accounts_creator ON platform_accounts(creator_id);
CREATE INDEX idx_platform_accounts_platform ON platform_accounts(platform);

CREATE INDEX idx_content_creator ON content(creator_id);
CREATE INDEX idx_content_status ON content(status);
CREATE INDEX idx_content_scheduled ON content(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_content_type ON content(content_type);

CREATE INDEX idx_publications_content ON content_publications(content_id);
CREATE INDEX idx_publications_platform ON content_publications(platform_account_id);

CREATE INDEX idx_analytics_account ON analytics_snapshots(platform_account_id);
CREATE INDEX idx_analytics_content ON analytics_snapshots(content_publication_id);
CREATE INDEX idx_analytics_time ON analytics_snapshots(snapshot_time DESC);

CREATE INDEX idx_audience_creator ON audience_members(creator_id);
CREATE INDEX idx_audience_email ON audience_members(email);
CREATE INDEX idx_audience_vip ON audience_members(creator_id, vip_status) WHERE vip_status = true;

CREATE INDEX idx_engagements_content ON engagements(content_publication_id);
CREATE INDEX idx_engagements_audience ON engagements(audience_member_id);
CREATE INDEX idx_engagements_time ON engagements(occurred_at DESC);

CREATE INDEX idx_sponsorships_creator ON sponsorships(creator_id);
CREATE INDEX idx_sponsorships_status ON sponsorships(status);
CREATE INDEX idx_sponsorships_dates ON sponsorships(contract_start_date, contract_end_date);

CREATE INDEX idx_revenue_creator ON revenue_transactions(creator_id);
CREATE INDEX idx_revenue_type ON revenue_transactions(type);
CREATE INDEX idx_revenue_earned ON revenue_transactions(earned_at DESC);
CREATE INDEX idx_revenue_unpaid ON revenue_transactions(creator_id, paid_out) WHERE paid_out = false;

CREATE INDEX idx_email_subscribers_creator ON email_subscribers(creator_id);
CREATE INDEX idx_email_subscribers_active ON email_subscribers(creator_id, status) WHERE status = 'active';

CREATE INDEX idx_calendar_creator_date ON content_calendar(creator_id, scheduled_date);
CREATE INDEX idx_calendar_content ON content_calendar(content_id);

-- Full text search indexes
CREATE INDEX idx_content_search ON content USING gin(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

CREATE INDEX idx_audience_search ON audience_members USING gin(
    to_tsvector('english', coalesce(display_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
);

-- JSONB indexes
CREATE INDEX idx_content_hashtags ON content USING gin(hashtags);
CREATE INDEX idx_content_mentions ON content USING gin(mentions);
CREATE INDEX idx_audience_tags ON audience_members USING gin(tags);
CREATE INDEX idx_audience_segments ON audience_members USING gin(segments);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to all tables with updated_at
CREATE TRIGGER update_creators_updated_at BEFORE UPDATE ON creators FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_platform_accounts_updated_at BEFORE UPDATE ON platform_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_audience_updated_at BEFORE UPDATE ON audience_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_sponsorships_updated_at BEFORE UPDATE ON sponsorships FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON content_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON automation_workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_calendar_updated_at BEFORE UPDATE ON content_calendar FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update follower counts trigger
CREATE OR REPLACE FUNCTION update_follower_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.type = 'follow' THEN
        UPDATE platform_accounts 
        SET follower_count = follower_count + 1
        WHERE id = (
            SELECT platform_account_id 
            FROM content_publications 
            WHERE id = NEW.content_publication_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_follower_count_trigger 
AFTER INSERT ON engagements 
FOR EACH ROW EXECUTE FUNCTION update_follower_count();

-- Row Level Security
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_transactions ENABLE ROW LEVEL SECURITY;

-- Roles
CREATE ROLE creator_admin;
CREATE ROLE creator_user;
CREATE ROLE analytics_viewer;

-- Permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO creator_admin;
GRANT SELECT, INSERT, UPDATE ON content, content_publications, engagements TO creator_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_viewer;

-- Initial data: Content categories
INSERT INTO campaigns (creator_id, name, type, start_date, end_date, goals) 
VALUES 
    ('00000000-0000-0000-0000-000000000000', 'Sample Growth Campaign', 'growth', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', '{"subscribers": 10000, "views": 1000000}'::jsonb)
ON CONFLICT DO NOTHING;